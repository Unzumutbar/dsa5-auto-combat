import {MODULE_ID, SETTINGS, localize} from "../config";
import {PendingStore} from "../orchestration/pending-store";
import {TurnController} from "../orchestration/turn-controller";
import {WorldSettingsRegistry} from "../settings/world-settings";

/** GM keyboard shortcuts; registered during `init` (Foundry rejects later registrations). */
export class Keybindings {
  static register(): void {
    game.keybindings.register(MODULE_ID, "planTurn", {
      name: "DSAAUTOCOMBAT.Keys.planTurn",
      hint: "DSAAUTOCOMBAT.Keys.planTurnHint",
      editable: [{key: "KeyP", modifiers: ["Shift"]}],
      restricted: true,
      onDown: () => {
        void TurnController.planCurrent();
        return true;
      }
    });
    game.keybindings.register(MODULE_ID, "executePreview", {
      name: "DSAAUTOCOMBAT.Keys.executePreview",
      hint: "DSAAUTOCOMBAT.Keys.executePreviewHint",
      editable: [{key: "Enter", modifiers: ["Shift"]}],
      restricted: true,
      onDown: () => {
        const combat = game.combat;
        const messageId = combat ? PendingStore.get(combat.id) : undefined;
        if (!messageId) {
          ui.notifications.info(localize("Keys.noPending"));
          return true;
        }
        void TurnController.execute(messageId);
        return true;
      }
    });
    game.keybindings.register(MODULE_ID, "toggleEnabled", {
      name: "DSAAUTOCOMBAT.Keys.toggleEnabled",
      hint: "DSAAUTOCOMBAT.Keys.toggleEnabledHint",
      editable: [{key: "KeyA", modifiers: ["Shift", "Alt"]}],
      restricted: true,
      onDown: () => {
        void Keybindings.toggleEnabled();
        return true;
      }
    });
  }

  static async toggleEnabled(): Promise<boolean> {
    const next = !WorldSettingsRegistry.read().enabled;
    await game.settings.set(MODULE_ID, SETTINGS.enabled, next);
    ui.notifications.info(localize(next ? "Notify.enabled" : "Notify.disabled"));
    ui.controls?.render();
    return next;
  }
}
