import {describe, expect, it} from "vitest";
import {findPath, isGoalCell} from "../../src/rules/pathfinding/astar";
import {planTurn} from "../../src/rules/planner";
import {combatant, snapshot} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};

function arena(map: string[], edges: string[], ids: Record<string, Parameters<typeof combatant>[0]>) {
  const grid = new FakeSquareGrid({map, edges});
  const combatants = Object.entries(ids).map(([ch, overrides]) => {
    const cells = grid.find(ch);
    return combatant({tokenId: ch, pos: cells[0]!, footprint: cells, center: grid.centerOfCell(cells[0]!), ...overrides});
  });
  const snap = snapshot(combatants);
  snap.gridDistance = 1;
  for (const a of combatants) for (const b of combatants) {
    if (a === b) continue;
    snap.distances[a.tokenId]![b.tokenId] = grid.distanceUnits(a.center, b.center);
    snap.adjacent[a.tokenId]![b.tokenId] = a.footprint.some(f => b.footprint.some(g => grid.isAdjacent(f, g) && !grid.isSeparated(a.pos, g)));
  }
  return {grid, snap};
}

describe("walls between melee opponents", () => {
  it("does not treat a cell behind a thin wall as a melee goal", () => {
    const grid = new FakeSquareGrid({map: ["OP"], edges: ["0,0|0,1"]});
    const goal = {kind: "melee" as const, targetFootprint: [{i: 0, j: 1}], targetCenter: grid.centerOfCell({i: 0, j: 1})};
    expect(isGoalCell(grid, goal, {i: 0, j: 0})).toBe(false);
    const open = new FakeSquareGrid({map: ["OP"]});
    expect(isGoalCell(open, goal, {i: 0, j: 0})).toBe(true);
  });

  it("walks around a thin wall to reach a cell that actually touches the target", () => {
    const grid = new FakeSquareGrid({map: ["O.P", "..."], edges: ["0,1|0,2", "1,1|0,2"]});
    const goal = {kind: "melee" as const, targetFootprint: [{i: 0, j: 2}], targetCenter: grid.centerOfCell({i: 0, j: 2})};
    const result = findPath(grid, {start: {i: 0, j: 0}, moverId: "O", goal, maxCost: 10});
    expect(result.reachesGoal).toBe(true);
    expect(result.path.at(-1)).toEqual({i: 1, j: 2});
  });

  it("plans a move instead of attacking through the wall", () => {
    const {grid, snap} = arena(["OP", ".."], ["0,0|0,1", "1,0|0,1"], {O: {speed: 4}, P: pc});
    expect(snap.adjacent.O!.P).toBe(false);
    const plan = planTurn(snap, "O", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "meleeAttack"]);
    expect((plan.actions[0] as any).waypoints.at(-1)).toEqual(grid.centerOfCell({i: 1, j: 1}));
  });

  it("keeps the token's movement action on planned moves", () => {
    const {grid, snap} = arena(["O...P"], [], {O: {speed: 6, movementAction: "fly"}, P: pc});
    const plan = planTurn(snap, "O", {graph: grid});
    expect((plan.actions[0] as any).action).toBe("fly");
  });
});
