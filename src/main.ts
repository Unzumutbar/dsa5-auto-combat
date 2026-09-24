import {ArchetypeStore} from "./adapters/archetype-store";
import {runSelfTest} from "./adapters/self-test";
import {SnapshotBuilder} from "./adapters/snapshot-builder";
import {TokenSettingsAdapter} from "./adapters/token-settings";
import {MODULE_ID, localize} from "./config";
import {log} from "./log";
import {DamageController} from "./orchestration/damage-controller";
import {DefenseController} from "./orchestration/defense-controller";
import {InitiativeController} from "./orchestration/initiative-controller";
import {OpportunityController} from "./orchestration/opportunity-controller";
import {SocketBridge} from "./orchestration/socket-bridge";
import {TurnController} from "./orchestration/turn-controller";
import {planTurn} from "./rules/planner";
import {WorldSettingsRegistry} from "./settings/world-settings";
import {TokenAutomationConfig} from "./ui/token-automation-config";
import {HazardMarker} from "./ui/hazard-marker";
import {MagicWallList} from "./ui/magic-wall-list";
import {SpellCardWall} from "./ui/spell-card-wall";
import {WallController} from "./orchestration/wall-controller";
import {SurrenderController} from "./orchestration/surrender-controller";
import {SurrenderAdapter} from "./adapters/surrender";
import {MagicWallAdapter} from "./adapters/magic-walls";
import {HazardAdapter} from "./adapters/hazards";
import {TokenConfigHeader} from "./ui/token-config-header";
import {ActorSheetHeader} from "./ui/actor-sheet-header";
import {ArchetypeMenu} from "./ui/archetype-menu";
import {CombatTrackerButton} from "./ui/combat-tracker";
import {Keybindings} from "./ui/keybindings";
import {SceneControlToggle} from "./ui/scene-controls";
import {SpellSheetRole} from "./ui/spell-sheet-role";
import {TokenHud} from "./ui/token-hud";

Hooks.once("init", () => {
  WorldSettingsRegistry.register();
  CombatTrackerButton.registerContextMenu();
  Keybindings.register();
  SceneControlToggle.register();
  MagicWallList.register();
  SurrenderAdapter.registerStatus();
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      selfTest: runSelfTest,
      resolveSettings: (tokenDoc: any) => TokenSettingsAdapter.resolve(tokenDoc),
      worldSettings: () => WorldSettingsRegistry.read(),
      buildSnapshot: () => (game.combat ? SnapshotBuilder.build(game.combat) : null),
      planCurrent: () => TurnController.planCurrent(),
      executePreview: (messageId: string) => TurnController.execute(messageId),
      cycleTarget: (messageId: string) => TurnController.cycleTarget(messageId),
      skipPreview: (messageId: string) => TurnController.skip(messageId),
      adjustPlan: (messageId: string, patch: Parameters<typeof TurnController.adjustPlan>[1]) => TurnController.adjustPlan(messageId, patch),
      toggleOverlay: (messageId: string) => TurnController.toggleOverlay(messageId),
      magicWalls: () => MagicWallAdapter.list(canvas.scene).map(e => ({wallId: e.doc.id, ...e.state})),
      expireMagicWalls: (round: number) => WallController.expire(round),
      hazards: () => HazardAdapter.collect(canvas.scene),
      endTurn: (messageId: string) => TurnController.endTurn(messageId),
      planFor: (tokenId: string) => {
        if (!game.combat) return null;
        const snapshot = SnapshotBuilder.build(game.combat);
        const tokenDoc = canvas.scene?.tokens.get(tokenId);
        return tokenDoc ? planTurn(snapshot, tokenId, TurnController.planOptions(snapshot, tokenDoc)) : null;
      },
      openConfig: (tokenDoc: any) => TokenAutomationConfig.open(tokenDoc),
      archetypes: () => ArchetypeStore.list(),
      openArchetypes: () => new ArchetypeMenu().render({force: true}),
      openActorConfig: (actor: any) => TokenAutomationConfig.openForActor(actor),
      setArchetype: (doc: any, id: string | null) => TokenSettingsAdapter.writeArchetype(doc, id),
      toggleEnabled: () => Keybindings.toggleEnabled()
    };
  }
  if (game.system.id !== "dsa5") {
    log.warn(`Aktives System ist ${game.system.id}, das Modul benötigt dsa5.`);
    return;
  }
  SocketBridge.register();
  TurnController.register();
  InitiativeController.register();
  OpportunityController.register();
  DefenseController.register();
  DamageController.register();
  TokenHud.register();
  TokenConfigHeader.register();
  HazardMarker.register();
  SpellCardWall.register();
  WallController.register();
  SurrenderController.register();
  ActorSheetHeader.register();
  SpellSheetRole.register();
  CombatTrackerButton.register();
  if (!game.user.isGM) return;
  void ArchetypeStore.migrateLegacyDefaults().catch((error: unknown) => log.error("Archetyp-Migration fehlgeschlagen", error));
  const missing = runSelfTest();
  if (missing.length) ui.notifications.warn(localize("SelfTest.Missing", {missing: missing.join(", ")}));
  log.info(localize("Ready", {system: game.system.id, version: game.system.version}));
});
