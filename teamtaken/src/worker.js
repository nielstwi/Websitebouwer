// Teamtaken - Cloudflare Worker + D1 (gratis tier). API voor het dashboard in public/.
const SESSION_DAYS = 14;
const DEFAULT_ACTIVITIES = [
  'Buyback verwerken', 'Offerte maken', 'Nieuwe klant registreren',
  'Resupply order aanmaken', 'Offerte opvolgen', 'RR order verwerken', 'RE order verwerken',
];
const PBKDF2_ITERATIONS = 100000; // maximum dat Workers toestaat

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager','employee')), password TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, is_default INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    created_by INTEGER NOT NULL REFERENCES users(id), day TEXT NOT NULL, activity TEXT NOT NULL,
    customer TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', est_minutes INTEGER NOT NULL,
    spent_minutes INTEGER, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
    completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_user_day ON tasks(user_id, day)`,
  `CREATE TABLE IF NOT EXISTS login_failures (key TEXT PRIMARY KEY, count INTEGER NOT NULL, first_ms INTEGER NOT NULL)`,
];
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaReady = true;
}

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const enc = new TextEncoder();

async function pbkdf2(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
}
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${hex(salt)}:${hex(await pbkdf2(pw, salt))}`;
}
async function checkPassword(pw, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const actual = new Uint8Array(await pbkdf2(pw, unhex(saltHex)));
  const expected = unhex(hashHex);
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ (expected[i] ?? 0);
  return diff === 0;
}
let dummyHash;
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active });

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function json(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();

async function currentUser(req, db) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  return first(db, `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`, await sha(token), Date.now());
}
async function startSession(db, url, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const maxAge = SESSION_DAYS * 86400;
  await run(db, 'DELETE FROM sessions WHERE expires_at < ?', Date.now());
  await run(db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', await sha(token), userId, Date.now() + maxAge * 1000);
  return `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

// brute-force bescherming: max 8 mislukte pogingen per 15 min per IP+gebruikersnaam
const WINDOW_MS = 15 * 60_000;
async function isThrottled(db, key) {
  const f = await first(db, 'SELECT count, first_ms FROM login_failures WHERE key = ?', key);
  return !!f && Date.now() - f.first_ms <= WINDOW_MS && f.count >= 8;
}
async function noteFailure(db, key) {
  const f = await first(db, 'SELECT count, first_ms FROM login_failures WHERE key = ?', key);
  if (!f || Date.now() - f.first_ms > WINDOW_MS) {
    await run(db, 'INSERT OR REPLACE INTO login_failures (key, count, first_ms) VALUES (?,1,?)', key, Date.now());
  } else await run(db, 'UPDATE login_failures SET count = count + 1 WHERE key = ?', key);
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
  if (!Number.isInteger(n) || n < 0 || n > 6000) throw bad(`${label} is ongeldig`);
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
const validUsername = (v) => {
  const u = str(v, 30, 'Gebruikersnaam', true).toLowerCase();
  if (!/^[a-z0-9._-]{2,30}$/.test(u)) throw bad('Gebruikersnaam: 2-30 tekens (letters, cijfers, . _ -)');
  return u;
};
const validPassword = (v) => {
  if (typeof v !== 'string' || v.length < 6) throw bad('Wachtwoord moet minimaal 6 tekens zijn');
  return v;
};

async function resolveActivity(db, name) {
  const existing = await first(db, 'SELECT name FROM activities WHERE name = ?', name);
  if (existing) return existing.name;
  await run(db, 'INSERT INTO activities (name, is_default) VALUES (?, 0)', name);
  return name;
}

const TASK_SELECT = `SELECT id, user_id, created_by, day, activity, customer, notes, est_minutes,
  spent_minutes, status, completed_at, created_at, updated_at FROM tasks`;
const taskOut = (t) => ({ ...t, by_manager: t.created_by !== t.user_id });
const requireManager = (user) => { if (user.role !== 'manager') throw new HttpError(403, 'Alleen de manager mag dit'); };

// ---------- API ----------
async function handleApi(req, env, url) {
  const db = env.DB;
  await ensureSchema(db);
  const route = `${req.method} ${url.pathname}`;
  const isWrite = req.method !== 'GET';
  if (isWrite && !(req.headers.get('content-type') || '').startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type moet application/json zijn');
  }
  let body = {};
  if (isWrite) {
    const text = await req.text();
    if (text.length > 100_000) throw new HttpError(413, 'Verzoek te groot');
    try { body = text ? JSON.parse(text) : {}; } catch { throw bad('Ongeldige JSON'); }
    if (body === null || typeof body !== 'object') body = {};
  }
  const userCount = (await first(db, 'SELECT COUNT(*) c FROM users')).c;

  if (route === 'GET /api/me') {
    const u = await currentUser(req, db);
    return json(200, { needsSetup: userCount === 0, user: u ? publicUser(u) : null });
  }

  if (route === 'POST /api/setup') {
    if (userCount > 0) throw new HttpError(403, 'Er is al een manager ingesteld');
    const name = str(body.name, 80, 'Naam', true);
    const username = validUsername(body.username);
    const pw = validPassword(body.password);
    const r = await run(db, "INSERT INTO users (username, name, role, password) VALUES (?,?, 'manager', ?)", username, name, await hashPassword(pw));
    await db.batch(DEFAULT_ACTIVITIES.map((n) => db.prepare('INSERT OR IGNORE INTO activities (name, is_default) VALUES (?, 1)').bind(n)));
    return json(200, { ok: true }, { 'Set-Cookie': await startSession(db, url, r.meta.last_row_id) });
  }

  if (route === 'POST /api/login') {
    const username = str(body.username, 30, 'Gebruikersnaam').toLowerCase();
    const pw = typeof body.password === 'string' ? body.password : '';
    const key = `${req.headers.get('cf-connecting-ip') || 'local'}|${username}`;
    if (await isThrottled(db, key)) throw new HttpError(429, 'Te veel pogingen. Probeer het over 15 minuten opnieuw.');
    const u = await first(db, 'SELECT * FROM users WHERE username = ?', username);
    dummyHash ??= await hashPassword('dummy-password');
    const ok = (await checkPassword(pw, u ? u.password : dummyHash)) && u && u.active;
    if (!ok) { await noteFailure(db, key); throw new HttpError(401, 'Onjuiste gebruikersnaam of wachtwoord'); }
    await run(db, 'DELETE FROM login_failures WHERE key = ?', key);
    return json(200, { ok: true }, { 'Set-Cookie': await startSession(db, url, u.id) });
  }

  if (route === 'POST /api/logout') {
    const token = parseCookies(req).sid;
    if (token) await run(db, 'DELETE FROM sessions WHERE token_hash = ?', await sha(token));
    return json(200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  const user = await currentUser(req, db);
  if (!user) throw new HttpError(401, 'Niet ingelogd');

  if (route === 'GET /api/activities') {
    return json(200, await all(db, 'SELECT id, name, is_default FROM activities ORDER BY is_default DESC, id'));
  }
  if (route === 'POST /api/activities') {
    return json(200, { name: await resolveActivity(db, str(body.name, 100, 'Activiteit', true)) });
  }
  let m;
  if ((m = url.pathname.match(/^\/api\/activities\/(\d+)$/)) && req.method === 'DELETE') {
    requireManager(user);
    await run(db, 'DELETE FROM activities WHERE id = ?', Number(m[1]));
    return json(200, { ok: true });
  }

  if (route === 'GET /api/users') {
    const rows = user.role === 'manager'
      ? await all(db, 'SELECT * FROM users ORDER BY role DESC, name COLLATE NOCASE')
      : [user];
    return json(200, rows.map(publicUser));
  }
  if (route === 'POST /api/users') {
    requireManager(user);
    const name = str(body.name, 80, 'Naam', true);
    const username = validUsername(body.username);
    const pw = validPassword(body.password);
    if (await first(db, 'SELECT 1 x FROM users WHERE username = ?', username)) throw bad('Deze gebruikersnaam bestaat al');
    const r = await run(db, "INSERT INTO users (username, name, role, password) VALUES (?,?, 'employee', ?)", username, name, await hashPassword(pw));
    return json(200, publicUser(await first(db, 'SELECT * FROM users WHERE id = ?', r.meta.last_row_id)));
  }
  if ((m = url.pathname.match(/^\/api\/users\/(\d+)$/)) && req.method === 'PATCH') {
    requireManager(user);
    const target = await first(db, 'SELECT * FROM users WHERE id = ?', Number(m[1]));
    if (!target) throw new HttpError(404, 'Gebruiker niet gevonden');
    if (body.name !== undefined) await run(db, 'UPDATE users SET name = ? WHERE id = ?', str(body.name, 80, 'Naam', true), target.id);
    if (body.password !== undefined && body.password !== '') {
      await run(db, 'UPDATE users SET password = ? WHERE id = ?', await hashPassword(validPassword(body.password)), target.id);
      await run(db, 'DELETE FROM sessions WHERE user_id = ?', target.id);
    }
    if (body.active !== undefined) {
      if (target.id === user.id) throw bad('Je kunt jezelf niet deactiveren');
      await run(db, 'UPDATE users SET active = ? WHERE id = ?', body.active ? 1 : 0, target.id);
      if (!body.active) await run(db, 'DELETE FROM sessions WHERE user_id = ?', target.id);
    }
    return json(200, publicUser(await first(db, 'SELECT * FROM users WHERE id = ?', target.id)));
  }

  if (route === 'GET /api/tasks') {
    const where = []; const args = [];
    const uid = url.searchParams.get('user_id');
    if (user.role === 'manager') {
      if (uid) { where.push('user_id = ?'); args.push(Number(uid)); }
    } else { where.push('user_id = ?'); args.push(user.id); }
    const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
    if (from) { where.push('day >= ?'); args.push(from); }
    if (to) { where.push('day <= ?'); args.push(to); }
    const rows = await all(db, `${TASK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY day, id`, ...args);
    return json(200, rows.map(taskOut));
  }
  if (route === 'POST /api/tasks') {
    let ownerId = user.id;
    if (user.role === 'manager' && body.user_id) {
      const owner = await first(db, 'SELECT * FROM users WHERE id = ? AND active = 1', Number(body.user_id));
      if (!owner) throw bad('Onbekende medewerker');
      ownerId = owner.id;
    }
    const day = validDay(body.day);
    const activityName = str(body.activity, 100, 'Activiteit', true);
    const customer = str(body.customer, 200, 'Klant/reden');
    const notes = str(body.notes, 2000, 'Opmerkingen');
    const est = minutes(body.est_minutes, 'Verwachte tijd');
    if (est < 1) throw bad('Verwachte tijd moet minimaal 1 minuut zijn');
    const activity = await resolveActivity(db, activityName);
    const r = await run(db, `INSERT INTO tasks (user_id, created_by, day, activity, customer, notes, est_minutes)
      VALUES (?,?,?,?,?,?,?)`, ownerId, user.id, day, activity, customer, notes, est);
    return json(200, taskOut(await first(db, `${TASK_SELECT} WHERE id = ?`, r.meta.last_row_id)));
  }
  if ((m = url.pathname.match(/^\/api\/tasks\/(\d+)$/))) {
    const task = await first(db, `${TASK_SELECT} WHERE id = ?`, Number(m[1]));
    if (!task || (user.role !== 'manager' && task.user_id !== user.id)) throw new HttpError(404, 'Taak niet gevonden');

    if (req.method === 'DELETE') {
      if (user.role !== 'manager' && task.created_by !== user.id) {
        throw new HttpError(403, 'Taken die door de manager zijn toegevoegd kun je niet verwijderen');
      }
      await run(db, 'DELETE FROM tasks WHERE id = ?', task.id);
      return json(200, { ok: true });
    }
    if (req.method === 'PATCH') {
      const next = { ...task };
      if (body.day !== undefined) next.day = validDay(body.day);
      if (body.activity !== undefined) next.activity = await resolveActivity(db, str(body.activity, 100, 'Activiteit', true));
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
        if (body.spent_minutes === undefined) next.spent_minutes = null;
      }
      await run(db, `UPDATE tasks SET day=?, activity=?, customer=?, notes=?, est_minutes=?, spent_minutes=?,
        status=?, completed_at=?, updated_at=datetime('now') WHERE id=?`, next.day, next.activity,
        next.customer, next.notes, next.est_minutes, next.spent_minutes, next.status, next.completed_at, task.id);
      return json(200, taskOut(await first(db, `${TASK_SELECT} WHERE id = ?`, task.id)));
    }
  }
  throw new HttpError(404, 'Niet gevonden');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, env, url);
      return env.ASSETS.fetch(req);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error(err);
      return json(500, { error: 'Er ging iets mis op de server' });
    }
  },
};
