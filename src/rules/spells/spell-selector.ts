import type {SpellRole} from "../../types/plan";
import type {TokenAutomationSettings} from "../../types/settings";
import type {CombatSnapshot, CombatantSnapshot} from "../../types/snapshot";
import type {ResolvedSpell} from "../../types/spells";
import type {ActionBudget} from "../budget";
import {lepPercent} from "../budget";
import {isAlly} from "../faction";
import {rangeAllows} from "../range-text";
import {areAdjacent, distanceBetween, hasLineOfSight, isAlive} from "../targeting";
import {expectedQualityStep, expectedValue} from "./formula-ev";
import {resolveSpell} from "./resolve-role";

export interface SpellPlanContext {
  snapshot: CombatSnapshot;
  self: CombatantSnapshot;
  target: CombatantSnapshot | null;
  budget: ActionBudget;
  settings: TokenAutomationSettings;
  fallbackRangeUnits: number;
  /** Expected damage of the best melee attack, used to compare against damage spells. */
  meleeExpectedDamage: number;
  /** An enemy stands next to the caster (no leisurely self-buffs). */
  enemyAdjacent: boolean;
  /** GM forced the spell list down to one spell: cast it if at all possible. */
  forceSpell?: boolean;
}

export interface SpellChoice {
  spell: ResolvedSpell;
  targetTokenId: string | null;
  role: SpellRole;
}

function pool(self: CombatantSnapshot, spell: ResolvedSpell): number {
  return spell.costType === "AsP" ? self.asp.value : self.kap.value;
}

export function castableSpells(ctx: SpellPlanContext): ResolvedSpell[] {
  return ctx.self.spells
    .map(s => resolveSpell(s, ctx.fallbackRangeUnits))
    .filter((s): s is ResolvedSpell => s !== null)
    .filter(s => pool(ctx.self, s) >= Math.max(1, s.cost));
}

/** Turns still needed to finish the spell with the current action budget. */
export function roundsNeeded(spell: ResolvedSpell, actions: number): number {
  const remaining = Math.max(1, spell.castingTime - spell.castingProgress);
  return Math.max(1, Math.ceil(remaining / Math.max(1, actions)));
}

export type ContinueResult = {kind: "continue"; choice: SpellChoice} | {kind: "abort"; reason: string} | null;

/** A spell in preparation is finished if the caster and target are still fit; otherwise it is aborted. */
export function continueCasting(ctx: SpellPlanContext, spells: ResolvedSpell[]): ContinueResult {
  const state = ctx.self.casting;
  if (!state) return null;
  const spell = spells.find(s => s.itemId === state.spellId);
  if (!spell || spell.castingProgress <= 0) return {kind: "abort", reason: "Explain.Spell.AbortReason.lost"};
  if (ctx.self.pain > state.painAtStart) return {kind: "abort", reason: "Explain.Spell.AbortReason.pain"};
  if (state.targetTokenId) {
    const target = ctx.snapshot.combatants.find(c => c.tokenId === state.targetTokenId);
    if (!target || !isAlive(target) || target.hidden) return {kind: "abort", reason: "Explain.Spell.AbortReason.target"};
    if (!inRange(ctx, spell, target)) return {kind: "abort", reason: "Explain.Spell.AbortReason.range"};
  }
  return {kind: "continue", choice: {spell, targetTokenId: state.targetTokenId, role: spell.role}};
}

function inRange(ctx: SpellPlanContext, spell: ResolvedSpell, other: CombatantSnapshot): boolean {
  if (other.tokenId === ctx.self.tokenId) return true;
  const distance = distanceBetween(ctx.snapshot, ctx.self.tokenId, other.tokenId);
  const adjacent = areAdjacent(ctx.snapshot, ctx.self.tokenId, other.tokenId);
  const los = hasLineOfSight(ctx.snapshot, ctx.self.tokenId, other.tokenId);
  return rangeAllows(spell.range, distance, adjacent, los);
}

function alreadyActive(target: CombatantSnapshot, spell: ResolvedSpell): boolean {
  if (target.buffsCast.includes(spell.itemId)) return true;
  const names = target.activeEffectNames.map(n => n.toLowerCase());
  return spell.effectNames.some(e => names.some(n => n.includes(e.toLowerCase())));
}

function pickHeal(ctx: SpellPlanContext, spells: ResolvedSpell[]): SpellChoice | null {
  const heals = spells.filter(s => s.role === "heal");
  if (heals.length === 0) return null;
  const wounded = ctx.snapshot.combatants
    .filter(o => (o.tokenId === ctx.self.tokenId || isAlly(ctx.self, o)) && isAlive(o) && lepPercent(o) < ctx.settings.healThresholdPct)
    .sort((a, b) => lepPercent(a) - lepPercent(b));
  for (const ally of wounded) {
    const spell = heals.find(s => (ally.tokenId === ctx.self.tokenId ? true : s.target !== "self") && inRange(ctx, s, ally));
    if (spell) return {spell, targetTokenId: ally.tokenId, role: "heal"};
  }
  return null;
}

