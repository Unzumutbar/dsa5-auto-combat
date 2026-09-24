import {FLAGS, MODULE_ID} from "../config";
import {log} from "../log";

export const SURRENDER_STATUS_ID = "surrendered";

export interface SurrenderFlag {
  round: number;
  reasonKey: string;
  /** null = GM has not decided yet, true = accepted, false = fights on. */
  accepted: boolean | null;
}

/** Custom DSA5 condition "Ergeben" plus the token flag that remembers the GM decision. */
export class SurrenderAdapter {
  /** Must run in `init` after DSA5 replaced CONFIG.statusEffects. */
  static registerStatus(): void {
    const effects: any[] = CONFIG.statusEffects;
    if (!Array.isArray(effects) || effects.some(e => e.id === SURRENDER_STATUS_ID)) return;
    effects.push({
      id: SURRENDER_STATUS_ID,
      name: "DSAAUTOCOMBAT.Surrender.Status",
      img: `modules/${MODULE_ID}/icons/surrender.svg`,
      description: "DSAAUTOCOMBAT.Surrender.StatusDescription"
    });
  }

  static isSurrendered(actor: any): boolean {
    if (!actor) return false;
    try {
      return Array.from(actor.effects ?? []).some((e: any) => e.statuses?.has?.(SURRENDER_STATUS_ID));
    } catch {
      return false;
    }
  }

  static readFlag(tokenDoc: any): SurrenderFlag | null {
    const raw = tokenDoc?.getFlag?.(MODULE_ID, FLAGS.surrender);
    if (!raw || typeof raw !== "object") return null;
    return {round: Number(raw.round) || 0, reasonKey: String(raw.reasonKey ?? ""), accepted: typeof raw.accepted === "boolean" ? raw.accepted : null};
  }

  static async apply(tokenDoc: any, reasonKey: string): Promise<void> {
    const actor = tokenDoc?.actor;
    if (!actor) return;
    if (!this.isSurrendered(actor)) {
      try {
        await actor.addCondition(SURRENDER_STATUS_ID);
      } catch (error) {
        log.warn("Zustand „Ergeben“ konnte nicht gesetzt werden", error);
      }
    }
    await tokenDoc.setFlag(MODULE_ID, FLAGS.surrender, {round: game.combat?.round ?? 0, reasonKey, accepted: null} satisfies SurrenderFlag);
  }

  static async decide(tokenDoc: any, accepted: boolean): Promise<void> {
    const current = this.readFlag(tokenDoc);
    await tokenDoc.setFlag(MODULE_ID, FLAGS.surrender, {...(current ?? {round: 0, reasonKey: ""}), accepted});
  }

  /** "Kämpft weiter": removes the condition and makes sure the token does not give up again this fight. */
  static async revoke(tokenDoc: any): Promise<void> {
    const actor = tokenDoc?.actor;
    if (actor && this.isSurrendered(actor)) {
      try {
        await actor.removeCondition(SURRENDER_STATUS_ID);
      } catch (error) {
        log.warn("Zustand „Ergeben“ konnte nicht entfernt werden", error);
      }
    }
    if (tokenDoc.getFlag(MODULE_ID, FLAGS.surrender) !== undefined) await tokenDoc.unsetFlag(MODULE_ID, FLAGS.surrender);
    await tokenDoc.setFlag(MODULE_ID, FLAGS.automation, {surrenderThresholdPct: 0});
  }

  /** Clears surrender flags at combat end (the condition stays until the GM removes it). */
  static async clear(tokenDoc: any): Promise<void> {
    if (tokenDoc.getFlag(MODULE_ID, FLAGS.surrender) !== undefined) await tokenDoc.unsetFlag(MODULE_ID, FLAGS.surrender);
  }
}
