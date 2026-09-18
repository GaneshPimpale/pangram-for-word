import { handleAnalyze } from "pangram-for-word";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // polling Pangram can take a while on long documents
export const POST = (req: Request) => handleAnalyze(req);
