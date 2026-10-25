// Stand-ins for HA's ha-card / ha-icon (rendering real MDI paths) and a fake
// `hass` with realistic Allegro buyer data, so the built bundle renders as in
// HA. Everything here is made up: no real account, seller or parcel.
import * as mdi from "@mdi/js";

const toKey = (icon) =>
  "mdi" + String(icon || "").replace(/^mdi:/, "").split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");

customElements.define(
  "ha-icon",
  class extends HTMLElement {
    static observedAttributes = ["icon"];
    set icon(v) { this._icon = v; this._render(); }
    get icon() { return this._icon; }
    attributeChangedCallback(_n, _o, v) { this.icon = v; }
    connectedCallback() { this._render(); }
    _render() {
      const path = mdi[toKey(this._icon)] ?? "";
      if (!path && this._icon) console.warn("missing icon", this._icon);
      (this.shadowRoot ?? this.attachShadow({ mode: "open" })).innerHTML = `<svg viewBox="0 0 24 24" style="width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);fill:currentColor;display:block"><path d="${path}"/></svg>`;
    }
  },
);

customElements.define(
  "ha-card",
  class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).innerHTML = `<style>:host{display:block;position:relative;background:var(--card-background-color);border-radius:var(--ha-card-border-radius,12px);border:1px solid var(--divider-color);color:var(--primary-text-color)}</style><slot></slot>`;
    }
  },
);

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const IMG = "http://harness.local/img/";

const ORDER = {
  pickup: {
    Seller: "TechStore_pl",
    Status: "AVAILABLE_FOR_PICKUP",
    Offers: ["Słuchawki bezprzewodowe ANC, czarne"],
    tracing_url: "https://inpost.pl/sledzenie-przesylek?number=000000000000000000000000",
    delivery_name: "Allegro Paczkomaty InPost",
    pickup_point_id: "KRA01M",
    pickup_point_name: "Paczkomat KRA01M",
    pickup_point_description: "Przy sklepie spożywczym",
    pickup_point_address: "Długa 12, 31-147 Kraków",
    is_default_pickup_point: true,
    delivery_status: "READY_TO_PICKUP",
    delivery_description: "Parcel waiting in the locker",
    pickup_deadline: iso(now + 50 * 3_600_000),
  },
  other: {
    Seller: "ZooMarket",
    Status: "AVAILABLE_FOR_PICKUP",
    Offers: ["Karma dla kota 2 kg"],
    tracing_url: "https://inpost.pl/sledzenie-przesylek?number=000000000000000000000001",
    delivery_name: "Allegro Paczkomaty InPost",
    pickup_point_id: "KRA22B",
    pickup_point_name: "Paczkomat KRA22B",
    pickup_point_address: "Zielona 4, 31-200 Kraków",
    is_default_pickup_point: false,
    pickup_deadline: iso(now + 9 * 3_600_000),
  },
  delivery: {
    Seller: "DomIOgrod",
    Status: "IN_DELIVERY",
    Offers: ["Zestaw doniczek ceramicznych, 3 szt."],
    tracing_url: "https://tracktrace.dpd.com.pl/parcelDetails?p1=0000000000000",
    delivery_name: "Allegro Kurier DPD",
  },
  transit: {
    Seller: "KsiegarniaNova",
    Status: "IN_TRANSIT",
    Offers: ["Wiedźmin. Ostatnie życzenie", "Zakładka do książki, skórzana"],
    tracing_url: "https://allegro.pl/allegrodelivery/sledzenie-paczki?numer=000000000",
    delivery_name: "Allegro One Box",
    pickup_point_id: "KRA45A",
    pickup_point_name: "One Box KRA45A",
    pickup_point_address: "Rynek Główny 1, 31-042 Kraków",
    delivery_status: "IN_TRANSIT",
    delivery_description: "Your parcel is on its way to point",
    delivery_details: "Szacowana dostawa: czw. 16 paź\nOne Box KRA45A\nRynek Główny 1",
    pickup_deadline: null,
  },
  problem: {
    Seller: "Meble_Komfort",
    Status: "DELIVERY_PROBLEM",
    Offers: ["Ława rozkładana 100–200 cm, biel alpejska"],
    tracing_url: "https://www.fedex.com/pl-pl/online/domestic-tracking.html#/preview?packages=000000000000",
    delivery_name: "Przesyłka kurierska",
    delivery_status: "FAILED",
    delivery_description: "Problem z doręczeniem – brak odbiorcy pod adresem",
  },
  paid: {
    Seller: "SportMax",
    Status: "READY_FOR_SHIPMENT",
    Offers: ["Bidon stalowy 750 ml, granatowy"],
    tracing_url: null,
    delivery_name: "Allegro Kurier DPD",
  },
  payment: {
    Seller: "FotoPlus",
    Status: "WAITING_FOR_PAYMENT",
    Offers: ["Karta pamięci microSD 128 GB"],
    tracing_url: null,
    delivery_name: "Allegro Paczkomaty InPost",
    pickup_point_name: "Paczkomat KRA88N",
  },
};

