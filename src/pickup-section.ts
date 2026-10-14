import { css, html, nothing } from "lit";
import { state } from "lit/decorators.js";

import {
  AllegroBaseCard,
  type AllegroCardConfig,
  linkButton,
  renderCode,
  renderDeadline,
  renderSegments,
  rgb,
} from "./base-card";
import { t } from "./i18n";
import { atOtherPoint, deliveryNote, mapsUrl, type Order, orderGroup, statusDef } from "./orders";
import { renderQr } from "./qr";
import { baseStyles } from "./styles";

export interface PickupOptions {
  show_qr?: boolean;
  show_phone?: boolean;
  show_upcoming?: boolean;
  /** When the parcel has to be collected by (from Allegro's parcel list). */
  show_deadline?: boolean;
  /** Leave the section out of the card while nothing is waiting or on its way. */
  hide_when_empty?: boolean;
}

export type PickupSectionConfig = AllegroCardConfig & PickupOptions;

export const PICKUP_DEFAULTS = {
  show_qr: true,
  show_phone: true,
  show_upcoming: true,
  show_deadline: true,
  hide_when_empty: true,
} as const;

export const readyForPickup = (orders: Order[]): Order[] =>
  orders.filter((order) => orderGroup(order) === "pickup");

/** Parcels headed for a locker or pickup point that haven't arrived yet. */
export const upcomingPickups = (orders: Order[]): Order[] =>
  orders.filter(
    (order) => orderGroup(order) !== "pickup" && order.pickupPoint && statusDef(order.status).stage > 0,
  );

/** Parcels to pick up: the code, the QR code, the point and directions. */
export class AllegroPickupSection extends AllegroBaseCard<PickupSectionConfig> {
  /** The order whose QR code is shown full width. */
  @state() private _zoom?: string;

  private get _cfg() {
    return { ...PICKUP_DEFAULTS, ...this._config };
  }

  protected override render() {
    if (!this._config || !this._hass) return nothing;
    const ready = readyForPickup(this._orders);
    const upcoming = this._cfg.show_upcoming ? upcomingPickups(this._orders) : [];
    if (!ready.length && !upcoming.length) {
      return html`<div class="message">
        <ha-icon icon="mdi:package-variant-closed-check"></ha-icon>${t(this._hass, "nothing_to_pick_up")}
      </div>`;
    }
    return html`${ready.map((order) => this._renderParcel(order))}
    ${upcoming.length ? this._renderUpcoming(upcoming) : nothing}`;
  }

  private _renderParcel(order: Order) {
    const hass = this._hass!;
    const point = order.pickupPoint;
    const where = point?.name ?? order.deliveryName ?? t(hass, "pickup_point");
    const maps = mapsUrl(point);
    const showQr = this._cfg.show_qr && order.qrCode;
    const zoomed = showQr && this._zoom === order.key;
    const code = order.pickupCode;
    const toggleZoom = () => {
      this._zoom = zoomed ? undefined : order.key;
    };
    return html`<section class="parcel" style="--c: ${rgb("green")}">
      <div class="where">
        <ha-icon icon="mdi:map-marker-outline"></ha-icon>
        <div>
          <div class="point">${where}${point?.id && !where.includes(point.id)
            ? html` <span class="point-id">${point.id}</span>`
            : nothing}${atOtherPoint(order)
            ? html` <span class="other-point" title=${t(hass, "other_point")}
                ><ha-icon icon="mdi:map-marker-alert-outline"></ha-icon>${t(hass, "other_point_short")}</span
              >`
            : nothing}</div>
          ${point?.address ? html`<div class="muted">${point.address}</div>` : nothing}
          ${point?.description ? html`<div class="muted hint">${point.description}</div>` : nothing}
        </div>
      </div>
      ${zoomed
        ? html`<button
            class="qr-zoomed"
            title=${t(hass, "qr_zoom")}
            aria-label=${t(hass, "qr_zoom")}
            @click=${toggleZoom}
          >
            ${renderQr(order.qrCode!, t(hass, "pickup_code"))}
            ${code ? html`<span class="zoomed-code">${renderCode(code)}</span>` : nothing}
          </button>`
        : html`<div class="code-box">
            <div class="code-col">
              <span class="caption">${t(hass, "pickup_code")}</span>
              ${code
                ? html`<button
                    class="big-code"
                    title=${t(hass, "copy_code")}
                    aria-label=${`${t(hass, "copy_code")}: ${code}`}
                    @click=${() => this._copy(code)}
                  >
                    ${renderCode(code)}<ha-icon icon="mdi:content-copy"></ha-icon>
                  </button>`
                : html`<span class="big-code none">—</span>`}
              ${this._cfg.show_phone && order.phone
                ? html`<span class="phone">${t(hass, "phone", { phone: order.phone })}</span>`
                : nothing}
            </div>
            ${showQr
              ? html`<button
                  class="qr"
                  title=${t(hass, "qr_zoom")}
                  aria-label=${t(hass, "qr_zoom")}
                  @click=${toggleZoom}
                >
                  ${renderQr(order.qrCode!, t(hass, "pickup_code"))}
                </button>`
              : nothing}
          </div>`}
      ${this._cfg.show_deadline && order.pickupDeadline
        ? html`<div class="parcel-deadline">${renderDeadline(hass, order.pickupDeadline)}</div>`
        : nothing}
      <div class="what" title=${order.offers.join("\n")}>
        ${order.offers[0] ?? ""}${order.offers.length > 1
          ? ` +${order.offers.length - 1}`
          : ""}${order.seller ? html` · <span class="muted">${order.seller}</span>` : nothing}
      </div>
      ${maps || order.trackingUrl
        ? html`<div class="actions">
            ${maps ? linkButton(maps, "mdi:directions", t(hass, "navigate"), "accent") : nothing}
            ${order.trackingUrl
              ? linkButton(order.trackingUrl, "mdi:map-search-outline", t(hass, "track"))
              : nothing}
          </div>`
        : nothing}
    </section>`;
  }