function pickBuff(ctx: SpellPlanContext, spells: ResolvedSpell[]): SpellChoice | null {
  if (ctx.enemyAdjacent && ctx.snapshot.round > 1) return null;
  const buff = spells.find(s => s.role === "buff" && (s.target === "self" || s.range.kind === "self") && !alreadyActive(ctx.self, s));
  return buff ? {spell: buff, targetTokenId: null, role: "buff"} : null;
}

/** An area spell centered on the target would also hit the caster or an ally. */
export function areaHitsAllies(ctx: SpellPlanContext, spell: ResolvedSpell, target: CombatantSnapshot): boolean {
  if (!spell.area) return false;
  return ctx.snapshot.combatants.some(o => (o.tokenId === ctx.self.tokenId || isAlly(ctx.self, o)) && isAlive(o) && distanceBetween(ctx.snapshot, target.tokenId, o.tokenId) <= spell.area!);
}

function pickOffensive(ctx: SpellPlanContext, spells: ResolvedSpell[]): SpellChoice | null {
  const target = ctx.target;
  if (!target) return null;
  const usable = spells.filter(s => (s.role === "damage" || s.role === "control" || s.role === "debuff") && inRange(ctx, s, target) && !areaHitsAllies(ctx, s, target));
  const damage = usable
    .filter(s => s.role === "damage")
    .map(s => ({s, ev: expectedValue(s.effectFormula, expectedQualityStep(s.talentValue)) / roundsNeeded(s, ctx.budget.actions)}))
    .sort((a, b) => b.ev - a.ev)[0];
  const control = usable.find(s => (s.role === "control" || s.role === "debuff") && !alreadyActive(target, s));
  const adjacent = areAdjacent(ctx.snapshot, ctx.self.tokenId, target.tokenId);
  const profile = ctx.settings.profile;
  const preference = ctx.settings.preferSpells;
  if (preference === "weaponsFirst") return null;
  if (preference === "damageFirst" && damage) return {spell: damage.s, targetTokenId: target.tokenId, role: "damage"};
  const preferControl = preference === "controlFirst" || profile === "support" || profile === "defensive";
  const damageWorthIt = damage && (!adjacent || damage.ev > ctx.meleeExpectedDamage || ctx.meleeExpectedDamage <= 0);
  if (preferControl && control) return {spell: control, targetTokenId: target.tokenId, role: control.role};
  if (damageWorthIt) return {spell: damage.s, targetTokenId: target.tokenId, role: "damage"};
  if (control && (!adjacent || ctx.meleeExpectedDamage <= 0 || profile !== "aggressive")) return {spell: control, targetTokenId: target.tokenId, role: control.role};
  return null;
}

/** A GM-forced spell: target by role, ignore thresholds and preferences, only range and resources count. */
function pickForced(ctx: SpellPlanContext, spells: ResolvedSpell[]): SpellChoice | null {
  const spell = spells[0];
  if (!spell) return null;
  if (spell.role === "heal") {
    const allies = ctx.snapshot.combatants
      .filter(o => (o.tokenId === ctx.self.tokenId || isAlly(ctx.self, o)) && isAlive(o) && inRange(ctx, spell, o))
      .sort((a, b) => lepPercent(a) - lepPercent(b));
    const ally = allies.find(o => spell.target !== "self" || o.tokenId === ctx.self.tokenId) ?? null;
    return ally ? {spell, targetTokenId: ally.tokenId, role: "heal"} : null;
  }
  if (spell.role === "buff") {
    if (spell.target === "self" || spell.range.kind === "self" || !ctx.target) return {spell, targetTokenId: null, role: "buff"};
    const ally = ctx.snapshot.combatants.find(o => isAlly(ctx.self, o) && isAlive(o) && inRange(ctx, spell, o));
    return {spell, targetTokenId: ally?.tokenId ?? null, role: "buff"};
  }
  if (!ctx.target || !inRange(ctx, spell, ctx.target)) return null;
  return {spell, targetTokenId: ctx.target.tokenId, role: spell.role};
}

/** Heal first, then a self buff (opening round or when unengaged), then offensive magic. */
export function chooseSpell(ctx: SpellPlanContext): SpellChoice | null {
  if (!ctx.settings.useSpells) return null;
  const spells = castableSpells(ctx);
  if (spells.length === 0) return null;
  if (ctx.forceSpell) return pickForced(ctx, spells);
  return pickHeal(ctx, spells) ?? pickBuff(ctx, spells) ?? pickOffensive(ctx, spells);
}
