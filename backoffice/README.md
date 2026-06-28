# Back office de analítica (LoL)

Colector de la API de Riot + base SQLite + panel web. El **backend** (servidor
Node, colector y SQLite) está en `src/` (TypeScript, CommonJS). El **frontend**
es una SPA de **React + Vite** en `web/`, que reutiliza los componentes de
presentación compartidos de `../ui` (vía el alias `@ui`, también usables desde la
app Electron).

## Estructura

- `src/server` — servidor HTTP y API (`/api/*`), sirve la SPA construida en `public/`.
- `src/collector` — colector de la API de Riot.
- `web/` — SPA de React (Vite). El build sale a `public/` bajo `/static/*`.
- `../ui` — librería de componentes React compartida (presentación pura).
- `../assets` — assets descargados (servidos en `/assets/*`).

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Compila el backend y arranca el servidor API en `:4317`. |
| `npm run web:dev` | Arranca Vite (HMR) en `:5173` con proxy de `/api` y `/assets` al `:4317`. |
| `npm run build` | Compila backend (`build:server`) y SPA (`build:web` → `public/`). |
| `npm start` | `build` + arranca el servidor sirviendo la SPA construida. |
| `npm run collect` / `aggregate` | Tareas del colector. |
| `npm run assets` | Descarga los assets compartidos a `../assets`. |

## Desarrollo

Dos terminales:

```bash
npm run dev      # API en http://localhost:4317
npm run web:dev  # UI con HMR en http://localhost:5173
```

Abre `http://localhost:5173`. Para probar el resultado final (un solo proceso):

```bash
npm start        # http://localhost:4317
```

> Nota: la SPA construida se emite bajo `/static/*` (no `/assets/*`) porque el
> servidor reserva `/assets/*` para los assets del juego en `../assets`.
