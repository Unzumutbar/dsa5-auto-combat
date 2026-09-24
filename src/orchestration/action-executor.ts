import {CastingStateAdapter} from "../adapters/casting-state";
import {SurrenderController} from "./surrender-controller";
import {Dsa5RollAdapter} from "../adapters/dsa5-roll-adapter";
import {TokenGeometry} from "../adapters/geometry";
import {MovementAdapter} from "../adapters/movement-adapter";
import {FLAGS, MODULE_ID, localize} from "../config";
import {log} from "../log";
import {RANGE_BAND_MODIFIERS} from "../rules/range-bands";
import type {Action, TurnPlan} from "../types/plan";
import type {CombatSnapshot} from "../types/snapshot";

export type ActionStatus = "ok" | "skipped" | "failed" | "notImplemented";

export interface ActionResult {
  action: Action;
  status: ActionStatus;
  /** Localization key (Result.*) or free text shown next to the status. */
  detail?: string;
}

/** Executes a plan sequentially against the live scene, re-checking each target right before acting. */
export class ActionExecutor {
  static #busy = false;
  static #allowDowned = false;

  static get busy(): boolean {
    return this.#busy;
  }

  static async execute(plan: TurnPlan, snapshot: CombatSnapshot): Promise<ActionResult[]> {
    if (this.#busy) throw new Error("busy");
    this.#busy = true;
    try {
      const results: ActionResult[] = [];
      const tokenDoc = canvas.scene?.tokens.get(plan.tokenId);
      const actor = tokenDoc?.actor;
      if (!actor) return plan.actions.map(action => ({action, status: "failed", detail: "Result.Reason.noActor"}));
      const self = snapshot.combatants.find(c => c.tokenId === plan.tokenId);
      const secret = self?.disposition === "secret";
      this.#allowDowned = Boolean(self?.settings.attackDowned);
      for (const action of plan.actions) {
        const result = await this.#run(action, tokenDoc, actor, secret);
        results.push(result);
        if (result.status === "failed") break;
      }
      return results;
    } finally {
      this.#busy = false;
    }
  }

  static async #run(action: Action, tokenDoc: any, actor: any, secret: boolean): Promise<ActionResult> {
    switch (action.type) {
      case "wait":
        return {action, status: "ok"};
      case "meleeAttack":
        return this.#attack(action, tokenDoc, actor, secret);
      case "move":
        return this.#move(action, tokenDoc, secret);
      case "rangedAttack":
        return this.#rangedAttack(action, tokenDoc, actor, secret);
      case "reload":
        return this.#reload(action, tokenDoc, actor);
      case "switchWeapon":
        return this.#switchWeapon(action, tokenDoc, actor);
      case "surrender":
        try {
          await SurrenderController.surrender(tokenDoc, action.reasonKey);
          return {action, status: "ok"};
        } catch (error) {
          log.error("Aufgabe fehlgeschlagen", error);
          return {action, status: "failed", detail: String((error as Error)?.message ?? error)};
        }
      case "castSpell":
        return this.#cast(action, tokenDoc, actor, secret);
      default:
        return {action, status: "notImplemented"};
    }
  }

