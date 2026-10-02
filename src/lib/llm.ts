import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { CITIES, getCity } from "./cities";
import { addDays, isValidISO, todayISO } from "./dates";
import { CATEGORIES } from "./types";
import type { Category, Pace, TravelerStyle, TripInput } from "./types";

const CITY_IDS = CITIES.map((c) => c.id) as [string, ...string[]];
const CATEGORY_IDS = CATEGORIES as [Category, ...Category[]];

/**
 * What we ask the model for. Constraining `cityIds` to an enum of ids we
 * actually have data for is the important part — it makes a hallucinated
 * destination a schema violation rather than a runtime surprise.
 */
const TripRequestSchema = z.object({
  startDate: z.string().describe("Trip start, ISO yyyy-mm-dd."),
  endDate: z.string().describe("Trip end, ISO yyyy-mm-dd, inclusive."),
  cityIds: z
    .array(z.enum(CITY_IDS))
    .describe(
      "Cities to visit, chosen only from the catalogue. Put the arrival city first.",
    ),
  interests: z.array(z.enum(CATEGORY_IDS)).describe("Activity categories to favour."),
  pace: z.enum(["relaxed", "balanced", "packed"]),
  travelerStyle: z.enum(["budget", "mid", "comfort"]),
  notes: z
    .string()
    .describe("One sentence, first person plural, explaining the choices made."),
});

export interface Interpretation {
  input: TripInput;
  source: "claude" | "heuristic";
  notes: string;
}

const SYSTEM = `You turn a traveller's free-text request into a structured trip brief.

You are the front door of a planner that specialises in DENSE MULTI-CITY trips —
the goal is to experience as much as possible in every place, not to sample many
places shallowly. Apply that bias:

- Prefer fewer cities with enough nights over many cities with one or two.
- A city needs roughly 3 nights to be worth a long-haul flight.
- Group cities that are geographically coherent. Do not mix continents unless
  the traveller clearly asked for it or the trip is three weeks or more.
- Put the city the traveller would realistically fly into first.

Only choose cities from the catalogue you are given. If the traveller names a
place that is not in it, pick the closest listed city and say so in your notes.

If no dates are given, start the trip four weeks from today and make it as long
as the traveller implies ("a couple of weeks" = 14 days). Resolve all relative
dates against the current date you are given.`;

function catalogue(): string {
  return CITIES.map((c) => `${c.id} — ${c.name}, ${c.country}`).join("\n");
}

/**
 * Turn free text into a trip brief.
 *
 * Uses Claude when credentials are available and falls back to a keyword
 * parser otherwise, so the app is fully usable with no API key — the same
 * shape of answer either way.
 */
export async function interpretTripRequest(prompt: string): Promise<Interpretation> {
  const hasKey = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );
  if (!hasKey) {
    const input = heuristicParse(prompt);
    return {
      input,
      source: "heuristic",
      notes:
        "Read your request with a keyword parser — set ANTHROPIC_API_KEY for Claude to interpret it properly.",
    };
  }

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      format: zodOutputFormat(TripRequestSchema),
      effort: "low",
    },
    messages: [
      {
        role: "user",
        content: `Today is ${todayISO()}.

City catalogue (id — name, country):
${catalogue()}

Traveller's request:
${prompt}`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    const input = heuristicParse(prompt);
    return {
      input,
      source: "heuristic",
      notes: "Claude's reply did not match the expected shape, so this is a keyword reading of your request.",
    };
  }

  // The schema constrains shape, not sense. Dates and ordering still get
  // validated here before anything reaches the planner.
  return {
    input: sanitize(
      {
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        cityIds: parsed.cityIds,
        interests: parsed.interests,
        pace: parsed.pace,
        travelerStyle: parsed.travelerStyle,
      },
      prompt,
    ),
    source: "claude",
    notes: parsed.notes,
  };
}

