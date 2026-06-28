/** Descarga el replay .rofl de una partida desde el servidor local. */
export async function downloadReplay(
  matchId: string,
  setLoading: (v: boolean) => void,
): Promise<void> {
  setLoading(true);
  try {
    const res = await fetch(`/api/download-replay?matchId=${encodeURIComponent(matchId)}`);
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try {
        const json = (await res.json()) as { error?: string };
        if (json.error) msg = json.error;
      } catch { /* ignora */ }
      alert(`No se pudo descargar el replay:\n\n${msg}`);
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
