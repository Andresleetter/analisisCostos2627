// ================== CONFIG ==================
// Fuente de datos: un único .xlsx con 3 hojas exportadas por Power Query (consultaOT,
// consultaCultivos, consultaInsumos); antes eran 3 CSV separados.
//
// De dónde se descarga: del PROPIO sitio (ruta relativa), no de raw.githubusercontent. Cloudflare
// despliega el repo completo como assets estáticos (ver wrangler.jsonc: assets.directory "."), así
// que el mismo .xlsx que está en GitHub ya se sirve desde el dominio del dashboard, por el CDN de
// Cloudflare. El flujo de trabajo no cambia en nada: sigue habiendo que commitear y pushear el
// Excel a main para que el sitio en vivo lo tome (Cloudflare redespliega solo).
// Motivo del cambio: raw.githubusercontent NO es un CDN para tráfico de usuarios y aplica límites
// de conexiones — el 17/08/2026 devolvió 503 "Backend.max_conn reached" (y 429 Too Many Requests)
// desde el nodo de Buenos Aires, dejando el dashboard sin cargar. Afectaba por igual al archivo de
// presupuesto, que no se había tocado. La ruta relativa saca esa dependencia del medio.
const REPO = "Andresleetter/analisisCostos2627";
const BRANCH = "main";
// Respaldo: si el archivo no se puede bajar del sitio (caso típico: abrir index.html directo desde
// el disco, sin servidor, donde fetch de una ruta relativa no funciona), loader.js reintenta contra
// GitHub. Nunca al revés: GitHub es el plan B, no el camino normal.
// Los archivos de datos viven en la carpeta data/ del repo, no en la raiz.
const SRC_DATA = "data/";
const SRC_XLSX = SRC_DATA+"datosCampania2627.xlsx";
const SRC_XLSX_RESPALDO = "https://raw.githubusercontent.com/"+REPO+"/"+BRANCH+"/"+SRC_DATA+"datosCampania2627.xlsx";
const HOJA_OT = "consultaOT";
const HOJA_CULTIVOS = "consultaCultivos";
const HOJA_INSUMOS = "consultaInsumos";
// El plan RTK (hectáreas planificadas por lote/cultivo) se construye en runtime desde consultaCultivos.
// "HOY" (fecha de referencia para atrasos y para el rótulo "Datos al…") ya no es fija: se calcula
// más abajo, dentro de buildData(), como la Fecha Teórica más reciente encontrada en las OT de
// consultaOT (se carga con la fecha del día en que se crea la OT) — así se actualiza sola a
// medida que se cargan nuevas OT, y sirve para verificar si la web está al día.
const MES = {1:'Ene',2:'Feb',3:'Mar',4:'Abr',5:'May',6:'Jun',7:'Jul',8:'Ago',9:'Sep',10:'Oct',11:'Nov',12:'Dic'};
// AVENA y COBERTURA se retiraron del Resumen Ejecutivo a pedido del usuario (sin tarjeta de KPIs
// de cultivo ni impacto en el promedio de avance general/alertas de "Posibles Problemas", que solo
// usan esta lista). No afecta a ningún otro módulo: CULTIVOS alimenta EXCLUSIVAMENTE el Resumen
// Ejecutivo (ver nota en data.js, sección "CULTIVOS: avance de campo"); Control de Hectáreas usa
// su propia lista aparte (RTK_CROPS, data.js).
const CULTIVOS = ['ARROZ','SOJA','SORGO','MAIZ'];
// Etapas de campaña consideradas para los indicadores de "avance" (todo lo demás que traiga el
// campo Estadio — Secadero, Operativo, Mantenimientos, Infraestructura, Generador combustible, etc.
// — queda fuera por no ser una etapa del ciclo del cultivo). Orden fijo = secuencia agronómica.
const ETAPA_ORDEN = ['preparacion de suelo','siembra','cuidados','cosecha'];
const ETAPA_LABEL = {'preparacion de suelo':'Preparación de Suelo','siembra':'Siembra','cuidados':'Cuidados','cosecha':'Cosecha'};
// Servicios que se cargan DENTRO del Estadio "Siembra" pero que no son la siembra en si, y por lo
// tanto no deben contar como avance de siembra (a pedido del usuario). Hoy es el tratamiento de
// semillas: se hace antes de sembrar y sobre la semilla, no sobre el lote — que una parcela tenga
// la semilla tratada no significa que este sembrada.
// Verificado contra el dato real: en la campania 26/27 el Estadio "Siembra" contiene UNICAMENTE
// "Tratamiento de semillas" (7 OT) y "Tratamiento de semilla arroz tractor x Hs" (1 OT), asi que
// todo el avance de siembra que se mostraba venia de ahi. La siembra real se carga con el servicio
// llamado exactamente "Siembra" (presente en la campania 26/Zafriña26).
// Es una lista de PREFIJOS comparados con normHdr (sin acentos/mayusculas), no de nombres exactos:
// asi cubre las variantes que ya existen ("Tratamiento de semillas", "Tratamiento de semilla arroz
// tractor x Hs") y las que aparezcan para otros cultivos. Se eligio excluir estos servicios en vez
// de exigir una lista blanca de servicios de siembra: si mañana se carga la siembra con otro
// nombre, tiene que contar sola, no quedar en 0% en silencio.
// Solo aplica al Estadio Siembra: el mismo servicio en otro estadio no se toca.
const SIEMBRA_SERVICIOS_NO_SIEMBRA = ['tratamiento de semilla'];
const OPERATIVAS = ['OPERATIVO','PARCELA ARROZ','PARCELA SOJA','PARCELA SORGO','CUIDADOS DE PATIOS VIVIENDA','CUIDADOS DE PATIOS SILO','A RECUPERAR RH','MANTENIMIENTO DE BOMBAS'];
// Discriminadores dentro de consultaInsumos (que trae TODOS los insumos, no solo combustible):
// tipoInsumo = "COMBUSTIBLES" separa las filas de combustible del resto (fertilizantes,
// agroquímicos, repuestos, etc. — quedan en insumos_pendiente_modulo para un módulo futuro).
// tipoMovimiento = "Existencia inicial" son las filas de stock de arranque de campaña (fechadas
// al inicio), separadas del Ingreso/Consumo porque no son un movimiento sino un saldo de partida.
const TIPO_INSUMO_COMBUSTIBLE = 'COMBUSTIBLES';
const MOV_EXISTENCIA_INICIAL = 'Existencia inicial';
// ---- Combustible: los CUATRO orígenes posibles del "Uso / Detalle" ----
// Un movimiento de combustible se atribuye por niveles, y los cuatro resultados son situaciones
// REALMENTE distintas que nunca deben mezclarse en una sola etiqueta:
//
//  1. VINCULO_OT ('ot')            La referenciaOrigen del movimiento encontró su OT en
//                                  consultaOT.referencia. El uso es la observación real de esa OT
//                                  (o USO_SIN_DETALLE si la OT no tiene observación cargada).
//  2. VINCULO_CONTRATISTA          El movimiento no trae referenciaOrigen pero sí un contratista
//     ('contratista')              informado: son las remisiones por venta de combustible a un
//                                  tercero (Cedrela S.A, Agro Vial, …). El uso es su nombre real.
//  3. VINCULO_OT_NO_DISPONIBLE     El movimiento SÍ trae su referenciaOrigen —se sabe de qué OT
//     ('ot_no_disponible')         salió— pero esa OT no está en el export de consultaOT, que
//                                  viene recortado por campaña. Verificado contra el dato: los
//                                  546 casos de hoy son TODOS de la campaña 25/26. NO es "sin OT"
//                                  ni "labor propia": la OT existió, falta su registro.
//                                  El uso NO es un rótulo genérico: es la PARCELA que declara el
//                                  propio movimiento (columna `cultivo` de consultaInsumos, ej.
//                                  "LA TERESA Operativos OPERATIVO 25/26"), que dice dónde se usó
//                                  el combustible sin depender de la OT. Está cargada en los 546.
//                                  USO_OT_NO_DISPONIBLE queda solo como respaldo por si algún
//                                  movimiento futuro llegara sin parcela.
//  4. VINCULO_LABOR_PROPIA         Ni referenciaOrigen ni contratista. Hoy no ocurre en el dato
//     ('labor_propia')             (0 movimientos), pero queda como último nivel explícito.
//
// Ninguno de estos movimientos se oculta jamás: los cuatro siguen dentro de los totales de litros
// y de movimientos, y su suma es exactamente el consumo original.
const VINCULO_OT = 'ot';
const VINCULO_CONTRATISTA = 'contratista';
const VINCULO_OT_NO_DISPONIBLE = 'ot_no_disponible';
const VINCULO_LABOR_PROPIA = 'labor_propia';
// Rótulo corto del origen, para el chip de la tabla.
const VINCULO_LABEL = {
  [VINCULO_OT]: 'OT vinculada',
  [VINCULO_CONTRATISTA]: 'Solo contratista',
  [VINCULO_OT_NO_DISPONIBLE]: 'OT no disponible',
  [VINCULO_LABOR_PROPIA]: 'Labor Propia',
};
// Textos del "Uso / Detalle" cuando no hay una observación de OT que describa el trabajo.
const USO_SIN_DETALLE = 'Sin detalle';
// Respaldo del nivel 3 cuando el movimiento tampoco trae parcela (hoy: 0 casos).
const USO_OT_NO_DISPONIBLE = 'OT histórica no disponible';
// ---- Maquinaria que consume el combustible ----
// La observación de la OT nombra al final la máquina que cargó el gasoil ("Arreglo de camino -
// Motoniveladora", "Corpida - Tr 14"). No es un campo propio: es texto libre, y la misma máquina
// aparece escrita de muchas formas. Este catálogo es la ÚNICA fuente de esa equivalencia y alimenta
// el filtro de Máquina del módulo Combustible.
//
// Cada entrada declara sus variantes REALES, relevadas una por una contra el .xlsx — no hay fuzzy
// matching, ni coincidencia parcial, ni alias inventados: un texto que no coincida con ninguna
// variante declarada no recibe máquina. Las variantes se comparan como palabra completa sobre el
// texto normalizado (sin acentos, en minúsculas, con la puntuación y los guiones convertidos en
// espacios), y se prueban de la más larga a la más corta para que "tr 07 ac" gane sobre "tr 07".
//
// IDENTIDAD DE LOS TRACTORES — agrupación POR NÚMERO DE FLOTA: el número de 1-2 dígitos que sigue a
// "Tr"/"Tractor". Por eso "Tr 07 AC", "Tr 07", "Tr 07AC" y "Tr 7 John Deere" quedan bajo el mismo
// Tractor 07, y "Tr 03"/"Tr 3J John Deere" bajo el mismo Tractor 03.
//
// OJO — esta agrupación está PENDIENTE DE DESAGREGAR: el usuario confirmó que un tractor de marca
// (John Deere, New Holland) NO es necesariamente el mismo equipo que el de la flota "AC" aunque
// compartan el número, y va a indicar cuáles separar. Mientras tanto se deja agrupado por número.
//
// El dato tiene con qué separarlos cuando llegue esa indicación: sobre las 125 menciones
// "Tr <número>" de toda la hoja consultaOT, las 78 con cero a la izquierda ("Tr 01/02/03/04/07") no
// nombran NINGUNA marca, y las 47 sin cero ("Tr 3", "Tr 3J", "Tr 7", "Tr 14") incluyen las 22 que sí
// la nombran. Las dos formas nunca se cruzan, así que alcanza con mover las variantes con marca a su
// propia entrada del catálogo.
//
// Los números de 4 dígitos NO son número de flota sino MODELO ("New Holland 7205", "John Deere
// 6180", "John Deere 7515", "Case 230"): esas variantes van declaradas enteras y nunca se les
// extrae el número, para no inventar un "tractor 7205".
//
// Verificado contra el dato: las 371 OT de combustible con observación identifican UNA máquina,
// ninguna queda sin identificar y ninguna coincide con dos entradas a la vez.
const COMBUSTIBLE_MAQUINAS = [
  // --- Tractores con número de flota ---
  {id:'tr-01', label:'Tractor 01', variantes:['tr 01 ac','tr 01ac','tr 01','tractor 01']},
  {id:'tr-02', label:'Tractor 02', variantes:['tr 02 ac','tr 02ac','tr 02','tractor 02']},
  {id:'tr-03', label:'Tractor 03', variantes:['tr 03 ac','tr 03ac','tr 03','tractor 03',
     'tr 3j john deere 6180','tr 3j john deere','tr 3 john deere','tr 3 new holland 7260','tr 3j']},
  {id:'tr-04', label:'Tractor 04', variantes:['tr 04 ac','tr 04ac','tr 04','tractor 04']},
  {id:'tr-07', label:'Tractor 07', variantes:['tr 07 ac','tr 07ac','tr 07','tractor 07',
     'tr 7 john deere 7515','tr 7 john deere']},
  {id:'tr-14', label:'Tractor 14', variantes:['tr 14 john deere','tr 14','tractor 14']},
  // --- Tractores identificados por marca, sin número de flota en el texto ---
  {id:'tr-deutz',  label:'Tractor Deutz',  variantes:['tr deutz fahr','tr deutz','tractor deutz']},
  {id:'tr-valtra', label:'Tractor Valtra', variantes:['tr valtra','tractor valtra']},
  {id:'tr-case',   label:'Tractor Case 230', variantes:['tr case 230','tractor case 230','tr case']},
  {id:'tr-nh7205', label:'Tractor New Holland 7205', variantes:['tr new holland 7205','tr 7205 new holland']},
  // --- Maquinaria pesada y equipos fijos ---
  {id:'motoniveladora', label:'Motoniveladora', variantes:['motoniveladora']},
  {id:'generador', label:'Generador', variantes:['generador']},
  {id:'sany', label:'Excavadora Sany Neumática', variantes:['sany neumatico','sany neumatica','neumatica sany','sany']},
  // --- Vehículos (marca y/o chapa) ---
  // La chapa AAUG855 es la del propio Ford Ranger (confirmado por el usuario): las observaciones
  // lo nombran unas veces por modelo y otras por chapa, y es un solo vehiculo.
  {id:'ford-ranger', label:'Ford Ranger (AAUG855)', variantes:['ford ranger','aaug855']},
  {id:'d20', label:'Chevrolet D20 (AGP645)', variantes:['ford d20','chevrolet d20','d20 chevrolet','d20 agp645','d20','agp645']},
  {id:'s10-uab800', label:'S10 UAB800', variantes:['s10 uab800','uab800 pc','uab800','s10 aub800','aub800']},
  {id:'s10-aaoz829', label:'S10 AAOZ829', variantes:['s10 aaoz829','aaoz829']},
  {id:'amarok', label:'Amarok', variantes:['amarok']},
  {id:'hilux', label:'Toyota Hilux', variantes:['toyota hilux','hilux']},
  {id:'scania', label:'Scania OCE825', variantes:['scania oce825','scania','oce825']},
  {id:'blb594', label:'Chevrolet BLB594', variantes:['chevrolet blb594','blb594']},
  {id:'hdx314', label:'Chevrolet HDX314', variantes:['chevrolet hdx314','hdx314']},
  {id:'fad575', label:'FAD575', variantes:['fad575']},
];
// Movimientos sin observación de OT (los niveles Solo contratista y OT no disponible) o cuya
// observación no nombra ninguna máquina del catálogo. No se les inventa una.
const COMBUSTIBLE_MAQUINA_SIN_DATO = 'Sin máquina indicada';
const USO_LABOR_PROPIA = 'Labor Propia';
// Insumos excluidos por completo del módulo Insumos (a pedido del usuario) — no participan de
// ningún filtro, KPI, tabla ni resumen visible; se separan en loader.js (separarInsumos()) antes
// de que data.js construya nada, y se conservan aparte solo para trazabilidad (D.insumos_excluidos).
// Verificado contra el .xlsx real: "Afrecho de Arroz - CH" es a la vez un Tipo de Insumo y un
// Insumo (mismo texto, solo difieren en mayúsculas: Tipo="Afrecho de arroz - CH"), único insumo
// bajo ese Tipo — al excluirlo por nombre, el Tipo desaparece solo. La comparación usa
// normInsumoNombre() (utils.js: normHdr + colapso de espacios alrededor del guion) para tolerar
// variantes razonables de tipeo, sin ampliarse a otros insumos que solo compartan las palabras
// "arroz" o "afrecho" (ej. "Semilla de Arroz...").
const INSUMOS_EXCLUIDOS = ["Afrecho de Arroz - CH"];
// Campania vigente: criterio de inclusion de filas de consultaOT y de consultaCultivos
// (proyeccionRTK) unicamente — ver data.js. consultaInsumos (combustible + modulo Insumos) NO
// se filtra por campania: se procesa completo, tal como antes de introducir este filtro.
const CAMPANIA_ACTUAL = '26/27';
// Filtro de Campaña del modulo Servicios: rotulo y orden de las opciones. Es SOLO presentacion —
// el valor que se usa para filtrar consultaOT sigue siendo la clave tal como viene en el dato
// ('25', '26', '25/26', '26/27'), nunca la etiqueta. CAMPANIA_LABEL renombra las campanias de
// zafriña, que en el export vienen como un año suelto y no se entienden por si solas; una campania
// sin entrada acá se muestra con su clave original. CAMPANIA_ORDEN fija el orden de aparicion; las
// campanias que no figuren en la lista (una nueva que aparezca en el export) se agregan al final,
// asi el filtro nunca deja de mostrar una campania presente en consultaOT.
const CAMPANIA_LABEL = {'25':'Zafriña25','26':'Zafriña26'};
const CAMPANIA_ORDEN = ['25/26','26/27','25','26'];
// Marcador de "lote cancelado" en consultaCultivos: en vez de borrar la fila, el plan RTK carga
// 0.01 ha para lotes que se dieron de baja (a pedido del usuario). Sin este marcador, esos lotes
// aparecerían en "Lotes con Exceso de Superficie" con una diferencia enorme (toda ha ejecutada
// contra un RTK casi nulo) — data.js los separa en su propia sección ("Lotes Cancelados"), sin
// mostrar hectáreas (no aplican), solo el detalle de OT/labores.
const RTK_LOTE_CANCELADO = 0.01;
// Valores que a veces aparecen en el campo "Lote" de consultaOT/consultaCultivos sin ser una
// parcela real de cultivo (categorías genéricas de logística/infraestructura cargadas por error
// en esa columna, ej. el secadero de granos, fletes o "Parcela" genérica) — a pedido del usuario,
// se excluyen de TODO Control de Hectáreas (exceso, sin RTK y cancelados), aunque su Actividad sea
// un cultivo (ARROZ/SOJA/SORGO/MAIZ) y/o su RTK sea 0.01. Comparación contra normLote(), que ya
// pasa a mayúsculas.
const LOTES_NO_PARCELA = ['SECADERO', 'FLETES', 'PARCELA'];

