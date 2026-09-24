import {describe, expect, it} from "vitest";
import {blocksEntry, hazardsUnder, indexHazards, pathHazardIds, relocate, withHazards} from "../../src/rules/hazards";
import {findPath} from "../../src/rules/pathfinding/astar";
import {planTurn} from "../../src/rules/planner";
import type {Hazard} from "../../src/types/hazards";
import type {Action} from "../../src/types/plan";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};
const fire: Hazard = {id: "fire", kind: "region", name: "Pandämonium", severity: "avoid", damagePerRound: 4, source: "dsa5", cells: [{i: 1, j: 1}, {i: 1, j: 2}, {i: 1, j: 3}]};
const wallOfDoom: Hazard = {...fire, id: "doom", name: "Verboten", severity: "forbidden"};

describe("hazard index", () => {
  it("indexes cells with the worst severity", () => {
    const index = indexHazards([fire, wallOfDoom]);
    expect(hazardsUnder(index, [{i: 1, j: 2}])).toEqual({severity: "forbidden", ids: ["fire", "doom"]});
    expect(hazardsUnder(index, [{i: 0, j: 0}])).toEqual({severity: null, ids: []});
    expect(blocksEntry("avoid", "avoid")).toBe(false);
    expect(blocksEntry("avoid", "never")).toBe(true);
    expect(blocksEntry("forbidden", "avoid")).toBe(true);
    expect(blocksEntry("forbidden", "ignore")).toBe(false);
  });
});

describe("pathfinding with hazards", () => {
  // Row 1 columns 1..3 burn; A wants to reach B on the far side.
  const map = ["......", "......", "......"];
  const grid = new FakeSquareGrid({map, diagonals: "illegal"});
  const goal = {kind: "melee" as const, targetFootprint: [{i: 1, j: 5}], targetCenter: grid.centerOfCell({i: 1, j: 5})};

  it("walks around an avoid zone when the budget allows and through it otherwise", () => {
    const hazardous = withHazards(grid, [fire], "avoid");
    const around = findPath(hazardous, {start: {i: 1, j: 0}, moverId: "A", goal, maxCost: 12});
    expect(around.reachesGoal).toBe(true);
    expect(around.path.some(c => c.i === 1 && c.j >= 1 && c.j <= 3)).toBe(false);
    expect(pathHazardIds(hazardous, around.path)).toEqual([]);
    const through = findPath(hazardous, {start: {i: 1, j: 0}, moverId: "A", goal, maxCost: 4});
    expect(through.reachesGoal).toBe(false);
    // A corridor leaves no way around: the token wades through and the path reports the hazard.
    const corridor = new FakeSquareGrid({map: ["....."], diagonals: "illegal"});
    const burning = withHazards(corridor, [{...fire, cells: [{i: 0, j: 1}, {i: 0, j: 2}, {i: 0, j: 3}]}], "avoid");
    const forced = findPath(burning, {start: {i: 0, j: 0}, moverId: "A", goal: {kind: "melee", targetFootprint: [{i: 0, j: 4}], targetCenter: corridor.centerOfCell({i: 0, j: 4})}, maxCost: 20});
    expect(forced.reachesGoal).toBe(true);
    expect(forced.distance).toBe(12);
    expect(pathHazardIds(burning, forced.path)).toEqual(["fire"]);
  });

  it("treats forbidden zones like walls and honours 'never'", () => {
    const blocked = findPath(withHazards(grid, [wallOfDoom], "avoid"), {start: {i: 1, j: 0}, moverId: "A", goal, maxCost: 3});
    expect(blocked.reachesGoal).toBe(false);
    const never = findPath(withHazards(grid, [fire], "never"), {start: {i: 1, j: 0}, moverId: "A", goal, maxCost: 3});
    expect(never.reachesGoal).toBe(false);
    expect(withHazards(grid, [fire], "ignore")).toBe(grid);
  });

  it("finds the nearest safe cell for a token standing inside a zone", () => {
    const hazardous = withHazards(grid, [fire], "avoid");
    const out = findPath(hazardous, {start: {i: 1, j: 2}, moverId: "A", goal: {kind: "safe", targetCenter: grid.centerOfCell({i: 1, j: 2})}, maxCost: 10});
    expect(out.reachesGoal).toBe(true);
    expect(out.path.length).toBe(2);
    expect(hazardous.hazardsAt!(out.path[1]!).severity).toBeNull();
  });
});

