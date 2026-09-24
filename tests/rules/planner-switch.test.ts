import {describe, expect, it} from "vitest";
import {planTurn} from "../../src/rules/planner";
import {switchTo} from "../../src/rules/weapon-switch";
import type {Action} from "../../src/types/plan";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};
const crossbow = weapon({itemId: "xbow", name: "Armbrust", kind: "ranged", at: 14, pa: 0, rangeBands: [10, 50, 80], ammoLeft: 5, loadTime: 0, twoHanded: true});
const dagger = weapon({itemId: "dagger", name: "Dolch", at: 12, pa: 6, worn: false});
const sword = weapon({itemId: "sword", name: "Schwert", at: 14, pa: 8});
const shield = weapon({itemId: "shield", name: "Schild", at: 8, pa: 12, isShield: true});
const bow = weapon({itemId: "bow", name: "Bogen", kind: "ranged", at: 13, pa: 0, rangeBands: [10, 50, 80], ammoLeft: 10, worn: false, twoHanded: true});
const types = (actions: Action[]) => actions.map(a => a.type);

describe("weapon switching", () => {
  it("a shooter caught in melee draws the stowed blade and attacks with the second action", () => {
    const self = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [crossbow], stowedWeapons: [dagger], actionCount: 2});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 1}, footprint: [{i: 0, j: 1}]});
    const plan = planTurn(snapshot([self, foe]), "A", {graph: new FakeSquareGrid({map: ["AB"]})});
    expect(types(plan.actions)).toEqual(["switchWeapon", "meleeAttack"]);
    const sw = plan.actions[0] as Extract<Action, {type: "switchWeapon"}>;
    expect(sw).toMatchObject({weaponId: "dagger", equipIds: ["dagger"], unequipIds: ["xbow"], costsAction: true});
    expect((plan.actions[1] as Extract<Action, {type: "meleeAttack"}>).weaponId).toBe("dagger");
  });

  it("with a single action the switch alone is planned; Schnellziehen makes it free", () => {
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 1}, footprint: [{i: 0, j: 1}]});
    const slow = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [crossbow], stowedWeapons: [dagger], actionCount: 1});
    expect(types(planTurn(snapshot([slow, foe]), "A", {graph: new FakeSquareGrid({map: ["AB"]})}).actions)).toEqual(["switchWeapon", "wait"]);
    const quick = {...slow, hasQuickdraw: true};
    const plan = planTurn(snapshot([quick, foe]), "A", {graph: new FakeSquareGrid({map: ["AB"]})});
    expect(types(plan.actions)).toEqual(["switchWeapon", "meleeAttack"]);
    expect((plan.actions[0] as Extract<Action, {type: "switchWeapon"}>).costsAction).toBe(false);
  });

  it("keeps shooting when nothing better is stowed", () => {
    const self = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [crossbow], stowedWeapons: [], actionCount: 1});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 1}, footprint: [{i: 0, j: 1}]});
    expect(types(planTurn(snapshot([self, foe]), "A", {graph: new FakeSquareGrid({map: ["AB"]})}).actions)).toEqual(["rangedAttack"]);
  });

  it("a melee fighter readies the stowed bow when the target is out of reach for this turn", () => {
    const self = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [sword], stowedWeapons: [bow], speed: 2, actionCount: 2});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 9}, footprint: [{i: 0, j: 9}]});
    const grid = new FakeSquareGrid({map: ["A........B"], unitsPerCell: 1});
    const plan = planTurn(snapshot([self, foe]), "A", {graph: grid});
    expect(types(plan.actions)).toEqual(["switchWeapon", "rangedAttack"]);
    const near = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 3}, footprint: [{i: 0, j: 3}]});
    expect(types(planTurn(snapshot([{...self, speed: 10}, near]), "A", {graph: new FakeSquareGrid({map: ["A..B"], unitsPerCell: 1})}).actions)).toEqual(["move", "meleeAttack", "meleeAttack"]);
  });

  it("an archer with an empty quiver draws the stowed blade and closes in", () => {
    const empty = {...crossbow, ammoLeft: 0};
    const self = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [empty], stowedWeapons: [dagger], actionCount: 2, speed: 10});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 3}, footprint: [{i: 0, j: 3}]});
    const plan = planTurn(snapshot([self, foe]), "A", {graph: new FakeSquareGrid({map: ["A..B"]})});
    expect(types(plan.actions)).toEqual(["switchWeapon", "move", "meleeAttack"]);
    const adjacent = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 1}, footprint: [{i: 0, j: 1}]});
    expect(types(planTurn(snapshot([self, adjacent]), "A", {graph: new FakeSquareGrid({map: ["AB"]})}).actions)).toEqual(["switchWeapon", "meleeAttack"]);
    const stillLoaded = {...self, weapons: [{...crossbow, ammoLeft: 1}]};
    expect(types(planTurn(snapshot([stillLoaded, foe]), "A", {graph: new FakeSquareGrid({map: ["A..B"]})}).actions)).toEqual(["rangedAttack", "wait"]);
  });

  it("a two-handed weapon displaces sword and shield, a one-handed weapon keeps the shield", () => {
    const self = combatant({weapons: [sword, shield], stowedWeapons: [dagger]});
    const spear = weapon({itemId: "spear", name: "Speer (2H)", at: 13, pa: 7, worn: false, twoHanded: true});
    expect(switchTo(self, spear).action.unequipIds.sort()).toEqual(["shield", "sword"]);
    expect(switchTo(self, dagger).action.unequipIds).toEqual(["sword"]);
    expect(switchTo(self, dagger).weapons.map(w => w.itemId).sort()).toEqual(["dagger", "shield"]);
  });

  it("a GM-forced stowed weapon is drawn even when the worn one would do", () => {
    const self = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [sword], stowedWeapons: [dagger], actionCount: 2});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 1}, footprint: [{i: 0, j: 1}]});
    const plan = planTurn(snapshot([self, foe]), "A", {graph: new FakeSquareGrid({map: ["AB"]}), constraints: {weaponId: "dagger"}});
    expect(types(plan.actions)).toEqual(["switchWeapon", "meleeAttack"]);
    expect((plan.actions[1] as Extract<Action, {type: "meleeAttack"}>).weaponId).toBe("dagger");
  });
});
