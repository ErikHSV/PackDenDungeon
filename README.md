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
- **5 Run-Ablauf:** Monsterstrom statt Wellen: erste 15 s ein schwaches Monster alle 1,5 s, bis 0:45 linear auf 0,6 s, danach bis 30 s vor dem Boss auf 0,3 s; Leben = Basis × (1 + 0,02 × Sekunden). Elitegruppen (3–5 aus einer Richtung) alle 45 s mit Warnsymbol am Rand. 30 s vor dem Boss 50 % Ruhe, 5 s vorher roter Rand, Trommel, blinkender Balken. Boss nach 2:30 / 3:00 / 3:30 / 4:00, Intro 2 s in Zeitlupe, Lebensleiste in 5 Abschnitten (je +10 % der Run-Mastery), Phase 2 ab 50 %, Wut ab 3 min Bosskampf. Tempo 2× ab Kapitel 2. Abbruch führt sofort zum Ergebnis, Zahlen zählen 2 s hoch (Klick überspringt).
- **9.6 Akt 2 – Eiserne Garde:** Kapitel 4 (Die Eiserne Marsch), 5 (Festung am Pass), 6 (Thronsaal des Feldherrn) mit eigener Festungs-Arena und den Bossen Kastellan, Bannerherrin und Feldherr Eisenfaust. Gegner: Gardist (Reihen-Formationen 4–8), Schildwall (frontal blockend, Magie geht durch), Armbrustschütze (schießt auf Abstand), Hauptmann (Elite, Banner-Aura +3 Rüstung). Der Riss des Frosts öffnet sich nach Kapitel 6.
- **9.6.2 Relikt-Jagd:** in jedem Akt-2-Kapitel bei der Hälfte der Bosszeit: Truhensymbol am Rand und Hornsignal (3 s), dann läuft ein goldener Schatzträger mit 3–5 Elite-Gardisten quer über das Feld zum gegenüberliegenden Rand (gestrichelte Route). Besiegt man ihn, fällt ein Schatzpack (Widerstand 40) mit einem noch fehlenden Relikt (sonst +3 Schimmer, Shiny-Träger +3 extra). Einmal pro Kapitel und Akt, Anzeige in der Kapitelwahl.
- **4 Jackpot (neu):** drei gleiche Pack-Angebote gleichzeitig (Tagesangebot oder Neu-Würfeln) → goldene Kacheln, „JACKPOT!“, ein Bonus-Pack gratis (+1 je Stufe „Glückssträhne“), mit dem Foil-Knoten „Jackpot-Relikt“ zu 25 % zusätzlich ein Reliktpack. Höchstens einer pro Tag.
- **13.1 Relikte:** Quellen sind Relikt-Jagd, Quest-Knoten (auch mit festem Relikt), Jackpot mit „Jackpot-Relikt“ und Relikt-Knoten. Das Relikt-Jagd-Kapitel ist entfernt. Neu: Hammerrhythmus, Frostklinge, Flinke Sohlen, Funkenlaute, Riesenhelm, Opferdolch.
- **11.7 Startphase:** Beim ersten Öffnen sind nur Turm, „Dicke Mauern I“ und die Quest „Öffne 2 Holzpacks“ sichtbar. Der Stamm des Baums ist die Kette der Münz- und Boss-Quests; die Äste zweigen an diesen Kreuzungen ab. In Kapitel 1 gibt es etwa 15 Knoten für 5–30 Mastery (Turm, Cursor, Stalljunge-Kraft/Training I+II mit zweiter Entwicklung zum Schwertmeister, Kettenschwinger/Schleuderin-Kraft, Dünne Folie I). Helden-Blöcke, Turmschütze und weitere Pack-Knoten erscheinen nach Boss 1 (30–150), Gebäude, Shop-Platz, Neu-Würfeln und Pack im Pack nach Boss 2 (150–1.000). Ab Akt 2 kostet alles ×10. Ein erster Run bringt etwa 7–15 Mastery.
- **Packs:** Jedes Pack enthält eine Einheit; mehr gibt es über „Bonus-Einheit“ (Chance) und „Dicke Packs“ (Akt 2). Holzpack: Stalljunge 60 %, Kettenschwinger 30 %, Schleuderin 9 %, Hagelschauer 1 %. Holzkisten gibt es nach der Quest „Öffne 6 Holzpacks“. Die Karten-Animation läuft nur bei neuen Sammlungseinträgen; bekannte Einheiten stehen sofort auf dem Feld.
- **Skill-Tree hochkant:** senkrechter Stamm über der Turm-Basis, Äste abwechselnd links und rechts, Helden-Blöcke als eigene Zeilen; mit ^/vv blättern.
- **5.9 Mastery:** Kill 1, Elite 5 (Shiny ×3), Pack 2, neue Karte 10, Boss-Abschnitte, Bosssieg, dazu Überlebenszeit und Elitegruppen.
- **10.1 Schimmer verdienen:** einmalig erste Shiny-Karte +2, erstes Shiny je Monsterart +1, erster Shiny-Boss-Sieg +5, Shiny-Erfolge +3 bis +10; wiederholbar Shiny-Boss (Kapitel 1: 1 … Kapitel 4: 4, steht am GESUCHT-Chip), Shiny-Monster +1 mit 25 %, doppelte Shiny-Karte +1 mit 25 %, Reliktpack ohne fehlendes Relikt +3. Im Kampf fliegt ein Regenbogen-Kristall zum Zähler („+1 ◆“), das Ergebnis schlüsselt den Schimmer auf.

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
- **Startgeld und Einkommen:** 3 Münzen zum Start, 3 Tageseinkommen (`balance.wirtschaft`). Nicht ausgegebene Münzen verfallen am Tagesende: jeder Tag beginnt mit genau dem Tageseinkommen, dazu Bonus-Münzen aus Relikten und Fähigkeiten. Einkommen wächst vor allem über Quest-Knoten (+1).
- **Kleine Pools:** Holz- und Silberpack enthalten nicht jede Seltenheit. Wird eine fehlende gewürfelt, kommt die nächstniedrigere.
- **Grenzgänger:** drei eigene Entwürfe (Flackerling, Spiegelsplitter, Leerläufer).
- **Beschwörungen:** Rostgolem und Skelettkrieger sind Einheiten ohne Karte.
- **Kapitel 4:** Dafür habe ich Frostwolf und Eisgeist ergänzt.
- **Keine Kristalle mehr:** Alte Spielstände bekommen ihre Kristalle (×3) und alle gekauften Knoten als Mastery erstattet, weil der Baum neu aufgebaut ist.
- **„Kristalle“ in 7.5** (erstes Shiny gibt Foil-Staub und Kristalle) habe ich als Mastery (blauer Kristall) gelesen.
- **Shop-Plätze:** 3 zum Start, +2 über den Foil-Knoten „Größere Theke“, +1 über „Händlerplatz“ im Skill-Tree.
- **Relikte in Akt 1:** Da RELIKTE erst ab Akt 2 offen ist, geben Akt-1-Quests kein Reliktpack, und Relikt-Knoten, Relikt-Jagd und der Foil-Knoten „Jackpot-Relikt“ erscheinen erst ab Akt 2.
- **Prestige-Hinweis:** Der ^-Pfeil im Upgrade-Reiter blinkt, wenn eine neue Prestige-Stufe verfügbar ist; ein Klick wählt sie in der Kapitelwahl aus.
- **Schimmer-Balancing (10.1):** Damit der erste Schimmer nach etwa einer halben Stunde kommt und es nicht zu viel wird, habe ich die Shiny-Grundchancen gesenkt: Karten 0,7 % statt 2 %, Monster 0,05 % statt 1 % (ein Run hat später mehrere hundert Monster und Dutzende Karten). „Glanzauge“ (+0,25 %) und „Schimmerjagd“ (+0,05 %) sind im gleichen Verhältnis kleiner. Doppelte Shiny-Karten geben +1 nur mit 25 % Chance. Bot: erster Schimmer nach 19–34 min, 18–28 Schimmer nach etwa 90 min.
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
- **Balancing:** gemessen mit `tools/simulate.mjs` (menschenähnlicher Bot, drei Seeds, Gegner greifen zuerst die Helden an, Münzen verfallen täglich). Run 1 ≈ 45–70 s (Eröffnungsniederlage wie im Wiki), Kapitel 1 an Tag 11–19 (≈ 25–57 min, Wiki-Beispiel: nach 16 Versuchen erst 53 s), Kapitel 2 an Tag 26–54, Kapitel 3 an Tag 41–48 (≈ 1,8–2,3 h); erster Schimmer nach 39–56 min. Akt 2 ist nicht ausbalanciert.
- **Bonus-Münzen:** Grenzgänger bringen mit 10 % (Leerläufer 15 %) Chance 1 Bonus-Münze pro Kill, Glückssprung ebenso 10 %; zusammen höchstens 10 pro Run (`balance.wirtschaft.bonusMuenzenMaxProRun`). Sie gelten am nächsten Tag zusätzlich zum Einkommen.
- **Helden-Äste:** Jede Einheit (10 Helden, 3 Grenzgänger, Skelettkrieger) hat einen eigenen Ast am Stamm: Holzpack-Helden am Turm, Silberpack-Helden und Skelettkrieger am Trommler-Knoten, Sternenpack-Helden am Äbtissin-Knoten, Grenzgänger am Monsterjäger-Knoten. Ein Ast erscheint mit der ersten Karte der Einheit. In der Mitte sitzt die Quest der Einheit („Finde N …“, bei Grenzgängern und Skeletten „Besiege N Monster mit …“); sie öffnet den hinteren Teil des Astes und gibt Mastery (Windläufer: +1 Einkommen). Allgemeine Helden-Knoten (Kampfgeist, Zähigkeit, Eile, Schildwall, Meisterschaft, Heldenglück) bilden einen eigenen Ast.
- **Spielstand sichern:** Das Spiel speichert automatisch im Browser. In den Einstellungen gibt es „Als Datei speichern“, „Aus Datei laden“, „Code kopieren“ und „Code einfügen“ (Code beginnt mit `PDD1:`), um den Spielstand zu sichern oder auf ein anderes Gerät mitzunehmen.
- **Gegner greifen zuerst die Einheiten an:** Jeder Gegner sucht sich die nächste Einheit (auch Beschwörungen), läuft zu ihr und kämpft mit ihr; den Turm greift er erst an, wenn keine Einheit mehr lebt. Das gilt auch für Flieger, Fernkämpfer (bleiben auf Schussweite zum nächsten Helden) und Bosse. Ausnahme: Gegner mit `zumTurm` laufen direkt zum Turm (`balance.wellen.zielsuche`).
- **Meuchler (ab Kapitel 5):** Wie im Wiki für Kapitel 5 beschrieben („unsichtbare und schnelle Gegner“): schnell, getarnt (halb durchsichtig), ignoriert Helden und läuft direkt zum Turm. Helden sehen ihn erst im Umkreis von 200 px um den Turm, der Cursor trifft ihn immer.
- **Kampf ohne Info-Fenster:** Beim Zielen auf Gegner erscheint kein Info-Popup; Infos stehen im Bestiarium und in der Sammlung.
- **Nach dem Run:** Das Ergebnis führt immer zu den Upgrades, es gibt kein direktes „Nochmal“.
- **Monsterstärke Akt 1:** Leben-/Schaden-Faktoren der Kapitel 1–3: 0,55/0,75 · 0,45/0,6 · 0,9/0,9. Ein Moorling hält 2–3 Schläge eines Stalljungen aus, mehrere Moorlinge zusammen besiegen ihn schnell (Wiki: „die ersten Squires sterben schnell“). Damit man vor dem ersten Boss weiter stärker werden kann, sind Dicke Mauern III+, Schärfere Klinge III+ sowie Zähigkeit und Flinke Klinge des Stalljungen schon vor Boss 1 kaufbar. Bosse 3.500 / 7.000 / 12.000 Leben. Elitegruppen nutzen je Kapitel einen festen Bodentyp (`eliteGegner`).
- **Jackpot zu Beginn:** Solange es nur Holzpacks gibt, wäre jeder Tag ein Jackpot. Er entsteht deshalb erst, wenn mindestens zwei Angebotsarten möglich sind (`balance.shop.jackpot.minTypen`).
- **Akt-2-Balancing:** Kapitel 4–6 habe ich nur mit einem voll ausgebauten Testspielstand durchgespielt (alle Siege, Relikt-Jagd jeweils geschafft). Wie es sich direkt nach dem Akt-Wechsel anfühlt, ist nicht gemessen.
- **Orientierung an Fan-Wikis (Mechaniken und Zahlen, eigene Namen und eigene Optik):**
  - Shop: Holzpack 2, Holzkiste 5 (3 Packs), Silberkiste 10, Packchancen 60/30/9/1, Pack = +1 Mastery, Rabatt über „Feilschen“ 5 % je Stufe auf −30 %, REROLL, Händlerplatz und Rabatt schon nach Boss 1.
  - Gebäude: Taverne 100 Mastery, alle 20 s, Ausbau kürzerer Takt + Doppel-Aktivierung; Kaserne alle 25 s, −3 s je Stufe, „Effizienz“ +10 % Riesen; Sternwarte alle 30 s, „Effizienz“ (20.000) +10 % Shiny; Prägewerk (20.000 Mastery + 5 Münzen, nach Boss 3) verwandelt alle 40 s ein Pack in ein Kronenpack, −5 s je Stufe.
  - Packs: Kronenpack als vierte Stufe nach Boss 3; Pack im Pack 15 % (Silber → Holz, Sternen/Kronen → darunter).
  - Skill-Tree: Kosten von 5 (erste Mauer) über 10/20/30 (erste Helden-Knoten) bis 75.000 (Bollwerk nach Boss 3). Neu: Pfeilregen (3.500, Cursor-Krit-Kill), Heldenglück (+10 % Krit für alle), Schildwall (Block für alle), Seuchen-Kette des Moorhexers (+20 % Schaden, 75 % langsamer für 1.100, Überspringen, 25 % Skelett), Kettenschwinger mit Blutdurst/Wut/Skelett beim Tod, Skelett-Upgrades, Glückssprung (10 % Münze je Kill, 15.000), Tor-Zähler 1/3 – 3/3.
  - Mastery: höhere Kapitel geben deutlich mehr (`masteryMul` 1 / 5 / 20), Foil-Zinsen 25 % der gesparten Mastery für 10 Schimmer, Rabatt baut sich beim Neu-Würfeln auf (Foil-Knoten).
  - Relikte: erster Zusatzplatz für 1 zerstörtes Relikt, weitere für 2, 3, 4; Relikt „Wegtagebuch“ (+1 Münze je Quest); Jackpot-Reliktpack 25 %. Erfolge für 10/100/1.000 Packs und 10/100 Tomes.
  - Nicht übernommen: Namen, Figuren, Kapitel und Aussehen des Vorbilds; „Gems“, Gold und Sterne; Friedhof, Bibliothek und Riss-Ebenen (eigene Inhalte, die es hier nicht gibt).
- **Shiny-Monster-Chance:** 5.4 nennt 1 %. Ich habe die 0,05 % aus dem Schimmer-Balancing (10.1) beibehalten, weil 1 % bei mehreren hundert Monstern pro Run den Schimmer-Zielwert weit verfehlt. Für Menschen habe ich die Dauer nicht gemessen.
