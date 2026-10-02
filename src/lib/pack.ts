import { DAY_CAPACITY_HOURS, SLOT_CAPACITY_HOURS } from "./allocate";
import { getActivities } from "./cities";
import { parseISO } from "./dates";
import { SLOTS } from "./types";
import type {
  Activity,
  Category,
  DayBlock,
  Hop,
  ItineraryDay,
  Pace,
  Slot,
} from "./types";

/** Long activities swallow whole halves of a day. */
function slotsNeeded(activity: Activity): number {
  if (activity.hours <= 4.5) return 1;
  if (activity.hours <= 8) return 2;
  return 3;
}

/**
 * Ranking used to decide what makes the cut when a city has more to offer
 * than the trip has room for.
 *
 * Must-sees dominate. After that, interest matches, then value per hour — so
 * when two activities tie, the shorter one wins and the day fits more in.
 */
function priority(activity: Activity, interests: Category[]): number {
  let p = 0;
  if (activity.mustSee) p += 1000;
  if (interests.includes(activity.category)) p += 150;
  p += Math.max(0, 40 - activity.hours * 4);
  return p;
}

export interface PackLegInput {
  cityId: string;
  /** Calendar dates this leg owns, in order. */
  dates: string[];
  /** 1-based trip day number of `dates[0]`. */
  dayIndexStart: number;
  /** The hop that delivered the traveller here, if any. */
  inbound?: Hop;
  interests: Category[];
  pace: Pace;
}

export interface PackedLeg {
  days: ItineraryDay[];
  /** Activity ids that made the plan. */
  scheduled: string[];
  /** Activities that did not fit. */
  skipped: Activity[];
  /** Trip day numbers that came out with nothing to do. */
  emptyDays: number[];
}

/**
 * Fill a city's days with activities.
 *
 * Two rules do the real work:
 *
 *  1. **Neighbourhood gravity.** Once a day has its first activity, anything
 *     in the same neighbourhood gets a large bonus. Days therefore cluster
 *     geographically on their own, without a hard-coded zone plan — which is
 *     the single biggest lever on how much you actually see in a day.
 *  2. **Slot fitness.** Nightlife only lands in the evening, markets in the
 *     morning. The data says where something belongs and the packer obeys it.
 */
export function packLeg(input: PackLegInput): PackedLeg {
  const { cityId, dates, dayIndexStart, inbound, interests, pace } = input;

  // Every activity in the city is a candidate. Interests steer the ranking
  // rather than shrinking the pool, so a long stay never runs out of days'
  // worth of things to do.
  const candidates = [...getActivities(cityId)].sort(
    (a, b) => priority(b, interests) - priority(a, interests),
  );

  const placed = new Set<string>();
  const scheduled: string[] = [];
  const days: ItineraryDay[] = [];

  const dayCap = DAY_CAPACITY_HOURS[pace];
  const slotCap = SLOT_CAPACITY_HOURS[pace];

  dates.forEach((date, dayOffset) => {
    const weekday = parseISO(date).getUTCDay();
    const blocks: DayBlock[] = [];
    const occupied = new Set<Slot>();
    const slotHours: Record<Slot, number> = { morning: 0, afternoon: 0, evening: 0 };
    const neighborhoodsToday = new Set<string>();
    let dayHours = 0;

    // --- Transit eats into the first day of the leg ---
    if (dayOffset === 0 && inbound) {
      const eaten: Slot[] = inbound.hours >= 6 ? ["morning", "afternoon"] : ["morning"];
      blocks.push({ slot: eaten[0], transit: inbound, spans: eaten.length });
      for (const s of eaten) occupied.add(s);
    }

    const freeFrom = (slot: Slot, needed: number): boolean => {
      const start = SLOTS.indexOf(slot);
      if (start + needed > SLOTS.length) return false;
      for (let i = start; i < start + needed; i++) {
        if (occupied.has(SLOTS[i])) return false;
      }
      return true;
    };

    for (const slot of SLOTS) {
      if (occupied.has(slot)) continue;

      // Keep pulling activities into this slot while it has room.
      for (;;) {
        let best: Activity | undefined;
        let bestScore = -Infinity;

        for (const activity of candidates) {
          if (placed.has(activity.id)) continue;
          if (!activity.bestSlots.includes(slot)) continue;
          if (activity.weekdays && !activity.weekdays.includes(weekday)) continue;

          const needed = slotsNeeded(activity);
          if (!freeFrom(slot, needed)) continue;

          if (needed === 1) {
            if (slotHours[slot] + activity.hours > slotCap + 0.01) continue;
            if (dayHours + activity.hours > dayCap + 0.01) continue;
          } else {
            // A day trip is the day. Only allow it on a still-empty day,
            // otherwise it would displace work already scheduled.
            if (dayHours > 0) continue;
          }

          let score = priority(activity, interests);
          if (neighborhoodsToday.has(activity.neighborhood)) score += 220;
          else if (neighborhoodsToday.size >= 2) score -= 80;

          if (score > bestScore) {
            bestScore = score;
            best = activity;
          }
        }

        if (!best) break;

        const needed = slotsNeeded(best);
        blocks.push({ slot, activityId: best.id, spans: needed });
        const start = SLOTS.indexOf(slot);
        for (let i = start; i < start + needed; i++) occupied.add(SLOTS[i]);

        slotHours[slot] += best.hours;
        dayHours += best.hours;
        neighborhoodsToday.add(best.neighborhood);
        placed.add(best.id);
        scheduled.push(best.id);

        if (needed > 1) break;
      }
    }

    blocks.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));

    days.push({
      date,
      dayIndex: dayIndexStart + dayOffset,
      cityId,
      blocks,
    });
  });

  return {
    days,
    scheduled,
    skipped: candidates.filter((a) => !placed.has(a.id)),
    emptyDays: days.filter((d) => d.blocks.every((b) => !b.activityId)).map((d) => d.dayIndex),
  };
}
