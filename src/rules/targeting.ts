import type {TargetCandidate} from "../types/plan";
import type {TargetRule} from "../types/settings";
import type {CombatSnapshot, CombatantSnapshot} from "../types/snapshot";
import {isAlly, isEnemy} from "./faction";
import {LEADER_TARGET_BONUS, leaderTarget} from "./group";

export interface TargetingInput {
  snapshot: CombatSnapshot;
  self: CombatantSnapshot;
  rule: TargetRule;
  forcedTargetTokenId?: string | null;
  /** World default for the focus limit; the token setting overrides it. */
  focusLimit?: number;
}

/** Allied automated NPCs (excluding self) currently locked onto `targetId`. */
export function alliesFocusing(snapshot: CombatSnapshot, self: CombatantSnapshot, targetId: string): number {
  return snapshot.combatants.filter(o => o.tokenId !== self.tokenId && !o.isPlayerOwned && isAlly(self, o) && isAlive(o) && !o.surrendered && o.currentTargetTokenId === targetId).length;
}

export function isAlive(c: CombatantSnapshot): boolean {
  return !c.defeated && (c.lep.max <= 0 || c.lep.value > 0);
}

/** FNV-1a hash, deterministic so a re-rendered card keeps its random pick. */
export function hashSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function threatScore(c: CombatantSnapshot): number {
  const bestAt = c.weapons.reduce((max, w) => Math.max(max, w.at), 0);
  const casterBonus = c.spells.length > 0 ? 4 : 0;
  return bestAt + casterBonus;
}

export function distanceBetween(snapshot: CombatSnapshot, a: string, b: string): number {
  return snapshot.distances[a]?.[b] ?? Number.POSITIVE_INFINITY;
}

export function hasLineOfSight(snapshot: CombatSnapshot, a: string, b: string): boolean {
  return snapshot.los[a]?.[b] ?? true;
}

export function areAdjacent(snapshot: CombatSnapshot, a: string, b: string): boolean {
  return snapshot.adjacent[a]?.[b] ?? false;
}

function describe(input: TargetingInput, other: CombatantSnapshot): TargetCandidate {
  const {snapshot, self, rule} = input;
  const distance = distanceBetween(snapshot, self.tokenId, other.tokenId);
  const reachable = areAdjacent(snapshot, self.tokenId, other.tokenId) || hasLineOfSight(snapshot, self.tokenId, other.tokenId);
  const reasons: string[] = [];
  if (!isAlive(other)) reasons.push("Explain.Target.downed");
  let score: number;
  switch (rule) {
    case "weakest":
      score = -other.lep.value;
      reasons.push("Explain.Target.weakest");
      break;
    case "highestThreat":
      score = threatScore(other);
      reasons.push("Explain.Target.threat");
      break;
    case "random":
      score = hashSeed(snapshot.combatId, snapshot.round, self.tokenId, other.tokenId) % 1000;
      reasons.push("Explain.Target.random");
      break;
    default:
      score = -distance;
      reasons.push("Explain.Target.nearest");
  }
  if (!reachable) reasons.push("Explain.Target.noLos");
  const leaders = leaderTarget(snapshot, self);
  const leaderPick = leaders !== null && leaders === other.tokenId;
  if (leaderPick) {
    score += LEADER_TARGET_BONUS;
    reasons.push("Explain.Target.leader");
  }
  const sticky = other.tokenId === self.currentTargetTokenId;
  if (sticky) reasons.unshift("Explain.Target.sticky");
  const limit = (self.settings.focusLimit ?? input.focusLimit ?? Number.POSITIVE_INFINITY) + (leaderPick ? 1 : 0);
  const crowded = alliesFocusing(snapshot, self, other.tokenId) >= limit;
  if (crowded) reasons.push("Explain.Target.crowded");
  const protege = self.settings.protegeTokenId;
  const threatensProtege = Boolean(protege) && (other.currentTargetTokenId === protege || snapshot.adjacent[protege!]?.[other.tokenId] === true);
  if (threatensProtege) reasons.unshift("Explain.Target.protege");
  return {tokenId: other.tokenId, name: other.name, score, distance, reachable, sticky, crowded, threatensProtege, reasons};
}

function compare(a: TargetCandidate, b: TargetCandidate): number {
  if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
  const aDown = a.reasons.includes("Explain.Target.downed");
  const bDown = b.reasons.includes("Explain.Target.downed");
  if (aDown !== bDown) return aDown ? 1 : -1;
  if (a.threatensProtege !== b.threatensProtege) return a.threatensProtege ? -1 : 1;
  if (a.crowded !== b.crowded) return a.crowded ? 1 : -1;
  if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  if (a.distance !== b.distance) return a.distance - b.distance;
  return a.tokenId.localeCompare(b.tokenId);
}

/** Enemies sorted best-first; a forced target is always placed first. */
export function scoreCandidates(input: TargetingInput): TargetCandidate[] {
  const {snapshot, self, forcedTargetTokenId} = input;
  const candidates = snapshot.combatants
    .filter(other => isEnemy(self, other) && !other.hidden && !other.surrendered && (isAlive(other) || self.settings.attackDowned))
    .map(other => describe(input, other))
    .sort(compare);
  if (!forcedTargetTokenId) return candidates;
  const index = candidates.findIndex(c => c.tokenId === forcedTargetTokenId);
  if (index >= 0) {
    const [forced] = candidates.splice(index, 1);
    forced!.reasons.unshift("Explain.Target.forced");
    return [forced!, ...candidates];
  }
  const other = snapshot.combatants.find(c => c.tokenId === forcedTargetTokenId && c.tokenId !== self.tokenId);
  if (!other) return candidates;
  const forced = describe(input, other);
  forced.reasons = ["Explain.Target.forced", ...forced.reasons.filter(r => r === "Explain.Target.noLos")];
  return [forced, ...candidates];
}
