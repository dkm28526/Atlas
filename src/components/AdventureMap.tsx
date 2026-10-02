"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MAP_HEIGHT, MAP_WIDTH, LAND_PATH, projectLonLat } from "@/lib/worldmap-data";
import type { GlobeHop, GlobeStop } from "./Globe";

/** Seconds a hop's dotted line takes to draw itself across the map. */
const ARC_DRAW_SECONDS = 1.3;
/** Seconds the "plane" rests on a city before the next leg departs. */
const CITY_DWELL_SECONDS = 0.6;
/** Spacing between dots along a route, in map units. */
const DOT_SPACING = 7;
/** How far a route's curve bows off the straight line, as a share of its length. */
const BOW = 0.14;

interface AdventureMapProps {
  stops: GlobeStop[];
  hops: GlobeHop[];
  /** Bumping this replays the journey from the first city. */
  replayKey: number;
  focusIndex: number | null;
  onSelectStop?: (id: string) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Dot extends Point {
  /** Tangent direction in degrees, for the plane icon's heading. */
  angle: number;
}

interface SampledHop {
  dots: Dot[];
}

interface Timeline {
  /** Elapsed seconds at which city i's marker appears. */
  cityReveal: number[];
  /** [start, end] elapsed seconds for hop i's draw animation. */
  hopSpan: [number, number][];
  finishedAt: number;
}

/** Quadratic-bezier control point: the segment midpoint, bowed upward. */
function controlPoint(p0: Point, p1: Point): Point {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return {
    x: (p0.x + p1.x) / 2 + nx * len * BOW,
    y: (p0.y + p1.y) / 2 + ny * len * BOW,
  };
}

function bezierPoint(p0: Point, c: Point, p1: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
  };
}

