import {describe, expect, it} from "vitest";
import {archetypeIdFromName, BUILT_IN_ARCHETYPES, mergeArchetypes, migrateDispositionDefaults, sanitizeArchetype, sanitizeDispositionArchetypes} from "../../src/rules/archetypes";

describe("archetypes", () => {
  it("ships unique ids with 'standard' first", () => {
    const ids = BUILT_IN_ARCHETYPES.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("standard");
  });

  it("merges stored archetypes with missing built-ins and keeps edits to built-ins", () => {
    const stored = [
      {id: "coward", name: "", description: "", icon: "x", builtIn: true, overrides: {fleeThresholdPct: 75}},
      {id: "my-brute", name: "Schläger", description: "", icon: "fa-solid fa-hand-fist", builtIn: false, overrides: {profile: "aggressive"}}
    ];
    const merged = mergeArchetypes(stored, ["beast"]);
    expect(merged[0]!.id).toBe("standard");
    expect(merged.find(a => a.id === "coward")!.overrides.fleeThresholdPct).toBe(75);
    expect(merged.find(a => a.id === "my-brute")!.name).toBe("Schläger");
    expect(merged.some(a => a.id === "beast")).toBe(false);
    expect(merged.some(a => a.id === "killer")).toBe(true);
  });

  it("sanitizes broken entries", () => {
    expect(sanitizeArchetype({id: "Bad Id!", overrides: {}})).toBeNull();
    expect(sanitizeArchetype({id: "ok", builtIn: true, overrides: {level: "auto", nonsense: 1}})).toMatchObject({id: "ok", builtIn: false, overrides: {level: "auto"}});
    expect(sanitizeDispositionArchetypes({hostile: "killer", neutral: "missing"}, BUILT_IN_ARCHETYPES)).toMatchObject({hostile: "killer", neutral: "standard"});
  });

  it("derives unique ids from names", () => {
    expect(archetypeIdFromName("Mörderischer Nahkämpfer", BUILT_IN_ARCHETYPES)).toBe("morderischer-nahkampfer");
    expect(archetypeIdFromName("Killer", BUILT_IN_ARCHETYPES)).toBe("killer-2");
  });

  it("migrates legacy disposition defaults into custom archetypes", () => {
    const names = {hostile: "Migriert: Feindlich", friendly: "f", neutral: "n", secret: "s"};
    const result = migrateDispositionDefaults({hostile: {level: "auto", targetRule: "weakest"}, neutral: {}}, BUILT_IN_ARCHETYPES, names);
    const migrated = result.archetypes.find(a => a.id.startsWith("migriert-hostile"))!;
    expect(migrated.overrides).toEqual({level: "auto", targetRule: "weakest"});
    expect(migrated.builtIn).toBe(false);
    expect(result.dispositionArchetypes.hostile).toBe(migrated.id);
    expect(result.dispositionArchetypes.neutral).toBe("standard");
  });
});
