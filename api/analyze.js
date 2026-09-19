// Vercel Function: POST /api/analyze. Users bring their own key (x-api-key header);
// the handler never falls back to a server-side key here.
import { handleAnalyze } from "../lib/pangram.mjs";

export const POST = (request) => handleAnalyze(request);
