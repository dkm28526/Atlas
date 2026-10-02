import { getCacheStore } from "./cache";
import { getActivities, getAllCities, getCity, getLodging, registerCity, slug } from "./cities";
import { geocodeCity } from "./geocode";
import { generateCityProfile } from "./generateCity";
import type { Activity, City, Lodging } from "./types";

export class UnknownCityError extends Error {}

interface CachedBundle {
  city: City;
  activities: Activity[];
  lodging: Lodging[];
}

export interface ResolvedCity extends CachedBundle {
  source: "known" | "cached" | "generated";
}

/**
 * Ensure a city exists in the live registry, generating and caching it if
 * this is the first time anyone has asked for it — then return the full
 * bundle so the caller can also register it on their own side (the API
 * route's Node process and the browser are different module instances; each
 * needs its own registerCity() call).
 *
 * Layering, cheapest check first:
 *   1. Already registered this process (static seed, or resolved earlier) —
 *      free, no network.
 *   2. In the persistent cache (Upstash in prod, a file in local dev) —
 *      free, no LLM call, survives process restarts and is shared across
 *      every user who's ever asked for this city before.
 *   3. Neither — geocode (validates the place is real), then generate via
 *      Claude with live web search, then write through to the cache.
 *
 * Throws UnknownCityError when the name doesn't geocode to anywhere real,
 * rather than silently building a trip around a hallucinated place.
 */
export async function resolveCity(name: string, country?: string): Promise<ResolvedCity> {
  const localId = slug(country ? `${name}-${country}` : name);
  const existing = getCity(localId) ?? findByName(name);
  if (existing) {
    return {
      city: existing,
      activities: getActivities(existing.id),
      lodging: getLodging(existing.id),
      source: "known",
    };
  }

  const geocoded = await geocodeCity(name, country);
  if (!geocoded) {
    throw new UnknownCityError(
      `Couldn't find "${name}"${country ? `, ${country}` : ""} on the map. Check the spelling, or try adding the country.`,
    );
  }

  const cacheKey = slug(`${name}-${geocoded.country ?? country ?? ""}`);
  const cache = getCacheStore();

  const cached = await cache.get<CachedBundle>(cacheKey);
  console.log(`[resolveCity] ${cacheKey}: ${cached ? "cache hit" : "cache miss, generating"}`);
  if (cached) {
    registerCity(cached.city, cached.activities, cached.lodging);
    return { ...cached, source: "cached" };
  }

  const generated = await generateCityProfile(name, country ?? geocoded.country, {
    lat: geocoded.lat,
    lon: geocoded.lon,
  });

  const cityId = cacheKey;
  const city: City = { id: cityId, ...generated.city };
  const activities: Activity[] = generated.activities.map((a) => ({
    id: `${cityId}-${slug(a.name)}`,
    cityId,
    ...a,
  }));
  const lodging: Lodging[] = generated.lodging.map((l) => ({
    id: `${cityId}-${slug(l.name)}`,
    cityId,
    ...l,
  }));

  await cache.set(cacheKey, { city, activities, lodging });
  registerCity(city, activities, lodging);

  return { city, activities, lodging, source: "generated" };
}

function findByName(name: string): City | undefined {
  const q = name.trim().toLowerCase();
  return getAllCities().find((c) => c.name.toLowerCase() === q);
}
