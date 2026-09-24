import type {GridPos, Point} from "../types/snapshot";

/**
 * Position helpers that read the committed document data (`_source`) instead of the animated
 * getters, so results are correct even while a token animation is still running or the tab is hidden.
 */
export class TokenGeometry {
  static position(tokenDoc: any): Point {
    const src = tokenDoc._source ?? tokenDoc;
    return {x: Number(src.x ?? tokenDoc.x ?? 0), y: Number(src.y ?? tokenDoc.y ?? 0)};
  }

  static size(tokenDoc: any): {width: number; height: number} {
    return {width: Math.max(1, Number(tokenDoc.width ?? 1)), height: Math.max(1, Number(tokenDoc.height ?? 1))};
  }

  static center(tokenDoc: any): Point {
    const pos = this.position(tokenDoc);
    const {width, height} = this.size(tokenDoc);
    const grid = canvas.grid.size;
    return {x: pos.x + (width * grid) / 2, y: pos.y + (height * grid) / 2};
  }

  static footprint(tokenDoc: any): GridPos[] {
    if (canvas.grid.isGridless) return [];
    const pos = this.position(tokenDoc);
    const {width, height} = this.size(tokenDoc);
    try {
      const offsets = tokenDoc.getOccupiedGridSpaceOffsets({x: pos.x, y: pos.y, width, height});
      if (offsets?.length) return offsets.map((o: any) => ({i: o.i, j: o.j}));
    } catch {
      // fall back to a rectangular footprint
    }
    const anchor = this.anchor(tokenDoc);
    const cells: GridPos[] = [];
    for (let di = 0; di < height; di++) for (let dj = 0; dj < width; dj++) cells.push({i: anchor.i + di, j: anchor.j + dj});
    return cells;
  }

  /** Top-left occupied grid space. */
  static anchor(tokenDoc: any): GridPos {
    const pos = this.position(tokenDoc);
    const half = canvas.grid.size / 2;
    const offset = canvas.grid.getOffset({x: pos.x + half, y: pos.y + half});
    return {i: offset.i, j: offset.j};
  }

  static distanceUnits(a: any, b: any): number {
    const ca = this.center(a);
    const cb = this.center(b);
    const planar = canvas.grid.measurePath([ca, cb]).distance;
    const elevation = Math.abs(Number(a.elevation ?? 0) - Number(b.elevation ?? 0));
    return elevation ? Math.hypot(planar, elevation) : planar;
  }

  /** True if a movement-blocking wall runs between the two token centers. */
  static wallBetween(a: any, b: any): boolean {
    return this.wallBetweenPoints({...this.center(a), elevation: Number(a.elevation ?? 0)}, {...this.center(b), elevation: Number(b.elevation ?? 0)});
  }

  static wallBetweenPoints(a: Point & {elevation?: number}, b: Point & {elevation?: number}): boolean {
    try {
      return Boolean(CONFIG.Canvas.polygonBackends.move.testCollision(a, b, {type: "move", mode: "any"}));
    } catch {
      return false;
    }
  }

  /** Footprint of a token if it stood at `pos` (top-left pixel). */
  static footprintAt(tokenDoc: any, pos: Point): GridPos[] {
    if (canvas.grid.isGridless) return [];
    const {width, height} = this.size(tokenDoc);
    try {
      const offsets = tokenDoc.getOccupiedGridSpaceOffsets({x: pos.x, y: pos.y, width, height});
      if (offsets?.length) return offsets.map((o: any) => ({i: o.i, j: o.j}));
    } catch {
      // fall back to a rectangular footprint
    }
    const half = canvas.grid.size / 2;
    const anchor = canvas.grid.getOffset({x: pos.x + half, y: pos.y + half});
    const cells: GridPos[] = [];
    for (let di = 0; di < height; di++) for (let dj = 0; dj < width; dj++) cells.push({i: anchor.i + di, j: anchor.j + dj});
    return cells;
  }

  static centerAt(tokenDoc: any, pos: Point): Point {
    const {width, height} = this.size(tokenDoc);
    const grid = canvas.grid.size;
    return {x: pos.x + (width * grid) / 2, y: pos.y + (height * grid) / 2};
  }

  /** Melee adjacency of token `a` standing at `posA` towards token `b` at its current position. */
  static adjacentAt(a: any, posA: Point & {elevation?: number}, b: any): boolean {
    const centerA = {...this.centerAt(a, posA), elevation: Number(posA.elevation ?? a.elevation ?? 0)};
    const centerB = {...this.center(b), elevation: Number(b.elevation ?? 0)};
    if (canvas.grid.isGridless) {
      const reach = ((this.size(a).width + this.size(b).width) / 2) * canvas.grid.distance * 1.05;
      const planar = canvas.grid.measurePath([centerA, centerB]).distance;
      return planar <= reach && !this.wallBetweenPoints(centerA, centerB);
    }
    const fa = this.footprintAt(a, posA);
    const fb = this.footprint(b);
    return fa.some(x => fb.some(y => canvas.grid.testAdjacency(x, y))) && !this.wallBetweenPoints(centerA, centerB);
  }

  /** Melee adjacency: footprints touch and no wall separates the two tokens. */
  static adjacent(a: any, b: any): boolean {
    if (canvas.grid.isGridless) {
      const reach = ((this.size(a).width + this.size(b).width) / 2) * canvas.grid.distance * 1.05;
      return this.distanceUnits(a, b) <= reach && !this.wallBetween(a, b);
    }
    const fa = this.footprint(a);
    const fb = this.footprint(b);
    return fa.some(x => fb.some(y => canvas.grid.testAdjacency(x, y))) && !this.wallBetween(a, b);
  }
}
