import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const backendTarget =
    process.env.VITE_BACKEND_URL || "http://127.0.0.1:3000";

  return {
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: [".loca.lt", "localhost", "127.0.0.1"],
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
        "/socket.io": {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
      },
      hmr: {
        clientPort: 443,
      },
    },
  };
});
