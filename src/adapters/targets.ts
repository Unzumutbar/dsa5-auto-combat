/**
 * DSA5 reads `game.user.targets` everywhere during a roll. We set the targets only for the
 * duration of one roll and restore whatever the GM had targeted before (see dsa5 zone-attack.js).
 */
export async function withTemporaryTargets<T>(tokenIds: string[], fn: () => Promise<T>): Promise<T> {
  const previous: string[] = Array.from(game.user.targets as Set<any>).map((t: any) => t.id);
  game.user._onUpdateTokenTargets(tokenIds.filter(id => canvas.tokens.get(id)));
  try {
    return await fn();
  } finally {
    game.user._onUpdateTokenTargets(previous.filter(id => canvas.tokens.get(id)));
  }
}
