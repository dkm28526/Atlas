"use client";

import { getActivity, requireCity } from "@/lib/cities";
import { formatShort } from "@/lib/dates";
import { formatHours, formatKm } from "@/lib/geo";
import { unscheduledFor } from "@/lib/itinerary";
import { CATEGORY_LABELS, SLOTS } from "@/lib/types";
import type { Itinerary, ItineraryDay, Leg, Slot } from "@/lib/types";

interface ItineraryListProps {
  itinerary: Itinerary;
  focusedCityId: string | null;
  onFocusCity: (cityId: string | null) => void;
  onNudgeNights: (cityId: string, delta: number) => void;
}

const SLOT_LABEL: Record<Slot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const MODE_GLYPH = { flight: "✈", train: "🚆", bus: "🚌" } as const;

export default function ItineraryList({
  itinerary,
  focusedCityId,
  onFocusCity,
  onNudgeNights,
}: ItineraryListProps) {
  const daysByLeg = new Map<string, ItineraryDay[]>();
  for (const day of itinerary.days) {
    const list = daysByLeg.get(day.cityId);
    if (list) list.push(day);
    else daysByLeg.set(day.cityId, [day]);
  }

  return (
    <div className="space-y-3">
      <Stats itinerary={itinerary} />
      {itinerary.warnings.length > 0 && <Warnings itinerary={itinerary} />}

      {itinerary.legs.map((leg) => (
        <section
          key={leg.cityId}
          className={`overflow-hidden rounded-xl border transition ${
            focusedCityId === leg.cityId
              ? "border-route/60 bg-route/5"
              : "border-edge bg-panel/50"
          }`}
        >
          <LegHeader
            leg={leg}
            itinerary={itinerary}
            focused={focusedCityId === leg.cityId}
            onFocus={() => onFocusCity(focusedCityId === leg.cityId ? null : leg.cityId)}
            onNudgeNights={onNudgeNights}
          />
          <div className="divide-y divide-edge/50 border-t border-edge/60">
            {(daysByLeg.get(leg.cityId) ?? []).map((day) => (
              <DayRow
                key={day.date}
                day={day}
                isLastTripDay={day.dayIndex === itinerary.stats.totalDays}
              />
            ))}
          </div>
          <Lodging itinerary={itinerary} leg={leg} />
          <Missed itinerary={itinerary} leg={leg} />
        </section>
      ))}
    </div>
  );
}

