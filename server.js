// MILLIYBIZ — production server (Node.js 18+, zero dependencies).
// Run: node server.js   (PORT=3000 node server.js)
// Same API as server.ps1.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const CFG_FILE = path.join(DATA, 'config.json');

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, obj) => { fs.writeFileSync(f + '.tmp', JSON.stringify(obj)); fs.renameSync(f + '.tmp', f); };

if (!fs.existsSync(CFG_FILE)) writeJson(CFG_FILE, { password: process.env.ADMIN_PASSWORD || 'milliybiz2026' });
let db = readJson(DB_FILE);
let dbStamp = fs.statSync(DB_FILE).mtimeMs;
const saveDb = () => { writeJson(DB_FILE, db); dbStamp = fs.statSync(DB_FILE).mtimeMs; };
const syncDb = () => { const t = fs.statSync(DB_FILE).mtimeMs; if (t !== dbStamp) { db = readJson(DB_FILE); dbStamp = t; } };
const tokens = new Map();

const { createRobot } = require('./robot');
const robot = createRobot({
  DATA, PUBLIC, localStamp: (d) => localStamp(d),
  getDb: () => { syncDb(); return db; }, saveDb: () => saveDb(),
  readCfg: () => readJson(CFG_FILE), writeCfg: (c) => writeJson(CFG_FILE, c),
});

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
};
const json = (res, obj, code = 200) => send(res, code, JSON.stringify(obj));
const readBody = (req, limit = 25 * 1024 * 1024) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { const s = Buffer.concat(chunks).toString('utf8'); try { resolve(s.trim() ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  req.on('error', reject);
});
const newId = (n = 8) => crypto.randomBytes(n).toString('hex');
const str = (v, max = 200) => String(v ?? '').slice(0, max).trim();
const pad = (n) => String(n).padStart(2, '0');
const localStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function authed(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return false;
  const t = h.slice(7); const exp = tokens.get(t);
  if (exp && exp > Date.now()) { tokens.set(t, Date.now() + 12 * 3600e3); return true; }
  tokens.delete(t); return false;
}

function publicData() {
  const now = localStamp();
  return {
    posts: (db.posts || []).filter((p) => p.status === 'published' && !(p.date && `${p.date}T${p.time}` > now)),
    videos: (db.videos || []).filter((v) => v.url),
    layout: db.layout, ads: db.ads, settings: db.settings,
  };
}

async function api(req, res, p, m) {
  if (p === '/api/public' && m === 'GET') return json(res, publicData());

  let mm;
  if ((mm = p.match(/^\/api\/view\/([\w-]+)$/)) && m === 'POST') {
    const post = (db.posts || []).find((x) => x.id === mm[1]);
    if (post) { post.views = (+post.views || 0) + 1; saveDb(); }
    return json(res, { ok: true });
  }

  if (p === '/api/leads' && m === 'POST') {
    const b = await readBody(req, 20 * 1024);
    if (b.website) return json(res, { ok: true });
    const name = str(b.name, 120), phone = str(b.phone, 40);
    if (name.length < 2 || phone.replace(/\D/g, '').length < 9) return json(res, { error: 'invalid' }, 400);
    const d = new Date();
    db.leads = [{ id: newId(6), name, phone, region: str(b.region, 80), lang: str(b.lang, 4), note: '', status: 'new', created: `${localStamp(d)}:${pad(d.getSeconds())}` }, ...(db.leads || [])];
    saveDb();
    return json(res, { ok: true });
  }

  if (p === '/api/login' && m === 'POST') {
    const b = await readBody(req, 10 * 1024);
    if (safeEq(b.password || '', readJson(CFG_FILE).password)) {
      const t = newId(24); tokens.set(t, Date.now() + 12 * 3600e3);
      return json(res, { token: t });
    }
    await new Promise((r) => setTimeout(r, 700));
    return json(res, { error: 'wrong password' }, 401);
  }

  if (!p.startsWith('/api/admin/')) return json(res, { error: 'not found' }, 404);
  if (!authed(req)) return json(res, { error: 'unauthorized' }, 401);

  if (p === '/api/admin/db' && m === 'GET') return json(res, db);

  if ((mm = p.match(/^\/api\/admin\/db\/(posts|videos|ads|layout|settings|leads)$/)) && m === 'PUT') {
    db[mm[1]] = await readBody(req);
    saveDb();
    return json(res, { ok: true });
  }

  // одна публикация — чтобы CRM не затирала то, что робот опубликовал, пока страница была открыта
  if ((mm = p.match(/^\/api\/admin\/post\/([\w-]+)$/)) && (m === 'PUT' || m === 'DELETE')) {
    const id = mm[1];
    if (m === 'PUT') {
      const post = await readBody(req);
      if (post.id !== id) return json(res, { error: 'bad id' }, 400);
      const i = (db.posts || []).findIndex((x) => x.id === id);
      if (i >= 0) db.posts[i] = post; else db.posts = [post, ...(db.posts || [])];
    } else {
      db.posts = (db.posts || []).filter((x) => x.id !== id);
      for (const k of ['main', 'side', 'grid', 'sport']) if (db.layout?.[k]) db.layout[k] = db.layout[k].map((x) => (x === id ? null : x));
    }
    saveDb();
    return json(res, { ok: true });
  }

  if (p === '/api/admin/robot' && m === 'GET') return json(res, robot.status());
  if (p === '/api/admin/robot' && m === 'PUT') return json(res, await robot.configure(await readBody(req, 50 * 1024)));
  if (p === '/api/admin/robot/run' && m === 'POST') return json(res, { added: await robot.runCycle(true) });
  if (p === '/api/admin/robot/test' && m === 'POST') return json(res, await robot.test());
  if (p === '/api/admin/robot/source-test' && m === 'POST') return json(res, await robot.probe((await readBody(req, 5 * 1024)).url));
  if (p === '/api/admin/robot/profile' && m === 'GET') return json(res, await robot.profile());
  if (p === '/api/admin/robot/profile' && m === 'PUT') return json(res, await robot.setProfile(await readBody(req, 20 * 1024)));
  if (p === '/api/admin/robot/act' && m === 'POST') {
    const b = await readBody(req, 200 * 1024);
    return json(res, { message: await robot.act(str(b.id, 40), str(b.action, 10), b.draft) });
  }

  if (p === '/api/admin/password' && m === 'PUT') {
    const b = await readBody(req, 10 * 1024);
    const cfg = readJson(CFG_FILE);
    if (!safeEq(b.current || '', cfg.password)) return json(res, { error: 'wrong password' }, 400);
    if (String(b.next || '').length < 6) return json(res, { error: 'too short' }, 400);
    cfg.password = String(b.next); writeJson(CFG_FILE, cfg);
    return json(res, { ok: true });
  }

  if (p === '/api/admin/upload' && m === 'POST') {
    const b = await readBody(req);
    const match = String(b.data || '').match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/);
    if (!match) return json(res, { error: 'only jpg/png/webp/gif' }, 400);
    const ext = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' }[match[1]];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 15 * 1024 * 1024) return json(res, { error: 'file too large' }, 400);
    const d = new Date(); const sub = `${d.getFullYear()}${pad(d.getMonth() + 1)}`;
    const dir = path.join(PUBLIC, 'uploads', sub);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${newId(8)}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    return json(res, { url: `/uploads/${sub}/${name}` });
  }

  return json(res, { error: 'not found' }, 404);
}

