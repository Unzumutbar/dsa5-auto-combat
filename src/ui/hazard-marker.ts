import {HazardAdapter, type HazardFlag} from "../adapters/hazards";
import {localize} from "../config";

/**
 * "Mark as hazard" button in the header of region and measured-template configs (GM only) plus a small
 * dialog for severity and expected damage per round.
 */
export class HazardMarker {
  static register(): void {
    const add = (app: any, controls: any[]) => {
      if (!game.user.isGM || !app.document) return;
      controls.push({
        icon: "fa-solid fa-biohazard",
        label: localize("Hazard.Mark"),
        action: "dsa5AutoCombatHazard",
        onClick: () => void this.open(app.document)
      });
    };
    Hooks.on("getHeaderControlsRegionConfig", add);
    Hooks.on("getHeaderControlsMeasuredTemplateConfig", add);
  }

  static async open(doc: any): Promise<void> {
    const current = HazardAdapter.readFlag(doc) ?? {severity: "none" as const, damage: 0};
    const option = (value: string) => `<option value="${value}" ${current.severity === value ? "selected" : ""}>${localize(`Hazard.Severity.${value}`)}</option>`;
    const content = `
      <div class="form-group"><label>${localize("Hazard.SeverityLabel")}</label>
        <div class="form-fields"><select name="severity">${["none", "avoid", "forbidden"].map(option).join("")}</select></div>
        <p class="hint">${localize("Hazard.SeverityHint")}</p></div>
      <div class="form-group"><label>${localize("Hazard.DamageLabel")}</label>
        <div class="form-fields"><input type="number" name="damage" min="0" step="1" value="${current.damage ?? 0}"></div></div>`;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: {title: localize("Hazard.Title", {name: doc.name ?? HazardAdapter.templateName(doc)})},
      content,
      ok: {label: localize("Hazard.Save"), callback: (_event: any, button: any) => {
        const form = button.form as HTMLFormElement;
        const severity = (form.elements.namedItem("severity") as HTMLSelectElement).value as HazardFlag["severity"];
        const damage = Number((form.elements.namedItem("damage") as HTMLInputElement).value) || 0;
        return {severity, damage};
      }},
      rejectClose: false
    });
    if (!result) return;
    await HazardAdapter.mark(doc, result as HazardFlag);
    ui.notifications.info(localize("Hazard.Marked", {name: doc.name ?? HazardAdapter.templateName(doc), severity: localize(`Hazard.Severity.${(result as HazardFlag).severity}`)}));
  }
}
