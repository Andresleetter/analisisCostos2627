// ================== DATOS · ÓRDENES DE TRABAJO ==================
// Base compartida del modelo: todo lo que sale de la hoja consultaOT y que despues consumen los
// demas dominios (cultivos, servicios, auditoria, alertas, resumen).
// Estas funciones no leen el DOM ni dependen de variables globales temporales: reciben lo que
// necesitan por parametro y devuelven colecciones explicitas.

// Campania tal cual viene en la fila de consultaOT (sin normalizar: es la clave real que se usa
// para filtrar, nunca la etiqueta de presentacion).
const campaniaDeFila = row => String(row['campania']||'').trim();
// Comparacion de Estado normalizada (sin acentos/mayusculas, reusa normEstadio de utils.js) —
// solo para Pendiente/En Ejecución, que es lo que este pedido pidio blindar contra variaciones de
// tipeo del Excel. No se toca la comparacion de "Confirmado" (ver CONF en construirBaseOT) ni el
// texto original de o.estado, que se sigue mostrando tal cual en las tablas.
const esPendiente = o => normEstadio(o.estado)===normEstadio('Pendiente');
const esEnEjecucion = o => normEstadio(o.estado)===normEstadio('En Ejecución');

// ---- Camión + grúa: única fuente de la deteccion y de la cuenta de trabajos ----
// Estas dos funciones son el ÚNICO lugar del proyecto donde se compara el nombre del servicio y
// donde se aplica la formula de 6 horas. Ni servicios.js ni render.js repiten ninguna de las dos.

