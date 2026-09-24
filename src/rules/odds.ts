import type {CombatantSnapshot} from "../types/snapshot";
import {bestParryWeapon, isMeleeWeapon} from "./reach";

/** DSA5 default malus per additional defense in the same round. */
export const MULTIPLE_DEFENSE_MALUS = -3;
/** Defending against a ranged attack (dodge or shield) is harder by 4 in this module's defense model. */
export const RANGED_DEFENSE_MALUS = -4;

export interface AttackOdds {
  /** Probability 0..1 that the attack lands (attack succeeds and the defense fails). */
  hitChance: number;
  /** Hit chance × damage after armor, in TP. */
  expectedDamage: number;
}

export interface AttackOddsInput {
  /** Effective attack value after all modifiers. */
  attack: number;
  /** Defender's best defense value before multiple-defense malus. */
  defense: number;
  defenseCount: number;
  avgDamage: number;
  damageBonus?: number;
  armor: number;
  /** false = the defender cannot react at all (unconscious, attack of opportunity ...). */
  canDefend?: boolean;
}

/** Chance that a d20 rolls at or below `value`: a 1 always succeeds, a 20 always fails. */
export function d20Chance(value: number): number {
  return Math.min(19, Math.max(1, Math.floor(value))) / 20;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Simplified DSA5 exchange: the attack roll must succeed and the defense roll must fail. Critical
 * confirmation and halved defenses are ignored, so the figures are estimates and shown as "≈".
 */
export function attackOdds(input: AttackOddsInput): AttackOdds {
  const pAttack = d20Chance(input.attack);
  const canDefend = input.canDefend ?? true;
  const pDefense = canDefend ? d20Chance(input.defense + input.defenseCount * MULTIPLE_DEFENSE_MALUS) : 0;
  const hit = pAttack * (1 - pDefense);
  const damage = Math.max(0, input.avgDamage + (input.damageBonus ?? 0) - input.armor);
  return {hitChance: round3(hit), expectedDamage: round1(hit * damage)};
}

/** Best defense value a target can bring against a melee or ranged attack. */
export function estimateDefense(target: CombatantSnapshot, kind: "melee" | "ranged"): number {
  if (kind === "melee") return Math.max(bestParryWeapon(target.weapons)?.pa ?? 0, target.dodge);
  const shield = target.weapons.filter(w => isMeleeWeapon(w) && w.isShield).sort((a, b) => b.pa - a.pa)[0];
  return Math.max(target.dodge, shield?.pa ?? 0) + RANGED_DEFENSE_MALUS;
}

/**
 * Exact success chance of a DSA5 3d20 skill check: each die above its attribute eats skill points,
 * two 1s always succeed, two 20s always fail. `modifier` eases (+) or hampers (−) every attribute.
 */
export function skillCheckChance(attributes: number[], skillValue: number, modifier = 0): number {
  const [a, b, c] = [0, 1, 2].map(i => (attributes[i] ?? 0) + modifier);
  let successes = 0;
  for (let r1 = 1; r1 <= 20; r1++) {
    for (let r2 = 1; r2 <= 20; r2++) {
      for (let r3 = 1; r3 <= 20; r3++) {
        const ones = Number(r1 === 1) + Number(r2 === 1) + Number(r3 === 1);
        const twenties = Number(r1 === 20) + Number(r2 === 20) + Number(r3 === 20);
        if (ones >= 2) {
          successes++;
          continue;
        }
        if (twenties >= 2) continue;
        const deficit = Math.max(0, r1 - a!) + Math.max(0, r2 - b!) + Math.max(0, r3 - c!);
        if (deficit <= skillValue) successes++;
      }
    }
  }
  return round3(successes / 8000);
}
