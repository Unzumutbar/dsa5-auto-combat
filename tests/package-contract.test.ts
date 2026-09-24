import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import manifest from "../public/module.json";
import de from "../public/lang/de.json";
import en from "../public/lang/en.json";

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("module manifest", () => {
  it("has the stable module id and entry point", () => {
    expect(manifest.id).toBe("dsa5-auto-combat");
    expect(manifest.esmodules).toEqual(["dsa5-auto-combat.mjs"]);
    expect(manifest.compatibility.minimum).toBe("14");
  });

  it("requires the dsa5 system", () => {
    expect(manifest.relationships.systems.map(s => s.id)).toEqual(["dsa5"]);
  });

  it("ships every declared language file", () => {
    for (const language of manifest.languages) {
      expect(() => readFileSync(join(import.meta.dirname, "..", "public", language.path), "utf8")).not.toThrow();
    }
  });

  it("keeps de and en translations key-aligned", () => {
    expect(keys(en).sort()).toEqual(keys(de).sort());
  });

  it("matches the vite output file name", () => {
    const vite = readFileSync(join(import.meta.dirname, "..", "vite.config.ts"), "utf8");
    expect(vite).toContain(`"${manifest.esmodules[0]}"`);
  });
});
