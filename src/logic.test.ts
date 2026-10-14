/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";

import * as mdi from "@mdi/js";
import { describe, expect, it } from "vitest";

import { parseCart, parseOfferId, photoAt } from "./cart";
import { ORDER_FILTERS, ORDER_STATUSES, STAGE_ICONS, STAGES, STATS } from "./const";
import {
  configEntryId,
  findUpdateEntity,
  getAllegroDevices,
  resetUpdateEntityCache,
  resolveDevice,
  resolveEntities,
} from "./discovery";
import { CARD_DEFAULTS, withDefaults } from "./allegro-card";
import { pruneConfig } from "./editors";
import { summaryText } from "./allegro-card";
import { formatMoney, formatRelative } from "./format";
import { needsReading, parseThreads } from "./messages";
import { listedThreads } from "./messages-section";
import { subscribeHidden, updateHidden } from "./hidden";
import type { DeviceRegistryEntry, HassEntity, HomeAssistant } from "./ha-types";
import { LOCALES, plural, statusLabel, t } from "./i18n";
import {
  atOtherPoint,
  countGroups,
  deliveryNote,
  groupCode,
  humanizeStatus,
  mapsUrl,
  orderStages,
  parseOrders,
  safeUrl,
  sortByStage,
  statusDef,
} from "./orders";
import { qrImageSrc, qrPath } from "./qr";

const device = (id: string, entryId: string, name: string): DeviceRegistryEntry => ({
  id,
  name,
  name_by_user: null,
  identifiers: [["allegro", entryId]],
  config_entries: [entryId],
  configuration_url: null,
});

const stateObj = (entity_id: string, state: string, attributes: Record<string, any> = {}): HassEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: "2026-10-12T10:00:00Z",
  last_updated: "2026-10-12T10:00:00Z",
});

const makeHass = (language = "en", states: Record<string, HassEntity> = {}): HomeAssistant =>
  ({
    language,
    locale: { language },
    config: { time_zone: "UTC" },
    themes: { darkMode: false },
    states,
    devices: {
      a: device("a", "entry_a", "Allegro buyer zz_second"),
      b: device("b", "entry_b", "Allegro buyer aa_first"),
      other: { ...device("other", "x", "Router"), identifiers: [["unifi", "x"]] },
    },
    entities: {
      "sensor.allegro_buyer_aa_first_w_realizacji": {
        entity_id: "sensor.allegro_buyer_aa_first_w_realizacji",
        device_id: "b",
        platform: "allegro",
        translation_key: "in_progress",
      },
      "sensor.allegro_buyer_aa_first_do_odbioru": {
        entity_id: "sensor.allegro_buyer_aa_first_do_odbioru",
        device_id: "b",
        platform: "allegro",
        translation_key: "waiting_for_pickup",
      },
      "sensor.allegro_buyer_zz_second_do_odbioru": {
        entity_id: "sensor.allegro_buyer_zz_second_do_odbioru",
        device_id: "a",
        platform: "allegro",
        translation_key: "waiting_for_pickup",
      },
      "sensor.allegro_buyer_aa_first_koszyk": {
        entity_id: "sensor.allegro_buyer_aa_first_koszyk",
        device_id: "b",
        platform: "allegro",
        translation_key: "cart",
      },
      "sensor.unrelated": {
        entity_id: "sensor.unrelated",
        device_id: "b",
        platform: "template",
        translation_key: "cart",
      },
    },
    callService: async () => undefined,
    callWS: async () => undefined as never,
  }) as HomeAssistant;

// Shaped like the integration's real attributes (Order.as_attributes).
const ORDER_ATTRS = {
  details: [
    {
      Seller: "Sklep_Meblowy",
      Status: "DELIVERY_PROBLEM",
      Offers: ["Ława rozkładana 100-200 cm, biel"],
      tracing_url: "https://www.fedex.com/pl-pl/online/domestic-tracking.html#/preview?packages=1",
      delivery_name: "Przesyłka kurierska",
      pickup_code: null,
      receiver_phone_number: null,
      qr_code: null,
    },
    {
      Seller: "Elektro_Hurt",
      Status: "AVAILABLE_FOR_PICKUP",
      Offers: ["Kabel USB-C 2 m", "Ładowarka 65 W"],
      tracing_url: "https://inpost.pl/sledzenie-przesylek?number=1",
      delivery_name: "Allegro Paczkomaty InPost",
      pickup_point_id: "KRA01M",
      pickup_point_name: "Paczkomat KRA01M",
      pickup_point_description: "Przy sklepie",
      pickup_point_address: "Długa 1, 30-001 Kraków",
      pickup_code: "123456",
      receiver_phone_number: "600100200",
      qr_code: "P|600100200|123456",
    },
    { Seller: "Ksiegarnia", Status: "PAID", Offers: ["Książka"], tracing_url: "javascript:alert(1)" },
    "garbage",
    { Seller: "Nowy", Status: "SOMETHING_NEW", Offers: [] },
  ],
};

