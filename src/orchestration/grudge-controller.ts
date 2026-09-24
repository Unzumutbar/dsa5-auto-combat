import {FLAGS, MODULE_ID} from "../config";
import {log} from "../log";

/** Remembers who attacked a token so passive (neutral/secret) NPCs retaliate against their attackers. */
export class GrudgeController {
  static grudges(tokenDoc: any): string[] {
    const stored = tokenDoc?.getFlag?.(MODULE_ID, FLAGS.grudges);
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  }

  static async noteAttack(defenderTokenDoc: any, attackerTokenId: string | null | undefined): Promise<boolean> {
    if (!attackerTokenId || attackerTokenId === defenderTokenDoc.id) return false;
    const grudges = this.grudges(defenderTokenDoc);
    if (grudges.includes(attackerTokenId)) return false;
    await defenderTokenDoc.setFlag(MODULE_ID, FLAGS.grudges, [...grudges, attackerTokenId]);
    log.debug("Grudge", defenderTokenDoc.name, "->", attackerTokenId);
    return true;
  }

  static async clear(tokenDoc: any): Promise<void> {
    await tokenDoc.unsetFlag(MODULE_ID, FLAGS.grudges);
  }
}
