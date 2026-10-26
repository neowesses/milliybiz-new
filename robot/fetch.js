// Загрузка из интернета: RSS/Atom, текст и фото статьи, матчи TheSportsDB. Без зависимостей.
'use strict';

const UA = 'Mozilla/5.0 (compatible; MilliybizBot/1.0; +https://milliybiz.uz)';

async function get(url, { timeout = 20000, as = 'text' } = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  if (as === 'json') return r.json();
  if (as === 'buffer') return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || '' };
  return r.text();
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
const decode = (s = '') => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
const stripTags = (s = '') => decode(decode(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\s[^>]*${a}=["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; };

function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const link = stripTags(tag(b, 'link')) || attr(b, 'link', 'href');
    const date = Date.parse(stripTags(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
    const image = attr(b, 'enclosure', 'url') || attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || '';
    return {
      title: stripTags(tag(b, 'title')),
      desc: stripTags(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).replace(/\s*\.$/, '.').slice(0, 600),
      link: link.trim(),
      date: Number.isFinite(date) ? date : Date.now(),
      category: stripTags(tag(b, 'category')),
      image: /\.(jpe?g|png|webp)(\?|$)/i.test(image) || /image/i.test(b.match(/<enclosure[^>]*>/i)?.[0] || '') ? image : '',
    };
  }).filter((x) => x.title && /^https?:\/\//.test(x.link));
}

// Публичный Telegram-канал (t.me/s/<канал>): последние ~20 постов с просмотрами и реакциями — это «что обсуждают».
const num = (s = '') => { const m = String(s).trim().match(/^([\d.,]+)\s*([KM])?$/i); if (!m) return 0; const n = parseFloat(m[1].replace(',', '.')); return Math.round(n * (m[2] ? (m[2].toUpperCase() === 'M' ? 1e6 : 1e3) : 1)); };
function parseTelegram(html, channel) {
  return html.split('tgme_widget_message_wrap').slice(1).map((b) => {
    const post = (b.match(/data-post="([^"]+)"/) || [])[1];
    const raw = (b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
    const text = stripTags(raw.replace(/<br\s*\/?>/gi, '\n')).trim();
    const bold = stripTags((raw.match(/^\s*<b>([\s\S]*?)<\/b>/) || [])[1] || '');
    const first = text.split(/\n|(?<=[.!?])\s/)[0] || '';
    const date = Date.parse((b.match(/datetime="([^"]+)"/) || [])[1] || '');
    const reactions = (b.match(/tgme_reaction[\s\S]*?<\/span>/g) || []).reduce((s, r) => s + num(stripTags(r).replace(/[^\d.,KM]/gi, '')), 0);
    return {
      title: (bold || first).replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim().slice(0, 200), desc: text.slice((bold || first).length).trim().slice(0, 600),
      link: post ? `https://t.me/${post}` : '', date: Number.isFinite(date) ? date : Date.now(),
      views: num((b.match(/message_views">([^<]+)/) || [])[1]), reactions,
      image: (b.match(/message_photo_wrap[^>]*background-image:url\('([^']+)'/) || [])[1] || '', channel,
    };
  }).filter((x) => x.title.length > 15 && x.link);
}
// Насколько пост «гудит»: просмотры в час относительно обычного уровня этого канала (1 = как обычно, 3 = втрое больше)
function addBuzz(items) {
  const now = Date.now();
  const vph = items.map((x) => (x.views + x.reactions * 30) / Math.max(0.5, (now - x.date) / 3600e3));
  const med = [...vph].sort((a, b) => a - b)[Math.floor(vph.length / 2)] || 1;
  items.forEach((x, i) => { x.buzz = +(vph[i] / med).toFixed(2); });
  return items;
}

// Текст статьи для переписывания + og:image. Грубо, но без зависимостей: берём <p> из <article> или всей страницы.
async function readArticle(url) {
  const html = await get(url, { timeout: 20000 });
  const meta = (p) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*>`, 'i')); return m ? decode((m[0].match(/content=["']([^"']*)["']/i) || [])[1] || '') : ''; };
  const clean = html.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const scope = (clean.match(/<article[\s\S]*?<\/article>/i) || [clean])[0];
  const paras = (scope.match(/<p[\s>][\s\S]*?<\/p>/gi) || []).map(stripTags).filter((t) => t.length > 40);
  return { text: paras.join('\n\n').slice(0, 9000), image: meta('og:image'), description: meta('og:description') };
}

// Последние завершённые матчи лиги (бесплатный ключ TheSportsDB отдаёт последнее событие лиги).
async function leagueResults(leagueId, key = '123') {
  const j = await get(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventspastleague.php?id=${encodeURIComponent(leagueId)}`, { as: 'json' });
  return (j.events || []).filter((e) => e.intHomeScore !== null && e.intHomeScore !== '' && e.intAwayScore !== null && e.intAwayScore !== '').map((e) => ({
    id: e.idEvent, league: e.strLeague, round: e.intRound, season: e.strSeason,
    date: e.dateEvent, ts: Date.parse((e.strTimestamp || `${e.dateEvent}T${e.strTime || '00:00:00'}`) + 'Z'),
    home: e.strHomeTeam, away: e.strAwayTeam, hs: +e.intHomeScore, as: +e.intAwayScore,
    homeBadge: e.strHomeTeamBadge || '', awayBadge: e.strAwayTeamBadge || '',
    venue: e.strVenue || '', video: e.strVideo || '', thumb: e.strThumb || e.strPoster || '', status: e.strStatus || '',
  }));
}

// Один источник из настроек → список записей. type: 'rss' (url ленты) или 'tg' (имя канала)
async function readSource(src) {
  if (src.type === 'tg') return addBuzz(parseTelegram(await get(`https://t.me/s/${encodeURIComponent(src.url)}`), src.url));
  return parseFeed(await get(src.url));
}
// Проверка нового источника из CRM: что это и сколько записей отдаёт
async function probeSource(input) {
  const s = String(input || '').trim();
  const tg = s.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{4,})\/?$/) || s.match(/^@([A-Za-z0-9_]{4,})$/);
  if (tg) {
    const html = await get(`https://t.me/s/${tg[1]}`);
    const items = parseTelegram(html, tg[1]);
    if (!items.length) throw new Error('Канал закрытый или в нём нет постов с текстом');
    const title = stripTags((html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || tg[1]);
    return { type: 'tg', url: tg[1], name: title.replace(/\s*[|—].*$/, '').slice(0, 40), count: items.length, sample: items.slice(-3).map((x) => x.title) };
  }
  if (!/^https?:\/\//.test(s) && !/^[\w-]+(\.[\w-]+)+/.test(s)) throw new Error('Вставьте адрес сайта, RSS-ленты или Telegram-канала (t.me/…)');
  let url = /^https?:\/\//.test(s) ? s : 'https://' + s;
  let xml = await get(url).catch(() => '');
  let items = parseFeed(xml);
  // дали адрес сайта, а не ленты — ищем ленту сами: ссылка в коде страницы или обычные адреса
  if (!items.length) {
    const base = new URL(url);
    const alt = (xml.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i) || [''])[0].match(/href=["']([^"']+)["']/i);
    const tries = [alt && new URL(alt[1], base).href, ...['/rss', '/feed', '/rss.xml', '/feed.xml', '/news/rss', '/ru/rss/', '/rss/'].map((p) => base.origin + p)].filter(Boolean);
    for (const t of tries) {
      const x = await get(t).catch(() => '');
      const it = parseFeed(x);
      if (it.length) { url = t; xml = x; items = it; break; }
    }
  }
  if (!items.length) throw new Error('Не нашёл RSS-ленту на этом сайте. Попробуйте ссылку на ленту (обычно сайт/rss или сайт/feed)');
  const title = stripTags((xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/) || [])[1] || new URL(url).hostname);
  return { type: 'rss', url, name: title.replace(/\s*[-—|].*$/, '').slice(0, 40), count: items.length, sample: items.slice(0, 3).map((x) => x.title) };
}

module.exports = { get, parseFeed, parseTelegram, readSource, probeSource, readArticle, leagueResults, stripTags };
