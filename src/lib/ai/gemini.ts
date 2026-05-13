/**
 * Gemini client wrapper — single place for the SDK + retries + JSON helpers.
 *
 * Free tier (no credit card): 15 req/min for Pro, 60 req/min for Flash.
 * We default to Flash for speed/cost; switch to Pro for tougher reasoning.
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

let _client: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY not configured. Get a free key at https://aistudio.google.com.",
    );
  }
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

export function model(name: "flash" | "pro" = "flash"): GenerativeModel {
  const modelId = name === "pro" ? "gemini-1.5-pro-latest" : "gemini-2.0-flash";
  return client().getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
  });
}

/**
 * Generate plain text from a prompt. Returns the text response.
 */
export async function generateText(
  prompt: string,
  opts: { model?: "flash" | "pro"; system?: string; temperature?: number } = {},
): Promise<string> {
  const m = model(opts.model ?? "flash");
  const fullPrompt = opts.system ? `${opts.system}\n\n---\n\n${prompt}` : prompt;
  const result = await m.generateContent(fullPrompt);
  return result.response.text();
}

/**
 * Generate JSON from a prompt. The prompt should describe the schema.
 * Throws if Gemini doesn't return valid JSON after a clean.
 */
export async function generateJson<T = any>(
  prompt: string,
  opts: { model?: "flash" | "pro"; system?: string } = {},
): Promise<T> {
  const text = await generateText(prompt, {
    ...opts,
    system: (opts.system ?? "") +
      "\n\nReturn valid JSON only. Do not wrap in markdown fences or include any prose.",
  });
  // Strip ```json ... ``` fences if Gemini ignored instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (e: any) {
    throw new Error(`AI returned invalid JSON: ${e.message}\n\nResponse:\n${text}`);
  }
}

/**
 * Returns whether AI is configured. Useful for gating UI features.
 */
export function aiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