// Integration 0.3.0: the secrets come from allegro.get_pickup_code (Order.as_pickup), not the attributes.
const PICKUP_SECRETS = [
  { order: "pickup", pickup_code: "482913", receiver_phone_number: "600 100 200", qr_code: "P|600100200|482913" },
  { order: "other", pickup_code: "907311", receiver_phone_number: "600 100 200", qr_code: "P|600100200|907311" },
].map(({ order, ...secret }) => ({
  seller: ORDER[order].Seller,
  offers: ORDER[order].Offers,
  pickup_point_name: ORDER[order].pickup_point_name,
  ...secret,
}));

const CART = [
  { offer_id: "10000000001", name: "Sznurówki woskowane, czarne, 180 cm, okrągłe 2 mm", quantity: 2, price: 16.64, unit_price: 8.32, seller: "Obuwie_pl", photo: "laces", selected: true },
  { offer_id: "10000000002", name: "Kubek termiczny 450 ml, grafitowy", quantity: 1, price: 54.99, unit_price: 54.99, seller: "KuchniaPro", photo: "mug", selected: true },
  { offer_id: "10000000003", name: "Kabel USB-C – USB-C 2 m, 100 W", quantity: 1, price: 29.9, unit_price: 29.9, seller: "TechStore_pl", photo: "cable", selected: true },
  { offer_id: "10000000004", name: "Chusteczki nawilżane uniwersalne, 100 szt.", quantity: 1, price: 13.69, unit_price: 13.69, seller: "Chem_Hurt", photo: "wipes", selected: false },
];

const THREADS = [
  { thread_id: "thrA1", seller: "TechStore_pl", category: "other", timestamp: iso(now - 40 * 60_000), read: false,
    preview: "Dzień dobry, czy mogą Państwo potwierdzić kolor słuchawek przed wysyłką? Mamy na stanie czarne i grafitowe." },
  { thread_id: "thrB2", seller: "KsiegarniaNova", category: "invoice", timestamp: iso(now - 5 * 3_600_000), read: false,
    preview: "W załączniku przesyłamy fakturę VAT FV/1024/10/2026 do zamówienia." },
  { thread_id: "thrC3", seller: "SportMax", category: "order_status", timestamp: iso(now - 26 * 3_600_000), read: false,
    preview: "Dziękujemy za złożenie zamówienia. Twoje zamówienie jest realizowane." },
  { thread_id: "thrD4", seller: "DomIOgrod", category: "order_status", timestamp: iso(now - 3 * 86_400_000), read: false,
    preview: "Zamówienie zostało przekazane do realizacji." },
];
const INVOICES = [
  { thread_id: "thrB2", seller: "KsiegarniaNova", category: "invoice", timestamp: iso(now - 5 * 3_600_000), read: false,
    preview: "W załączniku przesyłamy fakturę VAT FV/1024/10/2026 do zamówienia." },
  { thread_id: "thrE5", seller: "FotoPlus", category: "invoice", timestamp: iso(now - 12 * 86_400_000), read: true,
    preview: "Faktura do zamówienia nr 5521 w załączniku." },
  { thread_id: "thrF6", seller: "KuchniaPro", category: "invoice", timestamp: iso(now - 30 * 86_400_000), read: true,
    preview: "Przesyłamy dokument sprzedaży do zamówienia." },
];

const SENSORS = {
  in_progress: ["sensor.allegro_buyer_konto_w_realizacji", "mdi:package-variant"],
  waiting_for_pickup: ["sensor.allegro_buyer_konto_do_odbioru", "mdi:archive-check"],
  in_transit: ["sensor.allegro_buyer_konto_w_transporcie", "mdi:truck-delivery"],
  in_delivery: ["sensor.allegro_buyer_konto_w_dostawie", "mdi:map-marker-radius-outline"],
  cart: ["sensor.allegro_buyer_konto_koszyk", "mdi:cart"],
  waiting_other_pickup_point: ["sensor.allegro_buyer_konto_czeka_w_innym_punkcie", "mdi:map-marker-alert"],
  messages_unread: ["sensor.allegro_buyer_konto_nieprzeczytane_wiadomosci", "mdi:email-alert"],
  invoices: ["sensor.allegro_buyer_konto_wiadomosci_z_faktura", "mdi:file-document-outline"],
  pickup_deadline: ["sensor.allegro_buyer_konto_termin_odbioru", "mdi:timer-sand"],
  last_update: ["sensor.allegro_buyer_konto_ostatnie_odswiezenie", "mdi:clock-check-outline"],
};
const BUTTONS = {
  mark_automatic_read: "button.allegro_buyer_konto_oznacz_automatyczne",
  mark_older_read: "button.allegro_buyer_konto_oznacz_starsze",
};

