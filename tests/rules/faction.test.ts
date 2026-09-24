import {describe, expect, it} from "vitest";
import {isAlly, isEnemy, isPassiveDisposition} from "../../src/rules/faction";
import {combatant} from "../fixtures";

const player = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly"});
const hostile = combatant({tokenId: "orc", disposition: "hostile"});
const hostile2 = combatant({tokenId: "orc2", disposition: "hostile"});
const friendly = combatant({tokenId: "guard", disposition: "friendly"});
const neutral = combatant({tokenId: "merchant", disposition: "neutral"});
const secret = combatant({tokenId: "spy", disposition: "secret"});

describe("faction", () => {
  it("hostile NPCs fight players and friendly NPCs, not each other", () => {
    expect(isEnemy(hostile, player)).toBe(true);
    expect(isEnemy(hostile, friendly)).toBe(true);
    expect(isEnemy(hostile, hostile2)).toBe(false);
    expect(isEnemy(hostile, neutral)).toBe(false);
    expect(isAlly(hostile, hostile2)).toBe(true);
    expect(isAlly(hostile, player)).toBe(false);
  });

  it("friendly NPCs fight hostiles and protect the party", () => {
    expect(isEnemy(friendly, hostile)).toBe(true);
    expect(isEnemy(friendly, player)).toBe(false);
    expect(isEnemy(friendly, neutral)).toBe(false);
    expect(isAlly(friendly, player)).toBe(true);
    expect(isAlly(friendly, hostile)).toBe(false);
  });

  it("neutral and secret NPCs only fight whoever attacked them", () => {
    expect(isEnemy(neutral, player)).toBe(false);
    expect(isEnemy(neutral, hostile)).toBe(false);
    expect(isPassiveDisposition(neutral)).toBe(true);
    expect(isPassiveDisposition(secret)).toBe(true);
    const provoked = combatant({tokenId: "merchant", disposition: "neutral", grudges: ["pc"]});
    expect(isEnemy(provoked, player)).toBe(true);
    expect(isEnemy(provoked, hostile)).toBe(false);
    expect(isPassiveDisposition(provoked)).toBe(false);
  });

  it("never treats itself as enemy or ally", () => {
    expect(isEnemy(hostile, hostile)).toBe(false);
    expect(isAlly(hostile, hostile)).toBe(false);
  });
});
