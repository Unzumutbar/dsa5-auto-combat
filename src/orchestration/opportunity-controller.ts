import {Dsa5RollAdapter} from "../adapters/dsa5-roll-adapter";
import {TokenGeometry} from "../adapters/geometry";
import {SnapshotBuilder} from "../adapters/snapshot-builder";
import {TokenSettingsAdapter} from "../adapters/token-settings";
import {WeaponsAdapter} from "../adapters/weapons";
import {localize} from "../config";
import {log} from "../log";
import {detectProvoked} from "../rules/opportunity";
import {bestMeleeWeapon} from "../rules/reach";
import {WorldSettingsRegistry} from "../settings/world-settings";
import {OpportunityCard, type OpportunityData} from "../ui/opportunity-card";
import {SocketBridge} from "./socket-bridge";

const TELEPORT_ACTIONS = new Set(["displace", "blink"]);

/**
 * Detects movements that leave an enemy's melee reach (Passierschlag) on the active GM client and
 * either executes the free attack (automatic NPCs), asks the GM (preview NPCs) or asks the owning
 * players via a whispered chat card.
 */
export class OpportunityController {
  static #handled = new Set<string>();
  static #pendingCards = new Set<string>();
  static #executing = new Set<string>();

  static register(): void {
    Hooks.on("moveToken", (doc: any, movement: any, operation: any, user: any) => {
      if (!game.users.activeGM?.isSelf) return;
      void this.onMove(doc, movement, operation, user).catch((error: unknown) => log.error("Passierschlag-Erkennung fehlgeschlagen", error));
    });
    Hooks.on("combatTurnChange", () => {
      if (!game.users.activeGM?.isSelf) return;
      void this.markPendingStale();
    });
    OpportunityCard.register({execute: id => this.executeFromCard(id), decline: id => this.declineFromCard(id)});
    SocketBridge.on(async payload => {
      if (payload.type !== "opportunityResolved") return;
      const message = game.messages.get(payload.messageId);
      if (message) await OpportunityCard.update(message, {state: payload.state, detail: payload.detail});
    });
  }

  static isTeleport(movement: any): boolean {
    const waypoints: any[] = movement?.passed?.waypoints ?? movement?.waypoints ?? [];
    if (waypoints.some(w => TELEPORT_ACTIONS.has(w?.action))) return true;
    return TELEPORT_ACTIONS.has(movement?.method) || TELEPORT_ACTIONS.has(movement?.destination?.action);
  }

