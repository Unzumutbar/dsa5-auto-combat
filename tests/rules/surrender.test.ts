import {describe, expect, it} from "vitest";
import {planTurn} from "../../src/rules/planner";
import {escapeBlocked, isFighting, outnumbered, surrenderDecision} from "../../src/rules/surrender";
import {scoreCandidates} from "../../src/rules/targeting";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};
const wounded = {lep: {value: 6, max: 30}};
const cowardly = {...combatant().settings, surrenderThresholdPct: 35, surrenderWhenOutnumbered: true, fleeThresholdPct: 50};

describe("surrender decision", () => {
  it("needs a wounded token and a reason", () => {
    const self = combatant({tokenId: "A", settings: cowardly, ...wounded});
    const foe = combatant({tokenId: "B", ...pc});
    const snap = snapshot([self, foe]);
    expect(surrenderDecision(snap, self, false)).toEqual({surrender: false, reason: null});
    expect(surrenderDecision(snap, self, true)).toEqual({surrender: true, reason: "Explain.Surrender.escapeBlocked"});
    const healthy = combatant({tokenId: "A", settings: cowardly});
    expect(surrenderDecision(snapshot([healthy, foe]), healthy, true).surrender).toBe(false);
    const brave = combatant({tokenId: "A", ...wounded});
    expect(surrenderDecision(snapshot([brave, foe]), brave, true).surrender).toBe(false);
  });

  it("gives up against overwhelming odds or when the leader fell", () => {
    const self = combatant({tokenId: "A", settings: cowardly, ...wounded});
    const foes = ["B", "C"].map(id => combatant({tokenId: id, ...pc}));
    expect(outnumbered(snapshot([self, ...foes]), self)).toBe(true);
    expect(surrenderDecision(snapshot([self, ...foes]), self, false).reason).toBe("Explain.Surrender.outnumbered");
    const leader = combatant({tokenId: "L", settings: {...combatant().settings, isLeader: true}, defeated: true});
    const loyal = combatant({tokenId: "A", settings: {...cowardly, surrenderWhenOutnumbered: false}, ...wounded});
    expect(surrenderDecision(snapshot([loyal, leader, foes[0]!]), loyal, false).reason).toBe("Explain.Surrender.leaderFallen");
  });

  it("recognizes blocked escapes and excludes surrendered tokens from the fight", () => {
    expect(escapeBlocked({actions: [{type: "wait", reasonKey: "Explain.Flee.cornered"}]} as any)).toBe(true);
    expect(escapeBlocked({actions: [{type: "move", provokes: ["x", "y"]}]} as any)).toBe(true);
    expect(escapeBlocked({actions: [{type: "move", provokes: []}]} as any)).toBe(false);
    const white = combatant({tokenId: "W", ...pc, surrendered: true});
    expect(isFighting(white)).toBe(false);
    const self = combatant({tokenId: "A"});
    const active = combatant({tokenId: "B", ...pc});
    expect(scoreCandidates({snapshot: snapshot([self, white, active]), self, rule: "nearest"}).map(c => c.tokenId)).toEqual(["B"]);
  });
});

describe("planner surrender", () => {
  it("plans a surrender when cornered and wounded, flees when a way out exists", () => {
    // Cornered in a dead end: walls on three sides, the enemy blocks the exit.
    const grid = new FakeSquareGrid({map: ["###", "#A#", "#B#", "#.#"]});
    const self = combatant({tokenId: "A", pos: {i: 1, j: 1}, footprint: [{i: 1, j: 1}], center: grid.centerOfCell({i: 1, j: 1}), settings: cowardly, ...wounded, weapons: [weapon()]});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 2, j: 1}, footprint: [{i: 2, j: 1}], center: grid.centerOfCell({i: 2, j: 1})});
    const plan = planTurn(snapshot([self, foe]), "A", {graph: grid});
    expect(plan.mode).toBe("surrender");
    expect(plan.actions).toEqual([{type: "surrender", reasonKey: "Explain.Surrender.escapeBlocked"}]);
    expect(plan.explanation.some(e => e.key === "Explain.Surrender.decision")).toBe(true);
    // Open field: the coward runs instead.
    const open = new FakeSquareGrid({map: [".....", ".A.B.", "....."]});
    const runner = combatant({tokenId: "A", pos: {i: 1, j: 1}, footprint: [{i: 1, j: 1}], center: open.centerOfCell({i: 1, j: 1}), settings: {...cowardly, surrenderWhenOutnumbered: false}, ...wounded});
    const far = combatant({tokenId: "B", ...pc, pos: {i: 1, j: 3}, footprint: [{i: 1, j: 3}], center: open.centerOfCell({i: 1, j: 3})});
    const fleeing = planTurn(snapshot([runner, far]), "A", {graph: open});
    expect(fleeing.mode).toBe("flee");
    expect(fleeing.actions[0]!.type).toBe("move");
  });

  it("skips the turn of a token that already surrendered", () => {
    const self = combatant({tokenId: "A", surrendered: true});
    const plan = planTurn(snapshot([self, combatant({tokenId: "B", ...pc})]), "A");
    expect(plan.mode).toBe("skip");
    expect(plan.explanation[0]!.key).toBe("Explain.Skip.surrendered");
  });
});
