# LoL Overlay (Electron + TypeScript)

Overlay de escritorio para League of Legends que muestra **stats en vivo** durante
la partida y **consejos de build/pick/counter** en selección de campeón.

Usa **exclusivamente las APIs oficiales y locales** que el propio cliente expone:

- **Live Client Data API** — `https://127.0.0.1:2999/liveclientdata/...` (cert
  autofirmado), poleada **durante la partida**.
- **LCU API** — autenticada por **lockfile** y suscrita por **WebSocket**, usada
  **en champ select** (y para detectar si el cliente está abierto).

> No lee memoria del juego ni inyecta nada en el proceso. Sólo consume HTTP(S)
> local. Es el enfoque compatible con los Términos de Servicio de Riot.

## Arquitectura

```
src/
├── shared/
│   └── types.ts            Tipos compartidos main <-> renderer (AppState, etc.)
├── main/                   Proceso principal (Node/Electron)
│   ├── main.ts             BrowserWindow transparente, always-on-top, click-through
│   ├── preload.ts          Puente contextIsolation -> window.overlay
│   ├── orchestrator.ts     Une las fuentes y emite un AppState unificado
│   ├── services/
│   │   ├── localHttps.ts   Cliente HTTPS para loopback con cert autofirmado
│   │   ├── liveClient.ts   Poller de la Live Client Data API (en partida)
│   │   ├── lcu.ts          Lockfile + REST + WebSocket de la LCU (champ select)
│   │   └── dataDragon.ts   Datos estáticos (versión, campeones, ítems, iconos)
│   └── analysis/
│       ├── provider.ts     Interfaz StatsProvider (fuente de win rates/counters)
│       ├── dataset.ts      Dataset local de ejemplo (semilla / formato)
│       ├── staticProvider.ts  Proveedor por defecto sobre el dataset local
│       └── engine.ts       Traduce stats crudas a consejos de la UI
└── renderer/               Proceso de render (DOM, sin acceso a Node)
    ├── index.html
    ├── styles.css
    └── renderer.ts         Pinta paneles según la fase + interactividad por hover
```

### Flujo de datos

1. `orchestrator.ts` arranca `DataDragon`, `LiveClient` y `Lcu`.
2. **Champ select**: el WebSocket de la LCU emite `OnJsonApiEvent` sobre
   `/lol-champ-select/v1/session`; se resuelven campeones con Data Dragon y se
   calculan picks/counters/build con `AnalysisEngine`.
3. **En partida**: `LiveClient` polea `allgamedata` cada segundo; se construyen
   stats propias, enfrentamientos y build.
4. El `AppState` resultante viaja por IPC al renderer, que repinta el overlay.

## Requisitos

- Node.js 18+ (el proyecto se probó con Node 20).
- Windows / macOS con el cliente de LoL instalado.

## Uso

```bash
npm install
npm run build      # compila main + renderer y copia los assets
npm start          # build + lanza Electron
# o, en iteración:
npm run dev
```

El overlay funciona aunque el cliente esté cerrado: queda a la espera y se
activa solo al abrir el cliente, entrar en champ select o en partida.

### Atajos globales

| Atajo                | Acción                                              |
| -------------------- | --------------------------------------------------- |
| `Ctrl+Shift+O`       | Fijar / liberar el modo interactivo (clicar la UI)  |
| `Ctrl+Shift+H`       | Mostrar / ocultar el overlay                        |
| `Ctrl+Shift+Q`       | Salir                                               |

### Click-through e interactividad

La ventana está en modo **click-through** (`setIgnoreMouseEvents(true, { forward: true })`):
los clics atraviesan hacia el juego. Como `forward` reenvía los movimientos del
ratón, el renderer detecta cuándo el cursor está sobre una zona interactiva (la
barra de control o un panel) y **sólo entonces** captura el ratón. Con
`Ctrl+Shift+O` puedes fijar el modo interactivo de forma permanente.

> En juegos en **pantalla completa exclusiva**, ningún overlay basado en
> ventana puede dibujarse encima. Usa **modo ventana sin bordes** (borderless),
> que es lo habitual para overlays.

## Datos de win rates / counters

`StaticStatsProvider` sirve un **dataset local de ejemplo** (`analysis/dataset.ts`).
Para datos reales y actualizados, implementa la interfaz `StatsProvider`
(`analysis/provider.ts`) con tu propia fuente —por ejemplo, una API que tú
controles o un volcado periódico que generes aparte respetando los ToS de la
fuente— y pásala al `AnalysisEngine` en `orchestrator.ts`:

```ts
this.analysis = new AnalysisEngine(this.ddragon, new MiProveedor());
```

## Notas técnicas

- El cert autofirmado se acepta con un `https.Agent({ rejectUnauthorized: false })`
  acotado a `127.0.0.1` (ver `services/localHttps.ts`).
- El lockfile se busca en rutas estándar; puedes forzar una con la variable de
  entorno `LOL_LOCKFILE`.
- Data Dragon cachea en disco (`%TEMP%/lol-overlay-ddragon-cache`). El idioma
  por defecto es `es_ES` (configurable en el constructor de `DataDragon`).

## Limitaciones / siguientes pasos

- El dataset incluido es una muestra; conecta una fuente real para producción.
- No hay empaquetado de instalador; añade `electron-builder` si lo necesitas.
- En pantalla completa exclusiva el overlay no es visible (limitación del SO).
