import type {Point} from "../../types/snapshot";

export interface PathSplit {
  /** Polyline covered by the free movement (starts at the origin). */
  free: Point[];
  /** Polyline that costs an action (starts where the free part ends); empty if the path fits. */
  run: Point[];
  totalUnits: number;
}

function lerp(a: Point, b: Point, t: number): Point {
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t};
}

/**
 * Splits a polyline (origin + waypoints, pixel coordinates) into the part that fits into the free
 * movement budget and the remainder. Distances are straight-line pixels converted with `unitsPerPixel`,
 * which is exact for orthogonal steps and a close approximation for diagonals on the preview overlay.
 */
export function splitPathByBudget(points: Point[], freeUnits: number, unitsPerPixel: number): PathSplit {
  if (points.length < 2) return {free: [...points], run: [], totalUnits: 0};
  const free: Point[] = [points[0]!];
  const run: Point[] = [];
  let used = 0;
  let total = 0;
  let overflow = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = Math.hypot(b.x - a.x, b.y - a.y) * unitsPerPixel;
    total += segment;
    if (overflow) {
      run.push(b);
      continue;
    }
    if (used + segment <= freeUnits + 1e-9) {
      free.push(b);
      used += segment;
      continue;
    }
    const remaining = Math.max(0, freeUnits - used);
    const cut = segment > 0 ? lerp(a, b, remaining / segment) : a;
    free.push(cut);
    run.push(cut, b);
    overflow = true;
  }
  return {free, run, totalUnits: Math.round(total * 10) / 10};
}
