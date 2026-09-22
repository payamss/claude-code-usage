#!/usr/bin/env node
// Validates a translation file against src/i18n/en.json.
//   node scripts/check-i18n.mjs de          (or: --all)
// Exits non-zero and prints every problem it finds.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));

const args = process.argv.slice(2);
const langs = args.includes('--all') || !args.length
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json').map((f) => f.slice(0, -5))
  : args;

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s) => [...String(s).matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase()).sort();
const isMeta = (k) => ['_meta', 'labels', 'prefixes', 'suffixes'].includes(k);

let failed = 0;
for (const lang of langs) {
  const file = path.join(dir, `${lang}.json`);
  const problems = [];
  if (!fs.existsSync(file)) { console.error(`✗ ${lang}: ${file} does not exist`); failed++; continue; }
  let t;
  try { t = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`✗ ${lang}: invalid JSON — ${e.message}`); failed++; continue; }

  if (!t._meta?.name || !['ltr', 'rtl'].includes(t._meta?.dir)) problems.push('_meta must be {"name": "...", "dir": "ltr"|"rtl"}');

  for (const k of Object.keys(en)) {
    if (isMeta(k)) continue;
    if (!(k in t)) { problems.push(`missing key: ${k}`); continue; }
    if (typeof t[k] !== 'string') { problems.push(`not a string: ${k}`); continue; }
    const pe = placeholders(en[k]), pt = placeholders(t[k]);
    if (pe.join() !== pt.join()) problems.push(`placeholders differ in ${k}: en {${pe}} vs ${lang} {${pt}}`);
    const te = tags(en[k]), tt = tags(t[k]);
    if (te.join() !== tt.join()) problems.push(`html tags differ in ${k}: en <${te}> vs ${lang} <${tt}>`);
    if (t[k] === en[k] && en[k].length > 25 && !/^[\d\s$%·—/:.,-]+$/.test(en[k])) problems.push(`untranslated (identical to English): ${k}`);
  }
  for (const k of Object.keys(t)) if (!isMeta(k) && !(k in en)) problems.push(`unknown key (not in en.json): ${k}`);

  // labels/prefixes/suffixes translate strings the server produces (see src/lib/parser.ts
  // toolKey() and src/lib/analyze.ts LABELS/categoryOf). They may be partial, but the
  // prefix/suffix keys have to match the app's source strings exactly.
  const KNOWN_PREFIXES = ['Skill /', 'MCP ', 'Subagent ', 'Subagent run: ', 'Command '];
  const KNOWN_SUFFIXES = [' (hand-back into main context)'];
  for (const group of ['labels', 'prefixes', 'suffixes']) {
    const v = t[group];
    if (v === undefined) { problems.push(`missing "${group}" object (may be empty: {})`); continue; }
    if (typeof v !== 'object' || Array.isArray(v)) { problems.push(`"${group}" must be an object`); continue; }
    for (const [k, val] of Object.entries(v)) {
      if (typeof val !== 'string') problems.push(`${group}["${k}"] must be a string`);
      if (group === 'prefixes' && !KNOWN_PREFIXES.includes(k)) problems.push(`prefixes: "${k}" is not one of ${KNOWN_PREFIXES.map((x) => `"${x}"`).join(', ')}`);
      if (group === 'suffixes' && !KNOWN_SUFFIXES.includes(k)) problems.push(`suffixes: "${k}" is not one of ${KNOWN_SUFFIXES.map((x) => `"${x}"`).join(', ')}`);
    }
  }

  const n = Object.keys(en).filter((k) => !isMeta(k)).length;
  if (problems.length) {
    failed++;
    console.error(`✗ ${lang} (${t._meta?.name || '?'}, ${t._meta?.dir || '?'}) — ${problems.length} problem(s) of ${n} keys`);
    for (const p of problems.slice(0, 40)) console.error(`   · ${p}`);
    if (problems.length > 40) console.error(`   · …and ${problems.length - 40} more`);
  } else {
    console.log(`✓ ${lang} (${t._meta.name}, ${t._meta.dir}) — ${n} keys, placeholders and markup match`);
  }
}
process.exit(failed ? 1 : 0);
