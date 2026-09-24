import {CastingStateAdapter} from "../adapters/casting-state";
import {FoundryGridGraph} from "../adapters/grid-adapter";
import {SnapshotBuilder} from "../adapters/snapshot-builder";
import {SurrenderAdapter} from "../adapters/surrender";
import {TokenSettingsAdapter} from "../adapters/token-settings";
import {FLAGS, MODULE_ID, localize} from "../config";
import {log} from "../log";
import {planTurn, type PlanOptions} from "../rules/planner";
import {WorldSettingsRegistry} from "../settings/world-settings";
import type {TurnPlan} from "../types/plan";
import type {AutomationLevel, TokenAutomationSettings} from "../types/settings";
import type {CombatSnapshot} from "../types/snapshot";
import {PlanOverlay} from "../ui/plan-overlay";
import {GroupCommandController} from "./group-command";
import type {GroupCommand} from "../rules/group";
import {sanitizeConstraints, type PlanConstraints} from "../rules/constraints";
import {PreviewCard, type PreviewAdjustment, type PreviewState} from "../ui/preview-card";
import {ActionExecutor} from "./action-executor";
import {PendingStore} from "./pending-store";

export class TurnController {
  static register(): void {
    Hooks.on("combatTurnChange", (combat: any) => {
      if (!game.users.activeGM?.isSelf) return;
      void this.onTurnChange(combat).catch((error: unknown) => log.error("Zugplanung fehlgeschlagen", error));
    });
    Hooks.on("deleteCombat", (combat: any) => {
      if (!game.users.activeGM?.isSelf) return;
      void this.markPendingStale(combat.id).then(() => PendingStore.clear(combat.id));
      void this.resetCombatMemory(combat);
    });
    Hooks.on("combatStart", (combat: any) => {
      if (!game.users.activeGM?.isSelf) return;
      void this.resetCombatMemory(combat);
    });
    PreviewCard.register({
      execute: id => this.execute(id),
      cycleTarget: id => this.cycleTarget(id),
      skip: id => this.skip(id),
      endTurn: id => this.endTurn(id),
      toggleOverlay: id => this.toggleOverlay(id),
      hover: (id, on) => PlanOverlay.highlight(id, on),
      adjust: (id, patch) => this.adjustPlan(id, patch),
      command: (id, command) => this.commandGroup(id, command)
    });
    PlanOverlay.register();
  }

  /** Clears per-combat token memory (cast buffs, sticky target) for every combatant token. */
  static async resetCombatMemory(combat: any): Promise<void> {
    for (const combatant of combat.combatants ?? []) {
      const tokenDoc = combatant.token;
      if (!tokenDoc) continue;
      try {
        await tokenDoc.update({[`flags.${MODULE_ID}.-=${FLAGS.buffsCast}`]: null, [`flags.${MODULE_ID}.-=${FLAGS.currentTarget}`]: null, [`flags.${MODULE_ID}.-=${FLAGS.command}`]: null});
      } catch (error) {
        log.warn("Kampfgedächtnis konnte nicht zurückgesetzt werden", error);
      }
    }
  }

  static isAutomatable(combatant: any): boolean {
    if (!combatant?.token || !combatant.actor) return false;
    if (!combatant.isNPC || combatant.actor.hasPlayerOwner) return false;
    return combatant.token.parent?.id === canvas.scene?.id;
  }

  static async onTurnChange(combat: any): Promise<void> {
    if (!WorldSettingsRegistry.read().enabled) return;
    await this.markPendingStale(combat.id);
    const combatant = combat.combatant;
    if (!combat.started || !this.isAutomatable(combatant)) return;
    if (await this.skipSurrendered(combat, combatant)) return;
    const level = TokenSettingsAdapter.resolve(combatant.token).settings.level;
    if (level === "off") return;
    await this.plan(combat, combatant, level);
  }

  /** Surrendered NPC lose their turn (world setting) as long as someone else is still fighting. */
  static async skipSurrendered(combat: any, combatant: any): Promise<boolean> {
    if (!WorldSettingsRegistry.read().skipSurrendered || !SurrenderAdapter.isSurrendered(combatant.actor)) return false;
    const othersFighting = combat.combatants.some((c: any) => c.id !== combatant.id && !c.isDefeated && !SurrenderAdapter.isSurrendered(c.actor));
    if (!othersFighting) return false;
    await ChatMessage.create({
      content: `<p><i class="fa-solid fa-flag"></i> ${localize("Surrender.Skipped", {name: combatant.name})}</p>`,
      whisper: ChatMessage.getWhisperRecipients("GM").map((u: any) => u.id)
    });
    await combat.nextTurn();
    return true;
  }

