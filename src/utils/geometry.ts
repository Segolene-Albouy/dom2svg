import type { BoxGeometry, BorderRadii } from "../types.js";

/** Get an element's bounding box relative to a root element */
export function getRelativeBox(element: Element, root: Element): BoxGeometry {
  const elRect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return {
    x: elRect.left - rootRect.left,
    y: elRect.top - rootRect.top,
    width: elRect.width,
    height: elRect.height,
  };
}

/** Build an SVG path d-attribute for a rounded rectangle with non-uniform radii */
export function buildRoundedRectPath(
  x: number, y: number, width: number, height: number,
  radii: BorderRadii,
): string {
  const [tlx, tly] = radii.topLeft;
  const [trx, try_] = radii.topRight;
  const [brx, bry] = radii.bottomRight;
  const [blx, bly] = radii.bottomLeft;

  return [
    `M ${x + tlx} ${y}`,
    `L ${x + width - trx} ${y}`,
    trx || try_ ? `A ${trx} ${try_} 0 0 1 ${x + width} ${y + try_}` : "",
    `L ${x + width} ${y + height - bry}`,
    brx || bry ? `A ${brx} ${bry} 0 0 1 ${x + width - brx} ${y + height}` : "",
    `L ${x + blx} ${y + height}`,
    blx || bly ? `A ${blx} ${bly} 0 0 1 ${x} ${y + height - bly}` : "",
    `L ${x} ${y + tly}`,
    tlx || tly ? `A ${tlx} ${tly} 0 0 1 ${x + tlx} ${y}` : "",
    "Z",
  ].filter(Boolean).join(" ");
}
