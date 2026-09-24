import {MagicWallAdapter} from "../adapters/magic-walls";
import {localize} from "../config";
import {log} from "../log";

/** Removes spell walls whose duration ran out at the start of each combat round (active GM only). */
export class WallController {
  static register(): void {
    Hooks.on("combatRound", (combat: any) => {
      if (!game.users.activeGM?.isSelf || !combat?.started) return;
      void this.expire(combat.round).catch((error: unknown) => log.error("Zauberwände konnten nicht geprüft werden", error));
    });
  }

  static async expire(round: number): Promise<void> {
    const scene = canvas.scene;
    if (!scene) return;
    const expired = await MagicWallAdapter.expire(scene, round);
    if (expired.length === 0) return;
    const names = expired.map(s => `${s.spellName}${s.casterName ? ` (${s.casterName})` : ""}`).join(", ");
    await ChatMessage.create({
      content: `<p><i class="fa-solid fa-wand-magic-sparkles"></i> ${localize("MagicWall.Expired", {walls: names})}</p>`,
      whisper: ChatMessage.getWhisperRecipients("GM").map((u: any) => u.id)
    });
  }
}
