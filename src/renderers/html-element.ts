import type { RenderContext, BorderRadii, BoxGeometry } from "../types.js";
import {
  createSvgElement,
  setAttributes,
  isImageElement,
  isCanvasElement,
  getPseudoStyles,
} from "../utils/dom.js";
import { getRelativeBox, buildRoundedRectPath } from "../utils/geometry.js";
import {
  parseBorders,
  parseBorderRadii,
  clampRadii,
  hasBorder,
  hasRadius,
  isUniformRadius,
  hasOverflowClip,
  parseBackgroundColor,
  hasBackgroundImage,
  isVisibilityHidden,
} from "../core/styles.js";
import { parseLinearGradient, createSvgLinearGradient, rasterizeGradient } from "../assets/gradients.js";
import { imageToDataUrl, extractUrlFromCss, canvasToDataUrl } from "../assets/images.js";
import { cssTransformToSvg } from "../transforms/svg.js";
import { createDropShadowFilter } from "../assets/filters.js";

/**
 * Render an HTML element's visual properties (background, borders, overflow mask).
 * Returns a group containing the element's own visuals.
 * Children are rendered separately by the traversal engine.
 */
export async function renderHtmlElement(
  element: Element,
  rootElement: Element,
  ctx: RenderContext,
): Promise<SVGGElement> {
  const group = createSvgElement(ctx.svgDocument, "g") as SVGGElement;
  const styles = window.getComputedStyle(element);
  const box = getRelativeBox(element, rootElement);
  const radii = clampRadii(parseBorderRadii(styles), box.width, box.height);

  // CSS Transforms (applied even when visibility:hidden for layout)
  if (styles.transform && styles.transform !== "none") {
    const svgTransform = cssTransformToSvg(
      styles.transform,
      styles.transformOrigin,
      box,
    );
    if (svgTransform) {
      group.setAttribute("transform", svgTransform);
    }
  }

  // Skip own visuals when visibility:hidden, but keep the group
  // so visible children can still be rendered inside it.
  const hidden = isVisibilityHidden(styles);

  if (!hidden) {
    // CSS Filters (drop-shadow)
    if (styles.filter && styles.filter !== "none") {
      const filterId = createDropShadowFilter(styles.filter, ctx);
      if (filterId) {
        group.setAttribute("filter", `url(#${filterId})`);
      }
    }

    // Background color
    const bgColor = parseBackgroundColor(styles);
    if (bgColor) {
      const rect = createBoxShape(box, radii, ctx);
      rect.setAttribute("fill", bgColor);
      group.appendChild(rect);
    }

    // Background image (gradients)
    if (hasBackgroundImage(styles)) {
      const bgImage = styles.backgroundImage;
      const gradient = parseLinearGradient(bgImage);
      if (gradient) {
        const gradientEl = createSvgLinearGradient(gradient, box, ctx);
        const rect = createBoxShape(box, radii, ctx);
        rect.setAttribute("fill", `url(#${gradientEl.getAttribute("id")})`);
        group.appendChild(rect);
      } else {
        // Conic / radial gradient — rasterize via Canvas 2D API
        const rasterized = rasterizeGradient(bgImage, box.width, box.height);
        if (rasterized) {
          const imgEl = createSvgElement(ctx.svgDocument, "image");
          setAttributes(imgEl, {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            href: rasterized,
            preserveAspectRatio: "none",
          });
          if (hasRadius(radii)) {
            applyClipMask(imgEl, box, radii, ctx, group);
          } else {
            group.appendChild(imgEl);
          }
        }

        // Background image URL
        const url = !rasterized ? extractUrlFromCss(bgImage) : null;
        if (url) {
          const dataUrl = await imageToDataUrl(url);
          const imgEl = createSvgElement(ctx.svgDocument, "image");
          setAttributes(imgEl, {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            href: dataUrl,
            preserveAspectRatio: "none",
          });
          if (hasRadius(radii)) {
            applyClipMask(imgEl, box, radii, ctx, group);
          } else {
            group.appendChild(imgEl);
          }
        }
      }
    }

    // Borders
    const borders = parseBorders(styles);
    if (hasBorder(borders)) {
      renderBorders(group, box, borders, radii, ctx);
    }

    // <img> element
    if (isImageElement(element) && element.src) {
      const dataUrl = await imageToDataUrl(element.src);
      const imgEl = createSvgElement(ctx.svgDocument, "image");
      setAttributes(imgEl, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        href: dataUrl,
      });
      const objectFit = styles.objectFit || element.style.objectFit;
      if (objectFit === "fill" || objectFit === "") {
        imgEl.setAttribute("preserveAspectRatio", "none");
      } else if (objectFit === "contain" || objectFit === "scale-down") {
        imgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
      } else if (objectFit === "cover") {
        imgEl.setAttribute("preserveAspectRatio", "xMidYMid slice");
      }
      group.appendChild(imgEl);
    }

    // <canvas> element
    if (isCanvasElement(element)) {
      const dataUrl = canvasToDataUrl(element);
      if (dataUrl) {
        const imgEl = createSvgElement(ctx.svgDocument, "image");
        setAttributes(imgEl, {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          href: dataUrl,
        });
        group.appendChild(imgEl);
      }
    }

    // Pseudo-elements (::before, ::after)
    await renderPseudoElement(element, "::before", rootElement, ctx, group);
  }

  // Overflow clipping — wrap children in a mask group.
  // Skip for the root element: its border-radius clipping is handled at
  // the SVG level in index.ts, and a mask here causes subpixel truncation.
  if (hasOverflowClip(styles) && element !== rootElement) {
    const maskGroup = createOverflowMask(box, radii, ctx);
    group.appendChild(maskGroup);
    // The caller should append children to this maskGroup
    (group as any).__childTarget = maskGroup;
  }

  return group;
}

