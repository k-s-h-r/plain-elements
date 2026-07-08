import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        accordion: resolve(import.meta.dirname, "src/accordion.ts"),
        collapsible: resolve(import.meta.dirname, "src/collapsible.ts"),
        "plain-elements": resolve(import.meta.dirname, "src/index.ts"),
        dialog: resolve(import.meta.dirname, "src/dialog.ts"),
        popover: resolve(import.meta.dirname, "src/popover.ts"),
        tabs: resolve(import.meta.dirname, "src/tabs.ts"),
        tooltip: resolve(import.meta.dirname, "src/tooltip.ts")
      },
      formats: ["es"]
    },
    rollupOptions: {
      output: {
        chunkFileNames: "internal/[name].js",
        entryFileNames: "[name].js"
      }
    }
  }
});
