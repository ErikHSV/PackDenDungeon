// Kleiner JSON-Schema-Validator (Teilmenge von Draft-07), ohne Abhängigkeiten.
// Unterstützt: type, required, properties, additionalProperties (Schema), items, enum, const,
// pattern, minimum, propertyNames.enum und $ref auf "datei.schema.json#/definitions/name".

/**
 * @param {any} value       zu prüfender Wert
 * @param {object} schema   Schema
 * @param {object} schemas  alle Schemas nach $id (für $ref)
 * @param {string} path     Pfad für Fehlermeldungen
 * @returns {string[]} Fehlerliste
 */
export function validateSchema(value, schema, schemas, path = '') {
  const errors = [];
  check(value, schema, path || '(Wurzel)');
  return errors;

  function resolve(ref) {
    const [file, frag] = ref.split('#');
    let target = schemas[file];
    if (!target) throw new Error(`Schema ${file} nicht gefunden`);
    for (const part of (frag || '').split('/').filter(Boolean)) target = target[part];
    return target;
  }

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (Number.isInteger(v)) return 'integer';
    return typeof v;
  }

  function typeMatches(v, t) {
    const actual = typeOf(v);
    if (t === 'number') return actual === 'number' || actual === 'integer';
    return actual === t;
  }

  function check(v, s, p) {
    if (!s) return;
    if (s.$ref) { check(v, resolve(s.$ref), p); return; }
    if (s.type) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => typeMatches(v, t))) { errors.push(`${p}: erwartet ${types.join('|')}, gefunden ${typeOf(v)}`); return; }
    }
    if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) errors.push(`${p}: "${v}" nicht erlaubt (${s.enum.join(', ')})`);
    if ('const' in s && v !== s.const) errors.push(`${p}: muss ${s.const} sein`);
    if (s.pattern && typeof v === 'string' && !new RegExp(s.pattern).test(v)) errors.push(`${p}: "${v}" passt nicht zu ${s.pattern}`);
    if (s.minimum != null && typeof v === 'number' && v < s.minimum) errors.push(`${p}: ${v} < Minimum ${s.minimum}`);
    if (typeOf(v) === 'object') {
      for (const key of s.required || []) if (!(key in v)) errors.push(`${p}: Pflichtfeld "${key}" fehlt`);
      for (const [key, val] of Object.entries(v)) {
        if (key.startsWith('$')) continue; // Kommentare ($kommentar …)
        if (s.propertyNames?.enum && !s.propertyNames.enum.includes(key)) errors.push(`${p}: unbekannter Schlüssel "${key}"`);
        if (s.properties?.[key]) check(val, s.properties[key], `${p}.${key}`);
        else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(val, s.additionalProperties, `${p}.${key}`);
      }
    }
    if (typeOf(v) === 'array' && s.items) v.forEach((item, i) => check(item, s.items, `${p}[${item?.id ?? i}]`));
  }
}
