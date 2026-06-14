import type {
  AppState,
  AssetsInfo,
  AssetsProgress,
  BuildAdvice,
  MatchupAdvice,
  AnalyticsMeta,
  ChampionStatRow,
} from '../shared/types';

/* ============================================================
   PALETAS (del diseño de Claude Design)
   ============================================================ */
interface Palette {
  id: string;
  name: string;
  desc: string;
  vars: Record<string, string>;
}

const PALETTES: Palette[] = [
  {
    id: 'hextech',
    name: 'Hextech',
    desc: 'Azul piedra mágica + dorado',
    vars: {
      '--accent': '#c8aa6e', '--accent2': '#0ac8b9', '--text': '#f0e6d2', '--muted': '#9aa7b4',
      '--fav': '#4fd787', '--even': '#e8c95a', '--bad': '#ea5a50',
      '--panel-solid': '#091221', '--panel-2-solid': '#142136', '--border': 'rgba(200,170,110,0.22)',
    },
  },
  {
    id: 'neon',
    name: 'Noche neón',
    desc: 'Magenta/cian, vibe arcade',
    vars: {
      '--accent': '#ff2e97', '--accent2': '#00e5ff', '--text': '#f4eeff', '--muted': '#9a8fb8',
      '--fav': '#34f5b0', '--even': '#ffd23f', '--bad': '#ff466f',
      '--panel-solid': '#0a0712', '--panel-2-solid': '#1c102a', '--border': 'rgba(255,46,151,0.26)',
    },
  },
  {
    id: 'elite',
    name: 'Élite sobria',
    desc: 'Grises azulados, un acento',
    vars: {
      '--accent': '#5b9bff', '--accent2': '#9cc0f0', '--text': '#e8edf4', '--muted': '#8893a4',
      '--fav': '#58c98c', '--even': '#d6b85e', '--bad': '#dd7a6e',
      '--panel-solid': '#11151c', '--panel-2-solid': '#202630', '--border': 'rgba(255,255,255,0.11)',
    },
  },
  {
    id: 'esmeralda',
    name: 'Esmeralda',
    desc: 'Verde/teal + cálido',
    vars: {
      '--accent': '#2ed8a7', '--accent2': '#e0a458', '--text': '#e2f2ec', '--muted': '#82a89c',
      '--fav': '#45e0a0', '--even': '#e8c45a', '--bad': '#ee6f62',
      '--panel-solid': '#061815', '--panel-2-solid': '#0e2a25', '--border': 'rgba(46,216,167,0.22)',
    },
  },
  {
    id: 'sangre',
    name: 'Sangre y oro',
    desc: 'Rojo/ámbar, agresiva',
    vars: {
      '--accent': '#f0a92b', '--accent2': '#e8473c', '--text': '#f4e6d6', '--muted': '#b5917c',
      '--fav': '#8fd15a', '--even': '#f0b43a', '--bad': '#ff5b4e',
      '--panel-solid': '#160907', '--panel-2-solid': '#2a120c', '--border': 'rgba(240,169,43,0.22)',
    },
  },
];

const PHASES: Record<AppState['phase'], { label: string; dotVar: string }> = {
  'disconnected': { label: 'Desconectado', dotVar: 'var(--phase-disconnected)' },
  idle: { label: 'En espera', dotVar: 'var(--phase-idle)' },
  'champ-select': { label: 'Selección de campeón', dotVar: 'var(--phase-champ)' },
  'in-game': { label: 'En partida', dotVar: 'var(--phase-ingame)' },
};

/* ============================================================
   PERSISTENCIA + ESTADO DE UI
   ============================================================ */
const LS = {
  get(k: string, d: string): string {
    try { return localStorage.getItem('lolc:' + k) ?? d; } catch { return d; }
  },
  set(k: string, v: string): void {
    try { localStorage.setItem('lolc:' + k, v); } catch { /* noop */ }
  },
};

let palId = LS.get('pal', 'hextech');
let opacity = Number(LS.get('opacity', '0.97'));
let scale = Number(LS.get('scale', '1'));
let pinned = false;

/* Posición arrastrada de cada "ventana" del overlay (offset en px respecto a
   su anclaje base en CSS). Persistida para que sobreviva al reinicio. */
type LayoutKey = 'main' | 'shortcuts';
type Offset = { x: number; y: number };
let layout: Partial<Record<LayoutKey, Offset>> = loadLayout();
let dragging = false;       // true mientras se arrastra una ventana
let pendingRender = false;  // un render() llegó durante el arrastre y quedó pendiente

function loadLayout(): Partial<Record<LayoutKey, Offset>> {
  try {
    const parsed = JSON.parse(LS.get('layout', '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function saveLayout(): void {
  LS.set('layout', JSON.stringify(layout));
}
let panelHidden = false;
let showSettings = false;
let settingsTab: 'general' | 'apariencia' = LS.get('settingsTab', 'general') as 'general' | 'apariencia';
let lastState: AppState | null = null;
const sectionOpen = new Map<string, boolean>();

/* ---- Back office / analítica ---- */
type AnSortKey = 'championName' | 'games' | 'winRate' | 'pickRate' | 'banRate';
let showAnalytics = false;
let anMeta: AnalyticsMeta | null = null;
let anRows: ChampionStatRow[] = [];
let anLoading = false;
let anLoaded = false;
let anRegion = LS.get('anRegion', '');
let anPatch = LS.get('anPatch', 'all');
let anRole = LS.get('anRole', 'ALL');
let anSearch = '';
let anMinGames = Number(LS.get('anMinGames', '1'));
let anMinWR = Number(LS.get('anMinWR', '0'));
let anSortKey = LS.get('anSortKey', 'games') as AnSortKey;
let anSortDir: 1 | -1 = LS.get('anSortDir', 'desc') === 'asc' ? 1 : -1;
/* Hosts que se repintan al filtrar (sin reconstruir los controles ni perder foco). */
let anSummaryHost: HTMLElement | null = null;
let anTableHost: HTMLElement | null = null;

/* Estado de assets (Data Dragon en local) para la pestaña General. */
let assetsInfo: AssetsInfo | null = null;
let assetsProgress: AssetsProgress | null = null;
let assetsBusy = false;

/* ============================================================
   PUENTE CON EL PROCESO MAIN
   ============================================================ */
interface OverlayInternal {
  onInteractiveChanged(cb: (v: boolean) => void): void;
  onTogglePin(cb: () => void): void;
  onResetLayout(cb: () => void): void;
}
const internal = (window as unknown as { __overlayInternal: OverlayInternal }).__overlayInternal;

let interactiveNow = false;
function setInteractive(v: boolean): void {
  if (v === interactiveNow) return;
  interactiveNow = v;
  window.overlay.setInteractive(v);
}

/* Interactividad por hover: con la ventana en click-through (forward:true), los
   movimientos se reenvían y capturamos el ratón sólo sobre zonas interactivas. */
const INTERACTIVE_SELECTOR = '.panel,.shortcuts';
document.addEventListener('mousemove', (e) => {
  if (pinned || dragging) return;
  const target = document.elementFromPoint(e.clientX, e.clientY);
  setInteractive(!!target?.closest(INTERACTIVE_SELECTOR));
});

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === ',') {
    showSettings = !showSettings;
    render();
  }
});

