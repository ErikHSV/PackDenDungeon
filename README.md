# PackDenDungeon

Ein Incremental-Tower-Defense-Spiel mit Booster-Pack-Mechanik in 2D-Pixel-Art. Du reißt Packs auf, sammelst Helden und verteidigst deinen Turm gegen immer größere Monsterhorden. Mit dem **Runenkreis** am Cursor triffst du Gegner und sammelst Gold ein. Jeder Run bringt Mastery-Punkte für die **Sternenkarte**, einen großen Skill-Tree mit Nebel des Unbekannten.

Alle Inhalte (Namen, Helden, Gegner, Grafiken, Texte, Musik) sind eigene Erfindungen. Grafik und Sound sind Platzhalter in Originalgröße und -position: Pixel-Art und Synthesizer-Töne werden prozedural erzeugt.

**Spielen:** https://erikhsv.github.io/PackDenDungeon/ · Der erste Prototyp *Pack Legends* liegt in [`pack-legends/`](pack-legends/).

## Starten (lokal)

Das Spiel lädt JSON-Dateien und braucht deshalb einen Webserver:

```bash
python3 -m http.server 8080
```

Dann <http://localhost:8080> öffnen.

**Bedienung** (Maus und Touch):

| Aktion | Maus / Tastatur | Touch |
|---|---|---|
| Runenkreis (Schaden und Gold einsammeln) | Maus über das Spielfeld bewegen | Finger auf dem Spielfeld halten |
| Pack kaufen | Truhe anklicken oder `1`–`3` | Truhe antippen |
| Flächenzauber zielen | Zauber, dann Spielfeld anklicken (Rechtsklick/`Esc` bricht ab) | Zauber, dann Spielfeld antippen |
| Pause / Tempo | `Leertaste` / `S` | Knöpfe oben rechts |
| Sternenkarte | ziehen, Mausrad zoomt, Klick kauft, gedrückt halten kauft mehrere Stufen | ein Finger zieht, zwei Finger zoomen, zweimal antippen kauft |

**Debug-Werkzeuge:** `?debug` an die URL hängen. Dann gibt es Gold, Welle überspringen, Bosswelle, Run beenden, Mastery-Punkte, alle Kapitel und alle Karten.

## Projektstruktur

```
index.html              Bühne 1920×1080 mit allen Bildschirmen und Overlays
css/style.css           Gestaltung (Farbpalette laut Spezifikation 8.1)
data/                   ALLE Inhalte und Zahlen (siehe unten)
  balance.json          Zentrale Balancing-Datei (Feld, Wellen, Runenkreis, Münzen, Turm, …)
  heroes.json           12 Helden          spells.json   6 Zauber
  enemies.json          Gegner und Bosse   packs.json    3 Packs
  chapters.json         4 Kapitel          rarities.json Seltenheiten
  starmap.json          Sternenkarte: 79 Knoten mit Positionen und Verbindungen
  schemas/              JSON-Schemas für alle Datenformate
src/core/               Spiellogik ohne DOM (läuft auch in Node)
  run.js                Ein Run: Gold, Packs, Team, Wellen, Runenkreis, Münzen, Hauptschleife
  heroes.js             Angriffsarten, Zielwahl, Helden-Fähigkeiten
  enemies.js            Bewegung, Blockade, Boss-Fähigkeiten mit Vorwarnung
  spells.js             Zaubereffekte, Auto-Auslösen, gezielte Zauber, Echo
  combat.js             Schaden, Rüstung, Magieresistenz, Statuseffekte
  cards.js / waves.js   Ziehen, Preise, Sterne / Wellen-Erzeugung
  starmap.js            Sternenkarte: Kosten, Erreichbarkeit, Nebel, Effekte, Mastery-Punkte
src/render/             Darstellung
  pixel.js              Mini-Pixel-Bibliothek (Kontur, Weiß-Blitz, ganzzahliges Skalieren)
  spriteArt.js          Pixel-Art aller Helden, Gegner, Bosse, Truhen, Symbole, Turm
  sprites.js            Frame-Erzeugung: Idle 4, Angriff 6, Treffer 2, Tod 5 (+ Sprite-Sheet-Hook)
  backgrounds.js        4 Kapitel-Hintergründe mit je 3 Parallax-Ebenen und Partikeln
  renderer.js           Kampf-Canvas
src/ui/                 Bildschirme: Menüs, Kampf-HUD, Pack-Overlay, Run-Ende, Sternenkarte, Sammlung, Einstellungen
src/audio.js            Sound- und Musik-Platzhalter (Musik je Kapitel und Boss-Variante)
tools/
  validate-data.mjs     Prüft Pflichtfelder und Querverweise
  simulate.mjs          Bot spielt Runs headless (Balancing)
  sprite-preview.html   Zeigt alle Sprites, Animationen und Hintergründe
```

