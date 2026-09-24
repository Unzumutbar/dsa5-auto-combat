import {describe, expect, it} from "vitest";
import {planTurn} from "../../src/rules/planner";
import type {Action} from "../../src/types/plan";
import type {SpellSnapshot} from "../../src/types/snapshot";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};
const motoricus: SpellSnapshot = {
  itemId: "moto", name: "Motoricus", type: "spell", cost: 8, costType: "AsP", rangeText: "20 Schritt", castingTime: 2, castingProgress: 0,
  effectFormula: "", targetCategory: "", feature: "", talentValue: 10, attributes: [12, 12, 12], area: null, overrideRole: "control"
};
const cast = (plan: {actions: Action[]}) => plan.actions.filter(a => a.type === "castSpell") as Extract<Action, {type: "castSpell"}>[];

function mage(overrides: Partial<Parameters<typeof combatant>[0]> = {}) {
  return combatant({
    tokenId: "M", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [weapon({at: 8})], spells: [motoricus], asp: {value: 20, max: 20}, actionCount: 1,
    settings: {...combatant().settings, preferSpells: "controlFirst"}, ...overrides
  });
}
const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 3}, footprint: [{i: 0, j: 3}]});
const grid = new FakeSquareGrid({map: ["M..B"]});

describe("multi-round spells", () => {
  it("begins a two-action spell with one action and remembers the target", () => {
    const plan = planTurn(snapshot([mage(), foe]), "M", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["castSpell"]);
    expect(cast(plan)[0]).toMatchObject({spellId: "moto", continueCasting: true, steps: 1, targetTokenId: "B"});
    expect(plan.explanation.some(e => e.key === "Explain.Spell.prepare")).toBe(true);
  });

  it("finishes the prepared spell on the next turn before anything else", () => {
    const prepared = mage({spells: [{...motoricus, castingProgress: 1}], casting: {spellId: "moto", targetTokenId: "B", startedRound: 1, painAtStart: 0}});
    const plan = planTurn(snapshot([prepared, foe], {round: 2}), "M", {graph: grid});
    expect(cast(plan)[0]).toMatchObject({spellId: "moto", continueCasting: false, targetTokenId: "B"});
    expect(plan.explanation.some(e => e.key === "Explain.Spell.continue")).toBe(true);
  });

  it("casts in one go when enough actions are available", () => {
    const plan = planTurn(snapshot([mage({actionCount: 2}), foe]), "M", {graph: grid});
    expect(cast(plan)[0]).toMatchObject({continueCasting: false});
  });

  it("aborts when the target is gone or the caster got hurt", () => {
    const state = {spellId: "moto", targetTokenId: "B", startedRound: 1, painAtStart: 0};
    const downed = {...foe, defeated: true};
    const other = combatant({tokenId: "C", ...pc, pos: {i: 0, j: 2}, footprint: [{i: 0, j: 2}]});
    const gone = planTurn(snapshot([mage({spells: [{...motoricus, castingProgress: 1}], casting: state}), downed, other], {round: 2}), "M", {graph: new FakeSquareGrid({map: ["M.CB"]})});
    expect(gone.explanation.some(e => e.key === "Explain.Spell.aborted")).toBe(true);
    expect(gone.abortedCasting).toBe("moto");
    expect(cast(gone).some(a => a.targetTokenId === "B" && !a.continueCasting)).toBe(false);
    expect(cast(gone)[0]).toMatchObject({continueCasting: true, targetTokenId: "C"});
    const hurt = planTurn(snapshot([mage({spells: [{...motoricus, castingProgress: 1}], casting: state, pain: 2}), foe], {round: 2}), "M", {graph: grid});
    expect(hurt.explanation.some(e => e.key === "Explain.Spell.aborted")).toBe(true);
  });
});
