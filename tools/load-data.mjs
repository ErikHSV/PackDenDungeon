// Lädt die Spieldaten in Node (für Werkzeuge außerhalb des Browsers).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DATA_FILES, prepareData } from '../src/core/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadRaw() {
  return Object.fromEntries(DATA_FILES.map((f) => [f, JSON.parse(readFileSync(join(root, 'data', `${f}.json`), 'utf8'))]));
}

export function loadData() {
  return prepareData(loadRaw());
}
