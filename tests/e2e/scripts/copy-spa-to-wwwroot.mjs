// Copies the Vite build output (src/SapAssistant.Web/dist) into the API's wwwroot/
// so the .NET API can serve the SPA from the same origin (production layout).
// Run via `npm run prepare:wwwroot` (or `prepare:all` to also build first).

import { existsSync, rmSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const dist = resolve(repoRoot, "src", "SapAssistant.Web", "dist");
const wwwroot = resolve(repoRoot, "src", "SapAssistant.Api", "wwwroot");

if (!existsSync(dist)) {
  console.error(`SPA build output not found at ${dist}`);
  console.error("Run `npm run prepare:spa` first (or `npm run prepare:all`).");
  process.exit(1);
}

if (existsSync(wwwroot)) rmSync(wwwroot, { recursive: true, force: true });
cpSync(dist, wwwroot, { recursive: true });
console.log(`copied ${dist} -> ${wwwroot}`);
