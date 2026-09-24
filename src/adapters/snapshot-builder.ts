import {FLAGS, MODULE_ID} from "../config";
import {dispositionFromValue} from "../rules/disposition";
import type {CombatSnapshot, CombatantSnapshot, GridPos, GridType, PairMatrix, Point, SpellSnapshot} from "../types/snapshot";
import {TokenGeometry} from "./geometry";
import {FoundryGridGraph} from "./grid-adapter";
import {CastingStateAdapter} from "./casting-state";
import {HazardAdapter} from "./hazards";
import {SurrenderAdapter} from "./surrender";
import {expectedQualityStep, expectedValue} from "../rules/spells/formula-ev";
import {hazardsUnder, indexHazards} from "../rules/hazards";
import {TokenSettingsAdapter} from "./token-settings";
import {ManeuversAdapter} from "./maneuvers";
import {WeaponsAdapter} from "./weapons";

const CONDITION_IDS = [
  "incapacitated", "unconscious", "prone", "rooted", "fixated", "paralysed", "stunned", "feared", "confused",
  "surprised", "burning", "bloodrush", "encumbered", "blind", "deaf", "mute", "constricted", "invisible"
];

const SPELL_TYPES = new Set(["spell", "liturgy", "ritual", "ceremony"]);

function gridType(): GridType {
  if (canvas.grid.isGridless) return "gridless";
  if (canvas.grid.isHexagonal) return "hex";
  return "square";
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export class SnapshotBuilder {
  static build(combat: any): CombatSnapshot {
    const scene = canvas.scene;
    const hazards = HazardAdapter.collect(scene);
    const hazardIndex = indexHazards(hazards);
    const combatants: CombatantSnapshot[] = [];
    for (const combatant of combat.combatants) {
      const tokenDoc = combatant.token;
      if (!tokenDoc || tokenDoc.parent?.id !== scene?.id || !tokenDoc.object || !combatant.actor) continue;
      const snap = this.buildCombatant(combatant, tokenDoc);
      snap.inHazardIds = hazardsUnder(hazardIndex, snap.footprint).ids;
      combatants.push(snap);
    }
    const distances: PairMatrix<number> = {};
    const los: PairMatrix<boolean> = {};
    const adjacent: PairMatrix<boolean> = {};
    for (const a of combatants) {
      distances[a.tokenId] = {};
      los[a.tokenId] = {};
      adjacent[a.tokenId] = {};
      for (const b of combatants) {
        if (a === b) continue;
        distances[a.tokenId]![b.tokenId] = this.distance(a, b);
        los[a.tokenId]![b.tokenId] = this.lineOfSight(a, b);
        adjacent[a.tokenId]![b.tokenId] = this.adjacent(a, b);
      }
    }
    return {
      combatId: combat.id,
      round: combat.round ?? 0,
      turn: combat.turn ?? 0,
      sceneId: scene?.id ?? "",
      gridType: gridType(),
      gridSize: canvas.grid.size,
      gridDistance: canvas.grid.distance,
      gridUnits: canvas.grid.units ?? scene?.grid?.units ?? "",
      combatants,
      distances,
      los,
      adjacent,
      hazards
    };
  }

  static buildCombatant(combatant: any, tokenDoc: any): CombatantSnapshot {
    const actor = combatant.actor;
    const status = actor.system.status ?? {};
    const center: Point = TokenGeometry.center(tokenDoc);
    const footprint: GridPos[] = TokenGeometry.footprint(tokenDoc);
    const pos = FoundryGridGraph.anchorOf(tokenDoc);
    const conditions: Record<string, number> = {};
    for (const id of CONDITION_IDS) {
      const level = num(actor.system.condition?.[id]) || (actor.hasCondition?.(id) ? 1 : 0);
      if (level > 0) conditions[id] = level;
    }
    const round = combatant.system ?? {};
    const movementAction = String(tokenDoc.movementAction ?? tokenDoc._inferMovementAction?.() ?? "walk");
    return {
      combatantId: combatant.id,
      tokenId: tokenDoc.id,
      actorId: actor.id,
      name: tokenDoc.name ?? actor.name,
      isPlayerOwned: !combatant.isNPC,
      disposition: dispositionFromValue(tokenDoc.disposition),
      defeated: Boolean(combatant.isDefeated),
      surrendered: SurrenderAdapter.isSurrendered(actor),
      hidden: Boolean(tokenDoc.hidden),
      pos: {i: pos.i, j: pos.j},
      footprint,
      center,
      sizeCells: Math.max(num(tokenDoc.width, 1), num(tokenDoc.height, 1)),
      size: String(status.size?.value ?? "average"),
      elevation: num(tokenDoc.elevation),
      lep: {value: num(status.wounds?.value), max: num(status.wounds?.max)},
      asp: {value: num(status.astralenergy?.value), max: num(status.astralenergy?.max)},
      kap: {value: num(status.karmaenergy?.value), max: num(status.karmaenergy?.max)},
      movementAction,
      speed: num(actor.speedByMovementType?.(movementAction) ?? status.speed?.max ?? status.speed?.value),
      dodge: num(status.dodge?.max ?? status.dodge?.value),
      armor: this.armor(actor),
      conditions,
      pain: num(actor.system.condition?.inpain),
      actionCount: num(actor.system.actionCount?.value, 1) || 1,
      bonusActions: num(actor.system.combat?.bonusActions),
      round: {
        actionsUsed: num(round.actionsUsed),
        freeActionUsed: Boolean(round.freeActionUsed),
        defenseCount: num(round.defenseCount),
        movementActionConsumed: Boolean(round.movementActionConsumed)
      },
      weapons: WeaponsAdapter.list(actor),
      stowedWeapons: WeaponsAdapter.stowed(actor),
      hasQuickdraw: WeaponsAdapter.hasQuickdraw(actor),
      casting: CastingStateAdapter.read(tokenDoc),
      inHazardIds: [],
      spells: this.spells(actor),
      maneuvers: ManeuversAdapter.list(actor),
      activeEffectNames: Array.from(actor.effects ?? []).map((e: any) => String(e.name)),
      buffsCast: Array.isArray(tokenDoc.getFlag(MODULE_ID, FLAGS.buffsCast)) ? [...tokenDoc.getFlag(MODULE_ID, FLAGS.buffsCast)] : [],
      settings: TokenSettingsAdapter.resolve(tokenDoc).settings,
      grudges: Array.isArray(tokenDoc.getFlag(MODULE_ID, FLAGS.grudges)) ? [...tokenDoc.getFlag(MODULE_ID, FLAGS.grudges)] : [],
      currentTargetTokenId: tokenDoc.getFlag(MODULE_ID, FLAGS.currentTarget) ?? null
    };
  }

  static armor(actor: any): number {
    try {
      return num(game.dsa5?.entities?.Actordsa5?.armorValue?.(actor)?.armor);
    } catch {
      return 0;
    }
  }

  static spellAttributes(actor: any, s: any): number[] {
    return [s.characteristic1?.value, s.characteristic2?.value, s.characteristic3?.value].map(key => num(actor.system.characteristics?.[String(key)]?.value));
  }

  /** Size of a DSA5 area spell in scene units (QS estimated from the skill value). */
  static spellArea(s: any): number | null {
    const type = String(s.target?.type ?? "");
    if (!type || !(type in (game.dsa5?.config?.areaTargetTypes ?? {}))) return null;
    const value = expectedValue(String(s.target?.value ?? "0"), expectedQualityStep(num(s.talentValue?.value)));
    return value > 0 ? value : null;
  }

  static spells(actor: any): SpellSnapshot[] {
    const result: SpellSnapshot[] = [];
    for (const item of actor.items) {
      if (!SPELL_TYPES.has(item.type)) continue;
      const s = item.system;
      result.push({
        itemId: item.id,
        name: item.name,
        type: item.type,
        cost: num(s.AsPCost?.value),
        costType: item.type === "liturgy" || item.type === "ceremony" ? "KaP" : "AsP",
        rangeText: String(s.range?.value ?? ""),
        castingTime: num(s.castingTime?.value, 1) || 1,
        castingProgress: num(s.castingTime?.progress),
        effectFormula: String(s.effectFormula?.value ?? "").trim(),
        targetCategory: String(s.targetCategory?.value ?? ""),
        feature: String(s.feature ?? ""),
        talentValue: num(s.talentValue?.value),
        attributes: this.spellAttributes(actor, s),
        area: this.spellArea(s),
        overrideRole: item.getFlag(MODULE_ID, FLAGS.spellRole) ?? null
      });
    }
    return result;
  }

  static distance(a: CombatantSnapshot, b: CombatantSnapshot): number {
    const planar = canvas.grid.measurePath([a.center, b.center]).distance;
    const elevation = Math.abs(a.elevation - b.elevation);
    return elevation ? Math.hypot(planar, elevation) : planar;
  }

  static lineOfSight(a: CombatantSnapshot, b: CombatantSnapshot): boolean {
    try {
      const blocked = CONFIG.Canvas.polygonBackends.sight.testCollision(
        {x: a.center.x, y: a.center.y, elevation: a.elevation},
        {x: b.center.x, y: b.center.y, elevation: b.elevation},
        {type: "sight", mode: "any"}
      );
      return !blocked;
    } catch {
      return true;
    }
  }

  /** Melee adjacency: footprints touch and no movement-blocking wall runs between the token centers. */
  static adjacent(a: CombatantSnapshot, b: CombatantSnapshot): boolean {
    let touching = false;
    if (a.footprint.length && b.footprint.length) {
      touching = a.footprint.some(fa => b.footprint.some(fb => canvas.grid.testAdjacency(fa, fb)));
    } else {
      const reach = ((a.sizeCells + b.sizeCells) / 2) * canvas.grid.distance * 1.05;
      touching = this.distance(a, b) <= reach;
    }
    if (!touching) return false;
    return !TokenGeometry.wallBetweenPoints({x: a.center.x, y: a.center.y, elevation: a.elevation}, {x: b.center.x, y: b.center.y, elevation: b.elevation});
  }
}
