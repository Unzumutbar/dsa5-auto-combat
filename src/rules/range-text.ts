import type {SpellRangeSpec} from "../types/spells";

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").toLowerCase().trim();
}

/**
 * Parses DSA5 free-text spell ranges ("8 Schritt", "Berührung", "selbst", "Sichtweite").
 * Unknown texts fall back to `fallbackUnits` and are flagged so the preview can warn.
 */
export function parseSpellRange(text: string | null | undefined, fallbackUnits: number, hint?: number | "touch" | "self" | "sight"): SpellRangeSpec {
  const t = normalize(text ?? "");
  if (/^(selbst|self)\b/.test(t)) return {kind: "self"};
  if (/(beruhrung|beruhren|touch)/.test(t)) return {kind: "touch"};
  if (/(sichtweite|sicht|sight|line of sight)/.test(t)) return {kind: "sight"};
  const match = t.match(/(\d+(?:[.,]\d+)?)\s*(schritt|schr|yards?|yd|m\b|meter|steps?)/);
  if (match) return {kind: "units", units: parseFloat(match[1]!.replace(",", "."))};
  const qs = t.match(/(\d+(?:[.,]\d+)?)\s*(schritt|yards?)?\s*(x|\*|×)?\s*qs/);
  if (qs) return {kind: "units", units: parseFloat(qs[1]!.replace(",", "."))};
  if (hint === "touch" || hint === "self" || hint === "sight") return {kind: hint};
  if (typeof hint === "number") return {kind: "units", units: hint};
  return {kind: "unknown", units: fallbackUnits};
}

/** Whether a target at `distance` (scene units) can be affected; `adjacent` covers touch spells. */
export function rangeAllows(range: SpellRangeSpec, distance: number, adjacent: boolean, lineOfSight: boolean): boolean {
  switch (range.kind) {
    case "self":
      return false;
    case "touch":
      return adjacent;
    case "sight":
      return lineOfSight;
    default:
      return lineOfSight && distance <= range.units;
  }
}
