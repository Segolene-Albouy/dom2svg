export const SVG_NS = "http://www.w3.org/2000/svg";
export const XLINK_NS = "http://www.w3.org/1999/xlink";
export const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** Check if a node is an Element */
export function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

/** Check if a node is a Text node */
export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

/** Check if an element is an SVG element */
export function isSvgElement(element: Element): element is SVGElement {
  return element.namespaceURI === SVG_NS;
}

/** Check if an element is an HTMLImageElement */
export function isImageElement(element: Element): element is HTMLImageElement {
  return element instanceof HTMLImageElement;
}

/** Check if an element is an HTMLCanvasElement */
export function isCanvasElement(element: Element): element is HTMLCanvasElement {
  return element instanceof HTMLCanvasElement;
}

/** Check if an element is a form control with a text value */
export function isFormElement(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

/** Create an SVG element in the SVG namespace */
export function createSvgElement<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tagName: K,
): SVGElementTagNameMap[K];
export function createSvgElement(doc: Document, tagName: string): SVGElement;
export function createSvgElement(doc: Document, tagName: string): SVGElement {
  return doc.createElementNS(SVG_NS, tagName);
}

/** Set multiple attributes on an SVG element */
export function setAttributes(
  element: SVGElement,
  attrs: Record<string, string | number>,
): void {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
    // Also set xlink:href for SVG 1.1 compatibility (e.g. Figma, re-parsed SVG)
    if (key === "href") {
      element.setAttributeNS(XLINK_NS, "xlink:href", String(value));
    }
  }
}

/** Get computed style for pseudo-elements */
export function getPseudoStyles(
  element: Element,
  pseudo: "::before" | "::after",
): CSSStyleDeclaration {
  return window.getComputedStyle(element, pseudo);
}

const RGBA = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/;
const SRGB = /^color\(srgb\s+([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)(?:\s*\/\s*([\d.]+%?))?\s*\)$/;

const ALPHA_ATTR: Record<string, string> = {
  fill: "fill-opacity",
  stroke: "stroke-opacity",
  "stop-color": "stop-opacity",
  "flood-color": "flood-opacity",
};

const num = (v: string, scale: number) =>
    v.endsWith("%") ? parseFloat(v) / 100 * scale : parseFloat(v) * scale;

/** Parse rgb()/rgba()/color(srgb …) into an SVG 1.1 rgb() string plus its alpha */
function parseColor(value: string): [string, number] | null {
  const rgb = RGBA.exec(value);
  const srgb = rgb ? null : SRGB.exec(value);
  const m = rgb ?? srgb;
  if (!m) return null;
  const k = srgb ? 255 : 1;
  const c = [1, 2, 3].map(i => Math.round(num(m[i], k)));
  return [`rgb(${c.join(", ")})`, m[4] === undefined ? 1 : num(m[4], 1)];
}

/** Rewrite paints to SVG 1.1: rgb() + a separate *-opacity attribute */
export function splitAlpha(el: Element): void {
  for (const [paint, alpha] of Object.entries(ALPHA_ATTR)) {
    const parsed = parseColor(el.getAttribute(paint) || "");
    if (!parsed) {
      continue;
    }
    const [rgb, a] = parsed;
    el.setAttribute(paint, rgb);
    if (a === 1) {
      continue;
    }
    const prev = parseFloat(el.getAttribute(alpha) || "1");
    el.setAttribute(alpha, (a * (Number.isNaN(prev) ? 1 : prev)).toFixed(3));
  }
}
