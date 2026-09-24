import {describe, expect, it} from "vitest";
import {describeAction} from "../../src/rules/explain";

const names: Record<string, string> = {pc: "Alrik", orc: "Ork"};
const nameOf = (id: string | null) => (id ? names[id] ?? id : "Action.Self");

describe("explain", () => {
  it("nests the wait reason as its own entry so its parameters survive localization", () => {
    expect(describeAction({type: "wait", reasonKey: "Explain.Wait.notInReach", params: {distance: 15}}, nameOf)).toEqual({
      key: "Action.wait",
      params: {reason: {key: "Explain.Wait.notInReach", params: {distance: 15}}}
    });
  });

  it("resolves token names for attacks", () => {
    expect(describeAction({type: "meleeAttack", weaponId: "w1", weaponName: "Säbel", targetTokenId: "pc"}, nameOf)).toEqual({
      key: "Action.meleeAttack",
      params: {weapon: "Säbel", target: "Alrik"}
    });
    expect(describeAction({type: "rangedAttack", weaponId: "w2", weaponName: "Bogen", targetTokenId: "orc", band: 1}, nameOf).params).toMatchObject({band: "Action.Band.1"});
  });

  it("marks self-targeted spells", () => {
    const entry = describeAction({type: "castSpell", spellId: "s", spellName: "Armatrutz", role: "buff", targetTokenId: null, cost: 4, continueCasting: false}, nameOf);
    expect(entry.key).toBe("Action.castSpell");
    expect(entry.params).toMatchObject({target: "Action.Self", role: "Spell.Role.buff", cost: 4});
  });
});
