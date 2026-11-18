# PackDenDungeon

Ein Incremental-Tower-Defense-Spiel mit Booster-Pack-Mechanik. Du reißt Packs auf, hoffst auf seltene Helden und verteidigst mit ihnen deinen Turm gegen immer größere Monsterhorden. Jeder verlorene Run macht dich über den Mastery-Baum dauerhaft stärker.

Alle Inhalte (Namen, Helden, Gegner, Texte) sind eigene Erfindungen. Die Grafik besteht vorerst aus Platzhaltern (farbige Formen und Text).

> Der erste Prototyp **Pack Legends** liegt unverändert in [`pack-legends/`](pack-legends/).

## Starten

Das Spiel lädt seine Inhalte aus JSON-Dateien und muss deshalb über einen Webserver laufen:

```bash
python3 -m http.server 8080
```

Dann <http://localhost:8080> öffnen. Alternativ `npx serve .` oder GitHub Pages (Branch `main`, Ordner `/`).

- **Bedienung:** Maus und Touch. Am PC zusätzlich: `1`–`3` kauft Packs, `Leertaste` pausiert, `S` ändert das Tempo, `Enter` schließt die Pack-Öffnung.
- **Debug-Werkzeuge:** in den Einstellungen einschalten oder `?debug` an die URL hängen. Dann gibt es Gold, Welle überspringen, direkt zum Boss, Mastery-Punkte und alle Kapitel freischalten.

## Projektstruktur

```
index.html            Alle Bildschirme und Overlays
css/style.css         Gestaltung (responsiv, Mobile + Desktop)
data/                 ALLE Inhalte und Zahlen, siehe unten
  balance.json        Zentrale Balancing-Datei
  heroes.json         Helden
  spells.json         Zauber-Karten
  enemies.json        Gegner und Bosse
  packs.json          Booster-Packs (Pool und Ziehwahrscheinlichkeiten)
  chapters.json       Kapitel, Wellen-Zusammensetzung, Bosse
  mastery.json        Mastery-Baum (3 Äste)
  rarities.json       Seltenheiten (Farbe, Verkaufswert)
  schemas/            JSON-Schemas für alle Datenformate
src/
  core/               Spiellogik ohne DOM (läuft auch in Node)
    run.js            Ein Run: Gold, Packs, Team, Wellen, Hauptschleife
    heroes.js         Angriffsarten, Zielwahl, Helden-Fähigkeiten
    enemies.js        Bewegung, Blockade, Gegner-Angriffe, Boss-Fähigkeiten
    spells.js         Zaubereffekte und automatisches Auslösen
    combat.js         Schaden, Rüstung/Magieresistenz, Statuseffekte
    cards.js          Ziehen, Preise, Sterne-System
    waves.js          Wellen-Erzeugung und Skalierung
    mastery.js        Mastery-Kosten und -Modifikatoren
    data.js           Indizes und Querverweis-Prüfung
  render/renderer.js  Canvas-Zeichnung (Platzhalter-Grafik)
  ui/                 Bildschirme, Kampf-HUD, Pack-Overlay, Karten
  audio.js            Sound-Platzhalter (Web Audio)
  save.js             Speichern in localStorage
  main.js             Einstiegspunkt
tools/
  validate-data.mjs   Prüft Pflichtfelder und Querverweise
  simulate.mjs        Bot spielt Runs headless (Balancing)
pack-legends/         Erster Prototyp
```

## Neue Inhalte hinzufügen

Für neue Inhalte musst du nur die JSON-Dateien ändern. Danach `node tools/validate-data.mjs` ausführen.

| Was | Wo | Hinweis |
|---|---|---|
| Held | `data/heroes.json` | Angriffsart (`melee`, `projectile`, `arc`, `chain`, `leap`, `none`), Zielpriorität (`nearest`, `weakest`, `elite`, `air`), Fähigkeiten, `star3`-Verstärkung. Danach in einen Pack-Pool aufnehmen. |
| Zauber | `data/spells.json` | Effekt-Typ, Auto-Bedingungen, `scale`-Pfade für die Sterne-Skalierung |
| Gegner | `data/enemies.json` | `traits` (`stealGold`, `explodeOnDeath`, `splitOnDeath`, `frontalShield`), Bosse mit `bossAbilities` und `phases` |
| Pack | `data/packs.json` | Eigener Pool und eigene Seltenheits-Gewichte |
| Kapitel | `data/chapters.json` | Gegner-Pool mit `fromWave` und `toWave`, Boss, Schwierigkeits-Multiplikatoren |
| Mastery | `data/mastery.json` | `stat`-Effekte (Modifikator pro Stufe) oder `spec`-Effekte (Daten-Patches für eine Karte) |