describe("discovery", () => {
  it("finds only Allegro accounts, sorted by name, and falls back to the first", () => {
    const hass = makeHass();
    expect(getAllegroDevices(hass).map((d) => d.id)).toEqual(["b", "a"]);
    expect(resolveDevice(hass)?.id).toBe("b");
    expect(resolveDevice(hass, "a")?.id).toBe("a");
    expect(configEntryId(hass.devices.a)).toBe("entry_a");
  });

  it("keys entities by platform and translation_key, not entity_id", () => {
    expect(resolveEntities(makeHass(), "b")).toEqual({
      "sensor.in_progress": "sensor.allegro_buyer_aa_first_w_realizacji",
      "sensor.waiting_for_pickup": "sensor.allegro_buyer_aa_first_do_odbioru",
      "sensor.cart": "sensor.allegro_buyer_aa_first_koszyk",
    });
  });

  it("copes with registries that haven't loaded yet", () => {
    const hass = { ...makeHass(), entities: null, devices: null } as unknown as HomeAssistant;
    expect(resolveEntities(hass, "b")).toEqual({});
    expect(getAllegroDevices(hass)).toEqual([]);
    expect(resolveDevice(hass)).toBeUndefined();
  });

  it("recognises the HACS update entity by its brand picture", () => {
    resetUpdateEntityCache();
    const update = stateObj("update.allegro_buyer_update", "on", {
      entity_picture: "https://brands.home-assistant.io/_/allegro/icon.png",
    });
    const other = stateObj("update.mushroom_update", "on", {
      entity_picture: "https://brands.home-assistant.io/_/mushroom/icon.png",
    });
    expect(findUpdateEntity(makeHass("en", { [other.entity_id]: other, [update.entity_id]: update }))).toBe(
      update,
    );
    resetUpdateEntityCache();
    expect(findUpdateEntity(makeHass("en", { [other.entity_id]: other }))).toBeUndefined();
  });
});

describe("orders", () => {
  const orders = parseOrders(stateObj("sensor.x", "4", ORDER_ATTRS));

  it("parses the integration's attributes and skips junk", () => {
    expect(orders).toHaveLength(4);
    const pickup = orders[1];
    expect(pickup).toMatchObject({
      seller: "Elektro_Hurt",
      status: "AVAILABLE_FOR_PICKUP",
      offers: ["Kabel USB-C 2 m", "Ładowarka 65 W"],
      pickupCode: "123456",
      phone: "600100200",
      pickupPoint: { id: "KRA01M", name: "Paczkomat KRA01M", address: "Długa 1, 30-001 Kraków" },
    });
    expect(orders[0].pickupPoint).toBeUndefined();
    expect(orders[0].pickupCode).toBeUndefined();
  });

  it("only keeps http(s) tracking links", () => {
    expect(orders[2].trackingUrl).toBeUndefined();
    expect(safeUrl("https://allegro.pl")).toBe("https://allegro.pl");
    expect(safeUrl("data:text/html,x")).toBeUndefined();
  });

  it("keeps an order's key when its tracking link appears", () => {
    const before = parseOrders(
      stateObj("sensor.x", "1", { details: [{ ...(ORDER_ATTRS.details[1] as object), tracing_url: null }] }),
    );
    expect(before[0].key).toBe(orders[1].key);
    expect(new Set(orders.map((o) => o.key)).size).toBe(orders.length);
  });

  it("gives repeat orders of the same item their own keys", () => {
    const twice = parseOrders(
      stateObj("sensor.x", "2", { details: [ORDER_ATTRS.details[2], ORDER_ATTRS.details[2]] }),
    );
    expect(twice[0].key).toBe(orders[2].key);
    expect(twice[1].key).toBe(`${orders[2].key}~2`);
  });

  it("caches parsing per state object", () => {
    const st = stateObj("sensor.x", "4", ORDER_ATTRS);
    expect(parseOrders(st)).toBe(parseOrders(st));
  });

  it("maps statuses to stages and groups, humanising unknown ones", () => {
    expect(statusDef("IN_DELIVERY")).toMatchObject({ stage: 2, group: "on_the_way" });
    expect(statusDef("SOMETHING_NEW")).toMatchObject({ stage: 0, color: "grey" });
    expect(humanizeStatus("SOMETHING_NEW")).toBe("Something new");
    expect(statusLabel(makeHass("pl"), "AVAILABLE_FOR_PICKUP", humanizeStatus)).toBe("Czeka na odbiór");
    expect(statusLabel(makeHass("pl"), "SOMETHING_NEW", humanizeStatus)).toBe("Something new");
  });

  it("counts groups and sorts the most advanced (then problems) first", () => {
    expect(countGroups(orders)).toMatchObject({ all: 4, problem: 1, pickup: 1, preparing: 2 });
    expect(sortByStage(orders).map((o) => o.status)).toEqual([
      "AVAILABLE_FOR_PICKUP",
      "DELIVERY_PROBLEM",
      "PAID",
      "SOMETHING_NEW",
    ]);
  });

  it("ends the journey at the pickup point or the door", () => {
    expect(orderStages(orders[1]).at(-1)).toBe("ready");
    expect(orderStages(orders[0]).at(-1)).toBe("arrived");
  });

  it("builds a maps search and readable codes", () => {
    expect(mapsUrl(orders[1].pickupPoint)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Paczkomat%20KRA01M%2C%20D%C5%82uga%201%2C%2030-001%20Krak%C3%B3w",
    );
    expect(mapsUrl(undefined)).toBeUndefined();
    expect(groupCode("123456")).toEqual(["123", "456"]);
    expect(groupCode("12345")).toEqual(["12345"]);
    expect(groupCode("AB12CD")).toEqual(["AB12CD"]);
  });
});

