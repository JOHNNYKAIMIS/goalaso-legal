#!/usr/bin/env node
// html:prove — απόδειξη του html:check. Σε αντίγραφο των σελίδων μέσα σε προσωρινό φάκελο:
//   1. το αμετάβλητο αντίγραφο πρέπει να είναι ΠΡΑΣΙΝΟ (αλλιώς ο πληθυσμός είναι ήδη κόκκινος και η απόδειξη δεν λέει τίποτα)
//   2. κάθε μετάλλαξη που σπάει ό,τι φυλάει ο φύλακας πρέπει να τον κάνει ΚΟΚΚΙΝΟ (exit 1) με το αναμενόμενο μήνυμα
//   3. κάθε αθώα αλλαγή πρέπει να μένει ΠΡΑΣΙΝΗ (exit 0)
//   4. κενός ή ανύπαρκτος φάκελος πρέπει να δίνει exit 2 (fail-closed — «δεν βρήκα τίποτα» ≠ «όλα καλά»)
// Ποτέ δεν αγγίζει τα πραγματικά αρχεία. Μετάλλαξη που δεν βρίσκει στόχο = ΑΠΟΤΥΧΙΑ (ο πληθυσμός άλλαξε, ενημέρωσε το prove).
// Χρήση:  node scripts/html-prove.mjs
// Έξοδος: 0 = η απόδειξη στέκει · 1 = κάποια περίπτωση απέτυχε · 2 = δεν υπάρχει τι να αποδείξω

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHECK = join(HERE, 'html-check.mjs');

const names = readdirSync(ROOT).filter((f) => /\.html?$/i.test(f)).sort();
if (names.length === 0) {
  console.log('✗ html:prove — 0 αρχεία HTML στη ρίζα: δεν υπάρχει τι να σπάσω — exit 2');
  process.exit(2);
}
const originals = new Map(names.map((f) => [f, readFileSync(join(ROOT, f))]));

const base = mkdtempSync(join(tmpdir(), 'goalaso-legal-prove-'));
let caseNo = 0;
function copy(label) {
  const dir = join(base, `${String(++caseNo).padStart(2, '0')}-${label}`);
  mkdirSync(dir);
  for (const [f, b] of originals) writeFileSync(join(dir, f), b);
  return dir;
}
function run(dir) {
  const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
// Αλλάζει την ΠΡΩΤΗ εμφάνιση του needle στο πρώτο αρχείο που το περιέχει· επιστρέφει το όνομα του αρχείου.
function edit(dir, needle, replacement) {
  for (const f of names) {
    const p = join(dir, f);
    const t = readFileSync(p, 'utf8');
    const hit = typeof needle === 'string' ? (t.includes(needle) ? needle : null) : (needle.exec(t)?.[0] ?? null);
    if (hit !== null) { writeFileSync(p, t.replace(hit, replacement)); return f; }
  }
  throw new Error(`η μετάλλαξη δεν βρήκε στόχο «${needle}» σε κανένα αρχείο`);
}
function bytes(dir, file, fn) {
  const p = join(dir, file);
  writeFileSync(p, fn(readFileSync(p)));
  return file;
}

// [ετικέτα, αναμενόμενο απόσπασμα στο μήνυμα σφάλματος, μετάλλαξη]
const MUTATIONS = [
  ['unclosed-tag',       'δεν έκλεισε',          (d) => edit(d, '</h2>', '')],
  ['close-without-open', 'χωρίς άνοιγμα',        (d) => edit(d, '</body>', '</div>\n</body>')],
  ['unquoted-attr',      'χωρίς εισαγωγικά',     (d) => edit(d, /class="[\w-]+"/, 'class=broken')],
  ['stray-lt',           'αδέσποτο',             (d) => edit(d, '</body>', '<p>5 < 7</p>\n</body>')],
  ['self-closing-div',   'self-closing',         (d) => edit(d, '</body>', '<div/>\n</body>')],
  ['no-doctype',         '<!doctype html>',      (d) => edit(d, /<!doctype html>\s*/i, '')],
  ['no-lang',            'χωρίς lang',           (d) => edit(d, /<html lang="[a-zA-Z-]+">/i, '<html>')],
  ['empty-title',        '<title>',              (d) => edit(d, /<title>[^<]*<\/title>/i, '<title> </title>')],
  ['wrong-charset',      'charset',              (d) => edit(d, /charset="utf-8"/i, 'charset="windows-1252"')],
  ['mojibake',           'mojibake',             (d) => edit(d, '</body>', '<p>Î•Î»Î»Î·Î½Î¹ÎºÎ¬ â€” ÎºÎµÎ¯Î¼ÎµÎ½Î¿</p>\n</body>')],
  ['bom',                'BOM',                  (d) => bytes(d, names[0], (b) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), b]))],
  ['invalid-utf8',       'μη έγκυρο UTF-8',      (d) => bytes(d, names[0], (b) => Buffer.concat([b, Buffer.from([0xce])]))],
  ['dead-internal-link', 'νεκρό εσωτερικό link', (d) => edit(d, /href="\.\/[\w-]+\.html"/, 'href="./does-not-exist.html"')],
];
// Αθώες αλλαγές — ο φύλακας ΔΕΝ πρέπει να πέφτει
const INNOCENT = [
  ['new-paragraph',     (d) => edit(d, '</body>', '<p>Νέα πρόταση — με «εισαγωγικά» και τόνους.</p>\n</body>')],
  ['new-external-link', (d) => edit(d, '</body>', '<p><a href="https://example.org/">Εξωτερικός σύνδεσμος</a></p>\n</body>')],
  ['comment-with-tags', (d) => edit(d, '</body>', '<!-- σχόλιο με <b>tags</b> και < μέσα -->\n</body>')],
  ['void-elements',     (d) => edit(d, '</body>', '<p>πρώτη<br>δεύτερη</p>\n<hr style="margin-top:1em">\n</body>')],
  ['changed-date-text', (d) => edit(d, /\d{1,2} \p{L}+ \d{4}/u, '99 Μηνός 2099')], // η ημερομηνία είναι δουλειά του G03, όχι αυτού του φύλακα
];

