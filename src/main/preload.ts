import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppState,
  AssetsInfo,
  AssetsProgress,
  OverlayApi,
  AnalyticsApi,
  AnalyticsMeta,
  ChampionStatRow,
  CollectRequest,
  CollectStatus,
  CollectProgress,
} from '../shared/types';

/**
 * Puente seguro (contextIsolation) entre el renderer y el proceso main.
 * El renderer no tiene acceso a Node: sólo a esta API acotada.
 */
const api: OverlayApi = {
  onState(cb: (state: AppState) => void): () => void {
    const listener = (_e: unknown, state: AppState) => cb(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
  setInteractive(value: boolean): void {
    ipcRenderer.send('set-interactive', value);
  },
  toggleVisibility(): void {
    ipcRenderer.send('toggle-visibility');
  },
  quit(): void {
    ipcRenderer.send('quit');
  },
  getInteractive(): Promise<boolean> {
    return ipcRenderer.invoke('get-interactive');
  },
  getAssetsInfo(): Promise<AssetsInfo> {
    return ipcRenderer.invoke('get-assets-info');
  },
  updateAssets(force = false): Promise<{ version: string; updated: boolean }> {
    return ipcRenderer.invoke('update-assets', force);
  },
  onAssetsProgress(cb: (p: AssetsProgress) => void): () => void {
    const listener = (_e: unknown, p: AssetsProgress) => cb(p);
    ipcRenderer.on('assets-progress', listener);
    return () => ipcRenderer.removeListener('assets-progress', listener);
  },
};

contextBridge.exposeInMainWorld('overlay', api);

/** Back office: consultas a las bases SQLite del colector. */
const analytics: AnalyticsApi = {
  meta(region?: string): Promise<AnalyticsMeta> {
    return ipcRenderer.invoke('analytics:meta', region);
  },
  champions(region: string, patch?: string): Promise<ChampionStatRow[]> {
    return ipcRenderer.invoke('analytics:champions', region, patch);
  },
  collect(req: CollectRequest): Promise<CollectStatus> {
    return ipcRenderer.invoke('analytics:collect', req);
  },
  status(region: string): Promise<CollectStatus> {
    return ipcRenderer.invoke('analytics:status', region);
  },
  onCollectProgress(cb: (p: CollectProgress) => void): () => void {
    const listener = (_e: unknown, p: CollectProgress) => cb(p);
    ipcRenderer.on('analytics:collect-progress', listener);
    return () => ipcRenderer.removeListener('analytics:collect-progress', listener);
  },
};
contextBridge.exposeInMainWorld('analytics', analytics);

// Canales internos para la gestión de interactividad por hover.
contextBridge.exposeInMainWorld('__overlayInternal', {
  onInteractiveChanged(cb: (v: boolean) => void): void {
    ipcRenderer.on('interactive-changed', (_e, v: boolean) => cb(v));
  },
  onTogglePin(cb: () => void): void {
    ipcRenderer.on('toggle-pin', () => cb());
  },
  onResetLayout(cb: () => void): void {
    ipcRenderer.on('reset-layout', () => cb());
  },
});
