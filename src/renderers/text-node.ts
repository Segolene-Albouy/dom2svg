import type { RenderContext } from "../types.js";
import { createSvgElement, setAttributes } from "../utils/dom.js";
import { textToPath, cleanFontFamily } from "../assets/fonts.js";
import { parseTextShadows, createTextShadowFilter } from "../assets/text-shadow.js";

/**
 * Render a DOM Text node as SVG <text> or <path> elements.
 * Uses Range API to get precise per-line positioning.
 * When textToPath is enabled and a font is available, renders as <path>.
 */
export async function renderTextNode(
  textNode: Text,
  rootElement: Element,
  ctx: RenderContext,
): Promise<SVGElement | null> {
  const text = textNode.textContent;
  if (!text || !text.trim()) return null;

  const parent = textNode.parentElement;
  if (!parent) return null;

  const styles = window.getComputedStyle(parent);
  if (styles.visibility === "hidden") return null;
  const whiteSpace = styles.whiteSpace;
  const rootRect = rootElement.getBoundingClientRect();

  // Use Range to get per-line client rects
  let rects: DOMRectList;
  try {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    rects = range.getClientRects();
  } catch {
    return null;
  }

  if (rects.length === 0) return null;

  const group = createSvgElement(ctx.svgDocument, "g");

  // Determine if we should use path mode
  const usePathMode = ctx.options.textToPath && ctx.fontCache;
  const fontFamily = cleanFontFamily(styles.fontFamily);
  const fontSize = parseFloat(styles.fontSize) || 16;
  const fontWeight = styles.fontWeight;
  const fontStyle = styles.fontStyle;

  let font: any = null;
  if (usePathMode && ctx.fontCache?.has(fontFamily)) {
    font = await ctx.fontCache.getFont(fontFamily, fontWeight, fontStyle);
  }

  // Use font's actual ascender metric when available, otherwise 0.8 approximation
  let ascenderRatio = 0.8;
  if (font && font.ascender && font.unitsPerEm) {
    ascenderRatio = font.ascender / font.unitsPerEm;
  }

  const lines = getTextLines(textNode, rootRect, ascenderRatio, whiteSpace);
  const textTransform = styles.textTransform;

  // Detect text-overflow: ellipsis
  const needsEllipsis =
    styles.textOverflow === "ellipsis" &&
    styles.overflow !== "visible" &&
    styles.whiteSpace === "nowrap" &&
    parent.scrollWidth > parent.clientWidth;

  for (const line of lines) {
    let displayText = applyTextTransform(line.text, textTransform);

    // Append ellipsis to the last line when text overflows
    if (needsEllipsis && line === lines[lines.length - 1]) {
      displayText = displayText.trimEnd() + "\u2026";
    }
    if (font) {
      // Path mode: convert text to <path>
      const pathData = textToPath(font, displayText, line.x, line.y, fontSize);
      if (pathData) {
        const pathEl = createSvgElement(ctx.svgDocument, "path");
        setAttributes(pathEl, {
          d: pathData,
          fill: styles.color,
        });
        group.appendChild(pathEl);
      }
    } else {
      // Text mode: use <text> elements
      const textEl = createSvgElement(ctx.svgDocument, "text");
      setAttributes(textEl, {
        x: line.x.toFixed(2),
        y: line.y.toFixed(2),
      });
      applyTextStyles(textEl, styles);
      textEl.textContent = displayText;
      group.appendChild(textEl);
    }
  }

  if (group.childNodes.length === 0) return null;

  // Apply text-shadow filter if present
  const textShadowValue = styles.textShadow;
  if (textShadowValue && textShadowValue !== "none") {
    const shadows = parseTextShadows(textShadowValue);
    const filterId = createTextShadowFilter(shadows, ctx);
    if (filterId) {
      group.setAttribute("filter", `url(#${filterId})`);
    }
  }

  return group;
}

interface TextLine {
  text: string;
  x: number;
  y: number;
}

/**
 * Compute the SVG baseline y from a Range rect.
 *
 * Range API returns the full line box (height includes line-height spacing).
 * SVG <text> y positions at the alphabetic baseline.
 * We center the font within the line box, then offset to the baseline:
 *   y = top + (lineBoxHeight - fontSize) / 2 + fontSize * ascenderRatio
 *
 * When an opentype font is available, we use its actual ascender metric.
 * Otherwise we fall back to 0.8 which approximates common Latin fonts.
 *
 * When the Range rect is inflated by tall inline siblings (e.g. KaTeX
 * strut/pstrut elements that are 3em inline-blocks), the parent element's
 * bounding rect gives the actual text area. We detect inflation by comparing
 * rectHeight against parentHeight and use the parent's metrics instead.
 */
