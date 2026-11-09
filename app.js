'use strict';

/* ================= Constantes ================= */
const CATS = {
  film:    { label: 'Mes films',          short: 'Films',           one: 'film',             icon: '🎬' },
  jeu:     { label: 'Mes jeux vidéo',     short: 'Jeux vidéo',      one: 'jeu vidéo',        icon: '🎮' },
  societe: { label: 'Mes jeux de société', short: 'Jeux de société', one: 'jeu de société',  icon: '🎲' },
  livre:   { label: 'Mes livres',         short: 'Livres',          one: 'livre',            icon: '📚' },
  amiibo:  { label: 'Mes Amiibo',         short: 'Amiibo',          one: 'amiibo',           icon: '🍄' },
  cinema:  { label: 'Mon cinéma',         short: 'Cinéma',          one: 'film au cinéma',   icon: '🎟️' },
};
const OWN_CATS = ['film', 'jeu', 'societe', 'livre', 'amiibo'];
const WISH_CATS = ['film', 'jeu', 'societe', 'livre', 'amiibo', 'cinema'];
const SUPPORT_CATS = ['film', 'jeu', 'livre'];          // catégories qui ont un support
const GENRE_CATS = ['film', 'jeu', 'livre', 'societe']; // le cinéma utilise les genres "film"
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/* ================= Utilitaires ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const coll = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const today = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ local
const localDay = iso => new Date(iso).toLocaleDateString('sv-SE');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const fmtDate = d => { if (!d) return ''; const [y, m, j] = d.split('-'); return j ? `${j}/${m}/${y}` : y; };
const gcat = cat => (cat === 'cinema' ? 'film' : cat);
const hasSupport = cat => SUPPORT_CATS.includes(cat);
const hasGenre = cat => cat !== 'amiibo';
const svgStar = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';

function starsHtml(v, cls = '') {
  let h = `<span class="stars ${cls}" aria-label="${v ?? 0} sur 5">`;
  for (let i = 1; i <= 5; i++) {
    const f = Math.max(0, Math.min(1, (v || 0) - (i - 1))) * 100;
    h += `<span class="st">${svgStar}<span class="st-fg" style="width:${f}%">${svgStar}</span></span>`;
  }
  return h + '</span>';
}
const fmtRating = v => (v || 0).toLocaleString('fr-FR') + ' / 5';

/* ================= Base de données (IndexedDB) ================= */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('ma-collection', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('items', { keyPath: 'id' });
        d.createObjectStore('posters');
        d.createObjectStore('kv');
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  run(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      let out;
      const r = fn(t.objectStore(store));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  all: s => DB.run(s, 'readonly', st => st.getAll()),
  keys: s => DB.run(s, 'readonly', st => st.getAllKeys()),
  get: (s, k) => DB.run(s, 'readonly', st => st.get(k)),
  put: (s, v, k) => DB.run(s, 'readwrite', st => (k === undefined ? st.put(v) : st.put(v, k))),
  del: (s, k) => DB.run(s, 'readwrite', st => st.delete(k)),
  clear: s => DB.run(s, 'readwrite', st => st.clear()),
};

/* ================= État ================= */
const state = {
  items: [],
  refs: { supports: [], consoles: [], genres: [] },
  filters: {},
  cineFilter: { year: '', month: '' },
  posterUrls: new Map(),
  lastExport: null,
};

async function loadAll() {
  state.items = await DB.all('items');
  let refs = await DB.get('kv', 'refs');
  if (!refs) {
    refs = { supports: SEED_SUPPORTS, consoles: SEED_CONSOLES, genres: buildSeedGenres() };
    await DB.put('kv', refs, 'refs');
  }
  state.refs = refs;
  state.lastExport = await DB.get('kv', 'lastExport');
}
const saveRefs = () => DB.put('kv', state.refs, 'refs');

async function saveItem(it) {
  it.updatedAt = new Date().toISOString();
  await DB.put('items', it);
  const i = state.items.findIndex(x => x.id === it.id);
  if (i >= 0) state.items[i] = it; else state.items.push(it);
}
async function deleteItem(id) {
  await DB.del('items', id);
  await DB.del('posters', id);
  dropPosterUrl(id);
  state.items = state.items.filter(x => x.id !== id);
}
const getItem = id => state.items.find(x => x.id === id);

async function posterUrl(id) {
  if (state.posterUrls.has(id)) return state.posterUrls.get(id);
  const blob = await DB.get('posters', id);
  const url = blob ? URL.createObjectURL(blob) : null;
  state.posterUrls.set(id, url);
  return url;
}
function dropPosterUrl(id) {
  const u = state.posterUrls.get(id);
  if (u) URL.revokeObjectURL(u);
  state.posterUrls.delete(id);
}

/* ================= Règles métier ================= */
function prefix(it) {
  if (it.list !== 'possede') return '';
  if (it.cat === 'jeu') return `[${it.console}-${it.support}]`;
  if (it.cat === 'film') return `[${it.support}]`;
  if (it.cat === 'amiibo') return `[${it.number}]`;
  return '';
}
// Clé de tri des envies : date de sortie connue, sinon date d'enregistrement
function wishKey(it) {
  const r = it.release || '';
  if (r.length === 4) return r + '-12-31';
  if (r.length === 10) return r;
  return localDay(it.createdAt);
}
function wishSort(a, b) {
  return wishKey(a).localeCompare(wishKey(b)) || (a.createdAt || '').localeCompare(b.createdAt || '') || coll.compare(a.title, b.title);
}
const supportsFor = cat => state.refs.supports.filter(s => s.cats.includes(cat));
const genresFor = cat => state.refs.genres.filter(g => g.cats.includes(gcat(cat))).sort((a, b) => coll.compare(a.name, b.name));
const backOf = it => (it.list === 'possede' ? `#/liste/${it.cat}` : it.list === 'envie' ? `#/envies/${it.cat}` : '#/cinema');

/* ================= Modales / toast ================= */
function modal({ title = '', text = '', input = null, ok = 'OK', cancel = 'Annuler', danger = false }) {
  return new Promise(res => {
    const el = document.createElement('div');
    el.className = 'modal-back';
    el.innerHTML = `<div class="modal" role="dialog">
      ${title ? `<h3>${esc(title)}</h3>` : ''}
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${input !== null ? `<input class="inp" id="m-in" value="${esc(input)}" autocomplete="off">` : ''}
      <div class="modal-btns">
        ${cancel ? `<button class="btn ghost" data-r="0">${esc(cancel)}</button>` : ''}
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button>
      </div></div>`;
    document.body.appendChild(el);
    const inp = $('#m-in', el);
    if (inp) setTimeout(() => inp.focus(), 50);
    const close = v => { el.remove(); res(v); };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) close(b.dataset.r === '1' ? (inp ? inp.value.trim() : true) : (inp ? null : false));
      else if (e.target === el && cancel) close(inp ? null : false);
    });
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') close(inp.value.trim()); });
  });
}
function chooseBox(text, opts) {
  return new Promise(res => {
    const el = document.createElement('div');
    el.className = 'modal-back';
    el.innerHTML = `<div class="modal"><p>${esc(text)}</p><div class="modal-col">${opts.map(([k, l, c]) => `<button class="btn ${c}" data-k="${k}">${esc(l)}</button>`).join('')}</div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { el.remove(); res(b.dataset.k); } });
  });
}
const confirmBox = (text, ok = 'Supprimer') => modal({ title: 'Confirmation', text, ok, danger: true });
const alertBox = text => modal({ text, cancel: null });
const promptBox = (title, value = '') => modal({ title, input: value, ok: 'Ajouter' });
function toast(msg) {
  $$('.toast').forEach(x => x.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

/* ================= Rendu / routeur ================= */
const app = () => $('#app');
function page({ title, back = null, right = '', body = '', fab = null }) {
  app().innerHTML = `
    <header class="top">
      ${back ? `<a class="hbtn back" href="${back}" aria-label="Retour">‹</a>` : '<span class="hbtn"></span>'}
      <h1>${esc(title)}</h1>
      <span class="hbtn">${right}</span>
    </header>
    <main class="content">${body}</main>
    ${fab ? `<a class="fab" href="${fab}" aria-label="Ajouter">+</a>` : ''}`;
  window.scrollTo(0, 0);
}

async function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [v, a, b] = parts;
  try {
    if (!v) return viewHome();
    if (v === 'liste' && OWN_CATS.includes(a)) return viewList(a);
    if (v === 'fiche') return viewDetail(a);
    if (v === 'edition') return viewForm(getItem(a), b === 'convertir');
    if (v === 'nouveau') return viewForm(null, false, a, b);
    if (v === 'ajouter') return viewAdd(a);
    if (v === 'backlog') return viewBacklog(a === 'ajouter');
    if (v === 'cinema' && a === 'image') return viewImage();
    if (v === 'cinema') return viewCinema();
    if (v === 'envies') return viewWishes(WISH_CATS.includes(a) ? a : 'film');
    if (v === 'reglages') return viewSettings();
  } catch (e) { console.error(e); alertBox('Erreur : ' + e.message); }
  location.hash = '#/';
}

/* ---------- Accueil ---------- */
function viewHome() {
  const n = (cat, list) => state.items.filter(i => i.cat === cat && i.list === list).length;
  const tile = (href, icon, label, count) => `<a class="tile" href="${href}"><span class="ti">${icon}</span><span class="tl">${label}</span><span class="tc">${count}</span></a>`;
  page({
    title: 'Ma Collection',
    right: '<a href="#/reglages" aria-label="Réglages" class="gear">⚙︎</a>',
    fab: '#/ajouter',
    body: `<div class="tiles">
      ${OWN_CATS.map(c => tile(`#/liste/${c}`, CATS[c].icon, CATS[c].label, n(c, 'possede'))).join('')}
      ${tile('#/backlog', '🕹️', 'Backlog JV', state.items.filter(i => i.backlog && i.cat === 'jeu' && i.list === 'possede').length)}
      ${tile('#/cinema', CATS.cinema.icon, 'Mon cinéma', n('cinema', 'vu'))}
      ${tile('#/envies/film', '✨', 'Mes envies', state.items.filter(i => i.list === 'envie').length)}
    </div>`,
  });
}

/* ---------- Choix d'ajout (+) ---------- */
function viewAdd(step) {
  const btn = (href, icon, label) => `<a class="choice" href="${href}"><span>${icon}</span>${label}</a>`;
  if (step === 'collection' || step === 'envie') {
    const cats = step === 'collection' ? OWN_CATS : WISH_CATS;
    page({
      title: step === 'collection' ? 'Ajouter à ma collection' : 'Ajouter une envie', back: '#/ajouter',
      body: `<div class="choices">${cats.map(c => btn(`#/nouveau/${step === 'collection' ? 'possede' : 'envie'}/${c}`, CATS[c].icon, c === 'cinema' ? 'Film à voir au ciné' : CATS[c].short)).join('')}</div>`,
    });
    return;
  }
  page({
    title: 'Ajouter', back: '#/',
    body: `<div class="choices big">
      ${btn('#/ajouter/collection', '📦', 'Collection')}
      ${btn('#/ajouter/envie', '✨', 'Envie')}
      ${btn('#/nouveau/vu/cinema', '🎟️', 'Cinéma')}
      ${btn('#/backlog/ajouter', '🕹️', 'Backlog JV')}
    </div>`,
  });
}

/* ---------- Liste des possessions ---------- */
function viewList(cat) {
  const f = state.filters[cat] ||= { q: '', genre: '', support: '', console: '' };
  const items = state.items.filter(i => i.cat === cat && i.list === 'possede');
  const usedGenres = [...new Set(items.flatMap(i => i.genres || []))].sort(coll.compare);
  const sel = (key, label, opts) => `<select class="inp" data-f="${key}"><option value="">${label}</option>${opts.map(o => `<option ${f[key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  page({
    title: CATS[cat].label, back: '#/', fab: `#/nouveau/possede/${cat}`,
    body: `<div class="filters">
        <input class="inp" type="search" placeholder="${cat === 'amiibo' ? 'Rechercher un nom ou un numéro…' : 'Rechercher un titre…'}" data-f="q" value="${esc(f.q)}">
        <div class="frow">
          ${hasGenre(cat) ? sel('genre', 'Tous genres', usedGenres) : ''}
          ${hasSupport(cat) ? sel('support', 'Tous supports', supportsFor(cat).map(s => s.name)) : ''}
          ${cat === 'jeu' ? sel('console', 'Toutes consoles', state.refs.consoles) : ''}
        </div>
      </div>
      <div id="res"></div>`,
  });
  const draw = () => {
    const q = norm(f.q);
    const list = items.filter(i =>
      (!q || norm(i.title).includes(q) || (cat === 'amiibo' && String(i.number) === q)) &&
      (!f.genre || (i.genres || []).includes(f.genre)) &&
      (!f.support || i.support === f.support) &&
      (!f.console || i.console === f.console)
    ).sort((a, b) => coll.compare(a.title, b.title) || coll.compare(prefix(a), prefix(b)));
    const badge = i => (i.borrowed ? '<span class="badge alt">Emprunté</span>' : i.loaned ? '<span class="badge">Prêté</span>' : '');
    $('#res').innerHTML = `<p class="count">${list.length} ${list.length > 1 ? 'résultats' : 'résultat'}</p>` +
      (list.length ? `<div class="rows">${list.map(i => `
        <a class="row" href="#/fiche/${i.id}">
          <span class="rt">${prefix(i) ? `<span class="pre">${esc(prefix(i))}</span> ` : ''}${esc(i.title)}</span>
          ${cat === 'livre' ? `<span class="rm">${esc(i.support)}</span>` : ''}
          ${badge(i)}
        </a>`).join('')}</div>` : `<p class="empty">Rien à afficher.</p>`);
  };
  $$('[data-f]').forEach(el => el.addEventListener('input', () => { f[el.dataset.f] = el.value; draw(); }));
  draw();
}

/* ---------- Backlog JV ---------- */
function viewBacklog(pick) {
  const f = state.filters[pick ? 'blpick' : 'backlog'] ||= { q: '', console: '' };
  const games = state.items.filter(i => i.cat === 'jeu' && i.list === 'possede' && (pick ? !i.backlog : i.backlog));
  page({
    title: pick ? 'Ajouter au backlog' : 'Backlog JV', back: pick ? '#/backlog' : '#/', fab: pick ? null : '#/backlog/ajouter',
    body: `<div class="filters">
        <input class="inp" type="search" placeholder="Rechercher un titre…" id="bq" value="${esc(f.q)}">
        <div class="frow"><select class="inp" id="bc"><option value="">Toutes consoles</option>${state.refs.consoles.map(c => `<option ${f.console === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      </div>
      ${pick ? '<p class="muted small">Touche un jeu de ta collection pour l\'ajouter au backlog.</p>' : ''}
      <div id="res"></div>`,
  });
  const draw = () => {
    const q = norm(f.q);
    const list = games.filter(i => (!q || norm(i.title).includes(q)) && (!f.console || i.console === f.console))
      .sort((a, b) => coll.compare(a.title, b.title) || coll.compare(prefix(a), prefix(b)));
    const badge = i => (i.borrowed ? '<span class="badge alt">Emprunté</span>' : i.loaned ? '<span class="badge">Prêté</span>' : '');
    $('#res').innerHTML = `<p class="count">${list.length} jeu${list.length > 1 ? 'x' : ''}</p>` + (list.length ? `<div class="rows">${list.map(i => `
      <a class="row" ${pick ? `data-add="${i.id}"` : `href="#/fiche/${i.id}"`}>
        <span class="rt"><span class="pre">${esc(prefix(i))}</span> ${esc(i.title)}</span>${badge(i)}${pick ? '<span class="addic">＋</span>' : ''}
      </a>`).join('')}</div>` : `<p class="empty">${pick ? 'Aucun jeu à ajouter.' : 'Ton backlog est vide. Touche + pour y ajouter des jeux.'}</p>`);
  };
  if (pick) $('#res').addEventListener('click', async e => {
    const r = e.target.closest('[data-add]'); if (!r) return;
    const it = getItem(r.dataset.add); it.backlog = true; await saveItem(it);
    games.splice(games.indexOf(it), 1); toast(`« ${it.title} » ajouté au backlog`); draw();
  });
  $('#bq').addEventListener('input', e => { f.q = e.target.value; draw(); });
  $('#bc').addEventListener('change', e => { f.console = e.target.value; draw(); });
  draw();
}

/* ---------- Envies ---------- */
function viewWishes(cat) {
  const list = state.items.filter(i => i.cat === cat && i.list === 'envie').sort(wishSort);
  const tabs = WISH_CATS.map(c => `<a class="tab ${c === cat ? 'on' : ''}" href="#/envies/${c}">${CATS[c].short}</a>`).join('');
  page({
    title: 'Mes envies', back: '#/', fab: `#/nouveau/envie/${cat}`,
    body: `<nav class="tabs">${tabs}</nav>
      ${list.length ? `<div class="rows">${list.map(i => `
        <a class="row" href="#/fiche/${i.id}">
          <span class="rt">${esc(i.title)}
            <small>${[cat === 'amiibo' ? 'N° ' + i.number : '', cat === 'jeu' ? i.console : '', hasSupport(cat) ? i.support : ''].filter(Boolean).map(esc).join(' · ')}</small></span>
          <span class="rm">${i.release ? fmtDate(i.release) : 'N.C.'}</span>
        </a>`).join('')}</div>` : '<p class="empty">Aucune envie dans cette catégorie.</p>'}`,
  });
}

/* ---------- Cinéma ---------- */
function cineYears() {
  const ys = new Set(state.items.filter(i => i.cat === 'cinema' && i.list === 'vu' && i.seenDate).map(i => i.seenDate.slice(0, 4)));
  ys.add(today().slice(0, 4));
  return [...ys].sort().reverse();
}
function seenFilter(year, month) {
  return state.items.filter(i => i.cat === 'cinema' && i.list === 'vu' &&
    (!year || (i.seenDate || '').slice(0, 4) === year) &&
    (!month || (i.seenDate || '').slice(5, 7) === month));
}
const monthOpts = sel => MONTHS.map((m, k) => { const v = String(k + 1).padStart(2, '0'); return `<option value="${v}" ${sel === v ? 'selected' : ''}>${m}</option>`; }).join('');

function viewCinema() {
  const f = state.cineFilter;
  page({
    title: 'Mon cinéma', back: '#/', fab: '#/nouveau/vu/cinema',
    body: `<div class="filters"><div class="frow">
        <select class="inp" id="cy"><option value="">Toutes les années</option>${cineYears().map(y => `<option ${f.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <select class="inp" id="cm" ${f.year ? '' : 'disabled'}><option value="">Tous les mois</option>${monthOpts(f.month)}</select>
      </div>
      <a class="btn primary block" href="#/cinema/image">🖼️ Créer l'image des affiches</a></div>
      <div id="res"></div>`,
  });
  const draw = () => {
    const list = seenFilter(f.year, f.month).sort((a, b) => (b.seenDate || '').localeCompare(a.seenDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    $('#res').innerHTML = `<p class="count">${list.length} film${list.length > 1 ? 's' : ''}</p>` + (list.length ? `<div class="rows">${list.map(i => `
      <a class="row cine" href="#/fiche/${i.id}">
        <span class="thumb" data-poster="${i.id}"></span>
        <span class="rt">${esc(i.title)}<small>${fmtDate(i.seenDate)}</small>${starsHtml(i.rating, 'sm')}</span>
      </a>`).join('')}</div>` : '<p class="empty">Aucun film sur cette période.</p>');
    $$('[data-poster]').forEach(async el => { const u = await posterUrl(el.dataset.poster); if (u) el.style.backgroundImage = `url("${u}")`; else el.textContent = '🎬'; });
  };
  $('#cy').addEventListener('change', e => { f.year = e.target.value; if (!f.year) f.month = ''; $('#cm').disabled = !f.year; if (!f.year) $('#cm').value = ''; draw(); });
  $('#cm').addEventListener('change', e => { f.month = e.target.value; draw(); });
  draw();
}

/* ---------- Fiche ---------- */
async function viewDetail(id) {
  const it = getItem(id);
  if (!it) { location.hash = '#/'; return; }
  const row = (k, v) => `<div class="fr"><span class="fk">${k}</span><span class="fv">${v}</span></div>`;
  let h = '';
  if (it.list === 'vu') {
    h += `<div class="poster-big" id="pb"></div>`;
    h += row('Vu le', esc(fmtDate(it.seenDate)));
    h += row('Note', `${starsHtml(it.rating)} <span class="muted">${fmtRating(it.rating)}</span>`);
    if (it.genres?.length) h += row('Genres', chips(it.genres));
  } else if (it.list === 'envie') {
    if (it.cat === 'amiibo') h += row('Numéro', esc(it.number));
    if (it.cat === 'jeu') h += row('Console', esc(it.console));
    if (hasSupport(it.cat)) h += row('Support', esc(it.support));
    h += row('Date de sortie', it.release ? esc(fmtDate(it.release)) : 'N.C.');
  } else {
    if (it.cat === 'amiibo') h += row('Numéro', esc(it.number));
    if (hasGenre(it.cat)) h += row('Genres', chips(it.genres || []));
    if (it.cat === 'jeu') h += row('Console', esc(it.console));
    if (hasSupport(it.cat)) h += row('Support', esc(it.support));
    if (it.cat === 'film' && it.duration) h += row('Durée', esc(fmtDuration(it.duration)));
    if (it.cat === 'livre' && it.pages) h += row('Pages', esc(it.pages));
    if (it.acquired) h += row(it.cat === 'amiibo' ? "Date d'ajout" : "Date d'acquisition", esc(fmtDate(it.acquired)));
    if (it.location) h += row('Emplacement', esc(it.location));
    if (it.borrowed) {
      h += row("On me l'a prêté", 'Oui');
      if (it.borrowedDate) h += row('Depuis le', esc(fmtDate(it.borrowedDate)));
    }
    if (it.loaned) {
      h += row('Prêté', 'Oui');
      if (it.loanedTo) h += row('Prêté à', esc(it.loanedTo));
      if (it.loanDate) h += row('Date du prêt', esc(fmtDate(it.loanDate)));
    }
  }
  const blBtn = it.cat === 'jeu' && it.list === 'possede' ? `<button class="btn ghost block" id="bl">${it.backlog ? '➖ Retirer du backlog' : '🕹️ Ajouter au backlog'}</button>` : '';
  const convert = it.list === 'envie' ? `<a class="btn primary block" href="#/edition/${it.id}/convertir">${it.cat === 'cinema' ? '✅ Je l\'ai vu' : '✅ Ajouter à ma collection'}</a>` : '';
  const sub = it.list === 'possede' ? CATS[it.cat].short : it.list === 'envie' ? 'Envie · ' + CATS[it.cat].short : 'Vu au cinéma';
  page({
    title: '', back: backOf(it),
    right: `<a href="#/edition/${it.id}" class="hlink">Modifier</a>`,
    body: `<p class="kicker">${esc(sub)}</p><h2 class="title">${esc(it.title)}</h2>
      <div class="fiche">${h}</div>
      <div class="actions">${convert}${blBtn}
        <button class="btn danger-ghost block" id="del">Supprimer</button></div>`,
  });
  if (it.list === 'vu') { const u = await posterUrl(it.id); $('#pb').innerHTML = u ? `<img src="${u}" alt="">` : '<div class="noposter">Pas d\'affiche</div>'; }
  if ($('#bl')) $('#bl').onclick = async () => { it.backlog = !it.backlog; await saveItem(it); toast(it.backlog ? 'Ajouté au backlog' : 'Retiré du backlog'); viewDetail(it.id); };
  $('#del').onclick = async () => {
    const msg = it.list === 'envie' ? `Retirer « ${it.title} » de mes envies ?` : `Supprimer définitivement « ${it.title} » ?`;
    if (await confirmBox(msg)) { await deleteItem(it.id); toast('Supprimé'); location.hash = backOf(it); }
  };
}
const chips = gs => `<span class="chips">${gs.map(g => `<span class="chip">${esc(g)}</span>`).join('')}</span>`;
const fmtDuration = m => { m = +m; const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h ${String(r).padStart(2, '0')}` : `${r} min`; };

/* ---------- Formulaire (création / édition / conversion) ---------- */
async function viewForm(existing, convert, listArg, catArg) {
  if (existing === undefined) { location.hash = '#/'; return; }
  const isNew = !existing;
  const it = existing ? structuredClone(existing) : { id: uid(), cat: catArg, list: listArg, createdAt: new Date().toISOString(), genres: [] };
  if (isNew && (!CATS[it.cat] || !['possede', 'envie', 'vu'].includes(it.list))) { location.hash = '#/'; return; }
  const target = convert ? (it.cat === 'cinema' ? 'vu' : 'possede') : it.list;
  const cat = it.cat;
  const genres = new Set(it.genres || []);
  let rating = it.rating || 0;
  let poster = undefined; // undefined = inchangé, null = supprimé, Blob = nouveau
  if (target === 'vu' && !it.seenDate) it.seenDate = today();

  const title = convert ? (target === 'vu' ? 'Marquer comme vu' : 'Ajouter à ma collection')
    : (isNew ? (target === 'envie' ? 'Nouvelle envie' : target === 'vu' ? 'Film vu au cinéma' : 'Nouveau ' + CATS[cat].one) : 'Modifier');

  const field = (label, inner, req = false) => `<label class="fld"><span class="lbl">${label}${req ? ' <b>*</b>' : ''}</span>${inner}</label>`;
  const opt = (arr, cur) => arr.map(o => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('');
  let h = field(cat === 'amiibo' ? 'Nom' : 'Titre', `<input class="inp" name="title" value="${esc(it.title)}" autocomplete="off" required>`, true);
  if (cat === 'amiibo') h += field('Numéro', `<input class="inp" name="number" inputmode="numeric" value="${esc(it.number)}" autocomplete="off">`, true);

  if (target === 'vu') {
    h += field('Date de visionnage', `<input class="inp" type="date" name="seenDate" value="${esc(it.seenDate)}">`, true);
    h += `<div class="fld"><span class="lbl">Note</span><div class="rate">${starsHtml(rating, 'lg')}<span class="muted" id="rv">${fmtRating(rating)}</span><button type="button" class="link" id="rclr">Effacer</button></div></div>`;
    h += `<div class="fld"><span class="lbl">Affiche</span><div class="poster-edit"><div class="poster-prev" id="pp"></div>
      <div class="pbtns"><label class="btn ghost">Choisir une image<input type="file" accept="image/*" id="pf" hidden></label>
      <button type="button" class="btn danger-ghost" id="prm">Retirer</button></div></div></div>`;
  }
  if (target !== 'envie' && hasGenre(cat)) {
    h += `<div class="fld"><span class="lbl">Genres${target === 'possede' ? ' <b>*</b>' : ''}</span><div id="gp"></div></div>`;
  }
  if (cat === 'jeu') {
    h += field('Console', `<select class="inp" name="console"><option value="">— Choisir —</option>${opt(state.refs.consoles, it.console)}<option value="__new">+ Nouvelle console…</option></select>`, true);
  }
  if (hasSupport(cat)) {
    h += field('Support', `<select class="inp" name="support"><option value="">— Choisir —</option>${opt(supportsFor(cat).map(s => s.name), it.support)}<option value="__new">+ Nouveau support…</option></select>`, true);
  }
  if (target === 'envie') {
    const r = it.release || '';
    const mode = r.length === 10 ? 'date' : r.length === 4 ? 'year' : 'none';
    h += `<div class="fld"><span class="lbl">Date de sortie</span>
      <div class="seg" id="rmode">${[['none', 'Inconnue'], ['year', 'Année'], ['date', 'Date']].map(([k, l]) => `<button type="button" data-m="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input class="inp" type="number" inputmode="numeric" name="ryear" placeholder="AAAA" min="1900" max="2100" value="${mode === 'year' ? r : ''}" ${mode === 'year' ? '' : 'hidden'}>
      <input class="inp" type="date" name="rdate" value="${mode === 'date' ? r : ''}" ${mode === 'date' ? '' : 'hidden'}></div>`;
  }
  if (target === 'possede') {
    if (cat === 'film') h += field('Durée (minutes)', `<input class="inp" type="number" inputmode="numeric" name="duration" min="1" value="${esc(it.duration)}">`);
    if (cat === 'livre') h += field('Nombre de pages', `<input class="inp" type="number" inputmode="numeric" name="pages" min="1" value="${esc(it.pages)}">`);
    h += field(cat === 'amiibo' ? "Date d'ajout" : "Date d'acquisition", `<input class="inp" type="date" name="acquired" value="${esc(it.acquired)}">`);
    h += field('Emplacement', `<input class="inp" name="location" value="${esc(it.location)}" autocomplete="off">`);
    h += `<label class="fld check"><input type="checkbox" name="borrowed" ${it.borrowed ? 'checked' : ''}> <span>On me l'a prêté</span></label>
      <div id="borrowbox" ${it.borrowed ? '' : 'hidden'}>
        ${field("Date à laquelle on me l'a prêté", `<input class="inp" type="date" name="borrowedDate" value="${esc(it.borrowedDate)}">`)}
      </div>
      <label class="fld check" id="loanchk" ${it.borrowed ? 'hidden' : ''}><input type="checkbox" name="loaned" ${it.loaned && !it.borrowed ? 'checked' : ''}> <span>Je l'ai prêté</span></label>
      <div id="loanbox" ${it.loaned ? '' : 'hidden'}>
        ${field('Prêté à', `<input class="inp" name="loanedTo" value="${esc(it.loanedTo)}" autocomplete="off">`)}
        ${field('Date du prêt', `<input class="inp" type="date" name="loanDate" value="${esc(it.loanDate)}">`)}
      </div>`;
  }

  page({
    title, back: isNew ? (target === 'possede' ? `#/liste/${cat}` : target === 'envie' ? `#/envies/${cat}` : '#/cinema') : `#/fiche/${it.id}`,
    body: `<form id="frm" class="form" novalidate>${h}<p class="muted small"><b>*</b> obligatoire</p>
      <button class="btn primary block" type="submit">Enregistrer</button></form>`,
  });
  const frm = $('#frm');

  // Genres
  if ($('#gp')) genrePicker($('#gp'), cat, genres);

  // Ajout d'un nouveau support / console depuis la liste
  const addFromSelect = (name, kind) => {
    const s = frm.elements[name];
    if (!s) return;
    let prev = s.value;
    s.addEventListener('change', async () => {
      if (s.value !== '__new') { prev = s.value; return; }
      const v = await promptBox(kind === 'console' ? 'Nouvelle console' : 'Nouveau support');
      if (!v) { s.value = prev; return; }
      if (kind === 'console') {
        if (!state.refs.consoles.some(c => norm(c) === norm(v))) state.refs.consoles.push(v);
      } else {
        const ex = state.refs.supports.find(x => norm(x.name) === norm(v));
        if (ex) { if (!ex.cats.includes(cat)) ex.cats.push(cat); } else state.refs.supports.push({ name: v, cats: [cat] });
      }
      await saveRefs();
      const realName = kind === 'console' ? state.refs.consoles.find(c => norm(c) === norm(v)) : state.refs.supports.find(x => norm(x.name) === norm(v)).name;
      if (![...s.options].some(o => o.value === realName)) s.querySelector('[value="__new"]').insertAdjacentHTML('beforebegin', `<option>${esc(realName)}</option>`);
      s.value = prev = realName;
    });
  };
  addFromSelect('console', 'console');
  addFromSelect('support', 'support');

  // Date de sortie
  if ($('#rmode')) {
    let mode = $('#rmode .on').dataset.m;
    $('#rmode').addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      mode = b.dataset.m;
      $$('#rmode button').forEach(x => x.classList.toggle('on', x === b));
      frm.elements.ryear.hidden = mode !== 'year';
      frm.elements.rdate.hidden = mode !== 'date';
    });
    frm._rmode = () => mode;
  }
  // Prêt
  if (frm.elements.loaned) frm.elements.loaned.addEventListener('change', e => { $('#loanbox').hidden = !e.target.checked; });
  if (frm.elements.borrowed) frm.elements.borrowed.addEventListener('change', e => {
    const b = e.target.checked;
    $('#borrowbox').hidden = !b; $('#loanchk').hidden = b;
    if (b) { frm.elements.loaned.checked = false; $('#loanbox').hidden = true; }
  });

  // Note
  if ($('.rate')) {
    const setR = v => { rating = v; $('.rate .stars').outerHTML = starsHtml(rating, 'lg'); $('#rv').textContent = fmtRating(rating); };
    $('.rate').addEventListener('click', e => {
      const st = e.target.closest('.st'); if (!st) return;
      const idx = $$('.rate .st').indexOf(st);
      const r = st.getBoundingClientRect();
      const v = idx + (e.clientX - r.left < r.width / 2 ? 0.5 : 1);
      setR(v === rating ? 0 : v);
    });
    $('#rclr').onclick = () => setR(0);
  }
  // Affiche
  if ($('#pp')) {
    const show = u => { $('#pp').innerHTML = u ? `<img src="${u}" alt="">` : '<span>Aucune</span>'; $('#prm').hidden = !u; };
    show(isNew ? null : await posterUrl(it.id));
    $('#pf').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { poster = await resizeImage(f); show(URL.createObjectURL(poster)); } catch (err) { alertBox("Impossible de lire l'image."); }
    });
    $('#prm').onclick = () => { poster = null; show(null); };
  }

  frm.addEventListener('submit', async e => {
    e.preventDefault();
    const E = frm.elements, val = n => (E[n] ? E[n].value.trim() : '');
    const errs = [];
    const t = val('title');
    if (!t) errs.push(cat === 'amiibo' ? 'le nom' : 'le titre');
    if (cat === 'amiibo' && !val('number')) errs.push('le numéro');
    if (cat === 'jeu' && (!val('console') || val('console') === '__new')) errs.push('la console');
    if (hasSupport(cat) && (!val('support') || val('support') === '__new')) errs.push('le support');
    if (target === 'possede' && hasGenre(cat) && genres.size === 0) errs.push('au moins un genre');
    if (target === 'vu' && !val('seenDate')) errs.push('la date de visionnage');
    let release = '';
    if (target === 'envie' && frm._rmode) {
      const m = frm._rmode();
      if (m === 'year') { release = val('ryear'); if (!/^\d{4}$/.test(release)) errs.push("l'année de sortie (4 chiffres)"); }
      if (m === 'date') { release = val('rdate'); if (!release) errs.push('la date de sortie'); }
    }
    if (errs.length) { alertBox('Merci de renseigner : ' + errs.join(', ') + '.'); return; }

    it.title = t;
    it.list = target;
    if (cat === 'amiibo') it.number = val('number');
    if (cat === 'jeu') it.console = val('console');
    if (hasSupport(cat)) it.support = val('support');
    if ($('#gp')) it.genres = [...genres].sort(coll.compare);
    if (target === 'envie') it.release = release;
    if (target === 'vu') { it.seenDate = val('seenDate'); it.rating = rating; }
    if (target === 'possede') {
      for (const k of ['acquired', 'location', 'loanedTo', 'loanDate']) it[k] = val(k);
      if (cat === 'film') it.duration = val('duration') ? +val('duration') : '';
      if (cat === 'livre') it.pages = val('pages') ? +val('pages') : '';
      it.borrowed = E.borrowed.checked;
      it.borrowedDate = it.borrowed ? val('borrowedDate') : '';
      it.loaned = !it.borrowed && E.loaned.checked;
      if (!it.loaned) { it.loanedTo = ''; it.loanDate = ''; }
    }
    if (poster !== undefined) {
      if (poster) await DB.put('posters', poster, it.id); else await DB.del('posters', it.id);
      dropPosterUrl(it.id);
    }
    await saveItem(it);
    toast(convert ? (target === 'vu' ? 'Ajouté à Mon cinéma' : 'Ajouté à ma collection') : 'Enregistré');
    location.hash = isNew ? backOf(it) : `#/fiche/${it.id}`;
  });
}

function genrePicker(root, cat, selected) {
  root.innerHTML = `<div class="gsel" id="gsel"></div>
    <input class="inp" type="search" placeholder="Filtrer les genres…" id="gq" autocomplete="off">
    <div class="gall" id="gall"></div>
    <button type="button" class="btn ghost small" id="gnew">+ Nouveau genre</button>`;
  const draw = () => {
    const q = norm($('#gq', root).value);
    $('#gsel', root).innerHTML = selected.size ? [...selected].sort(coll.compare).map(g => `<button type="button" class="chip on" data-g="${esc(g)}">${esc(g)} ✕</button>`).join('') : '<span class="muted small">Aucun genre sélectionné</span>';
    $('#gall', root).innerHTML = genresFor(cat).filter(g => !selected.has(g.name) && (!q || norm(g.name).includes(q)))
      .map(g => `<button type="button" class="chip" data-g="${esc(g.name)}">${esc(g.name)}</button>`).join('') || '<span class="muted small">Aucun genre ne correspond</span>';
  };
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-g]');
    if (b) { const g = b.dataset.g; selected.has(g) ? selected.delete(g) : selected.add(g); draw(); return; }
    if (e.target.id === 'gnew') {
      const v = await promptBox('Nouveau genre', $('#gq', root).value.trim());
      if (!v) return;
      const gc = gcat(cat);
      let ex = state.refs.genres.find(x => norm(x.name) === norm(v));
      if (ex) { if (!ex.cats.includes(gc)) ex.cats.push(gc); } else { ex = { name: v, cats: [gc] }; state.refs.genres.push(ex); }
      await saveRefs();
      selected.add(ex.name);
      $('#gq', root).value = '';
      draw();
    }
  });
  $('#gq', root).addEventListener('input', draw);
  draw();
}

