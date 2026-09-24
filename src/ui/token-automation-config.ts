import {ArchetypeStore} from "../adapters/archetype-store";
import {TokenSettingsAdapter} from "../adapters/token-settings";
import {FLAGS, MODULE_ID, localize} from "../config";
import {dispositionFromValue} from "../rules/disposition";
import type {TokenAutomationOverrides} from "../types/settings";
import {ALL_FIELDS, FIELD_TABS, fieldView, parseFields} from "./settings-fields";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/**
 * Per-token / per-actor automation form: header (disposition, archetype, level), three tabs of
 * overrides, footer (grudges, protégé, save-to-actor). Effective values appear as tooltips.
 */
export class TokenAutomationConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dsa5-auto-combat-config-{id}",
    classes: ["dsa5-auto-combat-config"],
    tag: "form",
    window: {icon: "fa-solid fa-chess-knight", contentClasses: ["standard-form"]},
    position: {width: 560},
    form: {handler: TokenAutomationConfig.#onSubmit, closeOnSubmit: true, submitOnChange: false},
    actions: {clearGrudges: TokenAutomationConfig.#onClearGrudges}
  };

  static PARTS = {
    form: {template: `modules/${MODULE_ID}/templates/token-automation-config.hbs`},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  static TABS = {
    primary: {
      tabs: [
        {id: "combat", icon: "fa-solid fa-swords", label: "DSAAUTOCOMBAT.Config.Tabs.combat"},
        {id: "magic", icon: "fa-solid fa-wand-sparkles", label: "DSAAUTOCOMBAT.Config.Tabs.magic"},
        {id: "morale", icon: "fa-solid fa-heart-pulse", label: "DSAAUTOCOMBAT.Config.Tabs.morale"}
      ],
      initial: "combat"
    }
  };

  declare options: any;
  declare element: HTMLElement;
  tokenDoc: any;
  actor: any;
  mode: "token" | "actor";

  constructor(options: any) {
    super(options);
    this.tokenDoc = options.tokenDoc ?? null;
    this.actor = options.actor ?? this.tokenDoc?.actor ?? null;
    this.mode = options.mode ?? (this.tokenDoc ? "token" : "actor");
  }

  static open(tokenDoc: any): TokenAutomationConfig {
    return new TokenAutomationConfig({tokenDoc, id: `dsa5-auto-combat-config-${tokenDoc.id}`}).render({force: true});
  }

  static openForActor(actor: any): TokenAutomationConfig {
    return new TokenAutomationConfig({actor, mode: "actor", id: `dsa5-auto-combat-config-actor-${actor.id}`}).render({force: true});
  }

  get title(): string {
    return localize("Config.Title", {name: this.tokenDoc?.name ?? this.actor?.name ?? ""});
  }

  get stored(): TokenAutomationOverrides {
    return this.mode === "token" ? TokenSettingsAdapter.readTokenOverrides(this.tokenDoc) : TokenSettingsAdapter.readActorOverrides(this.actor);
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const stored = this.stored;
    const isToken = this.mode === "token";
    const disposition = dispositionFromValue(isToken ? this.tokenDoc.disposition : this.actor?.prototypeToken?.disposition);
    const resolved = isToken ? TokenSettingsAdapter.resolve(this.tokenDoc) : TokenSettingsAdapter.resolveForActor(this.actor);
    const archetypes = ArchetypeStore.list();
    const chosen = TokenSettingsAdapter.readArchetypeId(isToken ? this.tokenDoc : this.actor);
    const inherited = isToken && !chosen ? TokenSettingsAdapter.readArchetypeId(this.actor) : null;
    const defaultArchetype = ArchetypeStore.get(inherited ?? ArchetypeStore.dispositionArchetypes()[disposition]);
    const defaultLabel = localize(inherited ? "Config.ArchetypeFromActor" : "Config.ArchetypeDefault", {name: defaultArchetype ? ArchetypeStore.displayName(defaultArchetype) : "–"});
    const tabs = this._prepareTabs("primary");
    const grudgeIds: string[] = isToken ? (this.tokenDoc.getFlag(MODULE_ID, FLAGS.grudges) ?? []) : [];
    const grudges = grudgeIds.map(id => canvas.scene?.tokens.get(id)?.name ?? id);
    const protegeId = stored.protegeTokenId ?? null;
    const protegeOptions = isToken
      ? [{value: "", label: localize("Config.ProtegeNone"), selected: !protegeId}, ...canvas.scene.tokens.filter((t: any) => t.id !== this.tokenDoc.id).map((t: any) => ({value: t.id, label: t.name, selected: t.id === protegeId}))]
      : [];
    return {
      isToken,
      disposition: localize(`Disposition.${disposition}`),
      archetypeOptions: [
        {value: "", label: defaultLabel, selected: !chosen},
        ...archetypes.map(a => ({value: a.id, label: ArchetypeStore.displayName(a), selected: a.id === chosen}))
      ],
      archetypeDescription: ArchetypeStore.description(ArchetypeStore.get(chosen) ?? defaultArchetype ?? archetypes[0]!),
      level: fieldView({key: "level", kind: "enum", prefix: "Level", values: ["off", "preview", "auto"]}, stored, resolved),
      tabs,
      combat: FIELD_TABS.combat.map(def => fieldView(def, stored, resolved)),
      magic: FIELD_TABS.magic.map(def => fieldView(def, stored, resolved)),
      morale: FIELD_TABS.morale.map(def => fieldView(def, stored, resolved)),
      protegeOptions,
      grudges,
      hasGrudges: grudges.length > 0,
      buttons: [{type: "submit", icon: "fa-solid fa-save", label: "DSAAUTOCOMBAT.Config.Save"}]
    };
  }

  _onRender(context: any, options: any): void {
    super._onRender?.(context, options);
    const select = this.element.querySelector<HTMLSelectElement>('select[name="archetype"]');
    select?.addEventListener("change", () => {
      const archetype = ArchetypeStore.get(select.value) ?? null;
      const target = this.element.querySelector(".dac-archetype-description");
      if (target) target.textContent = archetype ? ArchetypeStore.description(archetype) : "";
    });
  }

  static async #onSubmit(this: TokenAutomationConfig, _event: Event, _form: HTMLFormElement, formData: any): Promise<void> {
    const data = formData.object as Record<string, unknown>;
    const overrides: TokenAutomationOverrides = {...parseFields([...ALL_FIELDS, {key: "level", kind: "enum"}], data)};
    if (this.mode === "token") {
      const protege = typeof data.protegeTokenId === "string" && data.protegeTokenId ? data.protegeTokenId : null;
      if (protege) overrides.protegeTokenId = protege;
      await TokenSettingsAdapter.writeTokenOverrides(this.tokenDoc, overrides);
      await TokenSettingsAdapter.writeArchetype(this.tokenDoc, typeof data.archetype === "string" && data.archetype ? data.archetype : null);
      if (data.saveToActor && this.actor) {
        const {protegeTokenId: _protege, ...actorOverrides} = overrides;
        await TokenSettingsAdapter.writeActorOverrides(this.actor, actorOverrides);
        await TokenSettingsAdapter.writeArchetype(this.actor, typeof data.archetype === "string" && data.archetype ? data.archetype : null);
      }
      this.tokenDoc.object?.layer?.hud?.render?.();
    } else if (this.actor) {
      await TokenSettingsAdapter.writeActorOverrides(this.actor, overrides);
      await TokenSettingsAdapter.writeArchetype(this.actor, typeof data.archetype === "string" && data.archetype ? data.archetype : null);
    }
  }

  static async #onClearGrudges(this: TokenAutomationConfig): Promise<void> {
    if (this.mode !== "token") return;
    await this.tokenDoc.unsetFlag(MODULE_ID, FLAGS.grudges);
    await this.render();
  }
}
