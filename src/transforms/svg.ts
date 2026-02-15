import type { TransformFunction, MatrixTuple } from "../types.js";
import { parseTransform } from "./parse.js";
import * as mat from "./matrix.js";

/**
 * Convert a CSS transform string to an SVG transform attribute value.
 * Returns null if no transform or identity transform.
 */
export function cssTransformToSvg(
  cssTransform: string,
  transformOrigin: string,
  box: { x: number; y: number; width: number; height: number },
): string | null {
  const functions = parseTransform(cssTransform);
  if (functions.length === 0) return null;

  // Parse transform-origin
  const [ox, oy] = parseTransformOrigin(transformOrigin, box);

  // Build the combined matrix
  let result = mat.identity();

  // Move origin
  result = mat.multiply(result, mat.translate(ox, oy));

  // Apply each transform function
  for (const fn of functions) {
    result = mat.multiply(result, transformFunctionToMatrix(fn));
  }

  // Move origin back
  result = mat.multiply(result, mat.translate(-ox, -oy));

  if (mat.isIdentity(result)) return null;

  return mat.toSvgTransform(result);
}

/** Convert a single TransformFunction to a matrix */
function transformFunctionToMatrix(fn: TransformFunction): MatrixTuple {
  switch (fn.type) {
    case "matrix":
      return fn.values;
    case "translate":
      return mat.translate(fn.x, fn.y);
    case "scale":
      return mat.scale(fn.x, fn.y);
    case "rotate":
      return mat.rotate(fn.angle);
    case "skewX":
      return mat.skewX(fn.angle);
    case "skewY":
      return mat.skewY(fn.angle);
  }
}

/** Parse CSS transform-origin into absolute coordinates */
function parseTransformOrigin(
  origin: string,
  box: { x: number; y: number; width: number; height: number },
): [number, number] {
  const parts = origin.split(/\s+/);
  const x = parseOriginValue(parts[0] ?? "50%", box.width, box.x);
  const y = parseOriginValue(parts[1] ?? "50%", box.height, box.y);
  return [x, y];
}

function parseOriginValue(
  value: string,
  size: number,
  offset: number,
): number {
  if (value === "left" || value === "top") return offset;
  if (value === "right" || value === "bottom") return offset + size;
  if (value === "center") return offset + size / 2;
  if (value.endsWith("%")) {
    return offset + (parseFloat(value) / 100) * size;
  }
  return offset + parseFloat(value);
}
