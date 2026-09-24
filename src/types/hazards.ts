import type {GridPos} from "./snapshot";

/** How much a hazard matters to the planner. */
export type HazardSeverity = "avoid" | "forbidden";

/** Per-token attitude towards hazards. */
export type HazardCaution = "ignore" | "avoid" | "never";

export interface Hazard {
  /** Region or template document id. */
  id: string;
  kind: "region" | "template";
  name: string;
  severity: HazardSeverity;
  /** Expected damage per round for tokens inside (0 = unknown). */
  damagePerRound: number;
  source: "dsa5" | "manual";
  /** Grid spaces whose centers lie inside the zone. */
  cells: GridPos[];
}

export const HAZARD_SEVERITIES: readonly HazardSeverity[] = ["avoid", "forbidden"];
export const HAZARD_CAUTIONS: readonly HazardCaution[] = ["ignore", "avoid", "never"];