// Devuelve la configuracion del servicio (SERVICIOS_CAMION_GRUA, config.js) o null si no es uno de
// ellos. La comparacion es EXACTA sobre el texto normalizado con normHdr() — la misma normalizacion
// que ya usa el resto del proyecto: recorta, colapsa espacios repetidos, ignora mayusculas/
// minusculas y acentos. No es una coincidencia parcial: un servicio que solo comparta las palabras
// ("Estirar camion con tractor x Hs", "Descargar camión retropala x Hs", "Camioneta…") no entra.
function esCamionGrua(servicio){
  const s = normHdr(servicio);
  if(!s) return null;
  return SERVICIOS_CAMION_GRUA.find(c=>normHdr(c.servicio)===s) || null;
}
// Cantidad de trabajos de UNA jornada, por bloques de 6 horas con el limite inferior inclusivo:
//   0 < h < 6 -> 1    6 <= h < 12 -> 2    12 <= h < 18 -> 3    18 <= h < 24 -> 4 …
// Es Math.floor(h/6)+1, NO Math.ceil(h/6): con ceil, 6 horas exactas darian 1 trabajo y deben dar 2.
// Horas nulas, negativas o no numericas -> 0 trabajos (no se inventa una jornada que no existe).
function calcularTrabajosCamionGrua(horas){
  const h = numN(horas);
  if(h==null || !isFinite(h) || h<=0) return 0;
  return Math.floor(h/CAMION_GRUA_BLOQUE_HORAS)+1;
}
// Trabajos de una LINEA de labor (= una jornada). Devuelve 0 si la linea no es de Camión + grúa.
// Se calcula por linea y despues se suman los resultados, nunca al reves: sumar las horas de varias
// jornadas y recien ahi aplicar la formula daria un numero distinto (5h + 6h + 8h = 3 jornadas de
// 1+2+2 = 5 trabajos, no 19 horas = 4 trabajos).
function trabajosCamionGruaDeLinea(linea){
  const cfg = esCamionGrua(linea.serv);
  return cfg ? calcularTrabajosCamionGrua(cfg.horasDelTramo) : 0;
}

  // Normalizacion de filas de consultaOT. Se extrajo a funcion (antes iba en linea recta acá) para
  // poder reusarla TAL CUAL con las filas de otra campania en el filtro de Campaña de Servicios,
  // sin duplicar ni reescribir la logica.
  function normalizarFilasOT(rawRows){
    const out = rawRows.map(r=>({
      ot:String(keyOf(r,['ordenTrabajo','OT','numeroOrdenTrabajo'])||'').trim(),
      act:String(keyOf(r,['actividad','Actividad'])||'').trim(),
      lote:String(keyOf(r,['lote','Lote'])||'').trim(),
      estadio:String(keyOf(r,['estadio','Estadio'])||'').trim(),
      serv:String(keyOf(r,['servicio','Servicio'])||'').trim(),
      estado:String(keyOf(r,['estado','Estado'])||'').trim(),
      fr:pdate(keyOf(r,['fechaReal','Fecha real'])),
      ft:pdate(keyOf(r,['fechaTeorica','Fecha  Teórica','Fecha Teórica','Fecha Teorica'])),
      cl:num(keyOf(r,['costoLabor','Costo Labor'])), ci:num(keyOf(r,['costoInsumo','Costo Insumo'])),
      ud:num(keyOf(r,['unidadesDosis','Unidades/Dosis'])), pu:num(keyOf(r,['precioUnitario','Precio Unitario'])),
      hr:numN(keyOf(r,['hectareasReales','Has. Reales'])),
      // totalAplicado: cantidad realmente aplicada de la linea. Solo se usa para los trabajos
      // medidos por peso (fletes), donde es el peso ejecutado en kilogramos — ver esPeso mas abajo.
      // Para el resto de las lineas no se lee ni se usa.
      ta:num(keyOf(r,['totalAplicado','Total Aplicado'])),
      tipo:String(keyOf(r,['tipoItem','Tipo de Item'])||'').trim(),
      contr:String(keyOf(r,['contratista','Contratista'])||'').trim(),
      personal:String(keyOf(r,['personal','Personal'])||'').trim(),
      insumo:String(keyOf(r,['insumo','Insumo'])||'').trim(),
      unidad:String(keyOf(r,['unidadMedida','Unidad de medida'])||'').trim(),
      obs:String(keyOf(r,['observaciones','Observación','Observacion'])||'').trim(),
      // ---- Metadata para el cruce con Combustible (no interviene en ningun calculo) ----
      // ref = referencia propia de la ORDEN DE TRABAJO ("2026 - OT - 4410"). Es la clave con que
      // se vincula un movimiento de combustible: se compara contra consultaInsumos.referenciaOrigen
      // (ver construirIndiceOTPorReferencia mas abajo y js/data/combustible.js). Verificado contra
      // el .xlsx real: viene cargada en las 2.228 filas, el numero que trae SIEMPRE coincide con
      // ordenTrabajo, y ninguna referencia abarca mas de un numero de OT — es una clave 1:1.
      ref:String(keyOf(r,['referencia','Referencia'])||'').trim(),
      // refAsiento = comprobante de stock que genero la linea ("2026 - STK - 10424"). YA NO se usa
      // para vincular Combustible: se comprobo contra el dato que ese numero NO es unico —
      // consultaInsumos lo reutiliza entre el subsistema agricola y el ganadero (848 comprobantes
      // compartidos por mas de un movimiento, 673 de ellos mezclando ambos), lo que producia
      // vinculos falsos. Se conserva el campo porque es una columna real de la OT y sirve para
      // rastrear el asiento, pero ninguna funcionalidad lo usa como clave.
      refAsiento:String(keyOf(r,['referenciaAsiento','Referencia Asiento'])||'').trim(),
      campo:String(keyOf(r,['campo','Campo'])||'').trim(),
      cultivo:String(keyOf(r,['cultivo','Cultivo'])||'').trim(),
      campania:String(keyOf(r,['campania','Campaña','Campania'])||'').trim(),
    })).filter(r=>r.ot && r.ot!=='undefined' && r.ot!=='nan');
    // esPeso = LINEA DE LABOR medida en peso. Hoy son las dos familias de fletes del dato real:
    // Unidad de Medida "Dosis" (Servicio "Fletes") y "Kilos" (Servicio "Flete verde silo terceros
    // Arroz"). En estas lineas la cantidad ejecutada NO es Unidades/Dosis sino "totalAplicado", y se
    // interpreta en kilogramos: el dato trae Has. Reales = 0,01 en todas ellas (un marcador, no
    // superficie), asi que mostrarlas como hectareas era incorrecto. El costo pasa a ser
    // totalAplicado x Precio Unitario — en las OT confirmadas totalAplicado coincide exactamente con
    // Unidades/Dosis, asi que el importe no cambia; la formula queda explicita.
    // Se exige que sea linea de labor a proposito: hay 62 lineas de INSUMO en "Kilos" (fertilizantes
    // y similares) que no son trabajos medidos por peso y no deben cambiar de formula de costo — hoy
    // daria lo mismo, pero deja el alcance acotado si el dato cambia.
    const UNIDADES_PESO=['dosis','kilos'];
    out.forEach(r=>{
      const esLaborLinea = r.tipo==='Labor Propia' || r.tipo==='Labor Tercero';
      r.esPeso = esLaborLinea && UNIDADES_PESO.includes(r.unidad.toLowerCase());
      r.imp=(r.esPeso?r.ta:r.ud)*r.pu; r.esHoras=r.unidad.toLowerCase()==='horas'; });
    return out;
  }
  // ---- Modalidad de trabajo (hectareas vs horas) por OT — usa SOLO la linea principal de labor
  // (tipo "Labor Propia"/"Labor Tercero"), nunca todas las lineas: una OT de horas puede traer
  // ademas insumos u otras unidades, y eso no debe cambiarle la modalidad. Exclusiva para el avance
  // del Resumen Ejecutivo (ver mas abajo) y para corregir la agrupacion "esH" de Servicios, que
  // antes exigia que TODAS las lineas fueran horas (o.lines.every) — una OT por horas con un insumo
  // de otra unidad quedaba mal clasificada. No cambia costos ni horas totales, solo a que fila del
  // detalle se agrupan.
  // OJO — verificado contra el dato real: la linea de labor de un trabajo por HECTAREAS casi
  // siempre trae "Unidad de medida" VACIA (no "Ha"/"Hectarea"), y unas pocas veces algo distinto
  // (ej. "Litros" en fumigaciones, "Dosis" en fletes) — exigir un texto exacto tipo "ha"/"hectarea"
  // dejaria afuera la enorme mayoria del trabajo real por hectareas. La unica señal confiable en
  // los datos es "Horas" (explicito) para trabajo por horas; todo lo demas en la linea principal de
  // labor se considera hectareas.
  // Se agrego una tercera modalidad, 'peso': linea principal de labor medida en peso (esPeso — los
  // fletes en "Dosis" o en "Kilos"). Se evalua ANTES de 'hectareas' porque, con el criterio anterior,
  // esas unidades caian en el cajon de "todo lo demas es hectareas" y el flete se mostraba como 0,01
  // ha. No altera la clasificacion de ninguna otra linea: 'horas' sigue teniendo prioridad y el resto
  // sigue cayendo en 'hectareas' igual que antes.
  // Se agrego una cuarta modalidad, 'camion_grua', que se evalua ANTES que todas las demas y SOLO
  // para los servicios declarados en SERVICIOS_CAMION_GRUA (config.js) — comparacion exacta por
  // nombre de servicio, nunca por unidadMedida. Ninguna otra labor puede caer en ella: si el
  // servicio no esta en esa lista, esta funcion se comporta exactamente igual que antes.
  function modalidadLaborOT(lineas){
    const laborLineas = lineas.filter(l=>l.tipo==='Labor Propia'||l.tipo==='Labor Tercero');
    if(laborLineas.some(l=>esCamionGrua(l.serv))) return 'camion_grua';
    if(!laborLineas.length) return lineas.length && lineas.every(l=>l.esHoras) ? 'horas' : null; // sin linea de labor identificable
    if(laborLineas.some(l=>l.esHoras)) return 'horas';
    return laborLineas.some(l=>l.esPeso) ? 'peso' : 'hectareas';
  }
  // group by OT — extraida a funcion, por el mismo motivo que normalizarFilasOT (reuso identico
  // para el filtro de Campaña de Servicios). Logica sin cambios.
  function agruparOTS(rowsIn){
    const otMap={};
    rowsIn.forEach(r=>{ (otMap[r.ot]=otMap[r.ot]||[]).push(r); });
    return Object.keys(otMap).map(id=>{
      const g=otMap[id], r0=g[0];
      const has=g.map(x=>x.hr).filter(x=>x!=null);
      return { ot:id, act:r0.act, lote:r0.lote, estadio:r0.estadio, serv:r0.serv, estado:r0.estado,
        ft:r0.ft, fr:r0.fr, tieneServ: r0.serv!=='' && r0.serv.toLowerCase()!=='nan',
        contr:r0.contr, personal:r0.personal,
        ha: has.length?Math.max.apply(null,has):null,
        modalidad: modalidadLaborOT(g),
        horas: g.filter(x=>x.esHoras).reduce((s,x)=>s+x.ud,0),
        // kg = peso ejecutado de los trabajos medidos por peso (fletes en Dosis o Kilos): suma de
        // totalAplicado de esas lineas, mismo criterio con que `horas` suma Unidades/Dosis de las
        // lineas por Horas.
        kg: g.filter(x=>x.esPeso).reduce((s,x)=>s+x.ta,0),
        // n_insumos = cantidad de LINEAS de tipo "Insumo" de la OT. Son lineas, no productos
        // unicos: si el mismo producto aparece en dos lineas, cuenta dos veces. Se calcula aca,
        // sobre las lineas que la OT ya tiene agrupadas, para no releer ni reagrupar el Excel.
        // Lo consume el "Trabajo Ejecutado" de las labores de SERVICIOS_TRABAJO_MEDIDO_EN_INSUMOS
        // (ver servicios.js); no interviene en ningun costo.
        n_insumos: g.filter(x=>x.tipo==='Insumo').length,
        // trabajos = cantidad de trabajos de Camión + grúa de esta OT. Se calcula POR LINEA DE
        // LABOR (cada linea es una jornada) y despues se suman los resultados — nunca se suman las
        // horas para aplicar la formula una sola vez al final. Vale 0 para todas las demas labores,
        // que no cambian en nada. En el dato de hoy cada OT trae una unica jornada.
        trabajos: g.filter(x=>x.tipo==='Labor Propia'||x.tipo==='Labor Tercero')
          .reduce((s,x)=>s+trabajosCamionGruaDeLinea(x),0),
        imp: g.reduce((s,x)=>s+x.imp,0),
        propia: g.filter(x=>x.tipo==='Labor Propia').reduce((s,x)=>s+x.imp,0),
        tercero: g.filter(x=>x.tipo==='Labor Tercero').reduce((s,x)=>s+x.imp,0),
        insumos: g.filter(x=>x.tipo==='Insumo').reduce((s,x)=>s+x.imp,0),
        lines: g };
    });
  }
  // ---- Indice referencia de OT -> OT, para vincular los movimientos de combustible ----
  // Lo consume construirCombustible() (js/data/combustible.js): un movimiento de consultaInsumos
  // trae en `referenciaOrigen` la orden de trabajo que lo genero ("2026 - OT - 4410"), y esa es
  // exactamente la `referencia` propia de la OT. Se arma UNA sola vez, en la construccion del
  // modelo, para que el cruce sea O(nOT + nMovimientos) y no O(nOT x nMovimientos).
  //
  // Reemplaza al viejo indice por referenciaAsiento, que se descarto con evidencia: el numero de
  // comprobante de stock NO es unico entre el subsistema agricola y el ganadero, y colgaba
  // movimientos de racion vacuna de OT agricolas sin relacion (109 falsos positivos en el dato de
  // hoy). `referencia` en cambio es 1:1 — 2.228 de 2.228 filas la traen, su numero siempre es el
  // ordenTrabajo y ninguna referencia abarca mas de una OT.
  //
  // Se construye sobre las filas de TODAS las campanias, no sobre las de CAMPANIA_ACTUAL: a
  // diferencia de consultaOT, consultaInsumos no se recorta por campania (ver loader.js), asi que
  // hay movimientos de combustible cuya OT pertenece a otra campania. Verificado en el dato real:
  // de los 390 movimientos que cruzan, 23 apuntan a OT de 25/26 y 3 a Zafriña 26 — recortando a
  // 26/27 se perderian esos vinculos sin ninguna razon.
  //
  // Comparacion EXACTA sobre el texto ya recortado (trim); sin fuzzy matching, sin tocar numeros
  // ni identificadores. Las referencias vacias no entran al indice.
  //
  // Devuelve UNA entrada por referencia: la OT resumida, no una linea suelta. Asi tener la OT
  // varias lineas (servicio + labor + insumos) no puede duplicar un movimiento de combustible.
  // Regla determinista para los campos que pueden variar entre lineas: gana la primera linea que
  // traiga el dato no vacio, en el orden del archivo. Nunca se concatena ni se inventa nada.
  function construirIndiceOTPorReferencia(rowsIn){
    const porRef = new Map();
    rowsIn.forEach(r=>{ const k = r.ref; if(!k) return;
      if(!porRef.has(k)) porRef.set(k, []); porRef.get(k).push(r); });
    const idx = new Map();
    // primero(campo) = el primer valor no vacio entre las lineas de la OT.
    const primero = (lineas, campo) => { for(const l of lineas){ const v = l[campo]; if(v) return v; } return ''; };
    porRef.forEach((lineas, k)=>{
      const r0 = lineas[0];
      idx.set(k, {
        ref: k, ot: r0.ot, campania: r0.campania, estado: r0.estado, fr: r0.fr,
        serv: primero(lineas,'serv'), estadio: primero(lineas,'estadio'),
        cultivo: primero(lineas,'cultivo'), campo: primero(lineas,'campo'), lote: primero(lineas,'lote'),
        contr: primero(lineas,'contr'),
        // personal = quien retiro el combustible. En las OT de gasoil el Contratista viene SIEMPRE
        // vacio (verificado: 390 de 390) y quien queda registrado es este campo — el mismo criterio
        // que ya usa el Consumo de Gasoil por Area de Servicios.
        personal: primero(lineas,'personal'),
        obs: primero(lineas,'obs'),
        hr: lineas.map(l=>l.hr).filter(x=>x!=null).reduce((m,x)=>m==null||x>m?x:m, null),
      });
    });
    return idx;
  }
