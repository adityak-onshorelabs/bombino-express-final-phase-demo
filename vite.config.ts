import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

// Which build is running, baked in at build time (client/src/lib/buildInfo.ts).
// Railway sets RAILWAY_GIT_COMMIT_SHA itself; locally the commit comes from git.
function buildCommit(): string {
  const fromRailway = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (fromRailway) return fromRailway.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const appVersion: string = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf-8"),
).version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // Compile the app while the server starts, not on the first page load:
    // otherwise the first load after every restart sits blank for ~30s while
    // ~250 modules are transformed one request at a time. The entry pulls in
    // everything it imports; pages are listed too in case a route loads lazily.
    // (server/vite.ts passes this through; it replaces the rest of `server`.)
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/pages/**/*.tsx"],
    },
  },
});
