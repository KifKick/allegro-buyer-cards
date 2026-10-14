import { css, html, nothing, type TemplateResult } from "lit";

import {
  AllegroBaseCard,
  type AllegroCardConfig,
  isUrgent,
  loadHaForm,
  onActivate,
  renderCode,
  renderDeadline,
  renderSegments,
  rgb,
} from "./base-card";
import { CART_DEFAULTS, type CartOptions, type CartSectionConfig } from "./cart-section";
import {
  ALERT_TYPES,
  type AlertType,
  ALLEGRO_URL,
  type CardSection,
  DEFAULT_SECTIONS,
  DEFAULT_STATS,
  ENTITY,
  type OrderAlertType,
  STATS,
} from "./const";
import { findUpdateEntity, getAllegroDevices } from "./discovery";
import { formatDateTime, formatMoney, formatNumber, formatRelative } from "./format";
import type { HomeAssistant } from "./ha-types";
import { plural, type StringKey, t } from "./i18n";
import { needsReading, type Thread } from "./messages";
import {
  MESSAGES_DEFAULTS,
  listedThreads,
  type MessagesOptions,
  type MessagesSectionConfig,
} from "./messages-section";
import {
  atOtherPoint,
  countGroups,
  deliveryNote,
  type Order,
  orderGroup,
  sortByStage,
  statusDef,
} from "./orders";
import { ORDERS_DEFAULTS, type OrdersOptions, type OrdersSectionConfig } from "./orders-section";
import {
  PICKUP_DEFAULTS,
  type PickupOptions,
  type PickupSectionConfig,
  readyForPickup,
  upcomingPickups,
} from "./pickup-section";
import { baseStyles } from "./styles";

export interface CardConfig extends AllegroCardConfig {
  name?: string;
  icon?: string;
  layout?: "default" | "compact";
  show_header?: boolean;
  show_allegro_link?: boolean;
  show_update?: boolean;
  /** Captions above the pickup, orders and cart sections. */
  section_titles?: boolean;
  sections?: CardSection[];
  alerts?: { types?: AlertType[] };
  pickup?: PickupOptions;
  orders?: OrdersOptions;
  messages?: MessagesOptions;
  cart?: CartOptions;
  stats?: string[];
}

/** The config with every option set. */
export interface FullCardConfig extends CardConfig {
  layout: "default" | "compact";
  show_header: boolean;
  show_allegro_link: boolean;
  show_update: boolean;
  section_titles: boolean;
  sections: CardSection[];
  alerts: { types: AlertType[] };
  pickup: Required<PickupOptions>;
  orders: Required<OrdersOptions>;
  messages: Required<MessagesOptions>;
  cart: Required<CartOptions>;
  stats: string[];
}

export const CARD_DEFAULTS = {
  layout: "default",
  show_header: true,
  show_allegro_link: true,
  show_update: true,
  section_titles: true,
  sections: DEFAULT_SECTIONS,
  alerts: { types: [...ALERT_TYPES] },
  pickup: PICKUP_DEFAULTS,
  orders: ORDERS_DEFAULTS,
  messages: MESSAGES_DEFAULTS,
  cart: CART_DEFAULTS,
  stats: DEFAULT_STATS,
} as const;

/** The config with every default filled in, section options included. */
export const withDefaults = (config: CardConfig): FullCardConfig =>
  ({
    ...CARD_DEFAULTS,
    ...config,
    alerts: { ...CARD_DEFAULTS.alerts, ...config.alerts },
    pickup: { ...CARD_DEFAULTS.pickup, ...config.pickup },
    orders: { ...CARD_DEFAULTS.orders, ...config.orders },
    messages: { ...CARD_DEFAULTS.messages, ...config.messages },
    cart: { ...CARD_DEFAULTS.cart, ...config.cart },
  }) as FullCardConfig;

