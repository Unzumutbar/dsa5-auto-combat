import {FLAGS, MODULE_ID} from "../config";
import {log} from "../log";
import type {CastingState} from "../types/snapshot";

/** Token flag that remembers a spell being prepared over several turns (DSA5 keeps only the item progress). */
export class CastingStateAdapter {
  static read(tokenDoc: any): CastingState | null {
    const raw = tokenDoc?.getFlag?.(MODULE_ID, FLAGS.casting);
    if (!raw || typeof raw.spellId !== "string") return null;
    return {
      spellId: raw.spellId,
      targetTokenId: typeof raw.targetTokenId === "string" ? raw.targetTokenId : null,
      startedRound: Number(raw.startedRound) || 0,
      painAtStart: Number(raw.painAtStart) || 0
    };
  }

  static async start(tokenDoc: any, state: CastingState): Promise<void> {
    await tokenDoc.setFlag(MODULE_ID, FLAGS.casting, state);
  }

  static async clear(tokenDoc: any): Promise<void> {
    if (tokenDoc?.getFlag?.(MODULE_ID, FLAGS.casting) !== undefined) await tokenDoc.unsetFlag(MODULE_ID, FLAGS.casting);
  }

  /** Resets the item's casting progress (like DSA5 after a roll) and forgets the flag. */
  static async abort(tokenDoc: any, spellId?: string): Promise<void> {
    const state = this.read(tokenDoc);
    const item = tokenDoc?.actor?.items.get(spellId ?? state?.spellId ?? "");
    try {
      if (item && (Number(item.system.castingTime?.progress) || 0) > 0) {
        await item.update({"system.castingTime.progress": 0, "system.castingTime.modified": 0});
      }
    } catch (error) {
      log.warn("Zauberfortschritt konnte nicht zurückgesetzt werden", error);
    }
    await this.clear(tokenDoc);
  }

  /** One preparation step: mirrors the DSA5 dialog button (progress + 1, modified = casting time − 1). */
  static async advance(tokenDoc: any, item: any, steps: number): Promise<{progress: number; needed: number}> {
    const castingTime = Number(item.system.castingTime?.value) || 1;
    const needed = Math.max(1, castingTime - 1);
    const progress = Math.min(needed, (Number(item.system.castingTime?.progress) || 0) + steps);
    await item.update({"system.castingTime.progress": progress, "system.castingTime.modified": needed});
    try {
      const utility = game.dsa5?.apps?.DSA5_Utility;
      const text = game.i18n.format("SPELL.isReloading", {actor: tokenDoc.name, item: item.name, status: `${progress}/${needed}`});
      if (utility?.chatDataSetup) await ChatMessage.create(utility.chatDataSetup(text));
    } catch (error) {
      log.warn("Hinweis zum Zauberfortschritt konnte nicht gepostet werden", error);
    }
    return {progress, needed};
  }
}
