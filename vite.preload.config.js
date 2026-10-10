import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "build/main",
    emptyOutDir: true,
    lib: { entry: "src/main/preload.js", formats: ["cjs"], fileName: () => "preload.cjs" },
    rollupOptions: { external: ["electron"] },
  },
});
