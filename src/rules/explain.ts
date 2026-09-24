import type {Action, ExplainEntry} from "../types/plan";
import {romanStep} from "./maneuvers";

export type NameResolver = (tokenId: string | null) => string;

/** Turns an action into an i18n entry; the UI layer localizes it. */
export function describeAction(action: Action, nameOf: NameResolver): ExplainEntry {
  switch (action.type) {
    case "move":
      return {key: "Action.move", params: {distance: Math.round(action.distance * 10) / 10, reason: `Action.Reason.${action.reason}`}};
    case "meleeAttack":
      if (action.maneuver) {
        return {key: "Action.meleeAttackManeuver", params: {weapon: action.weaponName, target: nameOf(action.targetTokenId), maneuver: `${action.maneuver.name} ${romanStep(action.maneuver.step)}`}};
      }
      return {key: "Action.meleeAttack", params: {weapon: action.weaponName, target: nameOf(action.targetTokenId)}};
    case "rangedAttack":
      return {key: "Action.rangedAttack", params: {weapon: action.weaponName, target: nameOf(action.targetTokenId), band: `Action.Band.${action.band}`}};
    case "reload":
      return {key: "Action.reload", params: {weapon: action.weaponName}};
    case "switchWeapon":
      return {key: "Action.switchWeapon", params: {weapon: action.weaponName, cost: action.costsAction ? "Action.SwitchCost.action" : "Action.SwitchCost.free"}};
    case "castSpell":
      return {
        key: action.continueCasting ? "Action.continueSpell" : "Action.castSpell",
        params: {spell: action.spellName, role: `Spell.Role.${action.role}`, target: action.targetTokenId ? nameOf(action.targetTokenId) : "Action.Self", cost: action.cost}
      };
    case "surrender":
      return {key: "Action.surrender", params: {reason: {key: action.reasonKey}}};
    case "wait":
      return {key: "Action.wait", params: {reason: {key: action.reasonKey, params: action.params}}};
  }
}
