#!/usr/bin/env node
// claims:check — φύλακας της κλάσης G01 (docs/failure-catalogue/G01-policy-lags-app.md):
// η πολιτική απορρήτου ισχυρίζεται πράγματα για την ΕΦΑΡΜΟΓΗ, που ζει σε άλλο repo. Ο κατάλογος docs/claims.json
// δένει κάθε ισχυρισμό (α) με το κείμενο της σελίδας (anchor EL + EN — αν αλλάξει το κείμενο, ο κατάλογος πρέπει
// να ενημερωθεί) και (β) με μια μέτρηση στον κώδικα της εφαρμογής (pattern που πρέπει να υπάρχει ή να λείπει).
//   - χωρίς --app: ελέγχει anchors, πληρότητα, ότι κάθε ΔΙΑΨΕΥΣΜΕΝΟΣ/ΚΕΝΟ ισχυρισμός έχει εγγραφή στο known-debt.json
//     (λόγος + λήξη), ότι δεν υπάρχουν ΝΕΚΡΕΣ εγγραφές, και ότι η μέτρηση στην εφαρμογή δεν είναι παλιότερη από
//     maxAgeDays (το μόνο που μπορεί να κάνει αυτό το repo για να μην «ξεχαστεί» η εφαρμογή)
//   - με --app <φάκελος της εφαρμογής>: ΞΑΝΑΜΕΤΡΑ κάθε ισχυρισμό στον κώδικα και κοκκινίζει αν η εφαρμογή άλλαξε
//     ενώ η πολιτική όχι (ή αν ένα χρέος δεν ισχύει πια — η καστάνια μόνο κατεβαίνει)
// Χρήση:  node scripts/claims-check.mjs [--app ΦΑΚΕΛΟΣ] [--cwd REPO]      (KNOWN_DEBT_TODAY μόνο για την απόδειξη)
// Έξοδος: 0 = όλα καλά · 1 = σφάλματα · 2 = δεν μπορώ να κρίνω (κατάλογος/σελίδα/φάκελος εφαρμογής δεν υπάρχουν, 0 ισχυρισμοί)

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadKnownDebt, todayISO } from './lib/pages.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] : undefined; };
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(opt('cwd') ?? join(HERE, '..'));
const APP = opt('app') ? resolve(opt('app')) : null;
const TODAY = process.env.KNOWN_DEBT_TODAY ?? todayISO();

const RESULTS = ['ΕΠΙΒΕΒΑΙΩΜΕΝΟΣ', 'ΔΙΑΨΕΥΣΜΕΝΟΣ', 'ΚΕΝΟ', 'ΔΕΝ ΕΛΕΓΧΕΤΑΙ ΑΥΤΟΜΑΤΑ', 'ΔΕΝ ΜΕΤΡΗΘΗΚΕ'];
const NEEDS_DEBT = new Set(['ΔΙΑΨΕΥΣΜΕΝΟΣ', 'ΚΕΝΟ']);
const KINDS = ['present', 'absent', 'manual'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.expo', 'coverage', 'build', '.next', 'android', 'ios']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.sql', '.md', '.yml', '.yaml', '.toml', '.html', '.css', '.txt']);

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Πόσα αρχεία κάτω από τα paths (σχετικά με το app) ταιριάζουν στο pattern. Επιστρέφει { count, sample }.
function grepApp(app, paths, pattern) {
  const re = new RegExp(pattern, 'i');
  const hits = [];
  const walk = (p) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(p.split(/[\\/]/).pop())) return;
      for (const f of readdirSync(p)) walk(join(p, f));
      return;
    }
    if (!TEXT_EXT.has(extname(p).toLowerCase()) || st.size > 2 * 1024 * 1024) return;
    if (re.test(readFileSync(p, 'utf8'))) hits.push(relative(app, p).replace(/\\/g, '/'));
  };
  for (const rel of paths) walk(join(app, rel));
  return { count: hits.length, sample: hits.slice(0, 3) };
}

