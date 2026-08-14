// ============ VISTA TEMPORAL DE VALIDACION: CuboCashFlow ============
// Modulo "Cash Flow" de test-cubo-contable.html. Comprueba unicamente que la cadena
// navegador -> Worker -> Albor funcione para /Reportes/CuboCashFlow y muestra la ESTRUCTURA REAL de
// lo que devuelve. NO integra CashFlow con ningun modulo del dashboard (Resumen Ejecutivo,
// Servicios, Insumos, Combustible, Auditoria, Alertas), no reemplaza ninguna fuente estatica y no
// toca ningun calculo existente.
//
// Deliberadamente NO interpreta la respuesta: no hay lista de columnas prefijada ni ningun campo
// tratado como "importante". Las columnas de la tabla salen de los campos que realmente vengan en
// los registros, en el orden en que aparecen.
//
// Seguridad: la unica superficie que ve el navegador es la respuesta del proxy. El login, la key,
// la password y el token viven EXCLUSIVAMENTE dentro del Worker — acá no se pide, no se guarda, no
// se muestra y no se loguea ninguna credencial ni header de autenticacion.
//
// Independiente del modulo Cubo Contable: estado propio, controles propios y consultas propias. Lo
// unico que comparte son dos helpers de presentacion ya definidos en test-cubo-contable.js ($ y
// esc, que se cargan antes) y las clases CSS de test-cubo.css — para no duplicar ni JS ni estilos.

const CF_ENDPOINT = '/api/albor/cashflow';

// Parametro del PROXY (no del reporte): el Worker lo valida contra su lista blanca y recien ahi arma
// el header X-Company. IdsEmpresas, en cambio, SI es un parametro real de CuboCashFlow y viaja a
// Albor. Los dos salen del mismo selector de Empresa.
const CF_PARAM_EMPRESA = 'empresa';

// Valor fijo de la prueba: se pide la respuesta completa, sin paginar.
const CF_NO_PAGINATE = 'true';

// Cuantos registros se listan. El total se informa siempre completo y sin recortar.
const CF_MAX_FILAS = 25;
// Corte de un valor largo dentro de una celda, solo para que la tabla siga siendo legible.
const CF_MAX_TEXTO = 120;

// ---- Estado. Vive solo en memoria de la pagina; nada se persiste ni se manda a ningun lado.
const CF = {
  estado: 'inicial',   // inicial | cargando | ok | error
  http: null,
  codigo: null,
  empresa: null,
  hasta: null,
  parametros: [],      // NOMBRES de los parametros que el Worker reenvio (nunca valores sensibles)
  cuerpo: null,        // respuesta cruda de Albor, tal como la devolvio el proxy
  registros: [],
  campos: [],
  ms: null,
  consultado: false,
};

const cfHoyISO = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

const cfNum = n => n.toLocaleString('es-PY');

// ---- URL de la consulta. Solo lleva parametros del proxy y del reporte: el token y las
// credenciales nunca pasan por acá.
function cfUrl() {
  const empresa = $('cf-empresa').value;
  const pars = [
    [CF_PARAM_EMPRESA, empresa],
    ['NoPaginate', CF_NO_PAGINATE],
    ['FechaHasta', $('cf-hasta').value],
    ['IdsEmpresas', empresa],
  ];
  const moneda = $('cf-moneda').value.trim();
  if (moneda !== '') pars.push(['IdMoneda', moneda]);
  return CF_ENDPOINT + '?' + pars.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}

// ---- Deteccion de la lista de registros SIN suponer el nombre del campo. La respuesta puede traer
// mas de un array de primer nivel (ej. `errors` vacio junto a la lista real), asi que no alcanza con
// tomar el primero: se elige el que mas ELEMENTOS-OBJETO tenga, que es la forma de una lista de
// registros. A igualdad, el mas largo, y a igualdad de largo, el primero. La clave elegida se
// muestra en pantalla para que quede claro de donde salio la tabla.
// Si la respuesta ya es un array, es ella misma. Si no hay ninguna lista, se devuelve null y la
// pagina lo dice en vez de mostrar una tabla vacia.
function cfLista(cuerpo) {
  if (Array.isArray(cuerpo)) return { clave: '(raíz)', lista: cuerpo };
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const esRegistro = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  let mejor = null;
  for (const k of Object.keys(cuerpo)) {
    const v = cuerpo[k];
    if (!Array.isArray(v)) continue;
    const cand = { clave: k, lista: v, registros: v.filter(esRegistro).length };
    if (!mejor || cand.registros > mejor.registros ||
      (cand.registros === mejor.registros && cand.lista.length > mejor.lista.length)) mejor = cand;
  }
  return mejor;
}

