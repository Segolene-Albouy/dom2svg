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
  const rootRect = rootElement.getBoundingClientRect();

  // Use Range to get per-line client rects
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const rects = range.getClientRects();

  if (rects.length === 0) return null;

  const group = createSvgElement(ctx.svgDocument, "g");
  const lines = getTextLines(textNode, rootRect);

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

  const textTransform = styles.textTransform;

  for (const line of lines) {
    const displayText = applyTextTransform(line.text, textTransform);
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
 *   y = top + (lineBoxHeight - fontSize) / 2 + fontSize * 0.8
 *
 * The 0.8 factor approximates the ascender ratio for common Latin fonts
 * (actual values: Arial 0.905, Helvetica 0.77, system-ui ~0.82).
 */
function baselineY(
  rectTop: number,
  rectHeight: number,
  fontSize: number,
  rootTop: number,
): number {
  const topPadding = (rectHeight - fontSize) / 2;
  return rectTop - rootTop + topPadding + fontSize * 0.8;
}

/** Get per-line text and positions using Range API */
function getTextLines(textNode: Text, rootRect: DOMRect): TextLine[] {
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
      y: baselineY(rect.top, rect.height, fontSize, rootRect.top),
    });
    return lines;
  }

  // Multi-line: iterate character by character to determine line breaks
  let currentLine = "";
  let currentRect: DOMRect | null = null;

  for (let i = 0; i < text.length; i++) {
    range.setStart(textNode, i);
    range.setEnd(textNode, i + 1);
    const charRects = range.getClientRects();
    if (charRects.length === 0) continue;

    const charRect = charRects[0]!;

    if (currentRect === null) {
      currentRect = charRect;
      currentLine = text[i]!;
    } else if (Math.abs(charRect.top - currentRect.top) > fontSize * 0.5) {
      lines.push({
        text: currentLine,
        x: currentRect.left - rootRect.left,
        y: baselineY(currentRect.top, currentRect.height, fontSize, rootRect.top),
      });
      currentLine = text[i]!;
      currentRect = charRect;
    } else {
      currentLine += text[i];
    }
  }

  if (currentLine && currentRect) {
    lines.push({
      text: currentLine,
      x: currentRect.left - rootRect.left,
      y: baselineY(currentRect.top, currentRect.height, fontSize, rootRect.top),
    });
  }

  return lines;
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
    if (styles.textDecoration.includes("underline")) {
      textEl.setAttribute("text-decoration", "underline");
    } else if (styles.textDecoration.includes("line-through")) {
      textEl.setAttribute("text-decoration", "line-through");
    }
  }

  // NOTE: We intentionally do NOT set text-anchor based on text-align.
  // Range API getClientRects() returns the actual rendered left edge of
  // each line, which already accounts for centering/right-alignment.
  // Setting text-anchor: middle would re-center around that left edge,
  // shifting text incorrectly.
}
