declare module "opentype.js" {
  export function parse(buffer: ArrayBuffer): Font;

  export interface Font {
    unitsPerEm: number;
    getPath(text: string, x: number, y: number, fontSize: number): Path;
    stringToGlyphs(text: string): Glyph[];
  }

  export interface Path {
    toPathData(decimalPlaces?: number): string;
  }

  export interface Glyph {
    advanceWidth?: number;
  }
}
