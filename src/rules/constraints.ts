import type {Action, TurnPlan} from "../types/plan";

/**
 * GM adjustments to a planned turn. `undefined` means "let the planner decide"; a `null` weapon or
 * spell means "none of them".
 */
export interface PlanConstraints {
  targetTokenId?: string;
  weaponId?: string;
  /** null = do not cast anything this turn. */
  spellId?: string | null;
  noMove?: boolean;
  /** Number of attack/reload/spell actions to drop from the end of the plan. */
  dropActions?: number;
}

const optionalId = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);

/** Drops unknown keys and malformed values; returns an empty object for "no adjustments". */
export function sanitizeConstraints(input: unknown): PlanConstraints {
  const raw = (input ?? {}) as Record<string, unknown>;
  const result: PlanConstraints = {};
  const target = optionalId(raw.targetTokenId);
  if (target) result.targetTokenId = target;
  const weapon = optionalId(raw.weaponId);
  if (weapon) result.weaponId = weapon;
  if (raw.spellId === null) result.spellId = null;
  else if (optionalId(raw.spellId)) result.spellId = raw.spellId as string;
  if (raw.noMove === true) result.noMove = true;
  const drop = Number(raw.dropActions);
  if (Number.isFinite(drop) && drop > 0) result.dropActions = Math.min(10, Math.floor(drop));
  return result;
}

export function hasConstraints(constraints: PlanConstraints | undefined): boolean {
  return Boolean(constraints && Object.keys(constraints).length > 0);
}

const DROPPABLE = new Set<Action["type"]>(["meleeAttack", "rangedAttack", "reload", "castSpell", "switchWeapon"]);

/** Removes the last `count` droppable actions and notes the gap with a wait entry. */
export function applyDropActions(plan: TurnPlan, count: number | undefined): void {
  if (!count || count <= 0) return;
  let left = count;
  for (let i = plan.actions.length - 1; i >= 0 && left > 0; i--) {
    if (DROPPABLE.has(plan.actions[i]!.type)) {
      plan.actions.splice(i, 1);
      left--;
    }
  }
  if (left < count) plan.actions.push({type: "wait", reasonKey: "Explain.Wait.removed"});
}
