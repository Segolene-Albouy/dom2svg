#!/usr/bin/env node
/**
 * Inspect Wikipedia sidebar toggle elements (disclosure triangles).
 */
import { launch } from "puppeteer-core";
import { existsSync } from "node:fs";

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
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("https://en.wikipedia.org/wiki/SVG", { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  const result = await page.evaluate(() => {
    const info = {};

    // Find the sidebar TOC section toggles
    // These are the ▸/▾ arrows next to "History", "Features", "Implementation"
    const tocLinks = document.querySelectorAll('.vector-toc-toggle, .sidebar-toc-toggle-button, .vector-toc-list-item--active button, [class*="toc"] button');
    info.tocToggles = Array.from(tocLinks).slice(0, 5).map(el => {
      const styles = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const after = getComputedStyle(el, '::after');
      return {
        tag: el.tagName,
        class: el.className?.toString?.()?.slice(0, 100),
        id: el.id,
        innerHTML: el.innerHTML.slice(0, 300),
        outerHTML: el.outerHTML.slice(0, 300),
        display: styles.display,
        width: styles.width,
        height: styles.height,
        bgColor: styles.backgroundColor,
        maskImage: (styles.webkitMaskImage || (styles).maskImage || '').slice(0, 200),
        bgImage: styles.backgroundImage?.slice(0, 200),
        beforeContent: before.content,
        beforeDisplay: before.display,
        beforeBg: before.backgroundImage?.slice(0, 200),
        beforeMask: (before.webkitMaskImage || (before).maskImage || '').slice(0, 200),
        afterContent: after.content,
        afterBg: after.backgroundImage?.slice(0, 200),
        afterMask: (after.webkitMaskImage || (after).maskImage || '').slice(0, 200),
      };
    });

    // Also look at the parent list items
    const tocItems = document.querySelectorAll('.vector-toc-list-item');
    info.tocItems = Array.from(tocItems).slice(0, 5).map(el => {
      const styles = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      // Look for any child elements that might be the toggle
      const children = Array.from(el.children).slice(0, 5);
      return {
        tag: el.tagName,
        class: el.className?.toString?.()?.slice(0, 100),
        childrenTags: children.map(c => `${c.tagName}.${c.className?.toString?.()?.slice(0, 50)}`),
        beforeContent: before.content,
        beforeMask: (before.webkitMaskImage || (before).maskImage || '').slice(0, 200),
        beforeBg: before.backgroundImage?.slice(0, 200),
        listStyle: styles.listStyleType,
      };
    });

    // Look for elements with mask-image near the sidebar area
    const sidebar = document.querySelector('#vector-toc, .sidebar-toc, .vector-toc');
    if (sidebar) {
      const allEls = sidebar.querySelectorAll('*');
      const masked = [];
      for (const el of Array.from(allEls)) {
        const styles = getComputedStyle(el);
        const mask = styles.webkitMaskImage || (styles).maskImage || '';
        if (mask && mask !== 'none') {
          masked.push({
            tag: el.tagName,
            class: el.className?.toString?.()?.slice(0, 80),
            mask: mask.slice(0, 200),
            width: styles.width,
            height: styles.height,
          });
        }
        const before = getComputedStyle(el, '::before');
        const bMask = before.webkitMaskImage || (before).maskImage || '';
        if (bMask && bMask !== 'none') {
          masked.push({
            tag: el.tagName + '::before',
            class: el.className?.toString?.()?.slice(0, 80),
            mask: bMask.slice(0, 200),
          });
        }
      }
      info.sidebarMaskedElements = masked;
    }

    return info;
  });

  console.log(JSON.stringify(result, null, 2));

  await page.close();
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
