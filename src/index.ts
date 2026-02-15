import type {
  DomToSvgOptions,
  DomToSvgResult,
  RenderContext,
} from "./types.js";
import { SVG_NS, XMLNS_NS, createSvgElement, setAttributes } from "./utils/dom.js";
import { createIdGenerator } from "./utils/id-generator.js";
import { walkElement } from "./core/traversal.js";
import { createFontCache } from "./assets/fonts.js";

export type {
  DomToSvgOptions,
  DomToSvgResult,
  FontConfig,
  FontMapping,
} from "./types.js";

/**
 * Convert a DOM element (including hybrid HTML/SVG) to a self-contained SVG.
 *
 * @param element - The root DOM element to convert
 * @param options - Configuration options
 * @returns A result object with the SVG and serialization helpers
 */
export async function domToSvg(
  element: Element,
  options: DomToSvgOptions = {},
): Promise<DomToSvgResult> {
  const padding = options.padding ?? 0;
  const rect = element.getBoundingClientRect();

  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;

  // Create an SVG document
  const svgDocument = document.implementation.createDocument(SVG_NS, "svg", null);
  const svg = svgDocument.documentElement as unknown as SVGSVGElement;

  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttributeNS(XMLNS_NS, "xmlns:xlink", "http://www.w3.org/1999/xlink");
  setAttributes(svg as unknown as SVGElement, {
    width,
    height,
    viewBox: `${-padding} ${-padding} ${width} ${height}`,
  });

  // Create <defs>
  const defs = createSvgElement(svgDocument, "defs") as SVGDefsElement;
  svg.appendChild(defs);

  // Background
  if (options.background) {
    const bgRect = createSvgElement(svgDocument, "rect");
    setAttributes(bgRect, {
      x: -padding,
      y: -padding,
      width,
      height,
      fill: options.background,
    });
    svg.appendChild(bgRect);
  }

  // Build render context
  const ctx: RenderContext = {
    svgDocument,
    defs,
    idGenerator: createIdGenerator(),
    options,
    opacity: 1,
  };

  // Initialize font cache if textToPath is enabled
  if (options.textToPath && options.fonts) {
    ctx.fontCache = createFontCache(options.fonts);
  }

  // Walk the DOM tree and render
  const rootGroup = await walkElement(element, element, ctx);
  if (rootGroup) {
    svg.appendChild(rootGroup);
  }

  // Remove defs if empty
  if (defs.childNodes.length === 0) {
    svg.removeChild(defs);
  }

  return createResult(svg);
}

function createResult(svg: SVGSVGElement): DomToSvgResult {
  return {
    svg,
    toString() {
      const serializer = new XMLSerializer();
      const xmlStr = serializer.serializeToString(svg);
      return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlStr}`;
    },
    toBlob() {
      const str = this.toString();
      return new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    },
    download(filename = "export.svg") {
      const blob = this.toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}
