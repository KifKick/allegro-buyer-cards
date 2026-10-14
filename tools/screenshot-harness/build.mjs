// Assembles out/: the built card bundle, the stubbed page and its HTML, and
// stand-in product photos (MDI glyphs on white, like Allegro's packshots).
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";

import * as mdi from "@mdi/js";
import * as esbuild from "esbuild";

const here = new URL(".", import.meta.url);
const out = new URL("out/", here);
mkdirSync(new URL("img/", out), { recursive: true });
copyFileSync(new URL("index.html", here), new URL("index.html", out));
copyFileSync(new URL("../../dist/allegro-buyer-cards.js", here), new URL("allegro-buyer-cards.js", out));

const PHOTOS = {
  laces: [mdi.mdiShoeSneaker, "#37474f"],
  mug: [mdi.mdiCoffeeOutline, "#5d4037"],
  cable: [mdi.mdiUsbCPort, "#1565c0"],
  wipes: [mdi.mdiPaperRoll, "#00897b"],
};
for (const [name, [path, color]] of Object.entries(PHOTOS)) {
  writeFileSync(
    new URL(`img/${name}.svg`, out),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 36 36"><rect x="-6" y="-6" width="36" height="36" fill="#fff"/><path d="${path}" fill="${color}"/></svg>`,
  );
}

await esbuild.build({
  entryPoints: [new URL("page.js", here).pathname],
  outfile: new URL("page.bundle.js", out).pathname,
  bundle: true,
  format: "esm",
  logLevel: "warning",
});
