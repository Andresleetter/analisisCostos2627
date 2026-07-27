// ================== CONFIG ==================
// Fuente de datos: un único .xlsx en GitHub raw (antes eran 3 CSV separados; ahora 3 hojas de
// un mismo archivo, exportadas por Power Query: consultaOT, consultaCultivos, consultaInsumos).
const REPO = "Andresleetter/analisisCostos2627";
const BRANCH = "main";
const SRC_XLSX = "https://raw.githubusercontent.com/"+REPO+"/"+BRANCH+"/datosCampania2627.xlsx";
const HOJA_OT = "consultaOT";
const HOJA_CULTIVOS = "consultaCultivos";
const HOJA_INSUMOS = "consultaInsumos";
// El plan RTK (hectáreas planificadas por lote/cultivo) se construye en runtime desde consultaCultivos.
// "HOY" (fecha de referencia para atrasos y para el rótulo "Datos al…") ya no es fija: se calcula
// más abajo, dentro de buildData(), como la Fecha Teórica más reciente encontrada en las OT de
// consultaOT (se carga con la fecha del día en que se crea la OT) — así se actualiza sola a
// medida que se cargan nuevas OT, y sirve para verificar si la web está al día.
const MES = {1:'Ene',2:'Feb',3:'Mar',4:'Abr',5:'May',6:'Jun',7:'Jul',8:'Ago',9:'Sep',10:'Oct',11:'Nov',12:'Dic'};
const CULTIVOS = ['ARROZ','SOJA','SORGO','MAIZ','AVENA','COBERTURA'];
// Etapas de campaña consideradas para los indicadores de "avance" (todo lo demás que traiga el
// campo Estadio — Secadero, Operativo, Mantenimientos, Infraestructura, Generador combustible, etc.
// — queda fuera por no ser una etapa del ciclo del cultivo). Orden fijo = secuencia agronómica.
const ETAPA_ORDEN = ['preparacion de suelo','siembra','cuidados','cosecha'];
const ETAPA_LABEL = {'preparacion de suelo':'Preparación de Suelo','siembra':'Siembra','cuidados':'Cuidados','cosecha':'Cosecha'};
const OPERATIVAS = ['OPERATIVO','PARCELA ARROZ','PARCELA SOJA','PARCELA SORGO','CUIDADOS DE PATIOS VIVIENDA','CUIDADOS DE PATIOS SILO','A RECUPERAR RH','MANTENIMIENTO DE BOMBAS'];
// Discriminadores dentro de consultaInsumos (que trae TODOS los insumos, no solo combustible):
// tipoInsumo = "COMBUSTIBLES" separa las filas de combustible del resto (fertilizantes,
// agroquímicos, repuestos, etc. — quedan en insumos_pendiente_modulo para un módulo futuro).
// tipoMovimiento = "Existencia inicial" son las filas de stock de arranque de campaña (fechadas
// al inicio), separadas del Ingreso/Consumo porque no son un movimiento sino un saldo de partida.
const TIPO_INSUMO_COMBUSTIBLE = 'COMBUSTIBLES';
const MOV_EXISTENCIA_INICIAL = 'Existencia inicial';
// Campania vigente: criterio de inclusion de filas de consultaOT y de consultaCultivos
// (proyeccionRTK) unicamente — ver data.js. consultaInsumos (combustible + modulo Insumos) NO
// se filtra por campania: se procesa completo, tal como antes de introducir este filtro.
const CAMPANIA_ACTUAL = '26/27';

