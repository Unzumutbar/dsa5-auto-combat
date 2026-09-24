import type {Disposition, TokenAutomationOverrides, TokenAutomationSettings, WorldSettings} from "../types/settings";

export const BASE_DEFAULTS: TokenAutomationSettings = {
  level: "preview",
  profile: "balanced",
  targetRule: "nearest",
  useSpells: true,
  useRanged: true,
  keepDistance: true,
  allowRunning: true,
  fleeThresholdPct: 0,
  fightWhileIncapacitated: false,
  declineHopelessDefense: false,
  dodgeOnlyVsRanged: false,
  autoAdvanceTurn: null,
  attackDowned: false,
  healThresholdPct: 40,
  preferSpells: "auto",
  holdPosition: false,
  protegeTokenId: null,
  isLeader: false,
  immuneToGroupMorale: false,
  focusLimit: null,
  useManeuvers: true,
  allowRetreat: true,
  hazardCaution: "avoid",
  surrenderThresholdPct: 0,
  surrenderWhenOutnumbered: false,
  blockEscape: false,
  followLeader: true
};

export const DISPOSITION_DEFAULTS: Record<Disposition, TokenAutomationOverrides> = {
  hostile: {profile: "aggressive"},
  friendly: {profile: "support"},
  neutral: {profile: "passive"},
  secret: {profile: "passive"}
};

export const DEFAULT_ARCHETYPE_ID = "standard";

export const DISPOSITION_ARCHETYPE_DEFAULTS: Record<Disposition, string> = {
  hostile: DEFAULT_ARCHETYPE_ID,
  friendly: DEFAULT_ARCHETYPE_ID,
  neutral: DEFAULT_ARCHETYPE_ID,
  secret: DEFAULT_ARCHETYPE_ID
};

export const WORLD_DEFAULTS: WorldSettings = {
  enabled: true,
  damageApplication: "npcOnly",
  advanceTurn: "autoOnly",
  autoInitiative: true,
  defaultSpellRangeSteps: 8,
  deadTokensBlock: false,
  focusLimit: 2,
  showPathPreview: true,
  showOdds: true,
  dispositionArchetypes: {...DISPOSITION_ARCHETYPE_DEFAULTS},
  skipSurrendered: true,
  surrenderText: "{name} wirft die Waffen nieder und ergibt sich.",
  debug: false
};
