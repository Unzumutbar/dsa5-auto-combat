import {describe, expect, it} from "vitest";
import {decideDefense, effectiveDefense, type DefenseInput} from "../../src/rules/defense";

function input(overrides: Partial<DefenseInput> = {}): DefenseInput {
  return {
    dodgeValue: 6,
    parryOptions: [{itemId: "sword", name: "Schwert", pa: 9, isShield: false}, {itemId: "shield", name: "Schild", pa: 9, isShield: true}],
    defenseCount: 0,
    multipleDefenseValue: -3,
    inheritedMalus: 0,
    halfDefense: false,
    cannotDefend: false,
    attackKind: "melee",
    attackerAdjacent: true,
    settings: {declineHopelessDefense: false, dodgeOnlyVsRanged: false},
    ...overrides
  };
}

describe("defense decision", () => {
  it("prefers the shield when parry values tie and both beat dodging", () => {
    expect(decideDefense(input())).toEqual({kind: "parry", itemId: "shield", name: "Schild", effective: 9});
  });

  it("applies the multiple-defense malus and inherited attacker malus", () => {
    expect(effectiveDefense(9, input({defenseCount: 2}))).toBe(3);
    expect(effectiveDefense(9, input({inheritedMalus: -4}))).toBe(5);
    expect(effectiveDefense(9, input({halfDefense: true}))).toBe(4);
  });

  it("dodges when dodging is better", () => {
    const decision = decideDefense(input({dodgeValue: 12, parryOptions: [{itemId: "dagger", name: "Dolch", pa: 5, isShield: false}]}));
    expect(decision.kind).toBe("dodge");
  });

  it("only dodges against ranged attacks when configured, but still allows shields otherwise", () => {
    const ranged = input({attackKind: "ranged", settings: {declineHopelessDefense: false, dodgeOnlyVsRanged: true}});
    expect(decideDefense(ranged).kind).toBe("dodge");
    const permissive = input({attackKind: "ranged"});
    expect(decideDefense(permissive)).toMatchObject({kind: "parry", itemId: "shield"});
  });

  it("does not parry melee attackers that are out of reach", () => {
    expect(decideDefense(input({attackerAdjacent: false})).kind).toBe("dodge");
  });

  it("declines hopeless defenses only when the setting is on", () => {
    const hopeless = input({defenseCount: 4, dodgeValue: 3, parryOptions: [{itemId: "sword", name: "Schwert", pa: 4, isShield: false}]});
    expect(decideDefense(hopeless).kind).toBe("parry");
    expect(decideDefense({...hopeless, settings: {declineHopelessDefense: true, dodgeOnlyVsRanged: false}})).toEqual({kind: "none", reason: "hopeless"});
  });

  it("does nothing when the defender cannot act", () => {
    expect(decideDefense(input({cannotDefend: true}))).toEqual({kind: "none", reason: "cannotDefend"});
  });
});
