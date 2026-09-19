// Vercel Function: GET /api/status. Users bring their own key (x-api-key header);
// the handler never falls back to a server-side key here.
import { handleStatus } from "../lib/pangram.mjs";

export const GET = (request) => handleStatus(request);
