// Orders as the integration exposes them: the `details` attribute of its
// order sensors (see Order.as_attributes in the integration's models.py).
// Parsed defensively — keys are read in both their current spelling and
// snake_case, and anything malformed is skipped rather than breaking a card.

import {
  type OrderGroup,
  ORDER_STATUSES,
  STAGES,
  type StatusDef,
  UNKNOWN_STATUS,
} from "./const";
import type { HassEntity } from "./ha-types";

export interface PickupPoint {
  id?: string;
  name?: string;
  description?: string;
  address?: string;
}

export interface Order {
  /** Stable identity for hiding an order; the API exposes no order number. */
  key: string;
  seller: string;
  status: string;
  offers: string[];
  trackingUrl?: string;
  deliveryName?: string;
  pickupCode?: string;
  phone?: string;
  qrCode?: string;
  pickupPoint?: PickupPoint;
  /** Carrier's view of the parcel, from Allegro's "My parcels" list. */
  delivery?: { status?: string; description?: string; details?: string };
  /** Last moment to collect the parcel, in ms (Date.parse). */
  pickupDeadline?: number;
  /** false: waiting somewhere other than the account's default pickup point. */
  defaultPoint?: boolean;
}

const text = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const result = String(value).trim();
  return result || undefined;
};

/** Only http(s) links are ever rendered as hrefs. */
export const safeUrl = (value: unknown): string | undefined => {
  const url = text(value);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
};

/** djb2 over the order's lifelong fields (not the tracking URL, which appears later). */
export const orderKey = (seller: string, offers: string[], deliveryName?: string): string => {
  let hash = 5381;
  for (const char of [seller, ...offers, deliveryName ?? ""].join("|")) {
    hash = ((hash * 33) ^ char.codePointAt(0)!) >>> 0;
  }
  return hash.toString(36);
};

const parseOrder = (raw: Record<string, any>): Order => {
  const seller = text(raw.Seller ?? raw.seller) ?? "";
  const offers = (Array.isArray(raw.Offers ?? raw.offers) ? (raw.Offers ?? raw.offers) : [])
    .map((offer: unknown) =>
      text(typeof offer === "object" && offer ? (offer as any).title ?? (offer as any).name : offer),
    )
    .filter(Boolean) as string[];
  const deliveryName = text(raw.delivery_name);
  const point: PickupPoint = {
    id: text(raw.pickup_point_id),
    name: text(raw.pickup_point_name),
    description: text(raw.pickup_point_description),
    address: text(raw.pickup_point_address),
  };
  const orderId = text(raw.order_id ?? raw.OrderId);
  const delivery = {
    status: text(raw.delivery_status),
    description: text(raw.delivery_description),
    details: text(raw.delivery_details),
  };
  const deadline = Date.parse(text(raw.pickup_deadline) ?? "");
  return {
    key: orderId ?? orderKey(seller, offers, deliveryName),
    seller,
    status: text(raw.Status ?? raw.status)?.toUpperCase() ?? "",
    offers,
    trackingUrl: safeUrl(raw.tracing_url ?? raw.tracking_url),
    deliveryName,
    pickupCode: text(raw.pickup_code),
    phone: text(raw.receiver_phone_number),
    qrCode: text(raw.qr_code),
    pickupPoint: Object.values(point).some(Boolean) ? point : undefined,
    delivery: Object.values(delivery).some(Boolean) ? delivery : undefined,
    pickupDeadline: Number.isNaN(deadline) ? undefined : deadline,
    defaultPoint: typeof raw.is_default_pickup_point === "boolean" ? raw.is_default_pickup_point : undefined,
  };
};

// Parsing runs per render; the state object only changes when the data does.
const parsed = new WeakMap<HassEntity, Order[]>();

export const parseOrders = (stateObj?: HassEntity): Order[] => {
  if (!stateObj) return [];
  let orders = parsed.get(stateObj);
  if (!orders) {
    const details = stateObj.attributes?.details;
    const seen = new Map<string, number>();
    orders = (Array.isArray(details) ? details : [])
      .filter((raw): raw is Record<string, any> => typeof raw === "object" && raw !== null)
      .map(parseOrder)
      .map((order) => {
        // The same item bought twice from one seller: number the repeats so
        // each order keeps its own key (list identity, hiding).
        const count = (seen.get(order.key) ?? 0) + 1;
        seen.set(order.key, count);
        return count > 1 ? { ...order, key: `${order.key}~${count}` } : order;
      });
    parsed.set(stateObj, orders);
  }
  return orders;
};

export const statusDef = (status: string): StatusDef => ORDER_STATUSES[status] ?? UNKNOWN_STATUS;

export const orderGroup = (order: Order): OrderGroup => statusDef(order.status).group;

/** "SOME_NEW_STATUS" -> "Some new status", for statuses the cards don't know. */
export const humanizeStatus = (status: string): string => {
  const words = status.replace(/_/g, " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "—";
};

/** Whether the parcel goes to a locker or pickup point (vs. a courier to the door). */
export const isPickupDelivery = (order: Order): boolean =>
  Boolean(order.pickupPoint || order.pickupCode) || order.status === "AVAILABLE_FOR_PICKUP";

export type StageName = (typeof STAGES)[number] | "ready";

/** Stage names for this order: the last step is "ready for pickup" or "delivered". */
export const orderStages = (order: Order): StageName[] =>
  isPickupDelivery(order) ? [...STAGES.slice(0, -1), "ready"] : [...STAGES];

/** Most advanced first, problems first among equals; stable otherwise (Allegro's newest-first). */
export const sortByStage = (orders: Order[]): Order[] =>
  orders
    .map((order, index) => ({ order, index }))
    .sort((a, b) => {
      const sa = statusDef(a.order.status);
      const sb = statusDef(b.order.status);
      return (
        sb.stage - sa.stage ||
        Number(sb.group === "problem") - Number(sa.group === "problem") ||
        a.index - b.index
      );
    })
    .map(({ order }) => order);

export const countGroups = (orders: Order[]): Record<OrderGroup | "all", number> => {
  const counts = { all: 0, preparing: 0, on_the_way: 0, pickup: 0, problem: 0, done: 0 };
  for (const order of orders) {
    counts.all += 1;
    counts[orderGroup(order)] += 1;
  }
  return counts;
};

/** A maps search for the pickup point (lockers are found by their address). */
export const mapsUrl = (point?: PickupPoint): string | undefined => {
  const query = [point?.name, point?.address].filter(Boolean).join(", ");
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : undefined;
};

/** Groups a pickup code for reading out loud at the locker: 123456 -> 123 456. */
export const groupCode = (code: string): string[] =>
  /^\d{6,}$/.test(code) && code.length % 3 === 0 ? code.match(/\d{3}/g)! : [code];

/** Waiting for pickup somewhere other than the account's default point. */
export const atOtherPoint = (order: Order): boolean =>
  orderGroup(order) === "pickup" && order.defaultPoint === false;

/** "Estimated delivery to: Thu Oct 15\nPaczkomat X" -> its first line, the useful part. */
export const deliveryNote = (order: Order): string | undefined =>
  order.delivery?.details?.split("\n")[0].trim() || order.delivery?.description;
