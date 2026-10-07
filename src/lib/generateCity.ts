import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { AiDisabledError, aiEnabled } from "./ai";
import { fetchCityGuide } from "./citySources";
import { CATEGORIES } from "./types";
import type { Activity, City, Lodging } from "./types";

const CATEGORY_IDS = CATEGORIES as [Activity["category"], ...Activity["category"][]];

/**
 * What a generated city profile must contain — deliberately the same shape
 * and density as the hand-written rows in cities.ts (same field names, same
 * voice expectations in the prompt), so a generated city behaves identically
 * to a curated one everywhere downstream: the packer, the lodging ranker,
 * the globe, the adventure map. None of that code needs to know or care
 * which kind of city it's looking at.
 */
const CityProfileSchema = z.object({
  city: z.object({
    name: z.string().describe("The city's common English name."),
    country: z.string(),
    dailyBudgetUsd: z
      .number()
      .describe("Rough mid-range daily on-the-ground spend: food + local transit + entry fees."),
    minNights: z
      .number()
      .int()
      .min(1)
      .max(10)
      .describe("Nights below which the city's must-sees realistically can't fit."),
    blurb: z
      .string()
      .describe(
        "One sharp, specific sentence on how this city is actually different to visit — not generic tourism copy.",
      ),
  }),
  activities: z
    .array(
      z.object({
        name: z.string(),
        category: z.enum(CATEGORY_IDS),
        hours: z.number().min(0.5).max(12).describe("Door-to-door hours, including queueing."),
        neighborhood: z.string(),
        bestSlots: z.array(z.enum(["morning", "afternoon", "evening"])).min(1),
        mustSee: z.boolean(),
        blurb: z
          .string()
          .describe("One specific, practical sentence — a timing tip or what makes it worth it."),
      }),
    )
    .min(6)
    .max(10)
    .describe("A spread across categories and times of day, not six museums."),
  lodging: z
    .array(
      z.object({
        name: z.string(),
        kind: z.enum(["hostel", "hotel", "boutique", "apartment"]),
        nightlyUsd: z.number().min(5).max(2000),
        neighborhood: z.string(),
        rating: z.number().min(1).max(5),
        perks: z.array(z.string()).min(1).max(4),
        why: z
          .string()
          .describe("Why this specific pick — tie it to something concrete, not generic praise."),
      }),
    )
    .length(3)
    .describe("Exactly three: one hostel/budget pick, one mid-range hotel, one boutique/splurge."),
});

const RESEARCH_SYSTEM = `You are researching a city for a dense multi-city trip planner — one that
specialises in getting the most out of every stop, not a shallow highlight reel.
This runs inside a live product request — issue your searches as a small
batch of distinct queries in one turn rather than one at a time with
reasoning in between; two or three well-chosen searches beat five sequential
ones here.

Search the web for what's actually worth doing in the named city right now:
specific named landmarks, neighbourhoods, markets, viewpoints and day trips —
not categories, actual names. Note which times of day each suits, roughly how
long it takes door-to-door, and which neighbourhood it's in (clustering by
neighbourhood is how the planner builds a good day). Separately, find three
real, specific, currently-operating places to stay: one budget/hostel, one
mid-range hotel, one boutique or splurge pick, each in a neighbourhood that
makes sense against what you just found.

Write up what you find as clear notes — real names, specifics, nothing
generic. This is research for a second pass that will structure it, not the
final output.`;

const STRUCTURE_SYSTEM = `Turn the research notes below into a structured city profile for a trip
planner. The notes may be an excerpt from a travel guide that lists far more
than is needed — choose the strongest six to ten things to do rather than the
first ones listed, and pick lodging from the places the notes actually name.
Match the voice of a sharp local friend, not tourism-board copy —
every blurb should say something a traveller couldn't already guess from the
name. Use the neighbourhood field for real clustering: two things in the same
area should actually share a neighbourhood name. If the research notes are
thin on a field, make a reasonable, clearly-labelled-as-approximate estimate
rather than inventing false specificity.`;

export class CityGenerationError extends Error {}

/**
 * Build a city profile in the app's City/Activity/Lodging shape.
 *
 * The research comes from wherever is cheapest. A Wikivoyage article, when
 * one exists, is free and already holds the sights and lodging — then the
 * only Claude call is the structuring one below. Web-search research is the
 * fallback for places Wikivoyage doesn't cover well enough, and costs a
 * second, much more expensive call.
 *
 * Research and structuring stay separate either way: combining an
 * open-ended web-search tool loop with a forced structured-output format in
 * a single call isn't a pattern either SDK's docs vouch for, and a bad
 * generation becomes a permanently cached bad city.
 */
export async function generateCityProfile(
  name: string,
  country: string | null,
  coords: { lat: number; lon: number },
): Promise<{ city: Omit<City, "id">; activities: Omit<Activity, "id" | "cityId">[]; lodging: Omit<Lodging, "id" | "cityId">[] }> {
  const place = country ? `${name}, ${country}` : name;
  if (!aiEnabled()) {
    throw new AiDisabledError(
      `${place} isn't in the catalogue or the cache yet, and adding a new city needs AI, which is switched off (ATLAS_AI).`,
    );
  }
  const client = new Anthropic();
  const t0 = Date.now();

  const guide = await fetchCityGuide(name, country);
  const researchText = guide
    ? `Source: Wikivoyage, "${guide.title}"\n\n${guide.notes}`
    : await researchViaWebSearch(client, place);

  const t1 = Date.now();
  console.log(
    `[generateCity] research via ${guide ? "wikivoyage (free)" : "web search"}: ${t1 - t0}ms, ${researchText.length} chars`,
  );

  const structured = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 4000,
    system: STRUCTURE_SYSTEM,
    output_config: { format: zodOutputFormat(CityProfileSchema) },
    messages: [
      {
        role: "user",
        content: `Research notes on ${place}:\n\n${researchText}\n\nStructure this into a city profile.`,
      },
    ],
  });

  const t2 = Date.now();
  console.log(
    `[generateCity] structure call: ${t2 - t1}ms, ${structured.usage.input_tokens} in / ${structured.usage.output_tokens} out tokens`,
  );

  const parsed = structured.parsed_output;
  if (!parsed) {
    throw new CityGenerationError(`Could not structure the research for ${place}.`);
  }

  // Coordinates come from the geocoder, not the model — see geocode.ts for why.
  return {
    city: {
      name: parsed.city.name,
      country: parsed.city.country,
      lat: coords.lat,
      lon: coords.lon,
      dailyBudgetUsd: parsed.city.dailyBudgetUsd,
      minNights: parsed.city.minNights,
      blurb: parsed.city.blurb,
    },
    activities: parsed.activities,
    lodging: parsed.lodging,
  };
}

/**
 * The expensive path: have Claude research the city with live web search.
 * Only reached when Wikivoyage has no usable article for the place.
 */
async function researchViaWebSearch(client: Anthropic, place: string): Promise<string> {
  const research = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4000,
    system: RESEARCH_SYSTEM,
    // Haiku 4.5 takes the basic web search tool (the 20260209 variant needs
    // a Sonnet/Opus-tier model) and has no effort setting. The cap on search
    // rounds is what keeps this inside a serverless function's timeout.
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
    messages: [{ role: "user", content: `Research ${place} for the trip planner.` }],
  });

  const researchText = research.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();

  if (!researchText) {
    throw new CityGenerationError(`No usable research came back for ${place}.`);
  }
  return researchText;
}
