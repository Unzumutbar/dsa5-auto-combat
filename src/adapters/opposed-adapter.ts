import type {AttackKind} from "../rules/defense";
import type {MeleeReach} from "../types/snapshot";
import {TokenGeometry} from "./geometry";

export interface AttackContext {
  kind: AttackKind;
  attackerReach: MeleeReach;
  /** Sum of additive defense maluses the attack imposes (e.g. -4 for ranged/spell). */
  inheritedMalus: number;
  halfDefense: boolean;
  attackerTokenDoc: any | null;
  attackerAdjacent: boolean;
  sourceType: string;
}

const SPELL_TYPES = new Set(["spell", "liturgy", "ceremony", "ritual"]);
const REACHES = new Set(["short", "medium", "long"]);

/** Reads DSA5 opposed-test chat data (start message / attack message) into plain values. */
export class OpposedAdapter {
  static startData(message: any): {attackMessageId: string; targetTokenId: string; targetSceneId: string | null} | null {
    const u = message?.flags?.unopposeData;
    if (!u?.attackMessageId || !u.targetSpeaker?.token) return null;
    return {attackMessageId: u.attackMessageId, targetTokenId: u.targetSpeaker.token, targetSceneId: u.targetSpeaker.scene ?? null};
  }

  /**
   * Token that made an attack. DSA5 does not always put the token into the chat speaker, but the roll
   * data keeps the speaker that was passed to setupWeapon(); fall back to the sole token of the actor.
   */
  static attackerTokenId(attackMessage: any): string | null {
    const fromRoll = attackMessage?.flags?.data?.preData?.extra?.speaker?.token;
    if (typeof fromRoll === "string" && fromRoll && fromRoll !== "emptyActor") return fromRoll;
    const fromSpeaker = attackMessage?.speaker?.token;
    if (typeof fromSpeaker === "string" && fromSpeaker) return fromSpeaker;
    const actorId = attackMessage?.speaker?.actor;
    if (!actorId) return null;
    const tokens = canvas.scene?.tokens.filter((t: any) => t.actor?.id === actorId) ?? [];
    return tokens.length === 1 ? tokens[0].id : null;
  }

  static isStillOpen(startMessage: any): boolean {
    return typeof startMessage?.content === "string" && startMessage.content.includes("unopposed-button");
  }

  static attackContext(attackMessage: any, defenderTokenDoc: any): AttackContext {
    const data = attackMessage?.flags?.data ?? {};
    const source = data.preData?.source ?? {};
    const sourceType = String(source.type ?? "");
    const traitType = source.system?.traitType?.value;
    let kind: AttackKind = "melee";
    if (sourceType === "rangeweapon" || traitType === "rangeAttack") kind = "ranged";
    else if (SPELL_TYPES.has(sourceType)) kind = "spell";
    const reach = source.system?.reach?.value;
    const attackerReach: MeleeReach = kind === "melee" && typeof reach === "string" && REACHES.has(reach) ? (reach as MeleeReach) : "short";
    let inheritedMalus = 0;
    for (const mod of data.preData?.situationalModifiers ?? []) {
      if (mod?.selected === false) continue;
      if (Number.isFinite(Number(mod?.dmmalus)) && Number(mod.dmmalus) !== 0) inheritedMalus += Number(mod.dmmalus);
      else if (mod?.type === "defenseMalus" && Number.isFinite(Number(mod.value))) inheritedMalus += Number(mod.value);
    }
    const attackerTokenId = this.attackerTokenId(attackMessage);
    const attackerTokenDoc = attackerTokenId ? canvas.scene?.tokens.get(attackerTokenId) ?? null : null;
    const attackerAdjacent = attackerTokenDoc && defenderTokenDoc ? TokenGeometry.adjacent(attackerTokenDoc, defenderTokenDoc) : kind === "melee";
    return {kind, attackerReach, inheritedMalus, halfDefense: Boolean(data.postData?.halfDefense), attackerTokenDoc, attackerAdjacent, sourceType};
  }

  /** Resolves the actor behind a DSA5 speaker object (token first, then world actor). */
  static speakerActor(speaker: any): any | null {
    if (!speaker) return null;
    if (speaker.token) {
      const scene = speaker.scene ? game.scenes.get(speaker.scene) : canvas.scene;
      const tokenDoc = scene?.tokens.get(speaker.token);
      if (tokenDoc?.actor) return tokenDoc.actor;
    }
    return speaker.actor ? game.actors.get(speaker.actor) ?? null : null;
  }

  static speakerToken(speaker: any): any | null {
    if (!speaker?.token) return null;
    const scene = speaker.scene ? game.scenes.get(speaker.scene) : canvas.scene;
    return scene?.tokens.get(speaker.token) ?? null;
  }

  /** Waits (bounded) until DSA5 has stored the oppose flag for this start message on the defender. */
  static async waitForOpposeFlag(actor: any, startMessageId: string, timeoutMs = 1500): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (actor.flags?.opposes?.[startMessageId] || actor.flags?.oppose?.startMessageId === startMessageId) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }
}
