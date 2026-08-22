#!/usr/bin/env node
// deploy:prove — απόδειξη του deploy-check. Τοπικός HTTP server (127.0.0.1, τυχαία θύρα) παίζει το «live» και ένα
// προσωρινό git repo με refs/remotes/origin/main παίζει το main:
//   ίδια bytes → πράσινο · ένα byte διαφορά / 404 / 500 / παλιό περιεχόμενο πέρα από το παράθυρο → κόκκινο ·
//   παλιό περιεχόμενο που φρεσκάρει μέσα στο παράθυρο → πράσινο (η αναμονή δουλεύει) · ο φύλακας στέλνει cache-buster ·
//   ref δεν υπάρχει / 0 αρχεία / server κλειστός → exit 2. Πρώτα, το πραγματικό live ↔ origin/main → πράσινο.
// Ποτέ δεν αγγίζει το πραγματικό repo.
// Χρήση:  node scripts/deploy-prove.mjs      Έξοδος: 0 = η απόδειξη στέκει · 1 = κάποια περίπτωση απέτυχε

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHECK = join(HERE, 'deploy-check.mjs');

const base = mkdtempSync(join(tmpdir(), 'goalaso-legal-deploy-prove-'));
let caseNo = 0;
function dir(label) {
  const d = join(base, `${String(++caseNo).padStart(2, '0')}-${label}`);
  mkdirSync(d);
  return d;
}
function git(d, args) {
  const r = spawnSync('git', args, { cwd: d, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → exit ${r.status}: ${r.stderr}`);
  return r.stdout;
}
const PAGES = {
  'index.html': '<!doctype html>\n<html lang="el"><head><meta charset="utf-8"><title>Δοκιμή</title></head><body><a href="./privacy.html">Απόρρητο</a></body></html>\n',
  'privacy.html': '<!doctype html>\n<html lang="el"><head><meta charset="utf-8"><title>Απόρρητο</title></head><body><h1>Πολιτική</h1><p>Τελευταία ενημέρωση: 3 Αυγούστου 2026</p></body></html>\n',
};
// Προσωρινό «main»: repo με τις σελίδες σε ένα commit και refs/remotes/origin/main να δείχνει εκεί.
function mainRepo(label, files = PAGES) {
  const d = dir(label);
  git(d, ['init', '-q']);
  git(d, ['config', 'user.email', 'prove@example.org']);
  git(d, ['config', 'user.name', 'prove']);
  git(d, ['config', 'commit.gpgsign', 'false']);
  git(d, ['config', 'core.autocrlf', 'false']);
  for (const [f, body] of Object.entries(files)) writeFileSync(join(d, f), body);
  git(d, ['add', '-A']);
  git(d, ['commit', '-q', '--no-verify', '-m', 'pages']);
  git(d, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  return d;
}
// Προσωρινό «live»: φάκελος που σερβίρεται από τοπικό HTTP server με ρυθμιζόμενη συμπεριφορά.
function liveDir(label, files = PAGES) {
  const d = dir(`${label}-live`);
  for (const [f, body] of Object.entries(files)) writeFileSync(join(d, f), body);
  return d;
}
function serve(d, { status, staleFor = 0, headers = {} } = {}) {
  const seen = new Map();
  const queries = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    queries.push(url.search);
    const name = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (status) { res.writeHead(status); res.end('error'); return; }
    const p = join(d, name);
    if (!existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
    let body = readFileSync(p);
    if (n <= staleFor) body = Buffer.concat([body, Buffer.from('<!-- παλιό από CDN -->\n')]);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'max-age=600', ...headers });
    res.end(body);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}/`, queries })));
}
function run(cwd, extra = []) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [CHECK, '--cwd', cwd, '--timeout', '3', '--interval', '1', ...extra], { env: { ...process.env } });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('close', (code) => ok({ code, out }));
  });
}

const results = [];
function record(ok, label, detail) {
  results.push(ok);
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}
async function withServer(d, opts, fn) {
  const s = await serve(d, opts);
  try { return await fn(s); } finally { s.server.close(); }
}

// 0. Το πραγματικό live ↔ origin/main του πραγματικού repo → πράσινο (δίκτυο)
{
  const r = await new Promise((ok) => {
    const child = spawn(process.execPath, [CHECK, '--timeout', String(process.env.DEPLOY_CHECK_TIMEOUT ?? 60)], { cwd: ROOT, env: { ...process.env } });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('close', (code) => ok({ code, out }));
  });
  record(r.code === 0, 'πραγματικό live ↔ origin/main → πράσινο', r.code === 0 ? r.out.trim().split('\n').pop() : `exit ${r.code}\n${r.out}`);
}