describe("cart", () => {
  const cart = parseCart(
    stateObj("sensor.cart", "3", {
      total: 33.28,
      currency: "PLN",
      details: [
        {
          offer_id: "11452034220",
          name: "Sznurówki 180 cm",
          quantity: 2,
          price: 33.28,
          unit_price: 16.64,
          currency: "PLN",
          seller: "Obuwie_pl",
          url: "https://allegro.pl/oferta/sznurowki-180-cm-11452034220",
          photo_url: "https://a.allegroimg.com/s128/117f0d/970f4dbf",
          selected: true,
        },
        { offer_id: "1", name: "Chusteczki", quantity: 1, price: 13.69, selected: false, url: "ftp://x" },
      ],
    }),
  )!;

  it("parses lines, totals and pieces", () => {
    expect(cart.pieces).toBe(3);
    expect(cart.total).toBe(33.28);
    expect(cart.items[0]).toMatchObject({ quantity: 2, unitPrice: 16.64, selected: true });
    expect(cart.items[1]).toMatchObject({ selected: false, currency: "PLN", url: undefined });
  });

  it("asks Allegro's image server for larger photos", () => {
    expect(photoAt(cart.items[0].photoUrl, 360)).toBe("https://a.allegroimg.com/s360/117f0d/970f4dbf");
    expect(photoAt("https://example.com/s128/x.jpg", 360)).toBe("https://example.com/s128/x.jpg");
  });

  it("finds the offer ID in whatever gets pasted", () => {
    expect(parseOfferId("17748686880")).toBe("17748686880");
    expect(parseOfferId(" https://allegro.pl/oferta/duze-chusteczki-100-szt-17748686880 ")).toBe(
      "17748686880",
    );
    expect(parseOfferId("allegro.pl/oferta/duze-chusteczki-17748686880?bi_s=ads&reco_id=1")).toBe(
      "17748686880",
    );
    expect(parseOfferId("https://allegro.pl/produkt/telefon-abc?offerId=15070058532")).toBe("15070058532");
    expect(parseOfferId("https://allegro.pl/oferta/17748686880")).toBe("17748686880");
    expect(parseOfferId("https://example.com/oferta/x-17748686880")).toBeUndefined();
    expect(parseOfferId("https://allegro.pl/kategoria/telefony-165")).toBeUndefined();
    expect(parseOfferId("hello")).toBeUndefined();
  });
});

