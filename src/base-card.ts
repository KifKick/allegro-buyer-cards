import { html, LitElement, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";

import { type Cart, parseCart } from "./cart";
import { type Color, DEADLINE_URGENT_HOURS, DOMAIN, ENTITY, STAGES, STALE_AFTER_MINUTES } from "./const";
import {
  configEntryId,
  deviceName,
  type EntityMap,
  resolveDevice,
  resolveEntities,
} from "./discovery";
import { formatDateTime, formatRelative, isUnavailable } from "./format";
import {
  type DeviceRegistryEntry,
  fireEvent,
  type HassEntity,
  type HomeAssistant,
  type LovelaceCardConfig,
} from "./ha-types";
import { subscribeHidden, updateHidden } from "./hidden";
import { statusLabel, t } from "./i18n";
import { parseThreads, type Thread } from "./messages";
import { groupCode, humanizeStatus, type Order, parseOrders, statusDef } from "./orders";

export interface AllegroCardConfig extends LovelaceCardConfig {
  device_id?: string;
}

export const rgb = (color: Color): string => `var(--rgb-${color})`;

/** Keyboard activation for non-button elements with role="button". */
export const onActivate =
  (handler: () => void) =>
  (ev: KeyboardEvent): void => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      handler();
    }
  };

/** HA's form elements load lazily; borrow a built-in card editor to load them. */
export const loadHaForm = async (): Promise<void> => {
  if (customElements.get("ha-form")) return;
  const helpers = await (window as any).loadCardHelpers?.();
  const card = await helpers?.createCardElement({ type: "tile", entity: "sun.sun" });
  await card?.constructor?.getConfigElement?.();
};

/** The four-segment journey bar, filled up to the order's stage. */
export const renderSegments = (order: Order): TemplateResult => {
  const def = statusDef(order.status);
  return html`<div class="segments" aria-hidden="true">
    ${STAGES.map((_, index) => html`<i class=${index <= def.stage ? "on" : ""}></i>`)}
  </div>`;
};

/** A pickup code, grouped in threes for reading it out at the locker. */
export const renderCode = (code: string): TemplateResult => {
  return html`<span class="code">${groupCode(code).map((group) => html`<span>${group}</span>`)}</span>`;
};

export const isUrgent = (deadline: number, now = Date.now()): boolean =>
  deadline - now < DEADLINE_URGENT_HOURS * 3_600_000;

/**
 * A pickup deadline, red in its last day: `full` "Pick up by Thu 16.10, 23:59 · in 2 days",
 * `date` without the "Pick up by" (under a caption that says it), `relative` "in 2 days".
 */
export const renderDeadline = (
  hass: HomeAssistant,
  deadline: number,
  mode: "full" | "date" | "relative" = "full",
): TemplateResult => {
  const when = formatDateTime(hass, deadline);
  const left = formatRelative(hass, deadline);
  const label = t(hass, deadline < Date.now() ? "deadline_passed" : "deadline", { when });
  const text = mode === "relative" ? left : `${mode === "date" ? when : label} · ${left}`;
  return html`<span class="deadline ${isUrgent(deadline) ? "urgent" : ""}" title=${`${label} (${left})`}
    ><ha-icon icon="mdi:timer-sand"></ha-icon><span>${text}</span></span
  >`;
};

/** An external link styled as a button (opens in a new tab, or the browser in the app). */
export const linkButton = (
  href: string,
  icon: string,
  label: string,
  extraClass = "",
): TemplateResult =>
  html`<a
    class="button ${extraClass}"
    href=${href}
    target="_blank"
    rel="noopener noreferrer"
    title=${label}
    @click=${(ev: Event) => ev.stopPropagation()}
    ><ha-icon .icon=${icon}></ha-icon><span class="label">${label}</span></a
  >`;

/**
 * Shared plumbing: account/entity resolution, the hidden-orders store, and
 * re-rendering only when this card's own entities change. HA sets `hass` on
 * every state change in the whole system, so a plain reactive property would
 * re-render constantly.
 */
