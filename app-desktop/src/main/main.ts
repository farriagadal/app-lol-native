import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'node:path';
import { Overlay } from './orchestrator';
import type { AppState } from '../shared/types';

let win: BrowserWindow | null = null;
let interactive = false; // false => click-through (no captura el ratón)
let lastState: AppState | null = null;
const overlay = new Overlay();

// Evita atenuaciones del compositor sobre la ventana sin foco.
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function applyMouseMode(): void {
  if (!win) return;
  if (interactive) {
    // Modo interactivo: la ventana captura el ratón (botones clicables).
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    win.focus();
  } else {
    // Modo overlay: click-through. `forward` deja que el renderer reciba
    // eventos de movimiento para resaltar zonas sin bloquear los clics.
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setFocusable(false);
  }
  win.webContents.send('interactive-changed', interactive);
}

function createWindow(): void {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Por encima de juegos en modo ventana/borderless.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    applyMouseMode();
    if (lastState) win?.webContents.send('state', lastState);
  });

  win.on('closed', () => {
    win = null;
  });
}

function registerShortcuts(): void {
  // Fijar / liberar el modo interactivo (el renderer gestiona el hover).
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    win?.webContents.send('toggle-pin');
  });
  // Mostrar / ocultar el overlay.
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.show();
  });
  // Restablecer la posición de todas las ventanas del overlay.
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    win?.webContents.send('reset-layout');
  });
  // Salir.
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
}

function wireIpc(): void {
  ipcMain.on('set-interactive', (_e, value: boolean) => {
    interactive = value;
    applyMouseMode();
  });
  ipcMain.on('toggle-visibility', () => {
    if (!win) return;
    win.isVisible() ? win.hide() : win.show();
  });
  ipcMain.on('quit', () => app.quit());
  ipcMain.handle('get-interactive', () => interactive);
  ipcMain.handle('get-assets-info', () => overlay.ddragon.info());
  ipcMain.handle('update-assets', (_e, force: boolean) => overlay.updateAssets(force));
}

app.whenReady().then(async () => {
  createWindow();
  registerShortcuts();
  wireIpc();

  overlay.on('state', (state) => {
    lastState = state;
    win?.webContents.send('state', state);
  });
  overlay.on('assets-progress', (p) => {
    win?.webContents.send('assets-progress', p);
  });

  try {
    await overlay.start(path.join(app.getPath('userData'), 'ddragon'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    win?.webContents.send('state', {
      phase: 'disconnected',
      ddragonVersion: null,
      updatedAt: Date.now(),
      error: `No se pudo iniciar: ${message}`,
    } satisfies AppState);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  overlay.stop();
});

// El overlay no debe cerrar la app al cerrar ventanas en macOS por convención,
// pero aquí es una utilidad de escritorio: cerrar = salir en todas las plataformas.
app.on('window-all-closed', () => app.quit());
