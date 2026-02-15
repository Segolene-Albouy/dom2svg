import type { FontCache, FontMapping, FontConfig } from "../types.js";

/**
 * Create a font cache that loads and caches opentype.js Font objects.
 * Fonts are loaded on-demand from URLs provided in the font mapping.
 */
export function createFontCache(mapping: FontMapping): FontCache {
  const cache = new Map<string, any>();
  let opentypeModule: any = null;

  async function loadOpentype(): Promise<any> {
    if (opentypeModule) return opentypeModule;
    opentypeModule = await import("opentype.js");
    return opentypeModule;
  }

  function getKey(family: string, weight?: string | number, style?: string): string {
    return `${family}|${weight ?? "normal"}|${style ?? "normal"}`;
  }

  function findConfig(
    family: string,
    _weight?: string | number,
    _style?: string,
  ): { url: string; weight?: string | number; style?: string } | null {
    const entry = mapping[family];
    if (!entry) return null;

    if (typeof entry === "string") {
      return { url: entry };
    }

    return entry as FontConfig;
  }

  return {
    async getFont(family: string, weight?: string | number, style?: string) {
      const key = getKey(family, weight, style);

      if (cache.has(key)) {
        return cache.get(key);
      }

      const config = findConfig(family, weight, style);
      if (!config) return null;

      const opentype = await loadOpentype();

      try {
        const response = await fetch(config.url);
        const buffer = await response.arrayBuffer();
        const font = opentype.parse(buffer);
        cache.set(key, font);
        return font;
      } catch (err) {
        console.warn(`dom2svg: Failed to load font "${family}" from ${config.url}:`, err);
        return null;
      }
    },

    has(family: string): boolean {
      return family in mapping;
    },
  };
}

/**
 * Convert a text string to an SVG <path> using an opentype.js font.
 */
export function textToPath(
  font: any,
  text: string,
  x: number,
  y: number,
  fontSize: number,
): string {
  const path = font.getPath(text, x, y, fontSize);
  return path.toPathData(2);
}

/**
 * Measure the width of text using an opentype.js font.
 */
export function measureText(
  font: any,
  text: string,
  fontSize: number,
): number {
  const scale = fontSize / font.unitsPerEm;
  let width = 0;
  const glyphs = font.stringToGlyphs(text);
  for (const glyph of glyphs) {
    width += (glyph.advanceWidth ?? 0) * scale;
  }
  return width;
}

/**
 * Clean a font-family string: strip quotes and take the first family.
 */
export function cleanFontFamily(fontFamily: string): string {
  // Split on commas, take first, strip quotes and whitespace
  const first = fontFamily.split(",")[0]?.trim() ?? fontFamily;
  return first.replace(/^["']|["']$/g, "");
}
