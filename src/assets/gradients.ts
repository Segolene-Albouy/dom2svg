import type { LinearGradient, GradientStop, RenderContext } from "../types.js";
import { createSvgElement, setAttributes } from "../utils/dom.js";

/** Parse a CSS linear-gradient() into our LinearGradient structure */
export function parseLinearGradient(value: string): LinearGradient | null {
  // Match linear-gradient(...) - handle both prefix and standard
  const match = value.match(/linear-gradient\((.+)\)/);
  if (!match) return null;

  const body = match[1]!;
  const parts = splitGradientArgs(body);
  if (parts.length < 2) return null;

  let angle = 180; // default: to bottom
  let stopsStart = 0;

  // Check if first part is a direction
  const first = parts[0]!.trim();
  if (first.startsWith("to ")) {
    angle = directionToAngle(first);
    stopsStart = 1;
  } else if (first.match(/^-?[\d.]+(?:deg|rad|turn|grad)/)) {
    angle = parseAngle(first);
    stopsStart = 1;
  }

  const stops: GradientStop[] = [];
  const rawStops = parts.slice(stopsStart);

  for (let i = 0; i < rawStops.length; i++) {
    const stopStr = rawStops[i]!.trim();
    const lastSpace = stopStr.lastIndexOf(" ");

    let color: string;
    let position: number;

    if (lastSpace > 0 && stopStr.slice(lastSpace).match(/[\d.]+%/)) {
      color = stopStr.slice(0, lastSpace).trim();
      position = parseFloat(stopStr.slice(lastSpace)) / 100;
    } else {
      color = stopStr;
      position = rawStops.length > 1 ? i / (rawStops.length - 1) : 0;
    }

    stops.push({ color, position });
  }

  return { angle, stops };
}

/** Convert a linear-gradient to an SVG <linearGradient> element */
export function createSvgLinearGradient(
  gradient: LinearGradient,
  ctx: RenderContext,
): SVGLinearGradientElement {
  const id = ctx.idGenerator.next("grad");
  const el = createSvgElement(
    ctx.svgDocument,
    "linearGradient",
  ) as SVGLinearGradientElement;

  // Convert angle to x1,y1,x2,y2
  const rad = ((gradient.angle - 90) * Math.PI) / 180;
  const x1 = 0.5 - Math.cos(rad) * 0.5;
  const y1 = 0.5 - Math.sin(rad) * 0.5;
  const x2 = 0.5 + Math.cos(rad) * 0.5;
  const y2 = 0.5 + Math.sin(rad) * 0.5;

  setAttributes(el, {
    id,
    x1: x1.toFixed(4),
    y1: y1.toFixed(4),
    x2: x2.toFixed(4),
    y2: y2.toFixed(4),
  });

  for (const stop of gradient.stops) {
    const stopEl = createSvgElement(ctx.svgDocument, "stop");
    setAttributes(stopEl, {
      offset: `${(stop.position * 100).toFixed(1)}%`,
      "stop-color": stop.color,
    });
    el.appendChild(stopEl);
  }

  ctx.defs.appendChild(el);
  return el;
}

/** Split gradient arguments respecting nested parentheses */
function splitGradientArgs(str: string): string[] {
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

function directionToAngle(dir: string): number {
  const map: Record<string, number> = {
    "to top": 0,
    "to right": 90,
    "to bottom": 180,
    "to left": 270,
    "to top right": 45,
    "to top left": 315,
    "to bottom right": 135,
    "to bottom left": 225,
  };
  return map[dir] ?? 180;
}

function parseAngle(value: string): number {
  if (value.endsWith("deg")) return parseFloat(value);
  if (value.endsWith("rad")) return (parseFloat(value) * 180) / Math.PI;
  if (value.endsWith("turn")) return parseFloat(value) * 360;
  if (value.endsWith("grad")) return parseFloat(value) * 0.9;
  return parseFloat(value);
}
