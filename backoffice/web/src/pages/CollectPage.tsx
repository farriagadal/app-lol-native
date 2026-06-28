/**
 * Página de recolección: formulario, rangos y servidores a recolectar y
 * seguimiento del progreso por polling de /api/status. La recolección corre
 * en el servidor con independencia de esta página. Si se eligen varios
 * servidores, se ejecutan secuencialmente.
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { ProgressBar, TierPills, TIERS, type CollectProgress, type CollectStatus } from '@ui';
import { api } from '../api';
import { LS, useStore } from '../state/store';

const ALL_TIERS = TIERS.map((t) => t[0]);

interface RegionSummary {
  region: string;
  totalGames: number;
  totalParticipants: number;
  patches: string[];
}

interface BaseReq {
  apiKey: string;
  maxMatches: number;
  matchesPerPlayer: number;
  maxPlayersPerBucket: number;
  tiers: string[];
  startTime?: number;
  endTime?: number;
}

function PlayerCollectSection({ apiKey, onCollected }: { apiKey: string; onCollected: () => void }) {
  const s = useStore();
  const [riotId, setRiotId] = useState('');
  const [limit, setLimit] = useState('20');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [statusClass, setStatusClass] = useState('status');
  const pollRef = useRef<number | null>(null);

  const stopPoll = () => { if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = null; } };

  const poll = useCallback(() => {
    api.collectPlayerStatus().then((st: { phase: string; riotId?: string; downloaded?: number; skipped?: number; total?: number; error?: string }) => {
      const phases: Record<string, string> = {
        idle: '—',
        resolving: 'Resolviendo Riot ID…',
        'fetching-ids': 'Obteniendo historial de partidas…',
        downloading: `Descargando ${st.downloaded ?? 0}/${st.total ?? 0} partidas (${st.skipped ?? 0} ya guardadas)…`,
        'building-db': 'Reconstruyendo base de datos…',
        done: `✓ Listo: ${st.downloaded ?? 0} partidas nuevas, ${st.skipped ?? 0} ya existían.`,
        error: `⚠ Error: ${st.error ?? ''}`,
      };
      const text = phases[st.phase] ?? st.phase;
      setStatus(text);
      setStatusClass(st.phase === 'error' ? 'status err' : st.phase === 'done' ? 'status ok' : 'status');
      if (st.phase === 'done' || st.phase === 'error') {
        setBusy(false);
        void s.reloadRegions().then(onCollected);
      } else if (st.phase !== 'idle') {
        pollRef.current = window.setTimeout(poll, 1500);
      }
    }).catch(() => {
      pollRef.current = window.setTimeout(poll, 2000);
    });
  }, [s, onCollected]);

  useEffect(() => () => stopPoll(), []);

  const run = async () => {
    const id = riotId.trim();
    if (!id.includes('#')) { alert('Ingresa el Riot ID con formato NombreJugador#TAG'); return; }
    if (!apiKey) { alert('Falta la API key de Riot (ingresala en la sección de arriba).'); return; }
    const singleRegion = s.region && s.region !== 'all' && !s.region.includes(',') ? s.region : null;
    if (!singleRegion) { alert('Selecciona un servidor específico (solo uno) en el filtro Servidor para recolectar partidas de un jugador.'); return; }
    stopPoll();
    setBusy(true);
    setStatus('Iniciando…');
    setStatusClass('status');
    try {
      const res = await api.collectPlayer({ region: singleRegion, apiKey, riotId: id, limit: Number(limit) || 20 });
      if (!res.ok && res.status !== 202) {
        const j = await res.json() as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      pollRef.current = window.setTimeout(poll, 800);
    } catch (err) {
      setStatus('⚠ ' + (err instanceof Error ? err.message : String(err)));
      setStatusClass('status err');
      setBusy(false);
    }
  };

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h2>Recolectar jugador</h2>
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
          <input type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={busy} onClick={run}>
          {busy ? 'Descargando…' : 'Descargar partidas'}
        </button>
      </div>
      <p className="hint">
        Descarga las últimas partidas ranked del jugador directamente desde la API de Riot y las agrega a la base de datos local. Solo trae partidas que no estén ya guardadas.
      </p>
    </section>
  );
}

export function CollectPage() {
  const s = useStore();
  const [collectServers, setCollectServers] = useState<string[]>(() =>
    LS.get('collectServers', 'la2').split(',').filter(Boolean),
  );
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

  const [history, setHistory] = useState<RegionSummary[]>([]);
  const loadHistory = useCallback(() => {
    api.collectHistory().then(setHistory).catch(() => {});
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

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

  const onProgress = useCallback((ev: CollectProgress, serverTag?: string) => {
    const frac = ev.target ? Math.min(1, ev.collected / ev.target) : 0;
    const tag = serverTag ? ` [${serverTag}]` : '';
    const labels: Record<CollectProgress['phase'], string> = {
      starting: `Iniciando${tag}…`,
      collecting: `Recolectando${tag} ${ev.collected}/${ev.target}${ev.bucket ? ' · ' + ev.bucket : ''}`,
      'building-db': `Construyendo base SQLite${tag}…`,
      done: `Listo${tag} · ${ev.collected} partidas`,
      error: 'Error: ' + (ev.message || ''),
    };
    setProgress({ frac, text: labels[ev.phase] || ev.phase });
  }, []);

  // Polling de un servidor; al terminar avanza al siguiente de la cola.
  const pollQueue = useCallback(
    async (queue: string[], idx: number, req: BaseReq) => {
      const region = queue[idx];
      const serverTag = queue.length > 1 ? `${region} ${idx + 1}/${queue.length}` : region;
      let st: CollectStatus;
      try {
        st = await api.status(region);
      } catch {
        pollTimer.current = window.setTimeout(() => pollQueue(queue, idx, req), 2000);
        return;
      }
      if (st.progress) onProgress(st.progress, serverTag);
      showStatus(st);
      if (st.running) {
        pollTimer.current = window.setTimeout(() => pollQueue(queue, idx, req), 1500);
        return;
      }
      // Este servidor terminó: refrescar catálogos.
      await s.reloadRegions();
      loadHistory();
      s.setRegion(region);
      const next = idx + 1;
      if (next < queue.length) {
        // Lanzar el siguiente servidor de la cola.
        const nextRegion = queue[next];
        setProgress({ frac: 0, text: `Iniciando [${nextRegion} ${next + 1}/${queue.length}]…` });
        try {
          const res = await api.collect({ ...req, region: nextRegion });
          if (!res.ok && res.status !== 202) throw new Error('HTTP ' + res.status);
          pollQueue(queue, next, req);
        } catch (err) {
          setProgress({ frac: 0, text: 'Error al lanzar: ' + (err instanceof Error ? err.message : String(err)) });
          setCollecting(false);
        }
      } else {
        setCollecting(false);
      }
    },
    [onProgress, showStatus, s, loadHistory],
  );

  // Estado inicial del primer servidor seleccionado; reanuda si hay algo en curso.
  useEffect(() => {
    const firstServer = collectServers[0];
    if (!firstServer) return;
    let cancel = false;
    api.status(firstServer).then((st) => {
      if (cancel) return;
      showStatus(st);
      if (st.running && !collecting) {
        setCollecting(true);
        setProgress({ frac: 0, text: 'Recolectando…' });
        // Reanuda solo el primer servidor (no sabemos la cola original).
        pollQueue([firstServer], 0, { apiKey: '', maxMatches: 0, matchesPerPlayer: 0, maxPlayersPerBucket: 0, tiers: [] });
      }
    });
    return () => {
      cancel = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectServers[0]]);

  const toggleServer = (key: string) => {
    setCollectServers((cur) => {
      const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
      LS.set('collectServers', next.join(','));
      return next;
    });
  };

  const toggleTier = (t: string) => {
    setTiers((cur) => {
      const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
      LS.set('collectTiers', next.join(','));
      return next;
    });
  };

  const run = async () => {
    if (collecting) return;
    if (!collectServers.length) {
      alert('Elige al menos un servidor a recolectar.');
      return;
    }
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
    const baseReq: BaseReq = {
      apiKey: key,
      maxMatches: Number(max) || 100,
      matchesPerPlayer: Number(perPlayer) || 15,
      maxPlayersPerBucket: Number(bucket) || 40,
      tiers,
      startTime,
      endTime,
    };
    LS.set('apiKey', key);
    LS.set('max', String(baseReq.maxMatches));
    LS.set('perPlayer', String(baseReq.matchesPerPlayer));
    LS.set('bucket', String(baseReq.maxPlayersPerBucket));
    LS.set('collectFrom', collectFrom);
    LS.set('collectTo', collectTo);

    const queue = [...collectServers];
    setCollecting(true);
    setProgress({ frac: 0, text: 'Iniciando…' });
    try {
      const res = await api.collect({ ...baseReq, region: queue[0] });
      if (!res.ok && res.status !== 202) throw new Error('HTTP ' + res.status);
      pollQueue(queue, 0, baseReq);
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
          <span className="tier-label">Servidores a recolectar</span>
          <div className="server-pills">
            {s.servers.map((sv) => (
              <span
                key={sv.key}
                className={'server-pill' + (collectServers.includes(sv.key) ? ' on' : '')}
                title={sv.label}
                onClick={() => toggleServer(sv.key)}
              >
                {sv.label}
                <span className="server-pill-key">{sv.key}</span>
              </span>
            ))}
          </div>
          <span className="tier-hint">
            Con varios servidores se recolectan <b>secuencialmente</b> en el orden elegido.
          </span>
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
      <PlayerCollectSection apiKey={apiKey} onCollected={loadHistory} />
      {history.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Historial de recolecciones</h2>
          </div>
          <div className="collect-hist">
            {history.map((h) => (
              <div key={h.region} className="hist-row">
                <b className="hist-region">{h.region.toUpperCase()}</b>
                <span className="hist-stat">{h.totalGames.toLocaleString()} partidas</span>
                <span className="hist-stat">{h.totalParticipants.toLocaleString()} jugadores</span>
                <span className="hist-patches">parches: {h.patches.join(', ') || '—'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
