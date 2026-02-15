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

  for (const line of lines) {
    if (font) {
      // Path mode: convert text to <path>
      const pathData = textToPath(font, line.text, line.x, line.y, fontSize);
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
      textEl.textContent = line.text;
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
      y: rect.top - rootRect.top + fontSize * 0.85,
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
        y: currentRect.top - rootRect.top + fontSize * 0.85,
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
      y: currentRect.top - rootRect.top + fontSize * 0.85,
    });
  }

  return lines;
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

  const align = styles.textAlign;
  if (align === "center") {
    textEl.setAttribute("text-anchor", "middle");
  } else if (align === "right" || align === "end") {
    textEl.setAttribute("text-anchor", "end");
  }
}