/**
 * orders: keys of ORDER to list; cart: number of cart lines (or 0); offline:
 * sensors unavailable; update: HACS update pending; hidden: order keys hidden.
 */
export const makeHass = ({
  language = "pl",
  dark = false,
  orders = ["pickup", "delivery", "transit", "problem", "paid"],
  cart = CART.length,
  offline = false,
  update = false,
  hidden = [],
  messages = THREADS.length,
  stale = false,
} = {}) => {
  const details = orders.map((key) => ORDER[key]);
  const byStatus = (status) => details.filter((o) => o.Status === status);
  const items = CART.slice(0, cart).map(({ photo, ...item }) => ({
    ...item,
    currency: "PLN",
    url: `https://allegro.pl/oferta/przyklad-${item.offer_id}`,
    photo_url: `${IMG}${photo}.svg`,
  }));
  const attrs = {
    in_progress: { details },
    waiting_for_pickup: { details: byStatus("AVAILABLE_FOR_PICKUP") },
    in_transit: { details: byStatus("IN_TRANSIT") },
    in_delivery: { details: byStatus("IN_DELIVERY") },
    waiting_other_pickup_point: { details: details.filter((o) => o.is_default_pickup_point === false) },
    messages_unread: { automatic: 2, details: THREADS.slice(0, messages) },
    invoices: { details: INVOICES },
    pickup_deadline: { details: [] },
    last_update: {},
    cart: {
      total: Math.round(items.filter((i) => i.selected).reduce((s, i) => s + i.price, 0) * 100) / 100,
      currency: "PLN",
      details: items,
    },
  };
  const states = {};
  const entities = {};
  for (const [tk, [entityId, icon]] of Object.entries(SENSORS)) {
    entities[entityId] = { entity_id: entityId, device_id: "acc1", platform: "allegro", translation_key: tk };
    const deadlines = details.map((o) => o.Status === "AVAILABLE_FOR_PICKUP" && o.pickup_deadline).filter(Boolean).sort();
    const count =
      tk === "cart" ? items.reduce((s, i) => s + i.quantity, 0)
      : tk === "pickup_deadline" ? (deadlines[0] ?? "unknown")
      : tk === "last_update" ? iso(now - (stale ? 4 * 3_600_000 : 12 * 60_000))
      : attrs[tk].details.length;
    states[entityId] = {
      entity_id: entityId,
      state: offline ? "unavailable" : String(count),
      attributes: offline ? { icon } : { ...attrs[tk], icon },
      last_changed: iso(now),
      last_updated: iso(now),
    };
  }
  for (const [tk, entityId] of Object.entries(BUTTONS)) {
    entities[entityId] = { entity_id: entityId, device_id: "acc1", platform: "allegro", translation_key: tk };
    states[entityId] = { entity_id: entityId, state: "unknown", attributes: {}, last_changed: iso(now), last_updated: iso(now) };
  }
  states["update.allegro_buyer_update"] = {
    entity_id: "update.allegro_buyer_update",
    state: update ? "on" : "off",
    attributes: { entity_picture: "https://brands.home-assistant.io/_/allegro/icon.png", installed_version: "0.1.2", latest_version: update ? "0.1.3" : "0.1.2" },
    last_changed: iso(now),
    last_updated: iso(now),
  };
  const hiddenKeys = hidden.map((name) => window.__orderKey?.(ORDER[name])).filter(Boolean);
  return {
    language,
    locale: { language, number_format: "language", time_zone: "local" },
    config: { time_zone: "Europe/Warsaw" },
    themes: { darkMode: dark },
    devices: {
      acc1: {
        id: "acc1",
        name: "Allegro buyer konto",
        name_by_user: null,
        identifiers: [["allegro", "entry1"]],
        config_entries: ["entry1"],
        configuration_url: null,
      },
    },
    entities,
    states,
    connection: {
      async subscribeMessage(callback) {
        // Hidden orders are stored by key; resolve the requested ones lazily.
        setTimeout(() => callback({ value: hiddenKeys }), 0);
        return () => {};
      },
    },
    services: { allegro: { get_pickup_code: {} } },
    async callService(domain, service, data) {
      console.log("callService", domain, service, JSON.stringify(data));
      if (domain === "allegro" && service === "get_pickup_code") {
        return { context: {}, response: { orders: PICKUP_SECRETS } };
      }
    },
    async callWS(msg) {
      if (msg.type === "frontend/get_user_data") return { value: [...hiddenKeys] };
      if (msg.type === "frontend/set_user_data") {
        hiddenKeys.splice(0, hiddenKeys.length, ...msg.value);
        return null;
      }
      throw new Error("unexpected " + msg.type);
    },
  };
};
