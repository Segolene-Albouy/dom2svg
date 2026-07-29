import type { RenderContext } from "../types.js";
import { SVG_NS, XLINK_NS, splitAlpha } from "../utils/dom.js";

/** Attribute values needing computed-style resolution */
const DYNAMIC = /var\(|currentColor/;

/** Presentation properties inlined when they come from CSS rather than attributes */
const INLINED = [
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "text-anchor",
];

/**
 * Clone an inline SVG element into the output document,
 * rewriting IDs to avoid conflicts between multiple cloned SVGs
 * and resolving `currentColor` and `var()` to computed values.
 */
export function renderSvgElement(
    element: SVGElement,
    ctx: RenderContext,
): SVGElement {
  const parentStyles = element.parentElement
      ? window.getComputedStyle(element.parentElement)
      : null;
  const clone = cloneWithNamespace(element, ctx, 0, parentStyles);
  rewriteIds(clone, ctx);
  return clone;
}

/** Deep clone an SVG element into the target document, preserving namespaces */
function cloneWithNamespace(
    node: SVGElement,
    ctx: RenderContext,
    resolveDepth: number = 0,
    parentStyles: CSSStyleDeclaration | null = null,
): SVGElement {
  // Resolve <use> elements by inlining the referenced content
  if (node.localName === "use" && resolveDepth < 5) {
    const resolved = resolveUseElement(node, ctx, resolveDepth);
    if (resolved) return resolved;
    // Fallback: clone as-is if resolution fails
  }

  const styles = window.getComputedStyle(node);
  const clone = ctx.svgDocument.createElementNS(
      node.namespaceURI || SVG_NS,
      node.localName,
  ) as SVGElement;

  // Copy attributes, resolving currentColor and var() against the source node
  const stripStyle = ctx.compat.avoidStyleAttributes;
  for (const attr of Array.from(node.attributes)) {
    // In compat mode, skip style (CSS variables, z-index) and class (no stylesheet in output)
    if (stripStyle && (attr.localName === "style" || attr.localName === "class")) {
      continue;
    }
    const value = DYNAMIC.test(attr.value)
        ? styles.getPropertyValue(attr.localName) || attr.value
        : attr.value;
    if (attr.namespaceURI === XLINK_NS) {
      clone.setAttributeNS(XLINK_NS, attr.localName, value);
    } else if (attr.namespaceURI) {
      clone.setAttributeNS(attr.namespaceURI, attr.localName, value);
    } else {
      clone.setAttribute(attr.localName, value);
    }
  }

  // Inline CSS-applied fill/stroke that aren't present as attributes.
  // Many icon systems (e.g. GitHub Octicons) set fill via CSS rules like
  // `.octicon { fill: currentColor }` — these won't be in the attributes.
  inlineSvgPresentationStyles(styles, parentStyles, clone, ctx);
  splitAlpha(clone);

  // Recurse into children
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      clone.appendChild(cloneWithNamespace(child as SVGElement, ctx, resolveDepth, styles));
    } else if (child.nodeType === Node.TEXT_NODE) {
      clone.appendChild(ctx.svgDocument.createTextNode(child.textContent || ""));
    }
  }

  return clone;
}

/**
 * Resolve a <use> element by finding the referenced <symbol>/<g>/element
 * and inlining its content. Returns null if the reference can't be resolved.
 *
 * SVG <use> elements reference definitions via href="#id", often pointing to
 * <symbol> elements in hidden sprite sheets elsewhere in the DOM. Since those
 * symbols won't exist in our output SVG, we inline the content directly.
 */
