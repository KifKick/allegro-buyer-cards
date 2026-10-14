// Design system borrowed from Mushroom: the same tokens (with the same
// defaults) resolved from the public --mush-* variables, so a Mushroom theme or
// card_mod override restyles these cards too; plus Mushroom's primitives
// (shape icon, state item, chip, control button) in plain CSS, and the few
// pieces these cards add (banners, journey bar, pickup code, thumbnails).

import { css } from "lit";

export const baseStyles = css`
  :host {
    --spacing: var(--mush-spacing, 10px);
    --icon-size: var(--mush-icon-size, 36px);
    --icon-border-radius: var(--mush-icon-border-radius, 50%);
    --icon-symbol-size: var(--mush-icon-symbol-size, 0.667em);
    --badge-size: var(--mush-badge-size, 16px);
    --control-height: var(--mush-control-height, 42px);
    --control-border-radius: var(--mush-control-border-radius, 12px);
    --control-spacing: var(--mush-control-spacing, 12px);
    --chip-spacing: var(--mush-chip-spacing, 8px);
    --chip-height: var(--mush-chip-height, 36px);
    --chip-padding: var(--mush-chip-padding, 0 0.25em);
    --chip-border-radius: var(--mush-chip-border-radius, 19px);
    --chip-font-size: var(--mush-chip-font-size, 0.3em);
    --chip-font-weight: var(--mush-chip-font-weight, bold);
    --chip-icon-size: var(--mush-chip-icon-size, 0.5em);
    --card-primary-font-size: var(--mush-card-primary-font-size, 14px);
    --card-secondary-font-size: var(--mush-card-secondary-font-size, 12px);
    --card-primary-font-weight: var(--mush-card-primary-font-weight, 500);
    --card-secondary-font-weight: var(--mush-card-secondary-font-weight, 400);
    --card-primary-line-height: var(--mush-card-primary-line-height, 20px);
    --card-secondary-line-height: var(--mush-card-secondary-line-height, 16px);
    --card-primary-color: var(--mush-card-primary-color, var(--primary-text-color));
    --card-secondary-color: var(--mush-card-secondary-color, var(--primary-text-color));
    --card-primary-letter-spacing: var(--mush-card-primary-letter-spacing, 0.1px);
    --card-secondary-letter-spacing: var(--mush-card-secondary-letter-spacing, 0.4px);

    /* Colours are "r, g, b" triplets (Mushroom's convention, --mush-rgb-* overrides). */
    --rgb-allegro: var(--allegro-rgb-accent, 255, 90, 0);
    --rgb-red: var(--mush-rgb-red, 244, 67, 54);
    --rgb-blue: var(--mush-rgb-blue, 33, 150, 243);
    --rgb-light-blue: var(--mush-rgb-light-blue, 3, 169, 244);
    --rgb-teal: var(--mush-rgb-teal, 0, 150, 136);
    --rgb-green: var(--mush-rgb-green, 76, 175, 80);
    --rgb-amber: var(--mush-rgb-amber, 255, 193, 7);
    --rgb-grey: var(--mush-rgb-grey, 158, 158, 158);
    --rgb-disabled: var(--mush-rgb-disabled, 189, 189, 189);
    --rgb-text: var(--rgb-primary-text-color, 33, 33, 33);
    --tint: rgba(var(--rgb-text), 0.05);
  }
  :host([dark-mode]) {
    --rgb-disabled: var(--mush-rgb-disabled, 111, 111, 111);
  }

  ha-card {
    box-sizing: border-box;
    height: auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    container: allegro / inline-size;
  }
  :host([layout="grid"]) ha-card {
    height: 100%;
  }
  a {
    color: inherit;
  }

  /* --- State item: shape icon + primary/secondary text ---------------------- */
  .state-item {
    display: flex;
    align-items: center;
    gap: var(--spacing);
    padding: var(--spacing);
    min-width: 0;
  }
  .shape {
    position: relative;
    flex: none;
    width: var(--icon-size);
    height: var(--icon-size);
    font-size: var(--icon-size);
    border-radius: var(--icon-border-radius);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgb(var(--c, var(--rgb-disabled)));
    background-color: rgba(var(--c, var(--rgb-disabled)), 0.2);
    transition:
      background-color 280ms ease-out,
      color 280ms ease-in-out;
  }
  .shape ha-icon {
    --mdc-icon-size: var(--icon-symbol-size);
    display: flex;
    line-height: 0;
  }
  .badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: var(--badge-size);
    height: var(--badge-size);
    box-sizing: border-box;
    padding: 0 3px;
    border-radius: calc(var(--badge-size) / 2);
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    font-size: 10px;
    font-weight: 700;
    color: white;
    background-color: rgb(var(--badge-c, var(--rgb-grey)));
  }
  .badge ha-icon {
    --mdc-icon-size: calc(var(--badge-size) * 0.75);
  }
  .info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .primary,
  .secondary {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .primary {
    font-size: var(--card-primary-font-size);
    font-weight: var(--card-primary-font-weight);
    line-height: var(--card-primary-line-height);
    letter-spacing: var(--card-primary-letter-spacing);
    color: var(--card-primary-color);
  }
  .secondary {
    font-size: var(--card-secondary-font-size);
    font-weight: var(--card-secondary-font-weight);
    line-height: var(--card-secondary-line-height);
    letter-spacing: var(--card-secondary-letter-spacing);
    color: var(--card-secondary-color);
  }
  .muted {
    color: var(--secondary-text-color);
  }

  /* --- Buttons --------------------------------------------------------------- */
  .actions {
    display: flex;
    align-items: center;
    gap: var(--control-spacing);
    padding: 0 var(--control-spacing) var(--control-spacing);
  }
  .button {
    box-sizing: border-box;
    flex: 1 1 0;
    min-width: var(--control-height);
    height: var(--control-height);
    margin: 0;
    padding: 0 10px;
    border: none;
    border-radius: var(--control-border-radius);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font: inherit;
    font-size: var(--card-secondary-font-size);
    font-weight: var(--card-primary-font-weight);
    color: var(--primary-text-color);
    background-color: var(--tint);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    transition:
      background-color 280ms ease-in-out,
      color 280ms ease-in-out;
  }
  .button ha-icon {
    --mdc-icon-size: 20px;
    display: flex;
    pointer-events: none;
  }
  .button:hover {
    background-color: rgba(var(--rgb-text), 0.09);
  }
  .button.accent {
    color: rgb(var(--c, var(--rgb-allegro)));
    background-color: rgba(var(--c, var(--rgb-allegro)), 0.15);
  }
  .button.accent:hover {
    background-color: rgba(var(--c, var(--rgb-allegro)), 0.25);
  }
  .button.filled {
    color: white;
    background-color: rgb(var(--c, var(--rgb-allegro)));
  }
  .button.filled:hover {
    background-color: rgba(var(--c, var(--rgb-allegro)), 0.85);
  }
  .button:disabled {
    cursor: not-allowed;
    color: rgb(var(--rgb-disabled));
    background-color: rgba(var(--rgb-disabled), 0.2);
  }
  .icon-button {
    box-sizing: border-box;
    flex: none;
    width: var(--icon-size);
    height: var(--icon-size);
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--secondary-text-color);
    background: none;
    cursor: pointer;
    text-decoration: none;
  }
  .icon-button:hover {
    background-color: var(--tint);
  }
  .icon-button ha-icon {
    --mdc-icon-size: 20px;
    display: flex;
  }
  .icon-button.alert {
    color: rgb(var(--rgb-amber));
  }

  /* --- Chips ----------------------------------------------------------------- */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--chip-spacing);
  }
  .chip {
    box-sizing: border-box;
    flex: none;
    height: var(--chip-height);
    min-width: var(--chip-height);
    margin: 0;
    padding: var(--chip-padding);
    padding-inline: 0.3em;
    border: none;
    border-radius: var(--chip-border-radius);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.15em;
    font: inherit;
    font-size: var(--chip-height);
    line-height: 0;
    color: var(--primary-text-color);
    background-color: var(--tint);
    cursor: pointer;
    transition: background-color 280ms ease-in-out;
  }
  .chip ha-icon {
    --mdc-icon-size: var(--chip-icon-size);
    display: flex;
    color: rgb(var(--c, var(--rgb-text)));
  }
  .chip span {
    font-size: var(--chip-font-size);
    font-weight: var(--chip-font-weight);
    line-height: 1;
    white-space: nowrap;
  }
  .chip.selected {
    color: rgb(var(--c, var(--rgb-allegro)));
    background-color: rgba(var(--c, var(--rgb-allegro)), 0.2);
  }

  /* --- Banner: one prominent, coloured line (pickup ready, problem…) ---------- */
  .banner {
    display: flex;
    align-items: center;
    gap: var(--spacing);
    padding: 8px var(--spacing) 8px 8px;
    border-radius: var(--control-border-radius);
    background-color: rgba(var(--c), 0.12);
    text-decoration: none;
    color: inherit;
  }
  .banner .shape {
    --icon-size: 32px;
    color: white;
    background-color: rgb(var(--c));
  }
  .banner .primary {
    color: rgb(var(--c));
  }

  /* --- Journey bar: four segments, filled up to the order's stage ------------- */
  .segments {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
    margin-top: 6px;
  }
  .segments i {
    height: 4px;
    border-radius: 2px;
    background-color: rgba(var(--c), 0.18);
  }
  .segments i.on {
    background-color: rgb(var(--c));
  }

  /* --- Pickup code ----------------------------------------------------------- */
  .code {
    display: inline-flex;
    gap: 0.35em;
    font-family: var(--code-font-family, ui-monospace, "SFMono-Regular", Menlo, monospace);
    font-weight: 700;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }

  /* --- Pickup deadline: green while there's time, red in the last day -------- */
  .deadline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: var(--card-primary-font-weight);
    color: rgb(var(--rgb-green));
  }
  .deadline.urgent {
    color: rgb(var(--rgb-red));
  }
  .deadline ha-icon {
    --mdc-icon-size: 16px;
    display: flex;
  }

  /* --- Product thumbnail (Allegro photos are on white) ------------------------ */
  .thumb {
    position: relative;
    flex: none;
    width: var(--thumb-size, 48px);
    height: var(--thumb-size, 48px);
    border-radius: 10px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9e9e9e;
  }
  /* The outline sits over the photo, which is usually on white too. */
  .thumb::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
    pointer-events: none;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: inherit;
  }
  .thumb ha-icon {
    --mdc-icon-size: 22px;
  }

  /* --- Lists and expandable details -------------------------------------------- */
  .list {
    display: flex;
    flex-direction: column;
    padding: calc(var(--spacing) / 2) 0;
  }
  .row {
    border-radius: var(--control-border-radius);
    margin: 0 calc(var(--spacing) / 2);
    transition: background-color 180ms ease-in-out;
  }
  .row > .state-item {
    border-radius: var(--control-border-radius);
    padding: calc(var(--spacing) / 2 + 2px) calc(var(--spacing) / 2);
  }
  .row > .state-item.clickable:hover,
  .row.open {
    background-color: var(--tint);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: var(--card-secondary-font-size);
    line-height: var(--card-secondary-line-height);
  }
  dt {
    color: var(--secondary-text-color);
  }
  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* --- Misc ------------------------------------------------------------------ */
  .clickable {
    cursor: pointer;
  }
  .button:focus-visible,
  .chip:focus-visible,
  .icon-button:focus-visible,
  .banner:focus-visible,
  .clickable:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .message {
    display: flex;
    align-items: center;
    gap: var(--spacing);
    padding: var(--spacing);
    font-size: var(--card-secondary-font-size);
    color: var(--secondary-text-color);
  }
  .message ha-icon {
    flex: none;
  }
  .message.error {
    color: rgb(var(--rgb-red));
  }
  .message.center {
    justify-content: center;
    padding: calc(var(--spacing) * 2) var(--spacing);
  }
  .text-button {
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-weight: var(--card-primary-font-weight);
    color: rgb(var(--rgb-allegro));
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
`;
