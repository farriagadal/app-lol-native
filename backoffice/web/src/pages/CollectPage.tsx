/**
 * Página de recolección: formulario, rangos a recolectar y seguimiento del
 * progreso por polling de /api/status. Portado de runCollect/pollCollect/
 * onProgress/showStatus del app.js. La recolección corre en el servidor con
 * independencia de esta página.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProgressBar, TierPills, TIERS, type CollectProgress, type CollectStatus } from '@ui';
import { api } from '../api';
import { LS, useStore } from '../state/store';

const ALL_TIERS = TIERS.map((t) => t[0]);

export function CollectPage() {
  const s = useStore();
  const [server, setServer] = useState(() => LS.get('server', 'la2'));
  const [apiKey, setApiKey] = useState(() => LS.get('apiKey', ''));
  const [max, setMax] = useState(() => LS.get('max', '500'));
  const [perPlayer, setPerPlayer] = useState(() => LS.get('perPlayer', '15'));
  const [bucket, setBucket] = useState(() => LS.get('bucket', '40'));
  const [collectFrom, setCollectFrom] = useState(() => LS.get('collectFrom', ''));
  const [collectTo, setCollectTo] = useState(() => LS.get('collectTo', ''));
  const [tiers, setTiers] = useState<string[]>(() =>
    LS.get('collectTiers', ALL_TIERS.join(',')).split(',').filter(Boolean),
  );

  const [collecting, setCollecting] = useState(false);
  const [statusText, setStatusText] = useState('—');
  const [statusClass, setStatusClass] = useState('status');
  const [progress, setProgress] = useState<{ frac: number; text: string } | null>(null);
  const pollTimer = useRef<number | null>(null);

  const showStatus = useCallback((st: CollectStatus) => {
    if (st.running) {
      setStatusText('Recolectando…');
      setStatusClass('status');
    } else if (st.lastError) {
      setStatusText(`⚠ ${st.lastError} · ${st.totalMatches} partidas guardadas (pulsa Recolectar para continuar)`);
      setStatusClass('status err');
    } else if (st.lastCollectedAt) {
      setStatusText(`✓ Última actualización: ${new Date(st.lastCollectedAt).toLocaleString()} · ${st.totalMatches} partidas`);
      setStatusClass('status ok');
    } else {
      setStatusText(`Sin recolecciones (${st.totalMatches} partidas en disco)`);
      setStatusClass('status');
    }
  }, []);

  const onProgress = useCallback((ev: CollectProgress) => {
    const frac = ev.target ? Math.min(1, ev.collected / ev.target) : 0;
    const labels: Record<CollectProgress['phase'], string> = {
      starting: 'Iniciando…',
      collecting: `Recolectando ${ev.collected}/${ev.target}${ev.bucket ? ' · ' + ev.bucket : ''}`,
      'building-db': 'Construyendo base SQLite…',
      done: `Listo · ${ev.collected} partidas`,
      error: 'Error: ' + (ev.message || ''),
    };
    setProgress({ frac, text: labels[ev.phase] || ev.phase });
  }, []);

  // Polling hasta que termina. region = servidor en recolección.
  const poll = useCallback(
    async (region: string) => {
      let st: CollectStatus;
      try {
        st = await api.status(region);
      } catch {
        pollTimer.current = window.setTimeout(() => poll(region), 2000);
        return;
      }
      if (st.progress) onProgress(st.progress);
      showStatus(st);
      if (st.running) {
        pollTimer.current = window.setTimeout(() => poll(region), 1500);
        return;
      }
      // Terminado: refrescar catálogos y activar la región recolectada.
      setCollecting(false);
      await s.reloadRegions();
      s.setRegion(region);
    },
    [onProgress, showStatus, s],
  );

  // Estado inicial del servidor seleccionado; reanuda si ya hay algo en curso.
  useEffect(() => {
    let cancel = false;
    api.status(server).then((st) => {
      if (cancel) return;
      showStatus(st);
      if (st.running && !collecting) {
        setCollecting(true);
        setProgress({ frac: 0, text: 'Recolectando…' });
        poll(server);
      }
    });
    return () => {
      cancel = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
    // Solo al cambiar de servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);

  const toggleTier = (t: string) => {
    setTiers((cur) => {
      const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
      LS.set('collectTiers', next.join(','));
      return next;
    });
  };

  const run = async () => {
    if (collecting) return;
    if (!tiers.length) {
      alert('Elige al menos un rango a recolectar.');
      return;
    }
    const key = apiKey.trim();
    if (!key) {
      alert('Falta la API key de Riot.');
      return;
    }
    const startTime = collectFrom ? Math.floor(new Date(collectFrom).getTime() / 1000) : undefined;
    const endTime = collectTo ? Math.floor(new Date(collectTo + 'T23:59:59').getTime() / 1000) : undefined;
    const req = {
      region: server,
      apiKey: key,
      maxMatches: Number(max) || 100,
      matchesPerPlayer: Number(perPlayer) || 15,
      maxPlayersPerBucket: Number(bucket) || 40,
      tiers,
      startTime,
      endTime,
    };
    LS.set('server', server);
    LS.set('apiKey', key);
    LS.set('max', String(req.maxMatches));
    LS.set('perPlayer', String(req.matchesPerPlayer));
    LS.set('bucket', String(req.maxPlayersPerBucket));
    LS.set('collectFrom', collectFrom);
    LS.set('collectTo', collectTo);

    setCollecting(true);
    setProgress({ frac: 0, text: 'Iniciando…' });
    try {
      const res = await api.collect(req);
      if (!res.ok && res.status !== 202) throw new Error('HTTP ' + res.status);
      poll(server);
    } catch (err) {
      setProgress({ frac: 0, text: 'Error al lanzar: ' + (err instanceof Error ? err.message : String(err)) });
      setCollecting(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-head">
          <h2>Recolección</h2>
          <span className={statusClass}>{statusText}</span>
        </div>
        <div className="form-grid">
          <label>
            Servidor
            <select value={server} onChange={(e) => setServer(e.target.value)}>
              {s.servers.map((sv) => (
                <option key={sv.key} value={sv.key}>
                  {sv.label} ({sv.key})
                </option>
              ))}
            </select>
          </label>
          <label>
            API key de Riot
            <input
              type="password"
              placeholder="RGAPI-..."
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <label>
            Máx. partidas (total)
            <input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
          <label>
            Máx. por jugador
            <input type="number" min={1} max={100} value={perPlayer} onChange={(e) => setPerPlayer(e.target.value)} />
          </label>
          <label>
            Jugadores por liga
            <input type="number" min={1} value={bucket} onChange={(e) => setBucket(e.target.value)} />
          </label>
          <label>
            Desde (fecha)
            <input
              type="date"
              value={collectFrom}
              onChange={(e) => setCollectFrom(e.target.value)}
            />
          </label>
          <label>
            Hasta (fecha)
            <input
              type="date"
              value={collectTo}
              onChange={(e) => setCollectTo(e.target.value)}
            />
          </label>
          <button className="btn-primary" disabled={collecting} onClick={run}>
            {collecting ? 'Recolectando…' : 'Recolectar'}
          </button>
        </div>
        <div className="tier-row">
          <span className="tier-label">Rangos a recolectar</span>
          <TierPills selected={tiers} onToggle={toggleTier} />
          <span className="tier-hint">
            El total (máx. partidas) se reparte <b>equitativamente</b> entre los rangos elegidos.
          </span>
        </div>
        {progress && <ProgressBar value={progress.frac} text={progress.text} />}
        <p className="hint">
          <b>Reanudable:</b> si falla o se corta, vuelve a pulsar <b>Recolectar</b> y continúa donde quedó (no
          re-descarga lo ya guardado). La dev key de Riot caduca cada 24h; se guarda solo en este navegador.
        </p>
      </section>
    </div>
  );
}
