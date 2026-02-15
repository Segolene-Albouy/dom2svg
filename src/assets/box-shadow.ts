import type { RenderContext, BoxGeometry, BorderRadii } from "../types.js";
import { createSvgElement, setAttributes } from "../utils/dom.js";
import { buildRoundedRectPath } from "../utils/geometry.js";
import { hasRadius, isUniformRadius } from "../core/styles.js";

export interface BoxShadow {
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
}

/**
 * Parse a CSS box-shadow value into an array of BoxShadow objects.
 * Supports multiple shadows, inset, spread, blur, and color in various formats.
 */
export function parseBoxShadows(value: string): BoxShadow[] {
  if (!value || value === "none") return [];

  const shadows: BoxShadow[] = [];
  const parts = splitTopLevelCommas(value);

  for (const part of parts) {
    const shadow = parseSingleShadow(part.trim());
    if (shadow) shadows.push(shadow);
  }

  return shadows;
}

/** Split on commas at depth 0 (respecting parentheses) */
function splitTopLevelCommas(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of str) {
    if (char === "(") depth++;
    else if (char === ")") depth--;

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Parse a single box-shadow value */
function parseSingleShadow(value: string): BoxShadow | null {
  let inset = false;
  let working = value;

  // Check for inset keyword
  if (working.startsWith("inset ")) {
    inset = true;
    working = working.slice(6).trim();
  } else if (working.endsWith(" inset")) {
    inset = true;
    working = working.slice(0, -6).trim();
  }

  // Tokenize respecting parentheses
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of working) {
    if (char === "(") depth++;
    else if (char === ")") depth--;

    if (char === " " && depth === 0 && current) {
      tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);

  // Separate numeric (px) tokens from color tokens
  const numericValues: number[] = [];
  const colorParts: string[] = [];

  for (const token of tokens) {
    const num = parseFloat(token);
    if (!isNaN(num) && (token.endsWith("px") || token.match(/^-?[\d.]+$/))) {
      numericValues.push(num);
    } else {
      colorParts.push(token);
    }
  }

  if (numericValues.length < 2) return null;

  return {
    inset,
    offsetX: numericValues[0]!,
    offsetY: numericValues[1]!,
    blur: numericValues[2] ?? 0,
    spread: numericValues[3] ?? 0,
    color: colorParts.join(" ") || "rgba(0, 0, 0, 0.3)",
  };
}

/**
 * Render box-shadows as SVG elements. Non-inset shadows use SVG filters
 * for Gaussian blur; inset shadows are approximated similarly.
 * Returns an array of SVG elements to prepend before the element's content.
 */
export function renderBoxShadows(
  shadows: BoxShadow[],
  box: BoxGeometry,
  radii: BorderRadii,
  ctx: RenderContext,
  group: SVGGElement,
): void {
  // CSS renders shadows in reverse order (first shadow = topmost)
  for (let i = shadows.length - 1; i >= 0; i--) {
    const shadow = shadows[i]!;
    if (shadow.inset) {
      renderInsetShadow(shadow, box, radii, ctx, group);
    } else {
      renderOuterShadow(shadow, box, radii, ctx, group);
    }
  }
}

function renderOuterShadow(
  shadow: BoxShadow,
  box: BoxGeometry,
  radii: BorderRadii,
  ctx: RenderContext,
  group: SVGGElement,
): void {
  // Expand box by spread
  const spreadBox: BoxGeometry = {
    x: box.x + shadow.offsetX - shadow.spread,
    y: box.y + shadow.offsetY - shadow.spread,
    width: box.width + shadow.spread * 2,
    height: box.height + shadow.spread * 2,
  };

  // Expand radii by spread
  const spreadRadii = expandRadii(radii, shadow.spread);

  // Create shape
  const shape = createShadowShape(spreadBox, spreadRadii, ctx);
  shape.setAttribute("fill", shadow.color);

  if (shadow.blur > 0) {
    // Create SVG filter for blur
    const filterId = ctx.idGenerator.next("shadow");
    const filter = createSvgElement(ctx.svgDocument, "filter");
    const margin = shadow.blur * 2 + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + shadow.spread;
    // Guard against zero/tiny dimensions to avoid division-by-zero or huge percentages
    const safeW = Math.max(spreadBox.width, 1);
    const safeH = Math.max(spreadBox.height, 1);
    setAttributes(filter, {
      id: filterId,
      x: `-${((margin / safeW) * 100 + 10).toFixed(0)}%`,
      y: `-${((margin / safeH) * 100 + 10).toFixed(0)}%`,
      width: `${(200 + (margin / safeW) * 200 + 20).toFixed(0)}%`,
      height: `${(200 + (margin / safeH) * 200 + 20).toFixed(0)}%`,
    });

    const feGaussianBlur = createSvgElement(ctx.svgDocument, "feGaussianBlur");
    setAttributes(feGaussianBlur, {
      in: "SourceGraphic",
      stdDeviation: shadow.blur / 2,
    });
    filter.appendChild(feGaussianBlur);
    ctx.defs.appendChild(filter);

    shape.setAttribute("filter", `url(#${filterId})`);
  }

  // Insert shadow before existing children (shadows render behind content)
  group.insertBefore(shape, group.firstChild);
}

function renderInsetShadow(
  shadow: BoxShadow,
  box: BoxGeometry,
  radii: BorderRadii,
  ctx: RenderContext,
  group: SVGGElement,
): void {
  // For inset shadows, we draw a filled ring clipped to the box.
  // The ring is a large rect minus the inner shadow shape.
  const clipId = ctx.idGenerator.next("inset-clip");
  const clipPath = createSvgElement(ctx.svgDocument, "clipPath");
  clipPath.setAttribute("id", clipId);
  const clipShape = createShadowShape(box, radii, ctx);
  clipPath.appendChild(clipShape);
  ctx.defs.appendChild(clipPath);

  // Inner shape (shrunk by spread, offset)
  const innerBox: BoxGeometry = {
    x: box.x + shadow.offsetX + shadow.spread,
    y: box.y + shadow.offsetY + shadow.spread,
    width: Math.max(0, box.width - shadow.spread * 2),
    height: Math.max(0, box.height - shadow.spread * 2),
  };
  const innerRadii = expandRadii(radii, -shadow.spread);

  // Use a large outer rect and inner cutout path
  const g = createSvgElement(ctx.svgDocument, "g") as SVGGElement;
  g.setAttribute("clip-path", `url(#${clipId})`);

  // Large surrounding fill
  const outerRect = createSvgElement(ctx.svgDocument, "rect");
  const pad = shadow.blur * 3 + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 100;
  setAttributes(outerRect, {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
    fill: shadow.color,
  });

  // Inner cutout
  const innerShape = createShadowShape(innerBox, innerRadii, ctx);
  innerShape.setAttribute("fill", shadow.color);

  // Use fill-rule evenodd with combined path for cutout effect
  // Simpler: just use the inner shape as a mask
  const maskId = ctx.idGenerator.next("inset-mask");
  const mask = createSvgElement(ctx.svgDocument, "mask");
  mask.setAttribute("id", maskId);

  const maskWhite = createSvgElement(ctx.svgDocument, "rect");
  setAttributes(maskWhite, { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2, fill: "white" });
  const maskBlack = createShadowShape(innerBox, innerRadii, ctx);
  maskBlack.setAttribute("fill", "black");
  mask.appendChild(maskWhite);
  mask.appendChild(maskBlack);
  ctx.defs.appendChild(mask);

  outerRect.setAttribute("mask", `url(#${maskId})`);

  if (shadow.blur > 0) {
    const filterId = ctx.idGenerator.next("inset-blur");
    const filter = createSvgElement(ctx.svgDocument, "filter");
    setAttributes(filter, { id: filterId, x: "-50%", y: "-50%", width: "200%", height: "200%" });
    const feBlur = createSvgElement(ctx.svgDocument, "feGaussianBlur");
    setAttributes(feBlur, { in: "SourceGraphic", stdDeviation: shadow.blur / 2 });
    filter.appendChild(feBlur);
    ctx.defs.appendChild(filter);
    outerRect.setAttribute("filter", `url(#${filterId})`);
  }

  g.appendChild(outerRect);
  group.insertBefore(g, group.firstChild);
}

/** Create a shape element matching the box (rect or rounded-rect path) */
function createShadowShape(
  box: BoxGeometry,
  radii: BorderRadii,
  ctx: RenderContext,
): SVGElement {
  if (hasRadius(radii) && !isUniformRadius(radii)) {
    const path = createSvgElement(ctx.svgDocument, "path");
    path.setAttribute("d", buildRoundedRectPath(box.x, box.y, box.width, box.height, radii));
    return path;
  }

  const rect = createSvgElement(ctx.svgDocument, "rect");
  setAttributes(rect, { x: box.x, y: box.y, width: box.width, height: box.height });

  if (hasRadius(radii) && isUniformRadius(radii)) {
    setAttributes(rect, { rx: radii.topLeft[0], ry: radii.topLeft[1] });
  }

  return rect;
}

/** Expand (or shrink if negative) radii by a given amount */
function expandRadii(radii: BorderRadii, amount: number): BorderRadii {
  return {
    topLeft: [Math.max(0, radii.topLeft[0] + amount), Math.max(0, radii.topLeft[1] + amount)],
    topRight: [Math.max(0, radii.topRight[0] + amount), Math.max(0, radii.topRight[1] + amount)],
    bottomRight: [Math.max(0, radii.bottomRight[0] + amount), Math.max(0, radii.bottomRight[1] + amount)],
    bottomLeft: [Math.max(0, radii.bottomLeft[0] + amount), Math.max(0, radii.bottomLeft[1] + amount)],
  };
}
