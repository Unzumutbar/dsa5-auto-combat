import {describe, expect, it} from "vitest";
import {BASE_DEFAULTS} from "../../src/rules/defaults";
import {planTurn} from "../../src/rules/planner";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const bow = () => weapon({itemId: "bow", name: "Kurzbogen", kind: "ranged", at: 12, pa: 0, rangeBands: [10, 50, 80], ammoLeft: 5, loadTime: 1, loadProgress: 1});
const dagger = () => weapon({itemId: "dagger", name: "Dolch", kind: "melee", at: 9, pa: 6, reach: "short"});
const pc = {isPlayerOwned: true, disposition: "friendly" as const};

function arena(map: string[], ids: Record<string, Parameters<typeof combatant>[0]>, los: Record<string, boolean> = {}) {
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
    snap.los[a.tokenId]![b.tokenId] = los[`${a.tokenId}${b.tokenId}`] ?? grid.hasLineOfSight(a.center, b.center);
  }
  return {grid, snap};
}

describe("planner ranged", () => {
  it("shoots a distant enemy in line of sight and reloads between shots", () => {
    const {grid, snap} = arena(["A.......P"], {A: {weapons: [bow(), dagger()], actionCount: 2}, P: pc});
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["rangedAttack", "reload"]);
    expect((plan.actions[0] as any).band).toBe(0);
    expect(plan.explanation.some(e => e.key === "Explain.Ranged.shoot")).toBe(true);
  });

  it("reloads when the weapon is empty and keeps shooting once loaded", () => {
    const crossbow = weapon({itemId: "xbow", name: "Armbrust", kind: "ranged", at: 14, rangeBands: [20, 100, 160], ammoLeft: 2, loadTime: 2, loadProgress: 0});
    const {grid, snap} = arena(["A.......P"], {A: {weapons: [crossbow], actionCount: 3}, P: pc});
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["reload", "reload", "rangedAttack"]);
  });

  it("uses melee when adjacent and the melee weapon is at least as good", () => {
    const {grid, snap} = arena(["AP"], {A: {weapons: [bow(), weapon({itemId: "sword", at: 13})]}, P: pc});
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions[0]!.type).toBe("meleeAttack");
  });

  it("steps back out of melee and shoots when configured to keep distance", () => {
    const {grid, snap} = arena(["......AP"], {A: {weapons: [bow(), dagger()], speed: 4}, P: pc});
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "rangedAttack"]);
    const move = plan.actions[0] as any;
    expect(move.reason).toBe("keepDistance");
    expect(move.waypoints.at(-1).x).toBeLessThan(grid.centerOfCell({i: 0, j: 6}).x);
  });

  it("moves into a firing position when the target is out of sight", () => {
    const {grid, snap} = arena([
      "A.#.....",
      "..#.....",
      "........",
      "..#....P"
    ], {A: {weapons: [bow()], speed: 6}, P: pc});
    expect(snap.los.A!.P).toBe(false);
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "rangedAttack"]);
    expect(plan.explanation.some(e => e.key === "Explain.Ranged.position")).toBe(true);
  });

  it("falls back to melee when ranged combat is disabled", () => {
    const {grid, snap} = arena(["A...P"], {A: {weapons: [bow(), dagger()], settings: {...BASE_DEFAULTS, useRanged: false}}, P: pc});
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "meleeAttack"]);
  });

  it("waits without ammunition", () => {
    const empty = weapon({...bow(), ammoLeft: 0});
    const {grid, snap} = arena(["A.....P"], {A: {weapons: [empty]}, P: pc});
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions[0]!.type).toBe("wait");
  });
});

describe("planner ranged reload heuristics", () => {
  it("prefers closing in with a melee weapon over a reload that cannot finish this turn", () => {
    const slow = weapon({itemId: "heavy", name: "Schwere Armbrust", kind: "ranged", at: 15, rangeBands: [20, 100, 180], ammoLeft: null, loadTime: 15, loadProgress: 0});
    const {grid, snap} = arena(["A....P"], {A: {weapons: [slow, dagger()], speed: 6}, P: pc});
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions.map(a => a.type)).toEqual(["move", "meleeAttack"]);
  });

  it("still reloads a slow weapon when there is no melee alternative", () => {
    const slow = weapon({itemId: "heavy", name: "Schwere Armbrust", kind: "ranged", at: 15, rangeBands: [20, 100, 180], ammoLeft: null, loadTime: 15, loadProgress: 0});
    const {grid, snap} = arena(["A....P"], {A: {weapons: [slow]}, P: pc});
    expect(planTurn(snap, "A", {graph: grid}).actions.map(a => a.type)).toEqual(["reload"]);
  });
});