const results = [];
function record(ok, label, detail) {
  results.push(ok);
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

{
  const r = run(copy('unchanged'));
  record(r.code === 0, 'αμετάβλητο αντίγραφο → πράσινο', `exit ${r.code}`);
  if (r.code !== 0) console.log(r.out);
}
let red = 0;
let green = 0;
let closed = 0;
for (const [label, expect, mutate] of MUTATIONS) {
  const dir = copy(label);
  let file;
  try { file = mutate(dir); } catch (e) { record(false, `κόκκινο: ${label}`, e.message); continue; }
  const r = run(dir);
  const ok = r.code === 1 && r.out.includes(expect);
  if (ok) red++;
  record(ok, `κόκκινο: ${label} (${file})`, ok ? `exit 1, «${expect}»` : `exit ${r.code}, περίμενα «${expect}»\n${r.out}`);
}
for (const [label, mutate] of INNOCENT) {
  const dir = copy(label);
  let file;
  try { file = mutate(dir); } catch (e) { record(false, `πράσινο: ${label}`, e.message); continue; }
  const r = run(dir);
  const ok = r.code === 0;
  if (ok) green++;
  record(ok, `πράσινο: ${label} (${file})`, ok ? 'exit 0' : `exit ${r.code}\n${r.out}`);
}
{
  const dir = join(base, 'empty');
  mkdirSync(dir);
  const r = run(dir);
  const ok = r.code === 2;
  if (ok) closed++;
  record(ok, 'fail-closed: κενός φάκελος → exit 2', `exit ${r.code}`);
}
{
  const r = run(join(base, 'does-not-exist'));
  const ok = r.code === 2;
  if (ok) closed++;
  record(ok, 'fail-closed: ανύπαρκτος φάκελος → exit 2', `exit ${r.code}`);
}

rmSync(base, { recursive: true, force: true });
const failed = results.filter((x) => !x).length;
const tally = `html:prove — ${red}/${MUTATIONS.length} μεταλλάξεις κόκκινες, ${green}/${INNOCENT.length} αθώες πράσινες, fail-closed ${closed}/2`;
if (failed) {
  console.log(`✗ ${tally} — ${failed} περιπτώσεις απέτυχαν`);
  process.exit(1);
}
console.log(`✓ ${tally}`);
