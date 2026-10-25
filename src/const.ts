// Contract with the integration: the cards find entities by translation_key
// (see SENSORS in the integration's sensor.py), never by entity_id, so they
// work whatever the account login or the UI language the entities were
// named in.

export const DOMAIN = "allegro";

/** Entity keys are `<platform>.<translation_key>`. */
export const ENTITY = {
  inProgress: "sensor.in_progress",
  pickup: "sensor.waiting_for_pickup",
  inTransit: "sensor.in_transit",
  inDelivery: "sensor.in_delivery",
  cart: "sensor.cart",
  /** Only created when the account has a default pickup point set. */
  otherPoint: "sensor.waiting_other_pickup_point",
  pickupDeadline: "sensor.pickup_deadline",
  lastUpdate: "sensor.last_update",
  messages: "sensor.messages_unread",
  invoices: "sensor.invoices",
  messagesTodo: "todo.messages_todo",
  markAutomaticRead: "button.mark_automatic_read",
  markOlderRead: "button.mark_older_read",
} as const;

export const SERVICE = {
  markMessageRead: "mark_message_read",
  downloadInvoice: "download_invoice",
  getPickupCode: "get_pickup_code",
} as const;

export const ALLEGRO_URL = {
  orders: "https://allegro.pl/moje-allegro/zakupy/kupione",
  cart: "https://allegro.pl/koszyk",
  messages: "https://allegro.pl/wiadomosci",
} as const;

/** Mushroom's named palette plus Allegro's brand orange; used as `var(--rgb-<name>)`. */
export type Color =
  | "allegro"
  | "red"
  | "blue"
  | "light-blue"
  | "teal"
  | "green"
  | "amber"
  | "grey"
  | "disabled";

// --- Orders --------------------------------------------------------------------

/** A parcel's journey, as the progress bar and stepper draw it. */
export const STAGES = ["ordered", "sent", "out_for_delivery", "arrived"] as const;
/** By stage name; the last step is "arrived" (courier) or "ready" (pickup point). */
export const STAGE_ICONS: Record<string, string> = {
  ordered: "mdi:receipt-text-outline",
  sent: "mdi:truck-fast-outline",
  out_for_delivery: "mdi:map-marker-radius-outline",
  arrived: "mdi:home-import-outline",
  ready: "mdi:package-variant-closed-check",
};

/** What the cards filter and count by; several raw statuses share a group. */
export const ORDER_GROUPS = ["preparing", "on_the_way", "pickup", "problem"] as const;
export type OrderGroup = (typeof ORDER_GROUPS)[number] | "done";

export interface StatusDef {
  stage: number;
  group: OrderGroup;
  icon: string;
  color: Color;
}

/**
 * Allegro's primary order statuses (myorder-api `status.primary.status`). The
 * integration's "in progress" sensor holds every order that isn't delivered,
 * returned or cancelled; unknown statuses still show, humanised, in grey.
 */
export const ORDER_STATUSES: Record<string, StatusDef> = {
  NEW: { stage: 0, group: "preparing", icon: "mdi:receipt-text-outline", color: "grey" },
  WAITING_FOR_PAYMENT: {
    stage: 0,
    group: "preparing",
    icon: "mdi:credit-card-clock-outline",
    color: "amber",
  },
  PAID: { stage: 0, group: "preparing", icon: "mdi:credit-card-check-outline", color: "blue" },
  PROCESSING: { stage: 0, group: "preparing", icon: "mdi:package-variant", color: "blue" },
  READY_FOR_PROCESSING: { stage: 0, group: "preparing", icon: "mdi:package-variant", color: "blue" },
  READY_FOR_SHIPMENT: {
    stage: 0,
    group: "preparing",
    icon: "mdi:package-variant-closed",
    color: "blue",
  },
  SENT: { stage: 1, group: "on_the_way", icon: "mdi:truck-outline", color: "light-blue" },
  IN_TRANSIT: { stage: 1, group: "on_the_way", icon: "mdi:truck-fast-outline", color: "light-blue" },
  DELIVERY_PROBLEM: { stage: 1, group: "problem", icon: "mdi:truck-alert-outline", color: "red" },
  IN_DELIVERY: {
    stage: 2,
    group: "on_the_way",
    icon: "mdi:map-marker-radius-outline",
    color: "teal",
  },
  AVAILABLE_FOR_PICKUP: {
    stage: 3,
    group: "pickup",
    icon: "mdi:package-variant-closed-check",
    color: "green",
  },
  DELIVERED: { stage: 3, group: "done", icon: "mdi:check-circle-outline", color: "green" },
  RETURNED: { stage: 0, group: "done", icon: "mdi:keyboard-return", color: "grey" },
  RETURNED_TO_SENDER: { stage: 0, group: "done", icon: "mdi:keyboard-return", color: "grey" },
  ORDER_CANCELLED: { stage: 0, group: "done", icon: "mdi:cancel", color: "grey" },
};
export const UNKNOWN_STATUS: StatusDef = {
  stage: 0,
  group: "preparing",
  icon: "mdi:help-circle-outline",
  color: "grey",
};

