import type {
  DomToSvgOptions,
  DomToSvgResult,
  RenderContext,
  BorderRadii,
} from "./types.js";
import {SVG_NS, XMLNS_NS, createSvgElement, setAttributes, splitAlpha} from "./utils/dom.js";
import { createIdGenerator } from "./utils/id-generator.js";
import { walkElement } from "./core/traversal.js";
import { createFontCache } from "./assets/fonts.js";
import { parseBorderRadii, clampRadii, hasRadius, isUniformRadius, hasOverflowClip } from "./core/styles.js";
import { buildRoundedRectPath } from "./utils/geometry.js";
import { resolveCompat } from "./compat.js";
import { flattenNestedSvgs } from "./utils/flatten.js";
import {inlineSvgImages} from "./utils/inline-images";

export type {
  DomToSvgOptions,
  DomToSvgResult,
  FontConfig,
  FontMapping,
  SvgCompat,
  SvgCompatConfig,
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
    compat: resolveCompat(options.compat),
    opacity: 1,
  };

  // Initialize font cache if textToPath is enabled
  if (options.textToPath && options.fonts) {
    ctx.fontCache = createFontCache(options.fonts);
  }

  // Walk the DOM tree and render
  const rootGroup = await walkElement(element, element, ctx);
  if (rootGroup) {
    // Apply border-radius clipping at the SVG level for the root element.
    // This is done here instead of in renderHtmlElement to avoid subpixel
    // mask truncation issues that occur when the mask and viewBox compete.
    const rootStyles = window.getComputedStyle(element);
    const rootRadii = clampRadii(parseBorderRadii(rootStyles), rect.width, rect.height);
    if (hasOverflowClip(rootStyles) && hasRadius(rootRadii)) {
      const clipId = ctx.idGenerator.next("clip");
      const clipPath = createSvgElement(svgDocument, "clipPath");
      clipPath.setAttribute("id", clipId);
      const clipShape = createRootClipShape(svgDocument, rect.width, rect.height, rootRadii);
      clipPath.appendChild(clipShape);
      defs.appendChild(clipPath);
      rootGroup.setAttribute("clip-path", `url(#${clipId})`);
    }
    svg.appendChild(rootGroup);
  }

  // Nested <svg> viewports clip in Inkscape/Figma regardless of overflow="visible"
  if (ctx.compat.flattenNestedSvg) {
    flattenNestedSvgs(svg);
  }

  await inlineSvgImages(svg);

  for (const el of [svg, ...Array.from(svg.querySelectorAll("*"))]) splitAlpha(el);

  // Remove defs if empty
  if (defs.childNodes.length === 0) {
    svg.removeChild(defs);
  }

  return createResult(svg);
}

/** Create a rounded-rect shape for the root element's clipPath */
function createRootClipShape(
    doc: Document,
    width: number,
    height: number,
    radii: BorderRadii,
): SVGElement {
  if (isUniformRadius(radii)) {
    const rect = createSvgElement(doc, "rect");
    setAttributes(rect, {x: 0, y: 0, width, height, rx: radii.topLeft[0], ry: radii.topLeft[1]});
    return rect;
  }
  const path = createSvgElement(doc, "path");
  path.setAttribute("d", buildRoundedRectPath(0, 0, width, height, radii));
  return path;
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
      return new Blob([str], {type: "image/svg+xml;charset=utf-8"});
    },
    download(filename = "export.svg") {
      const blob = this.toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };
}
