'use strict';

const ROLES = [
  ['ALL', 'Todos'], ['TOP', 'Top'], ['JUNGLE', 'Jungla'],
  ['MIDDLE', 'Mid'], ['BOTTOM', 'ADC'], ['UTILITY', 'Support'],
];
const ROLE_LABEL = Object.fromEntries(ROLES.map(([k, v]) => [k, v]));

const TIERS = [
  ['CHALLENGER', 'Challenger'], ['GRANDMASTER', 'Grandmaster'], ['MASTER', 'Master'],
  ['DIAMOND', 'Diamante'], ['EMERALD', 'Esmeralda'], ['PLATINUM', 'Platino'],
  ['GOLD', 'Oro'], ['SILVER', 'Plata'], ['BRONZE', 'Bronce'], ['IRON', 'Hierro'],
];
const TIER_LABEL = Object.fromEntries(TIERS.map(([k, v]) => [k, v]));
const TIER_ORDER = Object.fromEntries(TIERS.map(([k], i) => [k, i]));

/* ---- Assets: si están descargados en /assets (scripts/download-assets.mjs)
   se usan en local; si no, se va directo al CDN de origen. checkAssets() lo
   decide al arrancar mirando /assets/manifest.json, así no se inunda la consola
   con 404 cuando aún no se han descargado. ---- */
