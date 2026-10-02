// ================== AIRO · lo que el diseño del Portal necesita de JS ==================
// El diseño de Portal-del-sur se trajo casi todo con CSS (css/airo.css). Tres cosas no se pueden
// hacer solo con CSS y están acá, copiadas de src/minga.js:
//   1. el glaseado, la pastilla oscura que se desliza debajo de la pestaña activa;
//   2. el riel, la barra que se pliega contra el borde izquierdo al bajar;
//   3. la portada: el saludo, las tarjetas grandes y la cinta de últimas OT.
// Nada de esto calcula dato nuevo: la portada lee el MISMO paquete que arma el Resumen Ejecutivo
// (paqueteResumen, render.js), igual que en el Portal, donde las tarjetas se llenan con las cifras
// que ya dibujó el tablero.

/* ---------- 1. el glaseado que se desliza debajo de la pestaña activa ---------- */
function airoGlaseado(){
  const nav = document.getElementById('tabs-nav');
  const g = document.getElementById('mg-glaseado');
  if(!nav || !g) return;
  const b = nav.querySelector('.tab.active');
  g.classList.toggle('apagado', !b);
  if(!b) return;
  g.style.width = b.offsetWidth + 'px';
  g.style.height = b.offsetHeight + 'px';
  g.style.transform = 'translate(' + b.offsetLeft + 'px,' + b.offsetTop + 'px)';
}
// El clic lo maneja events.js (show); acá solo se corre el glaseado DESPUÉS, cuando .active ya
// cambió de botón. Mismo motivo para el resize: el ancho de los botones cambia con la ventana.
document.addEventListener('click', function(e){
  if(e.target.closest && e.target.closest('.tab')) requestAnimationFrame(airoGlaseado);
});
window.addEventListener('resize', airoGlaseado);
window.addEventListener('load', airoGlaseado);

/* ---------- 2. la barra se pliega en un riel a la izquierda al bajar ---------- */
// Arriba es una franja a lo ancho; al bajar se vuelve una columna angosta contra el borde
// izquierdo, en el margen que deja el contenido. Si la ventana es angosta no hay lugar y la barra
// se queda arriba como siempre. (minga.js, misma lógica y mismos umbrales.)
(function(){
  const ANCHO_MIN = 1580, BAJADA = 90;
  let puesto = false, salida = null, vuelta = null;
  const b = document.body;
  function medir(){
    const hd = document.querySelector('.mg-barra');
    if(hd && !puesto && hd.offsetHeight)
      document.documentElement.style.setProperty('--alto-barra', hd.offsetHeight + 'px');
  }
  function revisar(){
    const hd = document.querySelector('.mg-barra');
    if(!hd) return;
    const quiere = window.innerWidth >= ANCHO_MIN &&
      (window.scrollY || document.documentElement.scrollTop || 0) > BAJADA;
    if(quiere === puesto) return;
    puesto = quiere;
    clearTimeout(salida); clearTimeout(vuelta);
    if(quiere){
      b.classList.remove('mg-riel-sale', 'mg-barra-vuelve');
      b.style.paddingTop = hd.offsetHeight + 'px';   // el contenido no salta al irse la barra
      b.classList.add('mg-riel');
    } else {
      b.classList.add('mg-riel-sale');               // primero se va el riel, después baja la franja
      salida = setTimeout(function(){
        b.classList.remove('mg-riel', 'mg-riel-sale'); b.style.paddingTop = '';
        b.classList.add('mg-barra-vuelve'); airoGlaseado();
        vuelta = setTimeout(function(){ b.classList.remove('mg-barra-vuelve'); }, 480);
      }, 260);
    }
    requestAnimationFrame(airoGlaseado);
  }
  window.addEventListener('scroll', revisar, {passive:true});
  window.addEventListener('resize', function(){ medir(); revisar(); });
  window.addEventListener('load', medir);
})();

/* ---------- 3. la portada ---------- */
function airoSaludo(){
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días.' : (h < 19 ? 'Buenas tardes.' : 'Buenas noches.');
}

// Barras de la tarjeta de OT confirmadas: una por mes, la última encendida (minga.css: .mg-spark).
function airoSpark(serie){
  if(!serie.length) return '';
  const max = Math.max(1, ...serie.map(m => m.v));
  const n = serie.length, an = 100 / n;
  const barras = serie.map(function(m, i){
    const h = Math.max(3, Math.round(m.v / max * 100));
    return '<rect x="' + (i * an + an * .18).toFixed(2) + '" y="' + (100 - h) +
      '" width="' + (an * .64).toFixed(2) + '" height="' + h + '"' +
      (i === n - 1 ? ' class="hoy"' : '') + ' style="animation-delay:' + (i * .04).toFixed(2) + 's">' +
      '<title>' + m.lbl + ': ' + m.v + '</title></rect>';
  }).join('');
  return '<svg class="mg-spark" viewBox="0 0 100 100" preserveAspectRatio="none">' + barras + '</svg>';
}