/**
 * Render the ::after pseudo-element. Called after children are appended.
 */
export async function renderPseudoAfter(
  element: Element,
  rootElement: Element,
  ctx: RenderContext,
  group: SVGGElement,
): Promise<void> {
  await renderPseudoElement(element, "::after", rootElement, ctx, group);
}

/** Get the child target group (mask group if overflow:hidden, else the group itself) */
export function getChildTarget(group: SVGGElement): SVGElement {
  return (group as any).__childTarget ?? group;
}

/**
 * Create an SVG shape for a box — <rect> for uniform/no radius,
 * <path> for non-uniform border-radius.
 */
function createBoxShape(
  box: BoxGeometry,
  radii: BorderRadii,
  ctx: RenderContext,
): SVGElement {
  if (hasRadius(radii) && !isUniformRadius(radii)) {
    return createRoundedRectPath(box, radii, ctx);
  }

  const rect = createSvgElement(ctx.svgDocument, "rect");
  setAttributes(rect, {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  });

  if (hasRadius(radii) && isUniformRadius(radii)) {
    setAttributes(rect, {
      rx: radii.topLeft[0],
      ry: radii.topLeft[1],
    });
  }

  return rect;
}

/** Create a <path> with non-uniform border-radius */
function createRoundedRectPath(
  box: BoxGeometry,
  radii: BorderRadii,
  ctx: RenderContext,
): SVGPathElement {
  const path = createSvgElement(ctx.svgDocument, "path");
  path.setAttribute("d", buildRoundedRectPath(box.x, box.y, box.width, box.height, radii));
  return path;
}

/** Get SVG stroke-dasharray for a CSS border style */
function borderDashArray(style: string, width: number): string | null {
  if (style === "dashed") return `${width * 3} ${width * 2}`;
  if (style === "dotted") return `${width} ${width}`;
  return null;
}

