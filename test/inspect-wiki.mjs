#!/usr/bin/env node
/**
 * Inspect Wikipedia icon elements to understand what they are.
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

    // 1. Hamburger menu button (top-left)
    const hamburger = document.querySelector('#vector-main-menu-dropdown, .mw-header button, .vector-menu-heading, #p-navigation button, .mw-checkbox-hack-button');
    if (hamburger) {
      const styles = getComputedStyle(hamburger);
      const before = getComputedStyle(hamburger, '::before');
      const after = getComputedStyle(hamburger, '::after');
      info.hamburger = {
        tag: hamburger.tagName,
        class: hamburger.className,
        id: hamburger.id,
        innerHTML: hamburger.innerHTML.slice(0, 500),
        backgroundImage: styles.backgroundImage?.slice(0, 200),
        maskImage: styles.webkitMaskImage?.slice(0, 200) || styles.maskImage?.slice(0, 200),
        beforeContent: before.content,
        beforeBg: before.backgroundImage?.slice(0, 200),
        beforeMask: before.webkitMaskImage?.slice(0, 200) || before.maskImage?.slice(0, 200),
        afterContent: after.content,
      };
    }

    // Try to find the hamburger by looking at the first SVG near the top
    const headerSvgs = document.querySelectorAll('header svg, .mw-header svg, nav svg');
    info.headerSvgs = Array.from(headerSvgs).slice(0, 5).map(svg => ({
      parent: svg.parentElement?.tagName + '.' + svg.parentElement?.className?.slice?.(0, 50),
      innerHTML: svg.innerHTML.slice(0, 300),
      outerHTML: svg.outerHTML.slice(0, 300),
    }));

    // 2. Search icon
    const searchIcon = document.querySelector('#searchInput, .cdx-text-input, .vector-search-box');
    if (searchIcon) {
      const styles = getComputedStyle(searchIcon);
      const before = getComputedStyle(searchIcon, '::before');
      info.searchIcon = {
        tag: searchIcon.tagName,
        class: searchIcon.className,
        backgroundImage: styles.backgroundImage?.slice(0, 200),
        beforeContent: before.content,
        beforeBg: before.backgroundImage?.slice(0, 200),
        beforeMask: before.webkitMaskImage?.slice(0, 200),
      };
    }

    // Look for the search icon SVG or pseudo-element
    const searchContainer = document.querySelector('.cdx-text-input__icon, .search-icon, .vector-search-box-vue .cdx-search-input__icon');
    if (searchContainer) {
      const styles = getComputedStyle(searchContainer);
      const before = getComputedStyle(searchContainer, '::before');
      info.searchIconContainer = {
        tag: searchContainer.tagName,
        class: searchContainer.className,
        innerHTML: searchContainer.innerHTML.slice(0, 300),
        backgroundImage: styles.backgroundImage?.slice(0, 200),
        beforeBg: before.backgroundImage?.slice(0, 200),
        beforeMask: before.webkitMaskImage?.slice(0, 200),
        maskImage: styles.webkitMaskImage?.slice(0, 200) || styles.maskImage?.slice(0, 200),
      };
    }

    // 3. Sidebar disclosure triangles (the ▸ arrows)
    const sidebarItems = document.querySelectorAll('.vector-toc .vector-toc-toggle, .sidebar-toc .sidebar-toc-toggle-button, .vector-menu-content-list .mw-list-item');
    info.sidebarToggles = Array.from(sidebarItems).slice(0, 3).map(el => {
      const styles = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      return {
        tag: el.tagName,
        class: el.className,
        innerHTML: el.innerHTML?.slice(0, 200),
        backgroundImage: styles.backgroundImage?.slice(0, 200),
        beforeContent: before.content,
        beforeBg: before.backgroundImage?.slice(0, 200),
        beforeMask: before.webkitMaskImage?.slice(0, 200),
      };
    });

    // 4. Look more broadly for elements that use mask-image or background-image with SVG
    const allElements = document.querySelectorAll('header *, .mw-header *, .vector-header *');
    const iconElements = [];
    for (const el of Array.from(allElements).slice(0, 200)) {
      const styles = getComputedStyle(el);
      const maskImg = styles.webkitMaskImage || styles.maskImage || '';
      const bgImg = styles.backgroundImage || '';
      if ((maskImg && maskImg !== 'none') || (bgImg && bgImg !== 'none' && bgImg.includes('svg'))) {
        iconElements.push({
          tag: el.tagName,
          class: el.className?.toString?.()?.slice(0, 80),
          maskImage: maskImg.slice(0, 200),
          backgroundImage: bgImg.slice(0, 200),
          width: styles.width,
          height: styles.height,
        });
      }
      // Check ::before too
      const before = getComputedStyle(el, '::before');
      const bMask = before.webkitMaskImage || before.maskImage || '';
      const bBg = before.backgroundImage || '';
      if ((bMask && bMask !== 'none') || (bBg && bBg !== 'none' && bBg.includes('svg'))) {
        iconElements.push({
          tag: el.tagName + '::before',
          class: el.className?.toString?.()?.slice(0, 80),
          maskImage: bMask.slice(0, 200),
          backgroundImage: bBg.slice(0, 200),
        });
      }
    }
    info.iconElements = iconElements;

    // 5. Language icon
    const langIcon = document.querySelector('.mw-interlanguage-selector, #p-lang-btn .mw-ui-icon, .mw-portlet-lang .uls-settings-trigger');
    if (langIcon) {
      const styles = getComputedStyle(langIcon);
      const before = getComputedStyle(langIcon, '::before');
      info.langIcon = {
        tag: langIcon.tagName,
        class: langIcon.className,
        innerHTML: langIcon.innerHTML?.slice(0, 300),
        backgroundImage: styles.backgroundImage?.slice(0, 200),
        maskImage: styles.webkitMaskImage?.slice(0, 200),
        beforeMask: before.webkitMaskImage?.slice(0, 200),
      };
    }

    return info;
  });

  console.log(JSON.stringify(result, null, 2));

  await page.close();
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