## Neue Inhalte hinzufügen

Für neue Inhalte musst du nur die JSON-Dateien ändern. Danach `node tools/validate-data.mjs` ausführen.

- **Held, Zauber, Gegner, Pack, Kapitel:** siehe `data/schemas/`. Helden haben eine Angriffsart, Zielpriorität, Fähigkeiten, eine 3-Sterne-Verstärkung, eine Reihe (vorn/hinten) und ein Rollensymbol. Gegner haben Eigenschaften, Bosse zusätzlich Fähigkeiten und Phasen.
- **Sternenkarten-Knoten** (`data/starmap.json`, Felder laut 6.5): `id`, `name`, `beschreibung`, `typ` (`klein`/`gross`/`schluessel`/`freischalt`), `ast`, `position`, `verbindungen`, `maxStufe`, `basisKosten`, `kostenFaktor`, `splitterKosten`, `effekt` (`ziel`, `wert`, `rechenart`), optional `voraussetzung`. Verbindungen müssen in beiden Knoten eingetragen sein. Das prüft der Validator.
- **Grafik:** Neue Pixel-Art kommt nach `src/render/spriteArt.js`. Echte Sprite-Sheets lassen sich per `"spriteSheet"` in den Daten einhängen (siehe Kommentar in `sprites.js`).
- **Neue Mechaniken:** Dafür gibt es diese Tabellen im Code:
  - `ABILITIES` / `ATTACKS` in `heroes.js`
  - `BOSS_ABILITIES` in `enemies.js`
  - `SPELL_EFFECTS` in `spells.js`
  - `MOD_DEFAULTS` in `starmap.js`

## Balancing

Alle Zahlen stehen in `data/balance.json` und `data/chapters.json`.

```bash
node tools/simulate.mjs 12 1            # Runs mit Sternenkarten-Progression
node tools/simulate.mjs 12 1 --first    # nur "erste Runs" ohne Meta-Fortschritt
```

Stand laut Bot: Der erste Run endet meist zwischen Welle 7 und 16, der erste Boss fällt nach etwa 4–10 Runs. Ein Run dauert 3–9 Minuten. Der Bot hält den Runenkreis perfekt auf die Gegner und verliert keine Münzen. Echte Spieler kommen daher etwas weniger weit. Kapitel 3 und 4 sind noch kaum gebalanct.

## Getroffene Annahmen

- **Technik:** HTML5 + JavaScript (Canvas, ES-Module), kein Build-Schritt, PC und Mobile im Browser (Querformat).
- **Grafikgrößen:** Gegnergrößen sind Pixelmaße vor der ×3-Skalierung: normal 24×24, Elite 48×48, Boss 96×96.
- **Runenkreis:** Grundwerte 3 Schaden (wächst leicht mit der Welle), 72 px Radius, Treffer alle 0,6 s. Münzen liegen 5 s und verfallen danach.
- **Turm:** Er schießt erst mit dem Sternenkarten-Knoten „Turmbogen“.
- **Spezialisierungen:** Alle Helden-Spezialisierungen hängen am Helden-Ast, alle Zauber-Spezialisierungen am Zauber-Ast.
- **Volle Leisten:** Bei voller Zauberleiste (4, mit Knoten 5) wird ein neuer Zauber zu Gold. Duplikate mit 5 Sternen ebenfalls.
- **Erstes Pack:** Es enthält garantiert einen angreifenden Helden.
- **„Neuer Run“:** Der Knopf auf der Sternenkarte startet das zuletzt gespielte Kapitel.
- **Beenden:** Im Browser kehrt „Beenden“ zum Startbildschirm zurück.
- **Sprache:** Vorerst gibt es nur Deutsch, „English“ ist als „bald“ vorgesehen.
