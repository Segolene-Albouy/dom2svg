import type { RenderContext } from "../types.js";
import {
  isElement,
  isTextNode,
  isSvgElement,
} from "../utils/dom.js";
import { isInvisible } from "./styles.js";
import { getRelativeBox } from "../utils/geometry.js";
import {
  renderHtmlElement,
  renderPseudoAfter,
  getChildTarget,
} from "../renderers/html-element.js";
import { renderSvgElement } from "../renderers/svg-element.js";
import { renderTextNode } from "../renderers/text-node.js";

/**
 * Recursively walk the DOM tree and render each node into SVG.
 * Returns the SVG group for this subtree.
 */
export async function walkElement(
  element: Element,
  rootElement: Element,
  ctx: RenderContext,
): Promise<SVGElement | null> {
  const styles = window.getComputedStyle(element);

  // Skip invisible elements
  if (isInvisible(styles)) return null;

  // Check exclude option
  if (shouldExclude(element, ctx)) return null;

  // Custom handler
  if (ctx.options.handler) {
    const result = ctx.options.handler(element, ctx);
    if (result !== null) return result;
  }

  // SVG element — clone directly
  if (isSvgElement(element) && element !== rootElement) {
    const box = getRelativeBox(element, rootElement);
    const clone = renderSvgElement(element, ctx);

    // Position the cloned SVG at its computed location
    if (element.tagName.toLowerCase() === "svg") {
      clone.setAttribute("x", String(box.x));
      clone.setAttribute("y", String(box.y));
      clone.setAttribute("width", String(box.width));
      clone.setAttribute("height", String(box.height));
    }

    return clone;
  }

  // HTML element — render backgrounds/borders, then recurse children
  const group = await renderHtmlElement(element, rootElement, ctx);
  const childTarget = getChildTarget(group);

  // Apply opacity
  const opacity = parseFloat(styles.opacity);
  if (opacity < 1) {
    group.setAttribute("opacity", String(opacity));
  }

  // Walk children in DOM order
  for (const child of Array.from(element.childNodes)) {
    if (isTextNode(child)) {
      const textSvg = await renderTextNode(child, rootElement, ctx);
      if (textSvg) childTarget.appendChild(textSvg);
    } else if (isElement(child)) {
      const childSvg = await walkElement(child, rootElement, ctx);
      if (childSvg) childTarget.appendChild(childSvg);
    }
  }

  // Render ::after pseudo-element
  await renderPseudoAfter(element, rootElement, ctx, group);

  return group;
}

/** Check if an element should be excluded */
function shouldExclude(element: Element, ctx: RenderContext): boolean {
  const exclude = ctx.options.exclude;
  if (!exclude) return false;

  if (typeof exclude === "string") {
    return element.matches(exclude);
  }

  return exclude(element);
}
