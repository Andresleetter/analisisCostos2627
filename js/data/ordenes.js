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
  function modalidadLaborOT(lineas){
    const laborLineas = lineas.filter(l=>l.tipo==='Labor Propia'||l.tipo==='Labor Tercero');
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
        imp: g.reduce((s,x)=>s+x.imp,0),
        propia: g.filter(x=>x.tipo==='Labor Propia').reduce((s,x)=>s+x.imp,0),
        tercero: g.filter(x=>x.tipo==='Labor Tercero').reduce((s,x)=>s+x.imp,0),
        insumos: g.filter(x=>x.tipo==='Insumo').reduce((s,x)=>s+x.imp,0),
        lines: g };
    });
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
  return {rawTodasCampanias,campanias_ot,rows,HOY,OTS,CONF,
    total_ot,ot_conf,totalEnEjecucion,totalPendientes,costo_total};
}
