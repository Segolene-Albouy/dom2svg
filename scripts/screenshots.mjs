#!/usr/bin/env node
/**
 * Capture demo screenshots for the README.
 * Requires: puppeteer-core, Chrome, and the demo dev server running on port 3008.
 *
 * Usage:
 *   node scripts/screenshots.mjs
 */
import puppeteer from "puppeteer-core";
import { resolve } from "path";

const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const URL = "http://localhost:3008";
const OUT = resolve("media");

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--window-size=1400,900"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0" });

  // Click "Export All" and wait for rendering
  await page.click("#btn-export-all");
  await page.waitForFunction(
    () => document.getElementById("status")?.textContent?.startsWith("Done"),
    { timeout: 30_000 },
  );

  // Give SVG render a beat to settle
  await new Promise((r) => setTimeout(r, 500));

  // Helper: screenshot a .split section by finding its preceding h3
  async function captureSection(heading, filename) {
    const box = await page.evaluate((h) => {
      const headings = [...document.querySelectorAll("h3")];
      const h3 = headings.find((el) => el.textContent.includes(h));
      if (!h3) return null;
      const split = h3.nextElementSibling;
      if (!split) return null;
      const r = split.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, heading);

    if (!box) {
      console.warn(`  ⚠ Could not find section "${heading}"`);
      return;
    }

    await page.screenshot({
      path: resolve(OUT, filename),
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });
    console.log(`  ✓ ${filename}`);
  }

  console.log("Capturing screenshots…");
  await captureSection("Node Editor Mock", "demo-node-editor.png");
  await captureSection("Complex Pipeline", "demo-pipeline.png");
  await captureSection("Real-World Components", "demo-components.png");
  await captureSection("Feature Showcase", "demo-features.png");

  // Full-page screenshot
  await page.screenshot({
    path: resolve(OUT, "demo-full.png"),
    fullPage: true,
  });
  console.log("  ✓ demo-full.png");

  await browser.close();
  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
