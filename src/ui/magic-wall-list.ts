import {MagicWallAdapter} from "../adapters/magic-walls";
import {localize} from "../config";
import {roundsLeft} from "../rules/magic-walls";

/** Scene-control button (walls layer) listing every spell wall of the scene with its remaining duration. */
export class MagicWallList {
  static register(): void {
    Hooks.on("getSceneControlButtons", (controls: any) => {
      if (!game.user?.isGM) return;
      const walls = controls?.walls;
      if (!walls?.tools) return;
      walls.tools.dsa5AutoCombatWalls = {
        name: "dsa5AutoCombatWalls",
        title: "DSAAUTOCOMBAT.MagicWall.ListTitle",
        icon: "fa-solid fa-wand-magic-sparkles",
        order: 100,
        button: true,
        visible: true,
        onChange: () => void this.open()
      };
    });
  }

  static async open(): Promise<void> {
    const entries = MagicWallAdapter.list(canvas.scene);
    const round = game.combat?.started ? Number(game.combat.round) || 0 : 0;
    const rows = entries.map(e => {
      const left = roundsLeft(e.state, round);
      const duration = left === null ? localize("MagicWall.Maintained") : localize("MagicWall.Rounds", {rounds: left});
      return `<tr><td>${e.state.spellName}</td><td>${e.state.casterName || "–"}</td><td>${duration}</td><td><button type="button" data-wall-id="${e.doc.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
    const content = entries.length === 0
      ? `<p>${localize("MagicWall.None")}</p>`
      : `<table class="dac-wall-table"><thead><tr><th>${localize("MagicWall.Spell")}</th><th>${localize("MagicWall.Caster")}</th><th>${localize("MagicWall.Left")}</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
    await foundry.applications.api.DialogV2.wait({
      window: {title: localize("MagicWall.ListTitle")},
      content,
      buttons: [{action: "close", label: localize("MagicWall.Close"), default: true}],
      rejectClose: false,
      render: (_event: any, dialog: any) => {
        const root: HTMLElement = dialog.element;
        for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-wall-id]")) {
          button.addEventListener("click", async event => {
            event.preventDefault();
            await MagicWallAdapter.remove(canvas.scene, [button.dataset.wallId!]);
            button.closest("tr")?.remove();
          });
        }
      }
    });
  }
}