  /** Entry point for the combat tracker button: always shows a preview, even for "off"/"auto" tokens. */
  static async planCurrent(): Promise<void> {
    const combat = game.combat;
    if (!combat?.started || !this.isAutomatable(combat.combatant)) {
      ui.notifications.warn(localize("Warn.noNpcTurn"));
      return;
    }
    await this.markPendingStale(combat.id);
    await this.plan(combat, combat.combatant, "preview");
  }

  /** Pure planning input assembled from the live scene. */
  static planOptions(snapshot: CombatSnapshot, tokenDoc: any, forcedTargetTokenId: string | null = null): PlanOptions {
    const passable = WorldSettingsRegistry.read().deadTokensBlock ? [] : snapshot.combatants.filter(c => c.defeated).map(c => c.tokenId);
    const world = WorldSettingsRegistry.read();
    return {forcedTargetTokenId, graph: new FoundryGridGraph(tokenDoc), passable, fallbackSpellRangeUnits: world.defaultSpellRangeSteps, focusLimit: world.focusLimit};
  }

  static async plan(combat: any, combatant: any, level: AutomationLevel): Promise<void> {
    const snapshot = SnapshotBuilder.build(combat);
    const tokenId = combatant.token.id;
    if (!snapshot.combatants.some(c => c.tokenId === tokenId)) return;
    const plan = planTurn(snapshot, tokenId, this.planOptions(snapshot, combatant.token));
    log.debug("Plan", plan);
    await this.reconcileCasting(combatant.token, plan);
    if (level === "auto" && plan.mode !== "skip") {
      const message = await PreviewCard.create(plan, snapshot, "executing");
      PendingStore.set(combat.id, message.id);
      await this.run(message, plan, snapshot, level);
      return;
    }
    const message = await PreviewCard.create(plan, snapshot, "pending");
    PendingStore.set(combat.id, message.id);
    if (WorldSettingsRegistry.read().showPathPreview) PlanOverlay.show(message.id, plan, snapshot);
    if (plan.mode === "skip" && level === "auto") await this.advanceIfConfigured(plan, level, snapshot);
  }

  /** A spell in preparation that the new plan does not carry on is reset (DSA5 keeps the progress otherwise). */
  static async reconcileCasting(tokenDoc: any, plan: TurnPlan): Promise<void> {
    const state = CastingStateAdapter.read(tokenDoc);
    if (!state) return;
    const continues = !plan.abortedCasting && plan.actions.some(a => a.type === "castSpell" && a.spellId === state.spellId && a.targetTokenId === state.targetTokenId);
    if (!continues) await CastingStateAdapter.abort(tokenDoc, state.spellId);
  }

  static isStale(plan: TurnPlan): boolean {
    const combat = game.combat;
    return !combat || combat.id !== plan.combatId || combat.round !== plan.round || combat.combatant?.id !== plan.combatantId;
  }

  static async markPendingStale(combatId: string): Promise<void> {
    const messageId = PendingStore.get(combatId);
    const message = messageId ? game.messages.get(messageId) : null;
    if (!message) return;
    const preview = PreviewCard.read(message);
    if (preview && preview.state === "pending") await PreviewCard.update(message, {state: "stale"});
    PlanOverlay.hide(message.id);
  }

  static async toggleOverlay(messageId: string): Promise<void> {
    const message = game.messages.get(messageId);
    const preview = message ? PreviewCard.read(message) : null;
    if (!message || !preview || preview.state !== "pending") return;
    const snapshot = SnapshotBuilder.build(game.combat);
    PlanOverlay.toggle(messageId, preview.plan, snapshot);
  }

  static async execute(messageId: string): Promise<void> {
    const message = game.messages.get(messageId);
    const preview = message ? PreviewCard.read(message) : null;
    if (!message || !preview) return;
    if (preview.state !== "pending" || this.isStale(preview.plan)) {
      ui.notifications.warn(localize("Warn.stale"));
      return;
    }
    if (ActionExecutor.busy) {
      ui.notifications.warn(localize("Warn.busy"));
      return;
    }
    await PreviewCard.update(message, {state: "executing"});
    PlanOverlay.hide(messageId);
    const snapshot = SnapshotBuilder.build(game.combat);
    await this.run(message, preview.plan, snapshot, "preview");
  }

  static async run(message: any, plan: TurnPlan, snapshot: CombatSnapshot, level: AutomationLevel): Promise<void> {
    let state: PreviewState = "done";
    try {
      const results = await ActionExecutor.execute(plan, snapshot);
      if (results.some(r => r.status === "failed")) state = "failed";
      await PreviewCard.update(message, {state, results});
    } catch (error) {
      log.error("Ausführung fehlgeschlagen", error);
      await PreviewCard.update(message, {state: "failed", results: [{action: {type: "wait", reasonKey: "Result.error"}, status: "failed", detail: String(error)}]});
      return;
    }
    await this.advanceIfConfigured(plan, level, snapshot);
  }

