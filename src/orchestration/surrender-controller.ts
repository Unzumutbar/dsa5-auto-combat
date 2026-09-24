import {SurrenderAdapter} from "../adapters/surrender";
import {MODULE_ID, SETTINGS, localize} from "../config";
import {log} from "../log";
import {WorldSettingsRegistry} from "../settings/world-settings";
import {SurrenderCard} from "../ui/surrender-card";

/** Handles the GM decisions on a surrender card and announces surrenders to the players. */
export class SurrenderController {
  static register(): void {
    SurrenderCard.register({
      accept: id => this.decide(id, true),
      fightOn: id => this.decide(id, false),
      post: id => this.post(id)
    });
    Hooks.on("deleteCombat", (combat: any) => {
      if (!game.users.activeGM?.isSelf) return;
      for (const combatant of combat.combatants ?? []) {
        if (combatant.token) void SurrenderAdapter.clear(combatant.token).catch((error: unknown) => log.warn("Ergeben-Flag konnte nicht gelöscht werden", error));
      }
    });
  }

  /** Called by the executor: sets the condition, remembers the flag and asks the GM. */
  static async surrender(tokenDoc: any, reasonKey: string): Promise<void> {
    await SurrenderAdapter.apply(tokenDoc, reasonKey);
    await SurrenderCard.create({tokenId: tokenDoc.id, tokenName: tokenDoc.name, reasonKey, state: "pending", posted: false});
  }

  static async decide(messageId: string, accepted: boolean): Promise<void> {
    const message = game.messages.get(messageId);
    const data = message ? SurrenderCard.read(message) : null;
    if (!message || !data || data.state !== "pending") return;
    const tokenDoc = canvas.scene?.tokens.get(data.tokenId);
    if (!tokenDoc) {
      ui.notifications.warn(localize("Surrender.TokenGone"));
      return;
    }
    if (accepted) await SurrenderAdapter.decide(tokenDoc, true);
    else await SurrenderAdapter.revoke(tokenDoc);
    await SurrenderCard.update(message, {state: accepted ? "accepted" : "fighting"});
  }

  static async post(messageId: string): Promise<void> {
    const message = game.messages.get(messageId);
    const data = message ? SurrenderCard.read(message) : null;
    if (!message || !data || data.posted) return;
    const template = String(game.settings.get(MODULE_ID, SETTINGS.surrenderText) || WorldSettingsRegistry.read().surrenderText);
    const text = template.replace(/\{name\}/g, data.tokenName);
    await ChatMessage.create({content: `<p><i class="fa-solid fa-flag"></i> ${text}</p>`, speaker: {alias: data.tokenName}});
    await SurrenderCard.update(message, {posted: true});
  }
}
