import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ["opentype.js"],
  },
  {
    entry: { "cli-bundle": "src/cli-entry.ts" },
    format: ["iife"],
    noExternal: ["opentype.js"],
  },
]);
