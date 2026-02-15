import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      "dom2svg": path.resolve(__dirname, "../src/index.ts"),
    },
  },
  server: {
    port: 3000,
  },
});
