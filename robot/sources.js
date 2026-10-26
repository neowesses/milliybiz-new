// Источники робота. Добавить сайт — допишите строку: { id, name, url, group, lang }.
// group: 'uz' — новости Узбекистана, 'sport' — мировой спорт.
'use strict';

const FEEDS = [
  { id: 'kun', name: 'Kun.uz', url: 'https://kun.uz/news/rss', group: 'uz', lang: 'uz' },
  { id: 'gazeta-ru', name: 'Gazeta.uz', url: 'https://www.gazeta.uz/ru/rss/', group: 'uz', lang: 'ru' },
  { id: 'gazeta-uz', name: 'Gazeta.uz', url: 'https://www.gazeta.uz/oz/rss/', group: 'uz', lang: 'uz' },
  { id: 'daryo-uz', name: 'Daryo.uz', url: 'https://daryo.uz/feed', group: 'uz', lang: 'uz' },
  { id: 'daryo-ru', name: 'Daryo.uz', url: 'https://daryo.uz/ru/feed', group: 'uz', lang: 'ru' },
  { id: 'uza', name: 'UzA', url: 'https://uza.uz/ru/rss', group: 'uz', lang: 'ru' },
  { id: 'podrobno', name: 'Podrobno.uz', url: 'https://podrobno.uz/rss/', group: 'uz', lang: 'ru' },
  { id: 'spot', name: 'Spot.uz', url: 'https://www.spot.uz/ru/rss/', group: 'uz', lang: 'ru' },

  { id: 'bbc-sport', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', group: 'sport', lang: 'en' },
  { id: 'bbc-football', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', group: 'sport', lang: 'en' },
  { id: 'espn-soccer', name: 'ESPN', url: 'https://www.espn.com/espn/rss/soccer/news', group: 'sport', lang: 'en' },
  { id: 'championat', name: 'Чемпионат', url: 'https://www.championat.com/rss/news/', group: 'sport', lang: 'ru' },
  { id: 'sportsru', name: 'Sports.ru', url: 'https://www.sports.ru/rss/main.xml', group: 'sport', lang: 'ru' },
];

// Telegram-каналы: здесь видно, что люди реально обсуждают (просмотры и реакции под постом).
// Имя совпадает с сайтом издания — сайт и канал одного издания считаются одним источником.
const CHANNELS = [
  { id: 'tg-kun', name: 'Kun.uz', url: 'kunuzofficial', group: 'uz', lang: 'uz' },
  { id: 'tg-daryo', name: 'Daryo.uz', url: 'daryo', group: 'uz', lang: 'uz' },
  { id: 'tg-gazeta', name: 'Gazeta.uz', url: 'gazetauz', group: 'uz', lang: 'ru' },
  { id: 'tg-spot', name: 'Spot.uz', url: 'spotuz', group: 'uz', lang: 'ru' },
  { id: 'tg-uz24', name: 'O‘zbekiston 24', url: 'uzbekistan24', group: 'uz', lang: 'uz' },
  { id: 'tg-championat', name: 'Чемпионат', url: 'championat', group: 'sport', lang: 'ru' },
  { id: 'tg-sportsru', name: 'Sports.ru', url: 'sportsru', group: 'sport', lang: 'ru' },
];
// Источники по умолчанию (дальше вы меняете их в CRM → Робот → Источники).
// photos: можно ли брать фото. У Daryo на фото водяной знак, у Telegram-постов тоже часто — по умолчанию выключено.
const DEFAULT_SOURCES = [
  ...FEEDS.map((f) => ({ ...f, type: 'rss', enabled: true, photos: !/^daryo/.test(f.id) })),
  ...CHANNELS.map((c) => ({ ...c, type: 'tg', enabled: true, photos: false })),
];

// Лиги TheSportsDB: робот берёт завершённые матчи (счёт + видео-обзор YouTube, если есть).
const LEAGUES = [
  { id: '4794', name: 'O‘zbekiston Superligasi' },
  { id: '4480', name: 'UEFA Champions League' },
  { id: '4328', name: 'Premier League' },
  { id: '4335', name: 'La Liga' },
  { id: '4332', name: 'Serie A' },
  { id: '4331', name: 'Bundesliga' },
  { id: '4334', name: 'Ligue 1' },
];

// Слова, поднимающие новость выше (важность для Узбекистана и «срочность»).
const BOOST = [
  'президент', 'prezident', 'мирзиёев', 'mirziyoyev', 'указ', 'farmon', 'постановлен', 'qaror',
  'срочно', 'shoshilinch', 'взрыв', 'portlash', 'пожар', 'yong‘in', 'землетрясен', 'zilzila', 'погиб', 'halok',
  'курс', 'kurs', 'доллар', 'dollar', 'цен', 'narx', 'зарплат', 'maosh', 'пенси', 'pensiya',
  'сборная', 'terma jamoa', 'олимпи', 'olimpiya', 'чемпион', 'chempion', 'финал', 'final',
];

module.exports = { FEEDS, CHANNELS, DEFAULT_SOURCES, LEAGUES, BOOST };
