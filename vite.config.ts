import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

import { validateRewardsIndex } from "./scripts/validate-rewards-index";

export default defineConfig({
  plugins: [
    // Publishes every reward-program index as a static file, mirroring how
    // kleros/court exposes /snapshots.json: any src/assets/<program>-index.json
    // (the single source of truth the app imports) is validated and served
    // verbatim at /<program>.json — e.g. curate-rewards-index.json becomes
    // /curate-rewards.json. Adding a new program's manifest is zero-code: drop
    // the file in src/assets/ and it is picked up automatically, even in a
    // running dev server (chokidar watches the glob, including new files).
    // In dev the plugin serves straight from source via middleware (no public/
    // copy, no dev-server public-scan timing issues); in build it copies into
    // the dist root. A validation failure throws and fails the build.
    viteStaticCopy({
      targets: [
        {
          src: "src/assets/*-index.json",
          dest: ".",
          rename: (fileName) => `${fileName.replace(/-index$/, "")}.json`,
          transform: (content, filename) => validateRewardsIndex(content, filename),
        },
      ],
    }),
    react(),
    tsconfigPaths(),
  ],
});
