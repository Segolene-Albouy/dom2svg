import type { MatrixTuple } from "../types.js";

/**
 * 2D affine transform matrix operations.
 * Matrix layout: [a, b, c, d, e, f]
 *
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 */

/** Identity matrix */
export function identity(): MatrixTuple {
  return [1, 0, 0, 1, 0, 0];
}

/** Multiply two matrices: A * B */
export function multiply(a: MatrixTuple, b: MatrixTuple): MatrixTuple {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Create a translation matrix */
export function translate(tx: number, ty: number): MatrixTuple {
  return [1, 0, 0, 1, tx, ty];
}

/** Create a scale matrix */
export function scale(sx: number, sy: number): MatrixTuple {
  return [sx, 0, 0, sy, 0, 0];
}

/** Create a rotation matrix (angle in degrees) */
export function rotate(angleDeg: number): MatrixTuple {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, 0, 0];
}

/** Create a skewX matrix (angle in degrees) */
export function skewX(angleDeg: number): MatrixTuple {
  const rad = (angleDeg * Math.PI) / 180;
  return [1, 0, Math.tan(rad), 1, 0, 0];
}

/** Create a skewY matrix (angle in degrees) */
export function skewY(angleDeg: number): MatrixTuple {
  const rad = (angleDeg * Math.PI) / 180;
  return [1, Math.tan(rad), 0, 1, 0, 0];
}

/** Compute the inverse of a matrix. Returns null if singular. */
export function inverse(m: MatrixTuple): MatrixTuple | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-10) return null;

  const invDet = 1 / det;
  return [
    m[3] * invDet,
    -m[1] * invDet,
    -m[2] * invDet,
    m[0] * invDet,
    (m[2] * m[5] - m[3] * m[4]) * invDet,
    (m[1] * m[4] - m[0] * m[5]) * invDet,
  ];
}

/** Check if a matrix is the identity matrix */
export function isIdentity(m: MatrixTuple): boolean {
  return (
    Math.abs(m[0] - 1) < 1e-10 &&
    Math.abs(m[1]) < 1e-10 &&
    Math.abs(m[2]) < 1e-10 &&
    Math.abs(m[3] - 1) < 1e-10 &&
    Math.abs(m[4]) < 1e-10 &&
    Math.abs(m[5]) < 1e-10
  );
}

/** Format matrix as SVG transform attribute value */
export function toSvgTransform(m: MatrixTuple): string {
  return `matrix(${m.map((v) => v.toFixed(6)).join(",")})`;
}
