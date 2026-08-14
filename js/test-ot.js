// ============ VISTA TEMPORAL DE VALIDACION: Ordenes de Trabajo ============
// Replica del modulo Servicios de produccion con UNA sola diferencia: de donde salen las filas de
// consultaOT. Sirve para responder, antes de reemplazar nada: "si hoy cambio el Excel por la API de
// Albor, ¿Servicios muestra exactamente lo mismo?".
//
// NO hay calculos propios de esta vista. Los dos origenes pasan por la MISMA cadena que ya usa el
// dashboard —normalizarFilasOT -> agruparOTS -> (Confirmado) -> construirServicios—, expuesta por
// data.js como D.serviciosDesdeFilasOT / D.otsDesdeFilasOT. Y lo que se ve en pantalla lo pintan las
// funciones REALES de render.js (renderG -> renderLaborDetalle + renderGasoil) sobre un markup con
// los mismos ids y clases que index.html: no hay una segunda version ni de las cuentas ni del HTML.
//
// El unico punto de contacto con el dashboard es la variable global D: esta vista le cambia
// `servicios_campanias`/`campanias_ot` para elegir que origen se pinta. index.html no carga este
// archivo, asi que el dashboard no se entera de nada de esto.

// Origen unico de los datos dinamicos. El Excel se lee del mismo lugar que el dashboard (SRC_XLSX).
const OT_ENDPOINT = '/api/albor/ordenes';
const OT_PARAM_EMPRESA = 'empresa';

// Recorte adicional de la consulta Power Query actual: de la campaña 25/26 solo entran las filas con
// fechaTeorica desde esta fecha. Las demas campañas NO reciben ningun recorte. Se aplica a las filas
// de la API porque el Excel ya viene con la regla aplicada desde Power Query — sin esto la API trae
// 6.096 filas de 25/26 contra las 43 del Excel.
const OT_CAMPANIA_RECORTADA = '25/26';
const OT_CORTE_2526 = Date.UTC(2026, 6, 1); // 2026-07-01

// Cuantas filas se listan en cada bloque de diferencias por OT (el total siempre se informa entero).
const OT_MAX_DIF = 40;
// Tolerancia al comparar importes: por debajo de un centavo es ruido de redondeo, no una diferencia.
const OT_EPS = 0.005;

const OT = {
  origen: 'excel',
  excelFilas: null,      // consultaOT tal como la lee el dashboard
  apiCrudas: null,       // lo que devolvio Albor, sin recortar
  apiFilas: null,        // ya con la regla de 25/26 aplicada
  paquetes: { excel: null, api: null },   // {campania: paquete de construirServicios}
  campanias: { excel: [], api: [] },
  http: null,
  consultadoEn: null,
  campos: [],
  cargandoExcel: false,
  cargandoApi: false,
  errorExcel: null,
  errorApi: null,
  iniciado: false,
};

// ---- Utilidades de fila ------------------------------------------------------------------------
// Se leen los MISMOS nombres de campo que consultaOT: verificado contra la respuesta real de
// CuboOrdenesTrabajo, que trae exactamente las mismas claves que la hoja del Excel (0 diferencias),
// asi que no hay ninguna traduccion de campos en el medio.
const otCampania = r => String((r && r.campania) || '').trim();
const otCultivo = r => String((r && r.actividad) || '').trim();

// fechaTeorica puede llegar como Date (Excel con cellDates) o como texto ISO (API).
function otFechaTeorica(r) {
  const v = r && r.fechaTeorica;
  if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v || '');
  if (!s) return null;
  const t = Date.parse(s.length > 10 ? s.slice(0, 10) : s);
  return isNaN(t) ? null : t;
}

// Regla de 25/26. Una fila de esa campaña sin fecha teorica interpretable NO entra: no se inventa
// una fecha para poder incluirla.
function otAplicarRegla2526(filas) {
  return filas.filter(r => {
    if (otCampania(r) !== OT_CAMPANIA_RECORTADA) return true;
    const t = otFechaTeorica(r);
    return t !== null && t >= OT_CORTE_2526;
  });
}

