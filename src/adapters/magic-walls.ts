import {FLAGS, MODULE_ID} from "../config";
import {log} from "../log";
import {isExpired, type MagicWallState, type WallKind} from "../rules/magic-walls";
import {lookupSpell} from "../rules/spells/knowledge-base";
import type {Point} from "../types/snapshot";

export interface MagicWallEntry {
  doc: any;
  state: MagicWallState;
}

/** Creates, lists and expires walls that represent spells such as Fortifex or Hexenknoten. */
export class MagicWallAdapter {
  /** Wall kind for a spell item: item flag first, then the knowledge base. */
  static spellWall(item: any): WallKind | null {
    const flag = item?.getFlag?.(MODULE_ID, FLAGS.spellWall);
    if (flag === "invisible" || flag === "opaque") return flag;
    if (flag === "none") return null;
    const known = lookupSpell(String(item?.name ?? ""));
    if (!known?.wall) return null;
    return known.wall.blocksSight ? "opaque" : "invisible";
  }

  static readState(wallDoc: any): MagicWallState | null {
    const raw = wallDoc?.flags?.[MODULE_ID]?.[FLAGS.magicWall];
    if (!raw || typeof raw.spellName !== "string") return null;
    return {
      spellId: String(raw.spellId ?? ""),
      spellName: raw.spellName,
      casterTokenId: typeof raw.casterTokenId === "string" ? raw.casterTokenId : null,
      casterName: String(raw.casterName ?? ""),
      startedRound: Number(raw.startedRound) || 0,
      durationRounds: raw.durationRounds === null || raw.durationRounds === undefined ? null : Number(raw.durationRounds) || null,
      blocksSight: Boolean(raw.blocksSight),
      messageId: typeof raw.messageId === "string" ? raw.messageId : null
    };
  }

  static list(scene: any = canvas.scene): MagicWallEntry[] {
    const result: MagicWallEntry[] = [];
    for (const doc of scene?.walls ?? []) {
      const state = this.readState(doc);
      if (state) result.push({doc, state});
    }
    return result;
  }

  static async create(scene: any, a: Point, b: Point, state: MagicWallState): Promise<any> {
    const sense = state.blocksSight ? CONST.EDGE_SENSE_TYPES.NORMAL : CONST.EDGE_SENSE_TYPES.NONE;
    const [wall] = await scene.createEmbeddedDocuments("Wall", [{
      c: [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)],
      move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
      sight: sense,
      light: sense,
      sound: CONST.EDGE_SENSE_TYPES.NONE,
      dir: 0,
      door: 0,
      flags: {[MODULE_ID]: {[FLAGS.magicWall]: state}}
    }]);
    return wall;
  }

  static async remove(scene: any, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await scene.deleteEmbeddedDocuments("Wall", ids);
    } catch (error) {
      log.warn("Zauberwand konnte nicht entfernt werden", error);
    }
  }

  /** Removes every magic wall whose duration ran out; returns the removed states for the GM note. */
  static async expire(scene: any, round: number): Promise<MagicWallState[]> {
    const expired = this.list(scene).filter(e => isExpired(e.state, round));
    await this.remove(scene, expired.map(e => e.doc.id));
    return expired.map(e => e.state);
  }
}
