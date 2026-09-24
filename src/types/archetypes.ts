import type {TokenAutomationOverrides} from "./settings";

/**
 * A named behaviour preset. Tokens/actors reference an archetype by id; its overrides sit between the
 * disposition defaults and the per-actor/per-token overrides. Built-in archetypes ship with the module,
 * can be edited, deleted and restored; their display names come from the language files.
 */
export interface Archetype {
  id: string;
  /** Display name for custom archetypes; built-ins use the localization key Archetype.<id>.name. */
  name: string;
  description: string;
  icon: string;
  builtIn: boolean;
  overrides: TokenAutomationOverrides;
}