// ---- Construccion de los paquetes de Servicios, uno por campaña -----------------------------
// Mismo criterio que data.js para listar campañas (orden descendente por texto) y misma cadena de
// calculo. Solo se arma paquete para las campañas que tienen filas: asi el filtro nunca ofrece una
// campaña que quedaria vacia (por ejemplo al recortar por cultivo).
function otPaquetes(filas) {
  const campanias = [...new Set(filas.map(otCampania).filter(c => c))]
    .sort((a, b) => b.localeCompare(a, 'es'));
  const paquetes = {};
  campanias.forEach(c => {
    paquetes[c] = D.serviciosDesdeFilasOT(filas.filter(r => otCampania(r) === c));
  });
  return { campanias, paquetes };
}

// Filas del origen pedido, ya con los recortes de ENTRADA aplicados (cultivo). El recorte por
// cultivo es sobre las filas crudas, antes de la transformacion — no es un calculo nuevo, es la
// misma cuenta sobre menos filas, y se aplica igual a los dos origenes.
function otFilas(origen) {
  const base = origen === 'api' ? OT.apiFilas : OT.excelFilas;
  if (!base) return null;
  const cult = $('gcultivo').value;
  return cult === 'ALL' ? base : base.filter(r => otCultivo(r) === cult);
}

// ---- Consulta a la API -------------------------------------------------------------------------
function otUrl() {
  const pars = [
    [OT_PARAM_EMPRESA, $('ot-empresa').value],
    ['FechaDesde', $('ot-desde').value],
    ['FechaHasta', $('ot-hasta').value],
  ];
  const moneda = $('ot-moneda').value.trim();
  if (moneda !== '') pars.push(['IdMoneda', moneda]);
  const tipo = $('ot-tipo').value.trim();
  if (tipo !== '') pars.push(['TipoOrden', tipo]);
  // IdsCampanias va REPETIDO, un valor por campaña, igual que la consulta Power Query actual.
  $('ot-campanias').value.split(',').map(s => s.trim()).filter(s => s)
    .forEach(id => pars.push(['IdsCampanias', id]));
  return OT_ENDPOINT + '?' + pars.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}

async function otConsultarApi() {
  if (OT.cargandoApi) return;
  OT.cargandoApi = true; OT.errorApi = null;
  otPintarEstado();
  let resp, cuerpo;
  try {
    resp = await fetch(otUrl(), { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    cuerpo = await resp.json();
  } catch (e) {
    OT.cargandoApi = false;
    OT.errorApi = 'sin_conexion_' + ((e && e.name) || 'Error');
    otPintarTodo();
    return;
  }
  OT.http = resp.status;
  OT.consultadoEn = new Date();
  if (!resp.ok || !cuerpo || cuerpo.ok !== true) {
    OT.cargandoApi = false;
    OT.errorApi = (cuerpo && cuerpo.error && cuerpo.error.codigo) || 'desconocido';
    otPintarTodo();
    return;
  }
  const datos = cuerpo.datos;
  const lista = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.data) ? datos.data : null);
  if (!lista) {
    OT.cargandoApi = false;
    OT.errorApi = 'sin_lista_en_la_respuesta';
    otPintarTodo();
    return;
  }
  OT.apiCrudas = lista;
  OT.apiFilas = otAplicarRegla2526(lista);
  const campos = new Set();
  lista.forEach(r => { if (r && typeof r === 'object') Object.keys(r).forEach(k => campos.add(k)); });
  OT.campos = [...campos];
  OT.cargandoApi = false;
  otPintarTodo();
}

