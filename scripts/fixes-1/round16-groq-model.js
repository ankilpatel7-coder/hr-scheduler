/**
 * ROUND 16 — replace the decommissioned Groq model.
 *
 * Groq deprecated llama-3.3-70b-versatile on 2026-06-17 for free and
 * developer tiers. Their recommended replacement is openai/gpt-oss-120b —
 * same 131k context window, faster inference.
 *
 * Walks src/ and swaps every occurrence, reporting each file touched.
 * Idempotent.
 */

const fs = require("fs");
const path = require("path");

const OLD_MODEL = "llama-3.3-70b-versatile";
const NEW_MODEL = "openai/gpt-oss-120b";

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      out.push(...walk(p));
    } else if (/\.(ts|tsx|js|mjs|json)$/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk("src");
let touched = 0;
let occurrences = 0;

for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  if (!s.includes(OLD_MODEL)) continue;
  const count = s.split(OLD_MODEL).length - 1;
  const updated = s.split(OLD_MODEL).join(NEW_MODEL);
  fs.writeFileSync(f, updated);
  console.log(`  + ${f} (${count} occurrence${count === 1 ? "" : "s"})`);
  touched++;
  occurrences += count;
}

if (touched === 0) {
  console.log(`  = no occurrences of "${OLD_MODEL}" found in src/`);
  console.log(`    It may be set via an env var instead — check GROQ_MODEL in Vercel.`);
} else {
  console.log(`\n=== ${occurrences} occurrence(s) across ${touched} file(s) ===`);
  console.log(`    ${OLD_MODEL} -> ${NEW_MODEL}`);
}
