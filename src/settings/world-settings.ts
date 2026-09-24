import {MODULE_ID, SETTINGS} from "../config";
import {DISPOSITION_ARCHETYPE_DEFAULTS, WORLD_DEFAULTS} from "../rules/defaults";
import type {Disposition, WorldSettings} from "../types/settings";
import {ArchetypeMenu} from "../ui/archetype-menu";

const P = "DSAAUTOCOMBAT.Settings";

export class WorldSettingsRegistry {
  static register(): void {
    game.settings.register(MODULE_ID, SETTINGS.enabled, {
      name: `${P}.enabled.Name`, hint: `${P}.enabled.Hint`, scope: "world", config: true, type: Boolean, default: WORLD_DEFAULTS.enabled
    });
    game.settings.register(MODULE_ID, SETTINGS.damageApplication, {
      name: `${P}.damageApplication.Name`, hint: `${P}.damageApplication.Hint`, scope: "world", config: true, type: String,
      choices: {
        npcOnly: `${P}.damageApplication.npcOnly`,
        everyone: `${P}.damageApplication.everyone`,
        never: `${P}.damageApplication.never`
      },
      default: WORLD_DEFAULTS.damageApplication
    });
    game.settings.register(MODULE_ID, SETTINGS.advanceTurn, {
      name: `${P}.advanceTurn.Name`, hint: `${P}.advanceTurn.Hint`, scope: "world", config: true, type: String,
      choices: {
        never: `${P}.advanceTurn.never`,
        autoOnly: `${P}.advanceTurn.autoOnly`,
        always: `${P}.advanceTurn.always`
      },
      default: WORLD_DEFAULTS.advanceTurn
    });
    game.settings.register(MODULE_ID, SETTINGS.autoInitiative, {
      name: `${P}.autoInitiative.Name`, hint: `${P}.autoInitiative.Hint`, scope: "world", config: true, type: Boolean,
      default: WORLD_DEFAULTS.autoInitiative
    });
    game.settings.register(MODULE_ID, SETTINGS.defaultSpellRangeSteps, {
      name: `${P}.defaultSpellRangeSteps.Name`, hint: `${P}.defaultSpellRangeSteps.Hint`, scope: "world", config: true, type: Number,
      range: {min: 1, max: 64, step: 1}, default: WORLD_DEFAULTS.defaultSpellRangeSteps
    });
    game.settings.register(MODULE_ID, SETTINGS.focusLimit, {
      name: `${P}.focusLimit.Name`, hint: `${P}.focusLimit.Hint`, scope: "world", config: true, type: Number,
      range: {min: 1, max: 10, step: 1}, default: WORLD_DEFAULTS.focusLimit
    });
    game.settings.register(MODULE_ID, SETTINGS.showPathPreview, {
      name: `${P}.showPathPreview.Name`, hint: `${P}.showPathPreview.Hint`, scope: "world", config: true, type: Boolean,
      default: WORLD_DEFAULTS.showPathPreview
    });
    game.settings.register(MODULE_ID, SETTINGS.showOdds, {
      name: `${P}.showOdds.Name`, hint: `${P}.showOdds.Hint`, scope: "world", config: true, type: Boolean,
      default: WORLD_DEFAULTS.showOdds
    });
    game.settings.register(MODULE_ID, SETTINGS.skipSurrendered, {
      name: `${P}.skipSurrendered.Name`, hint: `${P}.skipSurrendered.Hint`, scope: "world", config: true, type: Boolean,
      default: WORLD_DEFAULTS.skipSurrendered
    });
    game.settings.register(MODULE_ID, SETTINGS.surrenderText, {
      name: `${P}.surrenderText.Name`, hint: `${P}.surrenderText.Hint`, scope: "world", config: true, type: String,
      default: WORLD_DEFAULTS.surrenderText
    });
    game.settings.register(MODULE_ID, SETTINGS.deadTokensBlock, {
      name: `${P}.deadTokensBlock.Name`, hint: `${P}.deadTokensBlock.Hint`, scope: "world", config: true, type: Boolean,
      default: WORLD_DEFAULTS.deadTokensBlock
    });
    // Legacy (plan 1): per-disposition overrides; migrated into archetypes on ready, kept registered so the value can be read.
    game.settings.register(MODULE_ID, SETTINGS.dispositionDefaults, {scope: "world", config: false, type: Object, default: {}});
    game.settings.register(MODULE_ID, SETTINGS.archetypes, {scope: "world", config: false, type: Array, default: []});
    game.settings.register(MODULE_ID, SETTINGS.hiddenArchetypes, {scope: "world", config: false, type: Array, default: []});
    game.settings.register(MODULE_ID, SETTINGS.dispositionArchetypes, {scope: "world", config: false, type: Object, default: {...DISPOSITION_ARCHETYPE_DEFAULTS}});
    game.settings.registerMenu(MODULE_ID, "archetypeMenu", {
      name: `${P}.archetypeMenu.Name`,
      label: `${P}.archetypeMenu.Label`,
      hint: `${P}.archetypeMenu.Hint`,
      icon: "fa-solid fa-chess-knight",
      type: ArchetypeMenu,
      restricted: true
    });
    game.settings.register(MODULE_ID, SETTINGS.debug, {
      name: `${P}.debug.Name`, hint: `${P}.debug.Hint`, scope: "world", config: true, type: Boolean, default: WORLD_DEFAULTS.debug
    });
  }

  static get<T>(key: string, fallback: T): T {
    try {
      const value = game.settings.get(MODULE_ID, key);
      return (value === undefined || value === null ? fallback : value) as T;
    } catch {
      return fallback;
    }
  }

  static read(): WorldSettings {
    const dispositionArchetypes = {...DISPOSITION_ARCHETYPE_DEFAULTS, ...this.get<Partial<Record<Disposition, string>>>(SETTINGS.dispositionArchetypes, {})};
    return {
      enabled: this.get(SETTINGS.enabled, WORLD_DEFAULTS.enabled),
      damageApplication: this.get(SETTINGS.damageApplication, WORLD_DEFAULTS.damageApplication),
      advanceTurn: this.get(SETTINGS.advanceTurn, WORLD_DEFAULTS.advanceTurn),
      autoInitiative: this.get(SETTINGS.autoInitiative, WORLD_DEFAULTS.autoInitiative),
      defaultSpellRangeSteps: this.get(SETTINGS.defaultSpellRangeSteps, WORLD_DEFAULTS.defaultSpellRangeSteps),
      deadTokensBlock: this.get(SETTINGS.deadTokensBlock, WORLD_DEFAULTS.deadTokensBlock),
      focusLimit: this.get(SETTINGS.focusLimit, WORLD_DEFAULTS.focusLimit),
      showPathPreview: this.get(SETTINGS.showPathPreview, WORLD_DEFAULTS.showPathPreview),
      showOdds: this.get(SETTINGS.showOdds, WORLD_DEFAULTS.showOdds),
      dispositionArchetypes,
      skipSurrendered: this.get(SETTINGS.skipSurrendered, WORLD_DEFAULTS.skipSurrendered),
      surrenderText: this.get(SETTINGS.surrenderText, WORLD_DEFAULTS.surrenderText),
      debug: this.get(SETTINGS.debug, WORLD_DEFAULTS.debug)
    };
  }
}
