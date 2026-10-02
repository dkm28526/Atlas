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

  const nights: Record<string, number> = {};
  for (const id of cityIds) nights[id] = 1;

  let remaining = Math.max(0, totalNights - cityIds.length);
  while (remaining > 0) {
    let best = cityIds[0];
    let bestGap = -Infinity;
    for (const id of cityIds) {
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
    remaining -= 1;
  }

  return { nights, dropped, cityIds };
}
