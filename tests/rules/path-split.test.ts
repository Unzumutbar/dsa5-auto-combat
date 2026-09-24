import {describe, expect, it} from "vitest";
import {splitPathByBudget} from "../../src/rules/pathfinding/path-split";

describe("splitPathByBudget", () => {
  const points = [{x: 0, y: 0}, {x: 400, y: 0}, {x: 400, y: 300}];

  it("keeps the whole path in the free part when it fits", () => {
    const split = splitPathByBudget(points, 10, 1 / 100);
    expect(split.free).toEqual(points);
    expect(split.run).toEqual([]);
    expect(split.totalUnits).toBe(7);
  });

  it("cuts the path exactly where the free budget ends", () => {
    const split = splitPathByBudget(points, 5, 1 / 100);
    expect(split.free).toEqual([{x: 0, y: 0}, {x: 400, y: 0}, {x: 400, y: 100}]);
    expect(split.run).toEqual([{x: 400, y: 100}, {x: 400, y: 300}]);
  });

  it("handles a budget of zero and trivial paths", () => {
    const split = splitPathByBudget(points, 0, 1 / 100);
    expect(split.free).toEqual([{x: 0, y: 0}, {x: 0, y: 0}]);
    expect(split.run[0]).toEqual({x: 0, y: 0});
    expect(splitPathByBudget([{x: 1, y: 1}], 5, 1)).toEqual({free: [{x: 1, y: 1}], run: [], totalUnits: 0});
  });
});
