#!/usr/bin/env node
// html:check — φύλακας της κλάσης G04 (docs/failure-catalogue/G04-nothing-runs-on-push.md):
//   (α) δομική εγκυρότητα HTML: <!doctype html>, <html lang>, <title>, ισοζύγιο tags, attributes με εισαγωγικά
//   (β) εσωτερικά links (href/src σχετικά) δείχνουν σε υπαρκτό αρχείο
//   (γ) κωδικοποίηση: έγκυρο UTF-8 χωρίς BOM, <meta charset="utf-8">, 0 mojibake
// ΔΕΝ ελέγχει: πλήρη συμμόρφωση W3C, εξωτερικά links (μετρώνται μόνο), τέλη γραμμής CRLF.
// Αυστηρότερο από το HTML spec σε ένα σημείο: κάθε μη-void στοιχείο πρέπει να κλείνει ρητά (</p>, </li>).
// Χρήση:  node scripts/html-check.mjs [φάκελος]      (προεπιλογή: η ρίζα του repo, μη αναδρομικά)
// Έξοδος: 0 = όλα καλά · 1 = βρέθηκαν σφάλματα · 2 = δεν μπορώ να κρίνω (φάκελος ή αρχεία HTML δεν υπάρχουν)
// Καμία εξάρτηση — Node ≥ 18. Η απόδειξη ότι κοκκινίζει: scripts/html-prove.mjs

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.argv[2] ?? join(HERE, '..'));

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['style', 'script']);
// UTF-8 που διαβάστηκε ως Windows-1252: lead byte Ã/Î/Ï/â + continuation (Latin-1 0x80-0xBF ή ο χαρακτήρας
// του cp1252 για τα 0x80-0x9F), ή U+FFFD (replacement character).
const MOJIBAKE = /[ÃÎÏâ](?:[-¿]|[€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ])|�/;
// Ένα token: σχόλιο | doctype | tag κλεισίματος | tag ανοίγματος (με attributes)
const TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
// Ένα attribute μέσα στο tag: όνομα και προαιρετική τιμή (με ή χωρίς εισαγωγικά). Σαρώνεται attribute-attribute,
// ώστε ένα «=» ΜΕΣΑ σε τιμή με εισαγωγικά (content="width=device-width") να μη μετρά ως τιμή χωρίς εισαγωγικά.
const ATTR = /\s+[^\s=>\/"']+(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
const LINK = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function checkFile(file) {
  const errors = [];
  const rel = relative(ROOT, file);
  const err = (line, msg) => errors.push(`${rel}:${line}: ${msg}`);

  const bytes = readFileSync(file);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) err(1, 'BOM στην αρχή — θέλουμε UTF-8 χωρίς BOM');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { err(0, 'μη έγκυρο UTF-8 (πιθανόν γράφτηκε ως Windows-1252)'); return { errors, counts: null }; }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const line = (i) => text.slice(0, i).split('\n').length;

  // (γ) κωδικοποίηση
  const mm = MOJIBAKE.exec(text);
  if (mm) err(line(mm.index), `mojibake «${mm[0]}» — UTF-8 που πέρασε από Windows-1252`);
  if (!/<meta\s+charset\s*=\s*["']?utf-8["']?\s*\/?>/i.test(text)) err(0, 'λείπει <meta charset="utf-8">');

  // (α) κεφαλή
  if (!/^\s*<!doctype\s+html\s*>/i.test(text)) err(1, 'λείπει <!doctype html> στην αρχή');
  const html = /<html\b([^>]*)>/i.exec(text);
  if (!html) err(0, 'λείπει <html>');
  else if (!/\blang\s*=\s*["'][a-zA-Z]{2,}/.test(html[1])) err(line(html.index), '<html> χωρίς lang="…"');
  const title = /<title>([^<]*)<\/title>/i.exec(text);
  if (!title || !title[1].trim()) err(0, 'λείπει ή κενός <title>');

  // (α) ισοζύγιο tags
  const stack = [];
  let pos = 0;
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    const stray = text.slice(pos, m.index).indexOf('<');
    if (stray !== -1) err(line(pos + stray), 'αδέσποτο «<» ή σπασμένο tag');
    pos = TOKEN.lastIndex;
    const [, closeName, openName, attrs, selfClose] = m;
    if (closeName) {
      const name = closeName.toLowerCase();
      const depth = stack.map((s) => s.name).lastIndexOf(name);
      if (depth === -1) { err(line(m.index), `</${name}> χωρίς άνοιγμα`); continue; }
      while (stack.length - 1 > depth) { const o = stack.pop(); err(o.line, `<${o.name}> δεν έκλεισε πριν το </${name}>`); }
      stack.pop();
    } else if (openName) {
      const name = openName.toLowerCase();
      let am;
      ATTR.lastIndex = 0;
      while ((am = ATTR.exec(attrs)) !== null) {
        if (am[1] !== undefined && !/^["']/.test(am[1])) { err(line(m.index), `<${name}> τιμή attribute χωρίς εισαγωγικά (${am[0].trim()})`); break; }
      }
      if (VOID.has(name)) continue;
      if (selfClose) { err(line(m.index), `<${name}/> self-closing σε μη-void στοιχείο`); continue; }
      stack.push({ name, line: line(m.index) });
      if (RAW_TEXT.has(name)) {
        const end = text.toLowerCase().indexOf(`</${name}`, pos);
        if (end === -1) { pos = text.length; break; }
        pos = end;
        TOKEN.lastIndex = end;
      }
    }
  }
  const strayTail = text.slice(pos).indexOf('<');
  if (strayTail !== -1) err(line(pos + strayTail), 'αδέσποτο «<» ή σπασμένο tag');
  for (const o of stack) err(o.line, `<${o.name}> δεν έκλεισε`);

  // (β) links
  const counts = { internal: 0, internalOk: 0, external: 0, mailto: 0, other: 0 };
  let lm;
  LINK.lastIndex = 0;
  while ((lm = LINK.exec(text)) !== null) {
    const url = (lm[1] ?? lm[2]).trim();
    if (/^(?:https?:)?\/\//i.test(url)) counts.external++;
    else if (/^mailto:/i.test(url)) counts.mailto++;
    else if (url === '' || /^(?:#|tel:|data:|javascript:)/i.test(url)) counts.other++;
    else {
      counts.internal++;
      const target = resolve(dirname(file), decodeURIComponent(url.split(/[?#]/)[0]));
      if (existsSync(target)) counts.internalOk++;
      else err(line(lm.index), `νεκρό εσωτερικό link «${url}» → ${relative(ROOT, target)} δεν υπάρχει`);
    }
  }
  return { errors, counts };
}

function main() {
  if (!existsSync(ROOT) || !statSync(ROOT).isDirectory()) {
    console.log(`✗ html:check — ο φάκελος «${ROOT}» δεν υπάρχει — exit 2: δεν μπορώ να κρίνω`);
    return 2;
  }
  const files = readdirSync(ROOT).filter((f) => /\.html?$/i.test(f) && statSync(join(ROOT, f)).isFile()).sort();
  if (files.length === 0) {
    console.log(`✗ html:check — 0 αρχεία HTML στο «${ROOT}» — exit 2: δεν μπορώ να κρίνω (κενός πληθυσμός ≠ «όλα καλά»)`);
    return 2;
  }
  const total = { internal: 0, internalOk: 0, external: 0, mailto: 0, other: 0 };
  const allErrors = [];
  let badFiles = 0;
  for (const f of files) {
    const { errors, counts } = checkFile(join(ROOT, f));
    if (errors.length) { badFiles++; allErrors.push(...errors); }
    if (counts) for (const k of Object.keys(total)) total[k] += counts[k];
  }
  for (const e of allErrors) console.log(`  ${e}`);
  if (allErrors.length) {
    console.log(`✗ html:check — ${allErrors.length} σφάλματα σε ${badFiles}/${files.length} αρχεία (${files.join(', ')})`);
    return 1;
  }
  console.log(`✓ html:check — ${files.length} αρχεία (${files.join(', ')}), ${total.internal} εσωτερικά links (${total.internalOk} υπαρκτά), ${total.external} εξωτερικά (ΔΕΝ ελέγχθηκαν), ${total.mailto} mailto, 0 mojibake, UTF-8 χωρίς BOM ${files.length}/${files.length}`);
  return 0;
}

process.exit(main());
