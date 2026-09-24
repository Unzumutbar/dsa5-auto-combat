import type {SpellRole} from "../../types/plan";
import type {SpellSnapshot} from "../../types/snapshot";
import type {ResolvedSpell, SpellKnowledge, SpellTargeting} from "../../types/spells";
import {parseSpellRange} from "../range-text";
import {lookupSpell, SPELL_KNOWLEDGE_BASE} from "./knowledge-base";

const ROLES = new Set<string>(["damage", "heal", "buff", "debuff", "control"]);

function defaultTarget(role: SpellRole): SpellTargeting {
  return role === "heal" || role === "buff" ? "ally" : "enemy";
}

/**
 * Decides what a spell does for the planner. Order: GM override flag on the item, then the built-in
 * knowledge base, then a heuristic (damage formula => damage). Returns null when the spell should not
 * be cast automatically ("never" flag, rituals/ceremonies, unknown spells).
 */
export function resolveSpell(spell: SpellSnapshot, fallbackRangeUnits: number, knowledgeBase: readonly SpellKnowledge[] = SPELL_KNOWLEDGE_BASE): ResolvedSpell | null {
  if (spell.overrideRole === "never") return null;
  if (spell.type === "ritual" || spell.type === "ceremony") return null;
  const known = lookupSpell(spell.name, knowledgeBase);
  let role: SpellRole | null = null;
  let target: SpellTargeting | null = null;
  let source: ResolvedSpell["source"] = "heuristic";
  if (spell.overrideRole && spell.overrideRole !== "auto" && ROLES.has(spell.overrideRole)) {
    role = spell.overrideRole as SpellRole;
    target = known?.role === role ? known.target : defaultTarget(role);
    source = "flag";
  } else if (known) {
    role = known.role;
    target = known.target;
    source = "knowledgeBase";
  } else if (spell.effectFormula) {
    role = "damage";
    target = "enemy";
  } else if (/heil|heal/i.test(spell.feature) || /heil|heal/i.test(spell.name)) {
    role = "heal";
    target = "ally";
  }
  if (!role || !target) return null;
  const range = parseSpellRange(spell.rangeText, fallbackRangeUnits, known?.rangeHint);
  return {
    itemId: spell.itemId,
    name: spell.name,
    type: spell.type,
    role,
    target: target === "ally" && range.kind === "self" ? "self" : target,
    source,
    range,
    cost: spell.cost,
    costType: spell.costType,
    castingTime: spell.castingTime,
    castingProgress: spell.castingProgress,
    effectFormula: spell.effectFormula,
    effectNames: known?.effectNames ?? [spell.name],
    talentValue: spell.talentValue,
    attributes: spell.attributes,
    area: spell.area
  };
}
