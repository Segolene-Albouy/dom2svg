import type { LinearGradient, GradientStop, RenderContext, BoxGeometry } from "../types.js";
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
    const { color, position } = parseColorStop(rawStops[i]!.trim(), i, rawStops.length);
    stops.push({ color, position });
  }

  return { angle, stops };
}

/** Convert a linear-gradient to an SVG <linearGradient> element */
export function createSvgLinearGradient(
  gradient: LinearGradient,
  box: BoxGeometry,
  ctx: RenderContext,
): SVGLinearGradientElement {
  const id = ctx.idGenerator.next("grad");
  const el = createSvgElement(
    ctx.svgDocument,
    "linearGradient",
  ) as SVGLinearGradientElement;

  // Use userSpaceOnUse with pixel coordinates for correct diagonal angles
  // on non-square elements (objectBoundingBox distorts the angle).
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const angleRad = (gradient.angle * Math.PI) / 180;
  // CSS angle: 0deg = to top (↑), 90deg = to right (→)
  const dx = Math.sin(angleRad);
  const dy = -Math.cos(angleRad);
  // Gradient line half-length per CSS spec: extends to the perpendicular
  // from the farthest corner.
  const halfLen = Math.abs(box.width / 2 * dx) + Math.abs(box.height / 2 * dy);
  const x1 = cx - dx * halfLen;
  const y1 = cy - dy * halfLen;
  const x2 = cx + dx * halfLen;
  const y2 = cy + dy * halfLen;

  setAttributes(el, {
    id,
    gradientUnits: "userSpaceOnUse",
    x1: x1.toFixed(2),
    y1: y1.toFixed(2),
    x2: x2.toFixed(2),
    y2: y2.toFixed(2),
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
  let customCx: number | null = null;
  let customCy: number | null = null;

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

  // Parse "at cx cy" position from shape descriptor
  if (stopsStart === 1) {
    const atMatch = first.match(/at\s+(.+)/);
    if (atMatch) {
      const posParts = atMatch[1]!.trim().split(/\s+/);
      customCx = parseLengthOrPercent(posParts[0]!, width);
      customCy = parseLengthOrPercent(posParts[1] ?? posParts[0]!, height);
    }
  }

  const cx = customCx ?? width / 2;
  const cy = customCy ?? height / 2;

  // Use transform to create an elliptical gradient
  const rx = width / 2;
  const ry = height / 2;
  // CSS default: farthest-corner. For a circle, that's the distance to the corner.
  const radius = isCircle ? Math.sqrt(rx * rx + ry * ry) : Math.max(rx, ry);

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
  // When the elliptical transform compresses one axis, the fillRect must
  // be expanded in the transformed space to cover the full canvas.
  if (!isCircle && rx !== ry) {
    const sx = radius / rx;
    const sy = radius / ry;
    ctx.fillRect(cx * (1 - sx), cy * (1 - sy), width * sx, height * sy);
  } else {
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();

  return canvas.toDataURL("image/png");
}

/**
 * Parse a color stop like "red 50%" into color and position.
 * Handles modern CSS color syntax with spaces (e.g. "hsl(120deg 50% 50%) 75%")
 * by only looking for a position % after the last closing parenthesis.
 */
function parseColorStop(
  stop: string,
  index: number,
  total: number,
): { color: string; position: number } {
  // Look for a trailing percentage after any function parens
  const lastParen = stop.lastIndexOf(")");
  const tail = lastParen >= 0 ? stop.slice(lastParen + 1) : stop;
  const posMatch = tail.match(/\s+([\d.]+%)\s*$/);
  if (posMatch) {
    const posStr = posMatch[1]!;
    const colorEnd = stop.length - posMatch[0].length;
    return {
      color: stop.slice(0, colorEnd).trim(),
      position: parseFloat(posStr) / 100,
    };
  }
  // No parens: try simple "color position" format (e.g. "red 50%")
  if (lastParen < 0) {
    const spaceIdx = stop.lastIndexOf(" ");
    if (spaceIdx > 0 && stop.slice(spaceIdx).match(/[\d.]+%/)) {
      return {
        color: stop.slice(0, spaceIdx).trim(),
        position: parseFloat(stop.slice(spaceIdx)) / 100,
      };
    }
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

/** Parse a CSS length (px) or percentage relative to a container dimension */
function parseLengthOrPercent(value: string, containerSize: number): number | null {
  if (value === "center") return containerSize / 2;
  if (value === "left" || value === "top") return 0;
  if (value === "right" || value === "bottom") return containerSize;
  if (value.endsWith("%")) return (parseFloat(value) / 100) * containerSize;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}
