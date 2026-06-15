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
  page: LS.get('page', 'champions'),
  search: '',
  minGames: Number(LS.get('minGames', '1')),
  minWR: Number(LS.get('minWR', '0')),
  sortKey: LS.get('sortKey', 'games'),
  sortDir: LS.get('sortDir', 'desc') === 'asc' ? 1 : -1,
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
};

/* ---- Data Dragon: nombres/iconos de items, hechizos y runas (cache) ---- */
const dd = { loaded: false, items: {}, spells: {}, runes: {} };
async function ddLoad() {
  if (dd.loaded || !state.ddVersion) return;
  const V = state.ddVersion;
  const base = `https://ddragon.leagueoflegends.com/cdn/${V}/data/es_ES`;
  const [items, sums, runes] = await Promise.all([
    fetch(`${base}/item.json`).then((r) => r.json()).catch(() => null),
    fetch(`${base}/summoner.json`).then((r) => r.json()).catch(() => null),
    fetch(`${base}/runesReforged.json`).then((r) => r.json()).catch(() => null),
  ]);
  if (items) for (const [id, it] of Object.entries(items.data)) dd.items[id] = { name: it.name, tags: it.tags || [] };
  if (sums) for (const s of Object.values(sums.data)) dd.spells[s.key] = { name: s.name, id: s.id };
  if (runes) for (const st of runes) {
    dd.runes[st.id] = { name: st.name, icon: st.icon };
    for (const slot of st.slots) for (const r of slot.runes) dd.runes[r.id] = { name: r.name, icon: r.icon };
  }
  dd.loaded = true;
}
const itemIcon = (id) => `https://ddragon.leagueoflegends.com/cdn/${state.ddVersion}/img/item/${id}.png`;
const spellIcon = (key) => dd.spells[key] ? `https://ddragon.leagueoflegends.com/cdn/${state.ddVersion}/img/spell/${dd.spells[key].id}.png` : '';
const runeIcon = (id) => dd.runes[id] ? `https://ddragon.leagueoflegends.com/cdn/img/${dd.runes[id].icon}` : '';
const itemName = (id) => (dd.items[id] && dd.items[id].name) || `Item ${id}`;
const spellName = (key) => (dd.spells[key] && dd.spells[key].name) || `Hechizo ${key}`;
const runeName = (id) => (dd.runes[id] && dd.runes[id].name) || `#${id}`;
const isTrinketOrConsumable = (id) => {
  const t = (dd.items[id] && dd.items[id].tags) || [];
  return t.includes('Trinket') || t.includes('Consumable');
};

function iconUrl(name) {
  return state.ddVersion
    ? `https://ddragon.leagueoflegends.com/cdn/${state.ddVersion}/img/champion/${name}.png`
    : '';
}
function pct(x) { return (x * 100).toFixed(1); }
function wrClass(w) { return w >= 0.52 ? 'wr-good' : w >= 0.485 ? 'wr-even' : 'wr-bad'; }

/* ---------------- carga de datos ---------------- */
async function init() {
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
  switchPage(state.page);
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
  if (state.champion !== 'all' && !(state.meta.champions || []).includes(state.champion)) state.champion = 'all';
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
    : 'Sin datos. Lanza una recolección para empezar.';
}

async function loadChampions() {
  if (!state.region) { state.rows = []; renderTable(); return; }
  state.rows = await api.champions(state.region, state.patch, state.tier);
  renderTable();
}

async function loadStatus(region) {
  try { showStatus(await api.status(region)); } catch {}
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
    .map(([v, l]) => `<span class="pill${state.role === v ? ' on' : ''}" data-role="${v}">${l}</span>`)
    .join('');
}

function buildCollectTiers() {
  const saved = new Set(LS.get('collectTiers', TIERS.map((t) => t[0]).join(',')).split(',').filter(Boolean));
  $('cTiers').innerHTML = TIERS
    .map(([k, l]) => `<span class="tier-pill${saved.has(k) ? ' on' : ''}" data-tier="${k}">${l}</span>`)
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
  $('fTier').innerHTML = '<option value="all">Todos</option>' +
    ordered.map((t) => `<option value="${t}">${TIER_LABEL[t] || t}</option>`).join('');
  $('fTier').value = state.tier;
}

function filteredRows() {
  const q = state.search.trim().toLowerCase();
  const rows = state.rows.filter((r) =>
    (state.role === 'ALL' || r.role === state.role) &&
    (state.champion === 'all' || r.championName === state.champion) &&
    r.games >= state.minGames &&
    r.winRate * 100 >= state.minWR &&
    (!q || r.championName.toLowerCase().includes(q)));
  const k = state.sortKey, dir = state.sortDir;
  rows.sort((a, b) => typeof a[k] === 'string'
    ? a[k].localeCompare(b[k]) * dir
    : (a[k] - b[k]) * dir);
  return rows;
}