// La misma franja de abajo, pero en línea con área: para lo que se acumula (el gasto de la campaña).
// preserveAspectRatio="none" estira el dibujo al ancho de la tarjeta; el trazo no engorda porque
// lleva vector-effect (css/airo.css).
function airoSparkLinea(serie){
  if(!serie.length) return '';
  const W = 200, H = 46;
  const max = Math.max(1, ...serie.map(x => x.v));
  const a = serie.length === 1 ? [serie[0], serie[0]] : serie;
  const pts = a.map(function(x, i){
    return [(i / (a.length - 1) * W).toFixed(1), (H - 3 - x.v / max * (H - 8)).toFixed(1)];
  });
  const d = 'M' + pts.map(p => p.join(' ')).join(' L');
  return '<svg class="mg-spark l" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    '<path class="area" d="' + d + ' L' + W + ' ' + H + ' L0 ' + H + 'Z"/>' +
    '<path class="linea" d="' + d + '"/></svg>';
}

function airoPulsos(P){
  const k = P.resumen.kpis;
  const serie = (P.resumen.actividadMensual || []).map(m => ({lbl:m.lbl, v:m.otConfirmadas}));
  // Avance de campaña: lo mismo que mira "Detalle de Etapas por Cultivo", sumado.
  const cs = P.cultivos || [];
  const haPlan = cs.reduce((a, c) => a + (c.ha_plan || 0), 0);
  const haEjec = cs.reduce((a, c) => a + (c.ha_ejec || 0), 0);
  const pct = haPlan ? Math.min(100, haEjec / haPlan * 100) : 0;
  // Lo que está en marcha: las tres cifras salen de donde las saca Alertas Operativas (D.ot_pend,
  // D.ot_ejec y D.n_ot_atrasadas), así la tarjeta y ese módulo dicen siempre lo mismo.
  const ejec = D.ot_ejec || 0, pend = D.ot_pend || 0, atras = D.n_ot_atrasadas || 0;
  // Gasto acumulado mes a mes, para la línea de abajo de la tarjeta de gasto.
  const porMes = airoAgregados().mes;
  let acum = 0;
  const serieGasto = [...porMes.keys()].sort((a, b) => a - b)
    .map(function(m){ acum += porMes.get(m).gasto; return {lbl:MES[m], v:acum}; });
  const camp = P.campania || D.campania_actual;
  return [
    '<article class="mg-pulso"><div class="eti">OT Confirmadas</div>' +
      '<div class="val">' + fmt(k.otConfirmadas) + '</div>' +
      '<div class="pie">de ' + fmt(P.total_ot) + ' órdenes de la campaña</div>' +
      airoSpark(serie) + '</article>',
    '<article class="mg-pulso marcha' + (atras ? ' alerta' : '') + '">' +
      '<div class="eti">Órdenes en marcha ahora</div>' +
      '<div class="val">' + fmt(ejec + pend) + '</div>' +
      '<div class="mg-seg"><i style="flex:' + (ejec || 0.01) + '"></i>' +
        '<i style="flex:' + (pend || 0.01) + '"></i></div>' +
      '<div class="mg-leyenda"><em class="e"></em>' + fmt(ejec) + ' en ejecución' +
        '<em class="p"></em>' + fmt(pend) + ' pendientes</div>' +
      (atras
        ? '<button type="button" class="mg-atras" data-ir="alertas">' + fmt(atras) + ' atrasadas · ver</button>'
        : '<div class="mg-leyenda">Ninguna atrasada</div>') + '</article>',
    '<article class="mg-pulso"><div class="eti">Gasto confirmado · campaña ' + escHtml(String(camp)) + '</div>' +
      '<div class="val">$ ' + fmtUSD(k.costoEjecutado) + '</div>' +
      '<div class="pie">ejecutado en ' + fmt(k.otConfirmadas) + ' órdenes confirmadas</div>' +
      airoSparkLinea(serieGasto) + '</article>',
    '<article class="mg-pulso marcha"><div class="eti">Avance de la campaña</div>' +
      '<div class="val">' + Math.round(pct) + '<small>%</small></div>' +
      '<div class="mg-seg"><i style="flex:' + pct.toFixed(2) + '"></i>' +
        '<i style="flex:' + (100 - pct).toFixed(2) + '"></i></div>' +
      '<div class="mg-leyenda"><em></em>' + fmt2(haEjec) + ' ha<em class="p"></em>' +
        fmt2(haPlan) + ' ha de plan</div></article>',
  ].join('');
}

