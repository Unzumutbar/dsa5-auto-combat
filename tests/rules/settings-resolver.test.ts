import {describe, expect, it} from "vitest";
import {BUILT_IN_ARCHETYPES} from "../../src/rules/archetypes";
import {BASE_DEFAULTS} from "../../src/rules/defaults";
import {dispositionFromValue} from "../../src/rules/disposition";
import {resolveTokenSettings, resolveTokenSettingsWithSources, sanitizeOverrides} from "../../src/rules/settings-resolver";

describe("settings resolver", () => {
  it("applies disposition defaults on top of the base defaults", () => {
    expect(resolveTokenSettings({disposition: "hostile"})).toEqual({...BASE_DEFAULTS, profile: "aggressive"});
    expect(resolveTokenSettings({disposition: "friendly"}).profile).toBe("support");
    expect(resolveTokenSettings({disposition: "neutral"}).profile).toBe("passive");
    expect(resolveTokenSettings({disposition: "secret"}).profile).toBe("passive");
  });

  it("layers archetype, actor and token overrides in that order", () => {
    const resolved = resolveTokenSettingsWithSources({
      disposition: "hostile",
      archetypeId: "coward",
      archetypes: BUILT_IN_ARCHETYPES,
      actorOverrides: {targetRule: "random", useSpells: false},
      tokenOverrides: {targetRule: "highestThreat"}
    });
    expect(resolved.archetypeId).toBe("coward");
    expect(resolved.settings.fleeThresholdPct).toBe(50);
    expect(resolved.sources.fleeThresholdPct).toBe("archetype");
    expect(resolved.settings.targetRule).toBe("highestThreat");
    expect(resolved.sources.targetRule).toBe("token");
    expect(resolved.settings.useSpells).toBe(false);
    expect(resolved.sources.useSpells).toBe("actor");
    expect(resolved.sources.profile).toBe("disposition");
    expect(resolved.sources.keepDistance).toBe("base");
  });

  it("falls back to the disposition's default archetype and ignores unknown ids", () => {
    const viaDisposition = resolveTokenSettingsWithSources({disposition: "hostile", archetypes: BUILT_IN_ARCHETYPES, dispositionArchetypes: {hostile: "killer"}});
    expect(viaDisposition.archetypeId).toBe("killer");
    expect(viaDisposition.settings.attackDowned).toBe(true);
    const unknown = resolveTokenSettingsWithSources({disposition: "hostile", archetypeId: "does-not-exist", archetypes: BUILT_IN_ARCHETYPES});
    expect(unknown.archetypeId).toBeNull();
    expect(unknown.settings.attackDowned).toBe(false);
  });

  it("ignores unknown keys and wrong types in stored overrides", () => {
    expect(sanitizeOverrides({level: "turbo", profile: 3, useRanged: "yes", fleeThresholdPct: 250, bogus: true, autoAdvanceTurn: null, focusLimit: 0.4, preferSpells: "damageFirst", protegeTokenId: ""}))
      .toEqual({fleeThresholdPct: 100, autoAdvanceTurn: null, focusLimit: 1, preferSpells: "damageFirst"});
    expect(sanitizeOverrides(null)).toEqual({});
    expect(sanitizeOverrides("x")).toEqual({});
    expect(sanitizeOverrides({healThresholdPct: 60, holdPosition: true, protegeTokenId: "abc"})).toEqual({healThresholdPct: 60, holdPosition: true, protegeTokenId: "abc"});
  });

  it("maps Foundry disposition constants", () => {
    expect(dispositionFromValue(-2)).toBe("secret");
    expect(dispositionFromValue(-1)).toBe("hostile");
    expect(dispositionFromValue(0)).toBe("neutral");
    expect(dispositionFromValue(1)).toBe("friendly");
    expect(dispositionFromValue(undefined)).toBe("neutral");
  });
});
