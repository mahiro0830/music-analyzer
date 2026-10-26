import { defineConfig } from "vite";

export default defineConfig({
  base: "./",// works from any folder or subpath
  worker: { format: "es" },
  server: { port: 5173 },
});
