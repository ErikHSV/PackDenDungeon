# PackDenDungeon

Ein Incremental-Tower-Defense / Auto-Battler mit Booster-Pack-Sammelmechanik in 2D-Pixel-Art. Vor dem Kampf kaufst du Packs im Shop. Im Kampf fallen sie rund um deinen Turm aufs Feld. Du schlägst sie mit dem **Runenkreis** am Cursor auf, und heraus springen Helden, die sofort gegen Monster aus allen Richtungen kämpfen. Jeder Run macht dich über den **Skill-Tree** stärker, Shiny-Funde zusätzlich über den dauerhaften **Foil-Baum**.

Alle Inhalte (Namen, Einheiten, Gegner, Grafiken, Texte) sind eigene Erfindungen.

**Startseite:** https://erikhsv.github.io/PackDenDungeon/

## Stand: Version 0.4 (Shiny, Quest-Knoten, Foil-Baum)

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

**Nachträge zur Spezifikation (umgesetzt):**
- **14.2 Hub:** ein einziger Bildschirm. Links Kapitelwahl (▲/▼, römische Ziffer = Prestige) und Shop (Raster mit 3 Spalten, Rabatt/NEU/Jackpot, Kauf rückgängig per Klick, RESET, REROLL), rechts Reiter UPGRADE (Skill-Tree als Schaltplan über der eigenen Basis), SAMMLUNG, BESTIARIUM, RELIKTE, dazu der KAMPF-Knopf.
- **3/6/14.5/15 Kampf:** Das ganze Bild ist Spielfeld. Der Boden ist dunkel in Kapitelfarbe, der Rand ist mit Deko und Vignette bedeckt, der Turm ist schmal und leuchtet in Kapitelfarbe. Die Figuren sind klein. Der Cursor ist ein dünner Kreis. Das HUD ist minimal: Boss-Fortschritt, Relikt-Spalte, Mastery-Zähler, Zahnrad und Quests.
- **14.6/14.6b:** Neue-Karte-Präsentation mit Halbton-Fleck; Freischaltungen (Pack, Kiste, Kapitel, Gebäude, Relikt, Erfolg) mit Strahlenkranz und Fanfare.
- **10 Währungen:** genau drei. **Münzen** (nur Shop): Tageseinkommen zu Beginn jedes Tages plus Bonus-Münzen. **Mastery** (blauer Kristall): Skill-Tree, aus Überleben, Kills, Elitewellen, Bossen, geöffneten Packs und neuen Karten. **Schimmer** (Foil-Staub, Regenbogen-Kristall): Foil-Baum, aus erster Shiny-Version einer Karte, Shiny-Monstern, Shiny-Bossen (fest 4) und Reliktpacks, wenn alle Relikte gefunden sind.
- **4 Shop:** Start mit 3 Münzen, 3 Einkommen, 3 Plätzen und nur Holzpacks (2 Münzen). Kisten und Einzelhelden schalten Knoten frei, Silber-/Sternenpack die Bosse. Jackpots nur beim Neu-Würfeln; Paar/Trio, Glanzpack und Relikt-Jackpots über den Foil-Baum.
- **7.5 Shiny:** 2 % je Karte, 1 % je Monster, Bosse nur über „Gesucht“ (mit Zusatzangriff „Prisma-Salve“). Shiny-Held: doppeltes Leben, +50 % Reichweite/Fläche. Shiny-Tome: +50 % Dauer und Fläche/Häufigkeit. Shiny-Monster: +100 % Leben, schneller, dreifache Mastery, 1 Schimmer. Optik: wandernder Glanzstreifen, Glitzer, Regenbogenblitz, Zeitlupe, eigene Präsentation „SHINY!“, Regenbogenränder in Shop, Sammlung, Bestiarium.
- **11 Skill-Tree:** Upgrade-, Freischalt-, Relikt-, Quest- und Tor-Knoten. Quests gibt es nur noch als Knoten (Fortschritt zählt nur, solange sie sichtbar sind). Der Tor-Knoten am Ende des Akt-Asts startet Akt 2 und setzt den Baum zurück.
- **11.6 Foil-Baum:** 15 dauerhafte Knoten (Shop, Relikte, Mastery, Shiny), umschaltbar über den Regenbogen-Kristall, mit Regenbogen-Wisch, -Leitungen und -Rändern.
- **11.7 Startset:** u. a. Würfelbecher, Händlerplatz, Sammlerfreude, Bonuskarte, Packreißer, Sturmspitze, Bollwerk (Schild mit Schockwelle, 25.000 Mastery), Helden-Blöcke mit Verhaltens-Knoten (z. B. Schildstoß, Zwillingsglut, Aufprall) und vier Baum-Relikte (Funkennadel, Knochenecho, Selbstschuss-Balliste, Portalsiegel).
- **BESTIARIUM und RELIKTE** schalten sich erst mit dem ersten Akt-Wechsel frei.

**So spielt man:** Im Hub-Shop Packs kaufen → „KAMPF“ → Packs mit dem Cursor-Kreis (Maus oder Finger) aufschlagen → Helden kämpfen allein, du hilfst mit dem Cursor, klickst Tomes an und wehrst Boss-Angriffe ab → nach dem Run im Reiter UPGRADE Mastery ausgeben und erfüllte Quest-Knoten abholen.

