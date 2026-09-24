import type {ManeuverSnapshot} from "../types/snapshot";
import {attackOdds} from "./odds";

export interface ManeuverModifier {
  name: string;
  value: number;
  damageBonus?: number;
  dmmalus?: number;
  step: number;
  ref: {id: string};
  selected: true;
  [key: string]: unknown;
}

export interface ManeuverChoice {
  kind: "wuchtschlag" | "finte";
  name: string;
  step: number;
  itemId: string;
  modifier: ManeuverModifier;
  /** Expected damage with the maneuver, for the card. */
  expectedDamage: number;
}

export interface ManeuverInput {
  /** Attack value of the chosen weapon. */
  at: number;
  /** Best defense value the target can muster (parry or dodge). */
  targetDefense: number;
  maneuvers: ManeuverSnapshot[];
  useManeuvers: boolean;
  /** Average damage of the weapon before armor; defaults to a one-handed weapon (1W6+3). */
  avgDamage?: number;
  armor?: number;
  defenseCount?: number;
}

/** A maneuver must raise the expected damage by at least this factor to be worth the risk. */
export const MANEUVER_GAIN_FACTOR = 1.05;

/**
 * DSA5 basic maneuvers: Wuchtschlag (−2 AT / +2 TP per step) and Finte (−1 AT / −1 opponent defense
 * per step). The planner picks the step with the highest expected damage against this defender and
 * armor; without a clear gain the plain attack stays.
 */
export function chooseManeuver(input: ManeuverInput): ManeuverChoice | null {
  if (!input.useManeuvers) return null;
  const avgDamage = input.avgDamage ?? 6.5;
  const armor = input.armor ?? 0;
  const defenseCount = input.defenseCount ?? 0;
  const odds = (attack: number, defense: number, damageBonus: number) => attackOdds({attack, defense, defenseCount, avgDamage, damageBonus, armor}).expectedDamage;
  const baseline = odds(input.at, input.targetDefense, 0);
  let best: ManeuverChoice | null = null;
  const consider = (candidate: ManeuverChoice) => {
    if (candidate.expectedDamage < baseline * MANEUVER_GAIN_FACTOR) return;
    if (!best || candidate.expectedDamage > best.expectedDamage) best = candidate;
  };
  const wuchtschlag = input.maneuvers.find(m => m.kind === "wuchtschlag");
  if (wuchtschlag) {
    for (let step = 1; step <= wuchtschlag.maxStep; step++) {
      if (input.at - 2 * step < 1) break;
      consider({
        kind: "wuchtschlag", name: wuchtschlag.name, step, itemId: wuchtschlag.itemId,
        modifier: {name: wuchtschlag.name, value: -2 * step, damageBonus: 2 * step, step, ref: {id: wuchtschlag.itemId}, selected: true},
        expectedDamage: odds(input.at - 2 * step, input.targetDefense, 2 * step)
      });
    }
  }
  const finte = input.maneuvers.find(m => m.kind === "finte");
  if (finte) {
    for (let step = 1; step <= finte.maxStep; step++) {
      if (input.at - step < 1) break;
      consider({
        kind: "finte", name: finte.name, step, itemId: finte.itemId,
        modifier: {name: finte.name, value: -step, dmmalus: -step, step, ref: {id: finte.itemId}, selected: true},
        expectedDamage: odds(input.at - step, input.targetDefense - step, 0)
      });
    }
  }
  return best;
}

export function romanStep(step: number): string {
  return ["", "I", "II", "III", "IV", "V"][step] ?? String(step);
}