// Cinta: las últimas OT confirmadas. Salen de D.gastos, que es justamente el gasto de las OT
// confirmadas agrupado por labor; cada grupo guarda sus OT con fecha real (servicios.js).
// Se piden 14 y en pantalla entran 5: las que sobran son las que van rotando (ver airoCintaViva).
function airoCinta(){
  const filas = [];
  (D.gastos || []).forEach(function(g){
    (g.ots || []).forEach(function(o){
      if(o.fr) filas.push({ot:o.ot, fr:o.fr, serv:g.labor, cultivo:o.cultivo, lote:o.lote});
    });
  });
  filas.sort((a, b) => b.fr - a.fr || (+b.ot) - (+a.ot));
  const vistas = new Set();
  // Días contra HOY, no contra la fecha del archivo: lo que se lee es "cuándo se hizo", y el que
  // mira la pantalla cuenta desde el día en que la está mirando.
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const hace = function(f){
    const d = Math.round((hoy - new Date(f.getFullYear(), f.getMonth(), f.getDate())) / 86400000);
    return d <= 0 ? 'hoy' : (d === 1 ? 'ayer' : 'hace ' + d + ' días');
  };
  return filas.filter(function(f){
    if(vistas.has(f.ot)) return false;
    vistas.add(f.ot); return true;
  }).slice(0, 14).map(function(f){
    return '<div class="mg-ot-fila"><span class="num">OT ' + f.ot + '</span>' +
      '<span class="srv">' + escHtml(f.serv) + '<em>' + escHtml(f.cultivo || '') +
      (f.lote ? ' · ' + escHtml(f.lote) : '') + '</em></span>' +
      '<span></span><span class="cuando">' + hace(f.fr) + '</span></div>';
  }).join('') || '<div class="mg-ot-fila"><span class="cuando">Sin OT confirmadas con fecha.</span></div>';
}

// La cinta se mueve sola: cada 3,2 s la primera fila se va hacia arriba y vuelve a entrar al final.
// Se frena si la pestaña está en segundo plano, si el cursor está encima o si alguien está tabulando
// adentro — moverle el contenido a quien lo está leyendo es peor que no moverlo.
let airoCintaTimer = null;
function airoCintaViva(){
  const cinta = document.getElementById('mg-cinta');
  clearInterval(airoCintaTimer);
  if(!cinta || cinta.children.length <= 5) return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  airoCintaTimer = setInterval(function(){
    if(document.hidden || cinta.matches(':hover') || cinta.contains(document.activeElement)) return;
    const pri = cinta.firstElementChild;
    if(!pri) return;
    pri.classList.add('sale');
    setTimeout(function(){ pri.classList.remove('sale'); cinta.appendChild(pri); }, 520);
  }, 3200);
}

function airoPortada(){
  const hero = document.getElementById('mg-hero');
  if(!hero || typeof D === 'undefined' || !D) return;
  const P = paqueteResumen();
  document.getElementById('mg-hola').textContent = airoSaludo();
  document.getElementById('mg-hero-sub').textContent =
    'Campaña ' + (P.campania || D.campania_actual) + ' · ' + fmt(P.total_ot) +
    ' órdenes de trabajo, ' + fmt(P.resumen.kpis.otConfirmadas) + ' confirmadas. ' +
    'Todo lo de abajo sale de la misma exportación de Albor.';
  document.getElementById('mg-pulsos').innerHTML = airoPulsos(P);
  document.getElementById('mg-cinta').innerHTML = airoCinta();
  airoCintaViva();
  airoAvance();
  airoActividad();
  airoRanking();
  // las tarjetas de cultivo de ese panel quedan ocultas (las reemplaza "Avance por cultivo"):
  // lo que sigue mostrando son los mapas, así que el título lo dice.
  const h = document.querySelector('#cults');
  const tit = h && h.parentElement.querySelector('h3');
  if(tit && tit.firstChild && tit.firstChild.nodeType === 3) tit.firstChild.nodeValue = 'Mapas del Campo ';
}

/* ---------- 4. el rótulo es el selector de Campaña, y manda ---------- */
// En el Portal la Campaña no es un filtro más abajo: es la primera palabra del rótulo de la
// portada, y mueve todo lo que tiene paquete por campaña (mgPintarCampanias / mgCampaniaGlobal).
// Acá eso son dos módulos: el Resumen Ejecutivo (con su Avance Detallado) y Servicios. Los demás
// —Combustible, Insumos, Control de Hectáreas, Alertas y Auditoría— no tienen paquete por campaña
// y siguen mostrando lo de siempre; por eso el rótulo solo aparece donde el cambio se nota.
function airoCampaniaGlobal(valor){
  cambiarCampaniaResumen(valor);                 // Resumen Ejecutivo + Avance Detallado
  const gc = document.getElementById('gcampania');  // Servicios tiene su propio paquete por campaña
  if(gc && [...gc.options].some(o => o.value === valor)){
    gc.value = valor;
    cambiarCampaniaServicios();
  }
  airoCampanias();
}

// Los selectores del rótulo son un espejo del de Andrés (#rescampania): mismas opciones, mismo
// valor. Así no hay dos listas que mantener y el día que cambien las campañas, cambian solas.
function airoCampanias(){
  const src = document.getElementById('rescampania');
  if(!src) return;
  document.querySelectorAll('.mg-campania').forEach(function(sel){
    if(sel.innerHTML !== src.innerHTML) sel.innerHTML = src.innerHTML;
    sel.value = src.value;
    sel.onchange = function(){ airoCampaniaGlobal(sel.value); };
  });
  // el filtro original del Resumen queda de respaldo invisible: lo sigue leyendo render.js
  const panel = src.closest('.gfilter');
  if(panel) panel.hidden = true;
}

