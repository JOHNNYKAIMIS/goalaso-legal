#!/usr/bin/env node
// deploy:check — φύλακας της κλάσης G05 (docs/failure-catalogue/G05-live-diverges-from-main.md):
// το ζωντανό site (GitHub Pages) σερβίρει byte-προς-byte ό,τι έχει το main.
// Για κάθε *.html του main (git show origin/main:<αρχείο>) κατεβάζει <base>/<αρχείο> ΧΩΡΙΣ CDN cache
// (cache-buster στο URL + Cache-Control: no-cache — το Pages στέλνει max-age=600) και συγκρίνει bytes.
// Περιμένει (polling) μέχρι το παράθυρο — το deploy του Pages θέλει δευτερόλεπτα έως λεπτά μετά το push.
// Συγκρίνει με το main, ΟΧΙ με το checkout: σε PR που αλλάζει HTML το live εξακολουθεί να είναι το main.
// Χρήση:  node scripts/deploy-check.mjs [--base URL] [--ref origin/main] [--dir ΦΑΚΕΛΟΣ] [--cwd REPO] [--timeout S] [--interval S]
//   --dir: σύγκριση με τα αρχεία ενός φακέλου αντί για git ref (για την απόδειξη)
//   env DEPLOY_CHECK_TIMEOUT / DEPLOY_CHECK_INTERVAL (δευτερόλεπτα) = προεπιλογές για --timeout / --interval
// Έξοδος: 0 = ταυτίζονται · 1 = διαφέρουν ή HTTP σφάλμα μετά το παράθυρο · 2 = δεν μπορώ να κρίνω (ref/αρχεία δεν υπάρχουν, καμία απάντηση δικτύου)

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE = 'https://johnnykaimis.github.io/goalaso-legal/'; // gh api repos/JOHNNYKAIMIS/goalaso-legal/pages --jq .html_url

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(opt('cwd', join(HERE, '..')));
const BASE = opt('base', DEFAULT_BASE).replace(/\/?$/, '/');
const REF = opt('ref', 'origin/main');
const DIR = opt('dir', null);
const TIMEOUT = Number(opt('timeout', process.env.DEPLOY_CHECK_TIMEOUT ?? 60)) * 1000;
const INTERVAL = Number(opt('interval', process.env.DEPLOY_CHECK_INTERVAL ?? 10)) * 1000;

function git(gitArgs, encoding = 'utf8') {
  const r = spawnSync('git', gitArgs, { cwd: ROOT, encoding });
  return { code: r.status, out: r.stdout ?? (encoding === 'buffer' ? Buffer.alloc(0) : ''), err: (r.stderr ?? '').toString().trim() };
}

// Η αλήθεια: { όνομα → Buffer } από τον φάκελο (--dir) ή από το git ref.
function loadTruth() {
  if (DIR) {
    const d = resolve(DIR);
    if (!existsSync(d) || !statSync(d).isDirectory()) return { error: `ο φάκελος «${d}» δεν υπάρχει` };
    const names = readdirSync(d).filter((f) => /\.html?$/i.test(f)).sort();
    return { label: d, files: new Map(names.map((f) => [f, readFileSync(join(d, f))])) };
  }
  if (REF.startsWith('origin/') && git(['remote', 'get-url', 'origin']).code === 0) git(['fetch', '-q', 'origin', REF.slice('origin/'.length)]);
  if (git(['rev-parse', '--verify', '-q', REF]).code !== 0) return { error: `το git ref «${REF}» δεν υπάρχει στο «${ROOT}» (χρειάζεται fetch-depth: 0 / origin/main)` };
  const list = git(['ls-tree', '--name-only', REF]);
  const names = list.out.split('\n').filter((f) => /\.html?$/i.test(f)).sort();
  const sha = git(['rev-parse', '--short', REF]).out.trim();
  return { label: `${REF} @ ${sha}`, files: new Map(names.map((f) => [f, git(['show', `${REF}:${f}`], 'buffer').out])) };
}

async function probe(name) {
  const url = `${BASE}${encodeURIComponent(name)}?nocache=${Date.now()}`;
  try {
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache', pragma: 'no-cache' }, redirect: 'follow' });
    const body = Buffer.from(await res.arrayBuffer());
    return { name, http: res.status, body };
  } catch (e) {
    return { name, net: e.cause?.code ?? e.message };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const truth = loadTruth();
  if (truth.error) { console.log(`✗ deploy:check — ${truth.error} — exit 2: δεν μπορώ να κρίνω`); return 2; }
  if (truth.files.size === 0) { console.log(`✗ deploy:check — 0 αρχεία HTML στο ${truth.label} — exit 2: δεν μπορώ να κρίνω`); return 2; }

  const start = Date.now();
  let attempt = 0;
  let anyHttp = false;
  let last;
  for (;;) {
    attempt++;
    last = await Promise.all([...truth.files.keys()].map(probe));
    if (last.some((r) => r.http !== undefined)) anyHttp = true;
    const states = last.map((r) => {
      if (r.net) return { ...r, state: `δίκτυο: ${r.net}` };
      if (r.http !== 200) return { ...r, state: `HTTP ${r.http}` };
      const want = truth.files.get(r.name);
      return Buffer.compare(r.body, want) === 0 ? { ...r, state: 'ok' } : { ...r, state: `διαφέρει (live ${r.body.length} B ≠ main ${want.length} B)` };
    });
    const elapsed = Date.now() - start;
    if (states.every((s) => s.state === 'ok')) {
      const list = states.map((s) => `${s.name} ${s.body.length} B`).join(', ');
      console.log(`✓ deploy:check — ${states.length}/${truth.files.size} αρχεία του ${truth.label} ταυτίζονται byte-προς-byte με ${BASE} (${list}) — δοκιμή ${attempt}, ${(elapsed / 1000).toFixed(1)} s, χωρίς CDN cache`);
      return 0;
    }
    if (elapsed + INTERVAL > TIMEOUT) {
      for (const s of states) if (s.state !== 'ok') console.log(`  ${s.name}: ${s.state}`);
      const bad = states.filter((s) => s.state !== 'ok').length;
      if (!anyHttp) { console.log(`✗ deploy:check — καμία απάντηση HTTP από ${BASE} σε ${attempt} δοκιμές / ${(elapsed / 1000).toFixed(1)} s — exit 2: δίκτυο, δεν μπορώ να κρίνω`); return 2; }
      console.log(`✗ deploy:check — ${bad}/${truth.files.size} αρχεία του ${truth.label} ΔΕΝ ταυτίζονται με ${BASE} μετά από ${attempt} δοκιμές / ${(elapsed / 1000).toFixed(1)} s (παράθυρο ${TIMEOUT / 1000} s)`);
      return 1;
    }
    await sleep(INTERVAL);
  }
}

// ΟΧΙ process.exit(): αμέσως μετά από fetch, στα Windows, σκάει libuv assertion (UV_HANDLE_CLOSING) όσο κλείνουν
// τα sockets — η απόδειξη το έπιασε (exit 0xC0000409 στις «αθώες» περιπτώσεις). Με exitCode η έξοδος γίνεται όταν
// αδειάσει το event loop· τα idle keep-alive sockets του fetch δεν το κρατούν ζωντανό.
process.exitCode = await main();
