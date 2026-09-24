import type {GridPos, GridType, Point} from "../../types/snapshot";

/**
 * Minimal view of the battle map the path search needs. Implemented once against the Foundry canvas
 * and once as an in-memory fake for tests. A "cell" identifies the mover by its top-left occupied grid
 * space; `moverFootprint` expands it to every space the mover would occupy there.
 */
export interface GridGraph {
  readonly kind: GridType;
  /** Scene units (Schritt) per grid space. */
  readonly unitsPerCell: number;
  neighbors(cell: GridPos): GridPos[];
  /** Movement cost between two adjacent anchor cells in scene units (honours the diagonal rule). */
  stepCost(from: GridPos, to: GridPos): number;
  /** True if a wall blocks the mover from moving between the two anchor cells. */
  isBlocked(from: GridPos, to: GridPos): boolean;
  /** Token id occupying the space, or null. */
  occupant(space: GridPos): string | null;
  moverFootprint(anchor: GridPos): GridPos[];
  /** Center point of the mover when anchored at `anchor`. */
  moverCenter(anchor: GridPos): Point;
  isAdjacent(a: GridPos, b: GridPos): boolean;
  /** True if a wall separates the mover (anchored at `anchor`) from the grid space `space`. */
  isSeparated(anchor: GridPos, space: GridPos): boolean;
  hasLineOfSight(from: Point, to: Point): boolean;
  /** Straight-line distance in scene units. */
  distanceUnits(a: Point, b: Point): number;
  /** Admissible lower bound of the movement cost from `from` to `to`. */
  heuristic(from: Point, to: Point): number;
  /** Hazards under the mover anchored at `anchor` (only on hazard-aware graphs, see rules/hazards.ts). */
  hazardsAt?(anchor: GridPos): {severity: "avoid" | "forbidden" | null; ids: string[]};
}

export const cellKey = (c: GridPos): string => `${c.i},${c.j}`;

export const sameCell = (a: GridPos, b: GridPos): boolean => a.i === b.i && a.j === b.j;
