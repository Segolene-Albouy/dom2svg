import type { TransformFunction } from "../types.js";

/**
 * Parse a CSS transform string into a list of transform functions.
 * Supports: matrix, translate, translateX, translateY, scale, scaleX, scaleY,
 * rotate, skewX, skewY.
 */
export function parseTransform(value: string): TransformFunction[] {
  if (!value || value === "none") return [];

  const functions: TransformFunction[] = [];
  const regex = /(\w+)\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    const name = match[1]!;
    const args = match[2]!.split(",").map((s) => s.trim());

    switch (name) {
      case "matrix": {
        const vals = args.map(parseFloat);
        if (vals.length === 6) {
          functions.push({
            type: "matrix",
            values: vals as [number, number, number, number, number, number],
          });
        }
        break;
      }
      case "translate": {
        const x = parseLengthValue(args[0]!);
        const y = args[1] ? parseLengthValue(args[1]) : 0;
        functions.push({ type: "translate", x, y });
        break;
      }
      case "translateX": {
        functions.push({ type: "translate", x: parseLengthValue(args[0]!), y: 0 });
        break;
      }
      case "translateY": {
        functions.push({ type: "translate", x: 0, y: parseLengthValue(args[0]!) });
        break;
      }
      case "scale": {
        const sx = parseFloat(args[0]!);
        const sy = args[1] ? parseFloat(args[1]) : sx;
        functions.push({ type: "scale", x: sx, y: sy });
        break;
      }
      case "scaleX": {
        functions.push({ type: "scale", x: parseFloat(args[0]!), y: 1 });
        break;
      }
      case "scaleY": {
        functions.push({ type: "scale", x: 1, y: parseFloat(args[0]!) });
        break;
      }
      case "rotate": {
        functions.push({ type: "rotate", angle: parseAngleValue(args[0]!) });
        break;
      }
      case "skewX": {
        functions.push({ type: "skewX", angle: parseAngleValue(args[0]!) });
        break;
      }
      case "skewY": {
        functions.push({ type: "skewY", angle: parseAngleValue(args[0]!) });
        break;
      }
    }
  }

  return functions;
}

function parseLengthValue(value: string): number {
  return parseFloat(value) || 0;
}

function parseAngleValue(value: string): number {
  value = value.trim();
  if (value.endsWith("rad")) return (parseFloat(value) * 180) / Math.PI;
  if (value.endsWith("turn")) return parseFloat(value) * 360;
  if (value.endsWith("grad")) return parseFloat(value) * 0.9;
  // Default: degrees
  return parseFloat(value) || 0;
}
