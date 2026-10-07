import { NextResponse } from "next/server";

import { AiDisabledError } from "@/lib/ai";
import { resolveCity, UnknownCityError } from "@/lib/resolveCity";

export const runtime = "nodejs";
// A cache miss does live web research across two Claude calls — measured at
// 60-150s depending on the city. Request the longest execution window the
// platform allows; the actual ceiling still depends on your hosting plan
// (e.g. Vercel's Hobby tier caps well below this regardless of what's
// requested here — see README "Deploying" before going live).
export const maxDuration = 180;

/**
 * Resolve one city by name — static catalogue hit, cache hit, or a fresh
 * Claude+web-search generation, in that order (see resolveCity.ts). Used by
 * TripForm's "search online" flow for a city the local catalogue doesn't
 * have; the response's full bundle lets the browser register the city into
 * its own in-memory copy of cities.ts, which is a separate module instance
 * from the one this route runs in.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { name, country } = (body ?? {}) as { name?: unknown; country?: unknown };
  if (typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "Give a city name." }, { status: 400 });
  }
  if (country !== undefined && typeof country !== "string") {
    return NextResponse.json({ error: "Country must be text." }, { status: 400 });
  }

  try {
    const resolved = await resolveCity(name.trim(), country?.trim() || undefined);
    return NextResponse.json(resolved);
  } catch (error) {
    if (error instanceof UnknownCityError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AiDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[/api/city]", error);
    return NextResponse.json(
      { error: "Couldn't look that city up right now. Try again in a moment." },
      { status: 500 },
    );
  }
}
