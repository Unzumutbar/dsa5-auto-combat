import {describe, expect, it} from "vitest";
import {computeBudget} from "../../src/rules/budget";
import {planTurn} from "../../src/rules/planner";
import {BASE_DEFAULTS} from "../../src/rules/defaults";
import {combatant, snapshot, weapon} from "../fixtures";

const pc = combatant({tokenId: "pc", isPlayerOwned: true, disposition: "friendly", pos: {i: 0, j: 1}});

describe("budget", () => {
  it("counts remaining actions and movement", () => {
    const beast = combatant({actionCount: 2, bonusActions: 1, round: {actionsUsed: 1, freeActionUsed: false, defenseCount: 0, movementActionConsumed: false}});
    expect(computeBudget(beast)).toEqual({actions: 2, freeMove: 8, runMove: 8});
    const spent = combatant({round: {actionsUsed: 1, freeActionUsed: true, defenseCount: 0, movementActionConsumed: false}});
    expect(computeBudget(spent)).toEqual({actions: 0, freeMove: 0, runMove: 0});
  });

  it("denies movement when rooted or when running is disabled", () => {
    expect(computeBudget(combatant({conditions: {rooted: 1}})).freeMove).toBe(0);
    expect(computeBudget(combatant({settings: {...BASE_DEFAULTS, allowRunning: false}})).runMove).toBe(0);
  });
});

describe("planner", () => {
  it("attacks an adjacent enemy with the best melee weapon, once per action", () => {
    const orc = combatant({tokenId: "orc", pos: {i: 0, j: 0}, actionCount: 2, weapons: [weapon({itemId: "dagger", at: 10}), weapon({itemId: "axe", at: 14})]});
    const plan = planTurn(snapshot([orc, pc]), "orc");
    expect(plan.mode).toBe("fight");
    expect(plan.targetTokenId).toBe("pc");
    expect(plan.actions).toMatchObject([
      {type: "meleeAttack", weaponId: "axe", weaponName: "Schwert", targetTokenId: "pc"},
      {type: "meleeAttack", weaponId: "axe", weaponName: "Schwert", targetTokenId: "pc"}
    ]);
  });

  it("waits when the enemy is out of reach (movement arrives in a later phase)", () => {
    const orc = combatant({tokenId: "orc", pos: {i: 0, j: 5}});
    const plan = planTurn(snapshot([orc, pc]), "orc");
    expect(plan.actions[0]!.type).toBe("wait");
    expect(plan.targetTokenId).toBe("pc");
  });

  it("skips incapacitated NPCs unless configured otherwise", () => {
    const orc = combatant({tokenId: "orc", conditions: {incapacitated: 1}});
    expect(planTurn(snapshot([orc, pc]), "orc").mode).toBe("skip");
    const stubborn = combatant({tokenId: "orc", conditions: {incapacitated: 1}, settings: {...BASE_DEFAULTS, fightWhileIncapacitated: true}});
    expect(planTurn(snapshot([stubborn, pc]), "orc").mode).toBe("fight");
  });

  it("keeps neutral NPCs passive until someone attacks them", () => {
    const merchant = combatant({tokenId: "merchant", disposition: "neutral"});
    expect(planTurn(snapshot([merchant, pc]), "merchant").mode).toBe("passive");
    const provoked = combatant({tokenId: "merchant", disposition: "neutral", grudges: ["pc"]});
    const plan = planTurn(snapshot([provoked, pc]), "merchant");
    expect(plan.mode).toBe("fight");
    expect(plan.actions[0]!.type).toBe("meleeAttack");
  });

  it("flees below the configured threshold and warns about heavy pain", () => {
    const orc = combatant({tokenId: "orc", lep: {value: 5, max: 30}, pain: 3, settings: {...BASE_DEFAULTS, fleeThresholdPct: 25}});
    const plan = planTurn(snapshot([orc, pc]), "orc");
    expect(plan.mode).toBe("flee");
    expect(plan.warnings[0]!.key).toBe("Explain.Warn.pain");
  });

  it("honours a forced target", () => {
    const orc = combatant({tokenId: "orc", pos: {i: 0, j: 0}});
    const other = combatant({tokenId: "pc2", isPlayerOwned: true, disposition: "friendly", pos: {i: 1, j: 0}});
    const plan = planTurn(snapshot([orc, pc, other]), "orc", {forcedTargetTokenId: "pc2"});
    expect(plan.targetTokenId).toBe("pc2");
  });
});
