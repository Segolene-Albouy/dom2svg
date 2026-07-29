import { SVG_NS } from "./dom.js";

const VIEWPORT_ATTRS = new Set([
    "x", "y", "width", "height", "overflow", "viewBox", "preserveAspectRatio",
]);

/**
 * Replace <svg> viewports with <g> + transform
 */
export function flattenNestedSvgs(root: SVGSVGElement): void {
    for (const el of Array.from(root.querySelectorAll("svg"))) {
        if (el.getAttribute("overflow") === "hidden") continue;

        const num = (name: string) => parseFloat(el.getAttribute(name) || "0") || 0;
        const viewBox = el.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
        const parts: string[] = [];

        if (num("x") || num("y")) parts.push(`translate(${num("x")},${num("y")})`);
        if (viewBox?.length === 4 && viewBox[2] && viewBox[3]) {
            const scale = Math.min(num("width") / viewBox[2] || 1, num("height") / viewBox[3] || 1);
            if (scale !== 1) {
                parts.push(`scale(${scale})`);
            }
            if (viewBox[0] || viewBox[1]) {
                parts.push(`translate(${-viewBox[0]},${-viewBox[1]})`);
            }
        }

        const g = el.ownerDocument.createElementNS(SVG_NS, "g");
        for (const attr of Array.from(el.attributes)) {
            if (!VIEWPORT_ATTRS.has(attr.localName)) {
                g.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
            }
        }
        const existing = g.getAttribute("transform");
        if (existing) parts.push(existing);
        if (parts.length) g.setAttribute("transform", parts.join(" "));

        while (el.firstChild) {
            g.appendChild(el.firstChild);
        }
        el.replaceWith(g);
    }
}
