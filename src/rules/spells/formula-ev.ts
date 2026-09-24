/**
 * Expected value of a DSA5 damage formula such as "1d6+4", "2W6+QS" or "QS*2". Dice average to
 * (sides + 1) / 2; `QS` is replaced by the given quality step. Unparseable input yields 0.
 */
export function expectedValue(formula: string, qualityStep: number): number {
  if (!formula) return 0;
  let text = formula.toLowerCase().replace(/\s+/g, "").replace(/qs/g, String(qualityStep)).replace(/w/g, "d");
  text = text.replace(/(\d*)d(\d+)/g, (_match, count: string, sides: string) => String(((Number(count) || 1) * (Number(sides) + 1)) / 2));
  if (!/^[\d+\-*/().]+$/.test(text)) return 0;
  try {
    const value = evaluate(text);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

/** Tiny recursive-descent evaluator for + - * / and parentheses (no eval). */
function evaluate(text: string): number {
  let index = 0;
  const peek = () => text[index];
  const next = () => text[index++];
  const parseNumber = (): number => {
    let start = index;
    if (peek() === "-" || peek() === "+") index++;
    while (index < text.length && /[\d.]/.test(text[index]!)) index++;
    if (start === index) throw new Error("number expected");
    return Number(text.slice(start, index));
  };
  const parseFactor = (): number => {
    if (peek() === "(") {
      next();
      const value = parseExpression();
      if (next() !== ")") throw new Error("missing )");
      return value;
    }
    return parseNumber();
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  };
  const parseExpression = (): number => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  };
  const result = parseExpression();
  if (index !== text.length) throw new Error("trailing input");
  return result;
}

/** DSA5 quality step estimate for a skill value with an average roll: roughly FW/3, clamped to 1..6. */
export function expectedQualityStep(talentValue: number): number {
  return Math.min(6, Math.max(1, Math.ceil(talentValue / 3)));
}
