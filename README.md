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
- **7.5 Shiny:** 0,7 % je Karte, 0,05 % je Monster (siehe Schimmer-Balancing), Bosse nur über „Gesucht“ (×3 Leben, ×1,75 Schaden, Zusatzangriff „Prisma-Salve“). Shiny-Held: doppeltes Leben, +50 % Schaden, +50 % Reichweite/Fläche. Shiny-Tome: +50 % Wirkung, Dauer und Fläche/Häufigkeit. Shiny-Monster sind deutlich zäher: ×5 Leben, ×1,5 Schaden, +1 Rüstung, 30 % größer, kaum zurückzustoßen; dafür ×5 Mastery (Schimmer nur für das erste Shiny jeder Art). Das Wiki nennt keinen festen Faktor („kein belegter Foil-Lebensmultiplikator“), nur „stärkere“ Foil-Bosse. Optik: wandernder Glanzstreifen, Glitzer, Regenbogenblitz, Zeitlupe, eigene Präsentation „SHINY!“, Regenbogenränder in Shop, Sammlung, Bestiarium.
- **11 Skill-Tree:** Upgrade-, Freischalt-, Relikt-, Quest- und Tor-Knoten. Quests gibt es nur noch als Knoten (Fortschritt zählt nur, solange sie sichtbar sind). Der Tor-Knoten am Ende des Akt-Asts startet Akt 2 und setzt den Baum zurück.
- **11.6 Foil-Baum (wie im Original):** 9 dauerhafte Knoten – Günstiger Reroll, Shop-Platz, Shop-Rabatte, Rabatt beim Würfeln, Doppel- und Dreier-Angebot, Mastery-Zinsen (25 % für 10 Schimmer), Relikt-Platz, Relikt-Wiederherstellung. Umschaltbar über den Regenbogen-Kristall, mit Regenbogen-Wisch, -Leitungen und -Rahmen. Jackpot-Relikt und Glanzpack sind jetzt Skill-Tree-Knoten; die übrigen früheren Foil-Knoten (Glanzauge, Schimmerjagd, Starker Glanz, Gesucht-Belohnung, Schneller Neubeginn) gibt es im Original nicht – alte Spielstände bekommen den Schimmer zurück (Spielstand v8).
- **11.7 Startset:** u. a. Würfelbecher, Händlerplatz, Sammlerfreude, Bonuskarte, Packreißer, Sturmspitze, Bollwerk (Schild mit Schockwelle, 25.000 Mastery), Helden-Blöcke mit Verhaltens-Knoten (z. B. Schildstoß, Zwillingsglut, Aufprall) und vier Baum-Relikte (Funkennadel, Knochenecho, Selbstschuss-Balliste, Portalsiegel).
- **BESTIARIUM und RELIKTE** schalten sich erst mit dem ersten Akt-Wechsel frei.
- **5 Run-Ablauf:** Monsterstrom statt Wellen: erste 15 s ein schwaches Monster alle 1,5 s, bis 0:45 linear auf 0,6 s, danach bis 30 s vor dem Boss auf 0,3 s; Leben = Basis × (1 + 0,02 × Sekunden). Elitegruppen (3–5 aus einer Richtung) alle 45 s mit Warnsymbol am Rand. 30 s vor dem Boss 50 % Ruhe, 5 s vorher roter Rand, Trommel, blinkender Balken. Boss nach 2:30 / 3:00 / 3:30 / 4:00, Intro 2 s in Zeitlupe, Lebensleiste in 5 Abschnitten (je +10 % der Run-Mastery), Phase 2 ab 50 %, Wut ab 3 min Bosskampf. Tempo 2× ab Kapitel 2. Abbruch führt sofort zum Ergebnis, Zahlen zählen 2 s hoch (Klick überspringt).
- **9.6 Akt 2 – Eiserne Garde:** Kapitel 4 (Die Eiserne Marsch), 5 (Festung am Pass), 6 (Thronsaal des Feldherrn) mit eigener Festungs-Arena und den Bossen Kastellan, Bannerherrin und Feldherr Eisenfaust. Gegner: Gardist (Reihen-Formationen 4–8), Schildwall (frontal blockend, Magie geht durch), Armbrustschütze (schießt auf Abstand), Hauptmann (Elite, Banner-Aura +3 Rüstung). Der Riss des Frosts öffnet sich nach Kapitel 6.
- **9.6.2 Relikt-Jagd:** in jedem Akt-2-Kapitel bei der Hälfte der Bosszeit: Truhensymbol am Rand und Hornsignal (3 s), dann läuft ein goldener Schatzträger mit 3–5 Elite-Gardisten quer über das Feld zum gegenüberliegenden Rand (gestrichelte Route). Besiegt man ihn, fällt ein Schatzpack (Widerstand 40) mit einem noch fehlenden Relikt (sonst +3 Schimmer, Shiny-Träger +3 extra). Einmal pro Kapitel und Akt, Anzeige in der Kapitelwahl.
- **4 Jackpot (neu):** drei gleiche Pack-Angebote gleichzeitig (Tagesangebot oder Neu-Würfeln) → goldene Kacheln, „JACKPOT!“, ein Bonus-Pack gratis (+1 je Stufe „Glückssträhne“), mit dem Foil-Knoten „Jackpot-Relikt“ zu 25 % zusätzlich ein Reliktpack. Höchstens einer pro Tag.
- **13.1 Relikte:** Quellen sind Relikt-Jagd, Quest-Knoten (auch mit festem Relikt), Jackpot mit „Jackpot-Relikt“ und Relikt-Knoten. Das Relikt-Jagd-Kapitel ist entfernt. Neu: Hammerrhythmus, Frostklinge, Flinke Sohlen, Funkenlaute, Riesenhelm, Opferdolch.
- **11.7 Startphase:** Beim ersten Öffnen sind nur Turm, „Dicke Mauern I“ und die Quest „Öffne 2 Holzpacks“ sichtbar. Der Stamm des Baums ist die Kette der Münz- und Boss-Quests; die Äste zweigen an diesen Kreuzungen ab. In Kapitel 1 gibt es etwa 15 Knoten für 5–30 Mastery (Turm, Cursor, Stalljunge-Kraft/Training I+II mit zweiter Entwicklung zum Schwertmeister, Kettenschwinger/Schleuderin-Kraft, Dünne Folie I). Helden-Blöcke, Turmschütze und weitere Pack-Knoten erscheinen nach Boss 1 (30–150), Gebäude, Shop-Platz, Neu-Würfeln und Pack im Pack nach Boss 2 (150–1.000). Ab Akt 2 kostet alles ×10. Ein erster Run bringt etwa 7–15 Mastery.
- **Packs:** Jedes Pack enthält eine Einheit; mehr gibt es über „Bonus-Einheit“ (Chance) und „Dicke Packs“ (Akt 2). Beide gelten nur für das Pack ihrer Stufe (Bonus-Einheit: Holz I/II, Silber I/II, Sternen, Kronen; Dicke Holz-/Silber-/Sternen-/Kronenpacks) – ein neu freigeschaltetes Pack startet ohne Bonus (Spielstand v13 erstattet die alten Stufen III–V). Holzpack: Stalljunge 60 %, Kettenschwinger 30 %, Schleuderin 9 %, Hagelschauer 1 %. Holzkisten gibt es nach der Quest „Öffne 6 Holzpacks“. Die Karten-Animation läuft nur bei neuen Sammlungseinträgen; bekannte Einheiten stehen sofort auf dem Feld.
- **Skill-Tree hochkant:** senkrechter Stamm über der Turm-Basis, Äste abwechselnd links und rechts, Helden-Blöcke als eigene Zeilen; mit ^/vv blättern.
- **5.9 Mastery:** Kill 1, Elite 5 (Shiny ×3), Pack 2, neue Karte 10, Boss-Abschnitte, Bosssieg, dazu Überlebenszeit und Elitegruppen.
- **10.1 Schimmer verdienen (wie im Original):** Hauptquelle sind Foil-Bosse („Gesucht“): pro Sieg der Kapitelwert (Kapitel 1: 1 … Kapitel 4: 4, wie im Wiki), der erste Sieg je Boss zusätzlich +8. Dazu einmalig das erste Shiny jeder Karte (+3) und jeder Monsterart (+2). Erfolge, weitere Shiny-Monster und doppelte Shiny-Karten geben keinen Schimmer mehr. Bot: 8–14 Schimmer nach ≈ 135 min (er spielt nur jeden 4. Tag einen Gesucht-Boss).
- **Mastery für die Sammlung:** neue Karte (Held oder Tome) +25, neue Monsterart im Bestiarium +10, erstes Shiny einer Karte +50, einer Monsterart +25 (Wiki: Mastery gibt es auch fürs Entdecken von Sammlungseinträgen). Im Kampf als „+N Mastery · Sammlung“ bzw. „· Neu im Bestiarium“ angezeigt.

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
- **Einkommen über Quests (wie im Original):** Das Tageseinkommen wächst fast nur über Quests im Skill-Tree – Stufe 1 (Holz/Silber, Kapitel 1–2) je +1, Stufe 2 (Sternen/Kronen, Kapitel 3) je +2, der Schmied +3. Quellen: Stamm-Quests, „Packs öffnen“ (6/40 Silber, 6/30 Sternen, 5/15 Kronen), Monsterarten (30 Krähen, 20 Knochenritter, 20 Schildträger) und je Held die Finde-Quest und die erste Kill-Quest. Preise wie im Original: Holz 2, Silber 4, Sternen 7, Kronen 10 (Kisten 5/10). In der Simulation steigt das Einkommen bis Kapitel 3 auf 16–37 Münzen pro Tag (vorher höchstens 12).
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
- **Balancing:** gemessen mit `tools/simulate.mjs` (menschenähnlicher Bot, drei Seeds; Gesucht erst ab Akt 2). Kapitel 1 an Tag 8–9 (≈ 20–22 min), Kapitel 2 an Tag 15–19 (≈ 45–57 min), Kapitel 3 an Tag 37–40 (≈ 1,9–2,1 h). Akt 2 beginnt wieder bei 3–4 Einkommen, weil der Baum samt Quests zurückgesetzt wird. Turm 200 Leben, Elitegegner 70 % Schaden, Kapitel-Faktoren 0,45/0,65 · 0,55/0,6 · 0,7/0,7. `TRACE=<Tag>` und `TURMLOG=1` zeigen Run-Verlauf und Turmschaden je Gegnerart. Akt 2 ist nicht ausbalanciert.
- **Bonus-Münzen:** Grenzgänger bringen mit 10 % (Leerläufer 15 %) Chance 1 Bonus-Münze pro Kill, Glückssprung ebenso 10 %; zusammen höchstens 10 pro Run (`balance.wirtschaft.bonusMuenzenMaxProRun`). Sie gelten am nächsten Tag zusätzlich zum Einkommen.
- **Skill-Tree nach dem Original (v12):** Fokus auf die Truppen – jede Einheit hat ihren eigenen Ast mit Quest. Globale Effekte sitzen wie im Original in den Helden-Ästen: Schildwall (Block für alle) bei der Torwächterin, Heldenglück (+10 % Krit für alle) und Pfeilregen (Krit-Kill, 3.500 Mastery) beim Glücksfechter. Cursor nur noch 6 Knoten (Klinge I/II/III+, Flinke Hand, Weiter Griff, Glückshieb), Turm nur noch Dicke Mauern I/II/III+ und Bollwerk. Die Taverne gibt es schon in Kapitel 1 (nach der Quest „Holzhändler“, 100 Mastery). Alte Spielstände bekommen die Mastery für entfernte Knoten zurück (Spielstand v7, Hinweis beim Start).
- **Packs: 3 Einheiten + 1 Zauber:** Jedes Pack hat feste Chancen 60/30/9/1 – Holzpack: Stalljunge, Kettenschwinger, Schleuderin, Hagelschauer; Silberpack: Torwächterin, Windläufer, Glutweberin, Knochenruf; Sternenpack: Bannerträger, Moorhexer, Wolkenhirtin, Blutrausch; Kronenpack: Glücksfechter, Spiegelgaukler, Glockenmönch, Zeitbruch. Die übrigen Tomes (Seelenkrug, Riesenwuchs) gibt es im Bücherpack (Shop, ab Boss 4 – nach jedem Boss kommt genau ein neues Pack: Boss 1 Silber, Boss 2 Sternen, Boss 3 Kronen, Boss 4 Bücher), dort auch alle anderen Tomes. Die Shop-Info zeigt die Chance jeder Karte.
- **Neue Helden aus 11.7:** Glücksfechter (Duellant, springt alle 4 s, 10 % Krit; Ast: Glückssträhne 10 % Münze je Kill, Elitejäger +Krit gegen Elite/Bosse) und Spiegelgaukler (erscheint mit einem Spiegelbild, dessen Kills doppelte Mastery geben; Ast: zusätzliches Spiegelbild, längere Dauer, Splitterspiegel-Explosion). Der Windläufer-Knoten „Glückssprung“ ist jetzt „Sturmlauf“ (längere, stärkere Sprints); die Münzen pro Kill gehören zum Glücksfechter.
- **Tempo:** Knöpfe 1× / 1,5× / 2× oben rechts im Kampf; 2× ab Kapitel 2 (5.10). Die Wahl bleibt gespeichert.
- **Quests abholen:** Erfüllte Quests werden beim Klick auf „Weiter zu den Upgrades“ automatisch abgeholt und im Skill-Tree nacheinander mit Popup gezeigt. +Tageseinkommen gilt sofort für den laufenden Tag. Das Ergebnis zeigt keine Quest-Hinweise mehr.
- **Helden-Äste (v14):** Jede Einheit (13 Helden, 3 Grenzgänger, Skelettkrieger) hat einen eigenen Ast am Stamm: Holzpack-Helden am Turm, Silberpack-Helden und Skelettkrieger am Trommler-Knoten, Sternenpack-Helden und Glockenmönch am Äbtissin-Knoten, Kronenpack-Helden am Schmied, Grenzgänger am Monsterjäger-Knoten. Ein Ast erscheint erst, wenn man die Einheit regulär bekommt (Karte gefunden und ihr Pack freigeschaltet; Grenzgänger und Skelette nur Fund). Jeder Ast hat drei Quests: „Finde N …“ (Mastery), „Besiege N Monster mit …“ (+1 Tageseinkommen) und eine große Kill-Quest (viel Mastery) vor dem Meister-Knoten. Dazwischen liegen Fähigkeiten und deren Verbesserungen statt Werte-Ketten – z. B. Stalljunge: Breitschwert (Flächenschlag) → Wirbelklinge, Parade (Ausweichen), Meisterschwert (Hinrichtung); Schleuderin: Kerbstein (verwundbar), Kopftreffer, Bleikugel (Betäubung); Torwächterin: Stachelschild (Dornen), Letzte Bastion; Bannerträger: Kriegsbanner (Schadensaura) → Siegesbanner, Sammelpunkt (Heilaura); Wolkenhirtin: Eisregen, Gewitter (Kettenblitz). Reine Werte gibt es je Held nur gebündelt in ein bis zwei Knoten (z. B. „Drill“: +30 % Leben und +20 % Tempo).
- **Spielstand sichern:** Das Spiel speichert automatisch im Browser. In den Einstellungen gibt es „Als Datei speichern“, „Aus Datei laden“, „Code kopieren“ und „Code einfügen“ (Code beginnt mit `PDD1:`), um den Spielstand zu sichern oder auf ein anderes Gerät mitzunehmen.
- **Weniger, aber stärkere Gegner:** halber Monster-Strom (Spawn-Intervalle verdoppelt), Elitegruppen 2–3; dafür haben alle Nicht-Boss-Monster doppeltes Leben und 80 % mehr Schaden (`balance.wellen.staerke`). Ausgleich: doppelte Mastery pro Kill, doppelte Shiny-Monster-Chance, Kill-Quests halbiert.
- **Graue Vorschau im Skill-Tree:** Gesperrte Knoten, die an einen sichtbaren grenzen, werden grau mit Schloss angezeigt (Infofenster: was noch fehlt). Äste noch nicht gefundener Helden bleiben verborgen.
- **Turmleben wie im Original kurz:** nur noch Turmleben I und II (je +30 %, 5 und 30 Mastery) plus Bollwerk; der Cursor-Ast hängt direkt am Turm. Alte Spielstände bekommen Turmleben III–V erstattet (Spielstand v11).
- **Keine Mehrfachstufen, gleiche Upgrades gebündelt:** Jeder Skill-Tree- und Schimmer-Baum-Knoten wird genau einmal gekauft. Frühere Ketten gleicher Upgrades (Cursor-Schaden I–V, Kampfgeist I–III, Gebäude-Ausbau I–III …) sind jetzt je ein Knoten mit der Wirkung von bis zu drei Stufen; ein Gebäude-Ausbau bringt alle Stufen auf einmal (z. B. Taverne 40 → 28 s). Der Baum hat 256 Knoten, davon 67 Quests. Alte Spielstände bekommen die Mastery entfernter Knoten zurück (Spielstand v14).
- **Schimmer-Baum neben dem Skill-Tree:** Beide Bäume liegen im Upgrade-Reiter auf einer Fläche; der Schimmer-Baum steht in einem Regenbogen-Feld rechts neben dem Skill-Tree auf Höhe der Basis. Der Regenbogen-Knopf springt dorthin und zurück. „Günstiger Reroll“ schaltet den REROLL-Knopf auch ohne Skill-Tree-Knoten frei (bleibt nach Akt-Wechseln erhalten).
- **Kapitelablauf:** In Akt 1 gibt es keine Kapitelwahl – es läuft immer das erste noch nicht geschaffte Kapitel (nach Kapitel 1 kommt automatisch 2 usw.). Ab Akt 2 ist die Kapitelwahl frei; ein bereits geschafftes Kapitel ist automatisch der Schimmer-Boss (Gesucht) – wie im Wiki: „Chapter select lets you replay a cleared chapter. The boss comes back as a foil.“
- **Gebäude am Turm, langsamerer Takt:** Taverne, Kaserne, Sternwarte, Prägewerk und Bibliothek stehen direkt am Turm. Weil unsere Runs länger dauern als im Original (Kapitel 1: Boss nach 150 s, Wiki-Beispiel: 53 s überlebt), laufen die Gebäude etwa halb so schnell wie die Wiki-Werte: Taverne 40 s, Kaserne 50 s, Sternwarte 60 s, Prägewerk 60 s, Bibliothek 120 s (Bücherpack, Akt 2). Taverne: „Flinker Wirt“ (Takt) und „Effizienz“ (Doppel-Aktivierung) getrennt wie im Wiki.
- **Turm und Cursor wie im Wiki:** Turm nur „Turmleben“ (10 Stufen) und Bollwerk; Cursor nur Schaden, Tempo, Radius und Krit (je mehrstufig). Alte Stufen werden erstattet (Spielstand v9).
- **Kisten:** Eine Kiste (Holz- oder Silberkiste, aus dem Shop oder von Gebäuden) landet als eigenes Objekt und muss erst aufgebrochen werden (Holzkiste 12, Silberkiste 30 Widerstand – etwas mehr als ein Pack); dann springen die drei Packs heraus und müssen einzeln geöffnet werden (Wiki: „eine Box muss im Kampf erst geöffnet werden“). Skill-Tree: „Brecheisen“ (Kisten −2 Treffer je Stufe, Startphase) und „Volle Kiste“ (+20 % Chance je Stufe auf ein Pack mehr, nach Boss 1). „Dünne Folie“ wirkt auf Packs und Kisten.
- **Zielwahl:** Helden verteidigen einen Wachbereich um den Turm (450 px, Wächter wie die Torwächterin 320 px): darin greifen sie den nächstgelegenen Gegner an und bleiben bei ihm, bis er tot ist – kein Umschwenken. Außerhalb jagen sie nicht (Ausnahme: Gegner, die sie selbst angreifen); läuft ihr Ziel weit hinaus, lassen sie es los. Ohne Ziel kehren sie an ihren Platz am Turm zurück. Helden wählen nur Ziele, die sie verletzen können (Schild nicht zugewandt usw.). Gegner wählen das nächstgelegene Ziel – nächste Einheit oder Turm – und bleiben dabei; wer einer Einheit in den Weg läuft, kämpft mit ihr. Meuchler (`zumTurm`) laufen immer zum Turm.
- **Shop nach Stufe:** Angebote der aktuell höchsten freigeschalteten Pack-Stufe kommen dreimal so oft, ältere Stufen seltener (`balance.shop.stufenGewichte`); jeden Tag ist mindestens ein Pack der aktuellen Stufe dabei (am Anfang ein Holzpack). Beispiel nach Boss 2: Sternenpack 42 % der Angebote.
- **Irrlicht:** nicht mehr immun, sondern nimmt halben physischen Schaden (`physResistenz` 0,5); Magie und Cursor wirken voll.
- **Schleuderin:** Seltenheit Episch (lila).
- **Meuchler (ab Kapitel 5):** Wie im Wiki für Kapitel 5 beschrieben („unsichtbare und schnelle Gegner“): schnell, getarnt (halb durchsichtig), ignoriert Helden und läuft direkt zum Turm. Helden sehen ihn erst im Umkreis von 200 px um den Turm, der Cursor trifft ihn immer.
- **Kampf ohne Info-Fenster:** Beim Zielen auf Gegner erscheint kein Info-Popup; Infos stehen im Bestiarium und in der Sammlung.
- **Nach dem Run:** Das Ergebnis führt immer zu den Upgrades, es gibt kein direktes „Nochmal“.
- **Monsterstärke Akt 1:** Leben-/Schaden-Faktoren der Kapitel 1–3: 0,45/0,65 · 0,4/0,55 · 0,8/0,8 (Turm 150 Leben). Ein Moorling hält 2–3 Schläge eines Stalljungen aus, mehrere Moorlinge zusammen besiegen ihn schnell (Wiki: „die ersten Squires sterben schnell“). Damit man vor dem ersten Boss weiter stärker werden kann, sind Dicke Mauern III+, Schärfere Klinge III+ sowie Zähigkeit und Flinke Klinge des Stalljungen schon vor Boss 1 kaufbar. Bosse 3.500 / 7.000 / 12.000 Leben. Elitegruppen nutzen je Kapitel einen festen Bodentyp (`eliteGegner`).
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
