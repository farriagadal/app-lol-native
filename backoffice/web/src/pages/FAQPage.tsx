/** Página FAQ: referencia para analistas sobre lógica, métricas y limitaciones. */
import { useState } from 'react';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-section card">
      <button className="faq-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="faq-caret">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className="faq-body">{children}</div>}
    </div>
  );
}

export function FAQPage() {
  return (
    <div className="page faq-page">
      <h1 className="faq-title">FAQ — Referencia para analistas</h1>

      {/* ── RACHAS ── */}
      <p className="faq-group-label">Rachas</p>

      <Section title="¿Qué es una racha de victorias?">
        <p>
          Es la secuencia consecutiva <strong>más larga</strong> de partidas ganadas dentro del
          historial recolectado. Una derrota corta la cadena; victorias anteriores a ella no se
          acumulan con las posteriores.
        </p>
        <div className="faq-example">
          <span className="faq-win">V</span>
          <span className="faq-win">V</span>
          <span className="faq-loss">D</span>
          <span className="faq-win">V</span>
          <span className="faq-win">V</span>
          <span className="faq-win">V</span>
          <span className="faq-loss">D</span>
        </div>
        <p>Racha más larga del ejemplo: <strong>3 victorias seguidas</strong> (posiciones 4–6).</p>
      </Section>

      <Section title="Algoritmo de detección de racha">
        <p>
          Se recorren las partidas en orden cronológico manteniendo dos contadores: racha actual y
          mejor racha encontrada. Al romperse la cadena el contador actual vuelve a 0.
        </p>
        <pre className="faq-code">{`para cada partida en historial (orden cronológico):
  si partida.victoria:
    racha_actual += 1
    si racha_actual > mejor_racha:
      mejor_racha  = racha_actual
      inicio_mejor = posición_actual
  si no:
    racha_actual = 0   ← racha rota`}</pre>
        <p>
          Las filas <span className="faq-streak-pill">resaltadas en azul</span> en la tabla de
          partidas corresponden exactamente a los juegos de esa racha.
        </p>
      </Section>

      <Section title="Orden de los jugadores y paginación">
        <ol className="faq-list">
          <li>Los jugadores se ordenan de <strong>mayor a menor</strong> longitud de racha.</li>
          <li>En empate de racha, el orden lo determina la base de datos (inserción).</li>
          <li>Se muestran <strong>50 jugadores por página</strong>; navega con Anterior / Siguiente.</li>
          <li>Cambiar cualquier filtro reinicia la paginación al inicio.</li>
        </ol>
      </Section>

      <Section title="¿Cómo se determina el tier del jugador?">
        <p>
          Cada partida almacena el rango en que fue jugada. El emblema que aparece en la tarjeta
          es el <strong>tier más frecuente</strong> entre todas sus partidas bajo los filtros activos.
          Si jugó 8 partidas en Platinum y 3 en Emerald, se muestra Platinum.
        </p>
      </Section>

      <Section title="Badge de racha, win rate y botón de replay">
        <ul className="faq-list">
          <li>
            <span className="faq-badge-demo streak-badge">N victorias seguidas</span>
            {' '}— longitud de la racha más larga detectada.
          </li>
          <li><strong>Total de partidas</strong> — partidas incluidas bajo los filtros actuales.</li>
          <li><strong>% victorias</strong> — win rate global sobre esas partidas.</li>
          <li>
            El botón <strong>▶ Reproducir</strong> aparece solo en la partida del parche más
            reciente del jugador y abre el replay directamente en el cliente de LoL.
          </li>
        </ul>
      </Section>

      {/* ── FILTROS ── */}
      <p className="faq-group-label">Filtros</p>

      <Section title="¿Qué hace cada filtro?">
        <table className="faq-table">
          <thead>
            <tr><th>Filtro</th><th>Efecto</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Región</strong></td><td>Solo partidas del servidor seleccionado (LAN, LAS, NA…)</td></tr>
            <tr><td><strong>Parche</strong></td><td>Solo partidas del parche indicado; "todos" incluye toda la historia</td></tr>
            <tr><td><strong>Rango</strong></td><td>Solo partidas clasificadas en el tier elegido (Iron → Challenger)</td></tr>
            <tr><td><strong>Rol</strong></td><td>Solo partidas jugando en ese carril / posición</td></tr>
            <tr><td><strong>Campeón</strong></td><td>Solo partidas con ese campeón específico</td></tr>
            <tr><td><strong>Fechas</strong></td><td>Solo partidas dentro del rango de fechas indicado</td></tr>
          </tbody>
        </table>
        <p className="faq-note">Los filtros se aplican antes de calcular rachas, win rates y cualquier otra métrica.</p>
      </Section>

      <Section title="¿Cómo afecta mezclar parches a los números?">
        <p>
          Seleccionar <strong>"todos los parches"</strong> agrega partidas de meta completamente
          distintas. Esto distorsiona métricas como win rate de ítems o campeones porque un ítem
          puede haber sido nerfado o bufeado entre parches.
        </p>
        <ul className="faq-list">
          <li>Para análisis de meta actual: filtra siempre por el <strong>parche más reciente</strong>.</li>
          <li>Para tendencias históricas: usa "todos" con conciencia de que los números son promedios multi-meta.</li>
          <li>Las rachas en "todos los parches" pueden cruzar parches distintos si el jugador jugó continuamente.</li>
        </ul>
      </Section>

      {/* ── MÉTRICAS ── */}
      <p className="faq-group-label">Métricas</p>

      <Section title="¿Cómo se calcula el win rate de ítems, runas y hechizos?">
        <p>
          Para cada ítem/runa/hechizo se cuentan las partidas en que apareció en la build del
          jugador que ganó (<code>wins</code>) versus el total de partidas en que apareció
          (<code>games</code>). El win rate es <code>wins / games</code>.
        </p>
        <pre className="faq-code">{`win_rate(ítem) = partidas_ganadas_con_ítem / partidas_totales_con_ítem`}</pre>
        <p>
          El orden en la tabla de ítems es por <strong>frecuencia de aparición</strong> (pick rate),
          no por win rate, para que los ítems más representativos aparezcan primero.
        </p>
      </Section>

      <Section title="Win rate y tamaño de muestra: cuándo confiar en el número">
        <p>
          Un win rate del 80% con 5 partidas no es significativo. Como referencia práctica:
        </p>
        <table className="faq-table">
          <thead>
            <tr><th>Partidas</th><th>Confianza</th><th>Uso recomendado</th></tr>
          </thead>
          <tbody>
            <tr><td>&lt; 20</td><td className="faq-bad">Muy baja</td><td>Observación anecdótica</td></tr>
            <tr><td>20 – 49</td><td className="faq-even">Baja</td><td>Tendencia tentativa</td></tr>
            <tr><td>50 – 149</td><td className="faq-good">Media</td><td>Patrón razonablemente estable</td></tr>
            <tr><td>150+</td><td className="faq-good">Alta</td><td>Referencia confiable para decisiones</td></tr>
          </tbody>
        </table>
        <p className="faq-note">
          Filtra por parche y rol para reducir ruido: combinar roles distintos puede inflar o
          deflactar el win rate de un campeón.
        </p>
      </Section>

      <Section title="¿Qué es el KDA y cómo se interpreta?">
        <p>
          <strong>KDA = (Kills + Assists) / max(Deaths, 1)</strong>. Valores orientativos por rol:
        </p>
        <table className="faq-table">
          <thead>
            <tr><th>KDA</th><th>Lectura general</th></tr>
          </thead>
          <tbody>
            <tr><td>&lt; 2.0</td><td>Bajo — muchas muertes relativas a impacto</td></tr>
            <tr><td>2.0 – 3.5</td><td>Promedio competitivo</td></tr>
            <tr><td>3.5 – 5.0</td><td>Bueno — jugador eficiente o partida dominada</td></tr>
            <tr><td>&gt; 5.0</td><td>Excelente o partida muy desequilibrada</td></tr>
          </tbody>
        </table>
        <p className="faq-note">
          El KDA no refleja impacto real: un support puede tener KDA alto sin haber tenido un
          buen desempeño, y un jungler agresivo puede tener KDA bajo generando objetivos.
          Úsalo junto con CS y win rate.
        </p>
      </Section>

      {/* ── DATOS ── */}
      <p className="faq-group-label">Datos recolectados</p>

      <Section title="¿Qué datos se almacenan exactamente?">
        <p>Por cada partida recolectada se guardan:</p>
        <ul className="faq-list">
          <li>Identificador de partida (<code>matchId</code>), región, parche y fecha</li>
          <li>PUUID del jugador y su Riot ID (<code>gameName#tagLine</code>)</li>
          <li>Campeón, rol detectado, resultado (victoria/derrota)</li>
          <li>K / D / A, CS, duración de partida</li>
          <li>Hechizos de invocador (Summoner 1 y 2)</li>
          <li>Runa principal (keystone) y árbol secundario</li>
          <li>Build completa: hasta 6 ítems + trinket</li>
          <li>Rango de la partida (tier + division) si estaba en clasificatoria</li>
        </ul>
        <p className="faq-note">
          No se almacena el detalle completo del partido (estadísticas de los otros 9 jugadores)
          hasta que abres una fila en la tabla de Rachas — esos datos se cargan bajo demanda.
        </p>
      </Section>

      <Section title="Limitaciones del sistema">
        <ul className="faq-list">
          <li>
            <strong>Freshness:</strong> los datos son tan recientes como la última recolección.
            La API de Riot tiene rate limits; recolectar 200 jugadores puede tardar varios minutos.
          </li>
          <li>
            <strong>Historial limitado:</strong> la API de Riot entrega hasta 100 partidas por
            jugador en la región. Jugadores con más partidas tendrán solo las más recientes.
          </li>
          <li>
            <strong>Partidas sin rango:</strong> las partidas normales y ARAM no tienen tier;
            el filtro de rango las excluye completamente.
          </li>
          <li>
            <strong>Rol inferido:</strong> el rol (carril) lo asigna Riot automáticamente y puede
            ser incorrecto en partidas con intercambio de carriles o roles inusuales.
          </li>
          <li>
            <strong>Replay disponibilidad:</strong> Riot solo mantiene replays del parche actual.
            Partidas de parches anteriores no tienen replay jugable aunque aparezcan en la lista.
          </li>
          <li>
            <strong>Sin datos en tiempo real:</strong> este sistema analiza historial pasado,
            no partidas en curso.
          </li>
        </ul>
      </Section>

      {/* ── COLECCIÓN ── */}
      <p className="faq-group-label">Colección de datos</p>

      <Section title="¿Qué inputs necesita el colector para arrancar?">
        <table className="faq-table">
          <thead>
            <tr><th>Parámetro</th><th>Cómo se pasa</th><th>Valor por defecto</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><code>RIOT_API_KEY</code></td>
              <td>Variable de entorno (<code>RGAPI-…</code>)</td>
              <td className="faq-bad">Obligatorio</td>
            </tr>
            <tr>
              <td><code>--region</code></td>
              <td>Argumento CLI</td>
              <td><code>la2</code></td>
            </tr>
            <tr>
              <td><code>--max</code></td>
              <td>Argumento CLI</td>
              <td>3 000 partidas</td>
            </tr>
            <tr>
              <td><code>--per-player</code></td>
              <td>Argumento CLI</td>
              <td>15 partidas por jugador</td>
            </tr>
            <tr>
              <td><code>--players-per-bucket</code></td>
              <td>Argumento CLI</td>
              <td>40 jugadores por tier/división</td>
            </tr>
          </tbody>
        </table>
        <p className="faq-note">
          También se puede iniciar una recolección desde el panel web usando el botón{' '}
          <strong>Iniciar colección</strong>: la interfaz pide la API key y los parámetros
          opcionales antes de disparar el proceso en el servidor.
        </p>
      </Section>

      <Section title="¿Qué camino sigue el colector para obtener las partidas?">
        <p>El proceso tiene 4 pasos en orden; cada uno depende del anterior:</p>
        <ol className="faq-list">
          <li>
            <strong>Obtener jugadores por tier</strong> — Riot League-V4
            <pre className="faq-code">{`Challenger / Grandmaster / Master → endpoint apex (lista completa)
Diamond → Iron                    → /entries/RANKED_SOLO_5x5/{TIER}/{DIVISION}?page=n`}</pre>
          </li>
          <li>
            <strong>Resolver PUUID</strong> (solo tiers no-apex) — Riot Summoner-V4
            <pre className="faq-code">{`GET /lol/summoner/v4/summoners/{summonerId}
→ extrae puuid del jugador`}</pre>
            Los tiers apex ya incluyen el <code>puuid</code> directamente en la respuesta.
          </li>
          <li>
            <strong>Obtener IDs de partidas por jugador</strong> — Riot Match-V5
            <pre className="faq-code">{`GET /lol/match/v5/matches/by-puuid/{puuid}/ids
    ?queue=420&type=ranked&count=15`}</pre>
          </li>
          <li>
            <strong>Descargar el detalle completo de cada partida</strong> — Riot Match-V5
            <pre className="faq-code">{`GET /lol/match/v5/matches/{matchId}
→ guarda el MatchDTO completo en matches.jsonl`}</pre>
          </li>
        </ol>
        <p className="faq-note">
          El colector distribuye la cuota de partidas equitativamente entre todos los tiers
          (round-robin) para que la muestra no quede sesgada hacia un solo rango. Los IDs ya
          descargados se guardan en <code>seen-matches.txt</code> para evitar duplicados entre
          ejecuciones.
        </p>
      </Section>

      <Section title="¿Qué archivos genera el colector y para qué sirven?">
        <table className="faq-table">
          <thead>
            <tr><th>Archivo</th><th>Descripción</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><code>matches.jsonl</code></td>
              <td>MatchDTOs crudos de Riot, una partida por línea (append-only)</td>
            </tr>
            <tr>
              <td><code>seen-matches.txt</code></td>
              <td>IDs de partidas ya descargadas — evita duplicados entre ejecuciones</td>
            </tr>
            <tr>
              <td><code>seen-players.txt</code></td>
              <td>PUUIDs ya procesados — permite reanudar sin repetir jugadores</td>
            </tr>
            <tr>
              <td><code>match-tier.tsv</code></td>
              <td>Mapeo <code>matchId → tier</code> para etiquetar el rango de cada partida</td>
            </tr>
            <tr>
              <td><code>lol.db</code></td>
              <td>Base SQLite normalizada con índices y vistas — es lo que consume el panel web</td>
            </tr>
          </tbody>
        </table>
        <p>
          Después de colectar, el paso <strong>buildDb</strong> convierte el <code>matches.jsonl</code>{' '}
          en <code>lol.db</code> con 4 tablas normalizadas:{' '}
          <code>matches</code>, <code>participants</code>, <code>bans</code> y{' '}
          <code>team_objectives</code>.
        </p>
      </Section>

      <Section title="Rate limits y tolerancia a fallos">
        <p>
          El colector respeta los límites de la API de Riot de forma automática:
        </p>
        <ul className="faq-list">
          <li>
            <strong>Dev key:</strong> 20 req/1s + 100 req/120s (efectivamente ~0.83 req/s).
            Recolectar 3 000 partidas puede tomar entre 1 y 2 horas.
          </li>
          <li>
            <strong>Error 429 (Too Many Requests):</strong> el colector espera el tiempo indicado
            en el header <code>Retry-After</code> y reintenta automáticamente.
          </li>
          <li>
            <strong>Error 401/403:</strong> la clave es inválida o expiró — el proceso se detiene
            de inmediato.
          </li>
          <li>
            <strong>6 fallos consecutivos:</strong> el proceso se detiene para evitar gastar cuota
            en errores. Todo lo recolectado hasta ese punto queda guardado en disco.
          </li>
          <li>
            <strong>Reanudación:</strong> volver a correr el colector retoma desde donde quedó
            gracias a los archivos <code>seen-matches.txt</code> y <code>seen-players.txt</code>.
          </li>
        </ul>
      </Section>
    </div>
  );
}
