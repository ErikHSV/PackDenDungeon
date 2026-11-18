# PackDenDungeon

Ein Incremental-Tower-Defense / Auto-Battler mit Booster-Pack-Sammelmechanik in 2D-Pixel-Art. Vor dem Kampf kaufst du Packs im Shop. Im Kampf fallen sie rund um deinen Turm aufs Feld. Du schlägst sie mit dem **Runenkreis** am Cursor auf, und heraus springen Helden, die sofort gegen Monster aus allen Richtungen kämpfen. Jeder verlorene Run macht dich über die **Sternenkarte** dauerhaft stärker.

Alle Inhalte (Namen, Einheiten, Gegner, Grafiken, Texte) sind eigene Erfindungen.

**Startseite:** https://erikhsv.github.io/PackDenDungeon/

## Stand: Version 0.3 (Draufsicht-Arena)

Alle 12 Phasen der überarbeiteten Spezifikation sind umgesetzt:

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Projektstruktur und Datenformate (JSON + Schemas + Validator) | ✅ |
| 2 | Ovale Arena, Turm in der Mitte, Monster von allen Seiten bzw. aus Portalen, Runenkreis-Schaden | ✅ |
| 3 | Packs fallen aufs Feld, Widerstand, Aufschlagen per Runenkreis, Karten werden zu Einheiten | ✅ |
| 4 | Einheiten-KI (angreifen, Abstand, bewachen, springen, folgen), Tod, Entwicklung im Run | ✅ |
| 5 | Hub mit Shop, Jackpots, Run-Tasche, Tageseinkommen; Ergebnis-Bildschirm | ✅ |
| 6 | Sternenkarte (Äste A–H, Nebel, Foil-Staub-Ast), Mastery-Punkte, Speichern | ✅ |
| 7 | Tomes als schwebende Bücher (Seelenkrug wirkt liegend), Foil, Neue-Karte-Präsentation, Sammlung | ✅ |
| 8 | Gebäude werfen Packs, Kristalle, Elitewellen alle 30 s, Kapitel 1 mit Boss | ✅ |
| 9 | Kapitel 2–3 mit interaktiven Bossen (Medaillon treffen, Hämmer parieren), Riss des Frosts | ✅ |
| 10 | Relikte (auch verfluchte, Zerstören für Platz, Reliktjagd), Quests, Erfolge, Modifikatoren | ✅ |
| 11 | Akt-Tor mit Schlüsselsteinen, Prestige, „Gesucht“ (Foil-Bosse), Bestiarium, Grenzgänger | ✅ |
| 12 | Feinschliff, Balancing-Simulation, Debug-Werkzeuge | ✅ |

**So spielt man:** Im Hub Packs kaufen → „Kampf beginnen“ → Packs mit dem Runenkreis (Maus oder Finger) aufschlagen → Helden kämpfen allein, du hilfst mit dem Runenkreis, klickst Tomes an und wehrst Boss-Angriffe ab → nach dem Run Mastery-Punkte in der Sternenkarte ausgeben.

**Debug:** `?debug` an die URL hängen (z. B. `…/PackDenDungeon/?debug`). Dann gibt es im Kampf Knöpfe für Münzen, Zeitsprung, Boss, Packs und Run-Ende und in den Einstellungen Knöpfe für Währungen, Kapitel, Karten und Relikte.

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

Fortschritt simulieren (ein Bot spielt Tag für Tag: Shop, Run, Sternenkarte):

```bash
node tools/simulate.mjs 40 1
```

## Projektstruktur

```
index.html            das Spiel (alle Bildschirme)
dev/overview.html     Datenübersicht für Entwickler
css/                  Stylesheets
data/                 ALLE Inhalte als JSON (siehe docs/DATENFORMATE.md)
  schemas/            JSON-Schemas für jede Datendatei
src/
  core/               Spiellogik ohne DOM (läuft auch in Node)
    data.js           Dateiliste, Indizes, Querverweis-Prüfung
    schema.js         kleiner JSON-Schema-Validator
    util.js           Hilfsfunktionen (Patches, Zufall, …)
    run.js            ein Run: Packs, Karten, Einheiten, Tomes, Wellen, Bosse, Cursor
    units.js          Einheiten-KI, Angriffe, Fähigkeiten, Geschosse
    enemies.js        Gegner-Verhalten und Boss-Fähigkeiten
    combat.js         Schaden, Status, Kills, Belohnungen im Run
    cards.js          Kartenziehung (Seltenheit, Foil, Grenzgänger)
    meta.js           Shop, Tage, Sternenkarte, Tor, Relikte, Quests, Erfolge
  render/             Pixel-Art (prozedural), Sprites, Arena, Kampf-Renderer
  ui/                 Bildschirme: Hub, Kampf, Ergebnis, Sternenkarte, Sammlung, Relikte, …
  dev/                Entwicklerseiten (Datenübersicht)
  main.js, save.js, audio.js
tools/                Node-Werkzeuge (Validierung, Simulation)
docs/DATENFORMATE.md  Beschreibung aller Datenformate
legacy/               frühere Spielversionen
```

## Getroffene Annahmen

- **Technik und Titel:** HTML5 + Canvas wie bisher, Arbeitstitel „PackDenDungeon“.
- **Startgeld:** Der allererste Shop-Besuch startet mit 30 Münzen (`balance.wirtschaft.startMuenzen`), damit man sofort Packs kaufen kann. Danach gibt es kein Grundeinkommen, bis die Sternenkarte es freischaltet.
- **Kleine Pools:** Holz- und Silberpack enthalten nicht jede Seltenheit. Wird eine fehlende gewürfelt, kommt die nächstniedrigere.
- **Grenzgänger:** drei eigene Entwürfe (Flackerling, Spiegelsplitter, Leerläufer).
- **Beschwörungen:** Rostgolem und Skelettkrieger sind Einheiten ohne Karte.
- **Kapitel 4:** Dafür habe ich Frostwolf und Eisgeist ergänzt.
- **Sternensplitter:** Aus der Vorversion werden die **Kristalle** der neuen Spezifikation. Sie bezahlen Gebäude und Schlüsselknoten.
- **Einheiten-Ast:** Jede Karte hat einen Unterast mit 3 Knoten, der erst sichtbar wird, wenn die Karte gefunden wurde.
- **Arena:** Oval mit 880 × 470 px Radius um den Turm bei (960, 560), mit Platz für eine schlanke obere Leiste.
- **Run-Tasche:** fasst 10 Artikel (eine Kiste zählt als einer), über den Knoten „Tiefe Taschen“ erweiterbar. Das verhindert, dass die Wirtschaft nach langen Runs explodiert.
- **Münzen:** Ein Kill bringt im Schnitt 0,4 × Münzwert des Gegners (zufällig gerundet). Höhere Kapitel zahlen mehr Münzen **und** mehr Mastery.
- **Akt 2:** Das Tor ist spielbar (Reset der Sternenkarte, Akt-2-Knoten, Modifikatoren, Riss des Frosts). Eigene Akt-2-Kapitel sind als „geplant“ in `acts.json` vermerkt.
- **Balancing:** gemessen mit `tools/simulate.mjs` (menschenähnlicher Bot). Erster Run des Bots ≈ 40–50 s, ein echter Neuling stirbt meist nach 20–30 s. Boss von Kapitel 1 nach etwa 20 Runs, Kapitel 2 nach etwa 45.
