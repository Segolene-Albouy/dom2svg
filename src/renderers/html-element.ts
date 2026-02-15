import type { RenderContext, BorderRadii, BoxGeometry } from "../types.js";
import {
  createSvgElement,
  setAttributes,
  isImageElement,
  isCanvasElement,
  getPseudoStyles,
} from "../utils/dom.js";
import { getRelativeBox } from "../utils/geometry.js";
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

  // CSS Transforms
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
      const gradientEl = createSvgLinearGradient(gradient, ctx);
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
    if (objectFit === "contain") {
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

  // Overflow clipping — wrap children in a mask group
  if (hasOverflowClip(styles)) {
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
  const { x, y, width, height } = box;
  const [tlx, tly] = radii.topLeft;
  const [trx, try_] = radii.topRight;
  const [brx, bry] = radii.bottomRight;
  const [blx, bly] = radii.bottomLeft;

  // Build path with elliptical arcs for each corner
  const d = [
    `M ${x + tlx} ${y}`,
    `L ${x + width - trx} ${y}`,
    trx || try_ ? `A ${trx} ${try_} 0 0 1 ${x + width} ${y + try_}` : "",
    `L ${x + width} ${y + height - bry}`,
    brx || bry ? `A ${brx} ${bry} 0 0 1 ${x + width - brx} ${y + height}` : "",
    `L ${x + blx} ${y + height}`,
    blx || bly ? `A ${blx} ${bly} 0 0 1 ${x} ${y + height - bly}` : "",
    `L ${x} ${y + tly}`,
    tlx || tly ? `A ${tlx} ${tly} 0 0 1 ${x + tlx} ${y}` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ");

  const path = createSvgElement(ctx.svgDocument, "path");
  path.setAttribute("d", d);
  return path;
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

    group.appendChild(shape);
    return;
  }

  // Non-uniform borders: render each side as a line
  const { x, y, width, height } = box;

  if (borders.top.width > 0 && borders.top.style !== "none") {
    const line = createSvgElement(ctx.svgDocument, "line");
    setAttributes(line, {
      x1: x,
      y1: y + borders.top.width / 2,
      x2: x + width,
      y2: y + borders.top.width / 2,
      stroke: borders.top.color,
      "stroke-width": borders.top.width,
    });
    group.appendChild(line);
  }

  if (borders.right.width > 0 && borders.right.style !== "none") {
    const line = createSvgElement(ctx.svgDocument, "line");
    setAttributes(line, {
      x1: x + width - borders.right.width / 2,
      y1: y,
      x2: x + width - borders.right.width / 2,
      y2: y + height,
      stroke: borders.right.color,
      "stroke-width": borders.right.width,
    });
    group.appendChild(line);
  }

  if (borders.bottom.width > 0 && borders.bottom.style !== "none") {
    const line = createSvgElement(ctx.svgDocument, "line");
    setAttributes(line, {
      x1: x,
      y1: y + height - borders.bottom.width / 2,
      x2: x + width,
      y2: y + height - borders.bottom.width / 2,
      stroke: borders.bottom.color,
      "stroke-width": borders.bottom.width,
    });
    group.appendChild(line);
  }

  if (borders.left.width > 0 && borders.left.style !== "none") {
    const line = createSvgElement(ctx.svgDocument, "line");
    setAttributes(line, {
      x1: x + borders.left.width / 2,
      y1: y,
      x2: x + borders.left.width / 2,
      y2: y + height,
      stroke: borders.left.color,
      "stroke-width": borders.left.width,
    });
    group.appendChild(line);
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
