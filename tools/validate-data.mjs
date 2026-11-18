#!/usr/bin/env node
// Prüft alle Daten-Dateien auf Pflichtfelder und Querverweise.
// Aufruf: node tools/validate-data.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData } from './load-data.mjs';
import { validateReferences } from '../src/core/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = loadData();
const errors = [];

// Leichte Schema-Prüfung: Pflichtfelder laut data/schemas/*.schema.json
const schemaFor = (name) => JSON.parse(readFileSync(join(root, 'data', 'schemas', `${name}.schema.json`), 'utf8'));
for (const name of ['heroes', 'spells', 'enemies', 'packs', 'chapters']) {
  const required = schemaFor(name).items.required;
  for (const item of data[name]) {
    for (const key of required) if (!(key in item)) errors.push(`${name}: ${item.id ?? '?'} fehlt Feld "${key}"`);
  }
}
const nodeRequired = schemaFor('mastery').properties.nodes.items.required;
for (const n of data.mastery.nodes) for (const key of nodeRequired) if (!(key in n)) errors.push(`mastery: ${n.id} fehlt Feld "${key}"`);

// Eindeutige IDs
const seen = new Set();
for (const id of [...data.heroes, ...data.spells].map((c) => c.id)) {
  if (seen.has(id)) errors.push(`Doppelte Karten-ID: ${id}`);
  seen.add(id);
}

errors.push(...validateReferences(data));

if (errors.length) {
  console.error(`✗ ${errors.length} Fehler:\n  - ` + errors.join('\n  - '));
  process.exit(1);
}
console.log(`✓ Daten ok: ${data.heroes.length} Helden, ${data.spells.length} Zauber, ${data.enemies.length} Gegner, ${data.packs.length} Packs, ${data.chapters.length} Kapitel, ${data.mastery.nodes.length} Mastery-Knoten`);
