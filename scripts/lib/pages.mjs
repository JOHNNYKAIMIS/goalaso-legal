// Κοινός κορμός των φυλάκων G02 (bilingual-check) και G03 (date-check):
// εύρεση σελίδων, διαχωρισμός ελληνικού/αγγλικού τμήματος, ανάγνωση ημερομηνιών, γνωστό χρέος.
// Καμία εξάρτηση — Node ≥ 18.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Τα *.html της ρίζας (μη αναδρομικά), ταξινομημένα. null = ο φάκελος δεν υπάρχει.
export function listHtml(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  return readdirSync(dir).filter((f) => /\.html?$/i.test(f) && statSync(join(dir, f)).isFile()).sort();
}

export function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

// Δίγλωσση σελίδα = δύο <h1>: ελληνικό τμήμα από το 1ο <h1> ως το 2ο, αγγλικό από το 2ο <h1> ως το </body>.
// null = μονόγλωσση (λιγότερα από δύο <h1>).
export function splitBilingual(text) {
  const h1 = [...text.matchAll(/<h1\b/gi)].map((m) => m.index);
  if (h1.length < 2) return null;
  const bodyEnd = text.search(/<\/body>/i);
  const enEnd = bodyEnd === -1 ? text.length : bodyEnd;
  return { el: text.slice(h1[0], h1[1]), en: text.slice(h1[1], enEnd), elStart: h1[0], enStart: h1[1], enEnd };
}

const EL_MONTHS = {
  'ιανουαρίου': 1, 'φεβρουαρίου': 2, 'μαρτίου': 3, 'απριλίου': 4, 'μαΐου': 5, 'ιουνίου': 6,
  'ιουλίου': 7, 'αυγούστου': 8, 'σεπτεμβρίου': 9, 'οκτωβρίου': 10, 'νοεμβρίου': 11, 'δεκεμβρίου': 12,
};
const EN_MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// «4 Αυγούστου 2026» → 2026-08-04 · null αν δεν διαβάζεται
export function parseGreekDate(s) {
  const m = /^\s*(\d{1,2})\s+(\p{L}+)\s+(\d{4})\s*$/u.exec(s);
  if (!m) return null;
  const mon = EL_MONTHS[m[2].toLowerCase()];
  return mon ? iso(m[3], mon, Number(m[1])) : null;
}

// «August 4, 2026» → 2026-08-04 · null αν δεν διαβάζεται
export function parseEnglishDate(s) {
  const m = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(s);
  if (!m) return null;
  const mon = EN_MONTHS[m[1].toLowerCase()];
  return mon ? iso(m[3], mon, Number(m[2])) : null;
}

// Οι γραμμές «Τελευταία ενημέρωση: …» (EL) και «Last updated: …» (EN). Ανά γλώσσα: { raw, iso, line } ή null.
export function findDates(text) {
  const el = /Τελευταία ενημέρωση:\s*([^<\n]*)/u.exec(text);
  const en = /Last updated:\s*([^<\n]*)/.exec(text);
  return {
    el: el ? { raw: el[1].trim(), iso: parseGreekDate(el[1]), line: lineOf(text, el.index) } : null,
    en: en ? { raw: en[1].trim(), iso: parseEnglishDate(en[1]), line: lineOf(text, en.index) } : null,
  };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// docs/known-debt.json — γνωστό χρέος που ΕΠΙΤΡΕΠΕΤΑΙ να μείνει, ΑΠΑΓΟΡΕΥΕΤΑΙ να μεγαλώσει.
// Κάθε εγγραφή της κατηγορίας: file, reason, measured, expires (YYYY-MM-DD) + πεδία ανά κατηγορία.
// Ληγμένη εγγραφή = πρόβλημα (ο φύλακας κοκκινίζει μέχρι να αποφασιστεί). Επιστρέφει { entries, problems, file }.
export function loadKnownDebt(dir, category, today) {
  const file = join(dir, 'docs', 'known-debt.json');
  if (!existsSync(file)) return { entries: [], problems: [], file };
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { return { entries: [], problems: [`known-debt.json: μη έγκυρο JSON (${e.message})`], file }; }
  const entries = Array.isArray(data[category]) ? data[category] : [];
  const problems = [];
  for (const e of entries) {
    for (const k of ['file', 'reason', 'measured', 'expires']) {
      if (!e[k]) problems.push(`known-debt.json[${category}] ${e.file ?? '?'}: εγγραφή χωρίς «${k}» — κάθε εξαίρεση θέλει λόγο, μέτρηση και λήξη`);
    }
    if (e.expires && today > e.expires) {
      problems.push(`known-debt.json[${category}] ${e.file}: η εξαίρεση ΕΛΗΞΕ στις ${e.expires} — αποφάσισε: διόρθωσε το αρχείο ή ανανέωσε τη λήξη με νέο λόγο`);
    }
  }
  return { entries, problems, file };
}
