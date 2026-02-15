#!/usr/bin/env node

import { launch } from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, "..", "dist", "cli-bundle.global.js");

// ── Arg parsing ─────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
Usage: dom2svg <url> [options]

Convert a web page (or element) to a vector SVG screenshot.

Arguments:
  <url>                   URL of the page to capture

Options:
  -o, --output <file>     Output file (default: stdout)
  -s, --selector <css>    CSS selector for target element (default: "body")
  -b, --background <color> SVG background color
  -p, --padding <px>      Padding around the element in px (default: 0)
      --width <px>        Viewport width (default: 1280)
      --height <px>       Viewport height (default: 800)
      --wait <ms>         Extra wait time after page load in ms (default: 0)
      --chrome <path>     Path to Chrome/Chromium executable
  -h, --help              Show this help message
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    url: null,
    output: null,
    selector: "body",
    background: undefined,
    padding: 0,
    width: 1280,
    height: 800,
    wait: 0,
    chrome: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-o":
      case "--output":
        opts.output = args[++i];
        break;
      case "-s":
      case "--selector":
        opts.selector = args[++i];
        break;
      case "-b":
      case "--background":
        opts.background = args[++i];
        break;
      case "-p":
      case "--padding":
        opts.padding = Number(args[++i]);
        break;
      case "--width":
        opts.width = Number(args[++i]);
        break;
      case "--height":
        opts.height = Number(args[++i]);
        break;
      case "--wait":
        opts.wait = Number(args[++i]);
        break;
      case "--chrome":
        opts.chrome = args[++i];
        break;
      default:
        if (!arg.startsWith("-") && !opts.url) {
          opts.url = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return opts;
}

// ── Chrome detection ────────────────────────────────────────────────────────

function findChrome(override) {
  if (override) return override;

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

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!opts.url) {
    console.error("Error: URL argument is required.\n");
    printHelp();
    process.exit(1);
  }

  if (!existsSync(BUNDLE_PATH)) {
    console.error(
      `Error: CLI bundle not found at ${BUNDLE_PATH}\nRun "npm run build" first.`,
    );
    process.exit(1);
  }

  const chromePath = findChrome(opts.chrome);
  if (!chromePath) {
    console.error(
      "Error: Could not find Chrome/Chromium.\n" +
        "Install Chrome or pass --chrome <path> or set CHROME_PATH.",
    );
    process.exit(1);
  }

  const browser = await launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setBypassCSP(true);
    await page.setViewport({ width: opts.width, height: opts.height });
    await page.goto(opts.url, { waitUntil: "networkidle0", timeout: 30_000 });

    if (opts.wait > 0) {
      await new Promise((r) => setTimeout(r, opts.wait));
    }

    await page.addScriptTag({ path: BUNDLE_PATH });

    const svgString = await page.evaluate(
      (selector, options) => window.__dom2svg(selector, options),
      opts.selector,
      { background: opts.background, padding: opts.padding },
    );

    if (opts.output) {
      writeFileSync(opts.output, svgString, "utf-8");
      console.error(`Saved: ${opts.output}`);
    } else {
      process.stdout.write(svgString);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
