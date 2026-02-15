import { domToSvg } from "./index.js";
import type { DomToSvgOptions } from "./index.js";

declare global {
  interface Window {
    __dom2svg: (selector: string, options?: DomToSvgOptions) => Promise<string>;
  }
}

window.__dom2svg = async (selector: string, options: DomToSvgOptions = {}) => {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`No element found for selector: ${selector}`);
  }
  const result = await domToSvg(el, options);
  return result.toString();
};
