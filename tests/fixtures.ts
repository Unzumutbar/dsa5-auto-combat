import {BASE_DEFAULTS} from "../src/rules/defaults";
import type {CombatSnapshot, CombatantSnapshot, WeaponSnapshot} from "../src/types/snapshot";

let counter = 0;

export function weapon(overrides: Partial<WeaponSnapshot> = {}): WeaponSnapshot {
  return {
    itemId: `w${++counter}`, name: "Schwert", kind: "melee", at: 12, pa: 8, reach: "medium", rangeBands: null,
    ammoLeft: null, loadProgress: 0, loadTime: 0, damage: "1d6+4", isShield: false, worn: true, twoHanded: false, ...overrides
  };
}

export function combatant(overrides: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  const id = overrides.tokenId ?? `t${++counter}`;
  return {
    combatantId: `c-${id}`, tokenId: id, actorId: `a-${id}`, name: id, isPlayerOwned: false, disposition: "hostile",
    defeated: false, surrendered: false, hidden: false, pos: {i: 0, j: 0}, footprint: [{i: 0, j: 0}], center: {x: 50, y: 50}, sizeCells: 1, size: "average", elevation: 0,
    lep: {value: 30, max: 30}, asp: {value: 0, max: 0}, kap: {value: 0, max: 0}, movementAction: "walk", speed: 8, dodge: 6, armor: 0,
    conditions: {}, pain: 0, actionCount: 1, bonusActions: 0,
    round: {actionsUsed: 0, freeActionUsed: false, defenseCount: 0, movementActionConsumed: false},
    weapons: [weapon()], stowedWeapons: [], hasQuickdraw: false, casting: null, inHazardIds: [], spells: [], maneuvers: [], activeEffectNames: [], buffsCast: [], settings: {...BASE_DEFAULTS}, grudges: [], currentTargetTokenId: null,
    ...overrides
  };
}

export interface SnapshotOptions {
  distances?: Record<string, Record<string, number>>;
  los?: Record<string, Record<string, boolean>>;
  adjacent?: Record<string, Record<string, boolean>>;
  round?: number;
}

/** Builds symmetric distance/los/adjacency matrices from footprint positions (Chebyshev, 5 units per cell). */
export function snapshot(combatants: CombatantSnapshot[], options: SnapshotOptions = {}): CombatSnapshot {
  const distances: Record<string, Record<string, number>> = {};
  const los: Record<string, Record<string, boolean>> = {};
  const adjacent: Record<string, Record<string, boolean>> = {};
  for (const a of combatants) {
    distances[a.tokenId] = {};
    los[a.tokenId] = {};
    adjacent[a.tokenId] = {};
    for (const b of combatants) {
      if (a === b) continue;
      const di = Math.abs(a.pos.i - b.pos.i);
      const dj = Math.abs(a.pos.j - b.pos.j);
      distances[a.tokenId]![b.tokenId] = options.distances?.[a.tokenId]?.[b.tokenId] ?? Math.max(di, dj) * 5;
      los[a.tokenId]![b.tokenId] = options.los?.[a.tokenId]?.[b.tokenId] ?? true;
      adjacent[a.tokenId]![b.tokenId] = options.adjacent?.[a.tokenId]?.[b.tokenId] ?? Math.max(di, dj) <= 1;
    }
  }
  return {
    combatId: "combat1", round: options.round ?? 1, turn: 0, sceneId: "scene1", gridType: "square", gridSize: 100, gridDistance: 5, gridUnits: "Schritt",
    combatants, distances, los, adjacent, hazards: []
  };
}
