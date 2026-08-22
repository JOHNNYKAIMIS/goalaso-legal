#!/usr/bin/env node
// catalogue:status — ΠΑΡΑΓΕΙ το docs/failure-catalogue/STATUS.md τρέχοντας τον φύλακα ΚΑΙ την απόδειξη κάθε κλάσης.
// Η κατάσταση μιας κλάσης δεν γράφεται ποτέ με το χέρι. Με --check συγκρίνει με το υπάρχον STATUS.md χωρίς να
// γράψει (για το CI): αν το αρχείο δεν ταιριάζει με ό,τι παράγουν οι φύλακες, κοκκινίζει.
//
// Κεφαλίδα κάθε κλάσης (docs/failure-catalogue/G*.md):
//   <!--catalogue
//   id: G04
//   title: …
//   kind: open | guarded
//   guard: scripts/html-check.mjs      (μόνο για guarded — exit 0 = πράσινο)
//   prove: scripts/html-prove.mjs      (μόνο για guarded — exit 0 = η απόδειξη στέκει)
//   -->
// ΦΥΛΑΣΣΕΤΑΙ = φύλακας πράσινος ΚΑΙ απόδειξη πράσινη · ΑΝΟΙΧΤΗ = kind: open · ΣΠΑΣΜΕΝΟΣ ΦΥΛΑΚΑΣ = guarded αλλά κάτι πέφτει.
// Έξοδος: 0 = STATUS.md γράφτηκε/ταιριάζει και όλα συνεπή · 1 = σπασμένος φύλακας, ασυνέπεια κεφαλίδας ή παλιό STATUS.md · 2 = 0 κλάσεις
// ΠΡΟΣΟΧΗ: κανένας φύλακας δεν επιτρέπεται να καλεί αυτό το script (αναδρομή).

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIR = join(ROOT, 'docs', 'failure-catalogue');
const OUT = join(DIR, 'STATUS.md');
const CHECK_ONLY = process.argv.includes('--check');

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^G\d+-.*\.md$/.test(f)).sort() : [];
if (files.length === 0) {
  console.log(`✗ catalogue:status — 0 κλάσεις στο ${DIR} — exit 2: δεν μπορώ να κρίνω`);
  process.exit(2);
}

const problems = [];
function parseHeader(file) {
  const text = readFileSync(join(DIR, file), 'utf8');
  const m = /<!--catalogue\s*\n([\s\S]*?)-->/.exec(text);
  if (!m) { problems.push(`${file}: λείπει η κεφαλίδα <!--catalogue … -->`); return null; }
  const h = {};
  for (const line of m[1].split('\n')) {
    const kv = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (kv) h[kv[1]] = kv[2];
  }
  for (const k of ['id', 'title', 'kind']) if (!h[k]) problems.push(`${file}: λείπει «${k}» στην κεφαλίδα`);
  if (!['open', 'guarded'].includes(h.kind)) problems.push(`${file}: kind «${h.kind}» — επιτρέπονται open | guarded`);
  if (h.kind === 'guarded') {
    for (const k of ['guard', 'prove']) {
      if (!h[k]) problems.push(`${file}: guarded χωρίς «${k}»`);
      else if (!existsSync(join(ROOT, h[k]))) problems.push(`${file}: ${k} «${h[k]}» δεν υπάρχει στο repo`);
    }
  } else if (h.guard || h.prove) {
    problems.push(`${file}: δηλώνεται open αλλά έχει guard/prove — αν ο φύλακας υπάρχει και αποδεικνύεται, kind: guarded`);
  }
  return { file, ...h };
}
function runScript(rel) {
  const r = spawnSync(process.execPath, [join(ROOT, rel)], { encoding: 'utf8', cwd: ROOT });
  const lines = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n');
  return { code: r.status, summary: lines.filter((l) => /^[✓✗]/.test(l)).pop() ?? lines.pop() ?? '' };
}

const rows = [];
let guarded = 0;
let open = 0;
let broken = 0;
for (const f of files) {
  const h = parseHeader(f);
  if (!h) continue;
  const runnable = h.kind === 'guarded' && h.guard && h.prove && existsSync(join(ROOT, h.guard)) && existsSync(join(ROOT, h.prove));
  if (runnable) {
    const g = runScript(h.guard);
    const p = runScript(h.prove);
    const ok = g.code === 0 && p.code === 0;
    if (ok) guarded++; else broken++;
    rows.push(`| ${h.id} | [${h.title}](${f}) | ${ok ? '**ΦΥΛΑΣΣΕΤΑΙ**' : '**ΣΠΑΣΜΕΝΟΣ ΦΥΛΑΚΑΣ**'} | \`node ${h.guard}\` → ${g.summary} | \`node ${h.prove}\` → ${p.summary} |`);
  } else {
    open++;
    rows.push(`| ${h.id} | [${h.title}](${f}) | ΑΝΟΙΧΤΗ | — | — |`);
  }
}

const md = [
  '# Κατάσταση κλάσεων αστοχίας — ΠΑΡΑΓΕΤΑΙ, μην το γράφεις με το χέρι',
  '',
  '> Παράγεται από `node scripts/catalogue-status.mjs`, που τρέχει τον φύλακα ΚΑΙ την απόδειξη κάθε κλάσης.',
  '> Το CI τρέχει `--check`: αν αυτό το αρχείο δεν ταιριάζει με ό,τι παράγουν οι φύλακες, κοκκινίζει.',
  '> ΦΥΛΑΣΣΕΤΑΙ = φύλακας πράσινος ΚΑΙ απόδειξη πράσινη · ΑΝΟΙΧΤΗ = κανένας φύλακας · ΣΠΑΣΜΕΝΟΣ ΦΥΛΑΚΑΣ = υπάρχει αλλά πέφτει.',
  '',
  '| # | Κλάση | Κατάσταση | Φύλακας | Απόδειξη |',
  '|---|---|---|---|---|',
  ...rows,
  '',
  `Σύνολο: ${files.length} κλάσεις — ${guarded} ΦΥΛΑΣΣΕΤΑΙ, ${open} ΑΝΟΙΧΤΕΣ, ${broken} σπασμένοι φύλακες.`,
  '',
].join('\n');

for (const p of problems) console.log(`  ${p}`);
const tally = `${files.length} κλάσεις: ${guarded} ΦΥΛΑΣΣΕΤΑΙ, ${open} ΑΝΟΙΧΤΕΣ, ${broken} σπασμένοι`;

if (CHECK_ONLY) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : null;
  if (current === null) { console.log(`✗ catalogue:status --check — ${OUT} δεν υπάρχει· τρέξε node scripts/catalogue-status.mjs`); process.exit(1); }
  if (current !== md) { console.log('✗ catalogue:status --check — STATUS.md ΠΑΛΙΟ: δεν ταιριάζει με ό,τι παράγουν οι φύλακες· τρέξε node scripts/catalogue-status.mjs και κάνε commit'); process.exit(1); }
  if (problems.length || broken) { console.log(`✗ catalogue:status --check — ${tally}, ${problems.length} ασυνέπειες κεφαλίδων`); process.exit(1); }
  console.log(`✓ catalogue:status --check — STATUS.md ενημερωμένο, ${tally}`);
  process.exit(0);
}

writeFileSync(OUT, md);
if (problems.length || broken) {
  console.log(`✗ catalogue:status — STATUS.md γράφτηκε, αλλά ${tally}, ${problems.length} ασυνέπειες κεφαλίδων`);
  process.exit(1);
}
console.log(`✓ catalogue:status — STATUS.md γράφτηκε, ${tally}`);
