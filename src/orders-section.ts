import { css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

import {
  AllegroBaseCard,
  type AllegroCardConfig,
  linkButton,
  onActivate,
  renderCode,
  renderDeadline,
  renderSegments,
  rgb,
} from "./base-card";
import { ALLEGRO_URL, ORDER_DETAILS, ORDER_FILTERS, type OrderFilter, STAGE_ICONS } from "./const";
import { formatNumber } from "./format";
import { plural, type StringKey, t } from "./i18n";
import {
  atOtherPoint,
  countGroups,
  mapsUrl,
  type Order,
  orderGroup,
  orderStages,
  sortByStage,
  statusDef,
} from "./orders";
import { baseStyles } from "./styles";

export interface OrdersOptions {
  /** `compact`: a short list drawn by the card itself; `full`: this section. */
  style?: "compact" | "full";
  filter?: OrderFilter;
  filters?: OrderFilter[];
  sort?: "stage" | "newest";
  max_items?: number;
  show_progress?: boolean;
  details?: string[];
  allow_hide?: boolean;
}

export type OrdersSectionConfig = AllegroCardConfig & OrdersOptions;

export const ORDERS_DEFAULTS = {
  style: "full",
  filter: "all",
  filters: [...ORDER_FILTERS],
  sort: "stage",
  max_items: 5,
  show_progress: true,
  details: [...ORDER_DETAILS],
  allow_hide: true,
} as const;

const matches = (order: Order, filter: string): boolean =>
  filter === "all" || orderGroup(order) === filter;

/** The full orders list: filters, journey bar, expandable details and actions. */
export class AllegroOrdersSection extends AllegroBaseCard<OrdersSectionConfig> {
  @state() private _filter?: string;

  @state() private _open?: string;

  @state() private _pages = 1;

  @state() private _showHidden = false;

  /** Which edges of the filter row can still scroll (and fade out). */
  @state() private _fade = { start: false, end: false };

  private _resizeObserver?: ResizeObserver;

  private _observedRow?: HTMLElement;

  private get _cfg() {
    return { ...ORDERS_DEFAULTS, ...this._config };
  }

  override setConfig(config: OrdersSectionConfig): void {
    super.setConfig(config);
    this._filter = undefined;
    this._pages = 1;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // updated() (re)attaches the resize observer dropped on disconnect.
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._observedRow = undefined;
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    const row = this.renderRoot.querySelector<HTMLElement>(".filters");
    if (!row) return;
    // The card's width decides whether the chips fit, so re-measure on resize.
    if (row !== this._observedRow) {
      this._resizeObserver ??= new ResizeObserver(() => this._measureFilters());
      this._resizeObserver.disconnect();
      this._resizeObserver.observe(row);
      this._observedRow = row;
    }
    // Keep the selected chip in view (clear of the fades) when the filter or
    // config changes; not on every update, or it would undo the user's scrolling.
    if (changed.has("_filter") || changed.has("_config")) {
      const chip = row.querySelector<HTMLElement>(".chip.selected");
      const fade = 32;
      if (chip && chip.offsetLeft - fade < row.scrollLeft) {
        row.scrollLeft = chip.offsetLeft - fade;
      } else if (chip && chip.offsetLeft + chip.offsetWidth + fade > row.scrollLeft + row.clientWidth) {
        row.scrollLeft = chip.offsetLeft + chip.offsetWidth + fade - row.clientWidth;
      }
    }
    this._measureFilters();
  }

  private _measureFilters(): void {
    const row = this.renderRoot.querySelector<HTMLElement>(".filters");
    if (!row) return;
    const start = row.scrollLeft > 1;
    const end = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    // Only assign on change: this runs from updated(), so it must settle.
    if (start !== this._fade.start || end !== this._fade.end) this._fade = { start, end };
  }

  private get _activeFilter(): string {
    return this._filter ?? String(this._cfg.filter);
  }

  private _sorted(orders: Order[]): Order[] {
    return this._cfg.sort === "stage" ? sortByStage(orders) : orders;
  }

  protected override render() {
    if (!this._config || !this._hass) return nothing;
    return this._renderContent();
  }

  private _renderContent() {
    const hass = this._hass!;
    const orders = this._orders;
    const filter = this._activeFilter;
    const visible = this._sorted(orders.filter((order) => matches(order, filter)));
    const limit = Number(this._cfg.max_items) * this._pages;
    const shown = visible.slice(0, limit);
    const hidden = this._hiddenOrders;
    const hiddenShown = this._showHidden
      ? this._sorted(hidden.filter((order) => matches(order, filter)))
      : [];
    let body: TemplateResult;
    if (!orders.length && !hiddenShown.length) {
      body = html`<div class="message center">
        <ha-icon icon="mdi:package-variant-closed-check"></ha-icon>${t(hass, "empty")}
      </div>`;
    } else if (!shown.length && !hiddenShown.length) {
      const label = t(hass, `filter_${filter}` as StringKey);
      body = html`<div class="message center">
        <ha-icon icon="mdi:tray-remove"></ha-icon>${t(hass, "empty_filter", { filter: label })}
      </div>`;
    } else {
      body = html`<div class="list">
        ${repeat(
          shown,
          (order) => order.key,
          (order) => this._renderOrder(order, false),
        )}
        ${repeat(
          hiddenShown,
          (order) => order.key,
          (order) => this._renderOrder(order, true),
        )}
      </div>`;
    }
    return html`${this._renderFilters(orders)} ${body}
    ${visible.length > shown.length
      ? html`<div class="actions">
          <button class="button" @click=${() => (this._pages += 1)}>
            <ha-icon icon="mdi:chevron-down"></ha-icon><span>${t(hass, "show_more")}</span>
          </button>
        </div>`
      : nothing}
    ${hidden.length
      ? html`<div class="hidden-note">
          <ha-icon icon="mdi:eye-off-outline"></ha-icon>
          <span>${plural(hass, "hidden", hidden.length)}</span> ·
          <button class="text-button" @click=${() => (this._showHidden = !this._showHidden)}>
            ${t(hass, this._showHidden ? "hide_hidden" : "show_hidden")}
          </button>
        </div>`
      : nothing}`;
  }

  private _renderFilters(orders: Order[]) {
    const filters = this._cfg.filters as readonly string[];
    // Nothing to filter: a row of zeros is just noise.
    if (!filters.length || (!orders.length && !this._hiddenOrders.length)) return nothing;
    const hass = this._hass!;
    const counts = countGroups(orders);
    const chips = filters
      .filter((filter) => filter !== "problem" || counts.problem > 0 || filter === this._activeFilter)
      .map((filter) => {
        const selected = filter === this._activeFilter;
        const count = counts[filter as keyof typeof counts] ?? 0;
        const alert = filter === "problem" && count > 0;
        return html`<button
          class="chip ${selected ? "selected" : ""}"
          style=${alert ? `--c: ${rgb("red")}` : ""}
          aria-pressed=${String(selected)}
          @click=${() => {
            this._filter = filter;
            this._pages = 1;
            this._open = undefined;
          }}
        >
          <span>${t(hass, `filter_${filter}` as StringKey)}</span>
          <span class="count ${alert ? "alert" : ""}">${formatNumber(hass, count)}</span>
        </button>`;
      });
    return html`<div
      class="chips filters ${this._fade.start ? "fade-start" : ""} ${this._fade.end ? "fade-end" : ""}"
      @scroll=${() => this._measureFilters()}
    >
      ${chips}
    </div>`;
  }

  private _renderOrder(order: Order, hidden: boolean) {
    const def = statusDef(order.status);
    const open = this._open === order.key;
    const toggle = () => {
      this._open = open ? undefined : order.key;
    };
    const title = order.offers[0] ?? order.seller;
    const pickupCode = orderGroup(order) === "pickup" ? order.pickupCode : undefined;
    return html`<div
      class="row ${open ? "open" : ""} ${hidden ? "is-hidden" : ""}"
      style="--c: ${rgb(def.color)}"
    >
      <div
        class="state-item clickable"
        role="button"
        tabindex="0"
        aria-expanded=${String(open)}
        @click=${toggle}
        @keydown=${onActivate(toggle)}
      >
        <div class="shape" title=${this._statusLabel(order)}>
          <ha-icon .icon=${hidden ? "mdi:eye-off-outline" : def.icon}></ha-icon>
        </div>
        <div class="info">
          <span class="primary" title=${order.offers.join("\n")}
            >${title}${order.offers.length > 1
              ? html` <span class="more">+${order.offers.length - 1}</span>`
              : nothing}</span
          >
          <span class="secondary"
            ><b class="status">${this._statusLabel(order)}</b>${atOtherPoint(order)
              ? html` · <span class="warn">${t(this._hass, "other_point_short")}</span>`
              : nothing}${order.pickupDeadline && orderGroup(order) === "pickup" && !open
              ? html` · ${renderDeadline(this._hass!, order.pickupDeadline, "relative")}`
              : order.seller
                ? ` · ${order.seller}`
                : nothing}</span
          >
          ${this._cfg.show_progress && !hidden && !open ? renderSegments(order) : nothing}
        </div>
        ${pickupCode && !open ? html`<span class="row-code">${renderCode(pickupCode)}</span>` : nothing}
        <ha-icon class="chevron" icon="mdi:chevron-down"></ha-icon>
      </div>
      ${open ? this._renderDetails(order, hidden) : nothing}
    </div>`;
  }

  private _renderStepper(order: Order) {
    const hass = this._hass!;
    const def = statusDef(order.status);
    return html`<ol class="stepper">
      ${orderStages(order).map(
        (stage, index) => html`<li
          class="${index < def.stage ? "done" : ""} ${index === def.stage ? "current" : ""}"
        >
          <span class="dot"><ha-icon .icon=${STAGE_ICONS[stage]}></ha-icon></span>
          <span class="step-label">${t(hass, `stage_${stage}` as StringKey)}</span>
        </li>`,
      )}
    </ol>`;
  }

  private _renderDetails(order: Order, hidden: boolean) {
    const hass = this._hass!;
    const show = new Set(this._cfg.details as readonly string[]);
    const rows: [StringKey, unknown][] = [];
    if (show.has("items") && order.offers.length) {
      rows.push([
        "detail_items",
        order.offers.length > 1
          ? html`<ul class="items">
              ${order.offers.map((offer) => html`<li>${offer}</li>`)}
            </ul>`
          : order.offers[0],
      ]);
    }
    if (show.has("seller") && order.seller) rows.push(["detail_seller", order.seller]);
    if (show.has("delivery") && order.deliveryName) rows.push(["detail_delivery", order.deliveryName]);
    const tracking = order.delivery?.details ?? order.delivery?.description;
    if (show.has("tracking") && tracking) {
      rows.push(["detail_tracking", html`<span class="pre">${tracking}</span>`]);
    }
    const point = order.pickupPoint;
    if (show.has("pickup_point") && point) {
      rows.push([
        "detail_pickup_point",
        html`${[point.name, point.id && !point.name?.includes(point.id) ? `(${point.id})` : ""]
          .filter(Boolean)
          .join(" ")}${point.description ? html`<br /><span class="muted">${point.description}</span>` : nothing}${point.address
          ? html`<br />${point.address}`
          : nothing}`,
      ]);
    }
    if (show.has("pickup_point") && atOtherPoint(order)) {
      rows.push(["detail_other_point", html`<span class="warn">${t(hass, "other_point")}</span>`]);
    }
    if (show.has("pickup_deadline") && order.pickupDeadline) {
      rows.push(["detail_pickup_deadline", renderDeadline(hass, order.pickupDeadline, "date")]);
    }
    if (show.has("pickup_code") && order.pickupCode) {
      rows.push(["detail_pickup_code", renderCode(order.pickupCode)]);
    }
    if (show.has("pickup_code") && order.phone) rows.push(["detail_phone", order.phone]);
    const maps = mapsUrl(point);
    const code = order.pickupCode;
    return html`<div class="details">
      ${this._cfg.show_progress ? this._renderStepper(order) : nothing}
      ${rows.length
        ? html`<dl>${rows.map(([key, value]) => html`<dt>${t(hass, key)}</dt><dd>${value}</dd>`)}</dl>`
        : nothing}
      <div class="actions">
        ${order.trackingUrl
          ? linkButton(order.trackingUrl, "mdi:map-search-outline", t(hass, "track"), "accent")
          : nothing}
        ${maps ? linkButton(maps, "mdi:directions", t(hass, "navigate")) : nothing}
        ${code
          ? html`<button class="button" title=${t(hass, "copy_code")} @click=${() => this._copy(code)}>
              <ha-icon icon="mdi:content-copy"></ha-icon><span class="label">${t(hass, "copy_code")}</span>
            </button>`
          : nothing}
        ${!order.trackingUrl && !maps
          ? linkButton(ALLEGRO_URL.orders, "mdi:open-in-new", t(hass, "open_allegro"))
          : nothing}
        ${this._cfg.allow_hide || hidden
          ? html`<button
              class="button"
              title=${hidden ? t(hass, "restore") : t(hass, "hide_title")}
              @click=${() => this._setHidden(order, !hidden)}
            >
              <ha-icon icon=${hidden ? "mdi:eye-outline" : "mdi:check"}></ha-icon
              ><span class="label">${hidden ? t(hass, "restore") : t(hass, "hide")}</span>
            </button>`
          : nothing}
      </div>
    </div>`;
  }

  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        container: allegro / inline-size;
      }
      .filters {
        --chip-height: var(--mush-chip-height, 32px);
        position: relative; /* chips' offsetLeft is measured from the row */
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
        padding: calc(var(--spacing) / 2) var(--spacing) 0;
      }
      .filters::-webkit-scrollbar {
        display: none;
      }
      /* Fade the edges the row can still scroll towards. */
      .filters.fade-end {
        mask-image: linear-gradient(to right, black calc(100% - 32px), transparent);
      }
      .filters.fade-start {
        mask-image: linear-gradient(to right, transparent, black 32px);
      }
      .filters.fade-start.fade-end {
        mask-image: linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent);
      }
      .filters .chip {
        padding-inline: 0.45em 0.3em;
        gap: 0.25em;
      }
      .filters .chip span {
        font-size: var(--card-secondary-font-size);
        font-weight: var(--card-primary-font-weight);
      }
      .filters .chip .count {
        min-width: 1.6em;
        padding: 0.3em 0.45em;
        box-sizing: border-box;
        border-radius: 1em;
        text-align: center;
        font-size: 11px;
        background-color: rgba(var(--rgb-text), 0.08);
      }
      .filters .chip.selected .count {
        background-color: rgba(var(--c, var(--rgb-allegro)), 0.2);
      }
      .filters .chip .count.alert {
        color: white;
        background-color: rgb(var(--rgb-red));
      }
      .row .status {
        font-weight: 500;
        color: rgb(var(--c));
      }
      .warn {
        font-weight: 500;
        color: rgb(var(--rgb-amber));
      }
      .pre {
        white-space: pre-line;
      }
      .secondary .deadline ha-icon {
        --mdc-icon-size: 13px;
      }
      .row.is-hidden {
        opacity: 0.6;
      }
      .more {
        padding: 0 6px;
        border-radius: 8px;
        font-size: 11px;
        color: var(--secondary-text-color);
        background-color: var(--tint);
      }
      .row-code {
        flex: none;
        font-size: 13px;
        color: rgb(var(--c));
      }
      .chevron {
        --mdc-icon-size: 20px;
        flex: none;
        color: var(--secondary-text-color);
        transition: transform 180ms ease-in-out;
      }
      .row.open .chevron {
        transform: rotate(180deg);
      }
      .details {
        display: flex;
        flex-direction: column;
        gap: var(--spacing);
        padding: 0 calc(var(--spacing) / 2) calc(var(--spacing) / 2);
      }
      .details dl {
        padding-inline-start: calc(var(--icon-size) + var(--spacing));
      }
      .items {
        margin: 0;
        padding-inline-start: 1.1em;
      }
      .details .actions {
        padding: 0;
        gap: calc(var(--spacing) / 2);
        flex-wrap: wrap;
      }
      .details .button {
        --control-height: 36px;
      }
      .details .button .label {
        display: none;
      }
      @container allegro (min-width: 380px) {
        .details .button .label {
          display: inline;
        }
      }
      /* Journey stepper: icon dots joined by a line, filled up to the stage. */
      .stepper {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
      }
      .stepper li {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }
      .stepper li + li::before {
        content: "";
        position: absolute;
        top: 13px;
        right: calc(50% + 16px);
        left: calc(-50% + 16px);
        height: 2px;
        border-radius: 1px;
        background-color: rgba(var(--c), 0.2);
      }
      .stepper li.done + li::before {
        background-color: rgb(var(--c));
      }
      .stepper .dot {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(var(--rgb-text), 0.35);
        background-color: var(--tint);
      }
      .stepper .dot ha-icon {
        --mdc-icon-size: 16px;
        display: flex;
      }
      .stepper li.done .dot {
        color: rgb(var(--c));
        background-color: rgba(var(--c), 0.2);
      }
      .stepper li.current .dot {
        color: white;
        background-color: rgb(var(--c));
        box-shadow: 0 0 0 4px rgba(var(--c), 0.2);
      }
      .step-label {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        color: var(--secondary-text-color);
      }
      .stepper li.current .step-label {
        font-weight: 600;
        color: rgb(var(--c));
      }
      .list + .actions {
        padding-top: 0;
      }
      .hidden-note {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 var(--spacing) var(--spacing);
        font-size: var(--card-secondary-font-size);
        color: var(--secondary-text-color);
      }
      .hidden-note ha-icon {
        --mdc-icon-size: 16px;
        display: flex;
      }
    `,
  ];
}
