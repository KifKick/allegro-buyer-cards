// The pickup QR code. Allegro may hand the integration an image (a URL or a
// data URL, or bare base64 PNG) or just the text to encode; text is drawn
// here as an SVG, so no image has to come from anywhere.

import { generate } from "lean-qr/nano";
import { html, svg, type TemplateResult } from "lit";

/** An image source for the code, if it already is an image. */
export const qrImageSrc = (value: string): string | undefined => {
  if (/^data:image\//i.test(value) || /^https?:\/\//i.test(value)) return value;
  // Bare base64 PNG ("\x89PNG" encodes to "iVBOR").
  if (/^iVBOR[A-Za-z0-9+/=\s]+$/.test(value)) return `data:image/png;base64,${value.replace(/\s/g, "")}`;
  return undefined;
};

/** Path of the dark modules, one unit per module, inside a 4-module quiet zone. */
export const qrPath = (value: string): { size: number; d: string } | undefined => {
  let code: ReturnType<typeof generate>;
  try {
    code = generate(value);
  } catch {
    return undefined;
  }
  const quiet = 4;
  let d = "";
  for (let y = 0; y < code.size; y += 1) {
    for (let x = 0; x < code.size; x += 1) {
      if (code.get(x, y)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  return { size: code.size + quiet * 2, d };
};

export const renderQr = (value: string, label: string): TemplateResult => {
  const src = qrImageSrc(value);
  if (src) return html`<img class="qr-img" src=${src} alt=${label} />`;
  const path = qrPath(value);
  if (!path) return html``;
  return html`<svg
    class="qr-img"
    viewBox="0 0 ${path.size} ${path.size}"
    shape-rendering="crispEdges"
    role="img"
    aria-label=${label}
  >
    ${svg`<rect width=${path.size} height=${path.size} fill="#fff"></rect><path d=${path.d} fill="#000"></path>`}
  </svg>`;
};
