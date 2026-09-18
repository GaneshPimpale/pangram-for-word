#!/usr/bin/env node
// Copies the pane into a website's public folder and writes a manifest for it.
// Usage: node scripts/publish-site.mjs <siteDir> <publicBaseUrl>
//   e.g. node scripts/publish-site.mjs ../pimpale.com https://pimpale.com/pangram
// The site must also host the proxy at <publicBaseUrl>/api/{status,analyze};
// see site/ for a Next.js App Router implementation.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [siteDir, baseUrl] = process.argv.slice(2);
if (!siteDir || !baseUrl) {
  console.error("Usage: node scripts/publish-site.mjs <siteDir> <publicBaseUrl>");
  process.exit(1);
}
const sub = new URL(baseUrl).pathname.replace(/^\/+|\/+$/g, ""); // e.g. "pangram"
const dest = path.join(path.resolve(siteDir), "public", sub);
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, "assets"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "src"))) {
  fs.copyFileSync(path.join(ROOT, "src", f), path.join(dest, f));
}
for (const f of fs.readdirSync(path.join(ROOT, "assets"))) {
  fs.copyFileSync(path.join(ROOT, "assets", f), path.join(dest, "assets", f));
}
execFileSync(process.execPath, [path.join(ROOT, "scripts/build-manifest.mjs"), baseUrl, path.join(dest, "manifest.xml")], { stdio: "inherit" });
console.log(`Published pane to ${dest}`);
