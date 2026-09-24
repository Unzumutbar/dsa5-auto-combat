import type {Archetype} from "../types/archetypes";
import type {Disposition, TokenAutomationOverrides} from "../types/settings";
import {DEFAULT_ARCHETYPE_ID, DISPOSITION_ARCHETYPE_DEFAULTS} from "./defaults";
import {sanitizeOverrides} from "./settings-resolver";

function builtIn(id: string, icon: string, overrides: TokenAutomationOverrides): Archetype {
  return {id, name: "", description: "", icon, builtIn: true, overrides};
}

/** Shipped presets. Display names/descriptions live in the language files (Archetype.<id>.name/.description). */
export const BUILT_IN_ARCHETYPES: readonly Archetype[] = [
  builtIn(DEFAULT_ARCHETYPE_ID, "fa-solid fa-user", {}),
  builtIn("killer", "fa-solid fa-skull", {profile: "aggressive", attackDowned: true, fleeThresholdPct: 0, focusLimit: 99, useManeuvers: true, allowRetreat: false, immuneToGroupMorale: true}),
  builtIn("coward", "fa-solid fa-person-running", {targetRule: "weakest", fleeThresholdPct: 50, useManeuvers: false, surrenderThresholdPct: 35, surrenderWhenOutnumbered: true}),
  builtIn("archer", "fa-solid fa-bullseye", {useRanged: true, keepDistance: true, allowRetreat: true, preferSpells: "weaponsFirst"}),
  builtIn("beast", "fa-solid fa-paw", {profile: "aggressive", useSpells: false, allowRunning: true, attackDowned: false, useManeuvers: false, hazardCaution: "ignore"}),
  builtIn("battlemage", "fa-solid fa-fire", {preferSpells: "damageFirst", keepDistance: true, allowRetreat: true}),
  builtIn("supportmage", "fa-solid fa-hand-holding-medical", {profile: "support", preferSpells: "controlFirst", healThresholdPct: 60, keepDistance: true}),
  builtIn("controller", "fa-solid fa-hand-sparkles", {preferSpells: "controlFirst", keepDistance: true}),
  builtIn("guard", "fa-solid fa-shield-halved", {holdPosition: true, profile: "defensive", blockEscape: true}),
  builtIn("bodyguard", "fa-solid fa-user-shield", {profile: "defensive", blockEscape: true}),
  builtIn("leader", "fa-solid fa-crown", {isLeader: true, profile: "balanced"})
];

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function sanitizeArchetype(raw: unknown): Archetype | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) return null;
  return {
    id: input.id,
    name: typeof input.name === "string" ? input.name.slice(0, 80) : "",
    description: typeof input.description === "string" ? input.description.slice(0, 500) : "",
    icon: typeof input.icon === "string" && input.icon ? input.icon : "fa-solid fa-user",
    builtIn: Boolean(input.builtIn) && BUILT_IN_ARCHETYPES.some(b => b.id === input.id),
    overrides: sanitizeOverrides(input.overrides)
  };
}

/**
 * Stored archetypes plus any built-in ones that are missing (first run or after deletion the GM may
 * restore them via the editor; deletions are remembered in `hidden`). User edits to built-ins win.
 */
export function mergeArchetypes(stored: unknown, hidden: string[] = []): Archetype[] {
  const list = Array.isArray(stored) ? stored.map(sanitizeArchetype).filter((a): a is Archetype => a !== null) : [];
  const byId = new Map(list.map(a => [a.id, a]));
  for (const preset of BUILT_IN_ARCHETYPES) {
    if (!byId.has(preset.id) && !hidden.includes(preset.id)) byId.set(preset.id, {...preset, overrides: {...preset.overrides}});
  }
  const standard = byId.get(DEFAULT_ARCHETYPE_ID) ?? {...BUILT_IN_ARCHETYPES[0]!};
  byId.set(DEFAULT_ARCHETYPE_ID, standard);
  return [standard, ...Array.from(byId.values()).filter(a => a.id !== DEFAULT_ARCHETYPE_ID)];
}

export function findArchetype(list: readonly Archetype[], id: string | null | undefined): Archetype | null {
  if (!id) return null;
  return list.find(a => a.id === id) ?? null;
}

export function sanitizeDispositionArchetypes(raw: unknown, list: readonly Archetype[]): Record<Disposition, string> {
  const result: Record<Disposition, string> = {...DISPOSITION_ARCHETYPE_DEFAULTS};
  if (!raw || typeof raw !== "object") return result;
  for (const key of Object.keys(result) as Disposition[]) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && findArchetype(list, value)) result[key] = value;
  }
  return result;
}

/** Derives a unique id for a new custom archetype from its name. */
export function archetypeIdFromName(name: string, existing: readonly Archetype[]): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "archetyp";
  let id = base;
  for (let n = 2; existing.some(a => a.id === id); n++) id = `${base}-${n}`;
  return id;
}

/** One-time migration of the old per-disposition defaults into custom archetypes. */
export function migrateDispositionDefaults(old: unknown, list: readonly Archetype[], names: Record<Disposition, string>): {archetypes: Archetype[]; dispositionArchetypes: Record<Disposition, string>} {
  const archetypes = [...list];
  const dispositionArchetypes: Record<Disposition, string> = {...DISPOSITION_ARCHETYPE_DEFAULTS};
  if (!old || typeof old !== "object") return {archetypes, dispositionArchetypes};
  for (const disposition of Object.keys(dispositionArchetypes) as Disposition[]) {
    const overrides = sanitizeOverrides((old as Record<string, unknown>)[disposition]);
    if (Object.keys(overrides).length === 0) continue;
    const id = archetypeIdFromName(`migriert-${disposition}`, archetypes);
    archetypes.push({id, name: names[disposition], description: "", icon: "fa-solid fa-clock-rotate-left", builtIn: false, overrides});
    dispositionArchetypes[disposition] = id;
  }
  return {archetypes, dispositionArchetypes};
}
