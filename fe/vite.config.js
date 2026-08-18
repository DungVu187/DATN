import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = "http://localhost:5000";
const proxyPaths = [
  "/users",
  "/products",
  "/orders",
  "/chips",
  "/carts",
  "/manages",
  "/images",
  "/documents",
  "/section-images",
];

const proxy = Object.fromEntries(
  proxyPaths.map((path) => [path, { target: proxyTarget, changeOrigin: true }])
);

export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy,
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
  },
});
