import {MagicWallAdapter} from "../adapters/magic-walls";
import {localize} from "../config";
import {log} from "../log";
import {splitPathByBudget} from "../rules/pathfinding/path-split";
import type {Action, TurnPlan} from "../types/plan";
import type {CombatSnapshot, Point} from "../types/snapshot";

const COLORS = {
  free: 0x3fa34d,
  run: 0xe0b400,
  target: 0xd8342a,
  provoke: 0xff8c1a,
  line: 0x4d8ad6,
  end: 0xffffff,
  hazard: 0xd8342a,
  wall: 0x9b59ff
};

/**
 * Draws the planned turn on the canvas (GM client only): movement path split into free / running part,
 * final position, target ring, enemies that would get a Passierschlag and the firing line for ranged
 * attacks and spells. One overlay at a time, bound to the preview message that produced it.
 */
export class PlanOverlay {
  static #container: any = null;
  static #messageId: string | null = null;
  static #hiddenByUser = new Set<string>();

  static register(): void {
    Hooks.on("canvasTearDown", () => this.#dispose());
    Hooks.on("canvasReady", () => this.#dispose());
  }

  static get activeMessageId(): string | null {
    return this.#messageId;
  }

  static isShown(messageId: string): boolean {
    return this.#messageId === messageId && Boolean(this.#container);
  }

  static show(messageId: string, plan: TurnPlan, snapshot: CombatSnapshot): void {
    if (!game.user.isGM || !canvas?.ready || snapshot.sceneId !== canvas.scene?.id) return;
    if (this.#hiddenByUser.has(messageId)) return;
    this.#dispose();
    try {
      this.#container = this.#draw(plan, snapshot);
      canvas.interface.addChild(this.#container);
      this.#messageId = messageId;
    } catch (error) {
      log.warn("Wegvorschau konnte nicht gezeichnet werden", error);
      this.#dispose();
    }
  }

  static hide(messageId?: string): void {
    if (messageId && this.#messageId !== messageId) return;
    this.#dispose();
  }

  /** User toggle from the chat card; remembers "hidden" per message so re-renders do not bring it back. */
  static toggle(messageId: string, plan: TurnPlan, snapshot: CombatSnapshot): boolean {
    if (this.isShown(messageId)) {
      this.#hiddenByUser.add(messageId);
      this.#dispose();
      return false;
    }
    this.#hiddenByUser.delete(messageId);
    this.show(messageId, plan, snapshot);
    return this.isShown(messageId);
  }

  static highlight(messageId: string, on: boolean): void {
    if (!this.isShown(messageId) || !this.#container) return;
    this.#container.alpha = on ? 1 : 0.75;
  }

  static #dispose(): void {
    if (this.#container) {
      try {
        this.#container.parent?.removeChild(this.#container);
        this.#container.destroy({children: true});
      } catch {
        // already gone
      }
    }
    this.#container = null;
    this.#messageId = null;
  }

  static #text(content: string, x: number, y: number, color: number): any {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = Math.max(18, Math.round(canvas.grid.size * 0.28));
    style.fill = color;
    style.stroke = 0x000000;
    style.strokeThickness = 4;
    const TextClass = foundry.canvas?.containers?.PreciseText ?? PIXI.Text;
    const text = new TextClass(content, style);
    text.anchor.set(0.5, 1);
    text.position.set(x, y);
    return text;
  }

  static #polyline(g: any, points: Point[], color: number, width: number, dashed = false): void {
    if (points.length < 2) return;
    g.lineStyle({width, color, alpha: 0.95, cap: "round", join: "round"});
    if (!dashed) {
      g.moveTo(points[0]!.x, points[0]!.y);
      for (const p of points.slice(1)) g.lineTo(p.x, p.y);
      return;
    }
    const dash = Math.max(8, canvas.grid.size / 6);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.floor(length / (dash * 2)));
      for (let s = 0; s < steps; s++) {
        const t0 = (s * 2 * dash) / length;
        const t1 = Math.min(1, ((s * 2 + 1) * dash) / length);
        g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0);
        g.lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
    }
  }

  static #ring(g: any, center: Point, radius: number, color: number, width = 4): void {
    g.lineStyle({width, color, alpha: 0.95});
    g.drawCircle(center.x, center.y, radius);
  }

