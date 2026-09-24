export interface Modifier {
  name: string;
  value: number;
  type?: string;
  selected?: boolean;
  damageBonus?: number;
  step?: number;
  ref?: {id: string};
  [key: string]: unknown;
}

export interface BypassContext {
  /** Additional modifiers the caller wants applied (already localized names). */
  extra?: Modifier[];
}

/**
 * With `bypass: true` DSA5 skips its roll dialog and therefore also the dialog callback that
 * normally copies the pre-selected modifiers and target-dependent values into `testData`.
 * This reproduces exactly what the dialog would have submitted with its default selections:
 * - every pre-selected situational modifier (SituationalModifiersWidget keeps only `selected` ones),
 * - the defender's weapon reach (`opposingWeaponSize`; DiceDSA5.rollWeapon adds the malus itself),
 * - the target size modifier for melee attacks.
 */
export function applyBypassModifiers(setupData: any, ctx: BypassContext = {}): Modifier[] {
  const data = setupData.dialogOptions?.data ?? {};
  const modifiers: Modifier[] = [...(data.situationalModifiers ?? []).filter((m: any) => m?.selected), ...(ctx.extra ?? [])];
  if (data.melee) {
    if (data.targetWeaponSize) setupData.testData.opposingWeaponSize = data.targetWeaponSize;
    const sizeMod = Number(game.dsa5.config.meleeSizeModifier?.[data.targetSize] ?? 0);
    if (sizeMod) modifiers.push({name: game.i18n.localize("size"), value: sizeMod, selected: true});
  }
  setupData.testData.situationalModifiers = modifiers;
  return modifiers;
}
