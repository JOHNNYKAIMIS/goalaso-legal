#!/usr/bin/env node
// bilingual:prove — απόδειξη του bilingual-check. Συνθετικές δίγλωσσες σελίδες σε προσωρινό φάκελο:
//   το πραγματικό repo (αντίγραφο + το known-debt.json του) → πράσινο · κάθε μετάλλαξη → κόκκινο με το
//   αναμενόμενο μήνυμα · κάθε αθώα αλλαγή → πράσινο · κενός φάκελος / μόνο μονόγλωσσες → exit 2.
// Ποτέ δεν αγγίζει τα πραγματικά αρχεία.
// Χρήση:  node scripts/bilingual-prove.mjs      Έξοδος: 0 = η απόδειξη στέκει · 1 = κάποια περίπτωση απέτυχε

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listHtml } from './lib/pages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHECK = join(HERE, 'bilingual-check.mjs');
const TODAY = '2026-08-22';

const base = mkdtempSync(join(tmpdir(), 'goalaso-legal-bilingual-prove-'));
let caseNo = 0;
function dir(label) {
  const d = join(base, `${String(++caseNo).padStart(2, '0')}-${label}`);
  mkdirSync(d);
  return d;
}
function run(d, today = TODAY) {
  const r = spawnSync(process.execPath, [CHECK, d], { encoding: 'utf8', env: { ...process.env, KNOWN_DEBT_TODAY: today } });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
function debt(d, entries) {
  mkdirSync(join(d, 'docs'), { recursive: true });
  writeFileSync(join(d, 'docs', 'known-debt.json'), JSON.stringify({ bilingual: entries }, null, 2));
}
const entry = (file, extra = {}) => ({ file, issue: 'lang-en-missing', reason: 'δοκιμή', measured: '2026-08-22', expires: '2099-12-31', ...extra });

// Συνθετική δίγλωσση σελίδα: 2 h2, 1 ul με 2 li, 1 a, 3 p (+ το EL-only lang-note) ανά γλώσσα.
function page({ elDate = '3 Αυγούστου 2026', enDate = 'August 3, 2026', langEn = true, el = {}, en = {} } = {}) {
  return `<!doctype html>
<html lang="el">
<head><meta charset="utf-8"><title>Δοκιμή / Test</title></head>
<body>
<h1>Δοκιμή — Ελληνικά</h1>
${el.noDate ? '' : `<p class="updated">Τελευταία ενημέρωση: ${elDate}</p>`}
<p class="lang-note">English version follows below the Greek text.</p>
<p>Πρώτη παράγραφος με <a href="mailto:x@example.org">σύνδεσμο</a>.</p>
${el.dropH2 ? '' : '<h2>Ενότητα Α</h2>'}
<ul><li>Ένα</li><li>Δύο</li></ul>
<h2>Ενότητα Β</h2>
<p>Δεύτερη παράγραφος.</p>
${el.extra ?? ''}
<hr>
${langEn ? '<section lang="en">' : ''}
<h1>Test — English</h1>
${en.noDate ? '' : `<p class="updated">Last updated: ${enDate}</p>`}
<p>First paragraph with ${en.dropLink ? 'no link' : '<a href="mailto:x@example.org">a link</a>'}.</p>
<h2>Section A</h2>
<ul><li>One</li>${en.dropLi ? '' : '<li>Two</li>'}</ul>
<h2>Section B</h2>
<p>${en.text ?? 'Second paragraph.'}</p>
${en.extra ?? ''}
${langEn ? '</section>' : ''}
</body>
</html>
`;
}
function synth(label, opts, debtEntries) {
  const d = dir(label);
  writeFileSync(join(d, 'page.html'), page(opts));
  if (debtEntries) debt(d, debtEntries);
  return d;
}

const results = [];
function record(ok, label, detail) {
  results.push(ok);
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// 0. Το πραγματικό repo (αντίγραφο των σελίδων + το known-debt.json του) → πράσινο, με τη ΣΗΜΕΡΙΝΗ ημερομηνία
{
  const d = dir('real-repo');
  for (const f of listHtml(ROOT)) writeFileSync(join(d, f), readFileSync(join(ROOT, f)));
  const kd = join(ROOT, 'docs', 'known-debt.json');
  if (existsSync(kd)) { mkdirSync(join(d, 'docs')); writeFileSync(join(d, 'docs', 'known-debt.json'), readFileSync(kd)); }
  const r = run(d, process.env.KNOWN_DEBT_TODAY ?? new Date().toISOString().slice(0, 10));
  record(r.code === 0, 'πραγματικό repo (αντίγραφο + known-debt) → πράσινο', `exit ${r.code}`);
  if (r.code !== 0) console.log(r.out);
}
{
  const r = run(synth('synthetic-green', {}));
  record(r.code === 0, 'συνθετική δίγλωσση σελίδα → πράσινο', `exit ${r.code}`);
  if (r.code !== 0) console.log(r.out);
}

const MUTATIONS = [
  ['remove-en-li',           '<li> EL=2 ≠ EN=1',        () => synth('remove-en-li', { en: { dropLi: true } })],
  ['remove-el-h2',           '<h2> EL=1 ≠ EN=2',        () => synth('remove-el-h2', { el: { dropH2: true } })],
  ['remove-en-link',         '<a> EL=1 ≠ EN=0',         () => synth('remove-en-link', { en: { dropLink: true } })],
  ['extra-el-paragraph',     '<p> EL=4 ≠ EN=3',         () => synth('extra-el-paragraph', { el: { extra: '<p>Μόνο στα ελληνικά.</p>' } })],
  ['en-date-differs',        'ημερομηνίες διαφέρουν',   () => synth('en-date-differs', { enDate: 'August 5, 2026' })],
  ['el-date-unreadable',     'δεν διαβάζεται',          () => synth('el-date-unreadable', { elDate: 'σύντομα' })],
  ['en-date-line-missing',   'λείπει η γραμμή',         () => synth('en-date-line-missing', { en: { noDate: true } })],
  ['lang-en-missing',        'lang="en"',               () => synth('lang-en-missing', { langEn: false })],
  ['dead-exception',         'ΝΕΚΡΗ',                   () => synth('dead-exception', { langEn: true }, [entry('page.html')])],
  ['exception-unknown-file', 'ΝΕΚΡΗ',                   () => synth('exception-unknown-file', { langEn: false }, [entry('page.html'), entry('nope.html')])],
  ['exception-no-reason',    'χωρίς «reason»',          () => synth('exception-no-reason', { langEn: false }, [entry('page.html', { reason: '' })])],
  ['exception-expired',      'ΕΛΗΞΕ',                   () => synth('exception-expired', { langEn: false }, [entry('page.html', { expires: '2026-09-21' })]), '2026-09-22'],
];
const INNOCENT = [
  ['paragraph-in-both-halves', () => synth('paragraph-in-both-halves', { el: { extra: '<p>Νέα.</p>' }, en: { extra: '<p>New.</p>' } })],
  ['en-wording-change',        () => synth('en-wording-change', { en: { text: 'Second paragraph, reworded — semantics are not this guard\'s job.' } })],
  ['known-debt-allows-lang',   () => synth('known-debt-allows-lang', { langEn: false }, [entry('page.html')]), '1 γνωστό χρέος'],
];

let red = 0;
let green = 0;
let closed = 0;
for (const [label, expect, make, today] of MUTATIONS) {
  const r = run(make(), today);
  const ok = r.code === 1 && r.out.includes(expect);
  if (ok) red++;
  record(ok, `κόκκινο: ${label}`, ok ? `exit 1, «${expect}»` : `exit ${r.code}, περίμενα «${expect}»\n${r.out}`);
}
for (const [label, make, expectOut] of INNOCENT) {
  const r = run(make());
  const ok = r.code === 0 && (!expectOut || r.out.includes(expectOut));
  if (ok) green++;
  record(ok, `πράσινο: ${label}`, ok ? `exit 0${expectOut ? `, «${expectOut}»` : ''}` : `exit ${r.code}\n${r.out}`);
}
{
  const r = run(dir('empty'));
  const ok = r.code === 2;
  if (ok) closed++;
  record(ok, 'fail-closed: κενός φάκελος → exit 2', `exit ${r.code}`);
}
{
  const d = dir('monolingual-only');
  writeFileSync(join(d, 'index.html'), '<!doctype html>\n<html lang="el"><head><meta charset="utf-8"><title>x</title></head><body><h1>Μόνο ένα h1</h1></body></html>\n');
  const r = run(d);
  const ok = r.code === 2 && r.out.includes('0 δίγλωσσες');
  if (ok) closed++;
  record(ok, 'fail-closed: μόνο μονόγλωσσες σελίδες → exit 2', `exit ${r.code}`);
}

rmSync(base, { recursive: true, force: true });
const failed = results.filter((x) => !x).length;
const tally = `bilingual:prove — ${red}/${MUTATIONS.length} μεταλλάξεις κόκκινες, ${green}/${INNOCENT.length} αθώες πράσινες, fail-closed ${closed}/2`;
if (failed) { console.log(`✗ ${tally} — ${failed} περιπτώσεις απέτυχαν`); process.exit(1); }
console.log(`✓ ${tally}`);
