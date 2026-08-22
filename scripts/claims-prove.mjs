#!/usr/bin/env node
// claims:prove — απόδειξη του claims-check. Συνθετική σελίδα + συνθετικός κατάλογος + ψεύτικος φάκελος εφαρμογής
// σε προσωρινό φάκελο: anchor που χάθηκε, ψευδής δήλωση χωρίς χρέος, ΝΕΚΡΟ χρέος, ληγμένο χρέος, παλιά μέτρηση,
// εφαρμογή που άλλαξε (--app) → κόκκινο· αθώες αλλαγές → πράσινο· κατάλογος/σελίδα/φάκελος που λείπουν → exit 2.
// Πρώτα: ο πραγματικός κατάλογος χωρίς --app → πράσινο· και με --app αν ο φάκελος της εφαρμογής υπάρχει
// (GOALASO_APP_DIR ή ../goalaso) — αλλιώς ΠΑΡΑΛΕΙΠΕΤΑΙ ρητά, δεν μετρά ως επιτυχία.
// Χρήση:  node scripts/claims-prove.mjs      Έξοδος: 0 = η απόδειξη στέκει · 1 = κάποια περίπτωση απέτυχε

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHECK = join(HERE, 'claims-check.mjs');
const TODAY = '2026-08-22';

const base = mkdtempSync(join(tmpdir(), 'goalaso-legal-claims-prove-'));
let caseNo = 0;
function dir(label) {
  const d = join(base, `${String(++caseNo).padStart(2, '0')}-${label}`);
  mkdirSync(d);
  return d;
}
function run(cwd, extra = [], today = TODAY) {
  const r = spawnSync(process.execPath, [CHECK, '--cwd', cwd, ...extra], { encoding: 'utf8', env: { ...process.env, KNOWN_DEBT_TODAY: today } });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const PAGE = `<!doctype html>
<html lang="el"><head><meta charset="utf-8"><title>Δοκιμή</title></head><body>
<h1>Πολιτική</h1><p>Συλλέγουμε <strong>Email διεύθυνση</strong> για τον λογαριασμό. Καμία live τοποθεσία GPS.</p>
<hr>
<section lang="en"><h1>Policy</h1><p>We collect <strong>Email address</strong> for the account. No live GPS location.</p></section>
</body></html>
`;
const claim = (id, result, kind, pattern, paths, anchor, extra = {}) => ({
  id, claim: `δοκιμή ${id}`, anchor, app: kind === 'manual' ? { kind, how: 'ρωτάς τον ιδιοκτήτη' } : { kind, pattern, paths },
  measured: { date: '2026-08-22', result, evidence: 'δοκιμή' }, ...extra,
});
const EMAIL = { el: 'Email διεύθυνση', en: 'Email address' };
const GPS = { el: 'Καμία live τοποθεσία GPS', en: 'No live GPS location' };
function catalogue(overrides = {}) {
  return {
    page: 'privacy.html',
    maxAgeDays: 60,
    app: { repo: 'δοκιμή', measuredAt: '2026-08-22', commit: 'abc1234' },
    claims: [
      claim('K1', 'ΕΠΙΒΕΒΑΙΩΜΕΝΟΣ', 'present', 'signInWithOtp', ['src'], EMAIL),
      claim('K2', 'ΕΠΙΒΕΒΑΙΩΜΕΝΟΣ', 'absent', 'expo-location', ['package.json'], GPS),
      claim('K3', 'ΔΙΑΨΕΥΣΜΕΝΟΣ', 'absent', 'first_name', ['src'], EMAIL),
      claim('K4', 'ΚΕΝΟ', 'present', 'crash_reports', ['src'], undefined),
      claim('K5', 'ΔΕΝ ΕΛΕΓΧΕΤΑΙ ΑΥΤΟΜΑΤΑ', 'manual', undefined, undefined, GPS),
    ],
    ...overrides,
  };
}
const debtEntry = (id, extra = {}) => ({ file: 'privacy.html', claim: id, reason: 'δοκιμή', measured: '2026-08-22', expires: '2099-12-31', ...extra });
function fixture(label, { page = PAGE, cat = catalogue(), debt = [debtEntry('K3'), debtEntry('K4')], noCatalogue = false, noPage = false } = {}) {
  const d = dir(label);
  mkdirSync(join(d, 'docs'));
  if (!noPage) writeFileSync(join(d, 'privacy.html'), page);
  if (!noCatalogue) writeFileSync(join(d, 'docs', 'claims.json'), JSON.stringify(cat, null, 2));
  if (debt) writeFileSync(join(d, 'docs', 'known-debt.json'), JSON.stringify({ claims: debt }, null, 2));
  return d;
}
// Ψεύτικη εφαρμογή: src/auth.ts με signInWithOtp, src/profile.ts με first_name, src/crash.ts με crash_reports, package.json χωρίς expo-location
function fakeApp(label, { auth = 'signInWithOtp', profile = 'first_name', crash = 'crash_reports', deps = { expo: '1' } } = {}) {
  const d = dir(`${label}-app`);
  mkdirSync(join(d, 'src'));
  mkdirSync(join(d, 'node_modules', 'junk'), { recursive: true });
  writeFileSync(join(d, 'node_modules', 'junk', 'index.js'), 'expo-location first_name crash_reports signInWithOtp'); // πρέπει να αγνοείται
  writeFileSync(join(d, 'src', 'auth.ts'), `export const a = '${auth}';\n`);
  writeFileSync(join(d, 'src', 'profile.ts'), `export const p = '${profile}';\n`);
  writeFileSync(join(d, 'src', 'crash.ts'), `export const c = '${crash}';\n`);
  writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: deps }));
  return d;
}

