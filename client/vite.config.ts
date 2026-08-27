import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local default is "/". GitHub Actions sets VITE_BASE to "/<repo>/" for Pages.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
  server: {
    port: 5173,
  },
});
