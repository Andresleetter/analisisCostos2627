// ================== WORKER / PROXY ALBOR ==================
// Proxy hacia la API de Albor. Existe UNICAMENTE para que el navegador nunca vea credenciales:
// el login se hace de este lado, el token temporal se usa y se descarta en la misma peticion, y
// al frontend solo le llega el reporte ya resuelto.
//
// ALCANCE ACTUAL — es la base del proxy, el dashboard todavia no la consume:
//   - el dashboard sigue funcionando igual que siempre (descarga los .xlsx desde GitHub, ver
//     loader.js). No se toco frontend, data.js, ni ningun calculo existente.
//   - los archivos estaticos los sirve el binding de assets ANTES de llegar a este Worker: solo
//     se ejecuta acá lo que no existe como archivo, que es el caso de /api/*. Nada de lo que pase
//     en este archivo puede romper la carga del dashboard.
//
// Rutas expuestas (ver la tabla REPORTES mas abajo):
//   GET /api/albor/ordenes         -> /Reportes/CuboOrdenesTrabajo
//   GET /api/albor/cubo-contable   -> /Reportes/CuboContable   (endpoint deducido, sin confirmar)
//
// Flujo identico para todas ellas:
//   1. login    POST {ALBOR_AUTH_URL}                        -> token temporal (response.data.token)
//   2. reporte  GET  {ALBOR_BASE_URL}{endpoint del reporte} con ese token
//   3. se devuelve el JSON del reporte. El token NUNCA sale de este Worker.
//
// Variables de entorno (NUNCA escritas en el codigo ni versionadas):
//   SECRETS — `wrangler secret put <NOMBRE>`:
//     ALBOR_LOGIN_KEY         usuario/clave de acceso del login
//     ALBOR_LOGIN_PASSWORD    contraseña del login
//   VARS no sensibles (pueden ir como vars normales):
//     ALBOR_LOGIN_APP         campo "app" del cuerpo del login
//     ALBOR_LOGIN_INSTALLATION campo "installation" del cuerpo del login
//     ALBOR_COMPANY           se envia como header X-Company al reporte
//     ALBOR_AUTH_URL          opcional, por defecto AUTH_URL_DEFAULT
//     ALBOR_BASE_URL          opcional, por defecto BASE_URL_DEFAULT
// Ya NO existe ningun ALBOR_TOKEN fijo: el token se obtiene en cada peticion y vive solo en memoria
// durante esa peticion.

// URLs por defecto (no son credenciales). Se pueden sobrescribir por env sin tocar el codigo, por
// si Albor cambia de host o hace falta apuntar a un ambiente de prueba.
const AUTH_URL_DEFAULT = 'https://auth-api.alboragro.com/auth/Login';
const BASE_URL_DEFAULT = 'https://backend.alboragro.com';

// Reportes expuestos por el proxy: ruta publica -> endpoint real de Albor + parametros aceptados.
// Los parametros son una lista explicita por reporte (no se reenvia la query string entera): asi un
// parametro de mas en la URL del navegador no puede llegar al upstream sin pasar por acá. Se usa
// getAll/append para soportar los que vienen repetidos (ej. IdsCampanias con varias campanias).
// Agregar un reporte o un parametro = tocar solo esta tabla.
const REPORTES = {
  '/api/albor/ordenes': {
    endpoint: '/Reportes/CuboOrdenesTrabajo',
    params: ['FechaDesde', 'FechaHasta', 'IdMoneda', 'TipoOrden', 'IdsCampanias'],
  },
  // OJO — endpoint y parametros de CuboContable NO estan confirmados contra la API real: se
  // dedujeron por analogia con CuboOrdenesTrabajo (mismo prefijo /Reportes/ y los mismos filtros de
  // periodo/moneda/campania). Se corrigen acá, en un solo lugar, en cuanto se pruebe contra Albor.
  '/api/albor/cubo-contable': {
    endpoint: '/Reportes/CuboContable',
    params: ['FechaDesde', 'FechaHasta', 'IdMoneda', 'IdsCampanias'],
  },
};

// Variables sin las cuales no tiene sentido ni intentar la llamada. Solo los NOMBRES viven en el
// codigo; los valores siempre salen de env.
const ENV_REQUERIDAS = [
  'ALBOR_LOGIN_KEY',
  'ALBOR_LOGIN_PASSWORD',
  'ALBOR_LOGIN_APP',
  'ALBOR_LOGIN_INSTALLATION',
  'ALBOR_COMPANY',
];

// Corte de cada llamada al upstream, para no dejar la peticion colgada si Albor no responde.
const TIMEOUT_MS = 25000;