function baselineY(
  rectTop: number,
  rectHeight: number,
  fontSize: number,
  rootTop: number,
  ascenderRatio: number = 0.8,
  parentRect?: { top: number; height: number },
): number {
  let effectiveTop = rectTop;
  let effectiveHeight = rectHeight;

  // If the Range rect is much taller than the parent element, the line box
  // was inflated by tall inline siblings (struts). Use the parent's bounds
  // for a more accurate baseline calculation.
  if (parentRect && rectHeight > fontSize * 2 && parentRect.height < rectHeight * 0.8) {
    effectiveTop = parentRect.top;
    effectiveHeight = parentRect.height;
  }

  const topPadding = (effectiveHeight - fontSize) / 2;
  return effectiveTop - rootTop + topPadding + fontSize * ascenderRatio;
}

/** Get per-line text and positions using Range API */
function getTextLines(textNode: Text, rootRect: DOMRect, ascenderRatio: number = 0.8, whiteSpace: string = "normal"): TextLine[] {
  const lines: TextLine[] = [];
  const text = textNode.textContent || "";
  if (!text) return lines;

  const parent = textNode.parentElement;
  if (!parent) return lines;

  const styles = window.getComputedStyle(parent);
  const fontSize = parseFloat(styles.fontSize) || 16;

  // Get parent element's bounding rect for inflated line box detection.
  // When tall inline siblings (e.g. KaTeX struts) inflate the Range rect,
  // the parent element's rect reflects the actual text area.
  const pRect = parent.getBoundingClientRect();
  const parentRect = { top: pRect.top, height: pRect.height };

  const range = document.createRange();
  range.selectNodeContents(textNode);
  const rects = range.getClientRects();

  if (rects.length === 0) return lines;

  // Determine per-line rects. Range.getClientRects() normally returns one
  // rect per visual line, but in some cases (e.g. text inside flex/grid
  // columns with overflow clipping) it may return a single bounding rect
  // even when the text wraps. Detect this by probing character positions.
  let lineRects: DOMRect[];

  if (rects.length === 1) {
    const rect = rects[0]!;
    if (text.length > 1 && textActuallyWraps(textNode, range, text.length, fontSize)) {
      lineRects = discoverLineRects(textNode, range, text.length, fontSize);
    } else {
      lines.push({
        text: normalizeWhitespace(text, whiteSpace),
        x: rect.left - rootRect.left,
        y: baselineY(rect.top, rect.height, fontSize, rootRect.top, ascenderRatio, parentRect),
      });
      return lines;
    }
  } else {
    lineRects = Array.from(rects);
  }

  // Multi-line: use line rects as guides, binary search for breakpoints.
  let charStart = 0;

  for (let lineIdx = 0; lineIdx < lineRects.length; lineIdx++) {
    const lineRect = lineRects[lineIdx]!;
    const isLastLine = lineIdx === lineRects.length - 1;

    let charEnd: number;
    if (isLastLine) {
      charEnd = text.length;
    } else {
      // Binary search for the first character past the current line
      const currentTop = lineRect.top;
      charEnd = binarySearchLineBreak(textNode, range, charStart, text.length, currentTop, fontSize);
    }

    const lineText = normalizeWhitespace(text.slice(charStart, charEnd), whiteSpace);
    if (lineText) {
      lines.push({
        text: lineText,
        x: lineRect.left - rootRect.left,
        y: baselineY(lineRect.top, lineRect.height, fontSize, rootRect.top, ascenderRatio, parentRect),
      });
    }
    charStart = charEnd;
  }

  return lines;
}

/** Binary search for the first character that falls past the current visual line */
function binarySearchLineBreak(
  textNode: Text,
  range: Range,
  start: number,
  end: number,
  currentLineTop: number,
  fontSize: number,
): number {
  while (start < end) {
    const mid = Math.floor((start + end) / 2);
    try {
      range.setStart(textNode, mid);
      range.setEnd(textNode, mid + 1);
    } catch {
      // Can throw on multi-byte characters (emoji, CJK surrogate pairs)
      start = mid + 1;
      continue;
    }
    const rects = range.getClientRects();
    if (rects.length === 0) {
      start = mid + 1;
      continue;
    }
    if (Math.abs(rects[0]!.top - currentLineTop) > fontSize * 0.5) {
      end = mid; // This char is past the current line, search earlier
    } else {
      start = mid + 1; // Still on current line
    }
  }
  return start;
}