  static async onMove(doc: any, movement: any, _operation: any, _user: any): Promise<void> {
    const combat = game.combat;
    if (!WorldSettingsRegistry.read().enabled || !combat?.started) return;
    if (doc.parent?.id !== canvas.scene?.id) return;
    if (!combat.combatants.some((c: any) => c.tokenId === doc.id)) return;
    if (this.isTeleport(movement)) return;
    const origin = movement?.origin ?? movement?.passed?.waypoints?.[0];
    if (!origin || typeof origin.x !== "number") return;
    const after = TokenGeometry.position(doc);
    if (origin.x === after.x && origin.y === after.y) return;
    const snapshot = SnapshotBuilder.build(combat);
    if (!snapshot.combatants.some(c => c.tokenId === doc.id)) return;
    const adjacentBefore: Record<string, boolean> = {};
    const adjacentAfter: Record<string, boolean> = {};
    for (const other of snapshot.combatants) {
      if (other.tokenId === doc.id) continue;
      const otherDoc = canvas.scene.tokens.get(other.tokenId);
      if (!otherDoc) continue;
      adjacentBefore[other.tokenId] = TokenGeometry.adjacentAt(doc, {x: origin.x, y: origin.y, elevation: origin.elevation ?? doc.elevation}, otherDoc);
      adjacentAfter[other.tokenId] = TokenGeometry.adjacent(doc, otherDoc);
    }
    const attackers = detectProvoked(snapshot, doc.id, adjacentBefore, adjacentAfter);
    if (attackers.length === 0) return;
    const movementId = String(movement?.id ?? `${doc.id}:${after.x}:${after.y}:${combat.round}:${combat.turn}`);
    for (const attackerId of attackers) {
      const key = `${movementId}:${attackerId}`;
      if (this.#handled.has(key)) continue;
      this.#handled.add(key);
      await this.offer(attackerId, doc.id, key);
    }
  }

  static async offer(attackerTokenId: string, targetTokenId: string, key: string): Promise<void> {
    const attackerDoc = canvas.scene?.tokens.get(attackerTokenId);
    const targetDoc = canvas.scene?.tokens.get(targetTokenId);
    const actor = attackerDoc?.actor;
    if (!attackerDoc || !targetDoc || !actor) return;
    const weapon = bestMeleeWeapon(WeaponsAdapter.list(actor));
    if (!weapon) return;
    const data: OpportunityData = {
      key,
      attackerTokenId,
      targetTokenId,
      attackerName: attackerDoc.name,
      targetName: targetDoc.name,
      weaponName: weapon.name,
      state: "pending",
      userIds: []
    };
    const gmIds: string[] = ChatMessage.getWhisperRecipients("GM").map((u: any) => u.id);
    if (actor.hasPlayerOwner) {
      const owners: string[] = game.users.filter((u: any) => !u.isGM && actor.testUserPermission(u, "OWNER")).map((u: any) => u.id);
      data.userIds = owners;
      const message = await OpportunityCard.create(data, [...new Set([...owners, ...gmIds])]);
      this.#pendingCards.add(message.id);
      return;
    }
    const level = TokenSettingsAdapter.resolve(attackerDoc).settings.level;
    if (level === "off") return;
    if (level === "auto") {
      const message = await OpportunityCard.create(data, gmIds);
      await this.execute(message, data);
      return;
    }
    const message = await OpportunityCard.create(data, gmIds);
    this.#pendingCards.add(message.id);
  }

  static async executeFromCard(messageId: string): Promise<void> {
    const message = game.messages.get(messageId);
    const data = message ? OpportunityCard.read(message) : null;
    if (!message || !data || data.state !== "pending") return;
    if (this.#executing.has(messageId)) return;
    const attackerDoc = canvas.scene?.tokens.get(data.attackerTokenId);
    if (!attackerDoc?.actor?.isOwner) {
      ui.notifications.warn(localize("Opportunity.NotOwner"));
      return;
    }
    this.#executing.add(messageId);
    try {
      await this.execute(message, data);
    } finally {
      this.#executing.delete(messageId);
    }
  }

  static async declineFromCard(messageId: string): Promise<void> {
    const message = game.messages.get(messageId);
    const data = message ? OpportunityCard.read(message) : null;
    if (!message || !data || data.state !== "pending") return;
    this.#pendingCards.delete(messageId);
    await SocketBridge.toActiveGM({type: "opportunityResolved", messageId, state: "declined"});
  }

  /** Rolls the free attack on this client (must own the attacker) and reports the result to the GM. */
  static async execute(message: any, data: OpportunityData): Promise<void> {
    const attackerDoc = canvas.scene?.tokens.get(data.attackerTokenId);
    const targetDoc = canvas.scene?.tokens.get(data.targetTokenId);
    const actor = attackerDoc?.actor;
    if (!attackerDoc || !targetDoc || !actor) return;
    const weapon = bestMeleeWeapon(WeaponsAdapter.list(actor));
    if (!weapon) return;
    const combatant = game.combat?.combatants.find((c: any) => c.tokenId === attackerDoc.id);
    const actionsBefore = Number(combatant?.system?.actionsUsed) || 0;
    const secret = attackerDoc.disposition === CONST.TOKEN_DISPOSITIONS.SECRET;
    const outcome = await Dsa5RollAdapter.rollOpportunityAttack(actor, attackerDoc.id, weapon.itemId, targetDoc.id, {secret});
    if (outcome.ok && combatant && game.user.isGM) {
      // DSA5 books an action for every attack roll, but a Passierschlag costs none (rule text).
      const actionsAfter = Number(combatant.system?.actionsUsed) || 0;
      if (actionsAfter > actionsBefore) await combatant.update({"system.actionsUsed": actionsBefore});
    }
    this.#pendingCards.delete(message.id);
    const detail = outcome.ok ? localize("Opportunity.Result", {sl: outcome.successLevel ?? 0}) : localize(`Result.Reason.${outcome.reason ?? "rollFailed"}`);
    await SocketBridge.toActiveGM({type: "opportunityResolved", messageId: message.id, state: "done", detail});
  }

  static async markPendingStale(): Promise<void> {
    for (const id of Array.from(this.#pendingCards)) {
      this.#pendingCards.delete(id);
      const message = game.messages.get(id);
      const data = message ? OpportunityCard.read(message) : null;
      if (message && data?.state === "pending") await OpportunityCard.update(message, {state: "stale"});
    }
  }
}
