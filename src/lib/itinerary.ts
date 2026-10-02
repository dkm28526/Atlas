import { allocateNights } from "./allocate";
import { getActivities, getLodging, requireCity } from "./cities";
import { addDays, dayCount, parseISO } from "./dates";
import { describeHop } from "./geo";
import { packLeg } from "./pack";
import { orderCities } from "./route";
import type {
  Activity,
  CityCoverage,
  Hop,
  Itinerary,
  ItineraryDay,
  Leg,
  Lodging,
  TravelerStyle,
  TripInput,
  Warning,
} from "./types";

/** How much a lodging kind suits each traveller style. */
const STYLE_FIT: Record<TravelerStyle, Record<Lodging["kind"], number>> = {
  budget: { hostel: 100, apartment: 70, hotel: 30, boutique: 0 },
  mid: { hotel: 100, apartment: 70, hostel: 55, boutique: 40 },
  comfort: { boutique: 100, hotel: 75, apartment: 45, hostel: 0 },
};

/**
 * Rank a city's lodging for this specific itinerary.
 *
 * The neighbourhood bonus is the part that matters: staying in the district
 * where your days actually happen is worth more than a slightly nicer room
 * across town, because it converts dead commute time into sightseeing time.
 */
function rankLodging(
  cityId: string,
  plannedActivities: Activity[],
  style: TravelerStyle,
): Lodging[] {
  const weight = new Map<string, number>();
  for (const a of plannedActivities) {
    weight.set(a.neighborhood, (weight.get(a.neighborhood) ?? 0) + a.hours);
  }

  return [...getLodging(cityId)]
    .map((l) => {
      const fit = STYLE_FIT[style][l.kind];
      const nearby = weight.get(l.neighborhood) ?? 0;
      return { l, score: fit + nearby * 6 + l.rating * 8 };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.l);
}

export class PlanError extends Error {}

/**
 * Build a full itinerary from the user's choices.
 *
 * Pipeline: order the cities geographically, split the nights between them by
 * demand, lay the calendar out, then pack each leg day by day.
 */
export function buildItinerary(input: TripInput): Itinerary {
  if (input.cityIds.length === 0) {
    throw new PlanError("Pick at least one city.");
  }
  const totalDays = dayCount(input.startDate, input.endDate);
  if (totalDays < 2) {
    throw new PlanError("The trip needs to be at least two days long.");
  }
  if (totalDays > 120) {
    throw new PlanError("Trips longer than 120 days are out of scope for now.");
  }

  const warnings: Warning[] = [];
  const totalNights = totalDays - 1;

  // --- 1. Geography decides the order, not the click order ---
  const ordered = orderCities(input.cityIds);

  // --- 2. Demand decides the nights ---
  const allocation = allocateNights(
    ordered,
    totalNights,
    input.interests,
    input.pace,
    input.nightsOverride ?? {},
  );
  const cityIds = ordered.filter((id) => allocation.cityIds.includes(id));

  if (allocation.dropped.length > 0) {
    const names = allocation.dropped.map((id) => requireCity(id).name);
    warnings.push({
      level: "warn",
      message: `${totalDays} days cannot cover ${input.cityIds.length} cities, so ${
        names.length === 1
          ? `${names[0]} was dropped`
          : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} were dropped`
      } — the lowest-demand stop${names.length === 1 ? "" : "s"} on the route.`,
    });
  }

  // --- 3. Lay out the calendar ---
  // A day belongs to whichever city you sleep in that night; the final day
  // belongs to the last city. Travel therefore costs you the morning of the
  // day you move, which is the honest way to show it.
  const legs: Leg[] = [];
  const hops: Hop[] = [];
  let cursor = input.startDate;

  cityIds.forEach((cityId, i) => {
    const nights = allocation.nights[cityId];
    const inbound =
      i === 0 ? undefined : describeHop(requireCity(cityIds[i - 1]), requireCity(cityId));
    if (inbound) hops.push(inbound);

    const isLast = i === cityIds.length - 1;
    // The last leg also owns the departure day, so it spans one extra date.
    const spanDays = isLast ? nights + 1 : nights;
    const departDate = addDays(cursor, spanDays - 1);

    legs.push({ cityId, nights, arriveDate: cursor, departDate, inbound });
    // The next leg starts the day the traveller moves on.
    cursor = addDays(departDate, 1);
  });

  // --- 4. Pack each leg ---
  const days: ItineraryDay[] = [];
  const coverage: CityCoverage[] = [];
  const lodging: Record<string, Lodging[]> = {};
  let dayIndex = 1;

  for (const leg of legs) {
    const span = dayCount(leg.arriveDate, leg.departDate);
    const dates = Array.from({ length: span }, (_, k) => addDays(leg.arriveDate, k));

    const packed = packLeg({
      cityId: leg.cityId,
      dates,
      dayIndexStart: dayIndex,
      inbound: leg.inbound,
      interests: input.interests,
      pace: input.pace,
    });

    days.push(...packed.days);
    dayIndex += span;

    const all = getActivities(leg.cityId);
    const mustSeeTotal = all.filter((a) => a.mustSee).length;
    const scheduledSet = new Set(packed.scheduled);
    const mustSeeScheduled = all.filter((a) => a.mustSee && scheduledSet.has(a.id)).length;
    const plannedActivities = all.filter((a) => scheduledSet.has(a.id));
    const plannedHours = plannedActivities.reduce((s, a) => s + a.hours, 0);

    coverage.push({
      cityId: leg.cityId,
      nights: leg.nights,
      mustSeeTotal,
      mustSeeScheduled,
      activitiesScheduled: packed.scheduled.length,
      intensity: plannedHours / Math.max(1, span),
    });

    lodging[leg.cityId] = rankLodging(leg.cityId, plannedActivities, input.travelerStyle);

    // --- Warnings that make the density thesis visible ---
    const city = requireCity(leg.cityId);
    const missed = mustSeeTotal - mustSeeScheduled;
    if (leg.nights < city.minNights) {
      warnings.push({
        level: "warn",
        cityId: leg.cityId,
        message:
          `${leg.nights} night${leg.nights === 1 ? "" : "s"} in ${city.name} is thin — ` +
          `${city.minNights} is the realistic floor.` +
          (missed > 0
            ? ` ${missed} of ${mustSeeTotal} must-sees miss the cut.`
            : ` The must-sees still fit, but there is no slack in the days.`),
      });
    } else if (missed > 0) {
      warnings.push({
        level: "info",
        cityId: leg.cityId,
        message: `${city.name}: ${mustSeeScheduled}/${mustSeeTotal} must-sees scheduled. One more night would likely close the gap.`,
      });
    }

    // Something unmissable that is simply shut every day you are in town is
    // worth saying out loud — it is usually fixable by shifting a date.
    const closedOut = packed.skipped.filter(
      (a) =>
        a.mustSee &&
        a.weekdays &&
        !dates.some((d) => a.weekdays!.includes(parseISO(d).getUTCDay())),
    );
    for (const a of closedOut) {
      warnings.push({
        level: "warn",
        cityId: leg.cityId,
        message: `${a.name} is closed every day you are in ${city.name}. Shifting this leg by a day would open it up.`,
      });
    }

    if (packed.emptyDays.length > 0) {
      warnings.push({
        level: "info",
        cityId: leg.cityId,
        message: `Day${packed.emptyDays.length > 1 ? "s" : ""} ${packed.emptyDays.join(
          ", ",
        )} in ${city.name} came out open — everything we have listed there is already booked in. Good slack for a rest or a local tip.`,
      });
    }

    if (leg.inbound && leg.inbound.hours >= 8) {
      const from = requireCity(leg.inbound.fromCityId);
      warnings.push({
        level: "info",
        cityId: leg.cityId,
        message: `${from.name} → ${city.name} is a ${Math.round(
          leg.inbound.hours,
        )}h door-to-door day. It is already costed into the plan as lost time.`,
      });
    }
  }

  // --- 5. Trip-level sanity checks ---
  const totalKm = hops.reduce((s, h) => s + h.km, 0);
  const transitHours = hops.reduce((s, h) => s + h.hours, 0);
  const avgNights = totalNights / Math.max(1, cityIds.length);

  if (cityIds.length >= 3 && avgNights < 2.2) {
    warnings.push({
      level: "warn",
      message: `You are averaging ${avgNights.toFixed(
        1,
      )} nights per city. Cutting one stop would buy real time in the rest.`,
    });
  }
  if (transitHours > totalDays * 2) {
    warnings.push({
      level: "warn",
      message: `${Math.round(transitHours)}h of this trip is transit — roughly ${(
        transitHours / 24
      ).toFixed(1)} days. Tightening the route or dropping a far stop would help.`,
    });
  }

  const mustSeeTotalAll = cityIds.flatMap((id) =>
    getActivities(id).filter((a) => a.mustSee),
  ).length;
  const mustSeeDoneAll = coverage.reduce((s, c) => s + c.mustSeeScheduled, 0);

  const estLodgingUsd = legs.reduce((sum, leg) => {
    const pick = lodging[leg.cityId]?.[0];
    return sum + (pick ? pick.nightlyUsd * leg.nights : 0);
  }, 0);
  const estOnGroundUsd = legs.reduce(
    (sum, leg) => sum + requireCity(leg.cityId).dailyBudgetUsd * leg.nights,
    0,
  );

  return {
    input,
    legs,
    hops,
    days,
    lodging,
    coverage,
    warnings,
    stats: {
      totalDays,
      totalNights,
      totalKm,
      cityCount: cityIds.length,
      activityCount: days.reduce(
        (s, d) => s + d.blocks.filter((b) => b.activityId).length,
        0,
      ),
      mustSeeCoverage: mustSeeTotalAll === 0 ? 1 : mustSeeDoneAll / mustSeeTotalAll,
      transitHours,
      estLodgingUsd,
      estOnGroundUsd,
    },
  };
}

/** Everything relevant in a city that did not make the plan. */
export function unscheduledFor(
  itinerary: Itinerary,
  cityId: string,
): Activity[] {
  const scheduled = new Set(
    itinerary.days
      .filter((d) => d.cityId === cityId)
      .flatMap((d) => d.blocks.map((b) => b.activityId))
      .filter((id): id is string => Boolean(id)),
  );
  return getActivities(cityId).filter((a) => !scheduled.has(a.id));
}