const ASSET = '/assets';
// Locale de Data Dragon para nombres de items/hechizos/runas. es_MX = español
// de Latinoamérica (cliente de LAS/LAN); debe coincidir con el de los assets
// descargados (scripts/download-assets.mjs --locale).
const DD_LOCALE = 'es_MX';
const DDRAGON_CDN = 'https://ddragon.leagueoflegends.com/cdn';
const CDRAGON_SVG = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg';
const OPGG_MEDALS = 'https://opgg-static.akamaized.net/images/medals_new';
let ASSET_LOCAL = false; // ¿hay assets descargados? (se fija en checkAssets)
const ddBase = () => (ASSET_LOCAL ? `${ASSET}/cdn` : DDRAGON_CDN);
async function checkAssets() {
  try { ASSET_LOCAL = (await fetch(`${ASSET}/manifest.json`, { cache: 'no-store' })).ok; }
  catch { ASSET_LOCAL = false; }
}
const ROLE_KEY = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'utility' };
const ROLE_ORDER = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
const ROLE_TIP = {
  TOP: 'Top — Línea superior. Suelen jugar luchadores y tanques en duelos 1v1.',
  JUNGLE: 'Jungla — Sin línea fija; controla la jungla, hace ganks y objetivos.',
  MIDDLE: 'Mid — Línea central. Magos y asesinos de alto impacto.',
  BOTTOM: 'ADC — Línea inferior. Tirador de daño físico sostenido.',
  UTILITY: 'Support — Acompaña al ADC: protege, inicia y aporta visión.',
};
const TIER_TIP = {
  IRON: 'Hierro — El rango más bajo de la escalera competitiva.',
  BRONZE: 'Bronce — Por encima de Hierro; jugadores en aprendizaje.',
  SILVER: 'Plata — Rango intermedio-bajo, de los más poblados.',
  GOLD: 'Oro — Rango medio; nivel de juego sólido.',
  PLATINUM: 'Platino — Por encima de la media; buena mecánica y macro.',
  EMERALD: 'Esmeralda — Introducido en 2023, entre Platino y Diamante.',
  DIAMOND: 'Diamante — Élite; aproximadamente el top 1-2%.',
  MASTER: 'Maestro — Alto nivel competitivo, sin divisiones.',
  GRANDMASTER: 'Gran Maestro — Por encima de Maestro; los mejores en LP.',
  CHALLENGER: 'Challenger — La cúspide: los mejores del servidor.',
};
const roleIconUrl = (r) => {
  if (!ROLE_KEY[r]) return '';
  return ASSET_LOCAL ? `${ASSET}/roles/position-${ROLE_KEY[r]}.svg` : `${CDRAGON_SVG}/position-${ROLE_KEY[r]}.svg`;
};
const tierEmblemUrl = (t) => {
  const k = String(t).toLowerCase();
  return ASSET_LOCAL ? `${ASSET}/ranks/${k}.png` : `${OPGG_MEDALS}/${k}.png`;
};
const esc = (s) => String(s).replace(/"/g, '&quot;');
function roleIconImg(role, cls) {
  const u = roleIconUrl(role);
  if (!u) return '';
  return `<img class="${cls}" src="${u}" alt="" title="${esc(ROLE_TIP[role] || ROLE_LABEL[role] || role)}">`;
}
function tierEmblemImg(tier, cls) {
  return `<img class="${cls}" src="${tierEmblemUrl(tier)}" alt="" title="${esc(TIER_TIP[tier] || TIER_LABEL[tier] || tier)}">`;
}

const LS = {
  get: (k, d) => { try { return localStorage.getItem('bo:' + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('bo:' + k, v); } catch {} },
};

const $ = (id) => document.getElementById(id);

const state = {
  meta: null,
  rows: [],
  ddVersion: null,
  region: LS.get('region', ''),
  patch: LS.get('patch', 'all'),
  tier: LS.get('tier', 'all'),
  role: LS.get('role', 'ALL'),
  champion: LS.get('champion', 'all'),
  item: null,
  itemOffset: 0,
  page: LS.get('page', 'champions'),
  search: '',
  minGames: Number(LS.get('minGames', '1')),
  minWR: Number(LS.get('minWR', '0')),
  sortKey: LS.get('sortKey', 'games'),
  sortDir: LS.get('sortDir', 'desc') === 'asc' ? 1 : -1,
  statsSortKey: LS.get('statsSortKey', 'games'),
  statsSortDir: LS.get('statsSortDir', 'desc') === 'asc' ? 1 : -1,
  statsPage: null,
  statsRows: [],
  collecting: false,
};

const api = {
  regions: () => fetch('/api/regions').then((r) => r.json()),
  meta: (region) => fetch('/api/meta?region=' + encodeURIComponent(region || '')).then((r) => r.json()),
  champions: (region, patch, tier) =>
    fetch(`/api/champions?region=${encodeURIComponent(region)}&patch=${encodeURIComponent(patch)}&tier=${encodeURIComponent(tier)}`).then((r) => r.json()),
  status: (region) => fetch('/api/status?region=' + encodeURIComponent(region)).then((r) => r.json()),
  stats: (page, region, f) => {
    const qs = `region=${encodeURIComponent(region)}&patch=${encodeURIComponent(f.patch)}` +
      `&tier=${encodeURIComponent(f.tier)}&role=${encodeURIComponent(f.role)}&champion=${encodeURIComponent(f.champion)}`;
    return fetch(`/api/${page}?${qs}`).then((r) => r.json());
  },
  itemGames: (region, item, f, limit, offset) => {
    const qs = `region=${encodeURIComponent(region)}&item=${encodeURIComponent(item)}` +
      `&patch=${encodeURIComponent(f.patch)}&tier=${encodeURIComponent(f.tier)}` +
      `&role=${encodeURIComponent(f.role)}&champion=${encodeURIComponent(f.champion)}` +
      `&limit=${limit}&offset=${offset}`;
    return fetch(`/api/item-games?${qs}`).then((r) => r.json());
  },
  match: (region, matchId) =>
    fetch(`/api/match?region=${encodeURIComponent(region)}&matchId=${encodeURIComponent(matchId)}`).then((r) => r.json()),
};

/* ---- Data Dragon: nombres/iconos de items, hechizos y runas (cache) ---- */
const dd = { loaded: false, items: {}, spells: {}, runes: {} };
/* Carga un JSON del locale actual: primero desde los assets locales (si los
   hay) y, si faltan para ese locale (p.ej. solo se descargó es_ES), cae al CDN
   de Riot. Así DD_LOCALE funciona aunque no se hayan bajado sus assets. */
async function ddFetchLocale(version, file) {
  if (ASSET_LOCAL) {
    const local = await fetch(`${ASSET}/cdn/${version}/data/${DD_LOCALE}/${file}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (local) return local;
  }
  return fetch(`${DDRAGON_CDN}/${version}/data/${DD_LOCALE}/${file}`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
}
async function ddLoad() {
  if (dd.loaded || !state.ddVersion) return;
  const V = state.ddVersion;
  const [items, sums, runes] = await Promise.all([
    ddFetchLocale(V, 'item.json'),
    ddFetchLocale(V, 'summoner.json'),
    ddFetchLocale(V, 'runesReforged.json'),
  ]);
  if (items) for (const [id, it] of Object.entries(items.data)) dd.items[id] = { name: it.name, tags: it.tags || [] };
  if (sums) for (const s of Object.values(sums.data)) dd.spells[s.key] = { name: s.name, id: s.id };
  if (runes) for (const st of runes) {
    dd.runes[st.id] = { name: st.name, icon: st.icon };
    for (const slot of st.slots) for (const r of slot.runes) dd.runes[r.id] = { name: r.name, icon: r.icon };
  }
  dd.loaded = true;
}
const itemIcon = (id) => `${ddBase()}/${state.ddVersion}/img/item/${id}.png`;
const spellIcon = (key) => dd.spells[key] ? `${ddBase()}/${state.ddVersion}/img/spell/${dd.spells[key].id}.png` : '';
const runeIcon = (id) => dd.runes[id] ? `${ddBase()}/img/${dd.runes[id].icon}` : '';
const itemName = (id) => (dd.items[id] && dd.items[id].name) || `Item ${id}`;
const spellName = (key) => (dd.spells[key] && dd.spells[key].name) || `Hechizo ${key}`;
const runeName = (id) => (dd.runes[id] && dd.runes[id].name) || `#${id}`;
const isTrinketOrConsumable = (id) => {
  const t = (dd.items[id] && dd.items[id].tags) || [];
  return t.includes('Trinket') || t.includes('Consumable');
};

function iconUrl(name) {
  return state.ddVersion ? `${ddBase()}/${state.ddVersion}/img/champion/${name}.png` : '';
}
function pct(x) { return (x * 100).toFixed(1); }
function wrClass(w) { return w >= 0.52 ? 'wr-good' : w >= 0.485 ? 'wr-even' : 'wr-bad'; }

/* Red de seguridad: si un asset local concreto falta (descarga parcial),
   redirige esa imagen a su CDN de origen una sola vez. */
function assetToCdn(pathname) {
  if (!pathname || !pathname.startsWith('/assets/')) return null;
  const rest = pathname.slice('/assets/'.length);
  if (rest.startsWith('cdn/')) return `${DDRAGON_CDN}/${rest.slice('cdn/'.length)}`;
  const role = rest.match(/^roles\/(position-[a-z]+\.svg)$/);
  if (role) return `${CDRAGON_SVG}/${role[1]}`;
  const rank = rest.match(/^ranks\/([a-z]+)\.png$/);
  if (rank) return `${OPGG_MEDALS}/${rank[1]}.png`;
  return null;
}
function wireAssetFallback() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.cdnTried) return;
    let cdn = null;
    try { cdn = assetToCdn(new URL(img.src).pathname); } catch { /* src vacío */ }
    if (!cdn) return;             // no es un asset nuestro: deja actuar al onerror inline
    img.dataset.cdnTried = '1';
    e.stopImmediatePropagation(); // da una oportunidad al CDN antes de ocultar
    img.src = cdn;
  }, true);
}

/* ---------------- carga de datos ---------------- */
async function init() {
  await checkAssets();
  wireAssetFallback();
  buildRolePills();

  const reg = await api.regions();
  // selector de servidor (todos) para recolección
  $('cServer').innerHTML = reg.servers
    .map((s) => `<option value="${s.key}">${s.label} (${s.key})</option>`)
    .join('');
  $('cServer').value = LS.get('server', 'la2');

  // restaurar campos del formulario
  $('cKey').value = LS.get('apiKey', '');
  $('cMax').value = LS.get('max', '500');
  $('cPerPlayer').value = LS.get('perPlayer', '15');
  $('cBucket').value = LS.get('bucket', '40');
  buildCollectTiers();

  fillRegionFilter(reg.dataRegions);
  await loadMeta();
  wireEvents();
  if (state.region) loadStatus(state.region);
  if (!['champions', 'items', 'runes', 'spells', 'collect'].includes(state.page)) state.page = 'champions';
  // Sin datos aún: lo único accionable es recolectar, así que abre esa página.
  if (!state.region) state.page = 'collect';
  window.addEventListener('popstate', applyRoute);
  applyRoute(); // pinta según la URL (p.ej. /champ/jhin)
}

function fillRegionFilter(dataRegions) {
  const sel = $('fRegion');
  if (!dataRegions.length) {
    sel.innerHTML = '<option value="">— sin datos —</option>';
    return;
  }
  if (!dataRegions.includes(state.region)) state.region = dataRegions[0];
  sel.innerHTML = dataRegions.map((r) => `<option value="${r}">${r.toUpperCase()}</option>`).join('');
  sel.value = state.region;
}

async function loadMeta() {
  if (!state.region) { state.meta = null; renderMetaLine(); fillPatchFilter([]); fillTierFilter([]); fillChampionList([]); return; }
  state.meta = await api.meta(state.region);
  if (state.meta.region) state.region = state.meta.region;
  state.ddVersion = state.meta.ddragonVersion;
  if (state.patch !== 'all' && !state.meta.patches.includes(state.patch)) state.patch = 'all';
  if (state.champion !== 'all' && !(state.meta.champions || []).includes(state.champion)) {
    state.champion = 'all';
    $('fChampion').value = '';
    if (location.pathname.startsWith('/champ/')) history.replaceState({}, '', '/');
  }
  fillPatchFilter(state.meta.patches);
  fillTierFilter(state.meta.tiers || []);
  fillChampionList(state.meta.champions || []);
  renderMetaLine();
}

function fillPatchFilter(patches) {
  const sel = $('fPatch');
  sel.innerHTML = '<option value="all">Todos</option>' +
    patches.map((p) => `<option value="${p}">${p}</option>`).join('');
  sel.value = state.patch;
}

function renderMetaLine() {
  const m = state.meta;
  $('meta').innerHTML = m && m.region
    ? `<b>${m.region.toUpperCase()}</b> · ${m.totalGames} partidas · ${m.totalParticipants} jugadores · parches: ${m.patches.join(', ') || '—'}`
    : 'Sin datos. Ve a la pestaña Recolección para empezar.';
}

async function loadChampions() {
  if (!state.region) { state.rows = []; renderTable(); return; }
  state.rows = await api.champions(state.region, state.patch, state.tier);
  renderTable();
}

async function loadStatus(region) {
  try {
    const st = await api.status(region);
    showStatus(st);
    if (st.running && !state.collecting) {
      // Hay una recolección en curso (lanzada antes o en otra pestaña): retoma el seguimiento.
      state.collecting = true;
      $('cRun').disabled = true;
      $('cRun').textContent = 'Recolectando…';
      $('progressWrap').hidden = false;
      pollCollect(region);
    }
  } catch {}
}

function showStatus(st) {
  const el = $('collectStatus');
  if (st.running) { el.textContent = 'Recolectando…'; el.className = 'status'; return; }
  if (st.lastError) {
    el.textContent = `⚠ ${st.lastError} · ${st.totalMatches} partidas guardadas (pulsa Recolectar para continuar)`;
    el.className = 'status err';
  } else if (st.lastCollectedAt) {
    el.textContent = `✓ Última actualización: ${new Date(st.lastCollectedAt).toLocaleString()} · ${st.totalMatches} partidas`;
    el.className = 'status ok';
  } else {
    el.textContent = `Sin recolecciones (${st.totalMatches} partidas en disco)`;
    el.className = 'status';
  }
}

/* ---------------- filtros + tabla ---------------- */
function buildRolePills() {
  $('fRoles').innerHTML = ROLES
    .map(([v, l]) => {
      const ic = v === 'ALL' ? '' : roleIconImg(v, 'pill-ic');
      const tip = v === 'ALL' ? 'Todos los roles' : (ROLE_TIP[v] || l);
      return `<span class="pill${state.role === v ? ' on' : ''}" data-role="${v}" title="${esc(tip)}">${ic}${l}</span>`;
    })
    .join('');
}

function buildCollectTiers() {
  const saved = new Set(LS.get('collectTiers', TIERS.map((t) => t[0]).join(',')).split(',').filter(Boolean));
  $('cTiers').innerHTML = TIERS
    .map(([k, l]) => `<span class="tier-pill${saved.has(k) ? ' on' : ''}" data-tier="${k}" title="${esc(TIER_TIP[k] || l)}">${tierEmblemImg(k, 'tier-emb')}</span>`)
    .join('');
  $('cTiers').addEventListener('click', (e) => {
    const pill = e.target.closest('.tier-pill');
    if (!pill) return;
    pill.classList.toggle('on');
    LS.set('collectTiers', selectedCollectTiers().join(','));
  });
}
function selectedCollectTiers() {
  return [...$('cTiers').querySelectorAll('.tier-pill.on')].map((x) => x.dataset.tier);
}

function fillTierFilter(tiers) {
  const ordered = [...tiers].sort((a, b) => (TIER_ORDER[a] ?? 99) - (TIER_ORDER[b] ?? 99));
  if (state.tier !== 'all' && !tiers.includes(state.tier)) state.tier = 'all';
  const all = `<span class="tier-opt${state.tier === 'all' ? ' on' : ''}" data-tier="all" title="Todos los rangos">Todos</span>`;
  $('fTier').innerHTML = all + ordered
    .map((t) => `<span class="tier-opt${state.tier === t ? ' on' : ''}" data-tier="${t}" title="${esc(TIER_TIP[t] || TIER_LABEL[t] || t)}">${tierEmblemImg(t, 'tier-emb')}</span>`)
    .join('');
}

function filteredRows() {
  const q = state.search.trim().toLowerCase();
  const rows = state.rows.filter((r) =>
    (state.role === 'ALL' || r.role === state.role) &&
    r.games >= state.minGames &&
    r.winRate * 100 >= state.minWR &&
    (!q || r.championName.toLowerCase().includes(q)));
  const k = state.sortKey, dir = state.sortDir;
  rows.sort((a, b) => {
    if (k === 'role') return ((ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)) * dir;
    return typeof a[k] === 'string' ? a[k].localeCompare(b[k]) * dir : (a[k] - b[k]) * dir;
  });
  return rows;
}

const COLS = [
  { k: 'championName', label: 'Campeón' },
  { k: 'role', label: 'Rol' },
  { k: 'games', label: 'Juegos' },
  { k: 'winRate', label: 'Win %' },
  { k: 'pickRate', label: 'Pick %' },
  { k: 'banRate', label: 'Ban %' },
];

function renderTable() {
  const rows = filteredRows();
  $('summary').innerHTML = `<b>${rows.length}</b> campeones · parche ${state.patch === 'all' ? 'todos' : state.patch}`;

  const host = $('tableHost');
  if (!state.region) {
    host.innerHTML = '<div class="empty">No hay datos. Ve a la pestaña <b>Recolección</b> para descargar partidas.</div>';
    return;
  }
  if (!rows.length) {
    host.innerHTML = '<div class="empty">Ningún campeón pasa los filtros.</div>';
    return;
  }

  const thead = '<thead><tr>' + COLS.map((c) => {
    const sorted = state.sortKey === c.k ? ' sorted' + (state.sortDir === 1 ? ' asc' : '') : '';
    return `<th class="${sorted}" data-k="${c.k}">${c.label}</th>`;
  }).join('') + '</tr></thead>';

  const body = '<tbody>' + rows.map((r) => `
    <tr>
      <td><a class="champ" href="${champHref(r.championName)}" data-nav-champ="${r.championName}"><img loading="lazy" src="${iconUrl(r.championName)}" alt="" onerror="this.style.visibility='hidden'">
        <span class="champ-name">${r.championName}</span></a></td>
      <td class="role-cell" title="${esc(ROLE_TIP[r.role] || '')}">${roleIconImg(r.role, 'role-ic')}<span>${ROLE_LABEL[r.role] || r.role}</span></td>
      <td class="num">${r.games}</td>
      <td class="num ${wrClass(r.winRate)}">${pct(r.winRate)}</td>
      <td class="num">${pct(r.pickRate)}</td>
      <td class="num">${pct(r.banRate)}</td>
    </tr>`).join('') + '</tbody>';

  host.innerHTML = `<table>${thead}${body}</table>`;
  host.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (state.sortKey === k) state.sortDir *= -1;
    else { state.sortKey = k; state.sortDir = k === 'championName' ? 1 : -1; }
    LS.set('sortKey', state.sortKey);
    LS.set('sortDir', state.sortDir === 1 ? 'asc' : 'desc');
    renderTable();
  }));
}

