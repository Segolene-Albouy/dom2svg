import type { RenderContext } from "../types.js";
import { createSvgElement, setAttributes } from "../utils/dom.js";
import { textToPath, cleanFontFamily } from "../assets/fonts.js";

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

  const lines = getTextLines(textNode, rootRect, ascenderRatio);
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

  return group.childNodes.length > 0 ? group : null;
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
 */
function baselineY(
  rectTop: number,
  rectHeight: number,
  fontSize: number,
  rootTop: number,
  ascenderRatio: number = 0.8,
): number {
  const topPadding = (rectHeight - fontSize) / 2;
  return rectTop - rootTop + topPadding + fontSize * ascenderRatio;
}

/** Get per-line text and positions using Range API */
function getTextLines(textNode: Text, rootRect: DOMRect, ascenderRatio: number = 0.8): TextLine[] {
  const lines: TextLine[] = [];
  const text = textNode.textContent || "";
  if (!text) return lines;

  const parent = textNode.parentElement;
  if (!parent) return lines;

  const styles = window.getComputedStyle(parent);
  const fontSize = parseFloat(styles.fontSize) || 16;

  const range = document.createRange();
  range.selectNodeContents(textNode);
  const rects = range.getClientRects();

  if (rects.length === 0) return lines;

  if (rects.length === 1) {
    const rect = rects[0]!;
    lines.push({
      text,
      x: rect.left - rootRect.left,
      y: baselineY(rect.top, rect.height, fontSize, rootRect.top, ascenderRatio),
    });
    return lines;
  }

  // Multi-line: use whole-node rects as line guides, binary search for breakpoints.
  // This is O(lines * log(n)) instead of O(n) layout queries.
  const lineRects: DOMRect[] = Array.from(rects);
  let charStart = 0;

  for (let lineIdx = 0; lineIdx < lineRects.length; lineIdx++) {
    const lineRect = lineRects[lineIdx]!;
    const isLastLine = lineIdx === lineRects.length - 1;

    let charEnd: number;
    if (isLastLine) {
      charEnd = text.length;
    } else {
      // Binary search for the first character on the next line
      const nextTop = lineRects[lineIdx + 1]!.top;
      charEnd = binarySearchLineBreak(textNode, range, charStart, text.length, nextTop, fontSize);
    }

    const lineText = text.slice(charStart, charEnd);
    if (lineText) {
      lines.push({
        text: lineText,
        x: lineRect.left - rootRect.left,
        y: baselineY(lineRect.top, lineRect.height, fontSize, rootRect.top, ascenderRatio),
      });
    }
    charStart = charEnd;
  }

  return lines;
}

/** Binary search for the first character that falls on the next visual line */
function binarySearchLineBreak(
  textNode: Text,
  range: Range,
  start: number,
  end: number,
  nextLineTop: number,
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
    if (Math.abs(rects[0]!.top - nextLineTop) < fontSize * 0.5) {
      end = mid; // This char is on the next line, search earlier
    } else {
      start = mid + 1; // Still on current line
    }
  }
  return start;
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

  if (styles.letterSpacing && styles.letterSpacing !== "normal") {
    textEl.setAttribute("letter-spacing", styles.letterSpacing);
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