// ---- Carga del Excel de produccion -------------------------------------------------------------
// Se usan las MISMAS funciones del dashboard (cargarXLSX/hojaARows/separarInsumos/
// leerPresupuestoInfra de loader.js + buildData de data.js) sobre los MISMOS archivos, para que el
// lado "produccion" de la comparacion sea literalmente lo que hoy muestra el dashboard.
function otCargarExcel() {
  if (OT.cargandoExcel || OT.excelFilas) return Promise.resolve();
  OT.cargandoExcel = true; OT.errorExcel = null;
  otPintarEstado();
  return Promise.all([cargarXLSX('datosCampania2627.xlsx', SRC_XLSX),
    cargarXLSX('PRESUPUESTO ALISON INFRAESTRUTURA 26-27.xlsx', INFRA_SRC_XLSX)])
    .then(function (wbs) {
      const consultaOT = hojaARows(wbs[0], HOJA_OT);
      D = buildData(consultaOT, hojaARows(wbs[0], HOJA_CULTIVOS),
        separarInsumos(hojaARows(wbs[0], HOJA_INSUMOS)), leerPresupuestoInfra(wbs[1]));
      OT.excelFilas = consultaOT;
      OT.cargandoExcel = false;
    })
    .catch(function (e) {
      OT.cargandoExcel = false;
      OT.errorExcel = (e && e.message) || String(e);
    });
}

// ---- Aplicacion del origen elegido al render real de Servicios ---------------------------------
// Todo el pintado lo hace renderG() de render.js leyendo D.servicios_campanias, exactamente igual
// que en el dashboard. Acá solo se decide QUE paquete queda en D antes de llamarlo.
function otAplicar() {
  if (!D || !D.serviciosDesdeFilasOT) return;

  ['excel', 'api'].forEach(o => {
    const filas = otFilas(o);
    if (!filas) { OT.paquetes[o] = null; OT.campanias[o] = []; return; }
    const p = otPaquetes(filas);
    OT.paquetes[o] = p.paquetes; OT.campanias[o] = p.campanias;
  });

  const paq = OT.paquetes[OT.origen];
  if (!paq) { otPintarEstado(); otPintarValidacion(); otPintarDiag(); return; }

  // Se conserva la campaña elegida si sigue existiendo en el origen nuevo; si no, cae a la vigente
  // (lo que ya hace poblarFiltroCampanias) o a la primera disponible.
  const elegida = $('gcampania').value;
  D.servicios_campanias = paq;
  D.campanias_ot = OT.campanias[OT.origen];
  poblarFiltroCampanias();
  if (elegida && [...$('gcampania').options].some(o => o.value === elegida)) $('gcampania').value = elegida;
  poblarFiltrosServicios();
  renderG();
  otPintarEstado();
  otPintarValidacion();
  otPintarDiag();
}

// ---- Validacion: mismas metricas, los dos origenes ---------------------------------------------
// Se calculan SOBRE EL PAQUETE ya construido (S.gastos), con el mismo filtro de mes que aplica
// renderG: no se recalcula nada por afuera de la transformacion comun.
function otMetricas(paq, campania, mes) {
  const S = paq && paq[campania];
  if (!S) return null;
  const recs = mes === 'ALL' ? S.gastos : S.gastos.filter(r => r.mesnum === mes);
  const labores = new Set(recs.map(r => r.labor));
  return {
    ot: recs.reduce((s, r) => s + r.n, 0),
    labores: labores.size,
    ha: recs.reduce((s, r) => s + r.ha, 0),
    horas: recs.reduce((s, r) => s + r.horas, 0),
    kg: recs.reduce((s, r) => s + r.kg, 0),
    costo: recs.reduce((s, r) => s + r.propia + r.tercero + r.insumos, 0),
    costoConf: S.costo_conf,
  };
}