/** Orders that get a banner of their own: something to do, not just to watch. */
const alertKind = (order: Order): OrderAlertType | undefined =>
  orderGroup(order) === "pickup"
    ? "pickup"
    : orderGroup(order) === "problem"
      ? "problem"
      : order.status === "WAITING_FOR_PAYMENT"
        ? "payment"
        : undefined;

const ALERTS = {
  pickup: { color: "green", icon: "mdi:package-variant-closed-check", label: "alert_pickup" },
  problem: { color: "red", icon: "mdi:truck-alert-outline", label: "alert_problem" },
  payment: { color: "amber", icon: "mdi:credit-card-clock-outline", label: "alert_payment" },
} as const;

/** Whether an order gets a banner with these banner types. */
const hasAlert = (order: Order, types: AlertType[]): boolean => {
  const kind = alertKind(order);
  return kind !== undefined && types.includes(kind);
};

/** "1 to pick up · 2 on the way · 1 unread", most urgent first. */
export const summaryText = (hass: HomeAssistant | undefined, orders: Order[], unread = 0): string => {
  const counts = countGroups(orders);
  const parts = (["problem", "pickup", "on_the_way", "preparing"] as const)
    .filter((group) => counts[group] > 0)
    .map((group) => t(hass, `summary_${group}`, { n: formatNumber(hass, counts[group]) }));
  if (!parts.length) parts.push(t(hass, "nothing_on_the_way"));
  if (unread) parts.push(t(hass, "summary_unread", { n: formatNumber(hass, unread) }));
  return parts.join(" · ");
};

/**
 * The one Allegro card: a header for the account, then whichever sections the
 * config lists (banners, pickups, orders, cart, counters) in that order. The
 * pickup, full orders and cart list sections are their own elements, so their
 * state (filter, open order, enlarged QR code, the add field) survives updates.
 */
export class AllegroCard extends AllegroBaseCard<CardConfig> {
  static getStubConfig(hass: HomeAssistant): Partial<CardConfig> {
    const device = getAllegroDevices(hass)[0];
    return device ? { device_id: device.id } : {};
  }

  static async getConfigElement(): Promise<HTMLElement> {
    await loadHaForm();
    return document.createElement("allegro-card-editor");
  }

  private _full = withDefaults({ type: "" });

  /** Section configs, rebuilt only with the card's own, so sections keep their state. */
  private _sectionConfigs: {
    pickup?: PickupSectionConfig;
    orders?: OrdersSectionConfig;
    messages?: MessagesSectionConfig;
    cart?: CartSectionConfig;
  } = {};

  override setConfig(config: CardConfig): void {
    super.setConfig(config);
    this._full = withDefaults(config);
    const base = { type: "section", device_id: config.device_id };
    this._sectionConfigs = {
      pickup: { ...base, ...this._full.pickup },
      orders: { ...base, ...this._full.orders },
      messages: { ...base, ...this._full.messages },
      cart: { ...base, ...this._full.cart },
    };
  }

  private get _cfg() {
    return this._full;
  }

  private _shows(section: CardSection): boolean {
    return (this._cfg.sections as readonly string[]).includes(section);
  }

  /** Alert kinds shown as banners (none for what has its own section: pickups, messages). */
  private _alertTypes(): AlertType[] {
    if (!this._shows("alerts")) return [];
    return (this._cfg.alerts.types as AlertType[]).filter(
      (type) => (type !== "pickup" || !this._shows("pickup")) && (type !== "messages" || !this._shows("messages")),
    );
  }

  /** Account-wide banners: stale data, then unread messages worth reading. */
  private _accountAlerts(types: AlertType[]): ("stale" | "messages")[] {
    const alerts: ("stale" | "messages")[] = [];
    if (types.includes("stale") && this._staleSince !== undefined) alerts.push("stale");
    if (types.includes("messages") && needsReading(this._threads).length) alerts.push("messages");
    return alerts;
  }