**Patches** verändern Werte über einen Punkt-Pfad, zum Beispiel `{ "path": "abilities.block.count", "op": "add", "value": 2 }`. Mögliche `op`-Werte sind `set`, `add` und `mul`. So funktionieren die 3-Sterne-Verstärkungen, die Mastery-Spezialisierungen und die Bossphasen.

**Komplett neue Mechaniken** wie eine neue Fähigkeit oder ein neuer Zaubertyp brauchen einen kleinen Eintrag im Code:

- Helden-Fähigkeiten: `ABILITIES` in `src/core/heroes.js`
- Angriffsarten: `ATTACKS` in derselben Datei
- Boss-Fähigkeiten: `BOSS_ABILITIES` in `src/core/enemies.js`
- Zaubereffekte: `SPELL_EFFECTS` in `src/core/spells.js`

## Balancing

Alle globalen Zahlen stehen in `data/balance.json`, die Kapitelwerte in `data/chapters.json`.

- Gegner-Leben: Basis × Kapitel-`hpMult` × `hpGrowth`^(Welle−1), Standard 1,13
- Anzahl pro Welle: `countBase` + `countPerWave` × (Welle−1)
- Gold pro Kill wächst mit `goldGrowth` (1,03) langsamer als das Gegner-Leben
- Sterne: Schwellen 2 / 6 / 14 / 30 Duplikate. Werte × (1 + 0,6 × (Sterne − 1)), ab 3★ verstärkte Fähigkeit
- Mastery-Kosten: `baseCost` × `costGrowth`^Stufe

Simulation:

```bash
node tools/simulate.mjs 15 1            # 15 Runs mit Mastery-Progression
node tools/simulate.mjs 12 1 --first    # nur "erste Runs" ohne Mastery
node tools/simulate.mjs 5 1 --chapter=2 # bestimmtes Kapitel
```

## Getroffene Annahmen

- **Technik:** HTML5 + JavaScript (Canvas) ohne Build-Schritt, Zielplattform PC und Mobile im Browser.
- **Titel:** Arbeitstitel ist der Repo-Name „PackDenDungeon“. Er lässt sich in `balance.json` (`gameTitle`) ändern.
- **Kein freier Slot:** Ein neuer Held, der keinen Platz findet, wird in Gold umgewandelt. Das passiert auch mit Duplikaten eines Helden, der schon 5 Sterne hat.
- **Erstes Pack eines Runs** enthält garantiert einen angreifenden Helden. So endet kein Run an einem Pech-Start (`firstPackGuaranteesAttacker`).
- **„Nächstes Ziel“** bedeutet: der Gegner, der dem Turm am nächsten ist.
- **Gefallene Helden** stehen nach 12 s mit 50 % Leben wieder auf.
- **Zauber** wachsen leicht mit der Welle (`spells.waveScaling`), damit sie spät nicht nutzlos werden. Mehr Sterne verkürzen ihre Aufladezeit.
- **Bosse** werden durch Betäubung und Verlangsamung nur halb so stark beeinflusst. Rückstoß wirkt auf sie kaum.
- **Welle rufen:** Wer die nächste Welle früher ruft, bekommt etwas Bonusgold.

## Stand und nächste Schritte

Alle 9 Entwicklungsphasen sind in einer ersten Fassung umgesetzt. Das Balancing ist bisher nur per Bot-Simulation geprüft: Der Bot erreicht im ersten Run etwa Welle 11–14 und schafft den ersten Boss nach rund 8 Runs. Echte Playtests werden die Werte noch verschieben. Kapitel 3 und 4 sind am wenigsten getestet.