/* ---------------- páginas items / runas / hechizos ---------------- */
const PAGE_HOST = { items: 'itemsHost', runes: 'runesHost', spells: 'spellsHost' };
const PAGE_SUM = { items: 'itemsSummary', runes: 'runesSummary', spells: 'spellsSummary' };

function fillChampionList(champs) {
  $('championList').innerHTML = champs.map((c) => `<option value="${c}">`).join('');
  $('fChampion').value = state.champion === 'all' ? '' : state.champion;
}

function scopeLabel() {
  const champ = state.champion === 'all' ? 'todos los campeones' : state.champion;
  const role = state.role === 'ALL' ? 'todos los roles' : (ROLE_LABEL[state.role] || state.role);
  const tier = state.tier === 'all' ? 'todos los rangos' : (TIER_LABEL[state.tier] || state.tier);
  return `${champ} · ${role} · ${tier} · parche ${state.patch === 'all' ? 'todos' : state.patch}`;
}

async function loadStats(page) {
  const host = $(PAGE_HOST[page]);
  const sum = $(PAGE_SUM[page]);
  if (!state.region) { host.innerHTML = '<div class="empty">No hay datos. Recolecta primero.</div>'; sum.textContent = ''; return; }
  await ddLoad();
  const f = { patch: state.patch, tier: state.tier, role: state.role, champion: 'all' };
  let rows = await api.stats(page, state.region, f);
  if (page === 'items') rows = rows.filter((r) => !isTrinketOrConsumable(r.item));
  // Nombre legible para poder ordenar la primera columna alfabéticamente.
  for (const r of rows) r._name = STATS_PAGE[page].name(r);
  state.statsPage = page;
  state.statsRows = rows;
  const role = state.role === 'ALL' ? 'todos los roles' : (ROLE_LABEL[state.role] || state.role);
  const tier = state.tier === 'all' ? 'todos los rangos' : (TIER_LABEL[state.tier] || state.tier);
  sum.innerHTML = `<b>${rows.length}</b> entradas · ${role} · ${tier} · parche ${state.patch === 'all' ? 'todos' : state.patch}`;
  if (!rows.length) { host.innerHTML = '<div class="empty">Sin datos para este filtro.</div>'; return; }
  renderStats();
}

