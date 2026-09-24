import {OpposedAdapter} from "../adapters/opposed-adapter";
import {MODULE_ID} from "../config";
import {log} from "../log";
import {WorldSettingsRegistry} from "../settings/world-settings";

/**
 * Applies the damage of a won opposed test to the defender. DSA5 only offers a GM button for this;
 * we hook the async `postProcessOpposedResult` and mark the result card the same way the button would.
 */
export class DamageController {
  static #applied = new Set<string>();
  static #pendingMarks = new Map<string, number>();

  static register(): void {
    const hooks = game.dsa5?.config?.asyncHooks;
    if (!hooks?.postProcessOpposedResult) {
      log.warn("DSA5 asyncHooks.postProcessOpposedResult fehlt – Schaden wird nicht automatisch angewendet.");
      return;
    }
    hooks.postProcessOpposedResult.push(async (attacker: any, defender: any, result: any, options: any) => {
      if (!game.users.activeGM?.isSelf) return;
      try {
        await this.onResult(attacker, defender, result, options);
      } catch (error) {
        log.error("Schadensanwendung fehlgeschlagen", error);
      }
    });
    Hooks.on("createChatMessage", (message: any) => {
      if (!game.users.activeGM?.isSelf) return;
      const meta = message.flags?.dsa5?.opposedMeta;
      if (!meta) return;
      const key = this.key(meta.startMessageId, meta.attackerMessageId, meta.defenderMessageId);
      const amount = this.#pendingMarks.get(key);
      if (amount === undefined) return;
      this.#pendingMarks.delete(key);
      void message.update({"flags.data.damageApplied": true, [`flags.${MODULE_ID}.damageApplied`]: {amount, at: Date.now()}});
    });
    Hooks.on("renderChatMessageHTML", (message: any, html: any) => {
      if (!message.flags?.[MODULE_ID]?.damageApplied) return;
      const root: HTMLElement = html instanceof HTMLElement ? html : html[0];
      for (const button of root.querySelectorAll(".applyDamage")) button.remove();
      const anchor = root.querySelector(".hideAnchor") ?? root.querySelector(".message-content");
      if (anchor && !root.querySelector(".dac-damage-applied")) {
        const mark = document.createElement("span");
        mark.className = "dac-damage-applied";
        mark.innerHTML = `<i class="fa-solid fa-check"></i> ${game.i18n.localize("damageApplied")}`;
        anchor.appendChild(mark);
      }
    });
  }

  static key(startMessageId?: string, attackerMessageId?: string, defenderMessageId?: string): string {
    return startMessageId ?? `${attackerMessageId}:${defenderMessageId}`;
  }

  static async onResult(attacker: any, defender: any, result: any, options: any): Promise<void> {
    const world = WorldSettingsRegistry.read();
    if (!world.enabled || world.damageApplication === "never") return;
    if (result?.winner !== "attacker" || !result.damage) return;
    const key = this.key(options?.startMessageId, attacker?.messageId, defender?.messageId);
    if (this.#applied.has(key)) return;
    const defenderActor = OpposedAdapter.speakerActor(defender?.speaker) ?? defender?.testResult?.actor ?? null;
    if (!defenderActor) return;
    if (defenderActor.hasPlayerOwner) {
      if (world.damageApplication !== "everyone") return;
      if (game.settings.get("dsa5", "applyDamageInChat")) return;
    }
    const amount = Math.max(0, Number(result.damage.value) || 0);
    if (amount <= 0) return;
    this.#applied.add(key);
    this.#pendingMarks.set(key, amount);
    log.debug("Schaden anwenden", defenderActor.name, amount);
    await defenderActor.applyDamage(amount, {messageId: attacker?.messageId, hit: true});
  }
}
