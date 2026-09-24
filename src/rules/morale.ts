import type {ExplainEntry} from "../types/plan";
import type {CombatSnapshot, CombatantSnapshot} from "../types/snapshot";
import {isAlly} from "./faction";
import {isAlive} from "./targeting";

export const GROUP_MORALE_MALUS = 25;

export interface GroupMorale {
  /** Added to the flee threshold (percent points). */
  malus: number;
  reason: ExplainEntry | null;
}

/**
 * Group morale breaks when a leader of the faction has fallen or more than half of the faction is down.
 * Player-owned tokens never count as faction members (they do not flee automatically anyway).
 */
export function groupMorale(snapshot: CombatSnapshot, self: CombatantSnapshot): GroupMorale {
  if (self.settings.immuneToGroupMorale) return {malus: 0, reason: null};
  const faction = snapshot.combatants.filter(o => !o.isPlayerOwned && (o.tokenId === self.tokenId || isAlly(self, o)));
  const out = (o: CombatantSnapshot) => !isAlive(o) || o.surrendered;
  const fallenLeader = faction.find(o => o.settings.isLeader && out(o) && o.tokenId !== self.tokenId);
  if (fallenLeader) return {malus: GROUP_MORALE_MALUS, reason: {key: "Explain.Flee.groupLeader", params: {name: fallenLeader.name}}};
  const down = faction.filter(out).length;
  if (faction.length >= 2 && down * 2 > faction.length) {
    return {malus: GROUP_MORALE_MALUS, reason: {key: "Explain.Flee.groupLosses", params: {down, total: faction.length}}};
  }
  return {malus: 0, reason: null};
}

/** Effective flee threshold including group morale. */
export function fleeThreshold(snapshot: CombatSnapshot, self: CombatantSnapshot): {threshold: number; reason: ExplainEntry | null} {
  const base = self.settings.fleeThresholdPct;
  const morale = groupMorale(snapshot, self);
  if (morale.malus === 0) return {threshold: base, reason: null};
  return {threshold: Math.min(100, base + morale.malus), reason: morale.reason};
}
