# DSA5 – Auto Combat

Foundry-VTT-Modul (Core v14) für das System **Das Schwarze Auge 5 (dsa5)**: automatisiert die Züge und die
Verteidigung spielleitergesteuerter Tokens im Kampf.

## Installation

In Foundry unter **Add-on Modules → Install Module** diese Manifest-URL eintragen:

```
https://github.com/Unzumutbar/dsa5-auto-combat/releases/latest/download/module.json
```

Voraussetzungen: Foundry VTT v14 und das System **dsa5** ab 8.1. Für Entwicklung und lokale Tests siehe
[Entwicklung](#entwicklung).

## Was das Modul tut

Sobald ein NPC im Kampftracker am Zug ist, plant das Modul den Zug und zeigt dem Spielleiter eine
geflüsterte **Vorschau-Karte** im Chat:

- **Ausführen** führt die geplanten Aktionen aus (Bewegung, Angriff, Zauber, Nachladen).
- **Anderes Ziel** wechselt zyklisch durch die möglichen Ziele. Ist genau ein Token als Ziel markiert
  (Ziel-Werkzeug), wird dieses als nächstes vorgeschlagen, auch wenn es eigentlich kein Feind ist.
- **Überspringen** verwirft den Vorschlag, der Zug bleibt manuell.
- **Zug beenden** schaltet zum nächsten Kombattanten.
- **Weg zeigen/verbergen** blendet die Wegvorschau auf der Karte ein oder aus (siehe unten).
- **Plan anpassen** (aufklappbar): Ziel, Waffe und Zauber vorgeben, Bewegung unterdrücken, einzelne Aktionen mit
  „×“ entfernen, „Zurücksetzen“ stellt den Vorschlag wieder her. Jede Änderung plant den Zug neu, sodass Budget,
  Bewegung und Passierschlag-Warnungen konsistent bleiben; der Kopf der Karte zeigt „angepasst“.

Jede Angriffs- und Zauberzeile nennt die **Erfolgsaussicht**: geschätzte Trefferchance und erwarteter Schaden nach
Rüstung („≈ 62 % Treffer · ≈ 4,1 TP“) bzw. die Gelingenswahrscheinlichkeit der 3W20-Probe. Die Werte sind
Näherungen (keine Kritbestätigung, keine Sonderregeln) und lassen sich per Welteinstellung abschalten.

Pro Token kann die Stufe **Vollautomatisch** gesetzt werden: der Zug wird ohne Rückfrage ausgeführt und
(je nach Welteinstellung) sofort beendet.

### Wegvorschau auf der Karte

Solange eine Vorschau offen ist, zeichnet das Modul den Plan auf die Szene: den Weg (grün = freie Bewegung,
gelb = kostet eine Aktion), das Zielfeld, einen roten Ring um das Ziel, orange Ringe um Gegner, die einen
Passierschlag erhalten würden, und bei Fernkampf oder Zaubern die Schusslinie mit Entfernung. Beim Überfahren der
Karte mit der Maus wird die Zeichnung hervorgehoben. „Anderes Ziel“ und „Plan anpassen“ zeichnen neu; Ausführen,
Überspringen und ein Zugwechsel entfernen die Zeichnung. Nur der Spielleiter sieht die Vorschau.

### Verhalten nach Gesinnung

| Gesinnung des Tokens | Verhalten |
|---|---|
| Feindlich | Greift Spieler-Tokens und freundliche NPC an. |
| Freundlich | Greift feindliche NPC an, heilt und stärkt Spieler und andere freundliche NPC. |
| Neutral / Geheimnisvoll | Passiv: verteidigt sich nur. Wer den Token angreift, wird zum persönlichen Feind (Grudge-Liste). Geheimnisvolle Tokens würfeln verdeckt (GM-Wurf) und ohne Bewegungslineal. |

Tokens, die einem Spieler gehören, werden **nie** automatisiert.

### Archetypen

Ein **Archetyp** ist eine benannte Verhaltensvorlage. Mitgeliefert sind Standard, Mörderischer Nahkämpfer,
Feiger Ganove, Schütze, Bestie, Kampfmagier, Buff-/Heilmagier, Kontrollmagier, Wächter, Leibwächter und
Anführer. Unter Moduleinstellungen → „Archetypen verwalten“ lassen sich Archetypen bearbeiten, duplizieren,
löschen, wiederherstellen und pro Gesinnung als Standard zuweisen. Token oder Actor wählen einen Archetyp
und können einzelne Werte überschreiben. Auflösung: eingebaute Standardwerte → Gesinnung → Archetyp →
Actor → Token.

### Planung eines Zuges

1. Zustände prüfen: Handlungsunfähig, Bewusstlos oder Paralysiert → Zug wird übersprungen (pro Token abschaltbar).
2. Moral: unterschreiten die LeP die Fluchtschwelle, flieht der Token vom nächsten Gegner weg. Fällt der
   **Anführer** der Gruppe oder mehr als die Hälfte der Gruppe, steigt die Schwelle um 25 Punkte (Gruppen-Moral).
3. Ziel wählen: nächstes Ziel (Standard), schwächstes Ziel, größte Bedrohung oder zufällig. Ein gewähltes Ziel wird
   beibehalten, solange es steht. Die **Fokus-Begrenzung** verteilt Angreifer, wenn schon genug Verbündete auf
   einem Ziel sind. Leibwächter bevorzugen Angreifer ihres Schützlings; Mörderische Nahkämpfer greifen auch
   kampfunfähige Ziele an.
4. **Waffenwechsel**: Ein Schütze, der im Nahkampf steht, zieht eine verstaute Nahkampfwaffe; ein Nahkämpfer,
   der sein Ziel in dieser Runde nicht erreicht (oder Position hält), nimmt eine verstaute Fernkampfwaffe. Der Wechsel
   kostet eine Aktion, mit der Sonderfertigkeit **Schnellziehen** keine. Zweihandwaffen verdrängen Waffe und Schild,
   eine Einhandwaffe behält den Schild in der Nebenhand. Die getragen-Markierungen der Items werden dauerhaft
   umgeschaltet (auch nach dem Kampf bleibt die zuletzt gezogene Waffe in der Hand).
5. Zauber/Liturgie: Heilung für verletzte Verbündete (Schwelle einstellbar), Selbst-Stärkung in der ersten Runde,
   danach Schadens- oder Kontrollzauber je nach Zauber-Präferenz. **Mehrrundige Zauber** (Zauberdauer über den
   verfügbaren Aktionen) werden wie in DSA5 vorbereitet: die Aktionen der Runde erhöhen den Zauberfortschritt
   („konzentriert sich auf …“), im nächsten Zug folgt zuerst der Wurf. Verschwindet das Ziel, gerät es außer
   Reichweite oder steigt der Schmerz des Zauberers, wird der Zauber abgebrochen und der Fortschritt zurückgesetzt.
6. Fernkampf: Entfernungsband (nah +2 FK/+1 TP, mittel 0, weit −2/−1), Nachladen, Abstand halten, Schussposition suchen.
7. Nahkampf: Angriff, wenn angrenzend und **keine Wand dazwischen**; sonst Wegfindung (A*) um Wände und Tokens.
   Bewegung bis GS ist frei, darüber hinaus kostet sie eine Aktion. Die Bewegungsart des Tokens (Gehen, Fliegen,
   Schwimmen, Kriechen) bestimmt die Geschwindigkeit. **Kampfmanöver** (Wuchtschlag, Finte) werden in der Stufe
   eingesetzt, die den erwarteten Schaden gegen Verteidigung und Rüstung des Ziels am stärksten erhöht; Finte lohnt
   sich gegen starke Verteidiger, Wuchtschlag gegen schwere Rüstung. Voraussetzung ist die Sonderfertigkeit.
8. Kreaturen mit mehreren Aktionen greifen mehrfach an.

### Passierschläge

Verlässt ein Token den Nahkampfbereich eines Gegners, erhält dieser einen **Passierschlag** (freie Attacke mit
−4, die nicht abgewehrt werden kann und keine Aktion kostet). Vollautomatische NPC schlagen sofort zu,
Vorschau-NPC bekommen eine Spielleiter-Karte, Spieler eine Karte mit „Passierschlag ausführen“. Die Vorschau warnt,
wenn eine geplante Bewegung einen Passierschlag provoziert; „Darf den Nahkampf verlassen“ verbietet freiwillige
Rückzüge. Teleports lösen keinen Passierschlag aus.

### Gefahrenzonen

Flächenzauber legt DSA5 als **Regionen** auf die Szene. Ist der Zauber in der Wissensbasis als schädlich bekannt
(Pandämonium, Ignisphaero) oder im Zauber-Item unter „Zone am Boden“ markiert, gilt die Region automatisch als
Gefahrenzone. Beliebige Regionen und Messvorlagen lassen sich über das Kopfzeilenmenü ihres Konfigurationsdialogs
(„Gefahrenzone“) mit Stufe **Meiden** oder **Verboten** und einem Schadenshinweis markieren. Die Wegfindung verteuert
das Betreten von Meiden-Zellen (Umweg, wenn das Budget reicht) und behandelt Verboten-Zellen wie Wände; Fluchtziele
und Schusspositionen meiden Zonen ebenfalls. Steht ein Token in einer Zone, verlässt er sie als erste Bewegung des
Zuges und handelt danach von der neuen Position aus. Eigene Flächenzauber werden nicht auf Verbündete gelegt. Die
Wegvorschau färbt Zonen rot; pro Token regelt „Gefahrenzonen“ (Ignorieren / Meiden / Nie betreten), Bestien ignorieren
Zonen.

### Zauberwände

Für Wandzauber (Fortifex Arkane Wand, Hexenknoten, per Item-Flag „Zauberwand“ auch andere) bietet die DSA5-Zauberkarte
nach gelungenem Wurf **„Zauberwand ziehen“**: zwei Klicks auf der Karte legen Anfang und Ende fest (Rasterfang, Rechtsklick
oder Esc bricht ab, rot = außerhalb der Reichweite). Die Wand blockiert Bewegung, blickdicht nur bei „opaque“; die
Wirkungsdauer wird aus dem Zauber-Item berechnet (QS × … KR/Minuten) und in Kampfrunden gezählt, „aufrechterhaltend“
läuft nie automatisch ab. Zu Rundenbeginn entfernt das Modul abgelaufene Wände mit SL-Hinweis. In der Wand-Werkzeugleiste
listet **„Zauberwände“** alle Wände der Szene mit Restdauer und Löschen-Button; die Wegvorschau zeichnet sie violett.

### Aufgeben

Neben der Flucht kennt das Modul die **Aufgabe**: Liegt der LeP-Anteil unter der „Aufgabe-Schwelle“ des Tokens und ist
kein Fluchtweg frei (Flucht unmöglich oder mit zwei und mehr Passierschlägen), sind die Gegner in Überzahl (2:1, wenn
erlaubt) oder ist der Anführer gefallen, ergibt sich der Token statt zu fliehen. Er erhält den Zustand **„Ergeben“**
(weiße Flagge), wird von NPC nicht mehr angegriffen, zählt für die Gruppenmoral als ausgefallen und verliert seine Züge
(Welteinstellung). Der SL bekommt eine Karte mit **Annehmen**, **Kämpft weiter** (Zustand weg, der Token gibt in diesem
Kampf nicht mehr auf) und **Text posten** (öffentlicher Text aus den Welteinstellungen). Wird ein Ergebener angegriffen,
warnt das Modul. Der Feige Ganove ergibt sich ab 35 % LeP und bei Überzahl, alle anderen Archetypen nie.

### Gruppenverhalten

- **Umzingeln**: Steht bereits ein Verbündeter am Ziel, wählt der Angreifer die Nachbarzelle auf der gegenüberliegenden
  Seite, sodass das Ziel keinen freien Rückzug mehr hat.
- **Fluchtwege blockieren** (Einstellung, Wächter und Leibwächter ab Werk): Der Token stellt sich auf die vom eigenen
  Trupp abgewandte Seite des Ziels.
- **Gruppenziel**: Verbündete mit „Folgt dem Anführer“ bevorzugen das aktuelle Ziel ihres Anführers; die Fokus-Begrenzung
  erlaubt dort einen Angreifer mehr.
- **Gruppenbefehl**: Auf der Vorschau-Karte eines Anführers lässt sich „Angriff!“, „Rückzug!“ oder „Verteidigung!“
  wählen. Der Befehl überschreibt bis zum Kampfende alle anderen Einstellungen der Fraktion (Profil, Position halten,
  Rückzug, Flucht- und Aufgabe-Schwelle) und gilt sofort für alle NPC derselben Seite.

### Verteidigung und Schaden

Greift jemand einen automatisierten NPC an, wählt das Modul auf dem Spielleiter-Client die beste Verteidigung
(Parade mit Waffe/Schild, Ausweichen oder Verzicht), inklusive Malus für Mehrfachverteidigung, Schmerz und
Fernkampf-/Zaubermalus. Gewinnt der Angreifer, wird der Schaden automatisch angewendet (Welteinstellung:
nur NPC / alle / nie). Spielercharaktere verteidigen sich weiterhin selbst über die DSA5-Chat-Karte.

### Zauber-Wissen

DSA5-Zauber haben keine maschinenlesbare Wirkung. Das Modul bringt eine Tabelle bekannter Kampfzauber und
Liturgien mit (Ignifaxius, Fulminictus, Balsam Salabunde, Armatrutz, Paralysis, Heilsegen, …). Auf jedem
Zauber-Item kann der Spielleiter im Item-Sheet die Rolle überschreiben: Schaden, Heilung, Stärkung, Schwächung,
Kontrolle oder „Nie einsetzen“. Zauber mit Schadensformel gelten automatisch als Schadenszauber. Rituale und
Zeremonien werden nie automatisch gewirkt. Heilzauber mit Formel (z. B. `QS*2`) heben die LeP direkt an;
andere Effekte (Stärkungen, Zustände) müssen weiterhin manuell aus der DSA5-Karte angewendet werden.

## Einstellungen

**Welt** (Spieleinstellungen → Moduleinstellungen): Automatisierung aktiv, Schaden automatisch anwenden,
Zug nach Ausführung beenden (nie / nur vollautomatische Tokens / immer), Initiative automatisch würfeln,
Fallback-Reichweite für Zauber, Fokus-Begrenzung, Wegvorschau auf der Karte, Erfolgsaussicht anzeigen, Ergebene
überspringen, Text bei Aufgabe, besiegte Tokens blockieren Bewegung, Debug-Ausgaben, Menü „Archetypen verwalten“.

**Token / Actor**: Ritter-Symbol im Token-HUD (Rechtsklick wechselt Aus → Vorschau → Auto), Kopfzeile der
Token-Konfiguration, Kopfzeile des Actor-Sheets oder Rechtsklick auf einen Kombattanten im Kampftracker.
Der Dialog zeigt Gesinnung, Archetyp und Stufe sowie die Reiter **Kampf** (Profil, Zielwahl, Fokus-Begrenzung,
Kampfmanöver, Laufen, Position halten, Rückzug, Gefahrenzonen, Fluchtwege blockieren), **Zauber & Fernkampf** (Zauber,
Präferenz, Heilschwelle, Fernkampf, Abstand, Ausweichen gegen Fernkampf) und **Moral & Sonstiges** (Fluchtschwelle,
Aufgabe-Schwelle, Aufgabe bei Überzahl, Anführer, Folgt dem Anführer, Gruppenmoral, kampfunfähige Ziele,
Handlungsunfähigkeit, hoffnungslose Verteidigung, Zug beenden). Der wirksame Wert und seine
Herkunft erscheinen als Tooltip am Feld. Token-Einstellungen können zusätzlich als Actor-Standard gespeichert werden;
der Schützling wird nur am Token gesetzt.

**Kampftracker**: Der Button „Zug planen“ erzeugt jederzeit eine neue Vorschau für den aktuellen NPC.

**Tastenkürzel** (unter Steuerung konfigurierbar): Shift+P „Zug planen“, Shift+Enter „Vorschau ausführen“,
Shift+Alt+A „Auto Combat ein/aus“. Der Notaus-Schalter liegt zusätzlich in der Token-Steuerung der Szene.

## Makro-/Konsolen-API

```js
const api = game.modules.get("dsa5-auto-combat").api;
api.planCurrent();                 // Vorschau für den aktuellen Kombattanten
api.planFor(tokenId);              // Plan berechnen (mit Wegfindung), ohne Karte
api.buildSnapshot();               // Kampfzustand als reine Daten
api.executePreview(messageId);     // Karten-Buttons per Skript
api.cycleTarget(messageId); api.skipPreview(messageId); api.endTurn(messageId);
api.adjustPlan(messageId, {weaponId, spellId, targetTokenId, noMove, dropActions}); // oder "reset"
api.toggleOverlay(messageId);      // Wegvorschau ein/aus
api.hazards();                     // erkannte Gefahrenzonen der Szene
api.magicWalls(); api.expireMagicWalls(round); // Zauberwände auflisten / ablaufen lassen
api.resolveSettings(tokenDoc);     // wirksame Einstellungen mit Herkunft und Archetyp
api.openConfig(tokenDoc); api.openActorConfig(actor); api.openArchetypes();
api.archetypes(); api.setArchetype(tokenOrActor, "coward");
api.toggleEnabled(); api.selfTest();
```

## Grenzen

- Gefahrenzonen werden über Zellmittelpunkte erkannt; große Tokens gelten als betroffen, wenn eine ihrer Zellen in der
  Zone liegt. Zonen-Schaden wendet das Modul nicht an (DSA5 übernimmt das über seine Regionen).
- Zauberwände laufen nur innerhalb eines Kampfes nach Runden ab; außerhalb bleiben sie, bis der SL sie löscht. Die
  DSA5-Zauberdauer wird mit einem eigenen Parser gelesen (deutsche und englische Einheiten); Modifikationen aus dem
  Wurf-Dialog bleiben unberücksichtigt.
- Beim Zeichnen einer Zauberwand reagiert die Karte weiterhin auf Klicks (Token-Auswahl); am besten auf freie Stellen
  klicken.
- Aufgeben ist eine erzählerische Entscheidung: der Token ergibt sich nur mit gesetzter Schwelle, und der SL bestätigt
  jede Aufgabe über die Karte.
- Erfolgsaussichten sind Näherungen: Kritbestätigung, halbierte Verteidigung und Sonderregeln bleiben außen vor;
  die Verteidigung des Ziels wird aus Parade/Ausweichen des Snapshots geschätzt.
- Beim Waffenwechsel werden die getragen-Flags der Items verändert; ein Wechsel zurück erfolgt nur, wenn die Lage
  es erfordert.
- Mehrrundige Zauber übernehmen die DSA5-Konvention „Fortschritt = Zauberdauer − 1 Vorbereitungsaktionen, dann der
  Wurf“; Modifikationen der Zauberdauer aus dem DSA5-Dialog werden nicht berücksichtigt.
- Auf Karten ohne Raster bewegt sich der Token in gerader Linie (Foundry stoppt an Wänden).
- Große Tokens werden bei der Wegfindung wie im Kern über ihren Bewegungsursprung auf Wände geprüft.
- Passierschläge werden von einer Bewegung ausgelöst, die das Modul beobachtet; DSA5 bucht für jede Attacke eine
  Aktion, die das Modul beim Passierschlag wieder gutschreibt.

## Entwicklung

```bash
npx --yes pnpm@10 install
npm run check          # typecheck, test, build, verify:build
npm run link:foundry   # Junction Data/modules/dsa5-auto-combat -> dist (FOUNDRY_DATA_PATH oder %LOCALAPPDATA%\FoundryVTT)
```

Zum lokalen Testen startet `node scripts/run-foundry.mjs` (oder die Vorschau-Konfiguration `foundry-dsa5-test`)
den Foundry-Server headless mit der Node-Laufzeit der Electron-App und der Welt `dsa5-test`.

Reine Regel-Logik liegt unter `src/rules` und `src/types` (ohne Foundry-Abhängigkeit, mit Vitest getestet);
alles, was Foundry oder DSA5 berührt, liegt unter `src/adapters`, `src/orchestration`, `src/ui`, `src/settings`.
Nach Änderungen an DSA5-Interna meldet `api.selfTest()` fehlende Funktionen.