// UNICO constructor de respuestas del Worker: todo lo que sale de /api/* pasa por acá (exito,
// errores controlados, 404 y 405), asi que los dos headers valen para TODAS las respuestas sin
// excepcion y no hay forma de agregar un camino de salida que se los saltee.
//   Content-Type: application/json; charset=utf-8
//   Cache-Control: no-store  -> ni el navegador ni la cache de Cloudflare guardan la respuesta;
//                               cada consulta al endpoint vuelve a pedir los datos a Albor.
// Los archivos estaticos del dashboard NO pasan por acá: los sirve el pipeline de assets con el
// cacheo normal de Cloudflare (ver run_worker_first en wrangler.jsonc), sin ningun cambio.
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Error controlado con status propio (config, login, red): siempre la misma forma, mensaje generico
// para el cliente y un `codigo` estable para distinguir el caso sin filtrar detalle. Nunca incluye
// credenciales, ni el token, ni el cuerpo crudo de la respuesta del upstream.
function errorControlado(codigo, mensaje, status) {
  return json({ ok: false, error: { codigo, mensaje } }, status || 500);
}

// Diagnostico por status HTTP del reporte. El status real NO se oculta: se propaga tal cual y ademas
// se traduce a un `codigo` estable y a un mensaje que dice que revisar. Es lo que permite decidir,
// desde la vista de prueba, si hay que corregir el ENDPOINT o los PARAMETROS — especialmente
// mientras la ruta de CuboContable siga sin confirmar contra Albor.
// Ningun caso incluye el cuerpo de la respuesta del upstream: puede repetir el header Authorization
// o detalle interno del servicio. El status y el codigo alcanzan para orientar la correccion.
const DIAGNOSTICO_REPORTE = {
  400: ['parametros_invalidos', 'Albor rechazó los parámetros de la consulta (400). Revisar nombres y formato de los parámetros enviados.'],
  401: ['no_autenticado', 'Albor rechazó la autenticación (401). Revisar las credenciales de login y el token obtenido.'],
  403: ['sin_permiso', 'Albor denegó el acceso al reporte (403). Revisar permisos de la cuenta y el valor de X-Company.'],
  404: ['endpoint_inexistente', 'Albor no encontró el reporte (404). Es muy probable que la ruta del endpoint sea incorrecta.'],
  500: ['error_servicio_albor', 'Albor devolvió un error interno (500).'],
  503: ['servicio_no_disponible', 'El servicio de Albor no está disponible (503).'],
};

// Error del reporte: se propaga el status HTTP que devolvio Albor (pedido explicito), con un
// mensaje controlado y SIN el cuerpo del upstream. Un status fuera de rango se normaliza a 502 para
// no devolver algo invalido (ej. un 2xx/3xx en una rama de error).
function errorReporte(statusUpstream, codigo, mensaje) {
  const s = Number.isInteger(statusUpstream) && statusUpstream >= 400 && statusUpstream <= 599
    ? statusUpstream : 502;
  return json({ ok: false, error: { codigo, mensaje, status: s } }, s);
}

// Diagnostico del lado del Worker. Solo texto fijo y, como mucho, NOMBRES de variables o un status
// HTTP — nunca el token, ni la key/password, ni la URL completa (lleva los parametros de la
// consulta), ni el cuerpo de las respuestas.
function logInterno(mensaje) {
  console.error('[albor-proxy] ' + mensaje);
}

function envFaltantes(env) {
  return ENV_REQUERIDAS.filter(k => !env || !env[k] || !String(env[k]).trim());
}

// ---- Paso 1: login. Devuelve el token temporal, o lanza un Error con `codigo` para que el
// llamador arme la respuesta controlada. El token se devuelve como valor de retorno y no se guarda
// en ningun lado: ni en variables de modulo, ni en cache, ni en logs.
async function obtenerToken(env) {
  const url = String(env.ALBOR_AUTH_URL || AUTH_URL_DEFAULT).trim();

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        key: String(env.ALBOR_LOGIN_KEY),
        password: String(env.ALBOR_LOGIN_PASSWORD),
        app: String(env.ALBOR_LOGIN_APP),
        installation: String(env.ALBOR_LOGIN_INSTALLATION),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Solo el NOMBRE del error (TimeoutError/TypeError): el mensaje completo puede arrastrar la URL.
    const err = new Error('login inaccesible');
    err.codigo = 'login_inaccesible';
    err.detalle = 'no se pudo contactar el servicio de autenticación: ' + ((e && e.name) || 'Error');
    throw err;
  }

  if (!resp.ok) {
    // El cuerpo de un login fallido puede repetir la credencial enviada: no se lee ni se loguea.
    const err = new Error('login rechazado');
    err.codigo = 'login_fallido';
    err.detalle = 'el servicio de autenticación respondió ' + resp.status;
    throw err;
  }

  let cuerpo;
  try {
    cuerpo = await resp.json();
  } catch (e) {
    const err = new Error('login sin JSON');
    err.codigo = 'login_respuesta_invalida';
    err.detalle = 'el servicio de autenticación no devolvió JSON válido';
    throw err;
  }

  // Ubicacion del token segun el contrato de Albor: response.data.token.
  const token = cuerpo && cuerpo.data && cuerpo.data.token;
  if (!token || typeof token !== 'string') {
    // Se reporta unicamente que falta el campo — nunca el cuerpo recibido, que podria traer otros
    // datos de la cuenta.
    const err = new Error('token ausente');
    err.codigo = 'login_sin_token';
    err.detalle = 'la respuesta del login no trae data.token';
    throw err;
  }
  return token;
}

