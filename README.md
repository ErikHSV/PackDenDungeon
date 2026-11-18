# PackDenDungeon

Ein Incremental-Tower-Defense / Auto-Battler mit Booster-Pack-Sammelmechanik in 2D-Pixel-Art. Vor dem Kampf kaufst du Packs im Shop. Im Kampf fallen sie rund um deinen Turm aufs Feld. Du schlägst sie mit dem **Runenkreis** am Cursor auf, und heraus springen Helden, die sofort gegen Monster aus allen Richtungen kämpfen. Jeder verlorene Run macht dich über die **Sternenkarte** dauerhaft stärker.

Alle Inhalte (Namen, Einheiten, Gegner, Grafiken, Texte) sind eigene Erfindungen.

**Startseite:** https://erikhsv.github.io/PackDenDungeon/

## Stand: Version 0.3 im Neubau

Das Spiel wird gerade als **Draufsicht-Arena** neu gebaut, in Phasen laut Spezifikation:

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Projektstruktur und Datenformate | ✅ fertig |
| 2 | Arena mit Turm in der Mitte, Monster von allen Seiten, Cursor-Schaden | offen |
| 3 | Packs: fallen aufs Feld, Widerstand, Aufschlagen per Cursor, Karten werden zu Einheiten | offen |
| 4 | Einheiten-KI und Kampf, Tod, Entwicklung im Run | offen |
| 5 | Shop, Run-Tasche, Münzen, Ergebnis-Bildschirm | offen |
| 6 | Sternenkarte, Mastery-Punkte, Speichern | offen |
| 7 | Tomes, Foil, Neue-Karte-Präsentation, Sammlung | offen |
| 8 | Gebäude, Kristalle, Kapitel 1 komplett mit Boss | offen |
| 9 | Kapitel 2–4, weitere Packs und Einheiten, Relikte, Quests, Modifikatoren | offen |
| 10 | Feinschliff, Balancing, Debug-Werkzeuge | offen |

Bis Phase 2 zeigt die Startseite eine **Datenübersicht** aller Inhalte.

**Frühere Versionen** bleiben spielbar:
- [`legacy/v0.2/`](legacy/v0.2/): Seitenansicht mit Helden-Slots, Mastery-Sternenkarte und Pixel-Art
- [`pack-legends/`](pack-legends/): erster Prototyp

## Technik

- HTML5 + JavaScript (Canvas, ES-Module), kein Build-Schritt
- PC und Mobile; komplett mit Maus bzw. einem Finger spielbar, keine Tastatur nötig
- Referenzauflösung 1920×1080, proportional skaliert

Lokal starten (die Daten werden per `fetch` geladen, deshalb wird ein Webserver gebraucht):

```bash
python3 -m http.server 8080
```

Daten prüfen:

```bash
node tools/validate-data.mjs
```

## Projektstruktur

```
index.html            Startseite (bis Phase 2: Datenübersicht)
css/                  Stylesheets
data/                 ALLE Inhalte als JSON (siehe docs/DATENFORMATE.md)
  schemas/            JSON-Schemas für jede Datendatei
src/
  core/               Spiellogik ohne DOM (läuft auch in Node)
    data.js           Dateiliste, Indizes, Querverweis-Prüfung
    schema.js         kleiner JSON-Schema-Validator
    util.js           Hilfsfunktionen (Patches, Zufall, …)
  dev/                Entwicklerseiten (Datenübersicht)
tools/                Node-Werkzeuge (Validierung, später Simulation)
docs/DATENFORMATE.md  Beschreibung aller Datenformate
legacy/               frühere Spielversionen
```

Ab Phase 2 kommen `src/render/` (Darstellung) und `src/ui/` (Bildschirme) hinzu. Die Pixel-Art-, Sprite- und Audio-Module aus `legacy/v0.2` werden dabei wiederverwendet.

## Getroffene Annahmen (Phase 1)

- **Technik und Titel:** HTML5 + Canvas wie bisher, Arbeitstitel „PackDenDungeon“.
- **Startgeld:** Der allererste Shop-Besuch startet mit 30 Münzen (`balance.wirtschaft.startMuenzen`), damit man sofort Packs kaufen kann. Danach gibt es kein Grundeinkommen, bis die Sternenkarte es freischaltet.
- **Kleine Pools:** Holz- und Silberpack enthalten nicht jede Seltenheit. Wird eine fehlende gewürfelt, kommt die nächstniedrigere.
- **Grenzgänger:** drei eigene Entwürfe (Flackerling, Spiegelsplitter, Leerläufer).
- **Beschwörungen:** Rostgolem und Skelettkrieger sind Einheiten ohne Karte.
- **Kapitel 4:** Dafür habe ich Frostwolf und Eisgeist ergänzt.
- **Sternensplitter:** Aus der Vorversion werden die **Kristalle** der neuen Spezifikation. Sie bezahlen Gebäude und Schlüsselknoten.
- **Einheiten-Ast:** Jede Karte hat einen Unterast mit 3 Knoten, der erst sichtbar wird, wenn die Karte gefunden wurde.
- **Arena:** Oval mit 880 × 470 px Radius um den Turm bei (960, 560), mit Platz für eine schlanke obere Leiste.
