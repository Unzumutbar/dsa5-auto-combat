import {Dsa5RollAdapter} from "../adapters/dsa5-roll-adapter";
import {SurrenderAdapter} from "../adapters/surrender";
import {OpposedAdapter, type AttackContext} from "../adapters/opposed-adapter";
import {TokenSettingsAdapter} from "../adapters/token-settings";
import {WeaponsAdapter} from "../adapters/weapons";
import {FLAGS, MODULE_ID, localize} from "../config";
import {log} from "../log";
import {decideDefense, type DefenseDecision, type DefenseInput} from "../rules/defense";
import {isMeleeWeapon} from "../rules/reach";
import {WorldSettingsRegistry} from "../settings/world-settings";
import type {TokenAutomationSettings} from "../types/settings";
import {GrudgeController} from "./grudge-controller";

const CANNOT_DEFEND = ["incapacitated", "unconscious", "paralysed", "surprised"];

/**
 * Answers attacks against automated NPCs on the active GM client. DSA5 creates a "start message"
 * (flags.unopposeData) for every targeted attack; the defender normally clicks a button on it.
 */
export class DefenseController {
  static #handled = new Set<string>();
  static #queues = new Map<string, Promise<void>>();

  static register(): void {
    Hooks.on("createChatMessage", (message: any) => {
      if (!game.users.activeGM?.isSelf) return;
      if (!OpposedAdapter.startData(message)) return;
      void this.handleStart(message).catch((error: unknown) => log.error("Auto-Verteidigung fehlgeschlagen", error));
    });
  }

  static async handleStart(startMessage: any): Promise<void> {
    if (!WorldSettingsRegistry.read().enabled) return;
    if (this.#handled.has(startMessage.id)) return;
    this.#handled.add(startMessage.id);
    const start = OpposedAdapter.startData(startMessage)!;
    if (start.targetSceneId && start.targetSceneId !== canvas.scene?.id) return;
    const tokenDoc = canvas.scene?.tokens.get(start.targetTokenId);
    const actor = tokenDoc?.actor;
    if (!tokenDoc || !actor || actor.hasPlayerOwner) return;
    if (!OpposedAdapter.isStillOpen(startMessage)) return;
    const attackMessage = game.messages.get(start.attackMessageId);
    if (!attackMessage) return;
    await GrudgeController.noteAttack(tokenDoc, OpposedAdapter.attackerTokenId(attackMessage));
    if (SurrenderAdapter.isSurrendered(actor)) ui.notifications.warn(localize("Surrender.Attacked", {name: tokenDoc.name}));
    const settings = TokenSettingsAdapter.resolve(tokenDoc).settings;
    if (settings.level === "off") return;
    const previous = this.#queues.get(tokenDoc.id) ?? Promise.resolve();
    const job = previous
      .then(() => this.defend(startMessage, attackMessage, tokenDoc, actor, settings))
      .catch((error: unknown) => log.error("Auto-Verteidigung fehlgeschlagen", error));
    this.#queues.set(tokenDoc.id, job);
    await job;
  }

  static async defend(startMessage: any, attackMessage: any, tokenDoc: any, actor: any, settings: TokenAutomationSettings): Promise<void> {
    await OpposedAdapter.waitForOpposeFlag(actor, startMessage.id);
    const fresh = game.messages.get(startMessage.id);
    if (!fresh || !OpposedAdapter.isStillOpen(fresh)) return;
    if (attackMessage.flags?.data?.unopposedStartMessage === startMessage.id) return;
    if (fresh.getFlag(MODULE_ID, FLAGS.autoDefense)) return;
    await fresh.setFlag(MODULE_ID, FLAGS.autoDefense, {by: game.user.id, at: Date.now()});

    const context = OpposedAdapter.attackContext(attackMessage, tokenDoc);
    if (context.sourceType === "skill") return;
    const input = this.defenseInput(actor, tokenDoc, context, settings);
    const decision = decideDefense(input);
    log.debug("Verteidigung", tokenDoc.name, decision, input);
    const secret = tokenDoc.disposition === CONST.TOKEN_DISPOSITIONS.SECRET;
    const oppose = {startMessageId: fresh.id, attackMessageId: attackMessage.id};
    if (decision.kind === "none") {
      await Dsa5RollAdapter.declineDefense(fresh, localize(`Defense.None.${decision.reason}`));
      return;
    }
    const outcome = decision.kind === "dodge"
      ? await Dsa5RollAdapter.rollDodge(actor, tokenDoc.id, oppose, {secret})
      : await Dsa5RollAdapter.rollParry(actor, tokenDoc.id, decision.itemId, oppose, {secret});
    if (!outcome.ok) {
      log.warn("Verteidigungswurf nicht möglich, verzichte", outcome.reason);
      await Dsa5RollAdapter.declineDefense(fresh, localize("Defense.None.rollFailed"));
    }
  }

  static defenseInput(actor: any, tokenDoc: any, context: AttackContext, settings: TokenAutomationSettings): DefenseInput {
    const weapons = WeaponsAdapter.list(actor);
    const parryOptions = weapons.filter(w => isMeleeWeapon(w) && w.pa > 0).map(w => ({itemId: w.itemId, name: w.name, pa: w.pa, isShield: w.isShield}));
    const combatant = game.combat?.combatants.find((c: any) => c.tokenId === tokenDoc.id);
    const defenseCount = Number(combatant?.system?.defenseCount) || 0;
    const cannotDefend = !settings.fightWhileIncapacitated && (CANNOT_DEFEND.some(id => actor.hasCondition?.(id)) || Boolean(combatant?.isDefeated));
    let multipleDefenseValue = -3;
    try {
      multipleDefenseValue = Number(game.dsa5.apps.RuleChaos.multipleDefenseValue(actor, {type: "dodge", system: {}})) || -3;
    } catch {
      multipleDefenseValue = -3;
    }
    return {
      dodgeValue: Number(actor.system.status?.dodge?.max ?? actor.system.status?.dodge?.value) || 0,
      parryOptions,
      defenseCount,
      multipleDefenseValue,
      inheritedMalus: context.inheritedMalus,
      halfDefense: context.halfDefense,
      cannotDefend,
      attackKind: context.kind,
      attackerAdjacent: context.attackerAdjacent,
      settings: {declineHopelessDefense: settings.declineHopelessDefense, dodgeOnlyVsRanged: settings.dodgeOnlyVsRanged}
    };
  }

  static describe(decision: DefenseDecision): string {
    if (decision.kind === "parry") return `${localize("Defense.Parry")} (${decision.name})`;
    if (decision.kind === "dodge") return localize("Defense.Dodge");
    return localize(`Defense.None.${decision.reason}`);
  }
}
