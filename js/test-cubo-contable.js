// ============ VISTA TEMPORAL DE VALIDACION: CuboContable dinamico ============
// Solo comprueba que la cadena navegador -> Worker -> Albor funcione y que los campos lleguen
// interpretables. NO integra CuboContable con ningun modulo del dashboard (Resumen Ejecutivo,
// Servicios, Insumos, Combustible, Auditoria, Alertas), no reemplaza ninguna fuente estatica y no
// toca ningun calculo existente. Este archivo solo lo carga test-cubo-contable.html.
//
// Seguridad: la unica superficie que ve el navegador es la respuesta del proxy. El login, la key,
// la password y el token viven EXCLUSIVAMENTE dentro del Worker — acá no se pide, no se guarda, no
// se muestra y no se loguea ninguna credencial ni header de autenticacion.
//
// CARGA POR MESES: el reporte devuelve ~17.000 registros por mes, asi que pedir el año entero de una
// agota el timeout del Worker (se comprobo: 01/01 -> hoy termina en 502 upstream_inaccesible). Por
// eso el periodo se parte en consultas mensuales independientes y los registros se acumulan. El
// recorte es SOLO por fecha: no se filtra por campaña, por dimension1 ni por ningun otro campo.

// Origen unico de los datos de esta vista: el Worker desplegado. Nunca se lee un .xlsx acá y no hay
// ningun dato simulado — si el endpoint no responde, la vista lo dice, no rellena con nada.
const TC_ENDPOINT = '/api/albor/cubo-contable';

// El reporte real trae decenas de miles de registros: se listan solo los primeros para que la pagina
// siga siendo usable. El total acumulado se informa aparte, siempre completo y sin recortar.
const TC_MAX_FILAS = 50;

// Unico año bajo prueba. El periodo arranca el 01/01 y llega, como maximo, hasta la fecha actual.
const TC_ANIO = 2026;

// Formato de fecha CONFIRMADO contra Albor: aaaa-mm-dd. Se probo tambien dd/mm/aaaa y el servicio lo
// rechaza con 400 parametros_invalidos, por eso ya no hay selector de formato.
function tcISO(anio, mes, dia) {
  const p = n => String(n).padStart(2, '0');
  return anio + '-' + p(mes) + '-' + p(dia);
}

const TC_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Meses a consultar, del 01 al `hastaMes` (1-12). Cada uno va del dia 1 al ultimo dia del mes; si es
// el mes en curso del año en curso, se corta en la fecha actual en vez de pedir dias futuros.
function tcRangos(hastaMes) {
  const hoy = new Date();
  const esAnioActual = hoy.getFullYear() === TC_ANIO;
  const rangos = [];
  for (let m = 1; m <= hastaMes; m++) {
    // Dia 0 del mes siguiente = ultimo dia de este mes (contempla febrero y los bisiestos).
    let ultimo = new Date(TC_ANIO, m, 0).getDate();
    if (esAnioActual && m === hoy.getMonth() + 1) ultimo = hoy.getDate();
    rangos.push({
      mes: m,
      nombre: TC_MESES[m - 1],
      desde: tcISO(TC_ANIO, m, 1),
      hasta: tcISO(TC_ANIO, m, ultimo),
      estado: 'pendiente',
      registros: null,
      http: null,
      codigo: null,
      ms: null,
      datos: [],
    });
  }
  return rangos;
}

// Ultimo mes que tiene sentido consultar: el actual si estamos dentro de TC_ANIO, si no, diciembre.
function tcUltimoMesDisponible() {
  const hoy = new Date();
  if (hoy.getFullYear() === TC_ANIO) return hoy.getMonth() + 1;
  return hoy.getFullYear() > TC_ANIO ? 12 : 1;
}

const $ = id => document.getElementById(id);

// Escapado: los valores vienen de un servicio externo y se insertan como HTML.
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Campos que se muestran, exactamente con el nombre que trae la respuesta de CuboContable. No se
// inventa ninguno: si un campo no viene en un registro, la celda queda marcada como sin dato.
// La respuesta trae 46 campos por registro; acá se listan los que alcanzan para auditar la carga.
const TC_COLUMNAS = [
  { campo: 'referencia' },
  { campo: 'fecha', formato: 'fecha' },
  { campo: 'cuentaContableCodigo' },
  { campo: 'cuentaContableNombre', formato: 'texto' },
  { campo: 'saldo', formato: 'crudo' },
  { campo: 'saldoCotizado', formato: 'crudo' },
  { campo: 'dimension1' },
  { campo: 'dimension2' },
  { campo: 'dimension3' },
  { campo: 'observaciones', clase: 'tc-obs' },
  { campo: 'empresa' },
];

