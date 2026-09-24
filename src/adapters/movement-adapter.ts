import {log} from "../log";
import {TokenGeometry} from "./geometry";
import type {Point} from "../types/snapshot";

export interface MoveOutcome {
  ok: boolean;
  /** Distance actually travelled this movement in scene units. */
  distance: number;
}

/** Executes a planned movement through Foundry's movement pipeline and books the DSA5 action cost. */
export class MovementAdapter {
  /** Converts mover-center waypoints to document (top-left) positions. */
  static toPositions(tokenDoc: any, centers: Point[]): Point[] {
    const size = canvas.grid.size;
    const halfW = ((tokenDoc.width ?? 1) * size) / 2;
    const halfH = ((tokenDoc.height ?? 1) * size) / 2;
    return centers.map(c => ({x: Math.round(c.x - halfW), y: Math.round(c.y - halfH)}));
  }

  static async move(tokenDoc: any, centers: Point[], options: {showRuler: boolean; action?: string}): Promise<MoveOutcome> {
    if (centers.length === 0) return {ok: true, distance: 0};
    const before = TokenGeometry.position(tokenDoc);
    const historyBefore = this.historyDistance(tokenDoc);
    const action = options.action && CONFIG.Token.movement.actions?.[options.action] ? options.action : "walk";
    const waypoints = this.toPositions(tokenDoc, centers).map(p => ({...p, action, snapped: !canvas.grid.isGridless, explicit: true}));
    let ok = false;
    try {
      ok = Boolean(await tokenDoc.move(waypoints, {autoRotate: true, showRuler: options.showRuler}));
      // move() resolves once the update is committed; wait for the client-side animation so that
      // positions read afterwards (adjacency, movement cost) reflect the final location.
      const animation = tokenDoc.object?.movementAnimationPromise;
      if (animation) await Promise.race([animation, new Promise(r => setTimeout(r, 4000))]);
    } catch (error) {
      log.error("Bewegung fehlgeschlagen", error);
    }
    const combat = game.combat;
    if (combat?.handleMovementCost) {
      try {
        await combat.handleMovementCost(tokenDoc);
      } catch (error) {
        log.warn("handleMovementCost fehlgeschlagen", error);
      }
    }
    const historyAfter = this.historyDistance(tokenDoc);
    const after = TokenGeometry.position(tokenDoc);
    const moved = after.x !== before.x || after.y !== before.y;
    const travelled = historyAfter !== null && historyBefore !== null && historyAfter > historyBefore
      ? historyAfter - historyBefore
      : (Math.hypot(after.x - before.x, after.y - before.y) / canvas.grid.size) * canvas.grid.distance;
    return {ok: ok && moved, distance: Math.round(travelled * 10) / 10};
  }

  /** Total distance recorded in the token's movement history this turn, or null if unavailable. */
  static historyDistance(tokenDoc: any): number | null {
    try {
      const history = tokenDoc.movementHistory;
      if (Array.isArray(history) && history.length > 1 && tokenDoc.object) return Number(tokenDoc.object.measureMovementPath(history).distance) || 0;
      return 0;
    } catch {
      return null;
    }
  }
}
