"""Render the harness in headless Chromium (Playwright) and save screenshots.

    npm run screenshots                       # README images -> docs/images/
    python3 tools/screenshot-harness/shoot.py main-pl=lang=pl&scenario=main,open

Each shot is `name=<page query>[,<action>]`: `open` expands the first order in
every orders section, `msg` opens the first message and the invoices, `zoom` enlarges the QR code in every pickup section.
Custom shots are written to tools/screenshot-harness/out/.
"""

import mimetypes
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE / "out"
DOCS = HERE.parent.parent / "docs" / "images"
README_SHOTS = {
    "card-default": "lang=en&scenario=docs-default",
    "card-compact": "lang=en&scenario=docs-compact",
    "card-everything": "lang=en&scenario=docs-everything,open",
    "card-minimal": "lang=en&scenario=docs-minimal",
    "card-messages": "lang=en&scenario=docs-news,msg",
}

# The sections live in their own elements inside the card's shadow root.
ACTIONS = {
    "open": """() => document.querySelectorAll('allegro-card').forEach((card) =>
        card.shadowRoot.querySelectorAll('allegro-card-orders').forEach(
            (section) => section.shadowRoot.querySelector('.row > .state-item')?.click()))""",
    "zoom": """() => document.querySelectorAll('allegro-card').forEach((card) =>
        card.shadowRoot.querySelectorAll('allegro-card-pickup').forEach(
            (section) => section.shadowRoot.querySelector('button.qr')?.click()))""",
    "msg": """() => document.querySelectorAll('allegro-card').forEach((card) =>
        card.shadowRoot.querySelectorAll('allegro-card-messages').forEach((section) => {
            section.shadowRoot.querySelector('.row > .state-item')?.click();
            section.shadowRoot.querySelector('.invoices-toggle')?.click();
        }))""",
}


def serve(route):
    path = ROOT / route.request.url.split("harness.local/", 1)[1].split("?", 1)[0]
    if not path.is_file():
        route.fulfill(status=404)
        return
    content_type = mimetypes.guess_type(path.name)[0] or "application/javascript"
    route.fulfill(body=path.read_bytes(), content_type=content_type)


def main() -> None:
    shots = dict(arg.split("=", 1) for arg in sys.argv[1:])
    target = ROOT if shots else DOCS
    target.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for name, spec in (shots or README_SHOTS).items():
            query, _, action = spec.partition(",")
            page = browser.new_page(viewport={"width": 1100, "height": 900}, device_scale_factor=2)
            page.on("console", lambda m, n=name: m.type in ("error", "warning") and print(n, m.text))
            page.on("pageerror", lambda e, n=name: print(n, "PAGEERROR", e))
            page.route("http://harness.local/**", serve)
            page.goto(f"http://harness.local/index.html?{query}")
            page.wait_for_timeout(600)
            if action:
                page.evaluate(ACTIONS[action])
                page.wait_for_timeout(300)
            page.locator("body").screenshot(path=str(target / f"{name}.png"))
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
