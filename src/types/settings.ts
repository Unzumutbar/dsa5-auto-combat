import type {HazardCaution} from "./hazards";

export type Disposition = "hostile" | "neutral" | "friendly" | "secret";
export type AutomationLevel = "off" | "preview" | "auto";
export type BehaviourProfile = "aggressive" | "balanced" | "defensive" | "support" | "passive";
export type TargetRule = "nearest" | "weakest" | "highestThreat" | "random";
export type SpellPreference = "auto" | "damageFirst" | "controlFirst" | "weaponsFirst";
export type DamageApplication = "npcOnly" | "everyone" | "never";
export type AdvanceTurnRule = "never" | "autoOnly" | "always";

export interface TokenAutomationSettings {
  level: AutomationLevel;
  profile: BehaviourProfile;
  targetRule: TargetRule;
  useSpells: boolean;
  useRanged: boolean;
  keepDistance: boolean;
  allowRunning: boolean;
  fleeThresholdPct: number;
  fightWhileIncapacitated: boolean;
  declineHopelessDefense: boolean;
  dodgeOnlyVsRanged: boolean;
  autoAdvanceTurn: boolean | null;
  /** Keeps attacking targets that are already down (incapacitated/defeated). */
  attackDowned: boolean;
  /** Heals allies below this LeP percentage. */
  healThresholdPct: number;
  preferSpells: SpellPreference;
  /** Never moves towards enemies; only acts on what comes into reach. */
  holdPosition: boolean;
  /** Token id of a protégé to stay next to (token level only). */
  protegeTokenId: string | null;
  isLeader: boolean;
  immuneToGroupMorale: boolean;
  /** Max. automated attackers per target; null = world setting. */
  focusLimit: number | null;
  useManeuvers: boolean;
  /** May leave melee voluntarily (keep distance / firing position), accepting attacks of opportunity. */
  allowRetreat: boolean;
  /** Attitude towards hazardous zones: walk through, prefer to avoid, never enter. */
  hazardCaution: HazardCaution;
  /** Gives up at or below this LeP percentage when fleeing is pointless (0 = never). */
  surrenderThresholdPct: number;
  /** Being outnumbered two to one counts as a reason to surrender. */
  surrenderWhenOutnumbered: boolean;
  /** Takes the position that cuts off the target's way out (away from the own faction). */
  blockEscape: boolean;
  /** Prefers the target of the group's leader. */
  followLeader: boolean;
}

export type TokenAutomationOverrides = Partial<TokenAutomationSettings>;

export type SettingSource = "base" | "disposition" | "archetype" | "actor" | "token" | "command";

export interface ResolvedTokenSettings {
  settings: TokenAutomationSettings;
  sources: Record<keyof TokenAutomationSettings, SettingSource>;
  /** Archetype that was applied, if any. */
  archetypeId: string | null;
}

export interface WorldSettings {
  enabled: boolean;
  damageApplication: DamageApplication;
  advanceTurn: AdvanceTurnRule;
  autoInitiative: boolean;
  defaultSpellRangeSteps: number;
  deadTokensBlock: boolean;
  focusLimit: number;
  showPathPreview: boolean;
  showOdds: boolean;
  dispositionArchetypes: Record<Disposition, string>;
  /** Surrendered combatants are skipped in the turn order. */
  skipSurrendered: boolean;
  /** Public chat text when a surrender is announced ({name}). */
  surrenderText: string;
  debug: boolean;
}
