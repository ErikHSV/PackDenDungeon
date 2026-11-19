# Datenformate

Alle Inhalte stehen in `data/*.json`. Jede Datei hat ein JSON-Schema in `data/schemas/`.
`node tools/validate-data.mjs` prüft Schemas **und** Querverweise, zum Beispiel ob jede Karte in einem Pack-Pool existiert und jeder Knoten im Skill-Tree und im Foil-Baum vom Start aus erreichbar ist.
Die Entwickler-Seite `dev/overview.html` zeigt dieselbe Prüfung im Browser.

| Datei | Inhalt |
|---|---|
| `balance.json` | Zentrale Zahlen: Arena, Turm, Cursor, Run-Ablauf, Karten (Foil, Grenzgänger), Wellen, Belohnungen, Wirtschaft, Shop, Relikte, Akte, Prestige, Gesucht |
| `rarities.json` | Seltenheiten mit Farbe, Rang, Effekten (`geheim` = Grenzgänger) |
| `units.json` | Helden und Beschwörungen |
| `tomes.json` | Zauberbücher |
| `packs.json` | Packs, Kisten, Reliktpacks |
| `shop.json` | Shop-Angebote (Artikel, Grundpreis, Gewicht) und Jackpots |
| `enemies.json` | Gegner und Bosse |
| `chapters.json` | Kapitel: Gegner-Pool, Boss-Zeit, Spawn-Modus, Gefahren |
| `acts.json` | Akte mit Kapitel-Liste und Tor (Verweis auf den Tor-Knoten im Skill-Tree) |
| `modifiers.json` | Kapitel-Modifikatoren |
| `buildings.json` | Gebäude, die Packs aufs Feld werfen |
| `relics.json` | Relikte |
| `achievements.json` | Erfolge |
| `starmap.json` | Skill-Tree mit Upgrade-, Freischalt-, Relikt-, Quest- und Tor-Knoten |
| `foiltree.json` | Foil-Baum (dauerhaft, bezahlt mit Foil-Staub) |

## Gemeinsame Bausteine

**Patch** – ändert einen Wert per Punkt-Pfad. Verwendet für Entwicklungen im Run, Skill-Tree-Knoten von Einheiten und Boss-Phasen:

```json
{ "pfad": "faehigkeiten.sprint.anzahl", "op": "set", "wert": 2 }
```

`op`: `set` (ersetzen), `add` (addieren), `mul` (multiplizieren). Zahlen im Pfad sind Array-Indizes (`angriff.beiTreffer.0.explosionSchaden`).
Bei mehrstufigen Knoten wird der Patch **einmal pro Stufe** angewendet.

**Statuseffekte** (`angriff.beiTreffer`): `verlangsamung`, `betaeubung`, `brennen`, `gift`, `seuche`, `verwundbarkeit`, `rueckstoss`.

## Einheiten (`units.json`)

| Feld | Bedeutung |
|---|---|
| `ki` | `angreifen` (läuft zum nächsten Gegner), `abstand` (Fernkampf, hält Distanz), `bewachen` (Tank, bleibt in Turmnähe), `springen` (sprintet durch Gruppen), `folgen` (Support, bleibt bei Verbündeten) |
| `werte` | `leben`, `schaden`, `angriffsTempo` (Angriffe/s), `reichweite` (px), `lauftempo` (px/s), `schadensTyp` (`physical`/`magic`) |
| `angriff.art` | `nahkampf`, `halbkreis`, `geschoss`, `keiner` |
| `faehigkeiten` | Schlüssel = Fähigkeitstyp: `blocken`, `sprint`, `anfeuern`, `wirbelsturm`, `glocke`, `dimensionssprung`, `riss`, `bonusMuenzen` |
| `entwicklung` | Entwicklung im Run: `bedingung` (`kills`/`blocks`/`treffer`/`ueberlebt` + `anzahl`), neuer `name`, `werteMul`, `volleHeilung`, `patches` |
| `beimTod.beschwoeren` | Einheit, die beim Tod entsteht (z. B. Rostgolem für 10 s) |
| `nurBeschworen` | keine Karte, entsteht nur durch Fähigkeiten oder Tomes |

