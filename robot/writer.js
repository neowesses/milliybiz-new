// AI-редактор: пишет СВОЙ текст новости на русском и узбекском (латиница) по фактам из источников.
// Нужен ключ Anthropic (CRM → Робот). Без ключа робот делает короткую заметку из анонса со ссылкой на источник.
'use strict';

const CATS = ['news', 'society', 'sport', 'business', 'culture', 'world'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cat', 'title_ru', 'title_uz', 'lead_ru', 'lead_uz', 'body_ru', 'body_uz'],
  properties: {
    cat: { type: 'string', enum: CATS },
    title_ru: { type: 'string' }, title_uz: { type: 'string' },
    lead_ru: { type: 'string' }, lead_uz: { type: 'string' },
    body_ru: { type: 'string' }, body_uz: { type: 'string' },
  },
};

const SYSTEM = `Ты — редактор новостного сайта MILLIYBIZ (Узбекистан). Тебе дают материалы других изданий об одном событии.
Напиши собственную короткую новость на двух языках: русском и узбекском (латиница, современная орфография: o‘, g‘, sh, ch).

Правила:
- Только факты из материалов. Ничего не выдумывай: ни цифр, ни цитат, ни имён. Если факты расходятся — укажи версию с атрибуцией («по данным …»).
- Пиши своими словами, не копируй предложения источников. Прямые цитаты — только короткие и с указанием, кто сказал.
- title: до 110 знаков, без кликбейта и кавычек-ёлочек по краям. lead: одно предложение до 200 знаков — суть.
- body: 3–5 коротких абзацев, разделённых пустой строкой. В последнем абзаце укажи источник(и): «По информации …» / «… ma’lumotiga ko‘ra».
- Для матча: счёт, турнир, ключевые моменты, если они есть в материалах; без выдуманных голов и минут.
- cat: news — политика и общие новости Узбекистана, society — общество и происшествия, business — экономика, sport — спорт, culture — культура, world — мир.`;

let client = null; let clientKey = '';
function getClient(apiKey) {
  if (client && clientKey === apiKey) return client;
  const Anthropic = require('@anthropic-ai/sdk');
  client = new (Anthropic.default || Anthropic)({ apiKey });
  clientKey = apiKey;
  return client;
}

async function aiWrite(cfg, material) {
  const c = getClient(cfg.anthropicKey);
  const res = await c.beta.messages.create({
    model: cfg.model || 'claude-opus-5-5',
    max_tokens: 6000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: material }],
  });
  if (res.stop_reason === 'refusal') throw new Error('AI отказался писать этот материал');
  if (res.stop_reason === 'max_tokens') throw new Error('AI не уложился в лимит');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const j = JSON.parse(text);
  return {
    cat: CATS.includes(j.cat) ? j.cat : null,
    title: { ru: j.title_ru.trim(), uz: j.title_uz.trim() },
    lead: { ru: j.lead_ru.trim(), uz: j.lead_uz.trim() },
    body: { ru: j.body_ru.trim(), uz: j.body_uz.trim() },
  };
}

// Запасной вариант без AI: заголовок и анонс источника + ссылка. Язык — как у источника.
function plainWrite(c) {
  const it = c.lead;
  const l = it.lang === 'uz' ? 'uz' : 'ru';
  const src = c.items.filter((x, i, a) => a.findIndex((y) => y.source === x.source) === i).map((x) => x.source).join(', ');
  const body = `${it.desc || it.title}\n\n${l === 'uz' ? `Manba: ${src}.` : `Источник: ${src}.`}`;
  return { cat: null, title: { [l]: it.title }, lead: { [l]: it.desc.split(/(?<=[.!?])\s/)[0].slice(0, 220) }, body: { [l]: body } };
}

module.exports = { aiWrite, plainWrite };
