const IMAGE_TIMEOUT_MS = 10_000;
const MAX_CANVAS_DIM = 4096;

/**
 * Convert an image URL to a data URL by drawing it onto a canvas.
 * Falls back to the original URL if CORS prevents reading or loading times out.
 */
export async function imageToDataUrl(url: string): Promise<string> {
  // Already a data URL
  if (url.startsWith("data:")) return url;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const timer = setTimeout(() => {
      console.warn(`dom2svg: Image load timed out after ${IMAGE_TIMEOUT_MS}ms, using original URL: ${url}`);
      img.onload = null;
      img.onerror = null;
      resolve(url);
    }, IMAGE_TIMEOUT_MS);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        // Cap dimensions to prevent OOM on very large images
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM) {
          const scale = MAX_CANVAS_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(url);
        }
      } catch {
        console.warn(`dom2svg: CORS prevented inlining image, external URL will remain in SVG: ${url}`);
        resolve(url);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      console.warn(`dom2svg: Failed to load image, external URL will remain in SVG: ${url}`);
      resolve(url);
    };
    img.src = url;
  });
}

/** Extract URL from css url() value */
export function extractUrlFromCss(value: string): string | null {
  const match = value.match(/url\(["']?([^"')]+)["']?\)/);
  return match?.[1] ?? null;
}

/** Convert a canvas element to a data URL */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}
