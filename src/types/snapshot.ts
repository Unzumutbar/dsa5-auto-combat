import type {Hazard} from "./hazards";
import type {Disposition, TokenAutomationSettings} from "./settings";

export interface GridPos {
  i: number;
  j: number;
}

export interface Point {
  x: number;
  y: number;
}

export type GridType = "square" | "hex" | "gridless";
export type WeaponKind = "melee" | "ranged" | "trait-melee" | "trait-ranged" | "weaponless";
export type MeleeReach = "short" | "medium" | "long";

export interface WeaponSnapshot {
  itemId: string;
  name: string;
  kind: WeaponKind;
  at: number;
  pa: number;
  reach: MeleeReach;
  /** Range bands in scene units (short/medium/long), ranged weapons only. */
  rangeBands: [number, number, number] | null;
  /** null = unlimited / not tracked. */
  ammoLeft: number | null;
  loadProgress: number;
  loadTime: number;
  damage: string;
  isShield: boolean;
  /** Currently wielded (system.worn.value); traits and brawling always count as worn. */
  worn: boolean;
  /** Needs both hands (DSA5 "(2H)" or wielded two-handed; ranged weapons always). */
  twoHanded: boolean;
}

export type SpellType = "spell" | "liturgy" | "ritual" | "ceremony";

export interface SpellSnapshot {
  itemId: string;
  name: string;
  type: SpellType;
  cost: number;
  costType: "AsP" | "KaP";
  rangeText: string;
  castingTime: number;
  castingProgress: number;
  effectFormula: string;
  targetCategory: string;
  feature: string;
  talentValue: number;
  /** Values of the three check attributes (for the 3d20 success estimate). */
  attributes: number[];
  /** Radius/size of an area spell in scene units (DSA5 target type + value), null for single targets. */
  area: number | null;
  overrideRole: string | null;
}

export interface ManeuverSnapshot {
  itemId: string;
  name: string;
  kind: "wuchtschlag" | "finte";
  maxStep: number;
}

/** Spell prepared over several turns (token flag). */
export interface CastingState {
  spellId: string;
  targetTokenId: string | null;
  startedRound: number;
  painAtStart: number;
}

export interface RoundState {
  actionsUsed: number;
  freeActionUsed: boolean;
  defenseCount: number;
  movementActionConsumed: boolean;
}

export interface Resource {
  value: number;
  max: number;
}

export interface CombatantSnapshot {
  combatantId: string;
  tokenId: string;
  actorId: string;
  name: string;
  isPlayerOwned: boolean;
  disposition: Disposition;
  defeated: boolean;
  /** Has given up (module condition "Ergeben"). */
  surrendered: boolean;
  hidden: boolean;
  /** Top-left occupied grid space (anchor used by the path search). */
  pos: GridPos;
  footprint: GridPos[];
  center: Point;
  sizeCells: number;
  /** DSA5 size category: tiny | small | average | big | giant. */
  size: string;
  elevation: number;
  lep: Resource;
  asp: Resource;
  kap: Resource;
  /** Foundry movement action (walk, fly, swim, crawl, ...). */
  movementAction: string;
  /** Speed in scene units for the current movement action. */
  speed: number;
  dodge: number;
  /** Total armor protection (RS) of the actor. */
  armor: number;
  conditions: Record<string, number>;
  pain: number;
  actionCount: number;
  bonusActions: number;
  round: RoundState;
  /** Wielded weapons only. */
  weapons: WeaponSnapshot[];
  /** Carried but not wielded melee/ranged weapons (candidates for a weapon switch). */
  stowedWeapons: WeaponSnapshot[];
  /** Special ability Schnellziehen: drawing a weapon is a free action. */
  hasQuickdraw: boolean;
  /** Spell currently being prepared, if any. */
  casting: CastingState | null;
  /** Ids of hazards (regions/templates) the token currently stands in. */
  inHazardIds: string[];
  spells: SpellSnapshot[];
  maneuvers: ManeuverSnapshot[];
  activeEffectNames: string[];
  /** Spell item ids of buffs already cast during this combat (token flag). */
  buffsCast: string[];
  settings: TokenAutomationSettings;
  grudges: string[];
  currentTargetTokenId: string | null;
}

export type PairMatrix<T> = Record<string, Record<string, T>>;

export interface CombatSnapshot {
  combatId: string;
  round: number;
  turn: number;
  sceneId: string;
  gridType: GridType;
  /** Pixels per grid space. */
  gridSize: number;
  gridDistance: number;
  gridUnits: string;
  combatants: CombatantSnapshot[];
  /** Center-to-center distance in scene units including elevation difference. */
  distances: PairMatrix<number>;
  /** Unobstructed sight line between token centers. */
  los: PairMatrix<boolean>;
  /** Footprints touch (melee adjacency). */
  adjacent: PairMatrix<boolean>;
  /** Hazardous zones on the scene. */
  hazards: Hazard[];
}