// ¿El valor es "sin dato"? null y undefined llegan de verdad en varios campos de CuboContable y no
// deben romper nada ni mostrarse como "null". El 0 y el false SI son datos validos.
const tcVacio = v => v === null || v === undefined || String(v).trim() === '';

// Limpieza visual de texto: la respuesta trae cuentaContableNombre con tabulaciones y espacios
// sobrantes (padding del origen). Se colapsa todo blanco a un espacio simple y se recorta. Es SOLO
// presentacion — no se altera ningun valor numerico ni se normaliza ningun otro campo.
const tcTexto = v => String(v).replace(/\s+/g, ' ').trim();

// Fecha: llega como ISO ("2026-01-01T00:00:00"). Se reusa pdate() de utils.js (mismo parseo que ya
// usa el dashboard, sin modificarlo) y se muestra dd/mm/aaaa. Si no se puede interpretar, se
// muestra el valor original en vez de inventar una fecha o dejar "Invalid Date".
function tcFecha(v) {
  const d = pdate(v);
  if (!d) return String(v);
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}

function tcCelda(reg, col) {
  const v = reg[col.campo];
  const clases = [];
  if (col.clase) clases.push(col.clase);
  if (tcVacio(v)) return '<td class="' + clases.concat('tc-nulo').join(' ') + '">—</td>';

  let txt;
  if (col.formato === 'fecha') {
    txt = tcFecha(v);
  } else if (col.formato === 'texto') {
    txt = tcTexto(v);
  } else if (col.formato === 'crudo') {
    // Saldo y saldoCotizado se muestran con su valor ORIGINAL, sin formatear, redondear ni
    // convertir: esta vista sirve para auditar el dato tal como lo devuelve Albor.
    txt = String(v);
    clases.push('tc-crudo', 'tr');
  } else {
    txt = String(v);
  }
  return '<td' + (clases.length ? ' class="' + clases.join(' ') + '"' : '') + '>' + esc(txt) + '</td>';
}

function tcKpi(lab, val, foot, clase) {
  return '<div class="kpi"><div class="k-lab">' + esc(lab) + '</div>' +
    '<div class="k-val' + (clase ? ' ' + clase : '') + '">' + esc(val) + '</div>' +
    '<div class="k-foot">' + esc(foot || '') + '</div></div>';
}

const tcNum = n => n.toLocaleString('es-PY');

// ---- Estado de la carga. Vive solo en memoria de la pagina; nada se persiste ni se manda a ningun
// lado. `meses` es la unica fuente de verdad: los acumulados se derivan de ahi, asi que reintentar
// un mes no puede duplicar ni perder registros de los demas.
const TC = { meses: [], cargando: false, inicio: null, ms: null, mesEnCurso: null };

const tcOk = () => TC.meses.filter(m => m.estado === 'ok');
const tcErrores = () => TC.meses.filter(m => m.estado === 'error');
// Registros acumulados, en orden cronologico de mes. Se recalcula al vuelo desde los meses que
// cargaron bien — un reintento exitoso se suma solo, sin tocar nada de lo ya cargado.
const tcAcumulados = () => TC.meses.reduce((acc, m) => m.estado === 'ok' ? acc.concat(m.datos) : acc, []);

// La respuesta del proxy es {ok:true, datos:<lo que devolvio Albor>, parametros:[nombres]}.
// Contra la API real, `datos` es un objeto con la lista en `data` (junto a succeeded, message,
// errors, generationTime y nombresDimensiones). Igual se contemplan las otras formas habituales por
// si algun reporte responde distinto; si no aparece ninguna lista se devuelve null para poder
// avisarlo en pantalla en vez de mostrar una tabla vacia como si no hubiera datos.
function tcRegistros(datos) {
  if (Array.isArray(datos)) return datos;
  if (datos && typeof datos === 'object') {
    for (const k of ['data', 'items', 'registros', 'results', 'rows', 'lista']) {
      if (Array.isArray(datos[k])) return datos[k];
    }
  }
  return null;
}

// URL de un mes. Solo lleva parametros del reporte: el token y las credenciales nunca pasan por acá.
function tcUrlMes(m) {
  const pars = [['FechaDesde', m.desde], ['FechaHasta', m.hasta]];
  const moneda = $('tc-moneda').value.trim();
  if (moneda !== '') pars.push(['IdMoneda', moneda]);
  return TC_ENDPOINT + '?' + pars.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}

