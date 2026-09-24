import {log} from "../log";
import {WorldSettingsRegistry} from "../settings/world-settings";

/** Rolls missing initiative for GM-controlled combatants when combat starts or a combatant is added. */
export class InitiativeController {
  static register(): void {
    Hooks.on("combatStart", (combat: any) => {
      if (!this.#enabled()) return;
      void this.rollMissing(combat).catch((error: unknown) => log.error("Initiative fehlgeschlagen", error));
    });
    Hooks.on("createCombatant", (combatant: any) => {
      if (!this.#enabled() || !combatant.parent?.started) return;
      void this.rollMissing(combatant.parent, [combatant]).catch((error: unknown) => log.error("Initiative fehlgeschlagen", error));
    });
  }

  static #enabled(): boolean {
    return Boolean(game.users.activeGM?.isSelf) && WorldSettingsRegistry.read().autoInitiative;
  }

  static async rollMissing(combat: any, only?: any[]): Promise<void> {
    const pool: any[] = only ?? combat.combatants.contents;
    const ids = pool
      .filter((c: any) => c.actor && c.isNPC && !c.actor.hasPlayerOwner && (c.initiative === null || c.initiative === undefined))
      .map((c: any) => c.id);
    if (!ids.length) return;
    await combat.rollInitiative(ids, {messageOptions: {rollMode: "gmroll"}});
  }
}