  static shouldAdvance(level: AutomationLevel, settings: TokenAutomationSettings | undefined): boolean {
    if (settings && settings.autoAdvanceTurn !== null) return settings.autoAdvanceTurn;
    const rule = WorldSettingsRegistry.read().advanceTurn;
    return rule === "always" || (rule === "autoOnly" && level === "auto");
  }

  static async advanceIfConfigured(plan: TurnPlan, level: AutomationLevel, snapshot: CombatSnapshot): Promise<void> {
    const self = snapshot.combatants.find(c => c.tokenId === plan.tokenId);
    if (!this.shouldAdvance(level, self?.settings)) return;
    if (this.isStale(plan)) return;
    await game.combat.nextTurn();
  }

  static async cycleTarget(messageId: string): Promise<void> {
    const message = game.messages.get(messageId);
    const preview = message ? PreviewCard.read(message) : null;
    if (!message || !preview) return;
    if (preview.state !== "pending" || this.isStale(preview.plan)) {
      ui.notifications.warn(localize("Warn.stale"));
      return;
    }
    const snapshot = SnapshotBuilder.build(game.combat);
    const previous = preview.plan;
    const gmTargets: string[] = Array.from(game.user.targets as Set<any>).map((t: any) => t.id);
    const pool = [...previous.candidates.map(c => c.tokenId)];
    for (const id of gmTargets) if (!pool.includes(id) && id !== previous.tokenId) pool.unshift(id);
    if (pool.length === 0) {
      ui.notifications.info(localize("Warn.noCandidates"));
      return;
    }
    const current = pool.indexOf(previous.targetTokenId ?? "");
    const next = pool[(current + 1) % pool.length]!;
    await this.replan(message, preview.constraints ?? {}, {targetTokenId: next}, snapshot);
  }

  /** GM adjustment from the card: merges the patch into the stored constraints and plans again. */
  static async adjustPlan(messageId: string, patch: PreviewAdjustment): Promise<void> {
    const message = game.messages.get(messageId);
    const preview = message ? PreviewCard.read(message) : null;
    if (!message || !preview) return;
    if (preview.state !== "pending" || this.isStale(preview.plan)) {
      ui.notifications.warn(localize("Warn.stale"));
      return;
    }
    const snapshot = SnapshotBuilder.build(game.combat);
    await this.replan(message, patch === "reset" ? {} : preview.constraints ?? {}, patch === "reset" ? {} : patch, snapshot);
  }

  /** Leader's order from the card: applies it to the faction and plans the leader's turn again. */
  static async commandGroup(messageId: string, command: string | null): Promise<void> {
    const message = game.messages.get(messageId);
    const preview = message ? PreviewCard.read(message) : null;
    if (!message || !preview) return;
    if (preview.state !== "pending" || this.isStale(preview.plan)) {
      ui.notifications.warn(localize("Warn.stale"));
      return;
    }
    const tokenDoc = canvas.scene.tokens.get(preview.plan.tokenId);
    if (!tokenDoc) return;
    await GroupCommandController.apply(tokenDoc, (command as GroupCommand | null) || null);
    await this.replan(message, preview.constraints ?? {}, {}, SnapshotBuilder.build(game.combat));
  }

  static async replan(message: any, base: PlanConstraints, patch: Partial<PlanConstraints>, snapshot: CombatSnapshot): Promise<void> {
    const previous = PreviewCard.read(message)!.plan;
    const merged: Record<string, unknown> = {...base};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    const constraints = sanitizeConstraints(merged);
    const tokenDoc = canvas.scene.tokens.get(previous.tokenId);
    const plan = planTurn(snapshot, previous.tokenId, {...this.planOptions(snapshot, tokenDoc, constraints.targetTokenId ?? null), constraints});
    plan.candidateIndex = previous.candidateIndex;
    await PreviewCard.update(message, {plan, snapshot, state: "pending", constraints});
    if (WorldSettingsRegistry.read().showPathPreview) PlanOverlay.show(message.id, plan, snapshot);
  }

  static async skip(messageId: string): Promise<void> {
    const message = game.messages.get(messageId);
    const preview = message ? PreviewCard.read(message) : null;
    if (!message || !preview) return;
    if (preview.state !== "pending") return;
    PlanOverlay.hide(messageId);
    await PreviewCard.update(message, {state: "skipped"});
  }

  static async endTurn(messageId: string): Promise<void> {
    const message = game.messages.get(messageId);
    const preview = message ? PreviewCard.read(message) : null;
    if (!message || !preview) return;
    if (this.isStale(preview.plan)) {
      ui.notifications.warn(localize("Warn.stale"));
      return;
    }
    await game.combat.nextTurn();
  }
}
