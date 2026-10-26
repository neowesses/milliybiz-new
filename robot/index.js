// Робот-редактор MILLIYBIZ: собирает топ-новости и матчи, готовит черновик, спрашивает в Telegram, публикует.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DEFAULT_SOURCES, LEAGUES } = require('./sources');
const { get, readSource, probeSource, readArticle, leagueResults } = require('./fetch');
const { cluster, tokens, skeleton } = require('./rank');
const { aiWrite, plainWrite } = require('./writer');
const { newsBanner, matchBanner } = require('./banner');
const { createBot, h } = require('./telegram');

const DEFAULTS = {
  enabled: true, botToken: '', chatId: '', pairCode: '', anthropicKey: '', model: 'claude-opus-5-5',
  intervalMin: 10, minSources: 2, maxPerRun: 5, maxAgeH: 6,
  groups: { uz: true, sport: true, matches: true }, sportsDbKey: '123', siteUrl: 'http://localhost:8080',
  // вид сообщений в Telegram
  tg: { showPhoto: true, showUz: true, showWhy: true, showLead: true, showLinks: true, quietFrom: '', quietTo: '' },
};
const CAT_UZ = { news: 'Yangiliklar', society: 'Jamiyat', sport: 'Sport', business: 'Biznes', culture: 'Madaniyat', world: 'Dunyo' };
const pad = (n) => String(n).padStart(2, '0');
const ytOk = (u = '') => /(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)[\w-]{11}/.test(u);