**Debug:** `?debug` an die URL hängen (z. B. `…/PackDenDungeon/?debug`). Dann gibt es im Kampf Knöpfe für Shiny-Monster, Zeitsprung, Boss, Packs und Run-Ende und in den Einstellungen Knöpfe für Währungen, Kapitel, Karten und Relikte.

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

Fortschritt simulieren (ein Bot spielt Tag für Tag: Shop, Run, Quests abholen, Skill-Tree, Foil-Baum, Tor):

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
    meta.js           Währungen, Shop, Tage, Skill-Tree, Quest-Knoten, Foil-Baum, Akt-Wechsel, Relikte, Erfolge
  render/             Pixel-Art (prozedural), Sprites, Arena, Kampf-Renderer
  ui/                 Hub (Shop + Reiter), Upgrade-Reiter (Skill-Tree/Foil-Baum), Kampf, Einblendungen, Ergebnis, Einstellungen
  dev/                Entwicklerseiten (Datenübersicht)
  main.js, save.js, audio.js
tools/                Node-Werkzeuge (Validierung, Simulation, Layout des Skill-Trees)
docs/DATENFORMATE.md  Beschreibung aller Datenformate
legacy/               frühere Spielversionen
```

## Getroffene Annahmen

- **Technik und Titel:** HTML5 + Canvas wie bisher, Arbeitstitel „PackDenDungeon“.
- **Startgeld und Einkommen:** 3 Münzen zum Start, 3 Tageseinkommen (`balance.wirtschaft`). Nicht ausgegebene Münzen bleiben erhalten. Einkommen wächst vor allem über Quest-Knoten (+1).
- **Kleine Pools:** Holz- und Silberpack enthalten nicht jede Seltenheit. Wird eine fehlende gewürfelt, kommt die nächstniedrigere.
- **Grenzgänger:** drei eigene Entwürfe (Flackerling, Spiegelsplitter, Leerläufer).
- **Beschwörungen:** Rostgolem und Skelettkrieger sind Einheiten ohne Karte.
- **Kapitel 4:** Dafür habe ich Frostwolf und Eisgeist ergänzt.
- **Keine Kristalle mehr:** Alte Spielstände bekommen ihre Kristalle (×3) und alle gekauften Knoten als Mastery erstattet, weil der Baum neu aufgebaut ist.
- **„Kristalle“ in 7.5** (erstes Shiny gibt Foil-Staub und Kristalle) habe ich als Mastery (blauer Kristall) gelesen.
- **Shop-Plätze:** 3 zum Start, +2 über den Foil-Knoten „Größere Theke“, +1 über „Händlerplatz“ im Skill-Tree.
- **Relikte in Akt 1:** Da RELIKTE erst ab Akt 2 offen ist, geben Akt-1-Quests kein Reliktpack, und Relikt-Knoten, Relikt-Jagd und der Foil-Knoten „Jackpot-Relikt“ erscheinen erst ab Akt 2.
- **Prestige-Hinweis:** Der ^-Pfeil im Upgrade-Reiter blinkt, wenn eine neue Prestige-Stufe verfügbar ist; ein Klick wählt sie in der Kapitelwahl aus.
- **Ziffern:** Die Pixelschrift zeigt „2“ und „5“ wie „Z“ und „S“. Ziffern kommen deshalb aus „Jersey 10“.
- **Einheiten-Ast:** Jede Karte hat einen Block mit 4 Knoten (Werte, dann Verhalten), der erst sichtbar wird, wenn die Karte gefunden wurde. Tomes haben je Stärke und Dauer, Knochenruf zusätzlich „Knochensplitter“.
- **Arena:** Oval mit 880 × 470 px Radius um den Turm bei (960, 560), mit Platz für eine schlanke obere Leiste.
- **Shop statt Run-Tasche:** Jeder Angebotsplatz ist pro Tag einmal kaufbar. Mehr Ware gibt es über REROLL (Knoten „Würfelbecher“, kostenlose Rerolls über den Foil-Knoten „Gratis-Würfel“) und mehr Plätze.
- **Kleine Preise:** Holzpack 2, Holzkiste 5, Silberpack 4, Silberkiste 10, Sternenpack 7, Glanzpack 6, Einzelhelden 2–10 Münzen. Kills geben keine Münzen; Bonus-Münzen kommen aus Relikten und Fähigkeiten. Höhere Kapitel geben mehr Mastery.
- **Spiel-Kürzel** auf Packs und Kisten: „PDD“.
- **Quests im Kampf:** Angezeigt werden bis zu drei offene, im Baum sichtbare Quest-Knoten, die im Kapitel Fortschritt machen können.
- **Zahnrad im Kampf** öffnet die Pause. Dort sind auch Tempo (1×/2×), Einstellungen und „Run beenden“.
- **Akt 2:** Der Tor-Knoten ist spielbar (Reset des Skill-Trees mit voller Erstattung, Akt-2-Knoten, Modifikatoren, Riss des Frosts, Relikte). Eigene Akt-2-Kapitel sind als „geplant“ in `acts.json` vermerkt.
- **Neue Helden aus 11.7** (Spiegelgaukler, Glücksfechter) sind noch nicht eingebaut.
- **Balancing:** gemessen mit `tools/simulate.mjs` (menschenähnlicher Bot). Erster Run des Bots ≈ 40–60 s; Boss von Kapitel 1 nach etwa 21–24 Runs; Kapitel 2 schafft der Bot in 40 Tagen nicht. Für Menschen habe ich die Dauer nicht gemessen.
