/* ============================================================
   RAY DECO — experimento de decoración con ray.svg
   Inyecta 5 rayos en lugares distintos y un card flotante para
   elegir uno. Desechable: borrar este archivo, ray-deco.css y
   las 2 líneas que los cargan en index.html.
   ============================================================ */
(function () {
  const SRC = '/assets/ray.svg';

  // Las 5 ubicaciones candidatas. `mount` recibe el <img> ya creado.
  const SPOTS = [
    {
      n: 1,
      label: 'Marca de agua del sidebar',
      mount(img) { document.querySelector('.sidebar')?.appendChild(img); },
    },
    {
      n: 2,
      label: 'Acento junto al logo',
      mount(img) { document.querySelector('.brand')?.appendChild(img); },
    },
    {
      n: 3,
      label: 'Detalle en la barra superior',
      mount(img) {
        const bar = document.querySelector('.topbar');
        if (!bar) return;
        bar.style.position = 'sticky'; // ya lo es; asegura contexto
        bar.style.paddingLeft = '40px';
        bar.appendChild(img);
      },
    },
    {
      n: 4,
      label: 'Decoración de filtros',
      mount(img) { document.querySelector('.filters')?.appendChild(img); },
    },
    {
      n: 5,
      label: 'Fondo de la página',
      mount(img) { document.body.appendChild(img); },
    },
  ];

  const rays = {}; // n -> <img>

  function makeRay(spot) {
    const img = document.createElement('img');
    img.src = SRC;
    img.alt = '';
    img.className = 'ray-deco ray-' + spot.n;
    img.dataset.ray = String(spot.n);
    spot.mount(img);
    rays[spot.n] = img;
  }

  function flash(n) {
    const el = rays[n];
    if (!el || el.hidden) return;
    el.classList.remove('flash');
    void el.offsetWidth; // reinicia la animación
    el.classList.add('flash');
  }

  function buildPicker() {
    const card = document.createElement('div');
    card.className = 'ray-picker';
    card.innerHTML =
      '<div class="ray-picker-head">' +
        '<img src="' + SRC + '" alt="" />' +
        '<b>Ray.svg · ubicaciones</b>' +
        '<span class="sub">5 opciones</span>' +
      '</div>' +
      '<div class="ray-picker-list"></div>' +
      '<div class="ray-picker-foot">Pasa el cursor para resaltar · clic en una fila para ' +
        'ocultar/mostrar. Dime el número que prefieres y dejo solo ese.</div>';

    const list = card.querySelector('.ray-picker-list');
    for (const spot of SPOTS) {
      const row = document.createElement('div');
      row.className = 'ray-opt';
      row.dataset.target = String(spot.n);
      row.innerHTML =
        '<span class="n">' + spot.n + '</span>' +
        '<span class="lbl">' + spot.label + '</span>' +
        '<span class="eye">●</span>';
      row.addEventListener('mouseenter', () => flash(spot.n));
      row.addEventListener('click', () => {
        const el = rays[spot.n];
        if (!el) return;
        const nowHidden = !el.hidden;
        el.hidden = nowHidden;
        row.classList.toggle('off', nowHidden);
        row.querySelector('.eye').textContent = nowHidden ? '○' : '●';
        if (!nowHidden) flash(spot.n);
      });
      list.appendChild(row);
    }
    document.body.appendChild(card);
  }

  function init() {
    SPOTS.forEach(makeRay);
    buildPicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
