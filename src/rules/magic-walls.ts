import type {Point} from "../types/snapshot";
import {expectedValue} from "./spells/formula-ev";

/** Data stored on a wall document created for a spell. */
export interface MagicWallState {
  spellId: string;
  spellName: string;
  casterTokenId: string | null;
  casterName: string;
  /** Combat round in which the wall was raised (0 when out of combat). */
  startedRound: number;
  /** Duration in combat rounds; null = maintained / unknown → never expires automatically. */
  durationRounds: number | null;
  blocksSight: boolean;
  messageId: string | null;
}

export type WallKind = "invisible" | "opaque";

const UNIT_ROUNDS: [RegExp, (secondsPerRound: number) => number][] = [
  [/\b(kr|kampfrunden?|combat rounds?|crs?)\b/i, () => 1],
  [/\b(min|minuten?|minutes?)\b/i, s => 60 / s],
  [/\b(stunden?|hours?|h)\b/i, s => 3600 / s],
  [/\b(tagen?|days?)\b/i, s => 86400 / s]
];

/**
 * Turns a DSA5 duration text ("QS x 10 KR", "QS Minuten", "5 KR") into combat rounds. Maintained
 * spells ("aufrechterhaltend") and unparseable texts yield null; the module then never expires the wall.
 */
export function parseDurationRounds(text: string, qualityStep: number, secondsPerRound = 5): number | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const unit = UNIT_ROUNDS.find(([regex]) => regex.test(raw));
  if (!unit) return null;
  const formula = raw
    .replace(unit[0], " ")
    .replace(/\bin\b/gi, " ")
    .replace(/\s*x\s*/gi, "*")
    .replace(/[^\d+\-*/().qsQS]/g, "")
    .trim();
  if (!formula) return null;
  const value = expectedValue(formula, Math.max(1, qualityStep));
  if (value <= 0) return null;
  return Math.max(1, Math.round(value * unit[1](secondsPerRound)));
}

export function expiresRound(state: MagicWallState): number | null {
  return state.durationRounds === null ? null : state.startedRound + state.durationRounds;
}

export function isExpired(state: MagicWallState, round: number): boolean {
  const end = expiresRound(state);
  return end !== null && round >= end;
}

export function roundsLeft(state: MagicWallState, round: number): number | null {
  const end = expiresRound(state);
  return end === null ? null : Math.max(0, end - round);
}

/** Shortens the segment a→b so that its length does not exceed `maxUnits` (scene units). */
export function clampSegment(a: Point, b: Point, maxUnits: number | null, unitsPerPixel: number): Point {
  if (maxUnits === null || maxUnits <= 0) return b;
  const length = Math.hypot(b.x - a.x, b.y - a.y) * unitsPerPixel;
  if (length <= maxUnits) return b;
  const t = maxUnits / length;
  return {x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t)};
}
