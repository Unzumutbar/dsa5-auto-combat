import type {Archetype} from "../types/archetypes";
import type {
  Disposition, ResolvedTokenSettings, SettingSource, TokenAutomationOverrides, TokenAutomationSettings
} from "../types/settings";
import {BASE_DEFAULTS, DISPOSITION_DEFAULTS} from "./defaults";

export interface SettingsSources {
  disposition: Disposition;
  /** Archetype chosen by the token (or actor) flag; null = default archetype of the disposition. */
  archetypeId?: string | null;
  archetypes?: readonly Archetype[];
  dispositionArchetypes?: Partial<Record<Disposition, string>> | null;
  actorOverrides?: TokenAutomationOverrides | null;
  tokenOverrides?: TokenAutomationOverrides | null;
  /** Leader's group command for the current fight; wins over everything else. */
  commandOverrides?: TokenAutomationOverrides | null;
}

const LEVELS = new Set(["off", "preview", "auto"]);
const PROFILES = new Set(["aggressive", "balanced", "defensive", "support", "passive"]);
const TARGET_RULES = new Set(["nearest", "weakest", "highestThreat", "random"]);
const SPELL_PREFERENCES = new Set(["auto", "damageFirst", "controlFirst", "weaponsFirst"]);
const HAZARD_CAUTIONS = new Set(["ignore", "avoid", "never"]);
export const BOOLEAN_KEYS: (keyof TokenAutomationSettings)[] = [
  "useSpells", "useRanged", "keepDistance", "allowRunning", "fightWhileIncapacitated", "declineHopelessDefense", "dodgeOnlyVsRanged",
  "attackDowned", "holdPosition", "isLeader", "immuneToGroupMorale", "useManeuvers", "allowRetreat", "surrenderWhenOutnumbered", "blockEscape", "followLeader"
];
export const PERCENT_KEYS: (keyof TokenAutomationSettings)[] = ["fleeThresholdPct", "healThresholdPct", "surrenderThresholdPct"];

function percent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Drops unknown keys and values of the wrong type so corrupt flags never break planning. */
export function sanitizeOverrides(raw: unknown): TokenAutomationOverrides {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (typeof input.level === "string" && LEVELS.has(input.level)) result.level = input.level;
  if (typeof input.profile === "string" && PROFILES.has(input.profile)) result.profile = input.profile;
  if (typeof input.targetRule === "string" && TARGET_RULES.has(input.targetRule)) result.targetRule = input.targetRule;
  if (typeof input.preferSpells === "string" && SPELL_PREFERENCES.has(input.preferSpells)) result.preferSpells = input.preferSpells;
  if (typeof input.hazardCaution === "string" && HAZARD_CAUTIONS.has(input.hazardCaution)) result.hazardCaution = input.hazardCaution;
  for (const key of BOOLEAN_KEYS) if (typeof input[key] === "boolean") result[key] = input[key];
  for (const key of PERCENT_KEYS) {
    const value = percent(input[key]);
    if (value !== undefined) result[key] = value;
  }
  if (input.autoAdvanceTurn === null || typeof input.autoAdvanceTurn === "boolean") result.autoAdvanceTurn = input.autoAdvanceTurn;
  if (input.focusLimit === null) result.focusLimit = null;
  else if (typeof input.focusLimit === "number" && Number.isFinite(input.focusLimit)) result.focusLimit = Math.max(1, Math.round(input.focusLimit));
  if (input.protegeTokenId === null) result.protegeTokenId = null;
  else if (typeof input.protegeTokenId === "string" && input.protegeTokenId) result.protegeTokenId = input.protegeTokenId;
  return result as TokenAutomationOverrides;
}

export function resolveTokenSettingsWithSources(input: SettingsSources): ResolvedTokenSettings {
  const settings: TokenAutomationSettings = {...BASE_DEFAULTS};
  const sources = Object.fromEntries(
    Object.keys(BASE_DEFAULTS).map(key => [key, "base"])
  ) as Record<keyof TokenAutomationSettings, SettingSource>;
  const archetypes = input.archetypes ?? [];
  const wantedId = input.archetypeId ?? input.dispositionArchetypes?.[input.disposition] ?? null;
  const archetype = wantedId ? archetypes.find(a => a.id === wantedId) ?? null : null;
  const layers: [SettingSource, TokenAutomationOverrides | null | undefined][] = [
    ["disposition", DISPOSITION_DEFAULTS[input.disposition]],
    ["archetype", archetype?.overrides],
    ["actor", input.actorOverrides],
    ["token", input.tokenOverrides],
    ["command", input.commandOverrides]
  ];
  for (const [source, layer] of layers) {
    const clean = sanitizeOverrides(layer);
    for (const [key, value] of Object.entries(clean)) {
      (settings as unknown as Record<string, unknown>)[key] = value;
      sources[key as keyof TokenAutomationSettings] = source;
    }
  }
  return {settings, sources, archetypeId: archetype?.id ?? null};
}

export function resolveTokenSettings(input: SettingsSources): TokenAutomationSettings {
  return resolveTokenSettingsWithSources(input).settings;
}
