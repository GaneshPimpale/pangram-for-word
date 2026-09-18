export class PangramError extends Error {
  status: number;
  constructor(status: number, message: string);
}
export interface PangramWindow {
  text: string; label: string; ai_assistance_score: number; confidence: string;
  start_index: number; end_index: number; word_count: number; token_length: number;
  is_humanized?: boolean; humanizer_score?: number;
}
export interface PangramResult {
  stage: string; text: string; version: string; headline: string; prediction: string;
  prediction_short: string; fraction_ai: number; fraction_ai_assisted: number; fraction_human: number;
  num_ai_segments: number; num_ai_assisted_segments: number; num_human_segments: number;
  dashboard_link?: string; windows: PangramWindow[]; model: string; task_id: string;
}
export function resolveKey(req: Request): string;
export function listModels(apiKey: string): Promise<string[]>;
export function pickModel(apiKey: string, requested?: string): Promise<string>;
export function analyze(apiKey: string, text: string, model: string): Promise<PangramResult>;
export function errorResponse(e: unknown): Response;
export function handleStatus(req: Request): Promise<Response>;
export function handleAnalyze(req: Request): Promise<Response>;
