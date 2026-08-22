#!/usr/bin/env node
// date:check — φύλακας της κλάσης G03 (docs/failure-catalogue/G03-hand-maintained-date.md).
// Σε κάθε σελίδα με γραμμή «Τελευταία ενημέρωση: D Μήνας YYYY», η ημερομηνία πρέπει να ισούται με την ημερομηνία
// (committer, YYYY-MM-DD, `git log --format=%cs`) του ΤΕΛΕΥΤΑΙΟΥ ΟΥΣΙΩΔΟΥΣ commit που άγγιξε το αρχείο.
// Μη ουσιώδη commits (τυπογραφικά, markup, lang attributes) δηλώνονται με [no-date] στο θέμα και αγνοούνται.
// Η συμφωνία EL ↔ EN της ίδιας ημερομηνίας είναι δουλειά του bilingual-check (G02).
// Γνωστό χρέος: docs/known-debt.json → "date": [{ file, pageDate, commitDate, reason, measured, expires }]
//   Η εγγραφή ισχύει ΜΟΝΟ αν ταιριάζει ακριβώς (ίδια pageDate ΚΑΙ ίδια commitDate) — αλλιώς ΝΕΚΡΗ → κόκκινο. Ληγμένη = κόκκινο.
// Χρήση:  node scripts/date-check.mjs [φάκελος]     (KNOWN_DEBT_TODAY=YYYY-MM-DD μόνο για την απόδειξη)
// Έξοδος: 0 = όλα καλά · 1 = σφάλματα · 2 = δεν μπορώ να κρίνω (όχι git repo, ρηχό clone, 0 σελίδες με ημερομηνία)

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listHtml, findDates, loadKnownDebt, todayISO } from './lib/pages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.argv[2] ?? join(HERE, '..'));
const TODAY = process.env.KNOWN_DEBT_TODAY ?? todayISO();

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function main() {
  const files = listHtml(ROOT);
  if (files === null) { console.log(`✗ date:check — ο φάκελος «${ROOT}» δεν υπάρχει — exit 2: δεν μπορώ να κρίνω`); return 2; }
  if (files.length === 0) { console.log(`✗ date:check — 0 αρχεία HTML στο «${ROOT}» — exit 2: δεν μπορώ να κρίνω`); return 2; }
  const inside = git(['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0 || inside.out !== 'true') { console.log(`✗ date:check — «${ROOT}» δεν είναι git repo — exit 2: χωρίς ιστορικό δεν μπορώ να κρίνω`); return 2; }
  if (git(['rev-parse', '--is-shallow-repository']).out === 'true') { console.log('✗ date:check — ρηχό clone (shallow) — exit 2: χρειάζεται πλήρες ιστορικό (actions/checkout fetch-depth: 0)'); return 2; }

  const debt = loadKnownDebt(ROOT, 'date', TODAY);
  const errors = [...debt.problems];
  const dated = [];
  const undated = [];
  let ok = 0;
  let debtUsed = 0;
  let skipped = 0;
  const debtNotes = [];

  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    const d = findDates(text);
    if (!d.el) { undated.push(f); continue; }
    dated.push(f);
    const entry = debt.entries.find((e) => e.file === f);
    if (!d.el.iso) { errors.push(`${f}:${d.el.line}: η ημερομηνία «${d.el.raw}» δεν διαβάζεται — περιμένω «D Μήνας YYYY» (π.χ. 3 Αυγούστου 2026)`); continue; }

    const log = git(['log', '--format=%h%x09%cs%x09%s', '--', f]);
    if (log.code !== 0) { errors.push(`${f}: git log απέτυχε — ${log.err}`); continue; }
    if (log.out === '') { errors.push(`${f}: χωρίς ιστορικό git (untracked ή νέο αρχείο χωρίς commit) — δεν μπορώ να κρίνω την ημερομηνία`); continue; }
    const commits = log.out.split('\n').map((l) => { const [h, date, ...s] = l.split('\t'); return { h, date, subject: s.join('\t') }; });
    const idx = commits.findIndex((c) => !/\[no-date\]/i.test(c.subject));
    if (idx === -1) { errors.push(`${f}: όλα τα ${commits.length} commits του αρχείου είναι [no-date] — κανένα ουσιώδες commit, δεν μπορώ να κρίνω`); continue; }
    skipped += idx;
    const last = commits[idx];

    if (d.el.iso === last.date) {
      ok++;
      if (entry) errors.push(`${f}: ΝΕΚΡΗ εξαίρεση στο known-debt.json — η ημερομηνία ${d.el.iso} ταιριάζει πια με το commit ${last.h}· αφαίρεσε την εγγραφή, η καστάνια μόνο κατεβαίνει`);
    } else if (entry && entry.pageDate === d.el.iso && entry.commitDate === last.date) {
      debtUsed++;
      debtNotes.push(`${f} ${entry.pageDate} ≠ ${entry.commitDate}, λήγει ${entry.expires}`);
    } else if (entry) {
      errors.push(`${f}: ΝΕΚΡΗ εξαίρεση στο known-debt.json — καταγράφει σελίδα ${entry.pageDate} / commit ${entry.commitDate}, αλλά τώρα σελίδα ${d.el.iso} / commit ${last.date} (${last.h})· η κατάσταση άλλαξε, αποφάσισε ξανά`);
    } else {
      errors.push(`${f}:${d.el.line}: ημερομηνία σελίδας ${d.el.iso} («${d.el.raw}») ≠ τελευταίο ουσιώδες commit ${last.h} ${last.date} («${last.subject}») — ενημέρωσε την ημερομηνία ή σήμανε το commit [no-date]`);
    }
  }

  for (const e of debt.entries) {
    if (!dated.includes(e.file)) errors.push(`known-debt.json[date] ${e.file}: ΝΕΚΡΗ εξαίρεση — δεν είναι σελίδα με ημερομηνία στο repo· αφαίρεσέ την`);
  }

  if (dated.length === 0) { console.log(`✗ date:check — 0 σελίδες με «Τελευταία ενημέρωση» (${files.length} αρχεία) — exit 2: δεν μπορώ να κρίνω`); return 2; }
  for (const e of errors) console.log(`  ${e}`);
  if (errors.length) {
    console.log(`✗ date:check — ${errors.length} σφάλματα σε ${dated.length} σελίδες με ημερομηνία (${dated.join(', ')})`);
    return 1;
  }
  const debtNote = debtUsed ? ` (+${debtUsed} γνωστό χρέος: ${debtNotes.join('; ')})` : '';
  console.log(`✓ date:check — ${dated.length} σελίδες με ημερομηνία (${dated.join(', ')}), ${undated.length} χωρίς (${undated.join(', ') || '—'}), ${ok}/${dated.length} = τελευταίο ουσιώδες commit${debtNote}, ${skipped} [no-date] commits αγνοήθηκαν`);
  return 0;
}

process.exit(main());
