# Changelog

## [0.2.0] - 2026-10-14

Support for Allegro buyer 0.2.0. Everything new shows only with that version; with older ones the card looks as before.

### Added

- `messages` section: unread seller messages with their category (automatic, invoice, other), **Mark as read** on each, the integration's **Mark automatic as read** and **Older ones** buttons, and recent invoices with **Save invoice** (`allegro.download_invoice`). In the default sections.
- Pickup deadline: in the `pickup` section, the pickup banner, the orders list (time left) and an order's details, red in the last 24 hours.
- **Other point** tag on parcels waiting somewhere other than the default pickup point set in the integration.
- Shipment status (`tracking` detail) in an open order, and the estimated delivery for parcels on their way to a pickup point; the carrier's note on delivery problem banners.
- Banners: `messages` (unread messages worth reading) and `stale` (no successful refresh for 90 minutes, usually an expired session). The header summary counts unread messages.
- Counters: `other_point`, `pickup_deadline`, `messages` (on by default) and `invoices`.
- `pickup.show_deadline` option.

## [0.1.0] - 2026-10-12

### Added

- `allegro-card`: one card for an Allegro buyer account. A header with a problem/pickup badge and a summary, then any of these sections, in the order you pick, each with its own options:
  - `alerts`: banners for parcels to pick up (with a copyable code), delivery problems and unpaid orders.
  - `pickup`: large pickup code, phone number, QR code (drawn locally when Allegro sends text; tap to enlarge), pickup point with directions, and parcels on their way to a pickup point.
  - `orders`: a short list with progress bars, or the full list with stage filters and counts, a journey stepper, details and track / directions / copy code / "Got it" actions.
  - `cart`: a summary row, a list or photo tiles, with the total to pay and a field that adds an offer by its link or number.
  - `stats`: counter chips.
- One-row `compact` layout.
- Hidden orders shared across cards and devices through the Home Assistant user's frontend data, per account.
- Visual editor with a group per section, English and Polish translations, Mushroom theme variables (`--mush-*`) and `--allegro-rgb-accent` support.
