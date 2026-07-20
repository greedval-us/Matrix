import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  root: "src/renderer",
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/"),
    },
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("vue")) return "vendor-vue";
            if (id.includes("pinia") || id.includes("vue-router")) return "vendor-state";
            if (id.includes("pdfmake") || id.includes("pdf-parse") || id.includes("xlsx")) {
              return "vendor-data";
            }
            return "vendor-misc";
          }
        },
      },
    },
  },
});
