import { css, html, nothing } from "lit";
import { state } from "lit/decorators.js";
import { live } from "lit/directives/live.js";

import { AllegroBaseCard, type AllegroCardConfig } from "./base-card";
import { type CartItem, parseOfferId, photoAt } from "./cart";
import { ALLEGRO_URL, DOMAIN, ENTITY } from "./const";
import { formatMoney } from "./format";
import { t } from "./i18n";
import { baseStyles } from "./styles";

export interface CartOptions {
  /** `summary`: one row drawn by the card itself; `list` / `grid`: this section. */
  style?: "summary" | "list" | "grid";
  show_unselected?: boolean;
  max_items?: number;
  show_add?: boolean;
}

export type CartSectionConfig = AllegroCardConfig & CartOptions;

export const CART_DEFAULTS = {
  style: "summary",
  show_unselected: true,
  max_items: 8,
  show_add: true,
} as const;

/** The cart's lines (as a list or photo tiles), the total and the "add to cart" field. */
export class AllegroCartSection extends AllegroBaseCard<CartSectionConfig> {
  @state() private _showAll = false;

  @state() private _input = "";

  @state() private _quantity = 1;

  @state() private _adding = false;

  @state() private _addError?: string;

  private get _cfg() {
    return { ...CART_DEFAULTS, ...this._config };
  }

  // Only the cart sensor matters here (hidden orders don't).
  protected override _watchedEntityIds(): string[] {
    const cart = this._entities[ENTITY.cart];
    return cart ? [cart] : [];
  }

  protected override render() {
    if (!this._config || !this._hass) return nothing;
    const hass = this._hass;
    const cart = this._cart;
    if (!cart) return this._renderOffline(false);
    const selected = cart.items.filter((item) => item.selected).length;
    return html`${cart.items.length
      ? this._renderItems(cart.items)
      : html`<div class="message"><ha-icon icon="mdi:cart-outline"></ha-icon>${t(hass, "cart_empty")}</div>`}
    ${cart.items.length && selected
      ? html`<div class="total">
          <span>${t(hass, "to_pay")}</span>
          <b>${formatMoney(hass, cart.total, cart.currency)}</b>
        </div>`
      : nothing}
    ${this._cfg.show_add ? this._renderAdd() : nothing}`;
  }

  private _renderItems(all: CartItem[]) {
    const hass = this._hass!;
    const items = this._cfg.show_unselected ? all : all.filter((item) => item.selected);
    if (!items.length) return nothing;
    const max = Number(this._cfg.max_items);
    const shown = max > 0 && !this._showAll ? items.slice(0, max) : items;
    const grid = this._cfg.style === "grid";
    return html`<div class=${grid ? "grid" : "items"}>
        ${shown.map((item) => (grid ? this._renderTile(item) : this._renderItem(item)))}
      </div>
      ${shown.length < items.length
        ? html`<div class="actions">
            <button class="button" @click=${() => (this._showAll = true)}>
              <ha-icon icon="mdi:chevron-down"></ha-icon
              ><span>${t(hass, "show_all", { n: items.length })}</span>
            </button>
          </div>`
        : nothing}`;
  }

  private _thumb(item: CartItem, width: 128 | 360) {
    const src = photoAt(item.photoUrl, width);
    return html`<span class="thumb">
      ${src
        ? html`<img
            src=${src}
            alt=""
            loading="lazy"
            @error=${(ev: Event) => {
              // Fall back to the size the integration gave us.
              const img = ev.target as HTMLImageElement;
              if (item.photoUrl && img.src !== item.photoUrl) img.src = item.photoUrl;
            }}
          />`
        : html`<ha-icon icon="mdi:image-off-outline"></ha-icon>`}
      ${item.selected
        ? html`<span class="tick"><ha-icon icon="mdi:check-bold"></ha-icon></span>`
        : nothing}
      ${item.quantity > 1 ? html`<span class="qty">×${item.quantity}</span>` : nothing}
    </span>`;
  }

  private _renderItem(item: CartItem) {
    const hass = this._hass!;
    const each =
      item.quantity > 1
        ? t(hass, "each", {
            qty: item.quantity,
            price: formatMoney(hass, item.unitPrice, item.currency),
          })
        : undefined;
    const secondary = [item.selected ? undefined : t(hass, "not_selected"), item.seller, each]
      .filter(Boolean)
      .join(" · ");
    return html`<a
      class="item ${item.selected ? "" : "unselected"}"
      href=${item.url ?? ALLEGRO_URL.cart}
      target="_blank"
      rel="noopener noreferrer"
      title=${item.name}
    >
      ${this._thumb(item, 128)}
      <span class="info">
        <span class="name">${item.name}</span>
        <span class="secondary">${secondary}</span>
      </span>
      <span class="price">${formatMoney(hass, item.price, item.currency)}</span>
    </a>`;
  }

  private _renderTile(item: CartItem) {
    const hass = this._hass!;
    return html`<a
      class="tile ${item.selected ? "" : "unselected"}"
      href=${item.url ?? ALLEGRO_URL.cart}
      target="_blank"
      rel="noopener noreferrer"
      title=${`${item.name} — ${item.seller}`}
    >
      ${this._thumb(item, 360)}
      <span class="price">${formatMoney(hass, item.price, item.currency)}</span>
      <span class="name">${item.name}</span>
    </a>`;
  }

