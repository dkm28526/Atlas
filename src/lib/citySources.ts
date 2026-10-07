/**
 * Free, no-key city research via Wikivoyage's MediaWiki API.
 *
 * This is the cheap half of city generation. A Wikivoyage city article
 * already holds what the planner needs — named sights (See/Do), where to
 * eat and drink, and lodging pre-sorted into Budget / Mid-range / Splurge —
 * so fetching it replaces the Claude web-search research call entirely.
 * Claude's only remaining job is to organise this text into the app's
 * City/Activity/Lodging shape (see generateCity.ts).
 *
 * Returns null whenever the article is missing, ambiguous or too thin to
 * build a city from; the caller falls back to web-search research then, so
 * an obscure place still resolves — it just costs more.
 *
 * Wikivoyage text is CC BY-SA 3.0. It is used here as source notes, not
 * republished verbatim.
 */

export interface CityGuide {
  /** The article title the notes came from. */
  title: string;
  url: string;
  /** Section-trimmed article text, ready to hand to the structuring call. */
  notes: string;
}

const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";

/**
 * The sections worth paying input tokens for, each with a character cap.
 * A big-city article runs past 100k characters, most of it transport and
 * safety detail the planner never uses — these caps bound the structuring
 * call at roughly 7k input tokens however long the article is.
 */
const SECTION_BUDGETS: Array<[section: string, maxChars: number]> = [
  ["Understand", 1500],
  ["Districts", 1500],
  ["See", 9000],
  ["Do", 5000],
  ["Eat", 3000],
  ["Drink", 2500],
  ["Sleep", 5000],
];

/** Below this much See + Do text there isn't enough to fill 6–10 activities. */
const MIN_SIGHTS_CHARS = 1500;

/** Below this much Sleep text the lodging picks would have to be invented. */
const MIN_SLEEP_CHARS = 300;

/** How much of the article's opening to search for the country name. */
const COUNTRY_CHECK_CHARS = 4000;

interface WikiPage {
  title: string;
  missing?: boolean;
  extract?: string;
  pageprops?: { disambiguation?: string };
}

export async function fetchCityGuide(
  name: string,
  country?: string | null,
): Promise<CityGuide | null> {
  try {
    const direct = await fetchGuide(name, country);
    if (direct) return direct;

    // The article may live under a different title ("Antigua Guatemala",
    // "Ho Chi Minh City") — take the top search hit, but only when it still
    // names the city, so a miss can't quietly become a different place.
    const title = await searchTitle(country ? `${name} ${country}` : name);
    if (!title || title === name) return null;
    if (!title.toLowerCase().includes(name.trim().toLowerCase())) return null;
    return await fetchGuide(title, country);
  } catch (error) {
    console.warn(`[citySources] Wikivoyage lookup failed for ${name}:`, error);
    return null;
  }
}

async function fetchGuide(title: string, country?: string | null): Promise<CityGuide | null> {
  const page = await fetchPage(title);
  if (!page?.extract) return null;

  // Names collide — "Antigua" is both a Guatemalan city and a Caribbean
  // island. An article that never mentions the expected country up front is
  // treated as the wrong place; a wrong city would be cached permanently.
  if (country) {
    const opening = page.extract.slice(0, COUNTRY_CHECK_CHARS).toLowerCase();
    if (!opening.includes(country.trim().toLowerCase())) return null;
  }

  const sections = splitSections(page.extract);
  const sights = (sections.get("See") ?? "") + (sections.get("Do") ?? "");
  if (sights.length < MIN_SIGHTS_CHARS) return null;
  if ((sections.get("Sleep") ?? "").length < MIN_SLEEP_CHARS) return null;

  const notes = SECTION_BUDGETS.flatMap(([section, maxChars]) => {
    const body = sections.get(section);
    return body ? [`## ${section}\n${clip(body, maxChars)}`] : [];
  }).join("\n\n");

  return {
    title: page.title,
    url: `https://en.wikivoyage.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    notes,
  };
}

async function fetchPage(title: string): Promise<WikiPage | null> {
  const data = await query<{ query?: { pages?: WikiPage[] } }>({
    prop: "extracts|pageprops",
    explaintext: "1",
    ppprop: "disambiguation",
    redirects: "1",
    titles: title,
  });
  const page = data.query?.pages?.[0];
  if (!page || page.missing || page.pageprops?.disambiguation !== undefined) return null;
  return page;
}

async function searchTitle(text: string): Promise<string | null> {
  const data = await query<{ query?: { search?: Array<{ title: string }> } }>({
    list: "search",
    srsearch: text,
    srlimit: "1",
    srnamespace: "0",
  });
  return data.query?.search?.[0]?.title ?? null;
}

async function query<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(WIKIVOYAGE_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const request = () =>
    fetch(url, {
      headers: {
        // Wikimedia's API etiquette asks for an identifying User-Agent, same
        // as Nominatim's (see geocode.ts).
        "User-Agent": "Atlas-TravelPlanner/1.0 (personal project; no contact url yet)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

  let response = await request();
  // One patient retry when rate-limited: giving up here doesn't fail the
  // city, it sends it down the web-search path, which costs real money.
  if (response.status === 429 || response.status === 503) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000, 5000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await request();
  }
  if (!response.ok) throw new Error(`Wikivoyage returned ${response.status}`);
  return response.json();
}

/** Split a plain-text extract into its top-level ("== See ==") sections. */
function splitSections(extract: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = extract.split(/^== (.+?) ==$/m);
  // parts = [lead, heading, body, heading, body, ...]
  for (let i = 1; i + 1 < parts.length; i += 2) {
    sections.set(parts[i].trim(), tidy(parts[i + 1]));
  }
  return sections;
}

/** Drop what the planner can't use: phone/fax numbers and blank-line runs. */
function tidy(text: string): string {
  return text
    .replace(/,?\s*☏[^.\n]*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cut at a line break where possible, so a listing isn't left half-read. */
function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf("\n", maxChars);
  return text.slice(0, cut > maxChars * 0.6 ? cut : maxChars).trimEnd() + "\n[…]";
}