// Prepara la base de OT que consumen TODOS los demas dominios: normaliza las columnas, separa la
// copia con todas las campanias (solo para el filtro de Campaña de Servicios), recorta a
// CAMPANIA_ACTUAL, arma las filas y las OT agrupadas, y calcula los KPI de OT.
function construirBaseOT(raw){
  // normalizar nombres de columnas (quita BOM y espacios)
  raw = raw.map(row=>{ const o={}; for(const k in row){ o[String(k).replace(/\uFEFF/g,'').trim()]=row[k]; } return o; });
  const campaniaDeFila = row => String(row['campania']||'').trim();
  // Copia de TODAS las filas de consultaOT, sin recortar por campania. Existe unicamente para el
  // filtro de Campa\u00F1a del modulo Servicios (ver servicios_campanias mas abajo): el resto del
  // dashboard sigue trabajando exclusivamente sobre `raw` recortado a CAMPANIA_ACTUAL, sin cambios.
  const rawTodasCampanias = raw;
  // Campanias disponibles, tomadas dinamicamente del propio dato (nunca hardcodeadas). Orden
  // descendente por texto: deja la mas reciente primero ('26/27' antes de '26', '25/26', '25').
  const campanias_ot = [...new Set(rawTodasCampanias.map(campaniaDeFila).filter(c=>c))]
    .sort((a,b)=>b.localeCompare(a,'es'));
  // Filtro de campania: consultaOT trae TODAS las campanias (25/26, 26/27, 26, 25 mezcladas,
  // crecio de ~1200 a ~7300 filas al incluir la campania anterior completa). Solo entra la
  // campania vigente (CAMPANIA_ACTUAL). Sin este filtro, todos los KPIs/cultivos/hectareas/
  // alertas quedarian inflados con datos de la campania 25/26.
  const n_ot_total_sin_filtrar = raw.length;
  raw = raw.filter(row => campaniaDeFila(row) === CAMPANIA_ACTUAL);
  console.log('consultaOT: '+raw.length+' de '+n_ot_total_sin_filtrar+' filas son de la campaña '+CAMPANIA_ACTUAL+' (resto descartado).');
  const rows = normalizarFilasOT(raw);
  if(!rows.length){
    const cols=raw.length?Object.keys(raw[0]).join(', '):'(ninguna)';
    throw new Error('El archivo remoto no tiene el formato esperado: no se encontró la columna «OT» del export de Órdenes de Trabajo. Columnas recibidas: '+cols.slice(0,160));
  }
  // Control de consistencia de Camión + grúa. Es SOLO un aviso en consola: no transforma ninguna
  // fila ni activa la modalidad especial. La unidad "General" nunca decide nada — la modalidad la
  // decide el nombre del servicio (ver esCamionGrua) — pero si aparece una fila General de otro
  // servicio, o una de Camión + grúa con otra unidad, conviene enterarse.
  const generalNoGrua = rows.filter(r=>normHdr(r.unidad)==='general' && !esCamionGrua(r.serv));
  const gruaNoGeneral = rows.filter(r=>esCamionGrua(r.serv) && normHdr(r.unidad)!=='general');
  if(generalNoGrua.length) console.warn('consultaOT: '+generalNoGrua.length+' fila(s) con Unidad de medida "General" que NO son Camión + grúa ('+
    [...new Set(generalNoGrua.map(r=>r.serv))].join(', ')+') — siguen calculándose igual que siempre, sin la modalidad especial.');
  if(gruaNoGeneral.length) console.warn('consultaOT: '+gruaNoGeneral.length+' fila(s) de Camión + grúa con una unidad distinta de "General" ('+
    [...new Set(gruaNoGeneral.map(r=>r.unidad||'(vacía)'))].join(', ')+') — la modalidad especial se aplica igual, porque depende del servicio y no de la unidad.');
  // "HOY" = fecha real más reciente registrada en las OT (columna Fecha Real). Se recalcula en
  // cada carga para reflejar automáticamente la actualización del Excel/CSV de campania, tanto
  // para el rótulo "Datos al…" como para el cálculo de días de atraso.
  // "HOY" = fecha teórica más reciente registrada en las OT (no fecha real). La fecha teórica se
  // carga con la fecha del día en que se crea la OT, así que su máximo funciona como indicador de
  // cuándo se actualizó por última vez el archivo de campania.csv — permite saber si la web está
  // al día. La fecha real, en cambio, solo se completa cuando el trabajo ya se confirmó/ejecutó,
  // por lo que suele quedar atrasada respecto a la carga real de OT.
  const HOY = rows.reduce((max,r)=> (r.ft && (!max || r.ft>max)) ? r.ft : max, null) || new Date();
  const OTS = agruparOTS(rows);
  const CONF = OTS.filter(o=>o.estado==='Confirmado');
  // ---- KPIs OT ----
  // totalPendientes/totalEnEjecucion = OT ÚNICAS (OTS ya está agrupado por número de OT, ver
  // otMap más arriba) con ese estado — total de campaña, SIN filtrar por vencimiento. Son los KPI
  // "Pendientes"/"En Ejecución" de Alertas Operacionales (ver más abajo): no representan "con
  // atraso", eso es totalAtrasadas, un concepto distinto que nunca debe mezclarse con este total.
  const total_ot=OTS.length, ot_conf=CONF.length,
    totalEnEjecucion=OTS.filter(esEnEjecucion).length,
    totalPendientes=OTS.filter(esPendiente).length;
  const costo_total=CONF.reduce((s,o)=>s+o.imp,0);
  // Indice para el cruce con Combustible. Se normalizan TODAS las campanias (no solo la vigente,
  // ver construirIndiceOTPorReferencia) reusando normalizarFilasOT — misma interpretacion de
  // consultaOT que el resto del modelo, sin una segunda implementacion en paralelo.
  const indice_ot_referencia = construirIndiceOTPorReferencia(normalizarFilasOT(rawTodasCampanias));
  return {rawTodasCampanias,campanias_ot,rows,HOY,OTS,CONF,indice_ot_referencia,
    total_ot,ot_conf,totalEnEjecucion,totalPendientes,costo_total};
}
