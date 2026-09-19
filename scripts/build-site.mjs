// Assembles the static site for hosting (Vercel runs this as the build command):
//   public/  <- src/*, assets/*, and a manifest.xml pointing at the deployment's URL.
// Base URL: ADDIN_BASE_URL, else the Vercel production domain, else localhost.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// .env is gitignored, so on Vercel ADDIN_BASE_URL is only set if you add it as a project
// env var. Otherwise use the project's production domain (custom domain if one is assigned).
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const base = (
  process.env.ADDIN_BASE_URL ||
  (vercelHost ? `https://${vercelHost}` : `https://localhost:${process.env.PORT || 3939}`)
).replace(/\/+$/, "");

const out = path.join(ROOT, "public");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "assets"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "src"))) fs.copyFileSync(path.join(ROOT, "src", f), path.join(out, f));
for (const f of fs.readdirSync(path.join(ROOT, "assets"))) fs.copyFileSync(path.join(ROOT, "assets", f), path.join(out, "assets", f));
execFileSync(process.execPath, [path.join(ROOT, "scripts/build-manifest.mjs"), base, path.join(out, "manifest.xml")], { stdio: "inherit" });
console.log(`Built site in public/ for ${base}`);