Jede gezogene Karte wird zu einer eigenen Einheit, Duplikate ergeben also mehrere Einheiten. **Shiny-Karten** (im Code „foil“) bekommen ×2 Leben und ×1,5 Reichweite bzw. Fläche, Shiny-Tomes ×1,5 Dauer und ×1,5 Fläche bzw. Häufigkeit (`balance.karten.foil`). Der Foil-Knoten „Starker Glanz“ verstärkt nur den Bonusanteil.

Einheiten-Fähigkeiten, die Knoten setzen können: `faehigkeiten.killHeilung { anteil, nurEntwickelt }`, `faehigkeiten.blocken.umkreis { radius, dauer }`, `faehigkeiten.blocken.blitzChance`, `angriff.zweitschussChance`, `faehigkeiten.sprint.aufprall { radius, schadenMul }`.

## Packs (`packs.json`)

- `kartenGewichte { kartenId: gewicht }`: feste Chance je Karte (Standard: 3 Einheiten 60/30/9 + 1 Tome 1). Ohne `kartenGewichte` wird nach `seltenheitsGewichte` gezogen (Glanzpack).
- `packImPack { pack, mod }`: beim Öffnen mit der Chance `mods[mod]` zusätzlich dieses Pack (Silber → Holz über „Pack im Pack“, Sternen/Kronen → Pack darunter über „Pack im Pack II“). Kronenpack: nach Boss 3, im Shop und aus dem Prägewerk.

- `kartenProPack` ist 1 (eine Einheit pro Pack). `kartenGewichte` legt feste Ergebnisse fest (Holzpack 60/30/9/1) und ersetzt dann Pool und Seltenheits-Gewichte.
- Modifikator `packTrefferWeniger`: Packs brauchen so viele Cursor-Treffer weniger (mindestens einer).
- Entwicklung: `entwicklung.gesperrt` (erst ein Knoten schaltet sie frei) und `entwicklung.stufe2` (zweite Entwicklung nach weiteren Kills).

- `art: pack`: `widerstand` (Lebenspunkte, die der Cursor abbauen muss), `kartenProPack`, `pool`, `seltenheitsGewichte` (in Prozent).
- `art: kiste`: `inhalt: { pack, anzahl }`. Landet als mehrere Einzelpacks auf dem Feld.
- `art: relikt`: `inhalt: { relikte: 1 }`. Erhältlich über Relikt-Jackpots beim Neu-Würfeln (Foil-Knoten „Jackpot-Relikt“), Quest-Knoten und die Reliktjagd. Wird sofort geöffnet und gibt ein noch fehlendes, zufällig erhältliches Relikt – sind alle gefunden, Foil-Staub (`balance.belohnungen.reliktpackOhneRelikt`).
- `nurFehlende: true` (Glanzpack): zieht gezielt seltene Karten, die noch nicht in der Sammlung sind; `pool` bleibt leer.
- `freischaltung.typ`: `start`, `boss` (mit `kapitel`), `knoten` (Skill-Tree-Knoten, optional zusätzlich `kapitel`), `foilknoten`, `quelle`, `geplant`.
- Fehlt eine gewürfelte Seltenheit im Pool, wird die nächstniedrigere vorhandene genommen (`balance.karten.seltenheitsFallback`).

## Gegner und Bosse (`enemies.json`)

`eigenschaften`: `masteryStehlen`, `explodiertBeimTod`, `frontSchild`, `teiltSichBeimTod`, `verlangsamtHelden`.

`bossFaehigkeiten` (mit Vorwarnung):

| Typ | Interaktion |
|---|---|
| `schockwelle` | Vorwarnung, dann Rückstoß für alle Helden im Radius |
| `schrei` | lädt auf; wird unterbrochen, wenn der Runenkreis den `schwachpunkt` (Medaillon) oft genug trifft |
| `hammerwurf` | Hämmer fliegen `flugzeit` Sekunden; ein Klick im `parierFenster` vor dem Einschlag pariert |
| `einfrieren` | Vorwarnung, dann frieren zufällige Helden ein |
| `beschwoeren` | ruft Gegner herbei |

