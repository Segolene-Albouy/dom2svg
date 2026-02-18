import type { SvgCompat, SvgCompatConfig } from "./types.js";

/** Full fidelity — all features enabled (current default behavior) */
export const FULL_PRESET: SvgCompatConfig = {
  useClipPathForOverflow: false,
  stripFilters: false,
  stripBoxShadows: false,
  stripMaskImage: false,
  stripTextShadows: false,
  avoidStyleAttributes: false,
  stripXmlSpace: false,
  stripGroupOpacity: false,
  inlineClipPathTransforms: false,
  flattenNestedSvg: false,
};

/** Inkscape / LaTeX safe — strips unsupported SVG features */
export const INKSCAPE_PRESET: SvgCompatConfig = {
  useClipPathForOverflow: true,
  stripFilters: true,
  stripBoxShadows: true,
  stripMaskImage: true,
  stripTextShadows: true,
  avoidStyleAttributes: true,
  stripXmlSpace: true,
  stripGroupOpacity: true,
  inlineClipPathTransforms: true,
  flattenNestedSvg: true,
};

/** Resolve a compat option to a full config object */
export function resolveCompat(compat?: SvgCompat): SvgCompatConfig {
  if (!compat || compat === "full") return FULL_PRESET;
  if (compat === "inkscape") return INKSCAPE_PRESET;
  return compat;
}