function statsTail(r) {
  return `<td class="num">${r.games}</td><td class="num ${wrClass(r.winRate)}">${pct(r.winRate)}</td><td class="num">${pct(r.pickRate)}</td>`;
}
const imgErr = `onerror="this.style.visibility='hidden'"`;

/* Cada página de stats: etiqueta de la 1ª columna, nombre ordenable y celda. */
const STATS_PAGE = {
  items: {
    label: 'Item',
    name: (r) => itemName(r.item),
    cell: (r) => `<a class="cell-ico cell-link" href="/item/${r.item}" data-nav-item="${r.item}"><img loading="lazy" src="${itemIcon(r.item)}" alt="" ${imgErr}><span>${itemName(r.item)}</span></a>`,
  },
  spells: {
    label: 'Hechizos',
    name: (r) => `${spellName(r.spell1)} + ${spellName(r.spell2)}`,
    cell: (r) => `<span class="cell-ico"><span class="ico-pair">
      <img loading="lazy" src="${spellIcon(r.spell1)}" alt="" ${imgErr}>
      <img loading="lazy" src="${spellIcon(r.spell2)}" alt="" ${imgErr}></span>
      <span>${spellName(r.spell1)} + ${spellName(r.spell2)}</span></span>`,
  },
  runes: {
    label: 'Runas',
    name: (r) => runeName(r.keystone),
    cell: (r) => `<span class="cell-ico"><span class="rune-icons">
      <img class="ks" loading="lazy" src="${runeIcon(r.keystone)}" alt="" ${imgErr}>
      <img class="tree" loading="lazy" src="${runeIcon(r.primaryStyle)}" alt="" ${imgErr}>
      <img class="tree" loading="lazy" src="${runeIcon(r.subStyle)}" alt="" ${imgErr}></span>
      <span>${runeName(r.keystone)} <span class="sub">${runeName(r.primaryStyle)} › ${runeName(r.subStyle)}</span></span></span>`,
  },
};

