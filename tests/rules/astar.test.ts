import {describe, expect, it} from "vitest";
import {findBestCell, findPath, isGoalCell, simplifyPath, type GoalSpec} from "../../src/rules/pathfinding/astar";
import {FakeSquareGrid} from "./fake-grid";

function meleeGoal(grid: FakeSquareGrid, targetId: string): GoalSpec {
  const footprint = grid.find(targetId);
  const centers = footprint.map(c => grid.centerOfCell(c));
  const targetCenter = {x: centers.reduce((s, c) => s + c.x, 0) / centers.length, y: centers.reduce((s, c) => s + c.y, 0) / centers.length};
  return {kind: "melee", targetFootprint: footprint, targetCenter};
}

describe("A* pathfinding", () => {
  it("walks straight to an adjacent cell of the target on an open field", () => {
    const grid = new FakeSquareGrid({map: [
      "M.......",
      "........",
      "......T."
    ]});
    const result = findPath(grid, {start: grid.find("M")[0]!, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 10});
    expect(result.reachesGoal).toBe(true);
    expect(result.distance).toBe(5);
    expect(isGoalCell(grid, meleeGoal(grid, "T"), result.path.at(-1)!)).toBe(true);
  });

  it("does not move when already adjacent", () => {
    const grid = new FakeSquareGrid({map: ["MT"]});
    const result = findPath(grid, {start: {i: 0, j: 0}, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 10});
    expect(result.path).toEqual([{i: 0, j: 0}]);
    expect(result.distance).toBe(0);
    expect(result.reachesGoal).toBe(true);
  });

  it("routes around a wall", () => {
    const grid = new FakeSquareGrid({map: [
      "M.#..",
      "..#..",
      "..#.T",
      "....."
    ]});
    const result = findPath(grid, {start: {i: 0, j: 0}, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 20});
    expect(result.reachesGoal).toBe(true);
    expect(result.path.every(c => grid.at(c) !== "#")).toBe(true);
    expect(result.distance).toBeGreaterThanOrEqual(4);
    expect(result.path.some(c => c.i === 3)).toBe(true);
  });

  it("never paths through other tokens but may treat listed ones as passable", () => {
    const grid = new FakeSquareGrid({map: [
      "#####",
      "M.X.T",
      "#####"
    ]});
    const blocked = findPath(grid, {start: {i: 1, j: 0}, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 20});
    expect(blocked.reachesGoal).toBe(false);
    expect(blocked.path.at(-1)).toEqual({i: 1, j: 1});
    const passable = findPath(grid, {start: {i: 1, j: 0}, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 20, passable: ["X"]});
    expect(passable.reachesGoal).toBe(true);
  });

  it("truncates to the budget and reports an approach move", () => {
    const grid = new FakeSquareGrid({map: ["M.........T"]});
    const result = findPath(grid, {start: {i: 0, j: 0}, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 4});
    expect(result.reachesGoal).toBe(false);
    expect(result.distance).toBe(4);
    expect(result.path.at(-1)).toEqual({i: 0, j: 4});
    const enough = findPath(grid, {start: {i: 0, j: 0}, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 9});
    expect(enough.reachesGoal).toBe(true);
    expect(enough.distance).toBe(9);
  });

  it("honours the diagonal rule in costs", () => {
    const exact = new FakeSquareGrid({map: ["M...", "....", "....", "...T"], diagonals: "exact"});
    const result = findPath(exact, {start: {i: 0, j: 0}, moverId: "M", goal: meleeGoal(exact, "T"), maxCost: 20});
    expect(result.distance).toBeCloseTo(2 * Math.SQRT2, 5);
    const illegal = new FakeSquareGrid({map: ["M...", "....", "....", "...T"], diagonals: "illegal"});
    expect(findPath(illegal, {start: {i: 0, j: 0}, moverId: "M", goal: meleeGoal(illegal, "T"), maxCost: 20}).distance).toBe(5);
  });

  it("handles a 2x2 mover approaching a 2x2 target", () => {
    const grid = new FakeSquareGrid({map: [
      "M.......",
      "........",
      "......TT",
      "......TT"
    ], moverSize: 2});
    const result = findPath(grid, {start: {i: 0, j: 0}, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 20});
    expect(result.reachesGoal).toBe(true);
    const end = result.path.at(-1)!;
    expect(grid.moverFootprint(end).every(c => grid.at(c) !== "#" && grid.at(c) !== "T")).toBe(true);
  });

  it("finds a ranged firing position with line of sight inside the band", () => {
    const grid = new FakeSquareGrid({map: [
      "M..#....",
      "...#....",
      "........",
      "...#...T"
    ]});
    const target = grid.centerOfCell(grid.find("T")[0]!);
    const goal: GoalSpec = {kind: "ranged", targetCenter: target, minUnits: 2, maxUnits: 6};
    const result = findPath(grid, {start: {i: 0, j: 0}, moverId: "M", goal, maxCost: 10});
    expect(result.reachesGoal).toBe(true);
    const end = grid.moverCenter(result.path.at(-1)!);
    expect(grid.hasLineOfSight(end, target)).toBe(true);
    expect(grid.distanceUnits(end, target)).toBeLessThanOrEqual(6);
  });

  it("stops at the node limit and still returns the best approach", () => {
    const rows = Array.from({length: 40}, () => ".".repeat(40));
    rows[0] = "M" + rows[0]!.slice(1);
    rows[39] = rows[39]!.slice(0, 39) + "T";
    const grid = new FakeSquareGrid({map: rows});
    const result = findPath(grid, {start: {i: 0, j: 0}, moverId: "M", goal: meleeGoal(grid, "T"), maxCost: 100, maxNodes: 50});
    expect(result.explored).toBeLessThanOrEqual(50);
    expect(result.path.length).toBeGreaterThan(1);
  });

  it("finds the cell farthest from threats when fleeing", () => {
    const grid = new FakeSquareGrid({map: [
      "E.M.....",
      "........"
    ]});
    const enemy = grid.centerOfCell({i: 0, j: 0});
    const result = findBestCell(grid, {start: {i: 0, j: 2}, moverId: "M", maxCost: 4, score: center => grid.distanceUnits(center, enemy)});
    expect(result.path.at(-1)!.j).toBe(6);
    expect(result.distance).toBe(4);
  });

  it("simplifies collinear runs", () => {
    const path = [{i: 0, j: 0}, {i: 0, j: 1}, {i: 0, j: 2}, {i: 1, j: 3}, {i: 2, j: 4}, {i: 2, j: 5}];
    expect(simplifyPath(path)).toEqual([{i: 0, j: 0}, {i: 0, j: 2}, {i: 2, j: 4}, {i: 2, j: 5}]);
  });
});
