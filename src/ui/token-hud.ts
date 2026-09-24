import {TokenSettingsAdapter} from "../adapters/token-settings";
import {localize} from "../config";
import type {AutomationLevel} from "../types/settings";
import {TokenAutomationConfig} from "./token-automation-config";

const CYCLE: AutomationLevel[] = ["off", "preview", "auto"];

function asElement(html: any): HTMLElement {
  return html instanceof HTMLElement ? html : html[0];
}

export class TokenHud {
  static register(): void {
    Hooks.on("renderTokenHUD", (app: any, html: any) => this.#onRender(app, asElement(html)));
  }

  static #onRender(app: any, root: HTMLElement): void {
    const tokenDoc = app.object?.document;
    const actor = tokenDoc?.actor;
    if (!game.user.isGM || !tokenDoc || !actor || actor.hasPlayerOwner) return;
    const column = root.querySelector(".col.right");
    if (!column || column.querySelector(".dac-hud")) return;
    const level = TokenSettingsAdapter.resolve(tokenDoc).settings.level;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon dac-hud";
    button.dataset.tooltip = localize("Hud.Open");
    button.innerHTML = `<i class="fa-solid fa-chess-knight"></i><span class="dac-hud-badge dac-level-${level}">${localize(`Hud.Badge.${level}`)}</span>`;
    button.addEventListener("click", event => {
      event.preventDefault();
      TokenAutomationConfig.open(tokenDoc);
    });
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      void this.cycleLevel(tokenDoc).then(() => app.render());
    });
    column.appendChild(button);
  }

  static async cycleLevel(tokenDoc: any): Promise<void> {
    const current = TokenSettingsAdapter.resolve(tokenDoc).settings.level;
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!;
    await TokenSettingsAdapter.writeTokenOverrides(tokenDoc, {...TokenSettingsAdapter.readTokenOverrides(tokenDoc), level: next});
    ui.notifications.info(`${tokenDoc.name}: ${localize(`Level.${next}`)}`);
  }
}
