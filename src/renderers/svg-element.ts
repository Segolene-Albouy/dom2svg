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
function cloneWithNamespace(
  node: SVGElement,
  ctx: RenderContext,
  resolveDepth: number = 0,
): SVGElement {
  // Resolve <use> elements by inlining the referenced content
  if (node.localName === "use" && resolveDepth < 5) {
    const resolved = resolveUseElement(node, ctx, resolveDepth);
    if (resolved) return resolved;
    // Fallback: clone as-is if resolution fails
  }

  // In compat mode, flatten nested <svg> without viewBox into <g> + translate.
  // Inkscape ignores overflow="visible" during PDF export, clipping edge paths
  // that extend outside the nested SVG viewport.
  const flattenSvg =
    ctx.compat.flattenNestedSvg &&
    node.localName === "svg" &&
    node.ownerSVGElement !== null &&
    !node.getAttribute("viewBox");

  const clone = ctx.svgDocument.createElementNS(
    node.namespaceURI || SVG_NS,
    flattenSvg ? "g" : node.localName,
  ) as SVGElement;

  // Copy attributes
  const stripStyle = ctx.compat.avoidStyleAttributes;
  const svgGeomAttrs = new Set(["x", "y", "width", "height", "overflow", "viewBox"]);
  for (const attr of Array.from(node.attributes)) {
    // In compat mode, skip style (CSS variables, z-index) and class (no stylesheet in output)
    if (stripStyle && (attr.localName === "style" || attr.localName === "class")) {
      continue;
    }
    // When flattening <svg> → <g>, skip viewport attributes (handled via translate)
    if (flattenSvg && svgGeomAttrs.has(attr.localName)) {
      continue;
    }
    if (attr.namespaceURI === XLINK_NS) {
      clone.setAttributeNS(XLINK_NS, attr.localName, attr.value);
    } else if (attr.namespaceURI) {
      clone.setAttributeNS(attr.namespaceURI, attr.localName, attr.value);
    } else {
      clone.setAttribute(attr.localName, attr.value);
    }
  }

  // Apply x/y from the nested <svg> as a translate on the <g>
  if (flattenSvg) {
    const x = parseFloat(node.getAttribute("x") || "0") || 0;
    const y = parseFloat(node.getAttribute("y") || "0") || 0;
    if (x !== 0 || y !== 0) {
      clone.setAttribute("transform", `translate(${x},${y})`);
    }
  }

  // Inline CSS-applied fill/stroke that aren't present as attributes.
  // Many icon systems (e.g. GitHub Octicons) set fill via CSS rules like
  // `.octicon { fill: currentColor }` — these won't be in the attributes.
  inlineSvgPresentationStyles(node, clone, ctx);

  // Recurse into children
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      clone.appendChild(cloneWithNamespace(child as SVGElement, ctx, resolveDepth));
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
  const refEl = document.getElementById(refId);
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
  inlineSvgPresentationStyles(useEl, group, ctx);

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

    for (const child of Array.from(refEl.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        wrapper.appendChild(cloneWithNamespace(child as SVGElement, ctx, resolveDepth + 1));
      }
    }
    group.appendChild(wrapper);
  } else {
    // For other elements (<g>, <path>, etc.), clone the element itself
    group.appendChild(cloneWithNamespace(refEl as SVGElement, ctx, resolveDepth + 1));
  }

  return group;
}

/** Inline key SVG presentation properties that may come from CSS rather than attributes */
function inlineSvgPresentationStyles(source: SVGElement, clone: SVGElement, ctx: RenderContext): void {
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

  // opacity — skip in compat mode to prevent Inkscape rasterization
  if (!ctx.compat.stripGroupOpacity && !clone.hasAttribute("opacity")) {
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