  getCardSize(): number {
    if (this._cfg.layout === "compact") return 1;
    if (this._offline) return 2;
    const orders = this._orders;
    const types = this._alertTypes();
    const alerts =
      orders.filter((order) => hasAlert(order, types)).length + this._accountAlerts(types).length;
    let size = (this._cfg.show_header ? 1 : 0) + alerts;
    if (this._shows("pickup")) size += readyForPickup(orders).length * 3 + 1;
    if (this._shows("orders")) size += 1 + Math.min(orders.length, Number(this._cfg.orders.max_items));
    if (this._shows("messages")) {
      const listed = listedThreads(this._threads, this._cfg.messages.show_automatic).length;
      if (listed || !this._cfg.messages.hide_when_empty) {
        size += 2 + Math.min(listed, Number(this._cfg.messages.max_items));
      }
    }
    if (this._shows("cart")) size += this._cfg.cart.style === "summary" ? 1 : 3;
    if (this._shows("stats")) size += 1;
    return Math.max(1, size);
  }

  getGridOptions() {
    return this._cfg.layout === "compact"
      ? { columns: 6, rows: 1, min_columns: 4, min_rows: 1 }
      : { columns: 12, rows: "auto", min_columns: 6 };
  }

  protected override _watchedEntityIds(): string[] {
    const update = this._cfg.show_update && this._hass ? findUpdateEntity(this._hass) : undefined;
    return [...super._watchedEntityIds(), ...(update ? [update.entity_id] : [])];
  }

  protected override render() {
    if (!this._config || !this._hass) return nothing;
    const problem = this._renderProblem();
    if (problem) return problem;
    if (this._cfg.layout === "compact") return this._renderCompact();
    const orders = this._orders;
    const header = this._cfg.show_header ? this._renderHeader(orders) : nothing;
    if (this._offline) {
      return html`<ha-card>${header}${this._renderOffline(!this._cfg.show_header)}</ha-card>`;
    }
    const sections = (this._cfg.sections as readonly CardSection[])
      .map((section) => this._renderSection(section, orders))
      .filter((section) => section !== nothing);
    return html`<ha-card>
      ${header}
      ${sections.length
        ? html`<div class="body ${this._cfg.show_header ? "" : "headless"}">${sections}</div>`
        : nothing}
    </ha-card>`;
  }

