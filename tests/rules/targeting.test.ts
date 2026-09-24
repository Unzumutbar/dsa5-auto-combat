import {describe, expect, it} from "vitest";
import {hashSeed, scoreCandidates} from "../../src/rules/targeting";
import {combatant, snapshot, weapon} from "../fixtures";

const orc = combatant({tokenId: "orc", disposition: "hostile", pos: {i: 0, j: 0}});
const near = combatant({tokenId: "near", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 2}, lep: {value: 30, max: 30}});
const far = combatant({tokenId: "far", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 6}, lep: {value: 5, max: 30}, weapons: [weapon({at: 16})]});
const ally = combatant({tokenId: "goblin", disposition: "hostile", pos: {i: 1, j: 0}});
const dead = combatant({tokenId: "dead", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 1}, defeated: true});

describe("targeting", () => {
  it("picks the nearest living enemy by default", () => {
    const snap = snapshot([orc, near, far, ally, dead]);
    const candidates = scoreCandidates({snapshot: snap, self: orc, rule: "nearest"});
    expect(candidates.map(c => c.tokenId)).toEqual(["near", "far"]);
    expect(candidates[0]!.reasons).toContain("Explain.Target.nearest");
  });

  it("supports weakest and highest threat rules", () => {
    const snap = snapshot([orc, near, far]);
    expect(scoreCandidates({snapshot: snap, self: orc, rule: "weakest"})[0]!.tokenId).toBe("far");
    expect(scoreCandidates({snapshot: snap, self: orc, rule: "highestThreat"})[0]!.tokenId).toBe("far");
  });

  it("keeps the current target while it stands", () => {
    const sticky = combatant({...orc, currentTargetTokenId: "far"});
    const snap = snapshot([sticky, near, far]);
    const candidates = scoreCandidates({snapshot: snap, self: sticky, rule: "nearest"});
    expect(candidates[0]!.tokenId).toBe("far");
    expect(candidates[0]!.reasons[0]).toBe("Explain.Target.sticky");
  });

  it("pushes targets without line of sight to the end", () => {
    const snap = snapshot([orc, near, far], {los: {orc: {near: false}}});
    const candidates = scoreCandidates({snapshot: snap, self: orc, rule: "nearest"});
    expect(candidates.map(c => c.tokenId)).toEqual(["far", "near"]);
    expect(candidates[1]!.reachable).toBe(false);
  });

  it("random picks are stable for the same round", () => {
    const snap = snapshot([orc, near, far]);
    const a = scoreCandidates({snapshot: snap, self: orc, rule: "random"}).map(c => c.tokenId);
    const b = scoreCandidates({snapshot: snap, self: orc, rule: "random"}).map(c => c.tokenId);
    expect(a).toEqual(b);
    expect(hashSeed("x", 1)).not.toBe(hashSeed("x", 2));
  });

  it("forces an explicit target to the front even if it is not an enemy", () => {
    const snap = snapshot([orc, near, far, ally]);
    const candidates = scoreCandidates({snapshot: snap, self: orc, rule: "nearest", forcedTargetTokenId: "goblin"});
    expect(candidates[0]!.tokenId).toBe("goblin");
    expect(candidates[0]!.reasons[0]).toBe("Explain.Target.forced");
    expect(candidates.slice(1).map(c => c.tokenId)).toEqual(["near", "far"]);
  });
});
