import type {CombatantSnapshot} from "../types/snapshot";

/** Whom does `self` fight? Player-owned tokens count as the party regardless of disposition. */
export function isEnemy(self: CombatantSnapshot, other: CombatantSnapshot): boolean {
  if (self.tokenId === other.tokenId) return false;
  if (self.grudges.includes(other.tokenId)) return true;
  switch (self.disposition) {
    case "hostile":
      return other.isPlayerOwned || other.disposition === "friendly";
    case "friendly":
      return !other.isPlayerOwned && other.disposition === "hostile";
    default:
      return false;
  }
}

/** Whom does `self` protect, heal and buff? */
export function isAlly(self: CombatantSnapshot, other: CombatantSnapshot): boolean {
  if (self.tokenId === other.tokenId) return false;
  if (self.grudges.includes(other.tokenId)) return false;
  switch (self.disposition) {
    case "hostile":
      return !other.isPlayerOwned && other.disposition === "hostile";
    case "friendly":
      return other.isPlayerOwned || other.disposition === "friendly";
    default:
      return false;
  }
}

export function isPassiveDisposition(self: CombatantSnapshot): boolean {
  return (self.disposition === "neutral" || self.disposition === "secret") && self.grudges.length === 0;
}
