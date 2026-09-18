import { handleStatus } from "pangram-for-word";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handleStatus(req);
