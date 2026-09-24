import {localize} from "../config";
import type {ResolvedTokenSettings, TokenAutomationOverrides, TokenAutomationSettings} from "../types/settings";

export type FieldKind = "enum" | "bool" | "percent" | "focus" | "advance";

export interface FieldDef {
  key: keyof TokenAutomationSettings;
  kind: FieldKind;
  /** Localization prefix for enum values (e.g. "Profile"). */
  prefix?: string;
  values?: string[];
  /** Only meaningful on a placed token (never on archetypes/actors). */
  tokenOnly?: boolean;
  /** Extra hint below the field. */
  hint?: string;
}

export interface FieldOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface FieldView {
  key: string;
  label: string;
  tooltip: string;
  effective: string;
  options: FieldOption[] | null;
  value: string | number | "";
  hint: string;
  isSelect: boolean;
  isNumber: boolean;
  min: number;
  max: number;
}

export const FIELD_TABS: Record<"combat" | "magic" | "morale", FieldDef[]> = {
  combat: [
    {key: "profile", kind: "enum", prefix: "Profile", values: ["aggressive", "balanced", "defensive", "support", "passive"]},
    {key: "targetRule", kind: "enum", prefix: "TargetRule", values: ["nearest", "weakest", "highestThreat", "random"]},
    {key: "focusLimit", kind: "focus"},
    {key: "useManeuvers", kind: "bool"},
    {key: "allowRunning", kind: "bool"},
    {key: "holdPosition", kind: "bool"},
    {key: "allowRetreat", kind: "bool"},
    {key: "hazardCaution", kind: "enum", prefix: "HazardCaution", values: ["ignore", "avoid", "never"]},
    {key: "blockEscape", kind: "bool"}
  ],
  magic: [
    {key: "useSpells", kind: "bool"},
    {key: "preferSpells", kind: "enum", prefix: "SpellPreference", values: ["auto", "damageFirst", "controlFirst", "weaponsFirst"]},
    {key: "healThresholdPct", kind: "percent"},
    {key: "useRanged", kind: "bool"},
    {key: "keepDistance", kind: "bool"},
    {key: "dodgeOnlyVsRanged", kind: "bool"}
  ],
  morale: [
    {key: "fleeThresholdPct", kind: "percent", hint: "Config.FleeThresholdHint"},
    {key: "surrenderThresholdPct", kind: "percent", hint: "Config.SurrenderThresholdHint"},
    {key: "surrenderWhenOutnumbered", kind: "bool"},
    {key: "isLeader", kind: "bool"},
    {key: "followLeader", kind: "bool"},
    {key: "immuneToGroupMorale", kind: "bool"},
    {key: "attackDowned", kind: "bool"},
    {key: "fightWhileIncapacitated", kind: "bool"},
    {key: "declineHopelessDefense", kind: "bool"},
    {key: "autoAdvanceTurn", kind: "advance"}
  ]
};

export function fieldLabelKey(key: string): string {
  return `Config.${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function formatValue(def: FieldDef, value: unknown): string {
  switch (def.kind) {
    case "enum":
      return localize(`${def.prefix}.${value}`);
    case "bool":
      return localize(value ? "Config.Yes" : "Config.No");
    case "percent":
      return `${value} %`;
    case "focus":
      return value === null || value === undefined ? localize("Config.WorldDefault") : String(value);
    case "advance":
      return value === null || value === undefined ? localize("Config.AutoAdvance.default") : localize(value ? "Config.AutoAdvance.yes" : "Config.AutoAdvance.no");
  }
}

/**
 * Builds the view model for one field: the stored override (or "default") plus the effective value with
 * its source as tooltip. `resolved` may be null when editing an archetype (no effective value).
 */
export function fieldView(def: FieldDef, stored: TokenAutomationOverrides, resolved: ResolvedTokenSettings | null): FieldView {
  const storedValue = stored[def.key];
  const hasStored = storedValue !== undefined;
  const effective = resolved ? formatValue(def, resolved.settings[def.key]) : "";
  const tooltip = resolved ? localize("Config.Effective", {value: effective, source: localize(`Config.Source.${resolved.sources[def.key]}`)}) : "";
  const defaultLabel = resolved ? localize("Config.DefaultWith", {value: effective}) : localize("Config.Default");
  const view: FieldView = {
    key: def.key,
    label: localize(fieldLabelKey(def.key)),
    tooltip,
    effective,
    options: null,
    value: "",
    hint: def.hint ? localize(def.hint) : "",
    isSelect: false,
    isNumber: false,
    min: 0,
    max: 100
  };
  switch (def.kind) {
    case "enum":
      view.isSelect = true;
      view.options = [
        {value: "", label: defaultLabel, selected: !hasStored},
        ...def.values!.map(v => ({value: v, label: localize(`${def.prefix}.${v}`), selected: storedValue === v}))
      ];
      break;
    case "bool":
      view.isSelect = true;
      view.options = [
        {value: "", label: defaultLabel, selected: !hasStored},
        {value: "true", label: localize("Config.Yes"), selected: storedValue === true},
        {value: "false", label: localize("Config.No"), selected: storedValue === false}
      ];
      break;
    case "advance":
      view.isSelect = true;
      view.options = [
        {value: "", label: defaultLabel, selected: !hasStored || storedValue === null},
        {value: "true", label: localize("Config.AutoAdvance.yes"), selected: storedValue === true},
        {value: "false", label: localize("Config.AutoAdvance.no"), selected: storedValue === false}
      ];
      break;
    case "percent":
      view.isNumber = true;
      view.value = hasStored ? (storedValue as number) : "";
      break;
    case "focus":
      view.isNumber = true;
      view.min = 1;
      view.max = 99;
      view.value = hasStored && storedValue !== null ? (storedValue as number) : "";
      break;
  }
  return view;
}

/** Parses submitted form values (strings) back into overrides; empty strings mean "default". */
export function parseFields(defs: FieldDef[], data: Record<string, unknown>, prefix = ""): TokenAutomationOverrides {
  const overrides: Record<string, unknown> = {};
  for (const def of defs) {
    const raw = data[`${prefix}${def.key}`];
    if (raw === undefined || raw === null || raw === "") continue;
    switch (def.kind) {
      case "enum":
        overrides[def.key] = String(raw);
        break;
      case "bool":
      case "advance":
        if (raw === "true" || raw === true) overrides[def.key] = true;
        else if (raw === "false" || raw === false) overrides[def.key] = false;
        break;
      case "percent":
      case "focus":
        if (Number.isFinite(Number(raw))) overrides[def.key] = Number(raw);
        break;
    }
  }
  return overrides as TokenAutomationOverrides;
}

export const ALL_FIELDS: FieldDef[] = [...FIELD_TABS.combat, ...FIELD_TABS.magic, ...FIELD_TABS.morale];
