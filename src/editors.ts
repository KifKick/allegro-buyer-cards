// The card's visual editor: a plain <ha-form> (HA's own selectors), laid out
// like dockhand-cards' editors: the account picker at the root, how the card
// looks in one collapsible group, then one group per section with that
// section's options. Values equal to the defaults are dropped, so the YAML
// stays minimal.

import { html, LitElement, nothing } from "lit";
import { property, state } from "lit/decorators.js";

import { CARD_DEFAULTS, type CardConfig, withDefaults } from "./allegro-card";
import { ALERT_TYPES, CARD_SECTIONS, DOMAIN, ORDER_DETAILS, ORDER_FILTERS, STATS } from "./const";
import { getAllegroDevices } from "./discovery";
import { fireEvent, type HomeAssistant } from "./ha-types";
import { type StringKey, t } from "./i18n";

type Schema = Record<string, unknown>;

const options = (hass: HomeAssistant | undefined, values: readonly string[], prefix: string) =>
  values.map((value) => ({ value, label: t(hass, `${prefix}${value}` as StringKey) }));

/** Ordered multi-select: the order the user picks is the order shown on the card. */
const multiSelect = (hass: HomeAssistant | undefined, values: readonly string[], prefix: string) => ({
  selector: {
    select: { multiple: true, reorder: true, mode: "list", options: options(hass, values, prefix) },
  },
});

const choice = (
  hass: HomeAssistant | undefined,
  values: readonly string[],
  prefix: string,
  mode = "box",
) => ({ selector: { select: { mode, options: options(hass, values, prefix) } } });

const toggle = { selector: { boolean: {} } };

const LABEL_KEYS: Record<string, StringKey> = {
  device_id: "ed_device_id",
  name: "ed_name",
  icon: "ed_icon",
  layout: "ed_layout",
  sections: "ed_sections",
  show_header: "ed_show_header",
  section_titles: "ed_section_titles",
  show_allegro_link: "ed_show_allegro_link",
  show_update: "ed_show_update",
  types: "ed_types",
  show_qr: "ed_show_qr",
  show_phone: "ed_show_phone",
  show_upcoming: "ed_show_upcoming",
  show_deadline: "ed_show_deadline",
  show_automatic: "ed_show_automatic",
  show_invoices: "ed_show_invoices",
  show_actions: "ed_show_actions",
  hide_when_empty: "ed_hide_when_empty",
  style: "ed_style",
  max_items: "ed_max_items",
  filter: "ed_filter",
  filters: "ed_filters",
  sort: "ed_sort",
  details: "ed_details",
  show_progress: "ed_show_progress",
  allow_hide: "ed_allow_hide",
  show_unselected: "ed_show_unselected",
  show_add: "ed_show_add",
  stats: "ed_stats",
};

const HELPER_KEYS: Record<string, StringKey> = {
  sections: "ed_sections_helper",
  filters: "ed_filters_helper",
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Drops empty values and values equal to the defaults, section objects included. */
export const pruneConfig = (
  config: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null || value === "") continue;
    const fallback = defaults[key];
    if (isObject(value) && isObject(fallback)) {
      const inner = pruneConfig(value, fallback);
      if (Object.keys(inner).length) out[key] = inner;
    } else if (!(key in defaults) || JSON.stringify(value) !== JSON.stringify(fallback)) {
      out[key] = value;
    }
  }
  return out;
};