  static #targetState(targetTokenId: string): "ok" | "gone" | "down" {
    const target = canvas.scene?.tokens.get(targetTokenId);
    if (!target?.actor) return "gone";
    const combatant = game.combat?.combatants.find((c: any) => c.tokenId === target.id);
    const wounds = target.actor.system?.status?.wounds;
    if (combatant?.isDefeated || (wounds && wounds.max > 0 && wounds.value <= 0)) return "down";
    return "ok";
  }

  static async #move(action: Extract<Action, {type: "move"}>, tokenDoc: any, secret: boolean): Promise<ActionResult> {
    const outcome = await MovementAdapter.move(tokenDoc, action.waypoints, {showRuler: !secret, action: action.action});
    if (!outcome.ok) return {action, status: "failed", detail: "Result.Reason.moveBlocked"};
    return {action, status: "ok", detail: `${Math.round(outcome.distance * 10) / 10} ${canvas.grid.units ?? ""}`.trim()};
  }

  static #isAdjacent(tokenDoc: any, targetDoc: any): boolean {
    return TokenGeometry.adjacent(tokenDoc, targetDoc);
  }

  static async #rangedAttack(action: Extract<Action, {type: "rangedAttack"}>, tokenDoc: any, actor: any, secret: boolean): Promise<ActionResult> {
    const state = this.#targetState(action.targetTokenId);
    if (state === "gone") return {action, status: "failed", detail: "Result.Reason.targetGone"};
    if (state === "down" && !this.#allowDowned) return {action, status: "skipped", detail: "Result.Reason.targetDown"};
    const band = RANGE_BAND_MODIFIERS[action.band];
    const extra = [{name: `${game.i18n.localize("distance")}: ${localize(`Action.Band.${action.band}`)}`, value: band.attack, damageBonus: band.damage, selected: true}];
    try {
      const outcome = await Dsa5RollAdapter.rollAttack(actor, tokenDoc.id, action.weaponId, action.targetTokenId, {secret, extra});
      if (!outcome.ok) return {action, status: "failed", detail: `Result.Reason.${outcome.reason}`};
      await tokenDoc.setFlag(MODULE_ID, FLAGS.currentTarget, action.targetTokenId);
      return {action, status: "ok", detail: `SL ${outcome.successLevel}`};
    } catch (error) {
      log.error("Fernkampfangriff fehlgeschlagen", error);
      return {action, status: "failed", detail: String((error as Error)?.message ?? error)};
    }
  }

  /** Toggles system.worn.value on the involved items; costs an action unless Schnellziehen applies. */
  static async #switchWeapon(action: Extract<Action, {type: "switchWeapon"}>, tokenDoc: any, actor: any): Promise<ActionResult> {
    const updates = [
      ...action.unequipIds.filter(id => actor.items.get(id)).map(id => ({_id: id, "system.worn.value": false})),
      ...action.equipIds.filter(id => actor.items.get(id)).map(id => ({_id: id, "system.worn.value": true}))
    ];
    if (!action.equipIds.some(id => actor.items.get(id))) return {action, status: "failed", detail: "Result.Reason.noWeapon"};
    try {
      await actor.updateEmbeddedDocuments("Item", updates);
      if (action.costsAction) await game.combat?.updateActionCount?.({token: tokenDoc.id, actor: actor.id, scene: canvas.scene?.id}, 1);
    } catch (error) {
      log.error("Waffenwechsel fehlgeschlagen", error);
      return {action, status: "failed", detail: String((error as Error)?.message ?? error)};
    }
    return {action, status: "ok"};
  }

  static async #reload(action: Extract<Action, {type: "reload"}>, tokenDoc: any, actor: any): Promise<ActionResult> {
    const item = actor.items.get(action.weaponId);
    if (!item) return {action, status: "failed", detail: "Result.Reason.noWeapon"};
    const progress = (Number(item.system.reloadTime?.progress) || 0) + 1;
    await item.update({"system.reloadTime.progress": progress});
    try {
      await game.combat?.updateActionCount?.({token: tokenDoc.id, actor: actor.id, scene: canvas.scene?.id}, 1);
    } catch (error) {
      log.warn("Aktion für Nachladen konnte nicht verbucht werden", error);
    }
    let loadTime = 0;
    try {
      loadTime = Number(game.dsa5.entities.Actordsa5.calcLZ(item, actor)) || 0;
    } catch {
      loadTime = 0;
    }
    return {action, status: "ok", detail: `${progress}/${loadTime}`};
  }

  static async #cast(action: Extract<Action, {type: "castSpell"}>, tokenDoc: any, actor: any, secret: boolean): Promise<ActionResult> {
    const spell = actor.items.get(action.spellId);
    if (!spell) return {action, status: "failed", detail: "Result.Reason.noSpell"};
    if (action.targetTokenId) {
      const state = this.#targetState(action.targetTokenId);
      if (state === "gone") return {action, status: "failed", detail: "Result.Reason.targetGone"};
      if (state === "down" && action.role !== "heal") return {action, status: "skipped", detail: "Result.Reason.targetDown"};
    }
    if (action.continueCasting) return this.#prepareSpell(action, tokenDoc, spell);
    try {
      const outcome = await Dsa5RollAdapter.castSpell(actor, tokenDoc.id, spell, action.targetTokenId, {secret});
      await CastingStateAdapter.clear(tokenDoc);
      if (!outcome.ok) return {action, status: "failed", detail: `Result.Reason.${outcome.reason}`};
      const costLabel = spell.type === "liturgy" || spell.type === "ceremony" ? "KaP" : "AsP";
      let detail = `SL ${outcome.successLevel}, ${outcome.finalCost ?? action.cost} ${costLabel}`;
      if (action.role === "heal" && action.targetTokenId && (outcome.successLevel ?? 0) > 0) {
        const healed = await this.#applyHealing(spell, action.targetTokenId, outcome.qualityStep ?? 1);
        if (healed > 0) detail += `, +${healed} LeP`;
      }
      if (action.role !== "heal" && action.targetTokenId) await tokenDoc.setFlag(MODULE_ID, FLAGS.currentTarget, action.targetTokenId);
      if (action.role === "buff" && (outcome.successLevel ?? 0) > 0) {
        const cast: string[] = tokenDoc.getFlag(MODULE_ID, FLAGS.buffsCast) ?? [];
        if (!cast.includes(action.spellId)) await tokenDoc.setFlag(MODULE_ID, FLAGS.buffsCast, [...cast, action.spellId]);
      }
      return {action, status: "ok", detail};
    } catch (error) {
      log.error("Zauber fehlgeschlagen", error);
      return {action, status: "failed", detail: String((error as Error)?.message ?? error)};
    }
  }

  /** Spends the turn's actions on casting progress; the roll follows in a later turn. */
  static async #prepareSpell(action: Extract<Action, {type: "castSpell"}>, tokenDoc: any, spell: any): Promise<ActionResult> {
    const steps = Math.max(1, action.steps ?? 1);
    try {
      const {progress, needed} = await CastingStateAdapter.advance(tokenDoc, spell, steps);
      const existing = CastingStateAdapter.read(tokenDoc);
      if (!existing || existing.spellId !== action.spellId || existing.targetTokenId !== action.targetTokenId) {
        const pain = Number(tokenDoc.actor?.system?.condition?.inpain) || 0;
        await CastingStateAdapter.start(tokenDoc, {spellId: action.spellId, targetTokenId: action.targetTokenId, startedRound: game.combat?.round ?? 0, painAtStart: pain});
      }
      await game.combat?.updateActionCount?.({token: tokenDoc.id, actor: tokenDoc.actor?.id, scene: canvas.scene?.id}, steps);
      return {action, status: "ok", detail: `${progress}/${needed}`};
    } catch (error) {
      log.error("Zaubervorbereitung fehlgeschlagen", error);
      return {action, status: "failed", detail: String((error as Error)?.message ?? error)};
    }
  }

  /** Healing spells with a formula (e.g. "QS*2") restore LeP directly; DSA5 has no automation for this. */
  static async #applyHealing(spell: any, targetTokenId: string, qualityStep: number): Promise<number> {
    const formula = String(spell.system.effectFormula?.value ?? "").trim();
    const target = canvas.scene?.tokens.get(targetTokenId)?.actor;
    if (!formula || !target) return 0;
    try {
      const roll = await new Roll(formula.replace(/QS/gi, String(Math.max(1, qualityStep)))).evaluate();
      const amount = Math.max(0, Math.round(Number(roll.total) || 0));
      if (amount <= 0) return 0;
      const wounds = target.system.status.wounds;
      await target.update({"system.status.wounds.value": Math.min(wounds.max, wounds.value + amount)});
      return amount;
    } catch (error) {
      log.warn("Heilung konnte nicht angewendet werden", error);
      return 0;
    }
  }

  static async #attack(action: Extract<Action, {type: "meleeAttack"}>, tokenDoc: any, actor: any, secret: boolean): Promise<ActionResult> {
    const state = this.#targetState(action.targetTokenId);
    if (state === "gone") return {action, status: "failed", detail: "Result.Reason.targetGone"};
    if (state === "down" && !this.#allowDowned) return {action, status: "skipped", detail: "Result.Reason.targetDown"};
    if (!this.#isAdjacent(tokenDoc, canvas.scene.tokens.get(action.targetTokenId))) return {action, status: "skipped", detail: "Result.Reason.targetNotAdjacent"};
    try {
      const extra = action.maneuver ? [action.maneuver.modifier] : [];
      const outcome = await Dsa5RollAdapter.rollAttack(actor, tokenDoc.id, action.weaponId, action.targetTokenId, {secret, extra});
      if (!outcome.ok) return {action, status: "failed", detail: `Result.Reason.${outcome.reason}`};
      await tokenDoc.setFlag(MODULE_ID, FLAGS.currentTarget, action.targetTokenId);
      return {action, status: "ok", detail: `SL ${outcome.successLevel}`};
    } catch (error) {
      log.error("Angriff fehlgeschlagen", error);
      return {action, status: "failed", detail: String((error as Error)?.message ?? error)};
    }
  }
}
