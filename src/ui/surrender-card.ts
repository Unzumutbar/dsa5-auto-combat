import {FLAGS, MODULE_ID, localize} from "../config";

export type SurrenderState = "pending" | "accepted" | "fighting";

export interface SurrenderCardData {
  tokenId: string;
  tokenName: string;
  reasonKey: string;
  state: SurrenderState;
  posted: boolean;
}

export interface SurrenderHandlers {
  accept(messageId: string): Promise<void>;
  fightOn(messageId: string): Promise<void>;
  post(messageId: string): Promise<void>;
}

const TEMPLATE = `modules/${MODULE_ID}/templates/surrender-card.hbs`;

/** GM card announcing a surrender with "accept", "fights on" and "post text" buttons. */
export class SurrenderCard {
  static #handlers: SurrenderHandlers | null = null;

  static register(handlers: SurrenderHandlers): void {
    this.#handlers = handlers;
    Hooks.on("renderChatMessageHTML", (message: any, html: any) => this.#onRender(message, html instanceof HTMLElement ? html : html[0]));
  }

  static read(message: any): SurrenderCardData | null {
    const data = message?.flags?.[MODULE_ID]?.[FLAGS.surrenderCard];
    return data?.tokenId ? (data as SurrenderCardData) : null;
  }

  static async create(data: SurrenderCardData): Promise<any> {
    const tokenDoc = canvas.scene?.tokens.get(data.tokenId);
    return ChatMessage.create({
      content: await this.render(data),
      whisper: ChatMessage.getWhisperRecipients("GM").map((u: any) => u.id),
      speaker: {token: data.tokenId, actor: tokenDoc?.actor?.id, scene: canvas.scene?.id, alias: data.tokenName},
      flags: {[MODULE_ID]: {[FLAGS.surrenderCard]: data}}
    });
  }

  static async update(message: any, patch: Partial<SurrenderCardData>): Promise<void> {
    const current = this.read(message);
    if (!current) return;
    const data = {...current, ...patch};
    await message.update({content: await this.render(data), [`flags.${MODULE_ID}.${FLAGS.surrenderCard}`]: data});
  }

  static async render(data: SurrenderCardData): Promise<string> {
    return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
      title: localize("Surrender.Title"),
      text: localize("Surrender.Text", {name: data.tokenName, reason: localize(data.reasonKey)}),
      hint: localize("Surrender.Hint"),
      state: data.state,
      stateLabel: localize(`Surrender.State.${data.state}`),
      pending: data.state === "pending",
      canPost: data.state !== "fighting" && !data.posted,
      labels: {accept: localize("Surrender.Accept"), fightOn: localize("Surrender.FightOn"), post: localize("Surrender.Post")}
    });
  }

  static #onRender(message: any, root: HTMLElement): void {
    const data = this.read(message);
    if (!data || !root || !game.user.isGM) return;
    for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-dac-surrender]")) {
      button.addEventListener("click", event => {
        event.preventDefault();
        const action = button.dataset.dacSurrender as keyof SurrenderHandlers;
        void this.#handlers?.[action]?.(message.id);
      });
    }
  }
}
