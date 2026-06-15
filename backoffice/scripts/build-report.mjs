/**
 * Genera un dashboard HTML autocontenido a partir de champion-stats.json.
 * La data va embebida en el propio HTML, así que funciona con doble clic
 * (file://), sin servidor ni dependencias.
 *
 * Uso:  node scripts/build-report.mjs [region]   (def. la2)
 * Salida: data/<region>/champion-stats.html
 */
import fs from 'fs';
import path from 'path';

const region = process.argv[2] || 'la2';
const jsonPath = path.resolve('data', region, 'champion-stats.json');
if (!fs.existsSync(jsonPath)) {
  console.error(`No existe ${jsonPath}. Corre primero "npm run aggregate".`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Estadísticas de campeones — ${region.toUpperCase()}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    background: #0e1116; color: #e6e6e6;
    font: 14px/1.5 system-ui, Segoe UI, Roboto, sans-serif;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #8a94a6; font-size: 13px; margin-bottom: 16px; }
  .meta b { color: #cdd6f4; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
  .pill {
    padding: 5px 12px; border-radius: 999px; cursor: pointer; user-select: none;
    background: #1b2230; border: 1px solid #2a3245; color: #c0c8d6; font-size: 13px;
  }
  .pill.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
  input[type=search], input[type=number] {
    background: #1b2230; border: 1px solid #2a3245; color: #e6e6e6;
    padding: 6px 10px; border-radius: 8px; font-size: 13px;
  }
  input[type=number] { width: 72px; }
  label { color: #8a94a6; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 7px 10px; text-align: right; white-space: nowrap; }
  th {
    position: sticky; top: 0; background: #151b26; cursor: pointer; user-select: none;
    border-bottom: 2px solid #2a3245; font-weight: 600; color: #cdd6f4;
  }
  th:first-child, td:first-child { text-align: left; }
  th[data-sort]:hover { color: #fff; }
  th.sorted::after { content: ' ▾'; color: #3b82f6; }
  th.sorted.asc::after { content: ' ▴'; }
  tbody tr:nth-child(even) { background: #131922; }
  tbody tr:hover { background: #1c2533; }
  td.champ { display: flex; align-items: center; gap: 8px; }
  td.champ img { width: 24px; height: 24px; border-radius: 4px; background: #222; }
  .role { color: #8a94a6; font-size: 12px; }
  .wr-good { color: #4ade80; font-weight: 600; }
  .wr-bad  { color: #f87171; }
  .count { color: #8a94a6; }
</style>
</head>
<body>
  <h1>Estadísticas de campeones — ${region.toUpperCase()}</h1>
  <div class="meta">
    Parche <b>${data.patchFilter}</b> · Data Dragon <b>${data.ddragonVersion}</b> ·
    <b>${data.totalGames}</b> partidas · <b id="shown">0</b> filas ·
    mínimo del JSON: ${data.minGames} juegos
  </div>

  <div class="controls">
    <span class="pill role-pill active" data-role="ALL">Todos</span>
    <span class="pill role-pill" data-role="TOP">Top</span>
    <span class="pill role-pill" data-role="JUNGLE">Jungla</span>
    <span class="pill role-pill" data-role="MIDDLE">Mid</span>
    <span class="pill role-pill" data-role="BOTTOM">ADC</span>
    <span class="pill role-pill" data-role="UTILITY">Support</span>
    <input type="search" id="q" placeholder="Buscar campeón…">
    <label>mín. juegos <input type="number" id="minGames" value="0" min="0"></label>
  </div>

  <table>
    <thead>
      <tr>
        <th data-sort="championId">Campeón</th>
        <th data-sort="role">Rol</th>
        <th data-sort="games" class="sorted">Juegos</th>
        <th data-sort="winRate">Win&nbsp;%</th>
        <th data-sort="pickRate">Pick&nbsp;%</th>
        <th data-sort="banRate">Ban&nbsp;%</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

<script>
const DATA = ${JSON.stringify(data.rows)};
const VERSION = ${JSON.stringify(data.ddragonVersion)};
const ROLE_LABEL = { TOP:'Top', JUNGLE:'Jungla', MIDDLE:'Mid', BOTTOM:'ADC', UTILITY:'Support' };

let role = 'ALL', query = '', minGames = 0;
let sortKey = 'games', sortDir = -1; // -1 desc, 1 asc

function pct(x){ return (x*100).toFixed(1); }
function wrClass(w){ return w >= 0.5 ? 'wr-good' : 'wr-bad'; }
function icon(id){
  return 'https://ddragon.leagueoflegends.com/cdn/' + VERSION + '/img/champion/' + id + '.png';
}

function render(){
  let rows = DATA.filter(r =>
    (role === 'ALL' || r.role === role) &&
    r.games >= minGames &&
    r.championId.toLowerCase().includes(query)
  );
  rows.sort((a,b) => {
    const A = a[sortKey], B = b[sortKey];
    if (typeof A === 'string') return A.localeCompare(B) * sortDir;
    return (A - B) * sortDir;
  });

  const tbody = document.getElementById('rows');
  tbody.innerHTML = rows.map(r => \`
    <tr>
      <td class="champ"><img loading="lazy" src="\${icon(r.championId)}" alt=""><span>\${r.championId}</span></td>
      <td class="role">\${ROLE_LABEL[r.role] || r.role}</td>
      <td class="count">\${r.games}</td>
      <td class="\${wrClass(r.winRate)}">\${pct(r.winRate)}</td>
      <td>\${pct(r.pickRate)}</td>
      <td>\${pct(r.banRate)}</td>
    </tr>\`).join('');
  document.getElementById('shown').textContent = rows.length;
}

document.querySelectorAll('.role-pill').forEach(p => p.addEventListener('click', () => {
  document.querySelectorAll('.role-pill').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  role = p.dataset.role;
  render();
}));
document.getElementById('q').addEventListener('input', e => { query = e.target.value.toLowerCase(); render(); });
document.getElementById('minGames').addEventListener('input', e => { minGames = Number(e.target.value)||0; render(); });

document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
  const key = th.dataset.sort;
  if (sortKey === key) sortDir *= -1;
  else { sortKey = key; sortDir = (key === 'championId' || key === 'role') ? 1 : -1; }
  document.querySelectorAll('th').forEach(x => x.classList.remove('sorted','asc'));
  th.classList.add('sorted');
  if (sortDir === 1) th.classList.add('asc');
  render();
}));

render();
</script>
</body>
</html>
`;

const outPath = path.resolve('data', region, 'champion-stats.html');
fs.writeFileSync(outPath, html);
console.log('Dashboard generado:', outPath);
