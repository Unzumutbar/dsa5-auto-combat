import {FLAGS, MODULE_ID, localize} from "../config";
import type {ActionResult} from "../orchestration/action-executor";
import {TokenSettingsAdapter} from "../adapters/token-settings";
import {hasConstraints, type PlanConstraints} from "../rules/constraints";
import {GROUP_COMMANDS} from "../rules/group";
import {describeAction} from "../rules/explain";
import {WorldSettingsRegistry} from "../settings/world-settings";
import type {Action, ExplainEntry, TurnPlan} from "../types/plan";
import type {CombatSnapshot} from "../types/snapshot";

export type PreviewState = "pending" | "executing" | "done" | "skipped" | "stale" | "failed";

export interface PreviewChoices {
  weapons: {id: string; name: string}[];
  spells: {id: string; name: string}[];
}

export interface PreviewData {
  plan: TurnPlan;
  state: PreviewState;
  names: Record<string, string>;
  tokenImg: string;
  results?: ActionResult[];
  constraints?: PlanConstraints;
  choices?: PreviewChoices;
}

export type PreviewAdjustment = Partial<PlanConstraints> | "reset";

export interface PreviewHandlers {
  execute(messageId: string): Promise<void>;
  cycleTarget(messageId: string): Promise<void>;
  skip(messageId: string): Promise<void>;
  endTurn(messageId: string): Promise<void>;
  toggleOverlay(messageId: string): Promise<void>;
  hover(messageId: string, on: boolean): void;
  adjust(messageId: string, patch: PreviewAdjustment): Promise<void>;
  command(messageId: string, command: string | null): Promise<void>;
}

const TEMPLATE = `modules/${MODULE_ID}/templates/preview-card.hbs`;

function localizeEntry(entry: ExplainEntry): string {
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry.params ?? {})) {
    if (typeof value === "object") params[key] = localizeEntry(value);
    else params[key] = typeof value === "string" && /^(Action|Explain|Spell|Result)\./.test(value) ? localize(value) : value;
  }
  return localize(entry.key, params);
}

export class PreviewCard {
  static #handlers: PreviewHandlers | null = null;

  static register(handlers: PreviewHandlers): void {
    this.#handlers = handlers;
    Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => this.#onRender(message, html));
  }

  static read(message: any): PreviewData | null {
    const data = message?.flags?.[MODULE_ID]?.[FLAGS.preview];
    return data?.plan ? (data as PreviewData) : null;
  }

  static namesFrom(snapshot: CombatSnapshot): Record<string, string> {
    return Object.fromEntries(snapshot.combatants.map(c => [c.tokenId, c.name]));
  }

  static choicesFrom(snapshot: CombatSnapshot, tokenId: string): PreviewChoices {
    const self = snapshot.combatants.find(c => c.tokenId === tokenId);
    return {
      weapons: [...(self?.weapons ?? []), ...(self?.stowedWeapons ?? [])].filter(w => !w.isShield).map(w => ({id: w.itemId, name: w.worn ? w.name : `${w.name} (${localize("Card.Adjust.Stowed")})`})),
      spells: (self?.spells ?? []).map(s => ({id: s.itemId, name: s.name}))
    };
  }

  static async create(plan: TurnPlan, snapshot: CombatSnapshot, state: PreviewState): Promise<any> {
    const tokenDoc = canvas.scene?.tokens.get(plan.tokenId);
    const data: PreviewData = {plan, state, names: this.namesFrom(snapshot), tokenImg: tokenDoc?.texture?.src ?? tokenDoc?.actor?.img ?? "", choices: this.choicesFrom(snapshot, plan.tokenId)};
    const whisper = ChatMessage.getWhisperRecipients("GM").map((u: any) => u.id);
    return ChatMessage.create({
      content: await this.render(data),
      whisper,
      speaker: {token: plan.tokenId, actor: tokenDoc?.actor?.id, scene: snapshot.sceneId, alias: tokenDoc?.name},
      flags: {[MODULE_ID]: {[FLAGS.preview]: data}}
    });
  }

