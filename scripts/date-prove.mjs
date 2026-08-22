#!/usr/bin/env node
// date:prove — απόδειξη του date-check. Προσωρινά git repos με commits σε ΕΛΕΓΧΟΜΕΝΕΣ ημερομηνίες:
//   το πραγματικό repo → πράσινο · σελίδα που λέει άλλη ημερομηνία από το commit της → κόκκινο (το περιστατικό
//   του G03) · [no-date] commits αγνοούνται · γνωστό χρέος επιτρέπεται, ΝΕΚΡΟ ή ληγμένο όχι · όχι git / ρηχό clone /
//   0 σελίδες με ημερομηνία → exit 2. Ποτέ δεν αγγίζει το πραγματικό repo.
// Χρήση:  node scripts/date-prove.mjs      Έξοδος: 0 = η απόδειξη στέκει · 1 = κάποια περίπτωση απέτυχε

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHECK = join(HERE, 'date-check.mjs');
const TODAY = '2026-08-22';
const D1 = '2026-08-03T19:23:26+03:00';
const D2 = '2026-08-10T12:00:00+03:00';

const base = mkdtempSync(join(tmpdir(), 'goalaso-legal-date-prove-'));
let caseNo = 0;
function dir(label) {
  const d = join(base, `${String(++caseNo).padStart(2, '0')}-${label}`);
  mkdirSync(d);
  return d;
}
function git(d, args, date) {
  const env = { ...process.env };
  if (date) { env.GIT_AUTHOR_DATE = date; env.GIT_COMMITTER_DATE = date; }
  const r = spawnSync('git', args, { cwd: d, encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → exit ${r.status}: ${r.stderr}`);
  return r.stdout;
}
function repo(label) {
  const d = dir(label);
  git(d, ['init', '-q']);
  git(d, ['config', 'user.email', 'prove@example.org']);
  git(d, ['config', 'user.name', 'prove']);
  git(d, ['config', 'commit.gpgsign', 'false']);
  git(d, ['config', 'core.autocrlf', 'false']);
  return d;
}
function commit(d, date, subject) {
  git(d, ['add', '-A']);
  git(d, ['commit', '-q', '--no-verify', '-m', subject], date);
}
function run(d, today = TODAY) {
  const r = spawnSync(process.execPath, [CHECK, d], { encoding: 'utf8', env: { ...process.env, KNOWN_DEBT_TODAY: today } });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
function debt(d, entries) {
  mkdirSync(join(d, 'docs'), { recursive: true });
  writeFileSync(join(d, 'docs', 'known-debt.json'), JSON.stringify({ date: entries }, null, 2));
}
const entry = (file, pageDate, commitDate, extra = {}) => ({ file, pageDate, commitDate, reason: 'δοκιμή', measured: '2026-08-22', expires: '2099-12-31', ...extra });

// Συνθετική σελίδα με γραμμή ημερομηνίας (EL + EN).
const page = (el, en) => `<!doctype html>
<html lang="el"><head><meta charset="utf-8"><title>Δοκιμή</title></head>
<body>
<h1>Δοκιμή</h1>
<p class="updated">Τελευταία ενημέρωση: ${el}</p>
<p>Κείμενο.</p>
<hr>
<section lang="en"><h1>Test</h1><p class="updated">Last updated: ${en}</p><p>Text.</p></section>
</body></html>
`;
const undatedPage = '<!doctype html>\n<html lang="el"><head><meta charset="utf-8"><title>x</title></head><body><h1>Χωρίς ημερομηνία</h1></body></html>\n';

// repo με privacy.html (ημερομηνία σελίδας όπως δίνεται) + index.html χωρίς ημερομηνία, ένα commit στις D1
function dated(label, elDate = '3 Αυγούστου 2026', enDate = 'August 3, 2026') {
  const d = repo(label);
  writeFileSync(join(d, 'privacy.html'), page(elDate, enDate));
  writeFileSync(join(d, 'index.html'), undatedPage);
  commit(d, D1, 'Initial legal pages');
  return d;
}

const results = [];
function record(ok, label, detail) {
  results.push(ok);
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// 0. Το πραγματικό repo (με το known-debt.json του) → πράσινο, με τη ΣΗΜΕΡΙΝΗ ημερομηνία
{
  const r = run(ROOT, process.env.KNOWN_DEBT_TODAY ?? new Date().toISOString().slice(0, 10));
  record(r.code === 0, 'πραγματικό repo → πράσινο', `exit ${r.code}`);
  if (r.code !== 0) console.log(r.out);
}
{
  const r = run(dated('synthetic-green'));
  record(r.code === 0 && r.out.includes('1/1 = τελευταίο ουσιώδες commit'), 'συνθετικό repo, σελίδα = commit → πράσινο', `exit ${r.code}`);
  if (r.code !== 0) console.log(r.out);
}

const MUTATIONS = [
  ['page-date-after-commit (το περιστατικό G03)', '≠ τελευταίο ουσιώδες commit', () => dated('page-after-commit', '4 Αυγούστου 2026', 'August 4, 2026')],
  ['material-commit-without-date-bump', '≠ τελευταίο ουσιώδες commit', () => {
    const d = dated('material-no-bump');
    appendFileSync(join(d, 'privacy.html'), '<!-- ουσιώδης αλλαγή -->\n');
    commit(d, D2, 'Material change to the policy');
    return d;
  }],
  ['no-date-commit-but-older-mismatch', '≠ τελευταίο ουσιώδες commit', () => {
    const d = dated('no-date-older-mismatch', '4 Αυγούστου 2026', 'August 4, 2026');
    appendFileSync(join(d, 'privacy.html'), '<!-- τυπογραφικό -->\n');
    commit(d, D2, '[no-date] typo');
    return d;
  }],
  ['all-commits-no-date', 'όλα τα', () => {
    const d = repo('all-no-date');
    writeFileSync(join(d, 'privacy.html'), page('3 Αυγούστου 2026', 'August 3, 2026'));
    commit(d, D1, '[no-date] initial');
    return d;
  }],
  ['unreadable-date', 'δεν διαβάζεται', () => dated('unreadable', 'σύντομα', 'soon')],
  ['untracked-file', 'χωρίς ιστορικό git', () => {
    const d = dated('untracked');
    writeFileSync(join(d, 'terms.html'), page('3 Αυγούστου 2026', 'August 3, 2026'));
    return d;
  }],
  ['dead-exception-now-matches', 'ΝΕΚΡΗ', () => { const d = dated('dead-exception'); debt(d, [entry('privacy.html', '2026-08-04', '2026-08-03')]); return d; }],
  ['dead-exception-state-changed', 'ΝΕΚΡΗ', () => { const d = dated('dead-state-changed', '5 Αυγούστου 2026', 'August 5, 2026'); debt(d, [entry('privacy.html', '2026-08-04', '2026-08-03')]); return d; }],
  ['exception-unknown-file', 'ΝΕΚΡΗ', () => { const d = dated('exception-unknown'); debt(d, [entry('nope.html', '2026-08-04', '2026-08-03')]); return d; }],
  ['exception-no-reason', 'χωρίς «reason»', () => { const d = dated('no-reason', '4 Αυγούστου 2026', 'August 4, 2026'); debt(d, [entry('privacy.html', '2026-08-04', '2026-08-03', { reason: '' })]); return d; }],
  ['exception-expired', 'ΕΛΗΞΕ', () => { const d = dated('expired', '4 Αυγούστου 2026', 'August 4, 2026'); debt(d, [entry('privacy.html', '2026-08-04', '2026-08-03', { expires: '2026-09-21' })]); return d; }, '2026-09-22'],
];
const INNOCENT = [
  ['no-date-commit-ignored', () => {
    const d = dated('no-date-ignored');
    appendFileSync(join(d, 'privacy.html'), '<!-- τυπογραφικό -->\n');
    commit(d, D2, '[no-date] fix typo');
    return d;
  }, '1 [no-date] commits αγνοήθηκαν'],
  ['material-commit-with-date-bump', () => {
    const d = dated('material-with-bump');
    writeFileSync(join(d, 'privacy.html'), page('10 Αυγούστου 2026', 'August 10, 2026'));
    commit(d, D2, 'Material change + date bump');
    return d;
  }, '1/1 = τελευταίο ουσιώδες commit'],
  ['known-debt-allows-mismatch', () => {
    const d = dated('known-debt', '4 Αυγούστου 2026', 'August 4, 2026');
    debt(d, [entry('privacy.html', '2026-08-04', '2026-08-03')]);
    return d;
  }, '1 γνωστό χρέος'],
];

let red = 0;
let green = 0;
let closed = 0;
for (const [label, expect, make, today] of MUTATIONS) {
  let d;
  try { d = make(); } catch (e) { record(false, `κόκκινο: ${label}`, e.message); continue; }
  const r = run(d, today);
  const ok = r.code === 1 && r.out.includes(expect);
  if (ok) red++;
  record(ok, `κόκκινο: ${label}`, ok ? `exit 1, «${expect}»` : `exit ${r.code}, περίμενα «${expect}»\n${r.out}`);
}
for (const [label, make, expectOut] of INNOCENT) {
  let d;
  try { d = make(); } catch (e) { record(false, `πράσινο: ${label}`, e.message); continue; }
  const r = run(d);
  const ok = r.code === 0 && r.out.includes(expectOut);
  if (ok) green++;
  record(ok, `πράσινο: ${label}`, ok ? `exit 0, «${expectOut}»` : `exit ${r.code}\n${r.out}`);
}
{
  const d = dir('not-a-git-repo');
  writeFileSync(join(d, 'privacy.html'), page('3 Αυγούστου 2026', 'August 3, 2026'));
  const r = run(d);
  const ok = r.code === 2;
  if (ok) closed++;
  record(ok, 'fail-closed: όχι git repo → exit 2', `exit ${r.code}`);
}
{
  const src = dated('shallow-src');
  const d = join(base, `${String(++caseNo).padStart(2, '0')}-shallow-clone`);
  spawnSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(src).href, d], { encoding: 'utf8' });
  const r = run(d);
  const ok = r.code === 2 && r.out.includes('ρηχό');
  if (ok) closed++;
  record(ok, 'fail-closed: ρηχό clone → exit 2', `exit ${r.code}`);
}
{
  const d = repo('no-dated-pages');
  writeFileSync(join(d, 'index.html'), undatedPage);
  commit(d, D1, 'index only');
  const r = run(d);
  const ok = r.code === 2 && r.out.includes('0 σελίδες');
  if (ok) closed++;
  record(ok, 'fail-closed: 0 σελίδες με ημερομηνία → exit 2', `exit ${r.code}`);
}

rmSync(base, { recursive: true, force: true });
const failed = results.filter((x) => !x).length;
const tally = `date:prove — ${red}/${MUTATIONS.length} μεταλλάξεις κόκκινες, ${green}/${INNOCENT.length} αθώες πράσινες, fail-closed ${closed}/3`;
if (failed) { console.log(`✗ ${tally} — ${failed} περιπτώσεις απέτυχαν`); process.exit(1); }
console.log(`✓ ${tally}`);
