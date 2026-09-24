import {FLAGS, MODULE_ID} from "../config";
import {log} from "../log";

/**
 * Builds (or refreshes) the "Auto-Combat Testarena": two player heroes, a bodyguard, five hostile
 * NPC of different archetypes, a neutral bystander, a hazard region and a ready combat encounter,
 * plus a clean template copy of the scene. Idempotent: existing users, actors, scenes and tokens are
 * reused and only refreshed (images, flags, weapon setup).
 *
 * Source actors and the base scene are looked up by name in the world; missing sources are skipped
 * with a warning, a missing base scene is replaced by a blank arena.
 */
export interface ArenaOptions {
  sceneName: string;
  templateName: string;
  /** Scene whose map and walls are copied; null/missing = blank 30 × 12 arena. */
  baseSceneName: string | null;
  /** World actors used as templates for the roster. */
  sources: {
    warrior: string;
    witch: string;
    thug: string;
    thug2: string;
    leader: string;
    archer: string;
  };
  /** Compendium spells added to the hostile witch (pack id + item name). */
  witchSpells: [pack: string, name: string][];
  playerNames: [string, string];
  journal: boolean;
}

export const DEFAULT_ARENA_OPTIONS: ArenaOptions = {
  sceneName: "Auto-Combat Testarena",
  templateName: "Auto-Combat Testarena (Vorlage)",
  baseSceneName: "Thalas'Var - Lagerhalle",
  sources: {
    warrior: "Wulfgrimm",
    witch: "Nonica Brigonetti",
    thug: "Lucan Saguaro",
    thug2: "Lucilia Saguaro",
    leader: "Kazrak „Doppelklinge“ Varik",
    archer: "Der zweiäugige Wilmero"
  },
  witchSpells: [["dsa5-magic-2.magic2equipment", "Pandaemonium"], ["dsa5-core.coreenequipment", "Ignifaxius"]],
  playerNames: ["Spieler 1", "Spieler 2"],
  journal: true
};

const ICON = (id: string) => `modules/${MODULE_ID}/icons/tokens/${id}.svg`;

/** Flags of modules that override token art (they would hide the arena's own images). */
const IMAGE_FLAG_MODULES = ["token-variants"];

function stripImageFlags(data: any): void {
  if (!data?.flags) return;
  for (const id of IMAGE_FLAG_MODULES) delete data.flags[id];
}

async function unsetImageFlags(doc: any): Promise<void> {
  const update: Record<string, null> = {};
  for (const id of IMAGE_FLAG_MODULES) if (doc.flags?.[id]) update[`flags.-=${id}`] = null;
  if (Object.keys(update).length) await doc.update(update);
}
const GRID = 96;

interface RosterEntry {
  /** World actor name (created as a copy of `source` when missing). */
  name: string;
  source: keyof ArenaOptions["sources"];
  /** Token name shown on the scene. */
  tokenName: string;
  icon: string;
  disposition: number;
  /** Position in grid cells relative to the arena origin (col, row). */
  cell: [number, number];
  player?: 0 | 1;
  archetype?: string;
  protegeOf?: string;
  /** Names of weapons to wield; everything else is stowed. */
  wield?: (name: string) => boolean;
  /** Keep the world actor as is (no copy). */
  reuse?: boolean;
}

