import type {GridPos, Point} from "../../types/snapshot";
import {cellKey, sameCell, type GridGraph} from "./grid-graph";
import {MinHeap} from "./heap";

export type GoalSpec =
  | {kind: "melee"; targetFootprint: GridPos[]; targetCenter: Point}
  | {kind: "ranged"; targetCenter: Point; minUnits: number; maxUnits: number}
  /** Any cell free of hazards (used to leave a zone); targetCenter only feeds the heuristic. */
  | {kind: "safe"; targetCenter: Point};

export interface PathQuery {
  start: GridPos;
  moverId: string;
  goal: GoalSpec;
  /** Maximum movement cost in scene units. */
  maxCost: number;
  /** Ids of tokens that never block (e.g. defeated ones when the world setting allows it). */
  passable?: string[];
  maxNodes?: number;
}

export interface PathResult {
  /** Anchor cells from start (inclusive) to end (inclusive). Length 1 = no movement needed. */
  path: GridPos[];
  distance: number;
  reachesGoal: boolean;
  explored: number;
}

interface Node {
  cell: GridPos;
  g: number;
  h: number;
  parent: Node | null;
}

const DEFAULT_MAX_NODES = 4000;

function occupied(graph: GridGraph, anchor: GridPos, moverId: string, passable: Set<string>): boolean {
  for (const space of graph.moverFootprint(anchor)) {
    const id = graph.occupant(space);
    if (id && id !== moverId && !passable.has(id)) return true;
  }
  return false;
}

export function isGoalCell(graph: GridGraph, goal: GoalSpec, anchor: GridPos): boolean {
  if (goal.kind === "safe") return !graph.hazardsAt || graph.hazardsAt(anchor).severity === null;
  if (goal.kind === "melee") {
    const footprint = graph.moverFootprint(anchor);
    return footprint.some(space => goal.targetFootprint.some(t => graph.isAdjacent(space, t))) && !goal.targetFootprint.every(t => graph.isSeparated(anchor, t));
  }
  const center = graph.moverCenter(anchor);
  const distance = graph.distanceUnits(center, goal.targetCenter);
  if (distance < goal.minUnits || distance > goal.maxUnits) return false;
  return graph.hasLineOfSight(center, goal.targetCenter);
}

function reconstruct(node: Node): GridPos[] {
  const path: GridPos[] = [];
  for (let n: Node | null = node; n; n = n.parent) path.push(n.cell);
  return path.reverse();
}

/**
 * A* over grid anchors with a hard movement budget. When the goal is unreachable within the budget the
 * closest explored cell (by heuristic) is returned as an approach move with `reachesGoal: false`.
 */
export function findPath(graph: GridGraph, query: PathQuery): PathResult {
  const passable = new Set(query.passable ?? []);
  const maxNodes = query.maxNodes ?? DEFAULT_MAX_NODES;
  const h = (cell: GridPos) => (query.goal.kind === "safe" ? 0 : graph.heuristic(graph.moverCenter(cell), query.goal.targetCenter));
  const start: Node = {cell: query.start, g: 0, h: h(query.start), parent: null};
  if (isGoalCell(graph, query.goal, query.start)) return {path: [query.start], distance: 0, reachesGoal: true, explored: 0};

  const open = new MinHeap<Node>();
  const best = new Map<string, number>([[cellKey(query.start), 0]]);
  const closed = new Set<string>();
  open.push(start, start.h);
  let approach = start;
  let explored = 0;

  while (open.size > 0 && explored < maxNodes) {
    const node = open.pop()!;
    const key = cellKey(node.cell);
    if (closed.has(key)) continue;
    closed.add(key);
    explored++;
    if (isGoalCell(graph, query.goal, node.cell)) {
      return {path: reconstruct(node), distance: node.g, reachesGoal: true, explored};
    }
    if (node.h < approach.h || (node.h === approach.h && node.g < approach.g)) approach = node;
    for (const next of graph.neighbors(node.cell)) {
      const nextKey = cellKey(next);
      if (closed.has(nextKey)) continue;
      if (graph.isBlocked(node.cell, next)) continue;
      if (occupied(graph, next, query.moverId, passable)) continue;
      const g = node.g + graph.stepCost(node.cell, next);
      if (g > query.maxCost + 1e-9) continue;
      const known = best.get(nextKey);
      if (known !== undefined && known <= g) continue;
      best.set(nextKey, g);
      const child: Node = {cell: next, g, h: h(next), parent: node};
      open.push(child, g + child.h);
    }
  }
  return {path: reconstruct(approach), distance: approach.g, reachesGoal: false, explored};
}

export interface BestCellQuery {
  start: GridPos;
  moverId: string;
  maxCost: number;
  passable?: string[];
  maxNodes?: number;
  /** Higher is better. Receives the mover center at the candidate anchor, the path cost and the anchor itself. */
  score: (center: Point, cost: number, cell: GridPos) => number;
}

/** Dijkstra within the budget; returns the reachable anchor with the best score (ties: shorter path). */
export function findBestCell(graph: GridGraph, query: BestCellQuery): PathResult {
  const passable = new Set(query.passable ?? []);
  const maxNodes = query.maxNodes ?? DEFAULT_MAX_NODES;
  const start: Node = {cell: query.start, g: 0, h: 0, parent: null};
  const open = new MinHeap<Node>();
  const best = new Map<string, number>([[cellKey(query.start), 0]]);
  const closed = new Set<string>();
  open.push(start, 0);
  let bestNode = start;
  let bestScore = query.score(graph.moverCenter(start.cell), 0, start.cell);
  let explored = 0;

  while (open.size > 0 && explored < maxNodes) {
    const node = open.pop()!;
    const key = cellKey(node.cell);
    if (closed.has(key)) continue;
    closed.add(key);
    explored++;
    const score = query.score(graph.moverCenter(node.cell), node.g, node.cell);
    if (score > bestScore || (score === bestScore && node.g < bestNode.g)) {
      bestScore = score;
      bestNode = node;
    }
    for (const next of graph.neighbors(node.cell)) {
      const nextKey = cellKey(next);
      if (closed.has(nextKey) || graph.isBlocked(node.cell, next) || occupied(graph, next, query.moverId, passable)) continue;
      const g = node.g + graph.stepCost(node.cell, next);
      if (g > query.maxCost + 1e-9) continue;
      const known = best.get(nextKey);
      if (known !== undefined && known <= g) continue;
      best.set(nextKey, g);
      open.push({cell: next, g, h: 0, parent: node}, g);
    }
  }
  return {path: reconstruct(bestNode), distance: bestNode.g, reachesGoal: !sameCell(bestNode.cell, query.start), explored};
}

/** Removes intermediate cells on straight runs so the movement ruler shows clean segments. */
export function simplifyPath(path: GridPos[]): GridPos[] {
  if (path.length <= 2) return path;
  const result: GridPos[] = [path[0]!];
  for (let k = 1; k < path.length - 1; k++) {
    const prev = path[k - 1]!;
    const cur = path[k]!;
    const next = path[k + 1]!;
    const sameDirection = cur.i - prev.i === next.i - cur.i && cur.j - prev.j === next.j - cur.j;
    if (!sameDirection) result.push(cur);
  }
  result.push(path[path.length - 1]!);
  return result;
}
