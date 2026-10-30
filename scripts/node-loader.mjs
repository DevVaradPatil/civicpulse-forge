// Lets plain `node` run the app's TypeScript modules in scripts and tests.
//
//   node --import ./scripts/node-loader.mjs --env-file=.env.local scripts/<script>.mjs
//
// Node 24 strips the types itself; this only teaches it the two things Next
// normally provides: the "@/" path alias and the "server-only" marker package.
import { register } from "node:module";

register(new URL("resolve-hook.mjs", import.meta.url));
