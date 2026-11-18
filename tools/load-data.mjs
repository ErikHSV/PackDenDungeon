// Lädt Spieldaten und Schemas in Node (für Werkzeuge außerhalb des Browsers).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DATA_FILES, prepareData } from '../src/core/data.js';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadRaw() {
  return Object.fromEntries(DATA_FILES.map((f) => [f, JSON.parse(readFileSync(join(root, 'data', `${f}.json`), 'utf8'))]));
}

export function loadSchemas() {
  const dir = join(root, 'data', 'schemas');
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.schema.json'))
    .map((f) => [f, JSON.parse(readFileSync(join(dir, f), 'utf8'))]));
}

export function loadData() {
  return prepareData(loadRaw());
}
