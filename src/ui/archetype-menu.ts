import {ArchetypeStore} from "../adapters/archetype-store";
import {MODULE_ID, localize} from "../config";
import {archetypeIdFromName, BUILT_IN_ARCHETYPES} from "../rules/archetypes";
import type {Archetype} from "../types/archetypes";
import type {Disposition} from "../types/settings";
import {ALL_FIELDS, FIELD_TABS, fieldView, parseFields} from "./settings-fields";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const DISPOSITIONS: Disposition[] = ["hostile", "friendly", "neutral", "secret"];

/** World menu: list of archetypes (built-in + custom), editor for the selected one, default archetype per disposition. */
export class ArchetypeMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dsa5-auto-combat-archetypes",
    classes: ["dsa5-auto-combat-config", "dac-archetype-menu"],
    tag: "form",
    window: {icon: "fa-solid fa-chess-knight", title: "DSAAUTOCOMBAT.ArchetypeMenu.Title", contentClasses: ["standard-form"]},
    position: {width: 820, height: "auto"},
    form: {handler: ArchetypeMenu.#onSubmit, closeOnSubmit: false, submitOnChange: false},
    actions: {
      select: ArchetypeMenu.#onSelect,
      create: ArchetypeMenu.#onCreate,
      duplicate: ArchetypeMenu.#onDuplicate,
      remove: ArchetypeMenu.#onRemove,
      restore: ArchetypeMenu.#onRestore
    }
  };

  static PARTS = {
    form: {template: `modules/${MODULE_ID}/templates/archetype-menu.hbs`},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  declare element: HTMLElement;
  selectedId = "standard";

  async _prepareContext(): Promise<Record<string, unknown>> {
    const list = ArchetypeStore.list();
    const selected = list.find(a => a.id === this.selectedId) ?? list[0]!;
    this.selectedId = selected.id;
    const dispositionArchetypes = ArchetypeStore.dispositionArchetypes();
    const hiddenBuiltIns = BUILT_IN_ARCHETYPES.filter(b => !list.some(a => a.id === b.id)).length;
    const fields = (defs: typeof ALL_FIELDS) => defs.filter(d => !d.tokenOnly).map(def => fieldView(def, selected.overrides, null));
    return {
      archetypes: list.map(a => ({id: a.id, name: ArchetypeStore.displayName(a), icon: a.icon, builtIn: a.builtIn, active: a.id === selected.id})),
      selected: {
        id: selected.id,
        name: ArchetypeStore.displayName(selected),
        rawName: selected.name,
        description: selected.builtIn && !selected.description ? ArchetypeStore.description(selected) : selected.description,
        icon: selected.icon,
        builtIn: selected.builtIn,
        canDelete: selected.id !== "standard"
      },
      level: fieldView({key: "level", kind: "enum", prefix: "Level", values: ["off", "preview", "auto"]}, selected.overrides, null),
      combat: fields(FIELD_TABS.combat),
      magic: fields(FIELD_TABS.magic),
      morale: fields(FIELD_TABS.morale),
      dispositions: DISPOSITIONS.map(d => ({
        key: d,
        label: localize(`Disposition.${d}`),
        options: list.map(a => ({value: a.id, label: ArchetypeStore.displayName(a), selected: dispositionArchetypes[d] === a.id}))
      })),
      hiddenBuiltIns,
      buttons: [{type: "submit", icon: "fa-solid fa-save", label: "DSAAUTOCOMBAT.Config.Save"}]
    };
  }

  /** Persists the editor state for the selected archetype and the disposition map. */
  async save(): Promise<void> {
    const form = this.element;
    const data = new foundry.applications.ux.FormDataExtended(form).object as Record<string, unknown>;
    const list = ArchetypeStore.list();
    const index = list.findIndex(a => a.id === this.selectedId);
    if (index >= 0) {
      const current = list[index]!;
      const overrides = parseFields([...ALL_FIELDS, {key: "level", kind: "enum"}], data, "field.");
      const updated: Archetype = {
        ...current,
        name: current.builtIn ? current.name : String(data.name ?? current.name).trim() || current.name,
        description: String(data.description ?? "").trim(),
        icon: String(data.icon ?? current.icon).trim() || current.icon,
        overrides
      };
      list[index] = updated;
      await ArchetypeStore.save(list);
    }
    const map = {} as Record<Disposition, string>;
    for (const d of DISPOSITIONS) map[d] = String(data[`disposition.${d}`] ?? "standard");
    await ArchetypeStore.saveDispositionArchetypes(map);
  }

  static async #onSubmit(this: ArchetypeMenu): Promise<void> {
    await this.save();
    ui.notifications.info(localize("ArchetypeMenu.Saved"));
    await this.render();
  }

  static async #onSelect(this: ArchetypeMenu, _event: Event, target: HTMLElement): Promise<void> {
    await this.save();
    this.selectedId = target.dataset.id ?? this.selectedId;
    await this.render();
  }

  static async #onCreate(this: ArchetypeMenu): Promise<void> {
    await this.save();
    const list = ArchetypeStore.list();
    const name = localize("ArchetypeMenu.NewName");
    const id = archetypeIdFromName(name, list);
    list.push({id, name, description: "", icon: "fa-solid fa-user", builtIn: false, overrides: {}});
    await ArchetypeStore.save(list);
    this.selectedId = id;
    await this.render();
  }

  static async #onDuplicate(this: ArchetypeMenu): Promise<void> {
    await this.save();
    const list = ArchetypeStore.list();
    const source = list.find(a => a.id === this.selectedId);
    if (!source) return;
    const name = `${ArchetypeStore.displayName(source)} (${localize("ArchetypeMenu.Copy")})`;
    const id = archetypeIdFromName(name, list);
    list.push({id, name, description: ArchetypeStore.description(source), icon: source.icon, builtIn: false, overrides: {...source.overrides}});
    await ArchetypeStore.save(list);
    this.selectedId = id;
    await this.render();
  }

  static async #onRemove(this: ArchetypeMenu): Promise<void> {
    if (this.selectedId === "standard") return;
    const archetype = ArchetypeStore.get(this.selectedId);
    if (!archetype) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {title: localize("ArchetypeMenu.Delete")},
      content: `<p>${localize("ArchetypeMenu.ConfirmDelete", {name: ArchetypeStore.displayName(archetype)})}</p>`
    });
    if (!confirmed) return;
    await ArchetypeStore.remove(this.selectedId);
    this.selectedId = "standard";
    await this.render();
  }

  static async #onRestore(this: ArchetypeMenu): Promise<void> {
    await ArchetypeStore.restoreBuiltIns();
    await this.render();
  }
}