// ---- AUDITORIA: Presupuesto de Infraestructura vs ejecucion real ----
// Archivo aparte (subido al mismo repo), 1 sola hoja. Estructura fija verificada contra el .xlsx
// real: fila 1 = titulo, fila 2 = vacia, fila 3 = encabezados, filas 4-13 = los 10 items de
// presupuesto, fila 14 = fila de TOTAL. Filas 47-51 son calculos sueltos sin relacion a la tabla
// de items (sin Especificacion ni Cta. Contable) — se excluyen del parseo.
// Mismo criterio que SRC_XLSX: se descarga del propio sitio, con GitHub como respaldo.
const INFRA_SRC_XLSX = SRC_DATA+"PRESUPUESTO%20ALISON%20INFRAESTRUTURA%2026-27.xlsx";
const INFRA_SRC_XLSX_RESPALDO = "https://raw.githubusercontent.com/"+REPO+"/"+BRANCH+"/"+SRC_DATA+"PRESUPUESTO%20ALISON%20INFRAESTRUTURA%2026-27.xlsx";
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
// Contratista de ese trabajo por horas. Es el valor REAL de la columna "contratista" de
// consultaOT, verificado contra el .xlsx: 'Cedrela S.A' — sin punto final y con esa capitalizacion.
// Es ademas el unico contratista que hoy tiene ese servicio (17 de 17 OT) y el unico del archivo
// cuyo nombre contiene "cedrela". La comparacion se hace con normHdr (ignora mayusculas, acentos y
// espacios repetidos) contra este texto EXACTO — nunca por coincidencia parcial: si manana Albor
// escribe otra variante, construirAuditoriaInfraestructura avisa por consola en vez de dejarla
// entrar sola o descartarla en silencio.
const INFRA_PUENTES_HORAS_CONTRATISTA = 'Cedrela S.A';
// Marcador de "sin cantidad cargada" de Albor en Unidades/Dosis. NO es una duracion: son 36
// segundos. Es el mismo 0,01 que ya traen las OT por hectarea sin superficie y las de Camión +
// grúa (ver README). Solo lo usa la auditoria de puentes por horas, para no contar como trabajo
// ejecutado unas horas que todavia no se cargaron — verificado: las 4 OT En Ejecución de este
// servicio traen exactamente 0,01 y ninguna fecha real.
const INFRA_HORAS_MARCADOR_SIN_CARGAR = 0.01;
// Servicios cuyo trabajo ejecutado NO es una magnitud medida (hectareas/horas/kilos) sino la
// cantidad de lineas de insumo aplicadas en la OT. Hoy es el tratamiento de semillas: la OT se
// carga con la superficie del lote de referencia en Has. Reales, pero el trabajo no se ejecuta
// sobre el lote sino sobre la semilla, asi que mostrar esas hectareas como "Trabajo Ejecutado"
// describe mal la labor. Las hectareas NO se borran del modelo (siguen en o.ha, disponibles para
// dosis y controles agronomicos): solo dejan de ser el valor visible de esa columna.
// Se compara el NOMBRE COMPLETO normalizado con normHdr, no un prefijo, a diferencia de
// SIEMBRA_SERVICIOS_NO_SIEMBRA: "Tratamiento de semilla arroz tractor x Hs" es otra labor, se mide
// realmente en horas y debe seguir mostrandose en horas.
const SERVICIOS_TRABAJO_MEDIDO_EN_INSUMOS = ['tratamiento de semillas'];
// Servicios ejecutados con personal propio, donde el Contratista vacio NO significa "no
// corresponde" sino que la labor la hizo la empresa. En el Detalle por Servicio se rotulan "Labor
// Propia" en vez de "No aplica" (ver labelContratista en utils.js).
// Es una lista aparte de SERVICIOS_TRABAJO_MEDIDO_EN_INSUMOS a proposito: como se mide el trabajo
// ejecutado y quien lo ejecuto son dos cosas distintas — "Construccion puentes labor propia" no
// tiene trabajo ejecutado medible (esta en SERVICIOS_SIN_TRABAJO_EJECUTADO, muestra "—") pero si
// tiene ejecucion propia.
// El rotulo NO sale de esta lista sola: ademas se exige que la OT traiga realmente una linea de
// tipo "Labor Propia" (ver servicios.js). Si alguna de estas labores se ejecutara con un tercero,
// se sigue mostrando el contratista real. Se comparan normalizados con normHdr.
const SERVICIOS_EJECUCION_PROPIA = [
  'tratamiento de semillas',
  'construccion puentes labor propia',
  // Misma labor cargada de dos formas distintas en consultaOT, igual que en
  // SERVICIOS_SIN_TRABAJO_EJECUTADO: hay que listar las dos variantes.
  'aplicacion herbicida con mochila',
  'aplicacion de herbicida con mochila',
];
// Servicios en los que la OT NO representa trabajo ejecutado medible: lo único real de esas OT es
// el insumo aplicado/consumido, y la cantidad que traen en Has. Reales / horas no corresponde a una
// superficie ni a un tiempo de labor. La columna "Trabajo Ejecutado" del Detalle por Servicio
// (Servicios) muestra "—" para estas filas en vez de un número que no significa nada; los costos
// (Labor Tercero / Insumos / Total) y la cantidad de OT no se tocan.
// Se comparan normalizados con normHdr (sin acentos, minúsculas) porque el mismo servicio aparece
// escrito de dos formas distintas en consultaOT ("Aplicacion de herbicida con mochila" y
// "Aplicación Herbicida con mochila"), verificado contra el .xlsx.
const SERVICIOS_SIN_TRABAJO_EJECUTADO = [
  'aplicacion de herbicida con mochila',
  'aplicacion herbicida con mochila',
  'construccion puentes labor propia',
];
// ---- Camión + grúa: el trabajo ejecutado se cuenta en TRABAJOS, no en horas ni hectáreas ----
// Un trabajo es cada bloque de 6 horas de jornada, con el límite inferior INCLUSIVO:
//   0 < h < 6 -> 1 trabajo    6 <= h < 12 -> 2 trabajos    12 <= h < 18 -> 3 trabajos …
// La fórmula vive en calcularTrabajosCamionGrua() (ordenes.js), única fuente de la cuenta.
const CAMION_GRUA_BLOQUE_HORAS = 6;
// OJO — el servicio "Camion + grua" a secas NO EXISTE en consultaOT. Verificado contra el .xlsx:
// existen DOS servicios distintos, que son además los únicos dos registros con unidadMedida
// "General" de toda la hoja (2 de 2.139 filas):
//     OT 4586  "Camion + grua por dia >6hs"   General   En Ejecución   Agro Continental S.A.
//     OT 4497  "Camion + grua por dia <6hs"   General   En Ejecución   Agro Continental S.A.
// Es decir: Albor ya codifica el corte de 6 horas EN EL NOMBRE del servicio, y no carga las horas
// en ningún lado — hsPersonal, hsMaquinarias, cantidadResultado y toneladas valen 0 en las 2.139
// filas de la hoja, y estas OT traen unidadesDosis = 0,01 (el marcador de "sin cantidad", el mismo
// que usan las labores por hectárea), dosisReales = 0 y hectareasReales = 0.
// Por eso cada servicio declara acá las horas que representa su tramo, y la cuenta de trabajos
// sale de aplicarles la MISMA fórmula de 6 horas (1 h -> 1 trabajo; 6 h -> 2 trabajos). Decisión
// confirmada con el usuario: es lo único que el dato permite hoy. Limitación conocida y aceptada:
// una jornada de 14 h también se carga como ">6hs" y debería ser 3 trabajos, pero el dato no lo
// distingue. El día que Albor cargue horas reales, alcanza con leerlas y pasarlas a la fórmula.
//
// La detección es por NOMBRE DE SERVICIO, con comparación exacta tras normHdr() — nunca por
// unidadMedida === "General", que convertiría la excepción en una regla global. La unidad se usa
// solo como control de consistencia (ver avisos en construirBaseOT). Al ser comparación exacta y no
// parcial, "Camion", "Grua", "Camioneta" o "Camion + otro servicio" NO entran acá.
const SERVICIOS_CAMION_GRUA = [
  {servicio:'Camion + grua por dia <6hs', horasDelTramo:1},
  {servicio:'Camion + grua por dia >6hs', horasDelTramo:CAMION_GRUA_BLOQUE_HORAS},
];
// Sección "Gastos" de Auditoría: ÚNICO concepto que debe mostrarse (a pedido del usuario, en
// reemplazo de la vieja búsqueda amplia por la palabra suelta "desalijo", que mezclaba también
// "Desalijo Silo Bolsa" y "Construccion de Puentes...x Hs"). Fuente única de verdad para la
// ETIQUETA mostrada en el render — el filtro real (ver data.js) no compara esta frase completa
// contra los datos (ninguna OT la trae así, verificado contra el .xlsx), sino que busca el
// concepto puntual ("desalijo" + "karanda"/"caranda", tolerando variantes de ortografía) dentro
// de Servicio/Observación de consultaOT.
const AUDITORIA_GASTO_DESALIJO = "Desalijo Karanda'y / Carandai";
// Actividades que quedan FUERA de esta auditoria (a pedido del usuario), todas por el mismo
// motivo: no son cultivo de renta, asi que su gasto no entra en el presupuesto de insumos contra el
// que se audita el modulo.
//
//  - AVENA y COBERTURA son cultivos de SERVICIO —cobertura de suelo entre zafras—. Mismo criterio
//    con el que ya se los retiro del Resumen Ejecutivo (ver CULTIVOS mas arriba). Efecto lateral
//    verificado contra el dato: son los UNICOS que hacian que un mismo lote apareciera con dos
//    cultivos en la misma campania (27 lotes: ARROZ+AVENA, MAIZ+COBERTURA, SORGO+COBERTURA). Al
//    excluirlos, cada lote queda con un solo cultivo por campania y "Lote" pasa a identificar la
//    parcela sin ambiguedad — por eso el modulo filtra y rotula por Lote, no por nombre de parcela.
//  - CUIDADOS DE PATIOS SILO y CUIDADOS DE PATIOS VIVIENDA no son cultivo de nada: es el
//    mantenimiento del patio del silo y del de la vivienda. Son 4 lineas y US$ 350,65 en 26/27
//    (herbicidas en los lotes "SILO BOLSAS" y "Patio vivienda Arrozal"). Efecto lateral
//    verificado: son EXACTAMENTE las 4 aplicaciones sin hectareas reales del modulo, asi que al
//    sacarlas desaparece tambien el aviso de cobertura de hectareas — es correcto, un patio no
//    tiene superficie sembrada.
//
// Se comparan normalizados (normHdr) contra la Actividad de consultaOT, por igualdad EXACTA.
const AUDITORIA_INSUMOS_CULTIVOS_EXCLUIDOS = ['AVENA', 'COBERTURA',
  'CUIDADOS DE PATIOS SILO', 'CUIDADOS DE PATIOS VIVIENDA'];