function createRobot({ DATA, PUBLIC, getDb, saveDb, readCfg, writeCfg, localStamp }) {
  const STATE_FILE = path.join(DATA, 'robot.json');
  let state = { candidates: [], seen: {}, matches: {}, lastRun: 0, lastError: '', log: [], prefs: { words: {} } };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch (e) {}
  const saveState = () => { fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(state)); fs.renameSync(STATE_FILE + '.tmp', STATE_FILE); };

  const cfg = () => {
    const all = readCfg();
    const r = { ...DEFAULTS, ...(all.robot || {}) };
    r.groups = { ...DEFAULTS.groups, ...(r.groups || {}) };
    r.tg = { ...DEFAULTS.tg, ...(r.tg || {}) };
    if (!Array.isArray(r.sources) || !r.sources.length) r.sources = DEFAULT_SOURCES.map((x) => ({ ...x }));
    if (!r.pairCode) { r.pairCode = crypto.randomBytes(3).toString('hex'); writeCfg({ ...all, robot: r }); }
    if (process.env.ANTHROPIC_API_KEY && !r.anthropicKey) r.anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (process.env.TELEGRAM_BOT_TOKEN && !r.botToken) r.botToken = process.env.TELEGRAM_BOT_TOKEN;
    return r;
  };
  const setCfg = (patch) => { const all = readCfg(); all.robot = { ...cfg(), ...patch }; writeCfg(all); };

  function log(msg) {
    const line = `${localStamp()} ${msg}`;
    console.log('[robot]', msg);
    state.log = [line, ...(state.log || [])].slice(0, 80);
  }

  // ---------- Telegram ----------
  const bot = createBot(() => cfg().botToken, onUpdate, log);
  const owner = (chatId) => String(cfg().chatId) === String(chatId);

  async function onUpdate(u) {
    if (u.callback_query) {
      const q = u.callback_query;
      if (!owner(q.message?.chat?.id)) return bot.call('answerCallbackQuery', { callback_query_id: q.id, text: 'Нет доступа' });
      const [action, id] = String(q.data || '').split(':');
      let text = '';
      try { text = await act(id, action); } catch (e) { text = '⚠️ ' + e.message; }
      return bot.call('answerCallbackQuery', { callback_query_id: q.id, text: text.slice(0, 190) }).catch(() => {});
    }
    const m = u.message; if (!m?.text) return;
    const [cmd, arg] = m.text.trim().split(/\s+/);
    const c = cfg();
    if (cmd === '/start') {
      if (arg && arg === c.pairCode) {
        setCfg({ chatId: String(m.chat.id) });
        log(`бот привязан к чату ${m.chat.id}`);
        return say(m.chat.id, '✅ Готово! Теперь я буду присылать сюда топ-новости на одобрение.\n\n/scan — проверить сейчас\n/status — состояние\n/pause, /resume — пауза робота');
      }
      if (!owner(m.chat.id)) return say(m.chat.id, 'Это приватный бот редакции. Код привязки — в CRM → Робот.');
    }
    if (!owner(m.chat.id)) return;
    if (cmd === '/scan') { say(m.chat.id, '🔎 Ищу новости…'); runCycle(true).then((n) => say(m.chat.id, n ? `Готово: новых — ${n}` : 'Новых топ-новостей пока нет.')); return; }
    if (cmd === '/pause') { setCfg({ enabled: false }); return say(m.chat.id, '⏸ Робот на паузе. /resume — включить.'); }
    if (cmd === '/resume') { setCfg({ enabled: true }); return say(m.chat.id, '▶️ Робот снова работает.'); }
    if (cmd === '/status' || cmd === '/start' || cmd === '/help') {
      const pend = state.candidates.filter((x) => x.status === 'pending').length;
      return say(m.chat.id, `${c.enabled ? '▶️ Работает' : '⏸ Пауза'} · проверка каждые ${c.intervalMin} мин\nПоследняя: ${state.lastRun ? localStamp(new Date(state.lastRun)).replace('T', ' ') : '—'}\nЖдут решения: ${pend}\nAI-редактор: ${c.anthropicKey ? 'включён' : 'нет ключа (короткие заметки)'}${state.lastError ? `\nОшибка: ${state.lastError}` : ''}`);
    }
  }
  const say = (chatId, text) => bot.call('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true } }).catch((e) => log(e.message));

  function card(c) {
    const d = c.draft; const ru = (k) => d[k].ru || d[k].uz || ''; const uz = (k) => d[k].uz || '';
    const o = cfg().tg;
    const head = c.type === 'match'
      ? `⚽ <b>${h(c.match.home)} ${c.match.hs}:${c.match.as} ${h(c.match.away)}</b>\n${h(c.match.league)}${c.match.round ? ` · ${h(c.match.round)}-й тур` : ''}${c.video ? '\n🎬 Есть видео-обзор' : ''}`
      : `${(c.why || []).some((w) => w.startsWith('🔥')) ? '🔥' : '📰'} <b>${c.group === 'sport' ? 'Спорт' : 'Узбекистан'}</b>${o.showWhy ? ` · ${h((c.why || [`источников: ${c.sources.length}`]).join(' · '))}` : ''}`;
    const links = o.showLinks ? c.sources.slice(0, 4).map((s) => `<a href="${h(s.link)}">${h(s.name)}</a>`).join(' · ') : '';
    let t = `${head}\n\n<b>${h(ru('title'))}</b>${o.showLead && ru('lead') ? `\n<i>${h(ru('lead'))}</i>` : ''}${o.showUz && uz('title') && uz('title') !== ru('title') ? `\n\n🇺🇿 ${h(uz('title'))}` : ''}${links ? `\n\n${links}` : ''}`;
    if (t.length > 1000) t = t.slice(0, 990) + '…';
    return t;
  }
  const buttons = (c) => ({ inline_keyboard: [
    [{ text: c.image ? '✅ Опубликовать с фото' : '✅ Опубликовать', callback_data: `pub:${c.id}` }, ...(c.image ? [{ text: '🟥 Без фото', callback_data: `plain:${c.id}` }] : [])],
    [{ text: '⭐ Главной', callback_data: `top:${c.id}` }, { text: '📝 Черновик', callback_data: `draft:${c.id}` }, { text: '❌ Нет', callback_data: `skip:${c.id}` }],
  ] });

  // тихие часы: сообщения приходят без звука (например, 23:00–07:00)
  function isQuiet() {
    const { quietFrom: a, quietTo: b } = cfg().tg;
    if (!/^\d\d:\d\d$/.test(a || '') || !/^\d\d:\d\d$/.test(b || '') || a === b) return false;
    const now = localStamp().slice(11, 16);
    return a < b ? now >= a && now < b : now >= a || now < b;
  }

  async function notify(c) {
    const chat = cfg().chatId; if (!chat || !cfg().botToken) return;
    const base = { chat_id: chat, parse_mode: 'HTML', reply_markup: buttons(c), disable_notification: isQuiet() };
    let msg = null;
    if (c.image && cfg().tg.showPhoto) msg =await bot.call('sendPhoto', { ...base, photo: c.image, caption: card(c) }).catch(() => null);
    if (msg) c.tg = { chat, id: msg.message_id, photo: true };
    else { msg = await bot.call('sendMessage', { ...base, text: card(c), link_preview_options: { is_disabled: true } }); c.tg = { chat, id: msg.message_id, photo: false }; }
  }

  async function markDone(c, text) {
    if (!c.tg) return;
    const site = cfg().siteUrl.replace(/\/$/, '');
    const link = c.postId && c.status === 'published' ? `${site}/article.html?id=${encodeURIComponent(c.postId)}` : '';
    const isPublic = link && !/localhost|127\.0\.0\.1/.test(site);
    await bot.call('editMessageReplyMarkup', { chat_id: c.tg.chat, message_id: c.tg.id, reply_markup: isPublic ? { inline_keyboard: [[{ text: '↗ Открыть на сайте', url: link }]] } : { inline_keyboard: [] } }).catch(() => {});
    await bot.call('sendMessage', { chat_id: c.tg.chat, reply_parameters: { message_id: c.tg.id }, text: link && !isPublic ? `${text}\n${link}` : text, link_preview_options: { is_disabled: true } }).catch(() => {});
  }

  // ---------- сбор ----------
  let busy = false;
  async function runCycle(force = false) {
    const c = cfg();
    if (busy || (!force && !c.enabled)) return 0;
    busy = true; state.lastRun = Date.now(); state.lastError = '';
    let added = 0;
    try {
      const fresh = [];
      const since = Date.now() - c.maxAgeH * 3600e3;
      // источники из настроек CRM: RSS-ленты сайтов и Telegram-каналы
      const feeds = c.sources.filter((f) => f.enabled !== false && c.groups[f.group] !== false);
      const res = await Promise.allSettled(feeds.map((f) => readSource(f)));
      res.forEach((r, i) => {
        const f = feeds[i];
        if (r.status === 'rejected') return log(`${f.name}: ${r.reason.message}`);
        r.value.filter((it) => it.date >= since).forEach((it) => fresh.push({ ...it, image: f.photos ? it.image : '', photos: !!f.photos, feedId: f.id, source: f.name, group: f.group, lang: f.lang }));
      });

      // забываем старое
      const cutoff = Date.now() - 4 * 86400e3;
      for (const k of Object.keys(state.seen)) if (state.seen[k] < cutoff) delete state.seen[k];
      for (const k of Object.keys(state.matches)) if (state.matches[k] < cutoff) delete state.matches[k];
      state.candidates = state.candidates.filter((x) => x.created > cutoff || x.status === 'pending').slice(0, 300);

      state.prefs = state.prefs || { words: {} };
      const clusters = cluster(fresh, state.prefs);
      const picked = [];
      for (const cl of clusters) {
        const seenAlready = cl.items.some((it) => state.seen[it.link]);
        if (seenAlready) { cl.items.forEach((it) => { state.seen[it.link] = state.seen[it.link] || Date.now(); }); continue; }
        if (cl.junk) { cl.items.forEach((it) => { state.seen[it.link] = Date.now(); }); continue; } // реклама и PR
        if (cl.like <= -12) continue; // очень похоже на то, что вы всегда пропускаете
        // «горячее»: 2+ издания за последний час — предлагаем, даже если порог изданий выше
        if (cl.sources.length < c.minSources && !(cl.lastHour >= 2 && cl.sources.length >= 2) && !cl.hotTalk) continue;
        if (picked.length >= c.maxPerRun) break;
        picked.push(cl);
        cl.items.forEach((it) => { state.seen[it.link] = Date.now(); });
      }

      const matches = [];
      if (c.groups.matches !== false) {
        const lr = await Promise.allSettled(LEAGUES.map((l) => leagueResults(l.id, c.sportsDbKey)));
        lr.forEach((r, i) => {
          if (r.status === 'rejected') return log(`TheSportsDB ${LEAGUES[i].name}: ${r.reason.message}`);
          r.value.filter((m) => !state.matches[m.id] && Date.now() - m.ts < 36 * 3600e3 && Date.now() - m.ts > 100 * 60e3).forEach((m) => { state.matches[m.id] = Date.now(); matches.push(m); });
        });
      }

      for (const m of matches) { await prepare({ type: 'match', match: m, related: fresh.filter((it) => it.group === 'sport') }); added++; }
      // по одной: следующая история сверяется с уже готовыми черновиками (ловит ту же новость на другом языке)
      for (const cl of picked) {
        const dup = findDup(cl.items.map((it) => it.title));
        if (dup) { mergeSources(dup, cl.items); continue; }
        if (await prepare({ type: 'news', cluster: cl })) added++;
      }
      if (added) log(`новых на одобрение: ${added}`);
    } catch (e) {
      state.lastError = e.message; log('ошибка цикла: ' + e.message);
    } finally { busy = false; saveState(); }
    return added;
  }

  // Та же история уже есть среди новостей за сутки? Сравниваем с заголовками черновиков на обоих языках.
  function findDup(titles, exceptId) {
    const day = Date.now() - 24 * 3600e3;
    const shared = (a, b) => { const B = new Set(b); return a.filter((w) => B.has(w)).length; };
    const mine = titles.map((t) => ({ tok: tokens(t).slice(0, 14), sk: skeleton(t) }));
    for (const x of state.candidates) {
      if (x.id === exceptId || x.created < day || x.type !== 'news' || !x.draft) continue;
      const theirs = [x.draft.title.ru, x.draft.title.uz, ...(x.sources || []).map((s) => s.title)].filter(Boolean).map((t) => ({ tok: tokens(t).slice(0, 14), sk: skeleton(t) }));
      for (const a of mine) for (const b of theirs) {
        // тот же язык — по словам; другой язык — по общим именам, местам и числам
        if (a.tok.length >= 3 && b.tok.length >= 3 && shared(a.tok, b.tok) / Math.min(a.tok.length, b.tok.length) >= 0.5) return x;
        const n = shared(a.sk, b.sk);
        if (n >= 2 && n / Math.min(a.sk.length, b.sk.length) >= 0.2) return x;
      }
    }
    return null;
  }
  function mergeSources(x, items) {
    for (const it of items) if (!x.sources.some((s) => s.name === it.source)) x.sources.push({ name: it.source, link: it.link, title: it.title });
  }

  async function prepare({ type, cluster: cl, match: m, related }) {
    const c = cfg();
    const cand = { id: crypto.randomBytes(5).toString('hex'), type, status: 'pending', created: Date.now(), sources: [], draft: null, image: '', video: '', banner: '' };
    let material = '';
    try {
      if (type === 'news') {
        cand.group = cl.group; cand.score = Math.round(cl.score); cand.why = cl.why; cand.autoCat = cl.cat;
        cand.sources = cl.items.filter((x, i, a) => a.findIndex((y) => y.source === x.source) === i).map((x) => ({ name: x.source, link: x.link, title: x.title }));
        const isTgPost = /^https:\/\/t\.me\//.test(cl.lead.link);
        const art = isTgPost ? { text: '', image: '' } : await readArticle(cl.lead.link).catch(() => ({ text: '', image: '' }));
        // фото берём только у источников, где вы это разрешили (без чужих водяных знаков)
        cand.image = cl.lead.image || (cl.lead.photos ? art.image : '') || '';
        cand.imageSource = cl.lead.source;
        material = cl.items.slice(0, 6).map((it, i) => `### ${it.source} (${new Date(it.date).toISOString()})\nЗаголовок: ${it.title}\nАнонс: ${it.desc}${i === 0 && art.text ? `\nТекст:\n${art.text}` : ''}`).join('\n\n');
        if (cl.lead !== cl.items[0] && art.text) material += `\n\n### Полный текст (${cl.lead.source})\n${art.text}`;
      } else {
        cand.group = 'sport'; cand.match = m; cand.score = 100;
        cand.video = ytOk(m.video) ? m.video : '';
        cand.image = m.thumb || '';
        cand.imageSource = 'TheSportsDB';
        // материалы о матче: в заголовке/анонсе есть обе команды
        const th = tokens(m.home).filter((w) => !/^(fc|club|unite|city|real|dinam|sport)/.test(w)), ta = tokens(m.away).filter((w) => !/^(fc|club|unite|city|real|dinam|sport)/.test(w));
        const rel = related.filter((it) => { const t = tokens(it.title + ' ' + it.desc); return th.some((w) => t.includes(w)) && ta.some((w) => t.includes(w)); }).slice(0, 5);
        cand.sources = [{ name: 'TheSportsDB', link: `https://www.thesportsdb.com/event/${m.id}` }, ...rel.filter((x, i, a) => a.findIndex((y) => y.source === x.source) === i).map((x) => ({ name: x.source, link: x.link, title: x.title }))];
        material = `Матч: ${m.home} ${m.hs}:${m.as} ${m.away}\nТурнир: ${m.league}${m.round ? `, тур ${m.round}` : ''}, сезон ${m.season}\nДата: ${m.date}${m.venue ? `\nСтадион: ${m.venue}` : ''}\n\nМатериалы о матче:\n${rel.map((x) => `- ${x.source}: ${x.title}. ${x.desc}`).join('\n') || '(нет — пиши только по счёту, коротко)'}`;
      }

      if (c.anthropicKey) {
        try { cand.draft = await aiWrite(c, material); } catch (e) { log('AI: ' + e.message); }
      }
      if (!cand.draft) {
        cand.draft = type === 'news' ? plainWrite(cl) : {
          cat: 'sport',
          title: { ru: `${m.home} ${m.hs}:${m.as} ${m.away}`, uz: `${m.home} ${m.hs}:${m.as} ${m.away}` },
          lead: { ru: `${m.league}${m.round ? `, ${m.round}-й тур` : ''}. Итоговый счёт матча.`, uz: `${m.league}${m.round ? `, ${m.round}-tur` : ''}. Uchrashuvning yakuniy hisobi.` },
          body: { ru: `Матч ${m.home} — ${m.away} завершился со счётом ${m.hs}:${m.as}.${m.venue ? ` Игра прошла на стадионе «${m.venue}».` : ''}`, uz: `${m.home} — ${m.away} uchrashuvi ${m.hs}:${m.as} hisobi bilan yakunlandi.${m.venue ? ` O‘yin «${m.venue}» stadionida bo‘lib o‘tdi.` : ''}` },
        };
      }
      cand.draft.cat = cand.draft.cat || (type === 'match' ? 'sport' : cand.autoCat || (cand.group === 'sport' ? 'sport' : 'news'));
      if (type === 'news') {
        const dup = findDup([cand.draft.title.ru, cand.draft.title.uz].filter(Boolean));
        if (dup) { mergeSources(dup, cl.items); log(`дубль пропущен: ${cand.draft.title.ru || cand.draft.title.uz}`); return false; }
      }
      cand.banner = await makeBanner(cand);
    } catch (e) {
      cand.status = 'error'; cand.error = e.message; log('подготовка: ' + e.message);
    }
    state.candidates.unshift(cand);
    saveState();
    if (cand.status === 'pending') await notify(cand).catch((e) => log('telegram: ' + e.message));
    saveState();
    return true;
  }

  function uploadPath(ext) {
    const d = new Date(); const sub = `${d.getFullYear()}${pad(d.getMonth() + 1)}`;
    const dir = path.join(PUBLIC, 'uploads', 'robot', sub);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
    return { file: path.join(dir, name), url: `/uploads/robot/${sub}/${name}` };
  }

  async function dataUri(url) {
    if (!url) return '';
    for (const u of [url + '/small', url]) {
      try { const { buf, type } = await get(u, { as: 'buffer', timeout: 15000 }); if (/^image\//.test(type) && buf.length < 1.5e6) return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`; } catch (e) {}
    }
    return '';
  }

  async function makeBanner(cand) {
    const d = new Date(); const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    let svg;
    if (cand.type === 'match') {
      const m = cand.match;
      const [homeBadge, awayBadge] = await Promise.all([dataUri(m.homeBadge), dataUri(m.awayBadge)]);
      svg = matchBanner({ ...m, homeBadge, awayBadge, date: m.date.split('-').reverse().join('.') });
    } else {
      const d = cand.draft;
      svg = newsBanner({ cat: d.cat, tag: CAT_UZ[d.cat] || 'Yangiliklar', date, group: cand.group, sources: (cand.sources || []).map((s) => s.name), text: [d.title.uz, d.title.ru, d.lead.uz, d.lead.ru].filter(Boolean).join(' . ') });
    }
    const out = uploadPath('svg');
    fs.writeFileSync(out.file, svg);
    return out.url;
  }

  async function downloadImage(url) {
    const { buf, type } = await get(url, { as: 'buffer', timeout: 25000 });
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type.split(';')[0].trim()];
    if (!ext) throw new Error('Источник отдал не картинку');
    if (buf.length > 10 * 1024 * 1024) throw new Error('Фото слишком большое');
    const out = uploadPath(ext);
    fs.writeFileSync(out.file, buf);
    return out.url;
  }

  // ---------- обучение на ваших решениях ----------
  // Опубликовали — слова этой истории получают +1 (главной — +2), пропустили — −1. Со временем робот
  // поднимает похожие темы выше и перестаёт предлагать то, что вы всегда пропускаете.
  function learn(cand, delta) {
    if (cand.type !== 'news' || !cand.draft) return;
    state.prefs = state.prefs || { words: {} };
    const w = state.prefs.words;
    const text = [cand.draft.title.ru, cand.draft.title.uz, ...(cand.sources || []).map((s) => s.title)].filter(Boolean).join(' ');
    for (const t of tokens(text).filter((x) => !/^\d+$/.test(x))) w[t] = Math.max(-5, Math.min(5, (w[t] || 0) + delta));
    // память не разрастается: оставляем 3000 самых значимых слов
    const keys = Object.keys(w);
    if (keys.length > 3000) keys.sort((a, b) => Math.abs(w[a]) - Math.abs(w[b])).slice(0, keys.length - 3000).forEach((k) => delete w[k]);
  }

  // ---------- решение редактора ----------
  const acting = new Set();
  async function act(id, action, edits) {
    const cand = state.candidates.find((x) => x.id === id);
    if (!cand) throw new Error('Новость не найдена (устарела)');
    if (cand.status !== 'pending' && cand.status !== 'error') return `Уже обработано: ${cand.status}`;
    if (acting.has(id)) return 'Уже выполняется…';
    acting.add(id);
    try {
      if (edits) cand.draft = { ...cand.draft, ...edits };
      if (action === 'skip') { learn(cand, -1); cand.status = 'skipped'; saveState(); await markDone(cand, '❌ Пропущено'); return 'Пропущено'; }
      if (action === 'img') action = 'pub';
      if (!['pub', 'plain', 'top', 'draft'].includes(action)) throw new Error('Неизвестное действие');

      // вариант B: фото источника (заголовок сайт кладёт поверх фото); без фото — фирменный фон, у матча — табло
      let image = ''; let photoCredit = '';
      if (action !== 'plain' && cand.image) {
        try { image = await downloadImage(cand.image); photoCredit = cand.imageSource || ''; } catch (e) { log('фото: ' + e.message); }
      }
      if (!image && cand.type === 'match') image = cand.banner;
      const now = localStamp();
      const d = cand.draft;
      const post = {
        id: 'r' + crypto.randomBytes(5).toString('hex'), cat: d.cat || 'news', status: action === 'draft' ? 'draft' : 'published',
        date: now.slice(0, 10), time: now.slice(11, 16), views: 0, image, imageMobile: '',
        title: { ru: d.title.ru || '', uz: d.title.uz || '' }, lead: { ru: d.lead.ru || '', uz: d.lead.uz || '' }, body: { ru: d.body.ru || '', uz: d.body.uz || '' },
        source: cand.sources.filter((s) => s.name !== 'TheSportsDB').slice(0, 4).map((s) => ({ name: s.name, link: s.link })),
        robot: true,
      };
      if (photoCredit) post.photoCredit = photoCredit;
      if (cand.video) post.video = cand.video;
      if (cand.match) post.score = { home: cand.match.home, away: cand.match.away, hs: cand.match.hs, as: cand.match.as, league: cand.match.league };

      const db = getDb();
      db.posts = [post, ...(db.posts || [])];
      if (action === 'top') { db.layout = db.layout || {}; db.layout.main = [post.id]; }
      if (cand.video && action !== 'draft') {
        db.videos = db.videos || [];
        if (!db.videos.some((v) => v.url === cand.video)) db.videos.unshift({ id: 'v' + crypto.randomBytes(4).toString('hex'), url: cand.video, title: { uz: post.title.uz, ru: post.title.ru } });
      }
      saveDb();
      learn(cand, action === 'top' ? 2 : 1);
      cand.status = action === 'draft' ? 'draft' : 'published'; cand.postId = post.id;
      saveState();
      const msg = action === 'draft' ? '📝 Сохранено в черновики CRM' : action === 'top' ? '⭐ Опубликовано главной новостью' : '✅ Опубликовано на сайте';
      log(`${msg}: ${post.title.ru || post.title.uz}`);
      await markDone(cand, msg);
      return msg;
    } finally { acting.delete(id); }
  }

  // ---------- для CRM ----------
  const mask = (s) => (s ? '••••' + String(s).slice(-4) : '');
  function status() {
    const c = cfg();
    return {
      config: { ...c, botToken: mask(c.botToken), anthropicKey: mask(c.anthropicKey), hasToken: !!c.botToken, hasKey: !!c.anthropicKey },
      lastRun: state.lastRun, lastError: state.lastError, busy, log: state.log.slice(0, 40),
      candidates: state.candidates.slice(0, 80),
      feeds: c.sources.filter((f) => f.enabled !== false), leagues: LEAGUES,
    };
  }
  async function configure(patch) {
    const allowed = ['enabled', 'botToken', 'anthropicKey', 'model', 'intervalMin', 'minSources', 'maxPerRun', 'maxAgeH', 'groups', 'sportsDbKey', 'siteUrl', 'chatId'];
    const p = {};
    for (const k of allowed) if (k in patch) p[k] = patch[k];
    for (const k of ['botToken', 'anthropicKey']) if (typeof p[k] === 'string' && (p[k].startsWith('••••') || !p[k].trim())) delete p[k];
    if (patch.clearKey) p.anthropicKey = '';
    for (const k of ['intervalMin', 'minSources', 'maxPerRun', 'maxAgeH']) if (k in p) p[k] = Math.max(1, Math.min(240, +p[k] || DEFAULTS[k]));
    if (p.botToken && p.botToken !== cfg().botToken) p.chatId = '';
    if (patch.tg && typeof patch.tg === 'object') {
      const t = patch.tg; const time = (v) => (/^\d\d:\d\d$/.test(v || '') ? v : '');
      p.tg = { showPhoto: !!t.showPhoto, showUz: !!t.showUz, showWhy: !!t.showWhy, showLead: !!t.showLead, showLinks: !!t.showLinks, quietFrom: time(t.quietFrom), quietTo: time(t.quietTo) };
    }
    if (patch.unlink) p.chatId = '';
    if (Array.isArray(patch.sources)) {
      const seen = new Set();
      p.sources = patch.sources.slice(0, 60).map((x) => ({
        id: String(x.id || ('s' + crypto.randomBytes(4).toString('hex'))).slice(0, 40), type: x.type === 'tg' ? 'tg' : 'rss',
        name: String(x.name || '').trim().slice(0, 40) || 'Источник', url: String(x.url || '').trim().slice(0, 300),
        group: x.group === 'sport' ? 'sport' : 'uz', lang: ['ru', 'uz', 'en'].includes(x.lang) ? x.lang : 'ru',
        enabled: x.enabled !== false, photos: !!x.photos,
      })).filter((x) => x.url && !seen.has(x.type + x.url) && seen.add(x.type + x.url));
    }
    setCfg(p);
    if (p.botToken) { const me = await bot.call('getMe'); setCfg({ botUsername: me.username }); return { bot: me.username }; }
    return {};
  }
  async function test() {
    const c = cfg();
    const me = await bot.call('getMe');
    if (!c.chatId) return { bot: me.username, paired: false };
    await bot.call('sendMessage', { chat_id: c.chatId, text: '👋 Проверка связи: бот MILLIYBIZ на месте.' });
    return { bot: me.username, paired: true };
  }

  // ---------- оформление профиля бота (то, что люди видят в Telegram) ----------
  const COMMANDS = [
    { command: 'scan', description: 'Проверить новости сейчас' },
    { command: 'status', description: 'Состояние робота' },
    { command: 'pause', description: 'Поставить робота на паузу' },
    { command: 'resume', description: 'Снова включить робота' },
  ];
  async function profile() {
    const [me, name, short, desc, cmds] = await Promise.all([
      bot.call('getMe'), bot.call('getMyName'), bot.call('getMyShortDescription'), bot.call('getMyDescription'), bot.call('getMyCommands'),
    ]);
    return { username: me.username, name: name.name || '', short: short.short_description || '', description: desc.description || '', commands: cmds.length > 0 };
  }
  async function setProfile(b) {
    const name = String(b.name || '').trim().slice(0, 64);
    const short = String(b.short || '').trim().slice(0, 120);
    const description = String(b.description || '').trim().slice(0, 512);
    if (!name) throw new Error('Укажите имя бота');
    const cur = await bot.call('getMyName');
    // Telegram ограничивает частую смену имени — меняем только если оно другое
    if (cur.name !== name) await bot.call('setMyName', { name });
    await bot.call('setMyShortDescription', { short_description: short });
    await bot.call('setMyDescription', { description });
    if (b.commands) await bot.call('setMyCommands', { commands: COMMANDS }); else await bot.call('deleteMyCommands');
    log('оформление бота обновлено');
    return profile();
  }

  function start() {
    bot.start();
    setInterval(() => {
      const c = cfg();
      if (c.enabled && Date.now() - state.lastRun >= c.intervalMin * 60e3) runCycle();
    }, 30e3);
    setTimeout(() => { if (cfg().enabled) runCycle(); }, 5000);
  }

  return { start, runCycle, act, status, configure, test, profile, setProfile, probe: probeSource };
}

module.exports = { createRobot };
