import type {GridGraph} from "../../src/rules/pathfinding/grid-graph";
import type {GridPos, Point} from "../../src/types/snapshot";

export type Diagonals = "equidistant" | "exact" | "alternating" | "illegal";

export interface FakeGridOptions {
  /** ASCII rows: `.` free, `#` blocked cell (wall around it), letters = token ids occupying the cell. */
  map: string[];
  /** Thin walls between two cells, written as "i,j|i,j" (symmetric). */
  edges?: string[];
  unitsPerCell?: number;
  diagonals?: Diagonals;
  moverSize?: number;
}

/**
 * Square grid backed by an ASCII map. Walls are modelled as impassable cells (`#`), which also block
 * line of sight. Coordinates: i = row, j = column; cell centers at ((j + 0.5), (i + 0.5)) * 100 px.
 */
export class FakeSquareGrid implements GridGraph {
  readonly kind = "square" as const;
  readonly unitsPerCell: number;
  readonly rows: number;
  readonly cols: number;
  readonly diagonals: Diagonals;
  readonly moverSize: number;
  #map: string[];
  #edges = new Set<string>();

  constructor(options: FakeGridOptions) {
    this.#map = options.map;
    this.rows = options.map.length;
    this.cols = options.map[0]?.length ?? 0;
    this.unitsPerCell = options.unitsPerCell ?? 1;
    this.diagonals = options.diagonals ?? "equidistant";
    this.moverSize = options.moverSize ?? 1;
    for (const edge of options.edges ?? []) {
      const [a, b] = edge.split("|");
      this.#edges.add(`${a}|${b}`);
      this.#edges.add(`${b}|${a}`);
    }
  }

  edgeBlocked(a: GridPos, b: GridPos): boolean {
    return this.#edges.has(`${a.i},${a.j}|${b.i},${b.j}`);
  }

  at(cell: GridPos): string {
    return this.#map[cell.i]?.[cell.j] ?? "#";
  }

  find(id: string): GridPos[] {
    const cells: GridPos[] = [];
    this.#map.forEach((row, i) => [...row].forEach((ch, j) => ch === id && cells.push({i, j})));
    return cells;
  }

  inside(cell: GridPos): boolean {
    return cell.i >= 0 && cell.j >= 0 && cell.i < this.rows && cell.j < this.cols;
  }

  neighbors(cell: GridPos): GridPos[] {
    const out: GridPos[] = [];
    for (const di of [-1, 0, 1]) for (const dj of [-1, 0, 1]) {
      if (!di && !dj) continue;
      if (this.diagonals === "illegal" && di && dj) continue;
      const n = {i: cell.i + di, j: cell.j + dj};
      if (this.inside(n)) out.push(n);
    }
    return out;
  }

  stepCost(from: GridPos, to: GridPos): number {
    const diagonal = from.i !== to.i && from.j !== to.j;
    if (!diagonal) return this.unitsPerCell;
    if (this.diagonals === "exact") return Math.SQRT2 * this.unitsPerCell;
    if (this.diagonals === "alternating") return 1.5 * this.unitsPerCell;
    return this.unitsPerCell;
  }

  isBlocked(from: GridPos, to: GridPos): boolean {
    return this.moverFootprint(to).some(space => this.at(space) === "#") || this.edgeBlocked(from, to);
  }

  isSeparated(anchor: GridPos, space: GridPos): boolean {
    return this.moverFootprint(anchor).every(cell => this.edgeBlocked(cell, space));
  }

  occupant(space: GridPos): string | null {
    const ch = this.at(space);
    return /[A-Za-z]/.test(ch) ? ch : null;
  }

  moverFootprint(anchor: GridPos): GridPos[] {
    const cells: GridPos[] = [];
    for (let di = 0; di < this.moverSize; di++) for (let dj = 0; dj < this.moverSize; dj++) cells.push({i: anchor.i + di, j: anchor.j + dj});
    return cells;
  }

  moverCenter(anchor: GridPos): Point {
    return {x: (anchor.j + this.moverSize / 2) * 100, y: (anchor.i + this.moverSize / 2) * 100};
  }

  centerOfCell(cell: GridPos): Point {
    return {x: (cell.j + 0.5) * 100, y: (cell.i + 0.5) * 100};
  }

  isAdjacent(a: GridPos, b: GridPos): boolean {
    const di = Math.abs(a.i - b.i);
    const dj = Math.abs(a.j - b.j);
    if (di + dj === 0) return false;
    return this.diagonals === "illegal" ? di + dj === 1 : Math.max(di, dj) === 1;
  }

  hasLineOfSight(from: Point, to: Point): boolean {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 25);
    for (let s = 1; s < steps; s++) {
      const x = from.x + ((to.x - from.x) * s) / steps;
      const y = from.y + ((to.y - from.y) * s) / steps;
      if (this.at({i: Math.floor(y / 100), j: Math.floor(x / 100)}) === "#") return false;
    }
    return true;
  }

  distanceUnits(a: Point, b: Point): number {
    return (Math.hypot(a.x - b.x, a.y - b.y) / 100) * this.unitsPerCell;
  }

  heuristic(from: Point, to: Point): number {
    const euclid = this.distanceUnits(from, to);
    return this.diagonals === "equidistant" ? euclid / Math.SQRT2 : euclid;
  }
}