function Stats({ itinerary }: { itinerary: Itinerary }) {
  const s = itinerary.stats;
  const cells = [
    { label: "Days", value: String(s.totalDays) },
    { label: "Cities", value: String(s.cityCount) },
    { label: "Things to do", value: String(s.activityCount) },
    { label: "Must-sees", value: `${Math.round(s.mustSeeCoverage * 100)}%` },
    { label: "Distance", value: formatKm(s.totalKm) },
    { label: "In transit", value: formatHours(s.transitHours) },
  ];
  return (
    <div className="rounded-xl border border-edge bg-panel/50 p-3">
      <div className="grid grid-cols-3 gap-x-2 gap-y-3">
        {cells.map((cell) => (
          <div key={cell.label}>
            <div className="font-mono text-sm text-ink">{cell.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-inkDim">
              {cell.label}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-edge/60 pt-2.5 text-[11px] text-inkDim">
        Rough spend:{" "}
        <span className="text-ink">${s.estLodgingUsd.toLocaleString()}</span> on beds +{" "}
        <span className="text-ink">${s.estOnGroundUsd.toLocaleString()}</span> on the
        ground. Flights and trains not included.
      </div>
    </div>
  );
}

function Warnings({ itinerary }: { itinerary: Itinerary }) {
  return (
    <ul className="space-y-1.5">
      {itinerary.warnings.map((warning, i) => (
        <li
          key={i}
          className={`flex gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
            warning.level === "warn"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
              : "border-edge bg-panel/40 text-inkDim"
          }`}
        >
          <span aria-hidden className="shrink-0">
            {warning.level === "warn" ? "⚠" : "·"}
          </span>
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}

function LegHeader({
  leg,
  itinerary,
  focused,
  onFocus,
  onNudgeNights,
}: {
  leg: Leg;
  itinerary: Itinerary;
  focused: boolean;
  onFocus: () => void;
  onNudgeNights: (cityId: string, delta: number) => void;
}) {
  const city = requireCity(leg.cityId);
  const coverage = itinerary.coverage.find((c) => c.cityId === leg.cityId);
  const order = itinerary.legs.findIndex((l) => l.cityId === leg.cityId) + 1;

  return (
    <div className="p-3">
      <div className="flex items-start gap-2.5">
        <button
          onClick={onFocus}
          className="min-w-0 flex-1 text-left"
          aria-pressed={focused}
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] text-route">{order}</span>
            <h3 className="truncate text-sm font-semibold text-ink">{city.name}</h3>
            <span className="truncate text-[11px] text-inkDim">{city.country}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-inkDim">
            {formatShort(leg.arriveDate)} → {formatShort(leg.departDate)}
            {coverage && (
              <>
                {" · "}
                {coverage.mustSeeScheduled}/{coverage.mustSeeTotal} must-sees ·{" "}
                {coverage.intensity.toFixed(1)}h a day
              </>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-edge bg-void px-1 py-1">
          <button
            onClick={() => onNudgeNights(leg.cityId, -1)}
            disabled={leg.nights <= 1}
            aria-label={`One night fewer in ${city.name}`}
            className="flex h-5 w-5 items-center justify-center rounded text-inkDim transition hover:bg-edge hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            −
          </button>
          <span className="w-9 text-center font-mono text-[11px] text-ink">
            {leg.nights}n
          </span>
          <button
            onClick={() => onNudgeNights(leg.cityId, 1)}
            aria-label={`One more night in ${city.name}`}
            className="flex h-5 w-5 items-center justify-center rounded text-inkDim transition hover:bg-edge hover:text-ink"
          >
            +
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] italic leading-relaxed text-inkDim">{city.blurb}</p>
    </div>
  );
}

function DayRow({
  day,
  isLastTripDay,
}: {
  day: ItineraryDay;
  isLastTripDay: boolean;
}) {
  const ordered = [...day.blocks].sort(
    (a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot),
  );
  const hasActivity = ordered.some((b) => b.activityId);

  return (
    <div className="px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-inkDim">
          Day {day.dayIndex}
        </span>
        <span className="text-[11px] font-medium text-ink/90">
          {formatShort(day.date)}
        </span>
        {isLastTripDay && (
          <span className="rounded-full bg-edge px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-inkDim">
            Flying home
          </span>
        )}
      </div>

      <ul className="space-y-1.5">
        {ordered.map((block, i) => {
          if (block.transit) {
            const from = requireCity(block.transit.fromCityId);
            const to = requireCity(block.transit.toCityId);
            return (
              <li key={i} className="flex gap-2 text-[11px]">
                <span className="w-16 shrink-0 pt-px text-inkDim">
                  {SLOT_LABEL[block.slot]}
                </span>
                <span className="text-route/90">
                  <span aria-hidden>{MODE_GLYPH[block.transit.mode]}</span>{" "}
                  {from.name} → {to.name}{" "}
                  <span className="text-inkDim">
                    · {formatHours(block.transit.hours)} ·{" "}
                    {formatKm(block.transit.km)} by {block.transit.mode}
                  </span>
                </span>
              </li>
            );
          }

          const activity = block.activityId ? getActivity(block.activityId) : undefined;
          if (!activity) return null;

          return (
            <li key={i} className="flex gap-2 text-[11px]">
              <span className="w-16 shrink-0 pt-px text-inkDim">
                {SLOT_LABEL[block.slot]}
              </span>
              <span className="min-w-0">
                <span className="text-ink">
                  {activity.name}
                  {activity.mustSee && (
                    <span className="ml-1 text-route" title="Must-see">
                      ★
                    </span>
                  )}
                </span>
                <span className="text-inkDim">
                  {" "}
                  · {activity.hours}h · {activity.neighborhood}
                </span>
                <span className="block text-inkDim/80">{activity.blurb}</span>
              </span>
            </li>
          );
        })}
        {!hasActivity && (
          <li className="text-[11px] text-inkDim">
            Open — nothing left in our list for this city. Good day for a local tip or a
            rest.
          </li>
        )}
      </ul>
    </div>
  );
}

function Lodging({ itinerary, leg }: { itinerary: Itinerary; leg: Leg }) {
  const options = itinerary.lodging[leg.cityId] ?? [];
  if (options.length === 0) return null;
  const [top, ...rest] = options;

  return (
    <div className="border-t border-edge/60 bg-void/40 px-3 py-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-inkDim">
        Where to sleep
      </div>
      <div className="text-[11px]">
        <div className="text-ink">
          {top.name}{" "}
          <span className="text-inkDim">
            · {top.kind} · ${top.nightlyUsd}/night · {top.neighborhood} ·{" "}
            {top.rating.toFixed(1)}★
          </span>
        </div>
        <div className="mt-0.5 text-inkDim">{top.why}</div>
        <div className="mt-1 text-[10px] text-inkDim">
          ${(top.nightlyUsd * leg.nights).toLocaleString()} for {leg.nights} night
          {leg.nights === 1 ? "" : "s"}
        </div>
      </div>
      {rest.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-[10px] text-route/80 transition hover:text-route">
            {rest.length} other option{rest.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {rest.map((option) => (
              <li key={option.id} className="text-[11px] text-inkDim">
                <span className="text-ink/90">{option.name}</span> · {option.kind} · $
                {option.nightlyUsd}/night · {option.neighborhood}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Missed({ itinerary, leg }: { itinerary: Itinerary; leg: Leg }) {
  const missed = unscheduledFor(itinerary, leg.cityId);
  if (missed.length === 0) return null;

  return (
    <details className="border-t border-edge/60 px-3 py-2">
      <summary className="cursor-pointer list-none text-[10px] text-inkDim transition hover:text-ink">
        {missed.length} thing{missed.length === 1 ? "" : "s"} that did not fit
      </summary>
      <ul className="mt-1.5 space-y-1">
        {missed.map((activity) => (
          <li key={activity.id} className="text-[11px] text-inkDim">
            <span className="text-ink/80">
              {activity.name}
              {activity.mustSee && <span className="ml-1 text-amber-400">★</span>}
            </span>{" "}
            · {CATEGORY_LABELS[activity.category]} · {activity.hours}h
          </li>
        ))}
      </ul>
    </details>
  );
}