/** Check if text wraps despite getClientRects() returning a single rect */
function textActuallyWraps(
  textNode: Text,
  range: Range,
  textLength: number,
  fontSize: number,
): boolean {
  if (textLength <= 1) return false;
  try {
    range.setStart(textNode, 0);
    range.setEnd(textNode, 1);
    const firstRects = range.getClientRects();
    range.setStart(textNode, textLength - 1);
    range.setEnd(textNode, textLength);
    const lastRects = range.getClientRects();
    if (firstRects.length > 0 && lastRects.length > 0) {
      return Math.abs(lastRects[0]!.top - firstRects[0]!.top) > fontSize * 0.5;
    }
  } catch {
    // Ignore errors with multi-byte characters
  }
  return false;
}

/** Discover per-line DOMRects by scanning character positions */
function discoverLineRects(
  textNode: Text,
  range: Range,
  textLength: number,
  fontSize: number,
): DOMRect[] {
  const lineRects: DOMRect[] = [];
  let currentLineTop = -Infinity;
  for (let i = 0; i < textLength; i++) {
    try {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const charRects = range.getClientRects();
      if (charRects.length === 0) continue;
      const charRect = charRects[0]!;
      if (Math.abs(charRect.top - currentLineTop) > fontSize * 0.5) {
        lineRects.push(charRect);
        currentLineTop = charRect.top;
      }
    } catch {
      continue;
    }
  }
  return lineRects;
}

/**
 * Normalize text content to match CSS whitespace rendering.
 * SVG text elements use xml:space="preserve" so we must collapse
 * whitespace ourselves to match how CSS renders the text.
 */
function normalizeWhitespace(text: string, whiteSpace: string): string {
  const preserves = whiteSpace === "pre" || whiteSpace === "pre-wrap" || whiteSpace === "break-spaces";
  if (preserves) return text;
  if (whiteSpace === "pre-line") {
    // Collapse spaces/tabs but preserve newlines
    return text.replace(/[^\S\n]+/g, " ");
  }
  // white-space: normal | nowrap — collapse all whitespace to single spaces
  return text.replace(/\s+/g, " ");
}

/** Apply CSS text-transform to a string */
function applyTextTransform(text: string, transform: string): string {
  switch (transform) {
    case "uppercase": return text.toUpperCase();
    case "lowercase": return text.toLowerCase();
    case "capitalize": return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default: return text;
  }
}

/** Apply CSS text styles to an SVG <text> element */
function applyTextStyles(
  textEl: SVGTextElement,
  styles: CSSStyleDeclaration,
): void {
  setAttributes(textEl, {
    "font-family": styles.fontFamily,
    "font-size": styles.fontSize,
    "font-weight": styles.fontWeight,
    "font-style": styles.fontStyle,
    fill: styles.color,
  });

  // Preserve whitespace so that leading/trailing spaces in normalized text
  // are rendered (matching CSS's inline whitespace between elements).
  textEl.setAttribute("xml:space", "preserve");

  if (styles.letterSpacing && styles.letterSpacing !== "normal") {
    textEl.setAttribute("letter-spacing", styles.letterSpacing);
  }

  if (styles.wordSpacing && styles.wordSpacing !== "normal") {
    textEl.setAttribute("word-spacing", styles.wordSpacing);
  }

  if (styles.textDecoration && styles.textDecoration !== "none") {
    const decs: string[] = [];
    if (styles.textDecoration.includes("underline")) decs.push("underline");
    if (styles.textDecoration.includes("line-through")) decs.push("line-through");
    if (decs.length > 0) {
      textEl.setAttribute("text-decoration", decs.join(" "));
    }
  }

  // NOTE: We intentionally do NOT set text-anchor based on text-align.
  // Range API getClientRects() returns the actual rendered left edge of
  // each line, which already accounts for centering/right-alignment.
  // Setting text-anchor: middle would re-center around that left edge,
  // shifting text incorrectly.
}
