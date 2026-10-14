// The cart as the integration exposes it: the cart sensor's state is the
// number of pieces, its attributes the lines and the total of the selected
// ones (see Cart.as_attributes in the integration's models.py).

import type { HassEntity } from "./ha-types";
import { safeUrl } from "./orders";

export interface CartItem {
  offerId: string;
  name: string;
  quantity: number;
  /** Line total (quantity × unit price). */
  price: number;
  unitPrice: number;
  currency: string;
  seller: string;
  url?: string;
  photoUrl?: string;
  /** Ticked for checkout in the Allegro cart. */
  selected: boolean;
}

export interface Cart {
  items: CartItem[];
  /** Total of the selected lines, as Allegro computes it. */
  total: number;
  currency: string;
  pieces: number;
}

const num = (value: unknown): number => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

const parsed = new WeakMap<HassEntity, Cart>();

export const parseCart = (stateObj?: HassEntity): Cart | undefined => {
  if (!stateObj) return undefined;
  let cart = parsed.get(stateObj);
  if (!cart) {
    const attrs = stateObj.attributes ?? {};
    const items = (Array.isArray(attrs.details) ? attrs.details : [])
      .filter((raw: unknown): raw is Record<string, any> => typeof raw === "object" && raw !== null)
      .map(
        (raw: Record<string, any>): CartItem => ({
          offerId: String(raw.offer_id ?? ""),
          name: String(raw.name ?? ""),
          quantity: num(raw.quantity),
          price: num(raw.price),
          unitPrice: num(raw.unit_price),
          currency: String(raw.currency || attrs.currency || ""),
          seller: String(raw.seller ?? ""),
          url: safeUrl(raw.url),
          photoUrl: safeUrl(raw.photo_url),
          selected: raw.selected !== false,
        }),
      );
    const pieces = Number.parseInt(stateObj.state, 10);
    cart = {
      items,
      total: num(attrs.total),
      currency: String(attrs.currency || items[0]?.currency || ""),
      pieces: Number.isFinite(pieces) ? pieces : items.reduce((sum, item) => sum + item.quantity, 0),
    };
    parsed.set(stateObj, cart);
  }
  return cart;
};

/**
 * Allegro serves its offer photos in several widths (`/s128/`, `/s360/`…);
 * the integration hands out the 128 px one, too small for big tiles.
 */
export const photoAt = (url: string | undefined, width: 128 | 360 | 720): string | undefined =>
  url?.replace(/(allegroimg\.com\/)s\d+\//, `$1s${width}/`);

/**
 * The offer ID `allegro.add_to_cart` wants, from whatever the user pastes: the
 * number itself, an offer link (…/oferta/name-17748686880) or a link with an
 * `offerId` parameter. Short or app links don't carry it, so they're rejected.
 */
export const parseOfferId = (input: string): string | undefined => {
  const value = input.trim();
  if (/^\d{6,}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return undefined;
  }
  if (!/(^|\.)allegro\.pl$/i.test(url.hostname)) return undefined;
  const param = url.searchParams.get("offerId") ?? url.searchParams.get("offer_id");
  if (param && /^\d{6,}$/.test(param)) return param;
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  return last.match(/(?:^|-)(\d{6,})$/)?.[1];
};
