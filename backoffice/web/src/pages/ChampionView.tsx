/**
 * Ficha de campeón: matchups (weak/strong/synergy), build e items frecuentes,
 * jugadores y runas. Portado de loadChampionView del app.js.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  AssetImg,
  CircleGrid,
  WinRate,
  kdaFixed,
  useAssets,
  ROLE_LABEL,
  TIER_LABEL,
  type CounterStatRow,
  type ItemStatRow,
  type PlayerStatRow,
  type RuneStatRow,
  type SynergyStatRow,
} from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { champHref } from '../components/links';
import { opggUrl } from '../opgg';

const MIN = 3;
function enough<T extends { games: number }>(arr: T[]): T[] {
  const f = arr.filter((x) => x.games >= MIN);
  return f.length >= 3 ? f : arr;
}

interface Data {
  items: ItemStatRow[];
  players: PlayerStatRow[];
  runes: RuneStatRow[];
  counters: CounterStatRow[];
  synergy: SynergyStatRow[];
}

function CvTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <div className="empty">Sin datos.</div>;
  return (
    <table className="cv-table">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={i ? { textAlign: 'right' } : undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cols, r) => (
          <tr key={r}>
            {cols.map((c, i) => (
              <td key={i} className={i ? 'num' : undefined}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChampionView() {
  const { slug = '' } = useParams();
  const s = useStore();
  const a = useAssets();
  const [data, setData] = useState<Data | null>(null);

  // Resuelve el slug al nombre real del campeón y sincroniza el filtro.
  const champ = useMemo(() => {
    const list = s.meta?.champions ?? [];
    return list.find((c) => c.toLowerCase() === decodeURIComponent(slug).toLowerCase()) || '';
  }, [slug, s.meta]);

  useEffect(() => {
    if (champ && s.champion !== champ) s.setChampion(champ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champ]);

  useEffect(() => {
    let cancel = false;
    if (!s.region || !champ) {
      setData(null);
      return;
    }
    setData(null);
    const f = s.statFilter(champ);
    Promise.all([
      api.stats<ItemStatRow>('items', s.region, f),
      api.stats<PlayerStatRow>('players', s.region, f),
      api.stats<RuneStatRow>('runes', s.region, f),
      api.stats<CounterStatRow>('counters', s.region, f),
      api.stats<SynergyStatRow>('synergy', s.region, f),
    ]).then(([items, players, runes, counters, synergy]) => {
      if (!cancel) setData({ items, players, runes, counters, synergy });
    });
    return () => {
      cancel = true;
    };
  }, [s.region, s.patch, s.tier, s.role, champ]);

  const scope = useMemo(() => {
    const role = s.role === 'ALL' ? 'todos los roles' : ROLE_LABEL[s.role] || s.role;
    const tier = s.tier === 'all' ? 'todos los rangos' : TIER_LABEL[s.tier] || s.tier;
    return `${champ || 'todos los campeones'} · ${role} · ${tier} · parche ${s.patch === 'all' ? 'todos' : s.patch}`;
  }, [champ, s.role, s.tier, s.patch]);

  if (!champ) {
    return (
      <section>
        <div className="cv-header">
          <div className="meta">Selecciona un campeón en el filtro de arriba para ver su ficha.</div>
        </div>
      </section>
    );
  }

  const cp = data ? enough(data.counters) : [];
  const weak = [...cp].sort((x, y) => x.winRate - y.winRate || y.games - x.games);
  const strong = [...cp].sort((x, y) => y.winRate - x.winRate || y.games - x.games);
  const syn = data ? [...enough(data.synergy)].sort((x, y) => y.winRate - x.winRate || y.games - x.games) : [];
  const items = data ? data.items.filter((r) => !a.isTrinketOrConsumable(r.item)) : [];

  return (
    <section>
      <div className="cv-header">
        <AssetImg src={a.champIcon(champ)} />
        <div>
          <div className="name">{champ}</div>
          <div className="meta">{scope}</div>
        </div>
      </div>

      <div className="cv-matchups">
        <div className="mu-card">
          <div className="mu-head">
            <h3>Weak against</h3>
            <span className="arrow">→</span>
          </div>
          <div className="mu-grid">
            {data ? (
              <CircleGrid items={weak} nameOf={(r) => r.opponent} tone="weak" hrefFor={champHref} onSelect={(n) => s.setChampion(n)} />
            ) : (
              <div className="empty">Cargando…</div>
            )}
          </div>
        </div>
        <div className="mu-card">
          <div className="mu-head">
            <h3>Strong against</h3>
            <span className="arrow">→</span>
          </div>
          <div className="mu-grid">
            {data ? (
              <CircleGrid items={strong} nameOf={(r) => r.opponent} tone="strong" hrefFor={champHref} onSelect={(n) => s.setChampion(n)} />
            ) : (
              <div className="empty">Cargando…</div>
            )}
          </div>
        </div>
        <div className="mu-card">
          <div className="mu-head">
            <h3>Best synergy (duo)</h3>
            <span className="arrow">→</span>
          </div>
          <div className="mu-grid">
            {data ? (
              <CircleGrid items={syn} nameOf={(r) => r.champion} tone="strong" hrefFor={champHref} onSelect={(n) => s.setChampion(n)} />
            ) : (
              <div className="empty">Cargando…</div>
            )}
          </div>
        </div>
      </div>

      <div className="cv-grid">
        <div className="cv-card">
          <h3>Items frecuentes</h3>
          <div className="cv-build">
            {items.slice(0, 6).map((r, i) => (
              <span key={r.item} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i ? <span className="arrow">→</span> : null}
                <AssetImg src={a.itemIcon(r.item)} title={a.itemName(r.item)} />
              </span>
            ))}
          </div>
          <CvTable
            headers={['Item', 'Jueg.', 'Win%']}
            rows={items.slice(0, 10).map((r) => [
              <span className="cv-name">
                <AssetImg src={a.itemIcon(r.item)} />
                {a.itemName(r.item)}
              </span>,
              r.games,
              <WinRate value={r.winRate} />,
            ])}
          />
        </div>

        <div className="cv-card">
          <h3>Jugadores</h3>
          <CvTable
            headers={['Jugador', 'Jueg.', 'Win%', 'KDA']}
            rows={(data?.players ?? []).map((p) => [
              p.riotId
                ? <a className="player-link" href={opggUrl(p.riotId, s.region)} target="_blank" rel="noopener noreferrer">{p.riotId}</a>
                : '—',
              p.games,
              <WinRate value={p.winRate} />,
              kdaFixed(p.kda),
            ])}
          />
        </div>

        <div className="cv-card">
          <h3>Runas</h3>
          <CvTable
            headers={['Runa', 'Jueg.', 'Win%']}
            rows={(data?.runes ?? []).slice(0, 8).map((r) => [
              <span className="cv-name">
                <AssetImg src={a.runeIcon(r.keystone)} />
                {a.runeName(r.keystone)}
              </span>,
              r.games,
              <WinRate value={r.winRate} />,
            ])}
          />
        </div>
      </div>
    </section>
  );
}
