/**
 * Página Perfil: descarga las últimas partidas ranked del usuario de forma
 * EFÍMERA (el servidor no las persiste; se cachean en localStorage) para
 * usarlas como fuente alternativa en vs Rivales / Sinergias / Pick completo
 * con el toggle "Mis partidas". Nunca se mezclan con la base de análisis.
 */
import { useState } from 'react';
import { ChampionIcon } from '@ui';
import { api } from '../api';
import { LS, useStore } from '../state/store';

export function ProfilePage() {
  const s = useStore();
  const [apiKey, setApiKey] = useState(() => LS.get('apiKey', ''));
  const [riotId, setRiotId] = useState(() => s.profile?.riotId ?? '');
  const [limit, setLimit] = useState('20');
  const defaultRegion = s.profile?.region ?? (s.region !== 'all' && !s.region.includes(',') ? s.region : 'la2');
  const [playerRegion, setPlayerRegion] = useState(defaultRegion);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [statusClass, setStatusClass] = useState('status');

  const run = async (overrides?: { riotId: string; region: string }) => {
    const id = (overrides?.riotId ?? riotId).trim();
    const region = overrides?.region ?? playerRegion;
    if (!id.includes('#')) { alert('Ingresa el Riot ID con formato NombreJugador#TAG'); return; }
    if (!apiKey) { alert('Falta la API key de Riot (ingresala en la sección de arriba).'); return; }

    setBusy(true);
    setStatus('Descargando… puede tardar unos segundos.');
    setStatusClass('status');
    try {
      const data = await api.profileMatches({ apiKey, riotId: id, limit: Number(limit) || 20, region });
      s.setProfile(data);
      setStatus(`✓ Listo: ${data.matches.length} partidas cargadas.`);
      setStatusClass('status ok');
    } catch (err) {
      setStatus('⚠ ' + (err instanceof Error ? err.message : String(err)));
      setStatusClass('status err');
    } finally {
      setBusy(false);
    }
  };

  const profile = s.profile;
  const myGames = profile?.matches.filter((m) => m.participants.some((p) => p.me)) ?? [];
  const myWins = myGames.filter((m) => m.participants.find((p) => p.me)?.win).length;
  const winRate = myGames.length ? ((myWins / myGames.length) * 100).toFixed(1) : null;

  // Top de campeones más jugados por el dueño del perfil
  const champCounts = new Map<string, number>();
  for (const m of myGames) {
    const me = m.participants.find((p) => p.me)!;
    champCounts.set(me.championName, (champCounts.get(me.championName) ?? 0) + 1);
  }
  const topChamps = [...champCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const serverLabel = (key: string) => {
    const sv = s.servers.find((x) => x.key === key);
    return sv ? `${sv.label} (${sv.key})` : key.toUpperCase();
  };

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>API key de Riot</h2>
        </div>
        <div className="form-grid">
          <label>
            API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); LS.set('apiKey', e.target.value); }}
              placeholder="RGAPI-…"
            />
          </label>
        </div>
        <p className="hint">La dev key caduca cada 24h; se guarda solo en este navegador.</p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Mi perfil</h2>
          {status && <span className={statusClass}>{status}</span>}
        </div>
        <div className="form-grid">
          <label>
            Riot ID
            <input
              type="text"
              placeholder="NombreJugador#TAG"
              value={riotId}
              onChange={(e) => setRiotId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
            />
          </label>
          <label>
            Últimas N partidas
            <input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
          <label>
            Servidor
            <select value={playerRegion} onChange={(e) => setPlayerRegion(e.target.value)}>
              {s.servers.map((sv) => (
                <option key={sv.key} value={sv.key}>{sv.label} ({sv.key})</option>
              ))}
            </select>
          </label>
          <button className="btn-primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Descargando…' : 'Descargar partidas'}
          </button>
        </div>
        <p className="hint">
          Estas partidas se guardan solo en tu navegador y no se agregan a la base de datos ni a los
          análisis globales. Actívalas con el botón "Mis partidas" en vs Rivales, Sinergias y Pick completo.
        </p>
      </section>

      {profile && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h2>Perfil cargado</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => void run({ riotId: profile.riotId, region: profile.region })}
              >
                Refrescar
              </button>
              <button disabled={busy} onClick={() => { s.setProfile(null); setStatus(''); }}>
                Borrar perfil
              </button>
            </div>
          </div>
          <p>
            <strong>{profile.riotId}</strong> · {serverLabel(profile.region)} · {profile.matches.length} partidas
            {winRate !== null && <> · {myWins}V / {myGames.length - myWins}D ({winRate}% WR)</>}
          </p>
          <p className="hint">Descargado el {new Date(profile.fetchedAt).toLocaleString()}.</p>
          {topChamps.length > 0 && (
            <div className="rec-context">
              <span>Más jugados:</span>
              {topChamps.map(([name, n]) => (
                <span key={name} className="rec-enemy-chip">
                  <ChampionIcon name={name} />
                  {name} ({n})
                </span>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