function togglePin(): void {
  pinned = !pinned;
  setInteractive(pinned);
  render();
}
internal.onTogglePin(togglePin);
internal.onResetLayout(resetLayout);

/* ============================================================
   ARRASTRE DE VENTANAS + RESTABLECER
   ============================================================ */
const DRAG_THRESHOLD = 4; // px antes de considerar que es un arrastre y no un clic
/* No iniciar arrastre desde controles: deben recibir su clic normal. */
const NON_DRAG_SELECTOR =
  'button, input, select, textarea, a, .sec-head.is-clickable, .sp-theme';

/** Aplica el offset guardado de una región como variables CSS (--drag-x/y). */
function applyLayout(region: HTMLElement, key: LayoutKey): void {
  const off = layout[key];
  if (!off) return;
  region.style.setProperty('--drag-x', `${off.x}px`);
  region.style.setProperty('--drag-y', `${off.y}px`);
}

/** Limita el offset para que la ventana no se salga del área visible. */
function clampOffset(region: HTMLElement, x: number, y: number): Offset {
  const r = region.getBoundingClientRect();
  const m = 8;
  let cx = 0;
  let cy = 0;
  if (r.left < m) cx = m - r.left;
  else if (r.right > window.innerWidth - m) cx = window.innerWidth - m - r.right;
  if (r.top < m) cy = m - r.top;
  else if (r.bottom > window.innerHeight - m) cy = window.innerHeight - m - r.bottom;
  return { x: x + cx, y: y + cy };
}

/** Aplica el offset al DOM y al estado. */
function setOffset(region: HTMLElement, key: LayoutKey, off: Offset): void {
  region.style.setProperty('--drag-x', `${off.x}px`);
  region.style.setProperty('--drag-y', `${off.y}px`);
  layout[key] = off;
}

/** Hace que una región sea arrastrable y reaplica su posición persistida. */
function registerRegion(region: HTMLElement, key: LayoutKey): void {
  applyLayout(region, key);
  region.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest(NON_DRAG_SELECTOR)) return;
    // No arrastrar al usar la barra de scroll del panel.
    if (target instanceof HTMLElement && target.classList.contains('panel-scroll')) {
      const scrollbarW = target.offsetWidth - target.clientWidth;
      if (scrollbarW > 0 && e.offsetX >= target.clientWidth) return;
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const base = layout[key] ?? { x: 0, y: 0 };
    let moved = false;

    const onMove = (ev: MouseEvent): void => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved = true;
        dragging = true;
        document.body.classList.add('dragging');
      }
      setOffset(region, key, { x: base.x + dx, y: base.y + dy });
      setOffset(region, key, clampOffset(region, base.x + dx, base.y + dy));
    };

    const onUp = (ev: MouseEvent): void => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      if (!moved) return;
      dragging = false;
      document.body.classList.remove('dragging');
      saveLayout();
      if (pendingRender) {
        pendingRender = false;
        render();
      }
      // Recalcular interactividad según dónde se soltó (puede haber salido de la región).
      if (!pinned) {
        const t = document.elementFromPoint(ev.clientX, ev.clientY);
        setInteractive(!!t?.closest(INTERACTIVE_SELECTOR));
      }
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  });
}

/** Devuelve todas las ventanas a su posición original. */
function resetLayout(): void {
  layout = {};
  saveLayout();
  render();
}

/* ============================================================
   PALETA / AJUSTES
   ============================================================ */
