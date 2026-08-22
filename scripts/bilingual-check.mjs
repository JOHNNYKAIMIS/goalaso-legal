#!/usr/bin/env node
// bilingual:check — φύλακας της κλάσης G02 (docs/failure-catalogue/G02-bilingual-divergence.md).
// Σε κάθε ΔΙΓΛΩΣΣΗ σελίδα (δύο <h1>: ελληνικό τμήμα, μετά αγγλικό) τα δύο μισά πρέπει να έχουν:
//   - ίδιο πλήθος <h2>, <ul>, <li>, <a>, <p> (το EL-only <p class="lang-note"> εξαιρείται)
//   - ίδια ημερομηνία: «Τελευταία ενημέρωση: D Μήνας YYYY» = «Last updated: Month D, YYYY»
//   - το αγγλικό τμήμα να ανοίγει μέσα σε στοιχείο lang="en" (αλλιώς screen readers/μεταφραστές το διαβάζουν ως ελληνικά)
// ΔΕΝ πιάνει σημασιολογική απόκλιση (πρόταση που λέει άλλο πράγμα στη μία γλώσσα) — μόνο δομή, αρίθμηση, ημερομηνία, γλώσσα.
// Γνωστό χρέος: docs/known-debt.json → "bilingual": [{ file, issue: "lang-en-missing", reason, measured, expires }]
//   Εγγραφή που δεν καλύπτει πια τίποτα = ΝΕΚΡΗ → κόκκινο μέχρι να αφαιρεθεί (η καστάνια μόνο κατεβαίνει). Ληγμένη = κόκκινο.
// Χρήση:  node scripts/bilingual-check.mjs [φάκελος]     (KNOWN_DEBT_TODAY=YYYY-MM-DD μόνο για την απόδειξη)
// Έξοδος: 0 = όλα καλά · 1 = σφάλματα · 2 = δεν μπορώ να κρίνω (φάκελος/αρχεία/δίγλωσσες σελίδες δεν υπάρχουν)

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listHtml, splitBilingual, findDates, loadKnownDebt, todayISO } from './lib/pages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.argv[2] ?? join(HERE, '..'));
const TODAY = process.env.KNOWN_DEBT_TODAY ?? todayISO();
const TAGS = ['h2', 'ul', 'li', 'a', 'p'];
const ISSUE = 'lang-en-missing';

function count(html, tag) {
  let n = 0;
  for (const m of html.matchAll(new RegExp(`<${tag}(?=[\\s>])[^>]*>`, 'gi'))) {
    if (tag === 'p' && /class="lang-note"/.test(m[0])) continue;
    n++;
  }
  return n;
}

function main() {
  const files = listHtml(ROOT);
  if (files === null) { console.log(`✗ bilingual:check — ο φάκελος «${ROOT}» δεν υπάρχει — exit 2: δεν μπορώ να κρίνω`); return 2; }
  if (files.length === 0) { console.log(`✗ bilingual:check — 0 αρχεία HTML στο «${ROOT}» — exit 2: δεν μπορώ να κρίνω`); return 2; }

  const debt = loadKnownDebt(ROOT, 'bilingual', TODAY);
  const errors = [...debt.problems];
  const bilingual = [];
  const mono = [];
  const tally = Object.fromEntries(TAGS.map((t) => [t, []]));
  let datesEqual = 0;
  let langOk = 0;
  let langDebt = 0;

  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    const parts = splitBilingual(text);
    if (!parts) { mono.push(f); continue; }
    bilingual.push(f);

    for (const t of TAGS) {
      const a = count(parts.el, t);
      const b = count(parts.en, t);
      tally[t].push(`${a}=${b}`);
      if (a !== b) errors.push(`${f}: <${t}> EL=${a} ≠ EN=${b} — κάτι προστέθηκε ή αφαιρέθηκε μόνο στη μία γλώσσα`);
    }

    const d = findDates(text);
    if (!d.el || !d.en) errors.push(`${f}: λείπει η γραμμή «Τελευταία ενημέρωση» (EL) ή «Last updated» (EN)`);
    else if (!d.el.iso || !d.en.iso) errors.push(`${f}:${(d.el.iso ? d.en : d.el).line}: ημερομηνία δεν διαβάζεται — EL «${d.el.raw}» / EN «${d.en.raw}»`);
    else if (d.el.iso !== d.en.iso) errors.push(`${f}:${d.el.line}: ημερομηνίες διαφέρουν — EL ${d.el.iso} («${d.el.raw}») ≠ EN ${d.en.iso} («${d.en.raw}»)`);
    else datesEqual++;

    const before = text.slice(Math.max(0, parts.enStart - 400), parts.enStart);
    const hasLang = /lang\s*=\s*["']en["']/i.test(before);
    const entry = debt.entries.find((e) => e.file === f && e.issue === ISSUE);
    if (hasLang) {
      langOk++;
      if (entry) errors.push(`${f}: ΝΕΚΡΗ εξαίρεση στο known-debt.json (${ISSUE}) — το αρχείο έχει πια lang="en"· αφαίρεσε την εγγραφή, η καστάνια μόνο κατεβαίνει`);
    } else if (entry) {
      langDebt++;
    } else {
      errors.push(`${f}: το αγγλικό τμήμα (από το 2ο <h1>) δεν ανοίγει μέσα σε στοιχείο lang="en" — screen readers/μεταφραστές το διαβάζουν ως ελληνικά`);
    }
  }

  for (const e of debt.entries) {
    if (e.issue !== ISSUE) errors.push(`known-debt.json[bilingual] ${e.file}: άγνωστο issue «${e.issue}» — ο φύλακας ξέρει μόνο ${ISSUE}`);
    else if (!bilingual.includes(e.file)) errors.push(`known-debt.json[bilingual] ${e.file}: ΝΕΚΡΗ εξαίρεση — δεν είναι δίγλωσση σελίδα του repo· αφαίρεσέ την`);
  }

  if (bilingual.length === 0) {
    console.log(`✗ bilingual:check — 0 δίγλωσσες σελίδες (${files.length} αρχεία, όλα μονόγλωσσα) — exit 2: δεν μπορώ να κρίνω`);
    return 2;
  }
  for (const e of errors) console.log(`  ${e}`);
  const shape = TAGS.map((t) => `${t} ${tally[t].join('/')}`).join(' · ');
  const debtNote = langDebt ? ` (+${langDebt} γνωστό χρέος, λήγει ${debt.entries.map((e) => e.expires).sort()[0]})` : '';
  if (errors.length) {
    console.log(`✗ bilingual:check — ${errors.length} σφάλματα σε ${bilingual.length} δίγλωσσες σελίδες (${bilingual.join(', ')})`);
    return 1;
  }
  console.log(`✓ bilingual:check — ${bilingual.length} δίγλωσσες σελίδες (${bilingual.join(', ')}), ${mono.length} μονόγλωσσες παραλείφθηκαν (${mono.join(', ') || '—'}), ${shape}, ημερομηνίες EL=EN ${datesEqual}/${bilingual.length}, lang="en" ${langOk}/${bilingual.length}${debtNote}`);
  return 0;
}

process.exit(main());
