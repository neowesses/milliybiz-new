/* MILLIYBIZ — публичный сайт. Данные приходят из /api/public (их правит CRM). */
(() => {
  'use strict';

  // ---------- i18n ----------
  const UI = {
    uz: {
      search: 'Qidiruv', tv: 'MILLIYBIZ.TV', crm: 'CRM', karta: 'QIZIL HUDUD', ads: 'REKLAMA',
      adSpot: 'Reklama uchun joy', adLabel: 'Reklama', news: 'MILLIYBIZ.NEWS', sport: 'SPORT / BUSINESS',
      all: 'Barchasi', allNews: 'Barcha yangiliklar', more: 'Yana yuklash', nothing: 'Hech narsa topilmadi',
      found: 'Qidiruv natijalari', related: 'Mavzuga oid', share: 'Ulashish', views: "ko'rishlar",
      notFound: 'Maqola topilmadi', back: 'Bosh sahifaga', source: 'Manba', day: 'Kunduzgi rejim', night: 'Tungi rejim',
      name: 'Ism Familiya*', phone: 'Telefon raqam*', send: 'Ariza qoldirish', sending: 'Yuborilmoqda…',
      ok: "Rahmat! Arizangiz qabul qilindi. Tez orada siz bilan bog'lanamiz.", err: "Xatolik. Qayta urinib ko'ring.",
      fill: "Iltimos, maydonlarni to'g'ri to'ldiring", rights: 'BARCHA HUQUQLAR HIMOYALANGAN.', allVideos: 'Barcha videolar',
      cats: { news: 'Yangiliklar', society: 'Jamiyat', sport: 'Sport', business: 'Biznes', culture: 'Madaniyat', world: 'Dunyo' },
    },
    ru: {
      search: 'Поиск', tv: 'MILLIYBIZ.TV', crm: 'CRM', karta: 'QIZIL HUDUD', ads: 'РЕКЛАМА',
      adSpot: 'Место для рекламы', adLabel: 'Реклама', news: 'MILLIYBIZ.NEWS', sport: 'SPORT / BUSINESS',
      all: 'Все', allNews: 'Все новости', more: 'Показать ещё', nothing: 'Ничего не найдено',
      found: 'Результаты поиска', related: 'Читайте также', share: 'Поделиться', views: 'просмотров',
      notFound: 'Статья не найдена', back: 'На главную', source: 'Источник', day: 'Дневной режим', night: 'Ночной режим',
      name: 'Имя Фамилия*', phone: 'Номер телефона*', send: 'Оставить заявку', sending: 'Отправляем…',
      ok: 'Спасибо! Заявка принята. Мы скоро свяжемся с вами.', err: 'Ошибка. Попробуйте ещё раз.',
      fill: 'Пожалуйста, заполните поля корректно', rights: 'ВСЕ ПРАВА ЗАЩИЩЕНЫ.', allVideos: 'Все видео',
      cats: { news: 'Новости', society: 'Общество', sport: 'Спорт', business: 'Бизнес', culture: 'Культура', world: 'Мир' },
    },
  };
  const REGIONS = ['Tashkent', 'Samarqand', 'Andijon', 'Buxoro', 'Jizzax', 'Qashqadaryo', 'Navoiy', 'Namangan', 'Sirdaryo', 'Surxondaryo', 'Farg‘ona', 'Xorazm', 'Qoraqalpog‘iston'];
  const LANGS = { ru: 'Русский', uz: 'O‘zbekcha' };

  // Кастомный выпадающий список: .dd > .dd__btn + .dd__menu > [role=option][data-v]
  function bindDropdown(dd, onPick) {
    const btn = dd.querySelector('.dd__btn');
    const all = () => [...dd.querySelectorAll('[role="option"]')];
    const opts = () => all().filter((o) => getComputedStyle(o).display !== 'none');
    const isOpen = () => dd.classList.contains('is-open');
    const open = () => {
      document.querySelectorAll('.dd.is-open').forEach((o) => o !== dd && o.__close?.());
      dd.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
      const cur = opts().find((o) => o.getAttribute('aria-selected') === 'true') || opts()[0];
      cur?.scrollIntoView({ block: 'nearest' });
      requestAnimationFrame(() => cur?.focus({ preventScroll: true }));
    };
    const close = (focusBtn) => { dd.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); if (focusBtn) btn.focus(); };
    dd.__close = close;
    btn.addEventListener('click', (e) => { e.stopPropagation(); isOpen() ? close() : open(); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    dd.querySelector('.dd__close')?.addEventListener('click', (e) => { e.stopPropagation(); close(true); });
    dd.addEventListener('click', (e) => {
      const o = e.target.closest('[role="option"]'); if (!o) return;
      e.stopPropagation();
      all().forEach((x) => x.setAttribute('aria-selected', x === o ? 'true' : 'false'));
      close(true);
      onPick(o.dataset.v, o);
    });
    dd.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      const list = opts(); const i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[Math.min(i + 1, list.length - 1)]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[Math.max(i - 1, 0)]?.focus(); }
      else if (e.key === 'Tab') close();
    });
    document.addEventListener('click', (e) => { if (isOpen() && !dd.contains(e.target)) close(); });
  }

  let lang = 'uz';
  try { lang = localStorage.getItem('mb_lang') || 'uz'; } catch (e) {}
  if (!UI[lang]) lang = 'uz';
  document.documentElement.lang = lang;
  const T = (k) => UI[lang][k] ?? k;
  const L = (obj) => !obj ? '' : typeof obj === 'string' ? obj : (obj[lang] || obj[lang === 'uz' ? 'ru' : 'uz'] || '');

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const pad = (n) => String(n).padStart(2, '0');
  const dmy = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; };
  const stamp = (p) => [p.time, dmy(p.date)].filter(Boolean).join(' - ');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const feedTime = (p) => (p.date === today() ? p.time : dmy(p.date).slice(0, 5)) || '';
  const url = (p) => `/article.html?id=${encodeURIComponent(p.id)}`;
  const sortKey = (p) => `${p.date || ''}T${p.time || '00:00'}`;

  const LOGO = '<svg viewBox="0 0 67.2 56" aria-hidden="true"><g transform="translate(0 56) rotate(-90)"><path d="M43.27 0 56 12.68V67.2H12.73L0 54.52V0z" fill="#fff"/><path d="M38.181 16.229H17.308v7.484h13.902v6.018H17.308v7.484h13.902v6.018H17.308v7.484h20.873v-8.294l-4.872-5.208h4.872v-8.294l-4.872-5.208h4.872z" fill="#830101"/></g></svg>';
  const SEARCH = '<svg viewBox="0 0 15 15" aria-hidden="true"><circle cx="6.6" cy="6.6" r="6.1" fill="none" stroke="#fff"/><circle cx="13.24" cy="13.24" r="1.76" fill="#fff"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.6 14.4A8.6 8.6 0 0 1 9.6 3.4a.6.6 0 0 0-.8-.7A9.8 9.8 0 1 0 21.3 15.2a.6.6 0 0 0-.7-.8z"/></svg>';
  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.6" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7"/></g></svg>';
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  function toggleTheme() {
    const dark = !isDark();
    if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('mb_theme', dark ? 'dark' : 'light'); } catch (e) {}
    document.querySelectorAll('[data-theme-btn]').forEach(paintThemeBtn);
  }
  function paintThemeBtn(b) {
    const label = isDark() ? T('day') : T('night');
    b.setAttribute('aria-label', label); b.title = label;
    b.innerHTML = b.classList.contains('drawer__theme') ? `${isDark() ? SUN : MOON}<span>${label}</span>` : (isDark() ? SUN : MOON);
  }
  const PLAY ='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zM9 17.4V6.6l8.4 5.4z"/></svg>';

  const thumb = (src, alt = '', eager = false) => src
    ? `<div class="thumb"><img src="${esc(src)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`
    : '<div class="thumb thumb--empty"></div>';
  const picture = (p) => (window.matchMedia('(max-width: 767px)').matches && p.imageMobile) ? p.imageMobile : p.image;

  // ---------- data ----------
  let DATA = null;
  async function load() {
    if (DATA) return DATA;
    const r = await fetch('/api/public', { cache: 'no-store' });
    if (!r.ok) throw new Error('API ' + r.status);
    DATA = await r.json();
    DATA.posts = (DATA.posts || []).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    DATA.byId = Object.fromEntries(DATA.posts.map((p) => [p.id, p]));
    return DATA;
  }

  // ---------- shell: header / footer ----------
  function shell(d) {
    const s = d.settings || {};
    const so = s.socials || {};
    const page = document.body.dataset.page;
    const karta = 'https://qizil-hudud.milliybiz.uz/';
    const header = $('#header');
    header.className = 'header';
    header.innerHTML = `
      <div class="container header__in">
        <a class="logo" href="/" aria-label="Milliybiz">${LOGO}</a>
        <nav class="nav" aria-label="Main">
          <a href="/tv.html" class="${page === 'tv' ? 'is-active' : ''}">${T('tv')}</a>
          <a href="/admin/">${T('crm')}</a>
          <a href="${esc(karta)}" target="_blank" rel="noopener">${T('karta')}</a>
        </nav>
        <div class="tools">
          <form class="search" action="/news.html" role="search"><label class="search__in">${SEARCH}<span class="visually-hidden">${T('search')}</span><input name="q" placeholder="${T('search')}" value="${esc(qs('q') || '')}"></label></form>
          <div class="lang-sw" role="group" aria-label="Language">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-l="${k}" class="${k === lang ? 'is-active' : ''}" aria-pressed="${k === lang}" title="${v}">${k.toUpperCase()}</button>`).join('')}</div>
          <button type="button" class="theme-btn" data-theme-btn></button>
        </div>
        <button class="burger" type="button" aria-label="Menu" aria-expanded="false"><span></span></button>
      </div>
      <div class="drawer">
        <form class="search" action="/news.html" role="search"><label class="search__in">${SEARCH}<input name="q" placeholder="${T('search')}"></label></form>
        <nav class="drawer__nav"><a href="/tv.html">${T('tv')}</a><a href="/admin/">${T('crm')}</a><a href="${esc(karta)}" target="_blank" rel="noopener">${T('karta')}</a><a href="/news.html">${T('allNews').toUpperCase()}</a></nav>
        <div class="drawer__langs">${Object.keys(LANGS).map((k) => `<button data-l="${k}" class="${lang === k ? 'is-active' : ''}">${k.toUpperCase()}</button>`).join('')}<button type="button" class="drawer__theme" data-theme-btn></button></div>
        <div class="drawer__foot"><a href="/reklama.html">${T('ads')}</a><a href="tel:${esc((s.phone || '').replace(/\s/g, ''))}">${esc(s.phone || '')}</a></div>
      </div>`;
    header.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.l !== lang) setLang(b.dataset.l); }));
    header.querySelectorAll('[data-theme-btn]').forEach((b) => { paintThemeBtn(b); b.addEventListener('click', toggleTheme); });
    const burger = $('.burger', header);
    burger.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      burger.setAttribute('aria-expanded', open);
    });

    const sub = $('#subbar');
    if (sub) {
      const links = [['Milliybiz', so.milliybiz || '/'], ['Telegram', so.telegram], ['Facebook', so.facebook], ['Instagram', so.instagram]].filter((x) => x[1]);
      sub.innerHTML = `<div class="container"><div class="subbar">${links.map(([n, h]) => `<a href="${esc(h)}" ${h.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${n}</a>`).join('')}</div></div>`;
    }

    const footer = $('#footer');
    const social = [['INSTAGRAM', so.instagram], ['TELEGRAM', so.telegram], ['YOUTUBE', so.youtube]].filter((x) => x[1]);
    footer.innerHTML = `
      <div class="footer">
        <div class="container footer__in">
          <div class="footer__slogan">${esc(L(s.slogan) || 'Qadriyat va madaniyat targ‘ib qiluvchi kompaniya')}</div>
          <div class="footer__social">${social.map(([n, h]) => `<a href="${esc(h)}" target="_blank" rel="noopener">${n}</a>`).join('')}</div>
          <div class="footer__legal">${esc(L(s.legal))}</div>
          <div class="footer__age">18+</div>
        </div>
      </div>
      <div class="footbar"><div class="container footbar__in">
        <span class="hide-m">© ${new Date().getFullYear()} "MILLIYBIZ". ${T('rights')}</span>
        <a class="sp hide-m" href="/reklama.html">${T('ads')}</a>
        <a class="hide-m" href="tel:${esc((s.phone || '').replace(/\s/g, ''))}">${esc(s.phone || '')}</a>
        <span class="show-m">MILLIYBIZ@${new Date().getFullYear()}</span>
      </div></div>`;
  }
  function setLang(l) { try { localStorage.setItem('mb_lang', l); } catch (e) {} location.reload(); }

  // ---------- блоки ----------
  const adHero = (ad, cls = 'adhero') => {
    if (!ad || ad.active === false) return '';
    const title = L(ad.title);
    return `<a class="${cls}" href="${esc(ad.link || '/reklama.html')}" ${(ad.link || '').startsWith('http') ? 'target="_blank" rel="noopener sponsored"' : ''}>
      <img src="${esc(ad.image || '/assets/img/hero.jpg')}" alt="${esc(title || T('adLabel'))}" fetchpriority="high">
      ${title ? `<span class="${cls}__t">${esc(title).replace(/\n/g, '<br>')}</span>` : ''}
      ${cls === 'adhero' && ad.badge ? `<span class="adhero__badge">${T('adLabel')}</span>` : ''}
    </a>`;
  };
  const tagOf = (p) => p.cat ? `<span class="tag">${esc(UI[lang].cats[p.cat] || p.cat)}</span>` : '';

  // Обложка «фото + заголовок на фото» (вариант B): заголовок и рубрика поверх фото, под карточкой — подзаголовок.
  const cover = (p, size = 'md', eager = false, H = 'h3') => {
    const src = picture(p);
    const credit = p.photoCredit ? `<span class="cover__credit">Foto: ${esc(p.photoCredit)}</span>` : '';
    return `<div class="thumb cover cover--${size} ${src ? '' : 'cover--noimg'}">
      ${src ? `<img src="${esc(src)}" alt="${esc(L(p.title))}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : ''}
      <span class="cover__shade"></span>
      <div class="cover__in">${tagOf(p)}<${H} class="cover__t">${esc(L(p.title))}</${H}></div>${credit}
    </div>`;
  };
  const leadOf = (p, lines = 2) => L(p.lead) ? `<p class="lead clamp-${lines}">${esc(L(p.lead))}</p>` : '';

  const leadCard = (p) => `<a class="card lead-card a-main reveal" href="${url(p)}">
      ${cover(p, 'lg', true, 'h2')}
      <div class="lead-card__body">${leadOf(p, 3)}<span class="meta">${esc(stamp(p))}</span></div>
    </a>`;
  const feed = (list) => `<div class="card feed a-feed reveal">${list.map((p) => `<a class="feed__item" href="${url(p)}"><time>${esc(feedTime(p))}</time> <span>${esc(L(p.title))}</span></a>`).join('')}</div>`;
  const side = (list) => {
    if (!list.length) return '<div class="card a-side"></div>';
    const [f, ...rest] = list;
    return `<div class="card side-card a-side reveal">
      <a class="side-card__main" href="${url(f)}">${cover(f, 'md')}${leadOf(f)}</a>
      ${rest.map((p) => `<a class="mini" href="${url(p)}">${thumb(picture(p), L(p.title))}<div class="mini__b"><h4 class="title clamp-3">${esc(L(p.title))}</h4><span class="meta">${esc(dmy(p.date))}</span></div></a>`).join('')}
    </div>`;
  };
  const grid3 = (list) => {
    const cols = [0, 1, 2].map((i) => [list[i], list[i + 3]].filter(Boolean));
    return `<div class="grid3 a-grid">${cols.map((c) => `<div class="grid3__col">
      ${c[0] ? `<a class="card small-card reveal" href="${url(c[0])}">${cover(c[0], 'sm')}${leadOf(c[0])}<span class="meta">${esc(stamp(c[0]))}</span></a>` : ''}
      ${c[1] ? `<a class="card small-card small-card--text reveal" href="${url(c[1])}"><h3 class="title clamp-3">${esc(L(c[1].title))}</h3><span class="meta">${esc(stamp(c[1]))}</span></a>` : ''}
    </div>`).join('')}</div>`;
  };
  const wideCard = (p) => p ? `<a class="card wide-card reveal" href="${url(p)}">${cover(p, 'lg', false, 'h2')}<div class="wide-card__b">${leadOf(p, 5)}<span class="meta">${esc(stamp(p))}</span></div></a>` : '<div class="card"></div>';
  const hCard = (p) => `<a class="card h-card reveal" href="${url(p)}">${cover(p, 'sm')}<div class="h-card__b">${leadOf(p, 5)}<span class="meta">${esc(stamp(p))}</span></div></a>`;
  const gridCard = (p) => `<a class="card reveal" href="${url(p)}">${cover(p, 'md')}${leadOf(p)}<span class="meta">${esc(stamp(p))}</span></a>`;

  // ---------- видео ----------
  const ytId = (u = '') => (u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1] || '';
  const videoCard = (v) => {
    const id = ytId(v.url);
    const cover = v.cover || (id ? `https://i.ytimg.com/vi/${id}/hq720.jpg` : '');
    const fallback = id && !v.cover ? ` onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${id}/mqdefault.jpg'"` : '';
    return `<button class="video" type="button" data-yt="${esc(id)}" data-short="${/shorts\//.test(v.url) ? 1 : 0}" data-href="${esc(v.url)}">
      ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy"${fallback}>` : ''}
      <span class="video__play"></span>${L(v.title) ? `<span class="video__t clamp-3">${esc(L(v.title))}</span>` : ''}
    </button>`;
  };
  function bindVideos(root = document) {
    root.querySelectorAll('.video[data-yt]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.yt;
      if (!id) { if (b.dataset.href) window.open(b.dataset.href, '_blank', 'noopener'); return; }
      const m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `<button class="modal__close" aria-label="Close">✕</button><div class="modal__box ${b.dataset.short === '1' ? '' : 'modal__box--wide'}"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
      document.body.appendChild(m);
      requestAnimationFrame(() => m.classList.add('is-open'));
      const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => e.key === 'Escape' && close();
      m.addEventListener('click', (e) => { if (e.target === m || e.target.classList.contains('modal__close')) close(); });
      document.addEventListener('keydown', onKey);
    }));
  }

  // ---------- раскладка главной (слоты из CRM + автозаполнение) ----------
  function resolveLayout(d) {
    const lay = d.layout || {};
    const posts = d.posts;
    const used = new Set();
    const pinnedIds = ['main', 'side', 'grid', 'sport'].flatMap((k) => lay[k] || []).filter((id) => id && d.byId[id]);
    pinnedIds.forEach((id) => used.add(id));
    const fill = (key, n, pref) => {
      const slots = lay[key] || [];
      const out = [];
      for (let i = 0; i < n; i++) {
        const id = slots[i];
        if (id && d.byId[id]) { out.push(d.byId[id]); continue; }
        let p = posts.find((x) => !used.has(x.id) && (!pref || pref(x)));
        if (!p && pref) p = posts.find((x) => !used.has(x.id));
        if (!p) break;
        used.add(p.id); out.push(p);
      }
      return out;
    };
    const isSB = (p) => p.cat === 'sport' || p.cat === 'business';
    const sport = fill('sport', Math.max(5, Math.min(25, +lay.sportCount || 5)), isSB);
    const main = fill('main', 1);
    const grid = fill('grid', 6);
    const sideL = fill('side', 6);
    return { main: main[0], grid, side: sideL, sport };
  }

  // ---------- страницы ----------
  const pages = {
    async home(d) {
      const lay = resolveLayout(d);
      const ad = d.ads?.top;
      const sideAd = d.ads?.side;
      const vids = (d.videos || []).slice(0, 6);
      while (vids.length < 6) vids.push(null);
      $('#app').innerHTML = `
        <section class="section section--tight"><div class="container">
          ${adHero(ad)}
          <div class="home-top">
            ${lay.main ? leadCard(lay.main) : '<div class="card a-main"></div>'}
            ${feed(d.posts.slice(0, 6))}
            ${side(lay.side)}
            ${grid3(lay.grid)}
          </div>
        </div></section>
        <section class="section section--white"><div class="container">
          <h2 class="sec-title"><a href="/tv.html">${T('news')}</a>${PLAY}<a class="more" href="/tv.html">${T('allVideos')} →</a></h2>
          <div class="videos">${vids.map((v) => v ? videoCard(v) : '<div class="video video--empty"></div>').join('')}</div>
        </div></section>
        <section class="section"><div class="container">
          <h2 class="sec-title"><a href="/news.html?cat=sport">${T('sport')}</a><a class="more" href="/news.html">${T('allNews')} →</a></h2>
          <div class="sport-top">
            ${wideCard(lay.sport[0])}
            ${sideAd && sideAd.active !== false ? `<a class="banner reveal" href="${esc(sideAd.link || '/reklama.html')}" ${(sideAd.link || '').startsWith('http') ? 'target="_blank" rel="noopener sponsored"' : ''}><img src="${esc(sideAd.image || '/assets/img/zaman.png')}" alt="${T('adLabel')}" loading="lazy"></a>` : '<div></div>'}
          </div>
          <div class="grid2">${lay.sport.slice(1).map(hCard).join('')}</div>
        </div></section>`;
      bindVideos();
    },

    async article(d) {
      const id = qs('id');
      let p = d.byId[id];
      if (!p) {
        $('#app').innerHTML = `<div class="container"><div class="page-head"><h1>${T('notFound')}</h1></div><a class="btn-more" style="display:inline-block;margin:0 0 60px" href="/">${T('back')}</a></div>`;
        return;
      }
      document.title = `${L(p.title)} — Milliybiz`;
      setMeta('description', L(p.lead));
      setMeta('og:title', L(p.title), true); setMeta('og:image', p.image, true);
      fetch(`/api/view/${encodeURIComponent(p.id)}`, { method: 'POST' }).catch(() => {});
      const ad = d.ads?.article || d.ads?.top;
      const body = (L(p.body) || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
        if (b.startsWith('>')) return `<blockquote>${esc(b.replace(/^>\s?/gm, ''))}</blockquote>`;
        const img = b.match(/^!\[(.*?)\]\((.+?)\)$/);
        if (img) return `<img src="${esc(img[2])}" alt="${esc(img[1])}" loading="lazy">`;
        return `<p>${esc(b).replace(/\n/g, '<br>')}</p>`;
      }).join('');
      let rel = d.posts.filter((x) => x.id !== p.id && x.cat === p.cat);
      if (rel.length < 4) rel = rel.concat(d.posts.filter((x) => x.id !== p.id && x.cat !== p.cat));
      const shareUrl = encodeURIComponent(location.href);
      $('#app').innerHTML = `
        <div class="container">
          <div class="art-top">
            <div class="art-media">${thumb(picture(p), L(p.title), true)}</div>
            ${ad && ad.active !== false ? adHero(ad, 'art-ad') : '<div></div>'}
          </div>
          <article class="article">
            ${tagOf(p).replace('class="tag"', 'class="tag article__tag"')}
            <h1>${esc(L(p.title))}</h1>
            ${L(p.lead) ? `<p class="article__lead">${esc(L(p.lead))}</p>` : ''}
            <div class="article__meta meta"><span>${esc(stamp(p))}</span>${p.views ? `<span>${p.views} ${T('views')}</span>` : ''}</div>
            ${p.score ? `<div class="score"><span class="score__t">${esc(p.score.home)}</span><b>${+p.score.hs}<i>:</i>${+p.score.as}</b><span class="score__t">${esc(p.score.away)}</span><small>${esc(p.score.league)}</small></div>` : ''}
            ${ytId(p.video) ? `<div class="art-video"><iframe src="https://www.youtube-nocookie.com/embed/${ytId(p.video)}?rel=0" title="${esc(L(p.title))}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>` : ''}
            <div class="article__body">${body}</div>
                        ${(p.source || []).length ? `<p class="art-source">${T('source')}: ${[...new Set(p.source.map((s) => s.name))].map(esc).join(', ')}</p>` : ''}
            <div class="share">
              <a href="https://t.me/share/url?url=${shareUrl}" target="_blank" rel="noopener">TELEGRAM</a>
              <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener">FACEBOOK</a>
            </div>
          </article>
          <section class="related">
            <h2 class="sec-title">${T('related').toUpperCase()}</h2>
            <div class="grid2" style="margin-top:0">${rel.slice(0, 4).map(hCard).join('')}</div>
          </section>
        </div>`;
    },

    async news(d) {
      const q = (qs('q') || '').trim().toLowerCase();
      let cat = qs('cat') || '';
      const cats = [...new Set(d.posts.map((p) => p.cat).filter(Boolean))];
      const PAGE = 12;
      let shown = PAGE;
      const app = $('#app');
      const render = () => {
        let list = d.posts.filter((p) => !cat || p.cat === cat);
        if (q) list = list.filter((p) => [p.title?.uz, p.title?.ru, p.lead?.uz, p.lead?.ru, p.body?.uz, p.body?.ru].join(' ').toLowerCase().includes(q));
        app.innerHTML = `<div class="container">
          <div class="page-head"><h1>${q ? `${T('found')}: «${esc(qs('q'))}»` : T('allNews').toUpperCase()}</h1>
            <div class="chips"><button class="chip ${!cat ? 'is-active' : ''}" data-c="">${T('all')}</button>${cats.map((c) => `<button class="chip ${cat === c ? 'is-active' : ''}" data-c="${esc(c)}">${esc(UI[lang].cats[c] || c)}</button>`).join('')}</div>
          </div>
          <div class="news-grid">${list.length ? list.slice(0, shown).map(gridCard).join('') : `<div class="empty">${T('nothing')}</div>`}</div>
          ${list.length > shown ? `<button class="btn-more cut-br" id="more">${T('more')}</button>` : ''}
        </div>`;
        app.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
          cat = b.dataset.c; shown = PAGE;
          const u = new URL(location.href); cat ? u.searchParams.set('cat', cat) : u.searchParams.delete('cat'); history.replaceState(null, '', u);
          render();
        }));
        $('#more')?.addEventListener('click', () => { shown += PAGE; render(); });
        reveal();
      };
      render();
    },

    async tv(d) {
      const vids = d.videos || [];
      $('#app').innerHTML = `<div class="container">
        <div class="page-head"><h1>${T('tv')}</h1></div>
        <div class="tv-grid">${vids.length ? vids.map(videoCard).join('') : `<div class="empty">${T('nothing')}</div>`}</div>
      </div>`;
      bindVideos();
    },

    async reklama(d) {
      const s = d.settings || {};
      const promo = d.ads?.promo || {};
      $('#app').innerHTML = `
        <section class="promo">
          <img src="${esc(promo.image || '/assets/img/hero.jpg')}" alt="">
          <div class="container"><div class="promo__box">
            <div class="promo__brand">Milliybiz</div>
            <p class="promo__text">${esc(L(promo.text) || L(s.promoText))}</p>
            <form class="form" id="leadForm" novalidate>
              <div class="field"><input name="name" autocomplete="name" placeholder="${T('name')}" required minlength="2"></div>
              <div class="field"><input name="phone" type="tel" autocomplete="tel" placeholder="${T('phone')}" required></div>
              <div class="cs dd">
                <input type="hidden" name="region" value="${REGIONS[0]}">
                <button type="button" class="cs__btn dd__btn" aria-haspopup="listbox" aria-expanded="false"><span class="cs__v">Uzbekistan, ${REGIONS[0]}*</span></button>
                <div class="cs__menu dd__menu">
                  <button type="button" class="cs__head dd__close" tabindex="-1"><span class="cs__v">Uzbekistan, ${REGIONS[0]}*</span></button>
                  <div class="cs__list" role="listbox">${REGIONS.map((r, i) => `<button type="button" class="cs__opt" role="option" data-v="${esc(r)}" aria-selected="${i === 0}">${esc(r)}*</button>`).join('')}</div>
                </div>
              </div>
              <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
              <button class="btn" type="submit"><span>${T('send')}</span></button>
              <div class="form__note" role="status"></div>
            </form>
          </div></div>
        </section>`;
      const f = $('#leadForm');
      const phone = f.phone;
      const cs = $('.cs', f);
      bindDropdown(cs, (v) => { f.region.value = v; cs.querySelectorAll('.cs__v').forEach((el) => { el.textContent = 'Uzbekistan, ' + v + '*'; }); });
      phone.addEventListener('input', () => {
        let dgt = phone.value.replace(/\D/g, '');
        if (!dgt.startsWith('998')) dgt = '998' + dgt;
        dgt = dgt.slice(0, 12);
        const p = [dgt.slice(0, 3), dgt.slice(3, 5), dgt.slice(5, 8), dgt.slice(8, 10), dgt.slice(10, 12)].filter(Boolean);
        phone.value = '+' + p.join(' ');
      });
      // по макету поле пустое с плейсхолдером; код страны подставляем при фокусе
      phone.addEventListener('focus', () => { if (!phone.value) phone.value = '+998 '; });
      phone.addEventListener('blur', () => { if (phone.value.replace(/\D/g, '').length <= 3) phone.value = ''; });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const note = $('.form__note', f);
        const okName = f.name.value.trim().length >= 2;
        const okPhone = phone.value.replace(/\D/g, '').length === 12;
        f.name.parentNode.classList.toggle('is-invalid', !okName);
        phone.parentNode.classList.toggle('is-invalid', !okPhone);
        if (!okName || !okPhone) { note.textContent = T('fill'); return; }
        const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.firstChild.textContent = T('sending');
        try {
          const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name.value.trim(), phone: phone.value, region: f.region.value, website: f.website.value, lang }) });
          if (!r.ok) throw 0;
          f.outerHTML = `<div class="form__ok">${T('ok')}</div>`;
        } catch (err) { note.textContent = T('err'); btn.disabled = false; btn.firstChild.textContent = T('send'); }
      });
    },
  };

  function setMeta(name, val, og) {
    if (!val) return;
    let m = document.head.querySelector(og ? `meta[property="${name}"]` : `meta[name="${name}"]`);
    if (!m) { m = document.createElement('meta'); m.setAttribute(og ? 'property' : 'name', name); document.head.appendChild(m); }
    m.content = val;
  }

  function reveal() {
    const els = document.querySelectorAll('.reveal:not(.is-in)');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
  }

  // ---------- boot ----------
  (async () => {
    try {
      const d = await load();
      shell(d);
      await pages[document.body.dataset.page]?.(d);
      reveal();
    } catch (e) {
      console.error(e);
      try { shell({}); } catch (_) {}
      $('#app').innerHTML = '<div class="container"><div class="empty" style="margin:40px 0">Server bilan aloqa yo‘q. / Нет связи с сервером.</div></div>';
    }
  })();
})();