// ---- AUDITORIA: Presupuesto de Infraestructura vs ejecucion real ----
// Archivo aparte (subido al mismo repo), 1 sola hoja. Estructura fija verificada contra el .xlsx
// real: fila 1 = titulo, fila 2 = vacia, fila 3 = encabezados, filas 4-13 = los 10 items de
// presupuesto, fila 14 = fila de TOTAL. Filas 47-51 son calculos sueltos sin relacion a la tabla
// de items (sin Especificacion ni Cta. Contable) — se excluyen del parseo.
const INFRA_SRC_XLSX = "https://raw.githubusercontent.com/"+REPO+"/"+BRANCH+"/PRESUPUESTO%20ALISON%20INFRAESTRUTURA%2026-27.xlsx";
const INFRA_HOJA = "INFRAESTRUTURA 26-27";
// Indices de columna (0-based) dentro de cada fila de item, leida con header:1 (array crudo).
// OJO: la cantidad presupuestada real NO esta en la columna "Cant. De trabajo" (viene vacia en
// las 10 filas) sino en "PRESUPUESTO Aprob" (col 4) — confirmado contra el archivo real.
const INFRA_COL = {especificacion:2, cantidadPresupuestada:4, unidadMedida:5, costo:6, importeTotal:7};
// Cruce Especificacion (presupuesto) -> Servicio(s) reales de OT. Primer relevamiento (solo
// Estadio="Infraestructura") encontraba 23 OT; una busqueda mas amplia por palabra clave en
// Servicio (valo, muro, puente, camino, taipon...) SIN restringir por Estadio encontró muchas más
// OT reales bajo otros Estadios (Preparacion de Suelo, Operativo, Mantenimientos de
// infraestructura, Cuidados, Secadero) — se usan TODAS, tal como vienen cargadas, sin reinterpretar
// ni "limpiar" el dato de origen.
// No existe match de texto exacto para la mayoria de los items — este mapeo es MANUAL, revisado
// con el usuario. Los "camino" se separaron en dos grupos por el verbo del Servicio: "Corte"/
// "Construccion"/"Disqueada" (apertura de camino nuevo) vs "Reparacion"/"Arreglo"/"Cerrar"
// (mantenimiento de camino existente) — es una interpretacion, no un campo explícito de origen.
// "valo" y "muro" no distinguen tipo de intervención en el presupuesto (una sola línea cada uno),
// así que TODOS los servicios de esa palabra clave entran en esa única línea presupuestada.
// Especificacion sin Servicio(s) listados = sin ninguna OT que matchee todavia.
// Puentes (Labor Tercero / Labor Propia) NO usan este mapeo generico: tienen su propia sección
// ("Puentes por Unidad") mas abajo, con los Servicio exactos confirmados contra el dato real:
//   - "CONSTRUCCION PUENTE AGROVIAL" (no "CONTRUCCION...", ojo con la ortografia) = Labor Tercero.
//   - "CONSTRUCCION PUENTES LABOR PROPIA" (plural "PUENTES") = Labor Propia.
// Y el trabajo de puentes medido en Horas ("Construccion de Puentes retro excavadora x Hs") tiene
// su propia fila en la sección "Gastos" (por Horas), separado de estos dos por unidad.
const INFRA_PUENTES_TERCERO_ESP = 'Contrucion puentes Labor Tercero';
const INFRA_PUENTES_PROPIA_ESP = 'Contrucion puentes Labor Propia';
const INFRA_PUENTES_TERCERO_SERV = 'CONSTRUCCION PUENTE AGROVIAL';
const INFRA_PUENTES_PROPIA_SERV = 'CONSTRUCCION PUENTES LABOR PROPIA';
const INFRA_PUENTES_HORAS_SERV = 'Construccion de Puentes retro excavadora x Hs';
const INFRA_MAP = {
  'Contrucion camino nuevo': [
    'Construccion de Camino retro excavadora x Hs',
    'Dreno Patrolita x Hs',
    'Corte de camino retro excavadora x Hs',
    'Corte de camino retropala x Hs',
    'Disqueada de camino  tractor+disco x Hs',
  ],
  'Desmonte para camino nuevo': [],
  'Compuertas': [],
  'Tubos': [],
  'Limpieza valo': [
    'Limpieza de valo retro excavadora x Hs',
    'Limpieza de valo retropala x Hs',
    'Valo Drenaje retro excavadora x Hs',
    'Profundizacion de Valo retro excavadora x Hs',
  ],
  'Reparacion de camino': [
    'Reparacion de Camino retro excavadora x Hs',
    'Arreglo de caminos retropala x Hs',
    'Arreglo de camino tractor x Hs',
    'Cerrar camino retro excavadora x Hs',
    'Cerrar camino retropala x Hs',
  ],
  'Reparacion muro protecion': [
    'Reparacion de Muro retro excavadora x Hs',
    'Corte de Muro retro excavadora x Hs',
    'Cierre de Muro retro pala x Hs',
    'CIERRE DE MURO RETRO EXCAVADORA POR HORA',
  ],
  'Contrucion taipon chico': [
    'Corte de taipon retro excavadora x Hs',
    'Corte de taipon retropala x Hs',
    'Remonte de taipa x Hs',
  ],
};
let D=null;
