// ================== WORKER / PROXY ALBOR ==================
// Proxy hacia la API de Albor. Existe UNICAMENTE para que el navegador nunca vea credenciales:
// el login se hace de este lado, el token temporal se usa y se descarta en la misma peticion, y
// al frontend solo le llega el reporte ya resuelto.
//
// ESTADO ACTUAL — el proxy NO tiene ningun consumidor: nada del sitio lo llama.
//   - Decision del usuario: el dashboard se sigue alimentando del Excel (los .xlsx desde GitHub, ver
//     loader.js), porque cada consulta a la API gasta tokens de Albor y son limitados. La vista de
//     prueba que consumia estas rutas se elimino.
//   - El codigo queda como base por si mas adelante se retoma la migracion. Mientras nadie lo llame,
//     no genera ni una consulta a Albor: no hay tareas programadas ni llamadas automaticas acá.
//   - Se llego a validar contra el dato real que /api/albor/ordenes devuelve exactamente los mismos
//     numeros que consultaOT del Excel (mismos campos, mismos KPIs y costos), aplicando el recorte
//     de la campaña 25/26 desde 2026-07-01. La unica diferencia eran OT nuevas todavia no exportadas.
//   - los archivos estaticos los sirve el binding de assets ANTES de llegar a este Worker: solo
//     se ejecuta acá lo que no existe como archivo, que es el caso de /api/*. Nada de lo que pase
//     en este archivo puede romper la carga del dashboard.
//
// Rutas expuestas (ver la tabla REPORTES mas abajo):
//   GET /api/albor/ordenes         -> /Reportes/CuboOrdenesTrabajo
//   GET /api/albor/cubo-contable   -> /Reportes/CuboContable   (endpoint deducido, sin confirmar)
//   GET /api/albor/cashflow        -> /Reportes/CuboCashFlow
//
// Flujo identico para todas ellas:
//   1. token    AlborAuth (Durable Object global)            -> token vigente, o login si hace falta
//   2. reporte  GET  {ALBOR_BASE_URL}{endpoint del reporte} con ese token
//   3. se devuelve el JSON del reporte. El token NUNCA sale de este Worker.
//
// AUTENTICACION CENTRALIZADA — leer antes de agregar un endpoint nuevo:
//   * TODA la autenticacion contra Albor pasa por el Durable Object AlborAuth (ver la clase al final
//     de este archivo). Hay UNA sola instancia logica para todo el Worker (AUTH_NOMBRE), asi que los
//     tres reportes —y cualquier /api/albor/* que se agregue— comparten el MISMO token mientras siga
//     vigente, en vez de hacer un login por consulta.
//   * El token de Albor dura aproximadamente 30 minutos. Internamente se reutiliza 25 (TOKEN_VIDA_MS),
//     dejando 5 de margen para que nunca se use uno a punto de vencer.
//   * NO volver a implementar un login propio dentro de un reporte. Un endpoint nuevo solo tiene que
//     agregarse a REPORTES: el token ya se lo da consultarReporte() a traves del gestor.
//
// Variables de entorno (NUNCA escritas en el codigo ni versionadas):
//   SECRETS — `wrangler secret put <NOMBRE>`:
//     ALBOR_LOGIN_KEY         usuario/clave de acceso del login
//     ALBOR_LOGIN_PASSWORD    contraseña del login
//   VARS no sensibles (pueden ir como vars normales):
//     ALBOR_LOGIN_APP         campo "app" del cuerpo del login
//     ALBOR_LOGIN_INSTALLATION campo "installation" del cuerpo del login
//     ALBOR_COMPANY           X-Company de los reportes con empresa:'env' (hoy solo /ordenes).
//                             YA NO es obligatoria para todo el Worker: cubo-contable elige la
//                             empresa por consulta, sin tocar Variables and Secrets ni redesplegar.
//     ALBOR_AUTH_URL          opcional, por defecto AUTH_URL_DEFAULT
//     ALBOR_BASE_URL          opcional, por defecto BASE_URL_DEFAULT
// Ya NO existe ningun ALBOR_TOKEN fijo: el token se obtiene por login y vive dentro del Durable
// Object (memoria + su storage privado), nunca en el codigo ni en un archivo del repo.