const OT_METRICAS = [
  { k: 'ot', lab: 'OT (registros del detalle)', dec: 0 },
  { k: 'labores', lab: 'Labores ejecutadas', dec: 0 },
  { k: 'ha', lab: 'Hectáreas', dec: 2 },
  { k: 'horas', lab: 'Horas', dec: 2 },
  { k: 'kg', lab: 'Kilos', dec: 2 },
  { k: 'costo', lab: 'Costo total (labores)', dec: 2, usd: true },
  { k: 'costoConf', lab: 'Costo confirmado (labores + gasoil)', dec: 2, usd: true },
];

const otFmt = (v, dec, usd) =>
  (usd ? 'US$ ' : '') + (dec === 0 ? fmt(v) : fmt2(v));

function otPintarValidacion() {
  const campania = $('gcampania').value;
  const mesV = $('gmes').value, mes = mesV === 'ALL' ? 'ALL' : parseInt(mesV);
  const e = otMetricas(OT.paquetes.excel, campania, mes);
  const a = otMetricas(OT.paquetes.api, campania, mes);
  const cult = $('gcultivo').value;
  $('ot-val-sub').textContent = 'Campaña ' + (CAMPANIA_LABEL[campania] || campania || '—') +
    ' · ' + (mesV === 'ALL' ? 'toda la campaña' : MES[mes]) +
    (cult === 'ALL' ? '' : ' · ' + cult) + ' · mismos filtros en los dos orígenes';

  if (!e || !a) {
    $('ot-val').innerHTML = '<tr><td colspan="4" class="tc-vacio">' +
      (!e && !a ? 'Faltan los dos orígenes.'
        : !a ? 'Falta consultar la API para poder comparar.'
        : 'Falta el Excel de producción para poder comparar.') + '</td></tr>';
    $('ot-dif-sub').textContent = '';
    $('ot-dif').innerHTML = '<tr><td colspan="7" class="tc-vacio">Sin comparación disponible.</td></tr>';
    return;
  }

  $('ot-val').innerHTML = OT_METRICAS.map(m => {
    const dif = a[m.k] - e[m.k];
    const igual = Math.abs(dif) < (m.dec === 0 ? 0.5 : OT_EPS);
    return '<tr><td>' + esc(m.lab) + '</td>' +
      '<td class="tr mono">' + otFmt(e[m.k], m.dec, m.usd) + '</td>' +
      '<td class="tr mono">' + otFmt(a[m.k], m.dec, m.usd) + '</td>' +
      '<td class="tr mono ' + (igual ? 'tc-ok' : 'tc-err') + '">' +
        (igual ? '0' : (dif > 0 ? '+' : '') + otFmt(dif, m.dec, m.usd)) + '</td></tr>';
  }).join('');

  otPintarDiferenciasOT(campania);
}

// ---- Diferencias OT por OT ---------------------------------------------------------------------
// Clave: el numero real de OT (campo ordenTrabajo), que es el identificador con el que agrupa el
// propio dashboard. No se ajusta ni se normaliza ningun valor para que coincidan.
// Respeta campaña y cultivo (los recortes de entrada); no aplica el filtro de Mes, porque el mes
// de Servicios se calcula sobre la fecha real de la OT ya agrupada — se aclara en el subtitulo.
function otConfirmadasPorOT(origen, campania) {
  const filas = otFilas(origen);
  if (!filas) return null;
  const m = {};
  D.otsDesdeFilasOT(filas.filter(r => otCampania(r) === campania))
    .filter(o => o.estado === 'Confirmado')
    .forEach(o => { m[o.ot] = o; });
  return m;
}