function resolveUseElement(
    useEl: SVGElement,
    ctx: RenderContext,
    resolveDepth: number,
): SVGElement | null {
  const href =
      useEl.getAttribute("href") ||
      useEl.getAttributeNS(XLINK_NS, "href");

  if (!href || !href.startsWith("#")) return null;

  const refId = href.slice(1);
  const scope = useEl.getRootNode() as Document | ShadowRoot;
  const refEl = scope.getElementById?.(refId) ?? document.getElementById(refId);
  if (!refEl) return null;

  const group = ctx.svgDocument.createElementNS(SVG_NS, "g") as SVGElement;

  // Copy presentation attributes from <use> (except href and geometry)
  const skipAttrs = new Set(["href", "xlink:href", "x", "y", "width", "height"]);
  for (const attr of Array.from(useEl.attributes)) {
    if (skipAttrs.has(attr.localName)) continue;
    if (attr.namespaceURI === XLINK_NS) continue;
    if (attr.namespaceURI) {
      group.setAttributeNS(attr.namespaceURI, attr.localName, attr.value);
    } else {
      group.setAttribute(attr.localName, attr.value);
    }
  }

  // Apply x/y translation from <use>
  const x = parseFloat(useEl.getAttribute("x") || "0") || 0;
  const y = parseFloat(useEl.getAttribute("y") || "0") || 0;
  if (x !== 0 || y !== 0) {
    const existing = group.getAttribute("transform") || "";
    group.setAttribute("transform", `translate(${x},${y}) ${existing}`.trim());
  }

  // Inline CSS-applied fill/stroke from the <use> element
  const useStyles = window.getComputedStyle(useEl);
  const useParentStyles = useEl.parentElement
      ? window.getComputedStyle(useEl.parentElement)
      : null;
  inlineSvgPresentationStyles(useStyles, useParentStyles, group, ctx);
  splitAlpha(group);

  if (refEl.localName === "symbol") {
    // <symbol> has a viewBox — wrap content in an <svg> to apply it
    const viewBox = refEl.getAttribute("viewBox");
    const width = useEl.getAttribute("width") || refEl.getAttribute("width");
    const height = useEl.getAttribute("height") || refEl.getAttribute("height");

    const wrapper = ctx.svgDocument.createElementNS(SVG_NS, "svg") as SVGElement;
    if (viewBox) wrapper.setAttribute("viewBox", viewBox);
    if (width) wrapper.setAttribute("width", width);
    if (height) wrapper.setAttribute("height", height);
    wrapper.setAttribute("overflow", "hidden");

    const refStyles = window.getComputedStyle(refEl);
    for (const child of Array.from(refEl.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        wrapper.appendChild(
            cloneWithNamespace(child as SVGElement, ctx, resolveDepth + 1, refStyles),
        );
      }
    }
    group.appendChild(wrapper);
  } else {
    // For other elements (<g>, <path>, etc.), clone the element itself
    const refParentStyles = refEl.parentElement
        ? window.getComputedStyle(refEl.parentElement)
        : null;
    group.appendChild(
        cloneWithNamespace(refEl as SVGElement, ctx, resolveDepth + 1, refParentStyles),
    );
  }

  return group;
}

/** Inline key SVG presentation properties that may come from CSS rather than attributes */
function inlineSvgPresentationStyles(
    styles: CSSStyleDeclaration,
    parentStyles: CSSStyleDeclaration | null,
    clone: SVGElement,
    ctx: RenderContext,
): void {
  // Only write a property when it differs from the inherited value, so an
  // explicitly-black fill inside a white group survives while defaults don't bloat the output
  for (const prop of INLINED) {
    if (clone.hasAttribute(prop)) continue;
    const value = styles.getPropertyValue(prop);
    if (!value || value === parentStyles?.getPropertyValue(prop)) continue;
    clone.setAttribute(prop, value);
  }

  // opacity — in compat mode only preserve opacity=0 (hidden), skip intermediate values
  if (!clone.hasAttribute("opacity")) {
    const opacity = styles.opacity;
    if (opacity === "0") {
      clone.setAttribute("opacity", "0");
    } else if (!ctx.compat.stripGroupOpacity && opacity && opacity !== "1") {
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
      const newValue = attr.value.replace(
          /url\(#([^)]+)\)/g,
          (match, id: string) => (idMap.has(id) ? `url(#${idMap.get(id)})` : match),
      );
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
