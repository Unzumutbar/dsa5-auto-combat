import type {CombatSnapshot, CombatantSnapshot} from "../types/snapshot";
import {isEnemy} from "./faction";
import {isMeleeWeapon} from "./reach";
import {isAlive} from "./targeting";

const CANNOT_ACT = ["incapacitated", "unconscious", "paralysed", "surprised", "rooted"];

/** A combatant able to deliver a Passierschlag: alive, able to act, with something to hit with. */
export function canOpportunityAttack(attacker: CombatantSnapshot): boolean {
  if (!isAlive(attacker) || attacker.hidden) return false;
  if (CANNOT_ACT.some(id => (attacker.conditions[id] ?? 0) > 0)) return false;
  return attacker.weapons.some(isMeleeWeapon);
}

/**
 * DSA5 Passierschlag: whoever leaves the melee reach of an enemy grants that enemy a free attack.
 * `adjacentBefore`/`adjacentAfter` map enemy token ids to wall-aware adjacency with the mover before
 * and after the movement. Returns the token ids entitled to a Passierschlag.
 */
export function detectProvoked(snapshot: CombatSnapshot, moverId: string, adjacentBefore: Record<string, boolean>, adjacentAfter: Record<string, boolean>): string[] {
  const mover = snapshot.combatants.find(c => c.tokenId === moverId);
  if (!mover) return [];
  return snapshot.combatants
    .filter(other => other.tokenId !== moverId)
    .filter(other => isEnemy(other, mover) || isEnemy(mover, other))
    .filter(other => canOpportunityAttack(other))
    .filter(other => adjacentBefore[other.tokenId] === true && adjacentAfter[other.tokenId] !== true)
    .map(other => other.tokenId);
}

/** Planner helper: enemies currently adjacent to `self` that would no longer be adjacent at the end of a move. */
export function provokedByMove(snapshot: CombatSnapshot, self: CombatantSnapshot, adjacentAtEnd: (enemy: CombatantSnapshot) => boolean): string[] {
  return snapshot.combatants
    .filter(other => other.tokenId !== self.tokenId && isEnemy(other, self) && canOpportunityAttack(other))
    .filter(other => snapshot.adjacent[self.tokenId]?.[other.tokenId] === true && !adjacentAtEnd(other))
    .map(other => other.tokenId);
}
