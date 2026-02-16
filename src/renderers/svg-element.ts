import type { RenderContext } from "../types.js";
import { SVG_NS, XLINK_NS } from "../utils/dom.js";

/**
 * Clone an inline SVG element into the output document,
 * rewriting IDs to avoid conflicts between multiple cloned SVGs
 * and resolving `currentColor` to the actual computed color.
 */
export function renderSvgElement(
  element: SVGElement,
  ctx: RenderContext,
): SVGElement {
  // Resolve currentColor from the SVG element's inherited CSS color
  const computedColor = window.getComputedStyle(element).color || "rgb(0, 0, 0)";
  const clone = cloneWithNamespace(element, ctx);
  resolveCurrentColor(clone, computedColor);
  rewriteIds(clone, ctx);
  return clone;
}

/** Deep clone an SVG element into the target document, preserving namespaces */
function cloneWithNamespace(node: SVGElement, ctx: RenderContext): SVGElement {
  const clone = ctx.svgDocument.createElementNS(
    node.namespaceURI || SVG_NS,
    node.localName,
  ) as SVGElement;

  // Copy attributes
  for (const attr of Array.from(node.attributes)) {
    if (attr.namespaceURI === XLINK_NS) {
      clone.setAttributeNS(XLINK_NS, attr.localName, attr.value);
    } else if (attr.namespaceURI) {
      clone.setAttributeNS(attr.namespaceURI, attr.localName, attr.value);
    } else {
      clone.setAttribute(attr.localName, attr.value);
    }
  }

  // Inline CSS-applied fill/stroke that aren't present as attributes.
  // Many icon systems (e.g. GitHub Octicons) set fill via CSS rules like
  // `.octicon { fill: currentColor }` — these won't be in the attributes.
  inlineSvgPresentationStyles(node, clone);

  // Recurse into children
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      clone.appendChild(cloneWithNamespace(child as SVGElement, ctx));
    } else if (child.nodeType === Node.TEXT_NODE) {
      clone.appendChild(ctx.svgDocument.createTextNode(child.textContent || ""));
    }
  }

  return clone;
}

/** Inline key SVG presentation properties that may come from CSS rather than attributes */
function inlineSvgPresentationStyles(source: SVGElement, clone: SVGElement): void {
  const styles = window.getComputedStyle(source);

  // fill — default in SVG is "rgb(0, 0, 0)" (black)
  if (!clone.hasAttribute("fill")) {
    const fill = styles.fill;
    if (fill && fill !== "rgb(0, 0, 0)") {
      clone.setAttribute("fill", fill);
    }
  }

  // stroke — default is "none"
  if (!clone.hasAttribute("stroke")) {
    const stroke = styles.stroke;
    if (stroke && stroke !== "none") {
      clone.setAttribute("stroke", stroke);
    }
  }

  // opacity
  if (!clone.hasAttribute("opacity")) {
    const opacity = styles.opacity;
    if (opacity && opacity !== "1") {
      clone.setAttribute("opacity", opacity);
    }
  }
}

/** Rewrite all id attributes and url(#id) references in the cloned tree */
function rewriteIds(root: SVGElement, ctx: RenderContext): void {
  const idMap = new Map<string, string>();

  // First pass: collect and rewrite IDs
  const allElements = root.querySelectorAll("[id]");
  for (const el of Array.from(allElements)) {
    const oldId = el.getAttribute("id")!;
    const newId = ctx.idGenerator.next("svg");
    idMap.set(oldId, newId);
    el.setAttribute("id", newId);
  }

  // Also handle root element's id
  if (root.hasAttribute("id")) {
    const oldId = root.getAttribute("id")!;
    if (!idMap.has(oldId)) {
      const newId = ctx.idGenerator.next("svg");
      idMap.set(oldId, newId);
      root.setAttribute("id", newId);
    }
  }

  if (idMap.size === 0) return;

  // Second pass: rewrite url(#id) references in all attributes
  rewriteUrlReferences(root, idMap);
}

function rewriteUrlReferences(
  element: SVGElement,
  idMap: Map<string, string>,
): void {
  for (const attr of Array.from(element.attributes)) {
    if (attr.value.includes("url(#")) {
      let newValue = attr.value;
      for (const [oldId, newId] of idMap) {
        newValue = newValue.replace(
          new RegExp(`url\\(#${escapeRegex(oldId)}\\)`, "g"),
          `url(#${newId})`,
        );
      }
      if (newValue !== attr.value) {
        element.setAttribute(attr.localName, newValue);
      }
    }
    // Also handle href="#id" (for <use> elements etc.)
    if (
      (attr.localName === "href" || attr.localName === "xlink:href") &&
      attr.value.startsWith("#")
    ) {
      const refId = attr.value.slice(1);
      if (idMap.has(refId)) {
        if (attr.namespaceURI === XLINK_NS) {
          element.setAttributeNS(XLINK_NS, "href", `#${idMap.get(refId)}`);
        } else {
          element.setAttribute(attr.localName, `#${idMap.get(refId)}`);
        }
      }
    }
  }

  // Recurse
  for (const child of Array.from(element.children)) {
    if (child instanceof SVGElement) {
      rewriteUrlReferences(child, idMap);
    }
  }
}

/** Replace `currentColor` in fill/stroke/color attributes with the resolved color */
function resolveCurrentColor(element: SVGElement, color: string): void {
  for (const attr of Array.from(element.attributes)) {
    if (attr.value === "currentColor") {
      element.setAttribute(attr.localName, color);
    }
  }
  for (const child of Array.from(element.children)) {
    if (child instanceof SVGElement) {
      resolveCurrentColor(child, color);
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