/* ---------- 5. avance por cultivo, actividad por mes y quién hizo qué ---------- */
// Los tres bloques de la portada del Portal. Ninguno calcula dato nuevo: el avance sale de
// paqueteResumen().cultivos (lo mismo que dibujaban las tarjetas de cultivo) y los otros dos de
// serviciosActivos(), el paquete de Servicios de la campaña elegida — por eso el rótulo de Campaña
// mueve también estos bloques.

// Las escalas de los gráficos NO son la paleta del entorno. El verde manda en el fondo, la
// barra y los bloques; un dato dibujado necesita tono propio para distinguirse de otro dato.
// Estas son las de Airo —terracota, carmín, verde, ocre, ámbar— y se quedan como están.
const AIRO_ANILLO_COL = ['#D39A55', '#C1272D', '#4E7D57', '#A51F25', '#8FB38A'];
const AIRO_CULT_COLOR = {ARROZ:'#E3867E', SOJA:'#8FB38A', SORGO:'#D39A55', MAIZ:'#E3C26A'};
const AIRO_COLOR_AV = {g:'var(--g)', y:'var(--y)', o:'var(--o)', r:'var(--r)'};
// Qué se mide. 'ot' cuenta órdenes distintas; 'ha' y 'gasto' suman lo de cada línea de servicio.
const AIRO_METRICAS = {
  ot:    {lbl:'OT',        pie:'ot confirmadas en el período', fmt:v => fmt(v),             uni:'OT'},
  ha:    {lbl:'Hectáreas', pie:'hectáreas trabajadas',         fmt:v => fmt2(v) + ' ha',    uni:'ha'},
  gasto: {lbl:'Gasto',     pie:'de gasto ejecutado',           fmt:v => '$ ' + fmtUSD(v),   uni:''},
};
let airoAvFoco = null, airoActMetrica = 'ot', airoRankDim = 'contr', airoRankMetrica = 'ot';

// ---- los números, agrupados de una sola pasada ----
// Una OT aparece en tantos grupos como labores tenga, así que para contarlas se guardan sus
// números en un Set: sumar "n" daría de más. Las hectáreas y el gasto sí se suman por línea,
// que es como los cuenta el módulo Servicios.
function airoAgrega(mapa, clave, ot, ha, gasto){
  if(clave == null || clave === '') clave = '(sin dato)';
  let x = mapa.get(clave);
  if(!x){ x = {ots:new Set(), ha:0, gasto:0}; mapa.set(clave, x); }
  x.ots.add(ot); x.ha += ha; x.gasto += gasto;
}
function airoAgregados(){
  const S = (typeof serviciosActivos === 'function') ? serviciosActivos() : D;
  const mes = new Map(), contr = new Map(), serv = new Map(), lote = new Map();
  (S.gastos || []).forEach(function(g){
    (g.ots || []).forEach(function(o){
      const ha = o.ha || 0;
      const gasto = (o.propia || 0) + (o.tercero || 0) + (o.insumos || 0);
      if(o.fr) airoAgrega(mes, o.fr.getMonth() + 1, o.ot, ha, gasto);
      airoAgrega(contr, labelContratista(g.contratista), o.ot, ha, gasto);
      airoAgrega(serv, g.labor, o.ot, ha, gasto);
      airoAgrega(lote, o.lote, o.ot, ha, gasto);
    });
  });
  return {mes:mes, contr:contr, serv:serv, lote:lote};
}
const airoValor = (x, m) => m === 'ot' ? x.ots.size : (m === 'ha' ? x.ha : x.gasto);

// ---- avance por cultivo ----
function airoAnillos(c){
  const et = (c.etapas || []).slice(0, 4);
  if(!et.length) return '';
  const R = [40, 32, 24, 16].slice(0, et.length);
  const actual = (c.etapas || []).find(e => e.nombre === c.etapa_actual) || et[et.length - 1];
  const svg = '<svg viewBox="0 0 96 96" aria-hidden="true">' + et.map(function(e, k){
    const r = R[k], L = 2 * Math.PI * r;
    const p = e.avance != null ? Math.min(e.avance, 100) / 100 : 0;
    return '<circle cx="48" cy="48" r="' + r + '" class="pista"/>' +
      '<circle cx="48" cy="48" r="' + r + '" class="arco" stroke="' + AIRO_ANILLO_COL[k] +
      '" stroke-dasharray="' + L.toFixed(1) + '" style="--L:' + L.toFixed(1) +
      ';--off:' + (L * (1 - p)).toFixed(1) + ';animation-delay:' + (k * 120) + 'ms"/>';
  }).join('') + '</svg>';
  const ley = et.map(function(e, k){
    return '<span title="' + escHtml(e.nombre) + '"><i style="background:' + AIRO_ANILLO_COL[k] +
      '"></i><em>' + escHtml(e.nombre) + '</em><b>' +
      (e.avance != null ? Math.round(e.avance) + '%' : '—') + '</b></span>';
  }).join('');
  return '<div class="mg-anillos"><div class="mg-anillos-g">' + svg + '<div class="c"><b>' +
    (actual && actual.avance != null ? Math.round(actual.avance) + '%' : '—') + '</b><span>' +
    escHtml(c.etapa_actual || 'sin etapa') + '</span></div></div>' +
    '<div class="mg-anillos-ley">' + ley + '</div></div>';
}
const AIRO_IC_ABRIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const AIRO_IC_CERRAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