/** Render borders as SVG rects (strokes) */
function renderBorders(
  group: SVGGElement,
  box: BoxGeometry,
  borders: ReturnType<typeof parseBorders>,
  radii: BorderRadii,
  ctx: RenderContext,
): void {
  // For uniform borders, use a single stroked rect
  if (
    borders.top.width === borders.right.width &&
    borders.right.width === borders.bottom.width &&
    borders.bottom.width === borders.left.width &&
    borders.top.color === borders.right.color &&
    borders.right.color === borders.bottom.color &&
    borders.bottom.color === borders.left.color &&
    borders.top.style === borders.right.style &&
    borders.right.style === borders.bottom.style &&
    borders.bottom.style === borders.left.style &&
    borders.top.width > 0 &&
    borders.top.style !== "none"
  ) {
    const halfW = borders.top.width / 2;
    const insetBox: BoxGeometry = {
      x: box.x + halfW,
      y: box.y + halfW,
      width: Math.max(0, box.width - borders.top.width),
      height: Math.max(0, box.height - borders.top.width),
    };

    // Inset the radii by the border width
    const insetRadii: BorderRadii = {
      topLeft: [Math.max(0, radii.topLeft[0] - halfW), Math.max(0, radii.topLeft[1] - halfW)],
      topRight: [Math.max(0, radii.topRight[0] - halfW), Math.max(0, radii.topRight[1] - halfW)],
      bottomRight: [Math.max(0, radii.bottomRight[0] - halfW), Math.max(0, radii.bottomRight[1] - halfW)],
      bottomLeft: [Math.max(0, radii.bottomLeft[0] - halfW), Math.max(0, radii.bottomLeft[1] - halfW)],
    };

    const shape = createBoxShape(insetBox, insetRadii, ctx);
    setAttributes(shape, {
      fill: "none",
      stroke: borders.top.color,
      "stroke-width": borders.top.width,
    });
    const dash = borderDashArray(borders.top.style, borders.top.width);
    if (dash) shape.setAttribute("stroke-dasharray", dash);

    group.appendChild(shape);
    return;
  }

  // Non-uniform borders: render each side individually.
  // Solid borders use trapezoid fills with diagonal corner joins.
  // Dashed/dotted borders use stroked center-lines with dasharray.
  const { x, y, width, height } = box;
  const bT = borders.top.width;
  const bR = borders.right.width;
  const bB = borders.bottom.width;
  const bL = borders.left.width;

  // Outer corners
  const ox0 = x, oy0 = y;
  const ox1 = x + width, oy1 = y + height;

  // Inner corners (inset by border widths)
  const ix0 = x + bL, iy0 = y + bT;
  const ix1 = x + width - bR, iy1 = y + height - bB;

  const sides: { w: number; side: ReturnType<typeof parseBorders>[keyof ReturnType<typeof parseBorders>]; trapD: string; lineD: string }[] = [
    { w: bT, side: borders.top, trapD: `M ${ox0} ${oy0} L ${ox1} ${oy0} L ${ix1} ${iy0} L ${ix0} ${iy0} Z`, lineD: `M ${ix0} ${oy0 + bT / 2} L ${ix1} ${oy0 + bT / 2}` },
    { w: bR, side: borders.right, trapD: `M ${ox1} ${oy0} L ${ox1} ${oy1} L ${ix1} ${iy1} L ${ix1} ${iy0} Z`, lineD: `M ${ox1 - bR / 2} ${iy0} L ${ox1 - bR / 2} ${iy1}` },
    { w: bB, side: borders.bottom, trapD: `M ${ox1} ${oy1} L ${ox0} ${oy1} L ${ix0} ${iy1} L ${ix1} ${iy1} Z`, lineD: `M ${ix1} ${oy1 - bB / 2} L ${ix0} ${oy1 - bB / 2}` },
    { w: bL, side: borders.left, trapD: `M ${ox0} ${oy1} L ${ox0} ${oy0} L ${ix0} ${iy0} L ${ix0} ${iy1} Z`, lineD: `M ${ox0 + bL / 2} ${iy1} L ${ox0 + bL / 2} ${iy0}` },
  ];

  for (const { w, side, trapD, lineD } of sides) {
    if (w <= 0 || side.style === "none") continue;
    const dash = borderDashArray(side.style, w);
    if (dash) {
      // Dashed/dotted: stroked center-line
      const line = createSvgElement(ctx.svgDocument, "path");
      setAttributes(line, { d: lineD, fill: "none", stroke: side.color, "stroke-width": w });
      line.setAttribute("stroke-dasharray", dash);
      group.appendChild(line);
    } else {
      // Solid: trapezoid fill
      const path = createSvgElement(ctx.svgDocument, "path");
      path.setAttribute("d", trapD);
      path.setAttribute("fill", side.color);
      group.appendChild(path);
    }
  }
}

