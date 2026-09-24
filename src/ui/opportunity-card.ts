import {FLAGS, MODULE_ID, localize} from "../config";

export type OpportunityState = "pending" | "done" | "declined" | "stale";

export interface OpportunityData {
  key: string;
  attackerTokenId: string;
  targetTokenId: string;
  attackerName: string;
  targetName: string;
  weaponName: string;
  state: OpportunityState;
  detail?: string;
  /** Users allowed to press the buttons (attacker owners); GMs always may. */
  userIds: string[];
}

export interface OpportunityHandlers {
  execute(messageId: string): Promise<void>;
  decline(messageId: string): Promise<void>;
}

const TEMPLATE = `modules/${MODULE_ID}/templates/opportunity-card.hbs`;

/** Chat card offering a Passierschlag (attack of opportunity) to the entitled attacker. */
export class OpportunityCard {
  static #handlers: OpportunityHandlers | null = null;

  static register(handlers: OpportunityHandlers): void {
    this.#handlers = handlers;
    Hooks.on("renderChatMessageHTML", (message: any, html: any) => this.#onRender(message, html instanceof HTMLElement ? html : html[0]));
  }

  static read(message: any): OpportunityData | null {
    const data = message?.flags?.[MODULE_ID]?.[FLAGS.opportunity];
    return data?.attackerTokenId ? (data as OpportunityData) : null;
  }

  static async create(data: OpportunityData, whisperTo: string[]): Promise<any> {
    return ChatMessage.create({
      content: await this.render(data),
      whisper: whisperTo,
      speaker: {alias: localize("Opportunity.Title")},
      flags: {[MODULE_ID]: {[FLAGS.opportunity]: data}}
    });
  }

  static async update(message: any, patch: Partial<OpportunityData>): Promise<void> {
    const current = this.read(message);
    if (!current) return;
    const data = {...current, ...patch};
    await message.update({content: await this.render(data), [`flags.${MODULE_ID}.${FLAGS.opportunity}`]: data});
  }

  static async render(data: OpportunityData): Promise<string> {
    return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
      title: localize("Opportunity.Title"),
      text: localize("Opportunity.Text", {attacker: data.attackerName, target: data.targetName, weapon: data.weaponName}),
      rule: localize("Opportunity.Rule"),
      state: data.state,
      stateLabel: localize(`Opportunity.State.${data.state}`),
      detail: data.detail ?? "",
      pending: data.state === "pending",
      labels: {execute: localize("Opportunity.Execute"), decline: localize("Opportunity.Decline")}
    });
  }

  static #onRender(message: any, root: HTMLElement): void {
    const data = this.read(message);
    if (!data || !root) return;
    const allowed = game.user.isGM || data.userIds.includes(game.user.id);
    for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-dac-opportunity]")) {
      if (!allowed) {
        button.remove();
        continue;
      }
      button.addEventListener("click", event => {
        event.preventDefault();
        const action = button.dataset.dacOpportunity as keyof OpportunityHandlers;
        void this.#handlers?.[action]?.(message.id);
      });
    }
  }
}