  private _renderUpcoming(orders: Order[]) {
    const hass = this._hass!;
    return html`<div class="upcoming">
      <div class="section-title">${t(hass, "upcoming")}</div>
      ${orders.map((order) => {
        const def = statusDef(order.status);
        const note = deliveryNote(order);
        return html`<div class="state-item" style="--c: ${rgb(def.color)}">
          <div class="shape small"><ha-icon .icon=${def.icon}></ha-icon></div>
          <div class="info">
            <span class="primary">${order.pickupPoint?.name ?? order.deliveryName}</span>
            <span class="secondary" title=${order.delivery?.details ?? ""}
              >${this._statusLabel(order)} · ${note ?? order.offers[0] ?? order.seller}</span
            >
            ${renderSegments(order)}
          </div>
        </div>`;
      })}
    </div>`;
  }

  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        container: allegro / inline-size;
      }
      .parcel {
        display: flex;
        flex-direction: column;
        gap: var(--spacing);
        margin: 0 var(--spacing) var(--spacing);
        padding: var(--spacing);
        border-radius: var(--control-border-radius);
        background-color: rgba(var(--c), 0.08);
        box-shadow: inset 0 0 0 1px rgba(var(--c), 0.25);
      }
      .where {
        display: flex;
        gap: 8px;
        font-size: var(--card-secondary-font-size);
        line-height: var(--card-secondary-line-height);
      }
      .where > ha-icon {
        --mdc-icon-size: 20px;
        flex: none;
        color: rgb(var(--c));
      }
      .point {
        font-size: var(--card-primary-font-size);
        font-weight: var(--card-primary-font-weight);
        line-height: var(--card-primary-line-height);
      }
      .point-id {
        padding: 1px 6px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        color: rgb(var(--c));
        background-color: rgba(var(--c), 0.15);
      }
      .hint {
        font-size: 11px;
      }
      .other-point {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 1px 6px 1px 4px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        vertical-align: 1px;
        color: rgb(var(--rgb-amber));
        background-color: rgba(var(--rgb-amber), 0.15);
      }
      .other-point ha-icon {
        --mdc-icon-size: 14px;
        display: flex;
      }
      .parcel-deadline {
        font-size: var(--card-secondary-font-size);
      }
      .code-box {
        display: flex;
        align-items: center;
        gap: var(--spacing);
        padding: var(--spacing);
        border-radius: calc(var(--control-border-radius) - 2px);
        background-color: var(--card-background-color, #fff);
      }
      .code-col {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
      .caption {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .big-code {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0 -6px;
        padding: 2px 6px;
        border: none;
        border-radius: 8px;
        font: inherit;
        font-size: 28px;
        line-height: 36px;
        color: var(--primary-text-color);
        background: none;
        cursor: copy;
      }
      .big-code:hover {
        background-color: var(--tint);
      }
      .big-code ha-icon {
        --mdc-icon-size: 18px;
        display: flex;
        color: var(--secondary-text-color);
      }
      .big-code.none {
        cursor: default;
        color: var(--secondary-text-color);
      }
      .phone {
        font-size: var(--card-secondary-font-size);
        color: var(--secondary-text-color);
      }
      .qr,
      .qr-zoomed {
        flex: none;
        margin: 0;
        padding: 0;
        border: none;
        background: none;
        cursor: zoom-in;
        line-height: 0;
      }
      .qr .qr-img {
        width: 76px;
        height: 76px;
        border-radius: 6px;
        background: #fff;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
      }
      .qr-zoomed {
        align-self: center;
        width: min(100%, 280px);
        cursor: zoom-out;
      }
      .qr-zoomed {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        line-height: normal;
        color: var(--primary-text-color);
      }
      .zoomed-code {
        font-size: 24px;
      }
      .qr-zoomed .qr-img {
        width: 100%;
        height: auto;
        aspect-ratio: 1;
        border-radius: 8px;
        background: #fff;
      }
      .what {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-size: var(--card-secondary-font-size);
      }
      .parcel .actions {
        padding: 0;
        gap: calc(var(--spacing) / 2);
      }
      .parcel .button {
        --control-height: 36px;
      }
      .upcoming {
        padding-bottom: calc(var(--spacing) / 2);
      }
      .section-title {
        padding: 0 var(--spacing);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .upcoming .state-item {
        padding-block: calc(var(--spacing) / 2);
      }
      .shape.small {
        --icon-size: 32px;
      }
    `,
  ];
}
