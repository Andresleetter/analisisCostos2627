// ============ VISTA TEMPORAL DE VALIDACION: CuboContable dinamico ============
// Solo comprueba que la cadena navegador -> Worker -> Albor funcione y que los campos lleguen
// interpretables. NO integra CuboContable con ningun modulo del dashboard (Resumen Ejecutivo,
// Servicios, Insumos, Combustible, Auditoria, Alertas), no reemplaza ninguna fuente estatica y no
// toca ningun calculo existente. Este archivo solo lo carga test-cubo-contable.html.
//
// Seguridad: la unica superficie que ve el navegador es la respuesta del proxy. El login, la key,
// la password y el token viven EXCLUSIVAMENTE dentro del Worker — acá no se pide, no se guarda, no
// se muestra y no se loguea ninguna credencial ni header de autenticacion.

// Origen unico de los datos de esta vista: el Worker desplegado. Nunca se lee un .xlsx acá y no hay
// ningun dato simulado — si el endpoint no responde, la vista lo dice, no rellena con nada.
const TC_ENDPOINT = '/api/albor/cubo-contable';

// El reporte real puede traer miles de registros: se listan solo los primeros para que la pagina
// siga siendo usable. El total recibido se informa aparte, siempre completo y sin recortar.
const TC_MAX_FILAS = 50;

// Campos que se muestran, exactamente con el nombre que trae la respuesta de CuboContable. No se
// inventa ninguno: si un campo no viene en un registro, la celda queda marcada como sin dato.
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

const $ = id => document.getElementById(id);

// Escapado: los valores vienen de un servicio externo y se insertan como HTML.
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ¿El valor es "sin dato"? null y undefined llegan de verdad en varios campos de CuboContable y no
// deben romper nada ni mostrarse como "null". El 0 y el false SI son datos validos.
const tcVacio = v => v === null || v === undefined || String(v).trim() === '';

// Limpieza visual de texto: la respuesta trae cuentaContableNombre con tabulaciones y espacios
// sobrantes (padding del origen). Se colapsa todo blanco a un espacio simple y se recorta. Es SOLO
// presentacion — no se altera ningun valor numerico ni se normaliza ningun otro campo.
const tcTexto = v => String(v).replace(/\s+/g, ' ').trim();

// Fecha: llega como ISO ("2026-08-12T00:00:00"). Se reusa pdate() de utils.js (mismo parseo que ya
// usa el dashboard, sin modificarlo) y se muestra dd/mm/aaaa. Si no se puede interpretar, se
// muestra el valor original en vez de inventar una fecha o dejar "Invalid Date".
function tcFecha(v) {
  const d = pdate(v);
  if (!d) return { txt: String(v), crudo: true };
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { txt: dd + '/' + mm + '/' + d.getFullYear(), crudo: false };
}

