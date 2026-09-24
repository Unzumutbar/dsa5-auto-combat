import {describe, expect, it} from "vitest";
import {BASE_DEFAULTS} from "../../src/rules/defaults";
import {fleeThreshold, groupMorale} from "../../src/rules/morale";
import {planTurn} from "../../src/rules/planner";
import {scoreCandidates} from "../../src/rules/targeting";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};
const wuchtschlag = {itemId: "ws", name: "Wuchtschlag", kind: "wuchtschlag" as const, maxStep: 3};
const finte = {itemId: "fi", name: "Finte", kind: "finte" as const, maxStep: 2};

describe("combat maneuvers in plans", () => {
  it("attaches the chosen maneuver and its odds to every melee attack", () => {
    const self = combatant({tokenId: "A", pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], weapons: [weapon({at: 16, damage: "1d6+4"})], maneuvers: [wuchtschlag, finte], actionCount: 2});
    const foe = combatant({tokenId: "B", ...pc, pos: {i: 1, j: 0}, footprint: [{i: 1, j: 0}], dodge: 6, weapons: [weapon({pa: 8})], armor: 0});
    const plan = planTurn(snapshot([self, foe]), "A", {graph: new FakeSquareGrid({map: ["AB"]})});
    const attacks = plan.actions.filter(a => a.type === "meleeAttack") as Extract<(typeof plan.actions)[number], {type: "meleeAttack"}>[];
    expect(attacks).toHaveLength(2);
    expect(attacks[0]!.maneuver).toMatchObject({step: 2});
    expect(attacks[0]!.odds!.hitChance).toBeCloseTo(0.6 * 0.6, 3);
    expect(attacks[1]!.odds!.hitChance).toBeGreaterThan(attacks[0]!.odds!.hitChance);
    expect(attacks[0]!.odds!.expectedDamage).toBeCloseTo(0.36 * (7.5 + 4), 1);
  });
});

describe("group morale", () => {
  const leader = combatant({tokenId: "boss", disposition: "hostile", settings: {...BASE_DEFAULTS, isLeader: true}, lep: {value: 0, max: 30}});
  const orc1 = combatant({tokenId: "orc1", disposition: "hostile", lep: {value: 20, max: 30}});
  const orc2 = combatant({tokenId: "orc2", disposition: "hostile"});
  const hero = combatant({tokenId: "pc", ...pc});

  it("breaks when the leader is down", () => {
    const snap = snapshot([leader, orc1, orc2, hero]);
    expect(groupMorale(snap, orc1)).toMatchObject({malus: 25, reason: {key: "Explain.Flee.groupLeader"}});
    expect(fleeThreshold(snap, orc1).threshold).toBe(25);
  });

  it("breaks when more than half of the faction is down, unless immune", () => {
    const dead = combatant({tokenId: "dead", disposition: "hostile", lep: {value: 0, max: 30}});
    const dead2 = combatant({tokenId: "dead2", disposition: "hostile", defeated: true});
    const snap = snapshot([orc1, dead, dead2, hero]);
    expect(groupMorale(snap, orc1).reason?.key).toBe("Explain.Flee.groupLosses");
    const brave = combatant({...orc1, tokenId: "orc1", settings: {...BASE_DEFAULTS, immuneToGroupMorale: true}});
    expect(groupMorale(snapshot([brave, dead, dead2, hero]), brave).malus).toBe(0);
  });

  it("makes the planner flee once the raised threshold is crossed", () => {
    const grid = new FakeSquareGrid({map: ["P.O....."]});
    const orc = combatant({tokenId: "O", disposition: "hostile", pos: {i: 0, j: 2}, footprint: [{i: 0, j: 2}], center: grid.centerOfCell({i: 0, j: 2}), lep: {value: 6, max: 30}});
    const fallen = combatant({tokenId: "boss", disposition: "hostile", settings: {...BASE_DEFAULTS, isLeader: true}, lep: {value: 0, max: 30}, pos: {i: 5, j: 5}});
    const hero = combatant({tokenId: "P", ...pc, pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], center: grid.centerOfCell({i: 0, j: 0})});
    const plan = planTurn(snapshot([orc, fallen, hero]), "O", {graph: grid});
    expect(plan.mode).toBe("flee");
    expect(plan.explanation.some(e => e.key === "Explain.Flee.groupLeader")).toBe(true);
  });
});