function applyPalette(id: string): void {
  const pal = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  for (const [k, v] of Object.entries(pal.vars)) {
    document.documentElement.style.setProperty(k, v);
  }
}
function applyUiVars(): void {
  document.documentElement.style.setProperty('--ui-opacity', String(opacity));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

/* ============================================================
   HELPERS DE DOM
   ============================================================ */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setVar(node: HTMLElement, prop: string, value: string): void {
  node.style.setProperty(prop, value);
}

/* ---- placeholders / arte real (huecos del diseño) ---- */
function thumb(dim: number, iconUrl?: string, label?: string): HTMLElement {
  const box = el('div', 'ph ph-thumb');
  box.style.width = `${dim}px`;
  box.style.height = `${dim}px`;
  if (iconUrl) {
    const img = el('img');
    img.src = iconUrl;
    img.alt = label ?? '';
    img.onerror = () => { img.remove(); box.append(el('span', 'ph-tag', String(dim))); };
    box.append(img);
  } else {
    box.append(el('span', 'ph-tag', label ?? String(dim)));
  }
  return box;
}

function itemIcon(dim: number, iconUrl?: string, name?: string): HTMLElement {
  if (!iconUrl && !name) {
    const empty = el('div', 'ph ph-item ph-empty');
    empty.style.width = `${dim}px`;
    empty.style.height = `${dim}px`;
    empty.append(el('span', 'ph-plus', '+'));
    empty.title = 'slot vacío';
    return empty;
  }
  const box = el('div', 'ph ph-item');
  box.style.width = `${dim}px`;
  box.style.height = `${dim}px`;
  box.title = name ?? '';
  if (iconUrl) {
    const img = el('img');
    img.src = iconUrl;
    img.alt = name ?? '';
    img.onerror = () => { img.remove(); box.append(el('span', 'ph-tag sm', String(dim))); };
    box.append(img);
  } else {
    box.append(el('span', 'ph-tag sm', String(dim)));
  }
  return box;
}

function skillIcon(slot: string, dim: number, active = false): HTMLElement {
  const box = el('div', 'ph ph-skill' + (active ? ' is-key' : ''));
  box.style.width = `${dim}px`;
  box.style.height = `${dim}px`;
  box.append(el('span', 'skill-key', slot));
  return box;
}

const SPELL_GLYPH: Record<string, string> = {
  Flash: 'F', Ignite: 'Ig', Teleport: 'TP', Heal: 'H', Exhaust: 'Ex',
  Barrier: 'B', Cleanse: 'Cl', Ghost: 'Gh', Smite: 'Sm',
};
function spellIcon(name: string, dim: number): HTMLElement {
  const box = el('div', 'ph ph-spell');
  box.style.width = `${dim}px`;
  box.style.height = `${dim}px`;
  box.title = name;
  box.append(el('span', 'spell-glyph', SPELL_GLYPH[name] ?? name[0] ?? '?'));
  return box;
}

function runeIcon(dim: number, keystone = false): HTMLElement {
  const box = el('div', 'ph ph-rune' + (keystone ? ' is-keystone' : ''));
  box.style.width = `${dim}px`;
  box.style.height = `${dim}px`;
  return box;
}

function toneForPct(pct: number): 'fav' | 'even' | 'bad' {
  if (pct >= 52) return 'fav';
  if (pct >= 48.5) return 'even';
  return 'bad';
}
function toneForDifficulty(d: MatchupAdvice['difficulty']): 'fav' | 'even' | 'bad' {
  return d === 'easy' ? 'fav' : d === 'hard' ? 'bad' : 'even';
}
function winRate(pct: number, tone: 'fav' | 'even' | 'bad', big = false): HTMLElement {
  const wr = el('span', `wr wr-${tone}${big ? ' wr-big' : ''}`);
  wr.append(el('span', 'num', pct.toFixed(1)), el('span', 'pct', '%'));
  return wr;
}
function pill(text: string, tone: 'role' | 'diff' | 'ghost'): HTMLElement {
  return el('span', `pill pill-${tone}`, text);
}

/** Sección con cabecera, colapsable opcional y badge "Próximamente". */
function section(opts: {
  title: string; soon?: boolean; side?: string;
  collapsible?: boolean; defaultOpen?: boolean;
}): { root: HTMLElement; body: HTMLElement | null } {
  const { title, soon, side, collapsible, defaultOpen = true } = opts;
  const root = el('section', 'sec');
  const head = el('header', 'sec-head' + (collapsible ? ' is-clickable' : ''));

  if (!sectionOpen.has(title)) sectionOpen.set(title, defaultOpen);
  const open = sectionOpen.get(title)!;

  if (collapsible) head.append(el('span', 'sec-caret' + (open ? ' open' : ''), '›'));
  head.append(el('h3', 'sec-title', title));
  if (soon) head.append(el('span', 'badge-soon', 'Próximamente'));
  if (side) head.append(el('span', 'sec-side', side));
  root.append(head);

  if (collapsible) {
    head.addEventListener('click', () => {
      sectionOpen.set(title, !sectionOpen.get(title));
      render();
    });
  }

  let body: HTMLElement | null = null;
  if (!collapsible || open) {
    body = el('div', 'sec-body');
    root.append(body);
  }
  return { root, body };
}

function stat(label: string, value: string, sub?: string, accent = false): HTMLElement {
  const s = el('div', 'stat' + (accent ? ' stat-accent' : ''));
  s.append(el('span', 'stat-label', label));
  const v = el('span', 'stat-value', value);
  if (sub) v.append(el('span', 'stat-sub', sub));
  s.append(v);
  return s;
}

function futureSlot(title: string, hint: string): HTMLElement {
  const root = el('div', 'future-slot');
  const line = el('div', 'future-line');
  line.append(el('span', 'future-title', title), el('span', 'badge-soon', 'Próximamente'));
  root.append(line);
  root.append(el('span', 'future-hint', hint));
  return root;
}

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ============================================================
   SECCIÓN DE BUILD (compartida champ-select / in-game)
   ============================================================ */
function buildSection(build: BuildAdvice | undefined, inGame: boolean): HTMLElement | null {
  if (!build) return null;
  const { root, body } = section({ title: 'Build recomendada', side: inGame ? 'core' : undefined });
  if (!body) return root;

  // Ítems core (rellena hasta 6 con slots vacíos)
  const itemsRow = el('div', 'build-row');
  itemsRow.append(el('span', 'build-label', 'Ítems core'));
  const icons = el('div', 'icon-row');
  build.coreItems.forEach((it, i) => {
    if (i === 3) icons.append(el('span', 'arrow', '›'));
    icons.append(itemIcon(28, it.iconUrl, it.name));
  });
  for (let i = build.coreItems.length; i < 6; i++) icons.append(itemIcon(28));
  itemsRow.append(icons);
  body.append(itemsRow);

  // Habilidades
  if (build.skillOrder) {
    const skillRow = el('div', 'build-row');
    skillRow.append(el('span', 'build-label', 'Habilidades'));
    const sIcons = el('div', 'icon-row');
    const activeLetters = new Set(build.skillOrder.toUpperCase().replace(/[^QWER]/g, '').split(''));
    sIcons.append(skillIcon('P', 26));
    for (const slot of ['Q', 'W', 'E', 'R']) {
      sIcons.append(skillIcon(slot, 26, activeLetters.has(slot)));
    }
    sIcons.append(el('span', 'skill-prio', build.skillOrder));
    skillRow.append(sIcons);
    body.append(skillRow);
  }

  // Hechizos + nota
  const spellRow = el('div', 'build-row');
  spellRow.append(el('span', 'build-label', 'Hechizos'));
  const spIcons = el('div', 'icon-row');
  for (const sp of build.summonerSpells ?? []) spIcons.append(spellIcon(sp, 26));
  if (build.notes) spIcons.append(el('span', 'build-note', build.notes));
  spellRow.append(spIcons);
  body.append(spellRow);

  return root;
}

/** Lista de counters/enfrentamientos. */
function matchupList(matchups: MatchupAdvice[]): HTMLElement {
  const ul = el('ul', 'counters');
  for (const m of matchups) {
    const tone = toneForDifficulty(m.difficulty);
    const li = el('li', `counter c-${tone}`);
    li.append(thumb(32, m.opponentIconUrl, '32px'));
    const main = el('div', 'counter-main');
    const top = el('div', 'counter-top');
    top.append(el('span', 'counter-vs', `vs ${m.opponentName}`));
    top.append(winRate(m.winRate * 100, tone));
    main.append(top);
    if (m.tips[0]) main.append(el('div', 'counter-tip', m.tips[0]));
    li.append(main);
    ul.append(li);
  }
  return ul;
}

/* ============================================================
   PANELES POR FASE
   ============================================================ */
function waitPanel(kind: 'disconnected' | 'idle'): HTMLElement {
  const cfg = kind === 'disconnected'
    ? {
        icon: '⏻', title: 'Cliente cerrado',
        msg: 'Abre el cliente de League of Legends para empezar a recibir sugerencias.',
        steps: ['Inicia el cliente de LoL', 'Inicia sesión', 'El overlay se conectará solo'],
      }
    : {
        icon: '◷', title: 'Esperando partida',
        msg: 'Cliente conectado. Entra en cola o en selección de campeón y aquí aparecerán tus picks y builds.',
        steps: ['Cola clasificatoria o normal', 'Selección de campeón', 'Partida en curso'],
      };
  const body = el('div', 'panel-body wait');
  body.append(el('div', 'wait-glyph', cfg.icon));
  body.append(el('h2', 'wait-title', cfg.title));
  body.append(el('p', 'wait-msg', cfg.msg));
  const ol = el('ol', 'wait-steps');
  cfg.steps.forEach((s, i) => {
    const li = el('li');
    li.append(el('span', 'step-n', String(i + 1)), el('span', undefined, s));
    ol.append(li);
  });
  body.append(ol);
  if (kind === 'idle') {
    const foot = el('div', 'wait-foot');
    foot.append(el('span', 'dot-pulse'), el('span', undefined, 'Sincronizado · perfil cargado'));
    body.append(foot);
  }
  return body;
}

function champSelectPanel(state: AppState): HTMLElement {
  const cs = state.champSelect!;
  const body = el('div', 'panel-body');
  const local = cs.state.myTeam.find((p) => p.isLocalPlayer);

  // cabecera: tu pick + rol
  const head = el('div', 'you-head cs');
  head.append(thumb(48, local?.iconUrl, 'champ 48px'));
  const meta = el('div', 'you-meta');
  meta.append(el('div', 'you-name', local?.championName ?? 'Sin bloquear'));
  const tags = el('div', 'you-tags');
  if (local?.assignedPosition) tags.append(pill(local.assignedPosition, 'role'));
  tags.append(pill(local?.championId ? 'Bloqueado' : 'Eligiendo', 'ghost'));
  meta.append(tags);
  head.append(meta);
  body.append(head);

  // picks sugeridos
  if (cs.suggestions.length) {
    const { root, body: secBody } = section({ title: 'Picks sugeridos', side: local?.assignedPosition });
    const ul = el('ul', 'picks');
    for (const s of cs.suggestions) {
      const li = el('li', 'pick');
      li.append(thumb(32, s.championIconUrl, '32px'));
      const main = el('div', 'pick-main');
      const top = el('div', 'pick-top');
      top.append(el('span', 'pick-name', s.championName));
      top.append(winRate(s.winRate * 100, toneForPct(s.winRate * 100)));
      main.append(top);
      main.append(el('div', 'pick-reason', s.reason));
      li.append(main);
      li.append(pill(`${Math.round(s.pickRate * 100)}% PR`, 'diff'));
      ul.append(li);
    }
    secBody?.append(ul);
    body.append(root);
  }

  // build
  const build = buildSection(cs.build, false);
  if (build) body.append(build);

  // counters
  if (cs.counters.length) {
    const { root, body: secBody } = section({ title: 'Counters del rival' });
    secBody?.append(matchupList(cs.counters));
    body.append(root);
  }

  // runas (próximamente)
  const runes = section({ title: 'Runas recomendadas', soon: true, collapsible: true, defaultOpen: false });
  if (runes.body) {
    const preview = el('div', 'rune-preview');
    const primary = el('div', 'rune-tree');
    primary.append(runeIcon(30, true));
    const row = el('div', 'rune-row');
    row.append(runeIcon(24), runeIcon(24), runeIcon(24));
    primary.append(row);
    const secondary = el('div', 'rune-tree secondary');
    const row2 = el('div', 'rune-row');
    row2.append(runeIcon(22), runeIcon(22));
    secondary.append(row2);
    preview.append(primary, secondary);
    runes.body.append(preview);
  }
  body.append(runes.root);

  body.append(futureSlot('Ruta de build · timeline', 'Orden de compra con timings de oro'));
  body.append(futureSlot('Tier list & sugerencias de baneo', 'Mejores picks del parche por rol'));
  return body;
}

function inGamePanel(state: AppState): HTMLElement {
  const live = state.live!;
  const body = el('div', 'panel-body');
  const champName = live.selfChampionName
    ?? live.allies.find((p) => p.summonerName === live.self.summonerName)?.championName
    ?? live.self.summonerName;

  // cabecera
  const head = el('div', 'you-head ig');
  head.append(thumb(48, live.selfChampionIconUrl, 'champ 48px'));
  const meta = el('div', 'you-meta');
  const nameRow = el('div', 'you-name-row');
  nameRow.append(el('span', 'you-name', champName));
  nameRow.append(el('span', 'lvl', `Nv ${live.self.level}`));
  meta.append(nameRow);
  const kdaLine = el('div', 'kda-line');
  if (live.selfScores) {
    const s = live.selfScores;
    const kda = el('span', 'kda');
    kda.append(el('b', undefined, String(s.kills)), document.createTextNode('/'),
      el('b', undefined, String(s.deaths)), document.createTextNode('/'),
      el('b', undefined, String(s.assists)));
    kdaLine.append(kda, el('span', 'kda-label', 'KDA'), el('span', 'div'));
    const cs = el('span', 'cs');
    cs.append(el('b', undefined, String(s.creepScore)), document.createTextNode(' CS'));
    kdaLine.append(cs);
  }
  const gold = el('span', 'gold');
  gold.append(el('b', undefined, `${(live.self.currentGold / 1000).toFixed(1)}k`), document.createTextNode(' oro'));
  kdaLine.append(gold);
  meta.append(kdaLine);
  head.append(meta);
  const gt = el('div', 'game-time');
  gt.append(el('span', 'clock-ico', '◷'), document.createTextNode(fmtTime(live.game.gameTime)));
  head.append(gt);
  body.append(head);

  // estadísticas
  const cs = live.self.championStats;
  const { root: statRoot, body: statBody } = section({ title: 'Estadísticas' });
  if (statBody) {
    const grid = el('div', 'stat-grid');
    grid.append(
      stat('Vida', String(Math.round(cs.currentHealth)), '/' + Math.round(cs.maxHealth), true),
      stat('AD', String(Math.round(cs.attackDamage))),
      stat('AP', String(Math.round(cs.abilityPower))),
      stat('Armadura', String(Math.round(cs.armor))),
      stat('Res. mág.', String(Math.round(cs.magicResist))),
      stat('Vel. mov.', String(Math.round(cs.moveSpeed))),
    );
    statBody.append(grid);
  }
  body.append(statRoot);

  // build
  const build = buildSection(live.build, true);
  if (build) body.append(build);

  // enfrentamientos
  if (live.matchups.length) {
    const { root, body: secBody } = section({ title: 'Enfrentamientos' });
    secBody?.append(matchupList(live.matchups));
    body.append(root);
  }

  // objetivos (próximamente)
  const obj = section({ title: 'Temporizadores de objetivos', soon: true, collapsible: true, defaultOpen: false });
  if (obj.body) {
    const row = el('div', 'obj-row');
    for (const [name, t] of [['Dragón', '—:—'], ['Barón', '—:—'], ['Heraldo', '—:—']]) {
      const o = el('div', 'obj');
      o.append(el('div', 'ph ph-obj'), el('span', 'obj-name', name), el('span', 'obj-timer', t));
      row.append(o);
    }
    obj.body.append(row);
  }
  body.append(obj.root);

  body.append(futureSlot('Cooldowns de habilidades enemigas', 'Tracker Q/W/E/R con timers'));
  body.append(futureSlot('Damage meter · Visión / wards', 'Daño por jugador · ward score'));
  return body;
}

/* ============================================================
   POPOVER DE AJUSTES
   ============================================================ */
/* ---- Pestaña General: gestión de assets ---- */
function assetsSection(): HTMLElement {
  const sec = el('div', 'sp-section');
  sec.append(el('div', 'sp-section-title', 'Assets del juego'));

  const installed = assetsInfo?.version ?? lastState?.ddragonVersion ?? '—';
  const infoRow = el('div', 'sp-row');
  const lbl = el('div', 'sp-label');
  lbl.append(el('span', undefined, 'Versión de datos'));
  lbl.append(el('span', 'val', installed));
  infoRow.append(lbl);
  sec.append(infoRow);

  // Estado / progreso
  const status = el('div', 'sp-assets-status');
  if (assetsProgress) {
    const p = assetsProgress;
    const labels: Record<AssetsProgress['phase'], string> = {
      check: 'Comprobando versión…',
      data: 'Descargando datos…',
      icons: `Descargando iconos… ${p.done}/${p.total}`,
      done: `Actualizado a ${p.version}`,
      'up-to-date': 'Ya tienes la última versión',
    };
    status.append(el('span', undefined, labels[p.phase]));
    if (p.phase === 'icons' && p.total > 0) {
      const bar = el('div', 'sp-progress');
      const fill = el('div', 'sp-progress-fill');
      fill.style.width = `${Math.round((p.done / p.total) * 100)}%`;
      bar.append(fill);
      status.append(bar);
    }
  } else if (assetsInfo && !assetsInfo.ready) {
    status.append(el('span', 'sp-hint', 'Iconos no descargados aún.'));
  }
  sec.append(status);

  const btn = el('button', 'sp-btn' + (assetsBusy ? ' is-busy' : ''));
  btn.textContent = assetsBusy ? 'Actualizando…' : 'Actualizar assets';
  btn.disabled = assetsBusy;
  btn.addEventListener('click', () => void runAssetsUpdate());
  sec.append(btn);
  sec.append(el('div', 'sp-hint', 'Descarga campeones e ítems del último parche y los guarda en local. Solo usa internet al actualizar.'));

  return sec;
}

async function runAssetsUpdate(): Promise<void> {
  if (assetsBusy) return;
  assetsBusy = true;
  assetsProgress = { phase: 'check', version: assetsInfo?.version ?? null, done: 0, total: 0 };
  render();
  try {
    await window.overlay.updateAssets(false);
    assetsInfo = await window.overlay.getAssetsInfo();
  } catch (err) {
    assetsProgress = null;
    console.error('Fallo al actualizar assets', err);
  } finally {
    assetsBusy = false;
    render();
  }
}

function settingsPopover(): HTMLElement {
  const pop = el('div', 'settings-pop');

  const headRow = el('div', 'sp-head');
  headRow.append(el('span', 'sp-title', 'Ajustes'));
  const close = el('button', 'ctrl-btn', '✕');
  close.title = 'Cerrar';
  close.addEventListener('click', () => { showSettings = false; render(); });
  headRow.append(close);
  pop.append(headRow);

  // Pestañas
  const tabs = el('div', 'sp-tabs');
  const mkTab = (id: 'general' | 'apariencia', label: string) => {
    const t = el('button', 'sp-tab' + (settingsTab === id ? ' active' : ''), label);
    t.addEventListener('click', () => {
      settingsTab = id;
      LS.set('settingsTab', id);
      render();
    });
    return t;
  };
  tabs.append(mkTab('general', 'General'), mkTab('apariencia', 'Apariencia'));
  pop.append(tabs);

  if (settingsTab === 'general') {
    pop.append(assetsSection());
    return pop;
  }

  // --- Apariencia ---
  // Opacidad
  const opRow = el('div', 'sp-row');
  const opLabel = el('div', 'sp-label');
  opLabel.append(el('span', undefined, 'Opacidad'));
  const opVal = el('span', 'val', `${Math.round(opacity * 100)}%`);
  opLabel.append(opVal);
  opRow.append(opLabel);
  const opInput = el('input');
  opInput.type = 'range'; opInput.min = '0.4'; opInput.max = '1'; opInput.step = '0.02';
  opInput.value = String(opacity);
  opInput.addEventListener('input', () => {
    opacity = Number(opInput.value);
    opVal.textContent = `${Math.round(opacity * 100)}%`;
    applyUiVars();
    LS.set('opacity', String(opacity));
  });
  opRow.append(opInput);
  pop.append(opRow);

  // Escala
  const scRow = el('div', 'sp-row');
  const scLabel = el('div', 'sp-label');
  scLabel.append(el('span', undefined, 'Escala'));
  const scVal = el('span', 'val', `${Math.round(scale * 100)}%`);
  scLabel.append(scVal);
  scRow.append(scLabel);
  const scInput = el('input');
  scInput.type = 'range'; scInput.min = '0.8'; scInput.max = '1.3'; scInput.step = '0.02';
  scInput.value = String(scale);
  scInput.addEventListener('input', () => {
    scale = Number(scInput.value);
    scVal.textContent = `${Math.round(scale * 100)}%`;
    applyUiVars();
    LS.set('scale', String(scale));
  });
  scRow.append(scInput);
  pop.append(scRow);

  // Tema / paleta
  const palRow = el('div', 'sp-row');
  const palLabel = el('div', 'sp-label');
  const current = PALETTES.find((p) => p.id === palId) ?? PALETTES[0];
  palLabel.append(el('span', undefined, 'Tema / paleta'));
  palLabel.append(el('span', 'val', current.name));
  palRow.append(palLabel);
  const themes = el('div', 'sp-themes');
  for (const p of PALETTES) {
    const sw = el('span', 'sp-theme' + (p.id === palId ? ' active' : ''));
    sw.title = `${p.name} — ${p.desc}`;
    setVar(sw, 'background', `linear-gradient(135deg,${p.vars['--accent']},${p.vars['--accent2']})`);
    sw.addEventListener('click', () => {
      palId = p.id;
      applyPalette(palId);
      LS.set('pal', palId);
      render();
    });
    themes.append(sw);
  }
  palRow.append(themes);
  palRow.append(el('div', 'sp-theme-name', current.desc));
  pop.append(palRow);

  return pop;
}

/* ============================================================
   BACK OFFICE / ANALÍTICA
   ============================================================ */
const ROLE_PILLS: Array<[string, string]> = [
  ['ALL', 'Todos'], ['TOP', 'Top'], ['JUNGLE', 'Jungla'],
  ['MIDDLE', 'Mid'], ['BOTTOM', 'ADC'], ['UTILITY', 'Support'],
];
const AN_COLS: Array<{ key: AnSortKey; label: string }> = [
  { key: 'championName', label: 'Campeón' },
  { key: 'games', label: 'Juegos' },
  { key: 'winRate', label: 'Win %' },
  { key: 'pickRate', label: 'Pick %' },
  { key: 'banRate', label: 'Ban %' },
];

function openAnalytics(): void {
  showAnalytics = true;
  showSettings = false;
  setInteractive(true); // el back office necesita ratón sí o sí
  if (!anLoaded && !anLoading) void loadAnalytics();
  else render();
}
function closeAnalytics(): void {
  showAnalytics = false;
  if (!pinned) setInteractive(false);
  render();
}

async function loadAnalytics(): Promise<void> {
  anLoading = true;
  render();
  try {
    anMeta = await window.analytics.meta(anRegion || undefined);
    if (anMeta.region) anRegion = anMeta.region;
    if (anPatch !== 'all' && !anMeta.patches.includes(anPatch)) anPatch = 'all';
    anRows = anRegion ? await window.analytics.champions(anRegion, anPatch) : [];
    anLoaded = true;
  } catch (err) {
    anRows = [];
    console.error('Fallo al cargar analítica', err);
  } finally {
    anLoading = false;
    render();
  }
}

async function reloadChampions(): Promise<void> {
  anLoading = true;
  render();
  try {
    anRows = anRegion ? await window.analytics.champions(anRegion, anPatch) : [];
  } catch (err) {
    anRows = [];
    console.error('Fallo al consultar campeones', err);
  } finally {
    anLoading = false;
    render();
  }
}

function analyticsFiltered(): ChampionStatRow[] {
  const q = anSearch.trim().toLowerCase();
  const rows = anRows.filter(
    (r) =>
      (anRole === 'ALL' || r.role === anRole) &&
      r.games >= anMinGames &&
      r.winRate * 100 >= anMinWR &&
      (!q || r.championName.toLowerCase().includes(q)),
  );
  rows.sort((a, b) => {
    const A = a[anSortKey];
    const B = b[anSortKey];
    return typeof A === 'string'
      ? String(A).localeCompare(String(B)) * anSortDir
      : ((A as number) - (B as number)) * anSortDir;
  });
  return rows;
}

/** Repinta solo resumen + tabla (sin tocar los controles ni el foco). */
function renderAnalyticsTable(): void {
  if (!anSummaryHost || !anTableHost) return;
  const rows = analyticsFiltered();

  anSummaryHost.replaceChildren();
  const total = anMeta?.totalGames ?? 0;
  anSummaryHost.append(
    el('span', 'an-sum-strong', String(rows.length)),
    el('span', undefined, ' campeones · '),
    el('span', undefined, `${total} partidas · parche ${anPatch === 'all' ? 'todos' : anPatch}`),
  );

  anTableHost.replaceChildren();
  if (anLoading) {
    anTableHost.append(el('div', 'an-empty', 'Cargando…'));
    return;
  }
  if (!anRows.length) {
    anTableHost.append(
      el('div', 'an-empty',
        anMeta && anMeta.regions.length === 0
          ? 'No hay bases de datos. Ejecuta: npm run collect → aggregate → build-db.'
          : 'Sin datos para esta región/parche.'),
    );
    return;
  }
  if (!rows.length) {
    anTableHost.append(el('div', 'an-empty', 'Ningún campeón pasa los filtros.'));
    return;
  }

  const table = el('table', 'an-table');
  const thead = el('thead');
  const htr = el('tr');
  for (const col of AN_COLS) {
    const sorted = anSortKey === col.key;
    const th = el('th', 'an-th' + (sorted ? ' sorted' + (anSortDir === 1 ? ' asc' : '') : ''), col.label);
    th.addEventListener('click', () => {
      if (anSortKey === col.key) anSortDir = (anSortDir === 1 ? -1 : 1);
      else { anSortKey = col.key; anSortDir = col.key === 'championName' ? 1 : -1; }
      LS.set('anSortKey', anSortKey);
      LS.set('anSortDir', anSortDir === 1 ? 'asc' : 'desc');
      renderAnalyticsTable();
    });
    htr.append(th);
  }
  thead.append(htr);
  table.append(thead);

  const tbody = el('tbody');
  for (const r of rows) {
    const tr = el('tr', 'an-row');
    const cName = el('td', 'an-champ');
    cName.append(thumb(26, r.iconUrl ?? undefined, r.championName));
    const nm = el('div', 'an-champ-meta');
    nm.append(el('span', 'an-champ-name', r.championName));
    nm.append(el('span', 'an-champ-role', ROLE_PILLS.find((p) => p[0] === r.role)?.[1] ?? r.role));
    cName.append(nm);
    tr.append(cName);

    tr.append(el('td', 'an-num', String(r.games)));

    const tone = toneForPct(r.winRate * 100);
    const wrCell = el('td');
    wrCell.append(winRate(r.winRate * 100, tone));
    tr.append(wrCell);

    tr.append(el('td', 'an-num', (r.pickRate * 100).toFixed(1)));
    tr.append(el('td', 'an-num', (r.banRate * 100).toFixed(1)));
    tbody.append(tr);
  }
  table.append(tbody);
  anTableHost.append(table);
}

function analyticsView(): HTMLElement {
  const root = el('div', 'analytics');

  // Cabecera
  const head = el('div', 'an-head');
  head.append(el('span', 'an-title', 'Back office · estadísticas'));
  const close = el('button', 'ctrl-btn', '✕');
  close.title = 'Cerrar back office';
  close.addEventListener('click', closeAnalytics);
  head.append(el('span', 'ctrl-spacer'), close);
  root.append(head);

  // Fila 1: región, parche, búsqueda, recargar
  const bar1 = el('div', 'an-bar');

  const regSel = el('select', 'an-select');
  const regions = anMeta?.regions ?? [];
  if (!regions.length) regSel.append(el('option', undefined, '— sin datos —'));
  for (const rg of regions) {
    const o = el('option', undefined, rg.toUpperCase());
    o.value = rg;
    if (rg === anRegion) o.selected = true;
    regSel.append(o);
  }
  regSel.addEventListener('change', () => {
    anRegion = regSel.value;
    LS.set('anRegion', anRegion);
    void loadAnalytics(); // región nueva => recargar meta + filas
  });
  bar1.append(labeled('Región', regSel));

  const patchSel = el('select', 'an-select');
  const allOpt = el('option', undefined, 'Todos');
  allOpt.value = 'all';
  if (anPatch === 'all') allOpt.selected = true;
  patchSel.append(allOpt);
  for (const pt of anMeta?.patches ?? []) {
    const o = el('option', undefined, pt);
    o.value = pt;
    if (pt === anPatch) o.selected = true;
    patchSel.append(o);
  }
  patchSel.addEventListener('change', () => {
    anPatch = patchSel.value;
    LS.set('anPatch', anPatch);
    void reloadChampions();
  });
  bar1.append(labeled('Parche', patchSel));

  const search = el('input', 'an-input') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = 'Buscar campeón…';
  search.value = anSearch;
  search.addEventListener('input', () => {
    anSearch = search.value;
    renderAnalyticsTable();
  });
  bar1.append(labeled('Buscar', search));

  const reload = el('button', 'an-btn', '↻');
  reload.title = 'Recargar desde la base';
  reload.addEventListener('click', () => void loadAnalytics());
  bar1.append(reload);
  root.append(bar1);

  // Fila 2: roles + sliders
  const bar2 = el('div', 'an-bar an-bar-filters');
  const pills = el('div', 'an-pills');
  for (const [val, label] of ROLE_PILLS) {
    const p = el('span', 'an-pill' + (anRole === val ? ' on' : ''), label);
    p.addEventListener('click', () => {
      anRole = val;
      LS.set('anRole', anRole);
      pills.querySelectorAll('.an-pill').forEach((x) => x.classList.remove('on'));
      p.classList.add('on');
      renderAnalyticsTable();
    });
    pills.append(p);
  }
  bar2.append(pills);

  bar2.append(slider('Mín. juegos', anMinGames, 1, 50, 1, (v) => {
    anMinGames = v;
    LS.set('anMinGames', String(v));
    renderAnalyticsTable();
  }));
  bar2.append(slider('WR mín. %', anMinWR, 0, 60, 1, (v) => {
    anMinWR = v;
    LS.set('anMinWR', String(v));
    renderAnalyticsTable();
  }));
  root.append(bar2);

  // Resumen + tabla (hosts repintables)
  anSummaryHost = el('div', 'an-summary');
  root.append(anSummaryHost);
  anTableHost = el('div', 'an-table-host');
  root.append(anTableHost);
  renderAnalyticsTable();

  return root;
}

/** Pequeño wrapper etiqueta + control para las barras de filtros. */
function labeled(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', 'an-field');
  wrap.append(el('span', 'an-field-label', label), control);
  return wrap;
}

/** Slider con etiqueta y valor en vivo (no dispara render global). */
function slider(
  label: string, value: number, min: number, max: number, step: number,
  onChange: (v: number) => void,
): HTMLElement {
  const wrap = el('div', 'an-slider');
  const top = el('div', 'an-slider-top');
  top.append(el('span', 'an-field-label', label));
  const out = el('span', 'an-slider-val', String(value));
  top.append(out);
  wrap.append(top);
  const input = el('input') as HTMLInputElement;
  input.type = 'range';
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = String(v);
    onChange(v);
  });
  wrap.append(input);
  return wrap;
}

