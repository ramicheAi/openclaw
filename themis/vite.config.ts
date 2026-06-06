import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    host: true,
    // Allow Tailscale Funnel / localhost.run / ngrok / cloudflared hostnames
    // so the dev server can be intentionally tunneled. Vite blocks unknown
    // hosts by default as a CSRF safety; for our use case the dev server is
    // explicitly being published via scripts/expose.sh.
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".ts.net", // Tailscale Funnel / serve (e.g. ramons-macbook-pro.tail59e3bd.ts.net)
      ".trycloudflare.com", // Cloudflare Tunnel quick links
      ".loca.lt", // localtunnel
      ".lhr.life", // localhost.run
      ".ngrok.io",
      ".ngrok-free.app",
    ],
    // Proxy API calls to the Themis backend (themis/server, default :8787).
    proxy: {
      "/api": {
        target: process.env.THEMIS_API ?? "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
