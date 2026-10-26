// Фирменные баннеры 1600×900 (SVG): карточка новости и табло матча со счётом.
'use strict';

const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const FONT = "Neometric, 'Gotham Pro', 'Segoe UI', Arial, sans-serif";
// только знак логотипа, крупнее (без надписи)
const MARK = '<g transform="translate(96 70) scale(1.75)"><g transform="translate(0 56) rotate(-90)"><path d="M43.27 0 56 12.68V67.2H12.73L0 54.52V0z" fill="#fff"/><path d="M38.181 16.229H17.308v7.484h13.902v6.018H17.308v7.484h13.902v6.018H17.308v7.484h20.873v-8.294l-4.872-5.208h4.872v-8.294l-4.872-5.208h4.872z" fill="#830101"/></g></g>';

function wrap(text, max, lines) {
  const out = []; let cur = '';
  for (const w of String(text).split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a0a0a"/><stop offset=".55" stop-color="#830101"/><stop offset="1" stop-color="#3d0000"/></linearGradient>
<pattern id="p" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="44" fill="#fff" opacity=".045"/></pattern></defs>
<rect width="1600" height="900" fill="url(#g)"/><rect width="1600" height="900" fill="url(#p)"/>${MARK}${inner}</svg>`;

// ---------- баннер новости: НЕ повторяет заголовок (он и так под картинкой) ----------
// Показывает то, что дополняет текст: рубрику с пиктограммой, главную цифру новости и где это произошло.

const ICONS = {
  // документ — общие новости
  news: '<rect x="-78" y="-100" width="156" height="200" rx="14" fill="none" stroke="#fff" stroke-width="12"/><path d="M-46-50h92M-46-14h92M-46 22h92M-46 58h56" stroke="#fff" stroke-width="12" stroke-linecap="round"/>',
  // люди — общество
  society: '<circle cx="-42" cy="-46" r="34" fill="none" stroke="#fff" stroke-width="12"/><circle cx="50" cy="-30" r="28" fill="none" stroke="#fff" stroke-width="12"/><path d="M-110 90c0-60 30-90 68-90s68 30 68 90M34 90c2-40 14-62 44-62s40 24 40 62" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>',
  // растущий график — бизнес
  business: '<path d="M-110 100h220" stroke="#fff" stroke-width="12" stroke-linecap="round"/><rect x="-96" y="30" width="40" height="60" rx="6" fill="#fff"/><rect x="-36" y="-10" width="40" height="100" rx="6" fill="#fff"/><rect x="24" y="-60" width="40" height="150" rx="6" fill="#fff"/><path d="M-100-20 L-30-70 L10-40 L90-110" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M50-112h42v42" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>',
  // мяч — спорт
  sport: '<circle r="110" fill="none" stroke="#fff" stroke-width="12"/><path d="M0-36 34-11 21 29h-42l-13-40z" fill="#fff"/><path d="M0-36V-104M34-11 96-32M21 29l40 56M-21 29l-40 56M-34-11l-62-21" stroke="#fff" stroke-width="10" stroke-linecap="round"/>',
  // восьмиконечная звезда-орнамент — культура
  culture: '<path d="M0-115 30-72 81-81 72-30 115 0 72 30 81 81 30 72 0 115-30 72-81 81-72 30-115 0-72-30-81-81-30-72z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/><circle r="34" fill="none" stroke="#fff" stroke-width="12"/>',
  // глобус — мир
  world: '<circle r="110" fill="none" stroke="#fff" stroke-width="12"/><ellipse rx="48" ry="110" fill="none" stroke="#fff" stroke-width="10"/><path d="M-110 0h220M-92-58h184M-92 58h184" stroke="#fff" stroke-width="10"/>',
};
const PIN = '<path d="M0 0c-14 0-25 11-25 25 0 19 25 45 25 45s25-26 25-45C25 11 14 0 0 0zm0 35a10 10 0 1 1 0-20 10 10 0 0 1 0 20z" fill="#fff"/>';

// Где произошло: регион Узбекистана или страна (RU и UZ написания)
const PLACES = [
  ['Toshkent', /toshkent|ташкент/i], ['Samarqand', /samarqand|самарканд/i], ['Buxoro', /buxoro|бухар/i], ['Farg‘ona', /farg.?ona|farğona|ферган/i],
  ['Andijon', /andijon|андижан/i], ['Namangan', /namangan|наманган/i], ['Xorazm', /xorazm|хорезм/i], ['Navoiy', /navoiy|навои/i],
  ['Jizzax', /jizzax|джизак/i], ['Qashqadaryo', /qashqadaryo|кашкадар/i], ['Surxondaryo', /surxondaryo|сурхандар/i], ['Sirdaryo', /sirdaryo|сырдар/i],
  ['Qoraqalpog‘iston', /qoraqalpog|каракалпак/i], ['Nukus', /nukus|нукус/i],
  ['Rossiya', /rossiya|росси/i], ['Qozog‘iston', /qozog.?iston|казахстан/i], ['Afg‘oniston', /afg.?oniston|афганистан/i], ['Xitoy', /xitoy|кита[йея]/i],
  ['AQSh', /\baqsh\b|\bсша\b/i], ['Turkiya', /turkiya|турци/i], ['Ukraina', /ukraina|украин/i], ['Braziliya', /braziliya|бразил/i], ['Serbiya', /serbiya|серби/i],
  ['Yevropa', /yevropa|европ/i], ['Janubiy Koreya', /koreya|коре[яи]/i],
];
// Главная цифра: число + единица (даты и номера туров не берём)
const UNITS = [
  [/^(млрд|mlrd|миллиард)/i, 'mlrd'], [/^(млн|mln|миллион)/i, 'mln'], [/^(тыс|ming)/i, 'ming'], [/^(%|foiz|процент)/i, '%'],
  [/^(сум|so.?m|som)/i, 'so‘m'], [/^(\$|долл|dollar)/i, '$'], [/^(лет|года?\b|yil)/i, 'yil'], [/^(человек|nafar)/i, 'nafar'],
  [/^(км|km)\b/i, 'km'], [/^(градус|°)/i, '°'], [/^(тонн|tonna)/i, 'tonna'],
];
function keyFact(text) {
  const re = /(\d+(?:[.,]\d+)?)\s*-?\s*([^\s\d.,;:!?()«»"]+(?:\s+(?:сум\w*|so.?m|долл\w*|dollar))?)/gi;
  let m;
  while ((m = re.exec(text))) {
    const num = m[1]; const word = m[2];
    const u = UNITS.find(([r]) => r.test(word)); if (!u) continue;
    let unit = u[1];
    if ((unit === 'mlrd' || unit === 'mln' || unit === 'ming') && /сум|so.?m|som/i.test(word)) unit += ' so‘m';
    if ((unit === 'mlrd' || unit === 'mln' || unit === 'ming') && /долл|dollar|\$/i.test(word)) unit = '$' + ' ' + unit;
    return { num: num.replace('.', ','), unit };
  }
  return null;
}
function placeOf(text, group) {
  const p = PLACES.find(([, r]) => r.test(text));
  return p ? p[0] : group === 'uz' ? 'O‘zbekiston' : '';
}

function newsBanner({ cat = 'news', tag, date, text = '', group = 'uz', sources = [] }) {
  const fact = keyFact(text);
  const place = placeOf(text, group);
  const src = [...new Set(sources)].slice(0, 3).join(' · ');
  const T = String(tag).toUpperCase();
  // слева: рубрика + главная цифра (или крупно рубрика), место; справа: пиктограмма рубрики в кольце
  const main = fact
    ? `<text x="96" y="520" font-family="${FONT}" font-weight="700" font-size="${fact.num.length > 4 ? 200 : 240}" fill="#fff" letter-spacing="-4">${x(fact.num)}</text>
<text x="104" y="604" font-family="${FONT}" font-weight="700" font-size="60" fill="#fff" opacity=".9">${x(fact.unit.toUpperCase())}</text>`
    : `<text x="96" y="500" font-family="${FONT}" font-weight="700" font-size="${T.length > 10 ? 104 : 128}" fill="#fff" letter-spacing="2">${x(T)}</text>`;
  return frame(`
<g transform="translate(1210 450)">
  <circle r="300" fill="#fff" opacity=".06"/><circle r="230" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3"/>
  <g transform="scale(1.35)">${ICONS[cat] || ICONS.news}</g>
</g>
<rect x="96" y="232" width="${T.length * 17 + 48}" height="48" fill="#fff"/>
<text x="120" y="265" font-family="${FONT}" font-weight="700" font-size="24" letter-spacing="2" fill="#830101">${x(T)}</text>
${main}
${place ? `<g transform="translate(110 ${fact ? 652 : 560})">${PIN}</g><text x="152" y="${fact ? 702 : 610}" font-family="${FONT}" font-weight="700" font-size="44" letter-spacing="2" fill="#fff">${x(place.toUpperCase())}</text>` : ''}
<rect x="96" y="780" width="1408" height="2" fill="#fff" opacity=".35"/>
<text x="96" y="830" font-family="${FONT}" font-size="28" fill="#fff" opacity=".85">${x(date)}${src ? `  ·  Manba: ${x(src)}` : ''}</text>
<text x="1504" y="830" text-anchor="end" font-family="${FONT}" font-size="28" fill="#fff" opacity=".85">milliybiz.uz</text>`);
}

// badges — data:URI картинок эмблем (встраиваются внутрь SVG, иначе <img> их не покажет)
function matchBanner({ league, round, home, away, hs, as, date, homeBadge, awayBadge }) {
  const team = (name, badge, cx) => `
${badge ? `<image href="${x(badge)}" x="${cx - 120}" y="250" width="240" height="240" preserveAspectRatio="xMidYMid meet"/>` : `<circle cx="${cx}" cy="370" r="120" fill="#fff" opacity=".12"/><text x="${cx}" y="400" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="90" fill="#fff">${x(name.slice(0, 1))}</text>`}
${wrap(name, 16, 2).map((l, i) => `<text x="${cx}" y="${580 + i * 52}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="46" fill="#fff">${x(l)}</text>`).join('')}`;
  return frame(`
<text x="1504" y="132" text-anchor="end" font-family="${FONT}" font-weight="700" font-size="30" letter-spacing="2" fill="#fff" opacity=".9">${x(String(league).toUpperCase())}${round ? ` · ${x(round)}-TUR` : ''}</text>
${team(home, homeBadge, 400)}${team(away, awayBadge, 1200)}
<text x="800" y="430" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="190" fill="#fff">${hs}<tspan dx="20" dy="-14" font-size="150" opacity=".7">:</tspan><tspan dx="20" dy="14">${as}</tspan></text>
<rect x="690" y="480" width="220" height="50" fill="#fff"/>
<text x="800" y="516" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="26" letter-spacing="3" fill="#830101">YAKUNIY · FT</text>
<rect x="96" y="780" width="1408" height="2" fill="#fff" opacity=".35"/>
<text x="96" y="830" font-family="${FONT}" font-size="28" fill="#fff" opacity=".85">${x(date)}</text>
<text x="1504" y="830" text-anchor="end" font-family="${FONT}" font-size="28" fill="#fff" opacity=".85">milliybiz.uz</text>`);
}

module.exports = { newsBanner, matchBanner };
