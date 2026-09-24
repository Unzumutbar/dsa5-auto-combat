import {localize} from "../config";
import {log} from "../log";
import {clampSegment} from "../rules/magic-walls";
import type {Point} from "../types/snapshot";

export interface WallDrawOptions {
  /** Caster position for the range check (null = no check). */
  origin: Point | null;
  /** Spell range in scene units (null = unlimited). */
  rangeUnits: number | null;
  /** Maximum wall length in scene units (null = unlimited). */
  maxLengthUnits: number | null;
  label: string;
}

/**
 * Two-click drawing tool for a wall segment on the canvas: first click sets the start, the second the
 * end; Escape or a right click cancels. Points snap to grid vertices and centers on gridded scenes.
 */
export class WallDrawer {
  static #active: {resolve: (segment: {a: Point; b: Point} | null) => void; cleanup: () => void} | null = null;

  static get busy(): boolean {
    return this.#active !== null;
  }

  static async draw(options: WallDrawOptions): Promise<{a: Point; b: Point} | null> {
    if (this.#active) this.cancel();
    if (!canvas?.ready) return null;
    const view: HTMLCanvasElement = canvas.app.view;
    const preview = new PIXI.Graphics();
    preview.eventMode = "none";
    canvas.interface.addChild(preview);
    let start: Point | null = null;
    let current: Point | null = null;
    const unitsPerPixel = canvas.grid.distance / canvas.grid.size;
    ui.notifications.info(localize("MagicWall.DrawHint", {spell: options.label}), {permanent: false});

    const snap = (p: Point): Point => {
      if (canvas.grid.isGridless) return p;
      try {
        const modes = CONST.GRID_SNAPPING_MODES;
        const snapped = canvas.grid.getSnappedPoint(p, {mode: modes.VERTEX | modes.CENTER | modes.SIDE_MIDPOINT, resolution: 1});
        return {x: snapped.x, y: snapped.y};
      } catch {
        return p;
      }
    };
    const toCanvas = (event: MouseEvent): Point => {
      const p = canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY});
      return snap({x: p.x, y: p.y});
    };
    const inRange = (p: Point) => !options.origin || options.rangeUnits === null || Math.hypot(p.x - options.origin.x, p.y - options.origin.y) * unitsPerPixel <= options.rangeUnits + 1e-6;
    const redraw = () => {
      preview.clear();
      const anchor = start ?? current;
      if (!anchor) return;
      const ok = inRange(anchor) && (!current || inRange(current));
      const color = ok ? 0x9b59ff : 0xd8342a;
      preview.lineStyle({width: 3, color, alpha: 0.9});
      preview.drawCircle(anchor.x, anchor.y, 6);
      if (start && current) {
        const end = clampSegment(start, current, options.maxLengthUnits, unitsPerPixel);
        preview.lineStyle({width: 6, color, alpha: 0.9, cap: "round"});
        preview.moveTo(start.x, start.y);
        preview.lineTo(end.x, end.y);
      }
    };

    return new Promise(resolve => {
      const finish = (segment: {a: Point; b: Point} | null) => {
        cleanup();
        this.#active = null;
        resolve(segment);
      };
      const onMove = (event: MouseEvent) => {
        current = toCanvas(event);
        redraw();
      };
      const onDown = (event: MouseEvent) => {
        if (event.button === 2) {
          event.preventDefault();
          finish(null);
          return;
        }
        if (event.button !== 0) return;
        const point = toCanvas(event);
        if (!start) {
          start = point;
          current = point;
          redraw();
          return;
        }
        const end = clampSegment(start, point, options.maxLengthUnits, unitsPerPixel);
        if (Math.hypot(end.x - start.x, end.y - start.y) < 4) return;
        finish({a: start, b: end});
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(null);
        }
      };
      const onContext = (event: Event) => event.preventDefault();
      const cleanup = () => {
        view.removeEventListener("pointermove", onMove);
        view.removeEventListener("pointerdown", onDown, true);
        view.removeEventListener("contextmenu", onContext, true);
        window.removeEventListener("keydown", onKey, true);
        try {
          preview.parent?.removeChild(preview);
          preview.destroy();
        } catch (error) {
          log.debug("Wandvorschau bereits entfernt", error);
        }
      };
      view.addEventListener("pointermove", onMove);
      view.addEventListener("pointerdown", onDown, true);
      view.addEventListener("contextmenu", onContext, true);
      window.addEventListener("keydown", onKey, true);
      this.#active = {resolve: finish, cleanup};
    });
  }

  static cancel(): void {
    this.#active?.resolve(null);
  }
}
