// Pickup secrets: the locker code, the receiver's phone number and the QR code.
// Allegro buyer 0.3.0 keeps them off the sensors (out of history and the
// recorder) and returns them only from the allegro.get_pickup_code service.
// The cards ask once per update of the orders sensor, shared by the card and
// its sections, and fill them into the orders parsed from the attributes.
// Older versions have no such service and still put them in the attributes.

import { DOMAIN, SERVICE } from "./const";
import type { HassEntity, HomeAssistant } from "./ha-types";
import { type Order, parseOrders, text } from "./orders";

export interface PickupSecret {
  seller: string;
  offers: string[];
  pointName?: string;
  pickupCode?: string;
  phone?: string;
  qrCode?: string;
}

export const hasPickupService = (hass: HomeAssistant): boolean =>
  Boolean(hass.services?.[DOMAIN]?.[SERVICE.getPickupCode]);

/** The service's `orders` (Order.as_pickup in the integration's models.py); junk is skipped. */
export const parsePickupResponse = (response: unknown): PickupSecret[] => {
  const rows = (response as { orders?: unknown } | undefined)?.orders;
  return (Array.isArray(rows) ? rows : [])
    .filter((raw): raw is Record<string, any> => typeof raw === "object" && raw !== null)
    .map((raw) => ({
      seller: text(raw.seller) ?? "",
      offers: (Array.isArray(raw.offers) ? raw.offers : []).map(text).filter(Boolean) as string[],
      pointName: text(raw.pickup_point_name),
      pickupCode: text(raw.pickup_code),
      phone: text(raw.receiver_phone_number),
      qrCode: text(raw.qr_code),
    }))
    .filter((secret) => secret.pickupCode || secret.phone || secret.qrCode);
};

// The attributes carry no order number or waybill, so an order is matched by
// its seller and items (and its pickup point, when one seller has two alike).
const matchKey = (seller: string, offers: string[]): string =>
  [seller.toLowerCase(), ...offers].join("\n");

/** The orders with their pickup secrets filled in; each secret goes to one order. */
export const withPickupSecrets = (orders: Order[], secrets: PickupSecret[]): Order[] => {
  if (!secrets.length) return orders;
  const unused = [...secrets];
  return orders.map((order) => {
    const key = matchKey(order.seller, order.offers);
    const candidates = unused.filter((secret) => matchKey(secret.seller, secret.offers) === key);
    const secret =
      candidates.find((candidate) => candidate.pointName === order.pickupPoint?.name) ?? candidates[0];
    if (!secret) return order;
    unused.splice(unused.indexOf(secret), 1);
    return {
      ...order,
      pickupCode: order.pickupCode ?? secret.pickupCode,
      phone: order.phone ?? secret.phone,
      qrCode: order.qrCode ?? secret.qrCode,
    };
  });
};

// One call per state of the orders sensor, whichever card asks first.
const loads = new WeakMap<HassEntity, Promise<PickupSecret[] | undefined>>();

/**
 * The secrets for the orders in `stateObj`, or undefined when there's nothing
 * to ask for (no orders, an integration older than 0.3.0) or the call failed.
 */
export const loadPickupSecrets = (
  hass: HomeAssistant,
  entryId: string | undefined,
  stateObj: HassEntity,
): Promise<PickupSecret[] | undefined> => {
  if (!hasPickupService(hass) || !parseOrders(stateObj).length) return Promise.resolve(undefined);
  let load = loads.get(stateObj);
  if (!load) {
    load = hass
      .callService(
        DOMAIN,
        SERVICE.getPickupCode,
        entryId ? { config_entry_id: entryId } : {},
        undefined,
        false,
        true,
      )
      .then((result) => parsePickupResponse((result as { response?: unknown } | undefined)?.response))
      .catch((err) => {
        console.warn("allegro-buyer-cards: couldn't get pickup codes", err);
        return undefined;
      });
    loads.set(stateObj, load);
  }
  return load;
};