import { DurableObject } from 'cloudflare:workers';

// URLs por defecto (no son credenciales). Se pueden sobrescribir por env sin tocar el codigo, por
// si Albor cambia de host o hace falta apuntar a un ambiente de prueba.
const AUTH_URL_DEFAULT = 'https://auth-api.alboragro.com/auth/Login';
const BASE_URL_DEFAULT = 'https://backend.alboragro.com';

// Reportes expuestos por el proxy: ruta publica -> endpoint real de Albor + parametros aceptados.
// Los parametros son una lista explicita por reporte (no se reenvia la query string entera): asi un
// parametro de mas en la URL del navegador no puede llegar al upstream sin pasar por acá. Se usa
// getAll/append para soportar los que vienen repetidos (ej. IdsCampanias con varias campanias).
// Agregar un reporte o un parametro = tocar solo esta tabla.
// `empresa` define de donde sale el header X-Company de ESE reporte:
//   'env'        -> del valor fijo de ALBOR_COMPANY (comportamiento historico)
//   'parametro'  -> se elige por consulta con ?empresa=, contra la lista blanca de mas abajo
const REPORTES = {
  '/api/albor/ordenes': {
    endpoint: '/Reportes/CuboOrdenesTrabajo',
    params: ['FechaDesde', 'FechaHasta', 'IdMoneda', 'TipoOrden', 'IdsCampanias'],
    // La empresa se elige por consulta (?empresa=1|5), igual que en los otros dos reportes: es la
    // fuente que va a reemplazar a consultasOT y la comparacion contra el Excel tiene que poder
    // fijar explicitamente con que X-Company se consulto (hoy, empresa 5). Antes salia de
    // ALBOR_COMPANY; ningun consumidor dependia de eso — esta ruta todavia no la usa el dashboard.
    empresa: 'parametro',
  },
  // OJO — el contrato real de CuboContable todavia NO esta confirmado contra la API. El endpoint se
  // dedujo por analogia con CuboOrdenesTrabajo, y la llamada sin parametros devuelve 400: se esta
  // descubriendo cuales son obligatorios probandolos de a poco (la vista de prueba que se usaba para
  // eso ya no existe, ver ESTADO ACTUAL al principio del archivo).
  // Por eso la lista arranca deliberadamente CORTA — solo estos tres, como primera prueba. No hay
  // valores por defecto: si el que llama no manda uno, no se manda. Cualquier otro parametro que
  // llegue en la URL se ignora (no se reenvia) hasta que se confirme que hace falta y se agregue acá.
  '/api/albor/cubo-contable': {
    endpoint: '/Reportes/CuboContable',
    params: ['FechaDesde', 'FechaHasta', 'IdMoneda'],
    // La empresa se elige en cada consulta (?empresa=1 o 5) en vez de quedar fija en una variable de
    // Cloudflare: cambiar de empresa no necesita tocar Variables and Secrets ni volver a desplegar.
    //
    // OJO — comprobado contra Albor: X-Company NO filtra los datos de este reporte. Enero 2026 con
    // X-Company 1 y con 5 devuelve los MISMOS 17.077 registros, con idEmpresa 5, 1 y 3 mezclados
    // (son dos consultas reales distintas: cambia el generationTime). Al parecer el header define el
    // contexto de la sesion, no el alcance del reporte. Si hace falta ver una sola empresa, hay que
    // filtrar por el campo idEmpresa de la respuesta o encontrar el parametro del reporte que lo
    // haga — todavia sin confirmar cual es.
    empresa: 'parametro',
  },
  // CuboCashFlow. Parametros del reporte, ninguno mas. IdsEmpresas SI es un parametro real del
  // reporte (a diferencia de `empresa`, que es del proxy), asi que viaja tal cual hacia Albor.
  // La lista sale de una URL REAL del reporte, aportada por el usuario:
  //   /Reportes/CuboCashFlow?FechaDesde=…&FechaHasta=…&IdMoneda=2&Rubro=5
  // Eso explica el 400 anterior: faltaba Rubro. La primera lista de parametros (NoPaginate,
  // FechaHasta, IdMoneda, IdsEmpresas) devolvia 400 en TODAS sus combinaciones y formatos probados
  // (con/sin cada uno, NoPaginate true/True/1, fecha aaaa-mm-dd / con hora / dd-mm-aaaa, empresas 1
  // y 5, con y sin FechaDesde). El 400 —y no un 404— ya indicaba que el endpoint existe y que lo
  // rechazado eran los parametros.
  // NoPaginate e IdsEmpresas se dejan aunque la URL real no los lleve: los dio el usuario como
  // parametros del reporte y son opcionales acá (si no llegan, no se mandan).
  // Reutiliza sin cambios el login automatico, el token temporal, el manejo de errores y el
  // Cache-Control: no-store del resto del Worker — no hay logica de autenticacion propia de esta
  // ruta. Igual que los demas, no hay valores por defecto acá: lo que no llega, no se manda.
  '/api/albor/cashflow': {
    endpoint: '/Reportes/CuboCashFlow',
    params: ['FechaDesde', 'FechaHasta', 'IdMoneda', 'Rubro', 'NoPaginate', 'IdsEmpresas'],
    // El header X-Company sigue saliendo de la lista blanca del proxy (?empresa=1|5), igual que en
    // cubo-contable: el navegador elige entre las empresas habilitadas, nunca define el header.
    // Que ademas exista IdsEmpresas no cambia eso — son dos cosas distintas: IdsEmpresas filtra el
    // reporte, X-Company identifica el contexto de la sesion.
    // COMPROBADO contra Albor, y al reves que en CuboContable: acá el que filtra de verdad es
    // IdsEmpresas, no X-Company. Con X-Company=5, agosto 2026 devuelve 482 registros (idEmpresa 5,
    // 1 y 3 mezclados) sin IdsEmpresas, y exactamente los 201 de idEmpresa 1 al agregar
    // IdsEmpresas=1. O sea: para ver una sola empresa hay que mandar IdsEmpresas.
    empresa: 'parametro',
  },
};

