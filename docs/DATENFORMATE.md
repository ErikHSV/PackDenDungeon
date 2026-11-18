# Datenformate

Alle Inhalte stehen in `data/*.json`. Jede Datei hat ein JSON-Schema in `data/schemas/`.
`node tools/validate-data.mjs` prüft Schemas **und** Querverweise, zum Beispiel ob jede Karte in einem Pack-Pool existiert und jeder Sternenkarten-Knoten vom Start aus erreichbar ist.
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
| `acts.json` | Akte mit Kapitel-Liste und dem Alten Tor (Schlüsselsteine) |
| `modifiers.json` | Kapitel-Modifikatoren |
| `buildings.json` | Gebäude, die Packs aufs Feld werfen |
| `relics.json` | Relikte |
| `quests.json` | Quests |
| `achievements.json` | Erfolge |
| `starmap.json` | Sternenkarte (Skill-Tree) |

## Gemeinsame Bausteine

**Patch** – ändert einen Wert per Punkt-Pfad. Verwendet für Entwicklungen im Run, Sternenkarten-Knoten von Einheiten und Boss-Phasen:

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

Jede gezogene Karte wird zu einer eigenen Einheit, Duplikate ergeben also mehrere Einheiten. **Foil-Karten** bekommen ×2 Leben und ×1,5 Reichweite bzw. Fläche (`balance.karten.foil`).

## Packs (`packs.json`)

- `art: pack`: `widerstand` (Lebenspunkte, die der Cursor abbauen muss), `kartenProPack`, `pool`, `seltenheitsGewichte` (in Prozent).
- `art: kiste`: `inhalt: { pack, anzahl }`. Landet als mehrere Einzelpacks auf dem Feld.
- `art: relikt`: `inhalt: { relikte: 1 }`. Erhältlich über Jackpots im Shop, Quests und die Reliktjagd. Wird sofort geöffnet und bevorzugt ein noch fehlendes Relikt.
- `freischaltung.typ`: `start`, `boss` (mit `kapitel`), `quest`, `sternenkarte`.
- Fehlt eine gewürfelte Seltenheit im Pool, wird die nächstniedrigere vorhandene genommen (`balance.karten.seltenheitsFallback`).

## Gegner und Bosse (`enemies.json`)

`eigenschaften`: `muenzenStehlen`, `explodiertBeimTod`, `frontSchild`, `teiltSichBeimTod`, `verlangsamtHelden`.

`bossFaehigkeiten` (mit Vorwarnung):

| Typ | Interaktion |
|---|---|
| `schockwelle` | Vorwarnung, dann Rückstoß für alle Helden im Radius |
| `schrei` | lädt auf; wird unterbrochen, wenn der Runenkreis den `schwachpunkt` (Medaillon) oft genug trifft |
| `hammerwurf` | Hämmer fliegen `flugzeit` Sekunden; ein Klick im `parierFenster` vor dem Einschlag pariert |
| `einfrieren` | Vorwarnung, dann frieren zufällige Helden ein |
| `beschwoeren` | ruft Gegner herbei |

`phasen`: Ab `lebenUnter` (Anteil) werden Patches angewendet und Gegner beschworen.

## Kapitel (`chapters.json`)

`bossNachSekunden`: Zeit bis zum Boss. `spawn.modus`: `ring` (ganzer Arenarand) oder `portale` (feste Winkel in Grad, 0 = rechts, 90 = unten).
`gegner[]`: Gewicht, optional `abSekunde` und `bisSekunde`. `wellen`: Multiplikatoren für Leben, Münzen und Schaden. `gefahren`: z. B. `schneesturm`.

## Sternenkarte (`starmap.json`)

Felder je Knoten (laut Spezifikation): `id`, `name`, `beschreibung`, `typ`, `ast`, `position {x,y}`, `verbindungen`, `maxStufe`, `basisKosten`, `kostenFaktor`, `kristallKosten`, `effekt`, optional `voraussetzung` und `symbol`.

