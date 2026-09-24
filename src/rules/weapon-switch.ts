import type {Action} from "../types/plan";
import type {TokenAutomationSettings} from "../types/settings";
import type {CombatantSnapshot, WeaponSnapshot} from "../types/snapshot";
import type {ActionBudget} from "./budget";
import {bandFor, hasAmmo} from "./range-bands";
import {isMeleeWeapon, isRangedWeapon} from "./reach";

export type SwitchAction = Extract<Action, {type: "switchWeapon"}>;

export interface SwitchPlan {
  action: SwitchAction;
  /** Worn weapons after the switch. */
  weapons: WeaponSnapshot[];
}

const isItemWeapon = (w: WeaponSnapshot) => w.kind === "melee" || w.kind === "ranged";

/**
 * Equips `weapon` and frees the hands it needs: ranged weapons and two-handed weapons displace
 * everything else, a one-handed weapon keeps a shield (or one other one-handed weapon) in the off hand.
 */
export function switchTo(self: CombatantSnapshot, weapon: WeaponSnapshot): SwitchPlan {
  const worn = self.weapons.filter(isItemWeapon);
  let unequip: WeaponSnapshot[];
  if (isRangedWeapon(weapon) || weapon.twoHanded) {
    unequip = worn;
  } else {
    unequip = worn.filter(w => isRangedWeapon(w) || w.twoHanded);
    const offHand = worn.filter(w => !unequip.includes(w)).sort((a, b) => Number(b.isShield) - Number(a.isShield) || b.pa - a.pa);
    unequip = [...unequip, ...offHand.slice(1)];
  }
  const kept = self.weapons.filter(w => !unequip.includes(w));
  const equipped: WeaponSnapshot = {...weapon, worn: true};
  return {
    action: {
      type: "switchWeapon", weaponId: weapon.itemId, weaponName: weapon.name,
      equipIds: [weapon.itemId], unequipIds: unequip.map(w => w.itemId), costsAction: !self.hasQuickdraw
    },
    weapons: [...kept, equipped]
  };
}

export interface SwitchInput {
  self: CombatantSnapshot;
  target: CombatantSnapshot;
  adjacent: boolean;
  distance: number;
  los: boolean;
  settings: TokenAutomationSettings;
  budget: ActionBudget;
  /** Scene units per grid space (reach margin for the "cannot get there" test). */
  gridDistance: number;
  /** GM forced a stowed weapon: switch whenever it is usable at all. */
  force?: boolean;
}

const bestStowed = (self: CombatantSnapshot, filter: (w: WeaponSnapshot) => boolean) =>
  self.stowedWeapons.filter(filter).sort((a, b) => b.at - a.at)[0] ?? null;

/**
 * Draws a stowed weapon when the worn ones do not fit the situation: a shooter caught in melee draws a
 * blade, a melee fighter whose target stays out of reach this turn (or who holds position) readies a ranged weapon.
 */
export function planWeaponSwitch(input: SwitchInput): SwitchPlan | null {
  const {self, settings, budget} = input;
  if (budget.actions <= 0 || self.stowedWeapons.length === 0) return null;
  const wornMelee = self.weapons.filter(w => isMeleeWeapon(w) && w.kind !== "weaponless");
  // A ranged weapon without ammunition is dead weight: it neither counts as usable nor blocks a switch.
  const wornRanged = self.weapons.filter(w => isRangedWeapon(w) && hasAmmo(w));
  const stowedMelee = bestStowed(self, w => isMeleeWeapon(w));
  const stowedRanged = bestStowed(self, w => isRangedWeapon(w) && hasAmmo(w) && Boolean(w.rangeBands) && (input.force || bandFor(input.distance, w.rangeBands!) !== null));

  if (input.force) {
    const forced = self.stowedWeapons[0]!;
    if (isMeleeWeapon(forced)) return switchTo(self, forced);
    return stowedRanged ? switchTo(self, stowedRanged) : null;
  }
  if (input.adjacent) {
    if (wornMelee.length === 0 && stowedMelee) return switchTo(self, stowedMelee);
    return null;
  }
  // Nothing usable in hand (e.g. the quiver is empty): draw the blade and close in.
  if (wornMelee.length === 0 && wornRanged.length === 0 && stowedMelee && !stowedRanged) return switchTo(self, stowedMelee);
  if (!settings.useRanged || wornRanged.length > 0 || !stowedRanged || !input.los) return null;
  const unreachable = input.distance > budget.freeMove + budget.runMove + input.gridDistance;
  if (settings.holdPosition || unreachable || wornMelee.length === 0) return switchTo(self, stowedRanged);
  return null;
}
