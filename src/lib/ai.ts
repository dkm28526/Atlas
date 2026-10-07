/**
 * The one switch for every paid Claude call in the app.
 *
 * Off unless `ATLAS_AI=on` is set alongside an API key, so a stray key in
 * .env.local can't quietly spend money while developing. With it off:
 *   - free-text requests use the keyword parser in llm.ts;
 *   - cities in the seed catalogue or already in the cache work as normal;
 *   - a city that would need generating is refused with AiDisabledError.
 */
export function aiEnabled(): boolean {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return hasKey && process.env.ATLAS_AI === "on";
}

export class AiDisabledError extends Error {}