/* ============================================================
   RENDER PRINCIPAL
   ============================================================ */
/** Cabecera de la ventana = barra de control (fase + botones). */
function controlHeader(state: AppState): HTMLElement {
  const bar = el('div', 'ctrl-bar');

  const dot = el('span', 'status-dot');
  setVar(dot, 'background', PHASES[state.phase].dotVar);
  setVar(dot, 'color', PHASES[state.phase].dotVar);
  bar.append(dot);
  bar.append(el('span', 'phase-text', PHASES[state.phase].label));

  bar.append(el('span', 'ctrl-spacer'));
  bar.append(el('span', 'ctrl-divider'));

  const mkBtn = (icon: string, title: string, onClick: () => void, opts?: { active?: boolean; danger?: boolean }) => {
    const b = el('button', 'ctrl-btn' + (opts?.active ? ' active' : '') + (opts?.danger ? ' danger' : ''), icon);
    b.title = title;
    b.addEventListener('click', onClick);
    return b;
  };
  bar.append(mkBtn('📊', 'Back office · estadísticas', () => { showAnalytics ? closeAnalytics() : openAnalytics(); }, { active: showAnalytics }));
  bar.append(mkBtn('📌', 'Fijar interactivo (Ctrl+Shift+O)', togglePin, { active: pinned }));
  bar.append(mkBtn(panelHidden ? '🚫' : '👁', 'Mostrar / ocultar contenido', () => { panelHidden = !panelHidden; render(); }, { active: panelHidden }));
  bar.append(mkBtn('↺', 'Restablecer posiciones (Ctrl+Shift+R)', resetLayout));
  bar.append(mkBtn('⚙', 'Ajustes (Alt+,)', () => { showSettings = !showSettings; render(); }, { active: showSettings }));
  bar.append(mkBtn('✕', 'Salir', () => window.overlay.quit(), { danger: true }));

  return bar;
}

