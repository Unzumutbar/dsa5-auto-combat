import type {WeaponSnapshot} from "../types/snapshot";

export function isMeleeWeapon(w: WeaponSnapshot): boolean {
  return w.kind === "melee" || w.kind === "trait-melee" || w.kind === "weaponless";
}

export function isRangedWeapon(w: WeaponSnapshot): boolean {
  return w.kind === "ranged" || w.kind === "trait-ranged";
}

export function bestMeleeWeapon(weapons: WeaponSnapshot[]): WeaponSnapshot | null {
  return weapons.filter(isMeleeWeapon).filter(w => !w.isShield || weapons.filter(isMeleeWeapon).length === 1)
    .sort((a, b) => b.at - a.at)[0] ?? null;
}

export function bestParryWeapon(weapons: WeaponSnapshot[]): WeaponSnapshot | null {
  return weapons.filter(isMeleeWeapon).filter(w => w.pa > 0).sort((a, b) => b.pa - a.pa || Number(b.isShield) - Number(a.isShield))[0] ?? null;
}

/** Largest reach among the melee weapons a defender could parry with (drives the attacker's reach modifier). */
export function largestReach(weapons: WeaponSnapshot[]): "short" | "medium" | "long" {
  const order = {short: 0, medium: 1, long: 2} as const;
  let best: "short" | "medium" | "long" = "short";
  for (const w of weapons) if (isMeleeWeapon(w) && order[w.reach] > order[best]) best = w.reach;
  return best;
}
