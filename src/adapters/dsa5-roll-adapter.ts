import {log} from "../log";
import {applyBypassModifiers, type Modifier} from "./dsa5-modifiers";
import {withTemporaryTargets} from "./targets";

export interface OpposeRef {
  startMessageId: string;
  attackMessageId: string;
}

export interface RollOutcome {
  ok: boolean;
  reason?: "noWeapon" | "noAmmo" | "rollFailed";
  successLevel?: number;
  messageId?: string;
  modifiers?: string[];
}

/** Headless wrappers around the DSA5 roll pipeline (`setup*` -> `basicTest`). */
export class Dsa5RollAdapter {
  static messageMode(secret: boolean): string {
    return secret ? "gmroll" : "publicroll";
  }

  /** Defense-count malus DSA5 adds in its dialog callback (dialog-combat-dsa5.js) — must be replicated when bypassing. */
  static defenseCountModifier(actor: any, setupData: any, itemObj: any | null): Modifier | null {
    const count = Number(setupData.dialogOptions?.data?.defenseCount) || 0;
    if (count <= 0) return null;
    let perDefense = Number(setupData.dialogOptions?.data?.multipleDefenseValue);
    if (!Number.isFinite(perDefense)) {
      try {
        perDefense = Number(game.dsa5.apps.RuleChaos.multipleDefenseValue(actor, itemObj ?? {type: "dodge", system: {}}));
      } catch {
        perDefense = -3;
      }
    }
    if (!Number.isFinite(perDefense) || perDefense === 0) return null;
    return {name: game.i18n.format("defenseCount", {malus: perDefense}), value: count * perDefense, selected: true};
  }

