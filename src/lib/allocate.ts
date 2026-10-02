import { getActivities, requireCity } from "./cities";
import type { Activity, Category, Pace } from "./types";

/** Hours of sightseeing a day can absorb at each pace. */
export const DAY_CAPACITY_HOURS: Record<Pace, number> = {
  relaxed: 6,
  balanced: 9.5,
  packed: 12.5,
};

/** Hours a single morning/afternoon/evening block can absorb. */
export const SLOT_CAPACITY_HOURS: Record<Pace, number> = {
  relaxed: 3.5,
  balanced: 4.5,
  packed: 5.5,
};

/**
 * How much an activity counts toward a city's demand, given the interests.
 *
 * Interests *bias* the plan, they do not censor it. A traveller who ticked
 * only "food" still wants the Colosseum, and still wants a full day rather
 * than an empty one — so off-interest activities keep a reduced weight
 * instead of being dropped from consideration.
 */
export function interestWeight(activity: Activity, interests: Category[]): number {
  if (activity.mustSee) return 1;
  if (interests.length === 0) return 1;
  return interests.includes(activity.category) ? 1 : 0.55;
}

/**
 * How many days a city genuinely wants, given interests and pace.
 *
 * This is the number that makes the planner opinionated: a city with nine
 * must-sees and a cluster of markets "wants" more days than a city with three,
 * and the allocator respects that instead of splitting the trip evenly.
 */
export function cityDemandDays(
  cityId: string,
  interests: Category[],
  pace: Pace,
): number {
  const hours = getActivities(cityId).reduce(
    (sum, a) => sum + a.hours * interestWeight(a, interests),
    0,
  );
  return hours / DAY_CAPACITY_HOURS[pace];
}

export interface Allocation {
  /** cityId -> nights, for cities that survived. */
  nights: Record<string, number>;
  /** Cities dropped because the trip is too short to include them at all. */
  dropped: string[];
  /** Ordered city ids that remain. */
  cityIds: string[];
}

/**
 * Hand out `totalNights` across the ordered cities in proportion to demand.
 *
 * Greedy largest-remainder: every city starts at one night, then each spare
 * night goes to whichever city is furthest from satisfying its demand. The
 * result is proportional without ever leaving a city with zero nights.
 */
export function allocateNights(
  orderedCityIds: string[],
  totalNights: number,
  interests: Category[],
  pace: Pace,
  overrides: Record<string, number> = {},
): Allocation {
  const demand = new Map(
    orderedCityIds.map((id) => [id, Math.max(0.5, cityDemandDays(id, interests, pace))]),
  );

  // A trip with fewer nights than cities cannot host them all. Drop the
  // lowest-demand cities rather than silently giving someone a zero-night stop.
  let cityIds = [...orderedCityIds];
  const dropped: string[] = [];
  while (cityIds.length > Math.max(1, totalNights)) {
    let worst = cityIds[0];
    for (const id of cityIds) {
      if ((demand.get(id) ?? 0) < (demand.get(worst) ?? 0)) worst = id;
    }
    // Keep the anchor city — it is where the traveller arrives.
    if (worst === orderedCityIds[0]) {
      worst = cityIds[cityIds.length - 1];
    }
    dropped.push(worst);
    cityIds = cityIds.filter((id) => id !== worst);
  }

  // Pinned cities keep what the traveller asked for; everyone else starts at
  // one night and competes for the remainder.
  const pinned = new Set<string>();
  const nights: Record<string, number> = {};
  for (const id of cityIds) {
    const override = overrides[id];
    if (typeof override === "number" && Number.isFinite(override)) {
      nights[id] = Math.max(1, Math.round(override));
      pinned.add(id);
    } else {
      nights[id] = 1;
    }
  }

  const total = () => cityIds.reduce((sum, id) => sum + nights[id], 0);

  // Over-pinned: the pins alone exceed the trip. Trim the biggest first, and
  // trim pinned cities before free ones so the pins absorb their own cost.
  while (total() > totalNights) {
    const trimmable = cityIds.filter((id) => nights[id] > 1);
    if (trimmable.length === 0) break;
    const preferred = trimmable.filter((id) => pinned.has(id));
    const pool = preferred.length > 0 ? preferred : trimmable;
    let worst = pool[0];
    for (const id of pool) if (nights[id] > nights[worst]) worst = id;
    nights[worst] -= 1;
  }

  // Share out whatever is left, favouring unpinned cities.
  const free = cityIds.filter((id) => !pinned.has(id));
  const contenders = free.length > 0 ? free : cityIds;
  while (total() < totalNights) {
    let best = contenders[0];
    let bestGap = -Infinity;
    for (const id of contenders) {
      // Unmet demand, normalised so big cities do not simply always win.
      const gap = (demand.get(id) ?? 0) / nights[id];
      const underMin = nights[id] < requireCity(id).minNights ? 1.35 : 1;
      const score = gap * underMin;
      if (score > bestGap) {
        bestGap = score;
        best = id;
      }
    }
    nights[best] += 1;
  }

  return { nights, dropped, cityIds };
}
