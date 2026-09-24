import type {WeaponSnapshot} from "../types/snapshot";
import {isRangedWeapon} from "./reach";

export type RangeBand = 0 | 1 | 2;

/** DSA5 range band modifiers (dialog-combat-dsa5.js RangeMod): short, medium, long. */
export const RANGE_BAND_MODIFIERS: Record<RangeBand, {attack: number; damage: number}> = {
  0: {attack: 2, damage: 1},
  1: {attack: 0, damage: 0},
  2: {attack: -2, damage: -1}
};

/** Band index for a distance, or null when the target is beyond the long range. */
export function bandFor(distance: number, bands: [number, number, number]): RangeBand | null {
  if (distance <= bands[0]) return 0;
  if (distance <= bands[1]) return 1;
  if (distance <= bands[2]) return 2;
  return null;
}

export function isLoaded(weapon: WeaponSnapshot): boolean {
  return weapon.loadTime <= 0 || weapon.loadProgress >= weapon.loadTime;
}

export function hasAmmo(weapon: WeaponSnapshot): boolean {
  return weapon.ammoLeft === null || weapon.ammoLeft > 0;
}

export interface RangedChoice {
  weapon: WeaponSnapshot;
  band: RangeBand;
  loaded: boolean;
  expectedAttack: number;
}

/** Best usable ranged weapon for a target at `distance`; loaded weapons win over unloaded ones. */
export function bestRangedWeapon(weapons: WeaponSnapshot[], distance: number): RangedChoice | null {
  const choices: RangedChoice[] = [];
  for (const weapon of weapons) {
    if (!isRangedWeapon(weapon) || !weapon.rangeBands || !hasAmmo(weapon)) continue;
    const band = bandFor(distance, weapon.rangeBands);
    if (band === null) continue;
    choices.push({weapon, band, loaded: isLoaded(weapon), expectedAttack: weapon.at + RANGE_BAND_MODIFIERS[band].attack});
  }
  choices.sort((a, b) => Number(b.loaded) - Number(a.loaded) || b.expectedAttack - a.expectedAttack);
  return choices[0] ?? null;
}

/** Minimum distance a ranged fighter wants to keep from melee enemies (one grid space beyond adjacency). */
export function keepDistanceUnits(gridDistance: number): number {
  return gridDistance * 2;
}
