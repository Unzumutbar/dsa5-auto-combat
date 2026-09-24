import {describe, expect, it} from "vitest";
import {parseSpellRange, rangeAllows} from "../../src/rules/range-text";
import {expectedQualityStep, expectedValue} from "../../src/rules/spells/formula-ev";
import {lookupSpell, normalizeSpellName} from "../../src/rules/spells/knowledge-base";
import {resolveSpell} from "../../src/rules/spells/resolve-role";
import type {SpellSnapshot} from "../../src/types/snapshot";

function spell(overrides: Partial<SpellSnapshot> = {}): SpellSnapshot {
  return {
    itemId: "s1", name: "Ignifaxius", type: "spell", cost: 8, costType: "AsP", rangeText: "16 Schritt", castingTime: 1, castingProgress: 0,
    effectFormula: "2d6+QS", targetCategory: "Wesen", feature: "Elementar", talentValue: 10, attributes: [12, 12, 12], area: null, overrideRole: null, ...overrides
  };
}

describe("spell range parser", () => {
  it("understands the common DSA5 range texts", () => {
    expect(parseSpellRange("selbst", 8)).toEqual({kind: "self"});
    expect(parseSpellRange("Berührung", 8)).toEqual({kind: "touch"});
    expect(parseSpellRange("Sichtweite", 8)).toEqual({kind: "sight"});
    expect(parseSpellRange("16 Schritt", 8)).toEqual({kind: "units", units: 16});
    expect(parseSpellRange("4 yards", 8)).toEqual({kind: "units", units: 4});
    expect(parseSpellRange("", 8, 12)).toEqual({kind: "units", units: 12});
    expect(parseSpellRange("irgendwas", 8)).toEqual({kind: "unknown", units: 8});
  });

  it("checks whether a target is in range", () => {
    expect(rangeAllows({kind: "touch"}, 1, true, true)).toBe(true);
    expect(rangeAllows({kind: "touch"}, 3, false, true)).toBe(false);
    expect(rangeAllows({kind: "units", units: 8}, 7, false, true)).toBe(true);
    expect(rangeAllows({kind: "units", units: 8}, 7, false, false)).toBe(false);
    expect(rangeAllows({kind: "sight"}, 40, false, true)).toBe(true);
  });
});

describe("knowledge base", () => {
  it("matches names ignoring case, diacritics and variant suffixes", () => {
    expect(normalizeSpellName("Krötensprung (Variante)")).toBe("kroetensprung".replace("oe", "o"));
    expect(lookupSpell("IGNIFAXIUS")?.role).toBe("damage");
    expect(lookupSpell("Balsam Salabunde")?.role).toBe("heal");
    expect(lookupSpell("Armatrutz (Reversalis)")?.target).toBe("self");
    expect(lookupSpell("Heilsegen")?.kind).toBe("liturgy");
    expect(lookupSpell("Gänzlich Unbekannt")).toBeUndefined();
  });
});

describe("resolveSpell", () => {
  it("prefers the item flag, then the knowledge base, then the damage-formula heuristic", () => {
    expect(resolveSpell(spell({overrideRole: "control"}), 8)).toMatchObject({role: "control", target: "enemy", source: "flag"});
    expect(resolveSpell(spell(), 8)).toMatchObject({role: "damage", source: "knowledgeBase", range: {kind: "units", units: 16}});
    expect(resolveSpell(spell({name: "Feuerlanze", effectFormula: "1d6"}), 8)).toMatchObject({role: "damage", source: "heuristic"});
    expect(resolveSpell(spell({name: "Unbekannter Zauber", effectFormula: ""}), 8)).toBeNull();
  });

  it("never auto-casts excluded spells or rituals", () => {
    expect(resolveSpell(spell({overrideRole: "never"}), 8)).toBeNull();
    expect(resolveSpell(spell({type: "ritual"}), 8)).toBeNull();
  });

  it("turns ally spells with range 'self' into self buffs", () => {
    const armatrutz = resolveSpell(spell({name: "Armatrutz", effectFormula: "", rangeText: "selbst"}), 8)!;
    expect(armatrutz.target).toBe("self");
    expect(armatrutz.role).toBe("buff");
    expect(armatrutz.effectNames).toEqual(["Armatrutz"]);
  });
});

describe("formula expected value", () => {
  it("averages dice and substitutes the quality step", () => {
    expect(expectedValue("1d6+4", 2)).toBe(7.5);
    expect(expectedValue("2W6+QS", 3)).toBe(10);
    expect(expectedValue("QS*2", 4)).toBe(8);
    expect(expectedValue("(1d6+2)*2", 1)).toBe(11);
    expect(expectedValue("kaputt", 1)).toBe(0);
  });

  it("estimates the quality step from the skill value", () => {
    expect(expectedQualityStep(10)).toBe(4);
    expect(expectedQualityStep(1)).toBe(1);
    expect(expectedQualityStep(30)).toBe(6);
  });
});