function airoAvance(){
  const cont = document.getElementById('mg-avance');
  if(!cont) return;
  const cults = paqueteResumen().cultivos || [];
  if(airoAvFoco != null && !cults[airoAvFoco]) airoAvFoco = null;
  cont.classList.toggle('foco', airoAvFoco != null);
  cont.innerHTML = cults.map(function(c, i){
    const grande = airoAvFoco === i;
    const etapas = (c.etapas || []).length ? c.etapas.map(function(e, k){
      const col = AIRO_COLOR_AV[e.avance == null ? 'o' : color(e.avance)];
      const av = e.avance != null ? Math.round(e.avance) + '%' : fmt(e.n_lotes) + ' lotes';
      return '<div class="mg-av-et">' +
        '<button type="button" class="n" data-avdet="' + i + '" title="Ver el desglose de ' +
          escHtml(e.nombre) + ' en ' + escHtml(c.nombre) + '">' + escHtml(e.nombre) + '</button>' +
        '<span class="v">' + av + ' <em>· ' + fmt2(e.ha_ejec) + ' ha</em></span>' +
        '<span class="b"><i style="width:' + (e.avance != null ? Math.min(e.avance, 100) : 0) +
          '%;background:' + col + ';animation-delay:' + (k * 60) + 'ms"></i></span></div>';
    }).join('') : '<div class="mg-av-vacio">Sin etapa registrada en OT confirmadas</div>';
    return '<article class="mg-av-card' + (grande ? ' grande' : '') + '"' +
      (airoAvFoco != null && !grande ? ' hidden' : '') +
      ' style="animation-delay:' + (i * 60) + 'ms">' +
      '<div class="mg-av-top"><b class="mg-av-nom">' + escHtml(c.nombre) + '</b>' +
      '<button type="button" class="mg-av-exp" data-avf="' + i + '" aria-pressed="' + grande + '"' +
      ' title="' + (grande ? 'Volver a ver todos los cultivos' : 'Ver ' + escHtml(c.nombre.toLowerCase()) + ' en grande') + '">' +
      (grande ? AIRO_IC_CERRAR : AIRO_IC_ABRIR) + '</button></div>' +
      airoAnillos(c) +
      '<div class="mg-av-etapas">' + etapas + '</div>' +
      '<div class="mg-av-pie"><span>' +
        (c.incluyeZafrina ? 'Plan de Cultivo · incl. Zafriña26' : 'Plan de Cultivo') + ' <b>' +
        (c.tiene_rtk ? fmt2(c.ha_plan) + ' ha' : 'sin plan') + '</b></span></div>' +
      '</article>';
  }).join('') || '<div class="mg-av-vacio">Sin cultivos con datos en esta campaña.</div>';

  const sv = document.getElementById('mg-av-vista');
  if(sv) sv.innerHTML = ['<button type="button" data-avf="" class="' + (airoAvFoco == null ? 'on' : '') + '">Todos</button>']
    .concat(cults.map(function(c, i){
      const col = AIRO_CULT_COLOR[stripAccents(c.nombre).toUpperCase()] || 'var(--borde2)';
      const nom = c.nombre.charAt(0) + c.nombre.slice(1).toLowerCase();
      return '<button type="button" data-avf="' + i + '" class="' + (airoAvFoco === i ? 'on' : '') +
        '"><i style="background:' + col + '"></i>' + escHtml(nom) + '</button>';
    })).join('');
}