function serveStatic(req, res, p) {
  if (p.endsWith('/')) p += 'index.html';
  let rel;
  try { rel = decodeURIComponent(p); } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
  const full = path.normalize(path.join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(full, (err, st) => {
    if (!err && st.isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
    if (err || !st.isFile()) {
      const nf = path.join(PUBLIC, '404.html');
      return fs.existsSync(nf) ? send(res, 404, fs.readFileSync(nf), MIME['.html']) : send(res, 404, 'Not found', 'text/plain');
    }
    const ext = path.extname(full).toLowerCase();
    const cache = ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  try {
    if (p.startsWith('/api/')) { syncDb(); await api(req, res, p, req.method); }
    else serveStatic(req, res, p);
  } catch (e) {
    console.error(req.method, p, e.message);
    if (!res.headersSent) json(res, { error: p.startsWith('/api/admin/robot') ? e.message : 'server error' }, 500);
  }
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE' || e.code === 'EACCES') {
    console.error(`\n  Port ${PORT} is busy: another MILLIYBIZ server window is already open.\n  Close the other server window and run start.bat again.\n`);
    process.exit(1);
  }
  throw e;
}).listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`\n  MILLIYBIZ is running\n  Site: http://localhost:${PORT}/\n  CRM:  http://localhost:${PORT}/admin/\n`);
  if (process.env.ROBOT !== 'off') robot.start();
});

// start.bat ставит MB_WATCH=1: при изменении кода сервера или робота сервер перезапускается сам (код выхода 75)
if (process.env.MB_WATCH === '1') {
  let t = null;
  const restart = (f) => { clearTimeout(t); t = setTimeout(() => { console.log(`\n  Код обновлён (${f}) — перезапуск…\n`); process.exit(75); }, 800); };
  fs.watch(path.join(ROOT, 'server.js'), () => restart('server.js'));
  fs.watch(path.join(ROOT, 'robot'), (e, f) => { if (f && f.endsWith('.js')) restart('robot/' + f); });
}