/* Ordena y pinta la tabla de stats activa, con cabeceras clicables como campeones. */
function renderStats() {
  const page = state.statsPage;
  const host = $(PAGE_HOST[page]);
  const cols = [
    { k: '_name', label: STATS_PAGE[page].label },
    { k: 'games', label: 'Juegos' },
    { k: 'winRate', label: 'Win %' },
    { k: 'pickRate', label: 'Pick %' },
  ];
  const k = state.statsSortKey, dir = state.statsSortDir;
  const rows = [...state.statsRows].sort((a, b) =>
    typeof a[k] === 'string' ? a[k].localeCompare(b[k]) * dir : (a[k] - b[k]) * dir);

  const thead = '<thead><tr>' + cols.map((c) => {
    const sorted = state.statsSortKey === c.k ? ' sorted' + (state.statsSortDir === 1 ? ' asc' : '') : '';
    return `<th class="${sorted}" data-k="${c.k}">${c.label}</th>`;
  }).join('') + '</tr></thead>';

  const body = '<tbody>' + rows.map((r) =>
    `<tr><td>${STATS_PAGE[page].cell(r)}</td>${statsTail(r)}</tr>`).join('') + '</tbody>';

  host.innerHTML = `<table>${thead}${body}</table>`;
  host.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
    const key = th.dataset.k;
    if (state.statsSortKey === key) state.statsSortDir *= -1;
    else { state.statsSortKey = key; state.statsSortDir = key === '_name' ? 1 : -1; }
    LS.set('statsSortKey', state.statsSortKey);
    LS.set('statsSortDir', state.statsSortDir === 1 ? 'asc' : 'desc');
    renderStats();
  }));
}

/* Clic en una pestaña: vuelve a la lista (ruta /) y limpia el campeón. */
function switchPage(page) {
  state.page = page;
  LS.set('page', page);
  state.champion = 'all';
  LS.set('champion', 'all');
  state.item = null;
  state.itemOffset = 0;
  $('fChampion').value = '';
  navigate();
}
async function refreshActivePage() {
  if (state.page === 'champions') await loadChampions();
  else await loadStats(state.page);
}

/* Cambia la URL según el estado (ítem => /item/<id>, ficha => /champ/<slug>,
   listas => /) y repinta. El detalle de ítem tiene prioridad. */
function navigate() {
  const url = state.item != null
    ? '/item/' + state.item
    : state.champion !== 'all'
      ? '/champ/' + encodeURIComponent(state.champion.toLowerCase())
      : '/';
  if (location.pathname !== url) history.pushState({}, '', url);
  showView();
}

/* Lee la URL actual y ajusta el estado (al cargar y en atrás/adelante). */
function applyRoute() {
  const mi = location.pathname.match(/^\/item\/(\d+)\/?$/);
  state.item = mi ? Number(mi[1]) : null;
  if (!state.item) {
    const m = location.pathname.match(/^\/champ\/([^/]+)\/?$/);
    let champ = 'all';
    if (m) {
      const slug = decodeURIComponent(m[1]).toLowerCase();
      champ = (state.meta && state.meta.champions || []).find((c) => c.toLowerCase() === slug) || 'all';
    }
    state.champion = champ;
    $('fChampion').value = champ === 'all' ? '' : champ;
    LS.set('champion', state.champion);
  }
  showView();
}

/* Repinta la vista activa: detalle de ítem si hay ítem, ficha si hay campeón,
   si no la lista de la pestaña. */
function showView() {
  const item = state.item != null;
  const ficha = !item && state.champion !== 'all';
  // La página de recolección no usa los filtros de datos (región, parche, etc.).
  const collect = !item && !ficha && state.page === 'collect';
  $('itemView').hidden = !item;
  document.getElementById('championView').hidden = !ficha;
  $('pageCollect').hidden = !collect;
  $('filters').hidden = collect;
  for (const pg of ['champions', 'items', 'runes', 'spells']) {
    $('page' + pg.charAt(0).toUpperCase() + pg.slice(1)).hidden = item || ficha || collect || pg !== state.page;
  }
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', !item && !ficha && t.dataset.page === state.page));
  if (item) loadItemView();
  else if (ficha) loadChampionView();
  else if (!collect) refreshActivePage();
}

/* ---- ficha de campeón ---- */
function wrCell(w) { return `<span class="${wrClass(w)}">${pct(w)}</span>`; }
function cvTable(headers, rows) {
  const head = '<thead><tr>' + headers.map((h, i) => `<th${i ? ' style="text-align:right"' : ''}>${h}</th>`).join('') + '</tr></thead>';
  const body = '<tbody>' + rows.map((cols) => '<tr>' + cols.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('') + '</tr>').join('') + '</tbody>';
  return `<table class="cv-table">${head}${body}</table>`;
}
const CV_EMPTY = '<div class="empty">Sin datos.</div>';

function champHref(name) { return '/champ/' + encodeURIComponent(name.toLowerCase()); }
function champCircle(name, winRate, tone) {
  return `<a class="champ-cell" href="${champHref(name)}" data-nav-champ="${esc(name)}">
    <div class="champ-circle ${tone}"><img src="${iconUrl(name)}" alt="" ${imgErr}></div>
    <div class="champ-cn">${esc(name)}</div>
    <div class="champ-wr ${tone}">${pct(winRate)}%</div>
    <div class="champ-wl">Win rate</div>
  </a>`;
}
function renderCircles(hostId, rows, key, tone) {
  $(hostId).innerHTML = rows.length
    ? rows.slice(0, 6).map((r) => champCircle(r[key], r.winRate, tone)).join('')
    : '<div class="empty">Sin datos.</div>';
}