  static #draw(plan: TurnPlan, snapshot: CombatSnapshot): any {
    const container = new PIXI.Container();
    container.eventMode = "none";
    const g = new PIXI.Graphics();
    container.addChild(g);
    const self = snapshot.combatants.find(c => c.tokenId === plan.tokenId);
    if (!self) return container;
    const grid = canvas.grid.size;
    const unitsPerPixel = snapshot.gridDistance / snapshot.gridSize;
    const byId = new Map(snapshot.combatants.map(c => [c.tokenId, c]));
    let position: Point = self.center;
    let freeLeft = self.round.freeActionUsed ? 0 : self.speed;
    for (const entry of MagicWallAdapter.list(canvas.scene)) {
      const [x1, y1, x2, y2] = entry.doc.c as number[];
      this.#polyline(g, [{x: x1!, y: y1!}, {x: x2!, y: y2!}], COLORS.wall, 5, true);
    }
    for (const hazard of snapshot.hazards) {
      for (const cell of hazard.cells) {
        const topLeft = canvas.grid.getTopLeftPoint(cell);
        g.lineStyle({width: 1, color: COLORS.hazard, alpha: 0.6});
        g.beginFill(COLORS.hazard, hazard.severity === "forbidden" ? 0.35 : 0.18);
        g.drawRect(topLeft.x + 2, topLeft.y + 2, grid - 4, grid - 4);
        g.endFill();
      }
    }

    for (const action of plan.actions) {
      if (action.type === "move") {
        const points = [position, ...action.waypoints];
        const split = splitPathByBudget(points, freeLeft, unitsPerPixel);
        this.#polyline(g, split.free, COLORS.free, 6);
        this.#polyline(g, split.run, COLORS.run, 6);
        for (const p of action.waypoints) {
          g.lineStyle({width: 0});
          g.beginFill(action.costsAction ? COLORS.run : COLORS.free, 0.9);
          g.drawCircle(p.x, p.y, Math.max(5, grid / 12));
          g.endFill();
        }
        const end = action.waypoints[action.waypoints.length - 1] ?? position;
        const half = (self.sizeCells * grid) / 2;
        g.lineStyle({width: 3, color: COLORS.end, alpha: 0.9});
        this.#polyline(g, [
          {x: end.x - half, y: end.y - half}, {x: end.x + half, y: end.y - half}, {x: end.x + half, y: end.y + half}, {x: end.x - half, y: end.y + half}, {x: end.x - half, y: end.y - half}
        ], COLORS.end, 3, true);
        const label = localize(action.costsAction ? "Overlay.moveRun" : "Overlay.moveFree", {distance: action.distance, units: snapshot.gridUnits || "Schritt"});
        container.addChild(this.#text(label, end.x, end.y - half - 6, action.costsAction ? COLORS.run : COLORS.free));
        for (const id of action.provokes) {
          const enemy = byId.get(id);
          if (!enemy) continue;
          this.#ring(g, enemy.center, (enemy.sizeCells * grid) / 2 + 6, COLORS.provoke, 5);
          container.addChild(this.#text(localize("Overlay.provokes"), enemy.center.x, enemy.center.y - (enemy.sizeCells * grid) / 2 - 8, COLORS.provoke));
        }
        position = end;
        freeLeft = Math.max(0, freeLeft - action.distance);
      } else if (action.type === "rangedAttack" || (action.type === "castSpell" && action.targetTokenId && action.targetTokenId !== plan.tokenId)) {
        const target = byId.get((action as Extract<Action, {type: "rangedAttack" | "castSpell"}>).targetTokenId!);
        if (!target) continue;
        this.#polyline(g, [position, target.center], COLORS.line, 3, true);
        const distance = Math.round(Math.hypot(target.center.x - position.x, target.center.y - position.y) * unitsPerPixel * 10) / 10;
        const mid = {x: (position.x + target.center.x) / 2, y: (position.y + target.center.y) / 2};
        container.addChild(this.#text(`${distance} ${snapshot.gridUnits || "Schritt"}`, mid.x, mid.y - 6, COLORS.line));
      }
    }

    if (plan.targetTokenId) {
      const target = byId.get(plan.targetTokenId);
      if (target) this.#ring(g, target.center, (target.sizeCells * grid) / 2 + 10, COLORS.target, 5);
    }
    container.alpha = 0.75;
    return container;
  }
}
