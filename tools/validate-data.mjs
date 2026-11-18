#!/usr/bin/env node
// Prüft alle Datendateien gegen ihre JSON-Schemas und alle Querverweise.
// Aufruf: node tools/validate-data.mjs
import { loadRaw, loadSchemas } from './load-data.mjs';
import { DATA_FILES, prepareData, validateReferences, dataSummary } from '../src/core/data.js';
import { validateSchema } from '../src/core/schema.js';

const raw = loadRaw();
const schemas = loadSchemas();
const errors = [];

for (const f of DATA_FILES) {
  const schema = schemas[`${f}.schema.json`];
  if (!schema) { errors.push(`Kein Schema für data/${f}.json`); continue; }
  for (const msg of validateSchema(raw[f], schema, schemas, f)) errors.push(`[Schema] ${msg}`);
}

let data;
try {
  data = prepareData(raw);
  for (const msg of validateReferences(data)) errors.push(`[Verweis] ${msg}`);
} catch (err) {
  errors.push(`Aufbereitung fehlgeschlagen: ${err.message}`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} Fehler:\n  - ` + errors.join('\n  - '));
  process.exit(1);
}
const s = dataSummary(data);
console.log(`✓ Daten ok: ${s.einheiten} Einheiten, ${s.tomes} Tomes (${s.karten} Karten), ${s.packs} Packs, ${s.gegner} Gegner, ${s.bosse} Bosse, ` +
  `${s.kapitel} Kapitel in ${s.akte} Akten, ${s.modifikatoren} Modifikatoren, ${s.gebaeude} Gebäude, ${s.relikte} Relikte, ${s.quests} Quest-Knoten, ${s.erfolge} Erfolge, ` +
  `${s.knoten} Skill-Tree-Knoten (${s.knotenStufen} Stufen), ${s.foilKnoten} Foil-Knoten`);
