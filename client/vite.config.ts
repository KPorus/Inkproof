import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Set to your GitHub Pages repo name, e.g. "/assign/"
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/assign/",
  server: {
    port: 5173,
  },
});
