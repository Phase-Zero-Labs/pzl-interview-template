#!/usr/bin/env bun
/**
 * Build script for Hamilton Pipeline UI
 * Uses Bun's native bundler to compile the React frontend
 */

import { existsSync, mkdirSync, cpSync, rmSync } from "fs";
import { join } from "path";

const UI_DIR = import.meta.dir;
const APP_DIR = join(UI_DIR, "app");
const DIST_DIR = join(UI_DIR, "dist");
const SRC_DIR = join(APP_DIR, "src");

console.log("[build] Building Hamilton Pipeline UI...");

// Clean dist directory
if (existsSync(DIST_DIR)) {
  rmSync(DIST_DIR, { recursive: true });
}
mkdirSync(DIST_DIR, { recursive: true });

// Build with Bun's native bundler
const result = await Bun.build({
  entrypoints: [join(SRC_DIR, "main.tsx")],
  outdir: DIST_DIR,
  target: "browser",
  format: "esm",
  splitting: true,
  minify: process.env.NODE_ENV === "production",
  sourcemap: process.env.NODE_ENV !== "production" ? "linked" : "none",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
  },
  loader: {
    ".tsx": "tsx",
    ".ts": "ts",
    ".css": "css",
    ".svg": "file",
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".gif": "file",
    ".woff": "file",
    ".woff2": "file",
  },
});

if (!result.success) {
  console.error("[build] Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`[build] Bundled ${result.outputs.length} files`);

// Find the main JS and CSS outputs
let mainJs = "";
let mainCss = "";
for (const output of result.outputs) {
  const name = output.path.split("/").pop() || "";
  if (name.endsWith(".js") && name.startsWith("main")) {
    mainJs = name;
  } else if (name.endsWith(".css")) {
    mainCss = name;
  }
}

// Generate index.html
const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hamilton Pipeline UI</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    ${mainCss ? `<link rel="stylesheet" href="/${mainCss}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${mainJs}"></script>
  </body>
</html>`;

await Bun.write(join(DIST_DIR, "index.html"), indexHtml);

// Copy public assets
const publicDir = join(APP_DIR, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, DIST_DIR, { recursive: true });
}

// Create a simple favicon if none exists
const faviconPath = join(DIST_DIR, "favicon.svg");
if (!existsSync(faviconPath)) {
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#0066CC"/>
  <text x="50" y="68" font-family="monospace" font-size="50" font-weight="bold" fill="white" text-anchor="middle">H</text>
</svg>`;
  await Bun.write(faviconPath, favicon);
}

console.log("[build] Generated index.html");
console.log(`[build] Output directory: ${DIST_DIR}`);
console.log("[build] Build complete!");
