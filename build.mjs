// Bundles src/index.ts (cards + editors + Lit) into the single ES module HACS
// installs as a dashboard resource.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import * as esbuild from "esbuild";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Collapse whitespace and drop comments in Lit css`` literals (esbuild leaves
// template literals alone). Only spacing around { } ; , is removed, so
// selectors like "a :hover" and expressions like calc(100% - 24px) survive.
const minifyCssLiterals = {
  name: "minify-css-literals",
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/][^\\/]+\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      const contents = source.replace(
        /\bcss`([^`]*)`/g,
        (_, body) =>
          `css\`${body
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\s+/g, " ")
            .replace(/\s*([{};,])\s*/g, "$1")
            .trim()}\``,
      );
      return { contents, loader: "ts" };
    });
  },
};

const options = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/allegro-buyer-cards.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "eof",
  define: { __CARD_VERSION__: JSON.stringify(version) },
  plugins: [minifyCssLiterals],
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
