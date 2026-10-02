import { NextResponse } from "next/server";

import { buildItinerary, PlanError } from "@/lib/itinerary";
import { interpretTripRequest } from "@/lib/llm";

export const runtime = "nodejs";

/**
 * Free-text entry point: "three weeks in Japan and Thailand, food and temples".
 *
 * The structured form in the UI does not need this route — `buildItinerary` is
 * pure and runs in the browser, so adjusting a plan is instant. This route
 * exists only for the parts that need a model and an API key.
 */
export async function POST(request: Request) {
  let prompt: unknown;
  try {
    ({ prompt } = await request.json());
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof prompt !== "string" || prompt.trim().length < 3) {
    return NextResponse.json(
      { error: "Describe the trip you have in mind." },
      { status: 400 },
    );
  }
  if (prompt.length > 2000) {
    return NextResponse.json({ error: "That request is too long." }, { status: 400 });
  }

  try {
    const interpretation = await interpretTripRequest(prompt);
    const itinerary = buildItinerary(interpretation.input);
    return NextResponse.json({
      itinerary,
      source: interpretation.source,
      notes: interpretation.notes,
    });
  } catch (error) {
    if (error instanceof PlanError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[/api/plan]", error);
    return NextResponse.json(
      { error: "Could not build that itinerary. Try adjusting the dates or cities." },
      { status: 500 },
    );
  }
}