  static async update(message: any, patch: {state?: PreviewState; plan?: TurnPlan; snapshot?: CombatSnapshot; results?: ActionResult[]; constraints?: PlanConstraints}): Promise<void> {
    const current = this.read(message);
    if (!current) return;
    const data: PreviewData = {
      ...current,
      ...(patch.plan ? {plan: patch.plan} : {}),
      ...(patch.snapshot ? {names: this.namesFrom(patch.snapshot), choices: this.choicesFrom(patch.snapshot, current.plan.tokenId)} : {}),
      ...(patch.state ? {state: patch.state} : {}),
      ...(patch.results ? {results: patch.results} : {}),
      ...(patch.constraints ? {constraints: patch.constraints} : {})
    };
    // Foundry merges nested flag objects, so cleared constraint keys must be deleted explicitly first.
    if (patch.constraints) await message.update({[`flags.${MODULE_ID}.${FLAGS.preview}.-=constraints`]: null}, {render: false});
    await message.update({content: await this.render(data), [`flags.${MODULE_ID}.${FLAGS.preview}`]: data});
  }

  static async render(data: PreviewData): Promise<string> {
    const {plan, state} = data;
    const nameOf = (id: string | null) => (id ? data.names[id] ?? id : localize("Action.Self"));
    const showOdds = WorldSettingsRegistry.read().showOdds;
    const context = {
      tokenImg: data.tokenImg,
      name: nameOf(plan.tokenId),
      round: localize("Card.Round", {round: plan.round}),
      mode: localize(`Card.Mode.${plan.mode}`),
      state,
      stateLabel: localize(`Card.State.${state}`),
      targetName: plan.targetTokenId ? nameOf(plan.targetTokenId) : localize("Card.NoTarget"),
      actions: plan.actions.map((a, index) => ({
        text: localizeEntry(describeAction(a, nameOf)), odds: showOdds ? this.#oddsText(a) : null, index,
        removable: state === "pending" && a.type !== "wait"
      })),
      adjust: state === "pending" && plan.mode !== "skip" ? this.#adjustContext(data) : null,
      adjusted: hasConstraints(data.constraints),
      explanation: plan.explanation.map(localizeEntry),
      warnings: plan.warnings.map(localizeEntry),
      results: (data.results ?? []).map(r => ({
        text: localizeEntry(describeAction(r.action, nameOf)),
        status: r.status,
        statusLabel: this.#statusLabel(r)
      })),
      pending: state === "pending",
      canCycle: state === "pending" && plan.mode !== "skip" && plan.mode !== "surrender",
      showEndTurn: state === "done" || state === "skipped" || state === "failed" || (state === "pending" && plan.mode === "skip"),
      showOverlayToggle: state === "pending" && plan.actions.some(a => a.type === "move" || a.type === "rangedAttack" || a.type === "castSpell"),
      labels: {
        target: localize("Card.Target"),
        actions: localize("Card.Actions"),
        results: localize("Card.Results"),
        execute: localize("Card.Execute"),
        cycleTarget: localize("Card.CycleTarget"),
        skip: localize("Card.Skip"),
        endTurn: localize("Card.EndTurn"),
        toggleOverlay: localize("Card.ToggleOverlay"),
        adjust: localize("Card.Adjust.Title"),
        adjusted: localize("Card.Adjust.Adjusted"),
        weapon: localize("Card.Adjust.Weapon"),
        spell: localize("Card.Adjust.Spell"),
        auto: localize("Card.Adjust.Auto"),
        noSpell: localize("Card.Adjust.NoSpell"),
        noMove: localize("Card.Adjust.NoMove"),
        reset: localize("Card.Adjust.Reset"),
        remove: localize("Card.Adjust.Remove"),
        command: localize("Command.Title")
      }
    };
    return foundry.applications.handlebars.renderTemplate(TEMPLATE, context);
  }

