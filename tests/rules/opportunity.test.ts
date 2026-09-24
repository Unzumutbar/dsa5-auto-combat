import {describe, expect, it} from "vitest";
import {canOpportunityAttack, detectProvoked} from "../../src/rules/opportunity";
import {combatant, snapshot, weapon} from "../fixtures";

const pc = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 0}});
const orc = combatant({tokenId: "orc", disposition: "hostile", pos: {i: 0, j: 1}});
const orc2 = combatant({tokenId: "orc2", disposition: "hostile", pos: {i: 1, j: 0}});
const friend = combatant({tokenId: "guard", disposition: "friendly", pos: {i: 1, j: 1}});

describe("Passierschlag detection", () => {
  it("grants adjacent enemies an attack when the mover leaves their reach", () => {
    const snap = snapshot([pc, orc, orc2, friend]);
    const provoked = detectProvoked(snap, "pc", {orc: true, orc2: true, guard: true}, {orc: false, orc2: true, guard: false});
    expect(provoked).toEqual(["orc"]);
  });

  it("ignores enemies that could not act or have no melee weapon", () => {
    const stunned = combatant({...orc, tokenId: "orc", conditions: {incapacitated: 1}});
    const archer = combatant({...orc2, tokenId: "orc2", weapons: [weapon({kind: "ranged", rangeBands: [10, 50, 80]})]});
    const snap = snapshot([pc, stunned, archer]);
    expect(detectProvoked(snap, "pc", {orc: true, orc2: true}, {orc: false, orc2: false})).toEqual([]);
    expect(canOpportunityAttack(stunned)).toBe(false);
    expect(canOpportunityAttack(archer)).toBe(false);
    expect(canOpportunityAttack(orc)).toBe(true);
  });

  it("does nothing when the mover stays adjacent or was never adjacent", () => {
    const snap = snapshot([pc, orc]);
    expect(detectProvoked(snap, "pc", {orc: true}, {orc: true})).toEqual([]);
    expect(detectProvoked(snap, "pc", {orc: false}, {orc: false})).toEqual([]);
  });

  it("works in both directions: NPC leaving a player's reach provokes the player", () => {
    const snap = snapshot([pc, orc]);
    expect(detectProvoked(snap, "orc", {pc: true}, {pc: false})).toEqual(["pc"]);
  });
});
