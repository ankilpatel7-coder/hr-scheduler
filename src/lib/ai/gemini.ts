/**
 * AI client wrapper — single place for the SDK + JSON helpers.
 *
 * Backed by Groq (Llama 3.3 70B) on the free tier:
 *   - 30 req/min, 14,400 req/day
 *   - 6K input tokens/min, 100K input tokens/day
 *   - No credit card required
 *
 * Filename kept as `gemini.ts` to avoid touching the two call sites
 * (payroll-explain, docs-chat). The exported API surface is identical
 * to the previous Gemini wrapper.
 */

import Groq from "groq-sdk";

let _client: Groq | null = null;
function client(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY not configured. Get a free key at https://console.groq.com/keys.",
    );
  }
  if (!_client) {
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _client;
}

// Both tiers point at the same Llama 3.3 70B for now — Groq's free tier
// doesn't have a meaningful "pro" alternative. If we ever pay for Groq's
// 405B endpoint or swap providers, "pro" can route there.
const MODEL_FLASH = "llama-3.3-70b-versatile";
const MODEL_PRO = "llama-3.3-70b-versatile";

/**
 * Returns the Groq model id for the requested tier. Exported only because
 * the previous Gemini wrapper exported `model()`; new code should call
 * `generateText` / `generateJson` directly.
 */
export function model(name: "flash" | "pro" = "flash"): string {
  return name === "pro" ? MODEL_PRO : MODEL_FLASH;
}

/**
 * Generate plain text from a prompt. Returns the text response.
 */
export async function generateText(
  prompt: string,
  opts: { model?: "flash" | "pro"; system?: string; temperature?: number } = {},
): Promise<string> {
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (opts.system) {
    messages.push({ role: "system", content: opts.system });
  }
  messages.push({ role: "user", content: prompt });

  const completion = await client().chat.completions.create({
    model: opts.model === "pro" ? MODEL_PRO : MODEL_FLASH,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: 2048,
  });

  return completion.choices[0]?.message?.content ?? "";
}

/**
 * Generate JSON from a prompt. The prompt should describe the schema.
 * Throws if the model doesn't return valid JSON after a clean.
 */
export async function generateJson<T = any>(
  prompt: string,
  opts: { model?: "flash" | "pro"; system?: string } = {},
): Promise<T> {
  const text = await generateText(prompt, {
    ...opts,
    system:
      (opts.system ?? "") +
      "\n\nReturn valid JSON only. Do not wrap in markdown fences or include any prose.",
  });
  // Strip ```json ... ``` fences if the model ignored instructions
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (e: any) {
    throw new Error(
      `AI returned invalid JSON: ${e.message}\n\nResponse:\n${text}`,
    );
  }
}

/**
 * Returns whether AI is configured. Useful for gating UI features.
 */
export function aiAvailable(): boolean {
  return !!process.env.GROQ_API_KEY;
}
