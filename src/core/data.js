// Spieldaten: Dateiliste, Aufbereitung (Nachschlage-Tabellen) und Querverweis-Prüfung.
// Wird im Browser (src/main.js, src/dev/dataOverview.js) und in Node (tools/*.mjs) verwendet.

/** Alle Datendateien unter data/ (ohne Endung). Neue Dateien hier eintragen. */
export const DATA_FILES = [
  'balance', 'rarities', 'units', 'tomes', 'packs', 'shop', 'enemies',
  'chapters', 'acts', 'modifiers', 'buildings', 'relics', 'achievements', 'starmap', 'foiltree',
];

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

/** Baut Indizes über die Rohdaten. */
export function prepareData(raw) {
  const data = { ...raw };
  data.unitIndex = byId(raw.units);
  data.tomeIndex = byId(raw.tomes);
  data.packIndex = byId(raw.packs);
  data.offerIndex = byId(raw.shop.angebote);
  data.enemyIndex = byId(raw.enemies);
  data.chapterIndex = byId(raw.chapters);
  data.modifierIndex = byId(raw.modifiers);
  data.buildingIndex = byId(raw.buildings);
  data.relicIndex = byId(raw.relics);
  data.actIndex = byId(raw.acts);
  data.achievementIndex = byId(raw.achievements);
  data.starIndex = byId(raw.starmap.knoten);
  data.branchIndex = byId(raw.starmap.aeste);
  data.foilIndex = byId(raw.foiltree.knoten);

  // Karten = ziehbare Einheiten + Tomes (Beschwörungen sind keine Karten)
  data.cardIndex = {};
  for (const u of raw.units) if (!u.nurBeschworen) data.cardIndex[u.id] = { art: 'einheit', def: u };
  for (const t of raw.tomes) data.cardIndex[t.id] = { art: 'tome', def: t };
  const rank = (id) => raw.rarities[data.cardIndex[id].def.rarity].rang;
  data.allCards = Object.keys(data.cardIndex).sort((a, b) => rank(a) - rank(b));
  return data;
}