// Empresas habilitadas para el modo 'parametro'. Es una LISTA BLANCA a proposito: el valor que llega
// del navegador nunca se usa tal cual para armar el header — solo sirve para elegir una de estas
// entradas. Asi el frontend no puede definir un X-Company arbitrario aunque manipule la URL.
const EMPRESAS_PERMITIDAS = { '1': '1', '5': '5' };
const PARAM_EMPRESA = 'empresa';

// Variables sin las cuales no tiene sentido ni intentar la llamada. Solo los NOMBRES viven en el
// codigo; los valores siempre salen de env.
// ALBOR_COMPANY ya NO esta acá: solo hace falta para los reportes con empresa:'env'. Se valida en ese
// caso puntual, no para todo el Worker.
const ENV_REQUERIDAS = [
  'ALBOR_LOGIN_KEY',
  'ALBOR_LOGIN_PASSWORD',
  'ALBOR_LOGIN_APP',
  'ALBOR_LOGIN_INSTALLATION',
];

// Corte de cada llamada al upstream, para no dejar la peticion colgada si Albor no responde.
const TIMEOUT_MS = 25000;

// ---- Autenticacion centralizada ----------------------------------------------------------------
// UNA sola instancia logica del Durable Object para todo el Worker: el nombre es fijo a proposito,
// asi cualquier ruta /api/albor/* cae siempre en la misma y comparte el token.
const AUTH_NOMBRE = 'albor-auth-global';
// El token de Albor dura ~30 minutos. Se reutiliza 25 para dejar 5 de margen: asi nunca se manda
// una consulta con un token que podria vencer a mitad de camino.
const TOKEN_VIDA_MS = 25 * 60 * 1000;