export abstract class AllegroBaseCard<C extends AllegroCardConfig> extends LitElement {
  /** Set by HA ("grid" in sections views); reflected so styles can fill the cell. */
  @property({ reflect: true }) layout?: string;

  @state() protected _config?: C;

  @state() protected _hidden: ReadonlySet<string> = new Set();

  protected _hass?: HomeAssistant;

  private _unsubscribeHidden?: () => void;

  /** Deadlines and "2 hours ago" move with the clock, not only with the data. */
  private _clock?: number;

  set hass(hass: HomeAssistant) {
    const previous = this._hass;
    this._hass = hass;
    this.toggleAttribute("dark-mode", Boolean(hass.themes?.darkMode));
    if (
      !previous ||
      previous.entities !== hass.entities ||
      previous.devices !== hass.devices ||
      previous.locale !== hass.locale ||
      this._watchedEntityIds().some((id) => previous.states[id] !== hass.states[id])
    ) {
      this.requestUpdate();
    }
    this._subscribeHidden();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  setConfig(config: C): void {
    this._config = config;
  }

  /** Sections get their config from the card; it's a new object only when the card's changes. */
  set sectionConfig(config: C) {
    if (config !== this._config) this.setConfig(config);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._subscribeHidden();
    this._clock ??= window.setInterval(() => this.requestUpdate(), 60_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribeHidden?.();
    this._unsubscribeHidden = undefined;
    window.clearInterval(this._clock);
    this._clock = undefined;
  }

  private _subscribeHidden(): void {
    if (this._unsubscribeHidden || !this._hass || !this.isConnected) return;
    this._unsubscribeHidden = subscribeHidden(this._hass, (hidden) => {
      this._hidden = hidden;
    });
  }

  /** Entity ids whose state changes should re-render the card. */
  protected _watchedEntityIds(): string[] {
    return Object.values(this._entities);
  }

  protected get _device(): DeviceRegistryEntry | undefined {
    return this._hass ? resolveDevice(this._hass, this._config?.device_id) : undefined;
  }

  protected get _entryId(): string | undefined {
    const device = this._device;
    return device ? configEntryId(device) : undefined;
  }

  protected get _deviceName(): string {
    const device = this._device;
    return device ? deviceName(device) : "Allegro";
  }

  protected get _entities(): EntityMap {
    const device = this._device;
    return device && this._hass ? resolveEntities(this._hass, device.id) : {};
  }

  protected _stateObj(key: string): HassEntity | undefined {
    const entityId = this._entities[key];
    return entityId ? this._hass?.states[entityId] : undefined;
  }

  /** The orders sensor is missing or has no data (integration down, session expired). */
  protected get _offline(): boolean {
    return isUnavailable(this._stateObj(ENTITY.inProgress));
  }

  /** Every order Allegro lists as not yet delivered. */
  protected get _allOrders(): Order[] {
    return parseOrders(this._stateObj(ENTITY.inProgress));
  }

  /** Hidden orders are stored per account: `<config entry id>:<order key>`. */
  private get _hiddenPrefix(): string {
    return `${this._entryId ?? ""}:`;
  }

  /** The orders the user hasn't hidden. */
  protected get _orders(): Order[] {
    const prefix = this._hiddenPrefix;
    return this._allOrders.filter((order) => !this._hidden.has(prefix + order.key));
  }

  protected get _hiddenOrders(): Order[] {
    const prefix = this._hiddenPrefix;
    return this._allOrders.filter((order) => this._hidden.has(prefix + order.key));
  }

  /** The cart, unless its sensor has no data (then it isn't "empty", it's unknown). */
  protected get _cart(): Cart | undefined {
    const stateObj = this._stateObj(ENTITY.cart);
    return isUnavailable(stateObj) ? undefined : parseCart(stateObj);
  }

  /** Unread threads, newest first (as the integration lists them). */
  protected get _threads(): Thread[] {
    return parseThreads(this._stateObj(ENTITY.messages)).filter((thread) => !thread.read);
  }

  /** Recent threads with an invoice, read or not. */
  protected get _invoices(): Thread[] {
    return parseThreads(this._stateObj(ENTITY.invoices));
  }

  /** The last successful refresh, when it's later than it should be (session expired, Allegro down). */
  protected get _staleSince(): number | undefined {
    const stateObj = this._stateObj(ENTITY.lastUpdate);
    if (isUnavailable(stateObj)) return undefined;
    const last = Date.parse(stateObj!.state);
    return !Number.isNaN(last) && Date.now() - last > STALE_AFTER_MINUTES * 60_000 ? last : undefined;
  }

  /** Calls an Allegro service on this card's account; failures end up in a toast. */
  protected async _callAllegro(
    service: string,
    data: Record<string, unknown>,
    returnResponse = false,
  ): Promise<any> {
    if (!this._hass) return undefined;
    try {
      return await this._hass.callService(
        DOMAIN,
        service,
        { ...data, config_entry_id: this._entryId },
        undefined,
        false,
        returnResponse,
      );
    } catch (err: any) {
      this._toast(t(this._hass, "action_failed", { error: String(err?.message ?? err) }));
      return undefined;
    }
  }

  /** Presses one of the integration's buttons (by translation key). */
  protected async _press(key: string): Promise<boolean> {
    const entityId = this._entities[key];
    if (!this._hass || !entityId) return false;
    try {
      await this._hass.callService("button", "press", { entity_id: entityId }, undefined, false);
      return true;
    } catch (err: any) {
      this._toast(t(this._hass, "action_failed", { error: String(err?.message ?? err) }));
      return false;
    }
  }

  protected _statusLabel(order: Order): string {
    return statusLabel(this._hass, order.status, humanizeStatus);
  }

  protected _setHidden(order: Order, hidden: boolean): void {
    if (!this._hass) return;
    const prefix = this._hiddenPrefix;
    const current = new Set(this._allOrders.map((o) => prefix + o.key));
    updateHidden(this._hass, (set) => {
      if (hidden) set.add(prefix + order.key);
      else set.delete(prefix + order.key);
      // Forget this account's orders Allegro no longer lists (they can't show
      // again); other accounts' keys are theirs to prune.
      for (const key of set) if (key.startsWith(prefix) && !current.has(key)) set.delete(key);
    }).catch((err) => {
      console.warn("allegro-buyer-cards: couldn't save hidden orders", err);
      this._toast(String(err?.message ?? err));
    });
  }

  protected _moreInfo(entityId?: string): void {
    if (entityId) fireEvent(this, "hass-more-info", { entityId });
  }

  protected _toast(message: string): void {
    fireEvent(this, "hass-notification", { message });
  }

  protected async _copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this._toast(t(this._hass, "copied"));
    } catch {
      // No clipboard (plain http): show it so it can be read off or copied by hand.
      this._toast(value);
    }
  }

  /** The card-wide message for a missing account or missing data, if any. */
  protected _renderProblem(): TemplateResult | undefined {
    const hass = this._hass!;
    if (!this._device) {
      return html`<ha-card>
        <div class="message">
          <ha-icon icon="mdi:alert-circle-outline"></ha-icon>${t(hass, "no_device")}
        </div>
      </ha-card>`;
    }
    return undefined;
  }

  /** `titled: false` when the card's header already says the data is missing. */
  protected _renderOffline(titled = true): TemplateResult {
    const hass = this._hass!;
    return html`<div class="message">
      <ha-icon icon="mdi:cloud-off-outline"></ha-icon>
      <span>${titled ? html`<b>${t(hass, "offline")}</b><br />` : ""}${t(hass, "offline_hint")}</span>
    </div>`;
  }
}