const ROSTER: RosterEntry[] = [
  {name: "Wulfgrimm", source: "warrior", tokenName: "Wulfgrimm", icon: "wulfgrimm", disposition: 1, cell: [2, 3], player: 0, reuse: true},
  {name: "Nonica Brigonetti (Test)", source: "witch", tokenName: "Nonica", icon: "nonica", disposition: 1, cell: [1, 4], player: 1},
  {name: "Torben Eisenfaust", source: "thug", tokenName: "Torben Eisenfaust", icon: "torben", disposition: 1, cell: [1, 3], archetype: "bodyguard", protegeOf: "Nonica", wield: n => n.startsWith("Stoßspeer")},
  {name: "Kazrak „Doppelklinge“ Varik", source: "leader", tokenName: "Kazrak „Doppelklinge“ Varik", icon: "kazrak", disposition: -1, cell: [15, 3], archetype: "leader", reuse: true, wield: n => !/Armbrust|Bogen/.test(n)},
  {name: "Schläger Bosk", source: "thug2", tokenName: "Schläger Bosk", icon: "bosk", disposition: -1, cell: [14, 2], archetype: "standard", wield: n => n.startsWith("Stoßspeer")},
  {name: "Ganove Rasco", source: "thug", tokenName: "Ganove Rasco", icon: "rasco", disposition: -1, cell: [15, 5], archetype: "coward", wield: n => n.startsWith("Stoßspeer")},
  {name: "Der zweiäugige Wilmero", source: "archer", tokenName: "Der zweiäugige Wilmero", icon: "wilmero", disposition: -1, cell: [17, 1], archetype: "archer", reuse: true, wield: n => n === "Kurzbogen"},
  {name: "Hexe Zarba", source: "witch", tokenName: "Hexe Zarba", icon: "zarba", disposition: -1, cell: [17, 4], archetype: "battlemage"},
  {name: "Schaulustige Hesinde", source: "thug2", tokenName: "Schaulustige Hesinde", icon: "hesinde", disposition: 0, cell: [2, 7]}
];

/** Arena origin (top-left cell) on the warehouse map; the blank arena uses the same layout. */
const ORIGIN = {x: 1152, y: 1344};
const HAZARD = {name: "Brennendes Öl", cell: [8, 2] as [number, number], size: 3};

export class TestArena {
  static async setup(overrides: Partial<ArenaOptions> = {}): Promise<{sceneId: string; templateId: string; combatId: string | null}> {
    if (!game.user.isGM) throw new Error("Nur der Spielleiter kann die Testarena anlegen.");
    const options: ArenaOptions = {...DEFAULT_ARENA_OPTIONS, ...overrides, sources: {...DEFAULT_ARENA_OPTIONS.sources, ...(overrides.sources ?? {})}};
    const users = await this.#users(options.playerNames);
    const actors = await this.#actors(options, users);
    const scene = await this.#scene(options.sceneName, options.baseSceneName, "Auto-Combat");
    await this.#tokens(scene, actors);
    await this.#hazard(scene);
    const combat = await this.#combat(scene);
    const template = await this.#template(scene, options.templateName);
    if (options.journal) await this.#journal();
    await scene.activate();
    ui.notifications.info(`Testarena „${scene.name}“ bereit (${scene.tokens.size} Tokens).`);
    return {sceneId: scene.id, templateId: template.id, combatId: combat?.id ?? null};
  }

