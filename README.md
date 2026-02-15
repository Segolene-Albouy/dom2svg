# dom2svg

Convert DOM elements (hybrid HTML/SVG) to clean, self-contained SVG files.

Built for exporting node-based editors (SvelteFlow, React Flow, etc.) to vector graphics. Handles mixed HTML/SVG structures that existing libraries (dom-to-svg, html2canvas, html-to-image) fail on.

## Install

```bash
npm install dom2svg
```

## Quick Start

```ts
import { domToSvg } from "dom2svg";

const element = document.querySelector("#my-editor");
const result = await domToSvg(element);

// Download as .svg file
result.download("export.svg");

// Or get the SVG string
const svgString = result.toString();

// Or get a Blob for upload
const blob = result.toBlob();
```

## API

### `domToSvg(element, options?)`

Converts a DOM element tree into a self-contained SVG.

Returns `Promise<DomToSvgResult>` with:

- **`svg`** — The generated `SVGSVGElement`
- **`toString()`** — Serialized SVG string with XML declaration
- **`toBlob()`** — SVG as a `Blob` (`image/svg+xml`)
- **`download(filename?)`** — Triggers a browser download (default: `"export.svg"`)

### Options

```ts
interface DomToSvgOptions {
  // Font mapping for text-to-path conversion
  fonts?: Record<string, string | { url: string; weight?: string; style?: string }>;

  // Exclude elements by CSS selector or predicate
  exclude?: string | ((element: Element) => boolean);

  // Custom element handler — return SVGElement to override, null to use default
  handler?: (element: Element, context: RenderContext) => SVGElement | null;

  // Background color (default: transparent)
  background?: string;

  // Padding around the captured area in px (default: 0)
  padding?: number;

  // Convert text to <path> via opentype.js (default: false)
  textToPath?: boolean;
}
```

## Examples

### Basic export with background

```ts
const result = await domToSvg(element, {
  background: "#ffffff",
  padding: 20,
});
```

### Exclude UI controls from export

```ts
const result = await domToSvg(element, {
  exclude: ".toolbar, .minimap, [data-no-export]",
});
```

### Text-to-path (font-independent output)

```ts
const result = await domToSvg(element, {
  textToPath: true,
  fonts: {
    "Inter": "https://example.com/fonts/Inter-Regular.woff2",
    "Fira Code": {
      url: "https://example.com/fonts/FiraCode-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  },
});
```

### Custom element handler

```ts
const result = await domToSvg(element, {
  handler: (el, ctx) => {
    if (el.classList.contains("custom-widget")) {
      const rect = ctx.svgDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
      // ... build custom SVG representation
      return rect;
    }
    return null; // fall through to default rendering
  },
});
```

## What it Renders

| Feature | Support |
|---------|---------|
| Background colors | Yes |
| Linear gradients | Yes |
| Background images | Yes (inlined as data URLs) |
| Borders (uniform & per-side) | Yes |
| Border radius (uniform & non-uniform) | Yes |
| CSS transforms (translate, scale, rotate, skew) | Yes |
| Transform origin | Yes |
| Opacity | Yes |
| Overflow clipping | Yes (via `<mask>` for Figma compat) |
| Inline SVGs | Yes (deep clone with ID namespacing) |
| `<img>` elements | Yes (inlined as data URLs) |
| `<canvas>` elements | Yes (via `toDataURL()`) |
| Pseudo-elements (`::before`, `::after`) | Yes |
| `drop-shadow()` filter | Yes |
| Text | Yes (`<text>` or `<path>` via opentype.js) |
| `display: none` / `visibility: hidden` | Auto-skipped |

## Architecture

```
src/
├── index.ts                  # domToSvg() entry point
├── types.ts                  # All TypeScript interfaces
├── core/
│   ├── traversal.ts          # DOM tree walking
│   ├── stacking.ts           # CSS 2.1 stacking context (7-layer)
│   └── styles.ts             # CSS property parsing
├── renderers/
│   ├── html-element.ts       # HTML → SVG (bg, borders, overflow, pseudo)
│   ├── svg-element.ts        # SVG cloning with ID namespacing
│   └── text-node.ts          # Text → <text> or <path>
├── assets/
│   ├── images.ts             # Image → data URL inlining
│   ├── fonts.ts              # Font loading + text-to-path (opentype.js)
│   ├── gradients.ts          # CSS gradient → SVG gradient
│   └── filters.ts            # drop-shadow → SVG filter
├── transforms/
│   ├── parse.ts              # CSS transform string parsing
│   ├── matrix.ts             # 2D affine matrix operations
│   └── svg.ts                # CSS transform → SVG transform attribute
└── utils/
    ├── dom.ts                # DOM type guards, SVG namespace helpers
    ├── id-generator.ts       # Unique ID generation
    └── geometry.ts           # Bounding box utilities
```

Single runtime dependency: [opentype.js](https://github.com/opentypejs/opentype.js) (only loaded when `textToPath` is enabled).

## Development

```bash
npm install
npm run build        # ESM + CJS bundles via tsup
npm run type-check   # TypeScript strict mode
npm run test         # 143 unit tests via Vitest
npm run test:watch   # Watch mode
```

## License

MIT
