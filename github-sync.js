/**
 * github-sync.js
 * Commits admin changes (portfolio.json + thumbnails) to GitHub so they survive
 * Render restarts and deploys. Skipped gracefully if GITHUB_TOKEN is not set.
 *
 * Commits carry "[skip render]" so an upload does not trigger a redeploy — the
 * change is already live on this server. On boot (Render only) the server pulls
 * the latest data + thumbnails back down, since its disk resets to the last deploy.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const TOKEN  = process.env.GITHUB_TOKEN;
const REPO   = process.env.GITHUB_REPO   || 'arnisazekir/photography-portfolio';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API    = `https://api.github.com/repos/${REPO}`;

const ROOT        = __dirname;
const DATA_REL    = 'data/portfolio.json';
const THUMBS_REL  = 'public/uploads/thumbs';
const DEBOUNCE_MS = 8000;  // batch a burst of uploads/reorders into one commit

const status = { enabled: !!TOKEN, hosted: !!process.env.RENDER, lastSyncAt: null, lastError: null, pending: false };

// ─── GitHub API ───────────────────────────────────────────────────────────────

async function gh(method, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'outoforder-portfolio',
      ...(TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err  = new Error(`GitHub ${method} ${endpoint} → ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Current branch head + every file path → blob sha
async function getRemote() {
  const ref    = await gh('GET', `/git/ref/heads/${BRANCH}`);
  const commit = await gh('GET', `/git/commits/${ref.object.sha}`);
  const tree   = await gh('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new Error('GitHub tree listing truncated — repo too large to sync safely');
  const files = new Map();
  tree.tree.forEach(e => { if (e.type === 'blob') files.set(e.path, e.sha); });
  return { commitSha: ref.object.sha, treeSha: commit.tree.sha, files };
}

// ─── Local helpers ────────────────────────────────────────────────────────────

function blobSha(buf) {
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

function listLocalThumbs() {
  const out = [];
  (function walk(rel) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs, { withFileTypes: true }).forEach(e => {
      if (e.name.startsWith('.')) return;
      const child = rel + '/' + e.name;
      if (e.isDirectory()) walk(child);
      else out.push(child);
    });
  })(THUMBS_REL);
  return out;
}

// Thumbnails the current data actually points at
function referencedThumbs(data) {
  const refs = new Set();
  const add  = p => { if (p && p.startsWith('/uploads/thumbs/')) refs.add('public' + p); };
  data.segments.forEach(seg => {
    add(seg.coverImage);
    seg.images.forEach(img => add(img.thumbPath));
  });
  return refs;
}

// ─── Push: local → GitHub ─────────────────────────────────────────────────────

// Work out which files to write and delete so GitHub matches this server
function planChanges(remote) {
  const dataBuf = fs.readFileSync(path.join(ROOT, DATA_REL));
  const data    = JSON.parse(dataBuf.toString('utf8'));
  if (!Array.isArray(data.segments)) throw new Error('portfolio.json has no segments array');
  // loadData() falls back to an empty list on a read error — never commit that over real data
  if (!data.segments.length && remote.files.has(DATA_REL)) {
    throw new Error('Local portfolio.json is empty — refusing to overwrite GitHub copy');
  }

  const refs    = referencedThumbs(data);
  const onDisk  = new Set(listLocalThumbs());
  const writes  = [];
  const deletes = [];

  if (remote.files.get(DATA_REL) !== blobSha(dataBuf)) writes.push({ path: DATA_REL, buf: dataBuf });

  refs.forEach(rel => {
    if (!onDisk.has(rel)) return;
    const buf = fs.readFileSync(path.join(ROOT, rel));
    if (remote.files.get(rel) !== blobSha(buf)) writes.push({ path: rel, buf });
  });

  // Only drop a thumbnail that is both unreferenced and gone from disk
  remote.files.forEach((sha, rel) => {
    if (rel.startsWith(THUMBS_REL + '/') && !refs.has(rel) && !onDisk.has(rel)) deletes.push(rel);
  });

  return { writes, deletes };
}

async function syncOnce() {
  const remote = await getRemote();
  const { writes, deletes } = planChanges(remote);
  if (!writes.length && !deletes.length) return 0;

  const tree = [];
  for (const w of writes) {
    const blob = await gh('POST', '/git/blobs', { content: w.buf.toString('base64'), encoding: 'base64' });
    tree.push({ path: w.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  deletes.forEach(rel => tree.push({ path: rel, mode: '100644', type: 'blob', sha: null }));

  const count   = writes.length + deletes.length;
  const newTree = await gh('POST', '/git/trees', { base_tree: remote.treeSha, tree });
  const commit  = await gh('POST', '/git/commits', {
    message: `Admin: update portfolio (${count} file${count === 1 ? '' : 's'}) [skip render]`,
    tree:    newTree.sha,
    parents: [remote.commitSha]
  });
  await gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commit.sha });
  return count;
}

let timer   = null;
let running = false;
let dirty   = false;

async function runSync() {
  if (running) { dirty = true; return; }
  running = true;
  try {
    let count;
    try { count = await syncOnce(); }
    catch (e) {
      // Branch moved under us (e.g. a code push landed) — rebuild on the new head once
      if (e.status !== 422 && e.status !== 409) throw e;
      count = await syncOnce();
    }
    status.lastSyncAt = new Date();
    status.lastError  = null;
    if (count) console.log(`GitHub sync: committed ${count} file(s)`);
  } catch (e) {
    status.lastError = e.message;
    console.error('GitHub sync failed:', e.message);
  } finally {
    running = false;
    status.pending = dirty;
    if (dirty) { dirty = false; scheduleSync(); }
  }
}

// Call after any data change — debounced, never throws
function scheduleSync() {
  if (!TOKEN) return;
  status.pending = true;
  clearTimeout(timer);
  timer = setTimeout(runSync, DEBOUNCE_MS);
}

// ─── Pull: GitHub → local (boot) ──────────────────────────────────────────────

async function downloadBlob(sha, destAbs) {
  const blob = await gh('GET', `/git/blobs/${sha}`);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  const tmp = destAbs + '.tmp';
  fs.writeFileSync(tmp, Buffer.from(blob.content, 'base64'));
  fs.renameSync(tmp, destAbs);
}

// Render's disk resets to the last deploy on every restart — bring it up to date
// with what the admin has committed since. Only runs on Render so a local copy
// with unpushed edits is never overwritten.
async function restoreFromGitHub() {
  if (!TOKEN || !process.env.RENDER) return;
  try {
    const remote  = await getRemote();
    const dataAbs = path.join(ROOT, DATA_REL);
    const dataSha = remote.files.get(DATA_REL);
    const local   = fs.existsSync(dataAbs) ? blobSha(fs.readFileSync(dataAbs)) : null;
    let restored  = 0;

    if (dataSha && dataSha !== local) { await downloadBlob(dataSha, dataAbs); restored++; }

    const onDisk = new Set(listLocalThumbs());
    for (const [rel, sha] of remote.files) {
      if (!rel.startsWith(THUMBS_REL + '/') || onDisk.has(rel)) continue;
      await downloadBlob(sha, path.join(ROOT, rel));
      restored++;
    }
    // Thumbnails deleted via admin since the last deploy
    onDisk.forEach(rel => { if (!remote.files.has(rel)) fs.unlinkSync(path.join(ROOT, rel)); });

    status.lastSyncAt = new Date();
    if (restored) console.log(`GitHub restore: pulled ${restored} file(s)`);
  } catch (e) {
    status.lastError = e.message;
    console.error('GitHub restore failed:', e.message);
  }
}

module.exports = { scheduleSync, restoreFromGitHub, status, getRemote, planChanges };
