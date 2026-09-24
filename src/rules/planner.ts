import type {Action, MoveReason, TurnPlan} from "../types/plan";
import type {TokenAutomationSettings} from "../types/settings";
import type {CombatSnapshot, CombatantSnapshot, GridPos, Point, WeaponSnapshot} from "../types/snapshot";
import {blockingCondition, canMove, computeBudget, lepPercent, type ActionBudget} from "./budget";
import {applyDropActions, type PlanConstraints} from "./constraints";
import {hazardName, pathHazardIds, relocate, withHazards} from "./hazards";
import {isEnemy, isPassiveDisposition} from "./faction";
import {provokedByMove} from "./opportunity";
import {findBestCell, findPath, simplifyPath, type GoalSpec, type PathResult} from "./pathfinding/astar";
import type {GridGraph} from "./pathfinding/grid-graph";
import {bandFor, bestRangedWeapon, isLoaded, RANGE_BAND_MODIFIERS, type RangeBand, type RangedChoice} from "./range-bands";
import {chooseManeuver} from "./maneuvers";
import {attackOdds, estimateDefense, skillCheckChance} from "./odds";
import {fleeThreshold} from "./morale";
import {escapeBlocked, surrenderDecision} from "./surrender";
import {chooseApproachCell} from "./group";
import {bestMeleeWeapon} from "./reach";
import {expectedValue} from "./spells/formula-ev";
import {castableSpells, chooseSpell, continueCasting, type SpellPlanContext} from "./spells/spell-selector";
import {areAdjacent, distanceBetween, hasLineOfSight, isAlive, scoreCandidates} from "./targeting";
import {planWeaponSwitch} from "./weapon-switch";

export interface PlanOptions {
  forcedTargetTokenId?: string | null;
  /** World setting: assumed range for spells whose range text cannot be parsed. */
  fallbackSpellRangeUnits?: number;
  /** Live map view for path search; without it the planner cannot move. */
  graph?: GridGraph | null;
  /** Token ids that do not block movement (e.g. defeated tokens). */
  passable?: string[];
  /** World default for the focus limit. */
  focusLimit?: number;
  /** GM adjustments from the preview card (forced weapon/spell/target, no movement, dropped actions). */
  constraints?: PlanConstraints;
}

interface Approach {
  move: Extract<Action, {type: "move"}> | null;
  reachesTarget: boolean;
  /** Position chosen for encirclement / blocking rather than the shortest path. */
  tactical?: boolean;
}

interface OffenseContext {
  snapshot: CombatSnapshot;
  self: CombatantSnapshot;
  target: CombatantSnapshot;
  budget: ActionBudget;
  settings: TokenAutomationSettings;
  graph: GridGraph | null;
  passable: string[];
  plan: TurnPlan;
  fallbackSpellRangeUnits: number;
  /** The GM forced the (single remaining) spell: cast it regardless of preferences. */
  forceSpell: boolean;
  /** The GM forced a stowed weapon: draw it first. */
  forceWeaponSwitch: boolean;
}

