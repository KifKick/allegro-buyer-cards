import { css, html, nothing } from "lit";
import { state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

import { AllegroBaseCard, type AllegroCardConfig, linkButton, onActivate, rgb } from "./base-card";
import { ALLEGRO_URL, ENTITY, MESSAGE_COLORS, MESSAGE_ICONS, SERVICE } from "./const";
import { formatDateTime, formatNumber, formatRelative } from "./format";
import { type StringKey, t } from "./i18n";
import type { Thread } from "./messages";
import { baseStyles } from "./styles";

export interface MessagesOptions {
  max_items?: number;
  /** List automatic shop messages ("order received", "being packed") too, dimmed. */
  show_automatic?: boolean;
  /** A collapsed list of recent invoices, each one savable in Home Assistant. */
  show_invoices?: boolean;
  /** The "mark automatic / older as read" buttons. */
  show_actions?: boolean;
  /** Leave the section out of the card while nothing is unread. */
  hide_when_empty?: boolean;
}

export type MessagesSectionConfig = AllegroCardConfig & MessagesOptions;

export const MESSAGES_DEFAULTS = {
  max_items: 5,
  show_automatic: true,
  show_invoices: true,
  show_actions: true,
  hide_when_empty: true,
} as const;

/** Unread threads the section lists with these options. */
export const listedThreads = (threads: Thread[], showAutomatic: boolean): Thread[] =>
  showAutomatic ? threads : threads.filter((thread) => thread.category !== "order_status");

/** Unread seller messages, invoices and the integration's mark-as-read actions. */
export class AllegroMessagesSection extends AllegroBaseCard<MessagesSectionConfig> {
  @state() private _open?: string;

  @state() private _showAll = false;

  @state() private _invoicesOpen = false;

  /** Threads (or button keys) with an action in flight. */
  @state() private _busy: ReadonlySet<string> = new Set();

  private get _cfg() {
    return { ...MESSAGES_DEFAULTS, ...this._config };
  }

  protected override render() {
    if (!this._config || !this._hass) return nothing;
    const hass = this._hass;
    const unread = this._threads;
    const listed = listedThreads(unread, this._cfg.show_automatic);
    const max = Math.max(1, Number(this._cfg.max_items));
    const shown = this._showAll ? listed : listed.slice(0, max);
    return html`${listed.length
      ? html`<div class="list">
          ${repeat(
            shown,
            (thread) => thread.id,
            (thread) => this._renderThread(thread),
          )}
        </div>`
      : html`<div class="message">
          <ha-icon icon="mdi:email-check-outline"></ha-icon>${t(hass, "no_unread")}
        </div>`}
    ${listed.length > shown.length
      ? html`<div class="actions">
          <button class="button" @click=${() => (this._showAll = true)}>
            <ha-icon icon="mdi:chevron-down"></ha-icon
            ><span>${t(hass, "show_all", { n: formatNumber(hass, listed.length) })}</span>
          </button>
        </div>`
      : nothing}
    ${this._renderBulk(unread)} ${this._cfg.show_invoices ? this._renderInvoices() : nothing}`;
  }

  private _renderThread(thread: Thread) {
    const hass = this._hass!;
    const open = this._open === thread.id;
    const automatic = thread.category === "order_status";
    const busy = this._busy.has(thread.id);
    const toggle = () => {
      this._open = open ? undefined : thread.id;
    };
    const category = t(hass, `category_${thread.category}` as StringKey);
    return html`<div
      class="row ${open ? "open" : ""} ${automatic ? "automatic" : ""}"
      style="--c: ${rgb(MESSAGE_COLORS[thread.category])}"
    >
      <div
        class="state-item clickable"
        role="button"
        tabindex="0"
        aria-expanded=${String(open)}
        @click=${toggle}
        @keydown=${onActivate(toggle)}
      >
        <div class="shape small" title=${category}>
          <ha-icon .icon=${MESSAGE_ICONS[thread.category]}></ha-icon>
        </div>
        <div class="info">
          <span class="primary">${thread.seller || category}</span>
          <span class="secondary ${open ? "full" : ""}">${thread.preview}</span>
        </div>
        ${thread.time
          ? html`<span class="time" title=${formatDateTime(hass, thread.time)}
              >${formatRelative(hass, thread.time)}</span
            >`
          : nothing}
      </div>
      ${open
        ? html`<div class="actions thread-actions">
            <button
              class="button accent"
              ?disabled=${busy}
              @click=${() => this._markRead(thread)}
            >
              <ha-icon icon="mdi:email-open-outline"></ha-icon><span>${t(hass, "mark_read")}</span>
            </button>
            ${thread.category === "invoice"
              ? html`<button
                  class="button"
                  ?disabled=${busy}
                  title=${t(hass, "save_invoice_title")}
                  @click=${() => this._saveInvoice(thread)}
                >
                  <ha-icon icon="mdi:file-download-outline"></ha-icon
                  ><span>${t(hass, "save_invoice")}</span>
                </button>`
              : nothing}
            ${linkButton(ALLEGRO_URL.messages, "mdi:open-in-new", t(hass, "open_messages"))}
          </div>`
        : nothing}
    </div>`;
  }

  /** Bulk mark-as-read, through the integration's own buttons (same rules as its auto mode). */
  private _renderBulk(unread: Thread[]) {
    if (!this._cfg.show_actions) return nothing;
    const hass = this._hass!;
    const automatic = unread.filter((thread) => thread.category === "order_status").length;
    const canAll = automatic > 0 && this._entities[ENTITY.markAutomaticRead];
    const canOlder = automatic > 0 && this._entities[ENTITY.markOlderRead];
    if (!canAll && !canOlder) return nothing;
    const button = (key: string, icon: string, label: string, title: string) =>
      html`<button
        class="button"
        title=${title}
        ?disabled=${this._busy.has(key)}
        @click=${() => this._pressBulk(key)}
      >
        <ha-icon .icon=${icon}></ha-icon><span class="label">${label}</span>
      </button>`;
    return html`<div class="actions bulk">
      ${canOlder
        ? button(
            ENTITY.markOlderRead,
            "mdi:email-sync-outline",
            t(hass, "mark_older"),
            t(hass, "mark_older_title"),
          )
        : nothing}
      ${canAll
        ? button(
            ENTITY.markAutomaticRead,
            "mdi:email-open-multiple-outline",
            t(hass, "mark_automatic", { n: formatNumber(hass, automatic) }),
            t(hass, "mark_automatic_title"),
          )
        : nothing}
    </div>`;
  }

  private _renderInvoices() {
    const hass = this._hass!;
    const invoices = this._invoices;
    if (!invoices.length) return nothing;
    const toggle = () => {
      this._invoicesOpen = !this._invoicesOpen;
    };
    return html`<div class="invoices ${this._invoicesOpen ? "open" : ""}">
      <div
        class="invoices-toggle clickable"
        role="button"
        tabindex="0"
        aria-expanded=${String(this._invoicesOpen)}
        @click=${toggle}
        @keydown=${onActivate(toggle)}
      >
        <ha-icon icon="mdi:file-document-multiple-outline"></ha-icon>
        <span class="grow">${t(hass, "invoices_title")}</span>
        <span class="count">${formatNumber(hass, invoices.length)}</span>
        <ha-icon class="chevron" icon="mdi:chevron-down"></ha-icon>
      </div>
      ${this._invoicesOpen
        ? html`<div class="invoice-list">
            ${invoices.map(
              (thread) => html`<div class="invoice">
                <div class="info">
                  <span class="primary">${thread.seller}</span>
                  <span class="secondary" title=${thread.preview}
                    >${thread.time ? formatDateTime(hass, thread.time) : thread.preview}</span
                  >
                </div>
                <button
                  class="icon-button"
                  title=${t(hass, "save_invoice_title")}
                  aria-label=${t(hass, "save_invoice")}
                  ?disabled=${this._busy.has(thread.id)}
                  @click=${() => this._saveInvoice(thread)}
                >
                  <ha-icon icon="mdi:file-download-outline"></ha-icon>
                </button>
              </div>`,
            )}
          </div>`
        : nothing}
    </div>`;
  }

  private async _busyWhile(key: string, action: () => Promise<unknown>): Promise<void> {
    if (this._busy.has(key)) return;
    this._busy = new Set([...this._busy, key]);
    try {
      await action();
    } finally {
      const busy = new Set(this._busy);
      busy.delete(key);
      this._busy = busy;
    }
  }

  private _markRead(thread: Thread): Promise<void> {
    return this._busyWhile(thread.id, async () => {
      await this._callAllegro(SERVICE.markMessageRead, { thread_id: thread.id });
      if (this._open === thread.id) this._open = undefined;
    });
  }

  private _pressBulk(key: string): Promise<void> {
    return this._busyWhile(key, () => this._press(key));
  }

  /** Saves the attachments under /config (the integration's folder); opening the thread marks it read. */
  private _saveInvoice(thread: Thread): Promise<void> {
    return this._busyWhile(thread.id, async () => {
      const result = await this._callAllegro(SERVICE.downloadInvoice, { thread_id: thread.id }, true);
      const files: unknown = result?.response?.files;
      if (Array.isArray(files) && files.length) {
        this._toast(t(this._hass, "invoice_saved", { files: files.join(", ") }));
      }
    });
  }

  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        container: allegro / inline-size;
      }
      .shape.small {
        --icon-size: 32px;
      }
      .row.automatic:not(.open) {
        opacity: 0.65;
      }
      .secondary.full {
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .time {
        flex: none;
        align-self: flex-start;
        padding-top: 2px;
        font-size: 11px;
        color: var(--secondary-text-color);
      }
      .thread-actions {
        padding: 0 calc(var(--spacing) / 2) calc(var(--spacing) / 2)
          calc(32px + var(--spacing) * 1.5);
        gap: calc(var(--spacing) / 2);
        flex-wrap: wrap;
      }
      .thread-actions .button,
      .bulk .button {
        --control-height: 36px;
      }
      .bulk {
        gap: calc(var(--spacing) / 2);
      }
      .bulk .button .label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .list + .actions,
      .list + .bulk {
        padding-top: 0;
      }
      .invoices {
        margin: 0 calc(var(--spacing) / 2) calc(var(--spacing) / 2);
        border-radius: var(--control-border-radius);
      }
      .invoices.open {
        background-color: var(--tint);
      }
      .invoices-toggle {
        display: flex;
        align-items: center;
        gap: var(--spacing);
        padding: 6px calc(var(--spacing) / 2);
        border-radius: var(--control-border-radius);
        font-size: var(--card-secondary-font-size);
        color: var(--secondary-text-color);
      }
      .invoices-toggle:hover {
        background-color: var(--tint);
      }
      .invoices-toggle ha-icon {
        --mdc-icon-size: 20px;
        display: flex;
      }
      .invoices-toggle > ha-icon:first-child {
        width: 32px;
        justify-content: center;
        color: rgb(var(--rgb-teal));
      }
      .grow {
        flex: 1;
      }
      .count {
        min-width: 1.6em;
        padding: 0.2em 0.45em;
        box-sizing: border-box;
        border-radius: 1em;
        text-align: center;
        font-size: 11px;
        background-color: rgba(var(--rgb-text), 0.08);
      }
      .chevron {
        transition: transform 180ms ease-in-out;
      }
      .invoices.open .chevron {
        transform: rotate(180deg);
      }
      .invoice-list {
        display: flex;
        flex-direction: column;
        padding: 0 calc(var(--spacing) / 2) calc(var(--spacing) / 2) calc(32px + var(--spacing) * 1.5);
      }
      .invoice {
        display: flex;
        align-items: center;
        gap: var(--spacing);
        min-width: 0;
        padding: 3px 0;
      }
      .invoice .icon-button {
        --icon-size: 32px;
      }
      .icon-button:disabled {
        cursor: progress;
        opacity: 0.5;
      }
    `,
  ];
}