  static async #users(names: [string, string]): Promise<any[]> {
    const result: any[] = [];
    for (const name of names) {
      result.push(game.users.getName(name) ?? (await User.create({name, role: CONST.USER_ROLES.PLAYER})));
    }
    return result;
  }

  static async #actors(options: ArenaOptions, users: any[]): Promise<Map<string, any>> {
    const actors = new Map<string, any>();
    for (const entry of ROSTER) {
      let actor = game.actors.getName(entry.name);
      if (!actor) {
        const source = game.actors.getName(options.sources[entry.source]);
        if (!source) {
          log.warn(`Testarena: Quell-Actor „${options.sources[entry.source]}“ fehlt – ${entry.name} wird übersprungen.`);
          continue;
        }
        if (entry.reuse) actor = source;
        else {
          const data = foundry.utils.mergeObject(source.toObject(), {name: entry.name, folder: null, ownership: {default: 0}}, {inplace: false});
          stripImageFlags(data);
          stripImageFlags(data.prototypeToken);
          actor = await Actor.create(data);
        }
      }
      const update: Record<string, unknown> = {
        "prototypeToken.disposition": entry.disposition,
        "prototypeToken.actorLink": true,
        "prototypeToken.name": entry.tokenName,
        "system.status.wounds.value": actor.system.status?.wounds?.max ?? 0
      };
      if (!entry.reuse) {
        update["prototypeToken.texture.src"] = ICON(entry.icon);
        await unsetImageFlags(actor);
      }
      if (entry.player !== undefined && users[entry.player]) update.ownership = {default: 0, [users[entry.player].id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER};
      await actor.update(update);
      if (entry.wield) {
        const weapons = actor.items.filter((i: any) => i.type === "meleeweapon" || i.type === "rangeweapon");
        await actor.updateEmbeddedDocuments("Item", weapons.map((i: any) => ({_id: i.id, "system.worn.value": entry.wield!(i.name)})));
      }
      if (entry.name === "Hexe Zarba") await this.#witchSpells(actor, options.witchSpells);
      for (const flag of [FLAGS.automation, FLAGS.archetype]) if (actor.getFlag(MODULE_ID, flag) !== undefined) await actor.unsetFlag(MODULE_ID, flag);
      actors.set(entry.name, actor);
    }
    return actors;
  }

  static async #witchSpells(actor: any, spells: [string, string][]): Promise<void> {
    const status = actor.system.status?.astralenergy;
    if (status && Number(status.max) < 40) await actor.update({"system.status.astralenergy.initial": 40, "system.status.astralenergy.max": 40, "system.status.astralenergy.value": 40});
    const docs: any[] = [];
    for (const [packId, name] of spells) {
      if (actor.items.getName(name)) continue;
      const pack = game.packs.get(packId);
      const entry = pack?.index.find((e: any) => e.name === name);
      if (!entry) {
        log.warn(`Testarena: Zauber „${name}“ nicht in ${packId} gefunden.`);
        continue;
      }
      const doc = await pack.getDocument(entry._id);
      const data = doc.toObject();
      data.system.talentValue = {...(data.system.talentValue ?? {}), value: 12};
      docs.push(data);
    }
    if (docs.length) await actor.createEmbeddedDocuments("Item", docs);
  }

  static async #scene(name: string, baseName: string | null, navName: string): Promise<any> {
    const existing = game.scenes.getName(name);
    if (existing) return existing;
    const base = baseName ? game.scenes.getName(baseName) : null;
    let data: Record<string, unknown>;
    if (base) {
      data = base.toObject();
      delete data._id;
      data.tokens = [];
      data.regions = [];
      data.drawings = [];
      data.notes = [];
    } else {
      log.warn(`Testarena: Basis-Szene „${baseName}“ fehlt – leere Arena wird angelegt.`);
      data = {
        width: ORIGIN.x * 2 + 19 * GRID, height: ORIGIN.y * 2 + 8 * GRID, padding: 0,
        grid: {type: CONST.GRID_TYPES.SQUARE, size: GRID, distance: 1, units: "Schritt"},
        backgroundColor: "#3b3a36", tokenVision: false, fog: {exploration: false}
      };
    }
    return Scene.create({...data, name, active: false, navigation: true, navName});
  }

  static async #tokens(scene: any, actors: Map<string, any>): Promise<void> {
    const creates: any[] = [];
    for (const entry of ROSTER) {
      const actor = actors.get(entry.name);
      if (!actor) continue;
      const x = ORIGIN.x + entry.cell[0] * GRID;
      const y = ORIGIN.y + entry.cell[1] * GRID;
      const flags: Record<string, unknown> = {automation: {level: "preview"}};
      if (entry.archetype) flags[FLAGS.archetype] = entry.archetype;
      const texture = entry.reuse ? undefined : ICON(entry.icon);
      const existing = scene.tokens.find((t: any) => t.name === entry.tokenName);
      if (existing) {
        if (texture) await unsetImageFlags(existing);
        await existing.update({x, y, disposition: entry.disposition, ...(texture ? {"texture.src": texture} : {}), [`flags.${MODULE_ID}`]: flags});
        continue;
      }
      const doc = await actor.getTokenDocument({x, y, disposition: entry.disposition, actorLink: true, hidden: false, ...(texture ? {texture: {src: texture}} : {})});
      const data = doc.toObject();
      delete data._id;
      if (texture) stripImageFlags(data);
      data.flags = {...(data.flags ?? {}), [MODULE_ID]: flags};
      creates.push(data);
    }
    if (creates.length) await scene.createEmbeddedDocuments("Token", creates);
    await this.#linkProteges(scene);
  }

  static async #linkProteges(scene: any): Promise<void> {
    for (const entry of ROSTER) {
      if (!entry.protegeOf) continue;
      const guard = scene.tokens.find((t: any) => t.name === entry.tokenName);
      const ward = scene.tokens.find((t: any) => t.name === entry.protegeOf);
      if (guard && ward) await guard.update({[`flags.${MODULE_ID}.${FLAGS.automation}`]: {level: "preview", protegeTokenId: ward.id}});
    }
  }

  static async #hazard(scene: any): Promise<void> {
    if (scene.regions.getName(HAZARD.name)) return;
    await scene.createEmbeddedDocuments("Region", [{
      name: HAZARD.name, color: "#ff5500", visibility: CONST.REGION_VISIBILITY.ALWAYS,
      shapes: [{type: "rectangle", x: ORIGIN.x + HAZARD.cell[0] * GRID, y: ORIGIN.y + HAZARD.cell[1] * GRID, width: HAZARD.size * GRID, height: HAZARD.size * GRID, rotation: 0, hole: false}],
      flags: {[MODULE_ID]: {[FLAGS.hazard]: {severity: "avoid", damage: 4}}}
    }]);
  }

  static async #combat(scene: any): Promise<any> {
    let combat = game.combats.find((c: any) => c.scene?.id === scene.id);
    if (!combat) combat = await Combat.create({scene: scene.id, active: true});
    const missing = scene.tokens.filter((t: any) => !combat.combatants.some((c: any) => c.tokenId === t.id));
    if (missing.length) await combat.createEmbeddedDocuments("Combatant", missing.map((t: any) => ({tokenId: t.id, sceneId: scene.id, actorId: t.actorId, hidden: false})));
    return combat;
  }

  static async #template(scene: any, name: string): Promise<any> {
    const existing = game.scenes.getName(name);
    if (existing) await existing.delete();
    const data = scene.toObject();
    delete data._id;
    const template = await Scene.create({...data, name, active: false, navigation: true, navName: "Vorlage"});
    await this.#linkProteges(template);
    return template;
  }

  static async #journal(): Promise<void> {
    const name = "Auto-Combat Testarena – Anleitung";
    if (game.journal.getName(name)) return;
    const content = `<h2>Auto-Combat Testarena</h2>
<p>Die Szene <b>Auto-Combat Testarena</b> ist spielbereit (Kampf angelegt, noch nicht gestartet). <b>Auto-Combat Testarena (Vorlage)</b> ist die saubere Kopie.
Neu aufbauen: <code>game.modules.get("${MODULE_ID}").api.setupTestArena()</code> als Skript-Makro.</p>
<ul>
<li><b>Spieler</b>: Wulfgrimm (Spieler 1) und Nonica (Spieler 2) – werden nie automatisiert.</li>
<li><b>Torben Eisenfaust</b> – Leibwächter mit Schützling Nonica.</li>
<li><b>Kazrak</b> – feindlicher Anführer (Gruppenbefehl auf seiner Karte).</li>
<li><b>Schläger Bosk</b> – Standard-Nahkämpfer. <b>Ganove Rasco</b> – Feiger Ganove (Flucht, Aufgabe).</li>
<li><b>Wilmero</b> – Schütze mit verstauten Schwertern (Waffenwechsel). <b>Hexe Zarba</b> – Kampfmagierin mit Ignifaxius, Pandaemonium, Hexenknoten.</li>
<li><b>Schaulustige Hesinde</b> – neutral. <b>Brennendes Öl</b> – Gefahrenzone (Meiden).</li>
</ul>`;
    await JournalEntry.create({name, pages: [{name: "Anleitung", type: "text", text: {content, format: 1}}]});
  }
}
