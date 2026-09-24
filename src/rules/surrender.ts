import type {TurnPlan} from "../types/plan";
import type {CombatSnapshot, CombatantSnapshot} from "../types/snapshot";
import {lepPercent} from "./budget";
import {isAlly, isEnemy} from "./faction";
import {groupMorale} from "./morale";
import {isAlive} from "./targeting";

/** Alive, not hidden and still fighting (surrendered tokens are out of the fight). */
export function isFighting(c: CombatantSnapshot): boolean {
  return isAlive(c) && !c.surrendered && !c.hidden;
}

export interface SurrenderDecision {
  surrender: boolean;
  /** Explanation key of the trigger, e.g. "Explain.Surrender.escapeBlocked". */
  reason: string | null;
}

/** A flee plan that ends in waiting or costs two or more Passierschläge counts as blocked. */
export function escapeBlocked(fleePlan: TurnPlan): boolean {
  const move = fleePlan.actions.find(a => a.type === "move");
  if (!move) return true;
  return move.provokes.length >= 2;
}

export function outnumbered(snapshot: CombatSnapshot, self: CombatantSnapshot): boolean {
  const enemies = snapshot.combatants.filter(o => isEnemy(self, o) && isFighting(o)).length;
  const allies = snapshot.combatants.filter(o => (o.tokenId === self.tokenId || isAlly(self, o)) && isFighting(o)).length;
  return enemies >= 2 * Math.max(1, allies);
}

/**
 * Surrender needs a wounded token (LeP at or below the surrender threshold) and a reason to give up
 * rather than run: no way out, hopeless odds or the fallen leader.
 */
export function surrenderDecision(snapshot: CombatSnapshot, self: CombatantSnapshot, blocked: boolean): SurrenderDecision {
  const threshold = self.settings.surrenderThresholdPct;
  if (threshold <= 0 || lepPercent(self) > threshold) return {surrender: false, reason: null};
  if (blocked) return {surrender: true, reason: "Explain.Surrender.escapeBlocked"};
  if (self.settings.surrenderWhenOutnumbered && outnumbered(snapshot, self)) return {surrender: true, reason: "Explain.Surrender.outnumbered"};
  const morale = groupMorale(snapshot, self);
  if (morale.reason?.key === "Explain.Flee.groupLeader") return {surrender: true, reason: "Explain.Surrender.leaderFallen"};
  return {surrender: false, reason: null};
}
