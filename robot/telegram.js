// Telegram Bot API через long polling — работает и на домашнем компьютере, вебхук не нужен.
'use strict';

function createBot(getToken, onUpdate, log) {
  let offset = 0; let running = false; let stopFlag = false;

  async function call(method, params = {}) {
    const token = getToken();
    if (!token) throw new Error('Не указан токен бота');
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 65000 : 30000),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
    return j.result;
  }

  async function loop() {
    running = true; stopFlag = false;
    while (!stopFlag) {
      if (!getToken()) { await sleep(5000); continue; }
      try {
        const ups = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
        for (const u of ups) {
          offset = u.update_id + 1;
          try { await onUpdate(u); } catch (e) { log('bot update: ' + e.message); }
        }
      } catch (e) {
        log('bot: ' + e.message);
        await sleep(/401|404|Not Found|Unauthorized/.test(e.message) ? 60000 : 5000);
      }
    }
    running = false;
  }

  return {
    call,
    start() { if (!running) loop(); },
    stop() { stopFlag = true; },
    get running() { return running; },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

module.exports = { createBot, h };
