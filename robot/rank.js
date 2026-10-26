// Отбор «топа»: одна и та же история у нескольких изданий = важная новость.
// Заголовки переводятся в латиницу, слова режутся до основы, затем сравниваются по пересечению.
'use strict';
const { BOOST } = require('./sources');

const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
const LAT = { ç: 'ch', ş: 'sh', ğ: 'g', ö: 'o', ı: 'i', ü: 'u', 'ʻ': '', 'ʼ': '', '‘': '', '’': '', "'": '', '`': '' };
const STOP = new Set('и в во на с по для что как это из от до за не но а о об к у же то так его ее их при под над без или также более после будет было были был стал uchun va bilan bu ham esa emas bir yil ning dan ga da ni the and for with from that this into after over new says'.split(' '));

const latin = (s) => s.toLowerCase().replace(/[а-яёўқғҳ]/g, (c) => CYR[c] ?? c).replace(/[çşğöıü‘’'ʻʼ`]/g, (c) => LAT[c] ?? '');
function tokens(title) {
  return [...new Set(latin(title).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => (/^\d+$/.test(w) ? w : w.slice(0, 5))))];
}
// «Скелет» слов без гласных — сближает RU и UZ написание имён и мест: Фергана/Farg‘ona → frg, Хамдамов/Hamdamov → xmdm.
// Слишком общие корни (Узбекистан, Ташкент, президент, месяцы, «банк») не считаются.
const SK_STOP = new Set(['zbk', 'tshk', 'przd', 'prz', 'ktb', 'nybr', 'dkbr', 'snv', 'fvr', 'mrt', 'prl', 'avg', 'snt', 'bnk', 'mln', 'mlrd', 'sm', 'dllr', 'xkmt', 'xkm', 'tsxk', 'tsxkn', 'vzr', 'mnstr', 'rsp', 'rspb', 'gsdr', 'kmp']);
function skeleton(title) {
  const out = new Set();
  for (const w of latin(title).replace(/h/g, 'x').split(/[^a-z0-9]+/)) {
    if (/^\d+$/.test(w)) { if (+w > 31 && !/^20\d\d$/.test(w)) out.add(w); continue; }
    if (w.length < 4) continue;
    const s = w.slice(0, 5).replace(/[aeiouy]/g, '');
    if (s.length >= 3 && !SK_STOP.has(s)) out.add(s);
  }
  return [...out];
}
const overlap =(a, b) => { const B = new Set(b); const n = a.filter((x) => B.has(x)).length; return n / Math.min(a.length, b.length || 1); };

// Реклама, PR и прочее, что не новость — такие истории робот не предлагает
const JUNK = /на правах рекламы|реклама|партн[её]рск\w* материал|при поддержке|спецпроект|гороскоп|розыгрыш|промокод|скидк|акци[яи] от|reklama|homiylik|hamkorlik asosida|chegirma|munajjimlar|tanlov e.?lon|sponsored|promo/i;

// Рубрика по ключевым словам (без AI). Порядок важен: сначала самые узнаваемые темы.
const CAT_RULES = [
  ['sport', /футбол|матч|сборн|чемпион|олимпи|турнир|(?<![а-яё])спорт|бокс|борьб|теннис|хоккей|(?<![а-яё])лига|клуб|futbol|o.?yin|terma jamoa|chempion|olimpiya|(?<![a-z])sport|boks|kurash|tennis|liga|klub|gol\b/],
  ['business', /(?<![а-яё])банк|(?<![а-яё])курс|доллар|экономик|инвест|бизнес|налог|кредит|(?<![а-яё])цен[аыуе]|тариф|экспорт|импорт|бирж|компани|рын[ок]|ввп|инфляц|(?<![a-z])bank|(?<![a-z])kurs|dollar|iqtisod|investitsiya|biznes|soliq|kredit|narx|tarif|eksport|import|birja|kompaniya|bozor|inflyatsiya/],
  ['culture', /театр|кино|фильм|музе|концерт|культур|выставк|литератур|артист|певиц|teatr|kino|film|muzey|konsert|madaniyat|ko.?rgazma|adabiyot|artist|xonanda|san.?at/],
  ['society', /(?<![а-яё])суд|полиц|мвд|отравл|дтп|авари|пожар|погиб|школ|детсад|больниц|врач|пенси|зарплат|жител|хокимият|отоплен|транспорт|(?<![a-z])sud|politsiya|iiv|zaharlan|yo.?l-transport|avariya|yong.?in|halok|maktab|bog.?cha|kasalxona|shifokor|pensiya|maosh|aholi|hokimlik|isitish|transport/],
];
const FOREIGN = /росси|казахстан|кыргыз|таджик|туркмен|афганистан|китай|сша|европ|украин|турци|иран|серби|бразил|коре|япони|герман|франц|британ|израил|rossiya|qozog|qirg.?iz|tojik|turkman|afg.?on|xitoy|aqsh|yevropa|ukraina|turkiya|eron|serbiya|braziliya|koreya|yaponiya|germaniya|fransiya|britaniya|isroil/i;
const HOME = /узбек|ўзбек|ташкент|o.?zbek|toshkent|самарканд|samarqand|бухар|buxoro|ферган|farg|андижан|andijon|наманган|namangan|хорезм|xorazm|нукус|nukus|каракалпак|qoraqalpog/i;
function catOf(text, group) {
  const t = text.toLowerCase();
  if (group === 'sport') return 'sport';
  const hit = CAT_RULES.find(([, r]) => r.test(t));
  if (hit) return hit[0];
  if (FOREIGN.test(t) && !HOME.test(t)) return 'world';
  return 'news';
}

const isTg = (x) => /^https:\/\/t\.me\//.test(x.link);
const fmtK =(n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} млн` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс.` : String(n));

