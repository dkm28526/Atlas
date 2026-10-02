/**
 * Free, no-key geocoding via OpenStreetMap's Nominatim.
 *
 * Used instead of trusting Claude to recall exact coordinates: fine for
 * famous cities, but an obscure or ambiguous name is exactly where a model
 * is most likely to guess. A geocoder either finds a real place or it
 * doesn't — that doubles as validation. A city name that returns nothing
 * here is the signal to tell the user we couldn't find it, rather than
 * silently building a trip around a hallucinated place.
 *
 * Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
 * requires a descriptive User-Agent and caps at ~1 request/second for the
 * shared public instance. Both are easy to honour here: this is called at
 * most once per *unique* city, ever, because the result feeds straight into
 * the cache in city.ts's generation pipeline.
 */

export interface GeocodeResult {
  lat: number;
  lon: number;
  /** Nominatim's own display name — useful for disambiguating "Springfield". */
  displayName: string;
  /** Best-effort country name, when Nominatim's address detail includes one. */
  country: string | null;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function geocodeCity(
  name: string,
  country?: string,
): Promise<GeocodeResult | null> {
  const query = country ? `${name}, ${country}` : name;
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  // Without this, Nominatim returns the country name in its local language
  // ("Việt Nam", "España") — fine for display in some apps, wrong here,
  // since it also feeds the cache key and the City record shown in the UI.
  url.searchParams.set("accept-language", "en");

  const response = await fetch(url, {
    headers: {
      // Required by Nominatim's usage policy — identifies the app and gives
      // them a way to reach out if something's misbehaving.
      "User-Agent": "Atlas-TravelPlanner/1.0 (personal project; no contact url yet)",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}`);
  }

  const results: Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: { country?: string };
  }> = await response.json();

  const top = results[0];
  if (!top) return null;

  return {
    lat: Number(top.lat),
    lon: Number(top.lon),
    displayName: top.display_name,
    country: top.address?.country ?? null,
  };
}