// Campos realmente presentes en los registros, en orden de aparicion (no alfabetico: asi se ve como
// viene armado el registro del lado de Albor).
function cfCampos(registros) {
  const vistos = [];
  registros.forEach(r => {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      Object.keys(r).forEach(k => { if (!vistos.includes(k)) vistos.push(k); });
    }
  });
  return vistos;
}

function cfTipo(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// Descripcion corta del contenido de una clave del JSON, sin volcarlo entero.
function cfResumen(v) {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return cfNum(v.length) + ' elemento(s)';
  if (typeof v === 'object') return Object.keys(v).length + ' clave(s): ' + Object.keys(v).join(', ');
  return cfCorte(String(v));
}

const cfCorte = s => s.length > CF_MAX_TEXTO ? s.slice(0, CF_MAX_TEXTO) + '…' : s;

// Valor de una celda TAL CUAL llego: no se formatea, ni se redondea, ni se convierte. Un objeto o un
// array anidado se muestra como JSON compacto para poder verlo sin interpretarlo.
function cfCelda(reg, campo) {
  const v = reg[campo];
  if (v === null || v === undefined || String(v) === '') {
    return '<td class="tc-nulo">—</td>';
  }
  if (typeof v === 'object') {
    return '<td class="tc-crudo">' + esc(cfCorte(JSON.stringify(v))) + '</td>';
  }
  const numerico = typeof v === 'number';
  return '<td class="tc-crudo' + (numerico ? ' tr' : '') + '">' + esc(cfCorte(String(v))) + '</td>';
}

// ---- Consulta. Nunca lanza: cualquier fallo termina en estado 'error' con su codigo, sin romper la
// pagina ni afectar al modulo de Cubo Contable.
async function cfConsultar() {
  if (CF.estado === 'cargando') return;
  CF.estado = 'cargando';
  CF.consultado = true;
  CF.http = null; CF.codigo = null; CF.parametros = [];
  CF.cuerpo = null; CF.registros = []; CF.campos = []; CF.ms = null;
  CF.empresa = $('cf-empresa').value;
  CF.hasta = $('cf-hasta').value;
  cfPintar();

  const t0 = performance.now();
  let resp, cuerpo;
  try {
    // cache:'no-store' del lado del navegador, en linea con el Cache-Control: no-store que ya
    // devuelve el Worker: CashFlow es dinamico, cada consulta trae el dato actual de Albor.
    resp = await fetch(cfUrl(), { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    cuerpo = await resp.json();
  } catch (e) {
    CF.ms = performance.now() - t0;
    CF.estado = 'error';
    // Se informa el tipo de fallo, nunca headers ni credenciales (que ademas nunca llegan acá).
    CF.codigo = 'sin_conexion_' + ((e && e.name) || 'Error');
    cfPintar();
    return;
  }
  CF.ms = performance.now() - t0;
  CF.http = resp.status;

  if (!resp.ok || !cuerpo || cuerpo.ok !== true) {
    // El Worker ya devuelve un error controlado y sin detalle sensible: se pasa su codigo tal cual.
    CF.estado = 'error';
    CF.codigo = (cuerpo && cuerpo.error && cuerpo.error.codigo) || 'desconocido';
    CF.parametros = (cuerpo && cuerpo.parametros) || [];
    cfPintar();
    return;
  }

  CF.parametros = cuerpo.parametros || [];
  CF.cuerpo = cuerpo.datos;
  const lista = cfLista(cuerpo.datos);
  if (lista === null) {
    // Respondio 200 pero no hay ninguna lista: no se inventa una tabla, se avisa.
    CF.estado = 'error';
    CF.codigo = 'sin_lista_en_la_respuesta';
    cfPintar();
    return;
  }
  CF.estado = 'ok';
  CF.claveLista = lista.clave;
  CF.registros = lista.lista;
  CF.campos = cfCampos(lista.lista);
  cfPintar();
}

// ---- Pintado ------------------------------------------------------------------------------------
const CF_ESTADO_TXT = {
  inicial: 'Sin consultar',
  cargando: 'Consultando…',
  ok: 'Conectado',
  error: 'Error',
};

function cfKpi(lab, val, foot, clase) {
  return '<div class="kpi"><div class="k-lab">' + esc(lab) + '</div>' +
    '<div class="k-val' + (clase ? ' ' + clase : '') + '">' + esc(val) + '</div>' +
    '<div class="k-foot">' + esc(foot || '') + '</div></div>';
}

function cfPintarKpis() {
  const claseEstado = CF.estado === 'ok' ? 'tc-ok' : (CF.estado === 'error' ? 'tc-err' : '');
  const tiempo = CF.ms === null ? '' : (CF.ms / 1000).toFixed(1) + ' s';
  $('cf-kpis').innerHTML =
    cfKpi('Estado de conexión', CF_ESTADO_TXT[CF.estado],
      CF.codigo ? CF.codigo : (tiempo ? 'Respuesta en ' + tiempo : 'Vía Worker, sin credenciales en el navegador'),
      claseEstado) +
    cfKpi('HTTP status', CF.http === null ? '—' : String(CF.http),
      CF.parametros.length ? 'Parámetros enviados: ' + CF.parametros.join(', ') : 'Sin respuesta todavía') +
    cfKpi('Empresa consultada', CF.empresa ? 'Empresa ' + CF.empresa : '—',
      CF.empresa ? 'IdsEmpresas = ' + CF.empresa + ' · X-Company lo arma el Worker' : '') +
    cfKpi('Fecha Hasta', CF.hasta || '—', 'NoPaginate = ' + CF_NO_PAGINATE) +
    cfKpi('Registros recibidos', CF.estado === 'ok' ? cfNum(CF.registros.length) : '—',
      CF.estado === 'ok' ? 'En la clave "' + CF.claveLista + '"' : 'Total sin recortar') +
    cfKpi('Campos por registro', CF.estado === 'ok' ? String(CF.campos.length) : '—',
      'Detectados en la respuesta real');
}

function cfPintarEstructura() {
  const c = CF.cuerpo;
  if (c === null || c === undefined) {
    $('cf-estructura').innerHTML = '<tr><td colspan="3" class="tc-vacio">' +
      (CF.estado === 'cargando' ? 'Consultando…' : 'Sin respuesta todavía.') + '</td></tr>';
    $('cf-campos').textContent = '';
    return;
  }
  const claves = Array.isArray(c) ? [['(raíz)', c]]
    : (typeof c === 'object' ? Object.keys(c).map(k => [k, c[k]]) : [['(valor)', c]]);
  $('cf-estructura').innerHTML = claves.map(([k, v]) =>
    '<tr><td class="tc-crudo">' + esc(k) + '</td>' +
    '<td>' + esc(cfTipo(v)) + '</td>' +
    '<td class="tc-obs">' + esc(cfResumen(v)) + '</td></tr>').join('');
  $('cf-campos').textContent = CF.campos.length
    ? CF.campos.length + ' campos por registro: ' + CF.campos.join(', ')
    : 'Sin registros para inspeccionar campos.';
}

function cfPintarTabla() {
  if (CF.estado !== 'ok' || !CF.registros.length) {
    $('cf-head').innerHTML = '<th>Registros</th>';
    $('cf-sub').textContent = '';
    $('cf-filas').innerHTML = '<tr><td class="tc-vacio">' +
      (CF.estado === 'cargando' ? 'Consultando…'
        : CF.estado === 'error' ? 'La consulta no devolvió registros.'
        : 'Todavía no se consultó.') + '</td></tr>';
    return;
  }
  const visibles = CF.registros.slice(0, CF_MAX_FILAS);
  $('cf-sub').textContent = visibles.length < CF.registros.length
    ? 'primeros ' + visibles.length + ' de ' + cfNum(CF.registros.length) + ' registros · tal como llegan, sin recalcular'
    : cfNum(CF.registros.length) + ' registro(s) · tal como llegan, sin recalcular';
  $('cf-head').innerHTML = CF.campos.map(k => '<th>' + esc(k) + '</th>').join('');
  $('cf-filas').innerHTML = visibles.map(r => {
    const reg = (r && typeof r === 'object') ? r : {};
    return '<tr>' + CF.campos.map(k => cfCelda(reg, k)).join('') + '</tr>';
  }).join('');
}

function cfPintar() {
  $('cf-consultar').disabled = CF.estado === 'cargando';
  $('cf-url').textContent = 'GET ' + cfUrl();
  cfPintarKpis();
  cfPintarEstructura();
  cfPintarTabla();
}

document.addEventListener('DOMContentLoaded', () => {
  $('cf-hasta').value = cfHoyISO();
  $('cf-consultar').addEventListener('click', cfConsultar);
  // La URL de la consulta se mantiene a la vista mientras se tocan los filtros.
  ['cf-empresa', 'cf-hasta', 'cf-moneda'].forEach(id =>
    $(id).addEventListener('change', () => { $('cf-url').textContent = 'GET ' + cfUrl(); }));
  // Primera consulta al abrir el modulo, no al cargar la pagina: asi entrar a la vista no dispara
  // una llamada a Albor si solo se venia a usar Cubo Contable.
  document.getElementById('tc-nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-mod="cashflow"]');
    if (b && !CF.consultado) cfConsultar();
  });
  cfPintar();
});