  private _renderAdd() {
    const hass = this._hass!;
    return html`<form class="add" @submit=${this._submit}>
        <div class="field">
          <ha-icon icon="mdi:link-variant"></ha-icon>
          <input
            type="text"
            inputmode="url"
            autocomplete="off"
            enterkeyhint="send"
            placeholder=${t(hass, "add_placeholder")}
            aria-label=${t(hass, "add_placeholder")}
            .value=${this._input}
            @input=${(ev: InputEvent) => {
              this._input = (ev.target as HTMLInputElement).value;
              this._addError = undefined;
            }}
          />
          <input
            class="qty-input"
            type="number"
            min="1"
            max="99"
            title=${t(hass, "quantity")}
            aria-label=${t(hass, "quantity")}
            .value=${live(String(this._quantity))}
            @change=${(ev: Event) => {
              const value = Number.parseInt((ev.target as HTMLInputElement).value, 10);
              this._quantity = Number.isFinite(value) ? Math.min(99, Math.max(1, value)) : 1;
            }}
          />
        </div>
        <button
          class="button filled"
          type="submit"
          title=${t(hass, "add")}
          aria-label=${t(hass, "add")}
          ?disabled=${this._adding || !this._input.trim()}
        >
          <ha-icon icon=${this._adding ? "mdi:loading" : "mdi:cart-plus"}></ha-icon>
        </button>
      </form>
      ${this._addError ? html`<div class="add-error">${this._addError}</div>` : nothing}`;
  }

  private async _submit(ev: Event): Promise<void> {
    ev.preventDefault();
    const hass = this._hass;
    if (!hass || this._adding) return;
    const itemId = parseOfferId(this._input);
    if (!itemId) {
      this._addError = t(hass, "add_invalid");
      return;
    }
    this._adding = true;
    this._addError = undefined;
    try {
      await hass.callService(
        DOMAIN,
        "add_to_cart",
        { item_id: itemId, quantity: this._quantity, config_entry_id: this._entryId },
        undefined,
        false,
      );
      this._input = "";
      this._quantity = 1;
      this._toast(t(hass, "added"));
    } catch (err: any) {
      this._addError = err?.message || t(hass, "add_failed", { error: String(err) });
    } finally {
      this._adding = false;
    }
  }

  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        container: allegro / inline-size;
      }
      .items {
        display: flex;
        flex-direction: column;
        padding: 0 calc(var(--spacing) / 2) calc(var(--spacing) / 2);
      }
      .item {
        display: flex;
        align-items: center;
        gap: var(--spacing);
        padding: 6px calc(var(--spacing) / 2);
        border-radius: var(--control-border-radius);
        color: inherit;
        text-decoration: none;
      }
      .item:hover,
      .tile:hover {
        background-color: var(--tint);
      }
      .unselected .thumb,
      .unselected .name,
      .unselected .price {
        opacity: 0.55;
      }
      .item .info {
        gap: 2px;
      }
      .name {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: var(--card-primary-font-size);
        line-height: 18px;
      }
      .item .secondary {
        color: var(--secondary-text-color);
      }
      .item .price {
        flex: none;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .tick {
        position: absolute;
        z-index: 1;
        top: -5px;
        left: -5px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        background-color: rgb(var(--rgb-allegro));
        box-shadow: 0 0 0 2px var(--card-background-color, #fff);
      }
      .tick ha-icon {
        --mdc-icon-size: 12px;
        display: flex;
      }
      .qty {
        position: absolute;
        z-index: 1;
        right: -5px;
        bottom: -5px;
        padding: 0 5px;
        border-radius: 9px;
        font-size: 11px;
        font-weight: 700;
        line-height: 18px;
        color: var(--card-background-color, #fff);
        background-color: var(--primary-text-color);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
        gap: calc(var(--spacing) / 2);
        padding: 0 var(--spacing) var(--spacing);
      }
      .tile {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        padding: 6px;
        border-radius: var(--control-border-radius);
        color: inherit;
        text-decoration: none;
      }
      .tile .thumb {
        --thumb-size: auto;
        width: 100%;
        aspect-ratio: 1;
        height: auto;
      }
      .tile .price {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .tile .name {
        font-size: var(--card-secondary-font-size);
        line-height: 15px;
        color: var(--secondary-text-color);
      }
      .total {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--spacing);
        margin: 0 var(--spacing);
        padding: var(--spacing) 0;
        border-top: 1px solid var(--divider-color);
        font-size: var(--card-secondary-font-size);
        color: var(--secondary-text-color);
      }
      .total b {
        font-size: 20px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }
      .add {
        display: flex;
        gap: calc(var(--spacing) / 2);
        padding: 0 var(--spacing) var(--spacing);
      }
      .field {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        height: var(--control-height);
        padding: 0 6px 0 12px;
        box-sizing: border-box;
        border-radius: var(--control-border-radius);
        background-color: var(--tint);
      }
      .field:focus-within {
        box-shadow: inset 0 0 0 2px rgba(var(--rgb-allegro), 0.6);
      }
      .field ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
        display: flex;
        color: var(--secondary-text-color);
      }
      .field input {
        flex: 1;
        min-width: 0;
        height: 100%;
        margin: 0;
        padding: 0;
        border: none;
        outline: none;
        font: inherit;
        font-size: var(--card-primary-font-size);
        color: var(--primary-text-color);
        background: none;
      }
      .field input::placeholder {
        color: var(--secondary-text-color);
      }
      .field .qty-input {
        -moz-appearance: textfield;
        appearance: textfield;
        flex: none;
        width: 44px;
        height: 30px;
        border-radius: 8px;
        text-align: center;
        background-color: var(--card-background-color, #fff);
      }
      .field .qty-input::-webkit-inner-spin-button,
      .field .qty-input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .add .button {
        flex: none;
        width: var(--control-height);
        padding: 0;
      }
      .add .button ha-icon[icon="mdi:loading"] {
        animation: spin 1s linear infinite;
      }
      .add-error {
        margin-top: calc(var(--spacing) / -2);
        padding: 0 var(--spacing) var(--spacing);
        font-size: var(--card-secondary-font-size);
        color: rgb(var(--rgb-red));
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ];
}
