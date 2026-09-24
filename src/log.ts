import {MODULE_ID, SETTINGS} from "./config";

function debugEnabled(): boolean {
  try {
    return Boolean(game.settings.get(MODULE_ID, SETTINGS.debug));
  } catch {
    return false;
  }
}

export const log = {
  info(...args: unknown[]): void {
    console.log(`${MODULE_ID} |`, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(`${MODULE_ID} |`, ...args);
  },
  error(...args: unknown[]): void {
    console.error(`${MODULE_ID} |`, ...args);
  },
  debug(...args: unknown[]): void {
    if (debugEnabled()) console.debug(`${MODULE_ID} |`, ...args);
  }
};