`phasen`: Ab `lebenUnter` (Anteil) werden Patches angewendet und Gegner beschworen.

- **Gegner-Eigenschaften (neu):** `zumTurm: true` (ignoriert Einheiten, läuft direkt zum Turm), `getarnt: true` (für Helden erst innerhalb `balance.wellen.zielsuche.enttarnRadius` um den Turm sichtbar; der Cursor trifft immer).

## Kapitel (`chapters.json`)

- `masteryMul`: Mastery-Faktor des Kapitels (1 / 5 / 20 in Akt 1, 40–85 in Akt 2), damit die Kosten bis 75.000 erreichbar sind.

`bossNachSekunden`: Zeit bis zum Boss. `spawn.modus`: `ring` (ganzer Arenarand) oder `portale` (feste Winkel in Grad, 0 = rechts, 90 = unten).
`farbwelt`: `thema` (`moor`, `gruft`, `schmiede`, `frost`), `boden` (Bodenfarbe), `turmlicht` (Tor/Fenster des Turms).
`gegner[]`: Gewicht, optional `abSekunde` und `bisSekunde`. `wellen`: Multiplikatoren für Leben und Schaden; `muenzenMul` ist der Mastery-Multiplikator des Kapitels (Name historisch). `gefahren`: z. B. `schneesturm`.

## Skill-Tree (`starmap.json`)

Felder je Knoten: `id`, `name`, `beschreibung`, `typ`, `ast`, `akt`, `position {x,y}`, `verbindungen`, `maxStufe`, `basisKosten`, `kostenFaktor`, `effekt`, optional `voraussetzung`, `symbol`, `abzeichen`, `nurAkt`.

- **Typen (11.2):** `klein`/`gross`/`schluessel` (Upgrade-Knoten), `freischalt` (1 Stufe, schaltet etwas frei), `relikt` (gibt ein festes Relikt mit `nurBaum: true`), `quest` (kostenlos, `aufgabe` + `belohnung`), `tor` (Akt-Wechsel, `effekt: { ziel: "tor", akt }`), `start`.
- **Kosten:** Mastery, `basisKosten × kostenFaktor^Stufe` (Standard 1,45). Frühe Knoten 10–50, mittlere einige Hundert bis Tausende, späte bis 25.000.
- **Sichtbar:** im aktuellen Akt (`akt ≤ Akt`, `nurAkt` = nur in diesem Akt) und ein verbundener Nachbar ist gekauft bzw. abgeschlossen. Knoten mit `voraussetzung.karte` erscheinen erst, wenn die Karte in der Sammlung ist.
- **Quest-Knoten (11.3):** `aufgabe { statistik, filter?, anzahl }` mit `statistik` = `packsGeoeffnet` (`filter.pack`), `kills`, `killsGegner` (`filter.gegner`, optional `filter.kapitel`), `kartenGefunden` (`filter.karte`), `ueberleben` (`filter.kapitel`, `anzahl` in Sekunden, bester Run), `foilMonsterBesiegt`, `bossBesiegt` (`filter.boss`), `tomesGenutzt`. `belohnung`: `tagesEinkommen` (dauerhaft, solange der Knoten abgeschlossen ist), `mastery`, `reliktpack`. Fortschritt (`save.questProgress`) zählt nur, solange die Quest sichtbar ist; Abholen setzt den Knoten auf Stufe 1.
- **Akt-Wechsel (11.5):** Der Tor-Knoten setzt den Skill-Tree mit voller Erstattung zurück und löscht den Quest-Fortschritt. Foil-Baum, Foil-Staub, Sammlung, Bestiarium und Relikte bleiben. BESTIARIUM und RELIKTE öffnen sich erst danach.
- **Darstellung (14.2.5):** Schaltplan mit rechtwinkligen Leitungen. `node tools/layout-starmap.mjs` erzeugt Positionen, Symbole (`card:<id>`, `quest`, `gate`, Relikt-Symbol …) und Abzeichen (`clock`, `sword`, `heart`, `plus`, `arrow`, `bolt`, `star`) neu.
- **Verbindungen:** in **beiden** Knoten eintragen (prüft der Validator).
- **Startphase (11.7):** `abBoss: <Kapitel>` blendet einen Knoten erst nach dem Sieg über diesen Boss ein; `stamm: true` legt ihn auf den senkrechten Stamm (Münz-/Boss-Quests). Kosten werden ab Akt 2 mit `balance.skilltree.aktKostenMul` multipliziert.

