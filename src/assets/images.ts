const IMAGE_TIMEOUT_MS = 10_000;

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
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
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