async function loadChampionView() {
  await ddLoad();
  const champ = state.champion;
  const hosts = ['cvWeak', 'cvStrong', 'cvSynergy', 'cvItems', 'cvPlayers', 'cvRunes'];
  if (champ === 'all') {
    $('cvHeader').innerHTML = '<div class="meta">Selecciona un campeón en el filtro de arriba para ver su ficha.</div>';
    hosts.forEach((id) => { $(id).innerHTML = ''; });
    $('cvBuild').innerHTML = '';
    return;
  }
  $('cvHeader').innerHTML = `<img src="${iconUrl(champ)}" alt="" ${imgErr}><div><div class="name">${esc(champ)}</div><div class="meta">${scopeLabel()}</div></div>`;
  hosts.forEach((id) => { $(id).innerHTML = '<div class="empty">Cargando…</div>'; });
  $('cvBuild').innerHTML = '';
  const f = { patch: state.patch, tier: state.tier, role: state.role, champion: champ };
  const [items, players, runes, counters, synergy] = await Promise.all([
    api.stats('items', state.region, f),
    api.stats('players', state.region, f),
    api.stats('runes', state.region, f),
    api.stats('counters', state.region, f),
    api.stats('synergy', state.region, f),
  ]);

  // Weak / Strong against (de los counters) y mejor sinergia (duo).
  // Exige un mínimo de partidas para evitar ruido de muestras de 1; si hay
  // muy pocas con ese mínimo, cae a usar todas.
  const MIN = 3;
  const enough = (arr) => { const f = arr.filter((x) => x.games >= MIN); return f.length >= 3 ? f : arr; };
  const cp = enough(counters);
  const weak = [...cp].sort((a, b) => a.winRate - b.winRate || b.games - a.games);
  const strong = [...cp].sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  const syn = [...enough(synergy)].sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  renderCircles('cvWeak', weak, 'opponent', 'weak');
  renderCircles('cvStrong', strong, 'opponent', 'strong');
  renderCircles('cvSynergy', syn, 'champion', 'strong');

  const it = items.filter((r) => !isTrinketOrConsumable(r.item));
  $('cvBuild').innerHTML = it.slice(0, 6).map((r, i) =>
    (i ? '<span class="arrow">→</span>' : '') + `<img src="${itemIcon(r.item)}" title="${esc(itemName(r.item))}" ${imgErr}>`).join('');
  $('cvItems').innerHTML = it.length ? cvTable(['Item', 'Jueg.', 'Win%'], it.slice(0, 10).map((r) =>
    [`<span class="cv-name"><img src="${itemIcon(r.item)}" ${imgErr}>${esc(itemName(r.item))}</span>`, r.games, wrCell(r.winRate)])) : CV_EMPTY;
  $('cvPlayers').innerHTML = players.length ? cvTable(['Jugador', 'Jueg.', 'Win%', 'KDA'], players.map((p) =>
    [esc(p.riotId || '—'), p.games, wrCell(p.winRate), p.kda.toFixed(2)])) : CV_EMPTY;
  $('cvRunes').innerHTML = runes.length ? cvTable(['Runa', 'Jueg.', 'Win%'], runes.slice(0, 8).map((r) =>
    [`<span class="cv-name"><img src="${runeIcon(r.keystone)}" ${imgErr}>${esc(runeName(r.keystone))}</span>`, r.games, wrCell(r.winRate)])) : CV_EMPTY;
}

/* ---- detalle de ítem: partidas en las que se usó ---- */
const ITEM_PAGE = 50;
const matchCache = new Map(); // matchId -> MatchDetail (cache en memoria)

function gameSpells(s1, s2) {
  return `<span class="ico-pair">
    <img loading="lazy" src="${spellIcon(s1)}" alt="" title="${esc(spellName(s1))}" ${imgErr}>
    <img loading="lazy" src="${spellIcon(s2)}" alt="" title="${esc(spellName(s2))}" ${imgErr}></span>`;
}
function gameRunes(ks, sub) {
  return `<span class="rune-icons">
    <img class="ks" loading="lazy" src="${runeIcon(ks)}" alt="" title="${esc(runeName(ks))}" ${imgErr}>
    <img class="tree" loading="lazy" src="${runeIcon(sub)}" alt="" title="${esc(runeName(sub))}" ${imgErr}></span>`;
}
/* Iconos de build. `highlight` resalta el ítem del detalle; `withTrinket` añade
   item6 separado. */
function buildIcons(items, withTrinket, highlight) {
  const cell = (id) => {
    if (!id || id <= 0) return '<span class="item-empty"></span>';
    const hl = highlight && id === highlight ? ' class="hl"' : '';
    return `<img${hl} loading="lazy" src="${itemIcon(id)}" alt="" title="${esc(itemName(id))}" ${imgErr}>`;
  };
  const main = items.slice(0, 6).map(cell).join('');
  const trinket = withTrinket
    ? `<span class="trinket-sep"></span>${cell(items[6])}`
    : '';
  return `<span class="build-row">${main}${trinket}</span>`;
}
function kdaText(k, d, a, kda) {
  return `<span class="kda">${k} / <span class="kda-d">${d}</span> / ${a} <span class="kda-r">${(kda || 0).toFixed(2)}</span></span>`;
}

async function loadItemView() {
  await ddLoad();
  const host = $('ivGamesHost');
  if (!state.region) {
    $('ivHeader').innerHTML = '';
    host.innerHTML = '<div class="empty">No hay datos. Recolecta primero.</div>';
    $('ivPager').innerHTML = '';
    return;
  }
  const item = state.item;
  $('ivHeader').innerHTML = `<img src="${itemIcon(item)}" alt="" ${imgErr}><div><div class="name">${esc(itemName(item))}</div><div class="meta">${scopeLabel()}</div></div>`;
  host.innerHTML = '<div class="empty">Cargando…</div>';
  $('ivPager').innerHTML = '';
  const f = { patch: state.patch, tier: state.tier, role: state.role, champion: state.champion };
  let resp;
  try {
    resp = await api.itemGames(state.region, item, f, ITEM_PAGE, state.itemOffset);
  } catch {
    host.innerHTML = '<div class="empty">Error al cargar las partidas.</div>';
    return;
  }
  const metaEl = $('ivHeader').querySelector('.meta');
  if (metaEl) metaEl.innerHTML = `${scopeLabel()} · <b>${resp.total || 0}</b> partidas`;
  renderItemGames(resp);
}

function renderItemGames(resp) {
  const host = $('ivGamesHost');
  const games = resp.games || [];
  if (!games.length) {
    host.innerHTML = '<div class="empty">Ninguna partida con este ítem para el filtro actual.</div>';
    renderItemPager(resp);
    return;
  }
  const head = `<thead><tr>
    <th class="ig-caret"></th>
    <th>Campeón</th><th>Rol</th><th>KDA</th><th>CS</th>
    <th>Hechizos</th><th>Runas</th><th>Build</th><th>Resultado</th>
  </tr></thead>`;
  const body = '<tbody>' + games.map((g) => `
    <tr class="ig-row ${g.win ? 'win' : 'lose'}" data-match-id="${esc(g.matchId)}">
      <td class="ig-caret"><span class="caret">▸</span></td>
      <td><span class="cell-ico"><img loading="lazy" src="${iconUrl(g.championName)}" alt="" ${imgErr}><span>${esc(g.championName)}</span></span></td>
      <td class="role-cell">${roleIconImg(g.role, 'role-ic')}<span>${ROLE_LABEL[g.role] || g.role || '—'}</span></td>
      <td>${kdaText(g.kills, g.deaths, g.assists, g.kda)}</td>
      <td class="num">${g.cs}</td>
      <td>${gameSpells(g.summoner1, g.summoner2)}</td>
      <td>${gameRunes(g.keystone, g.subStyle)}</td>
      <td>${buildIcons(g.items, true, state.item)}</td>
      <td><span class="result ${g.win ? 'win' : 'lose'}">${g.win ? 'Victoria' : 'Derrota'}</span></td>
    </tr>`).join('') + '</tbody>';
  host.innerHTML = `<table class="ig-table">${head}${body}</table>`;
  renderItemPager(resp);
}

