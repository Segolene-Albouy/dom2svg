import type { RenderContext } from "../types.js";
import { createSvgElement, setAttributes } from "../utils/dom.js";

/** A parsed CSS filter function */
interface CssFilterFunction {
  name: string;
  args: string;
}

/**
 * Parse a CSS filter value and create an SVG <filter> with the equivalent primitives.
 * Supports: blur, brightness, contrast, drop-shadow, grayscale, hue-rotate,
 *           invert, opacity, saturate, sepia.
 * Returns the filter ID, or null if no recognized filter functions found.
 */
export function createSvgFilter(
  filterValue: string,
  ctx: RenderContext,
): string | null {
  const functions = parseCssFilterFunctions(filterValue);
  if (functions.length === 0) return null;

  const id = ctx.idGenerator.next("filter");
  const filter = createSvgElement(ctx.svgDocument, "filter");
  setAttributes(filter, {
    id,
    x: "-50%",
    y: "-50%",
    width: "200%",
    height: "200%",
  });

  let hasAny = false;

  for (const fn of functions) {
    const primitives = createFilterPrimitives(fn, ctx);
    for (const prim of primitives) {
      filter.appendChild(prim);
      hasAny = true;
    }
  }

  if (!hasAny) return null;

  ctx.defs.appendChild(filter);
  return id;
}

/** Parse a numeric value that may have a % suffix. Returns a ratio (1 = 100%). */
function parseFilterAmount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    return (parseFloat(trimmed) || 0) / 100;
  }
  return parseFloat(trimmed) || 0;
}

/** Parse an angle value, returning degrees. Handles deg, rad, grad, turn. */
function parseAngle(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.endsWith("rad")) return (parseFloat(trimmed) || 0) * (180 / Math.PI);
  if (trimmed.endsWith("grad")) return (parseFloat(trimmed) || 0) * 0.9;
  if (trimmed.endsWith("turn")) return (parseFloat(trimmed) || 0) * 360;
  // deg or bare number
  return parseFloat(trimmed) || 0;
}

/** Create SVG filter primitive(s) for a single CSS filter function */
function createFilterPrimitives(
  fn: CssFilterFunction,
  ctx: RenderContext,
): SVGElement[] {
  switch (fn.name) {
    case "blur": {
      // CSS blur() value IS the stdDeviation directly
      const radius = parseFloat(fn.args) || 0;
      const blur = createSvgElement(ctx.svgDocument, "feGaussianBlur");
      setAttributes(blur, { stdDeviation: radius });
      return [blur];
    }

    case "brightness": {
      const amount = parseFilterAmount(fn.args);
      return [createComponentTransfer(ctx, { slope: amount })];
    }

    case "contrast": {
      const amount = parseFilterAmount(fn.args);
      const intercept = 0.5 - 0.5 * amount;
      return [createComponentTransfer(ctx, { slope: amount, intercept })];
    }

    case "drop-shadow": {
      const parsed = parseDropShadow(`drop-shadow(${fn.args})`);
      if (!parsed) return [];
      const shadow = createSvgElement(ctx.svgDocument, "feDropShadow");
      setAttributes(shadow, {
        dx: parsed.offsetX,
        dy: parsed.offsetY,
        stdDeviation: parsed.blur / 2,
        "flood-color": parsed.color,
        "flood-opacity": 1,
      });
      return [shadow];
    }

    case "grayscale": {
      const amount = parseFilterAmount(fn.args);
      const s = Math.max(0, Math.min(1, 1 - amount));
      const matrix = createSvgElement(ctx.svgDocument, "feColorMatrix");
      setAttributes(matrix, { type: "saturate", values: s });
      return [matrix];
    }

    case "hue-rotate": {
      const degrees = parseAngle(fn.args);
      const matrix = createSvgElement(ctx.svgDocument, "feColorMatrix");
      setAttributes(matrix, { type: "hueRotate", values: degrees });
      return [matrix];
    }

    case "invert": {
      const amount = parseFilterAmount(fn.args);
      const lo = amount;
      const hi = 1 - amount;
      return [createComponentTransfer(ctx, {
        type: "table",
        tableValues: `${lo} ${hi}`,
      })];
    }

    case "opacity": {
      const amount = parseFilterAmount(fn.args);
      const transfer = createSvgElement(ctx.svgDocument, "feComponentTransfer");
      const funcA = createSvgElement(ctx.svgDocument, "feFuncA");
      setAttributes(funcA, { type: "linear", slope: amount, intercept: 0 });
      transfer.appendChild(funcA);
      return [transfer];
    }

    case "saturate": {
      const amount = parseFilterAmount(fn.args);
      const matrix = createSvgElement(ctx.svgDocument, "feColorMatrix");
      setAttributes(matrix, { type: "saturate", values: amount });
      return [matrix];
    }

    case "sepia": {
      const amount = Math.max(0, Math.min(1, parseFilterAmount(fn.args)));
      // Interpolate between identity matrix and sepia matrix
      const a = amount;
      const b = 1 - amount;
      const values = [
        b + a * 0.393, a * 0.769, a * 0.189, 0, 0,
        a * 0.349, b + a * 0.686, a * 0.168, 0, 0,
        a * 0.272, a * 0.534, b + a * 0.131, 0, 0,
        0, 0, 0, 1, 0,
      ].map(v => v.toFixed(4)).join(" ");
      const matrix = createSvgElement(ctx.svgDocument, "feColorMatrix");
      setAttributes(matrix, { type: "matrix", values });
      return [matrix];
    }

    default:
      return [];
  }
}