/* ================= Images ================= */
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function resizeImage(file, maxW = 600, maxH = 900) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const s = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}

function drawStar(ctx, cx, cy, R, fill, empty) {
  const path = () => {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? R * 0.45 : R, a = -Math.PI / 2 + k * Math.PI / 5;
      ctx[k ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  };
  path(); ctx.fillStyle = '#3a3a44'; ctx.fill();
  if (fill > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(cx - R, cy - R, 2 * R * fill, 2 * R); ctx.clip();
    path(); ctx.fillStyle = '#f5c518'; ctx.fill(); ctx.restore();
  }
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(/\s+/); let line = '', lines = [];
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  lines = lines.slice(0, 6);
  const y0 = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, k) => ctx.fillText(l, x, y0 + k * lh));
}

async function buildRecap(films, withStars) {
  const n = films.length, cols = Math.min(5, n), rows = Math.ceil(n / cols);
  let pw = 360, ph = 540, gap = 24, sh = withStars ? 70 : 0;
  let W = cols * pw + (cols + 1) * gap, H = rows * (ph + sh + gap) + gap;
  // Limites de taille des canvas sur iOS (~16,7 Mpx)
  const k = Math.min(1, Math.sqrt(16e6 / (W * H)), 16000 / H);
  if (k < 1) { pw *= k; ph *= k; gap *= k; sh *= k; W = Math.floor(W * k); H = Math.floor(H * k); }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#121218'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const f = films[i], col = i % cols, row = Math.floor(i / cols);
    const x = gap + col * (pw + gap), y = gap + row * (ph + sh + gap);
    if (withStars) {
      const R = sh * 0.32, step = R * 2.3, x0 = x + pw / 2 - step * 2;
      for (let s = 0; s < 5; s++) drawStar(ctx, x0 + s * step, y + sh / 2 - gap * 0.15, R, Math.max(0, Math.min(1, (f.rating || 0) - s)));
    }
    const py = y + sh;
    const blob = await DB.get('posters', f.id);
    if (blob) {
      const u = URL.createObjectURL(blob);
      try {
        const img = await loadImg(u);
        const r = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
        const sw = pw / r, shh = ph / r;
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - shh) / 2, sw, shh, x, py, pw, ph);
      } finally { URL.revokeObjectURL(u); }
    } else {
      ctx.fillStyle = '#26262f'; ctx.fillRect(x, py, pw, ph);
      ctx.fillStyle = '#e8e8ee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(pw / 11)}px -apple-system, system-ui, sans-serif`;
      wrapText(ctx, f.title, x + pw / 2, py + ph / 2, pw * 0.85, pw / 9);
    }
  }
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
}

