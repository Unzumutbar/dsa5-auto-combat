import {MODULE_ID, SETTINGS, localize} from "../config";
import {WorldSettingsRegistry} from "../settings/world-settings";

/** Emergency switch in the token scene controls: toggles the world setting "Automatisierung aktiv". */
export class SceneControlToggle {
  static register(): void {
    Hooks.on("getSceneControlButtons", (controls: any) => {
      if (!game.user?.isGM) return;
      const tokens = controls?.tokens;
      if (!tokens?.tools) return;
      tokens.tools.dsa5AutoCombat = {
        name: "dsa5AutoCombat",
        title: "DSAAUTOCOMBAT.Controls.Toggle",
        icon: "fa-solid fa-chess-knight",
        order: 100,
        toggle: true,
        active: WorldSettingsRegistry.read().enabled,
        visible: true,
        onChange: (_event: Event, active: boolean) => {
          void game.settings.set(MODULE_ID, SETTINGS.enabled, active).then(() => {
            ui.notifications.info(localize(active ? "Notify.enabled" : "Notify.disabled"));
          });
        }
      };
    });
  }
}
