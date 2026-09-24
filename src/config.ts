export const MODULE_ID = "dsa5-auto-combat";
export const I18N_PREFIX = "DSAAUTOCOMBAT";

export const FLAGS = {
  automation: "automation",
  grudges: "grudges",
  currentTarget: "currentTarget",
  casting: "casting",
  moraleState: "moraleState",
  spellRole: "role",
  preview: "preview",
  autoDefense: "autoDefense",
  buffsCast: "buffsCast",
  archetype: "archetype",
  opportunity: "opportunity",
  hazard: "hazard",
  spellHazard: "hazard",
  spellWall: "wall",
  magicWall: "magicWall",
  surrender: "surrender",
  surrenderCard: "surrenderCard",
  command: "command"
} as const;

export const SETTINGS = {
  enabled: "enabled",
  damageApplication: "damageApplication",
  advanceTurn: "advanceTurn",
  autoInitiative: "autoInitiative",
  defaultSpellRangeSteps: "defaultSpellRangeSteps",
  deadTokensBlock: "deadTokensBlock",
  dispositionDefaults: "dispositionDefaults",
  archetypes: "archetypes",
  hiddenArchetypes: "hiddenArchetypes",
  dispositionArchetypes: "dispositionArchetypes",
  focusLimit: "focusLimit",
  showPathPreview: "showPathPreview",
  showOdds: "showOdds",
  skipSurrendered: "skipSurrendered",
  surrenderText: "surrenderText",
  debug: "debug"
} as const;

export type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

export function localize(key: string, data?: Record<string, unknown>): string {
  const full = key.startsWith(I18N_PREFIX) ? key : `${I18N_PREFIX}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}
