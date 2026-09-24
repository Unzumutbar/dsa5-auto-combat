import {cellKey, type GridGraph} from "../rules/pathfinding/grid-graph";
import {TokenGeometry} from "./geometry";
import type {GridPos, GridType, Point} from "../types/snapshot";

/**
 * GridGraph backed by the live Foundry canvas for one moving token. Anchors are the token's top-left
 * occupied grid space (identical to the token's cell for 1x1 tokens). Walls are tested with the token's
 * own collision test, occupancy is taken from every other token on the scene.
 */
export class FoundryGridGraph implements GridGraph {
  readonly kind: GridType;
  readonly unitsPerCell: number;
  readonly tokenDoc: any;
  readonly width: number;
  readonly height: number;
  #occupancy = new Map<string, string>();
  #costCache = new Map<string, number>();
  #footprintCache = new Map<string, GridPos[]>();

  constructor(tokenDoc: any) {
    this.tokenDoc = tokenDoc;
    this.kind = canvas.grid.isGridless ? "gridless" : canvas.grid.isHexagonal ? "hex" : "square";
    this.unitsPerCell = canvas.grid.distance;
    this.width = Math.max(1, Math.round(tokenDoc.width ?? 1));
    this.height = Math.max(1, Math.round(tokenDoc.height ?? 1));
    for (const other of canvas.tokens.placeables) {
      if (other.id === tokenDoc.id) continue;
      for (const space of TokenGeometry.footprint(other.document)) this.#occupancy.set(cellKey(space), other.id);
    }
  }

  /** Top-left occupied grid space of a token at its current position. */
  static anchorOf(tokenDoc: any): GridPos {
    return TokenGeometry.anchor(tokenDoc);
  }

  /** Document position (top-left pixel) for a token anchored at `anchor`. */
  anchorToPosition(anchor: GridPos): Point {
    const topLeft = canvas.grid.getTopLeftPoint(anchor);
    return {x: topLeft.x, y: topLeft.y};
  }

  neighbors(cell: GridPos): GridPos[] {
    return canvas.grid.getAdjacentOffsets(cell).map((o: any) => ({i: o.i, j: o.j}));
  }

  stepCost(from: GridPos, to: GridPos): number {
    const key = `${cellKey(from)}>${cellKey(to)}`;
    const cached = this.#costCache.get(key);
    if (cached !== undefined) return cached;
    const cost = Number(canvas.grid.measurePath([this.moverCenter(from), this.moverCenter(to)]).distance) || this.unitsPerCell;
    this.#costCache.set(key, cost);
    return cost;
  }

  isBlocked(from: GridPos, to: GridPos): boolean {
    const token = this.tokenDoc.object;
    if (!token) return false;
    try {
      return Boolean(token.checkCollision(this.moverCenter(to), {origin: this.moverCenter(from), type: "move", mode: "any"}));
    } catch {
      return false;
    }
  }

  occupant(space: GridPos): string | null {
    return this.#occupancy.get(cellKey(space)) ?? null;
  }

  moverFootprint(anchor: GridPos): GridPos[] {
    const key = cellKey(anchor);
    let footprint = this.#footprintCache.get(key);
    if (!footprint) {
      const pos = this.anchorToPosition(anchor);
      try {
        footprint = this.tokenDoc.getOccupiedGridSpaceOffsets({x: pos.x, y: pos.y, width: this.width, height: this.height}).map((o: any) => ({i: o.i, j: o.j}));
      } catch {
        footprint = [];
      }
      if (!footprint || footprint.length === 0) {
        footprint = [];
        for (let di = 0; di < this.height; di++) for (let dj = 0; dj < this.width; dj++) footprint.push({i: anchor.i + di, j: anchor.j + dj});
      }
      this.#footprintCache.set(key, footprint);
    }
    return footprint;
  }

  moverCenter(anchor: GridPos): Point {
    const pos = this.anchorToPosition(anchor);
    return {x: pos.x + (this.width * canvas.grid.size) / 2, y: pos.y + (this.height * canvas.grid.size) / 2};
  }

  isAdjacent(a: GridPos, b: GridPos): boolean {
    return canvas.grid.testAdjacency(a, b);
  }

  isSeparated(anchor: GridPos, space: GridPos): boolean {
    const target = canvas.grid.getCenterPoint(space);
    return TokenGeometry.wallBetweenPoints({...this.moverCenter(anchor), elevation: Number(this.tokenDoc.elevation ?? 0)}, {x: target.x, y: target.y, elevation: Number(this.tokenDoc.elevation ?? 0)});
  }

  hasLineOfSight(from: Point, to: Point): boolean {
    try {
      return !CONFIG.Canvas.polygonBackends.sight.testCollision(from, to, {type: "sight", mode: "any"});
    } catch {
      return true;
    }
  }

  distanceUnits(a: Point, b: Point): number {
    return (Math.hypot(a.x - b.x, a.y - b.y) / canvas.grid.size) * this.unitsPerCell;
  }

  heuristic(from: Point, to: Point): number {
    const euclid = this.distanceUnits(from, to);
    if (this.kind === "square") {
      const diagonals = canvas.grid.diagonals;
      const exact = diagonals === CONST.GRID_DIAGONALS.EXACT || diagonals === CONST.GRID_DIAGONALS.RECTILINEAR || diagonals === CONST.GRID_DIAGONALS.ILLEGAL;
      return exact ? euclid : euclid / Math.SQRT2;
    }
    return euclid;
  }
}
