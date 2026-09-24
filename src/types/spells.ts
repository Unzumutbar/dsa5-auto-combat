import type {HazardSeverity} from "./hazards";
import type {SpellRole} from "./plan";

export type SpellTargeting = "self" | "ally" | "enemy" | "area";

export interface SpellKnowledge {
  id: string;
  /** Item names (German/English variants) matched after normalization. */
  names: string[];
  kind: "spell" | "liturgy";
  role: SpellRole;
  target: SpellTargeting;
  /** Range in scene units when the item text cannot be parsed. */
  rangeHint?: number | "touch" | "self" | "sight";
  /** Active effect names indicating the buff/debuff is already active. */
  effectNames?: string[];
  /** Entry is a best guess and should be reviewed. */
  uncertain?: boolean;
  notes?: string;
  /** The spell leaves a harmful zone (DSA5 region) other tokens should stay out of. */
  hazard?: HazardSeverity;
  /** The spell raises a barrier the GM can draw as a wall (blocksSight = opaque). */
  wall?: {blocksSight: boolean};
}

export type SpellRangeSpec =
  | {kind: "self"}
  | {kind: "touch"}
  | {kind: "units"; units: number}
  | {kind: "sight"}
  | {kind: "unknown"; units: number};

export interface ResolvedSpell {
  itemId: string;
  name: string;
  type: "spell" | "liturgy" | "ritual" | "ceremony";
  role: SpellRole;
  target: SpellTargeting;
  source: "flag" | "knowledgeBase" | "heuristic";
  range: SpellRangeSpec;
  cost: number;
  costType: "AsP" | "KaP";
  castingTime: number;
  castingProgress: number;
  effectFormula: string;
  effectNames: string[];
  talentValue: number;
  attributes: number[];
  area: number | null;
}
