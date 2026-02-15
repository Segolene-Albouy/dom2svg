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
  }
}

/** Get computed style for pseudo-elements */
export function getPseudoStyles(
  element: Element,
  pseudo: "::before" | "::after",
): CSSStyleDeclaration {
  return window.getComputedStyle(element, pseudo);
}