// ---- actividad por mes ----
function airoActividad(){
  const cont = document.getElementById('mg-actividad');
  if(!cont) return;
  const M = AIRO_METRICAS[airoActMetrica];
  // Las OT confirmadas por mes salen del paquete del Resumen, que es de donde sale el KPI de
  // arriba: contarlas desde los grupos de Servicios dejaría afuera las OT sin línea de labor y el
  // total no cerraría contra "OT Confirmadas". Las hectáreas y el gasto sí salen de los grupos,
  // que es donde viven.
  let serie;
  if(airoActMetrica === 'ot'){
    serie = (paqueteResumen().resumen.actividadMensual || []).map(x => ({m:x.mesnum, v:x.otConfirmadas}));
  } else {
    const mes = airoAgregados().mes;
    serie = [...mes.keys()].sort((a, b) => a - b).map(m => ({m:m, v:airoValor(mes.get(m), airoActMetrica)}));
  }
  if(!serie.length){ cont.innerHTML = ''; return; }
  const total = serie.reduce((s, x) => s + x.v, 0);
  const pico = serie.reduce((a, b) => b.v > a.v ? b : a, serie[0]);
  const max = Math.max(1, ...serie.map(x => x.v));
  // el gráfico se dibuja en una caja de 600x150 y se estira al ancho real; la línea no engorda
  // porque lleva vector-effect, y los puntos son HTML posicionado en %, no SVG.
  const W = 600, H = 150, n = serie.length;
  const px = i => n === 1 ? W / 2 : (i / (n - 1)) * W;
  const py = v => H - (v / max) * (H - 18) - 6;
  const pts = serie.map((x, i) => px(i).toFixed(1) + ',' + py(x.v).toFixed(1)).join(' ');
  const area = '0,' + H + ' ' + pts + ' ' + W + ',' + H;
  const puntos = serie.map(function(x, i){
    const izq = n === 1 ? 50 : (i / (n - 1)) * 100;
    const arr = (py(x.v) / H) * 100;
    return '<span class="mg-act-pt' + (i === n - 1 ? ' ult' : '') + '" style="left:' + izq.toFixed(2) +
      '%;top:' + arr.toFixed(2) + '%;animation-delay:' + (i * 60 + 300) + 'ms"><b>' +
      (airoActMetrica === 'gasto' ? fmt(x.v) : (airoActMetrica === 'ha' ? fmt(x.v) : fmt(x.v))) + '</b></span>';
  }).join('');
  const rotulos = serie.map(function(x, i){
    const izq = n === 1 ? 50 : (i / (n - 1)) * 100;
    return '<span style="left:' + izq.toFixed(2) + '%">' + MES[x.m] + '</span>';
  }).join('');
  const btns = Object.keys(AIRO_METRICAS).map(k =>
    '<button type="button" data-actm="' + k + '" class="' + (k === airoActMetrica ? 'on' : '') + '">' +
    AIRO_METRICAS[k].lbl + '</button>').join('');
  cont.innerHTML = '<div class="mg-act">' +
    '<div class="mg-act-cab"><div><span class="eti">Actividad por mes</span>' +
      '<span class="val">' + M.fmt(total) + ' <small>' + M.pie + '</small></span>' +
      '<span class="pie">pico: ' + MES[pico.m] + ' con ' + M.fmt(pico.v) + '</span></div>' +
      '<div class="mg-seg-btns" id="mg-act-vista" role="group" aria-label="Qué se mide">' + btns + '</div></div>' +
    '<div class="mg-act-graf"><div class="mg-act-lienzo">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<polygon class="area" points="' + area + '"/><polyline class="linea" points="' + pts + '"/></svg>' +
      puntos + '</div><div class="mg-act-meses">' + rotulos + '</div></div></div>';
}