function renderItemPager(resp) {
  const el = $('ivPager');
  const total = resp.total || 0;
  if (!total) { el.innerHTML = ''; return; }
  const from = state.itemOffset + 1;
  const to = Math.min(state.itemOffset + ITEM_PAGE, total);
  const prevDis = state.itemOffset <= 0 ? 'disabled' : '';
  const nextDis = to >= total ? 'disabled' : '';
  el.innerHTML = `
    <button class="pager-btn" id="ivPrev" ${prevDis}>← Anterior</button>
    <span class="pager-info">${from}–${to} de ${total}</span>
    <button class="pager-btn" id="ivNext" ${nextDis}>Siguiente →</button>`;
  $('ivPrev').onclick = () => {
    if (state.itemOffset <= 0) return;
    state.itemOffset = Math.max(0, state.itemOffset - ITEM_PAGE);
    loadItemView();
  };
  $('ivNext').onclick = () => {
    if (state.itemOffset + ITEM_PAGE >= total) return;
    state.itemOffset += ITEM_PAGE;
    loadItemView();
  };
}

/* Expande/colapsa una fila de game cargando (perezosamente) su scoreboard. */
async function toggleGameRow(row) {
  const caret = row.querySelector('.caret');
  if (row.classList.contains('open')) {
    row.classList.remove('open');
    if (caret) caret.textContent = '▸';
    const next = row.nextElementSibling;
    if (next && next.classList.contains('game-detail')) next.remove();
    return;
  }
  row.classList.add('open');
  if (caret) caret.textContent = '▾';
  const matchId = row.getAttribute('data-match-id');
  const detail = document.createElement('tr');
  detail.className = 'game-detail';
  const td = document.createElement('td');
  td.colSpan = 9;
  td.innerHTML = '<div class="empty">Cargando partida…</div>';
  detail.appendChild(td);
  row.after(detail);
  let data = matchCache.get(matchId);
  if (!data) {
    try {
      data = await api.match(state.region, matchId);
      matchCache.set(matchId, data);
    } catch {
      td.innerHTML = '<div class="empty">Error al cargar la partida.</div>';
      return;
    }
  }
  if (!data || data.error) {
    td.innerHTML = '<div class="empty">Partida no encontrada.</div>';
    return;
  }
  td.innerHTML = renderScoreboard(data, state.item);
}

const TEAM_TONE = { 100: 'blue', 200: 'red' };
const TEAM_NAME = { 100: 'Equipo azul', 200: 'Equipo rojo' };

function renderScoreboard(m, highlight) {
  const parts = m.participants || [];
  const maxDmg = Math.max(1, ...parts.map((p) => p.dmgToChamps || 0));
  const dur = m.gameDuration || 0;
  const obj = {};
  for (const t of (m.teams || [])) obj[t.teamId] = t;

  const teamBlock = (teamId) => {
    const tp = parts.filter((p) => p.teamId === teamId);
    if (!tp.length) return '';
    const tone = TEAM_TONE[teamId] || 'blue';
    const win = tp[0].win;
    const k = tp.reduce((s, p) => s + p.kills, 0);
    const d = tp.reduce((s, p) => s + p.deaths, 0);
    const a = tp.reduce((s, p) => s + p.assists, 0);
    const gold = tp.reduce((s, p) => s + p.goldEarned, 0);
    const o = obj[teamId] || {};
    const head = `<div class="sb-team-head ${tone}">
      <span class="sb-team-name">${TEAM_NAME[teamId] || ''}</span>
      <span class="result ${win ? 'win' : 'lose'}">${win ? 'Victoria' : 'Derrota'}</span>
      <span class="sb-tot">${k} / ${d} / ${a}</span>
      <span class="sb-obj" title="Oro total">🪙 ${(gold / 1000).toFixed(1)}k</span>
      <span class="sb-obj" title="Torres">🏰 ${o.towerKills || 0}</span>
      <span class="sb-obj" title="Dragones">🐉 ${o.dragonKills || 0}</span>
      <span class="sb-obj" title="Heraldos">🦀 ${o.riftHeraldKills || 0}</span>
      <span class="sb-obj" title="Barones">👹 ${o.baronKills || 0}</span>
    </div>`;
    const rows = tp.map((p) => sbPlayerRow(p, maxDmg, dur, highlight)).join('');
    return `<div class="sb-team ${tone}">${head}<div class="sb-rows">${rows}</div></div>`;
  };
  return `<div class="scoreboard">${teamBlock(100)}${teamBlock(200)}</div>`;
}

function sbPlayerRow(p, maxDmg, dur, highlight) {
  const csmin = dur > 0 ? (p.cs / (dur / 60)).toFixed(1) : '0.0';
  const kp = p.killParticipation != null ? Math.round(p.killParticipation * 100) + '%' : '—';
  const dmgPct = Math.round((p.dmgToChamps / maxDmg) * 100);
  const name = p.riotId ? p.riotId.split('#')[0] : '—';
  return `<div class="sb-player">
    <div class="sb-id">
      <span class="sb-champ-ic"><img src="${iconUrl(p.championName)}" alt="" ${imgErr}><span class="sb-lvl">${p.champLevel}</span></span>
      <span class="ico-pair sb-spells">
        <img src="${spellIcon(p.summoner1)}" alt="" title="${esc(spellName(p.summoner1))}" ${imgErr}>
        <img src="${spellIcon(p.summoner2)}" alt="" title="${esc(spellName(p.summoner2))}" ${imgErr}></span>
      <img class="sb-ks" src="${runeIcon(p.keystone)}" alt="" title="${esc(runeName(p.keystone))}" ${imgErr}>
      <span class="sb-name" title="${esc(p.riotId || '')}">${esc(name)}</span>
    </div>
    <div class="sb-kda num">${p.kills} / ${p.deaths} / ${p.assists} <span class="kda-r">${(p.kda || 0).toFixed(2)}</span></div>
    <div class="sb-cs num">${p.cs} <span class="sub">${csmin}/m</span></div>
    <div class="sb-kp num">${kp}</div>
    <div class="sb-dmg"><div class="sb-dmg-bar"><span style="width:${dmgPct}%"></span></div><span class="sb-dmg-val num">${(p.dmgToChamps || 0).toLocaleString()}</span></div>
    <div class="sb-build">${buildIcons(p.items, true, highlight)}</div>
  </div>`;
}