## Foil-Baum (`foiltree.json`)

Gleiches Knotenformat, Positionen von Hand. Bezahlt mit Foil-Staub (`basisKosten × 1,6^Stufe`), wird nie zurückgesetzt, sichtbar ab dem ersten Foil-Staub. Knoten mit `akt` erscheinen erst ab diesem Akt.

**Effekt-Ziele** (`effekt.ziel`):

| Ziel | Wirkung pro Stufe |
|---|---|
| `cursorSchaden`, `cursorRadiusMul`, `cursorTickMul`, `cursorPackSchadenMul`, `cursorKrit` | Runenkreis |
| `tagesEinkommen`, `shopPlaetze`, `freieRerolls`, `masteryMul`, `masteryNeueKarte`, `jackpotChance`, `rabattChance` | Wirtschaft |
| `packWiderstandMul`, `kartenProPack`, `bonusKarteChance`, `packImPack`, `grenzgaengerChance` | Packs |
| `foilChance`, `foilStaerkeMul`, `foilMonsterChance`, `reliktPlaetze`, `zinsen`, `aktStartMastery`, `gesuchtStaub`, `rerollRabatt` (Rabatt-Chance je Neu-Würfeln am selben Tag) | Foil-Baum |
| `heldenKrit` (doppelter Schaden), `heldenBlock` (Blockchance aller Helden), `packImPack2` (Sternen-/Kronenpack → Pack darunter) | Skill-Tree (Wiki-Ausbau) |
| `heldenSchadenMul`, `heldenLebenMul`, `heldenTempoMul` | alle Helden |
| `turmLebenMul`, `turmRegen`, `turmSchuetze`, `turmDornen` | Turm |
| `tomeWirkungMul`, `tomeDauerMul`, `tomeDoppeltChance`, `tomeZweimalChance` | Tomes |
| `tome` (+ `tome`, `art`: `wirkung`/`dauer`, `betrag`) | einzelnes Tome |
| `relikt` (+ `relikt`) | Relikt-Knoten |
| `gebaeude` (+ `gebaeude: id`) | Stufe 1 baut das Gebäude, weitere Stufen bauen es aus |
| `einheit` (+ `karte`, `patches`) | Spezialisierung einer Einheit |
| `flag` (+ `flag`) | `glutkreis`, `zwillingsrune`, `aufplatzen`, `blitzableiter`, `bollwerk`, `knochenExplosion`, `neuWuerfeln`, `kisteHolz`, `kisteSilber`, `einzelkarten`; Foil-Baum: `paarAngebot`, `trioAngebot`, `glanzpack`, `jackpotRelikt`, `reliktReparatur` |

`rechenart`: `addieren` (Wert × Stufe) oder `multiplizieren` (Wert^Stufe).