function otPintarDiferenciasOT(campania) {
  const e = otConfirmadasPorOT('excel', campania), a = otConfirmadasPorOT('api', campania);
  if (!e || !a) return;
  const soloExcel = [], soloApi = [], distintas = [];
  Object.keys(e).forEach(k => {
    if (!a[k]) { soloExcel.push({ ot: k, x: e[k] }); return; }
    if (Math.abs(e[k].imp - a[k].imp) >= OT_EPS) distintas.push({ ot: k, x: e[k], y: a[k] });
  });
  Object.keys(a).forEach(k => { if (!e[k]) soloApi.push({ ot: k, x: a[k] }); });

  const total = soloExcel.length + soloApi.length + distintas.length;
  $('ot-dif-sub').textContent = total === 0
    ? 'sin diferencias · ' + Object.keys(e).length + ' OT confirmadas coinciden en las dos fuentes'
    : total + ' OT con diferencia · ' + soloExcel.length + ' solo en Excel · ' +
      soloApi.length + ' solo en API · ' + distintas.length + ' con importe distinto' +
      ' · no aplica el filtro de Mes';

  if (total === 0) {
    $('ot-dif').innerHTML = '<tr><td colspan="7" class="tc-vacio">' +
      'Las dos fuentes traen exactamente las mismas OT confirmadas, con los mismos importes.</td></tr>';
    return;
  }
  const fila = (situacion, clase, ot, o, ce, ca) =>
    '<tr><td class="' + clase + '">' + situacion + '</td>' +
    '<td class="mono">OT ' + esc(ot) + '</td>' +
    '<td>' + esc(o.serv || '—') + '</td><td>' + esc(o.estado) + '</td>' +
    '<td class="tr mono">' + (ce === null ? '—' : 'US$ ' + fmtUSD(ce)) + '</td>' +
    '<td class="tr mono">' + (ca === null ? '—' : 'US$ ' + fmtUSD(ca)) + '</td>' +
    '<td class="tr mono">' + (ce === null || ca === null ? '—' : 'US$ ' + fmtUSD(ca - ce)) + '</td></tr>';

  const bloques = [];
  soloExcel.slice(0, OT_MAX_DIF).forEach(d => bloques.push(fila('Solo en Excel', 'tc-err', d.ot, d.x, d.x.imp, null)));
  soloApi.slice(0, OT_MAX_DIF).forEach(d => bloques.push(fila('Solo en API', 'tc-err', d.ot, d.x, null, d.x.imp)));
  distintas.slice(0, OT_MAX_DIF).forEach(d => bloques.push(fila('Importe distinto', 'tc-err', d.ot, d.y, d.x.imp, d.y.imp)));
  const recortadas = Math.max(0, soloExcel.length - OT_MAX_DIF) + Math.max(0, soloApi.length - OT_MAX_DIF) +
    Math.max(0, distintas.length - OT_MAX_DIF);
  if (recortadas) {
    bloques.push('<tr><td colspan="7" class="tc-vacio">' + recortadas +
      ' fila(s) más no se listan (se muestran hasta ' + OT_MAX_DIF + ' por grupo).</td></tr>');
  }
  $('ot-dif').innerHTML = bloques.join('');
}

// ---- Diagnostico tecnico -----------------------------------------------------------------------
function otPintarDiag() {
  const consultado = OT.consultadoEn
    ? OT.consultadoEn.toLocaleString('es-PY')
    : '—';
  $('ot-diag').innerHTML =
    tcKpi('Registros desde Albor', OT.apiCrudas ? fmt(OT.apiCrudas.length) : '—',
      'Respuesta cruda, sin recortar') +
    tcKpi('Tras el filtro 25/26', OT.apiFilas ? fmt(OT.apiFilas.length) : '—',
      'Solo 25/26 desde 2026-07-01') +
    tcKpi('Filas del Excel', OT.excelFilas ? fmt(OT.excelFilas.length) : '—',
      'consultaOT de producción') +
    tcKpi('HTTP status', OT.http === null ? '—' : String(OT.http),
      OT.errorApi ? OT.errorApi : 'Última consulta a la API', OT.errorApi ? 'tc-err' : '') +
    tcKpi('Consultado', consultado, 'Fecha y hora de la respuesta') +
    tcKpi('Campos recibidos', OT.campos.length ? String(OT.campos.length) : '—',
      OT.campos.length ? OT.campos.join(', ') : 'Sin consultar todavía');
  $('ot-url').textContent = 'GET ' + otUrl();
}

