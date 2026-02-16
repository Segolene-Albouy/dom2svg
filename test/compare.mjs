#!/usr/bin/env node

/**
 * Visual comparison harness for dom2svg.
 *
 * For each test URL:
 *   1. Captures a native Chrome screenshot (ground truth)
 *   2. Runs dom2svg to produce an SVG
 *   3. Renders the SVG back to PNG in Chrome
 *   4. Saves everything to test/compare-output/<site>/
 *   5. Generates an index.html gallery for side-by-side inspection
 */

import { launch } from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, "..", "dist", "cli-bundle.global.js");
const OUTPUT_DIR = resolve(__dirname, "compare-output");

// ── Test sites ───────────────────────────────────────────────────────────────

const TEST_SITES = [
  { name: "example.com", url: "https://example.com" },
  { name: "hacker-news", url: "https://news.ycombinator.com" },
  { name: "wikipedia-svg", url: "https://en.wikipedia.org/wiki/SVG" },
  { name: "mdn-css", url: "https://developer.mozilla.org/en-US/docs/Web/CSS" },
  { name: "lite-cnn", url: "https://lite.cnn.com" },
  { name: "gov-uk", url: "https://www.gov.uk" },
  { name: "mf-website", url: "https://motherfuckingwebsite.com" },
  { name: "css-tricks", url: "https://css-tricks.com" },
  { name: "dom2svg-gh", url: "https://github.com/milanofthe/dom2svg" },
  { name: "rust-lang", url: "https://www.rust-lang.org" },
];

// ── Chrome detection (mirrors bin/dom2svg.mjs) ──────────────────────────────

function findChrome() {
  const envPath = process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const candidates =
    process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
          ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function openInBrowser(filePath) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${filePath}"`
      : process.platform === "darwin"
        ? `open "${filePath}"`
        : `xdg-open "${filePath}"`;
  exec(cmd);
}

function generateGallery(results) {
  const rows = results
    .map(
      (r) => `
    <div class="site">
      <h2>${r.name} <a href="${r.url}" target="_blank">&nearr;</a></h2>
      ${
        r.error
          ? `<p class="error">Error: ${r.error}</p>`
          : `
      <div class="compare">
        <div class="panel">
          <h3>Chrome Screenshot (ground truth)</h3>
          <img src="${r.name}/screenshot.png" />
        </div>
        <div class="panel">
          <h3>dom2svg &rarr; PNG (rendered SVG)</h3>
          <img src="${r.name}/dom2svg.png" />
        </div>
      </div>
      <details>
        <summary>View SVG source</summary>
        <iframe src="${r.name}/dom2svg.svg" style="width:100%;height:600px;border:1px solid #ccc;"></iframe>
      </details>
      `
      }
    </div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>dom2svg Visual Comparison</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; padding: 2rem; background: #f5f5f5; }
    h1 { margin-bottom: 1rem; }
    .site { background: #fff; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .site h2 { margin-bottom: 1rem; }
    .site h2 a { font-size: 0.8em; text-decoration: none; }
    .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .panel h3 { font-size: 0.85rem; color: #666; margin-bottom: 0.5rem; }
    .panel img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }
    .error { color: #c00; font-weight: bold; }
    details { margin-top: 1rem; }
    summary { cursor: pointer; color: #666; }
  </style>
</head>
<body>
  <h1>dom2svg Visual Comparison</h1>
  <p style="color:#666;margin-bottom:2rem;">Generated ${new Date().toISOString()}</p>
  ${rows}
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(BUNDLE_PATH)) {
    console.error(
      `Bundle not found at ${BUNDLE_PATH}\nRun "npm run build" first.`,
    );
    process.exit(1);
  }

  const chromePath = findChrome();
  if (!chromePath) {
    console.error(
      "Could not find Chrome. Set CHROME_PATH or install Chrome.",
    );
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("Launching browser...");
  const browser = await launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--allow-file-access-from-files",
    ],
  });

  const results = [];

  for (const site of TEST_SITES) {
    const siteDir = resolve(OUTPUT_DIR, site.name);
    mkdirSync(siteDir, { recursive: true });

    console.log(`\n── ${site.name} (${site.url})`);

    try {
      // Step 1: Navigate and screenshot
      const page = await browser.newPage();
      await page.setBypassCSP(true);
      await page.setViewport({ width: 1280, height: 800 });

      console.log("  Loading page...");
      await page.goto(site.url, {
        waitUntil: "networkidle0",
        timeout: 30_000,
      });

      // Wait a bit for any late rendering
      await new Promise((r) => setTimeout(r, 1000));

      const selector = site.selector || "body";
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Selector "${selector}" not found`);
      }

      console.log("  Taking screenshot...");
      await element.screenshot({
        path: resolve(siteDir, "screenshot.png"),
        type: "png",
      });

      // Step 2: Inject dom2svg and capture SVG
      console.log("  Running dom2svg...");
      await page.addScriptTag({ path: BUNDLE_PATH });

      // Detect actual page background (from <html> or <body> computed styles)
      const pageBg = await page.evaluate(() => {
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const isTransparent = (c) => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)";
        if (!isTransparent(htmlBg)) return htmlBg;
        if (!isTransparent(bodyBg)) return bodyBg;
        return "#ffffff";
      });

      const svgString = await page.evaluate(
        (sel, opts) => window.__dom2svg(sel, opts),
        selector,
        { background: pageBg },
      );

      writeFileSync(resolve(siteDir, "dom2svg.svg"), svgString, "utf-8");

      // Step 3: Render SVG to PNG in a new tab
      console.log("  Rendering SVG to PNG...");
      const svgPage = await browser.newPage();
      await svgPage.setViewport({ width: 1280, height: 800 });

      // Encode SVG for embedding in an img tag
      const svgBase64 = Buffer.from(svgString).toString("base64");
      const htmlContent = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { background: #fff; }
  img { display: block; max-width: 1280px; }
</style></head><body>
  <img id="svg-img" src="data:image/svg+xml;base64,${svgBase64}" />
</body></html>`;

      await svgPage.setContent(htmlContent, { waitUntil: "networkidle0" });

      // Wait for the image to load
      await svgPage.waitForFunction(
        () => {
          const img = document.getElementById("svg-img");
          return img && img.complete && img.naturalWidth > 0;
        },
        { timeout: 10_000 },
      );

      // Wait a bit more for rendering
      await new Promise((r) => setTimeout(r, 500));

      const svgImg = await svgPage.$("#svg-img");
      await svgImg.screenshot({
        path: resolve(siteDir, "dom2svg.png"),
        type: "png",
      });

      await svgPage.close();
      await page.close();

      results.push({ name: site.name, url: site.url });
      console.log("  Done.");
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ name: site.name, url: site.url, error: err.message });
    }
  }

  await browser.close();

  // Step 4: Generate gallery
  console.log("\nGenerating gallery...");
  const galleryPath = resolve(OUTPUT_DIR, "index.html");
  writeFileSync(galleryPath, generateGallery(results), "utf-8");
  console.log(`Gallery: ${galleryPath}`);

  // Step 5: Open in browser
  openInBrowser(galleryPath);
  console.log("Opened in browser.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