const results = [];
function record(ok, label, detail) {
  results.push(ok);
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// 0. Ο πραγματικός κατάλογος
{
  const r = run(ROOT, [], process.env.KNOWN_DEBT_TODAY ?? new Date().toISOString().slice(0, 10));
  record(r.code === 0, 'πραγματικός κατάλογος (χωρίς --app) → πράσινο', r.code === 0 ? r.out.trim().split('\n').pop() : `exit ${r.code}\n${r.out}`);
  const appDir = process.env.GOALASO_APP_DIR ?? join(ROOT, '..', 'goalaso');
  if (existsSync(appDir)) {
    const ra = run(ROOT, ['--app', appDir], process.env.KNOWN_DEBT_TODAY ?? new Date().toISOString().slice(0, 10));
    record(ra.code === 0, `πραγματικός κατάλογος ΜΕ --app ${appDir} → πράσινο`, ra.code === 0 ? ra.out.trim().split('\n').slice(-2).join(' · ') : `exit ${ra.code}\n${ra.out}`);
  } else {
    console.log(`  – παραλείφθηκε: ο φάκελος της εφαρμογής δεν υπάρχει εδώ (${appDir}) — η ξαναμέτρηση --app γίνεται τοπικά/στο app repo, ΟΧΙ επιτυχία`);
  }
}
{
  const r = run(fixture('synthetic-green'));
  record(r.code === 0 && r.out.includes('5 ισχυρισμοί'), 'συνθετικός κατάλογος → πράσινο', r.code === 0 ? 'exit 0, «5 ισχυρισμοί»' : `exit ${r.code}\n${r.out}`);
  if (r.code !== 0) console.log(r.out);
}

const MUTATIONS = [
  ['anchor-missing-from-page', 'δεν βρίσκεται', () => [fixture('anchor-missing', { page: PAGE.replace('Email address', 'E-mail') })]],
  ['invalid-result', 'measured.result', () => { const c = catalogue(); c.claims[0].measured.result = 'ΜΑΛΛΟΝ'; return [fixture('invalid-result', { cat: c })]; }],
  ['contradicted-without-debt', 'χωρίς εγγραφή', () => [fixture('no-debt', { debt: [debtEntry('K4')] })]],
  ['gap-without-debt', 'χωρίς εγγραφή', () => [fixture('gap-no-debt', { debt: [debtEntry('K3')] })]],
  ['dead-debt-confirmed-claim', 'ΝΕΚΡΗ', () => [fixture('dead-debt', { debt: [debtEntry('K3'), debtEntry('K4'), debtEntry('K1')] })]],
  ['debt-unknown-claim', 'ΝΕΚΡΗ', () => [fixture('debt-unknown', { debt: [debtEntry('K3'), debtEntry('K4'), debtEntry('K9')] })]],
  ['debt-expired', 'ΕΛΗΞΕ', () => [fixture('debt-expired', { debt: [debtEntry('K3', { expires: '2026-09-21' }), debtEntry('K4')] })], '2026-09-22'],
  ['measurement-too-old', 'ημερών', () => { const c = catalogue(); c.app.measuredAt = '2026-05-01'; return [fixture('too-old', { cat: c })]; }],
  ['claim-without-anchor', 'χωρίς anchor', () => { const c = catalogue(); delete c.claims[0].anchor; return [fixture('no-anchor', { cat: c })]; }],
  ['app-changed-present-claim-gone', 'ΑΛΛΑΞΕ', () => [fixture('app-gone'), '--app', fakeApp('app-gone', { auth: 'signInWithMagic' })]],
  ['app-changed-forbidden-dep-added', 'ΑΛΛΑΞΕ', () => [fixture('app-dep'), '--app', fakeApp('app-dep', { deps: { 'expo-location': '1' } })]],
  ['app-contradiction-resolved-debt-dead', 'ΝΕΚΡΟ χρέος', () => [fixture('app-resolved'), '--app', fakeApp('app-resolved', { profile: 'nickname' })]],
  ['app-gap-feature-gone', 'ΝΕΚΡΟ κενό', () => [fixture('app-gap-gone'), '--app', fakeApp('app-gap-gone', { crash: 'nothing' })]],
];
const INNOCENT = [
  ['wording-change-outside-anchors', '5 ισχυρισμοί', () => [fixture('wording', { page: PAGE.replace('για τον λογαριασμό', 'για τη δημιουργία λογαριασμού') })]],
  ['new-confirmed-claim-with-anchors', '6 ισχυρισμοί', () => { const c = catalogue(); c.claims.push(claim('K6', 'ΕΠΙΒΕΒΑΙΩΜΕΝΟΣ', 'absent', 'stripe', ['package.json'], GPS)); return [fixture('new-claim', { cat: c })]; }],
  ['app-all-agree', 'συμφωνούν', () => [fixture('app-agree'), '--app', fakeApp('app-agree')]],
];

let red = 0;
let green = 0;
let closed = 0;
for (const [label, expect, make, today] of MUTATIONS) {
  const [cwd, ...extra] = make();
  const r = run(cwd, extra, today);
  const ok = r.code === 1 && r.out.includes(expect);
  if (ok) red++;
  record(ok, `κόκκινο: ${label}`, ok ? `exit 1, «${expect}»` : `exit ${r.code}, περίμενα «${expect}»\n${r.out}`);
}
for (const [label, expect, make] of INNOCENT) {
  const [cwd, ...extra] = make();
  const r = run(cwd, extra);
  const ok = r.code === 0 && r.out.includes(expect);
  if (ok) green++;
  record(ok, `πράσινο: ${label}`, ok ? `exit 0, «${expect}»` : `exit ${r.code}, περίμενα «${expect}»\n${r.out}`);
}
for (const [label, make, expect] of [
  ['ο κατάλογος λείπει', () => [fixture('no-catalogue', { noCatalogue: true })], 'λείπει'],
  ['0 ισχυρισμοί', () => [fixture('zero-claims', { cat: catalogue({ claims: [] }) })], '0 ισχυρισμοί'],
  ['η σελίδα λείπει', () => [fixture('no-page', { noPage: true })], 'δεν υπάρχει'],
  ['--app φάκελος που δεν υπάρχει', () => [fixture('app-missing'), '--app', join(base, 'nope')], 'δεν υπάρχει'],
]) {
  const [cwd, ...extra] = make();
  const r = run(cwd, extra);
  const ok = r.code === 2 && r.out.includes(expect);
  if (ok) closed++;
  record(ok, `fail-closed: ${label} → exit 2`, `exit ${r.code}`);
}

rmSync(base, { recursive: true, force: true });
const failed = results.filter((x) => !x).length;
const tally = `claims:prove — ${red}/${MUTATIONS.length} μεταλλάξεις κόκκινες, ${green}/${INNOCENT.length} αθώες πράσινες, fail-closed ${closed}/4`;
if (failed) { console.log(`✗ ${tally} — ${failed} περιπτώσεις απέτυχαν`); process.exit(1); }
console.log(`✓ ${tally}`);