  static #adjustContext(data: PreviewData): Record<string, unknown> {
    const constraints = data.constraints ?? {};
    const choices = data.choices ?? {weapons: [], spells: []};
    const targetIds = data.plan.candidates.map(c => c.tokenId);
    if (data.plan.targetTokenId && !targetIds.includes(data.plan.targetTokenId)) targetIds.unshift(data.plan.targetTokenId);
    return {
      targets: targetIds.map(id => ({id, name: data.names[id] ?? id, selected: id === data.plan.targetTokenId})),
      weapons: choices.weapons.map(w => ({...w, selected: w.id === constraints.weaponId})),
      spells: choices.spells.map(s => ({...s, selected: s.id === constraints.spellId})),
      noSpell: constraints.spellId === null,
      noMove: Boolean(constraints.noMove),
      hasSpells: choices.spells.length > 0,
      commands: this.#commandContext(data)
    };
  }

  static #oddsText(action: Action): string | null {
    const format = (n: number, digits = 0) => new Intl.NumberFormat(game.i18n.lang, {maximumFractionDigits: digits}).format(n);
    if ((action.type === "meleeAttack" || action.type === "rangedAttack") && action.odds) {
      return localize("Odds.attack", {hit: format(action.odds.hitChance * 100), damage: format(action.odds.expectedDamage, 1)});
    }
    if (action.type === "castSpell" && action.odds) return localize("Odds.spell", {chance: format(action.odds.successChance * 100)});
    return null;
  }

  /** Leaders get a "group command" selector; the current command is read from the token flag. */
  static #commandContext(data: PreviewData): {options: {value: string; label: string; selected: boolean}[]} | null {
    const tokenDoc = canvas.scene?.tokens.get(data.plan.tokenId);
    if (!tokenDoc || !TokenSettingsAdapter.resolve(tokenDoc).settings.isLeader) return null;
    const current = TokenSettingsAdapter.readCommand(tokenDoc) ?? "";
    return {
      options: ["", ...GROUP_COMMANDS].map(value => ({value, label: localize(value ? `Command.${value}` : "Command.none"), selected: value === current}))
    };
  }

  static #statusLabel(result: ActionResult): string {
    const detail = result.detail ? (result.detail.startsWith("Result.") ? localize(result.detail) : result.detail) : "";
    if (result.status === "failed") return localize("Result.failed", {error: detail});
    const base = localize(`Result.${result.status}`);
    return detail ? `${base} (${detail})` : base;
  }

  static #onRender(message: any, html: HTMLElement): void {
    const preview = this.read(message);
    if (!preview || !game.user.isGM) return;
    const root: HTMLElement = (html as any) instanceof HTMLElement ? html : (html as any)[0];
    const card = root.querySelector(".dsa5-auto-combat-card");
    if (card) {
      card.addEventListener("mouseenter", () => this.#handlers?.hover(message.id, true));
      card.addEventListener("mouseleave", () => this.#handlers?.hover(message.id, false));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-dac-action]")) {
      button.addEventListener("click", event => {
        event.preventDefault();
        const action = button.dataset.dacAction;
        if (action === "resetPlan") void this.#handlers?.adjust(message.id, "reset");
        else void this.#handlers?.[action as "execute" | "cycleTarget" | "skip" | "endTurn" | "toggleOverlay"]?.(message.id);
      });
    }
    for (const select of root.querySelectorAll<HTMLSelectElement | HTMLInputElement>("[data-dac-adjust]")) {
      select.addEventListener("change", () => {
        const key = select.dataset.dacAdjust as keyof PlanConstraints;
        const patch: Partial<PlanConstraints> = {};
        if (key === "noMove") patch.noMove = (select as HTMLInputElement).checked;
        else if (key === "spellId") patch.spellId = select.value === "-" ? null : select.value || undefined;
        else if (key === "weaponId") patch.weaponId = select.value || undefined;
        else if (key === "targetTokenId") patch.targetTokenId = select.value || undefined;
        void this.#handlers?.adjust(message.id, patch);
      });
    }
    const commandSelect = root.querySelector<HTMLSelectElement>("select[data-dac-command]");
    commandSelect?.addEventListener("change", () => void this.#handlers?.command(message.id, commandSelect.value || null));
    for (const link of root.querySelectorAll<HTMLElement>("[data-dac-remove]")) {
      link.addEventListener("click", event => {
        event.preventDefault();
        const action = preview.plan.actions[Number(link.dataset.dacRemove)];
        if (!action) return;
        const drop = (preview.constraints?.dropActions ?? 0) + 1;
        const patch: Partial<PlanConstraints> = action.type === "move" ? {noMove: true} : action.type === "castSpell" ? {spellId: null} : {dropActions: drop};
        void this.#handlers?.adjust(message.id, patch);
      });
    }
  }
}
