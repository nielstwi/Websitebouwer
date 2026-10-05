'use strict';
// Teamtaken - to-do lijst met tijdregistratie. Geen externe dependencies (Node >= 22.13).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 14;
const DEFAULT_ACTIVITIES = [
  'Buyback verwerken', 'Offerte maken', 'Nieuwe klant registreren',
  'Resupply order aanmaken', 'Offerte opvolgen', 'RR order verwerken', 'RE order verwerken',
];

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'teamtaken.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager','employee')),
    password TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    is_default INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    day TEXT NOT NULL,
    activity TEXT NOT NULL,
    customer TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    est_minutes INTEGER NOT NULL,
    spent_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_user_day ON tasks(user_id, day);
`);
for (const n of DEFAULT_ACTIVITIES) {
  db.prepare('INSERT OR IGNORE INTO activities (name, is_default) VALUES (?, 1)').run(n);
}

// ---------- helpers ----------
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
};
const checkPassword = (pw, stored) => {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(expected, actual);
};
const DUMMY_HASH = hashPassword('dummy-password');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active });

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100_000) { reject(new HttpError(413, 'Verzoek te groot')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(bad('Ongeldige JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function currentUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).get(sha(token), Date.now());
  return row || null;
}

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = SESSION_DAYS * 86400;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)')
    .run(sha(token), userId, Date.now() + maxAge * 1000);
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

// brute-force bescherming: max 8 mislukte pogingen per 15 min per IP+gebruikersnaam
const failures = new Map();
function throttled(key) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60_000) { failures.delete(key); return false; }
  return f.count >= 8;
}
function noteFailure(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > 15 * 60_000) failures.set(key, { count: 1, first: Date.now() });
  else f.count++;
}

const str = (v, max, label, required = false) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw bad(`${label} is verplicht`);
  if (s.length > max) throw bad(`${label} is te lang (max ${max} tekens)`);
  return s;
};
const minutes = (v, label, { required = true } = {}) => {
  if (v === null || v === undefined || v === '') {
    if (required) throw bad(`${label} is verplicht`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 60 * 100) throw bad(`${label} is ongeldig`);
  return n;
};
const validDay = (d) => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw bad('Ongeldige dag');
  const dt = new Date(d + 'T00:00:00Z');
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== d) throw bad('Ongeldige dag');
  const wd = dt.getUTCDay();
  if (wd === 0 || wd === 6) throw bad('Taken kunnen alleen op werkdagen (ma-vr) worden gepland');
  return d;
};

// Gebruik bestaande schrijfwijze als de activiteit al bestaat; anders opslaan als nieuwe activiteit.
function resolveActivity(name) {
  const existing = db.prepare('SELECT name FROM activities WHERE name = ?').get(name);
  if (existing) return existing.name;
  db.prepare('INSERT INTO activities (name, is_default) VALUES (?, 0)').run(name);
  return name;
}

const TASK_SELECT = `SELECT id, user_id, created_by, day, activity, customer, notes, est_minutes,
  spent_minutes, status, completed_at, created_at, updated_at FROM tasks`;
const taskOut = (t) => ({ ...t, by_manager: t.created_by !== t.user_id });

function requireManager(user) {
  if (user.role !== 'manager') throw new HttpError(403, 'Alleen de manager mag dit');
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const isWrite = req.method !== 'GET';
  if (isWrite && !(req.headers['content-type'] || '').startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type moet application/json zijn');
  }
  const body = isWrite ? await readBody(req) : {};
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;

  if (route === 'GET /api/me') {
    const u = currentUser(req);
    return send(res, 200, { needsSetup: userCount === 0, user: u ? publicUser(u) : null });
  }

  if (route === 'POST /api/setup') {
    if (userCount > 0) throw new HttpError(403, 'Er is al een manager ingesteld');
    const name = str(body.name, 80, 'Naam', true);
    const username = str(body.username, 30, 'Gebruikersnaam', true).toLowerCase();
    if (!/^[a-z0-9._-]{2,30}$/.test(username)) throw bad('Gebruikersnaam: 2-30 tekens (letters, cijfers, . _ -)');
    const pw = typeof body.password === 'string' ? body.password : '';
    if (pw.length < 6) throw bad('Wachtwoord moet minimaal 6 tekens zijn');
    const r = db.prepare("INSERT INTO users (username, name, role, password) VALUES (?,?, 'manager', ?)")
      .run(username, name, hashPassword(pw));
    const cookie = startSession(req, res, Number(r.lastInsertRowid));
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }

  if (route === 'POST /api/login') {
    const username = str(body.username, 30, 'Gebruikersnaam').toLowerCase();
    const pw = typeof body.password === 'string' ? body.password : '';
    const key = `${req.socket.remoteAddress}|${username}`;
    if (throttled(key)) throw new HttpError(429, 'Te veel pogingen. Probeer het over 15 minuten opnieuw.');
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = checkPassword(pw, u ? u.password : DUMMY_HASH) && u && u.active;
    if (!ok) { noteFailure(key); throw new HttpError(401, 'Onjuiste gebruikersnaam of wachtwoord'); }
    failures.delete(key);
    return send(res, 200, { ok: true }, { 'Set-Cookie': startSession(req, res, u.id) });
  }

  if (route === 'POST /api/logout') {
    const token = parseCookies(req).sid;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  // alles hieronder vereist een login
  const user = currentUser(req);
  if (!user) throw new HttpError(401, 'Niet ingelogd');

  if (route === 'GET /api/activities') {
    return send(res, 200, db.prepare('SELECT id, name, is_default FROM activities ORDER BY is_default DESC, id').all());
  }
  if (route === 'POST /api/activities') {
    const name = str(body.name, 100, 'Activiteit', true);
    return send(res, 200, { name: resolveActivity(name) });
  }
  let m;
  if ((m = url.pathname.match(/^\/api\/activities\/(\d+)$/)) && req.method === 'DELETE') {
    requireManager(user);
    db.prepare('DELETE FROM activities WHERE id = ?').run(Number(m[1]));
    return send(res, 200, { ok: true });
  }

  // gebruikers (manager)
  if (route === 'GET /api/users') {
    const rows = user.role === 'manager'
      ? db.prepare('SELECT * FROM users ORDER BY role DESC, name COLLATE NOCASE').all()
      : [user];
    return send(res, 200, rows.map(publicUser));
  }
  if (route === 'POST /api/users') {
    requireManager(user);
    const name = str(body.name, 80, 'Naam', true);
    const username = str(body.username, 30, 'Gebruikersnaam', true).toLowerCase();
    if (!/^[a-z0-9._-]{2,30}$/.test(username)) throw bad('Gebruikersnaam: 2-30 tekens (letters, cijfers, . _ -)');
    const pw = typeof body.password === 'string' ? body.password : '';
    if (pw.length < 6) throw bad('Wachtwoord moet minimaal 6 tekens zijn');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw bad('Deze gebruikersnaam bestaat al');
    const r = db.prepare("INSERT INTO users (username, name, role, password) VALUES (?,?, 'employee', ?)")
      .run(username, name, hashPassword(pw));
    return send(res, 200, publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)));
  }
  if ((m = url.pathname.match(/^\/api\/users\/(\d+)$/)) && req.method === 'PATCH') {
    requireManager(user);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(m[1]));
    if (!target) throw new HttpError(404, 'Gebruiker niet gevonden');
    if (body.name !== undefined) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(str(body.name, 80, 'Naam', true), target.id);
    }
    if (body.password !== undefined && body.password !== '') {
      if (typeof body.password !== 'string' || body.password.length < 6) throw bad('Wachtwoord moet minimaal 6 tekens zijn');
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(body.password), target.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id); // forceer opnieuw inloggen
    }
    if (body.active !== undefined) {
      if (target.id === user.id) throw bad('Je kunt jezelf niet deactiveren');
      db.prepare('UPDATE users SET active = ? WHERE id = ?').run(body.active ? 1 : 0, target.id);
      if (!body.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    }
    return send(res, 200, publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)));
  }

  // taken
  if (route === 'GET /api/tasks') {
    const where = []; const args = [];
    const uid = url.searchParams.get('user_id');
    if (user.role === 'manager') {
      if (uid) { where.push('user_id = ?'); args.push(Number(uid)); }
    } else { where.push('user_id = ?'); args.push(user.id); }
    const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
    if (from) { where.push('day >= ?'); args.push(from); }
    if (to) { where.push('day <= ?'); args.push(to); }
    const rows = db.prepare(`${TASK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY day, id`).all(...args);
    return send(res, 200, rows.map(taskOut));
  }
  if (route === 'POST /api/tasks') {
    let ownerId = user.id;
    if (user.role === 'manager' && body.user_id) {
      const owner = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(Number(body.user_id));
      if (!owner) throw bad('Onbekende medewerker');
      ownerId = owner.id;
    }
    const activity = resolveActivity(str(body.activity, 100, 'Activiteit', true));
    const est = minutes(body.est_minutes, 'Verwachte tijd');
    if (est < 1) throw bad('Verwachte tijd moet minimaal 1 minuut zijn');
    const r = db.prepare(`INSERT INTO tasks (user_id, created_by, day, activity, customer, notes, est_minutes)
      VALUES (?,?,?,?,?,?,?)`).run(ownerId, user.id, validDay(body.day), activity,
      str(body.customer, 200, 'Klant/reden'), str(body.notes, 2000, 'Opmerkingen'), est);
    return send(res, 200, taskOut(db.prepare(`${TASK_SELECT} WHERE id = ?`).get(r.lastInsertRowid)));
  }
  if ((m = url.pathname.match(/^\/api\/tasks\/(\d+)$/))) {
    const task = db.prepare(`${TASK_SELECT} WHERE id = ?`).get(Number(m[1]));
    if (!task || (user.role !== 'manager' && task.user_id !== user.id)) throw new HttpError(404, 'Taak niet gevonden');

    if (req.method === 'DELETE') {
      if (user.role !== 'manager' && task.created_by !== user.id) {
        throw new HttpError(403, 'Taken die door de manager zijn toegevoegd kun je niet verwijderen');
      }
      db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'PATCH') {
      const next = { ...task };
      if (body.day !== undefined) next.day = validDay(body.day);
      if (body.activity !== undefined) next.activity = resolveActivity(str(body.activity, 100, 'Activiteit', true));
      if (body.customer !== undefined) next.customer = str(body.customer, 200, 'Klant/reden');
      if (body.notes !== undefined) next.notes = str(body.notes, 2000, 'Opmerkingen');
      if (body.est_minutes !== undefined) {
        next.est_minutes = minutes(body.est_minutes, 'Verwachte tijd');
        if (next.est_minutes < 1) throw bad('Verwachte tijd moet minimaal 1 minuut zijn');
      }
      if (body.spent_minutes !== undefined) next.spent_minutes = minutes(body.spent_minutes, 'Bestede tijd', { required: false });
      if (body.status !== undefined) {
        if (!['open', 'done'].includes(body.status)) throw bad('Ongeldige status');
        next.status = body.status;
      }
      if (next.status === 'done') {
        if (next.spent_minutes === null) throw bad('Vul de bestede tijd in om af te ronden');
        if (task.status !== 'done') next.completed_at = new Date().toISOString();
      } else {
        next.completed_at = null;
        next.spent_minutes = body.spent_minutes !== undefined ? next.spent_minutes : null;
      }
      db.prepare(`UPDATE tasks SET day=?, activity=?, customer=?, notes=?, est_minutes=?, spent_minutes=?,
        status=?, completed_at=?, updated_at=datetime('now') WHERE id=?`).run(next.day, next.activity,
        next.customer, next.notes, next.est_minutes, next.spent_minutes, next.status, next.completed_at, task.id);
      return send(res, 200, taskOut(db.prepare(`${TASK_SELECT} WHERE id = ?`).get(task.id)));
    }
  }

  throw new HttpError(404, 'Niet gevonden');
}

// ---------- statische bestanden ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Niet gevonden');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error(err);
    send(res, 500, { error: 'Er ging iets mis op de server' });
  }
});
server.listen(PORT, () => console.log(`Teamtaken draait op http://localhost:${PORT}`));