  private _renderSection(section: CardSection, orders: Order[]): TemplateResult | typeof nothing {
    const hass = this._hass!;
    const types = this._alertTypes();
    switch (section) {
      case "alerts": {
        const account = this._accountAlerts(types);
        const alerts = sortByStage(orders.filter((order) => hasAlert(order, types)));
        return alerts.length || account.length
          ? html`<div class="section pad">
              <div class="alerts">
                ${account.map((kind) =>
                  kind === "stale" ? this._renderStaleAlert() : this._renderMessagesAlert(),
                )}
                ${alerts.map((order) => this._renderAlert(order))}
              </div>
            </div>`
          : nothing;
      }
      case "pickup": {
        const ready = readyForPickup(orders).length;
        const upcoming = this._cfg.pickup.show_upcoming ? upcomingPickups(orders).length : 0;
        if (!ready && !upcoming && this._cfg.pickup.hide_when_empty) return nothing;
        return html`<div class="section titled">
          ${this._renderCaption(t(hass, "pickup_title"), ready ? formatNumber(hass, ready) : undefined)}
          <allegro-card-pickup
            .sectionConfig=${this._sectionConfigs.pickup}
            .hass=${this._hass}
          ></allegro-card-pickup>
        </div>`;
      }
      case "orders": {
        if (this._cfg.orders.style === "compact") {
          // Orders with a banner aren't listed again.
          const listed = orders.filter((order) => !hasAlert(order, types));
          const rows = this._renderOrders(listed);
          return rows === nothing
            ? nothing
            : html`<div class="section titled">
                ${this._renderCaption(t(hass, "orders_title"))}
                <div class="pad">${rows}</div>
              </div>`;
        }
        return html`<div class="section titled">
          ${this._renderCaption(t(hass, "orders_title"), formatNumber(hass, orders.length))}
          <allegro-card-orders
            .sectionConfig=${this._sectionConfigs.orders}
            .hass=${this._hass}
          ></allegro-card-orders>
        </div>`;
      }
      case "messages": {
        const unread = this._threads;
        const listed = listedThreads(unread, this._cfg.messages.show_automatic).length;
        if (!listed && this._cfg.messages.hide_when_empty) return nothing;
        return html`<div class="section titled">
          ${this._renderCaption(
            t(hass, "messages_title"),
            listed ? formatNumber(hass, listed) : undefined,
            html`<a
              class="icon-button small"
              href=${ALLEGRO_URL.messages}
              target="_blank"
              rel="noopener noreferrer"
              title=${t(hass, "open_messages")}
              aria-label=${t(hass, "open_messages")}
              ><ha-icon icon="mdi:open-in-new"></ha-icon
            ></a>`,
          )}
          <allegro-card-messages
            .sectionConfig=${this._sectionConfigs.messages}
            .hass=${this._hass}
          ></allegro-card-messages>
        </div>`;
      }
      case "cart": {
        if (this._cfg.cart.style === "summary") {
          const row = this._renderCart();
          return row === nothing ? nothing : html`<div class="section pad">${row}</div>`;
        }
        const cart = this._cart;
        const selected = cart?.items.filter((item) => item.selected).length ?? 0;
        const detail = cart?.items.length
          ? [
              plural(hass, "pieces", cart.pieces),
              selected < cart.items.length
                ? t(hass, "selected_count", { n: selected, total: cart.items.length })
                : undefined,
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined;
        return html`<div class="section titled">
          ${this._renderCaption(
            t(hass, "cart"),
            detail,
            html`<a
              class="icon-button small"
              href=${ALLEGRO_URL.cart}
              target="_blank"
              rel="noopener noreferrer"
              title=${t(hass, "open_cart")}
              aria-label=${t(hass, "open_cart")}
              ><ha-icon icon="mdi:open-in-new"></ha-icon
            ></a>`,
          )}
          <allegro-card-cart
            .sectionConfig=${this._sectionConfigs.cart}
            .hass=${this._hass}
          ></allegro-card-cart>
        </div>`;
      }
      case "stats": {
        const chips = this._renderStats(orders);
        return chips === nothing ? nothing : html`<div class="section pad">${chips}</div>`;
      }
      default:
        return nothing;
    }
  }

  private _renderCaption(title: string, detail?: string, action?: TemplateResult) {
    if (!this._cfg.section_titles) return nothing;
    return html`<div class="caption">
      <span class="caption-title">${title}</span>${detail
        ? html`<span class="caption-detail">${detail}</span>`
        : nothing}
      <span class="grow"></span>${action ?? nothing}
    </div>`;
  }

  /** Red "!" for a problem, otherwise a green count of parcels to pick up. */
  private _renderBadge(orders: Order[]): TemplateResult | typeof nothing {
    const counts = countGroups(orders);
    if (counts.problem) {
      return html`<div class="badge" style="--badge-c: var(--rgb-red)">
        <ha-icon icon="mdi:exclamation-thick"></ha-icon>
      </div>`;
    }
    if (counts.pickup) {
      return html`<div class="badge" style="--badge-c: var(--rgb-green)">${counts.pickup}</div>`;
    }
    return nothing;
  }

  private _renderHeader(orders: Order[]) {
    const hass = this._hass!;
    const update = this._cfg.show_update ? findUpdateEntity(hass) : undefined;
    const moreInfo = () => this._moreInfo(this._entities[ENTITY.inProgress]);
    return html`<div class="state-item header">
      <div class="shape" style="--c: ${rgb("allegro")}">
        <ha-icon .icon=${this._cfg.icon ?? "mdi:shopping-outline"}></ha-icon>${this._offline
          ? nothing
          : this._renderBadge(orders)}
      </div>
      <div
        class="info clickable"
        role="button"
        tabindex="0"
        @click=${moreInfo}
        @keydown=${onActivate(moreInfo)}
      >
        <span class="primary">${this._cfg.name || this._deviceName}</span>
        <span class="secondary">
          ${this._offline ? t(hass, "offline") : this._summary(orders)}
        </span>
      </div>
      ${update?.state === "on"
        ? html`<button
            class="icon-button alert"
            title=${t(hass, "update_available")}
            aria-label=${t(hass, "update_available")}
            @click=${() => this._moreInfo(update.entity_id)}
          >
            <ha-icon icon="mdi:arrow-up-circle-outline"></ha-icon>
          </button>`
        : nothing}
      ${this._cfg.show_allegro_link
        ? html`<a
            class="icon-button"
            href=${ALLEGRO_URL.orders}
            target="_blank"
            rel="noopener noreferrer"
            title=${t(hass, "open_allegro")}
            aria-label=${t(hass, "open_allegro")}
            ><ha-icon icon="mdi:open-in-new"></ha-icon
          ></a>`
        : nothing}
    </div>`;
  }

  private _summary(orders: Order[]): string {
    return summaryText(this._hass, orders, needsReading(this._threads).length);
  }

  private _renderStaleAlert() {
    const hass = this._hass!;
    const since = this._staleSince!;
    const moreInfo = () => this._moreInfo(this._entities[ENTITY.lastUpdate]);
    return html`<div
      class="banner clickable"
      style="--c: ${rgb("red")}"
      role="button"
      tabindex="0"
      @click=${moreInfo}
      @keydown=${onActivate(moreInfo)}
    >
      <div class="shape"><ha-icon icon="mdi:cloud-alert-outline"></ha-icon></div>
      <div class="info">
        <span class="primary">${t(hass, "alert_stale")}</span>
        <span class="secondary" title=${formatDateTime(hass, since)}
          >${t(hass, "stale_hint", { when: formatRelative(hass, since) })}</span
        >
      </div>
    </div>`;
  }

  private _renderMessagesAlert() {
    const hass = this._hass!;
    const threads: Thread[] = needsReading(this._threads);
    const latest = threads[0];
    const invoices = threads.filter((thread) => thread.category === "invoice").length;
    return html`<div class="banner" style="--c: ${rgb("blue")}">
      <div class="shape"><ha-icon icon="mdi:email-alert-outline"></ha-icon></div>
      <div class="info">
        <span class="primary"
          >${plural(hass, "unread", threads.length)}${invoices
            ? ` · ${plural(hass, "invoices", invoices)}`
            : ""}</span
        >
        <span class="secondary" title=${latest.preview}>${latest.seller} · ${latest.preview}</span>
      </div>
      <a
        class="icon-button"
        href=${ALLEGRO_URL.messages}
        target="_blank"
        rel="noopener noreferrer"
        title=${t(hass, "open_messages")}
        aria-label=${t(hass, "open_messages")}
        ><ha-icon icon="mdi:open-in-new"></ha-icon
      ></a>
    </div>`;
  }

  private _renderAlert(order: Order) {
    const hass = this._hass!;
    const kind = alertKind(order)!;
    const def = ALERTS[kind];
    const title = order.offers[0] ?? order.seller;
    const where = kind === "pickup" ? (order.pickupPoint?.name ?? order.deliveryName) : order.seller;
    const note = kind === "problem" ? deliveryNote(order) : undefined;
    let trailing: TemplateResult | typeof nothing = nothing;
    if (kind === "pickup" && order.pickupCode) {
      const code = order.pickupCode;
      trailing = html`<button
        class="code-pill"
        title=${t(hass, "copy_code")}
        aria-label=${`${t(hass, "copy_code")}: ${code}`}
        @click=${() => this._copy(code)}
      >
        ${renderCode(code)}<ha-icon icon="mdi:content-copy"></ha-icon>
      </button>`;
    } else if (kind === "problem" && order.trackingUrl) {
      trailing = html`<a
        class="icon-button"
        href=${order.trackingUrl}
        target="_blank"
        rel="noopener noreferrer"
        title=${t(hass, "track")}
        aria-label=${t(hass, "track")}
        ><ha-icon icon="mdi:map-search-outline"></ha-icon
      ></a>`;
    } else if (kind === "payment") {
      trailing = html`<a
        class="icon-button"
        href=${ALLEGRO_URL.orders}
        target="_blank"
        rel="noopener noreferrer"
        title=${t(hass, "open_allegro")}
        aria-label=${t(hass, "open_allegro")}
        ><ha-icon icon="mdi:open-in-new"></ha-icon
      ></a>`;
    }
    return html`<div class="banner" style="--c: ${rgb(def.color)}">
      <div class="shape"><ha-icon .icon=${def.icon}></ha-icon></div>
      <div class="info">
        <span class="primary"
          >${t(hass, def.label)}${atOtherPoint(order)
            ? html` · <span class="warn">${t(hass, "other_point_short")}</span>`
            : nothing}</span
        >
        <span class="secondary" title=${title}>${where ? `${where} · ${title}` : title}</span>
        ${kind === "pickup" && order.pickupDeadline
          ? html`<span class="secondary">${renderDeadline(hass, order.pickupDeadline)}</span>`
          : note
            ? html`<span class="secondary" title=${order.delivery?.details ?? ""}>${note}</span>`
            : nothing}
      </div>
      ${trailing}
    </div>`;
  }

  private _renderOrders(orders: Order[]) {
    if (!orders.length) return nothing;
    const hass = this._hass!;
    const max = Math.max(1, Number(this._cfg.orders.max_items));
    const shown = sortByStage(orders).slice(0, max);
    return html`<div class="orders">
      ${shown.map((order) => this._renderOrder(order))}
      ${orders.length > shown.length
        ? html`<div class="more">${t(hass, "more_orders", { n: orders.length - shown.length })}</div>`
        : nothing}
    </div>`;
  }

  private _renderOrder(order: Order) {
    const def = statusDef(order.status);
    const title = order.offers[0] ?? order.seller;
    const extra = order.offers.length > 1 ? ` +${order.offers.length - 1}` : "";
    const content = html`<div class="shape small"><ha-icon .icon=${def.icon}></ha-icon></div>
      <div class="info">
        <span class="primary" title=${order.offers.join("\n")}>${title}${extra}</span>
        <span class="secondary">${this._statusLabel(order)} · ${order.seller}</span>
        ${renderSegments(order)}
      </div>
      ${order.trackingUrl
        ? html`<ha-icon class="go" icon="mdi:chevron-right"></ha-icon>`
        : html`<span class="go" aria-hidden="true"></span>`}`;
    // With tracking, the whole row is the tracking link.
    return order.trackingUrl
      ? html`<a
          class="order state-item clickable"
          style="--c: ${rgb(def.color)}"
          href=${order.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          title=${t(this._hass, "track")}
          >${content}</a
        >`
      : html`<div class="order state-item" style="--c: ${rgb(def.color)}">${content}</div>`;
  }

  private _renderCart() {
    const hass = this._hass!;
    const cart = this._cart;
    if (!cart) return nothing;
    const photos = cart.items.filter((item) => item.photoUrl).slice(0, 4);
    const secondary = cart.items.length
      ? `${plural(hass, "pieces", cart.pieces)} · ${formatMoney(hass, cart.total, cart.currency)}`
      : t(hass, "cart_empty");
    return html`<a
      class="cart state-item clickable"
      href=${ALLEGRO_URL.cart}
      target="_blank"
      rel="noopener noreferrer"
      title=${t(hass, "open_cart")}
    >
      ${photos.length
        ? html`<div class="stack">
            ${photos.map(
              (item) => html`<span class="thumb"><img src=${item.photoUrl!} alt="" loading="lazy" /></span>`,
            )}
          </div>`
        : html`<div class="shape small" style="--c: ${rgb("allegro")}">
            <ha-icon icon="mdi:cart-outline"></ha-icon>
          </div>`}
      <div class="info">
        <span class="primary">${t(hass, "cart")}</span>
        <span class="secondary">${secondary}</span>
      </div>
      <ha-icon class="go" icon="mdi:chevron-right"></ha-icon>
    </a>`;
  }

  private _renderStats(orders: Order[]) {
    const chips = (this._cfg.stats as readonly string[])
      .map((key) => this._renderStat(key, orders))
      .filter((chip) => chip !== nothing);
    return chips.length ? html`<div class="chips">${chips}</div>` : nothing;
  }

  private _renderStat(key: string, orders: Order[]): TemplateResult | typeof nothing {
    const hass = this._hass!;
    const def = STATS[key];
    const stateObj = def && this._stateObj(def.entity);
    if (!stateObj) return nothing;
    let value: number;
    let text: string;
    if (key === "pickup_deadline") {
      // The nearest deadline, as "in 2 days"; nothing to show when nothing waits.
      const deadline = Date.parse(stateObj.state);
      if (Number.isNaN(deadline)) return nothing;
      const left = formatRelative(hass, deadline);
      const label = `${t(hass, "stat_pickup_deadline")}: ${formatDateTime(hass, deadline)}`;
      return html`<button
        class="chip"
        style="--c: ${rgb(isUrgent(deadline) ? "red" : def.color)}"
        title=${label}
        aria-label=${label}
        @click=${() => this._moreInfo(stateObj.entity_id)}
      >
        <ha-icon .icon=${def.icon}></ha-icon><span>${left}</span>
      </button>`;
    }
    if (key === "cart" || key === "cart_total") {
      const cart = this._cart;
      value = key === "cart" ? (cart?.pieces ?? 0) : (cart?.total ?? 0);
      text =
        key === "cart"
          ? formatNumber(hass, value)
          : formatMoney(hass, value, cart?.currency ?? "");
    } else if (key === "messages") {
      value = this._threads.length;
      text = formatNumber(hass, value);
    } else if (key === "invoices") {
      value = this._invoices.length;
      text = formatNumber(hass, value);
    } else if (key === "other_point") {
      value = orders.filter(atOtherPoint).length;
      text = formatNumber(hass, value);
    } else {
      value = def.statuses
        ? orders.filter((order) => def.statuses!.includes(order.status)).length
        : orders.length;
      text = formatNumber(hass, value);
    }
    // Chips only take their colour while there's something to count.
    const label = `${t(hass, `stat_${key}` as StringKey)}: ${text}`;
    return html`<button
      class="chip"
      style=${value > 0 ? `--c: ${rgb(def.color)}` : ""}
      title=${label}
      aria-label=${label}
      @click=${() => this._moreInfo(stateObj.entity_id)}
    >
      <ha-icon .icon=${def.icon}></ha-icon><span>${text}</span>
    </button>`;
  }

  private _renderCompact() {
    const hass = this._hass!;
    const orders = this._orders;
    const pickup = sortByStage(orders).find((order) => orderGroup(order) === "pickup");
    const moreInfo = () => this._moreInfo(this._entities[ENTITY.inProgress]);
    return html`<ha-card class="compact">
      <div class="state-item">
        <div class="shape" style="--c: ${rgb("allegro")}">
          <ha-icon .icon=${this._cfg.icon ?? "mdi:shopping-outline"}></ha-icon>${this._offline
            ? nothing
            : this._renderBadge(orders)}
        </div>
        <div
          class="info clickable"
          role="button"
          tabindex="0"
          @click=${moreInfo}
          @keydown=${onActivate(moreInfo)}
        >
          <span class="primary">${this._cfg.name || this._deviceName}</span>
          <span class="secondary">${this._offline ? t(hass, "offline") : this._summary(orders)}</span>
        </div>
        ${pickup?.pickupCode
          ? html`<button
              class="code-pill"
              style="--c: ${rgb("green")}"
              title=${t(hass, "copy_code")}
              aria-label=${`${t(hass, "copy_code")}: ${pickup.pickupCode}`}
              @click=${() => this._copy(pickup.pickupCode!)}
            >
              ${renderCode(pickup.pickupCode)}<ha-icon icon="mdi:content-copy"></ha-icon>
            </button>`
          : nothing}
      </div>
    </ha-card>`;
  }

  static override styles = [
    baseStyles,
    css`
      .header .info {
        border-radius: 8px;
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--spacing);
        padding-bottom: var(--spacing);
      }
      .body.headless {
        padding-top: var(--spacing);
      }
      .pad {
        padding: 0 var(--spacing);
      }
      /* Sections with a caption are set apart by a hairline. */
      .section.titled {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .section.titled:not(:first-child) {
        padding-top: var(--spacing);
        border-top: 1px solid var(--divider-color);
      }
      .caption {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        padding: 0 var(--spacing);
        font-size: 11px;
        line-height: 16px;
        color: var(--secondary-text-color);
      }
      .caption-title {
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .caption-detail::before {
        content: "· ";
      }
      .caption .grow {
        flex: 1;
      }
      .icon-button.small {
        width: 28px;
        height: 28px;
        margin: -2px -4px -2px 0;
      }
      .icon-button.small ha-icon {
        --mdc-icon-size: 18px;
      }
      .alerts {
        display: flex;
        flex-direction: column;
        gap: calc(var(--spacing) / 2);
      }
      .banner .secondary + .secondary {
        margin-top: 2px;
      }
      .warn {
        color: rgb(var(--rgb-amber));
      }
      .code-pill {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        margin: 0;
        padding: 0 10px;
        border: none;
        border-radius: 16px;
        font: inherit;
        font-size: 15px;
        color: rgb(var(--c));
        background-color: var(--card-background-color, #fff);
        box-shadow: inset 0 0 0 1px rgba(var(--c), 0.4);
        cursor: copy;
      }
      .code-pill ha-icon {
        --mdc-icon-size: 16px;
        display: flex;
        opacity: 0.7;
      }
      .code-pill:hover {
        background-color: rgba(var(--c), 0.08);
      }
      .orders {
        display: flex;
        flex-direction: column;
        margin: 0 calc(var(--spacing) / -2);
      }
      .order,
      .cart {
        padding: 6px calc(var(--spacing) / 2);
        border-radius: var(--control-border-radius);
        text-decoration: none;
        color: inherit;
      }
      .shape.small {
        --icon-size: 32px;
      }
      a.state-item:hover {
        background-color: var(--tint);
      }
      .go {
        --mdc-icon-size: 20px;
        flex: none;
        width: 20px;
        color: var(--secondary-text-color);
      }
      .more {
        padding: 2px calc(var(--spacing) / 2) 0 calc(32px + var(--spacing) * 1.5);
        font-size: var(--card-secondary-font-size);
        color: var(--secondary-text-color);
      }
      .cart {
        margin: 0 calc(var(--spacing) / -2);
      }
      .stack {
        flex: none;
        display: flex;
        padding-inline-start: 6px;
      }
      .stack .thumb {
        --thumb-size: 32px;
        margin-inline-start: -10px;
        border-radius: 50%;
        box-shadow:
          0 0 0 2px var(--card-background-color, #fff),
          inset 0 0 0 1px rgba(0, 0, 0, 0.06);
      }
      .stack .thumb img {
        padding: 3px;
        box-sizing: border-box;
      }
      .compact .state-item {
        height: 100%;
        box-sizing: border-box;
      }
      /* One grid row (56px) in a sections view: centre, don't pad, the row. */
      :host([layout="grid"]) .compact .state-item {
        padding-block: 0;
      }
    `,
  ];
}