describe("focus limit", () => {
  const heroA = combatant({tokenId: "a", ...pc, pos: {i: 0, j: 1}});
  const heroB = combatant({tokenId: "b", ...pc, pos: {i: 0, j: 3}});
  const orc1 = combatant({tokenId: "o1", disposition: "hostile", pos: {i: 1, j: 1}, currentTargetTokenId: "a"});
  const orc2 = combatant({tokenId: "o2", disposition: "hostile", pos: {i: 1, j: 0}, currentTargetTokenId: "a"});
  const orc3 = combatant({tokenId: "o3", disposition: "hostile", pos: {i: 1, j: 2}});

  it("sends the third attacker to another target when the limit is reached", () => {
    const snap = snapshot([heroA, heroB, orc1, orc2, orc3]);
    const ranked = scoreCandidates({snapshot: snap, self: orc3, rule: "nearest", focusLimit: 2});
    expect(ranked[0]!.tokenId).toBe("b");
    expect(ranked.find(c => c.tokenId === "a")!.crowded).toBe(true);
  });

  it("ignores the limit when no other target exists and for killers", () => {
    const snap = snapshot([heroA, orc1, orc2, orc3]);
    expect(scoreCandidates({snapshot: snap, self: orc3, rule: "nearest", focusLimit: 2})[0]!.tokenId).toBe("a");
    const killer = combatant({...orc3, tokenId: "o3", settings: {...BASE_DEFAULTS, focusLimit: 99}});
    const full = snapshot([heroA, heroB, orc1, orc2, killer]);
    expect(scoreCandidates({snapshot: full, self: killer, rule: "nearest", focusLimit: 2})[0]!.tokenId).toBe("a");
  });
});

describe("bodyguard", () => {
  it("moves back to its protégé instead of chasing enemies", () => {
    const grid = new FakeSquareGrid({map: ["G....W..P"]});
    const place = (id: string, j: number, overrides: Parameters<typeof combatant>[0] = {}) => combatant({tokenId: id, pos: {i: 0, j}, footprint: [{i: 0, j}], center: grid.centerOfCell({i: 0, j}), ...overrides});
    const guard = place("G", 0, {disposition: "hostile", speed: 4, settings: {...BASE_DEFAULTS, protegeTokenId: "W"}});
    const ward = place("W", 5, {disposition: "hostile", weapons: []});
    const hero = place("P", 8, pc);
    const snap = snapshot([guard, ward, hero]);
    snap.gridDistance = 1;
    for (const a of snap.combatants) for (const b of snap.combatants) if (a !== b) snap.distances[a.tokenId]![b.tokenId] = grid.distanceUnits(a.center, b.center);
    const plan = planTurn(snap, "G", {graph: grid});
    expect(plan.actions[0]!.type).toBe("move");
    expect((plan.actions[0] as any).waypoints.at(-1).x).toBeLessThan(grid.centerOfCell({i: 0, j: 5}).x);
    expect(plan.explanation.some(e => e.key === "Explain.Wait.guarding")).toBe(true);
  });

  it("prefers whoever attacks the protégé", () => {
    const guard = combatant({tokenId: "G", disposition: "hostile", pos: {i: 0, j: 0}, settings: {...BASE_DEFAULTS, protegeTokenId: "W"}});
    const ward = combatant({tokenId: "W", disposition: "hostile", pos: {i: 0, j: 1}, weapons: [weapon({at: 5})]});
    const near = combatant({tokenId: "near", ...pc, pos: {i: 2, j: 0}});
    const attacker = combatant({tokenId: "att", ...pc, pos: {i: 3, j: 0}, currentTargetTokenId: "W"});
    const snap = snapshot([guard, ward, near, attacker]);
    expect(scoreCandidates({snapshot: snap, self: guard, rule: "nearest"})[0]!.tokenId).toBe("att");
  });
});
