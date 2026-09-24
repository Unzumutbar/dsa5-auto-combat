import type {SpellKnowledge} from "../../types/spells";

/**
 * Well-known DSA5 combat spells and liturgies. Roles decide how the planner uses a spell; the item
 * flag (Auto-Combat role on the spell sheet) always wins over this table. Entries marked `uncertain`
 * are educated guesses and worth a review by the GM.
 */
export const SPELL_KNOWLEDGE_BASE: readonly SpellKnowledge[] = [
  {id: "ignifaxius", kind: "spell", names: ["Ignifaxius"], role: "damage", target: "enemy", rangeHint: 16},
  {id: "fortifex", kind: "spell", names: ["Fortifex Arkane Wand", "Fortifex"], role: "control", target: "area", rangeHint: 8, wall: {blocksSight: false}, uncertain: true},
  {id: "hexenknoten", kind: "spell", names: ["Hexenknoten"], role: "control", target: "area", rangeHint: 16, wall: {blocksSight: false}, uncertain: true},
  {id: "pandaemonium", kind: "spell", names: ["Pandämonium", "Pandaemonium"], role: "control", target: "area", rangeHint: 8, hazard: "avoid", uncertain: true},
  {id: "ignisphaero", kind: "spell", names: ["Ignisphaero"], role: "damage", target: "area", rangeHint: 8, hazard: "avoid", uncertain: true},
  {id: "fulminictus", kind: "spell", names: ["Fulminictus"], role: "damage", target: "enemy", rangeHint: 8},
  {id: "corpofrigo", kind: "spell", names: ["Corpofrigo"], role: "damage", target: "enemy", rangeHint: "touch"},
  {id: "corpofesso", kind: "spell", names: ["Corpofesso"], role: "debuff", target: "enemy", notes: "Schmerz – Effekt manuell anwenden"},
  {id: "plumbumbarum", kind: "spell", names: ["Plumbumbarum"], role: "debuff", target: "enemy"},
  {id: "paralysis", kind: "spell", names: ["Paralysis", "Paralü"], role: "control", target: "enemy"},
  {id: "horriphobus", kind: "spell", names: ["Horriphobus"], role: "control", target: "enemy"},
  {id: "bannbaladin", kind: "spell", names: ["Bannbaladin"], role: "control", target: "enemy", rangeHint: "touch"},
  {id: "blitz", kind: "spell", names: ["Blitz dich find", "Blitz"], role: "debuff", target: "enemy", rangeHint: 8},
  {id: "somnigravis", kind: "spell", names: ["Somnigravis"], role: "control", target: "enemy", uncertain: true},
  {id: "balsam", kind: "spell", names: ["Balsam Salabunde", "Balsam"], role: "heal", target: "ally", rangeHint: "touch"},
  {id: "armatrutz", kind: "spell", names: ["Armatrutz"], role: "buff", target: "self", rangeHint: "self", effectNames: ["Armatrutz"]},
  {id: "attributo", kind: "spell", names: ["Attributo"], role: "buff", target: "ally", rangeHint: "touch", effectNames: ["Attributo"]},
  {id: "axxeleratus", kind: "spell", names: ["Axxeleratus"], role: "buff", target: "ally", rangeHint: "touch", effectNames: ["Axxeleratus"]},
  {id: "duplicatus", kind: "spell", names: ["Duplicatus"], role: "buff", target: "self", effectNames: ["Duplicatus"], uncertain: true},
  {id: "visibili", kind: "spell", names: ["Visibili"], role: "buff", target: "self", uncertain: true},
  {id: "zauberklinge", kind: "spell", names: ["Zauberklinge Geisterspeer", "Zauberklinge"], role: "buff", target: "self", uncertain: true},
  {id: "motoricus", kind: "spell", names: ["Motoricus"], role: "control", target: "enemy", uncertain: true},
  {id: "kulminatio", kind: "spell", names: ["Kulminatio Kraftfokus", "Kulminatio"], role: "buff", target: "self", uncertain: true},
  {id: "kroetensprung", kind: "spell", names: ["Krötensprung", "Kroetensprung"], role: "buff", target: "self", uncertain: true},
  {id: "heilsegen", kind: "liturgy", names: ["Heilsegen", "Kleiner Heilsegen", "Healing Blessing"], role: "heal", target: "ally", rangeHint: "touch"},
  {id: "schutzsegen", kind: "liturgy", names: ["Schutzsegen", "Kleiner Schutzsegen"], role: "buff", target: "ally", rangeHint: "touch", effectNames: ["Schutzsegen"]},
  {id: "blendstrahl", kind: "liturgy", names: ["Blendstrahl"], role: "debuff", target: "enemy"},
  {id: "bann-der-dunkelheit", kind: "liturgy", names: ["Bann der Dunkelheit"], role: "buff", target: "self", uncertain: true},
  {id: "bann-der-furcht", kind: "liturgy", names: ["Kleiner Bann der Furcht", "Bann der Furcht"], role: "buff", target: "ally", uncertain: true},
  {id: "objektsegen", kind: "liturgy", names: ["Objektsegen", "Kleiner Objektsegen"], role: "buff", target: "self", uncertain: true},
  {id: "angst", kind: "liturgy", names: ["Angst", "Furcht"], role: "control", target: "enemy", uncertain: true},
  {id: "mut", kind: "liturgy", names: ["Mut", "Mutsegen"], role: "buff", target: "ally", uncertain: true},
  {id: "hexenkrallen", kind: "spell", names: ["Hexenkrallen"], role: "buff", target: "self", rangeHint: "self", effectNames: ["Hexenkrallen"]},
  {id: "vipernblick", kind: "spell", names: ["Vipernblick"], role: "control", target: "enemy", rangeHint: 8, uncertain: true},
  {id: "schlaf-rauben", kind: "spell", names: ["Schlaf rauben"], role: "debuff", target: "enemy", uncertain: true},
  {id: "ignorantia", kind: "spell", names: ["Ignorantia"], role: "debuff", target: "enemy", uncertain: true},
  {id: "objectovoco", kind: "spell", names: ["Objectovoco"], role: "control", target: "enemy", uncertain: true, notes: "Nicht kampfrelevant"}
];

export function normalizeSpellName(name: string): string {
  return name
    .split(/[([]/)[0]!
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .trim();
}

export function lookupSpell(itemName: string, knowledgeBase: readonly SpellKnowledge[] = SPELL_KNOWLEDGE_BASE): SpellKnowledge | undefined {
  const normalized = normalizeSpellName(itemName);
  if (!normalized) return undefined;
  return knowledgeBase.find(k => k.names.some(n => normalizeSpellName(n) === normalized))
    ?? knowledgeBase.find(k => k.names.some(n => normalized.startsWith(normalizeSpellName(n))));
}
