"use client";

import { useMemo, useState } from "react";

import { getCity, registerCity, searchCities } from "@/lib/cities";
import type { ResolvedCity } from "@/lib/resolveCity";
import { dayCount } from "@/lib/dates";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/types";
import type { Category, Pace, TravelerStyle, TripInput } from "@/lib/types";

interface TripFormProps {
  value: TripInput;
  onChange: (next: TripInput) => void;
}

const PACES: { id: Pace; label: string; hint: string }[] = [
  { id: "relaxed", label: "Relaxed", hint: "~2 things a day" },
  { id: "balanced", label: "Balanced", hint: "~3 things a day" },
  { id: "packed", label: "Packed", hint: "dawn till late" },
];

const STYLES: { id: TravelerStyle; label: string }[] = [
  { id: "budget", label: "Hostels" },
  { id: "mid", label: "Mid-range" },
  { id: "comfort", label: "Boutique" },
];

export default function TripForm({ value, onChange }: TripFormProps) {
  const [query, setQuery] = useState("");

  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const selected = useMemo(
    () => value.cityIds.map((id) => getCity(id)!).filter(Boolean),
    [value.cityIds],
  );

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchCities(query)
      .filter((c) => !value.cityIds.includes(c.id))
      .slice(0, 6);
  }, [query, value.cityIds]);

  const days = dayCount(value.startDate, value.endDate);

  const patch = (next: Partial<TripInput>) => onChange({ ...value, ...next });

  const addCity = (id: string) => {
    setQuery("");
    setResolveError(null);
    patch({ cityIds: [...value.cityIds, id] });
  };

  /**
   * The local catalogue came up empty — ask the server to resolve it: a
   * cache hit if someone's asked for this city before, otherwise a fresh
   * Claude + web-search generation. Either way, register the result into
   * this browser's own copy of cities.ts so the (synchronous, local)
   * planner can find it afterward.
   */
  const searchOnline = async () => {
    const raw = query.trim();
    if (!raw || resolving) return;
    setResolving(true);
    setResolveError(null);
    try {
      const [name, country] = raw.split(",").map((s) => s.trim());
      const response = await fetch("/api/city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, country: country || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        setResolveError(data.error ?? "Couldn't look that city up.");
        return;
      }
      const resolved = data as ResolvedCity;
      registerCity(resolved.city, resolved.activities, resolved.lodging);
      addCity(resolved.city.id);
    } catch {
      setResolveError("Couldn't reach the planner. Is the dev server still running?");
    } finally {
      setResolving(false);
    }
  };

  const removeCity = (id: string) => {
    const nightsOverride = { ...(value.nightsOverride ?? {}) };
    delete nightsOverride[id];
    patch({
      cityIds: value.cityIds.filter((c) => c !== id),
      nightsOverride,
    });
  };

  const toggleInterest = (category: Category) => {
    patch({
      interests: value.interests.includes(category)
        ? value.interests.filter((c) => c !== category)
        : [...value.interests, category],
    });
  };

  return (
    <div className="space-y-5">
      {/* --- Dates --- */}
      <div>
        <Label>Dates</Label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.startDate}
            max={value.endDate}
            onChange={(e) => e.target.value && patch({ startDate: e.target.value })}
            className="flex-1 rounded-lg border border-edge bg-void px-2.5 py-2 text-xs text-ink outline-none focus:border-route"
          />
          <span className="text-inkDim">→</span>
          <input
            type="date"
            value={value.endDate}
            min={value.startDate}
            onChange={(e) => e.target.value && patch({ endDate: e.target.value })}
            className="flex-1 rounded-lg border border-edge bg-void px-2.5 py-2 text-xs text-ink outline-none focus:border-route"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-inkDim">
          {days} days · {Math.max(0, days - 1)} nights to share out
        </p>
      </div>

      {/* --- Cities --- */}
      <div>
        <Label>
          Cities{" "}
          <span className="font-normal text-inkDim">
            — first one is where you fly in
          </span>
        </Label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((city, i) => (
            <span
              key={city.id}
              className="group flex items-center gap-1.5 rounded-full border border-edge bg-void py-1 pl-2 pr-1 text-xs"
            >
              <span className="font-mono text-[10px] text-route">{i + 1}</span>
              {city.name}
              <button
                onClick={() => removeCity(city.id)}
                aria-label={`Remove ${city.name}`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-inkDim transition hover:bg-edge hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
          {selected.length === 0 && (
            <span className="text-xs text-inkDim">Nothing picked yet.</span>
          )}
        </div>
        <div className="relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResolveError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results.length === 0) searchOnline();
            }}
            placeholder="Add a city or country…"
            className="w-full rounded-lg border border-edge bg-void px-2.5 py-2 text-xs text-ink placeholder:text-inkDim/70 outline-none focus:border-route"
          />
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-edge bg-hull shadow-xl shadow-black/50">
              {results.map((city) => (
                <li key={city.id}>
                  <button
                    onClick={() => addCity(city.id)}
                    className="flex w-full items-baseline justify-between px-2.5 py-2 text-left text-xs transition hover:bg-panel"
                  >
                    <span>{city.name}</span>
                    <span className="text-[10px] text-inkDim">{city.country}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* No local match — the catalogue isn't a hard limit, it's just
              what's pre-loaded. Any real city can be looked up on demand. */}
          {results.length === 0 && query.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-edge bg-hull shadow-xl shadow-black/50">
              <button
                onClick={searchOnline}
                disabled={resolving}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-route transition hover:bg-panel disabled:opacity-60"
              >
                {resolving ? (
                  <>
                    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-route/30 border-t-route" />
                    <span>
                      Researching &ldquo;{query.trim()}&rdquo;…
                      <span className="block text-inkDim">
                        Live web search, can take a minute or two the first time — instant for
                        everyone after.
                      </span>
                    </span>
                  </>
                ) : (
                  <>🔍 Search &ldquo;{query.trim()}&rdquo; online</>
                )}
              </button>
            </div>
          )}
        </div>
        {resolveError && (
          <p className="mt-1.5 text-[11px] text-amber-300">{resolveError}</p>
        )}
        <p className="mt-1.5 text-[11px] text-inkDim">
          Not finding a city? Type its name — add a comma and the country if
          it&apos;s ambiguous (e.g. &ldquo;Valencia, Spain&rdquo;) — and search online.
        </p>
      </div>

      {/* --- Interests --- */}
      <div>
        <Label>
          What you are after{" "}
          <span className="font-normal text-inkDim">— steers the plan, never limits it</span>
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((category) => {
            const on = value.interests.includes(category);
            return (
              <button
                key={category}
                onClick={() => toggleInterest(category)}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  on
                    ? "border-route/70 bg-route/15 text-route"
                    : "border-edge bg-void text-inkDim hover:border-inkDim/50 hover:text-ink"
                }`}
              >
                {CATEGORY_LABELS[category]}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- Pace --- */}
      <div>
        <Label>Pace</Label>
        <div className="flex gap-1.5">
          {PACES.map((pace) => {
            const on = value.pace === pace.id;
            return (
              <button
                key={pace.id}
                onClick={() => patch({ pace: pace.id })}
                aria-pressed={on}
                className={`flex-1 rounded-lg border px-2 py-2 text-left transition ${
                  on
                    ? "border-route/70 bg-route/15"
                    : "border-edge bg-void hover:border-inkDim/50"
                }`}
              >
                <div className={`text-[11px] font-semibold ${on ? "text-route" : "text-ink"}`}>
                  {pace.label}
                </div>
                <div className="text-[10px] text-inkDim">{pace.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* --- Lodging style --- */}
      <div>
        <Label>Where you sleep</Label>
        <div className="flex gap-1.5">
          {STYLES.map((style) => {
            const on = value.travelerStyle === style.id;
            return (
              <button
                key={style.id}
                onClick={() => patch({ travelerStyle: style.id })}
                aria-pressed={on}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition ${
                  on
                    ? "border-route/70 bg-route/15 text-route"
                    : "border-edge bg-void text-inkDim hover:border-inkDim/50 hover:text-ink"
                }`}
              >
                {style.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink/80">
      {children}
    </div>
  );
}
