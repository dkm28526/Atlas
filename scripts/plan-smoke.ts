/**
 * Engine smoke test: `npx tsx scripts/plan-smoke.ts`
 *
 * Prints a full itinerary as text. Fast way to sanity-check the planner
 * without booting Next or looking at the globe.
 */
import { getActivity, requireCity } from "../src/lib/cities";
import { formatShort } from "../src/lib/dates";
import { formatHours, formatKm } from "../src/lib/geo";
import { buildItinerary } from "../src/lib/itinerary";
import type { TripInput } from "../src/lib/types";

const cases: { label: string; input: TripInput }[] = [
  {
    label: "16 days, Japan + SE Asia, food & landmarks, packed",
    input: {
      startDate: "2026-11-02",
      endDate: "2026-11-17",
      cityIds: ["tokyo", "bangkok", "kyoto", "singapore", "osaka"],
      interests: ["food", "landmark", "market", "nightlife"],
      pace: "packed",
      travelerStyle: "mid",
    },
  },
  {
    label: "10 days, Europe, museums, balanced",
    input: {
      startDate: "2026-04-10",
      endDate: "2026-04-19",
      cityIds: ["paris", "amsterdam", "berlin", "prague"],
      interests: ["museum", "landmark"],
      pace: "balanced",
      travelerStyle: "budget",
    },
  },
  {
    label: "5 days, 7 cities (deliberately oversubscribed)",
    input: {
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      cityIds: [
        "rome", "florence", "barcelona", "lisbon", "paris", "london", "istanbul",
      ],
      interests: [],
      pace: "packed",
      travelerStyle: "comfort",
    },
  },
];

for (const { label, input } of cases) {
  console.log("\n" + "=".repeat(74));
  console.log(label);
  console.log("=".repeat(74));

  const it = buildItinerary(input);
  const s = it.stats;
  console.log(
    `route: ${it.legs.map((l) => `${requireCity(l.cityId).name}(${l.nights}n)`).join(" -> ")}`,
  );
  console.log(
    `${s.totalDays}d | ${s.cityCount} cities | ${formatKm(s.totalKm)} | ` +
      `${formatHours(s.transitHours)} transit | ${s.activityCount} activities | ` +
      `must-sees ${(s.mustSeeCoverage * 100).toFixed(0)}% | ` +
      `lodging $${s.estLodgingUsd} + ground $${s.estOnGroundUsd}`,
  );

  for (const day of it.days) {
    const city = requireCity(day.cityId).name;
    console.log(`\n  Day ${day.dayIndex} · ${formatShort(day.date)} · ${city}`);
    if (day.blocks.length === 0) console.log("    (nothing scheduled)");
    for (const b of day.blocks) {
      if (b.transit) {
        const from = requireCity(b.transit.fromCityId).name;
        console.log(
          `    ${b.slot.padEnd(9)} ✈ ${b.transit.mode} from ${from} · ` +
            `${formatHours(b.transit.hours)} · ${formatKm(b.transit.km)}`,
        );
      } else if (b.activityId) {
        const a = getActivity(b.activityId)!;
        console.log(
          `    ${b.slot.padEnd(9)} ${a.name} · ${a.hours}h · ${a.neighborhood}` +
            `${a.mustSee ? " ★" : ""}`,
        );
      }
    }
  }

  console.log("\n  Lodging:");
  for (const leg of it.legs) {
    const pick = it.lodging[leg.cityId]?.[0];
    if (pick) {
      console.log(
        `    ${requireCity(leg.cityId).name}: ${pick.name} (${pick.kind}, ` +
          `$${pick.nightlyUsd}/n, ${pick.neighborhood})`,
      );
    }
  }

  console.log("\n  Warnings:");
  if (it.warnings.length === 0) console.log("    none");
  for (const w of it.warnings) console.log(`    [${w.level}] ${w.message}`);
}
