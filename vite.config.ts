import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  root: "frontend",
  base: "./",
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: { outDir: "../frontend-dist", emptyOutDir: true },
  clearScreen: false,
});