function bezierTangentAngle(p0: Point, c: Point, p1: Point, t: number): number {
  const mt = 1 - t;
  const dx = 2 * mt * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const dy = 2 * mt * (c.y - p0.y) + 2 * t * (p1.y - c.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Dots spaced evenly by arc length along the curve — a fixed `t` step would
 * bunch dots where the curve bends and stretch them where it's straight.
 */
function sampleBezierDots(p0: Point, p1: Point): SampledHop {
  const control = controlPoint(p0, p1);
  const STEPS = 48;
  const samples: { point: Point; t: number; cumLen: number }[] = [];
  let prev = p0;
  let cumLen = 0;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const point = i === 0 ? p0 : bezierPoint(p0, control, p1, t);
    cumLen += Math.hypot(point.x - prev.x, point.y - prev.y);
    samples.push({ point, t, cumLen });
    prev = point;
  }

  const total = cumLen;
  const count = Math.max(4, Math.round(total / DOT_SPACING));
  const dots: Dot[] = [];
  let si = 0;
  for (let i = 0; i <= count; i++) {
    const targetLen = (total * i) / count;
    while (si < samples.length - 1 && samples[si + 1].cumLen < targetLen) si++;
    const t = samples[si].t;
    const point = i === count ? p1 : bezierPoint(p0, control, p1, t);
    dots.push({ ...point, angle: bezierTangentAngle(p0, control, p1, t) });
  }
  return { dots };
}

function buildTimeline(hopCount: number): Timeline {
  const cityReveal: number[] = [0];
  const hopSpan: [number, number][] = [];
  let t = CITY_DWELL_SECONDS;
  for (let i = 0; i < hopCount; i++) {
    const start = t;
    const end = start + ARC_DRAW_SECONDS;
    hopSpan.push([start, end]);
    cityReveal.push(end);
    t = end + CITY_DWELL_SECONDS;
  }
  return { cityReveal, hopSpan, finishedAt: t };
}

export default function AdventureMap({
  stops,
  hops,
  replayKey,
  focusIndex,
  onSelectStop,
}: AdventureMapProps) {
  const points = useMemo<Record<string, Point>>(() => {
    const out: Record<string, Point> = {};
    for (const stop of stops) {
      const [x, y] = projectLonLat(stop.lon, stop.lat);
      out[stop.id] = { x, y };
    }
    return out;
  }, [stops]);

  // Zoom to the route rather than always showing the whole world — a trip
  // confined to one region (say, Japan + SE Asia) should fill the frame, not
  // sit compressed in one corner of a mostly-empty planet. Everything else
  // (dot size, stroke widths, marker radii, label text) is defined in the
  // same SVG user-space units as the land path, so it scales correctly for
  // free when the viewBox shrinks — only the box itself needs computing.
  const viewBox = useMemo(() => {
    const pts = Object.values(points);
    if (pts.length === 0) return { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    // Generous padding (and a floor on it) so labels, the compass rose, and
    // the frame never crowd the route even when every city sits close
    // together.
    const padX = Math.max(spanX * 0.4, 90);
    const padY = Math.max(spanY * 0.4, 90);

    let x = minX - padX;
    let y = minY - padY;
    let w = spanX + padX * 2;
    let h = spanY + padY * 2;

    // Match the base map's ~2:1 aspect so the frame isn't absurdly thin or
    // tall — grow the shorter axis around its own center.
    const targetAspect = MAP_WIDTH / MAP_HEIGHT;
    const aspect = w / h;
    if (aspect < targetAspect) {
      const newW = h * targetAspect;
      x -= (newW - w) / 2;
      w = newW;
    } else {
      const newH = w / targetAspect;
      y -= (newH - h) / 2;
      h = newH;
    }

    // Never zoom in tighter than this, so a one- or two-city trip still
    // reads as a place on a map rather than an abstract close-up.
    const MIN_W = 260;
    if (w < MIN_W) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      w = MIN_W;
      h = MIN_W / targetAspect;
      x = cx - w / 2;
      y = cy - h / 2;
    }

    return { x, y, w, h };
  }, [points]);

  const sampledHops = useMemo<SampledHop[]>(
    () =>
      hops
        .map((hop) => {
          const p0 = points[hop.fromId];
          const p1 = points[hop.toId];
          if (!p0 || !p1) return null;
          return sampleBezierDots(p0, p1);
        })
        .filter((h): h is SampledHop => h !== null),
    [hops, points],
  );

  const timeline = useMemo(() => buildTimeline(sampledHops.length), [sampledHops.length]);

  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(performance.now());

  useEffect(() => {
    startRef.current = performance.now();
    setElapsed(0);
    if (stops.length === 0) return;

    let raf = 0;
    const tick = () => {
      const t = (performance.now() - startRef.current) / 1000;
      setElapsed(Math.min(t, timeline.finishedAt));
      if (t < timeline.finishedAt) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Route identity (city sequence) and replayKey restart the journey;
    // re-running on every stops/hops reference change would restart it on
    // every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops.map((s) => s.id).join(">"), replayKey, timeline.finishedAt]);

  const revealedCities = timeline.cityReveal.filter((t) => elapsed >= t).length;
  const finished = elapsed >= timeline.finishedAt;

  // Which hop is currently drawing, and how far — the rest are either fully
  // drawn (already passed) or not yet started (not rendered).
  let activeHop = -1;
  let activeHopProgress = 0;
  for (let i = 0; i < timeline.hopSpan.length; i++) {
    const [start, end] = timeline.hopSpan[i];
    if (elapsed >= start && elapsed < end) {
      activeHop = i;
      activeHopProgress = (elapsed - start) / ARC_DRAW_SECONDS;
      break;
    }
  }

  // Precompute label placement: alternate above/below, nudged apart if two
  // labels would otherwise collide — the world view is far less cramped than
  // the zoomed globe, so a light pass is enough.
  const labelPositions = useMemo(() => {
    const placed: { x: number; y: number; w: number; above: boolean }[] = [];
    return stops.map((stop, i) => {
      const p = points[stop.id];
      const w = stop.name.length * 6.4 + 26;
      let above = i % 2 === 0;
      let y = p.y + (above ? -14 : 14);
      const collides = () =>
        placed.some(
          (o) => Math.abs(o.x - p.x) < (o.w + w) / 2 && Math.abs(o.y - y) < 14,
        );
      if (collides()) {
        above = !above;
        y = p.y + (above ? -14 : 14);
      }
      if (collides()) y += above ? -16 : 16;
      placed.push({ x: p.x, y, w, above });
      return { x: p.x, y, above };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, points]);

  const planeDot = useMemo(() => {
    if (activeHop === -1) return null;
    const hop = sampledHops[activeHop];
    if (!hop) return null;
    const idx = Math.min(
      hop.dots.length - 1,
      Math.floor(activeHopProgress * hop.dots.length),
    );
    return hop.dots[idx];
  }, [activeHop, activeHopProgress, sampledHops]);

  if (stops.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-inkDim">
        Add a city to begin the journey.
      </div>
    );
  }

  return (
    <div className="map-ink flex h-full w-full items-center justify-center overflow-hidden p-4">
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="h-full w-full max-w-5xl drop-shadow-[0_18px_60px_rgba(0,0,0,0.55)]"
        role="img"
        aria-label="Route map"
      >
        <defs>
          <radialGradient id="paper" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="#f2e8c9" />
            <stop offset="65%" stopColor="#e9d9a9" />
            <stop offset="100%" stopColor="#d8c388" />
          </radialGradient>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} result="noise" />
            <feColorMatrix in="noise" type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.05" />
            </feComponentTransfer>
            <feComposite operator="over" in2="SourceGraphic" />
          </filter>
        </defs>

        {/* Paper + aging — sized to the current zoom, not the fixed world
            bounds, so the gradient and grain always fill the visible frame. */}
        <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#paper)" />
        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.w}
          height={viewBox.h}
          filter="url(#grain)"
          opacity={0.5}
        />

        {/* Landmasses — a clearly darker, more saturated khaki than the
            paper so coastlines read even when zoomed into a land-heavy
            region. */}
        <path
          d={LAND_PATH}
          fill="#a68e5c"
          stroke="#453019"
          strokeWidth={1}
          strokeLinejoin="round"
        />

        {/* Decorative double border, inset proportionally to the zoom */}
        <rect
          x={viewBox.x + viewBox.w * 0.012}
          y={viewBox.y + viewBox.h * 0.025}
          width={viewBox.w * 0.976}
          height={viewBox.h * 0.95}
          fill="none"
          stroke="#453019"
          strokeWidth={viewBox.w / 384}
        />
        <rect
          x={viewBox.x + viewBox.w * 0.023}
          y={viewBox.y + viewBox.h * 0.05}
          width={viewBox.w * 0.954}
          height={viewBox.h * 0.9}
          fill="none"
          stroke="#453019"
          strokeWidth={viewBox.w / 1280}
        />

        <CompassRose
          x={viewBox.x + viewBox.w * 0.935}
          y={viewBox.y + viewBox.h * 0.87}
          scale={viewBox.w / 960}
        />

        {/* Completed and in-progress hop lines */}
        {sampledHops.map((hop, i) => {
          const [, end] = timeline.hopSpan[i];
          if (elapsed < timeline.hopSpan[i][0]) return null;
          const complete = elapsed >= end;
          const dotsShown = complete
            ? hop.dots.length
            : Math.max(1, Math.floor(activeHopProgress * hop.dots.length));
          return (
            <g key={i}>
              {hop.dots.slice(0, dotsShown).map((dot, di) => (
                <circle key={di} cx={dot.x} cy={dot.y} r={1.6} fill="#a02020">
                  {/* Fires once, when this dot first mounts — React keeps the
                      node across later re-renders, so it never replays. */}
                  <animate
                    attributeName="r"
                    values="0.4;2;1.6"
                    dur="0.18s"
                    fill="freeze"
                  />
                </circle>
              ))}
            </g>
          );
        })}

        {/* The plane, mid-flight */}
        {planeDot && <PlaneIcon x={planeDot.x} y={planeDot.y} angle={planeDot.angle} />}

        {/* Cities */}
        {stops.slice(0, revealedCities).map((stop, i) => {
          const p = points[stop.id];
          const label = labelPositions[i];
          const isLast = i === stops.length - 1;
          const focused = i === focusIndex;
          // Label y is in page space already; express it relative to the
          // marker so the wrapper's translate below carries both.
          const labelDy = label.y - p.y;

          return (
            <g
              key={stop.id}
              className="cursor-pointer"
              onClick={() => onSelectStop?.(stop.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectStop?.(stop.id);
              }}
            >
              {/* Wrapper carries the position so the stamp animation scales
                  around the marker's own point, in SVG user space — not
                  CSS transform-box, which SVG handles inconsistently. */}
              <g transform={`translate(${p.x}, ${p.y})`}>
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values="0.3;1.25;1"
                  dur="0.3s"
                  additive="sum"
                  fill="freeze"
                />

                {focused && (
                  <circle r={9} fill="none" stroke="#a02020" strokeWidth={1.2}>
                    <animate attributeName="r" values="7;12;7" dur="1.6s" repeatCount="indefinite" />
                    <animate
                      attributeName="opacity"
                      values="0.8;0.15;0.8"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {isLast ? (
                  <XMark x={0} y={0} />
                ) : (
                  <>
                    <circle r={4.5} fill="#241a10" />
                    <circle r={2.1} fill="#a02020" />
                  </>
                )}

                <text
                  y={labelDy}
                  textAnchor="middle"
                  dominantBaseline={label.above ? "auto" : "hanging"}
                  className="map-label select-none"
                  fill="#241a10"
                >
                  {i + 1}. {stop.name}
                </text>
                <text
                  y={labelDy + (label.above ? 11 : -11)}
                  textAnchor="middle"
                  dominantBaseline={label.above ? "auto" : "hanging"}
                  className="map-label-sub select-none"
                  fill="#5b4630"
                >
                  {stop.nights}n
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PlaneIcon({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x}, ${y}) rotate(${angle})`}>
      <path
        d="M -7 0 L 6 0 M 1 -4 L 1 4 M 6 0 L 2 -2.4 M 6 0 L 2 2.4"
        stroke="#a02020"
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function XMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} stroke="#a02020" strokeWidth={2.2} strokeLinecap="round">
      <line x1={-6} y1={-6} x2={6} y2={6} />
      <line x1={-6} y1={6} x2={6} y2={-6} />
    </g>
  );
}

function CompassRose({ x, y, scale }: { x: number; y: number; scale: number }) {
  const spokes = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={0.75}>
      <circle r={30} fill="none" stroke="#5b4630" strokeWidth={0.75} />
      {spokes.map((deg, i) => (
        <line
          key={deg}
          x1={0}
          y1={0}
          x2={Math.sin((deg * Math.PI) / 180) * (i % 2 === 0 ? 28 : 16)}
          y2={-Math.cos((deg * Math.PI) / 180) * (i % 2 === 0 ? 28 : 16)}
          stroke="#5b4630"
          strokeWidth={i % 2 === 0 ? 1 : 0.6}
        />
      ))}
      <text
        x={0}
        y={-36}
        textAnchor="middle"
        className="map-label"
        fill="#5b4630"
      >
        N
      </text>
    </g>
  );
}