describe("planner and hazards", () => {
  it("leaves the zone first and then attacks from the new position", () => {
    const grid = new FakeSquareGrid({map: ["....", "....", "...."], diagonals: "illegal"});
    const self = combatant({tokenId: "A", pos: {i: 1, j: 2}, footprint: [{i: 1, j: 2}], center: grid.centerOfCell({i: 1, j: 2}), inHazardIds: ["fire"], weapons: [weapon()], actionCount: 1, speed: 4});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 3}, footprint: [{i: 0, j: 3}], center: grid.centerOfCell({i: 0, j: 3})});
    const snap = {...snapshot([self, foe]), hazards: [fire]};
    const plan = planTurn(snap, "A", {graph: grid});
    const types = plan.actions.map(a => a.type);
    expect(types[0]).toBe("move");
    expect((plan.actions[0] as Extract<Action, {type: "move"}>).reason).toBe("leaveHazard");
    expect(types).toContain("meleeAttack");
    expect(plan.explanation.some(e => e.key === "Explain.Hazard.leave")).toBe(true);
  });

  it("ignores zones when told to and warns about paths through them", () => {
    const grid = new FakeSquareGrid({map: ["....", "....", "...."], diagonals: "illegal"});
    const careless = combatant({tokenId: "A", pos: {i: 1, j: 2}, footprint: [{i: 1, j: 2}], center: grid.centerOfCell({i: 1, j: 2}), inHazardIds: ["fire"], settings: {...combatant().settings, hazardCaution: "ignore"}});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 1, j: 3}, footprint: [{i: 1, j: 3}], center: grid.centerOfCell({i: 1, j: 3})});
    const plan = planTurn({...snapshot([careless, foe]), hazards: [fire]}, "A", {graph: grid});
    expect(plan.actions[0]!.type).toBe("meleeAttack");
    // In a corridor A must wade into the burning cells to get closer to B: the plan warns.
    const corridor = new FakeSquareGrid({map: ["....."], diagonals: "illegal"});
    const rowFire = {...fire, cells: [{i: 0, j: 1}, {i: 0, j: 2}, {i: 0, j: 3}]};
    const runner = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], center: corridor.centerOfCell({i: 0, j: 0}), speed: 8, settings: {...combatant().settings, allowRunning: false}});
    const far = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 4}, footprint: [{i: 0, j: 4}], center: corridor.centerOfCell({i: 0, j: 4})});
    const warned = planTurn({...snapshot([runner, far]), hazards: [rowFire]}, "A", {graph: corridor});
    expect(warned.warnings.some(w => w.key === "Explain.Hazard.path")).toBe(true);
  });

  it("relocates a combatant and recomputes its rows", () => {
    const grid = new FakeSquareGrid({map: ["A.B"]});
    const a = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], center: grid.centerOfCell({i: 0, j: 0})});
    const b = combatant({tokenId: "B", ...pc, pos: {i: 0, j: 2}, footprint: [{i: 0, j: 2}], center: grid.centerOfCell({i: 0, j: 2})});
    const snap = snapshot([a, b]);
    expect(snap.adjacent.A!.B).toBe(false);
    const moved = relocate(snap, a, {i: 0, j: 1}, grid);
    expect(moved.self.pos).toEqual({i: 0, j: 1});
    expect(moved.snapshot.adjacent.A!.B).toBe(true);
    expect(moved.snapshot.adjacent.B!.A).toBe(true);
    expect(moved.snapshot.distances.A!.B).toBeCloseTo(grid.unitsPerCell, 5);
  });
});