let red = 0;
let green = 0;
let closed = 0;
async function expectRed(label, expect, repo, live, opts = {}) {
  const r = await withServer(live, opts, (s) => run(repo, ['--base', s.base]));
  const ok = r.code === 1 && r.out.includes(expect);
  if (ok) red++;
  record(ok, `κόκκινο: ${label}`, ok ? `exit 1, «${expect}»` : `exit ${r.code}, περίμενα «${expect}»\n${r.out}`);
}
async function expectGreen(label, expect, repo, live, opts = {}, after) {
  const r = await withServer(live, opts, async (s) => { const res = await run(repo, ['--base', s.base]); return { ...res, s }; });
  const extraOk = after ? after(r.s) : true;
  const ok = r.code === 0 && r.out.includes(expect) && extraOk;
  if (ok) green++;
  record(ok, `πράσινο: ${label}`, ok ? `exit 0, «${expect}»` : `exit ${r.code}, περίμενα «${expect}»${extraOk ? '' : ' (+ επιπλέον συνθήκη απέτυχε)'}\n${r.out}`);
}

await expectGreen('ίδια bytes', '2/2 αρχεία', mainRepo('identical'), liveDir('identical'));
await expectRed('ένα byte διαφορά', 'διαφέρει', mainRepo('one-byte'), liveDir('one-byte', { ...PAGES, 'privacy.html': PAGES['privacy.html'].replace('3 Αυγούστου', '4 Αυγούστου') }));
await expectRed('αρχείο λείπει από το live', 'HTTP 404', mainRepo('missing'), liveDir('missing', { 'index.html': PAGES['index.html'] }));
await expectRed('ο server απαντά 500', 'HTTP 500', mainRepo('http-500'), liveDir('http-500'), { status: 500 });
await expectRed('παλιό περιεχόμενο πέρα από το παράθυρο', 'παράθυρο 3 s', mainRepo('stale-forever'), liveDir('stale-forever'), { staleFor: 999 });
await expectGreen('παλιό περιεχόμενο που φρεσκάρει μέσα στο παράθυρο', 'δοκιμή 3', mainRepo('eventually'), liveDir('eventually'), { staleFor: 2 });
await expectGreen('άλλα headers / content-type δεν μετρούν', '2/2 αρχεία', mainRepo('headers'), liveDir('headers'), { headers: { 'content-type': 'application/octet-stream', 'x-served-by': 'cache-xyz', etag: '"abc"' } });
await expectGreen('ο φύλακας παρακάμπτει το CDN cache (cache-buster σε κάθε αίτημα)', '2/2 αρχεία', mainRepo('cache-buster'), liveDir('cache-buster'), {}, (s) => s.queries.length > 0 && s.queries.every((q) => /^\?nocache=\d+$/.test(q)));

{
  const repo = dir('no-origin-main');
  git(repo, ['init', '-q']);
  const r = await withServer(liveDir('no-origin-main'), {}, (s) => run(repo, ['--base', s.base]));
  const ok = r.code === 2 && r.out.includes('δεν υπάρχει');
  if (ok) closed++;
  record(ok, 'fail-closed: το ref origin/main δεν υπάρχει → exit 2', `exit ${r.code}`);
}
{
  const repo = mainRepo('no-html', { 'README.md': '# τίποτα\n' });
  const r = await withServer(liveDir('no-html', {}), {}, (s) => run(repo, ['--base', s.base]));
  const ok = r.code === 2 && r.out.includes('0 αρχεία');
  if (ok) closed++;
  record(ok, 'fail-closed: 0 αρχεία HTML στο main → exit 2', `exit ${r.code}`);
}
{
  const s = await serve(liveDir('closed'));
  const closedBase = s.base;
  await new Promise((ok) => s.server.close(ok));
  const r = await run(mainRepo('closed'), ['--base', closedBase]);
  const ok = r.code === 2 && r.out.includes('δίκτυο');
  if (ok) closed++;
  record(ok, 'fail-closed: κανένας server (σύνδεση αρνήθηκε) → exit 2', `exit ${r.code}`);
}

rmSync(base, { recursive: true, force: true });
const failed = results.filter((x) => !x).length;
const tally = `deploy:prove — ${red}/4 μεταλλάξεις κόκκινες, ${green}/4 αθώες πράσινες, fail-closed ${closed}/3`;
if (failed) { console.log(`✗ ${tally} — ${failed} περιπτώσεις απέτυχαν`); process.exit(1); }
console.log(`✓ ${tally}`);
