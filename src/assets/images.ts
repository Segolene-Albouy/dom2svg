/**
 * Convert an image URL to a data URL by drawing it onto a canvas.
 * Falls back to the original URL if CORS prevents reading.
 */
export async function imageToDataUrl(url: string): Promise<string> {
  // Already a data URL
  if (url.startsWith("data:")) return url;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
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
        // CORS or other error — use original URL
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
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
