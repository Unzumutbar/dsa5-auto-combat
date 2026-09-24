import type {TokenAutomationOverrides} from "../types/settings";
import type {CombatSnapshot, CombatantSnapshot, Point} from "../types/snapshot";
import type {ActionBudget} from "./budget";
import {isAlly} from "./faction";
import {findBestCell, isGoalCell, type GoalSpec, type PathResult} from "./pathfinding/astar";
import type {GridGraph} from "./pathfinding/grid-graph";
import {isFighting} from "./surrender";
import {areAdjacent} from "./targeting";

/** Orders a leader can give to the whole faction for the rest of the fight. */
export type GroupCommand = "attack" | "retreat" | "defend";

export const GROUP_COMMANDS: readonly GroupCommand[] = ["attack", "retreat", "defend"];

/** Settings a command imposes on every member; applied as the last resolution layer. */
export const COMMAND_OVERRIDES: Record<GroupCommand, TokenAutomationOverrides> = {
  attack: {profile: "aggressive", holdPosition: false, allowRetreat: false, fleeThresholdPct: 0, surrenderThresholdPct: 0},
  retreat: {fleeThresholdPct: 100, surrenderThresholdPct: 0},
  defend: {profile: "defensive", holdPosition: true, allowRetreat: false}
};

/** Score bonus for the target the group's leader is fighting. */
export const LEADER_TARGET_BONUS = 25;

/** Alive leader of the faction (not self) and the target that leader currently pursues. */
export function leaderTarget(snapshot: CombatSnapshot, self: CombatantSnapshot): string | null {
  if (!self.settings.followLeader || self.settings.isLeader) return null;
  const leader = snapshot.combatants.find(o => o.tokenId !== self.tokenId && !o.isPlayerOwned && isAlly(self, o) && o.settings.isLeader && isFighting(o));
  return leader?.currentTargetTokenId ?? null;
}

const angleOf = (from: Point, to: Point) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/** Smallest angular separation (degrees, 0..180) between the candidate and any ally as seen from the target. */
export function encirclementAngle(candidate: Point, target: Point, allies: Point[]): number {
  if (allies.length === 0) return 0;
  const mine = angleOf(target, candidate);
  return Math.min(...allies.map(a => Math.abs(((mine - angleOf(target, a) + 540) % 360) - 180)));
}

export function centroid(points: Point[]): Point | null {
  if (points.length === 0) return null;
  return {x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length};
}

export interface ApproachCellInput {
  graph: GridGraph;
  snapshot: CombatSnapshot;
  self: CombatantSnapshot;
  target: CombatantSnapshot;
  budget: ActionBudget;
  passable: string[];
  blockEscape: boolean;
}

/**
 * Picks the melee position next to the target with the best tactical value: opposite to allies already
 * engaged (encirclement) and, for blockers, as far from the own faction as possible so the target's way
 * out is cut off. Returns null when the plain shortest path is good enough.
 */
export function chooseApproachCell(input: ApproachCellInput): PathResult | null {
  const {graph, snapshot, self, target, budget} = input;
  const engaged = snapshot.combatants.filter(o => o.tokenId !== self.tokenId && isAlly(self, o) && isFighting(o) && areAdjacent(snapshot, o.tokenId, target.tokenId));
  if (engaged.length === 0 && !input.blockEscape) return null;
  const goal: GoalSpec = {kind: "melee", targetFootprint: target.footprint, targetCenter: target.center};
  const allies = engaged.map(o => o.center);
  const faction = input.blockEscape
    ? centroid([self.center, ...snapshot.combatants.filter(o => o.tokenId !== self.tokenId && isAlly(self, o) && isFighting(o)).map(o => o.center)])
    : null;
  const maxCost = budget.freeMove + (budget.actions >= 2 ? budget.runMove : 0);
  const result = findBestCell(graph, {
    start: self.pos,
    moverId: self.tokenId,
    maxCost,
    passable: input.passable,
    score: (center, cost, cell) => {
      if (!isGoalCell(graph, goal, cell)) return -1e6 - cost;
      let score = 1000 - cost;
      score += encirclementAngle(center, target.center, allies) * 2;
      if (faction) score += graph.distanceUnits(center, faction) * 5;
      return score;
    }
  });
  const end = result.path[result.path.length - 1]!;
  return isGoalCell(graph, goal, end) ? result : null;
}