/** Prüft alle Verweise zwischen den Dateien. Gibt eine Liste von Fehlermeldungen zurück (leer = ok). */
export function validateReferences(data) {
  const e = [];
  const rarities = Object.keys(data.rarities);
  const isCard = (id) => !!data.cardIndex[id];

  // Eindeutige IDs über Einheiten und Tomes
  const seen = new Set();
  for (const id of [...data.units, ...data.tomes].map((x) => x.id)) {
    if (seen.has(id)) e.push(`Doppelte ID: ${id}`);
    seen.add(id);
  }
  for (const c of [...data.units, ...data.tomes, ...data.relics]) {
    if (!rarities.includes(c.rarity)) e.push(`${c.id}: unbekannte Seltenheit ${c.rarity}`);
  }

  // Einheiten
  for (const u of data.units) {
    const sum = u.beimTod?.beschwoeren?.einheit;
    if (sum && !data.unitIndex[sum]) e.push(`Einheit ${u.id}: beimTod beschwört unbekannte Einheit ${sum}`);
  }
  // Tomes
  for (const t of data.tomes) {
    if (t.effekt.typ === 'beschwoeren' && !data.unitIndex[t.effekt.einheit]) e.push(`Tome ${t.id}: unbekannte Einheit ${t.effekt.einheit}`);
  }
  // Packs
  for (const p of data.packs) {
    if (p.art === 'pack') {
      if (!p.pool?.length && !p.nurFehlende) e.push(`Pack ${p.id}: leerer Pool`);
      for (const id of p.pool || []) if (!isCard(id)) e.push(`Pack ${p.id}: Pool enthält unbekannte Karte ${id}`);
      for (const r of Object.keys(p.seltenheitsGewichte || {})) if (!rarities.includes(r)) e.push(`Pack ${p.id}: unbekannte Seltenheit ${r}`);
      if (!(p.widerstand > 0)) e.push(`Pack ${p.id}: Widerstand fehlt`);
    }
    if (p.art === 'kiste' && !data.packIndex[p.inhalt?.pack]) e.push(`Kiste ${p.id}: unbekanntes Pack ${p.inhalt?.pack}`);
    if (p.freischaltung.typ === 'boss' && !data.chapterIndex[p.freischaltung.kapitel]) e.push(`Pack ${p.id}: Freischaltung durch unbekanntes Kapitel`);
  }
  // Shop
  for (const a of data.shop.angebote) if (!data.packIndex[a.artikel]) e.push(`Shop ${a.id}: unbekannter Artikel ${a.artikel}`);
  // Akte und Tor
  for (const a of data.acts) {
    for (const k of [...a.kapitel, ...(a.sonder || [])]) if (!data.chapterIndex[k]) e.push(`Akt ${a.id}: unbekanntes Kapitel ${k}`);
    if (a.tor?.knoten && !data.starIndex[a.tor.knoten]) e.push(`Akt ${a.id}: unbekannter Tor-Knoten ${a.tor.knoten}`);
  }
  for (const k of data.chapters) if (!data.acts.some((a) => a.id === k.akt)) e.push(`Kapitel ${k.id}: unbekannter Akt ${k.akt}`);
  // Tomes, die beim Freisetzen Einheiten erzeugen
  for (const t of data.tomes) if (t.effekt.einheit && !data.unitIndex[t.effekt.einheit]) e.push(`Tome ${t.id}: unbekannte Einheit ${t.effekt.einheit}`);
  // Gegner
  for (const g of data.enemies) {
    const split = g.eigenschaften?.teiltSichBeimTod?.in;
    if (split && !data.enemyIndex[split]) e.push(`Gegner ${g.id}: teilt sich in unbekannten Gegner ${split}`);
    const sum = g.bossFaehigkeiten?.beschwoeren?.gegner;
    if (sum && !data.enemyIndex[sum]) e.push(`Boss ${g.id}: beschwört unbekannten Gegner ${sum}`);
    for (const ph of g.phasen || []) for (const s of ph.beschwoeren || []) if (!data.enemyIndex[s.gegner]) e.push(`Boss ${g.id}: Phase beschwört unbekannten Gegner ${s.gegner}`);
  }
  // Kapitel
  for (const k of data.chapters) {
    for (const g of k.gegner) if (!data.enemyIndex[g.id]) e.push(`Kapitel ${k.id}: unbekannter Gegner ${g.id}`);
    if (!data.enemyIndex[k.boss]?.boss) e.push(`Kapitel ${k.id}: Boss ${k.boss} fehlt oder ist kein Boss`);
    if (k.spawn.modus === 'portale' && !k.spawn.portale?.length) e.push(`Kapitel ${k.id}: Portal-Modus ohne Portale`);
  }
  // Gebäude
  for (const b of data.buildings) {
    if (!data.packIndex[b.pack]) e.push(`Gebäude ${b.id}: unbekanntes Pack ${b.pack}`);
    if (b.kiste && !data.packIndex[b.kiste]) e.push(`Gebäude ${b.id}: unbekannte Kiste ${b.kiste}`);
  }
  // Skill-Tree und Foil-Baum
  const checkTree = (label, tree, index, extra) => {
    if (!index[tree.start]) e.push(`${label}: Startknoten fehlt`);
    for (const n of tree.knoten) {
      for (const v of n.verbindungen) {
        if (!index[v]) e.push(`${label} ${n.id}: Verbindung zu unbekanntem Knoten ${v}`);
        else if (!index[v].verbindungen.includes(n.id)) e.push(`${label} ${n.id} ↔ ${v}: Verbindung nicht beidseitig`);
      }
      extra?.(n);
    }
    const reach = new Set([tree.start]);
    const queue = [tree.start];
    while (queue.length) for (const v of index[queue.shift()]?.verbindungen || []) if (!reach.has(v)) { reach.add(v); queue.push(v); }
    for (const n of tree.knoten) if (!reach.has(n.id)) e.push(`${label} ${n.id}: vom Start aus nicht erreichbar`);
  };
  const branches = data.starmap.aeste.map((b) => b.id);
  checkTree('Skill-Tree', data.starmap, data.starIndex, (n) => {
    if (!branches.includes(n.ast)) e.push(`Skill-Tree ${n.id}: unbekannter Ast ${n.ast}`);
    const ef = n.effekt;
    if (ef.ziel === 'einheit' && !isCard(ef.karte) && !(data.units || []).some((u) => u.id === ef.karte)) e.push(`Skill-Tree ${n.id}: unbekannte Einheit ${ef.karte}`);
    if (n.voraussetzung?.karte && !isCard(n.voraussetzung.karte)) e.push(`Skill-Tree ${n.id}: unbekannte Karte`);
    if (ef.ziel === 'tome' && !data.tomeIndex[ef.tome]) e.push(`Skill-Tree ${n.id}: unbekanntes Tome ${ef.tome}`);
    if (ef.ziel === 'gebaeude' && !data.buildingIndex[ef.gebaeude]) e.push(`Skill-Tree ${n.id}: unbekanntes Gebäude ${ef.gebaeude}`);
    if (ef.ziel === 'relikt' && !data.relicIndex[ef.relikt]?.nurBaum) e.push(`Skill-Tree ${n.id}: Relikt ${ef.relikt} fehlt oder ist nicht als nurBaum markiert`);
    if (n.typ === 'quest') {
      const f = n.aufgabe?.filter || {};
      if (!n.aufgabe || !n.belohnung) e.push(`Quest-Knoten ${n.id}: aufgabe/belohnung fehlt`);
      if (f.pack && !data.packIndex[f.pack]) e.push(`Quest-Knoten ${n.id}: unbekanntes Pack ${f.pack}`);
      if (f.boss && !data.enemyIndex[f.boss]) e.push(`Quest-Knoten ${n.id}: unbekannter Boss ${f.boss}`);
      if (f.gegner && !data.enemyIndex[f.gegner]) e.push(`Quest-Knoten ${n.id}: unbekannter Gegner ${f.gegner}`);
      if (f.kapitel && !data.chapterIndex[f.kapitel]) e.push(`Quest-Knoten ${n.id}: unbekanntes Kapitel ${f.kapitel}`);
      if (f.karte && !isCard(f.karte)) e.push(`Quest-Knoten ${n.id}: unbekannte Karte ${f.karte}`);
    }
  });
  checkTree('Foil-Baum', data.foiltree, data.foilIndex);
  if (data.balance.shop.neuWuerfeln.freischaltKnoten && !data.starIndex[data.balance.shop.neuWuerfeln.freischaltKnoten]) {
    e.push('balance.shop.neuWuerfeln.freischaltKnoten verweist auf unbekannten Knoten');
  }
  for (const p of data.packs) {
    const f = p.freischaltung;
    if (f.typ === 'knoten' && !data.starIndex[f.knoten]) e.push(`Pack ${p.id}: Freischaltung durch unbekannten Knoten ${f.knoten}`);
    if (f.typ === 'foilknoten' && !data.foilIndex[f.knoten]) e.push(`Pack ${p.id}: Freischaltung durch unbekannten Foil-Knoten ${f.knoten}`);
  }
  if (data.shop.glanzpack && !data.packIndex[data.shop.glanzpack.artikel]) e.push('shop.glanzpack: unbekannter Artikel');
  return e;
}

/** Kurze Statistik für Übersichten. */
export function dataSummary(data) {
  const heroes = data.units.filter((u) => !u.nurBeschworen);
  return {
    einheiten: heroes.length,
    tomes: data.tomes.length,
    karten: data.allCards.length,
    packs: data.packs.length,
    gegner: data.enemies.filter((g) => !g.boss).length,
    bosse: data.enemies.filter((g) => g.boss).length,
    kapitel: data.chapters.length,
    modifikatoren: data.modifiers.length,
    gebaeude: data.buildings.length,
    relikte: data.relics.length,
    erfolge: data.achievements.length,
    akte: data.acts.length,
    quests: data.starmap.knoten.filter((n) => n.typ === 'quest').length,
    foilKnoten: data.foiltree.knoten.length,
    knoten: data.starmap.knoten.length,
    knotenStufen: data.starmap.knoten.reduce((s, n) => s + n.maxStufe, 0),
    knotenStufenAkt1: data.starmap.knoten.filter((n) => (n.akt ?? 1) === 1).reduce((s, n) => s + n.maxStufe, 0),
  };
}
