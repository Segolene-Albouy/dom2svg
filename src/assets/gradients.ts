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

/**
 * Rasterize a conic-gradient (or radial-gradient) to a data URL
 * using the Canvas 2D API. Returns null if the gradient type is
 * not supported or the Canvas API is unavailable.
 */
export function rasterizeGradient(
  value: string,
  width: number,
  height: number,
): string | null {
  if (value.includes("conic-gradient")) {
    return rasterizeConicGradient(value, width, height);
  }
  if (value.includes("radial-gradient")) {
    return rasterizeRadialGradient(value, width, height);
  }
  return null;
}

function rasterizeConicGradient(
  value: string,
  width: number,
  height: number,
): string | null {
  const match = value.match(/conic-gradient\((.+)\)/);
  if (!match) return null;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx || !("createConicGradient" in ctx)) return null;

  ctx.scale(scale, scale);

  const body = match[1]!;
  const parts = splitGradientArgs(body);

  let startDeg = 0;
  let stopsStart = 0;

  // Parse "from <angle>" prefix
  const first = parts[0]!.trim();
  const fromMatch = first.match(/^from\s+(-?[\d.]+)(deg|rad|turn|grad)/);
  if (fromMatch) {
    startDeg = parseAngle(fromMatch[1]! + fromMatch[2]!);
    stopsStart = 1;
  }

  const cx = width / 2;
  const cy = height / 2;

  // CSS 0deg = top (12 o'clock), Canvas 0rad = right (3 o'clock)
  const startRad = ((startDeg - 90) * Math.PI) / 180;
  const gradient = ctx.createConicGradient(startRad, cx, cy);

  const rawStops = parts.slice(stopsStart);
  for (let i = 0; i < rawStops.length; i++) {
    const stop = rawStops[i]!.trim();
    const { color, position } = parseColorStop(stop, i, rawStops.length);
    try {
      gradient.addColorStop(position, color);
    } catch {
      // Invalid color — skip
    }
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function rasterizeRadialGradient(
  value: string,
  width: number,
  height: number,
): string | null {
  const match = value.match(/radial-gradient\((.+)\)/);
  if (!match) return null;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(scale, scale);

  const body = match[1]!;
  const parts = splitGradientArgs(body);

  let isCircle = false;
  let stopsStart = 0;

  // Check if the first part is a shape/size descriptor
  const first = parts[0]!.trim();
  if (first === "circle" || first.startsWith("circle ")) {
    isCircle = true;
    stopsStart = 1;
  } else if (first === "ellipse" || first.startsWith("ellipse ")) {
    stopsStart = 1;
  } else if (first.includes("at ") && !first.includes("#") && !first.match(/^(rgb|hsl)/)) {
    stopsStart = 1;
  }

  const cx = width / 2;
  const cy = height / 2;

  // Use transform to create an elliptical gradient
  const rx = width / 2;
  const ry = height / 2;
  const radius = isCircle ? Math.min(rx, ry) : Math.max(rx, ry);

  ctx.save();
  if (!isCircle && rx !== ry) {
    ctx.translate(cx, cy);
    ctx.scale(rx / radius, ry / radius);
    ctx.translate(-cx, -cy);
  }

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);

  const rawStops = parts.slice(stopsStart);
  for (let i = 0; i < rawStops.length; i++) {
    const stop = rawStops[i]!.trim();
    const { color, position } = parseColorStop(stop, i, rawStops.length);
    try {
      gradient.addColorStop(position, color);
    } catch {
      // Invalid color — skip
    }
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width * 2, height * 2);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

/** Parse a color stop like "red 50%" into color and position */
function parseColorStop(
  stop: string,
  index: number,
  total: number,
): { color: string; position: number } {
  const lastSpace = stop.lastIndexOf(" ");
  if (lastSpace > 0 && stop.slice(lastSpace).match(/[\d.]+%/)) {
    return {
      color: stop.slice(0, lastSpace).trim(),
      position: parseFloat(stop.slice(lastSpace)) / 100,
    };
  }
  return {
    color: stop,
    position: total > 1 ? index / (total - 1) : 0,
  };
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
