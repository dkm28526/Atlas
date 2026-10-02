import { requireCity } from "./cities";
import { haversineKm } from "./geo";

/**
 * Order cities into the shortest open path, anchored at the first entry.
 *
 * Multi-city trips are usually open-jaw — you fly home from wherever you end
 * up — so this minimises an open path rather than a closed loop. The first
 * city the user picked is treated as the arrival point and stays fixed.
 *
 * Nearest-neighbour for a starting tour, then 2-opt until no improvement.
 * N is small (a handful of cities), so this is effectively optimal and costs
 * nothing.
 */
export function orderCities(cityIds: string[]): string[] {
  const unique = Array.from(new Set(cityIds));
  if (unique.length <= 2) return unique;

  const coords = unique.map((id) => {
    const c = requireCity(id);
    return { id, lat: c.lat, lon: c.lon };
  });

  const dist = (a: number, b: number) => haversineKm(coords[a], coords[b]);

  // --- Nearest neighbour from index 0 ---
  const visited = new Array(coords.length).fill(false);
  let order = [0];
  visited[0] = true;
  for (let step = 1; step < coords.length; step++) {
    const last = order[order.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      if (visited[i]) continue;
      const d = dist(last, i);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    visited[best] = true;
    order.push(best);
  }

  // --- 2-opt on the open path, holding position 0 fixed ---
  const pathLength = (o: number[]) => {
    let total = 0;
    for (let i = 0; i < o.length - 1; i++) total += dist(o[i], o[i + 1]);
    return total;
  };

  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        if (pathLength(candidate) < pathLength(order) - 1e-9) {
          order = candidate;
          improved = true;
        }
      }
    }
  }

  return order.map((i) => coords[i].id);
}

/** Total great-circle distance along an ordered city list. */
export function routeDistanceKm(orderedIds: string[]): number {
  let total = 0;
  for (let i = 0; i < orderedIds.length - 1; i++) {
    total += haversineKm(requireCity(orderedIds[i]), requireCity(orderedIds[i + 1]));
  }
  return total;
}
