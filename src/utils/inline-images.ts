import { XLINK_NS, setAttributes } from "./dom.js";
import { fetchAsDataUrl, imageToDataUrl } from "../assets/images.js";

/** Inline every <image> href as a data URL so the SVG is self-contained */
export async function inlineSvgImages(root: SVGSVGElement): Promise<void> {
    await Promise.all(Array.from(root.querySelectorAll("image")).map(async el => {
        const href = el.getAttribute("href") || el.getAttributeNS(XLINK_NS, "href");
        if (!href || href.startsWith("data:")) return;
        const data = await fetchAsDataUrl(href).catch(() => imageToDataUrl(href));
        setAttributes(el, { href: data });
    }));
}