// ---- AUDITORIA DE INSUMOS POR PARCELA: seguimiento de receta ----
// Version reducida del presupuesto de insumos de la campania (179 registros). Es la UNICA fuente de
// las dosis recomendadas: los Excel de presupuesto no se leen, y este JSON no aporta costos ni
// volumenes totales, solo dosis por hectarea. Se descarga una sola vez al iniciar el dashboard.
// Mismo criterio de respaldo que SRC_XLSX. Si falla, el modulo sigue funcionando y el seguimiento
// se marca como no disponible (ver loader.js): nunca bloquea la carga.
const RECETAS_SRC_JSON = SRC_DATA+"recetas-insumos-26-27.json";
const RECETAS_SRC_JSON_RESPALDO = "https://raw.githubusercontent.com/"+REPO+"/"+BRANCH+"/"+SRC_DATA+"recetas-insumos-26-27.json";
// Tolerancia SOLO para decidir "Según receta" — no es una tolerancia agronomica (el negocio todavia
// no definio ninguna), es el margen de error de punto flotante: 1e-9 relativo al valor comparado.
const RECETA_EPSILON_RELATIVO = 1e-9;
// Tolerancia de negocio: pasarse de la receta hasta este porcentaje se considera aceptable y la
// fila se rotula "Dentro de tolerancia" en vez de "Sobre receta".
// Es ASIMETRICA a pedido del usuario: solo aplica HACIA ARRIBA. Aplicar de menos queda siempre como
// "Bajo receta", aunque el desvio sea menor al 5% — que el producto no haya llegado a la parcela es
// un hallazgo de auditoria, pasarse un poco es variacion operativa.
// A diferencia de RECETA_EPSILON_RELATIVO (que es puro margen de punto flotante), este valor SI es
// una decision de negocio. Es general: aplica a todos los cultivos e insumos por igual, y cambiarla
// es editar esta unica linea.
// Ojo con el orden de los estados: "Según receta" sigue reservado para la coincidencia exacta, asi
// que "dio justo" y "dio de mas pero aceptable" nunca se confunden.
const RECETA_TOLERANCIA_PCT = 5;
// Equivalencias DECLARADAS A MANO entre el nombre del insumo en Albor (consultaOT) y el nombre en
// el JSON de recetas. Nunca se generan por parecido: si un producto no esta aca y no coincide
// exacto, queda "Sin receta", que es el resultado seguro.
// Se aplican DESPUES de la busqueda exacta por nombre y por descripcion, asi que un alias no puede
// pisar una receta que ya coincide sola (ver buscarReceta en js/data/recetas.js).
// Campos: insumo (nombre en consultaOT), receta (nombre en el JSON), y opcionalmente cultivo y
// grupo para desempatar cuando el JSON trae el mismo producto en mas de un grupo con dosis
// distintas.
// Recetas que se reutilizan en otra campania/cultivo. La zafriña de maiz se registra en Albor bajo
// la campania "26" (Zafriña26) y con dos rotulos de cultivo distintos (MAIZ y MAIZ ZAFRIÑA), pero
// no tiene presupuesto propio: se siembra con la MISMA formula de la hoja de MAIZ 26/27 — a
// excepcion de la semilla, que es otra. Por eso el mapeo es explicito y acotado a esas dos
// combinaciones: no se aplica a ningun otro cultivo ni campania.
// La semilla NO se aliasa a proposito: al ser distinta, si no coincide por nombre queda "Sin
// receta", que es la respuesta correcta — nunca se la compara contra la semilla de la 26/27.
const RECETAS_EQUIVALENCIAS = [
  {campania:'26', cultivo:'MAIZ',         usarCampania:'26/27', usarCultivo:'MAIZ'},
  {campania:'26', cultivo:'MAIZ ZAFRIÑA', usarCampania:'26/27', usarCultivo:'MAIZ'},
];
const RECETAS_INSUMO_ALIAS = [
  // Mismo producto, separador decimal distinto: Albor lo carga con punto y el presupuesto con coma.
  // Cubre ARROZ, MAIZ, SOJA y SORGO de una sola vez porque la comparacion ignora mayusculas.
  {insumo:'GLIFEX GOLD 60.8', receta:'GLIFEX GOLD 60,8'},
  // Mismo fertilizante con separadores distintos (guion vs punto). Solo hace falta para ARROZ y
  // SOJA: las recetas de MAIZ y SORGO ya lo traen escrito con guiones y coinciden solas.
  {insumo:'Potasio KCL 00-00-60', receta:'Potasio KCL 00.00.60'},
  // Tratamiento de semillas: el producto se llama distinto en cada sistema. El JSON trae
  // "Biostar + Zn" DOS veces para el mismo cultivo (NUTRICIÓN 0,25 sin unidad y TRATAMIENTO DE
  // SEMILLAS 0,15 L), asi que el alias fija ademas el grupo — sin eso la receta seria ambigua y la
  // fila quedaria en "Sin receta".
  {insumo:'BIOSTART Zn FL Root', receta:'Biostar + Zn', grupo:'TRATAMIENTO DE SEMILLAS'},
  // Los cuatro siguientes salen de la HOJA DE TRABAJO PRESP 26-27 ARROZ: el presupuesto y Albor
  // escriben el MISMO producto de forma distinta. No son parecidos encontrados por similitud —
  // cada uno se verifico contra la fila del Excel que lo define.
  // "GLIFEX GOLD 60,8 y Glifex Full": Albor le agrega la K final.
  {insumo:'Glifex Full K', receta:'Glifex Full'},
  // "Power Oil e Iop Full": Albor lo escribe sin el espacio.
  {insumo:'PowerOil', receta:'Power Oil'},
  // Nombre comercial abreviado en el presupuesto (T.F.P) y con la concentracion en Albor.
  {insumo:'TFP 50 FS', receta:'T.F.P'},
  // Misma molecula (Tiametoxan 50%), ultima letra distinta entre los dos sistemas.
  {insumo:'CIAMETOXAN', receta:'Ciametoxam'},
  // En SOJA el presupuesto lo llama solo "Iop" (un unico registro, ACEITES Y ADJUVANTES, 2 L/ha),
  // mientras que Albor lo carga como "IOP FULL". Se acota a SOJA a proposito: los presupuestos de
  // ARROZ, MAIZ y SORGO ya dicen "Iop Full" y cruzan solos con su propia dosis (1,75 / 1,6 / 1,6),
  // asi que este alias no debe alcanzarlos.
  {insumo:'IOP FULL', receta:'Iop', cultivo:'SOJA'},
  // Fila "Power Oil - Iop Full - Tafir Oil" del presupuesto de ARROZ: Albor lo carga con un guion
  // en el medio ("Tafir- Oil"), que normInsumoNombre no puede igualar a "Tafir Oil".
  {insumo:'Tafir- Oil', receta:'Tafir Oil'},
  // El presupuesto de SORGO trae "Glifex gold 60,8" DOS veces con dosis distintas: 3 L/ha en
  // DESECACION y 0,4 L/ha en HERBICIDAS PRE EMERGENTES. Sin desempate quedaba en "Sin receta".
  // Se fija DESECACION por decision del usuario, respaldada por el dato: las 14 OT de SORGO con
  // este producto aplican ~3,03 L/ha y sus servicios son "Desecacion imperator" y "Fumigacion
  // Imperator", ambos en el estadio Preparacion de Suelo — quemado previo a la siembra, no una
  // aplicacion pre-emergente.
  // Va acotado a SORGO: en ARROZ el mismo producto figura en dos grupos pero con la MISMA dosis
  // (3 L/ha las dos), asi que no es ambiguo y no necesita desempate.
  {insumo:'GLIFEX GOLD 60.8', receta:'Glifex gold 60,8', cultivo:'SORGO', grupo:'DESECACIÓN'},
  // ---- Zafriña de maiz (campania 26): los productos aplicados son los MISMOS de la formula de
  // MAIZ 26/27 pero Albor los nombra distinto. Cada equivalencia se verifico contra la formula
  // (columna Discripcion del presupuesto), no por parecido de nombre. Van sin cultivo porque el
  // mapeo de campania ya los deja apuntando al bloque de MAIZ (ver RECETAS_EQUIVALENCIAS).
  // La SEMILLA no esta aca a proposito: es el unico insumo que cambia entre la campania y la
  // zafriña, asi que debe quedar en "Sin receta" y nunca compararse contra la semilla de la 26/27.
  // Abono 04.30.10: mismo grado, guiones en vez de puntos.
  {insumo:'Abono 04-30-10 COFCO', receta:'Abono 04.30.10 +4,5S'},
  // Kalium es el glifosato de la desecacion, igual que en ARROZ y SORGO.
  {insumo:'Kalium', receta:'Glifex gold 60,8', cultivo:'MAIZ'},
  // Metomil 90% y Bifentrina 40%: el presupuesto los carga por principio activo o por marca.
  {insumo:'METOMIL', receta:'Metomil 90%'},
  {insumo:'SNIPER 40% SG', receta:'Sniper'},
  // Urea: el presupuesto la carga como 45.00.00 y Albor como 46-00-00. Es el mismo fertilizante
  // (la urea es 46% de N; el 45 del presupuesto es un error de tipeo, no otro producto), y la dosis
  // real de 150,23 kg/ha coincide con los 0,15 ton/ha presupuestados.
  {insumo:'Urea 46-00-00', receta:'Urea'},
];

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
// ---- RESUMEN EJECUTIVO: umbrales de las reglas de "posibles problemas" ----
// Centralizados acá (no hardcodeados en data.js) para que sean trazables y ajustables sin tocar
// la lógica de cada regla. Todos son heurísticas explícitas, no curvas agronómicas ni metas
// temporales inventadas — ver comentarios en data.js junto a cada regla que los usa.
const RESUMEN_DESVIACION_CULTIVO_MEDIA = 20;   // puntos por debajo del avance general -> severidad media
const RESUMEN_DESVIACION_CULTIVO_ALTA = 40;    // puntos por debajo del avance general -> severidad alta
const RESUMEN_SOBREEJECUCION_ALTA = 20;        // % de exceso sobre RTK -> severidad alta
const RESUMEN_SOBREEJECUCION_CRITICA = 50;     // % de exceso sobre RTK -> severidad critica
const RESUMEN_SINRTK_ALTA = 20;                // cantidad de OT sin correspondencia -> severidad alta
const RESUMEN_CONCENTRACION_GASTO = 50;        // % del costo total en una sola labor -> severidad media (umbral base pedido por el usuario)
const RESUMEN_CONCENTRACION_GASTO_ALTA = 70;   // % del costo total en una sola labor -> severidad alta
const RESUMEN_DATOS_INCOMPLETOS_PCT = 10;      // % de OT con datos faltantes -> severidad media (si no, informativa)

let D=null;
