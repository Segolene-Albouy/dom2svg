import type { RenderContext } from "../types.js";
import { createSvgElement, setAttributes } from "../utils/dom.js";

/**
 * Parse CSS drop-shadow filter and create an SVG <filter>.
 * Supports: filter: drop-shadow(offsetX offsetY blur color)
 * Returns the filter ID, or null if no drop-shadow found.
 */
export function createDropShadowFilter(
  filterValue: string,
  ctx: RenderContext,
): string | null {
  const parsed = parseDropShadow(filterValue);
  if (!parsed) return null;

  const id = ctx.idGenerator.next("filter");
  const filter = createSvgElement(ctx.svgDocument, "filter");
  setAttributes(filter, {
    id,
    x: "-50%",
    y: "-50%",
    width: "200%",
    height: "200%",
  });

  // feDropShadow is the SVG equivalent
  const feDropShadow = createSvgElement(ctx.svgDocument, "feDropShadow");
  setAttributes(feDropShadow, {
    dx: parsed.offsetX,
    dy: parsed.offsetY,
    stdDeviation: parsed.blur,
    "flood-color": parsed.color,
    "flood-opacity": 1,
  });

  filter.appendChild(feDropShadow);
  ctx.defs.appendChild(filter);

  return id;
}

interface DropShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

function parseDropShadow(value: string): DropShadow | null {
  // Match drop-shadow(...)
  const match = value.match(/drop-shadow\((.+?)\)/);
  if (!match) return null;

  const args = match[1]!.trim();

  // Parse: offsetX offsetY [blur] [color]
  // Color can be at start or end, with various formats
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (const char of args) {
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;

    if (char === " " && parenDepth === 0 && current) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);

  if (parts.length < 2) return null;

  // Find numeric values and color
  const numericParts: number[] = [];
  let color = "rgba(0,0,0,0.3)";

  for (const part of parts) {
    const num = parseFloat(part);
    if (!isNaN(num) && (part.endsWith("px") || part.match(/^-?[\d.]+$/))) {
      numericParts.push(num);
    } else {
      color = part;
    }
  }

  return {
    offsetX: numericParts[0] ?? 0,
    offsetY: numericParts[1] ?? 0,
    blur: numericParts[2] ?? 0,
    color,
  };
}