// Насколько история похожа на то, что вы обычно публикуете (веса слов из ваших решений)
function learned(tok, prefs) {
  const w = prefs?.words || {};
  const s = tok.reduce((sum, t) => sum + (w[t] || 0), 0);
  return Math.max(-20, Math.min(20, s));
}

// items: [{ feedId, source, group, lang, title, desc, link, date, image, category }]
function cluster(items, prefs) {
  const clusters = [];
  for (const it of [...items].sort((a, b) => b.date - a.date)) {
    it.tok = it.tok || tokens(it.title + ' ' + it.desc.split('.')[0]);
    let best = null; let bestScore = 0;
    for (const c of clusters) {
      if (c.group !== it.group) continue;
      const s = Math.max(...c.items.map((x) => overlap(it.tok.slice(0, 14), x.tok.slice(0, 14))));
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best && bestScore >= 0.45) best.items.push(it);
    else clusters.push({ group: it.group, items: [it] });
  }
  const now = Date.now();
  for (const c of clusters) {
    const sources = new Set(c.items.map((x) => x.source));
    const newest = Math.max(...c.items.map((x) => x.date));
    const first = Math.min(...c.items.map((x) => x.date));
    const text = latin(c.items.map((x) => x.title).join(' '));
    const boost = BOOST.filter((w) => text.includes(latin(w))).length;
    const ageH = (now - first) / 3600e3;
    // скорость: сколько изданий подхватили историю за последний час — так ловим «горячее» раньше других
    const lastHour = new Set(c.items.filter((x) => now - x.date < 3600e3).map((x) => x.source)).size;
    const tok = [...new Set(c.items.flatMap((x) => x.tok))];
    const like = learned(tok, prefs);
    const full = c.items.map((x) => `${x.title} ${x.desc}`).join(' ');
    c.junk = JUNK.test(full);
    c.cat = catOf(full, c.group);
    c.sources = [...sources];
    c.newest = newest; c.first = first; c.like = like; c.lastHour = lastHour;
    // обсуждаемость в Telegram: просмотры и во сколько раз пост «гудит» сильнее обычного для своего канала
    const tg = c.items.filter((x) => x.views);
    c.views = tg.reduce((s, x) => s + x.views, 0);
    c.buzz = tg.length ? Math.max(...tg.map((x) => x.buzz || 0)) : 0;
    const buzzPts = c.buzz >= 1.3 ? Math.min(24, (c.buzz - 1) * 10) : 0;
    c.score = sources.size * 10 + Math.min(boost, 3) * 4 + Math.max(0, 6 - ageH) + (lastHour >= 2 ? lastHour * 6 : 0) + like + buzzPts + (c.views ? Math.log10(c.views) * 2 : 0);
    c.hotTalk = c.buzz >= 2 && c.views >= 20000; // очень обсуждаемое — предлагаем даже с одним изданием
    // почему робот это предлагает — показываем вам в Telegram и CRM
    c.why = [
      `${sources.size} ${sources.size === 1 ? 'издание' : sources.size < 5 ? 'издания' : 'изданий'}`,
      lastHour >= 2 ? `🔥 ${lastHour} за последний час` : '',
      c.views ? `💬 ${fmtK(c.views)} просмотров в Telegram${c.buzz >= 1.5 ? `, в ${c.buzz.toFixed(1).replace('.', ',')} раза больше обычного` : ''}` : '',
      boost ? 'важная тема' : '',
      like >= 8 ? '👍 похоже на то, что вы публикуете' : like <= -6 ? 'похоже на то, что вы пропускаете' : '',
    ].filter(Boolean);
    // главная запись кластера: та, у которой есть фото и длиннее описание
    // сначала с фото, потом статья с сайта (у неё есть полный текст), потом пост в Telegram
    c.lead = [...c.items].sort((a, b) => (!!b.image - !!a.image) || (isTg(a) - isTg(b)) || (b.desc.length - a.desc.length))[0];
    c.key = c.items.map((x) => x.link).sort()[0];
  }
  return clusters.sort((a, b) => b.score - a.score);
}

module.exports = { cluster, tokens, latin, skeleton, catOf, JUNK };
