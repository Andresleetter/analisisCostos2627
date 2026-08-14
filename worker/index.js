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
// Flujo de GET /api/albor/ordenes:
//   1. login    POST {ALBOR_AUTH_URL}                        -> token temporal (response.data.token)
//   2. reporte  GET  {ALBOR_BASE_URL}/Reportes/CuboOrdenesTrabajo con ese token
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

// Ruta publica expuesta por este Worker y endpoint real del reporte.
const RUTA_ORDENES = '/api/albor/ordenes';
const ENDPOINT_ORDENES = '/Reportes/CuboOrdenesTrabajo';

// URLs por defecto (no son credenciales). Se pueden sobrescribir por env sin tocar el codigo, por
// si Albor cambia de host o hace falta apuntar a un ambiente de prueba.
const AUTH_URL_DEFAULT = 'https://auth-api.alboragro.com/auth/Login';
const BASE_URL_DEFAULT = 'https://backend.alboragro.com';

// Parametros que se reenvian al reporte, como lista explicita (no se reenvia la query string
// entera): asi un parametro de mas en la URL del navegador no puede llegar al upstream sin pasar
// por acá. Se usa getAll/append para soportar los que vienen repetidos (ej. IdsCampanias con varias
// campanias). Agregar un parametro nuevo = agregarlo a esta lista, no hay otro lugar que tocar.
const PARAMS_ORDENES = ['FechaDesde', 'FechaHasta', 'IdMoneda', 'TipoOrden', 'IdsCampanias'];

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

// Error del reporte: se propaga el status HTTP que devolvio CuboOrdenesTrabajo (pedido explicito),
// con un mensaje controlado y SIN el cuerpo del upstream. Un status fuera de rango se normaliza a
// 502 para no devolver algo invalido (ej. un 2xx/3xx en una rama de error).
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

// ---- Paso 2: reporte, ya con el token temporal en mano.
async function ordenesTrabajo(request, env) {
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
    destino = new URL(base + ENDPOINT_ORDENES);
  } catch (e) {
    logInterno('ALBOR_BASE_URL no es una URL valida');
    return errorControlado('config_invalida', 'El proxy de Albor no está configurado.', 500);
  }

  // Reenvio de parametros: solo los de PARAMS_ORDENES, tal cual vienen, sin reinterpretarlos ni
  // completarlos con valores por defecto. Los vacios no se mandan, para no forzar un filtro que el
  // que llamo no pidio.
  const entrada = new URL(request.url).searchParams;
  for (const p of PARAMS_ORDENES) {
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    logInterno('fallo la llamada al reporte: ' + ((e && e.name) || 'Error'));
    return errorControlado('upstream_inaccesible', 'No se pudo contactar el servicio de Albor.', 502);
  }

  if (!resp.ok) {
    // Se propaga el status del reporte con mensaje controlado; el cuerpo del error del upstream no
    // se reenvia al navegador (puede traer detalle interno o el propio token en el eco del request).
    logInterno('el reporte respondio ' + resp.status);
    return errorReporte(resp.status, 'upstream_error', 'Albor no devolvió el reporte solicitado.');
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

    if (pathname === RUTA_ORDENES) {
      if (request.method !== 'GET') {
        return json({ ok: false, error: { codigo: 'metodo_no_permitido', mensaje: 'Use GET.' } }, 405);
      }
      // Red de seguridad: ningun error inesperado debe escaparse como un 500 de la plataforma con
      // stack trace (podria incluir valores en memoria). Todo sale por la misma respuesta JSON.
      try {
        return await ordenesTrabajo(request, env);
      } catch (e) {
        logInterno('error inesperado: ' + ((e && e.name) || 'Error'));
        return errorControlado('error_interno', 'Ocurrió un error al procesar la solicitud.', 500);
      }
    }

    return json({ ok: false, error: { codigo: 'no_encontrado', mensaje: 'Ruta inexistente.' } }, 404);
  },
};
