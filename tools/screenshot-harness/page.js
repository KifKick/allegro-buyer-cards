import { orderKey } from "../../src/orders.ts";
import { makeHass } from "./stubs.js";

// Lets the stubbed user data refer to hidden orders by their ORDER key.
window.__orderKey = (order) => `entry1:${orderKey(order.Seller, order.Offers, order.delivery_name)}`;

const THEMES = {
  light: { "--primary-text-color": "#141414", "--secondary-text-color": "#5e5e5e", "--rgb-primary-text-color": "20, 20, 20",
    "--card-background-color": "#ffffff", "--primary-background-color": "#f5f5f5", "--divider-color": "rgba(0,0,0,.12)",
    "--primary-color": "#009ac7", "--rgb-primary-color": "0, 154, 199", "background": "#f5f5f5", "color": "#141414" },
  dark: { "--primary-text-color": "#e1e1e1", "--secondary-text-color": "#9b9b9b", "--rgb-primary-text-color": "225, 225, 225",
    "--card-background-color": "#1c1c1c", "--primary-background-color": "#111111", "--divider-color": "rgba(225,225,225,.12)",
    "--primary-color": "#009ac7", "--rgb-primary-color": "0, 154, 199", "background": "#111111", "color": "#e1e1e1" },
};

const params = new URLSearchParams(location.search);
const language = params.get("lang") ?? "pl";
const scenario = params.get("scenario") ?? "main";

// [card, config, makeHass options, width]
const ALL = ["alerts", "pickup", "orders", "messages", "cart", "stats"];
const C = "allegro-card";
const SCENARIOS = {
  main: [
    [C, {}, {}, 440],
    [C, { layout: "compact" }, {}, 380],
    [C, { sections: ALL, cart: { style: "list" } }, {}, 440],
    [C, { sections: ["pickup", "orders", "cart"], orders: { style: "compact" }, cart: { style: "grid", show_add: false } }, {}, 440],
  ],
  news: [
    [C, { sections: ALL, stats: ["in_progress", "pickup", "pickup_deadline", "other_point", "messages", "invoices"] }, { orders: ["pickup", "other", "transit", "problem"] }, 440],
    [C, {}, { orders: ["transit", "problem"], stale: true }, 440],
    [C, { sections: ["messages"], messages: { show_automatic: false, hide_when_empty: false } }, { messages: 0 }, 440],
  ],
  "docs-news": [
    [C, { sections: ["alerts", "pickup", "messages", "stats"], pickup: { show_upcoming: false }, stats: ["pickup", "pickup_deadline", "other_point", "messages", "invoices"] }, { orders: ["other", "problem"] }, 440],
  ],
  "docs-default": [
    [C, {}, { orders: ["pickup", "delivery", "transit", "paid"] }, 440],
  ],
  "docs-compact": [
    [C, { layout: "compact" }, {}, 380],
    [C, { layout: "compact" }, { orders: ["transit", "paid"] }, 380],
  ],
  "docs-everything": [
    [C, { sections: ALL, cart: { style: "list" } }, { orders: ["pickup", "delivery", "transit", "problem", "paid"] }, 440],
  ],
  "docs-minimal": [
    [C, { sections: ["alerts", "orders", "stats"], orders: { style: "compact", max_items: 3 }, show_allegro_link: false }, { orders: ["pickup", "delivery", "transit", "paid"] }, 440],
    [C, { show_header: false, sections: ["cart"], cart: { style: "grid", show_add: false } }, {}, 440],
  ],
  states: [
    [C, {}, { offline: true }, 400],
    [C, {}, { orders: [], cart: 0, update: true }, 400],
    [C, { sections: ALL, stats: ["in_progress", "pickup", "cart", "cart_total"] }, { orders: ["payment", "problem", "pickup"] }, 400],
    [C, { sections: ["orders"], orders: { filter: "pickup" } }, { hidden: ["pickup"] }, 400],
    [C, { sections: ["pickup", "cart"], pickup: { hide_when_empty: false }, cart: { style: "list" } }, { orders: ["transit", "paid"], cart: 0 }, 400],
  ],
};

document.body.style.cssText = "margin:0;display:flex;width:fit-content;font-family:Roboto,'Noto Sans',system-ui,sans-serif;font-size:14px";
for (const [theme, vars] of Object.entries(THEMES)) {
  const col = document.createElement("div");
  col.style.cssText = "padding:16px;display:flex;flex-direction:column;gap:16px;align-items:flex-start";
  for (const [k, v] of Object.entries(vars)) col.style.setProperty(k, v);
  document.body.append(col);
  for (const [tag, config, options, width] of SCENARIOS[scenario]) {
    const wrap = document.createElement("div");
    wrap.style.width = `${width}px`;
    const card = document.createElement(tag);
    card.setConfig({ type: `custom:${tag}`, device_id: "acc1", ...config });
    wrap.append(card);
    col.append(wrap);
    card.hass = makeHass({ language, dark: theme === "dark", ...options });
  }
}