- **Helden-Äste:** Knoten eines Einheiten-Astes tragen `heldAst: "<einheit>"` und `voraussetzung.karte`. Quest-Statistik `killsEinheit` mit `filter.einheit` zählt Kills einer Einheit (auch `skelettkrieger`). `werte.krit` einer Einheit erhöht ihre Krit-Chance (doppelter Schaden) zusätzlich zu `heldenKrit`.
- **Weitere Knotenfelder:** `muenzKosten` (zusätzliche Münzen bei der ersten Stufe, z. B. Prägewerk), `torBosse` am Tor-Knoten (Kapitel, deren Bosse der Tor-Zähler 1/3 – 3/3 zählt), `effekt.ziel: "einheit"` darf auch Einheiten ohne Karte patchen (z. B. `skelettkrieger`).
- **Klone (Spiegelgaukler):** `faehigkeiten.klone { anzahl, dauer, lebenAnteil, explosion? { radius, schadenMul } }` – beim Erscheinen aus einem Pack entstehen Spiegelbilder (Beschwörungen); ihre Kills zählen doppelt für die Mastery. `faehigkeiten.eliteKrit` erhöht die Krit-Chance gegen Elite-Monster und Bosse.
- **Helden-Fähigkeiten aus dem Baum:** `faehigkeiten.wut { tempoMax }` (schneller bei wenig Leben), `todSkelett { chance, dauer }`, `killMuenze { chance }`, `killHeilung { anteil }`; Seuche (`beiTreffer` typ `seuche`) mit `verwundbar`, `lahm`, `springt`, `skelettChance`.

## Weitere Dateien

- **Modifikatoren:** `effekte[]` mit `ziel`, `op`, `wert`, dazu `belohnung.masteryMul`.
- **Gebäude:** `pack`, optional `kiste`, `position.winkel` am Arenarand, `stufen[]` mit `intervall`, `kistenChance`, optional `doppelChance` (Doppel-Aktivierung), `riesenChance` und `foilBonus` (relativer Aufschlag auf die Shiny-Chance, 0.1 = +10 %). `umwandeln: "<packId>"` (Prägewerk) verwandelt statt zu werfen ein liegendes, ungeöffnetes Pack in dieses Pack. Skill-Tree-Knoten mit `effekt: { ziel: "gebaeudeBonus", gebaeude, feld, wert }` addieren `riesenChance`, `foilBonus`, `doppelChance` oder `intervall` (Sekunden weniger) zu einem Gebäude.
- **Relikte:** `ausloeser` (`passiv`, `runStart`, `packGeoeffnet`, `heldGestorben`, `kill`, `turmGetroffen`, `tomeGenutzt`, `bossErscheint`) und `aktion` (u. a. `kettenblitz`, `skelett`, `spawnBetaeubung`). `nurBaum: true` = nur über Relikt-Knoten.
- **Relikte, verflucht:** `verflucht: true` plus `nachteil` (Text); `aktion.typ: werte` setzt mehrere Modifikatoren (Vorteil und Nachteil). Zerstörte Relikte schalten Plätze frei: `balance.relikte.zerstoerenSchwellen` (kumuliert, Standard 1/3/6/10). Aktion `questMuenzen { wert }`: Münzen je abgeschlossener Quest.
- **Erfolge:** `ziel { statistik, filter?, anzahl }` ohne Belohnung, mit `kategorie`. `anzahl: "alle"` zählt bis zur Gesamtzahl (z. B. alle Karten).
- **Akte:** `kapitel[]`, `sonder[]` (z. B. Reliktjagd), `tor` mit `knoten` (Tor-Knoten im Skill-Tree) und `warnung` (Text der Bestätigung).

## Run-Ablauf (Abschnitt 5, `balance.wellen`)

- `strom`: Spawn-Abstand `oeffnungIntervall` bis `oeffnungBis`, linear auf `aufbauIntervall` bis `aufbauBis`, linear auf `minIntervall` bis Bosszeit − `vorBossSekunden`; danach Rate × `vorBossRate`, im Bosskampf × `bossRate`. In der Öffnungsphase nur das erste Monster des Kapitels.
- `lebenProSekunde`, `schadenProSekunde`: Monster werden mit der Run-Zeit stärker (Leben = Basis × (1 + Wert × Sekunden)).
- `elite`: `ersteBei`, `alleSekunden`, `gruppe [min, max]`, `warnung` (Sekunden Warnsymbol am Rand), `lebenMul`, `schadenMul`.
- `boss`: `warnungSekunden`, `introSekunden`/`introTempo`, `spawnRand`, `abschnitte`/`abschnittBonus` (Mastery je Abschnitt als Anteil der Run-Mastery), `wutAbSekunden`/`wutAlleSekunden`/`wutSchadenPlus`.
- Bosszeit steht je Kapitel in `bossNachSekunden` (150, 180, 210, 240 …). `run.zweifachAbKapitel` schaltet Tempo 2× frei.

