// Entry point: registers the card, its editor and its section elements, and
// lists the card in the dashboard card picker (with a suggestion when adding a
// card from an Allegro buyer entity).

import { AllegroCard } from "./allegro-card";
import { AllegroCartSection } from "./cart-section";
import { DOMAIN } from "./const";
import { AllegroCardEditor } from "./editors";
import type { HomeAssistant } from "./ha-types";
import { AllegroMessagesSection } from "./messages-section";
import { AllegroOrdersSection } from "./orders-section";
import { AllegroPickupSection } from "./pickup-section";

declare const __CARD_VERSION__: string; // injected by build.mjs from package.json

const DOCS_URL = "https://github.com/KifKick/allegro-buyer-cards";

const ELEMENTS: [string, CustomElementConstructor][] = [
  ["allegro-card", AllegroCard],
  ["allegro-card-editor", AllegroCardEditor],
  ["allegro-card-orders", AllegroOrdersSection],
  ["allegro-card-pickup", AllegroPickupSection],
  ["allegro-card-messages", AllegroMessagesSection],
  ["allegro-card-cart", AllegroCartSection],
];

// Guarded, so loading the file twice (e.g. a leftover manual resource next to
// the HACS one) doesn't throw on a duplicate define().
if (!customElements.get("allegro-card")) {
  for (const [tag, element] of ELEMENTS) customElements.define(tag, element);

  const cards = (window as any).customCards ?? ((window as any).customCards = []);
  cards.push({
    type: "allegro-card",
    name: "Allegro",
    description:
      "Your Allegro account: parcels to pick up with their codes and deadlines, orders on the way, seller messages and invoices, the cart and counters, each section configurable.",
    preview: true,
    documentationURL: DOCS_URL,
    getEntitySuggestion(hass: HomeAssistant, entityId: string) {
      const entry = hass.entities?.[entityId];
      return entry?.platform === DOMAIN && entry.device_id
        ? [{ config: { type: "custom:allegro-card", device_id: entry.device_id } }]
        : undefined;
    },
  });

  console.info(
    `%c ALLEGRO-BUYER-CARDS %c ${__CARD_VERSION__} `,
    "color: white; background: #ff5a00; font-weight: 700;",
    "color: #ff5a00; background: white; font-weight: 700;",
  );
}
