import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    port: 5173,
    strictPort: true,
    // Listen on the network, not just localhost, so a colleague on the same network can
    // open http://<this-machine>:5173. Allowed through Windows Firewall as node.exe.
    host: true,
    // Same-origin API: the browser talks only to this server, which forwards /api to the
    // backend. A colleague's browser therefore needs no address for the backend, and there
    // is no cross-origin request for the backend's CORS list to refuse. Only used when
    // VITE_BACKEND_URL is empty (the "lan" mode); otherwise requests go straight to it.
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
