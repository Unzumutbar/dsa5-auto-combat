import {localize} from "../config";
import {TokenAutomationConfig} from "./token-automation-config";

/** Adds an "Auto Combat" header button to the token config (placed token) and the prototype token config (actor fallback). */
export class TokenConfigHeader {
  static register(): void {
    const add = (app: any, controls: any[]) => {
      if (!game.user.isGM) return;
      const document = app.document ?? app.token;
      if (!document) return;
      controls.push({
        icon: "fa-solid fa-chess-knight",
        label: localize("Config.Open"),
        action: "dsa5AutoCombat",
        onClick: () => {
          if (document.documentName === "Token") TokenAutomationConfig.open(document);
          else if (document.actor) TokenAutomationConfig.openForActor(document.actor);
        }
      });
    };
    Hooks.on("getHeaderControlsTokenConfig", add);
    Hooks.on("getHeaderControlsPrototypeTokenConfig", add);
  }
}
