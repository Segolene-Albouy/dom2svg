/** Configuration for a single font face */
export interface FontConfig {
  url: string;
  weight?: string | number;
  style?: string;
}

/** Font mapping: family name → URL string, single config, or array of configs for multiple weights/styles */
export type FontMapping = Record<string, string | FontConfig | FontConfig[]>;

/** Options for domToSvg() */
export interface DomToSvgOptions {
  /** Map of font-family → URL or FontConfig for text-to-path conversion */
  fonts?: FontMapping;
  /** CSS selector or predicate to exclude elements */
  exclude?: string | ((element: Element) => boolean);
  /** Custom handler for specific elements — return SVGElement to use it, or null to fall through to default rendering */
  handler?: (element: Element, context: RenderContext) => SVGElement | null;
  /** Background color for the root SVG (default: transparent) */
  background?: string;
  /** Extra padding around the captured area in px */
  padding?: number;
  /** Whether to convert text to paths using opentype.js (default: false) */
  textToPath?: boolean;
  /** Skip applying CSS transforms as SVG attributes (default: false).
   *  When true, element positions come solely from getBoundingClientRect
   *  which already includes CSS transforms. Use this when capturing containers
   *  with nested CSS transforms (e.g. SvelteFlow, React Flow) where
   *  the default behaviour would double-apply transforms. */
  flattenTransforms?: boolean;
}

/** Internal render context passed through the tree */
export interface RenderContext {
  /** The output SVG document */
  svgDocument: Document;
  /** The <defs> element for shared definitions */
  defs: SVGDefsElement;
  /** ID generator for unique IDs */
  idGenerator: IdGenerator;
  /** Options from the caller */
  options: DomToSvgOptions;
  /** Font cache (available when textToPath is enabled) */
  fontCache?: FontCache;
  /** Current inherited opacity */
  opacity: number;
}

/** Parsed CSS border side */
export interface BorderSide {
  width: number;
  style: string;
  color: string;
}

/** Parsed CSS borders */
export interface Borders {
  top: BorderSide;
  right: BorderSide;
  bottom: BorderSide;
  left: BorderSide;
}

/** Parsed border-radius values (in px) */
export interface BorderRadii {
  topLeft: [number, number];
  topRight: [number, number];
  bottomRight: [number, number];
  bottomLeft: [number, number];
}

/** Parsed CSS box */
export interface BoxGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** CSS transform function */
export type TransformFunction =
  | { type: "matrix"; values: [number, number, number, number, number, number] }
  | { type: "translate"; x: number; y: number }
  | { type: "scale"; x: number; y: number }
  | { type: "rotate"; angle: number }
  | { type: "skewX"; angle: number }
  | { type: "skewY"; angle: number };

/** 2D affine transform matrix [a, b, c, d, e, f] */
export type MatrixTuple = [number, number, number, number, number, number];

/** Parsed linear gradient */
export interface LinearGradient {
  angle: number;
  stops: GradientStop[];
}

/** A single gradient color stop */
export interface GradientStop {
  color: string;
  position: number;
}

/** Interface for unique ID generation */
export interface IdGenerator {
  next(prefix?: string): string;
}

/** Interface for the font cache */
export interface FontCache {
  getFont(family: string, weight?: string | number, style?: string): Promise<any>;
  has(family: string): boolean;
}

/** Result of domToSvg() */
export interface DomToSvgResult {
  /** The generated SVG element */
  svg: SVGSVGElement;
  /** Serialize to SVG string */
  toString(): string;
  /** Serialize to a Blob */
  toBlob(): Blob;
  /** Trigger a download in the browser */
  download(filename?: string): void;
}