// ---- Paso 2: reporte, ya con el token temporal en mano. `reporte` es la entrada de REPORTES que
// corresponde a la ruta pedida (endpoint + parametros aceptados): el login, el manejo de errores y
// la politica de cache son EXACTAMENTE los mismos para todos los reportes, no hay una variante por
// ruta.
async function consultarReporte(request, env, reporte) {
  const faltantes = envFaltantes(env);
  if (faltantes.length) {
    // Los NOMBRES van al log del Worker (no son secretos); el cliente recibe solo el generico.
    logInterno('faltan variables de entorno: ' + faltantes.join(', '));
    return errorControlado('config_incompleta', 'El proxy de Albor no está configurado.', 500);
  }

  let token;
  try {
    token = await obtenerToken(env);
  } catch (e) {
    logInterno(e.detalle || 'fallo el login');
    const codigo = e.codigo || 'login_fallido';
    return errorControlado(codigo, 'No se pudo autenticar contra Albor.', 500);
  }

  let destino;
  try {
    const base = String(env.ALBOR_BASE_URL || BASE_URL_DEFAULT).trim().replace(/\/+$/, '');
    destino = new URL(base + reporte.endpoint);
  } catch (e) {
    logInterno('ALBOR_BASE_URL no es una URL valida');
    return errorControlado('config_invalida', 'El proxy de Albor no está configurado.', 500);
  }

  // Reenvio de parametros: solo los aceptados por ESTE reporte, tal cual vienen, sin
  // reinterpretarlos ni completarlos con valores por defecto. Los vacios no se mandan, para no
  // forzar un filtro que el que llamo no pidio.
  const entrada = new URL(request.url).searchParams;
  for (const p of reporte.params) {
    for (const v of entrada.getAll(p)) {
      if (String(v).trim() !== '') destino.searchParams.append(p, v);
    }
  }

  let resp;
  try {
    resp = await fetch(destino.toString(), {
      method: 'GET',
      headers: {
        'X-Company': String(env.ALBOR_COMPANY).trim(),
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
      },
      // Los subrequests GET de un Worker pasan por la cache de Cloudflare y se guardan segun los
      // headers que mande el origen. Si Albor devolviera el reporte como cacheable, dos consultas
      // seguidas con los mismos parametros podrian resolverse con la copia guardada en vez de con
      // el dato actual. 'no-store' lo desactiva: cada consulta al endpoint golpea Albor de verdad.
      // (El login es POST y los POST nunca se cachean, por eso no hace falta tocarlo — y asi se
      // deja la autenticacion sin modificar.)
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    logInterno('fallo la llamada al reporte: ' + ((e && e.name) || 'Error'));
    return errorControlado('upstream_inaccesible', 'No se pudo contactar el servicio de Albor.', 502);
  }

  if (!resp.ok) {
    // Se propaga el status REAL del reporte, con el codigo/mensaje que corresponde a ese status
    // (ver DIAGNOSTICO_REPORTE) para poder distinguir un problema de parametros de uno de endpoint,
    // de permisos o del servicio. El cuerpo del error del upstream NO se reenvia al navegador ni se
    // loguea: puede traer detalle interno o el propio token en el eco del request.
    const diag = DIAGNOSTICO_REPORTE[resp.status];
    logInterno('el reporte respondio ' + resp.status + (diag ? ' (' + diag[0] + ')' : ''));
    return diag
      ? errorReporte(resp.status, diag[0], diag[1])
      : errorReporte(resp.status, 'upstream_error', 'Albor no devolvió el reporte solicitado (HTTP ' + resp.status + ').');
  }

  let datos;
  try {
    datos = await resp.json();
  } catch (e) {
    logInterno('el reporte no devolvio JSON valido');
    return errorControlado('respuesta_invalida', 'La respuesta de Albor no tiene el formato esperado.', 502);
  }

  // Solo el reporte. Nunca el token, ni las credenciales, ni los headers usados contra Albor.
  return json({ ok: true, datos }, 200);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    const reporte = Object.prototype.hasOwnProperty.call(REPORTES, pathname) ? REPORTES[pathname] : null;
    if (reporte) {
      if (request.method !== 'GET') {
        return json({ ok: false, error: { codigo: 'metodo_no_permitido', mensaje: 'Use GET.' } }, 405);
      }
      // Red de seguridad: ningun error inesperado debe escaparse como un 500 de la plataforma con
      // stack trace (podria incluir valores en memoria). Todo sale por la misma respuesta JSON.
      try {
        return await consultarReporte(request, env, reporte);
      } catch (e) {
        logInterno('error inesperado: ' + ((e && e.name) || 'Error'));
        return errorControlado('error_interno', 'Ocurrió un error al procesar la solicitud.', 500);
      }
    }

    return json({ ok: false, error: { codigo: 'no_encontrado', mensaje: 'Ruta inexistente.' } }, 404);
  },
};
