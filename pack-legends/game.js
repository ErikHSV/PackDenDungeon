'use strict';

const SAVE_KEY = 'pack-legends-save-v1';
const FREE_COOLDOWN = 5 * 60 * 1000;
const MAX_LEVEL = 10;

const $ = (s) => document.querySelector(s);
const heroById = Object.fromEntries(HEROES.map((h) => [h.id, h]));

// ---------- Spielstand ----------
let state = load() || {
  gold: 150,
  stage: 1,
  owned: {},        // id -> { level, copies }
  team: [],
  lastFree: 0,
};

function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ---------- Werte ----------
function copiesForNext(level) { return level; } // Stufe n -> n+1 braucht n Duplikate

function heroStats(id) {
  const h = heroById[id];
  const lvl = state.owned[id]?.level || 1;
  const m = RARITIES[h.rarity].mult * (1 + 0.12 * (lvl - 1));
  return {
    hp: Math.round(h.hp * m * 1.5),
    atk: Math.round(h.atk * m),
    spd: h.spd + Math.floor((lvl - 1) / 3),
  };
}
function power(s) { return Math.round(s.hp * 0.4 + s.atk * 4 + s.spd * 3); }

// ---------- Packs ----------
function rollRarity(rates) {
  const total = Object.values(rates).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(rates)) { if ((r -= v) < 0) return k; }
  return 'common';
}
function randomHero(rarity) {
  const pool = HEROES.filter((h) => h.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

function openPack(type) {
  const p = PACKS[type];
  if (type === 'free') {
    if (Date.now() - state.lastFree < FREE_COOLDOWN) return;
    state.lastFree = Date.now();
  } else {
    if (state.gold < p.cost) { toast('Nicht genug Gold!'); return; }
    state.gold -= p.cost;
  }
  const cards = [];
  for (let i = 0; i < p.size; i++) {
    let rarity = rollRarity(p.rates);
    if (i === p.size - 1 && p.guarantee &&
        !cards.some((c) => RARITIES[c.rarity].order >= RARITIES[p.guarantee].order) &&
        RARITIES[rarity].order < RARITIES[p.guarantee].order) {
      rarity = p.guarantee;
    }
    cards.push(randomHero(rarity));
  }
  const results = cards.map(addHero);
  save();
  render();
  showPackOpening(cards, results);
}

function addHero(h) {
  const o = state.owned[h.id];
  if (!o) {
    state.owned[h.id] = { level: 1, copies: 0 };
    if (state.team.length < 5) state.team.push(h.id);
    return 'NEU!';
  }
  if (o.level >= MAX_LEVEL) { state.gold += 25; return '+25 💰'; }
  o.copies++;
  if (o.copies >= copiesForNext(o.level)) { o.copies = 0; o.level++; return `Stufe ${o.level}!`; }
  return `+1 (${o.copies}/${copiesForNext(o.level)})`;
}

function showPackOpening(cards, results) {
  const body = document.createElement('div');
  body.className = 'card-grid opening';
  cards.forEach((h, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'flip';
    wrap.innerHTML = `<div class="flip-inner"><div class="flip-back">?</div></div>`;
    const front = cardEl(h.id);
    front.classList.add('flip-front');
    const tag = document.createElement('div');
    tag.className = 'result-tag';
    tag.textContent = results[i];
    front.appendChild(tag);
    wrap.firstChild.appendChild(front);
    wrap.addEventListener('click', () => wrap.classList.add('open'));
    setTimeout(() => wrap.classList.add('open'), 400 + i * 350);
    body.appendChild(wrap);
  });
  modal('Pack geöffnet!', body);
}

// ---------- UI: Karten ----------
function cardEl(id, opts = {}) {
  const h = heroById[id] || id; // id kann auch ein Monster-Objekt sein
  const owned = state.owned[h.id];
  const s = opts.stats || (heroById[h.id] ? heroStats(h.id) : h);
  const el = document.createElement('div');
  el.className = `card r-${h.rarity || 'common'} el-${h.element}`;
  el.innerHTML = `
    <div class="card-top"><span>${ELEMENTS[h.element].icon}</span>
      <span class="lvl">${owned ? 'Lv ' + owned.level : ''}</span></div>
    <div class="portrait">${h.icon}</div>
    <div class="card-name">${h.name}</div>
    <div class="card-role" title="${ROLES[h.role].desc}">${ROLES[h.role].name}</div>
    <div class="card-stats">❤️${s.hp} ⚔️${s.atk} 💨${s.spd}</div>`;
  if (owned && owned.level < MAX_LEVEL && !opts.noProgress) {
    const need = copiesForNext(owned.level);
    el.insertAdjacentHTML('beforeend',
      `<div class="xp"><div style="width:${(owned.copies / need) * 100}%"></div></div>`);
  }
  return el;
}

function sortedOwned() {
  const ids = Object.keys(state.owned);
  const mode = $('#sort').value;
  return ids.sort((a, b) => {
    if (mode === 'name') return heroById[a].name.localeCompare(heroById[b].name);
    if (mode === 'power') return power(heroStats(b)) - power(heroStats(a));
    return RARITIES[heroById[b].rarity].order - RARITIES[heroById[a].rarity].order ||
           power(heroStats(b)) - power(heroStats(a));
  });
}

function render() {
  $('#gold').textContent = `💰 ${state.gold}`;
  $('#stage').textContent = `⚔️ Stufe ${state.stage}`;
  $('#battle-title').textContent = `Stufe ${state.stage}${state.stage % 5 === 0 ? ' – BOSS' : ''}`;

  document.querySelectorAll('[data-pack]').forEach((b) => {
    b.disabled = state.gold < PACKS[b.dataset.pack].cost;
  });

  // Sammlung
  const col = $('#collection');
  col.innerHTML = '';
  const owned = sortedOwned();
  $('#collection-count').textContent = `(${owned.length}/${HEROES.length})`;
  owned.forEach((id) => col.appendChild(cardEl(id)));
  HEROES.filter((h) => !state.owned[h.id]).forEach(() => {
    const e = document.createElement('div');
    e.className = 'card locked';
    e.textContent = '?';
    col.appendChild(e);
  });

  // Team
  const slots = $('#team-slots');
  slots.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const id = state.team[i];
    if (id) {
      const c = cardEl(id, { noProgress: true });
      c.addEventListener('click', () => { state.team.splice(i, 1); save(); render(); });
      slots.appendChild(c);
    } else {
      const e = document.createElement('div');
      e.className = 'card empty';
      e.textContent = '+';
      slots.appendChild(e);
    }
  }
  $('#team-power').textContent = state.team.reduce((a, id) => a + power(heroStats(id)), 0);
  const pool = $('#team-pool');
  pool.innerHTML = '';
  owned.filter((id) => !state.team.includes(id)).forEach((id) => {
    const c = cardEl(id, { noProgress: true });
    c.addEventListener('click', () => {
      if (state.team.length >= 5) { toast('Team ist voll (5).'); return; }
      state.team.push(id); save(); render();
    });
    pool.appendChild(c);
  });

  updateFreeTimer();
  if (!battle.running) renderArena(makePlayerUnits(), makeEnemyUnits(state.stage));
}

function updateFreeTimer() {
  const btn = $('#buy-free');
  const left = FREE_COOLDOWN - (Date.now() - state.lastFree);
  if (left <= 0) { btn.disabled = false; btn.textContent = 'Öffnen'; return; }
  btn.disabled = true;
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  btn.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- Kampf ----------
const battle = { running: false, speed: 1, skip: false };

function unit(base, stats, side, idx) {
  return { ...base, ...stats, maxHp: stats.hp, side, idx, uid: side + idx };
}
function makePlayerUnits() {
  return state.team.map((id, i) => unit(heroById[id], heroStats(id), 'p', i));
}
function makeEnemyUnits(stage) {
  const scale = Math.pow(1.13, stage - 1);
  const boss = stage % 5 === 0;
  const count = boss ? 2 : Math.min(5, 2 + Math.floor((stage + 1) / 2));
  // deterministisch pro Stufe, damit Gegner vorhersehbar sind
  let seed = stage * 9301 + 49297;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const list = [];
  if (boss) {
    const b = BOSSES[(stage / 5 - 1) % BOSSES.length];
    list.push({ ...b, rarity: 'legendary', boss: true });
  }
  while (list.length < count + (boss ? 1 : 0)) {
    list.push({ ...MONSTERS[Math.floor(rnd() * MONSTERS.length)] });
  }
  list.sort((a, b) => (a.role === 'tank' ? -1 : 0) - (b.role === 'tank' ? -1 : 0));
  return list.map((m, i) => unit(m, {
    hp: Math.round(m.hp * scale * 1.3),
    atk: Math.round(m.atk * scale),
    spd: m.spd,
  }, 'e', i));
}

function renderArena(players, enemies) {
  for (const [sel, units] of [['#side-player', players], ['#side-enemy', enemies]]) {
    const side = $(sel);
    side.innerHTML = '';
    units.forEach((u) => {
      const e = document.createElement('div');
      e.className = `unit ${u.hp <= 0 ? 'dead' : ''} ${u.boss ? 'boss' : ''}`;
      e.id = 'u-' + u.uid;
      e.innerHTML = `<div class="u-icon">${u.icon}</div>
        <div class="u-name">${ELEMENTS[u.element].icon} ${u.name}</div>
        <div class="hpbar"><div style="width:${Math.max(0, u.hp / u.maxHp) * 100}%"></div></div>
        <div class="u-hp">${Math.max(0, u.hp)}/${u.maxHp}</div>`;
      side.appendChild(e);
    });
  }
}

function updateUnit(u, cls) {
  const e = document.getElementById('u-' + u.uid);
  if (!e) return;
  e.querySelector('.hpbar div').style.width = Math.max(0, u.hp / u.maxHp) * 100 + '%';
  e.querySelector('.u-hp').textContent = `${Math.max(0, u.hp)}/${u.maxHp}`;
  if (u.hp <= 0) e.classList.add('dead');
  if (cls && !battle.skip) {
    e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls);
  }
}

function log(msg, cls = '') {
  const l = $('#log');
  const p = document.createElement('div');
  p.className = cls;
  p.innerHTML = msg;
  l.prepend(p);
  while (l.children.length > 60) l.lastChild.remove();
}

const wait = (ms) => battle.skip ? Promise.resolve() : new Promise((r) => setTimeout(r, ms / battle.speed));

function elementMult(a, d) {
  if (ELEMENTS[a.element].strong === d.element) return 1.3;
  if (ELEMENTS[d.element].strong === a.element && !(a.element === 'light' || a.element === 'shadow')) return 0.8;
  return 1;
}

function dealDamage(att, def, base) {
  let dmg = base * elementMult(att, def) * (0.9 + Math.random() * 0.2);
  if (def.role === 'tank') dmg *= 0.75;
  dmg = Math.max(1, Math.round(dmg));
  def.hp -= dmg;
  updateUnit(def, 'hit');
  return dmg;
}

async function act(u, allies, foes) {
  const alive = foes.filter((f) => f.hp > 0);
  if (!alive.length) return;
  const tag = (x) => `<b class="${x.side}">${x.name}</b>`;
  updateUnit(u, 'acting');

  if (u.role === 'healer') {
    const hurt = allies.filter((a) => a.hp > 0 && a.hp < a.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (hurt && hurt.hp / hurt.maxHp < 0.85) {
      const amt = Math.round(u.atk * 1.3);
      hurt.hp = Math.min(hurt.maxHp, hurt.hp + amt);
      updateUnit(hurt, 'heal');
      log(`${tag(u)} heilt ${tag(hurt)} um <span class="heal">${amt}</span>`);
      return;
    }
  }
  if (u.role === 'mage') {
    const parts = alive.map((t) => `${t.name} ${dealDamage(u, t, u.atk * 0.5)}`);
    log(`${tag(u)} wirkt einen Flächenzauber: ${parts.join(', ')}`);
    return;
  }
  let target, base = u.atk, crit = false;
  if (u.role === 'striker') {
    target = alive.slice().sort((a, b) => a.hp - b.hp)[0];
    if (Math.random() < 0.3) { base *= 2; crit = true; }
  } else if (u.role === 'archer') {
    target = alive[Math.floor(Math.random() * alive.length)];
    base *= 1.15;
  } else {
    target = alive[0];
  }
  const dmg = dealDamage(u, target, base);
  log(`${tag(u)} trifft ${tag(target)} für <span class="dmg">${dmg}</span>${crit ? ' <b>KRITISCH!</b>' : ''}` +
      (target.hp <= 0 ? ` – ${target.name} fällt!` : ''));
}

async function runBattle() {
  if (battle.running) return;
  if (!state.team.length) { toast('Stelle zuerst ein Team zusammen!'); showTab('team'); return; }
  battle.running = true;
  battle.skip = false;
  $('#start-battle').disabled = true;
  $('#skip').disabled = false;
  $('#log').innerHTML = '';

  const players = makePlayerUnits();
  const enemies = makeEnemyUnits(state.stage);
  renderArena(players, enemies);
  log(`Kampf um Stufe ${state.stage} beginnt!`, 'sys');
  await wait(600);

  let round = 0;
  while (players.some((p) => p.hp > 0) && enemies.some((e) => e.hp > 0) && round < 50) {
    round++;
    log(`— Runde ${round} —`, 'sys');
    const order = [...players, ...enemies].filter((x) => x.hp > 0)
      .sort((a, b) => b.spd - a.spd || Math.random() - 0.5);
    for (const u of order) {
      if (u.hp <= 0) continue;
      const [allies, foes] = u.side === 'p' ? [players, enemies] : [enemies, players];
      await act(u, allies, foes);
      if (!foes.some((f) => f.hp > 0)) break;
      await wait(450);
    }
  }

  const won = enemies.every((e) => e.hp <= 0);
  if (battle.skip) renderArena(players, enemies);
  battle.running = false;
  $('#start-battle').disabled = false;
  $('#skip').disabled = true;

  if (won) {
    const boss = state.stage % 5 === 0;
    const reward = Math.round((40 + state.stage * 12) * (boss ? 3 : 1));
    state.gold += reward;
    state.stage++;
    save();
    log(`Sieg! +${reward} 💰`, 'win');
    modal('🏆 Sieg!', `<p>Du erhältst <b>${reward} 💰</b>.</p>${boss ? '<p>Boss besiegt – Bonusbelohnung!</p>' : ''}<p>Weiter zu Stufe ${state.stage}.</p>`);
  } else {
    const consolation = 10 + state.stage * 2;
    state.gold += consolation;
    save();
    log(`Niederlage. +${consolation} 💰 Trostpreis`, 'lose');
    modal('💀 Niederlage', `<p>Dein Team wurde besiegt. Trostpreis: <b>${consolation} 💰</b></p><p>Öffne mehr Packs und level deine Helden!</p>`);
  }
  render();
}

// ---------- Allgemeine UI ----------
function showTab(name) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
}

function modal(title, body) {
  $('#modal-title').textContent = title;
  const b = $('#modal-body');
  b.innerHTML = '';
  if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  $('#modal').classList.remove('hidden');
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelectorAll('[data-pack]').forEach((b) => b.addEventListener('click', () => openPack(b.dataset.pack)));
$('#buy-free').addEventListener('click', () => openPack('free'));
$('#modal-close').addEventListener('click', () => $('#modal').classList.add('hidden'));
$('#sort').addEventListener('change', render);
$('#start-battle').addEventListener('click', runBattle);
$('#skip').addEventListener('click', () => { battle.skip = true; });
$('#speed').addEventListener('click', () => {
  battle.speed = battle.speed === 1 ? 2 : battle.speed === 2 ? 4 : 1;
  $('#speed').textContent = `Tempo ×${battle.speed}`;
});
$('#auto-team').addEventListener('click', () => {
  state.team = Object.keys(state.owned)
    .sort((a, b) => power(heroStats(b)) - power(heroStats(a))).slice(0, 5);
  save(); render();
});
$('#reset').addEventListener('click', () => {
  if (confirm('Spielstand wirklich löschen?')) {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    location.reload();
  }
});
setInterval(updateFreeTimer, 1000);

render();
if (!Object.keys(state.owned).length) {
  // Starter-Pack beim ersten Spielstart
  state.lastFree = 0;
  openPack('free');
  state.lastFree = 0;
  save();
  render();
  $('#modal-title').textContent = 'Willkommen! Hier ist dein Starter-Pack';
}
