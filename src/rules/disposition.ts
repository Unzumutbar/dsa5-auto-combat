import type {Disposition} from "../types/settings";

/** Foundry CONST.TOKEN_DISPOSITIONS: SECRET -2, HOSTILE -1, NEUTRAL 0, FRIENDLY 1. */
export function dispositionFromValue(value: number | null | undefined): Disposition {
  switch (value) {
    case -2: return "secret";
    case -1: return "hostile";
    case 1: return "friendly";
    default: return "neutral";
  }
}
