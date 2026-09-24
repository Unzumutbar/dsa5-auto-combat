import {defineConfig} from "vite";

export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "dsa5-auto-combat.mjs"
    },
    rollupOptions: {
      output: {assetFileNames: "assets/[name][extname]"}
    }
  }
});
