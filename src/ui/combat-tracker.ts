import {TurnController} from "../orchestration/turn-controller";
import {localize} from "../config";
import {TokenAutomationConfig} from "./token-automation-config";

/** Combat tracker integration: "plan this turn" button and a per-combatant context menu entry (GM only). */
export class CombatTrackerButton {
  /** Must run during `init`: the tracker builds its context menu on its first render, before `ready`. */
  static registerContextMenu(): void {
    for (const hook of ["getCombatTrackerContextOptions", "getDSA5CombatTrackerContextOptions", "getCombatantContextOptions"]) {
      Hooks.on(hook, (_app: any, entries: any[]) => this.#addContextEntry(entries));
    }
  }

  static register(): void {
    Hooks.on("renderDSA5CombatTracker", (_app: any, html: any) => this.#inject(html instanceof HTMLElement ? html : html[0]));
    Hooks.on("renderCombatTracker", (_app: any, html: any) => this.#inject(html instanceof HTMLElement ? html : html[0]));
  }

  static #addContextEntry(entries: any[]): void {
    if (!Array.isArray(entries) || !game.user.isGM) return;
    if (entries.some(e => e?.name === "DSAAUTOCOMBAT.Config.Open")) return;
    entries.push({
      name: "DSAAUTOCOMBAT.Config.Open",
      icon: '<i class="fa-solid fa-chess-knight"></i>',
      condition: (li: any) => {
        const combatant = this.#combatantFor(li);
        return Boolean(combatant?.token) && !combatant.actor?.hasPlayerOwner;
      },
      callback: (li: any) => {
        const combatant = this.#combatantFor(li);
        if (combatant?.token) TokenAutomationConfig.open(combatant.token);
      }
    });
  }

  static #combatantFor(li: any): any {
    const element: HTMLElement | undefined = li instanceof HTMLElement ? li : li?.[0];
    const id = element?.dataset?.combatantId ?? (element?.closest?.("[data-combatant-id]") as HTMLElement | null)?.dataset?.combatantId;
    return id ? game.combat?.combatants.get(id) : null;
  }

  static #inject(root: HTMLElement | undefined): void {
    if (!root || !game.user.isGM) return;
    const controls = root.querySelector("nav.combat-controls, .combat-controls");
    if (!controls || controls.querySelector(".dac-plan-turn")) return;
    const combat = game.combat;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inline-control combat-control icon fa-solid fa-chess-knight dac-plan-turn";
    button.dataset.tooltip = localize("Tracker.Plan");
    button.setAttribute("aria-label", localize("Tracker.Plan"));
    button.disabled = !combat?.started || !TurnController.isAutomatable(combat.combatant);
    button.addEventListener("click", event => {
      event.preventDefault();
      void TurnController.planCurrent();
    });
    controls.prepend(button);
  }
}