## Akt 2 und Relikt-Jagd (9.6)

- Gegner: `formation [min, max]` (Trupp in Reihen, gleiches Tempo), `fraktion`, `eigenschaften.fernkampf { reichweite, intervall, schaden }`, `eigenschaften.aura { radius, ruestung }`, `eigenschaften.schatztraeger`. `frontSchild` blockt keine Magie.
- Kapitel: `eliteGegner` (führt Elitegruppen an), `reliktJagd { beiAnteil, traeger, eskorte, eskorteAnzahl, ankuendigung }`. Erfolgreiche Jagden stehen in `save.stats.reliktJagden["<Akt>:<Kapitel>"]`.
- `packs.json`: `art: "schatz"` (Schatzpack, fällt vom Schatzträger, öffnet ein Relikt).
- Relikt-Aktionen: `cursorRhythmus`, `cursorFrost`, `seltenheit { gewichte, flag }` (Seltenheits-Gewichte beim Ziehen), außerdem Modifikatoren `heldenLaufMul`, `turmVerfallProSekunde`.
- Jackpot: `balance.shop.jackpot { bonusAnzahl, reliktChance, minTypen }`, Zustand in `save.shop.jackpot`.

## Währungen und Wirtschaft (Abschnitt 10)

- Genau drei Währungen: **Münzen** (`save.coins` + `save.bonusCoins`, nur Shop), **Mastery** (`save.mastery`, Skill-Tree), **Foil-Staub** (`save.foilDust`, Anzeige „Schimmer“, Foil-Baum).
- Ein Run ist ein **Tag**: danach wird das Tageseinkommen gutgeschrieben (`balance.wirtschaft.tagesEinkommen` + Knoten + abgeschlossene Quest-Knoten), Relikt-Einkommen und Münzen aus Fähigkeiten als Bonus-Münzen. Kills geben keine Münzen.
- **Shop:** `balance.shop.angebotsPlaetzeStart` (3) bis `Max` Plätze. Jeder Platz ist einmal kaufbar, ein zweiter Klick macht den Kauf rückgängig, RESET erstattet alle Käufe des Tages. Jackpots nur beim Neu-Würfeln (`balance.shop.jackpot.chance`). `balance.shop.paar`, `glanzpack`, `shinyEinzelkarte` steuern Paar/Trio, Glanzpack und Shiny-Einzelkarten.
- **Münzanzeige „x+b/B“:** x = Münzen, b = Bonus-Münzen (werden zuerst ausgegeben), B = Tageseinkommen.
- **Mastery:** `masteryProSekunde`, `masteryProKill` (Shiny-Monster zählen ×3), `masteryProElitewelle`, `masteryProBoss`, `masteryProPack`, `masteryNeueKarte`, multipliziert mit dem Kapitel-Multiplikator; dazu erste Shinys (`erstesShiny`) und Quest-Belohnungen.
- **Foil-Staub (10.1):** einmalig erste Shiny-Karte (`erstesShiny.foilStaubKarte`), erstes Shiny je Monsterart (`erstesShiny.foilStaubMonster`), erster Shiny-Boss-Sieg (`gesucht.erstsiegSchimmer`), Erfolge mit `belohnung.foilStaub`; wiederholbar Shiny-Boss (`kapitel.gesuchtSchimmer` + Foil-Knoten), Shiny-Monster (`wellen.foilMonster.schimmerChance`), doppelte Shiny-Karte (`belohnungen.doppelteShinyKarte`), Reliktpack ohne fehlendes Relikt. Das Ergebnis listet die Quellen einzeln auf.