function main() {
  const catFile = join(ROOT, 'docs', 'claims.json');
  if (!existsSync(catFile)) { console.log(`✗ claims:check — λείπει ${catFile} — exit 2: δεν μπορώ να κρίνω`); return 2; }
  let cat;
  try { cat = JSON.parse(readFileSync(catFile, 'utf8')); } catch (e) { console.log(`✗ claims:check — docs/claims.json μη έγκυρο JSON (${e.message}) — exit 2`); return 2; }
  const claims = Array.isArray(cat.claims) ? cat.claims : [];
  if (claims.length === 0) { console.log('✗ claims:check — 0 ισχυρισμοί στον κατάλογο — exit 2: δεν μπορώ να κρίνω'); return 2; }
  const pageFile = join(ROOT, cat.page ?? '');
  if (!cat.page || !existsSync(pageFile)) { console.log(`✗ claims:check — η σελίδα «${cat.page}» δεν υπάρχει — exit 2`); return 2; }
  if (APP && (!existsSync(APP) || !statSync(APP).isDirectory())) { console.log(`✗ claims:check — ο φάκελος της εφαρμογής «${APP}» δεν υπάρχει — exit 2: δεν μπορώ να κρίνω`); return 2; }
  const page = readFileSync(pageFile, 'utf8');
  const maxAge = Number(cat.maxAgeDays ?? 60);

  const debt = loadKnownDebt(ROOT, 'claims', TODAY);
  const errors = [...debt.problems];
  const tally = Object.fromEntries(RESULTS.map((r) => [r, 0]));
  const ids = new Set();
  let anchored = 0;
  let covered = 0;

  for (const c of claims) {
    const id = c.id ?? '?';
    if (!c.id || ids.has(c.id)) errors.push(`${id}: λείπει ή διπλό id`);
    ids.add(c.id);
    if (!c.claim) errors.push(`${id}: λείπει «claim» (τι ισχυρίζεται η πολιτική)`);
    const result = c.measured?.result;
    if (!c.measured?.date || !RESULTS.includes(result)) errors.push(`${id}: measured.date / measured.result λείπει ή άκυρο — επιτρέπονται ${RESULTS.join(' | ')}`);
    else tally[result]++;
    if (!c.app || !KINDS.includes(c.app.kind)) errors.push(`${id}: app.kind λείπει — επιτρέπονται ${KINDS.join(' | ')}`);
    else if (c.app.kind !== 'manual' && (!c.app.pattern || !Array.isArray(c.app.paths) || c.app.paths.length === 0)) errors.push(`${id}: app.pattern / app.paths λείπουν — χωρίς αυτά ο ισχυρισμός δεν μετριέται`);
    if (c.anchor) {
      for (const lang of ['el', 'en']) {
        if (!c.anchor[lang]) errors.push(`${id}: λείπει anchor.${lang}`);
        else if (!page.includes(c.anchor[lang])) errors.push(`${id}: anchor ${lang.toUpperCase()} «${c.anchor[lang]}» δεν βρίσκεται στο ${cat.page} — το κείμενο άλλαξε ή ο κατάλογος είναι παλιός`);
      }
      if (c.anchor.el && c.anchor.en && page.includes(c.anchor.el) && page.includes(c.anchor.en)) anchored++;
    } else if (result !== 'ΚΕΝΟ') errors.push(`${id}: χωρίς anchor — μόνο τα ΚΕΝΑ (όσα η πολιτική δεν λέει καθόλου) επιτρέπεται να μην έχουν`);
    const entry = debt.entries.find((e) => e.claim === c.id);
    if (NEEDS_DEBT.has(result)) {
      if (!entry) errors.push(`${id} ${result} χωρίς εγγραφή στο known-debt.json[claims] — κάθε ψευδής ή ελλιπής δήλωση της πολιτικής θέλει λόγο και λήξη`);
      else covered++;
    } else if (entry) errors.push(`${id}: ΝΕΚΡΗ εξαίρεση στο known-debt.json — ο ισχυρισμός είναι ${result}, αφαίρεσε την εγγραφή`);
  }
  for (const e of debt.entries) if (!ids.has(e.claim)) errors.push(`known-debt.json[claims] «${e.claim}»: ΝΕΚΡΗ εξαίρεση — δεν υπάρχει τέτοιος ισχυρισμός στον κατάλογο`);

  const measuredAt = cat.app?.measuredAt;
  const age = measuredAt ? daysBetween(measuredAt, TODAY) : null;
  if (age === null || Number.isNaN(age)) errors.push('app.measuredAt λείπει — πότε μετρήθηκε τελευταία φορά ο κώδικας της εφαρμογής;');
  else if (age > maxAge) errors.push(`η μέτρηση στον κώδικα της εφαρμογής είναι ${age} ημερών (> ${maxAge}) — ξαναμέτρησε: node scripts/claims-check.mjs --app <φάκελος>, ενημέρωσε measuredAt/commit`);

  // --app: ξαναμέτρηση στον κώδικα
  let appLine = `  app-side: μετρήθηκε ${measuredAt ?? '?'} @ ${cat.app?.commit ?? '?'} (πριν ${age ?? '?'} ημέρες)· ΔΕΝ ξαναμετρήθηκε τώρα — δώσε --app <φάκελος>`;
  if (APP) {
    const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: APP, encoding: 'utf8' });
    const appSha = sha.status === 0 ? sha.stdout.trim() : '(όχι git)';
    let checked = 0;
    let agree = 0;
    let manual = 0;
    for (const c of claims) {
      if (!c.app || c.app.kind === 'manual' || !c.app.pattern) { manual++; continue; }
      checked++;
      const { count, sample } = grepApp(APP, c.app.paths, c.app.pattern);
      const holds = c.app.kind === 'present' ? count > 0 : count === 0;
      const result = c.measured?.result;
      const where = sample.length ? ` (${sample.join(', ')})` : '';
      if (result === 'ΕΠΙΒΕΒΑΙΩΜΕΝΟΣ') {
        if (holds) agree++;
        else errors.push(`${c.id}: η εφαρμογή ΑΛΛΑΞΕ — «${c.claim}» δεν ισχύει πια στον κώδικα (${c.app.kind} «${c.app.pattern}» → ${count} αρχεία${where}) — ενημέρωσε πολιτική (ουσιώδης αλλαγή → νέα ημερομηνία), κατάλογο και known-debt`);
      } else if (result === 'ΔΙΑΨΕΥΣΜΕΝΟΣ') {
        if (!holds) agree++;
        else errors.push(`${c.id}: ΝΕΚΡΟ χρέος — «${c.claim}» ισχύει πια στον κώδικα (${c.app.kind} «${c.app.pattern}» → ${count} αρχεία)· κάνε τον ΕΠΙΒΕΒΑΙΩΜΕΝΟ και αφαίρεσε την εγγραφή`);
      } else if (result === 'ΚΕΝΟ') {
        if (holds) agree++;
        else errors.push(`${c.id}: ΝΕΚΡΟ κενό — η λειτουργία «${c.claim}» δεν βρίσκεται πια στον κώδικα («${c.app.pattern}» → ${count} αρχεία)· αφαίρεσέ το από κατάλογο και known-debt`);
      } else {
        agree += holds ? 1 : 0;
        if (!holds) errors.push(`${c.id}: ${result} αλλά η μέτρηση τώρα δεν συμφωνεί («${c.app.pattern}» → ${count} αρχεία) — αποφάσισε και ενημέρωσε measured`);
      }
    }
    appLine = `  app-side τώρα: ${APP} @ ${appSha} — ${agree}/${checked} ισχυρισμοί συμφωνούν με τον κατάλογο, ${manual} χειροκίνητοι`;
  }

  for (const e of errors) console.log(`  ${e}`);
  console.log(appLine);
  const counts = RESULTS.filter((r) => tally[r]).map((r) => `${tally[r]} ${r}`).join(', ');
  if (errors.length) {
    console.log(`✗ claims:check — ${errors.length} σφάλματα σε ${claims.length} ισχυρισμούς (${cat.page})`);
    return 1;
  }
  console.log(`✓ claims:check — ${claims.length} ισχυρισμοί δεμένοι με ${cat.page} (anchors EL+EN ${anchored}/${claims.filter((c) => c.anchor).length}): ${counts}· ${covered} σε γνωστό χρέος με λήξη`);
  return 0;
}

process.exit(main());
