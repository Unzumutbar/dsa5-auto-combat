import {describe, expect, it} from "vitest";
import {chooseManeuver} from "../../src/rules/maneuvers";
import {attackOdds, d20Chance, estimateDefense, skillCheckChance} from "../../src/rules/odds";
import {combatant, weapon} from "../fixtures";

const wuchtschlag = {itemId: "ws", name: "Wuchtschlag", kind: "wuchtschlag" as const, maxStep: 3};
const finte = {itemId: "fi", name: "Finte", kind: "finte" as const, maxStep: 2};

describe("attack odds", () => {
  it("clamps the d20 chance between an automatic 1 and a failing 20", () => {
    expect(d20Chance(0)).toBe(0.05);
    expect(d20Chance(25)).toBe(0.95);
    expect(d20Chance(12)).toBe(0.6);
  });

  it("multiplies attack success with defense failure and subtracts armor", () => {
    const odds = attackOdds({attack: 12, defense: 8, defenseCount: 0, avgDamage: 7.5, armor: 2});
    expect(odds.hitChance).toBe(0.36);
    expect(odds.expectedDamage).toBe(2);
  });

  it("counts previous defenses and undefendable attacks", () => {
    expect(attackOdds({attack: 12, defense: 8, defenseCount: 2, avgDamage: 5, armor: 0}).hitChance).toBe(0.54);
    expect(attackOdds({attack: 12, defense: 8, defenseCount: 0, avgDamage: 5, armor: 0, canDefend: false}).hitChance).toBe(0.6);
    expect(attackOdds({attack: 12, defense: 8, defenseCount: 0, avgDamage: 3, armor: 5}).expectedDamage).toBe(0);
  });

  it("estimates melee and ranged defenses from the target", () => {
    const target = combatant({dodge: 6, weapons: [weapon({pa: 9}), weapon({pa: 11, isShield: true})]});
    expect(estimateDefense(target, "melee")).toBe(11);
    expect(estimateDefense(target, "ranged")).toBe(7);
    expect(estimateDefense(combatant({dodge: 8, weapons: [weapon({pa: 12})]}), "ranged")).toBe(4);
  });

  it("computes 3d20 skill checks exactly", () => {
    expect(skillCheckChance([20, 20, 20], 0)).toBe(0.993);
    expect(skillCheckChance([1, 1, 1], 0)).toBe(0.007);
    expect(skillCheckChance([12, 12, 12], 0)).toBeCloseTo(0.219, 2);
    expect(skillCheckChance([12, 12, 12], 6)).toBeGreaterThan(0.6);
    expect(skillCheckChance([12, 12, 12], 6, -3)).toBeLessThan(skillCheckChance([12, 12, 12], 6));
  });
});

describe("maneuvers by expected damage", () => {
  it("picks the Wuchtschlag step with the best expected damage", () => {
    expect(chooseManeuver({at: 16, targetDefense: 8, maneuvers: [wuchtschlag, finte], useManeuvers: true})).toMatchObject({kind: "wuchtschlag", step: 2, modifier: {value: -4, damageBonus: 4}});
    expect(chooseManeuver({at: 19, targetDefense: 8, maneuvers: [wuchtschlag], useManeuvers: true})!.step).toBe(3);
  });

  it("values Wuchtschlag higher against heavy armor", () => {
    expect(chooseManeuver({at: 16, targetDefense: 8, maneuvers: [wuchtschlag], useManeuvers: true, armor: 6})!.step).toBe(3);
  });

  it("uses Finte against strong defenders and skips it without a gain", () => {
    expect(chooseManeuver({at: 14, targetDefense: 14, maneuvers: [finte], useManeuvers: true})).toMatchObject({kind: "finte", step: 2, modifier: {value: -2, dmmalus: -2}});
    expect(chooseManeuver({at: 13, targetDefense: 8, maneuvers: [finte], useManeuvers: true})).toBeNull();
  });

  it("never gambles when disabled, without abilities or with a hopeless attack value", () => {
    expect(chooseManeuver({at: 20, targetDefense: 8, maneuvers: [wuchtschlag], useManeuvers: false})).toBeNull();
    expect(chooseManeuver({at: 20, targetDefense: 8, maneuvers: [], useManeuvers: true})).toBeNull();
    expect(chooseManeuver({at: 2, targetDefense: 8, maneuvers: [wuchtschlag], useManeuvers: true})).toBeNull();
  });
});
