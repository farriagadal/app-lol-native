# LoL tools

Monorepo con dos proyectos independientes:

- **`app-desktop/`** — Overlay de escritorio (Electron) para League of Legends,
  usando las APIs oficiales (Live Client Data + LCU), sin leer memoria ni inyectar.
- **`backoffice/`** — Back office web de analítica: colector de la API de Riot,
  base SQLite (sql.js) y panel en el navegador. Sirve en `http://localhost:4317`.

## Arranque rápido

Doble clic en **`start.cmd`** (o `./start.ps1` desde PowerShell). Pregunta qué iniciar:

```
1) App de escritorio (overlay)
2) Back office (web de analítica · http://localhost:4317)
3) Ambos
```

- Si eliges el **back office**, antes libera el puerto **4317** (mata procesos colgados).
- La primera vez instala dependencias solo (`npm install`) en la carpeta elegida.
- Cada proceso arranca en su propia ventana.

## Manual

```powershell
# App de escritorio
cd app-desktop; npm install; npm start

# Back office  ->  http://localhost:4317
cd backoffice; npm install; npm start
```

Ver el README de cada carpeta para más detalle.
