import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      name: "PlainElements",
      formats: ["iife"],
      fileName: () => "plain-elements.iife.js"
    }
  }
});
