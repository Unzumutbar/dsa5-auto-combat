import {describe, expect, it} from "vitest";
import {BASE_DEFAULTS} from "../../src/rules/defaults";
import {planTurn} from "../../src/rules/planner";
import {combatant, snapshot} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

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
const scared = {lep: {value: 5, max: 30}, settings: {...BASE_DEFAULTS, fleeThresholdPct: 30}, speed: 3};

describe("planner flee", () => {
  it("runs away from the nearest enemy, spending an action if needed", () => {
    const {grid, snap} = arena(["P.O......."], {O: scared, P: pc});
    const plan = planTurn(snap, "O", {graph: grid});
    expect(plan.mode).toBe("flee");
    expect(plan.actions.map(a => a.type)).toEqual(["move"]);
    const move = plan.actions[0] as any;
    expect(move.reason).toBe("flee");
    expect(move.waypoints.at(-1).x).toBeGreaterThan(grid.centerOfCell({i: 0, j: 6}).x);
    expect(move.costsAction).toBe(true);
  });

  it("reports when it is cornered", () => {
    const {grid, snap} = arena(["#P#", "#O#", "###"], {O: scared, P: pc});
    const plan = planTurn(snap, "O", {graph: grid});
    expect(plan.mode).toBe("flee");
    expect((plan.actions[0] as any).reasonKey).toBe("Explain.Flee.cornered");
  });

  it("keeps fighting when no threshold is configured", () => {
    const {grid, snap} = arena(["PO"], {O: {lep: {value: 5, max: 30}}, P: pc});
    expect(planTurn(snap, "O", {graph: grid}).mode).toBe("fight");
  });
});