/* ---------------- recolección ---------------- */
async function runCollect() {
  if (state.collecting) return;
  const tiers = selectedCollectTiers();
  if (!tiers.length) { alert('Elige al menos un rango a recolectar.'); return; }
  const req = {
    region: $('cServer').value,
    apiKey: $('cKey').value.trim(),
    maxMatches: Number($('cMax').value) || 100,
    matchesPerPlayer: Number($('cPerPlayer').value) || 15,
    maxPlayersPerBucket: Number($('cBucket').value) || 40,
    tiers,
  };
  if (!req.apiKey) { alert('Falta la API key de Riot.'); return; }

  LS.set('server', req.region);
  LS.set('apiKey', req.apiKey);
  LS.set('max', String(req.maxMatches));
  LS.set('perPlayer', String(req.matchesPerPlayer));
  LS.set('bucket', String(req.maxPlayersPerBucket));

  state.collecting = true;
  $('cRun').disabled = true;
  $('cRun').textContent = 'Recolectando…';
  $('progressWrap').hidden = false;
  $('progressText').textContent = 'Iniciando…';

  try {
    // Lanza la recolección (responde al instante); el progreso se sigue por polling.
    const res = await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok && res.status !== 202) throw new Error('HTTP ' + res.status);
    pollCollect(req.region);
  } catch (err) {
    $('progressText').textContent = 'Error al lanzar: ' + (err && err.message ? err.message : err);
    state.collecting = false;
    $('cRun').disabled = false;
    $('cRun').textContent = 'Recolectar';
  }
}

/* Sigue el progreso por polling de /api/status hasta que la recolección termina.
   La recolección corre en el servidor con independencia de esta página. */
async function pollCollect(region) {
  let st;
  try {
    st = await api.status(region);
  } catch {
    setTimeout(() => pollCollect(region), 2000); // fallo de red puntual: reintenta
    return;
  }
  if (st.progress) onProgress(st.progress);
  showStatus(st);
  if (st.running) {
    setTimeout(() => pollCollect(region), 1500);
    return;
  }
  // Terminado: rehabilita el botón y refresca datos (puede haber región nueva).
  state.collecting = false;
  $('cRun').disabled = false;
  $('cRun').textContent = 'Recolectar';
  const reg = await api.regions();
  fillRegionFilter(reg.dataRegions);
  state.region = region;
  $('fRegion').value = region;
  LS.set('region', region);
  await loadMeta();
  showView();
}

function onProgress(ev) {
  const frac = ev.target ? Math.min(1, ev.collected / ev.target) : 0;
  $('progressFill').style.width = Math.round(frac * 100) + '%';
  const labels = {
    starting: 'Iniciando…',
    collecting: `Recolectando ${ev.collected}/${ev.target}${ev.bucket ? ' · ' + ev.bucket : ''}`,
    'building-db': 'Construyendo base SQLite…',
    done: `Listo · ${ev.collected} partidas`,
    error: 'Error: ' + (ev.message || ''),
  };
  $('progressText').textContent = labels[ev.phase] || ev.phase;
}

/* ---------------- eventos ---------------- */
function wireEvents() {
  $('cRun').addEventListener('click', runCollect);

  // Enlaces a la ficha de un campeón (navegación SPA, sin recargar).
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-nav-champ]');
    if (!el || e.metaKey || e.ctrlKey) return; // permite abrir en pestaña nueva
    e.preventDefault();
    state.item = null;
    state.champion = el.getAttribute('data-nav-champ');
    $('fChampion').value = state.champion;
    LS.set('champion', state.champion);
    navigate();
  });

  // Enlaces al detalle de un ítem (navegación SPA, sin recargar).
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-nav-item]');
    if (!el || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    state.item = Number(el.getAttribute('data-nav-item'));
    state.itemOffset = 0;
    navigate();
  });

  // Expandir/colapsar una partida en el detalle de ítem.
  $('ivGamesHost').addEventListener('click', (e) => {
    const row = e.target.closest('.ig-row');
    if (row) toggleGameRow(row);
  });

  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) switchPage(tab.dataset.page);
  });

  $('fRegion').addEventListener('change', async (e) => {
    state.region = e.target.value;
    state.itemOffset = 0;
    LS.set('region', state.region);
    await loadMeta();
    showView();
    loadStatus(state.region);
  });
  $('fPatch').addEventListener('change', (e) => {
    state.patch = e.target.value;
    state.itemOffset = 0;
    LS.set('patch', state.patch);
    showView();
  });
  $('fTier').addEventListener('click', (e) => {
    const opt = e.target.closest('.tier-opt');
    if (!opt) return;
    state.tier = opt.dataset.tier;
    state.itemOffset = 0;
    LS.set('tier', state.tier);
    $('fTier').querySelectorAll('.tier-opt').forEach((x) => x.classList.remove('on'));
    opt.classList.add('on');
    showView();
  });
  $('fChampion').addEventListener('change', () => {
    const v = $('fChampion').value.trim();
    const match = (state.meta && state.meta.champions || []).find((c) => c.toLowerCase() === v.toLowerCase());
    state.champion = match || 'all';
    state.itemOffset = 0;
    if (!match) $('fChampion').value = '';
    LS.set('champion', state.champion);
    navigate(); // detalle de ítem (refiltra), ficha => /champ/<slug>, o vuelve a /
  });
  $('fSearch').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });

  $('fRoles').addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    state.role = pill.dataset.role;
    state.itemOffset = 0;
    LS.set('role', state.role);
    $('fRoles').querySelectorAll('.pill').forEach((x) => x.classList.remove('on'));
    pill.classList.add('on');
    showView();
  });

  $('fMinGames').value = String(state.minGames);
  $('fMinGamesV').textContent = String(state.minGames);
  $('fMinGames').addEventListener('input', (e) => {
    state.minGames = Number(e.target.value);
    $('fMinGamesV').textContent = e.target.value;
    LS.set('minGames', e.target.value);
    renderTable();
  });

  $('fMinWR').value = String(state.minWR);
  $('fMinWRV').textContent = String(state.minWR);
  $('fMinWR').addEventListener('input', (e) => {
    state.minWR = Number(e.target.value);
    $('fMinWRV').textContent = e.target.value;
    LS.set('minWR', e.target.value);
    renderTable();
  });
}

init().catch((e) => { document.body.innerHTML = '<p style="padding:24px;color:#f87171">Error al iniciar: ' + e.message + '</p>'; });