function viewImage() {
  const ys = cineYears();
  const f = state.cineFilter;
  page({
    title: 'Image des affiches', back: '#/cinema',
    body: `<div class="form">
      <label class="fld"><span class="lbl">Année <b>*</b></span><select class="inp" id="iy">${ys.map(y => `<option ${(f.year || ys[0]) === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <label class="fld"><span class="lbl">Mois</span><select class="inp" id="im"><option value="">Toute l'année</option>${monthOpts(f.month)}</select></label>
      <label class="fld check"><input type="checkbox" id="is" checked> <span>Afficher les étoiles</span></label>
      <button class="btn primary block" id="gen">Générer l'image</button>
      <div id="out"></div></div>`,
  });
  let file = null;
  $('#gen').onclick = async () => {
    const y = $('#iy').value, m = $('#im').value;
    const films = seenFilter(y, m).sort((a, b) => (a.seenDate || '').localeCompare(b.seenDate || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (!films.length) { $('#out').innerHTML = '<p class="empty">Aucun film vu sur cette période.</p>'; return; }
    $('#out').innerHTML = '<p class="muted">Génération en cours…</p>';
    const blob = await buildRecap(films, $('#is').checked);
    const name = `cinema-${y}${m ? '-' + m : ''}.jpg`;
    file = new File([blob], name, { type: 'image/jpeg' });
    const u = URL.createObjectURL(blob);
    $('#out').innerHTML = `<p class="muted">${films.length} film${films.length > 1 ? 's' : ''} · ${m ? MONTHS[+m - 1] + ' ' : ''}${y}</p>
      <img class="recap" src="${u}" alt="Aperçu">
      <button class="btn primary block" id="save">📥 Enregistrer dans Photos</button>
      <p class="muted small">Dans le menu qui s'ouvre, choisis « Enregistrer l'image ».</p>`;
    $('#save').onclick = () => shareFile(file, u);
  };
}

async function shareFile(file, fallbackUrl) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = fallbackUrl || URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
}

/* ================= Réglages ================= */
function viewSettings() {
  const usage = (kind, name) => state.items.filter(i => (kind === 'genre' ? (i.genres || []).includes(name) : i[kind] === name)).length;
  const usedIn = (kind, name, c) => state.items.some(i => gcat(i.cat) === c && (kind === 'genre' ? (i.genres || []).includes(name) : i[kind] === name));
  const catChips = (kind, idx, cats, all) => all.map(c => `<button type="button" class="chip xs ${cats.includes(c) ? 'on' : ''}" data-tog="${kind}:${idx}:${c}">${CATS[c].short}</button>`).join('');
  const del = (kind, idx, name) => { const u = usage(kind, name); return `<button type="button" class="x" data-del="${kind}:${idx}" ${u ? `disabled title="Utilisé ${u} fois"` : ''}>✕</button>`; };
  const persisted = navigator.storage?.persisted ? '…' : 'non disponible';
  page({
    title: 'Réglages', back: '#/',
    body: `
    <section class="card"><h2 class="sec">Sauvegarde</h2>
      <p class="muted small">Dernier export : ${state.lastExport ? new Date(state.lastExport).toLocaleString('fr-FR') : 'jamais'}</p>
      <button class="btn primary block" id="exp">📤 Exporter mes données</button>
      <label class="btn ghost block">📥 Importer une sauvegarde<input type="file" accept=".json,application/json" id="imp" hidden></label>
      <p class="muted small">Stockage persistant : <span id="pers">${persisted}</span></p>
    </section>
    <section class="card"><h2 class="sec">Supports</h2>
      <div class="refs">${state.refs.supports.map((s, i) => `<div class="ref"><span class="rn">${esc(s.name)}</span><span class="rc">${catChips('support', i, s.cats, SUPPORT_CATS)}</span>${del('support', i, s.name)}</div>`).join('')}</div>
      <div class="addrow"><input class="inp" id="ns" placeholder="Nouveau support"><button class="btn primary" id="ans">Ajouter</button></div>
      <div class="chips" id="nsc">${SUPPORT_CATS.map(c => `<button type="button" class="chip xs" data-c="${c}">${CATS[c].short}</button>`).join('')}</div>
    </section>
    <section class="card"><h2 class="sec">Consoles</h2>
      <div class="refs">${state.refs.consoles.map((c, i) => `<div class="ref"><span class="rn">${esc(c)}</span>${del('console', i, c)}</div>`).join('')}</div>
      <div class="addrow"><input class="inp" id="nc" placeholder="Nouvelle console"><button class="btn primary" id="anc">Ajouter</button></div>
    </section>
    <section class="card"><h2 class="sec">Genres</h2>
      <input class="inp" type="search" id="gf" placeholder="Filtrer…">
      <div class="refs" id="glist">${state.refs.genres.map((g, i) => ({ g, i })).sort((a, b) => coll.compare(a.g.name, b.g.name)).map(({ g, i }) => `<div class="ref" data-n="${esc(norm(g.name))}"><span class="rn">${esc(g.name)}</span><span class="rc">${catChips('genre', i, g.cats, GENRE_CATS)}</span>${del('genre', i, g.name)}</div>`).join('')}</div>
      <div class="addrow"><input class="inp" id="ng" placeholder="Nouveau genre"><button class="btn primary" id="ang">Ajouter</button></div>
      <div class="chips" id="ngc">${GENRE_CATS.map(c => `<button type="button" class="chip xs" data-c="${c}">${CATS[c].short}</button>`).join('')}</div>
    </section>
    <p class="muted small center">Ma Collection · v${APP_VERSION}</p>`,
  });
  navigator.storage?.persisted?.().then(p => { $('#pers').textContent = p ? 'oui' : 'non (pense aux exports)'; });
  const listOf = kind => (kind === 'support' ? state.refs.supports : kind === 'console' ? state.refs.consoles : state.refs.genres);
  $('main.content').addEventListener('click', async e => {
    const t = e.target.closest('[data-tog]');
    if (t) {
      const [kind, idx, c] = t.dataset.tog.split(':');
      const ref = listOf(kind)[+idx];
      if (ref.cats.includes(c)) {
        if (usedIn(kind, ref.name, c)) { alertBox(`« ${ref.name} » est utilisé par des ${CATS[c].short.toLowerCase()}, impossible de le retirer de cette catégorie.`); return; }
        ref.cats = ref.cats.filter(x => x !== c);
      } else ref.cats.push(c);
      await saveRefs(); t.classList.toggle('on');
      return;
    }
    const d = e.target.closest('[data-del]');
    if (d && !d.disabled) {
      const [kind, idx] = d.dataset.del.split(':');
      const arr = listOf(kind), name = kind === 'console' ? arr[+idx] : arr[+idx].name;
      if (await confirmBox(`Supprimer « ${name} » de la liste ?`)) { arr.splice(+idx, 1); await saveRefs(); viewSettings(); }
      return;
    }
    const cc = e.target.closest('#nsc [data-c], #ngc [data-c]');
    if (cc) cc.classList.toggle('on');
  });
  const addRef = async (inputId, chipsId, kind) => {
    const v = $(inputId).value.trim(); if (!v) return;
    const arr = listOf(kind);
    if (arr.some(x => norm(kind === 'console' ? x : x.name) === norm(v))) { alertBox('Cet élément existe déjà.'); return; }
    if (kind === 'console') arr.push(v);
    else {
      const cats = $$(`${chipsId} .on`).map(x => x.dataset.c);
      if (!cats.length) { alertBox('Choisis au moins une catégorie.'); return; }
      arr.push({ name: v, cats });
    }
    await saveRefs(); toast('Ajouté'); viewSettings();
  };
  $('#ans').onclick = () => addRef('#ns', '#nsc', 'support');
  $('#anc').onclick = () => addRef('#nc', null, 'console');
  $('#ang').onclick = () => addRef('#ng', '#ngc', 'genre');
  $('#gf').addEventListener('input', e => { const q = norm(e.target.value); $$('#glist .ref').forEach(r => { r.hidden = q && !r.dataset.n.includes(q); }); });
  $('#exp').onclick = exportData;
  $('#imp').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); });
}

const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
const dataUrlToBlob = async u => (await fetch(u)).blob();

async function exportData() {
  const posters = {};
  for (const id of await DB.keys('posters')) { const b = await DB.get('posters', id); if (b) posters[id] = await blobToDataUrl(b); }
  const data = { app: 'ma-collection', version: 1, exportedAt: new Date().toISOString(), refs: state.refs, items: state.items, posters };
  const file = new File([JSON.stringify(data)], `ma-collection-${today()}.json`, { type: 'application/json' });
  await shareFile(file);
  state.lastExport = data.exportedAt;
  await DB.put('kv', state.lastExport, 'lastExport');
  if (location.hash === '#/reglages') viewSettings();
}

async function importData(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { alertBox('Fichier illisible.'); return; }
  if (data.app !== 'ma-collection' || !Array.isArray(data.items) || !data.refs) { alertBox("Ce fichier n'est pas une sauvegarde Ma Collection."); return; }
  const mode = await chooseBox(`Sauvegarde du ${new Date(data.exportedAt).toLocaleDateString('fr-FR')} : ${data.items.length} éléments.`,
    [['merge', 'Ajouter à mes données', 'primary'], ['replace', 'Tout remplacer', 'danger'], ['', 'Annuler', 'ghost']]);
  if (!mode) return;
  if (mode === 'replace') {
    await DB.clear('items'); await DB.clear('posters');
    await DB.put('kv', data.refs, 'refs');
  } else {
    const R = state.refs, D = data.refs;
    for (const k of ['supports', 'genres']) for (const x of D[k] || []) {
      const e = R[k].find(y => norm(y.name) === norm(x.name));
      if (e) x.cats.forEach(c => { if (!e.cats.includes(c)) e.cats.push(c); }); else R[k].push(x);
    }
    for (const c of D.consoles || []) if (!R.consoles.some(y => norm(y) === norm(c))) R.consoles.push(c);
    await saveRefs();
  }
  let added = 0;
  for (const it of data.items) if (mode === 'replace' || !getItem(it.id)) { await DB.put('items', it); added++; }
  for (const [id, u] of Object.entries(data.posters || {})) if (mode === 'replace' || !(await DB.get('posters', id))) await DB.put('posters', await dataUrlToBlob(u), id);
  state.posterUrls.forEach(u => u && URL.revokeObjectURL(u)); state.posterUrls.clear();
  await loadAll();
  toast(mode === 'replace' ? 'Sauvegarde importée' : `${added} élément${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}`);
  location.hash = '#/';
  render();
}

/* ================= Démarrage ================= */
const APP_VERSION = '1.3.0';
(async () => {
  await DB.open();
  await loadAll();
  navigator.storage?.persist?.();
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had) { had = true; return; }
      const b = document.createElement('div');
      b.className = 'update';
      b.innerHTML = 'Nouvelle version disponible <button class="btn primary small">Recharger</button>';
      b.querySelector('button').onclick = () => location.reload();
      document.body.appendChild(b);
    });
  }
})();
