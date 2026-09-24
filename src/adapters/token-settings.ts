import {FLAGS, MODULE_ID} from "../config";
import {dispositionFromValue} from "../rules/disposition";
import {resolveTokenSettingsWithSources, sanitizeOverrides} from "../rules/settings-resolver";
import type {ResolvedTokenSettings, TokenAutomationOverrides} from "../types/settings";
import {ArchetypeStore} from "./archetype-store";

/**
 * Token flags are the primary store (unlinked tokens share their base actor);
 * actor flags act as a fallback so a GM can configure a prototype once.
 */
export class TokenSettingsAdapter {
  static readTokenOverrides(tokenDoc: any): TokenAutomationOverrides {
    return sanitizeOverrides(tokenDoc?.getFlag?.(MODULE_ID, FLAGS.automation));
  }

  static readActorOverrides(actor: any): TokenAutomationOverrides {
    return sanitizeOverrides(actor?.getFlag?.(MODULE_ID, FLAGS.automation));
  }

  static readCommandOverrides(tokenDoc: any): TokenAutomationOverrides {
    return sanitizeOverrides(tokenDoc?.getFlag?.(MODULE_ID, FLAGS.command)?.overrides);
  }

  /** Name of the active group command on this token, if any. */
  static readCommand(tokenDoc: any): string | null {
    const value = tokenDoc?.getFlag?.(MODULE_ID, FLAGS.command)?.command;
    return typeof value === "string" && value ? value : null;
  }

  static async writeCommand(tokenDoc: any, overrides: TokenAutomationOverrides | null, command: string | null): Promise<void> {
    if (!overrides || !command) {
      if (tokenDoc.getFlag(MODULE_ID, FLAGS.command) !== undefined) await tokenDoc.unsetFlag(MODULE_ID, FLAGS.command);
      return;
    }
    await tokenDoc.update({[`flags.${MODULE_ID}.${FLAGS.command}`]: {command, overrides: sanitizeOverrides(overrides)}}, {diff: false});
  }

  static readArchetypeId(doc: any): string | null {
    const value = doc?.getFlag?.(MODULE_ID, FLAGS.archetype);
    return typeof value === "string" && value ? value : null;
  }

  /** Token flag first, then the actor flag; null means "default archetype of the disposition". */
  static chosenArchetypeId(tokenDoc: any, actor: any): string | null {
    return this.readArchetypeId(tokenDoc) ?? this.readArchetypeId(actor);
  }

  static resolve(tokenDoc: any): ResolvedTokenSettings {
    const actor = tokenDoc?.actor;
    return resolveTokenSettingsWithSources({
      disposition: dispositionFromValue(tokenDoc?.disposition),
      archetypeId: this.chosenArchetypeId(tokenDoc, actor),
      archetypes: ArchetypeStore.list(),
      dispositionArchetypes: ArchetypeStore.dispositionArchetypes(),
      actorOverrides: this.readActorOverrides(actor),
      tokenOverrides: this.readTokenOverrides(tokenDoc),
      commandOverrides: this.readCommandOverrides(tokenDoc)
    });
  }

  /** Actor-level view (prototype token disposition, actor flags only). */
  static resolveForActor(actor: any): ResolvedTokenSettings {
    return resolveTokenSettingsWithSources({
      disposition: dispositionFromValue(actor?.prototypeToken?.disposition),
      archetypeId: this.readArchetypeId(actor),
      archetypes: ArchetypeStore.list(),
      dispositionArchetypes: ArchetypeStore.dispositionArchetypes(),
      actorOverrides: this.readActorOverrides(actor)
    });
  }

  static async writeTokenOverrides(tokenDoc: any, overrides: TokenAutomationOverrides): Promise<void> {
    const clean = sanitizeOverrides(overrides);
    if (Object.keys(clean).length === 0) await tokenDoc.unsetFlag(MODULE_ID, FLAGS.automation);
    else await tokenDoc.update({[`flags.${MODULE_ID}.${FLAGS.automation}`]: clean}, {diff: false});
  }

  static async writeActorOverrides(actor: any, overrides: TokenAutomationOverrides): Promise<void> {
    const clean = sanitizeOverrides(overrides);
    if (Object.keys(clean).length === 0) await actor.unsetFlag(MODULE_ID, FLAGS.automation);
    else await actor.update({[`flags.${MODULE_ID}.${FLAGS.automation}`]: clean}, {diff: false});
  }

  static async writeArchetype(doc: any, archetypeId: string | null): Promise<void> {
    if (!archetypeId) await doc.unsetFlag(MODULE_ID, FLAGS.archetype);
    else await doc.setFlag(MODULE_ID, FLAGS.archetype, archetypeId);
  }
}