/** Create an feComponentTransfer for RGB channels with uniform settings */
function createComponentTransfer(
  ctx: RenderContext,
  opts: { slope?: number; intercept?: number; type?: string; tableValues?: string },
): SVGElement {
  const transfer = createSvgElement(ctx.svgDocument, "feComponentTransfer");
  for (const channel of ["feFuncR", "feFuncG", "feFuncB"] as const) {
    const func = createSvgElement(ctx.svgDocument, channel);
    if (opts.type === "table" && opts.tableValues) {
      setAttributes(func, { type: "table", tableValues: opts.tableValues });
    } else {
      const attrs: Record<string, string | number> = {
        type: "linear",
        slope: opts.slope ?? 1,
      };
      if (opts.intercept !== undefined) attrs.intercept = opts.intercept;
      setAttributes(func, attrs);
    }
    transfer.appendChild(func);
  }
  return transfer;
}

/**
 * Extract individual CSS filter functions from a filter value string.
 * Handles nested parentheses (e.g. drop-shadow with rgba()).
 */
export function parseCssFilterFunctions(value: string): CssFilterFunction[] {
  const results: CssFilterFunction[] = [];
  const regex = /([a-z-]+)\(/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    const name = match[1]!;
    const argsStart = match.index + match[0].length;

    // Find matching closing paren, respecting nesting
    let depth = 1;
    let i = argsStart;
    for (; i < value.length && depth > 0; i++) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")") depth--;
    }

    const args = value.slice(argsStart, i - 1).trim();
    results.push({ name: name.toLowerCase(), args });

    // Advance regex past this function
    regex.lastIndex = i;
  }

  return results;
}

export interface DropShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

/** @internal Exported for testing */
export function parseDropShadow(value: string): DropShadow | null {
  // Match drop-shadow(...) respecting nested parentheses (e.g. rgba())
  const startIdx = value.indexOf("drop-shadow(");
  if (startIdx === -1) return null;

  const argsStart = startIdx + "drop-shadow(".length;
  let depth = 1;
  let argsEnd = argsStart;
  for (let i = argsStart; i < value.length && depth > 0; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") depth--;
    if (depth > 0) argsEnd = i + 1;
  }

  const args = value.slice(argsStart, argsEnd).trim();
  if (!args) return null;

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
