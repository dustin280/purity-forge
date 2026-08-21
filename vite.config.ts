// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // @cf-wasm/photon ships its WASM binary via a conditional export resolved
  // at the workerd runtime layer (dist/workerd.js) — keeping it external to
  // Vite/Rollup's SSR bundling avoids the bundler trying to transform the
  // wasm import itself, matching the pattern used in @cf-wasm's own
  // official Vite-based framework examples deployed to Cloudflare.
  vite: {
    ssr: { external: ["@cf-wasm/photon"] },
  },
});
