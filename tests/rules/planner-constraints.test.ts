import {describe, expect, it} from "vitest";
import {applyDropActions, sanitizeConstraints} from "../../src/rules/constraints";
import {planTurn} from "../../src/rules/planner";
import type {SpellSnapshot} from "../../src/types/snapshot";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};
const sword = weapon({itemId: "sword", name: "Schwert", at: 14, pa: 8});
const bow = weapon({itemId: "bow", name: "Bogen", kind: "ranged", at: 12, pa: 0, rangeBands: [10, 50, 100], damage: "1d6+4"});
const ignifaxius: SpellSnapshot = {
  itemId: "igni", name: "Ignifaxius", type: "spell", cost: 8, costType: "AsP", rangeText: "16 Schritt", castingTime: 1, castingProgress: 0,
  effectFormula: "2d6+2", targetCategory: "", feature: "", talentValue: 10, attributes: [12, 12, 12], area: null, overrideRole: "damage"
};

function arena(spells: SpellSnapshot[] = []) {
  const self = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [sword, bow], spells, asp: {value: 20, max: 20}, actionCount: 2});
  const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 1}, footprint: [{i: 0, j: 1}], dodge: 6, weapons: [weapon({pa: 8})]});
  return {self, foe, snap: snapshot([self, foe]), grid: new FakeSquareGrid({map: ["AB"]})};
}

describe("plan constraints", () => {
  it("sanitizes GM input", () => {
    expect(sanitizeConstraints(undefined)).toEqual({});
    expect(sanitizeConstraints({targetTokenId: "", weaponId: "w", spellId: null, noMove: true, dropActions: "2", bogus: 1}))
      .toEqual({weaponId: "w", spellId: null, noMove: true, dropActions: 2});
  });

  it("forces a weapon: an archer next to the target shoots instead of drawing the sword", () => {
    const {snap, grid} = arena();
    const plain = planTurn(snap, "A", {graph: grid});
    expect(plain.actions.map(a => a.type)).toEqual(["meleeAttack", "meleeAttack"]);
    const forced = planTurn(snap, "A", {graph: grid, constraints: {weaponId: "bow", spellId: null}});
    expect(forced.actions.map(a => a.type)).toEqual(["rangedAttack", "rangedAttack"]);
    expect(forced.explanation.some(e => e.key === "Explain.Constraint.weapon")).toBe(true);
  });

  it("forces a spell even when the melee attack would deal more damage, and suppresses spells on request", () => {
    const {self, foe, grid} = arena([ignifaxius]);
    const strong = {...self, weapons: [weapon({itemId: "axe", at: 18, damage: "2d6+8"})]};
    const snap = snapshot([strong, foe]);
    expect(planTurn(snap, "A", {graph: grid}).actions.map(a => a.type)).toEqual(["meleeAttack", "meleeAttack"]);
    const forced = planTurn(snap, "A", {graph: grid, constraints: {spellId: "igni"}});
    expect(forced.actions.map(a => a.type)).toEqual(["castSpell", "meleeAttack"]);
    const none = planTurn(snapshot([{...self, settings: {...self.settings, preferSpells: "damageFirst"}}, foe]), "A", {graph: grid, constraints: {spellId: null}});
    expect(none.actions.some(a => a.type === "castSpell")).toBe(false);
  });

  it("warns when a forced weapon cannot be used", () => {
    const {snap, grid} = arena();
    const plan = planTurn(snap, "A", {graph: grid, constraints: {weaponId: "missing"}});
    expect(plan.warnings.some(w => w.key === "Explain.Constraint.unmet")).toBe(true);
  });

  it("keeps the token in place with noMove", () => {
    const self = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [sword]});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 3}, footprint: [{i: 0, j: 3}]});
    const grid = new FakeSquareGrid({map: ["A..B"]});
    expect(planTurn(snapshot([self, foe]), "A", {graph: grid}).actions[0]!.type).toBe("move");
    const held = planTurn(snapshot([self, foe]), "A", {graph: grid, constraints: {noMove: true}});
    expect(held.actions.map(a => a.type)).toEqual(["wait"]);
  });

  it("drops attacks from the end of the plan", () => {
    const {snap, grid} = arena();
    const plan = planTurn(snap, "A", {graph: grid, constraints: {dropActions: 1}});
    expect(plan.actions.map(a => a.type)).toEqual(["meleeAttack", "wait"]);
    const untouched = planTurn(snap, "A", {graph: grid});
    applyDropActions(untouched, 5);
    expect(untouched.actions.map(a => a.type)).toEqual(["wait"]);
  });
});
