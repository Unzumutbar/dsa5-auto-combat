# Changelog

## Unveröffentlicht

- **Testarena**: `api.setupTestArena()` baut eine komplette Testaufstellung mit Spielerhelden, NPC-Archetypen,
  Gefahrenzone, Kampf und Vorlagen-Szene; neun eigene Token-Bilder unter `icons/tokens/`.

## 0.4.0 – 2026-09-06

- **Gefahrenzonen**: DSA5-Zauberregionen (Pandämonium, Ignisphaero, Item-Flag „Zone am Boden“) und manuell markierte
  Regionen/Messvorlagen werden gemieden (Umweg) oder wie Wände behandelt; Tokens verlassen Zonen zuerst; Flächenzauber
  treffen keine Verbündeten; rote Zellen in der Wegvorschau; Einstellung „Gefahrenzonen“ pro Token.
- **Zauberwände**: Button „Zauberwand ziehen“ auf gelungenen Zauberkarten (Fortifex, Hexenknoten, Item-Flag), Wand mit
  Wirkungsdauer in Kampfrunden, automatischer Ablauf zu Rundenbeginn, Liste in der Wand-Werkzeugleiste, violett in der
  Wegvorschau.
- **Aufgeben**: Zustand „Ergeben“, Aufgabe-Schwelle und Aufgabe bei Überzahl pro Token, SL-Karte mit Annehmen /
  Kämpft weiter / Text posten, Ergebene werden übersprungen und nicht mehr angegriffen; Feiger Ganove ergibt sich.
- **Munition aus → Nahkampf**: leere Fernkampfwaffen gelten als unbrauchbar, der Wechsel zur verstauten Nahkampfwaffe
  folgt automatisch.
- **Gruppenverhalten**: Umzingeln, Fluchtwege blockieren (Wächter, Leibwächter), Gruppenziel des Anführers,
  Gruppenbefehl „Angriff / Rückzug / Verteidigung“ auf der Anführer-Karte (gilt bis Kampfende).
- API: `hazards`, `magicWalls`, `expireMagicWalls`.

## 0.3.0 – 2026-09-06

- **Wegvorschau auf der Karte**: Solange eine Zugvorschau offen ist, zeigt die Szene den geplanten Weg (grün frei,
  gelb mit Aktion), das Zielfeld, das Ziel, Passierschlag-Gegner und Schusslinien; Button „Weg zeigen/verbergen“
  auf der Karte, Hover hebt hervor. Welteinstellung „Wegvorschau auf der Karte“.
- **Erfolgsaussicht**: Angriffe zeigen geschätzte Trefferchance und erwarteten Schaden nach Rüstung, Zauber die
  Gelingenswahrscheinlichkeit der 3W20-Probe. Kampfmanöver werden jetzt nach erwartetem Schaden gewählt (Finte gegen
  starke Verteidigung, Wuchtschlag gegen Rüstung). Welteinstellung „Erfolgsaussicht anzeigen“.
- **Plan anpassen in der Karte**: Ziel-, Waffen- und Zauber-Auswahl (auch verstaute Waffen), „keine Bewegung“,
  Aktionen per „×“ entfernen, „Zurücksetzen“; jede Anpassung plant den Zug neu.
- **Waffenwechsel**: Schützen im Nahkampf ziehen eine Nahkampfwaffe, Nahkämpfer mit unerreichbarem Ziel eine
  Fernkampfwaffe; kostet eine Aktion, mit Schnellziehen keine. Zweihand ⇄ Waffe+Schild wird berücksichtigt.
- **Mehrrundige Zauber**: Zauber mit längerer Zauberdauer werden über Runden vorbereitet (DSA5-Fortschritt), im
  nächsten Zug gewürfelt und bei verlorenem Ziel, Reichweite oder gestiegenem Schmerz abgebrochen.
- Waffenschaden im Snapshot enthält jetzt den Schadensbonus des Actors; Rüstungsschutz wird erfasst.
- API: `adjustPlan`, `toggleOverlay`.

## 0.2.0 – 2026-09-05

