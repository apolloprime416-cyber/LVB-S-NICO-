/**
 * Builds the single-file serverless bundle used by Vercel.
 *
 * Output: <repo-root>/api/index.mjs — Vercel picks up every file in /api
 * as a serverless function, so we emit exactly one fully-bundled file.
 *
 * Differences from build.mjs (the Replit long-running server build):
 * - Entry is src/vercel.ts (exports the Express app; no app.listen, no seed).
 * - No esbuild-plugin-pino: transports (pino-pretty) are only enabled when
 *   NODE_ENV !== "production", and Vercel always runs with
 *   NODE_ENV=production, so plain stdout logging is used and no worker
 *   threads are required.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm, mkdir } from "node:fs/promises";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(artifactDir, "..", "..");
const outFile = path.resolve(repoRoot, "api", "index.mjs");

await rm(path.dirname(outFile), { recursive: true, force: true });
await mkdir(path.dirname(outFile), { recursive: true });

await esbuild({
  entryPoints: [path.resolve(artifactDir, "src/vercel.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outfile: outFile,
  logLevel: "info",
  // Never bundled (native/optional):
  external: [
    "*.node",
    "pg-native",
    "bufferutil",
    "utf-8-validate",
    "pino-pretty",
  ],
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
  },
});

console.log(`Vercel API bundle written to ${outFile}`);