// Stub del gestor global. `getByName` es la forma directa; el fallback por idFromName existe para
// runtimes donde todavia no esta disponible — las dos resuelven a la MISMA instancia.
function authGlobal(env) {
  const ns = env.ALBOR_AUTH;
  return ns.getByName ? ns.getByName(AUTH_NOMBRE) : ns.get(ns.idFromName(AUTH_NOMBRE));
}

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
// `parametros` son solo los NOMBRES de los parametros que se reenviaron al upstream (nunca sus
// valores): es lo que permite ver, desde la vista de prueba, con que combinacion se probo y cual
// quedo afuera por no estar en la lista blanca. No es informacion sensible.
function errorReporte(statusUpstream, codigo, mensaje, parametros, campos) {
  const s = Number.isInteger(statusUpstream) && statusUpstream >= 400 && statusUpstream <= 599
    ? statusUpstream : 502;
  const cuerpo = { ok: false, error: { codigo, mensaje, status: s }, parametros: parametros || [] };
  if (campos && campos.length) cuerpo.error.campos = campos;
  return json(cuerpo, s);
}

// ---- Campos que el upstream marco como invalidos, ante un 400. UNICA excepcion a la regla de no
// mirar el cuerpo del error, y esta acotada a proposito: se devuelven exclusivamente las CLAVES del
// objeto de validacion (nombres de campos como "FechaDesde" o "IdsSucursales"), nunca sus valores ni
// ningun texto libre de la respuesta. Sin esto no hay forma de saber que parametro falta en un
// reporte cuyo contrato todavia no esta confirmado.
// Dos candados para que no pueda escaparse nada mas:
//   1. Solo se leen claves de un objeto plano; los VALORES (que son los mensajes) no se tocan nunca.
//   2. Cada clave tiene que ser un identificador corto (letras, digitos, _ . [ ]). Cualquier cosa con
//      espacios, guiones o mas de 60 caracteres —o sea, cualquier mensaje, URL o token— queda afuera.
const CAMPO_VALIDO = /^[A-Za-z0-9_.[\]]{1,60}$/;
const CAMPOS_MAX = 12;

