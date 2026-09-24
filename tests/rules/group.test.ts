import {describe, expect, it} from "vitest";
import {BUILT_IN_ARCHETYPES} from "../../src/rules/archetypes";
import {COMMAND_OVERRIDES, encirclementAngle, leaderTarget} from "../../src/rules/group";
import {planTurn} from "../../src/rules/planner";
import {resolveTokenSettingsWithSources} from "../../src/rules/settings-resolver";
import {scoreCandidates} from "../../src/rules/targeting";
import type {Action} from "../../src/types/plan";
import {combatant, snapshot, weapon} from "../fixtures";
import {FakeSquareGrid} from "./fake-grid";

const pc = {isPlayerOwned: true, disposition: "friendly" as const};
const lastMove = (actions: Action[]) => actions.filter(a => a.type === "move").pop() as Extract<Action, {type: "move"}> | undefined;

describe("group behaviour", () => {
  it("measures the angle to engaged allies", () => {
    const target = {x: 0, y: 0};
    expect(encirclementAngle({x: 100, y: 0}, target, [{x: -100, y: 0}])).toBe(180);
    expect(encirclementAngle({x: 0, y: 100}, target, [{x: -100, y: 0}])).toBe(90);
    expect(encirclementAngle({x: -100, y: 0}, target, [{x: -100, y: 0}])).toBe(0);
    expect(encirclementAngle({x: 100, y: 0}, target, [])).toBe(0);
  });

  it("encircles: the second attacker goes to the far side of the target", () => {
    // Ally O already stands west of the player P; A comes from the west too and should end up east.
    const grid = new FakeSquareGrid({map: [".....", "AOP..", "....."], diagonals: "illegal"});
    const ally = combatant({tokenId: "O", pos: {i: 1, j: 1}, footprint: [{i: 1, j: 1}], center: grid.centerOfCell({i: 1, j: 1})});
    const self = combatant({tokenId: "A", pos: {i: 1, j: 0}, footprint: [{i: 1, j: 0}], center: grid.centerOfCell({i: 1, j: 0}), speed: 10, weapons: [weapon()]});
    const foe = combatant({tokenId: "P", ...pc, pos: {i: 1, j: 2}, footprint: [{i: 1, j: 2}], center: grid.centerOfCell({i: 1, j: 2})});
    const plan = planTurn(snapshot([self, ally, foe]), "A", {graph: grid});
    const move = lastMove(plan.actions)!;
    const end = move.waypoints[move.waypoints.length - 1]!;
    expect(end).toEqual(grid.centerOfCell({i: 1, j: 3}));
    expect(plan.actions.some(a => a.type === "meleeAttack")).toBe(true);
  });

  it("blockers position themselves away from their own faction", () => {
    const grid = new FakeSquareGrid({map: [".....", "A.P..", "....."], diagonals: "illegal"});
    const settings = {...combatant().settings, blockEscape: true};
    const self = combatant({tokenId: "A", pos: {i: 1, j: 0}, footprint: [{i: 1, j: 0}], center: grid.centerOfCell({i: 1, j: 0}), speed: 10, settings});
    const foe = combatant({tokenId: "P", ...pc, pos: {i: 1, j: 2}, footprint: [{i: 1, j: 2}], center: grid.centerOfCell({i: 1, j: 2})});
    const plan = planTurn(snapshot([self, foe]), "A", {graph: grid});
    const end = lastMove(plan.actions)!.waypoints.at(-1)!;
    expect(end).toEqual(grid.centerOfCell({i: 1, j: 3}));
    const plain = planTurn(snapshot([{...self, settings: combatant().settings}, foe]), "A", {graph: grid});
    expect(lastMove(plain.actions)!.waypoints.at(-1)).toEqual(grid.centerOfCell({i: 1, j: 1}));
  });

  it("followers prefer the leader's target", () => {
    const leader = combatant({tokenId: "L", settings: {...combatant().settings, isLeader: true}, currentTargetTokenId: "far"});
    const self = combatant({tokenId: "A", pos: {i: 0, j: 0}});
    const near = combatant({tokenId: "near", ...pc, pos: {i: 0, j: 1}});
    const far = combatant({tokenId: "far", ...pc, pos: {i: 0, j: 3}});
    const snap = snapshot([self, leader, near, far]);
    expect(leaderTarget(snap, self)).toBe("far");
    const ranked = scoreCandidates({snapshot: snap, self, rule: "nearest"});
    expect(ranked[0]!.tokenId).toBe("far");
    expect(ranked[0]!.reasons).toContain("Explain.Target.leader");
    const lone = {...self, settings: {...self.settings, followLeader: false}};
    expect(scoreCandidates({snapshot: snapshot([lone, leader, near, far]), self: lone, rule: "nearest"})[0]!.tokenId).toBe("near");
  });

  it("group commands override every other layer", () => {
    const resolved = resolveTokenSettingsWithSources({disposition: "hostile", archetypes: BUILT_IN_ARCHETYPES, tokenOverrides: {fleeThresholdPct: 20}, commandOverrides: COMMAND_OVERRIDES.retreat});
    expect(resolved.settings.fleeThresholdPct).toBe(100);
    expect(resolved.sources.fleeThresholdPct).toBe("command");
    const defend = resolveTokenSettingsWithSources({disposition: "hostile", archetypes: BUILT_IN_ARCHETYPES, commandOverrides: COMMAND_OVERRIDES.defend});
    expect(defend.settings.holdPosition).toBe(true);
    expect(defend.settings.profile).toBe("defensive");
  });
});
