import {describe, expect, it} from "vitest";
import {BASE_DEFAULTS} from "../../src/rules/defaults";
import {planTurn} from "../../src/rules/planner";
import {scoreCandidates} from "../../src/rules/targeting";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};
const bow = () => weapon({itemId: "bow", name: "Bogen", kind: "ranged", at: 12, rangeBands: [10, 50, 80], ammoLeft: 5, loadTime: 1, loadProgress: 1});

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

describe("archetype-driven behaviour", () => {
  it("only killers attack downed targets, and only after living ones", () => {
    const down = combatant({tokenId: "down", ...pc, pos: {i: 0, j: 1}, lep: {value: 0, max: 30}});
    const alive = combatant({tokenId: "alive", ...pc, pos: {i: 0, j: 3}});
    const orc = combatant({tokenId: "orc", pos: {i: 0, j: 0}});
    expect(scoreCandidates({snapshot: snapshot([orc, down, alive]), self: orc, rule: "nearest"}).map(c => c.tokenId)).toEqual(["alive"]);
    const killer = combatant({tokenId: "orc", pos: {i: 0, j: 0}, settings: {...BASE_DEFAULTS, attackDowned: true}});
    const ranked = scoreCandidates({snapshot: snapshot([killer, down, alive]), self: killer, rule: "nearest"});
    expect(ranked.map(c => c.tokenId)).toEqual(["alive", "down"]);
    expect(ranked[1]!.reasons).toContain("Explain.Target.downed");
  });

  it("guards hold their position instead of approaching", () => {
    const {grid, snap} = arena(["G....P"], {G: {settings: {...BASE_DEFAULTS, holdPosition: true}}, P: pc});
    const plan = planTurn(snap, "G", {graph: grid});
    expect(plan.actions).toEqual([{type: "wait", reasonKey: "Explain.Wait.holdPosition", params: {distance: 5}}]);
  });

  it("guards still shoot what they can see", () => {
    const {grid, snap} = arena(["G....P"], {G: {weapons: [bow()], settings: {...BASE_DEFAULTS, holdPosition: true}}, P: pc});
    expect(planTurn(snap, "G", {graph: grid}).actions[0]!.type).toBe("rangedAttack");
  });

  it("fighters that may not retreat stay in melee even with a better bow", () => {
    const {grid, snap} = arena(["......AP"], {A: {weapons: [bow(), weapon({itemId: "dagger", at: 9})], settings: {...BASE_DEFAULTS, allowRetreat: false}}, P: pc});
    const plan = planTurn(snap, "A", {graph: grid});
    expect(plan.actions[0]!.type).toBe("meleeAttack");
  });
});