function camposInvalidos(texto) {
  let cuerpo;
  try {
    cuerpo = JSON.parse(texto);
  } catch (e) {
    return [];
  }
  const errores = cuerpo && cuerpo.errors;
  if (!errores || typeof errores !== 'object' || Array.isArray(errores)) return [];
  return Object.keys(errores).filter(k => CAMPO_VALIDO.test(k)).slice(0, CAMPOS_MAX);
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

// ---- Login contra Albor. Devuelve el token, o lanza un Error con `codigo` para que el llamador
// arme la respuesta controlada.
// UNICO lugar del Worker que hace login, y lo llama UNICAMENTE AlborAuth.createToken(): ninguna
// ruta la invoca por su cuenta (ver la nota de autenticacion centralizada al principio del archivo).
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

// ================== AlborAuth — AUTENTICACION GLOBAL (Durable Object) ==================
// Administra el token de Albor para TODO el Worker. Existe una sola instancia logica
// (AUTH_NOMBRE), asi que CuboContable, Cash Flow, Ordenes de Trabajo y cualquier /api/albor/* que
// se agregue reutilizan el mismo token mientras siga vigente, en vez de hacer un login por consulta.
//
//   * El token de Albor dura aproximadamente 30 minutos.
//   * Internamente se reutiliza durante 25 (TOKEN_VIDA_MS): quedan 5 de margen.
//   * TODOS los endpoints de Albor tienen que pedir el token por acá.
//   * NO volver a implementar logins independientes por reporte.
//
// El token se guarda en el storage del Durable Object (privado del objeto, nunca en el repo ni en
// una variable de entorno) y ademas se cachea en memoria para no leer el storage en cada consulta.
// NUNCA se loguea, ni se devuelve al frontend, ni aparece en un mensaje de error.
export class AlborAuth extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.token = null;
    this.expiresAt = 0;
    // Renovacion en curso. Es el candado de concurrencia: si llegan varias consultas juntas y no hay
    // token vigente, la primera arranca el login y las demas esperan ESA misma promesa en vez de
    // disparar un login cada una. Se limpia siempre al terminar (exito o error), asi un fallo no
    // deja el gestor pegado a una promesa rechazada.
    this.enCurso = null;
  }

  // Carga perezosa desde el storage: la instancia puede haberse reiniciado con un token todavia
  // vigente guardado de antes.
  async cargar() {
    if (this.token !== null) return;
    const g = await this.ctx.storage.get(['albor_token', 'albor_expires_at']);
    this.token = g.get('albor_token') || null;
    this.expiresAt = g.get('albor_expires_at') || 0;
  }

  vigente() {
    return typeof this.token === 'string' && this.token !== '' && this.expiresAt > Date.now();
  }

  // ---- API publica del gestor -------------------------------------------------------------------
  // Devuelve {ok:true, token} o {ok:false, codigo}. Se devuelve un objeto en vez de lanzar para que
  // el `codigo` sobreviva al cruce RPC entre el Worker y el Durable Object.
  async getToken() {
    await this.cargar();
    if (this.vigente()) {
      console.log('[albor-auth] token reutilizado');
      return { ok: true, token: this.token };
    }
    return this.refreshToken();
  }

  // Renueva el token. Si ya hay una renovacion en curso, se espera esa: nunca dos logins en paralelo.
  async refreshToken() {
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.createToken().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  // Login real + persistencia. Unico camino por el que entra un token nuevo.
  async createToken() {
    let token;
    try {
      token = await obtenerToken(this.env);
    } catch (e) {
      // `detalle` es texto fijo del propio Worker (nombre de error o status), nunca credenciales.
      logInterno(e.detalle || 'fallo el login');
      return { ok: false, codigo: e.codigo || 'login_fallido' };
    }
    this.token = token;
    this.expiresAt = Date.now() + TOKEN_VIDA_MS;
    await this.ctx.storage.put({ albor_token: token, albor_expires_at: this.expiresAt });
    console.log('[albor-auth] token creado mediante login');
    return { ok: true, token };
  }

  // Descarta el token guardado. La llama el proxy ante un 401 del reporte: el token dejo de servir
  // antes de lo previsto (revocado, cambio de credenciales, reinicio del lado de Albor).
  async invalidateToken() {
    this.token = null;
    this.expiresAt = 0;
    await this.ctx.storage.delete(['albor_token', 'albor_expires_at']);
    console.log('[albor-auth] token invalidado por 401');
  }
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

  // ---- Empresa (X-Company). Se resuelve ANTES del login: si el pedido no identifica una empresa
  // valida, se corta acá y no se contacta a Albor — ni para autenticarse ni para el reporte.
  let xCompany;
  if (reporte.empresa === 'parametro') {
    const pedida = String(new URL(request.url).searchParams.get(PARAM_EMPRESA) || '').trim();
    if (pedida === '') {
      return errorControlado('empresa_requerida', 'Falta el parámetro empresa.', 400);
    }
    // El valor sale SIEMPRE de la lista blanca, nunca del texto recibido: el navegador elige entre
    // las empresas habilitadas, no define el header.
    if (!Object.prototype.hasOwnProperty.call(EMPRESAS_PERMITIDAS, pedida)) {
      return errorControlado('empresa_invalida', 'El parámetro empresa no corresponde a una empresa habilitada.', 400);
    }
    xCompany = EMPRESAS_PERMITIDAS[pedida];
  } else {
    // Reportes que siguen usando la empresa fija de Cloudflare.
    xCompany = String((env && env.ALBOR_COMPANY) || '').trim();
    if (xCompany === '') {
      logInterno('faltan variables de entorno: ALBOR_COMPANY');
      return errorControlado('config_incompleta', 'El proxy de Albor no está configurado.', 500);
    }
  }

  // Token: SIEMPRE del gestor global (AlborAuth). Acá no hay login propio — si el token guardado
  // sigue vigente, esta consulta no genera ninguna llamada al servicio de autenticacion.
  const auth = authGlobal(env);
  const cred = await auth.getToken();
  if (!cred.ok) {
    return errorControlado(cred.codigo, 'No se pudo autenticar contra Albor.', 500);
  }
  let token = cred.token;

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
  // Nombres de los parametros efectivamente reenviados. Se registran y se devuelven al cliente para
  // poder reconstruir con que combinacion se probo; los VALORES no se loguean ni hace falta que se
  // logueen (el que llama ya los conoce) y asi el log no puede arrastrar nada de la peticion.
  const enviados = [];
  for (const p of reporte.params) {
    for (const v of entrada.getAll(p)) {
      if (String(v).trim() !== '') {
        destino.searchParams.append(p, v);
        if (!enviados.includes(p)) enviados.push(p);
      }
    }
  }

  const pedirReporte = t => fetch(destino.toString(), {
    method: 'GET',
    headers: {
      // Valor ya resuelto y validado mas arriba; nunca el texto crudo que mando el navegador.
      'X-Company': xCompany,
      'Authorization': 'Bearer ' + t,
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

  let resp;
  try {
    resp = await pedirReporte(token);
    // ---- 401: el token dejo de valer antes de lo previsto (revocado o invalidado del lado de
    // Albor). Se descarta el guardado, se pide uno nuevo y se repite la consulta UNA sola vez. Si el
    // segundo intento vuelve a dar 401 se devuelve el error controlado: no hay reintentos en cadena.
    if (resp.status === 401) {
      await auth.invalidateToken();
      const nueva = await auth.getToken();
      if (!nueva.ok) {
        return errorControlado(nueva.codigo, 'No se pudo autenticar contra Albor.', 500);
      }
      token = nueva.token;
      resp = await pedirReporte(token);
    }
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
    // Solo ante un 400 se mira el cuerpo, y solo para sacar NOMBRES de campos (ver camposInvalidos:
    // los mensajes y cualquier otro contenido quedan afuera por construccion). Para el resto de los
    // status el cuerpo se sigue descartando sin leer.
    let campos = [];
    if (resp.status === 400) {
      try {
        campos = camposInvalidos(await resp.text());
      } catch (e) { campos = []; }
    }
    logInterno('el reporte respondio ' + resp.status + (diag ? ' (' + diag[0] + ')' : '') +
      ' — parametros enviados: ' + (enviados.length ? enviados.join(', ') : '(ninguno)') +
      (campos.length ? ' — campos rechazados: ' + campos.join(', ') : ''));
    return diag
      ? errorReporte(resp.status, diag[0], diag[1], enviados, campos)
      : errorReporte(resp.status, 'upstream_error', 'Albor no devolvió el reporte solicitado (HTTP ' + resp.status + ').', enviados, campos);
  }

  let datos;
  try {
    datos = await resp.json();
  } catch (e) {
    logInterno('el reporte no devolvio JSON valido');
    return errorControlado('respuesta_invalida', 'La respuesta de Albor no tiene el formato esperado.', 502);
  }

  // Solo el reporte y los NOMBRES de los parametros usados. Nunca el token, ni las credenciales, ni
  // los headers usados contra Albor.
  return json({ ok: true, datos, parametros: enviados }, 200);
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
