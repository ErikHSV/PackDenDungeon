// Datenübersicht (Phase 1): lädt alle Datendateien, prüft sie (Schema + Verweise) und zeigt sie als Tabellen.
import { DATA_FILES, prepareData, validateReferences, dataSummary } from '../core/data.js';
import { validateSchema } from '../core/schema.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SCHEMA_FILES = ['common', ...DATA_FILES];

async function load() {
  const fetchJson = async (p) => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
  const raw = Object.fromEntries(await Promise.all(DATA_FILES.map(async (f) => [f, await fetchJson(`../data/${f}.json`)])));
  const schemas = Object.fromEntries(await Promise.all(SCHEMA_FILES.map(async (f) => [`${f}.schema.json`, await fetchJson(`../data/schemas/${f}.schema.json`)])));
  return { raw, schemas };
}

function section(id, title, html, note = '') {
  $('#toc').insertAdjacentHTML('beforeend', `<a href="#${id}">${esc(title)}</a>`);
  $('#out').insertAdjacentHTML('beforeend', `<section id="${id}"><h2>${esc(title)}</h2>${note ? `<p class="note">${note}</p>` : ''}<div class="wrap">${html}</div></section>`);
}

function table(head, rows) {
  return `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
}

function render(data) {
  const R = data.rarities;
  const rar = (id) => `<span class="rar" style="background:${R[id]?.farbe}">${esc(R[id]?.name ?? id)}</span>`;
  const sw = (c) => `<span class="swatch" style="background:${c}"></span>`;
  const name = (id) => esc(data.cardIndex[id]?.def.name ?? data.unitIndex[id]?.name ?? data.enemyIndex[id]?.name ?? data.packIndex[id]?.name ?? id);

  // Einheiten
  section('einheiten', 'Einheiten', table(
    ['Name', 'Seltenheit', 'Rolle / KI', 'Leben', 'Schaden', 'Tempo', 'Reichweite', 'Fähigkeit', 'Entwicklung im Run / beim Tod', 'In Packs'],
    data.units.map((u) => [
      `${sw(u.farbe)}<b>${esc(u.name)}</b>${u.nurBeschworen ? ' <span class="muted">(Beschwörung)</span>' : ''}`,
      rar(u.rarity), `${esc(u.rolle)}<br><span class="muted">${esc(u.ki)}</span>`,
      u.werte.leben, `${u.werte.schaden} <span class="muted">${u.werte.schadensTyp === 'magic' ? 'mag.' : 'phys.'}</span>`,
      u.werte.angriffsTempo, u.werte.reichweite, esc(u.beschreibung),
      esc(u.entwicklung ? `${u.entwicklung.name}: ${u.entwicklung.text}` : u.beimTod?.text ?? '–'),
      data.packs.filter((p) => p.pool?.includes(u.id)).map((p) => esc(p.name)).join(', ') || '–',
    ])), 'Grenzgänger sind eine geheime Seltenheit: Sie werden nicht über die Pack-Gewichte gezogen, sondern über eine eigene, mit der Spielzeit steigende Chance (balance.karten.grenzgaenger).');

  section('tomes', 'Tomes (Zauberbücher)', table(['Name', 'Seltenheit', 'Wirkung', 'Effekt-Typ'],
    data.tomes.map((t) => [`${sw(t.farbe)}<b>${esc(t.name)}</b>`, rar(t.rarity), esc(t.beschreibung), esc(t.effekt.typ)])));

  // Packs + Shop
  section('packs', 'Packs und Kisten', table(['Name', 'Art', 'Freischaltung', 'Widerstand', 'Karten', 'Pool', 'Seltenheits-Gewichte'],
    data.packs.map((p) => [
      `${sw(p.farbe)}<b>${esc(p.name)}</b>`, esc(p.art),
      esc(p.freischaltung.typ === 'boss' ? `nach Boss Kapitel ${p.freischaltung.kapitel}` : p.freischaltung.knoten ? `${p.freischaltung.typ === 'foilknoten' ? 'Foil-Knoten' : 'Knoten'} ${p.freischaltung.knoten}` : p.freischaltung.typ),
      p.widerstand ?? (p.inhalt?.pack ? `${p.inhalt.anzahl} × ${name(p.inhalt.pack)}` : '–'),
      p.kartenProPack ?? (p.inhalt?.relikte ? `${p.inhalt.relikte} Relikt` : '–'),
      p.nurFehlende ? 'seltene, noch fehlende Karten' : (p.pool || []).map(name).join(', ') || '–',
      Object.entries(p.seltenheitsGewichte || {}).map(([r, w]) => `${rar(r)} ${w} %`).join(' ') || '–',
    ])));
  const pw = data.balance.wirtschaft.preisWachstumProKapitel;
  section('shop', 'Shop-Angebote', table(['Angebot', 'Artikel', 'Gewicht', 'Preis Kap. 1', 'Kap. 2', 'Kap. 3', 'Kap. 4'],
    data.shop.angebote.map((a) => [esc(a.id), `${a.anzahl} × ${name(a.artikel)}`, a.gewicht,
      ...[1, 2, 3, 4].map((k) => Math.round(a.grundPreis * Math.pow(1 + pw, k - 1)))])),
    `Startplätze: ${data.balance.shop.angebotsPlaetzeStart}, maximal ${data.balance.shop.angebotsPlaetzeMax}. „Neu würfeln“ kostet ${data.balance.shop.neuWuerfeln.grundKosten} Münzen (×${data.balance.shop.neuWuerfeln.wachstum} pro Nutzung).`);

  // Gegner + Kapitel
  section('gegner', 'Gegner und Bosse', table(['Name', 'Leben', 'Tempo', 'Rüstung / MR', 'Besonderheiten', 'Größe'],
    data.enemies.map((g) => [
      `${sw(g.farbe)}<b>${esc(g.name)}</b>${g.boss ? ' <span class="rar" style="background:#E04848">Boss</span>' : ''}`,
      g.leben, g.tempo, `${g.ruestung} / ${Math.round(g.magieResistenz * 100)} %`,
      esc([g.fliegt && 'fliegt', g.immun.length && `immun: ${g.immun.join(', ')}`, ...Object.keys(g.eigenschaften), ...Object.keys(g.bossFaehigkeiten || {})].filter(Boolean).join(', ')) + `<br><span class="muted">${esc(g.beschreibung)}</span>`,
      `${g.groesse} px`,
    ])));
  section('kapitel', 'Kapitel', table(['#', 'Name', 'Boss nach', 'Spawn', 'Gegner (ab Sekunde)', 'Boss', 'Gefahren', 'Boden'],
    data.chapters.map((k) => [k.id, `<b>${esc(k.name)}</b><br><span class="muted">${esc(k.intro)}</span>`, `${k.bossNachSekunden} s`,
      k.spawn.modus === 'ring' ? 'ganzer Rand' : `${k.spawn.portale.length} Portale`,
      k.gegner.map((g) => `${name(g.id)}${g.abSekunde ? ` (ab ${g.abSekunde} s)` : ''}`).join(', '),
      name(k.boss), esc(k.gefahren.map((g) => g.text).join(' ') || '–'), Object.values(k.boden).map(sw).join('')])));

  // Meta
  section('modifikatoren', 'Kapitel-Modifikatoren', table(['Name', 'Wirkung', 'Mastery'],
    data.modifiers.map((m) => [`<b>${esc(m.name)}</b>`, esc(m.beschreibung), `×${m.belohnung.masteryMul}`])));
  section('gebaeude', 'Gebäude', table(['Name', 'Pack', 'Intervalle je Stufe', 'Kisten-Chance je Stufe'],
    data.buildings.map((b) => [`${sw(b.farbe)}<b>${esc(b.name)}</b>`, name(b.pack), b.stufen.map((s) => `${s.intervall} s`).join(' → '), b.stufen.map((s) => `${Math.round(s.kistenChance * 100)} %`).join(' → ')])));
  section('relikte', 'Relikte', table(['Name', 'Seltenheit', 'Auslöser', 'Wirkung'],
    data.relics.map((r) => [`<b>${esc(r.name)}</b>`, rar(r.rarity), esc(r.ausloeser), esc(r.beschreibung)])));
  section('quests', 'Quest-Knoten (nur im Skill-Tree)', table(['Name', 'Aufgabe', 'Belohnung', 'Akt'],
    data.starmap.knoten.filter((q) => q.typ === 'quest').map((q) => [`<b>${esc(q.name)}</b>`, esc(q.beschreibung),
      esc(Object.entries(q.belohnung).map(([k, v]) => `${k}: ${v}`).join(', ')), q.akt ?? 1])));
  section('foilbaum', 'Foil-Baum (dauerhaft, Foil-Staub)', table(['Name', 'Ast', 'Stufen', 'Grundkosten', 'Wirkung', 'ab Akt'],
    data.foiltree.knoten.filter((n) => n.typ !== 'start').map((n) => [`<b>${esc(n.name)}</b>`, esc(n.ast), n.maxStufe, n.basisKosten, esc(n.beschreibung), n.akt ?? 1])),
    'Kosten je Stufe: Grundkosten × 1,6^Stufe. Sichtbar ab dem ersten Foil-Staub.');

  // Sternenkarte als Gesamtplan
  const legend = data.starmap.aeste.map((b) => `<span>${sw(b.farbe)}${esc(b.name)}</span>`).join('');
  section('sternenkarte', 'Skill-Tree (Gesamtplan)', `<div class="legend">${legend}</div><canvas id="map" width="960" height="960"></canvas>`,
    'Im Spiel ist ein Knoten erst sichtbar, wenn ein verbundener Nachbar gekauft bzw. abgeschlossen ist. Helden- und Tome-Blöcke erscheinen erst mit der Karte in der Sammlung.');
  drawMap(data);
  section('knoten', 'Skill-Tree-Knoten', table(['Name', 'Ast', 'Typ', 'Stufen', 'Grundkosten (Mastery)', 'Wirkung', 'Voraussetzung'],
    data.starmap.knoten.map((n) => [`<b>${esc(n.name)}</b>`, sw(data.branchIndex[n.ast]?.farbe) + esc(data.branchIndex[n.ast]?.name), esc(n.typ), n.maxStufe,
      n.basisKosten, esc(n.beschreibung), esc(n.voraussetzung?.karte ? `Karte „${name(n.voraussetzung.karte)}“ gefunden` : '–')])));
}

function drawMap(data) {
  const cv = $('#map');
  const g = cv.getContext('2d');
  const s = cv.width / data.starmap.groesse.breite;
  const P = (n) => [n.position.x * s, n.position.y * s];
  g.lineWidth = 2;
  for (const n of data.starmap.knoten) for (const v of n.verbindungen) {
    const m = data.starIndex[v];
    if (n.id > m.id) continue;
    g.strokeStyle = 'rgba(180,170,200,0.4)';
    g.beginPath(); g.moveTo(...P(n)); g.lineTo(...P(m)); g.stroke();
  }
  const size = { start: 12, klein: 6, gross: 9, schluessel: 12, freischalt: 8 };
  for (const n of data.starmap.knoten) {
    const [x, y] = P(n);
    const r = size[n.typ];
    g.fillStyle = data.branchIndex[n.ast]?.farbe ?? '#fff';
    g.beginPath();
    if (n.typ === 'gross') for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    else if (n.typ === 'schluessel') for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? r * 0.5 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    else if (n.typ === 'freischalt') g.rect(x - r, y - r, r * 2, r * 2);
    else g.arc(x, y, r, 0, Math.PI * 2);
    g.closePath();
    g.fill();
    if (n.typ === 'schluessel') { g.strokeStyle = '#FFD24A'; g.stroke(); }
  }
}

(async () => {
  try {
    const { raw, schemas } = await load();
    const errors = [];
    for (const f of DATA_FILES) errors.push(...validateSchema(raw[f], schemas[`${f}.schema.json`], schemas, f).map((m) => `[Schema] ${m}`));
    const data = prepareData(raw);
    errors.push(...validateReferences(data).map((m) => `[Verweis] ${m}`));
    const s = dataSummary(data);
    const st = $('#status');
    if (errors.length) { st.className = 'status err'; st.textContent = `✗ ${errors.length} Fehler in den Daten:\n` + errors.join('\n'); }
    else {
      st.className = 'status ok';
      st.textContent = `✓ Alle ${DATA_FILES.length} Datendateien gültig: ${s.einheiten} Einheiten, ${s.tomes} Tomes, ${s.packs} Packs, ${s.gegner} Gegner, ${s.bosse} Bosse, ${s.kapitel} Kapitel, ${s.modifikatoren} Modifikatoren, ${s.gebaeude} Gebäude, ${s.relikte} Relikte, ${s.quests} Quest-Knoten, ${s.knoten} Skill-Tree-Knoten (${s.knotenStufen} Stufen), ${s.foilKnoten} Foil-Knoten.`;
    }
    render(data);
  } catch (err) {
    $('#status').className = 'status err';
    $('#status').textContent = `Daten konnten nicht geladen werden: ${err.message}. Die Seite muss über einen Webserver laufen (z. B. python3 -m http.server).`;
  }
})();
