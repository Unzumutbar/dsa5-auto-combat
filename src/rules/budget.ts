import type {TokenAutomationSettings} from "../types/settings";
import type {CombatantSnapshot} from "../types/snapshot";

export interface ActionBudget {
  /** Remaining regular actions this turn. */
  actions: number;
  /** Movement still available as free action (scene units). */
  freeMove: number;
  /** Additional movement obtainable by spending one action (scene units). */
  runMove: number;
}

export const IMMOBILE_CONDITIONS = ["rooted", "fixated", "incapacitated", "unconscious", "paralysed"];
export const BLOCKING_CONDITIONS = ["incapacitated", "unconscious", "paralysed"];

export function blockingCondition(c: CombatantSnapshot): string | null {
  for (const id of BLOCKING_CONDITIONS) if ((c.conditions[id] ?? 0) > 0) return id;
  return null;
}

export function canMove(c: CombatantSnapshot): boolean {
  if (c.speed <= 0) return false;
  return !IMMOBILE_CONDITIONS.some(id => (c.conditions[id] ?? 0) > 0);
}

export function computeBudget(c: CombatantSnapshot, settings: TokenAutomationSettings = c.settings): ActionBudget {
  const actions = Math.max(0, Math.max(1, c.actionCount) + c.bonusActions - c.round.actionsUsed);
  if (!canMove(c)) return {actions, freeMove: 0, runMove: 0};
  const freeMove = c.round.freeActionUsed ? 0 : c.speed;
  const runMove = settings.allowRunning && !c.round.movementActionConsumed && actions >= 1 ? c.speed : 0;
  return {actions, freeMove, runMove};
}

export function lepPercent(c: CombatantSnapshot): number {
  if (c.lep.max <= 0) return 100;
  return Math.round((c.lep.value / c.lep.max) * 100);
}
