import {FLAGS, MODULE_ID} from "../config";
import {log} from "../log";
import {lookupSpell} from "../rules/spells/knowledge-base";
import type {Hazard, HazardSeverity} from "../types/hazards";
import type {GridPos} from "../types/snapshot";

export interface HazardFlag {
  severity: HazardSeverity | "none";
  damage?: number;
}

/**
 * Collects hazardous zones of the current scene: DSA5 spell regions (flags.dsa5.origin → spell item →
 * item flag or knowledge base) and regions/templates the GM marked by hand (module flag `hazard`).
 */
export class HazardAdapter {
  static collect(scene: any): Hazard[] {
    const result: Hazard[] = [];
    if (!scene || !canvas?.ready) return result;
    for (const region of scene.regions ?? []) {
      const resolved = this.resolveRegion(region);
      if (!resolved) continue;
      const cells = this.regionCells(region);
      if (cells.length === 0) continue;
      result.push({id: region.id, kind: "region", name: String(region.name ?? ""), cells, ...resolved});
    }
    for (const template of scene.templates ?? []) {
      const manual = this.readFlag(template);
      if (!manual || manual.severity === "none") continue;
      const cells = this.templateCells(template);
      if (cells.length === 0) continue;
      result.push({id: template.id, kind: "template", name: this.templateName(template), cells, severity: manual.severity, damagePerRound: manual.damage ?? 0, source: "manual"});
    }
    return result;
  }

  static readFlag(doc: any): HazardFlag | null {
    const raw = doc?.getFlag?.(MODULE_ID, FLAGS.hazard);
    if (!raw || typeof raw !== "object") return null;
    const severity = raw.severity;
    if (severity !== "avoid" && severity !== "forbidden" && severity !== "none") return null;
    const damage = Number(raw.damage);
    return {severity, damage: Number.isFinite(damage) && damage > 0 ? damage : 0};
  }

  static async mark(doc: any, flag: HazardFlag | null): Promise<void> {
    if (!flag || flag.severity === "none") {
      if (doc.getFlag(MODULE_ID, FLAGS.hazard) !== undefined) await doc.unsetFlag(MODULE_ID, FLAGS.hazard);
      return;
    }
    await doc.setFlag(MODULE_ID, FLAGS.hazard, {severity: flag.severity, damage: flag.damage ?? 0});
  }

  /** Severity of a spell zone: item flag first, then the knowledge base. */
  static spellHazard(item: any): HazardSeverity | null {
    const flag = item?.getFlag?.(MODULE_ID, FLAGS.spellHazard);
    if (flag === "avoid" || flag === "forbidden") return flag;
    if (flag === "none") return null;
    return lookupSpell(String(item?.name ?? ""))?.hazard ?? null;
  }

  static resolveRegion(region: any): Pick<Hazard, "severity" | "damagePerRound" | "source"> | null {
    const manual = this.readFlag(region);
    if (manual) return manual.severity === "none" ? null : {severity: manual.severity, damagePerRound: manual.damage ?? 0, source: "manual"};
    const origin = region.flags?.dsa5?.origin;
    if (typeof origin !== "string") return null;
    let item: any = null;
    try {
      item = fromUuidSync(origin);
    } catch {
      item = null;
    }
    const severity = this.spellHazard(item);
    return severity ? {severity, damagePerRound: 0, source: "dsa5"} : null;
  }

  /** Grid spaces whose center lies inside the region (like Foundry's own highlight). */
  static regionCells(region: any): GridPos[] {
    const cells: GridPos[] = [];
    try {
      const tree = region.polygonTree;
      const bounds = tree?.bounds;
      if (!bounds) return cells;
      const [i0, j0, i1, j1] = canvas.grid.getOffsetRange(bounds);
      for (let i = i0; i < i1; i++) {
        for (let j = j0; j < j1; j++) {
          const center = canvas.grid.getCenterPoint({i, j});
          if (tree.testPoint(center)) cells.push({i, j});
        }
      }
    } catch (error) {
      log.warn("Regionszellen konnten nicht bestimmt werden", error);
    }
    return cells;
  }

  static templateCells(template: any): GridPos[] {
    const cells: GridPos[] = [];
    const object = template.object;
    if (!object) return cells;
    try {
      const positions: any[] = typeof object._getGridHighlightPositions === "function" ? object._getGridHighlightPositions() : [];
      for (const p of positions) {
        const offset = canvas.grid.getOffset({x: p.x + 1, y: p.y + 1});
        cells.push({i: offset.i, j: offset.j});
      }
    } catch (error) {
      log.warn("Vorlagenzellen konnten nicht bestimmt werden", error);
    }
    return cells;
  }

  static templateName(template: any): string {
    return String(template.flags?.[MODULE_ID]?.hazardName ?? template.flags?.dsa5?.name ?? game.i18n.localize("DSAAUTOCOMBAT.Hazard.Template"));
  }
}