export class AllegroCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _config?: CardConfig;

  setConfig(config: CardConfig): void {
    this._config = config;
  }

  private _schema(): Schema[] {
    const hass = this.hass;
    const cfg = withDefaults(this._config ?? { type: "" });
    const compact = cfg.layout === "compact";
    const appearance: Schema = {
      name: "",
      type: "expandable",
      flatten: true,
      icon: "mdi:palette-outline",
      title: t(hass, "ed_appearance"),
      schema: [
        {
          type: "grid",
          name: "",
          schema: [
            { name: "name", selector: { text: {} } },
            { name: "icon", selector: { icon: {} } },
          ],
        },
        { name: "layout", ...choice(hass, ["default", "compact"], "ed_layout_") },
        ...(compact
          ? []
          : [
              { name: "sections", ...multiSelect(hass, CARD_SECTIONS, "ed_section_") },
              {
                type: "grid",
                name: "",
                schema: [
                  { name: "show_header", ...toggle },
                  { name: "section_titles", ...toggle },
                  { name: "show_allegro_link", ...toggle },
                  { name: "show_update", ...toggle },
                ],
              },
            ]),
      ],
    };
    if (compact) return [this._deviceSchema(), appearance];

    const group = (name: string, icon: string, schema: Schema[]): Schema => ({
      name,
      type: "expandable",
      icon,
      title: t(hass, `ed_section_${name}` as StringKey),
      schema,
    });
    const fullOrders = cfg.orders.style === "full";
    const cartList = cfg.cart.style !== "summary";
    return [
      this._deviceSchema(),
      appearance,
      group("alerts", "mdi:alert-circle-outline", [
        { name: "types", ...multiSelect(hass, ALERT_TYPES, "alert_") },
      ]),
      group("pickup", "mdi:package-variant-closed-check", [
        {
          type: "grid",
          name: "",
          schema: [
            { name: "show_qr", ...toggle },
            { name: "show_phone", ...toggle },
            { name: "show_upcoming", ...toggle },
            { name: "show_deadline", ...toggle },
            { name: "hide_when_empty", ...toggle },
          ],
        },
      ]),
      group("messages", "mdi:email-outline", [
        { name: "max_items", selector: { number: { min: 1, max: 30, mode: "box" } } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "show_automatic", ...toggle },
            { name: "show_invoices", ...toggle },
            { name: "show_actions", ...toggle },
            { name: "hide_when_empty", ...toggle },
          ],
        },
      ]),
      group("orders", "mdi:package-variant", [
        { name: "style", ...choice(hass, ["compact", "full"], "ed_orders_style_") },
        { name: "max_items", selector: { number: { min: 1, max: 50, mode: "box" } } },
        ...(fullOrders
          ? [
              {
                type: "grid",
                name: "",
                schema: [
                  { name: "filter", ...choice(hass, ORDER_FILTERS, "filter_", "dropdown") },
                  { name: "sort", ...choice(hass, ["stage", "newest"], "ed_sort_", "dropdown") },
                ],
              },
              { name: "filters", ...multiSelect(hass, ORDER_FILTERS, "filter_") },
              { name: "details", ...multiSelect(hass, ORDER_DETAILS, "ed_detail_") },
              {
                type: "grid",
                name: "",
                schema: [
                  { name: "show_progress", ...toggle },
                  { name: "allow_hide", ...toggle },
                ],
              },
            ]
          : []),
      ]),
      group("cart", "mdi:cart-outline", [
        { name: "style", ...choice(hass, ["summary", "list", "grid"], "ed_cart_style_") },
        ...(cartList
          ? [
              { name: "max_items", selector: { number: { min: 0, max: 50, mode: "box" } } },
              {
                type: "grid",
                name: "",
                schema: [
                  { name: "show_unselected", ...toggle },
                  { name: "show_add", ...toggle },
                ],
              },
            ]
          : []),
      ]),
      {
        name: "",
        type: "expandable",
        flatten: true,
        icon: "mdi:counter",
        title: t(hass, "ed_section_stats"),
        schema: [{ name: "stats", ...multiSelect(hass, Object.keys(STATS), "stat_") }],
      },
    ];
  }

  private _deviceSchema(): Schema {
    return {
      name: "device_id",
      required: true,
      selector: { device: { filter: { integration: DOMAIN } } },
    };
  }

  protected override render() {
    if (!this.hass || !this._config) return nothing;
    const noDevices = getAllegroDevices(this.hass).length === 0;
    return html`<ha-form
      .hass=${this.hass}
      .data=${withDefaults(this._config)}
      .schema=${this._schema()}
      .computeLabel=${(schema: Schema) =>
        LABEL_KEYS[schema.name as string] ? t(this.hass, LABEL_KEYS[schema.name as string]) : undefined}
      .computeHelper=${(schema: Schema) =>
        schema.name === "device_id" && noDevices
          ? t(this.hass, "ed_no_devices")
          : HELPER_KEYS[schema.name as string]
            ? t(this.hass, HELPER_KEYS[schema.name as string])
            : undefined}
      @value-changed=${this._valueChanged}
    ></ha-form>`;
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const config = pruneConfig(ev.detail.value, CARD_DEFAULTS as unknown as Record<string, unknown>);
    fireEvent(this, "config-changed", { config: { type: this._config?.type, ...config } });
  }
}
