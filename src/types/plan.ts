import type {ManeuverModifier} from "../rules/maneuvers";
import type {AttackOdds} from "../rules/odds";
import type {Point} from "./snapshot";

export type SpellRole = "damage" | "heal" | "buff" | "debuff" | "control";
export type MoveReason = "approach" | "flee" | "keepDistance" | "leaveHazard";

export type Action =
  | {type: "move"; waypoints: Point[]; distance: number; reason: MoveReason; costsAction: boolean; action: string; provokes: string[]; hazards: string[]}
  | {type: "meleeAttack"; weaponId: string; weaponName: string; targetTokenId: string; maneuver?: {name: string; step: number; modifier: ManeuverModifier}; odds?: AttackOdds}
  | {type: "rangedAttack"; weaponId: string; weaponName: string; targetTokenId: string; band: 0 | 1 | 2; odds?: AttackOdds}
  | {type: "reload"; weaponId: string; weaponName: string}
  | {type: "switchWeapon"; weaponId: string; weaponName: string; equipIds: string[]; unequipIds: string[]; costsAction: boolean}
  | {type: "castSpell"; spellId: string; spellName: string; role: SpellRole; targetTokenId: string | null; cost: number; continueCasting: boolean; steps?: number; odds?: {successChance: number}}
  | {type: "surrender"; reasonKey: string}
  | {type: "wait"; reasonKey: string; params?: Record<string, string | number>};

export type ExplainParam = string | number | ExplainEntry;

export interface ExplainEntry {
  key: string;
  params?: Record<string, ExplainParam>;
}

export interface TargetCandidate {
  tokenId: string;
  name: string;
  score: number;
  distance: number;
  reachable: boolean;
  sticky: boolean;
  /** Already attacked by as many allies as the focus limit allows. */
  crowded: boolean;
  /** Attacks or stands next to the protégé of the planning token. */
  threatensProtege: boolean;
  reasons: string[];
}

export type PlanMode = "fight" | "flee" | "surrender" | "passive" | "skip";

export interface TurnPlan {
  combatId: string;
  combatantId: string;
  tokenId: string;
  round: number;
  turn: number;
  mode: PlanMode;
  targetTokenId: string | null;
  actions: Action[];
  candidates: TargetCandidate[];
  candidateIndex: number;
  explanation: ExplainEntry[];
  warnings: ExplainEntry[];
  /** Spell whose preparation this plan gives up (progress must be reset). */
  abortedCasting?: string;
}
