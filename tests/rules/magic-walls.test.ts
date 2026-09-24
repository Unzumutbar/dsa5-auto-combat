import {describe, expect, it} from "vitest";
import {clampSegment, isExpired, parseDurationRounds, roundsLeft} from "../../src/rules/magic-walls";

describe("magic wall durations", () => {
  it("parses DSA5 duration texts into combat rounds", () => {
    expect(parseDurationRounds("QS x 10 KR", 3)).toBe(30);
    expect(parseDurationRounds("5 KR", 2)).toBe(5);
    expect(parseDurationRounds("QS Kampfrunden", 4)).toBe(4);
    expect(parseDurationRounds("QS Minuten", 2)).toBe(24);
    expect(parseDurationRounds("QS x 3 Minuten", 1)).toBe(36);
    expect(parseDurationRounds("2 combat rounds", 1)).toBe(2);
    expect(parseDurationRounds("QS x 3 in Tagen", 1)).toBe(3 * 86400 / 5);
  });

  it("treats maintained or unknown durations as never expiring", () => {
    expect(parseDurationRounds("aufrechterhaltend", 3)).toBeNull();
    expect(parseDurationRounds("sofort", 3)).toBeNull();
    expect(parseDurationRounds("", 3)).toBeNull();
  });

  it("knows when a wall expires", () => {
    const state = {spellId: "s", spellName: "Hexenknoten", casterTokenId: null, casterName: "N", startedRound: 4, durationRounds: 3, blocksSight: false, messageId: null};
    expect(isExpired(state, 6)).toBe(false);
    expect(isExpired(state, 7)).toBe(true);
    expect(roundsLeft(state, 5)).toBe(2);
    expect(isExpired({...state, durationRounds: null}, 999)).toBe(false);
    expect(roundsLeft({...state, durationRounds: null}, 5)).toBeNull();
  });

  it("clamps a segment to the allowed length", () => {
    expect(clampSegment({x: 0, y: 0}, {x: 1000, y: 0}, 5, 1 / 100)).toEqual({x: 500, y: 0});
    expect(clampSegment({x: 0, y: 0}, {x: 300, y: 0}, 5, 1 / 100)).toEqual({x: 300, y: 0});
    expect(clampSegment({x: 0, y: 0}, {x: 300, y: 0}, null, 1 / 100)).toEqual({x: 300, y: 0});
  });
});