describe("hidden orders", () => {
  const fakeHass = (stored: string[], failSave = false) => {
    let value = [...stored];
    let push: ((message: { value: unknown }) => void) | undefined;
    const hass = {
      connection: {
        subscribeMessage: async (callback: (message: { value: unknown }) => void) => {
          push = callback;
          return () => {};
        },
      },
      callWS: async (msg: Record<string, any>) => {
        if (msg.type === "frontend/get_user_data") return { value };
        if (failSave) throw new Error("nope");
        value = msg.value;
        push?.({ value });
        return null;
      },
    } as unknown as HomeAssistant;
    return { hass, stored: () => value };
  };

  it("changes the stored set, not a possibly stale local copy", async () => {
    const { hass, stored } = fakeHass(["entry_b:old", "entry_a:x"]);
    const seen: string[][] = [];
    const unsubscribe = subscribeHidden(hass, (hidden) => seen.push([...hidden]));
    // The card hasn't received the subscription's first value yet…
    await updateHidden(hass, (set) => set.add("entry_b:new"));
    // …and still nothing stored is lost.
    expect(stored()).toEqual(["entry_b:old", "entry_a:x", "entry_b:new"]);
    expect(seen.at(-1)).toEqual(stored());
    unsubscribe();
  });

  it("goes back to the stored set when saving fails", async () => {
    const { hass } = fakeHass(["entry_b:old"], true);
    const seen: string[][] = [];
    const unsubscribe = subscribeHidden(hass, (hidden) => seen.push([...hidden]));
    await expect(updateHidden(hass, (set) => set.add("entry_b:new"))).rejects.toThrow("nope");
    expect(seen.at(-1)).toEqual(["entry_b:old"]);
    unsubscribe();
  });
});

describe("parcel tracking (integration 0.2)", () => {
  const [pickup, transit] = parseOrders(
    stateObj("sensor.x", "2", {
      details: [
        {
          ...(ORDER_ATTRS.details[1] as object),
          is_default_pickup_point: false,
          delivery_status: "READY_TO_PICKUP",
          pickup_deadline: "2026-10-16T21:59:59+00:00",
        },
        {
          Seller: "Allegro",
          Status: "IN_TRANSIT",
          Offers: ["Perełki zapachowe"],
          pickup_point_name: "Paczkomat SCZ04A",
          delivery_description: "Your parcel is on its way to point",
          delivery_details: "Estimated delivery to: Thu Oct 15\nPaczkomat SCZ04A\nPolna 53",
          pickup_deadline: null,
        },
      ],
    }),
  );

  it("reads the deadline, the default point flag and the carrier's note", () => {
    expect(pickup.pickupDeadline).toBe(Date.parse("2026-10-16T21:59:59Z"));
    expect(atOtherPoint(pickup)).toBe(true);
    expect(transit.pickupDeadline).toBeUndefined();
    expect(atOtherPoint(transit)).toBe(false);
    expect(deliveryNote(transit)).toBe("Estimated delivery to: Thu Oct 15");
    expect(deliveryNote(pickup)).toBeUndefined();
  });

  it("leaves orders from older integration versions alone", () => {
    const [order] = parseOrders(stateObj("sensor.x", "1", { details: [ORDER_ATTRS.details[1]] }));
    expect(order.delivery).toBeUndefined();
    expect(order.defaultPoint).toBeUndefined();
    expect(atOtherPoint(order)).toBe(false);
  });
});

describe("messages", () => {
  const threads = parseThreads(
    stateObj("sensor.m", "3", {
      automatic: 1,
      details: [
        {
          thread_id: "AbC-123_x",
          seller: "TechStore_pl",
          category: "invoice",
          timestamp: "2026-10-12T10:00:00.000Z",
          read: false,
          preview: "W załączniku przesyłamy fakturę",
        },
        { thread_id: "Def456", seller: "Sklep", category: "order_status", timestamp: "x", read: false, preview: "" },
        { thread_id: "bad id!", seller: "X", category: "other" },
        { thread_id: "Ghi789", seller: "Y", category: "new_kind", read: true, preview: "Pytanie?" },
        null,
      ],
    }),
  );

  it("parses threads, drops unusable ids and unknown categories", () => {
    expect(threads.map((thread) => thread.id)).toEqual(["AbC-123_x", "Def456", "Ghi789"]);
    expect(threads[0]).toMatchObject({ category: "invoice", read: false, time: Date.parse("2026-10-12T10:00:00Z") });
    expect(threads[1].time).toBeUndefined();
    expect(threads[2]).toMatchObject({ category: "other", read: true });
  });

  it("separates automatic shop messages from the ones worth reading", () => {
    expect(needsReading(threads).map((thread) => thread.id)).toEqual(["AbC-123_x", "Ghi789"]);
    expect(listedThreads(threads, false)).toHaveLength(2);
    expect(listedThreads(threads, true)).toHaveLength(3);
  });

  it("adds unread messages to the header summary", () => {
    const hass = makeHass("en");
    expect(summaryText(hass, [], 2)).toBe("Nothing on the way · 2 unread");
    expect(summaryText(makeHass("pl"), [], 0)).toBe("Nic nie jest w drodze");
    expect(plural(makeHass("pl"), "unread", 5)).toBe("5 nieprzeczytanych wiadomości");
  });

  it("says how far a deadline is", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    expect(formatRelative(makeHass("en"), now + 2 * 86_400_000 + 3_600_000, now)).toBe("in 2 days");
    expect(formatRelative(makeHass("en"), now + 5 * 3_600_000, now)).toBe("in 5 hours");
    expect(formatRelative(makeHass("pl"), now - 30 * 60_000, now)).toBe("30 minut temu");
  });
});