function tcCelda(reg, col) {
  const v = reg[col.campo];
  const clases = [];
  if (col.clase) clases.push(col.clase);
  if (tcVacio(v)) return '<td class="' + clases.concat('tc-nulo').join(' ') + '">—</td>';

  let txt;
  if (col.formato === 'fecha') {
    const f = tcFecha(v);
    txt = f.txt;
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

function tcAhora() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

// La respuesta del proxy es {ok:true, datos:<lo que devolvio Albor>}. Todavia no esta confirmado
// contra la API real si `datos` es un array plano o un objeto que envuelve la lista, asi que se
// buscan las formas habituales sin asumir una sola. Si no se encuentra una lista, se devuelve null
// para poder avisarlo en pantalla en vez de mostrar una tabla vacia como si no hubiera datos.
function tcRegistros(datos) {
  if (Array.isArray(datos)) return datos;
  if (datos && typeof datos === 'object') {
    for (const k of ['items', 'data', 'registros', 'results', 'rows', 'lista']) {
      if (Array.isArray(datos[k])) return datos[k];
    }
  }
  return null;
}

function tcPintarEstado(estado, clase, kpis, origen) {
  $('tc-estado').innerHTML = '<span class="' + clase + '">' + esc(estado) + '</span>';
  $('tc-kpis').innerHTML = kpis;
  $('tc-origen').textContent = origen;
}

async function tcConsultar() {
  const btn = $('tc-recargar');
  btn.disabled = true;
  const consultadoA = tcAhora();
  tcPintarEstado('Consultando…', '', tcKpi('Estado', 'Consultando…', TC_ENDPOINT), 'GET ' + TC_ENDPOINT);
  $('tc-filas').innerHTML = '';
  $('tc-sub').textContent = '';

  let resp, cuerpo;
  try {
    // cache:'no-store' del lado del navegador, en linea con el Cache-Control: no-store que ya
    // devuelve el Worker: cada consulta trae el dato actual de Albor.
    resp = await fetch(TC_ENDPOINT, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    cuerpo = await resp.json();
  } catch (e) {
    // Se informa el tipo de fallo, nunca headers ni credenciales (que ademas nunca llegan acá).
    tcPintarEstado('Sin conexión', 'tc-err',
      tcKpi('Estado', 'Error de red', 'No se pudo contactar el endpoint') +
      tcKpi('Registros recibidos', '—', 'Sin respuesta') +
      tcKpi('Consulta', consultadoA, 'Fecha/hora del intento'),
      'GET ' + TC_ENDPOINT + ' — la petición no llegó a completarse (' + (e && e.name ? e.name : 'Error') + ')');
    $('tc-filas').innerHTML = '<tr><td colspan="11" class="tc-vacio">No se pudo contactar ' + esc(TC_ENDPOINT) + '.</td></tr>';
    btn.disabled = false;
    return;
  }

  if (!resp.ok || !cuerpo || cuerpo.ok !== true) {
    // El Worker ya devuelve un error controlado y sin detalle sensible: se muestra su codigo tal cual.
    const cod = cuerpo && cuerpo.error && cuerpo.error.codigo ? cuerpo.error.codigo : 'desconocido';
    const msg = cuerpo && cuerpo.error && cuerpo.error.mensaje ? cuerpo.error.mensaje : 'Respuesta inesperada del proxy.';
    tcPintarEstado('Error ' + resp.status, 'tc-err',
      tcKpi('Estado', 'HTTP ' + resp.status, cod) +
      tcKpi('Registros recibidos', '0', 'La consulta no devolvió datos') +
      tcKpi('Consulta', consultadoA, 'Fecha/hora del intento'),
      'GET ' + TC_ENDPOINT + ' — ' + msg);
    $('tc-filas').innerHTML = '<tr><td colspan="11" class="tc-vacio">' + esc(msg) + ' (código: ' + esc(cod) + ')</td></tr>';
    btn.disabled = false;
    return;
  }

  const registros = tcRegistros(cuerpo.datos);
  if (registros === null) {
    tcPintarEstado('Conectado', 'tc-ok',
      tcKpi('Estado', 'Conectado', 'Respuesta OK, formato inesperado') +
      tcKpi('Registros recibidos', '—', 'No se encontró una lista de registros') +
      tcKpi('Consulta', consultadoA, 'Fecha/hora de la consulta'),
      'GET ' + TC_ENDPOINT + ' — HTTP ' + resp.status + '. La respuesta llegó pero no contiene una lista reconocible; claves recibidas: ' +
      (cuerpo.datos && typeof cuerpo.datos === 'object' ? Object.keys(cuerpo.datos).join(', ') : typeof cuerpo.datos));
    $('tc-filas').innerHTML = '<tr><td colspan="11" class="tc-vacio">La respuesta no trae una lista de registros reconocible.</td></tr>';
    btn.disabled = false;
    return;
  }

  // Campos realmente presentes en la respuesta, para poder comparar contra los que se muestran sin
  // suponer nada: si CuboContable trae campos que esta vista no lista, quedan a la vista acá.
  const camposPresentes = new Set();
  registros.forEach(r => { if (r && typeof r === 'object') Object.keys(r).forEach(k => camposPresentes.add(k)); });

  tcPintarEstado('Conectado', 'tc-ok',
    tcKpi('Estado', 'Conectado', 'HTTP ' + resp.status + ' · ' + TC_ENDPOINT) +
    tcKpi('Registros recibidos', String(registros.length), 'Total devuelto por Albor') +
    tcKpi('Consulta', consultadoA, 'Fecha/hora de la consulta') +
    tcKpi('Campos en la respuesta', String(camposPresentes.size), 'Distintos, sobre todos los registros'),
    'GET ' + TC_ENDPOINT + ' — HTTP ' + resp.status + '. Campos recibidos: ' + [...camposPresentes].sort().join(', '));

  if (!registros.length) {
    $('tc-sub').textContent = '0 registros';
    $('tc-filas').innerHTML = '<tr><td colspan="11" class="tc-vacio">La consulta se completó correctamente pero no devolvió registros.</td></tr>';
    btn.disabled = false;
    return;
  }

  const visibles = registros.slice(0, TC_MAX_FILAS);
  $('tc-sub').textContent = visibles.length < registros.length
    ? 'primeros ' + visibles.length + ' de ' + registros.length + ' registros · mostrados tal como llegan, sin recalcular'
    : registros.length + ' registro(s) · mostrados tal como llegan, sin recalcular';
  $('tc-filas').innerHTML = visibles.map(r => {
    const reg = (r && typeof r === 'object') ? r : {};
    return '<tr>' + TC_COLUMNAS.map(c => tcCelda(reg, c)).join('') + '</tr>';
  }).join('');
  btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', () => {
  $('tc-recargar').addEventListener('click', tcConsultar);
  tcConsultar();
});
