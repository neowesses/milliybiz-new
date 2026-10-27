/* MILLIYBIZ.NEWS — мини-CRM. Все изменения сохраняются на сервер (data/db.json). */
(() => {
  'use strict';

  const CATS = { news: 'Новости', society: 'Общество', sport: 'Спорт', business: 'Бизнес', culture: 'Культура', world: 'Мир' };
  const LEAD_ST = { new: 'Новая', work: 'В работе', done: 'Закрыта', spam: 'Спам' };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const nowDate = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dmy = (d) => d ? d.split('-').reverse().join('.') : '';
  const uid = (p = 'p') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ttl = (p) => p?.title?.ru || p?.title?.uz || 'Без заголовка';
  const sortKey = (p) => `${p.date || ''}T${p.time || '00:00'}`;
  const isPlanned = (p) => p.status === 'published' && sortKey(p) > `${nowDate()}T${nowTime()}`;
  const isLive = (p) => p.status === 'published' && !isPlanned(p);

  let token = '';
  try { token = sessionStorage.getItem('mb_token') || ''; } catch (e) {}
  let DB = null;
  let dirty = false;

  // ---------- API ----------
  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
    if (r.status === 401 && path !== '/api/login') { logout(); throw new Error('Сессия истекла, войдите снова'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Ошибка ' + r.status);
    return data;
  }
  const save = async (key) => { await api('/api/admin/db/' + key, { method: 'PUT', body: JSON.stringify(DB[key]) }); dirty = false; };

  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' toast--err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  const run = async (fn, okMsg) => { try { await fn(); if (okMsg) toast(okMsg); } catch (e) { toast(e.message, true); } };

  // сжатие изображения на клиенте перед загрузкой
  function fileToDataUrl(file, maxW = 1920) {
    return new Promise((res, rej) => {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return rej(new Error('Нужен JPG, PNG, WEBP или GIF'));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('Не удалось прочитать файл'));
      fr.onload = () => {
        if (file.type === 'image/gif' || (file.type === 'image/png' && file.size < 600 * 1024)) return res(fr.result);
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, maxW / img.width);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.86));
        };
        img.onerror = () => rej(new Error('Файл повреждён'));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function upload(file, maxW) {
    const data = await fileToDataUrl(file, maxW);
    const r = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ name: file.name, data }) });
    return r.url;
  }
  // виджет загрузки: возвращает html, потом bindUploads()
  const upBox = (key, url, label, sub) => `
    <label class="up" data-up="${key}">
      ${url ? `<img src="${esc(url)}" alt=""><span class="up__tag">${esc(label)}</span><button type="button" class="up__x" data-clear="${key}">Удалить</button>` : `<span class="up__t"><b>${esc(label)}</b>${esc(sub || 'Перетащите фото или нажмите')}</span>`}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif">
    </label>`;
  function bindUploads(root, onChange, maxW) {
    $$('.up', root).forEach((box) => {
      const key = box.dataset.up;
      const input = $('input', box);
      const go = async (file) => {
        if (!file) return;
        box.classList.add('is-busy');
        try { onChange(key, await upload(file, maxW)); } catch (e) { toast(e.message, true); box.classList.remove('is-busy'); }
      };
      input.addEventListener('change', () => go(input.files[0]));
      box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('is-drag'); });
      box.addEventListener('dragleave', () => box.classList.remove('is-drag'));
      box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('is-drag'); go(e.dataTransfer.files[0]); });
      $('[data-clear]', box)?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onChange(key, ''); });
    });
  }

  // ---------- login ----------
  function renderLogin() {
    $('#root').innerHTML = `
      <div class="login"><form class="login__box" id="loginForm">
        <div class="login__brand">MILLIYBIZ.NEWS</div>
        <p>Вход в панель управления</p>
        <label class="f"><span class="f__l">Пароль</span><input class="inp" type="password" name="password" autocomplete="current-password" autofocus required></label>
        <button class="btn btn--red" style="width:100%;justify-content:center;height:48px">Войти</button>
        <div class="login__err"></div>
      </form></div>`;
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button', e.target); btn.disabled = true;
      try {
        const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: e.target.password.value }) });
        token = r.token; try { sessionStorage.setItem('mb_token', token); } catch (_) {}
        boot();
      } catch (err) { $('.login__err').textContent = 'Неверный пароль'; btn.disabled = false; }
    });
  }
  function logout() { token = ''; try { sessionStorage.removeItem('mb_token'); } catch (_) {} DB = null; renderLogin(); }

  // ---------- shell ----------
  const NAV = [
    ['robot', 'Робот-редактор'], ['home', 'Главная страница'], ['sport', 'Sport / Business'], ['posts', 'Публикации'], ['videos', 'Milliybiz News'],
    null, ['ads', 'Реклама'], ['leads', 'Заявки'], ['settings', 'Настройки'],
  ];
  function shell(active) {
    const newLeads = (DB.leads || []).filter((l) => l.status === 'new').length;
    $('#root').innerHTML = `
      <header class="top">
        <a class="top__brand" href="#/home">MILLIYBIZ.NEWS</a>
        <div class="top__sp">
          <a class="tbtn" href="#/post/new">＋ <span>Новая публикация</span></a>
          <a class="tbtn" href="/" target="_blank">↗ <span>Открыть сайт</span></a>
          <button class="tbtn" id="theme" type="button">${themeLabel()}</button>
          <button class="tbtn" id="logout">Выйти</button>
        </div>
      </header>
      <div class="layout">
        <nav class="side">
          ${NAV.map((n) => n ? `<a class="side__btn ${active === n[0] || (active === 'post' && n[0] === 'posts') ? 'is-active' : ''}" href="#/${n[0]}">${n[1]}${n[0] === 'leads' && newLeads ? `<span class="side__badge">${newLeads}</span>` : ''}</a>` : '<div class="side__sep"></div>').join('')}
          <div class="side__foot">Изменения сразу появляются на сайте после сохранения.</div>
        </nav>
        <main class="main" id="view"></main>
      </div>`;
    $('#logout').addEventListener('click', logout);
    $('#theme').addEventListener('click', (e) => { toggleTheme(); e.currentTarget.innerHTML = themeLabel(); });
    return $('#view');
  }

  // ---------- день / ночь ----------
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const themeLabel = () => isDark() ? '<span class="theme-ico">☀</span> <span>День</span>' : '<span class="theme-ico">☾</span> <span>Ночь</span>';
  function toggleTheme() {
    const dark = !isDark();
    if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('mb_theme', dark ? 'dark' : 'light'); } catch (e) {}
  }

  // ---------- выпадающие списки в фирменном стиле ----------
  // Каждый <select class="sel"> получает кнопку и меню; сам select остаётся (скрыт) — значения и события change работают как раньше.
  let openXs = null;
  function enhanceSelects() {
    $$('select.sel:not([data-xs])').forEach((sel) => {
      sel.dataset.xs = '1';
      const w = document.createElement('div');
      w.className = 'xs' + (sel.closest('td') ? ' xs--sm' : '');
      sel.parentNode.insertBefore(w, sel);
      w.appendChild(sel);
      sel.tabIndex = -1;
      w.insertAdjacentHTML('beforeend', '<button type="button" class="xs__btn" aria-haspopup="listbox" aria-expanded="false"><span class="xs__v"></span></button>');
      const btn = $('.xs__btn', w);
      const sync = () => { $('.xs__v', btn).textContent = sel.selectedOptions[0]?.textContent || ''; };
      sync();
      sel.addEventListener('change', sync);
      btn.addEventListener('click', (e) => { e.stopPropagation(); openXs?.w === w ? closeXs(true) : showXs(w); });
      btn.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); showXs(w); } });
    });
  }
  function closeXs(focus) {
    if (!openXs) return;
    const { pop, w } = openXs; openXs = null;
    pop.remove(); w.classList.remove('is-open');
    const btn = $('.xs__btn', w); btn.setAttribute('aria-expanded', 'false');
    if (focus) btn.focus();
  }
  function showXs(w) {
    closeXs();
    const sel = $('select', w); const btn = $('.xs__btn', w);
    const pop = document.createElement('div');
    pop.className = 'xs__pop' + (w.classList.contains('xs--sm') ? ' xs--sm' : '');
    pop.innerHTML = `<div class="xs__menu">
      <div class="xs__list" role="listbox">${[...sel.options].map((o, i) => `<button type="button" class="xs__opt" role="option" data-i="${i}" aria-selected="${o.selected}">${esc(o.textContent)}</button>`).join('')}</div></div>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.width = Math.max(r.width, 180) + 'px';
    // под кнопкой; если снизу не помещается — над ней
    const h = pop.offsetHeight;
    pop.style.top = (r.bottom + 6 + h > innerHeight - 10 && r.top - 6 - h > 10 ? r.top - 6 - h : r.bottom + 6) + 'px';
    w.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => pop.classList.add('is-open'));
    openXs = { pop, w };
    const opts = () => $$('.xs__opt:not([aria-selected="true"])', pop);
    opts()[0]?.focus({ preventScroll: true });
    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.xs__head')) return closeXs(true);
      const o = e.target.closest('.xs__opt'); if (!o) return;
      sel.selectedIndex = +o.dataset.i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      closeXs(true);
    });
    pop.addEventListener('keydown', (e) => {
      const list = opts(); const i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeXs(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[Math.min(i + 1, list.length - 1)]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) closeXs(true); else list[i - 1].focus(); }
      else if (e.key === 'Tab') closeXs();
    });
  }
  document.addEventListener('click', () => closeXs());
  window.addEventListener('resize', () => closeXs());
  window.addEventListener('scroll', (e) => { if (openXs && !openXs.pop.contains(e.target)) closeXs(); }, true);
  // Кнопки «Сохранить» из нижней панели переезжают в шапку страницы — она прилипает к верху и всегда видна
  function liftSavebars() {
    $$('.savebar').forEach((bar) => {
      const view = bar.closest('.main') || document;
      const head = $('.head', view); if (!head) return;
      let sp = $('.sp', head);
      if (!sp) { sp = document.createElement('div'); sp.className = 'sp'; head.appendChild(sp); }
      const box = document.createElement('div'); box.className = 'savegrp';
      [...bar.children].forEach((el) => { el.style.marginLeft = ''; box.appendChild(el); });
      const d = $('.dirty', box); if (d) box.prepend(d);
      sp.prepend(box);
      bar.remove();
    });
  }
  new MutationObserver(() => { liftSavebars(); enhanceSelects(); }).observe($('#root'), { childList: true, subtree: true });

  // ---------- раскладка (как на сайте) ----------
  // блоков в Sport/Business: 5 по макету + добавленные (по 2, чтобы ряды на сайте были полными)
  const sportCount = () => Math.max(5, Math.min(25, +DB.layout?.sportCount || 5));
  function resolve() {
    const posts = DB.posts.filter(isLive).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    const byId = Object.fromEntries(posts.map((p) => [p.id, p]));
    const lay = DB.layout || {};
    const used = new Set(['main', 'side', 'grid', 'sport'].flatMap((k) => lay[k] || []).filter((id) => id && byId[id]));
    const fill = (key, n, pref) => {
      const slots = lay[key] || []; const out = [];
      for (let i = 0; i < n; i++) {
        const id = slots[i];
        if (id && byId[id]) { out.push({ p: byId[id], pinned: true }); continue; }
        let p = posts.find((x) => !used.has(x.id) && (!pref || pref(x)));
        if (!p && pref) p = posts.find((x) => !used.has(x.id));
        if (p) used.add(p.id);
        out.push({ p, pinned: false });
      }
      return out;
    };
    const sport = fill('sport', sportCount(), (p) => p.cat === 'sport' || p.cat === 'business');
    return { main: fill('main', 1), grid: fill('grid', 6), side: fill('side', 6), sport, feed: posts.slice(0, 6) };
  }
  const slot = (key, i, s, name) => `
    <button type="button" class="slot ${s.pinned ? 'is-pinned' : ''}" data-key="${key}" data-i="${i}">
      <span class="slot__n">${name}</span>
      <span class="slot__t">${s.p ? esc(ttl(s.p)) : '—'}</span>
      <span class="slot__s">${s.pinned ? 'Закреплено' : 'Авто · последние'}</span>
    </button>`;

  function bindSlots(view, rerender) {
    $$('.slot[data-key]', view).forEach((b) => b.addEventListener('click', () => pickPost(b.dataset.key, +b.dataset.i, rerender)));
  }
  function pickPost(key, i, done) {
    DB.layout = DB.layout || {};
    const cur = (DB.layout[key] || [])[i];
    const list = DB.posts.filter(isLive).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal__box">
      <div class="modal__h"><h3>Выберите публикацию</h3><button class="x" aria-label="Закрыть">✕</button></div>
      <div class="modal__b">
        <input class="inp" placeholder="Поиск…" style="margin-bottom:10px" id="pickQ">
        <div class="pick ${!cur ? 'is-current' : ''}" data-id=""><div class="ph"></div><div><b>Автоматически</b><small>Блок заполняется свежими новостями</small></div><span></span></div>
        <div id="pickList"></div>
      </div></div>`;
    document.body.appendChild(m);
    const draw = (q = '') => {
      $('#pickList', m).innerHTML = list.filter((p) => !q || ttl(p).toLowerCase().includes(q) || (p.title?.uz || '').toLowerCase().includes(q)).map((p) => `
        <div class="pick ${cur === p.id ? 'is-current' : ''}" data-id="${p.id}">
          ${p.image ? `<img src="${esc(p.image)}" alt="">` : '<div class="ph"></div>'}
          <div>${esc(ttl(p))}<small>${esc(CATS[p.cat] || '')} · ${esc(p.time)} ${esc(dmy(p.date))}</small></div>
          <span>${cur === p.id ? '✓' : ''}</span>
        </div>`).join('');
    };
    draw();
    $('#pickQ', m).addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
    const close = () => m.remove();
    m.addEventListener('click', async (e) => {
      if (e.target === m || e.target.closest('.x')) return close();
      const it = e.target.closest('.pick'); if (!it) return;
      const arr = [...(DB.layout[key] || [])];
      while (arr.length <= i) arr.push(null);
      // одна новость — один слот
      ['main', 'side', 'grid', 'sport'].forEach((k) => { DB.layout[k] = (DB.layout[k] || []).map((x) => (x === it.dataset.id ? null : x)); });
      const fresh = [...(DB.layout[key] || [])]; while (fresh.length <= i) fresh.push(null);
      fresh[i] = it.dataset.id || null;
      DB.layout[key] = fresh;
      close();
      await run(() => save('layout'), it.dataset.id ? 'Публикация закреплена' : 'Блок переведён в авто-режим');
      done();
    });
  }

  // ---------- views ----------
  const views = {
    home(view) {
      const r = resolve();
      const ad = DB.ads?.top || {};
      view.innerHTML = `
        <div class="head"><h1>ГЛАВНАЯ СТРАНИЦА</h1><div class="sp"><button class="btn btn--ghost" id="resetLay">Сбросить закрепления</button><a class="btn" href="/" target="_blank">Посмотреть на сайте ↗</a></div></div>
        <div class="legend"><span><i></i>Авто — свежие новости</span><span><i class="p"></i>Закреплено вручную</span><span>Нажмите на блок, чтобы выбрать новость</span></div>
        <div class="board board--home">
          <div class="zone zone--ads z-ads"><a class="slot" href="#/ads" style="text-decoration:none"><span class="slot__n">ADS БЛОК</span><span class="slot__t">${esc((ad.title?.ru || '').replace(/\n/g, ' ')) || 'Баннер'}</span><span class="slot__s">${ad.active === false ? 'Выключен' : 'Реклама · настроить'}</span></a></div>
          <div class="zone z-main">${slot('main', 0, r.main[0], '1 БЛОК')}</div>
          <div class="zone z-feed">${r.feed.map((p, i) => `<a class="slot slot--feed" href="#/post/${encodeURIComponent(p.id)}" title="Лента собирается сама из свежих новостей. Нажмите, чтобы открыть эту новость"><span class="slot__n">${i + 1} БЛОК</span><span class="slot__t">${esc(ttl(p))}</span><span class="slot__s">Лента · авто</span><span class="slot__hint">Открыть новость →</span></a>`).join('')}</div>
          <div class="zone z-side">${r.side.map((s, i) => slot('side', i, s, `${i + 1} БЛОК`)).join('')}</div>
          <div class="zone z-grid">${r.grid.map((s, i) => slot('grid', i, s, `${i + 1} БЛОК`)).join('')}</div>
        </div>`;
      bindSlots(view, () => views.home(view));
      $('#resetLay').addEventListener('click', () => run(async () => { DB.layout = { ...DB.layout, main: [], side: [], grid: [] }; await save('layout'); views.home(view); }, 'Закрепления сброшены'));
    },

    sport(view) {
      const r = resolve();
      view.innerHTML = `
        <div class="head"><h1>SPORT / BUSINESS</h1><div class="sp"><button class="btn btn--ghost" id="resetLay">Сбросить закрепления</button></div></div>
        <div class="legend"><span><i></i>Авто — свежие новости спорта и бизнеса</span><span><i class="p"></i>Закреплено вручную</span></div>
        <div class="board board--sport">
          <div class="zone z-w">${slot('sport', 0, r.sport[0], 'БЛОК 1')}<a class="slot" href="#/ads" style="text-decoration:none"><span class="slot__n">ADS</span><span class="slot__t">Баннер справа</span><span class="slot__s">Реклама</span></a></div>
          <div class="zone z-rest">${r.sport.slice(1).map((s, i) => slot('sport', i + 1, s, `БЛОК ${i + 2}`)).join('')}</div>
          <div class="z-add">
            <button type="button" class="add-slot" id="addBlock">＋ Добавить блоки <small>ещё 2 карточки на сайте</small></button>
            ${sportCount() > 5 ? `<button type="button" class="add-slot add-slot--minus" id="delBlock">− Убрать 2 последних</button>` : ''}
          </div>
        </div>`;
      bindSlots(view, () => views.sport(view));
      const setCount = (n) => run(async () => {
        DB.layout.sportCount = n;
        DB.layout.sport = (DB.layout.sport || []).slice(0, n);
        await save('layout'); views.sport(view);
      }, n > sportCount() ? 'Блоки добавлены — они уже на сайте' : 'Блоки убраны');
      $('#addBlock').addEventListener('click', () => { if (sportCount() >= 25) return toast('Максимум 25 блоков', true); setCount(sportCount() + 2); });
      $('#delBlock')?.addEventListener('click', () => setCount(Math.max(5, sportCount() - 2)));
      $('#resetLay').addEventListener('click', () => run(async () => { DB.layout = { ...DB.layout, sport: [] }; await save('layout'); views.sport(view); }, 'Закрепления сброшены'));
    },

    posts(view) {
      const st = { q: '', cat: '', status: '' };
      const all = DB.posts;
      const live = all.filter(isLive).length;
      const views7 = all.reduce((s, p) => s + (+p.views || 0), 0);
      view.innerHTML = `
        <div class="head"><h1>ПУБЛИКАЦИИ</h1><div class="sp"><a class="btn btn--red" href="#/post/new">＋ Новая публикация</a></div></div>
        <div class="stats">
          <div class="stat"><b>${all.length}</b><span>Всего</span></div>
          <div class="stat"><b>${live}</b><span>Опубликовано</span></div>
          <div class="stat"><b>${all.filter((p) => p.status === 'draft').length + all.filter(isPlanned).length}</b><span>Черновики и отложенные</span></div>
          <div class="stat"><b>${views7}</b><span>Просмотров</span></div>
        </div>
        <div class="toolbar">
          <input class="inp" placeholder="Поиск по заголовку…" id="q">
          <select class="sel" id="cat"><option value="">Все рубрики</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <select class="sel" id="status"><option value="">Все статусы</option><option value="published">Опубликовано</option><option value="planned">Отложено</option><option value="draft">Черновик</option></select>
        </div>
        <div id="tbl"></div>`;
      const draw = () => {
        let list = [...all].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
        if (st.q) list = list.filter((p) => `${p.title?.ru} ${p.title?.uz}`.toLowerCase().includes(st.q));
        if (st.cat) list = list.filter((p) => p.cat === st.cat);
        if (st.status === 'published') list = list.filter(isLive);
        if (st.status === 'planned') list = list.filter(isPlanned);
        if (st.status === 'draft') list = list.filter((p) => p.status === 'draft');
        $('#tbl').innerHTML = list.length ? `<table class="table"><thead><tr><th></th><th>Заголовок</th><th class="hide-m">Рубрика</th><th class="hide-m">Дата</th><th>Статус</th><th class="hide-m">Просм.</th><th></th></tr></thead><tbody>
          ${list.map((p) => `<tr>
            <td>${p.image ? `<img class="t-thumb" src="${esc(p.image)}" alt="" loading="lazy">` : '<div class="t-thumb"></div>'}</td>
            <td><div class="t-title" data-edit="${p.id}">${esc(ttl(p))}<small>${esc(p.title?.uz || '')}</small></div></td>
            <td class="hide-m">${esc(CATS[p.cat] || '—')}</td>
            <td class="hide-m" style="white-space:nowrap">${esc(p.time)} · ${esc(dmy(p.date))}</td>
            <td>${p.status === 'draft' ? '<span class="pill pill--draft">Черновик</span>' : isPlanned(p) ? '<span class="pill pill--plan">Отложено</span>' : '<span class="pill pill--pub">Опубликовано</span>'}</td>
            <td class="hide-m">${+p.views || 0}</td>
            <td class="t-act"><a class="btn btn--ghost" href="/article.html?id=${encodeURIComponent(p.id)}" target="_blank" title="Открыть">↗</a><a class="btn" href="#/post/${encodeURIComponent(p.id)}">Изменить</a></td>
          </tr>`).join('')}</tbody></table>` : '<div class="empty">Ничего не найдено</div>';
        $$('[data-edit]').forEach((el) => el.addEventListener('click', () => { location.hash = '#/post/' + el.dataset.edit; }));
      };
      $('#q').addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); draw(); });
      $('#cat').addEventListener('change', (e) => { st.cat = e.target.value; draw(); });
      $('#status').addEventListener('change', (e) => { st.status = e.target.value; draw(); });
      draw();
    },

    post(view, id) {
      const isNew = id === 'new';
      const src = isNew ? null : DB.posts.find((p) => p.id === id);
      if (!isNew && !src) { view.innerHTML = '<div class="empty">Публикация не найдена. <a href="#/posts">К списку</a></div>'; return; }
      const p = JSON.parse(JSON.stringify(src || { id: uid(), cat: 'news', status: 'published', date: nowDate(), time: nowTime(), views: 0, image: '', imageMobile: '', title: { ru: '', uz: '' }, lead: { ru: '', uz: '' }, body: { ru: '', uz: '' } }));
      ['title', 'lead', 'body'].forEach((k) => { p[k] = p[k] || { ru: '', uz: '' }; });
      const fld = (k, lang, label, cls = 'ta', max) => `
        <label class="f"><span class="f__l">${label} (${lang.toUpperCase()})${max ? `<small class="counter" data-for="${k}-${lang}"></small>` : '<small>Изменить</small>'}</span>
        <textarea class="${cls}" data-k="${k}" data-l="${lang}" ${max ? `data-max="${max}"` : ''} rows="2">${esc(p[k][lang])}</textarea></label>`;
      const render = () => {
        view.innerHTML = `
          <div class="head"><a class="btn btn--ghost" href="#/posts">← Публикации</a><h1>${isNew ? 'НОВАЯ ПУБЛИКАЦИЯ' : 'РЕДАКТИРОВАНИЕ'}</h1>
            <div class="sp">${!isNew ? `<a class="btn" href="/article.html?id=${encodeURIComponent(p.id)}" target="_blank">Предпросмотр ↗</a>` : ''}</div></div>
          <div class="grid-2">
            ${fld('title', 'ru', 'Главный текст', 'ta inp--lg', 140)}${fld('title', 'uz', 'Главный текст', 'ta inp--lg', 140)}
            ${fld('lead', 'ru', 'Подтекст', 'ta', 220)}${fld('lead', 'uz', 'Подтекст', 'ta', 220)}
            ${fld('body', 'ru', 'Описание', 'ta ta--body')}${fld('body', 'uz', 'Описание', 'ta ta--body')}
          </div>
          <p class="hint" style="margin:-6px 0 6px">Абзацы разделяйте пустой строкой. Строка с <b>&gt;</b> в начале — цитата. Фото внутри текста: <b>![подпись](ссылка)</b>.</p>

          <h2 class="sub-h">МАТЕРИАЛ <small>Один размер для всего сайта: 1600×900 (16:9). Лицо и главное держите в центре. Mobile — необязательно</small></h2>
          <div class="uploads">${upBox('image', p.image, 'Desktop version', 'Перетащите фото или нажмите «Прикрепить»')}${upBox('imageMobile', p.imageMobile, 'Mobil version', 'Для телефонов (необязательно)')}</div>

          <h2 class="sub-h">ДАТА И ПАРАМЕТРЫ</h2>
          <div class="grid-2">
            <label class="f"><span class="f__l">Дата</span><input class="inp" type="date" id="date" value="${esc(p.date)}"></label>
            <label class="f"><span class="f__l">Время</span><input class="inp" type="time" id="time" value="${esc(p.time)}"></label>
            <label class="f"><span class="f__l">Рубрика</span><select class="sel" id="cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${p.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label class="f"><span class="f__l">Статус <small>Если дата в будущем — публикация выйдет автоматически</small></span><select class="sel" id="status"><option value="published" ${p.status === 'published' ? 'selected' : ''}>Опубликовать</option><option value="draft" ${p.status === 'draft' ? 'selected' : ''}>Черновик</option></select></label>
          </div>

          <div class="savebar">
            <button class="btn btn--red" id="save">${isNew ? 'Опубликовать' : 'Сохранить'}</button>
            <button class="btn" id="now">Дата: сейчас</button>
            <span class="dirty" id="dirty"></span>
            ${!isNew ? '<button class="btn btn--danger" id="del" style="margin-left:auto">Удалить</button>' : ''}
          </div>`;
        const mark = () => { dirty = true; $('#dirty').textContent = '● Есть несохранённые изменения'; };
        const count = (ta) => { const c = $(`[data-for="${ta.dataset.k}-${ta.dataset.l}"]`); if (c) { const n = ta.value.length, mx = +ta.dataset.max; c.textContent = `${n}/${mx}`; c.classList.toggle('is-over', n > mx); } };
        $$('textarea[data-k]', view).forEach((ta) => {
          const fit = () => { if (!ta.classList.contains('ta--body')) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; } };
          fit(); count(ta);
          ta.addEventListener('input', () => { p[ta.dataset.k][ta.dataset.l] = ta.value; fit(); count(ta); mark(); });
        });
        [['date', 'date'], ['time', 'time'], ['cat', 'cat'], ['status', 'status']].forEach(([el, k]) => $('#' + el).addEventListener('change', (e) => { p[k] = e.target.value; mark(); }));
        bindUploads(view, (k, url) => {
          p[k] = url; mark();
          const keep = $$('textarea[data-k]', view).map((t) => t.scrollTop);
          render(); $('#dirty').textContent = '● Фото загружено — не забудьте сохранить'; dirty = true;
          $$('textarea[data-k]', view).forEach((t, i) => { t.scrollTop = keep[i] || 0; });
        });
        $('#now').addEventListener('click', () => { p.date = nowDate(); p.time = nowTime(); $('#date').value = p.date; $('#time').value = p.time; mark(); });
        $('#save').addEventListener('click', () => run(async () => {
          if (!p.title.ru.trim() && !p.title.uz.trim()) throw new Error('Заполните заголовок хотя бы на одном языке');
          if (!p.date || !p.time) throw new Error('Укажите дату и время');
          await api('/api/admin/post/' + encodeURIComponent(p.id), { method: 'PUT', body: JSON.stringify(p) });
          const i = DB.posts.findIndex((x) => x.id === p.id);
          if (i >= 0) DB.posts[i] = p; else DB.posts.unshift(p);
          dirty = false;
          location.hash = '#/posts';
        }, p.status === 'draft' ? 'Черновик сохранён' : isPlanned(p) ? `Запланировано на ${p.time} ${dmy(p.date)}` : 'Опубликовано на сайте'));
        $('#del')?.addEventListener('click', () => {
          if (!confirm('Удалить публикацию безвозвратно?')) return;
          run(async () => {
            await api('/api/admin/post/' + encodeURIComponent(p.id), { method: 'DELETE' });
            DB.posts = DB.posts.filter((x) => x.id !== p.id);
            ['main', 'side', 'grid', 'sport'].forEach((k) => { DB.layout[k] = (DB.layout[k] || []).map((x) => (x === p.id ? null : x)); });
            dirty = false; location.hash = '#/posts';
          }, 'Удалено');
        });
      };
      render();
    },

    videos(view) {
      DB.videos = DB.videos || [];
      const ytId = (u = '') => (u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1] || '';
      const render = () => {
        view.innerHTML = `
          <div class="head"><h1>ВИДЕО ССЫЛКИ</h1><div class="sp"><button class="icon-btn" id="add" title="Добавить">＋</button></div></div>
          <p class="hint" style="margin:-6px 0 14px">Ссылки YouTube (обычные видео или Shorts). На главной показываются первые 6 — порядок меняется стрелками.</p>
          ${DB.videos.length ? `<div class="rows">${DB.videos.map((v, i) => {
            const id = ytId(v.url);
            return `<div class="row" data-i="${i}">
              ${id ? `<img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" style="width:72px;height:40px;object-fit:cover;border-radius:4px" alt="">` : '<div style="width:72px;height:40px;background:var(--panel);border-radius:4px"></div>'}
              <div class="row__v" style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px">
                <input class="inp" data-f="url" value="${esc(v.url)}" placeholder="https://www.youtube.com/…">
                <input class="inp" data-f="uz" value="${esc(v.title?.uz)}" placeholder="Nomi (UZ)">
                <input class="inp" data-f="ru" value="${esc(v.title?.ru)}" placeholder="Название (RU)">
              </div>
              <div class="row__a">
                <span class="link" style="cursor:default">${i < 6 ? 'На главной' : 'Только в TV'}</span>
                <button class="link" data-mv="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="link" data-mv="1" ${i === DB.videos.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="link" data-del>Удалить</button>
              </div></div>`;
          }).join('')}</div>` : '<div class="empty">Видео пока нет — нажмите ＋</div>'}
          <div class="savebar"><button class="btn btn--red" id="save">Сохранить</button><span class="dirty" id="dirty"></span></div>`;
        const mark = () => { dirty = true; $('#dirty').textContent = '● Есть несохранённые изменения'; };
        $('#add').addEventListener('click', () => { DB.videos.unshift({ id: uid('v'), url: '', title: { uz: '', ru: '' } }); render(); mark(); $('.row .inp')?.focus(); });
        $$('.row', view).forEach((row) => {
          const v = DB.videos[+row.dataset.i];
          $$('.inp', row).forEach((inp) => inp.addEventListener('input', () => { if (inp.dataset.f === 'url') v.url = inp.value.trim(); else { v.title = v.title || {}; v.title[inp.dataset.f] = inp.value; } mark(); }));
          $('[data-del]', row).addEventListener('click', () => { DB.videos.splice(+row.dataset.i, 1); render(); mark(); });
          $$('[data-mv]', row).forEach((b) => b.addEventListener('click', () => { const i = +row.dataset.i, j = i + +b.dataset.mv; [DB.videos[i], DB.videos[j]] = [DB.videos[j], DB.videos[i]]; render(); mark(); }));
        });
        $('#save').addEventListener('click', () => run(async () => {
          const bad = DB.videos.find((v) => v.url && !ytId(v.url));
          if (bad) throw new Error('Неверная ссылка YouTube: ' + bad.url);
          DB.videos = DB.videos.filter((v) => v.url);
          await save('videos'); render();
        }, 'Видео сохранены'));
      };
      render();
    },

    ads(view) {
      DB.ads = DB.ads || {};
      const A = DB.ads;
      const def = { top: { active: true, title: {} }, side: { active: true }, article: { active: true, title: {} }, promo: { text: {} } };
      Object.keys(def).forEach((k) => { A[k] = A[k] || def[k]; });
      const box = (k, title, desc, opts) => {
        const a = A[k];
        return `<div class="box" data-ad="${k}">
          <div style="display:flex;align-items:start;gap:10px"><div><h3>${title}</h3><p>${desc}</p></div>
          ${opts.toggle ? `<label class="switch" style="margin-left:auto"><input type="checkbox" data-f="active" ${a.active !== false ? 'checked' : ''}>Показывать</label>` : ''}</div>
          <div class="uploads" style="grid-template-columns:1fr">${upBox(k, a.image, 'Изображение', opts.size)}</div>
          ${opts.title ? `<div class="grid-2" style="margin-top:14px"><label class="f"><span class="f__l">Текст поверх (UZ)</span><textarea class="ta" data-f="title.uz" rows="2">${esc(a.title?.uz)}</textarea></label><label class="f"><span class="f__l">Текст поверх (RU)</span><textarea class="ta" data-f="title.ru" rows="2">${esc(a.title?.ru)}</textarea></label></div>` : ''}
          ${opts.text ? `<div style="margin-top:14px"><label class="f"><span class="f__l">Текст (UZ)</span><textarea class="ta" data-f="text.uz" rows="4">${esc(a.text?.uz)}</textarea></label><label class="f"><span class="f__l">Текст (RU)</span><textarea class="ta" data-f="text.ru" rows="4">${esc(a.text?.ru)}</textarea></label></div>` : ''}
          ${opts.link ? `<label class="f" style="margin-top:${opts.title ? 0 : 14}px"><span class="f__l">Ссылка при клике</span><input class="inp" data-f="link" value="${esc(a.link)}" placeholder="https://… или /reklama.html"></label>` : ''}
        </div>`;
      };
      const render = () => {
        view.innerHTML = `
          <div class="head"><h1>РЕКЛАМА</h1></div>
          <div class="cards">
            ${box('top', 'ADS блок — главная', 'Широкий баннер вверху главной страницы.', { toggle: true, title: true, link: true, size: '1396×372 (или 2800×744)' })}
            ${box('side', 'Баннер Sport / Business', 'Справа от главной новости раздела.', { toggle: true, link: true, size: '405×267 (или 810×534)' })}
            ${box('article', 'Баннер в статье', 'Справа от фото на странице новости.', { toggle: true, title: true, link: true, size: '16:9, от 1200px' })}
            ${box('promo', 'Страница «Реклама»', 'Фон и текст страницы с формой заявки.', { text: true, size: 'Широкое фото, от 1920px' })}
          </div>
          <div class="savebar"><button class="btn btn--red" id="save">Сохранить</button><a class="btn" href="/reklama.html" target="_blank">Страница рекламы ↗</a><span class="dirty" id="dirty"></span></div>`;
        const mark = () => { dirty = true; $('#dirty').textContent = '● Есть несохранённые изменения'; };
        $$('[data-ad]', view).forEach((b) => {
          const a = A[b.dataset.ad];
          $$('[data-f]', b).forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
            const [f, l] = el.dataset.f.split('.');
            if (el.type === 'checkbox') a[f] = el.checked;
            else if (l) { a[f] = a[f] || {}; a[f][l] = el.value; } else a[f] = el.value.trim();
            mark();
          }));
        });
        bindUploads(view, (k, url) => { A[k].image = url; render(); mark(); }, 2800);
        $('#save').addEventListener('click', () => run(async () => { await save('ads'); $('#dirty').textContent = ''; }, 'Реклама сохранена'));
      };
      render();
    },

    leads(view) {
      DB.leads = DB.leads || [];
      let filter = '';
      const render = () => {
        const list = DB.leads.filter((l) => !filter || l.status === filter);
        view.innerHTML = `
          <div class="head"><h1>ЗАЯВКИ</h1><div class="sp"><button class="btn" id="csv" ${DB.leads.length ? '' : 'disabled'}>Скачать CSV</button><button class="btn" id="reload">Обновить</button></div></div>
          <p class="hint" style="margin:-6px 0 14px">Заявки с формы на странице «Реклама».</p>
          <div class="stats">${['new', 'work', 'done'].map((s) => `<div class="stat"><b>${DB.leads.filter((l) => l.status === s).length}</b><span>${LEAD_ST[s]}</span></div>`).join('')}<div class="stat"><b>${DB.leads.length}</b><span>Всего</span></div></div>
          <div class="toolbar"><select class="sel" id="f"><option value="">Все заявки</option>${Object.entries(LEAD_ST).map(([k, v]) => `<option value="${k}" ${filter === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          ${list.length ? `<table class="table"><thead><tr><th>Имя</th><th>Телефон</th><th class="hide-m">Регион</th><th class="hide-m">Дата</th><th>Статус</th><th class="hide-m">Заметка</th><th></th></tr></thead><tbody>
            ${list.map((l) => `<tr data-id="${esc(l.id)}">
              <td><b style="font-weight:500">${esc(l.name)}</b></td>
              <td style="white-space:nowrap"><a href="tel:${esc((l.phone || '').replace(/\s/g, ''))}">${esc(l.phone)}</a></td>
              <td class="hide-m">${esc(l.region)}</td>
              <td class="hide-m" style="white-space:nowrap">${esc((l.created || '').replace('T', ' ').slice(0, 16))}</td>
              <td><select class="sel" data-st style="padding:6px 34px 6px 10px;font-size:13px">${Object.entries(LEAD_ST).map(([k, v]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
              <td class="hide-m"><input class="inp" data-note value="${esc(l.note)}" placeholder="—" style="padding:6px 10px;font-size:13px"></td>
              <td class="t-act"><button class="btn btn--ghost" data-del title="Удалить">✕</button></td>
            </tr>`).join('')}</tbody></table>` : '<div class="empty">Заявок пока нет</div>'}`;
        const persist = () => run(() => save('leads'));
        $$('tr[data-id]', view).forEach((tr) => {
          const l = DB.leads.find((x) => x.id === tr.dataset.id);
          $('[data-st]', tr).addEventListener('change', async (e) => { l.status = e.target.value; await persist(); shellBadge(); });
          $('[data-note]', tr).addEventListener('change', (e) => { l.note = e.target.value; persist(); });
          $('[data-del]', tr).addEventListener('click', async () => { if (!confirm('Удалить заявку?')) return; DB.leads = DB.leads.filter((x) => x !== l); await persist(); render(); shellBadge(); });
        });
        $('#f').addEventListener('change', (e) => { filter = e.target.value; render(); });
        $('#reload').addEventListener('click', () => run(async () => { DB = await api('/api/admin/db'); render(); shellBadge(); }, 'Обновлено'));
        $('#csv').addEventListener('click', () => {
          const rows = [['Имя', 'Телефон', 'Регион', 'Дата', 'Статус', 'Заметка'], ...DB.leads.map((l) => [l.name, l.phone, l.region, l.created, LEAD_ST[l.status] || l.status, l.note])];
          const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
          a.download = `milliybiz-zayavki-${nowDate()}.csv`; a.click();
        });
      };
      render();
    },

    settings(view) {
      const s = DB.settings = DB.settings || {};
      s.socials = s.socials || {}; s.slogan = s.slogan || {}; s.legal = s.legal || {};
      const inp = (path, label, ph = '') => { const [a, b] = path.split('.'); const v = b ? s[a]?.[b] : s[a]; return `<label class="f"><span class="f__l">${label}</span><input class="inp" data-p="${path}" value="${esc(v)}" placeholder="${esc(ph)}"></label>`; };
      const ta = (path, label, rows = 3) => { const [a, b] = path.split('.'); return `<label class="f"><span class="f__l">${label}</span><textarea class="ta" data-p="${path}" rows="${rows}">${esc(s[a]?.[b])}</textarea></label>`; };
      view.innerHTML = `
        <div class="head"><h1>НАСТРОЙКИ</h1></div>
        <h2 class="sub-h" style="margin-top:0">КОНТАКТЫ</h2>
        <div class="grid-2">${inp('phone', 'Телефон', '+998 ...')}${inp('email', 'Почта')}${inp('kartaUrl', 'Ссылка «KARTA MILLIYBIZ» в меню', '/news.html')}</div>
        <h2 class="sub-h">СОЦСЕТИ</h2>
        <div class="grid-2">${inp('socials.telegram', 'Telegram', 'https://t.me/...')}${inp('socials.instagram', 'Instagram', 'https://instagram.com/...')}${inp('socials.facebook', 'Facebook')}${inp('socials.youtube', 'YouTube')}</div>
        <h2 class="sub-h">ПОДВАЛ САЙТА</h2>
        <div class="grid-2">${ta('slogan.uz', 'Слоган (UZ)', 2)}${ta('slogan.ru', 'Слоган (RU)', 2)}${ta('legal.uz', 'Юридический текст (UZ)', 7)}${ta('legal.ru', 'Юридический текст (RU)', 7)}</div>
        <div class="savebar"><button class="btn btn--red" id="save">Сохранить</button><span class="dirty" id="dirty"></span></div>

        <h2 class="sub-h">ПАРОЛЬ CRM</h2>
        <form class="grid-2" id="pw" style="max-width:760px">
          <label class="f"><span class="f__l">Текущий пароль</span><input class="inp" type="password" name="current" autocomplete="current-password" required></label>
          <label class="f"><span class="f__l">Новый пароль <small>минимум 6 символов</small></span><input class="inp" type="password" name="next" autocomplete="new-password" minlength="6" required></label>
          <div><button class="btn">Сменить пароль</button></div>
        </form>`;
      $$('[data-p]', view).forEach((el) => el.addEventListener('input', () => {
        const [a, b] = el.dataset.p.split('.');
        if (b) { s[a] = s[a] || {}; s[a][b] = el.value; } else s[a] = el.value;
        dirty = true; $('#dirty').textContent = '● Есть несохранённые изменения';
      }));
      $('#save').addEventListener('click', () => run(async () => { await save('settings'); $('#dirty').textContent = ''; }, 'Настройки сохранены'));
      $('#pw').addEventListener('submit', (e) => {
        e.preventDefault();
        run(async () => { await api('/api/admin/password', { method: 'PUT', body: JSON.stringify({ current: e.target.current.value, next: e.target.next.value }) }); e.target.reset(); }, 'Пароль изменён');
      });
    },
  };

  // ---------- робот-редактор ----------
  const RB_ST = { pending: ['Ждёт решения', 'pill--plan'], published: ['Опубликовано', 'pill--pub'], draft: ['В черновиках', 'pill--draft'], skipped: ['Пропущено', 'pill--draft'], error: ['Ошибка', 'pill--draft'] };
  // ---------- источники робота: сайты (RSS) и Telegram-каналы ----------
  let SRC = null;
  const srcBox = () => `<div class="box srcb">
      <h3>3. Источники</h3>
      <p>Откуда робот берёт новости. Telegram-каналы показывают, что люди реально обсуждают: просмотры и реакции под постами. На сайте источник указывается только текстом, без ссылки на чужой сайт.</p>
      <div class="src-add">
        <input class="inp" id="srcNew" data-own placeholder="kun.uz, t.me/kanal или ссылка на RSS-ленту" autocomplete="off">
        <button class="btn btn--red" id="srcAdd" type="button">Проверить и добавить</button>
      </div>
      <div class="src-msg" id="srcMsg"></div>
      <div class="src-list" id="srcList"></div>
    </div>`;
  function bindSources(view, c) {
    SRC = JSON.parse(JSON.stringify(c.sources || []));
    const mark = () => { dirty = true; $('#dirty').textContent = '● Не сохранено'; };
    const draw = () => {
      const tg = SRC.filter((s) => s.type === 'tg').length;
      $('#srcList').innerHTML = `<div class="src-sum">${SRC.length} источников · сайтов ${SRC.length - tg} · Telegram-каналов ${tg}</div>` + SRC.map((s, i) => `
        <div class="src-row ${s.enabled === false ? 'is-off' : ''}" data-i="${i}">
          <span class="src-type src-type--${s.type}">${s.type === 'tg' ? 'Telegram' : 'Сайт'}</span>
          <div class="src-main"><input class="inp src-name" data-own data-f="name" value="${esc(s.name)}" maxlength="40"><small>${esc(s.type === 'tg' ? 't.me/' + s.url : s.url)}</small></div>
          <select class="sel" data-f="group"><option value="uz" ${s.group !== 'sport' ? 'selected' : ''}>Узбекистан</option><option value="sport" ${s.group === 'sport' ? 'selected' : ''}>Спорт</option></select>
          <label class="src-sw" title="Брать фото из этого источника. Выключите, если на фото чужой логотип или водяной знак."><input type="checkbox" data-own data-f="photos" ${s.photos ? 'checked' : ''}><span></span>Фото</label>
          <label class="src-sw" title="Робот читает этот источник"><input type="checkbox" data-own data-f="enabled" ${s.enabled !== false ? 'checked' : ''}><span></span>Вкл</label>
          <button class="btn btn--ghost src-del" type="button" title="Удалить источник" aria-label="Удалить">✕</button>
        </div>`).join('');
    };
    draw();
    $('#srcList').addEventListener('change', (e) => {
      const row = e.target.closest('.src-row'); if (!row) return;
      const s = SRC[+row.dataset.i]; const f = e.target.dataset.f;
      if (f === 'photos' || f === 'enabled') s[f] = e.target.checked; else if (f) s[f] = e.target.value;
      row.classList.toggle('is-off', s.enabled === false);
      mark();
    });
    $('#srcList').addEventListener('input', (e) => { if (e.target.dataset.f === 'name') { SRC[+e.target.closest('.src-row').dataset.i].name = e.target.value; mark(); } });
    $('#srcList').addEventListener('click', (e) => {
      const b = e.target.closest('.src-del'); if (!b) return;
      const i = +b.closest('.src-row').dataset.i;
      if (!confirm(`Удалить источник «${SRC[i].name}»?`)) return;
      SRC.splice(i, 1); draw(); mark();
    });
    const add = () => {
      const url = $('#srcNew').value.trim(); if (!url) return $('#srcNew').focus();
      const btn = $('#srcAdd'); btn.disabled = true; btn.textContent = 'Проверяю…';
      $('#srcMsg').className = 'src-msg'; $('#srcMsg').textContent = '';
      api('/api/admin/robot/source-test', { method: 'POST', body: JSON.stringify({ url }) }).then((r) => {
        if (SRC.some((s) => s.type === r.type && s.url === r.url)) throw new Error(`«${r.name}» уже есть в списке`);
        const lang = /[а-яё]/i.test(r.sample.join(' ')) && !/[ўқғҳ]/i.test(r.sample.join(' ')) ? 'ru' : 'uz';
        SRC.unshift({ id: 's' + Date.now().toString(36), type: r.type, name: r.name, url: r.url, group: /sport|спорт|futbol|football/i.test(r.name + r.url) ? 'sport' : 'uz', lang, enabled: true, photos: false });
        draw(); mark(); $('#srcNew').value = '';
        $('#srcMsg').className = 'src-msg is-ok';
        $('#srcMsg').innerHTML = `Добавлен <b>${esc(r.name)}</b> (${r.type === 'tg' ? 'Telegram-канал' : 'RSS-лента'}, ${r.count} записей). Например: «${esc(r.sample[0] || '')}». Не забудьте сохранить.`;
      }).catch((err) => { $('#srcMsg').className = 'src-msg is-err'; $('#srcMsg').textContent = err.message; })
        .finally(() => { btn.disabled = false; btn.textContent = 'Проверить и добавить'; });
    };
    $('#srcAdd').addEventListener('click', add);
    $('#srcNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  }

  // ---------- настройки подключённого Telegram-бота ----------
  const TG_OPTS = [
    ['showPhoto', 'Фото новости', 'Сообщение приходит с картинкой'],
    ['showLead', 'Подзаголовок', 'Курсивом под заголовком'],
    ['showUz', 'Заголовок на узбекском', 'Строка с 🇺🇿, если он отличается'],
    ['showWhy', 'Почему робот предлагает', '«4 издания · 🔥 за час · важная тема»'],
    ['showLinks', 'Ссылки на источники', 'Kun.uz · Gazeta.uz · Daryo.uz'],
  ];
  function tgPanel(c, S) {
    const t = c.tg || {};
    return `<div class="box tgp">
      <div class="tgp__head">
        <div class="tgp__ava">${esc((c.botUsername || 'B').slice(0, 1).toUpperCase())}</div>
        <div class="tgp__who"><b id="tgName0">@${esc(c.botUsername || '')}</b><small>Подключён к вашему чату · ${esc(c.chatId)}</small></div>
        <span class="pill pill--pub">подключён</span>
      </div>
      <div class="tgp__acts">
        <a class="btn" href="https://t.me/${encodeURIComponent(c.botUsername || '')}" target="_blank" rel="noopener">Открыть бота ↗</a>
        <button class="btn" id="rbTest" type="button">Проверить связь</button>
        <button class="btn btn--ghost" id="tgToken" type="button">Сменить токен</button>
        <button class="btn btn--ghost" id="tgUnlink" type="button">Отвязать</button>
      </div>
      <div class="tgp__token" id="tgTokenBox" hidden><label class="f"><span class="f__l">Новый токен от @BotFather</span><input class="inp" id="rbToken" autocomplete="off" placeholder="123456:ABC…"></label><small class="hint">После сохранения бота нужно будет привязать заново.</small></div>

      <h4 class="tgp__h">Оформление бота <small>то, что люди видят в Telegram</small></h4>
      <div class="tgp__form" id="tgProfile">
        <label class="rb-f"><span class="rb-f__l">Имя бота</span><input class="inp" id="tgName" data-own maxlength="64" placeholder="Загрузка…"><small>Показывается в списке чатов</small></label>
        <label class="rb-f"><span class="rb-f__l">Коротко о боте <i class="cnt" data-for="tgShort"></i></span><textarea class="ta" id="tgShort" rows="2" maxlength="120"></textarea><small>В профиле бота и при пересылке ссылки</small></label>
        <label class="rb-f"><span class="rb-f__l">Приветствие <i class="cnt" data-for="tgDesc"></i></span><textarea class="ta" id="tgDesc" rows="4" maxlength="512"></textarea><small>Что человек видит в пустом чате до нажатия «Start»</small></label>
        ${tglOwn('tgCmds', true, 'Меню команд', '/scan, /status, /pause, /resume — кнопка «Меню» в чате')}
        <div><button class="btn btn--red" id="tgApply" type="button">Применить в Telegram</button> <small class="hint" style="margin-left:8px">Сохраняется сразу в Telegram, отдельно от кнопки сверху</small></div>
      </div>

      <h4 class="tgp__h">Сообщения с новостями <small>сохраняются кнопкой «Сохранить настройки»</small></h4>
      <div class="tgp__grid">
        <div class="tgl-list" id="tgOpts" style="margin-top:0">${TG_OPTS.map(([k, ti, sub]) => tgl('tg_' + k, '', t[k] !== false, ti, sub)).join('')}
          <div class="tgl tgl--time"><span class="tgl__t"><b>Тихие часы</b><small>В это время новости приходят без звука</small></span>
            <span class="tgp__time"><input class="inp" type="time" id="tgQf" value="${esc(t.quietFrom || '')}"> — <input class="inp" type="time" id="tgQt" value="${esc(t.quietTo || '')}"></span></div>
        </div>
        <div class="tgp__prev"><small>Так выглядит сообщение</small><div class="tgm" id="tgPrev"></div></div>
      </div>
    </div>`;
  }
  const tglOwn = (id, on, title, sub) => tgl(id, '', on, title, sub).replace('<input type="checkbox"', '<input type="checkbox" data-own');
  function tgOpts() {
    const o = {}; TG_OPTS.forEach(([k]) => { o[k] = $('#tg_' + k).checked; });
    o.quietFrom = $('#tgQf').value; o.quietTo = $('#tgQt').value;
    return o;
  }
  function bindTgPanel(view, S, again) {
    // предпросмотр сообщения — на реальной новости робота
    const sample = S.candidates.find((x) => x.type === 'news' && x.draft && (x.why || []).length) || S.candidates.find((x) => x.type === 'news' && x.draft) || { draft: { title: { ru: 'В Ташкенте прокомментировали начало отопительного сезона', uz: 'Toshkentda isitish mavsumi qachon boshlanadi' }, lead: { ru: 'Отопительный сезон начнётся, когда среднесуточная температура опустится ниже 8 градусов.' } }, why: ['3 издания', '🔥 2 за последний час'], sources: [{ name: 'Daryo.uz' }, { name: 'Gazeta.uz' }, { name: 'Kun.uz' }], image: '' };
    const draw = () => {
      const o = tgOpts(); const d = sample.draft;
      const ru = d.title.ru || d.title.uz; const uz = d.title.uz;
      $('#tgPrev').innerHTML = `${o.showPhoto && (sample.image || sample.banner) ? `<img src="${esc(sample.image || sample.banner)}" alt="" referrerpolicy="no-referrer">` : ''}
        <div class="tgm__b"><p>${(sample.why || []).some((w) => w.startsWith('🔥')) ? '🔥' : '📰'} <b>Узбекистан</b>${o.showWhy ? ' · ' + esc(((sample.why || []).length ? sample.why : [`источников: ${(sample.sources || []).length}`]).join(' · ')) : ''}</p>
        <p><b>${esc(ru)}</b>${o.showLead && (d.lead?.ru || d.lead?.uz) ? `<br><i>${esc(d.lead.ru || d.lead.uz)}</i>` : ''}</p>
        ${o.showUz && uz && uz !== ru ? `<p>🇺🇿 ${esc(uz)}</p>` : ''}
        ${o.showLinks ? `<p class="tgm__l">${(sample.sources || []).slice(0, 4).map((s) => esc(s.name)).join(' · ')}</p>` : ''}</div>
        <div class="tgm__k"><span>✅ Опубликовать с фото</span><span>🟥 Без фото</span><span>⭐ Главной</span><span>📝 Черновик</span><span>❌ Нет</span></div>`;
    };
    draw();
    $$('#tgOpts input', view).forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', draw));
    // счётчики символов
    const count = () => $$('.cnt', view).forEach((c) => { const ta = $('#' + c.dataset.for); c.textContent = `${ta.value.length}/${ta.maxLength}`; });
    $$('#tgShort, #tgDesc', view).forEach((ta) => ta.addEventListener('input', count));
    // текущее оформление из Telegram
    api('/api/admin/robot/profile').then((p) => {
      $('#tgName').value = p.name; $('#tgShort').value = p.short; $('#tgDesc').value = p.description;
      $('#tgCmds').checked = p.commands; $('#tgName0').textContent = p.name ? `${p.name} · @${p.username}` : '@' + p.username;
      if (!p.short) $('#tgShort').value = 'Новости Узбекистана и мирового спорта — MILLIYBIZ.NEWS';
      if (!p.description) $('#tgDesc').value = 'Бот редакции MILLIYBIZ. Присылает топ-новости Узбекистана и мирового спорта на одобрение: одна кнопка — и новость на сайте.';
      count();
    }).catch((e) => { $('#tgName').placeholder = 'Не удалось загрузить'; toast(e.message === 'not found' ? 'Сервер работает на старой версии — закройте окно start.bat и запустите его снова' : e.message, true); });
    $('#tgApply').addEventListener('click', (e) => { e.target.disabled = true; run(async () => {
      try {
        const p = await api('/api/admin/robot/profile', { method: 'PUT', body: JSON.stringify({ name: $('#tgName').value, short: $('#tgShort').value, description: $('#tgDesc').value, commands: $('#tgCmds').checked }) });
        $('#tgName0').textContent = `${p.name} · @${p.username}`;
      } finally { e.target.disabled = false; }
    }, 'Оформление бота обновлено в Telegram'); });
    $('#tgToken').addEventListener('click', () => { const b = $('#tgTokenBox'); b.hidden = !b.hidden; if (!b.hidden) $('#rbToken').focus(); });
    $('#tgUnlink').addEventListener('click', () => {
      if (!confirm('Отвязать бота от вашего чата? Новости перестанут приходить, пока не привяжете снова.')) return;
      run(async () => { await api('/api/admin/robot', { method: 'PUT', body: JSON.stringify({ unlink: true }) }); again(); }, 'Бот отвязан');
    });
  }

  // переключатель-строка: заметно видно «ВКЛ / ВЫКЛ»
  const tgl = (id, group, on, title, sub) => `
    <label class="tgl">
      <input type="checkbox" ${id ? `id="${id}"` : ''} ${group ? `data-g="${group}"` : ''} ${on ? 'checked' : ''}>
      <span class="tgl__t"><b>${esc(title)}</b><small>${esc(sub)}</small></span>
      <span class="tgl__sw" aria-hidden="true"></span>
    </label>`;
  views.robot = async function robotView(view) {
    view.innerHTML = '<div class="empty">Загрузка…</div>';
    let S;
    try { S = await api('/api/admin/robot'); } catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const c = S.config;
    const pend = S.candidates.filter((x) => x.status === 'pending');
    const stamp = (t) => t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const tgLink = c.botUsername ? `https://t.me/${encodeURIComponent(c.botUsername)}?start=${encodeURIComponent(c.pairCode)}` : '';
    const item = (x) => {
      const d = x.draft || { title: {}, lead: {} };
      const [st, cls] = RB_ST[x.status] || [x.status, ''];
      return `<div class="rb-item" data-id="${esc(x.id)}">
        ${x.image || x.banner ? `<img src="${esc(x.image || x.banner)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="rb-ph"></div>'}
        <div class="rb-b">
          <div class="rb-meta"><span class="pill ${cls}">${st}</span><span>${x.type === 'match' ? '⚽ Матч' : x.group === 'sport' ? 'Спорт' : 'Узбекистан'}</span><span>${stamp(x.created)}</span>${x.video ? '<span>🎬 видео</span>' : ''}</div>
          <b>${esc(d.title?.ru || d.title?.uz || '—')}</b>
          ${d.title?.uz && d.title.uz !== d.title.ru ? `<small>🇺🇿 ${esc(d.title.uz)}</small>` : ''}
          <p>${esc(d.lead?.ru || d.lead?.uz || '')}</p>
          ${(x.why || []).length ? `<div class="rb-why">Почему: ${esc(x.why.join(' · '))}</div>` : ''}
          <div class="rb-src">${(x.sources || []).slice(0, 5).map((s) => `<a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}${x.error ? ` · <span style="color:#a00">${esc(x.error)}</span>` : ''}</div>
          <div class="rb-act">${x.status === 'pending' ? `
            <button class="btn btn--red" data-a="pub">✅ Опубликовать</button>
            ${x.image ? '<button class="btn" data-a="plain">🟥 Без фото</button>' : ''}
            <button class="btn" data-a="top">⭐ Главной</button>
            <button class="btn" data-a="draft">📝 Черновик</button>
            <button class="btn btn--ghost" data-a="skip">Пропустить</button>` : x.postId ? `<a class="btn" href="#/post/${encodeURIComponent(x.postId)}">Изменить публикацию</a>` : ''}</div>
        </div></div>`;
    };
    view.innerHTML = `
      <div class="head"><h1>РОБОТ-РЕДАКТОР</h1><div class="sp"><button class="btn" id="rbReload">Обновить</button><button class="btn" id="rbRun">Проверить новости сейчас</button><button class="btn btn--red" id="rbSave">Сохранить настройки</button><span class="dirty" id="dirty"></span></div></div>
      <p class="hint" style="margin:-6px 0 14px">Робот каждые ${c.intervalMin} мин читает ${S.feeds.length} источников (сайты и Telegram-каналы) и ${S.leagues.length} футбольных лиг, выбирает то, о чём пишут сразу несколько изданий и что больше всего обсуждают, готовит заметку со ссылкой на источник и баннер — и спрашивает вас в Telegram. Без вашего «✅» на сайт ничего не попадает.</p>
      <div class="stats">
        <div class="stat"><b>${c.enabled ? 'Работает' : 'Пауза'}</b><span>Состояние</span></div>
        <div class="stat"><b>${stamp(S.lastRun)}</b><span>Последняя проверка</span></div>
        <div class="stat"><b>${pend.length}</b><span>Ждут решения</span></div>
        <div class="stat"><b>${S.candidates.filter((x) => x.status === 'published').length}</b><span>Опубликовано роботом</span></div>
      </div>
      ${S.lastError ? `<div class="box" style="border-color:#a00;margin-bottom:14px">Ошибка: ${esc(S.lastError)}</div>` : ''}

      <div class="cards">
        ${c.hasToken && c.chatId ? tgPanel(c, S) : `<div class="box">
          <h3>1. Telegram-бот ${c.hasToken ? '<span class="pill pill--plan">ждёт привязки</span>' : '<span class="pill pill--draft">не настроен</span>'}</h3>
          <p>Создайте бота у <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> (команда /newbot) и вставьте токен.</p>
          <label class="f" style="margin-top:12px"><span class="f__l">Токен бота</span><input class="inp" id="rbToken" placeholder="${c.hasToken ? esc(c.botToken) : '123456:ABC…'}" autocomplete="off"></label>
          ${c.hasToken ? `<p style="margin-top:10px">${c.chatId ? `Привязан к чату <b>${esc(c.chatId)}</b>${c.botUsername ? ` · бот <b>@${esc(c.botUsername)}</b>` : ''}.` : 'Теперь откройте бота и нажмите «Start»:'}</p>
            ${tgLink ? `<p style="margin-top:6px"><a class="btn" href="${esc(tgLink)}" target="_blank" rel="noopener">Открыть @${esc(c.botUsername)} и привязать</a></p>` : ''}
            <p class="hint">Или отправьте боту: <b>/start ${esc(c.pairCode)}</b></p>
            <p style="margin-top:8px"><button class="btn btn--ghost" id="rbTest">Отправить проверочное сообщение</button></p>` : ''}
        </div>`}
        <div class="box">
          <h3>2. Что искать</h3>
          <div class="tgl-list">
            ${tgl('rbOn', '', c.enabled, 'Робот', 'Сам проверяет новости по расписанию')}
            ${tgl('', 'uz', c.groups.uz !== false, 'Топ-новости Узбекистана', 'Kun.uz, Gazeta.uz, Daryo.uz, UzA, Podrobno.uz, Spot.uz')}
            ${tgl('', 'sport', c.groups.sport !== false, 'Мировой спорт', 'BBC Sport, ESPN, Чемпионат, Sports.ru')}
            ${tgl('', 'matches', c.groups.matches !== false, 'Результаты матчей', 'Счёт, баннер-табло и видео-обзор')}
          </div>
          <div class="rb-fields">
            <label class="rb-f"><span class="rb-f__l">Проверять каждые</span><span class="rb-f__in"><input class="inp" type="number" min="3" max="120" id="rbInt" value="${esc(c.intervalMin)}"><i>мин</i></span><small>Как часто робот ищет новости</small></label>
            <label class="rb-f"><span class="rb-f__l">Минимум изданий</span><span class="rb-f__in"><input class="inp" type="number" min="1" max="6" id="rbMin" value="${esc(c.minSources)}"></span><small>1 — быстрее, но больше шума</small></label>
            <label class="rb-f"><span class="rb-f__l">Не больше за раз</span><span class="rb-f__in"><input class="inp" type="number" min="1" max="20" id="rbMax" value="${esc(c.maxPerRun)}"><i>новостей</i></span><small>За одну проверку</small></label>
            <label class="rb-f"><span class="rb-f__l">Адрес сайта</span><span class="rb-f__in"><input class="inp" id="rbSite" value="${esc(c.siteUrl)}"></span><small>Для ссылок в боте</small></label>
          </div>
        </div>
        ${srcBox()}
      </div>

      <h2 class="sub-h">НАЙДЕННЫЕ НОВОСТИ</h2>
      ${S.candidates.length ? `<div class="rb-list">${S.candidates.map(item).join('')}</div>` : '<div class="empty">Пока пусто — нажмите «Проверить новости сейчас»</div>'}

      <h2 class="sub-h">ЖУРНАЛ</h2>
      <pre class="rb-log">${esc(S.log.join('\n')) || '—'}</pre>`;

    const again = () => views.robot(view);
    if ($('#tgOpts')) bindTgPanel(view, S, again);
    bindSources(view, c);
    $$('.cards input:not([data-own])', view).forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => { dirty = true; $('#dirty').textContent = '● Не сохранено'; }));
    $('#rbReload').addEventListener('click', again);
    $('#rbRun').addEventListener('click', (e) => { e.target.disabled = true; e.target.textContent = 'Ищу… (до 1–2 мин)'; run(async () => { const r = await api('/api/admin/robot/run', { method: 'POST' }); toast(r.added ? `Найдено новых: ${r.added}` : 'Новых топ-новостей пока нет'); again(); }); });
    $('#rbTest')?.addEventListener('click', () => run(async () => { const r = await api('/api/admin/robot/test', { method: 'POST' }); toast(r.paired ? 'Сообщение отправлено в Telegram' : `Бот @${r.bot} работает, но ещё не привязан — нажмите Start в боте`, !r.paired); }));
    $('#rbSave').addEventListener('click', () => run(async () => {
      const groups = {}; $$('[data-g]', view).forEach((el) => { groups[el.dataset.g] = el.checked; });
      const body = { enabled: $('#rbOn').checked, groups, intervalMin: +$('#rbInt').value, minSources: +$('#rbMin').value, maxPerRun: +$('#rbMax').value, siteUrl: $('#rbSite').value.trim() };
      if ($('#rbToken')?.value.trim()) body.botToken = $('#rbToken').value.trim();
      if ($('#tgOpts')) body.tg = tgOpts();
      if (SRC) body.sources = SRC;
      const r = await api('/api/admin/robot', { method: 'PUT', body: JSON.stringify(body) });
      dirty = false;
      toast(r.bot ? `Бот @${r.bot} подключён — теперь привяжите чат` : 'Настройки робота сохранены');
      again();
    }));
    $$('.rb-item [data-a]', view).forEach((b) => b.addEventListener('click', () => {
      const id = b.closest('.rb-item').dataset.id;
      $$('button', b.parentElement).forEach((x) => { x.disabled = true; });
      run(async () => {
        const r = await api('/api/admin/robot/act', { method: 'POST', body: JSON.stringify({ id, action: b.dataset.a }) });
        toast(r.message);
        DB = await api('/api/admin/db');
        again();
      });
    }));
  };

  function shellBadge() {
    const n = (DB.leads || []).filter((l) => l.status === 'new').length;
    const btn = $('.side__btn[href="#/leads"]'); if (!btn) return;
    $('.side__badge', btn)?.remove();
    if (n) btn.insertAdjacentHTML('beforeend', `<span class="side__badge">${n}</span>`);
  }

  // ---------- router ----------
  let lastHash = location.hash;
  async function route(fresh = true) {
    if (!DB) return;
    // робот публикует в фоне — перед каждым экраном берём свежие данные
    if (fresh) { try { DB = await api('/api/admin/db'); ['posts', 'videos', 'leads'].forEach((k) => { if (!Array.isArray(DB[k])) DB[k] = []; }); DB.layout = DB.layout || {}; DB.ads = DB.ads || {}; DB.settings = DB.settings || {}; } catch (e) {} }
    const [, name = 'home', arg] = (location.hash || '#/home').match(/^#\/(\w+)(?:\/(.+))?/) || [];
    const view = shell(views[name] ? name : 'home');
    (views[name] || views.home)(view, arg && decodeURIComponent(arg));
    window.scrollTo(0, 0);
    lastHash = location.hash;
  }
  window.addEventListener('hashchange', () => {
    if (dirty && !confirm('Есть несохранённые изменения. Уйти без сохранения?')) { history.replaceState(null, '', lastHash); return; }
    dirty = false; route();
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  async function boot() {
    if (!token) return renderLogin();
    try {
      DB = await api('/api/admin/db');
      ['posts', 'videos', 'leads'].forEach((k) => { if (!Array.isArray(DB[k])) DB[k] = []; });
      DB.layout = DB.layout || {}; DB.ads = DB.ads || {}; DB.settings = DB.settings || {};
      route(false);
    } catch (e) { if (token) toast(e.message, true); renderLogin(); }
  }
  boot();
})();