- **Wände blockieren den Nahkampf**: Angrenzen zählt nur ohne Wand dazwischen; die Wegfindung sucht Zellen, die das Ziel tatsächlich berühren.
- **Bewegungsart des Tokens** (Gehen, Fliegen, Schwimmen, Kriechen) bestimmt Geschwindigkeit und Bewegungsaktion.
- **Passierschläge in beide Richtungen**: Verlässt ein Token den Nahkampfbereich eines Gegners, erhält dieser die freie Attacke (−4, keine Verteidigung, keine Aktion). Vollautomatische NPC schlagen sofort zu, Vorschau-NPC und Spieler bekommen eine Chat-Karte mit „Ausführen“/„Verzichten“. Der Planer warnt vor provozierenden Bewegungen; „Darf den Nahkampf verlassen“ steuert Rückzüge.
- **Archetypen**: eingebaute Verhaltensvorlagen (Standard, Mörderischer Nahkämpfer, Feiger Ganove, Schütze, Bestie, Kampfmagier, Buff-/Heilmagier, Kontrollmagier, Wächter, Leibwächter, Anführer), weltweit editierbar und pro Gesinnung als Standard zuweisbar; Token/Actor wählen einen Archetyp und überschreiben einzelne Werte. Alte Gesinnungs-Standardwerte werden automatisch in Archetypen überführt.
- **Neuer Token-/Actor-Dialog** mit Archetyp-Kopf und Reitern „Kampf“, „Zauber & Fernkampf“, „Moral & Sonstiges“; wirksame Werte als Tooltip. Erreichbar über Token-HUD, Token-Konfiguration, Kampftracker-Kontextmenü und die Kopfzeile des Actor-Sheets.
- **Neue Verhaltenswerte**: kampfunfähige Ziele angreifen, Heilschwelle, Zauber-Präferenz, Position halten, Schützling, Anführer, Immunität gegen Gruppenmoral, Fokus-Begrenzung, Kampfmanöver, Rückzug erlauben.
- **Fokus-Begrenzung**: höchstens N Verbündete auf dasselbe Ziel (Welteinstellung, Standard 2).
- **Kampfmanöver**: Wuchtschlag/Finte, wenn der Angriffswert deutlich über der Verteidigung des Ziels liegt.
- **Gruppen-Moral**: Fällt der Anführer oder mehr als die Hälfte der Gruppe, steigt die Fluchtschwelle um 25 Punkte.
- **Hotkeys** (Shift+P planen, Shift+Enter ausführen, Shift+Alt+A Notaus) und Notaus-Schalter in der Token-Steuerung.
- Englische Übersetzung vervollständigt.

## 0.1.0 – 2026-09-05

Erste lauffähige Version für Foundry VTT v14 und DSA5 8.1.x.

- Zugvorschau als Spielleiter-Chatkarte (Ausführen / Anderes Ziel / Überspringen / Zug beenden), pro Token auch vollautomatisch.
- Zielwahl nach Gesinnung (Feindlich, Freundlich, Neutral/Geheimnisvoll mit Grudge-Liste); Spieler-Tokens werden nie automatisiert.
- Bewegung mit A*-Wegfindung um Wände und Tokens, freie Bewegung bis GS, Laufen kostet eine Aktion.
- Nahkampf mit Waffenreichweiten- und Größenmodifikatoren, mehrere Aktionen bei Kreaturen.
- Fernkampf mit Entfernungsbändern, Nachladen, Abstand halten und Schussposition.
- Automatische Verteidigung der NPC (Parade, Schild, Ausweichen, Verzicht) inklusive Mehrfachverteidigungs-Malus; Schaden wird angewendet.
- Zauber und Liturgien: Heilung, Selbst-Stärkung, Schaden und Kontrolle mit Wissensbasis, Rollen-Override im Item-Sheet und AsP/KaP-Abzug.
- Moral: Flucht unterhalb einer LeP-Schwelle.
- Automatische Initiative für spielleitergesteuerte Kombattanten.
- Token-HUD-Button, Konfigurationsformular, Kopfzeilen-Button in der Token-Konfiguration, Kampftracker-Button und -Kontextmenü.
