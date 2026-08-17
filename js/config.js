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
const OPERATIVAS = ['OPERATIVO','PARCELA ARROZ','PARCELA SOJA','PARCELA SORGO','CUIDADOS DE PATIOS VIVIENDA','CUIDADOS DE PATIOS SILO','A RECUPERAR RH','MANTENIMIENTO DE BOMBAS'];
// Discriminadores dentro de consultaInsumos (que trae TODOS los insumos, no solo combustible):
// tipoInsumo = "COMBUSTIBLES" separa las filas de combustible del resto (fertilizantes,
// agroquímicos, repuestos, etc. — quedan en insumos_pendiente_modulo para un módulo futuro).
// tipoMovimiento = "Existencia inicial" son las filas de stock de arranque de campaña (fechadas
// al inicio), separadas del Ingreso/Consumo porque no son un movimiento sino un saldo de partida.
const TIPO_INSUMO_COMBUSTIBLE = 'COMBUSTIBLES';
const MOV_EXISTENCIA_INICIAL = 'Existencia inicial';
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
// Servicios en los que la OT NO representa trabajo ejecutado medible: lo único real de esas OT es
// el insumo aplicado/consumido, y la cantidad que traen en Has. Reales / horas no corresponde a una
// superficie ni a un tiempo de labor. La columna "Trabajo Ejecutado" del Detalle por Labor
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
// Sección "Gastos" de Auditoría: ÚNICO concepto que debe mostrarse (a pedido del usuario, en
// reemplazo de la vieja búsqueda amplia por la palabra suelta "desalijo", que mezclaba también
// "Desalijo Silo Bolsa" y "Construccion de Puentes...x Hs"). Fuente única de verdad para la
// ETIQUETA mostrada en el render — el filtro real (ver data.js) no compara esta frase completa
// contra los datos (ninguna OT la trae así, verificado contra el .xlsx), sino que busca el
// concepto puntual ("desalijo" + "karanda"/"caranda", tolerando variantes de ortografía) dentro
// de Servicio/Observación de consultaOT.
const AUDITORIA_GASTO_DESALIJO = "Desalijo Karanda'y / Carandai";
// ---- AUDITORIA DE INSUMOS POR PARCELA: umbrales de desvio ----
// Un desvio NO es un error: es una diferencia que merece revisarse. La comparacion siempre se hace
// contra el promedio del MISMO cultivo (y, para el consumo, del mismo insumo y la misma unidad de
// medida), nunca contra un valor de referencia agronomico inventado: el dashboard no tiene dosis
// recomendadas cargadas. Los porcentajes son por encima del promedio del grupo.
const AUDITORIA_INSUMOS_DESVIO_MEDIA = 30;   // % sobre el promedio del grupo -> revisar
const AUDITORIA_INSUMOS_DESVIO_ALTA = 60;    // % sobre el promedio del grupo -> desvio marcado
// Minimo de parcelas comparables que debe tener un grupo para que su promedio signifique algo. Con
// una sola parcela no hay contra que comparar; el grupo se omite en vez de mostrar un 0% enganoso.
const AUDITORIA_INSUMOS_MIN_PARCELAS = 2;
// Tope de filas dibujadas en la tabla de movimientos (el detalle mas fino, hasta ~3.300 filas). No
// recorta ningun calculo: los KPIs, el resumen por parcela y los desvios se computan SIEMPRE sobre
// el total filtrado. Solo limita cuantas filas se pintan de una vez, y el render avisa en pantalla
// cuando el tope se aplica.
const AUDITORIA_INSUMOS_MAX_FILAS = 500;
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
