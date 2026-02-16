#!/usr/bin/env node
/**
 * Quick comparison run for just the GitHub page.
 */
import { launch } from "puppeteer-core";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, "..", "dist", "cli-bundle.global.js");
const OUTPUT_DIR = resolve(__dirname, "compare-output");

function findChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const browser = await launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security", "--allow-file-access-from-files"],
  });

  const siteDir = resolve(OUTPUT_DIR, "dom2svg-gh");
  mkdirSync(siteDir, { recursive: true });

  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: 1280, height: 800 });
  console.log("Loading page...");
  await page.goto("https://github.com/milanofthe/dom2svg", { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  console.log("Taking screenshot...");
  const el = await page.$("body");
  await el.screenshot({ path: resolve(siteDir, "screenshot.png"), type: "png" });

  console.log("Running dom2svg...");
  await page.addScriptTag({ path: BUNDLE_PATH });
  const pageBg = await page.evaluate(() => {
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const isT = c => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)";
    if (!isT(htmlBg)) return htmlBg;
    if (!isT(bodyBg)) return bodyBg;
    return "#ffffff";
  });
  const svgString = await page.evaluate(
    (sel, opts) => window.__dom2svg(sel, opts),
    "body",
    { background: pageBg },
  );
  writeFileSync(resolve(siteDir, "dom2svg.svg"), svgString, "utf-8");

  console.log("Rendering SVG to PNG...");
  const svgPage = await browser.newPage();
  await svgPage.setViewport({ width: 1280, height: 800 });
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
  await svgPage.waitForFunction(() => {
    const img = document.getElementById("svg-img");
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  const svgImg = await svgPage.$("#svg-img");
  await svgImg.screenshot({ path: resolve(siteDir, "dom2svg.png"), type: "png" });

  await svgPage.close();
  await page.close();
  await browser.close();
  console.log("Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