  static async #rollDefense(actor: any, setupData: any, itemObj: any | null): Promise<RollOutcome> {
    if (!setupData) return {ok: false, reason: "rollFailed"};
    const extra: Modifier[] = [];
    const defenseCount = this.defenseCountModifier(actor, setupData, itemObj);
    if (defenseCount) extra.push(defenseCount);
    const modifiers = applyBypassModifiers(setupData, {extra});
    log.debug("Verteidigung", {modifiers});
    const rolled = await actor.basicTest(setupData);
    if (!rolled?.result) return {ok: false, reason: "rollFailed"};
    return {ok: true, successLevel: Number(rolled.result.successLevel), messageId: rolled.result.messageId, modifiers: modifiers.map(m => `${m.name} ${m.value}`)};
  }

  static async rollParry(actor: any, tokenId: string, weaponId: string, oppose: OpposeRef, options: {secret: boolean}): Promise<RollOutcome> {
    const rollOptions = {bypass: true, messageMode: this.messageMode(options.secret), oppose};
    if (weaponId === "weaponless") {
      const setupData = await actor.setupWeaponless("parry", rollOptions, tokenId);
      return this.#rollDefense(actor, setupData, null);
    }
    const item = actor.items.get(weaponId);
    if (!item) return {ok: false, reason: "noWeapon"};
    const setupData = await actor.setupWeapon(item, "parry", rollOptions, tokenId);
    return this.#rollDefense(actor, setupData, item.toObject());
  }

  static async rollDodge(actor: any, tokenId: string, oppose: OpposeRef, options: {secret: boolean}): Promise<RollOutcome> {
    const setupData = await actor.setupDodge({bypass: true, messageMode: this.messageMode(options.secret), oppose}, tokenId);
    return this.#rollDefense(actor, setupData, null);
  }

  static async declineDefense(startMessage: any, note: string): Promise<void> {
    await game.dsa5.apps.OpposeDSA.resolveUndefended(startMessage, note);
  }

  /**
   * Headless spell/liturgy cast. With bypass the dialog never fills the cost/casting time, and DSA5
   * only deducts AsP/KaP via a chat button, so both are done here (mirrors hooks/chat_context.js payMana).
   */
  static async castSpell(actor: any, tokenId: string, spell: any, targetTokenId: string | null, options: {secret: boolean}): Promise<RollOutcome & {finalCost?: number; qualityStep?: number}> {
    return withTemporaryTargets(targetTokenId ? [targetTokenId] : [], async () => {
      const setupData = await actor.setupSpell(spell, {bypass: true, messageMode: this.messageMode(options.secret)}, tokenId);
      if (!setupData) return {ok: false, reason: "rollFailed"};
      const s = spell.system;
      const cost = Number(s.AsPCost?.value) || 0;
      setupData.testData.testDifficulty ??= 0;
      setupData.testData.calculatedSpellModifiers = {
        ...(setupData.testData.calculatedSpellModifiers ?? {}),
        castingTime: Number(s.castingTime?.value) || 1,
        cost,
        reach: String(s.range?.value ?? ""),
        maintainCost: String(s.maintainCost?.value ?? "")
      };
      const modifiers = applyBypassModifiers(setupData);
      log.debug("Zauber", {spell: spell.name, targetTokenId, cost, modifiers});
      const rolled = await actor.basicTest(setupData);
      if (!rolled?.result) return {ok: false, reason: "rollFailed"};
      const finalCost = Number(setupData.testData.calculatedSpellModifiers?.finalcost ?? rolled.result.preData?.calculatedSpellModifiers?.finalcost);
      const pay = Number.isFinite(finalCost) ? finalCost : cost;
      const clerical = spell.type === "liturgy" || spell.type === "ceremony";
      let paid = false;
      try {
        paid = Boolean(await actor.applyMana(pay, clerical ? "KaP" : "AsP", {speaker: setupData.testData.extra?.speaker, skipPowerSource: true}));
      } catch (error) {
        log.warn("AsP/KaP konnten nicht abgezogen werden", error);
      }
      const message = rolled.result.messageId ? game.messages.get(rolled.result.messageId) : null;
      if (paid && message) {
        const marker = "<span class=\"costCheck\">";
        await message.update({"flags.data.manaApplied": true, content: String(message.content).replace(marker, marker + "<i class=\"fas fa-check\" style=\"float:right\"></i>")});
      }
      const castingTime = Number(s.castingTime?.value) || 1;
      const extraActions = Math.max(0, castingTime - (Number(s.castingTime?.progress) || 0) - 1);
      if (extraActions > 0) {
        try {
          await game.combat?.updateActionCount?.(setupData.testData.extra?.speaker ?? {token: tokenId, actor: actor.id, scene: canvas.scene?.id}, extraActions);
        } catch (error) {
          log.warn("Zauberdauer konnte nicht verbucht werden", error);
        }
      }
      return {ok: true, successLevel: Number(rolled.result.successLevel), qualityStep: Number(rolled.result.qualityStep) || 0, finalCost: pay, messageId: rolled.result.messageId, modifiers: modifiers.map(m => `${m.name} ${m.value}`)};
    });
  }

  /**
   * Passierschlag: free melee attack the defender cannot parry. Mirrors DSA5's opportunityAttack
   * workflow (tables/workflows/opportunityAttack.js) headlessly; `testData.attackOfOpportunity` makes the
   * opposed test resolve undefended and DSA5 disables crits/botches itself.
   */
  static async rollOpportunityAttack(actor: any, tokenId: string, weaponId: string, targetTokenId: string, options: {secret: boolean}): Promise<RollOutcome> {
    return withTemporaryTargets([targetTokenId], async () => {
      const rollOptions = {
        bypass: true,
        messageMode: this.messageMode(options.secret),
        forceOpportunityAttack: true,
        opportunityAttackManeuvers: {allowBasic: false, allowSpecial: false},
        moreModifiers: [{name: game.i18n.localize("MODS.opportunityAttack"), value: -4, selected: true}],
        subtitle: ` (${game.i18n.localize("attackOfOpportunity")})`
      };
      let setupData: any;
      if (weaponId === "weaponless") {
        setupData = await actor.setupWeaponless("attack", rollOptions, tokenId);
      } else {
        const item = actor.items.get(weaponId);
        if (!item) return {ok: false, reason: "noWeapon"};
        setupData = await actor.setupWeapon(item, "attack", rollOptions, tokenId);
      }
      if (!setupData) return {ok: false, reason: "rollFailed"};
      const modifiers = applyBypassModifiers(setupData);
      if (!modifiers.some(m => m.name === game.i18n.localize("MODS.opportunityAttack"))) {
        modifiers.push({name: game.i18n.localize("MODS.opportunityAttack"), value: -4, selected: true});
        setupData.testData.situationalModifiers = modifiers;
      }
      setupData.testData.attackOfOpportunity = -4;
      log.debug("Passierschlag", {tokenId, weaponId, targetTokenId, modifiers});
      const rolled = await actor.basicTest(setupData);
      if (!rolled?.result) return {ok: false, reason: "rollFailed"};
      return {ok: true, successLevel: Number(rolled.result.successLevel), messageId: rolled.result.messageId, modifiers: modifiers.map(m => `${m.name} ${m.value}`)};
    });
  }

  static async rollAttack(actor: any, tokenId: string, weaponId: string, targetTokenId: string, options: {secret: boolean; extra?: Modifier[]}): Promise<RollOutcome> {
    return withTemporaryTargets([targetTokenId], async () => {
      const rollOptions = {bypass: true, messageMode: this.messageMode(options.secret)};
      let setupData: any;
      if (weaponId === "weaponless") {
        setupData = await actor.setupWeaponless("attack", rollOptions, tokenId);
      } else {
        const item = actor.items.get(weaponId);
        if (!item) return {ok: false, reason: "noWeapon"};
        setupData = await actor.setupWeapon(item, "attack", rollOptions, tokenId);
      }
      if (!setupData) return {ok: false, reason: "noAmmo"};
      const modifiers = applyBypassModifiers(setupData, {extra: options.extra ?? []});
      log.debug("Angriff", {tokenId, weaponId, targetTokenId, modifiers, opposingWeaponSize: setupData.testData.opposingWeaponSize});
      const rolled = await actor.basicTest(setupData);
      if (!rolled?.result) return {ok: false, reason: "rollFailed"};
      return {
        ok: true,
        successLevel: Number(rolled.result.successLevel),
        messageId: rolled.result.messageId,
        modifiers: modifiers.map(m => `${m.name} ${m.value > 0 ? "+" : ""}${m.value}`)
      };
    });
  }
}
