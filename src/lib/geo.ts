import type { City, Hop, HopMode } from "./types";

export const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Point at fraction `t` along the great circle from a to b.
 * Used to build the globe arcs so a route line follows the true path
 * rather than a straight chord through the planet.
 */
export function interpolateGreatCircle(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  t: number,
): { lat: number; lon: number } {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);

  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((lat2 - lat1) / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
      ),
    );

  // Antipodal or identical points have no unique path; fall back to a lerp.
  if (d === 0 || !Number.isFinite(d)) {
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  }

  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);

  return {
    lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
    lon: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

/**
 * Lat/lon to a point on a sphere of the given radius, in the orientation
 * three.js wants for an equirectangular texture mapped onto a SphereGeometry.
 */
export function latLonToVec3(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = toRad(90 - lat);
  const theta = toRad(lon + 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Pick a plausible transport mode and door-to-door duration for a hop.
 *
 * Rail is only offered where it is actually competitive: short hops on the
 * same landmass. The check is deliberately crude — a real build would hit a
 * routing API — but it keeps "Rome to Florence" off a plane, which is the
 * difference that matters for a dense multi-city plan.
 */
export function describeHop(from: City, to: City): Hop {
  const km = haversineKm(from, to);
  const sameRailNetwork = RAIL_REGIONS.some(
    (region) => region.includes(from.id) && region.includes(to.id),
  );

  let mode: HopMode;
  let hours: number;

  if (sameRailNetwork && km <= 350) {
    mode = "train";
    // ~140 km/h effective including stops, plus 1h of station overhead.
    hours = km / 140 + 1;
  } else if (sameRailNetwork && km <= 900) {
    mode = "train";
    hours = km / 180 + 1.2;
  } else {
    mode = "flight";
    // 750 km/h cruise plus 3.5h of airport, security and transfer overhead.
    hours = km / 750 + 3.5;
  }

  return { fromCityId: from.id, toCityId: to.id, km, mode, hours };
}

/** City clusters with good rail links, used only by `describeHop`. */
const RAIL_REGIONS: string[][] = [
  // Western / central Europe
  [
    "london",
    "paris",
    "amsterdam",
    "berlin",
    "prague",
    "rome",
    "florence",
    "barcelona",
    "lisbon",
  ],
  // Japan's shinkansen spine
  ["tokyo", "kyoto", "osaka"],
];

export function formatKm(km: number): string {
  return km >= 1000
    ? `${(km / 1000).toFixed(1)}k km`
    : `${Math.round(km)} km`;
}

export function formatHours(hours: number): string {
  // Round to minutes first, then split — rounding each part separately
  // produces "10h 60m".
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
