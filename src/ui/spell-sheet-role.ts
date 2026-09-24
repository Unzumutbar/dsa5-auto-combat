import {FLAGS, MODULE_ID, localize} from "../config";

const SPELL_TYPES = new Set(["spell", "liturgy", "ritual", "ceremony"]);
const ROLES = ["auto", "damage", "heal", "buff", "debuff", "control", "never"];
const HAZARDS = ["auto", "none", "avoid", "forbidden"];
const WALLS = ["auto", "none", "invisible", "opaque"];

/** Adds an "Auto Combat role" selector to DSA5 spell/liturgy item sheets (GM only). */
export class SpellSheetRole {
  static register(): void {
    Hooks.on("renderItemSheetdsa5", (app: any, html: any) => this.#inject(app, html instanceof HTMLElement ? html : html[0]));
    Hooks.on("renderItemSheet", (app: any, html: any) => this.#inject(app, html instanceof HTMLElement ? html : html[0]));
  }

  static #inject(app: any, root: HTMLElement): void {
    const item = app.document ?? app.item;
    if (!game.user.isGM || !item || !SPELL_TYPES.has(item.type) || !root) return;
    if (root.querySelector(".dac-spell-role")) return;
    const content = root.querySelector(".window-content") ?? root;
    const current = item.getFlag(MODULE_ID, FLAGS.spellRole) ?? "auto";
    const wrapper = document.createElement("div");
    wrapper.className = "dac-spell-role form-group";
    wrapper.innerHTML = `<label>${localize("Spell.Sheet.Label")}</label><div class="form-fields"><select>${ROLES.map(r => `<option value="${r}" ${r === current ? "selected" : ""}>${localize(`Spell.Role.${r}`)}</option>`).join("")}</div>`;
    const select = wrapper.querySelector("select")!;
    select.addEventListener("change", async () => {
      const value = select.value;
      if (value === "auto") await item.unsetFlag(MODULE_ID, FLAGS.spellRole);
      else await item.setFlag(MODULE_ID, FLAGS.spellRole, value);
      ui.notifications.info(`${item.name}: ${localize(`Spell.Role.${value}`)}`);
    });
    content.prepend(wrapper);
    if (item.type === "spell" || item.type === "liturgy") {
      const hazard = item.getFlag(MODULE_ID, FLAGS.spellHazard) ?? "auto";
      const zone = document.createElement("div");
      zone.className = "dac-spell-role dac-spell-hazard form-group";
      zone.innerHTML = `<label>${localize("Spell.Sheet.Hazard")}</label><div class="form-fields"><select>${HAZARDS.map(h => `<option value="${h}" ${h === hazard ? "selected" : ""}>${localize(`Hazard.Severity.${h}`)}</option>`).join("")}</select></div>`;
      const zoneSelect = zone.querySelector("select")!;
      zoneSelect.addEventListener("change", async () => {
        if (zoneSelect.value === "auto") await item.unsetFlag(MODULE_ID, FLAGS.spellHazard);
        else await item.setFlag(MODULE_ID, FLAGS.spellHazard, zoneSelect.value);
      });
      wrapper.after(zone);
      const wallFlag = item.getFlag(MODULE_ID, FLAGS.spellWall) ?? "auto";
      const wall = document.createElement("div");
      wall.className = "dac-spell-role dac-spell-wall form-group";
      wall.innerHTML = `<label>${localize("Spell.Sheet.Wall")}</label><div class="form-fields"><select>${WALLS.map(w => `<option value="${w}" ${w === wallFlag ? "selected" : ""}>${localize(`MagicWall.Kind.${w}`)}</option>`).join("")}</select></div>`;
      const wallSelect = wall.querySelector("select")!;
      wallSelect.addEventListener("change", async () => {
        if (wallSelect.value === "auto") await item.unsetFlag(MODULE_ID, FLAGS.spellWall);
        else await item.setFlag(MODULE_ID, FLAGS.spellWall, wallSelect.value);
      });
      zone.after(wall);
    }
  }
}
