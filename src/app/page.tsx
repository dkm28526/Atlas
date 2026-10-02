"use client";

import { useCallback, useMemo, useState } from "react";

import Globe, { type GlobeHop, type GlobeStop } from "@/components/Globe";
import ItineraryList from "@/components/ItineraryList";
import TripForm from "@/components/TripForm";
import { requireCity } from "@/lib/cities";
import { addDays, todayISO } from "@/lib/dates";
import { buildItinerary, PlanError } from "@/lib/itinerary";
import type { Itinerary, TripInput } from "@/lib/types";

/** A dense, plausible trip so the globe has something to draw on first paint. */
function defaultInput(): TripInput {
  const startDate = addDays(todayISO(), 28);
  return {
    startDate,
    endDate: addDays(startDate, 16),
    cityIds: ["tokyo", "kyoto", "bangkok", "singapore"],
    interests: ["food", "landmark", "market"],
    pace: "balanced",
    travelerStyle: "mid",
  };
}

export default function Page() {
  const [input, setInput] = useState<TripInput>(defaultInput);
  const [focusedCityId, setFocusedCityId] = useState<string | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(true);

  // The engine is pure, so a plan is just derived state — every adjustment
  // re-plans instantly with no round trip.
  const { itinerary, planError } = useMemo<{
    itinerary: Itinerary | null;
    planError: string | null;
  }>(() => {
    try {
      return { itinerary: buildItinerary(input), planError: null };
    } catch (error) {
      return {
        itinerary: null,
        planError:
          error instanceof PlanError
            ? error.message
            : "Something went wrong building that plan.",
      };
    }
  }, [input]);

  const stops = useMemo<GlobeStop[]>(() => {
    if (!itinerary) return [];
    return itinerary.legs.map((leg, i) => {
      const city = requireCity(leg.cityId);
      return {
        id: city.id,
        name: city.name,
        country: city.country,
        lat: city.lat,
        lon: city.lon,
        order: i + 1,
        nights: leg.nights,
      };
    });
  }, [itinerary]);

  const globeHops = useMemo<GlobeHop[]>(
    () =>
      (itinerary?.hops ?? []).map((hop) => ({
        fromId: hop.fromCityId,
        toId: hop.toCityId,
        mode: hop.mode,
      })),
    [itinerary],
  );

  const focusIndex = useMemo(() => {
    if (!focusedCityId) return null;
    const i = stops.findIndex((s) => s.id === focusedCityId);
    return i === -1 ? null : i;
  }, [focusedCityId, stops]);

  const nudgeNights = useCallback(
    (cityId: string, delta: number) => {
      if (!itinerary) return;
      const current = itinerary.legs.find((l) => l.cityId === cityId)?.nights;
      if (current == null) return;
      setInput((prev) => ({
        ...prev,
        nightsOverride: {
          ...(prev.nightsOverride ?? {}),
          [cityId]: Math.max(1, current + delta),
        },
      }));
    },
    [itinerary],
  );

  const askClaude = useCallback(async () => {
    if (prompt.trim().length < 3 || thinking) return;
    setThinking(true);
    setRequestError(null);
    setNote(null);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      if (!response.ok) {
        setRequestError(data.error ?? "That request did not work.");
        return;
      }
      setInput(data.itinerary.input);
      setNote(data.notes ?? null);
      setFocusedCityId(null);
      setSetupOpen(false);
      setReplayKey((k) => k + 1);
    } catch {
      setRequestError("Could not reach the planner. Is the dev server still running?");
    } finally {
      setThinking(false);
    }
  }, [prompt, thinking]);

  return (
    <main className="flex h-full flex-col-reverse lg:flex-row">
      {/* ---------------- Left rail ---------------- */}
      <div className="flex h-1/2 w-full shrink-0 flex-col border-edge lg:h-full lg:w-[412px] lg:border-r">
        <header className="shrink-0 border-b border-edge px-4 pb-3 pt-4">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-ink">Atlas</h1>
            <p className="text-[11px] text-inkDim">
              dense multi-city trips, planned properly
            </p>
          </div>

          <div className="mt-3 flex gap-1.5">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") askClaude();
              }}
              placeholder="Three weeks in Japan and Thailand, food and temples…"
              className="min-w-0 flex-1 rounded-lg border border-edge bg-void px-2.5 py-2 text-xs text-ink placeholder:text-inkDim/70 outline-none focus:border-route"
            />
            <button
              onClick={askClaude}
              disabled={thinking || prompt.trim().length < 3}
              className="shrink-0 rounded-lg border border-route/60 bg-route/15 px-3 py-2 text-xs font-medium text-route transition hover:bg-route/25 disabled:opacity-40 disabled:hover:bg-route/15"
            >
              {thinking ? "Planning…" : "Plan it"}
            </button>
          </div>

          {note && (
            <p className="rise mt-2 text-[11px] leading-relaxed text-inkDim">{note}</p>
          )}
          {requestError && (
            <p className="rise mt-2 text-[11px] text-amber-300">{requestError}</p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <details
            open={setupOpen}
            onToggle={(e) => setSetupOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="mb-3 rounded-xl border border-edge bg-panel/50"
          >
            <summary className="cursor-pointer list-none px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink/80">
              Trip setup
            </summary>
            <div className="border-t border-edge/60 p-3">
              <TripForm value={input} onChange={setInput} />
            </div>
          </details>

          {planError && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
              {planError}
            </p>
          )}

          {itinerary && (
            <ItineraryList
              itinerary={itinerary}
              focusedCityId={focusedCityId}
              onFocusCity={setFocusedCityId}
              onNudgeNights={nudgeNights}
            />
          )}
        </div>
      </div>

      {/* ---------------- Globe ---------------- */}
      <div className="relative h-1/2 min-h-0 w-full lg:h-full lg:flex-1">
        <Globe
          stops={stops}
          hops={globeHops}
          replayKey={replayKey}
          focusIndex={focusIndex}
          onSelectStop={(id) => setFocusedCityId((prev) => (prev === id ? null : id))}
        />

        {/* Overlay: route summary, legend, replay */}
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
          {itinerary && (
            <div className="pointer-events-auto max-w-sm rounded-xl border border-edge bg-hull/70 px-3 py-2 backdrop-blur">
              <div className="text-[11px] leading-relaxed text-ink">
                {itinerary.legs.map((leg, i) => (
                  <span key={leg.cityId}>
                    {i > 0 && <span className="text-inkDim"> → </span>}
                    <button
                      onClick={() =>
                        setFocusedCityId((prev) =>
                          prev === leg.cityId ? null : leg.cityId,
                        )
                      }
                      className={`transition hover:text-route ${
                        focusedCityId === leg.cityId ? "text-route" : "text-ink"
                      }`}
                    >
                      {requireCity(leg.cityId).name}
                      <span className="text-inkDim">·{leg.nights}n</span>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => setReplayKey((k) => k + 1)}
              className="rounded-lg border border-edge bg-hull/70 px-2.5 py-1.5 text-[11px] text-inkDim backdrop-blur transition hover:border-route/50 hover:text-ink"
            >
              ↻ Replay
            </button>
            {focusedCityId && (
              <button
                onClick={() => setFocusedCityId(null)}
                className="rounded-lg border border-edge bg-hull/70 px-2.5 py-1.5 text-[11px] text-inkDim backdrop-blur transition hover:border-route/50 hover:text-ink"
              >
                Free the camera
              </button>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-4 flex gap-3 text-[10px] text-inkDim">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded bg-[#5ad2ff]" /> flight
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded bg-[#f0abfc]" /> train
          </span>
          <span>· drag to spin, scroll to zoom, click a city</span>
        </div>
      </div>
    </main>
  );
}
