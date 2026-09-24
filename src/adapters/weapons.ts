import type {MeleeReach, WeaponSnapshot} from "../types/snapshot";

const REACHES = new Set<string>(["short", "medium", "long"]);

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function reachOf(value: unknown): MeleeReach {
  return typeof value === "string" && REACHES.has(value) ? (value as MeleeReach) : "medium";
}

/** Damage formula including the actor's damage bonus (DSA5 _parseDmg: damagedie + damageAdd). */
function damageOf(prepared: any, item: any): string {
  const die = String(prepared?.damagedie ?? "");
  if (/^\d+d\d+$/.test(die) && die !== "0d6") return `${die}${prepared.damageAdd ?? ""}`;
  return String(item.system.damage?.value ?? "");
}

function bandsOf(value: unknown): [number, number, number] | null {
  const parts = String(value ?? "").split("/").map(p => Number(p.trim()));
  if (parts.length !== 3 || parts.some(p => !Number.isFinite(p))) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

/**
 * Reads the combat-ready weapons of a DSA5 actor with the same derived AT/PA values the system's
 * dialogs use (Actordsa5._prepareMeleeWeapon / _prepareRangeWeapon on plain item objects).
 */
export class WeaponsAdapter {
  static combatSkills(actor: any): any[] {
    const model = CONFIG.Item.dataModels?.combatskill;
    return actor.items
      .filter((i: any) => i.type === "combatskill")
      .map((i: any) => (model?._calculateCombatSkillValues ? model._calculateCombatSkillValues(i.toObject(), actor.system) : i.toObject()));
  }

  /** Wielded weapons (the planner's working set). */
  static list(actor: any): WeaponSnapshot[] {
    return this.collect(actor).filter(w => w.worn);
  }

  /** Carried melee/ranged weapons that are not wielded. */
  static stowed(actor: any): WeaponSnapshot[] {
    return this.collect(actor).filter(w => !w.worn);
  }

  static hasQuickdraw(actor: any): boolean {
    const name = game.i18n.localize("LocalizedIDs.quickdraw");
    return actor.items.some((i: any) => i.type === "specialability" && i.name === name);
  }

  static collect(actor: any): WeaponSnapshot[] {
    const Actordsa5 = game.dsa5?.entities?.Actordsa5;
    if (!Actordsa5) return [];
    const combatskills = this.combatSkills(actor);
    const ammunition = actor.items.filter((i: any) => i.type === "ammunition").map((i: any) => i.toObject());
    const isCreature = actor.type === "creature";
    const result: WeaponSnapshot[] = [];

    for (const item of actor.items) {
      if (item.type === "meleeweapon") {
        const prepared = Actordsa5._prepareMeleeWeapon(item.toObject(), combatskills, actor, null, false);
        if (prepared.attack === undefined) continue;
        result.push({
          itemId: item.id, name: item.name, kind: "melee",
          at: num(prepared.attack), pa: num(prepared.parry), reach: reachOf(item.system.reach?.value), rangeBands: null,
          ammoLeft: null, loadProgress: 0, loadTime: 0, damage: damageOf(prepared, item),
          isShield: Boolean(game.dsa5.apps.RuleChaos?.isShield?.(prepared)),
          worn: Boolean(item.system.worn?.value), twoHanded: Boolean(prepared.twoHandedWeapon) || /\(2H/.test(item.name)
        });
      } else if (item.type === "rangeweapon") {
        const prepared = Actordsa5._prepareRangeWeapon(item.toObject(), ammunition, combatskills, actor, false);
        if (prepared.attack === undefined) continue;
        result.push({
          itemId: item.id, name: item.name, kind: "ranged",
          at: num(prepared.attack), pa: 0, reach: "medium", rangeBands: bandsOf(prepared.calculatedRange ?? item.system.reach?.value),
          ammoLeft: isCreature ? null : this.ammoLeft(item, prepared, ammunition),
          loadProgress: num(item.system.reloadTime?.progress), loadTime: num(prepared.LZ),
          damage: damageOf(prepared, item), isShield: false, worn: Boolean(item.system.worn?.value), twoHanded: true
        });
      } else if (item.type === "trait") {
        const traitType = item.system.traitType?.value;
        if (traitType !== "meleeAttack" && traitType !== "rangeAttack") continue;
        const ranged = traitType === "rangeAttack";
        result.push({
          itemId: item.id, name: item.name, kind: ranged ? "trait-ranged" : "trait-melee",
          at: num(item.system.at?.value), pa: num(item.system.pa), reach: reachOf(item.system.reach?.value),
          rangeBands: ranged ? bandsOf(item.system.reach?.value) : null,
          ammoLeft: null, loadProgress: num(item.system.reloadTime?.progress), loadTime: ranged ? num(String(item.system.reloadTime?.value ?? "").split("/")[0]) : 0,
          damage: String(item.system.damage?.value ?? ""), isShield: false, worn: true, twoHanded: false
        });
      }
    }

    const brawl = combatskills.find((s: any) => s?.name === game.i18n.localize("LocalizedIDs.wrestle"));
    if (brawl && !isCreature) {
      result.push({
        itemId: "weaponless", name: game.i18n.localize("attackWeaponless"), kind: "weaponless",
        at: num(brawl.system?.attack?.value), pa: num(brawl.system?.parry?.value), reach: "short", rangeBands: null,
        ammoLeft: null, loadProgress: 0, loadTime: 0, damage: "1d6", isShield: false, worn: true, twoHanded: false
      });
    }
    return result;
  }

  static ammoLeft(item: any, prepared: any, ammunition: any[]): number | null {
    const group = item.system.ammunitiongroup?.value;
    if (group === "infinite") return null;
    if (group === "-") return num(item.system.quantity?.value, 1);
    const current = ammunition.find((a: any) => a._id === item.system.currentAmmo?.value);
    if (!current) return 0;
    if (group === "mag") return num(prepared.ammoCurrent ?? current.system.mag?.value);
    return num(current.system.quantity?.value);
  }
}
