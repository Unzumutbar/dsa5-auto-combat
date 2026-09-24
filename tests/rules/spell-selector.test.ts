import {describe, expect, it} from "vitest";
import {BASE_DEFAULTS} from "../../src/rules/defaults";
import {chooseSpell, type SpellPlanContext} from "../../src/rules/spells/spell-selector";
import type {SpellSnapshot} from "../../src/types/snapshot";
import {combatant, snapshot} from "../fixtures";

function spell(overrides: Partial<SpellSnapshot>): SpellSnapshot {
  return {
    itemId: overrides.name ?? "s", name: "Ignifaxius", type: "spell", cost: 8, costType: "AsP", rangeText: "16 Schritt", castingTime: 1, castingProgress: 0,
    effectFormula: "", targetCategory: "", feature: "", talentValue: 10, attributes: [12, 12, 12], area: null, overrideRole: null, ...overrides
  };
}

const ignifaxius = spell({name: "Ignifaxius", effectFormula: "2d6+QS"});
const balsam = spell({name: "Balsam Salabunde", rangeText: "Berührung", cost: 4, effectFormula: "QS*2"});
const armatrutz = spell({name: "Armatrutz", rangeText: "selbst", cost: 4});
const paralysis = spell({name: "Paralysis", rangeText: "8 Schritt", cost: 8});

function context(selfOverrides: Parameters<typeof combatant>[0], others: ReturnType<typeof combatant>[], targetId: string | null, extra: Partial<SpellPlanContext> = {}): SpellPlanContext {
  const self = combatant({tokenId: "mage", disposition: "hostile", asp: {value: 20, max: 20}, pos: {i: 0, j: 0}, ...selfOverrides});
  const snap = snapshot([self, ...others]);
  return {
    snapshot: snap, self, target: targetId ? snap.combatants.find(c => c.tokenId === targetId)! : null,
    budget: {actions: 1, freeMove: 8, runMove: 8}, settings: {...BASE_DEFAULTS}, fallbackRangeUnits: 8, meleeExpectedDamage: 5, enemyAdjacent: false, ...extra
  };
}

describe("spell selector", () => {
  it("throws a damage spell at a distant enemy", () => {
    const pc = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 2}});
    const choice = chooseSpell(context({spells: [ignifaxius]}, [pc], "pc"));
    expect(choice).toMatchObject({role: "damage", targetTokenId: "pc"});
    expect(choice!.spell.name).toBe("Ignifaxius");
  });

  it("prefers healing a badly wounded ally in touch range", () => {
    const ally = combatant({tokenId: "orc", disposition: "hostile", pos: {i: 0, j: 1}, lep: {value: 5, max: 30}});
    const pc = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 3}});
    const choice = chooseSpell(context({spells: [ignifaxius, balsam]}, [ally, pc], "pc"));
    expect(choice).toMatchObject({role: "heal", targetTokenId: "orc"});
    const farAlly = combatant({tokenId: "orc", disposition: "hostile", pos: {i: 0, j: 4}, lep: {value: 5, max: 30}});
    expect(chooseSpell(context({spells: [balsam]}, [farAlly, pc], "pc"))).toBeNull();
  });

  it("buffs itself in the opening round when the buff is not active yet", () => {
    const pc = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 5}});
    expect(chooseSpell(context({spells: [armatrutz]}, [pc], "pc"))).toMatchObject({role: "buff", targetTokenId: null});
    expect(chooseSpell(context({spells: [armatrutz], activeEffectNames: ["Armatrutz"]}, [pc], "pc"))).toBeNull();
  });

  it("skips spells it cannot afford but keeps slow spells for preparation", () => {
    const pc = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 2}});
    expect(chooseSpell(context({spells: [ignifaxius], asp: {value: 3, max: 20}}, [pc], "pc"))).toBeNull();
    expect(chooseSpell(context({spells: [spell({...ignifaxius, castingTime: 2})]}, [pc], "pc"))).not.toBeNull();
  });

  it("respects the useSpells switch and item-level exclusions", () => {
    const pc = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 2}});
    expect(chooseSpell(context({spells: [ignifaxius]}, [pc], "pc", {settings: {...BASE_DEFAULTS, useSpells: false}}))).toBeNull();
    expect(chooseSpell(context({spells: [spell({...ignifaxius, overrideRole: "never"})]}, [pc], "pc"))).toBeNull();
  });

  it("prefers control magic for supportive profiles and melee for adjacent aggressive casters", () => {
    const pc = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 1}});
    const support = chooseSpell(context({spells: [ignifaxius, paralysis]}, [pc], "pc", {enemyAdjacent: true, settings: {...BASE_DEFAULTS, profile: "support"}}));
    expect(support).toMatchObject({role: "control"});
    const aggressive = chooseSpell(context({spells: [spell({name: "Funken", effectFormula: "1d3"})]}, [pc], "pc", {enemyAdjacent: true, meleeExpectedDamage: 9, settings: {...BASE_DEFAULTS, profile: "aggressive"}}));
    expect(aggressive).toBeNull();
  });
});
