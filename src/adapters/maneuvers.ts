import type {ManeuverSnapshot} from "../types/snapshot";

const WUCHTSCHLAG = /wuchtschlag|forceful blow/i;
const FINTE = /^finte\b|^feint\b/i;

/** Reads the basic combat maneuvers (Wuchtschlag, Finte) an actor knows, with their maximum step. */
export class ManeuversAdapter {
  static list(actor: any): ManeuverSnapshot[] {
    const result: ManeuverSnapshot[] = [];
    for (const item of actor.items) {
      if (item.type !== "specialability" || item.system?.category?.value !== "Combat") continue;
      const name = String(item.name ?? "");
      const kind = WUCHTSCHLAG.test(name) ? "wuchtschlag" : FINTE.test(name) ? "finte" : null;
      if (!kind) continue;
      const step = Number(item.system?.step?.value);
      result.push({itemId: item.id, name, kind, maxStep: Number.isFinite(step) && step > 0 ? step : 1});
    }
    return result;
  }
}
