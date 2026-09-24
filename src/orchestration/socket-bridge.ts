import {MODULE_ID} from "../config";
import {log} from "../log";

export type SocketPayload =
  | {type: "opportunityResolved"; messageId: string; state: "done" | "declined"; detail?: string};

type Handler = (payload: SocketPayload, userId: string) => Promise<void> | void;

/** Minimal socket relay: players cannot update GM-authored chat cards, so they ask the active GM to do it. */
export class SocketBridge {
  static #handlers: Handler[] = [];
  static get channel(): string {
    return `module.${MODULE_ID}`;
  }

  static register(): void {
    game.socket.on(this.channel, (payload: SocketPayload, userId: string) => {
      for (const handler of this.#handlers) {
        void Promise.resolve(handler(payload, userId)).catch((error: unknown) => log.error("Socket-Handler fehlgeschlagen", error));
      }
    });
  }

  static on(handler: Handler): void {
    this.#handlers.push(handler);
  }

  /** Runs locally when this client is the active GM, otherwise relays to the GM. */
  static async toActiveGM(payload: SocketPayload): Promise<void> {
    if (game.users.activeGM?.isSelf) {
      for (const handler of this.#handlers) await handler(payload, game.user.id);
      return;
    }
    game.socket.emit(this.channel, payload);
  }
}
