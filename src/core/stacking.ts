import type { StackingContext, StackingContextChild } from "../types.js";
import {
  createsStackingContext,
  getZIndex,
  isFloat,
  isInlineLevel,
  isInvisible,
  isPositioned,
  parseOpacity,
} from "./styles.js";
import { isElement } from "../utils/dom.js";

/**
 * Build a stacking context tree from a DOM element.
 * Implements CSS 2.1 Appendix E painting order:
 *   1. Background & borders of the element
 *   2. Child stacking contexts with negative z-index
 *   3. In-flow, non-inline, non-positioned block-level descendants
 *   4. Non-positioned floats
 *   5. In-flow, inline-level, non-positioned descendants
 *   6. Positioned descendants with z-index: auto or 0
 *   7. Child stacking contexts with positive z-index
 */
export function buildStackingContext(element: Element): StackingContext {
  const styles = window.getComputedStyle(element);
  const context: StackingContext = {
    element,
    children: [],
    zIndex: getZIndex(styles),
    opacity: parseOpacity(styles),
  };

  collectChildren(element, context);
  return context;
}

function collectChildren(parent: Element, context: StackingContext): void {
  for (const child of Array.from(parent.childNodes)) {
    if (!isElement(child)) continue;

    const styles = window.getComputedStyle(child);
    if (isInvisible(styles)) continue;

    if (createsStackingContext(styles)) {
      // Recurse into a new stacking context
      const childContext = buildStackingContext(child);
      context.children.push({
        type: "stacking-context",
        context: childContext,
      });
    } else if (isPositioned(styles)) {
      context.children.push({
        type: "positioned",
        element: child,
        zIndex: getZIndex(styles),
      });
      // Continue collecting non-stacking-context children inside
      collectChildren(child, context);
    } else if (isFloat(styles)) {
      context.children.push({ type: "float", element: child });
      collectChildren(child, context);
    } else if (isInlineLevel(styles)) {
      context.children.push({ type: "inline", element: child });
      collectChildren(child, context);
    } else {
      context.children.push({ type: "block", element: child });
      collectChildren(child, context);
    }
  }
}

/**
 * Sort stacking context children into the 7-layer painting order.
 * Returns a flat list of elements in the order they should be rendered.
 */
export function getSortedPaintOrder(
  context: StackingContext,
): StackingContextChild[] {
  const negativeZ: StackingContextChild[] = [];
  const blocks: StackingContextChild[] = [];
  const floats: StackingContextChild[] = [];
  const inlines: StackingContextChild[] = [];
  const zeroAuto: StackingContextChild[] = [];
  const positiveZ: StackingContextChild[] = [];

  for (const child of context.children) {
    switch (child.type) {
      case "stacking-context":
        if (child.context.zIndex < 0) {
          negativeZ.push(child);
        } else if (child.context.zIndex > 0) {
          positiveZ.push(child);
        } else {
          zeroAuto.push(child);
        }
        break;
      case "block":
        blocks.push(child);
        break;
      case "float":
        floats.push(child);
        break;
      case "inline":
        inlines.push(child);
        break;
      case "positioned":
        if (child.zIndex < 0) {
          negativeZ.push(child);
        } else if (child.zIndex > 0) {
          positiveZ.push(child);
        } else {
          zeroAuto.push(child);
        }
        break;
    }
  }

  // Sort z-indexed layers by z-index
  negativeZ.sort(byZIndex);
  positiveZ.sort(byZIndex);

  return [
    ...negativeZ,
    ...blocks,
    ...floats,
    ...inlines,
    ...zeroAuto,
    ...positiveZ,
  ];
}

function byZIndex(a: StackingContextChild, b: StackingContextChild): number {
  const aZ = a.type === "stacking-context" ? a.context.zIndex : (a as any).zIndex ?? 0;
  const bZ = b.type === "stacking-context" ? b.context.zIndex : (b as any).zIndex ?? 0;
  return aZ - bZ;
}