/** Ventana única del overlay: cabecera (barra) + cuerpo desplazable. */
function overlayWindow(state: AppState): HTMLElement {
  const region = el('div', 'overlay-region main-region');
  const panel = el('div', 'panel' + (pinned ? ' pinned' : '') + (showAnalytics ? ' analytics-mode' : ''));
  panel.append(controlHeader(state));

  // Back office: ocupa todo el cuerpo de la ventana.
  if (showAnalytics) {
    const scroll = el('div', 'panel-scroll');
    scroll.append(analyticsView());
    panel.append(scroll);
    region.append(panel);
    registerRegion(region, 'main');
    return region;
  }

  // El cuerpo (contenido por fase + ajustes) solo cuando no está colapsado.
  if (!panelHidden) {
    const scroll = el('div', 'panel-scroll');
    if (showSettings) scroll.append(settingsPopover());

    let content: HTMLElement;
    switch (state.phase) {
      case 'in-game':
        content = state.live ? inGamePanel(state) : waitPanel('idle');
        break;
      case 'champ-select':
        content = state.champSelect ? champSelectPanel(state) : waitPanel('idle');
        break;
      case 'idle':
        content = waitPanel('idle');
        break;
      default:
        content = waitPanel('disconnected');
    }
    if (state.error) content.append(el('p', 'err', state.error));
    scroll.append(content);
    panel.append(scroll);
  } else if (showSettings) {
    // Con el contenido oculto, los ajustes siguen accesibles bajo la cabecera.
    const scroll = el('div', 'panel-scroll');
    scroll.append(settingsPopover());
    panel.append(scroll);
  }

  region.append(panel);
  registerRegion(region, 'main');
  return region;
}

