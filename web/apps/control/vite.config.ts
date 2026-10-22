import { fileURLToPath, URL } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT) || 8080,
    // Windows-side edits on /mnt/* do not reliably emit WSL file events.
    ...(process.env.WSL_DISTRO_NAME
      ? { watch: { usePolling: true, interval: 1000 } }
      : {}),
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    nitro({
      serverDir: "server",
      features: { websocket: true },
    }),
    tailwindcss(),
    tanstackStart(process.env.CONTROL_SPA === "true" ? { spa: { enabled: true } } : {}),
    react(),
  ],
});
