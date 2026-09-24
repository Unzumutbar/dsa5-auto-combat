export type AttackKind = "melee" | "ranged" | "spell";

export interface ParryOption {
  /** Item id of the parrying weapon/trait, or "weaponless". */
  itemId: string;
  name: string;
  pa: number;
  isShield: boolean;
}

export interface DefenseInput {
  dodgeValue: number;
  parryOptions: ParryOption[];
  /** Defenses already made this round. */
  defenseCount: number;
  /** Per-defense malus for multiple defenses (DSA5 default -3). */
  multipleDefenseValue: number;
  /** Additive malus inherited from the attack (e.g. -4 for ranged/spell attacks). */
  inheritedMalus: number;
  /** Attacker scored a critical hit: defense value halved. */
  halfDefense: boolean;
  /** Defender cannot act at all (unconscious, paralysed, surprised ...). */
  cannotDefend: boolean;
  attackKind: AttackKind;
  /** Attacker stands in melee reach (parry with a weapon only makes sense then). */
  attackerAdjacent: boolean;
  settings: {
    declineHopelessDefense: boolean;
    dodgeOnlyVsRanged: boolean;
    hopelessThreshold?: number;
  };
}

export type DefenseDecision =
  | {kind: "parry"; itemId: string; name: string; effective: number}
  | {kind: "dodge"; effective: number}
  | {kind: "none"; reason: "cannotDefend" | "hopeless" | "noOption"};

export function effectiveDefense(base: number, input: DefenseInput): number {
  const raw = base + input.defenseCount * input.multipleDefenseValue + input.inheritedMalus;
  return Math.floor(input.halfDefense ? raw / 2 : raw);
}

/** Picks the defense with the best effective value. Ties: shield parry > weapon parry > dodge. */
export function decideDefense(input: DefenseInput): DefenseDecision {
  if (input.cannotDefend) return {kind: "none", reason: "cannotDefend"};
  const candidates: {decision: DefenseDecision; value: number; rank: number}[] = [];
  candidates.push({decision: {kind: "dodge", effective: effectiveDefense(input.dodgeValue, input)}, value: effectiveDefense(input.dodgeValue, input), rank: 0});
  const parryAllowed = input.attackKind === "melee" ? input.attackerAdjacent : !input.settings.dodgeOnlyVsRanged;
  if (parryAllowed) {
    for (const option of input.parryOptions) {
      if (option.pa <= 0) continue;
      if (input.attackKind !== "melee" && !option.isShield && input.settings.dodgeOnlyVsRanged) continue;
      const value = effectiveDefense(option.pa, input);
      candidates.push({decision: {kind: "parry", itemId: option.itemId, name: option.name, effective: value}, value, rank: option.isShield ? 2 : 1});
    }
  }
  if (candidates.length === 0) return {kind: "none", reason: "noOption"};
  candidates.sort((a, b) => b.value - a.value || b.rank - a.rank);
  const best = candidates[0]!;
  const threshold = input.settings.hopelessThreshold ?? 1;
  if (input.settings.declineHopelessDefense && best.value < threshold) return {kind: "none", reason: "hopeless"};
  return best.decision;
}
