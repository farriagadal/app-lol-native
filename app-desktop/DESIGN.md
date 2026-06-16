# LoL Overlay — Brief de diseño

Documento de handoff para diseño. Resume funcionalidades (actuales y futuras),
los tokens de color y los principios visuales del overlay.

## Concepto

Overlay de escritorio **no intrusivo** sobre League of Legends. Paneles oscuros
semitransparentes, *always-on-top* y *click-through*, que muestran información en
vivo sin tapar el juego. Lenguaje visual: técnico, compacto, legible sobre
cualquier fondo de partida.

## Funcionalidades

### Implementadas (v0.1)

- Detección automática de fase: `disconnected → idle → champ-select → in-game`.
- En partida: campeón y nivel, KDA/CS/oro, stats (vida, AD, AP, armadura, MR,
  velocidad), tiempo, build recomendada, enfrentamientos con win rate/dificultad.
- Champ select: rol, picks sugeridos, build, counters de rivales revelados.
- Overlay: ventana transparente always-on-top, click-through, interactividad por
  hover + pin, atajos globales, barra de estado con indicador de fase.

### Roadmap

| Área | Funcionalidad |
|------|---------------|
| Datos reales | Win rates/counters en vivo · build adaptativa a la composición · comparador multi-fuente |
| Pre-partida | Runas · hechizos de invocador · skill order con timings · power spikes |
| En partida | Timers de objetivos (dragón/barón/heraldo) · cooldown de summoners enemigos · vision score · alertas |
| Post-partida | Historial y stats acumuladas |
| Personalización | Tema · posición/tamaño/opacidad · perfiles por campeón/rol · multi-idioma |
| Cuenta | Rango, maestría, perfil |
| Distribución | Instalador + auto-update · panel de ajustes |

## Tokens de color

| Token | Hex | α | Uso |
|-------|-----|---|-----|
| `surface/base` | `#0C1018` | 82% | Fondo de paneles |
| `surface/soft` | `#161C28` | 70% | Chips, ítems, sub-superficies |
| `border` | `#78A0DC` | 25% | Bordes y separadores |
| `text/primary` | `#E6ECF5` | 100% | Texto principal |
| `text/muted` | `#93A3BD` | 100% | Etiquetas, secundario |
| `brand/azure` | `#4AA3FF` | 100% | Acento, champ-select, enlaces |
| `state/good` | `#4AD991` | 100% | In-game, win rate favorable |
| `state/even` | `#E8C84A` | 100% | Idle, matchup parejo |
| `state/bad` | `#FF6B6B` | 100% | Disconnected, matchup difícil |

### Extensiones propuestas (roadmap)

| Token | Hex | Uso |
|-------|-----|-----|
| `objective/teal` | `#36C5B0` | Objetivos / visión |
| `legendary/gold` | `#F0B232` | Premium / maestría |
| `magic/violet` | `#8B7BE8` | Runas / daño mágico (AP) |

### Mapa de estado → color (indicador de fase)

- `in-game` → `state/good` · `champ-select` → `brand/azure`
- `idle` → `state/even` · `disconnected` → `state/bad`

## Principios visuales

- **Superficies**: oscuras y semitransparentes con `backdrop-filter: blur(8–10px)`.
- **Radio**: 12px paneles, 10px barra de control, 8px chips.
- **Borde**: 0.5px, color `border` al 25%.
- **Tipografía**: Segoe UI / system-ui. Tamaños 14px (título), 12px (cuerpo),
  11px (etiquetas en mayúsculas con `letter-spacing`).
- **Pesos**: 400 regular, 500/600 para énfasis y cifras (tabular-nums).
- **Win rate**: codificado por color (good/even/bad), nunca solo por número.
- **Densidad**: alta pero respirable; el overlay no debe competir con el HUD del
  juego.

## Layout

- Barra de control fija arriba-izquierda (única zona siempre interactiva).
- Panel de contenido arriba-derecha, ancho ~360px, scroll interno si hace falta.
- Hints de atajos abajo-izquierda.