describe("card config", () => {
  const defaults = CARD_DEFAULTS as unknown as Record<string, unknown>;

  it("fills in every section's defaults, keeping what's set", () => {
    const full = withDefaults({ type: "custom:allegro-card", orders: { style: "compact" } });
    expect(full.sections).toEqual(["alerts", "orders", "messages", "cart", "stats"]);
    expect(full.messages).toMatchObject({ max_items: 5, show_automatic: true, hide_when_empty: true });
    expect(full.orders).toMatchObject({ style: "compact", max_items: 5, filter: "all" });
    expect(full.cart.style).toBe("summary");
    expect(full.pickup.hide_when_empty).toBe(true);
  });

  it("keeps the editor's YAML minimal, section options included", () => {
    const edited = withDefaults({ type: "custom:allegro-card", device_id: "b" }) as Record<string, any>;
    edited.orders = { ...edited.orders, max_items: 8 };
    edited.cart = { ...edited.cart };
    edited.name = "";
    expect(pruneConfig(edited, defaults)).toEqual({
      type: "custom:allegro-card",
      device_id: "b",
      orders: { max_items: 8 },
    });
  });

  it("keeps a reordered section list", () => {
    const edited = { ...withDefaults({ type: "t" }), sections: ["pickup", "orders"] };
    expect(pruneConfig(edited, defaults)).toEqual({ type: "t", sections: ["pickup", "orders"] });
  });
});

describe("format", () => {
  it("formats money in the user's locale", () => {
    expect(formatMoney(makeHass("pl"), 33.28, "PLN").replace(/\s/g, " ")).toBe("33,28 zł");
    expect(formatMoney(makeHass("en"), 1234.5, "PLN").replace(/\s/g, " ")).toBe("PLN 1,234.50");
    expect(formatMoney(makeHass("en"), 2, "")).toBe("2.00");
  });
});

describe("qr", () => {
  it("passes images through and encodes text", () => {
    expect(qrImageSrc("https://x/qr.png")).toBe("https://x/qr.png");
    expect(qrImageSrc("iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(qrImageSrc("P|600100200|123456")).toBeUndefined();
    const path = qrPath("P|600100200|123456")!;
    // A QR version is 17 + 4 × version modules, plus the 4-module quiet zone each side.
    expect((path.size - 8 - 17) % 4).toBe(0);
    expect(path.d).toMatch(/^M\d+ \d+h1v1h-1z/);
  });
});

describe("i18n", () => {
  it("has every string in every language", () => {
    const keys = Object.keys(LOCALES.en).sort();
    for (const [lang, strings] of Object.entries(LOCALES)) {
      expect(Object.keys(strings).sort(), lang).toEqual(keys);
    }
  });

  it("translates every status, filter and stat the cards can show", () => {
    for (const status of Object.keys(ORDER_STATUSES)) expect(LOCALES.en).toHaveProperty(`status_${status}`);
    for (const filter of ORDER_FILTERS) expect(LOCALES.en).toHaveProperty(`filter_${filter}`);
    for (const stat of Object.keys(STATS)) expect(LOCALES.en).toHaveProperty(`stat_${stat}`);
    for (const stage of [...STAGES, "ready"]) {
      expect(LOCALES.en).toHaveProperty(`stage_${stage}`);
      expect(STAGE_ICONS).toHaveProperty(stage);
    }
  });

  it("uses Polish plural forms", () => {
    const hass = makeHass("pl");
    expect(plural(hass, "orders", 1)).toBe("1 zamówienie");
    expect(plural(hass, "orders", 3)).toBe("3 zamówienia");
    expect(plural(hass, "orders", 5)).toBe("5 zamówień");
    expect(plural(hass, "orders", 22)).toBe("22 zamówienia");
    expect(t(makeHass("de"), "cart")).toBe("Cart");
  });
});

describe("icons", () => {
  it("only uses icons that exist in MDI", () => {
    const dir = new URL(".", import.meta.url);
    const icons = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      for (const match of readFileSync(new URL(file, dir), "utf8").matchAll(/mdi:([a-z0-9-]+)/g)) {
        icons.add(match[1]);
      }
    }
    const key = (name: string) =>
      `mdi${name
        .split("-")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join("")}`;
    const missing = [...icons].filter((name) => !(key(name) in mdi));
    expect(missing).toEqual([]);
  });
});
