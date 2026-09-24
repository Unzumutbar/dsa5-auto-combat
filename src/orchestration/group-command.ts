import {SnapshotBuilder} from "../adapters/snapshot-builder";
import {TokenSettingsAdapter} from "../adapters/token-settings";
import {localize} from "../config";
import {isAlly} from "../rules/faction";
import {COMMAND_OVERRIDES, GROUP_COMMANDS, type GroupCommand} from "../rules/group";

/** Applies a leader's order to every NPC of the faction (token flag `command`, cleared at combat end). */
export class GroupCommandController {
  static async apply(leaderTokenDoc: any, command: GroupCommand | null): Promise<string[]> {
    if (command !== null && !GROUP_COMMANDS.includes(command)) return [];
    const combat = game.combat;
    if (!combat) return [];
    const snapshot = SnapshotBuilder.build(combat);
    const leader = snapshot.combatants.find(c => c.tokenId === leaderTokenDoc.id);
    if (!leader) return [];
    const members = snapshot.combatants.filter(c => !c.isPlayerOwned && (c.tokenId === leader.tokenId || isAlly(leader, c)));
    const names: string[] = [];
    for (const member of members) {
      const tokenDoc = canvas.scene?.tokens.get(member.tokenId);
      if (!tokenDoc) continue;
      await TokenSettingsAdapter.writeCommand(tokenDoc, command ? COMMAND_OVERRIDES[command] : null, command);
      names.push(member.name);
    }
    if (command) {
      await ChatMessage.create({
        content: `<p><i class="fa-solid fa-crown"></i> ${localize("Command.Announce", {leader: leader.name, command: localize(`Command.${command}`), members: names.join(", ")})}</p>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u: any) => u.id)
      });
    }
    return names;
  }
}