function skeleton(snapshot: CombatSnapshot, self: CombatantSnapshot): TurnPlan {
  return {
    combatId: snapshot.combatId,
    combatantId: self.combatantId,
    tokenId: self.tokenId,
    round: snapshot.round,
    turn: snapshot.turn,
    mode: "fight",
    targetTokenId: null,
    actions: [],
    candidates: [],
    candidateIndex: 0,
    explanation: [],
    warnings: []
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function moveAction(waypoints: Point[], distance: number, costsAction: boolean, reason: MoveReason, action = "walk", provokes: string[] = [], hazards: string[] = []): Extract<Action, {type: "move"}> {
  return {type: "move", waypoints, distance: round1(distance), reason, costsAction, action, provokes, hazards};
}

/** Enemies granted a Passierschlag when the mover ends its path at `end`. */
function provokesAt(graph: GridGraph, snapshot: CombatSnapshot, self: CombatantSnapshot, end: GridPos): string[] {
  const footprint = graph.moverFootprint(end);
  return provokedByMove(snapshot, self, enemy => footprint.some(space => enemy.footprint.some(t => graph.isAdjacent(space, t))) && !enemy.footprint.every(t => graph.isSeparated(end, t)));
}

function fromPath(graph: GridGraph, result: PathResult, costsAction: boolean, reason: MoveReason = "approach", action = "walk", provokes: string[] = []): Extract<Action, {type: "move"}> | null {
  if (result.path.length <= 1) return null;
  const waypoints = simplifyPath(result.path).slice(1).map(cell => graph.moverCenter(cell));
  return moveAction(waypoints, result.distance, costsAction, reason, action, provokes, pathHazardIds(graph, result.path));
}

/**
 * A token standing in a hazardous zone moves to the nearest safe cell before anything else. Returns the
 * relocated view of the fight and the remaining budget, or null when leaving is impossible.
 */
function leaveHazard(snapshot: CombatSnapshot, self: CombatantSnapshot, budget: ActionBudget, graph: GridGraph, passable: string[], plan: TurnPlan): {snapshot: CombatSnapshot; self: CombatantSnapshot; budget: ActionBudget} | null {
  const escapeGraph = withHazards(graph, snapshot.hazards, "avoid");
  if (!escapeGraph.hazardsAt) return null;
  const maxCost = budget.freeMove + (budget.actions >= 1 ? budget.runMove : 0);
  const result = findPath(escapeGraph, {start: self.pos, moverId: self.tokenId, goal: {kind: "safe", targetCenter: self.center}, maxCost, passable});
  if (!result.reachesGoal || result.path.length <= 1) {
    plan.warnings.push({key: "Explain.Hazard.trapped", params: {zones: self.inHazardIds.map(id => hazardName(snapshot, id)).join(", ")}});
    return null;
  }
  const costsAction = result.distance > budget.freeMove + 1e-9;
  const move = fromPath(escapeGraph, result, costsAction, "leaveHazard", self.movementAction, provokesAt(graph, snapshot, self, result.path[result.path.length - 1]!))!;
  plan.actions.push(move);
  plan.explanation.push({key: "Explain.Hazard.leave", params: {zones: self.inHazardIds.map(id => hazardName(snapshot, id)).join(", "), distance: move.distance}});
  const relocated = relocate(snapshot, self, result.path[result.path.length - 1]!, escapeGraph);
  const remaining: ActionBudget = {
    actions: budget.actions - (costsAction ? 1 : 0),
    freeMove: Math.max(0, budget.freeMove - result.distance),
    runMove: costsAction ? 0 : budget.runMove
  };
  return {...relocated, budget: remaining};
}

function addHazardWarnings(plan: TurnPlan, snapshot: CombatSnapshot): void {
  for (const action of plan.actions) {
    if (action.type !== "move" || action.reason === "leaveHazard" || action.hazards.length === 0) continue;
    plan.warnings.push({key: "Explain.Hazard.path", params: {zones: action.hazards.map(id => hazardName(snapshot, id)).join(", ")}});
  }
}

/** Straight-line approach for gridless scenes; Foundry stops the token at walls on execution. */
function approachGridless(snapshot: CombatSnapshot, self: CombatantSnapshot, target: CombatantSnapshot, budget: ActionBudget): Approach {
  const distance = distanceBetween(snapshot, self.tokenId, target.tokenId);
  const reach = ((self.sizeCells + target.sizeCells) / 2) * snapshot.gridDistance * 1.05;
  const needed = distance - reach;
  if (!Number.isFinite(needed) || needed <= 0) return {move: null, reachesTarget: true};
  const canRun = budget.runMove > 0 && budget.actions >= 2;
  const available = budget.freeMove + (canRun ? budget.runMove : 0);
  const units = Math.min(needed, available);
  if (units <= 0) return {move: null, reachesTarget: false};
  const t = units / distance;
  const waypoint = {x: self.center.x + (target.center.x - self.center.x) * t, y: self.center.y + (target.center.y - self.center.y) * t};
  return {move: moveAction([waypoint], units, units > budget.freeMove, "approach", self.movementAction), reachesTarget: units >= needed - 1e-6};
}

function approachOnGrid(graph: GridGraph, snapshot: CombatSnapshot, self: CombatantSnapshot, target: CombatantSnapshot, budget: ActionBudget, passable: string[]): Approach {
  const goal: GoalSpec = {kind: "melee", targetFootprint: target.footprint, targetCenter: target.center};
  const base = {start: self.pos, moverId: self.tokenId, goal, passable};
  const action = self.movementAction;
  const provokes = (r: PathResult) => provokesAt(graph, snapshot, self, r.path[r.path.length - 1]!);
  // Encircle an engaged target / cut off its escape when the settings or the situation ask for it.
  const tactical = chooseApproachCell({graph, snapshot, self, target, budget, passable, blockEscape: self.settings.blockEscape});
  if (tactical && tactical.path.length > 1) {
    const costsAction = tactical.distance > budget.freeMove + 1e-9;
    if (!costsAction || budget.actions >= 2) return {move: fromPath(graph, tactical, costsAction, "approach", action, provokes(tactical)), reachesTarget: true, tactical: true};
  }
  const free = findPath(graph, {...base, maxCost: budget.freeMove});
  if (free.reachesGoal) return {move: fromPath(graph, free, false, "approach", action, provokes(free)), reachesTarget: true};
  const canRun = budget.runMove > 0;
  if (canRun && budget.actions >= 2) {
    const run = findPath(graph, {...base, maxCost: budget.freeMove + budget.runMove});
    if (run.reachesGoal) return {move: fromPath(graph, run, run.distance > budget.freeMove, "approach", action, provokes(run)), reachesTarget: true};
  }
  const partial = canRun ? findPath(graph, {...base, maxCost: budget.freeMove + budget.runMove}) : free;
  return {move: fromPath(graph, partial, partial.distance > budget.freeMove, "approach", action, provokes(partial)), reachesTarget: false};
}

/** Plans shots and reloads for the remaining actions, simulating DSA5's reload progress. */
function shootSequence(ctx: OffenseContext, choice: RangedChoice, band: RangeBand, actions: number): void {
  const weapon = choice.weapon;
  let progress = weapon.loadProgress;
  let ammo = weapon.ammoLeft;
  let shots = 0;
  for (let i = 0; i < actions; i++) {
    const loaded = weapon.loadTime <= 0 || progress >= weapon.loadTime;
    if (loaded) {
      if (ammo !== null && ammo <= 0) {
        ctx.plan.actions.push({type: "wait", reasonKey: "Explain.Wait.noAmmo"});
        break;
      }
      const mods = RANGE_BAND_MODIFIERS[band];
      const odds = attackOdds({
        attack: weapon.at + mods.attack, defense: estimateDefense(ctx.target, "ranged"), defenseCount: ctx.target.round.defenseCount + shots,
        avgDamage: averageDamage(weapon), damageBonus: mods.damage, armor: ctx.target.armor
      });
      ctx.plan.actions.push({type: "rangedAttack", weaponId: weapon.itemId, weaponName: weapon.name, targetTokenId: ctx.target.tokenId, band, odds});
      shots++;
      progress = 0;
      if (ammo !== null) ammo--;
    } else {
      progress++;
      ctx.plan.actions.push({type: "reload", weaponId: weapon.itemId, weaponName: weapon.name});
    }
  }
  if (shots > 0) ctx.plan.explanation.push({key: "Explain.Ranged.shoot", params: {weapon: weapon.name, band: `Action.Band.${band}`}});
  else ctx.plan.explanation.push({key: "Explain.Ranged.reload", params: {weapon: weapon.name, progress, loadTime: weapon.loadTime}});
}

/** Average weapon damage before armor; unparseable formulas fall back to a one-handed weapon. */
function averageDamage(weapon: WeaponSnapshot): number {
  return expectedValue(weapon.damage, 1) || 6.5;
}

function meleeSequence(ctx: OffenseContext, melee: WeaponSnapshot, actions: number): void {
  const targetDefense = estimateDefense(ctx.target, "melee");
  const avgDamage = averageDamage(melee);
  const defenseCount = ctx.target.round.defenseCount;
  const choice = chooseManeuver({at: melee.at, targetDefense, maneuvers: ctx.self.maneuvers, useManeuvers: ctx.settings.useManeuvers, avgDamage, armor: ctx.target.armor, defenseCount});
  const maneuver = choice ? {name: choice.name, step: choice.step, modifier: choice.modifier} : undefined;
  for (let i = 0; i < actions; i++) {
    const odds = attackOdds({
      attack: melee.at + (choice?.modifier.value ?? 0), defense: targetDefense + (choice?.modifier.dmmalus ?? 0), defenseCount: defenseCount + i,
      avgDamage, damageBonus: choice?.modifier.damageBonus ?? 0, armor: ctx.target.armor
    });
    ctx.plan.actions.push({type: "meleeAttack", weaponId: melee.itemId, weaponName: melee.name, targetTokenId: ctx.target.tokenId, odds, ...(maneuver ? {maneuver} : {})});
  }
  if (choice) ctx.plan.explanation.push({key: "Explain.Maneuver", params: {name: choice.name, step: choice.step, at: choice.modifier.value}});
}

/** Bodyguards return to their protégé when they are neither next to them nor engaged. */
function planGuardDuty(ctx: OffenseContext): boolean {
  const wardId = ctx.settings.protegeTokenId;
  if (!wardId || !ctx.graph) return false;
  const ward = ctx.snapshot.combatants.find(c => c.tokenId === wardId);
  if (!ward || !isAlive(ward) || areAdjacent(ctx.snapshot, ctx.self.tokenId, wardId)) return false;
  const engaged = ctx.snapshot.combatants.some(o => isEnemy(ctx.self, o) && isAlive(o) && areAdjacent(ctx.snapshot, ctx.self.tokenId, o.tokenId));
  if (engaged || !canMove(ctx.self)) return false;
  const approach = approachOnGrid(ctx.graph, ctx.snapshot, ctx.self, ward, ctx.budget, ctx.passable);
  if (!approach.move) return false;
  ctx.plan.actions.push(approach.move);
  ctx.plan.explanation.push({key: "Explain.Wait.guarding", params: {name: ward.name}});
  const left = Math.max(0, ctx.budget.actions - (approach.move.costsAction ? 1 : 0));
  ctx.plan.actions.push({type: "wait", reasonKey: "Explain.Wait.guarding", params: {name: ward.name}});
  void left;
  return true;
}

function enemyCenters(ctx: OffenseContext): Point[] {
  return ctx.snapshot.combatants.filter(o => isEnemy(ctx.self, o) && isAlive(o) && !o.hidden).map(o => o.center);
}

/** Ranged fighter standing next to an enemy: step back to a cell that keeps line of sight and range. */
function retreat(ctx: OffenseContext, choice: RangedChoice): {move: Extract<Action, {type: "move"}>; band: RangeBand} | null {
  const graph = ctx.graph;
  if (!graph || ctx.budget.freeMove <= 0) return null;
  const enemies = enemyCenters(ctx);
  const bands = choice.weapon.rangeBands!;
  const minSafe = ctx.snapshot.gridDistance * 1.6;
  const result = findBestCell(graph, {
    start: ctx.self.pos,
    moverId: ctx.self.tokenId,
    maxCost: ctx.budget.freeMove,
    passable: ctx.passable,
    score: center => {
      const toTarget = graph.distanceUnits(center, ctx.target.center);
      if (toTarget > bands[2] || !graph.hasLineOfSight(center, ctx.target.center)) return Number.NEGATIVE_INFINITY;
      const nearest = Math.min(...enemies.map(e => graph.distanceUnits(center, e)));
      return nearest < minSafe ? nearest - 1000 : nearest;
    }
  });
  if (result.path.length <= 1) return null;
  const end = graph.moverCenter(result.path[result.path.length - 1]!);
  const nearest = Math.min(...enemies.map(e => graph.distanceUnits(end, e)));
  if (nearest < minSafe) return null;
  const band = bandFor(graph.distanceUnits(end, ctx.target.center), bands);
  if (band === null) return null;
  return {move: fromPath(graph, result, false, "keepDistance", ctx.self.movementAction, provokesAt(graph, ctx.snapshot, ctx.self, result.path[result.path.length - 1]!))!, band};
}

/** Move to a cell within (preferably medium) range with line of sight, then shoot with what is left. */
function firingPosition(ctx: OffenseContext, choice: RangedChoice): {move: Extract<Action, {type: "move"}>; band: RangeBand} | null {
  const graph = ctx.graph;
  if (!graph) return null;
  const bands = choice.weapon.rangeBands!;
  const maxCost = ctx.budget.freeMove + (ctx.budget.actions >= 2 ? ctx.budget.runMove : 0);
  for (const maxUnits of [bands[1], bands[2]]) {
    const goal: GoalSpec = {kind: "ranged", targetCenter: ctx.target.center, minUnits: ctx.snapshot.gridDistance * 1.6, maxUnits};
    const result = findPath(graph, {start: ctx.self.pos, moverId: ctx.self.tokenId, goal, maxCost, passable: ctx.passable});
    if (!result.reachesGoal || result.path.length <= 1) continue;
    const end = graph.moverCenter(result.path[result.path.length - 1]!);
    const band = bandFor(graph.distanceUnits(end, ctx.target.center), bands);
    if (band === null) continue;
    return {move: fromPath(graph, result, result.distance > ctx.budget.freeMove, "approach", ctx.self.movementAction, provokesAt(graph, ctx.snapshot, ctx.self, result.path[result.path.length - 1]!))!, band};
  }
  return null;
}

/** Casts a spell if the selector finds a worthwhile one; returns the actions left for weapons. */
function planSpell(ctx: OffenseContext, adjacent: boolean, melee: WeaponSnapshot | null): number | null {
  const {snapshot, self, target, budget, settings, plan} = ctx;
  const meleeExpectedDamage = melee ? expectedValue(melee.damage, 1) : 0;
  const enemyAdjacent = snapshot.combatants.some(o => isEnemy(self, o) && isAlive(o) && areAdjacent(snapshot, self.tokenId, o.tokenId));
  const spellCtx: SpellPlanContext = {snapshot, self, target, budget, settings, fallbackRangeUnits: ctx.fallbackSpellRangeUnits, meleeExpectedDamage, enemyAdjacent, forceSpell: ctx.forceSpell};
  const ongoing = self.casting ? continueCasting(spellCtx, castableSpellsFor(spellCtx)) : null;
  if (ongoing?.kind === "abort") {
    const spellId = self.casting!.spellId;
    const name = self.spells.find(s => s.itemId === spellId)?.name ?? spellId;
    plan.explanation.push({key: "Explain.Spell.aborted", params: {spell: name, reason: ongoing.reason}});
    plan.abortedCasting = spellId;
    // The progress will be reset, so the spell starts from scratch for the rest of this plan.
    spellCtx.self = {...self, casting: null, spells: self.spells.map(s => (s.itemId === spellId ? {...s, castingProgress: 0} : s))};
  }
  const choice = ongoing?.kind === "continue" ? ongoing.choice : chooseSpell(spellCtx);
  if (!choice) return null;
  const {spell} = choice;
  const targetName = choice.targetTokenId ? snapshot.combatants.find(c => c.tokenId === choice.targetTokenId)?.name ?? choice.targetTokenId : "Action.Self";
  const odds = {successChance: skillCheckChance(spell.attributes, spell.talentValue)};
  const remaining = Math.max(1, spell.castingTime - spell.castingProgress);
  if (remaining > budget.actions) {
    // Not enough actions to finish: spend this turn's actions on preparation (DSA5 casting progress).
    plan.actions.push({type: "castSpell", spellId: spell.itemId, spellName: spell.name, role: choice.role, targetTokenId: choice.targetTokenId, cost: spell.cost, continueCasting: true, steps: budget.actions, odds});
    plan.explanation.push({key: "Explain.Spell.prepare", params: {spell: spell.name, progress: spell.castingProgress + budget.actions, needed: spell.castingTime - 1}});
    return 0;
  }
  plan.actions.push({type: "castSpell", spellId: spell.itemId, spellName: spell.name, role: choice.role, targetTokenId: choice.targetTokenId, cost: spell.cost, continueCasting: false, odds});
  if (ongoing?.kind === "continue") plan.explanation.push({key: "Explain.Spell.continue", params: {spell: spell.name}});
  plan.explanation.push({key: `Explain.Spell.${choice.role}`, params: {spell: spell.name, target: targetName}});
  if (spell.range.kind === "unknown") plan.warnings.push({key: "Explain.Spell.unknownRange", params: {spell: spell.name, units: spell.range.units}});
  const left = Math.max(0, budget.actions - remaining);
  if (left > 0 && adjacent && melee) meleeSequence(ctx, melee, left);
  return left;
}

function castableSpellsFor(ctx: SpellPlanContext) {
  return castableSpells(ctx);
}

/** Run away: the reachable cell with the largest distance to the nearest enemy (running costs an action). */
function planFlee(snapshot: CombatSnapshot, self: CombatantSnapshot, plan: TurnPlan, options: PlanOptions): void {
  const enemies = snapshot.combatants.filter(o => isEnemy(self, o) && isAlive(o) && !o.hidden).map(o => o.center);
  const budget = computeBudget(self, self.settings);
  const graph = options.graph ?? null;
  if (enemies.length === 0 || !canMove(self) || !graph || (budget.freeMove <= 0 && budget.runMove <= 0)) {
    plan.actions.push({type: "wait", reasonKey: enemies.length === 0 ? "Explain.Wait.noEnemies" : "Explain.Flee.cannotMove"});
    return;
  }
  const nearest = (p: Point) => Math.min(...enemies.map(e => graph.distanceUnits(p, e)));
  const before = nearest(self.center);
  const maxCost = budget.freeMove + (budget.actions >= 1 ? budget.runMove : 0);
  const result = findBestCell(graph, {start: self.pos, moverId: self.tokenId, maxCost, passable: options.passable ?? [], score: nearest});
  const move = fromPath(graph, result, result.distance > budget.freeMove, "flee", self.movementAction, provokesAt(graph, snapshot, self, result.path[result.path.length - 1]!));
  if (!move || nearest(graph.moverCenter(result.path[result.path.length - 1]!)) <= before) {
    plan.actions.push({type: "wait", reasonKey: "Explain.Flee.cornered"});
    return;
  }
  plan.actions.push(move);
  plan.explanation.push({key: "Explain.Flee.move", params: {distance: move.distance}});
  addProvokeWarnings(plan, snapshot);
}

/** Draws a stowed weapon first when the situation calls for it; returns the context to plan the rest with. */
function withWeaponSwitch(ctx: OffenseContext): OffenseContext {
  const {snapshot, self, target, budget, settings} = ctx;
  const distance = distanceBetween(snapshot, self.tokenId, target.tokenId);
  const adjacent = areAdjacent(snapshot, self.tokenId, target.tokenId);
  const los = hasLineOfSight(snapshot, self.tokenId, target.tokenId);
  const sw = planWeaponSwitch({self, target, adjacent, distance, los, settings, budget, gridDistance: snapshot.gridDistance, force: ctx.forceWeaponSwitch});
  if (!sw) return ctx;
  ctx.plan.actions.push(sw.action);
  ctx.plan.explanation.push({key: sw.action.costsAction ? "Explain.Switch.action" : "Explain.Switch.free", params: {weapon: sw.action.weaponName}});
  return {...ctx, self: {...self, weapons: sw.weapons, stowedWeapons: []}, budget: {...budget, actions: budget.actions - (sw.action.costsAction ? 1 : 0)}};
}

function planOffense(input: OffenseContext): void {
  const ctx = withWeaponSwitch(input);
  const {snapshot, self, target, budget, settings, plan} = ctx;
  if (budget.actions <= 0) {
    plan.actions.push({type: "wait", reasonKey: "Explain.Wait.noActions"});
    return;
  }
  const melee = bestMeleeWeapon(self.weapons);
  const distance = distanceBetween(snapshot, self.tokenId, target.tokenId);
  const adjacent = areAdjacent(snapshot, self.tokenId, target.tokenId);
  if (!adjacent && planGuardDuty(ctx)) return;
  if (planSpell(ctx, adjacent, melee) !== null) return;
  const los = hasLineOfSight(snapshot, self.tokenId, target.tokenId);
  const ranged = settings.useRanged ? bestRangedWeapon(self.weapons, distance) : null;
  const rangedAnywhere = settings.useRanged ? self.weapons.find(w => (w.kind === "ranged" || w.kind === "trait-ranged") && w.rangeBands && (w.ammoLeft === null || w.ammoLeft > 0)) : undefined;
  const mobile = canMove(self) && (budget.freeMove > 0 || budget.runMove > 0);

  if (adjacent) {
    if (melee && !(ranged && settings.keepDistance && settings.allowRetreat && !melee.isShield && isLoaded(ranged.weapon) && ranged.weapon.at > melee.at)) {
      meleeSequence(ctx, melee, budget.actions);
      return;
    }
    if (ranged) {
      const step = settings.keepDistance && settings.allowRetreat && mobile && !settings.holdPosition ? retreat(ctx, ranged) : null;
      if (step) {
        plan.actions.push(step.move);
        plan.explanation.push({key: "Explain.Ranged.retreat"});
        shootSequence(ctx, ranged, step.band, budget.actions);
        return;
      }
      if (melee) {
        meleeSequence(ctx, melee, budget.actions);
        return;
      }
      shootSequence(ctx, ranged, ranged.band, budget.actions);
      return;
    }
    plan.actions.push({type: "wait", reasonKey: "Explain.Wait.noWeapon"});
    return;
  }

  // A weapon that cannot be readied this turn is only worth loading when there is no melee alternative.
  const reloadTooSlow = (w: WeaponSnapshot) => !isLoaded(w) && w.loadTime - w.loadProgress > budget.actions;
  if (ranged && los && !(melee && reloadTooSlow(ranged.weapon))) {
    shootSequence(ctx, ranged, ranged.band, budget.actions);
    return;
  }

  const engaged = snapshot.combatants.some(o => isEnemy(self, o) && isAlive(o) && areAdjacent(snapshot, self.tokenId, o.tokenId));
  if (settings.holdPosition || (engaged && !settings.allowRetreat)) {
    plan.actions.push({type: "wait", reasonKey: settings.holdPosition ? "Explain.Wait.holdPosition" : "Explain.Wait.noRetreat", params: {distance: round1(distance)}});
    return;
  }
  if (rangedAnywhere && mobile && ctx.graph && !(melee && reloadTooSlow(rangedAnywhere))) {
    const choice: RangedChoice = {weapon: rangedAnywhere, band: 2, loaded: isLoaded(rangedAnywhere), expectedAttack: rangedAnywhere.at};
    const position = firingPosition(ctx, choice);
    if (position) {
      plan.actions.push(position.move);
      plan.explanation.push({key: "Explain.Ranged.position"});
      const left = Math.max(0, budget.actions - (position.move.costsAction ? 1 : 0));
      if (left > 0) shootSequence(ctx, choice, position.band, left);
      else plan.actions.push({type: "wait", reasonKey: "Explain.Wait.noActions"});
      return;
    }
  }

  if (!melee) {
    plan.actions.push({type: "wait", reasonKey: rangedAnywhere ? "Explain.Wait.notInReach" : "Explain.Wait.noWeapon", params: {distance: round1(distance)}});
    return;
  }
  if (!mobile || !(ctx.graph || snapshot.gridType === "gridless")) {
    plan.actions.push({type: "wait", reasonKey: "Explain.Wait.notInReach", params: {distance: round1(distance)}});
    return;
  }
  const approach = snapshot.gridType === "gridless" || !ctx.graph
    ? approachGridless(snapshot, self, target, budget)
    : approachOnGrid(ctx.graph, snapshot, self, target, budget, ctx.passable);
  if (approach.move) {
    plan.actions.push(approach.move);
    plan.explanation.push({key: approach.move.costsAction ? "Explain.Move.run" : "Explain.Move.free", params: {distance: approach.move.distance}});
    if (approach.tactical) plan.explanation.push({key: settings.blockEscape ? "Explain.Move.block" : "Explain.Move.encircle"});
  }
  if (approach.reachesTarget) {
    const attacks = Math.max(0, budget.actions - (approach.move?.costsAction ? 1 : 0));
    if (attacks > 0) meleeSequence(ctx, melee, attacks);
    else plan.actions.push({type: "wait", reasonKey: "Explain.Wait.noActions"});
  } else if (approach.move) {
    plan.actions.push({type: "wait", reasonKey: "Explain.Wait.approaching", params: {distance: round1(distance)}});
  } else {
    plan.actions.push({type: "wait", reasonKey: "Explain.Wait.noPath", params: {distance: round1(distance)}});
  }
}

/** Applies GM constraints by narrowing what the planner can see (weapons, spells, movement). */
function constrain(base: CombatantSnapshot, constraints: PlanConstraints, plan: TurnPlan): {self: CombatantSnapshot; forceSpell: boolean; forceWeaponSwitch: boolean} {
  let self = base;
  let forceSpell = false;
  let forceWeaponSwitch = false;
  if (constraints.weaponId) {
    const forced = base.weapons.filter(w => w.itemId === constraints.weaponId);
    const stowed = base.stowedWeapons.filter(w => w.itemId === constraints.weaponId);
    if (forced.length > 0) {
      self = {...self, weapons: forced, stowedWeapons: [], settings: {...self.settings, useRanged: true}};
      plan.explanation.push({key: "Explain.Constraint.weapon", params: {weapon: forced[0]!.name}});
    } else if (stowed.length > 0) {
      self = {...self, weapons: base.weapons.filter(w => w.kind === "weaponless"), stowedWeapons: stowed, settings: {...self.settings, useRanged: true}};
      forceWeaponSwitch = true;
      plan.explanation.push({key: "Explain.Constraint.weapon", params: {weapon: stowed[0]!.name}});
    } else {
      plan.warnings.push({key: "Explain.Constraint.unmet"});
    }
  }
  if (constraints.spellId === null) {
    self = {...self, settings: {...self.settings, useSpells: false}};
    plan.explanation.push({key: "Explain.Constraint.noSpell"});
  } else if (constraints.spellId) {
    const forced = base.spells.filter(s => s.itemId === constraints.spellId);
    if (forced.length > 0) {
      self = {...self, spells: forced, settings: {...self.settings, useSpells: true}};
      forceSpell = true;
      plan.explanation.push({key: "Explain.Constraint.spell", params: {spell: forced[0]!.name}});
    } else {
      plan.warnings.push({key: "Explain.Constraint.unmet"});
    }
  }
  if (constraints.noMove) {
    self = {...self, settings: {...self.settings, holdPosition: true}};
    plan.explanation.push({key: "Explain.Constraint.noMove"});
  }
  return {self, forceSpell, forceWeaponSwitch};
}

function constraintsMet(plan: TurnPlan, constraints: PlanConstraints): boolean {
  if (constraints.dropActions) return true;
  if (constraints.weaponId && !plan.actions.some(a => (a.type === "meleeAttack" || a.type === "rangedAttack" || a.type === "reload" || a.type === "switchWeapon") && a.weaponId === constraints.weaponId)) return false;
  if (constraints.spellId && !plan.actions.some(a => a.type === "castSpell" && a.spellId === constraints.spellId)) return false;
  return true;
}

export function planTurn(snapshot: CombatSnapshot, selfTokenId: string, options: PlanOptions = {}): TurnPlan {
  const base = snapshot.combatants.find(c => c.tokenId === selfTokenId);
  if (!base) throw new Error(`Combatant ${selfTokenId} not in snapshot`);
  const plan = skeleton(snapshot, base);
  const constraints = options.constraints ?? {};
  const {self, forceSpell, forceWeaponSwitch} = constrain(base, constraints, plan);
  const settings = self.settings;
  const forcedTargetTokenId = options.forcedTargetTokenId ?? constraints.targetTokenId ?? null;
  const hazardGraph = options.graph ? withHazards(options.graph, snapshot.hazards, settings.hazardCaution) : null;

  if (!isAlive(self)) {
    plan.mode = "skip";
    plan.explanation.push({key: "Explain.Skip.defeated"});
    return plan;
  }
  if (self.surrendered) {
    plan.mode = "skip";
    plan.explanation.push({key: "Explain.Skip.surrendered"});
    return plan;
  }
  const blocking = blockingCondition(self);
  if (blocking && !settings.fightWhileIncapacitated) {
    plan.mode = "skip";
    plan.explanation.push({key: "Explain.Skip.condition", params: {condition: blocking}});
    return plan;
  }
  if (self.pain >= 3) plan.warnings.push({key: "Explain.Warn.pain", params: {level: self.pain}});

  plan.candidates = scoreCandidates({snapshot, self, rule: settings.targetRule, forcedTargetTokenId, focusLimit: options.focusLimit});

  if (isPassiveDisposition(self) && !forcedTargetTokenId) {
    plan.mode = "passive";
    plan.actions.push({type: "wait", reasonKey: "Explain.Wait.passive"});
    plan.explanation.push({key: "Explain.Passive", params: {disposition: self.disposition}});
    return plan;
  }

  const morale = fleeThreshold(snapshot, self);
  const lep = lepPercent(self);
  const fleeing = morale.threshold > 0 && lep <= morale.threshold;
  const surrenderReady = settings.surrenderThresholdPct > 0 && lep <= settings.surrenderThresholdPct;
  if (fleeing || surrenderReady) {
    const escape = skeleton(snapshot, self);
    planFlee(snapshot, self, escape, {...options, graph: hazardGraph});
    const decision = surrenderDecision(snapshot, self, escapeBlocked(escape));
    if (decision.surrender && decision.reason) {
      plan.mode = "surrender";
      plan.actions.push({type: "surrender", reasonKey: decision.reason});
      plan.explanation.push({key: "Explain.Surrender.decision", params: {lep, threshold: settings.surrenderThresholdPct}}, {key: decision.reason});
      return plan;
    }
    if (fleeing) {
      plan.mode = "flee";
      if (morale.reason) plan.explanation.push(morale.reason);
      plan.explanation.push({key: "Explain.Flee.threshold", params: {lep, threshold: morale.threshold}});
      plan.actions.push(...escape.actions);
      plan.explanation.push(...escape.explanation);
      plan.warnings.push(...escape.warnings);
      return plan;
    }
  }

  const candidate = plan.candidates[0];
  if (!candidate) {
    plan.actions.push({type: "wait", reasonKey: "Explain.Wait.noEnemies"});
    plan.explanation.push({key: "Explain.Wait.noEnemies"});
    return plan;
  }
  const target = snapshot.combatants.find(c => c.tokenId === candidate.tokenId)!;
  plan.targetTokenId = target.tokenId;
  plan.explanation.push({key: "Explain.Target.chosen", params: {name: target.name, distance: round1(candidate.distance)}});
  for (const reason of candidate.reasons) plan.explanation.push({key: reason});

  const budget = computeBudget(self, settings);
  let view = {snapshot, self, target, budget};
  if (self.inHazardIds.length > 0 && settings.hazardCaution !== "ignore" && options.graph && canMove(self) && !settings.holdPosition) {
    const left = leaveHazard(snapshot, self, budget, options.graph, options.passable ?? [], plan);
    if (left) view = {snapshot: left.snapshot, self: left.self, target: left.snapshot.combatants.find(c => c.tokenId === target.tokenId)!, budget: left.budget};
  }
  if (view.budget.actions <= 0) {
    plan.actions.push({type: "wait", reasonKey: "Explain.Wait.noActions"});
  } else {
    planOffense({snapshot: view.snapshot, self: view.self, target: view.target, budget: view.budget, settings, graph: hazardGraph, passable: options.passable ?? [], plan, fallbackSpellRangeUnits: options.fallbackSpellRangeUnits ?? 8, forceSpell, forceWeaponSwitch});
  }
  applyDropActions(plan, constraints.dropActions);
  if (!constraintsMet(plan, constraints) && !plan.warnings.some(w => w.key === "Explain.Constraint.unmet")) plan.warnings.push({key: "Explain.Constraint.unmet"});
  plan.explanation.push({key: "Explain.Budget", params: {actions: budget.actions}});
  addProvokeWarnings(plan, snapshot);
  addHazardWarnings(plan, snapshot);
  return plan;
}

function addProvokeWarnings(plan: TurnPlan, snapshot: CombatSnapshot): void {
  for (const action of plan.actions) {
    if (action.type !== "move" || action.provokes.length === 0) continue;
    const names = action.provokes.map(id => snapshot.combatants.find(c => c.tokenId === id)?.name ?? id).join(", ");
    plan.warnings.push({key: "Explain.Warn.provokes", params: {names}});
  }
}

export {RANGE_BAND_MODIFIERS};
