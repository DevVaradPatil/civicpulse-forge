// Module-resolution hook used by scripts/node-loader.mjs. Runs on Node's
// loader thread, so it is a separate file rather than an inline data: URL.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url).href;
const CANDIDATES = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, next) {
  // "server-only" exists to break the build if a module reaches the client
  // bundle. In a script there is no client bundle, so it resolves to nothing.
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const base = new URL("src/" + specifier.slice(2), ROOT).href;
    for (const ext of CANDIDATES) {
      const url = base + ext;
      if (existsSync(fileURLToPath(url))) return next(url, context);
    }
    throw new Error(`Could not resolve ${specifier} under src/`);
  }
  return next(specifier, context);
}
