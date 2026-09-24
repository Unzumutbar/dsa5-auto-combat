import {describe, expect, it} from "vitest";
import {bandFor, bestRangedWeapon, isLoaded} from "../../src/rules/range-bands";
import {weapon} from "../fixtures";

const bow = weapon({itemId: "bow", name: "Kurzbogen", kind: "ranged", at: 12, rangeBands: [10, 50, 80], ammoLeft: 5, loadTime: 1, loadProgress: 1});
const crossbow = weapon({itemId: "xbow", name: "Armbrust", kind: "ranged", at: 14, rangeBands: [20, 100, 160], ammoLeft: 3, loadTime: 8, loadProgress: 0});
const spit = weapon({itemId: "spit", name: "Speichel", kind: "trait-ranged", at: 10, rangeBands: [5, 10, 15], ammoLeft: null, loadTime: 0, loadProgress: 0});

describe("range bands", () => {
  it("maps distances to short/medium/long and rejects out-of-range targets", () => {
    expect(bandFor(10, [10, 50, 80])).toBe(0);
    expect(bandFor(11, [10, 50, 80])).toBe(1);
    expect(bandFor(80, [10, 50, 80])).toBe(2);
    expect(bandFor(81, [10, 50, 80])).toBeNull();
  });

  it("prefers loaded weapons, then the best expected attack value", () => {
    const choice = bestRangedWeapon([bow, crossbow], 30)!;
    expect(choice.weapon.itemId).toBe("bow");
    expect(choice.band).toBe(1);
    expect(choice.expectedAttack).toBe(12);
    expect(bestRangedWeapon([crossbow], 30)!.loaded).toBe(false);
  });

  it("ignores weapons without ammunition and applies the short-range bonus", () => {
    const empty = weapon({...bow, itemId: "empty", ammoLeft: 0});
    expect(bestRangedWeapon([empty], 5)).toBeNull();
    expect(bestRangedWeapon([bow], 5)!.expectedAttack).toBe(14);
  });

  it("treats creature attacks without ammo tracking or load time as always ready", () => {
    expect(isLoaded(spit)).toBe(true);
    expect(bestRangedWeapon([spit], 12)!.band).toBe(2);
    expect(bestRangedWeapon([spit], 16)).toBeNull();
  });
});
