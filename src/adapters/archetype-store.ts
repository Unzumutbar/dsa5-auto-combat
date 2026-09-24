import {MODULE_ID, SETTINGS, localize} from "../config";
import {log} from "../log";
import {findArchetype, mergeArchetypes, migrateDispositionDefaults, sanitizeArchetype, sanitizeDispositionArchetypes} from "../rules/archetypes";
import {WorldSettingsRegistry} from "../settings/world-settings";
import type {Archetype} from "../types/archetypes";
import type {Disposition} from "../types/settings";

/** World-level archetype list (built-ins merged in) and the default archetype per disposition. */
export class ArchetypeStore {
  static list(): Archetype[] {
    return mergeArchetypes(WorldSettingsRegistry.get(SETTINGS.archetypes, []), WorldSettingsRegistry.get<string[]>(SETTINGS.hiddenArchetypes, []));
  }

  static get(id: string | null | undefined): Archetype | null {
    return findArchetype(this.list(), id);
  }

  static dispositionArchetypes(): Record<Disposition, string> {
    return sanitizeDispositionArchetypes(WorldSettingsRegistry.get(SETTINGS.dispositionArchetypes, {}), this.list());
  }

  /** Localized display name (built-ins come from the language files). */
  static displayName(archetype: Archetype): string {
    if (archetype.builtIn) {
      const key = `Archetype.${archetype.id}.name`;
      const text = localize(key);
      if (!text.endsWith(key)) return text;
    }
    return archetype.name || archetype.id;
  }

  static description(archetype: Archetype): string {
    if (archetype.builtIn) {
      const key = `Archetype.${archetype.id}.description`;
      const text = localize(key);
      if (!text.endsWith(key)) return text;
    }
    return archetype.description;
  }

  static async save(list: Archetype[]): Promise<void> {
    const clean = list.map(sanitizeArchetype).filter((a): a is Archetype => a !== null);
    await game.settings.set(MODULE_ID, SETTINGS.archetypes, clean);
  }

  static async saveDispositionArchetypes(map: Record<Disposition, string>): Promise<void> {
    await game.settings.set(MODULE_ID, SETTINGS.dispositionArchetypes, sanitizeDispositionArchetypes(map, this.list()));
  }

  static async remove(id: string): Promise<void> {
    const list = this.list();
    const target = findArchetype(list, id);
    if (!target || id === "standard") return;
    await this.save(list.filter(a => a.id !== id));
    if (target.builtIn) {
      const hidden = new Set(WorldSettingsRegistry.get<string[]>(SETTINGS.hiddenArchetypes, []));
      hidden.add(id);
      await game.settings.set(MODULE_ID, SETTINGS.hiddenArchetypes, Array.from(hidden));
    }
  }

  static async restoreBuiltIns(): Promise<void> {
    await game.settings.set(MODULE_ID, SETTINGS.hiddenArchetypes, []);
    const list = this.list();
    await this.save(list);
  }

  /** Converts the plan-1 per-disposition defaults into custom archetypes (runs once, GM only). */
  static async migrateLegacyDefaults(): Promise<boolean> {
    const legacy = WorldSettingsRegistry.get<Record<string, unknown>>(SETTINGS.dispositionDefaults, {});
    if (!legacy || Object.keys(legacy).length === 0) return false;
    const names: Record<Disposition, string> = {
      hostile: localize("Archetype.Migrated", {disposition: localize("Disposition.hostile")}),
      friendly: localize("Archetype.Migrated", {disposition: localize("Disposition.friendly")}),
      neutral: localize("Archetype.Migrated", {disposition: localize("Disposition.neutral")}),
      secret: localize("Archetype.Migrated", {disposition: localize("Disposition.secret")})
    };
    const result = migrateDispositionDefaults(legacy, this.list(), names);
    await this.save(result.archetypes);
    await this.saveDispositionArchetypes(result.dispositionArchetypes);
    await game.settings.set(MODULE_ID, SETTINGS.dispositionDefaults, {});
    log.info("Alte Gesinnungs-Standardwerte in Archetypen überführt", result.dispositionArchetypes);
    return true;
  }
}