function shortcutsRegion(): HTMLElement {
  const region = el('div', 'overlay-region shortcuts');
  const items: Array<[string, string]> = [
    ['Ctrl+Shift+O', 'interactivo'],
    ['Ctrl+Shift+H', 'ocultar'],
    ['Ctrl+Shift+R', 'recolocar'],
    ['Ctrl+Shift+Q', 'salir'],
    ['Alt+,', 'ajustes'],
  ];
  for (const [keys, label] of items) {
    const item = el('span', 'sc-item');
    keys.split('+').forEach((k, i, arr) => {
      item.append(el('kbd', undefined, k));
      if (i < arr.length - 1) item.append(document.createTextNode('+'));
    });
    item.append(document.createTextNode(' ' + label));
    region.append(item);
  }
  registerRegion(region, 'shortcuts');
  return region;
}

function render(): void {
  // Durante un arrastre no repintamos: re-crear el DOM desengancharía la región
  // que se está moviendo. El render queda pendiente y se ejecuta al soltar.
  if (dragging) {
    pendingRender = true;
    return;
  }
  const state = lastState ?? {
    phase: 'disconnected' as const, ddragonVersion: null, updatedAt: 0,
  };
  const root = document.getElementById('root')!;
  root.replaceChildren();
  root.append(overlayWindow(state));
  root.append(shortcutsRegion());
}

/* ============================================================
   ARRANQUE
   ============================================================ */
applyPalette(palId);
applyUiVars();
render();
window.overlay.onState((state) => {
  lastState = state;
  render();
});

// Progreso de descarga de assets (emitido por el main durante init/update).
window.overlay.onAssetsProgress((p) => {
  assetsProgress = p;
  if (p.phase === 'check' || p.phase === 'data' || p.phase === 'icons') assetsBusy = true;
  if (p.phase === 'done' || p.phase === 'up-to-date') assetsBusy = false;
  if (showSettings) render();
});

// Carga inicial del estado de assets para la pestaña General.
void window.overlay.getAssetsInfo().then((info) => {
  assetsInfo = info;
  if (showSettings) render();
});
