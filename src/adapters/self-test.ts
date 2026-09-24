import {log} from "../log";

type Probe = [label: string, probe: () => unknown];

/** Verifies that every DSA5 / Foundry entry point the module relies on still exists. */
export function runSelfTest(): string[] {
  const probes: Probe[] = [
    ["game.dsa5.apps.OpposeDSA.resolveUndefended", () => game.dsa5.apps.OpposeDSA.resolveUndefended],
    ["game.dsa5.apps.RuleChaos.multipleDefenseValue", () => game.dsa5.apps.RuleChaos.multipleDefenseValue],
    ["game.dsa5.apps.DPS.rangeFinder", () => game.dsa5.apps.DPS.rangeFinder],
    ["game.dsa5.apps.DSA5_Utility.isActiveGM", () => game.dsa5.apps.DSA5_Utility.isActiveGM],
    ["game.dsa5.config.weaponReachModifiers", () => game.dsa5.config.weaponReachModifiers],
    ["game.dsa5.config.meleeSizeModifier", () => game.dsa5.config.meleeSizeModifier],
    ["game.dsa5.config.asyncHooks.postProcessOpposedResult", () => game.dsa5.config.asyncHooks.postProcessOpposedResult],
    ["Actordsa5.calcLZ", () => game.dsa5.entities.Actordsa5.calcLZ],
    ["Actordsa5._prepareMeleeWeapon", () => game.dsa5.entities.Actordsa5._prepareMeleeWeapon],
    ["Actordsa5._prepareRangeWeapon", () => game.dsa5.entities.Actordsa5._prepareRangeWeapon],
    ["Actor#setupWeapon", () => game.dsa5.entities.Actordsa5.prototype.setupWeapon],
    ["Actor#setupWeaponless", () => game.dsa5.entities.Actordsa5.prototype.setupWeaponless],
    ["Actor#setupDodge", () => game.dsa5.entities.Actordsa5.prototype.setupDodge],
    ["Actor#setupSpell", () => game.dsa5.entities.Actordsa5.prototype.setupSpell],
    ["Actor#basicTest", () => game.dsa5.entities.Actordsa5.prototype.basicTest],
    ["Actor#applyDamage", () => game.dsa5.entities.Actordsa5.prototype.applyDamage],
    ["Actor#applyMana", () => game.dsa5.entities.Actordsa5.prototype.applyMana],
    ["Actor#speedByMovementType", () => game.dsa5.entities.Actordsa5.prototype.speedByMovementType],
    ["Actor#hasCondition", () => game.dsa5.entities.Actordsa5.prototype.hasCondition],
    ["Combat#handleMovementCost", () => CONFIG.Combat.documentClass.prototype.handleMovementCost],
    ["Combat#updateActionCount", () => CONFIG.Combat.documentClass.prototype.updateActionCount],
    ["Combat#updateDefenseCount", () => CONFIG.Combat.documentClass.prototype.updateDefenseCount],
    ["Combat#getDefenseCount", () => CONFIG.Combat.documentClass.prototype.getDefenseCount],
    ["TokenDocument#move", () => CONFIG.Token.documentClass.prototype.move],
    ["TokenDocument#getOccupiedGridSpaceOffsets", () => CONFIG.Token.documentClass.prototype.getOccupiedGridSpaceOffsets],
    ["Token#checkCollision", () => CONFIG.Token.objectClass.prototype.checkCollision],
    ["User#_onUpdateTokenTargets", () => game.user._onUpdateTokenTargets],
    ["CONFIG.Canvas.polygonBackends.sight.testCollision", () => CONFIG.Canvas.polygonBackends.sight.testCollision],
    ["CONFIG.Canvas.polygonBackends.move.testCollision", () => CONFIG.Canvas.polygonBackends.move.testCollision],
    ["canvas.grid.testAdjacency", () => canvas.grid.testAdjacency],
    ["Actordsa5.armorValue", () => game.dsa5.entities.Actordsa5.armorValue],
    ["canvas.grid.getSnappedPoint", () => canvas.grid.getSnappedPoint],
    ["canvas.canvasCoordinatesFromClient", () => canvas.canvasCoordinatesFromClient],
    ["RegionDocument#polygonTree", () => Object.getOwnPropertyDescriptor(CONFIG.Region.documentClass.prototype, "polygonTree")?.get],
    ["game.dsa5.config.areaTargetTypes", () => game.dsa5.config.areaTargetTypes],
    ["canvas.interface.addChild", () => canvas.interface?.addChild],
    ["foundry.canvas.containers.PreciseText", () => foundry.canvas?.containers?.PreciseText],
    ["i18n SPELL.isReloading", () => (game.i18n.has("SPELL.isReloading") ? true : undefined)]
  ];
  const missing: string[] = [];
  for (const [label, probe] of probes) {
    try {
      if (probe() === undefined) missing.push(label);
    } catch {
      missing.push(label);
    }
  }
  if (missing.length) log.warn("Selbsttest: fehlende Funktionen", missing);
  else log.debug("Selbsttest bestanden");
  return missing;
}
