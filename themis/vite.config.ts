import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    host: true,
    // Proxy API calls to the Themis backend (themis/server, default :8787).
    proxy: {
      "/api": {
        target: process.env.THEMIS_API ?? "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