// ---- quién hizo qué ----
const AIRO_RANK_DIM = {contr:'Contratistas', serv:'Servicios', lote:'Lotes'};
function airoRanking(){
  const cont = document.getElementById('mg-rank');
  if(!cont) return;
  const M = AIRO_METRICAS[airoRankMetrica];
  const datos = airoAgregados()[airoRankDim === 'contr' ? 'contr' : (airoRankDim === 'serv' ? 'serv' : 'lote')];
  const filas = [...datos.entries()]
    .map(([k, x]) => [k, airoValor(x, airoRankMetrica)])
    .filter(f => f[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  const tot = filas.reduce((s, f) => s + f[1], 0) || 1;
  const max = Math.max(1, ...filas.map(f => f[1]));
  const btnsDim = Object.keys(AIRO_RANK_DIM).map(k =>
    '<button type="button" data-rkd="' + k + '" class="' + (k === airoRankDim ? 'on' : '') + '">' +
    AIRO_RANK_DIM[k] + '</button>').join('');
  const btnsMet = Object.keys(AIRO_METRICAS).map(k =>
    '<button type="button" data-rkm="' + k + '" class="' + (k === airoRankMetrica ? 'on' : '') + '">' +
    AIRO_METRICAS[k].lbl + '</button>').join('');
  const lista = filas.slice(0, 8).map(function(f, i){
    return '<div class="mg-rank-fila"><span class="n">' + (i + 1) + '</span>' +
      '<span class="t" title="' + escHtml(f[0]) + '">' + escHtml(f[0]) + '</span>' +
      '<span class="v">' + M.fmt(f[1]) + ' <em>' + Math.round(f[1] / tot * 100) + '%</em></span>' +
      '<span class="b"><i style="width:' + (f[1] / max * 100).toFixed(1) +
      '%;animation-delay:' + (i * 60) + 'ms"></i></span></div>';
  }).join('') || '<div class="mg-av-vacio">Sin datos en esta campaña.</div>';
  cont.innerHTML = '<div class="mg-rank-cab"><span class="eti">Quién hizo qué · campaña</span>' +
    '<div class="mg-seg-btns" id="mg-rank-dim" role="group" aria-label="Agrupado por">' + btnsDim + '</div>' +
    '<div class="mg-seg-btns chico" id="mg-rank-met" role="group" aria-label="Qué se mide">' + btnsMet + '</div></div>' +
    '<div class="mg-rank-lista">' + lista + '</div>' +
    (filas.length > 8 ? '<p class="mg-rank-mas">y ' + (filas.length - 8) + ' más</p>' : '');
}

// Un solo listener para los tres bloques: el contenido se reescribe entero en cada cambio, así que
// atar los botones uno por uno obligaría a volver a atarlos cada vez.
document.addEventListener('click', function(e){
  const t = e.target.closest ? e.target.closest('[data-avf],[data-avdet],[data-ir],[data-actm],[data-rkd],[data-rkm]') : null;
  if(!t) return;
  if(t.dataset.avf !== undefined){
    const i = t.dataset.avf === '' ? null : +t.dataset.avf;
    airoAvFoco = (airoAvFoco === i) ? null : i;
    airoAvance();
    return;
  }
  if(t.dataset.avdet !== undefined){
    const c = (paqueteResumen().cultivos || [])[+t.dataset.avdet];
    if(c) abrirAvanceDetallado(c.nombre);
    return;
  }
  if(t.dataset.ir === 'alertas'){
    const tabs = document.querySelectorAll('.tab');
    const i = [...tabs].findIndex(x => x.dataset.mod === 'alertas');
    if(i >= 0) show(i, tabs[i]);
    return;
  }
  if(t.dataset.actm){ airoActMetrica = t.dataset.actm; airoActividad(); return; }
  if(t.dataset.rkd){ airoRankDim = t.dataset.rkd; airoRanking(); return; }
  if(t.dataset.rkm){ airoRankMetrica = t.dataset.rkm; airoRanking(); }
});

/* ---------- 6. los selectores: botón y lista propios ---------- */
// Copiado de minga.js (mgMejorarSelects). El <select> nativo se queda en el DOM y sigue siendo el
// dueño del valor: render.js lo lee y lo escribe igual que siempre, y los listeners de events.js
// siguen atados al mismo elemento. Lo único que cambia es lo que se ve — un botón con la opción
// elegida — y la lista, que se dibuja en <body> con position:fixed para que no la recorte ningún
// panel con overflow.
//
// El setter de `value` se redefine por elemento para repintar el botón: render.js hace
// `sel.value = x` en muchos lugares y eso no dispara ningún evento.
const AIRO_VALOR_SEL = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
let airoSelAbierto = null;

function airoSelects(raiz){
  (raiz || document).querySelectorAll('select:not([data-airo-sel])').forEach(function(sel){
    sel.dataset.airoSel = '1';
    const cs = getComputedStyle(sel);   // el ancho que le da el CSS del filtro, antes de ocultarlo
    const caja = document.createElement('span');
    caja.className = 'mg-sel-caja';
    if(cs.minWidth && cs.minWidth !== '0px' && cs.minWidth !== 'auto') caja.style.minWidth = cs.minWidth;
    if(cs.flexGrow && cs.flexGrow !== '0') caja.style.flex = cs.flex;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mg-sel';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const lab = sel.getAttribute('aria-label') ||
      (sel.id ? ((document.querySelector('label[for="' + sel.id + '"]') || {}).textContent || '') : '');
    if(lab) btn.setAttribute('aria-label', lab.trim());
    btn.innerHTML = '<span class="t"></span>';
    sel.parentNode.insertBefore(caja, sel);
    caja.appendChild(btn); caja.appendChild(sel);   // el botón primero: un <label> que envuelve apunta a él
    sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel._airoBtn = btn;
    Object.defineProperty(sel, 'value', {configurable:true,
      get(){ return AIRO_VALOR_SEL.get.call(this); },
      set(v){ AIRO_VALOR_SEL.set.call(this, v); airoSelPintar(this); }});
    new MutationObserver(function(){ airoSelPintar(sel); })
      .observe(sel, {childList:true, subtree:true, attributes:true, attributeFilter:['selected','disabled']});
    sel.addEventListener('change', function(){ airoSelPintar(sel); });
    btn.addEventListener('click', function(){
      (airoSelAbierto && airoSelAbierto.sel === sel) ? airoSelCerrar(true) : airoSelAbrir(sel);
    });
    btn.addEventListener('keydown', function(e){
      if(!airoSelAbierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){ e.preventDefault(); airoSelAbrir(sel); }
    });
    if(sel.id) document.querySelectorAll('label[for="' + sel.id + '"]').forEach(function(l){
      l.addEventListener('click', function(e){ e.preventDefault(); btn.focus(); });
    });
    airoSelPintar(sel);
  });
}
function airoSelPintar(sel){
  if(!sel._airoBtn) return;
  const o = sel.options[sel.selectedIndex];
  sel._airoBtn.querySelector('.t').textContent = o ? o.text : '';
  sel._airoBtn.disabled = sel.disabled;
}
function airoSelAbrir(sel){
  airoSelCerrar();
  const btn = sel._airoBtn, menu = document.createElement('div');
  menu.className = 'mg-sel-menu'; menu.setAttribute('role', 'listbox');
  if(btn.getAttribute('aria-label')) menu.setAttribute('aria-label', btn.getAttribute('aria-label'));
  menu.innerHTML = [...sel.options].map(function(o, i){
    return '<button type="button" role="option" data-i="' + i + '" aria-selected="' +
      (i === sel.selectedIndex) + '"' + (o.disabled ? ' disabled' : '') + '>' + escHtml(o.text) + '</button>';
  }).join('');
  document.body.appendChild(menu);
  airoSelAbierto = {sel:sel, menu:menu};
  airoSelUbicar();
  btn.setAttribute('aria-expanded', 'true'); btn.classList.add('abierto');
  const act = menu.querySelector('[aria-selected="true"]') || menu.querySelector('button:not([disabled])');
  if(act){ act.focus({preventScroll:true}); act.scrollIntoView({block:'nearest'}); }
  menu.addEventListener('click', function(e){
    const b = e.target.closest('button[data-i]');
    if(b && !b.disabled) airoSelElegir(+b.dataset.i);
  });
  menu.addEventListener('keydown', function(e){
    const bs = [...menu.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement);
    if(e.key === 'ArrowDown'){ e.preventDefault(); (bs[i + 1] || bs[0]).focus(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); }
    else if(e.key === 'Home'){ e.preventDefault(); bs[0].focus(); }
    else if(e.key === 'End'){ e.preventDefault(); bs[bs.length - 1].focus(); }
    else if(e.key === 'Escape' || e.key === 'Tab'){ e.preventDefault(); airoSelCerrar(true); }
  });
}
// la lista se abre hacia donde haya lugar: abajo si entra, arriba si no
function airoSelUbicar(){
  if(!airoSelAbierto) return;
  const sel = airoSelAbierto.sel, menu = airoSelAbierto.menu;
  const r = sel._airoBtn.getBoundingClientRect();
  if(!r.width) return airoSelCerrar();
  menu.style.minWidth = r.width + 'px';
  const alto = Math.min(menu.scrollHeight, 320);
  const abajo = window.innerHeight - r.bottom - 14;
  const arriba = abajo < Math.min(alto, 180) && r.top > abajo;
  menu.style.maxHeight = Math.max(120, Math.min(320, arriba ? r.top - 20 : abajo)) + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = (arriba ? r.top - menu.offsetHeight - 6 : r.bottom + 6) + 'px';
}
function airoSelElegir(i){
  const sel = airoSelAbierto.sel;
  airoSelCerrar(true);
  if(sel.selectedIndex === i) return;
  sel.selectedIndex = i;
  airoSelPintar(sel);
  sel.dispatchEvent(new Event('input', {bubbles:true}));
  sel.dispatchEvent(new Event('change', {bubbles:true}));
}
function airoSelCerrar(foco){
  if(!airoSelAbierto) return;
  const sel = airoSelAbierto.sel, menu = airoSelAbierto.menu;
  airoSelAbierto = null;
  menu.remove();
  sel._airoBtn.setAttribute('aria-expanded', 'false');
  sel._airoBtn.classList.remove('abierto');
  if(foco) sel._airoBtn.focus({preventScroll:true});
}
document.addEventListener('pointerdown', function(e){
  if(airoSelAbierto && e.target.closest && !e.target.closest('.mg-sel-menu') &&
     e.target.closest('.mg-sel') !== airoSelAbierto.sel._airoBtn) airoSelCerrar();
});
window.addEventListener('resize', function(){ airoSelCerrar(); });
window.addEventListener('scroll', function(e){
  if(airoSelAbierto && !(e.target.closest && e.target.closest('.mg-sel-menu'))) airoSelUbicar();
}, true);
document.addEventListener('DOMContentLoaded', function(){ airoSelects(); });

// La portada se redibuja cuando se redibuja lo que muestra. Son dos puertas: renderAll (cada carga
// de datos) y renderResumenModulo (cada cambio de campaña, venga del rótulo, del filtro original o
// del selector del Avance Detallado — todos terminan ahí).
(function(){
  if(typeof renderAll === 'function'){
    const original = renderAll;
    renderAll = function(){
      const r = original.apply(this, arguments);
      try { airoPortada(); airoCampanias(); airoSelects(); airoGlaseado(); } catch(e){ console.warn('portada:', e); }
      return r;
    };
  }
  if(typeof renderResumenModulo === 'function'){
    const original = renderResumenModulo;
    renderResumenModulo = function(){
      const r = original.apply(this, arguments);
      try { airoPortada(); airoCampanias(); } catch(e){ console.warn('portada:', e); }
      return r;
    };
  }
})();
