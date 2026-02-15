import type { RenderContext } from "../types.js";
import { createSvgElement, setAttributes } from "../utils/dom.js";

export interface TextShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

/**
 * Parse a CSS text-shadow value into an array of TextShadow objects.
 * Syntax: offsetX offsetY [blur] [color], ...
 * Color can appear before or after the numeric values.
 */
export function parseTextShadows(value: string): TextShadow[] {
  if (!value || value === "none") return [];

  const shadows: TextShadow[] = [];
  const parts = splitTopLevelCommas(value);

  for (const part of parts) {
    const shadow = parseSingleTextShadow(part.trim());
    if (shadow) shadows.push(shadow);
  }

  return shadows;
}

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

function parseSingleTextShadow(value: string): TextShadow | null {
  // Tokenize respecting parentheses
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
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
    offsetX: numericValues[0]!,
    offsetY: numericValues[1]!,
    blur: numericValues[2] ?? 0,
    color: colorParts.join(" ") || "rgba(0, 0, 0, 0.5)",
  };
}

/**
 * Create an SVG filter that applies text-shadow effects.
 * Uses chained feDropShadow primitives, merging all shadows with the source.
 * Returns the filter ID, or null if no shadows.
 */
export function createTextShadowFilter(
  shadows: TextShadow[],
  ctx: RenderContext,
): string | null {
  if (shadows.length === 0) return null;

  const id = ctx.idGenerator.next("tshadow");
  const filter = createSvgElement(ctx.svgDocument, "filter");
  setAttributes(filter, {
    id,
    x: "-50%",
    y: "-50%",
    width: "200%",
    height: "200%",
  });

  if (shadows.length === 1) {
    // Single shadow: use feDropShadow (preserves source graphic automatically)
    const s = shadows[0]!;
    const feDrop = createSvgElement(ctx.svgDocument, "feDropShadow");
    setAttributes(feDrop, {
      dx: s.offsetX,
      dy: s.offsetY,
      stdDeviation: s.blur / 2,
      "flood-color": s.color,
      "flood-opacity": 1,
    });
    filter.appendChild(feDrop);
  } else {
    // Multiple shadows: chain feOffset + feGaussianBlur + feFlood + feComposite,
    // then feMerge all shadow results with the source graphic.
    const mergeInputs: string[] = [];

    for (let i = 0; i < shadows.length; i++) {
      const s = shadows[i]!;
      const suffix = String(i);

      // Offset the source alpha
      const feOffset = createSvgElement(ctx.svgDocument, "feOffset");
      setAttributes(feOffset, {
        in: "SourceAlpha",
        dx: s.offsetX,
        dy: s.offsetY,
        result: `off${suffix}`,
      });
      filter.appendChild(feOffset);

      // Blur it
      const feBlur = createSvgElement(ctx.svgDocument, "feGaussianBlur");
      setAttributes(feBlur, {
        in: `off${suffix}`,
        stdDeviation: s.blur / 2,
        result: `blur${suffix}`,
      });
      filter.appendChild(feBlur);

      // Flood with shadow color
      const feFlood = createSvgElement(ctx.svgDocument, "feFlood");
      setAttributes(feFlood, {
        "flood-color": s.color,
        "flood-opacity": 1,
        result: `color${suffix}`,
      });
      filter.appendChild(feFlood);

      // Composite flood color with blurred alpha
      const feComp = createSvgElement(ctx.svgDocument, "feComposite");
      setAttributes(feComp, {
        in: `color${suffix}`,
        in2: `blur${suffix}`,
        operator: "in",
        result: `shadow${suffix}`,
      });
      filter.appendChild(feComp);

      mergeInputs.push(`shadow${suffix}`);
    }

    // Merge all shadows + original source graphic
    const feMerge = createSvgElement(ctx.svgDocument, "feMerge");
    for (const input of mergeInputs) {
      const node = createSvgElement(ctx.svgDocument, "feMergeNode");
      node.setAttribute("in", input);
      feMerge.appendChild(node);
    }
    // Source graphic on top
    const srcNode = createSvgElement(ctx.svgDocument, "feMergeNode");
    srcNode.setAttribute("in", "SourceGraphic");
    feMerge.appendChild(srcNode);
    filter.appendChild(feMerge);
  }

  ctx.defs.appendChild(filter);
  return id;
}