function otPintarEstado() {
  const partes = [];
  if (OT.cargandoExcel) partes.push('cargando Excel…');
  if (OT.cargandoApi) partes.push('consultando API…');
  if (OT.errorExcel) partes.push('Excel: ' + OT.errorExcel);
  if (OT.errorApi) partes.push('API: ' + OT.errorApi);
  if (!partes.length) {
    if (!OT.apiFilas) partes.push('API sin consultar — abrí el diagnóstico para consultarla');
    else partes.push('Excel y API cargados');
  }
  $('ot-estado').textContent = partes.join(' · ');
  $('ot-consultar').disabled = OT.cargandoApi;
  // El botón del origen API queda deshabilitado mientras no haya datos de la API: cambiar a un
  // origen vacío dejaría la réplica en blanco sin explicación.
  const btnApi = document.querySelector('#ot-origen button[data-origen="api"]');
  if (btnApi) btnApi.disabled = !OT.apiFilas;
}

// Opciones del filtro Cultivo: se toman de los DOS orígenes juntos, para que un cultivo que exista
// solo en uno de ellos igual se pueda inspeccionar (y se vea justamente esa diferencia).
function otPoblarCultivos() {
  const vals = new Set();
  [OT.excelFilas, OT.apiFilas].forEach(f => (f || []).forEach(r => {
    const c = otCultivo(r); if (c) vals.add(c);
  }));
  const sel = $('gcultivo'), previo = sel.value;
  sel.querySelectorAll('option:not([value=ALL])').forEach(o => o.remove());
  [...vals].sort((a, b) => a.localeCompare(b, 'es')).forEach(v => {
    const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o);
  });
  sel.value = [...sel.options].some(o => o.value === previo) ? previo : 'ALL';
}

function otPintarTodo() {
  otPoblarCultivos();
  otAplicar();
}

// ---- Arranque ----------------------------------------------------------------------------------
// Se dispara al abrir el módulo por primera vez, no al cargar la página: son dos .xlsx y una
// consulta pesada contra Albor.
async function otIniciar() {
  if (OT.iniciado) return;
  OT.iniciado = true;
  await otCargarExcel();
  otPintarTodo();
  await otConsultarApi();
}

document.addEventListener('DOMContentLoaded', () => {
  const hoy = new Date(), p = n => String(n).padStart(2, '0');
  $('ot-desde').value = hoy.getFullYear() + '-01-01';
  $('ot-hasta').value = hoy.getFullYear() + '-' + p(hoy.getMonth() + 1) + '-' + p(hoy.getDate());

  $('ot-origen').addEventListener('click', e => {
    const b = e.target.closest('button[data-origen]');
    if (!b || b.disabled) return;
    OT.origen = b.dataset.origen;
    [...$('ot-origen').querySelectorAll('button')].forEach(x =>
      x.classList.toggle('is-activo', x === b));
    otAplicar();
  });
  $('ot-consultar').addEventListener('click', otConsultarApi);
  // Los filtros que afectan a los DOS lados de la comparación repintan también la validación.
  $('gcultivo').addEventListener('change', otAplicar);
  $('gcampania').addEventListener('change', () => { cambiarCampaniaServicios(); otPintarValidacion(); });
  $('gmes').addEventListener('change', () => { renderG(); otPintarValidacion(); });
  // Los de la tabla de detalle solo afectan a esa tabla, igual que en producción (ver events.js).
  ['glabor', 'gestadio', 'gcontratista'].forEach(id =>
    $(id).addEventListener('change', renderLaborDetalle));

  document.getElementById('tc-nav').addEventListener('click', e => {
    if (e.target.closest('button[data-mod="ot"]')) otIniciar();
  });
  otPintarEstado();
  otPintarDiag();
});
