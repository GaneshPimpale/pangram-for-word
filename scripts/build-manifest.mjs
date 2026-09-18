// Renders manifest.xml from manifest.template.xml using ADDIN_BASE_URL (.env or env).
// Usage: node scripts/build-manifest.mjs [baseUrl] [outFile]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const DEFAULT_BASE = `https://localhost:${process.env.PORT || 3939}`;
const base = (process.argv[2] || process.env.ADDIN_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
const out = process.argv[3] || path.join(ROOT, "manifest.xml");

if (!/^https:\/\//.test(base)) {
  console.error(`ADDIN_BASE_URL must start with https:// (got "${base}") — Office refuses http add-ins.`);
  process.exit(1);
}

// Stable UUID per base URL so a localhost build and a hosted build can be
// sideloaded side by side without colliding.
function uuidFor(str) {
  const h = crypto.createHash("sha1").update("pangram-for-word:" + str).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const template = fs.readFileSync(path.join(ROOT, "manifest.template.xml"), "utf8");
const xml = template.replaceAll("{{BASE_URL}}", base).replaceAll("{{ID}}", uuidFor(base));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, xml);
console.log(`Wrote ${path.relative(process.cwd(), out) || out} for ${base}`);