const COLS = [
  { k: 'championName', label: 'Campeón' },
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
    host.innerHTML = '<div class="empty">No hay datos. Configura tu API key y pulsa “Recolectar”.</div>';
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
      <td><span class="champ"><img loading="lazy" src="${iconUrl(r.championName)}" alt="" onerror="this.style.visibility='hidden'">
        <span><span class="champ-name">${r.championName}</span> <span class="champ-role">${ROLE_LABEL[r.role] || r.role}</span></span></span></td>
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
  const f = { patch: state.patch, tier: state.tier, role: state.role, champion: state.champion };
  let rows = await api.stats(page, state.region, f);
  if (page === 'items') rows = rows.filter((r) => !isTrinketOrConsumable(r.item));
  sum.innerHTML = `<b>${rows.length}</b> entradas · ${scopeLabel()}`;
  if (!rows.length) { host.innerHTML = '<div class="empty">Sin datos para este filtro.</div>'; return; }
  if (page === 'items') renderItems(rows, host);
  else if (page === 'runes') renderRunes(rows, host);
  else renderSpells(rows, host);
}

function statsHead(label) {
  return `<thead><tr><th>${label}</th><th>Juegos</th><th>Win %</th><th>Pick %</th></tr></thead>`;
}
function statsTail(r) {
  return `<td class="num">${r.games}</td><td class="num ${wrClass(r.winRate)}">${pct(r.winRate)}</td><td class="num">${pct(r.pickRate)}</td>`;
}
const imgErr = `onerror="this.style.visibility='hidden'"`;

function renderItems(rows, host) {
  const body = rows.map((r) => `<tr>
    <td><span class="cell-ico"><img loading="lazy" src="${itemIcon(r.item)}" alt="" ${imgErr}><span>${itemName(r.item)}</span></span></td>
    ${statsTail(r)}</tr>`).join('');
  host.innerHTML = `<table>${statsHead('Item')}<tbody>${body}</tbody></table>`;
}
function renderSpells(rows, host) {
  const body = rows.map((r) => `<tr>
    <td><span class="cell-ico"><span class="ico-pair">
      <img loading="lazy" src="${spellIcon(r.spell1)}" alt="" ${imgErr}>
      <img loading="lazy" src="${spellIcon(r.spell2)}" alt="" ${imgErr}></span>
      <span>${spellName(r.spell1)} + ${spellName(r.spell2)}</span></span></td>
    ${statsTail(r)}</tr>`).join('');
  host.innerHTML = `<table>${statsHead('Hechizos')}<tbody>${body}</tbody></table>`;
}
function renderRunes(rows, host) {
  const body = rows.map((r) => `<tr>
    <td><span class="cell-ico"><span class="rune-icons">
      <img class="ks" loading="lazy" src="${runeIcon(r.keystone)}" alt="" ${imgErr}>
      <img class="tree" loading="lazy" src="${runeIcon(r.primaryStyle)}" alt="" ${imgErr}>
      <img class="tree" loading="lazy" src="${runeIcon(r.subStyle)}" alt="" ${imgErr}></span>
      <span>${runeName(r.keystone)} <span class="sub">${runeName(r.primaryStyle)} › ${runeName(r.subStyle)}</span></span></span></td>
    ${statsTail(r)}</tr>`).join('');
  host.innerHTML = `<table>${statsHead('Runas')}<tbody>${body}</tbody></table>`;
}

function switchPage(page) {
  state.page = page;
  LS.set('page', page);
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.page === page));
  for (const pg of ['champions', 'items', 'runes', 'spells']) {
    $('page' + pg.charAt(0).toUpperCase() + pg.slice(1)).hidden = pg !== page;
  }
  refreshActivePage();
}
async function refreshActivePage() {
  if (state.page === 'champions') await loadChampions();
  else await loadStats(state.page);
}
function afterScopeChange() {
  // rol/campeón: en Campeones es filtro de cliente; en las otras, del servidor.
  if (state.page === 'champions') renderTable();
  else loadStats(state.page);
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

  try {
    const res = await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let finalStatus = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.phase === 'status') finalStatus = ev;
        else onProgress(ev);
      }
    }
    if (finalStatus) showStatus(finalStatus);

    // refrescar datos (puede haber región nueva)
    const reg = await api.regions();
    fillRegionFilter(reg.dataRegions);
    state.region = req.region;
    $('fRegion').value = state.region;
    LS.set('region', state.region);
    await loadMeta();
    await loadChampions();
  } catch (err) {
    $('progressText').textContent = 'Error: ' + (err && err.message ? err.message : err);
  } finally {
    state.collecting = false;
    $('cRun').disabled = false;
    $('cRun').textContent = 'Recolectar';
  }
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

  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) switchPage(tab.dataset.page);
  });

  $('fRegion').addEventListener('change', async (e) => {
    state.region = e.target.value;
    LS.set('region', state.region);
    await loadMeta();
    await refreshActivePage();
    loadStatus(state.region);
  });
  $('fPatch').addEventListener('change', async (e) => {
    state.patch = e.target.value;
    LS.set('patch', state.patch);
    await refreshActivePage();
  });
  $('fTier').addEventListener('change', async (e) => {
    state.tier = e.target.value;
    LS.set('tier', state.tier);
    await refreshActivePage();
  });
  $('fChampion').addEventListener('change', () => {
    const v = $('fChampion').value.trim();
    const match = (state.meta && state.meta.champions || []).find((c) => c.toLowerCase() === v.toLowerCase());
    state.champion = match || 'all';
    if (!match) $('fChampion').value = '';
    LS.set('champion', state.champion);
    afterScopeChange();
  });
  $('fSearch').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });

  $('fRoles').addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    state.role = pill.dataset.role;
    LS.set('role', state.role);
    $('fRoles').querySelectorAll('.pill').forEach((x) => x.classList.remove('on'));
    pill.classList.add('on');
    afterScopeChange();
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