// ---- Consulta de UN mes. Nunca lanza: deja el resultado en el propio mes para que un fallo no
// corte la cadena ni descarte lo ya cargado.
async function tcConsultarMes(m) {
  m.estado = 'cargando';
  m.registros = null; m.http = null; m.codigo = null; m.datos = [];
  TC.mesEnCurso = m;
  tcPintar();

  const t0 = performance.now();
  let resp, cuerpo;
  try {
    // cache:'no-store' del lado del navegador, en linea con el Cache-Control: no-store que ya
    // devuelve el Worker: cada consulta trae el dato actual de Albor.
    resp = await fetch(tcUrlMes(m), { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    cuerpo = await resp.json();
  } catch (e) {
    // Se informa el tipo de fallo, nunca headers ni credenciales (que ademas nunca llegan acá).
    m.estado = 'error'; m.codigo = 'sin_conexion_' + ((e && e.name) || 'Error');
    m.ms = performance.now() - t0;
    return;
  }
  m.ms = performance.now() - t0;
  m.http = resp.status;

  if (!resp.ok || !cuerpo || cuerpo.ok !== true) {
    // El Worker ya devuelve un error controlado y sin detalle sensible: se muestra su codigo tal cual.
    m.estado = 'error';
    m.codigo = (cuerpo && cuerpo.error && cuerpo.error.codigo) || 'desconocido';
    return;
  }

  const registros = tcRegistros(cuerpo.datos);
  if (registros === null) {
    m.estado = 'error'; m.codigo = 'formato_inesperado';
    return;
  }
  m.estado = 'ok';
  m.datos = registros;
  m.registros = registros.length;
}

// ---- Carga completa: mes a mes, en orden y de a uno. Secuencial a proposito — cada consulta pesa
// varios segundos del lado de Albor y dispararlas todas juntas solo consigue timeouts.
async function tcCargar() {
  if (TC.cargando) return;
  TC.cargando = true;
  TC.meses = tcRangos(Number($('tc-hasta-mes').value));
  TC.inicio = performance.now(); TC.ms = null;
  tcPintar();

  for (const m of TC.meses) await tcConsultarMes(m);

  TC.mesEnCurso = null;
  TC.ms = performance.now() - TC.inicio;
  TC.cargando = false;
  tcPintar();
}

// ---- Reintento de UN mes fallido. No vuelve a pedir el año: solo ese periodo, conservando todo lo
// que ya se habia cargado.
async function tcReintentar(mes) {
  if (TC.cargando) return;
  const m = TC.meses.find(x => x.mes === mes);
  if (!m) return;
  TC.cargando = true;
  const t0 = performance.now();
  await tcConsultarMes(m);
  TC.mesEnCurso = null;
  TC.ms = (TC.ms || 0) + (performance.now() - t0);
  TC.cargando = false;
  tcPintar();
}

// ---- Pintado ------------------------------------------------------------------------------------
const TC_ETIQUETA = { pendiente: 'En espera', cargando: 'Consultando…', ok: 'OK', error: 'Error' };

function tcPintarKpis() {
  const acumulados = tcAcumulados();
  const ok = tcOk(), err = tcErrores();
  const enCurso = TC.mesEnCurso ? TC.mesEnCurso.nombre : (TC.cargando ? '—' : (TC.meses.length ? 'Finalizado' : '—'));
  const segundos = TC.ms !== null ? (TC.ms / 1000).toFixed(1) + ' s'
    : (TC.cargando && TC.inicio !== null ? 'en curso…' : '—');

  $('tc-kpis').innerHTML =
    tcKpi('Año consultado', String(TC_ANIO), 'Recorte solo por fecha, sin filtro de campaña') +
    tcKpi('Mes en curso', enCurso, TC.mesEnCurso ? TC.mesEnCurso.desde + ' → ' + TC.mesEnCurso.hasta : 'Consultas mensuales independientes') +
    tcKpi('Registros acumulados', tcNum(acumulados.length), 'Suma de los meses que cargaron bien') +
    tcKpi('Meses completados', ok.length + ' / ' + TC.meses.length, 'Con respuesta HTTP 200') +
    tcKpi('Meses con error', String(err.length), err.length ? 'Reintentables de a uno' : 'Ninguno', err.length ? 'tc-err' : '') +
    tcKpi('Tiempo total', segundos, 'Suma de todas las consultas');
}

function tcPintarMeses() {
  if (!TC.meses.length) {
    $('tc-meses').innerHTML = '<tr><td colspan="8" class="tc-vacio">Sin consultar todavía.</td></tr>';
    return;
  }
  $('tc-meses').innerHTML = TC.meses.map(m => {
    const clase = m.estado === 'ok' ? 'tc-ok' : (m.estado === 'error' ? 'tc-err' : '');
    // El boton solo aparece en los meses fallidos: reintentar reconsulta EXCLUSIVAMENTE ese periodo.
    const accion = m.estado === 'error' && !TC.cargando
      ? '<button type="button" class="tc-btn tc-btn-mini" data-mes="' + m.mes + '">Reintentar</button>' : '';
    return '<tr>' +
      '<td>' + esc(m.nombre) + '</td>' +
      '<td class="tc-crudo">' + esc(m.desde) + ' → ' + esc(m.hasta) + '</td>' +
      '<td class="' + clase + '">' + esc(TC_ETIQUETA[m.estado]) + '</td>' +
      '<td>' + (m.http === null ? '—' : esc(String(m.http))) + '</td>' +
      '<td>' + (m.codigo ? esc(m.codigo) : '—') + '</td>' +
      '<td class="tr">' + (m.registros === null ? '—' : tcNum(m.registros)) + '</td>' +
      '<td class="tr">' + (m.ms === null ? '—' : (m.ms / 1000).toFixed(1) + ' s') + '</td>' +
      '<td>' + accion + '</td>' +
      '</tr>';
  }).join('');
}

function tcPintarTabla() {
  const acumulados = tcAcumulados();
  if (!acumulados.length) {
    $('tc-sub').textContent = '';
    $('tc-origen').textContent = '';
    $('tc-filas').innerHTML = '<tr><td colspan="11" class="tc-vacio">' +
      (TC.cargando ? 'Cargando…' : 'Todavía no hay registros cargados.') + '</td></tr>';
    return;
  }

  // Campos realmente presentes en la respuesta, para poder comparar contra los que se muestran sin
  // suponer nada: si CuboContable trae campos que esta vista no lista, quedan a la vista acá.
  const campos = new Set();
  acumulados.forEach(r => { if (r && typeof r === 'object') Object.keys(r).forEach(k => campos.add(k)); });

  const visibles = acumulados.slice(0, TC_MAX_FILAS);
  $('tc-sub').textContent = visibles.length < acumulados.length
    ? 'primeros ' + visibles.length + ' de ' + tcNum(acumulados.length) + ' registros · mostrados tal como llegan, sin recalcular'
    : tcNum(acumulados.length) + ' registro(s) · mostrados tal como llegan, sin recalcular';
  $('tc-origen').textContent = campos.size + ' campos recibidos: ' + [...campos].sort().join(', ');
  $('tc-filas').innerHTML = visibles.map(r => {
    const reg = (r && typeof r === 'object') ? r : {};
    return '<tr>' + TC_COLUMNAS.map(c => tcCelda(reg, c)).join('') + '</tr>';
  }).join('');
}

function tcPintar() {
  $('tc-cargar').disabled = TC.cargando;
  $('tc-url').textContent = TC.mesEnCurso
    ? 'GET ' + tcUrlMes(TC.mesEnCurso)
    : 'GET ' + TC_ENDPOINT + '?FechaDesde=aaaa-mm-dd&FechaHasta=aaaa-mm-dd&IdMoneda=…  (una consulta por mes)';
  tcPintarKpis();
  tcPintarMeses();
  tcPintarTabla();
}

document.addEventListener('DOMContentLoaded', () => {
  // Opciones de "hasta el mes": nunca mas alla del mes actual, para no pedir periodos futuros.
  const ultimo = tcUltimoMesDisponible();
  $('tc-hasta-mes').innerHTML = TC_MESES.slice(0, ultimo)
    .map((n, i) => '<option value="' + (i + 1) + '"' + (i + 1 === ultimo ? ' selected' : '') + '>' + n + '</option>').join('');

  $('tc-cargar').addEventListener('click', tcCargar);
  // Un solo listener para todos los botones de reintento (se repintan en cada cambio de estado).
  $('tc-meses').addEventListener('click', e => {
    const b = e.target.closest('button[data-mes]');
    if (b) tcReintentar(Number(b.dataset.mes));
  });
  // No se consulta sola al abrir: son varias consultas pesadas contra Albor, se disparan a pedido.
  tcPintar();
});
