import {MagicWallAdapter} from "../adapters/magic-walls";
import {FLAGS, MODULE_ID, localize} from "../config";
import {log} from "../log";
import {parseDurationRounds, type MagicWallState} from "../rules/magic-walls";
import {parseSpellRange} from "../rules/range-text";
import {WallDrawer} from "./wall-drawer";

/** Adds "Zauberwand ziehen" to successful DSA5 spell cards of wall spells (GM only). */
export class SpellCardWall {
  static register(): void {
    Hooks.on("renderChatMessageHTML", (message: any, html: any) => this.#onRender(message, html instanceof HTMLElement ? html : html?.[0]));
  }

  static #spellOf(message: any): {item: any; source: any} | null {
    const data = message?.flags?.data;
    const source = data?.preData?.source;
    if (!source || (source.type !== "spell" && source.type !== "liturgy")) return null;
    if (!((data.postData?.successLevel ?? 0) > 0)) return null;
    const speaker = data.preData?.extra?.speaker;
    const actor = speaker?.token ? canvas.scene?.tokens.get(speaker.token)?.actor : null;
    const item = (actor ?? game.actors.get(speaker?.actor))?.items.get(source._id) ?? null;
    return {item: item ?? {name: source.name, getFlag: () => undefined}, source};
  }

  static #onRender(message: any, root: HTMLElement | undefined): void {
    if (!root || !game.user?.isGM) return;
    const spell = this.#spellOf(message);
    if (!spell || !MagicWallAdapter.spellWall(spell.item)) return;
    const card = root.querySelector(".chat-card") ?? root.querySelector(".message-content");
    if (!card || card.querySelector(".dac-wall-button")) return;
    const placed = message.flags?.[MODULE_ID]?.[FLAGS.magicWall];
    const wrapper = document.createElement("div");
    wrapper.className = "card-content dac-wall-button";
    if (placed && canvas.scene?.walls.get(placed)) {
      wrapper.innerHTML = `<i class="fa-solid fa-check"></i> ${localize("MagicWall.Placed")}`;
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${localize("MagicWall.Draw")}`;
      button.addEventListener("click", event => {
        event.preventDefault();
        void this.place(message).catch((error: unknown) => log.error("Zauberwand fehlgeschlagen", error));
      });
      wrapper.appendChild(button);
    }
    card.appendChild(wrapper);
  }

  static async place(message: any): Promise<any> {
    const spell = this.#spellOf(message);
    if (!spell) return null;
    const kind = MagicWallAdapter.spellWall(spell.item);
    if (!kind) return null;
    if (WallDrawer.busy) {
      ui.notifications.warn(localize("MagicWall.Busy"));
      return null;
    }
    const data = message.flags.data;
    const speaker = data.preData?.extra?.speaker ?? {};
    const casterToken = speaker.token ? canvas.scene?.tokens.get(speaker.token) : null;
    const qs = Number(data.postData?.qualityStep) || 1;
    const range = parseSpellRange(String(spell.source.system?.range?.value ?? ""), 8);
    const rangeUnits = range.kind === "units" ? range.units : range.kind === "touch" ? canvas.grid.distance : null;
    const origin = casterToken?.object ? {x: casterToken.object.center.x, y: casterToken.object.center.y} : null;
    const segment = await WallDrawer.draw({origin, rangeUnits, maxLengthUnits: null, label: spell.source.name});
    if (!segment) return null;
    const state: MagicWallState = {
      spellId: String(spell.source._id ?? ""),
      spellName: String(spell.source.name),
      casterTokenId: casterToken?.id ?? null,
      casterName: casterToken?.name ?? String(speaker.alias ?? ""),
      startedRound: game.combat?.started ? Number(game.combat.round) || 0 : 0,
      durationRounds: parseDurationRounds(String(spell.source.system?.duration?.value ?? ""), qs, Number(CONFIG.time?.roundTime) || 5),
      blocksSight: kind === "opaque",
      messageId: message.id
    };
    const wall = await MagicWallAdapter.create(canvas.scene, segment.a, segment.b, state);
    await message.setFlag(MODULE_ID, FLAGS.magicWall, wall.id);
    const rounds = state.durationRounds === null ? localize("MagicWall.Maintained") : localize("MagicWall.Rounds", {rounds: state.durationRounds});
    ui.notifications.info(localize("MagicWall.Created", {spell: state.spellName, duration: rounds}));
    return wall;
  }
}