// --- The card ------------------------------------------------------------------------

/** Everything the card can show under its header, in the order the user picks. */
export const CARD_SECTIONS = ["alerts", "pickup", "orders", "messages", "cart", "stats"] as const;
export type CardSection = (typeof CARD_SECTIONS)[number];
export const DEFAULT_SECTIONS: CardSection[] = ["alerts", "orders", "messages", "cart", "stats"];

/** Banners for orders that need the user to do something. */
export const ALERT_TYPES = ["pickup", "problem", "payment", "messages", "stale"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];
/** Banners about one order (the rest are about the account). */
export type OrderAlertType = Extract<AlertType, "pickup" | "problem" | "payment">;

/** A pickup deadline closer than this is shown as urgent. */
export const DEADLINE_URGENT_HOURS = 24;
/** The integration refreshes every 30 minutes; data older than this means trouble. */
export const STALE_AFTER_MINUTES = 90;

// --- Messages ----------------------------------------------------------------------

/** How the integration classifies a thread (messages.py CATEGORIES). */
export const MESSAGE_CATEGORIES = ["order_status", "invoice", "other"] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];
export const MESSAGE_ICONS: Record<MessageCategory, string> = {
  order_status: "mdi:robot-outline",
  invoice: "mdi:file-document-outline",
  other: "mdi:message-text-outline",
};
export const MESSAGE_COLORS: Record<MessageCategory, Color> = {
  order_status: "grey",
  invoice: "teal",
  other: "blue",
};

export interface StatDef {
  /** Sensor the chip opens; its count comes from the visible orders. */
  entity: string;
  icon: string;
  color: Color;
  /** Raw statuses counted (none: every order). */
  statuses?: string[];
}

export const STATS: Record<string, StatDef> = {
  in_progress: { entity: ENTITY.inProgress, icon: "mdi:package-variant", color: "blue" },
  in_transit: {
    entity: ENTITY.inTransit,
    icon: "mdi:truck-fast-outline",
    color: "light-blue",
    statuses: ["IN_TRANSIT"],
  },
  in_delivery: {
    entity: ENTITY.inDelivery,
    icon: "mdi:map-marker-radius-outline",
    color: "teal",
    statuses: ["IN_DELIVERY"],
  },
  pickup: {
    entity: ENTITY.pickup,
    icon: "mdi:package-variant-closed-check",
    color: "green",
    statuses: ["AVAILABLE_FOR_PICKUP"],
  },
  /** Counted from the orders' `is_default_pickup_point`, not by status. */
  other_point: { entity: ENTITY.otherPoint, icon: "mdi:map-marker-alert-outline", color: "amber" },
  pickup_deadline: { entity: ENTITY.pickupDeadline, icon: "mdi:timer-sand", color: "green" },
  messages: { entity: ENTITY.messages, icon: "mdi:email-outline", color: "blue" },
  invoices: { entity: ENTITY.invoices, icon: "mdi:file-document-outline", color: "teal" },
  cart: { entity: ENTITY.cart, icon: "mdi:cart-outline", color: "allegro" },
  cart_total: { entity: ENTITY.cart, icon: "mdi:cash", color: "allegro" },
};
export const DEFAULT_STATS = ["in_progress", "in_transit", "in_delivery", "pickup", "messages", "cart"];

// --- Orders card -----------------------------------------------------------------

export const ORDER_FILTERS = ["all", ...ORDER_GROUPS] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export const ORDER_DETAILS = [
  "items",
  "seller",
  "delivery",
  "tracking",
  "pickup_point",
  "pickup_deadline",
  "pickup_code",
] as const;