/**
 * Clamp a brief into something the planner can definitely handle, whatever
 * produced it.
 */
export function sanitize(candidate: TripInput, prompt = ""): TripInput {
  const cityIds = Array.from(new Set(candidate.cityIds)).filter((id) =>
    Boolean(getCity(id)),
  );

  let startDate = isValidISO(candidate.startDate)
    ? candidate.startDate
    : addDays(todayISO(), 28);
  let endDate = isValidISO(candidate.endDate) ? candidate.endDate : addDays(startDate, 9);

  // A backwards or same-day range is the most common model slip; give it a
  // sensible length rather than failing the request.
  if (endDate <= startDate) endDate = addDays(startDate, 9);

  return {
    startDate,
    endDate,
    cityIds: cityIds.length > 0 ? cityIds : heuristicCities(prompt),
    interests: candidate.interests.filter((c) => CATEGORIES.includes(c)),
    pace: candidate.pace,
    travelerStyle: candidate.travelerStyle,
  };
}

// ---------------------------------------------------------------------------
// Keyword fallback
//
// Deliberately simple: find city names, find a duration, find interest words.
// It exists so the app works with no API key at all.
// ---------------------------------------------------------------------------

const INTEREST_WORDS: Record<Category, string[]> = {
  food: ["food", "eat", "eating", "restaurant", "cuisine", "street food", "foodie"],
  museum: ["museum", "art", "gallery", "history", "historical"],
  landmark: ["landmark", "sight", "sights", "monument", "temple", "temples", "church"],
  nightlife: ["nightlife", "bar", "bars", "club", "clubbing", "party", "drinks"],
  nature: ["nature", "hike", "hiking", "park", "parks", "outdoors", "beach"],
  neighborhood: ["neighbourhood", "neighborhood", "walk", "walking", "wander", "local"],
  market: ["market", "markets", "bazaar", "shopping"],
  viewpoint: ["view", "views", "viewpoint", "skyline", "sunset", "rooftop"],
  daytrip: ["day trip", "daytrip", "excursion", "nearby"],
};

function heuristicCities(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const hits = CITIES.filter(
    (c) => lower.includes(c.name.toLowerCase()) || lower.includes(c.country.toLowerCase()),
  ).map((c) => c.id);
  // Something has to be planned; Rome and Florence are a safe, dense default.
  return hits.length > 0 ? hits.slice(0, 6) : ["rome", "florence"];
}

export function heuristicParse(prompt: string): TripInput {
  const lower = prompt.toLowerCase();

  // Duration: "10 days", "2 weeks", "a month".
  let days = 10;
  const weeks = lower.match(/(\d+)\s*week/);
  const dayMatch = lower.match(/(\d+)\s*(?:day|night)/);
  if (weeks) days = Math.min(90, Number(weeks[1]) * 7);
  else if (dayMatch) days = Math.min(120, Math.max(2, Number(dayMatch[1])));
  else if (/\bmonth\b/.test(lower)) days = 30;
  else if (/\bfortnight\b/.test(lower)) days = 14;

  const interests = (Object.keys(INTEREST_WORDS) as Category[]).filter((category) =>
    INTEREST_WORDS[category].some((word) => lower.includes(word)),
  );

  const pace: Pace = /relax|slow|chill|easy|unwind/.test(lower)
    ? "relaxed"
    : /packed|everything|intense|maximi[sz]e|as much as/.test(lower)
      ? "packed"
      : "balanced";

  const travelerStyle: TravelerStyle = /budget|cheap|hostel|backpack/.test(lower)
    ? "budget"
    : /luxur|boutique|splurge|nice hotel|comfort/.test(lower)
      ? "comfort"
      : "mid";

  const startDate = addDays(todayISO(), 28);

  return {
    startDate,
    endDate: addDays(startDate, days - 1),
    cityIds: heuristicCities(prompt),
    interests,
    pace,
    travelerStyle,
  };
}
