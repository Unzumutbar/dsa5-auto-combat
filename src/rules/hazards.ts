import type {Hazard, HazardCaution, HazardSeverity} from "../types/hazards";
import type {CombatSnapshot, CombatantSnapshot, GridPos, Point} from "../types/snapshot";
import {cellKey, type GridGraph} from "./pathfinding/grid-graph";

export interface HazardHit {
  severity: HazardSeverity | null;
  ids: string[];
}

export type HazardIndex = Map<string, HazardHit>;

/** Extra step cost (multiples of the base cost) for entering an "avoid" cell. */
export const AVOID_COST_FACTOR = 3;

const worse = (a: HazardSeverity | null, b: HazardSeverity | null): HazardSeverity | null => (a === "forbidden" || b === "forbidden" ? "forbidden" : a ?? b);

export function indexHazards(hazards: readonly Hazard[]): HazardIndex {
  const index: HazardIndex = new Map();
  for (const hazard of hazards) {
    for (const cell of hazard.cells) {
      const key = cellKey(cell);
      const current = index.get(key) ?? {severity: null, ids: []};
      current.severity = worse(current.severity, hazard.severity);
      if (!current.ids.includes(hazard.id)) current.ids.push(hazard.id);
      index.set(key, current);
    }
  }
  return index;
}

/** Worst hazard touching any of the given grid spaces. */
export function hazardsUnder(index: HazardIndex, cells: readonly GridPos[]): HazardHit {
  const hit: HazardHit = {severity: null, ids: []};
  for (const cell of cells) {
    const entry = index.get(cellKey(cell));
    if (!entry) continue;
    hit.severity = worse(hit.severity, entry.severity);
    for (const id of entry.ids) if (!hit.ids.includes(id)) hit.ids.push(id);
  }
  return hit;
}

/** Is a cell with this severity impassable for a token with the given caution? */
export function blocksEntry(severity: HazardSeverity | null, caution: HazardCaution): boolean {
  if (!severity || caution === "ignore") return false;
  return severity === "forbidden" || caution === "never";
}

/**
 * Wraps a grid graph so that entering hazardous cells costs more ("avoid") or is impossible ("forbidden",
 * or everything when the token never enters hazards). Costs only grow, so the A* heuristic stays admissible.
 */
export function withHazards(graph: GridGraph, hazards: readonly Hazard[], caution: HazardCaution): GridGraph {
  if (caution === "ignore" || hazards.length === 0) return graph;
  const index = indexHazards(hazards);
  const under = (anchor: GridPos) => hazardsUnder(index, graph.moverFootprint(anchor));
  const decorated: GridGraph = {
    kind: graph.kind,
    unitsPerCell: graph.unitsPerCell,
    neighbors: cell => graph.neighbors(cell),
    stepCost: (from, to) => {
      const base = graph.stepCost(from, to);
      return under(to).severity === "avoid" ? base * (1 + AVOID_COST_FACTOR) : base;
    },
    isBlocked: (from, to) => graph.isBlocked(from, to) || blocksEntry(under(to).severity, caution),
    occupant: space => graph.occupant(space),
    moverFootprint: anchor => graph.moverFootprint(anchor),
    moverCenter: anchor => graph.moverCenter(anchor),
    isAdjacent: (a, b) => graph.isAdjacent(a, b),
    isSeparated: (anchor, space) => graph.isSeparated(anchor, space),
    hasLineOfSight: (from, to) => graph.hasLineOfSight(from, to),
    distanceUnits: (a, b) => graph.distanceUnits(a, b),
    heuristic: (from, to) => graph.heuristic(from, to),
    hazardsAt: anchor => under(anchor)
  };
  return decorated;
}

/** Hazard ids a mover touches along a path (start cell excluded). */
export function pathHazardIds(graph: GridGraph, path: readonly GridPos[]): string[] {
  if (!graph.hazardsAt) return [];
  const ids: string[] = [];
  for (const cell of path.slice(1)) for (const id of graph.hazardsAt(cell).ids) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export function hazardName(snapshot: CombatSnapshot, id: string): string {
  return snapshot.hazards.find(h => h.id === id)?.name ?? id;
}

/**
 * Returns a copy of the snapshot in which `self` stands at `anchor`: position, footprint, center and the
 * pairwise distance/sight/adjacency rows are recomputed from the graph (used after a planned move).
 */
export function relocate(snapshot: CombatSnapshot, self: CombatantSnapshot, anchor: GridPos, graph: GridGraph): {snapshot: CombatSnapshot; self: CombatantSnapshot} {
  const footprint = graph.moverFootprint(anchor);
  const center: Point = graph.moverCenter(anchor);
  const moved: CombatantSnapshot = {...self, pos: anchor, footprint, center, inHazardIds: graph.hazardsAt?.(anchor).ids ?? []};
  const distances = {...snapshot.distances, [self.tokenId]: {...snapshot.distances[self.tokenId]}};
  const los = {...snapshot.los, [self.tokenId]: {...snapshot.los[self.tokenId]}};
  const adjacent = {...snapshot.adjacent, [self.tokenId]: {...snapshot.adjacent[self.tokenId]}};
  for (const other of snapshot.combatants) {
    if (other.tokenId === self.tokenId) continue;
    const distance = graph.distanceUnits(center, other.center);
    const sight = graph.hasLineOfSight(center, other.center);
    const touching = footprint.some(a => other.footprint.some(b => graph.isAdjacent(a, b))) && !other.footprint.every(b => graph.isSeparated(anchor, b));
    distances[self.tokenId]![other.tokenId] = distance;
    los[self.tokenId]![other.tokenId] = sight;
    adjacent[self.tokenId]![other.tokenId] = touching;
    distances[other.tokenId] = {...snapshot.distances[other.tokenId], [self.tokenId]: distance};
    los[other.tokenId] = {...snapshot.los[other.tokenId], [self.tokenId]: sight};
    adjacent[other.tokenId] = {...snapshot.adjacent[other.tokenId], [self.tokenId]: touching};
  }
  const combatants = snapshot.combatants.map(c => (c.tokenId === self.tokenId ? moved : c));
  return {snapshot: {...snapshot, combatants, distances, los, adjacent}, self: moved};
}
