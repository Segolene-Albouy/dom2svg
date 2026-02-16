import type { RenderContext, BoxGeometry } from "../types.js";
import { createSvgElement, setAttributes } from "../utils/dom.js";
import { buildRoundedRectPath } from "../utils/geometry.js";

export type ClipPathShape =
  | { type: "inset"; top: number; right: number; bottom: number; left: number; round?: string }
  | { type: "circle"; radius: number; cx: number; cy: number; cxPct?: boolean; cyPct?: boolean }
  | { type: "ellipse"; rx: number; ry: number; cx: number; cy: number; cxPct?: boolean; cyPct?: boolean }
  | { type: "polygon"; points: [number, number][] }
  | { type: "path"; d: string };

/** Parse a CSS length value, detecting percentage vs pixel units */
function parseLengthValue(raw: string): { value: number; isPct: boolean } {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    return { value: parseFloat(trimmed) || 0, isPct: true };
  }
  return { value: parseFloat(trimmed) || 0, isPct: false };
}

/**
 * Parse a CSS clip-path value into a ClipPathShape.
 * Handles both pixel and percentage values (browser may keep center positions as %).
 */
export function parseClipPath(value: string): ClipPathShape | null {
  if (!value || value === "none") return null;

  const insetMatch = value.match(/^inset\((.+)\)$/);
  if (insetMatch) return parseInset(insetMatch[1]!);

  const circleMatch = value.match(/^circle\((.+)\)$/);
  if (circleMatch) return parseCircle(circleMatch[1]!);

  const ellipseMatch = value.match(/^ellipse\((.+)\)$/);
  if (ellipseMatch) return parseEllipse(ellipseMatch[1]!);

  const polygonMatch = value.match(/^polygon\((.+)\)$/);
  if (polygonMatch) return parsePolygon(polygonMatch[1]!);

  const pathMatch = value.match(/^path\(["']?(.+?)["']?\)$/);
  if (pathMatch) return { type: "path", d: pathMatch[1]! };

  return null;
}

function parseInset(args: string): ClipPathShape | null {
  // inset(top right bottom left round radii)
  const roundIdx = args.indexOf(" round ");
  let insetPart = args;
  let round: string | undefined;
  if (roundIdx >= 0) {
    insetPart = args.slice(0, roundIdx);
    round = args.slice(roundIdx + 7).trim();
  }

  const values = insetPart.trim().split(/\s+/).map((v) => parseFloat(v) || 0);
  const top = values[0] ?? 0;
  const right = values[1] ?? top;
  const bottom = values[2] ?? top;
  const left = values[3] ?? right;

  return { type: "inset", top, right, bottom, left, round };
}

function parseCircle(args: string): ClipPathShape | null {
  // circle(radius at cx cy)
  const atIdx = args.indexOf(" at ");
  let radius = 0;
  let cx = 0;
  let cy = 0;
  let cxPct = false;
  let cyPct = false;

  if (atIdx >= 0) {
    radius = parseFloat(args.slice(0, atIdx)) || 0;
    const center = args.slice(atIdx + 4).trim().split(/\s+/);
    const cxVal = parseLengthValue(center[0]!);
    const cyVal = parseLengthValue(center[1]!);
    cx = cxVal.value; cxPct = cxVal.isPct;
    cy = cyVal.value; cyPct = cyVal.isPct;
  } else {
    radius = parseFloat(args) || 0;
    // CSS spec: default center is 50% 50%
    cx = 50; cy = 50;
    cxPct = true; cyPct = true;
  }

  return { type: "circle", radius, cx, cy, cxPct, cyPct };
}

function parseEllipse(args: string): ClipPathShape | null {
  // ellipse(rx ry at cx cy)
  const atIdx = args.indexOf(" at ");
  let rx = 0;
  let ry = 0;
  let cx = 0;
  let cy = 0;
  let cxPct = false;
  let cyPct = false;

  if (atIdx >= 0) {
    const radii = args.slice(0, atIdx).trim().split(/\s+/);
    rx = parseFloat(radii[0]!) || 0;
    ry = parseFloat(radii[1]!) || 0;
    const center = args.slice(atIdx + 4).trim().split(/\s+/);
    const cxVal = parseLengthValue(center[0]!);
    const cyVal = parseLengthValue(center[1]!);
    cx = cxVal.value; cxPct = cxVal.isPct;
    cy = cyVal.value; cyPct = cyVal.isPct;
  } else {
    const parts = args.trim().split(/\s+/);
    rx = parseFloat(parts[0]!) || 0;
    ry = parseFloat(parts[1]!) || 0;
    // CSS spec: default center is 50% 50%
    cx = 50; cy = 50;
    cxPct = true; cyPct = true;
  }

  return { type: "ellipse", rx, ry, cx, cy, cxPct, cyPct };
}

function parsePolygon(args: string): ClipPathShape | null {
  // polygon(x1 y1, x2 y2, ...)
  // Remove optional fill-rule prefix
  let cleaned = args.trim();
  if (cleaned.startsWith("nonzero,") || cleaned.startsWith("evenodd,")) {
    cleaned = cleaned.slice(cleaned.indexOf(",") + 1).trim();
  }

  const points: [number, number][] = [];
  const pairs = cleaned.split(",");

  for (const pair of pairs) {
    const parts = pair.trim().split(/\s+/);
    if (parts.length >= 2) {
      points.push([parseFloat(parts[0]!) || 0, parseFloat(parts[1]!) || 0]);
    }
  }

  if (points.length < 3) return null;
  return { type: "polygon", points };
}

/**
 * Create an SVG <clipPath> element in defs and return its ID.
 * The clip shape is positioned relative to the element's box.
 */
export function createSvgClipPath(
  shape: ClipPathShape,
  box: BoxGeometry,
  ctx: RenderContext,
): string | null {
  const clipId = ctx.idGenerator.next("clip");
  const clipPath = createSvgElement(ctx.svgDocument, "clipPath");
  clipPath.setAttribute("id", clipId);

  const svgShape = shapeToSvg(shape, box, ctx);
  if (!svgShape) return null;

  clipPath.appendChild(svgShape);
  ctx.defs.appendChild(clipPath);

  return clipId;
}

function shapeToSvg(
  shape: ClipPathShape,
  box: BoxGeometry,
  ctx: RenderContext,
): SVGElement | null {
  switch (shape.type) {
    case "inset": {
      const x = box.x + shape.left;
      const y = box.y + shape.top;
      const w = Math.max(0, box.width - shape.left - shape.right);
      const h = Math.max(0, box.height - shape.top - shape.bottom);

      if (shape.round) {
        // Parse border-radius shorthand for inset
        const radiiValues = shape.round.split("/").map((part) =>
          part.trim().split(/\s+/).map((v) => parseFloat(v) || 0),
        );
        const h_values = radiiValues[0] ?? [0];
        const v_values = radiiValues[1] ?? h_values;

        const radii = {
          topLeft: [h_values[0] ?? 0, v_values[0] ?? 0] as [number, number],
          topRight: [h_values[1] ?? h_values[0] ?? 0, v_values[1] ?? v_values[0] ?? 0] as [number, number],
          bottomRight: [h_values[2] ?? h_values[0] ?? 0, v_values[2] ?? v_values[0] ?? 0] as [number, number],
          bottomLeft: [h_values[3] ?? h_values[1] ?? h_values[0] ?? 0, v_values[3] ?? v_values[1] ?? v_values[0] ?? 0] as [number, number],
        };

        const path = createSvgElement(ctx.svgDocument, "path");
        path.setAttribute("d", buildRoundedRectPath(x, y, w, h, radii));
        return path;
      }

      const rect = createSvgElement(ctx.svgDocument, "rect");
      setAttributes(rect, { x, y, width: w, height: h });
      return rect;
    }

    case "circle": {
      const resolvedCx = shape.cxPct ? (shape.cx / 100) * box.width : shape.cx;
      const resolvedCy = shape.cyPct ? (shape.cy / 100) * box.height : shape.cy;
      const circle = createSvgElement(ctx.svgDocument, "circle");
      setAttributes(circle, {
        cx: box.x + resolvedCx,
        cy: box.y + resolvedCy,
        r: shape.radius,
      });
      return circle;
    }

    case "ellipse": {
      const resolvedCx = shape.cxPct ? (shape.cx / 100) * box.width : shape.cx;
      const resolvedCy = shape.cyPct ? (shape.cy / 100) * box.height : shape.cy;
      const ellipse = createSvgElement(ctx.svgDocument, "ellipse");
      setAttributes(ellipse, {
        cx: box.x + resolvedCx,
        cy: box.y + resolvedCy,
        rx: shape.rx,
        ry: shape.ry,
      });
      return ellipse;
    }

    case "polygon": {
      const polygon = createSvgElement(ctx.svgDocument, "polygon");
      const pointsStr = shape.points
        .map(([x, y]) => `${box.x + x},${box.y + y}`)
        .join(" ");
      polygon.setAttribute("points", pointsStr);
      return polygon;
    }

    case "path": {
      const path = createSvgElement(ctx.svgDocument, "path");
      path.setAttribute("d", shape.d);
      // Translate path to box position
      path.setAttribute("transform", `translate(${box.x}, ${box.y})`);
      return path;
    }

    default:
      return null;
  }
}