- **Typen:** `klein` (Kreis, mehrere Stufen), `gross` (Sechseck), `schluessel` (Stern, Mastery-Punkte + Kristalle), `freischalt` (Schloss), `start`.
- **Kosten:** `basisKosten × kostenFaktor^Stufe` in `waehrung` (`mastery` oder `foilstaub` für Ast H), plus `kristallKosten`.
- **Akt:** Knoten mit `akt: 2` erscheinen erst nach dem Öffnen des Tors. Beim Durchschreiten wird die Karte mit voller Rückerstattung zurückgesetzt (`balance.akte.sternenkarteResetBeiAktwechsel`).
- **Kaufbar:** wenn ein verbundener Nachbar mindestens Stufe 1 hat. Bei `voraussetzung.karte` muss diese Karte zusätzlich schon gefunden sein.
- **Verbindungen:** in **beiden** Knoten eintragen (prüft der Validator).

**Effekt-Ziele** (`effekt.ziel`):

| Ziel | Wirkung pro Stufe |
|---|---|
| `cursorSchaden`, `cursorRadiusMul`, `cursorTickMul`, `cursorPackSchadenMul`, `cursorKrit` | Runenkreis |
| `tagesEinkommen`, `muenzenMul`, `shopPlaetze`, `taschenPlaetze`, `masteryMul`, `jackpotChance` | Wirtschaft |
| `packWiderstandMul`, `foilChance`, `kartenProPack`, `packImPack`, `grenzgaengerChance` | Packs |
| `foilStaerkeMul`, `foilMonsterChance` | Foil (Ast H) |
| `heldenSchadenMul`, `heldenLebenMul`, `heldenTempoMul` | alle Helden |
| `turmLebenMul`, `turmRegen`, `turmSchuetze`, `turmDornen` | Turm |
| `tomeWirkungMul`, `tomeDoppeltChance`, `tomeZweimalChance` | Tomes |
| `gebaeude` (+ `gebaeude: id`) | Stufe 1 baut das Gebäude, weitere Stufen bauen es aus |
| `einheit` (+ `karte`, `patches`) | Spezialisierung einer Einheit |
| `flag` (+ `flag`) | Schlüsselfähigkeit: `glutkreis`, `zwillingsrune`, `aufplatzen`, `blitzableiter`, `neuWuerfeln` |

`rechenart`: `addieren` (Wert × Stufe) oder `multiplizieren` (Wert^Stufe).

## Weitere Dateien

- **Modifikatoren:** `effekte[]` mit `ziel`, `op`, `wert`, dazu `belohnung.masteryMul`.
- **Gebäude:** `pack`, optional `kiste`, `position.winkel` am Arenarand, `stufen[]` mit `intervall` und `kistenChance`.
- **Relikte:** `ausloeser` (`passiv`, `runStart`, `packGeoeffnet`, `heldGestorben`, `kill`, `turmGetroffen`, `tomeGenutzt`, `bossErscheint`) und `aktion`.
- **Quests:** `ziel.statistik` (z. B. `packsGeoeffnet`, `foilsGezogen`, `kills`, `bossBesiegt`), optional `filter`, dazu `anzahl` und `belohnung` (`tagesEinkommen`, `kristalle`, `reliktpack`).
- **Relikte, verflucht:** `verflucht: true` plus `nachteil` (Text); `aktion.typ: werte` setzt mehrere Modifikatoren (Vorteil und Nachteil). Zerstörte Relikte geben einen weiteren Platz (`balance.relikte`).
- **Erfolge:** wie Quests, aber ohne Belohnung und mit `kategorie`. `anzahl: "alle"` zählt bis zur Gesamtzahl (z. B. alle Karten).
- **Akte:** `kapitel[]`, `sonder[]` (z. B. Reliktjagd), `tor` mit `schluesselsteine[]` (je Kapitel-Boss einer) und `warnung`.

## Wirtschaft (Kurzüberblick)

- Ein Run ist ein **Tag**: danach werden Münzen und Tageseinkommen gutgeschrieben, der Shop würfelt neu.
- Münzen pro Kill: `gegner.muenzen × balance.belohnungen.muenzenProKill × Kapitel-Münzmultiplikator`. Nachkommastellen werden zufällig gerundet.
- Die Run-Tasche fasst `balance.shop.taschenPlaetze` Artikel (eine Kiste zählt als einer), erweiterbar über die Sternenkarte.
- Preise steigen pro erreichtem Kapitel um `balance.wirtschaft.preisWachstumProKapitel`.
- Mastery: `masteryProSekunde`, `masteryProKill`, `masteryProElitewelle`, `masteryProBoss`, multipliziert mit dem Münzmultiplikator des Kapitels.
