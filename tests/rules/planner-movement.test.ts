import {describe, expect, it} from "vitest";
import {planTurn} from "../../src/rules/planner";
import {BASE_DEFAULTS} from "../../src/rules/defaults";
import {combatant, snapshot} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

/** Places fixtures on the fake grid: footprints/centers follow the ASCII map, 1 unit per cell. */
function arena(map: string[], ids: Record<string, Parameters<typeof combatant>[0]>) {
  const grid = new FakeSquareGrid({map});
  const combatants = Object.entries(ids).map(([ch, overrides]) => {
    const cells = grid.find(ch);
    return combatant({tokenId: ch, pos: cells[0]!, footprint: cells, center: grid.centerOfCell(cells[0]!), ...overrides});
  });
  const snap = snapshot(combatants);
  snap.gridDistance = 1;
  for (const a of combatants) for (const b of combatants) {
    if (a === b) continue;
    snap.distances[a.tokenId]![b.tokenId] = grid.distanceUnits(a.center, b.center);
    snap.adjacent[a.tokenId]![b.tokenId] = a.footprint.some(f => b.footprint.some(g => grid.isAdjacent(f, g)));
  }
  return {grid, snap};
}

const pc = {isPlayerOwned: true, disposition: "friendly" as const};

describe("planner movement", () => {
  it("moves next to the target and attacks when the path fits the free movement", () => {
    const {grid, snap} = arena(["O....P"], {O: {speed: 4}, P: pc});
    const plan = planTurn(snap, "O", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "meleeAttack"]);
    const move = plan.actions[0] as Extract<(typeof plan.actions)[number], {type: "move"}>;
    expect(move.distance).toBe(4);
    expect(move.costsAction).toBe(false);
    expect(move.waypoints.at(-1)).toEqual(grid.centerOfCell({i: 0, j: 4}));
  });

  it("runs (spending an action) when the target is beyond the free movement and actions remain", () => {
    const {grid, snap} = arena(["O......P"], {O: {speed: 4, actionCount: 2}, P: pc});
    const plan = planTurn(snap, "O", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "meleeAttack"]);
    expect((plan.actions[0] as any).costsAction).toBe(true);
    expect(plan.explanation.some(e => e.key === "Explain.Move.run")).toBe(true);
  });

  it("approaches as far as possible and waits when the target cannot be reached this turn", () => {
    const {grid, snap} = arena(["O.........P"], {O: {speed: 3, settings: {...BASE_DEFAULTS, allowRunning: false}}, P: pc});
    const plan = planTurn(snap, "O", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "wait"]);
    expect((plan.actions[0] as any).distance).toBe(3);
    expect((plan.actions[1] as any).reasonKey).toBe("Explain.Wait.approaching");
  });

  it("walks around walls", () => {
    const {grid, snap} = arena([
      "O.#..",
      "..#..",
      "..#.P",
      "....."
    ], {O: {speed: 8}, P: pc});
    const plan = planTurn(snap, "O", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "meleeAttack"]);
    const move = plan.actions[0] as any;
    expect(move.waypoints.some((w: {y: number}) => w.y > 250)).toBe(true);
  });

  it("does not move when rooted", () => {
    const {grid, snap} = arena(["O...P"], {O: {conditions: {rooted: 1}}, P: pc});
    const plan = planTurn(snap, "O", {graph: grid});
    expect(plan.actions[0]!.type).toBe("wait");
  });

  it("uses a straight line on gridless scenes", () => {
    const {snap} = arena(["O......P"], {O: {speed: 5}, P: pc});
    snap.gridType = "gridless";
    const plan = planTurn(snap, "O");
    expect(plan.actions[0]!.type).toBe("move");
    expect((plan.actions[0] as any).distance).toBeCloseTo(5, 5);
    expect(plan.actions[1]!.type).toBe("wait");
  });
});
