import type { BoxGeometry } from "../types.js";

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

/** Check if two boxes intersect */
export function boxesIntersect(a: BoxGeometry, b: BoxGeometry): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Expand a box by a given padding */
export function expandBox(box: BoxGeometry, padding: number): BoxGeometry {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}
