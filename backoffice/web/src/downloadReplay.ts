/**
 * Lanza descarga + reproducción del replay en el cliente de LoL.
 * El servidor descarga el .rofl vía LCU, espera a que termine y luego
 * lanza la reproducción. Puede tardar varios segundos en partidas largas.
 */
export async function watchReplay(
  matchId: string,
  setLoading: (v: boolean) => void,
  puuid?: string | null,
): Promise<void> {
  setLoading(true);
  try {
    const params = new URLSearchParams({ matchId });
    // Si conocemos al jugador y hay API key guardada, el server verifica antes
    // de descargar que la partida siga entre sus últimas 20 (si no, el replay
    // ya no está disponible en el cliente de LoL).
    const apiKey = (localStorage.getItem('bo:apiKey') ?? '').trim();
    if (puuid && apiKey) {
      params.set('puuid', puuid);
      params.set('apiKey', apiKey);
    }
    const res = await fetch(`/api/replay-watch?${params.toString()}`, { method: 'POST' });
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch { /* ignora */ }
      alert(`No se pudo reproducir el replay:\n\n${msg}`);
    }
  } catch {
    alert('No se pudo conectar al servidor local. ¿Está corriendo el back office?');
  } finally {
    setLoading(false);
  }
}

/** Descarga el archivo .rofl al navegador (solo regiones con servidor espectador público). */
export async function downloadReplay(
  matchId: string,
  setLoading: (v: boolean) => void,
): Promise<void> {
  setLoading(true);
  try {
    const res = await fetch(`/api/download-replay?matchId=${encodeURIComponent(matchId)}`);
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try { const j = (await res.json()) as { error?: string }; if (j.error) msg = j.error; } catch { /* ignora */ }
      alert(`No se pudo descargar el replay:\n\n${msg}`);
      return;
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const j = (await res.json()) as { message?: string };
      if (j.message) alert(j.message);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${matchId}.rofl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert('No se pudo conectar al servidor local. ¿Está corriendo el back office?');
  } finally {
    setLoading(false);
  }
}
