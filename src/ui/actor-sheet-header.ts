import {localize} from "../config";
import {TokenAutomationConfig} from "./token-automation-config";

/**
 * "Auto Combat" button in the header of every DSA5 actor sheet (GM only); edits the actor-level defaults.
 * DSA5's sheet mixin draws its own header buttons and does not render the core controls dropdown, so the
 * button is injected on render (like DSA5's majorButtons) in addition to the standard header-controls hook.
 */
export class ActorSheetHeader {
  static register(): void {
    Hooks.on("getHeaderControlsActorSheetDsa5", (app: any, controls: any[]) => {
      const actor = app.document ?? app.actor;
      if (!game.user.isGM || !this.#supports(actor)) return;
      controls.push({
        icon: "fa-solid fa-chess-knight",
        label: localize("Config.Open"),
        action: "dsa5AutoCombatActor",
        onClick: () => TokenAutomationConfig.openForActor(actor)
      });
    });
    Hooks.on("renderActorSheetDsa5", (app: any, html: any) => this.#inject(app, html instanceof HTMLElement ? html : html?.[0]));
  }

  static #supports(actor: any): boolean {
    return Boolean(actor) && actor.type !== "group" && actor.type !== "vehicle";
  }

  static #inject(app: any, root: HTMLElement | undefined): void {
    const actor = app.document ?? app.actor;
    if (!game.user.isGM || !this.#supports(actor) || !root) return;
    const header = root.querySelector(".window-header");
    const title = header?.querySelector(".window-title");
    if (!header || !title || header.querySelector(".dac-actor-config")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "header-control fa-solid fa-chess-knight icon dac-actor-config";
    button.dataset.tooltip = localize("Config.Open");
    button.setAttribute("aria-label", localize("Config.Open"));
    button.addEventListener("click", event => {
      event.preventDefault();
      TokenAutomationConfig.openForActor(actor);
    });
    title.insertAdjacentElement("beforebegin", button);
  }
}
