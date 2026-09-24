/** Cache of the preview message per combat; the authoritative state lives in the message flags. */
export class PendingStore {
  static #messages = new Map<string, string>();

  static set(combatId: string, messageId: string): void {
    this.#messages.set(combatId, messageId);
  }

  static get(combatId: string): string | undefined {
    return this.#messages.get(combatId);
  }

  static clear(combatId: string): void {
    this.#messages.delete(combatId);
  }
}