/** Create an overflow mask using <mask> for Figma compatibility */
function createOverflowMask(
  box: BoxGeometry,
  radii: BorderRadii,
  ctx: RenderContext,
): SVGGElement {
  const maskId = ctx.idGenerator.next("mask");
  const mask = createSvgElement(ctx.svgDocument, "mask");
  mask.setAttribute("id", maskId);

  const maskRect = createBoxShape(box, radii, ctx);
  maskRect.setAttribute("fill", "white");
  mask.appendChild(maskRect);
  ctx.defs.appendChild(mask);

  const masked = createSvgElement(ctx.svgDocument, "g") as SVGGElement;
  masked.setAttribute("mask", `url(#${maskId})`);

  return masked;
}

/** Apply a clip mask to a single element */
function applyClipMask(
  target: SVGElement,
  box: BoxGeometry,
  radii: BorderRadii,
  ctx: RenderContext,
  group: SVGGElement,
): void {
  const maskId = ctx.idGenerator.next("mask");
  const mask = createSvgElement(ctx.svgDocument, "mask");
  mask.setAttribute("id", maskId);

  const maskRect = createBoxShape(box, radii, ctx);
  maskRect.setAttribute("fill", "white");
  mask.appendChild(maskRect);
  ctx.defs.appendChild(mask);

  const wrapper = createSvgElement(ctx.svgDocument, "g");
  wrapper.setAttribute("mask", `url(#${maskId})`);
  wrapper.appendChild(target);
  group.appendChild(wrapper);
}

/** Render a pseudo-element (::before or ::after) */
async function renderPseudoElement(
  element: Element,
  pseudo: "::before" | "::after",
  rootElement: Element,
  ctx: RenderContext,
  group: SVGGElement,
): Promise<void> {
  const styles = getPseudoStyles(element, pseudo);
  const content = styles.content;

  // No content or empty
  if (!content || content === "none" || content === "normal" || content === '""') {
    return;
  }

  // Extract text content (strip quotes)
  let text = content.replace(/^["']|["']$/g, "");
  if (!text) return;

  const parentBox = getRelativeBox(element, rootElement);
  const fontSize = parseFloat(styles.fontSize) || 16;

  // Create a text element for the pseudo content
  const textEl = createSvgElement(ctx.svgDocument, "text");
  setAttributes(textEl, {
    "font-family": styles.fontFamily,
    "font-size": styles.fontSize,
    "font-weight": styles.fontWeight,
    "font-style": styles.fontStyle,
    fill: styles.color,
  });

  // Position based on pseudo type
  if (pseudo === "::before") {
    setAttributes(textEl, {
      x: parentBox.x,
      y: parentBox.y + fontSize * 0.85,
    });
  } else {
    setAttributes(textEl, {
      x: parentBox.x + parentBox.width,
      y: parentBox.y + fontSize * 0.85,
      "text-anchor": "end",
    });
  }

  textEl.textContent = text;

  // Background for pseudo-element
  const bgColor = parseBackgroundColor(styles);
  if (bgColor) {
    // Inject a temporary span to measure the pseudo-element
    const span = document.createElement("span");
    span.style.cssText = `
      font-family: ${styles.fontFamily};
      font-size: ${styles.fontSize};
      font-weight: ${styles.fontWeight};
      visibility: hidden;
      position: absolute;
    `;
    span.textContent = text;
    document.body.appendChild(span);
    const width = span.offsetWidth;
    const height = span.offsetHeight;
    document.body.removeChild(span);

    const bgRect = createSvgElement(ctx.svgDocument, "rect");
    setAttributes(bgRect, {
      x: pseudo === "::before" ? parentBox.x : parentBox.x + parentBox.width - width,
      y: parentBox.y,
      width,
      height,
      fill: bgColor,
    });
    group.appendChild(bgRect);
  }

  group.appendChild(textEl);
}
