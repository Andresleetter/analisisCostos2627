// ================== BUILD DATA ==================
function buildData(raw, proyecciones, insumos, presupuestoInfra){
  const { combustible: combustibleRaw, existenciaInicial, otros: otrosInsumos, excluidos: insumosExcluidosRaw } = insumos || {};
  // ---- PLAN RTK desde consultaCultivos ----
  // Soporta dos formatos:
  //  a) columnas separadas de lote/cultivo (export histórico "Proyecciones", o 'actividad_1'/
  //     'especie_1' cuando 'Actividad' aparece dos veces — ID numérico y texto).
  //  b) consultaCultivos (fuente actual): no trae lote/cultivo como columnas propias, vienen
  //     combinados en 'nombre' (ej. "LA TERESA 201 ARROZ 26/27"). Se derivan por posición fija
  //     "LA TERESA {LOTE} {CULTIVO} {CAMPAÑA}". Filas que no calzan ese patrón (parcelas de
  //     ensayo/operativos como "A RECUPERAR RH", "OPERATIVO", "PARCELA MAIZ ZAFRIÑA") quedan
  //     fuera del plan RTK — igual que antes, solo importan los 6 cultivos de CULTIVOS.
  // El emparejamiento es case/acento-insensible para tolerar variaciones de export.
  // Filtro de campania: consultaCultivos no trae un campo de texto "campania" propio (solo
  // idCampania, un ID interno sin mapeo conocido), pero el sufijo "26/27" ya viene en 'nombre'
  // (mismo string que se usa para derivar lote/cultivo). Se reusa ese sufijo para descartar
  // filas de otras campañas, igual criterio que consultaOT — así el plan RTK no mezcla
  // hectáreas planificadas de más de una campaña si el export llega a traerlas combinadas.
  // Filas sin sufijo reconocible (formato histórico sin 'nombre' con campaña) pasan sin filtrar,
  // ya que no hay forma de determinar su campania.
  const RTK={};
  let n_proy_sin_ha=0, n_proy_filas=0, n_proy_otra_campania=0;
  (proyecciones||[]).forEach(rowRaw=>{
    const row={}; for(const k in rowRaw){ row[normHdr(k)]=rowRaw[k]; }
    const campSuf = String(row['nombre']||'').match(/(\d{2}\/\d{2})\s*$/);
    if(campSuf && campSuf[1]!==CAMPANIA_ACTUAL){ n_proy_otra_campania++; return; }
    let cultivo, lote;
    const m = String(row['nombre']||'').match(/^LA TERESA\s+(\S+)\s+([A-ZÁÉÍÓÚÑ]+)\s+\d{2}\/\d{2}$/);
    if(m){ lote = normLote(m[1]); cultivo = m[2].toUpperCase(); }
    else {
      // cultivo: preferir la variante de texto (Actividad_1 / Especie_1) sobre el ID numérico
      cultivo = row['actividad_1'] ?? row['especie_1'] ?? row['cultivo'] ?? row['actividad'] ?? row['especie'];
      cultivo = String(cultivo||'').trim().toUpperCase();
      lote = normLote(row['lote'] ?? row['parcela']);
    }
    const haRaw = row['hectareas'] ?? row['has a aplicar'] ?? row['superficie'];
    const ha = num(haRaw);
    if(!cultivo || !lote) return;
    n_proy_filas++;
    if(!ha){ n_proy_sin_ha++; return; }
    if(!RTK[cultivo]) RTK[cultivo]={};
    RTK[cultivo][lote]=(RTK[cultivo][lote]||0)+ha;   // suma defensiva por si un lote se repite
  });
  if(n_proy_otra_campania) console.log('consultaCultivos: '+n_proy_otra_campania+' filas de otra campaña descartadas (no '+CAMPANIA_ACTUAL+').');
  if(n_proy_sin_ha) console.warn('consultaCultivos: '+n_proy_sin_ha+' de '+n_proy_filas+' filas sin hectáreas válidas (ignoradas).');
  const RTK_TOT={}; for(const c in RTK){ RTK_TOT[c]=Object.values(RTK[c]).reduce((a,b)=>a+b,0); }
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
      // totalAplicado: cantidad realmente aplicada de la linea. Solo se usa para los trabajos con
      // Unidad de Medida "Dosis" (fletes), donde es el peso ejecutado en kilogramos — ver esDosis
      // mas abajo. Para el resto de las lineas no se lee ni se usa.
      ta:num(keyOf(r,['totalAplicado','Total Aplicado'])),
      tipo:String(keyOf(r,['tipoItem','Tipo de Item'])||'').trim(),
      contr:String(keyOf(r,['contratista','Contratista'])||'').trim(),
      personal:String(keyOf(r,['personal','Personal'])||'').trim(),
      insumo:String(keyOf(r,['insumo','Insumo'])||'').trim(),
      unidad:String(keyOf(r,['unidadMedida','Unidad de medida'])||'').trim(),
      obs:String(keyOf(r,['observaciones','Observación','Observacion'])||'').trim(),
    })).filter(r=>r.ot && r.ot!=='undefined' && r.ot!=='nan');
    // esDosis = linea con Unidad de Medida "Dosis" (los fletes). En estas lineas la cantidad
    // ejecutada NO es Unidades/Dosis sino "totalAplicado", y se interpreta en kilogramos: el dato
    // real trae Has. Reales = 0,01 en todas ellas (un marcador, no superficie), asi que mostrarlas
    // como hectareas era incorrecto. El costo de estas lineas pasa a ser totalAplicado x Precio
    // Unitario, tal como se pidio — en el dato real de OT confirmadas totalAplicado coincide
    // exactamente con Unidades/Dosis, asi que el importe no cambia; la formula queda explicita.
    out.forEach(r=>{ r.esDosis=r.unidad.toLowerCase()==='dosis'; r.imp=(r.esDosis?r.ta:r.ud)*r.pu; r.esHoras=r.unidad.toLowerCase()==='horas'; });
    return out;
  }
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
  // Se agrego una tercera modalidad, 'dosis': linea principal de labor con Unidad de Medida
  // "Dosis" (fletes). Se evalua ANTES de 'hectareas' porque, con el criterio anterior, "Dosis"
  // caia en el cajon de "todo lo demas es hectareas" y el flete se mostraba como 0,01 ha. No
  // altera la clasificacion de ninguna otra linea: 'horas' sigue teniendo prioridad y el resto
  // sigue cayendo en 'hectareas' igual que antes.
  function modalidadLaborOT(lineas){
    const laborLineas = lineas.filter(l=>l.tipo==='Labor Propia'||l.tipo==='Labor Tercero');
    if(!laborLineas.length) return lineas.length && lineas.every(l=>l.esHoras) ? 'horas' : null; // sin linea de labor identificable
    if(laborLineas.some(l=>l.esHoras)) return 'horas';
    return laborLineas.some(l=>l.esDosis) ? 'dosis' : 'hectareas';
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
        // kg = peso ejecutado de los trabajos por "Dosis" (fletes): suma de totalAplicado de esas
        // lineas, mismo criterio con que `horas` suma Unidades/Dosis de las lineas por Horas.
        kg: g.filter(x=>x.esDosis).reduce((s,x)=>s+x.ta,0),
        imp: g.reduce((s,x)=>s+x.imp,0),
        propia: g.filter(x=>x.tipo==='Labor Propia').reduce((s,x)=>s+x.imp,0),
        tercero: g.filter(x=>x.tipo==='Labor Tercero').reduce((s,x)=>s+x.imp,0),
        insumos: g.filter(x=>x.tipo==='Insumo').reduce((s,x)=>s+x.imp,0),
        lines: g };
    });
  }
  const OTS = agruparOTS(rows);
  const CONF = OTS.filter(o=>o.estado==='Confirmado');
  // Comparación de Estado normalizada (sin acentos/mayúsculas, reusa normEstadio de utils.js) —
  // solo para Pendiente/En Ejecución, que es lo que este pedido pidió blindar contra variaciones de
  // tipeo del Excel. No se toca la comparación de "Confirmado" (CONF, arriba) ni el texto original
  // de o.estado que se sigue mostrando tal cual en las tablas.
  const esPendiente = o => normEstadio(o.estado)===normEstadio('Pendiente');
  const esEnEjecucion = o => normEstadio(o.estado)===normEstadio('En Ejecución');

  // ---- KPIs OT ----
  // totalPendientes/totalEnEjecucion = OT ÚNICAS (OTS ya está agrupado por número de OT, ver
  // otMap más arriba) con ese estado — total de campaña, SIN filtrar por vencimiento. Son los KPI
  // "Pendientes"/"En Ejecución" de Alertas Operacionales (ver más abajo): no representan "con
  // atraso", eso es totalAtrasadas, un concepto distinto que nunca debe mezclarse con este total.
  const total_ot=OTS.length, ot_conf=CONF.length,
    totalEnEjecucion=OTS.filter(esEnEjecucion).length,
    totalPendientes=OTS.filter(esPendiente).length;
  const costo_total=CONF.reduce((s,o)=>s+o.imp,0);

  // ---- CULTIVOS: avance de campo ----
  // Estructura de avance EXCLUSIVA del Resumen Ejecutivo — no toca land/exceso/sinrtk (Control de
  // Hectareas, mas abajo) ni gastos/dmap (Servicios). Antes se acreditaba la superficie RTK
  // COMPLETA del lote apenas aparecia UNA OT confirmada en ese lote, sin importar si era una tarea
  // de unas pocas horas (ej. una retroexcavadora) o una labor real de campo — eso inflaba el avance.
  // Ahora se usa Has. Reales de OT confirmadas de trabajo por hectareas (modalidadLaborOT, ver
  // arriba), agrupadas por lote+estadio+labor, cada labor capada al plan del lote y promediada por
  // estadio (labores distintas = pasadas distintas sobre la misma superficie, nunca se suman como
  // superficie fisica adicional). Las OT por horas aportan 0 ha; las OT por hectareas sin Has.
  // Reales valido se excluyen y quedan registradas en avanceInconsistencias, sin romper el render.
  const avanceInconsistencias=[];
  const cultivos=CULTIVOS.map(c=>{
    const sub=OTS.filter(o=>o.act.toUpperCase()===c);
    const ha_plan=RTK_TOT[c]||0;
    // Antes se descartaba todo cultivo sin ninguna OT (sub.length===0), lo que ocultaba por
    // completo un cultivo planificado (RTK>0) que todavía no tiene ninguna OT cargada — caso real
    // que el Resumen Ejecutivo necesita poder detectar ("cultivo planificado sin ejecución", ver
    // resumen.problemas más abajo). Ahora solo se descarta si NO tiene ni OT ni plan (irrelevante
    // para la campaña). No cambia nada para los cultivos que ya tenían OT.
    if(!sub.length && !ha_plan) return null;
    const conf=sub.filter(o=>o.estado==='Confirmado').length,
      ejec=sub.filter(o=>o.estado==='En Ejecución').length,
      pend=sub.filter(o=>o.estado==='Pendiente').length;
    const costo=sub.filter(o=>o.estado==='Confirmado').reduce((s,o)=>s+o.imp,0);

    // ---- Avance por ETAPA (campo "Estadio" de la OT) ----
    // Solo se consideran las 4 etapas de campaña: Preparación de Suelo, Siembra, Cuidados, Cosecha.
    // Se excluyen otros valores de Estadio que puedan aparecer (Secadero, Mantenimientos de
    // infraestructura, Operativo, Generador combustible, etc.) por no ser etapas del ciclo del
    // cultivo. Orden fijo = secuencia agronómica (no cronológico de carga).
    const confOT = sub.filter(o=>o.estado==='Confirmado' && ETAPA_ORDEN.includes(normEstadio(o.estadio)));
    const etMap={};
    confOT.forEach(o=>{
      const key=normEstadio(o.estadio);
      if(!etMap[key]) etMap[key]={nombre:ETAPA_LABEL[key],lotes:new Set()};
      etMap[key].lotes.add(normLote(o.lote));
    });
    // porLoteEstadioLabor[lote][estadio][laborKey] = {planificadas, ejecutadasReales} — labor
    // normalizada (normHdr) para que mayusculas/tildes/espacios no dupliquen el grupo. Solo OT
    // Confirmadas, de un estadio reconocido y de modalidad "hectareas" (ver modalidadLaborOT).
    const porLoteEstadioLabor={};
    confOT.forEach(o=>{
      if(o.modalidad!=='hectareas') return; // por horas u otra unidad: no aporta ha al avance
      if(o.ha==null){ avanceInconsistencias.push({ot:o.ot,cultivo:c,lote:o.lote,estadio:o.estadio,motivo:'OT por hectareas sin Has. Reales'}); return; }
      const lote=normLote(o.lote), estadio=normEstadio(o.estadio);
      const laborKey=normHdr(o.serv)||'(sin labor)';
      const planificadas=(RTK[c]&&RTK[c][lote])||0;
      if(!porLoteEstadioLabor[lote]) porLoteEstadioLabor[lote]={};
      if(!porLoteEstadioLabor[lote][estadio]) porLoteEstadioLabor[lote][estadio]={};
      const est=porLoteEstadioLabor[lote][estadio];
      if(!est[laborKey]) est[laborKey]={planificadas,ejecutadasReales:0};
      est[laborKey].ejecutadasReales+=o.ha;
    });
    // Ejecucion equivalente de un (lote,estadio): promedio de las labores presentes, cada una
    // capada (min) a la superficie planificada de ESE lote — nunca sumadas entre si (ver ejemplo
    // Disco 1 + Disco 2 en el pedido: dos pasadas sobre la misma superficie, no 2x la superficie).
    function equivalenteLoteEstadio(lote, estadio){
      const labores=(porLoteEstadioLabor[lote]&&porLoteEstadioLabor[lote][estadio])||null;
      if(!labores) return 0;
      const valores=Object.values(labores).map(l=>Math.min(l.ejecutadasReales,l.planificadas));
      return valores.reduce((a,b)=>a+b,0)/valores.length;
    }
    const etapas=ETAPA_ORDEN.filter(k=>etMap[k]).map(k=>{
      const e=etMap[k];
      let ha_e=0; e.lotes.forEach(l=>{ ha_e+=equivalenteLoteEstadio(l,k); });
      ha_e=Math.round(ha_e*100)/100;
      const av_e = ha_plan>0 ? Math.round(ha_e/ha_plan*1000)/10 : null;
      // OT de ESTE estadio puntual (cualquier Estado, no solo Confirmado) — para que "OT
      // Confirmadas/Totales" del Detalle de Etapas por Cultivo nunca mezcle OT de otro estadio.
      // "ha_plan" se repite tal cual (mismo valor que el cultivo): el plan RTK no tiene desglose
      // por estadio, así que la referencia planificada es siempre la meta de toda la campaña.
      const subEtapa = sub.filter(o=>normEstadio(o.estadio)===k);
      return {nombre:e.nombre, ha_ejec:ha_e, avance:av_e, n_lotes:e.lotes.size, ha_plan,
        otConfirmadas: subEtapa.filter(o=>o.estado==='Confirmado').length, otTotales: subEtapa.length};
    });
    const etapa_actual = etapas.length? etapas[etapas.length-1].nombre : null;
    // ha_ejec/avance a nivel cultivo = los del estadio actual (el mas avanzado de la secuencia
    // agronomica con actividad confirmada) — es lo mismo que ya se muestra en la tarjeta del
    // cultivo, y evita sumar superficie de mas de un estadio (que duplicaria el mismo lote).
    const ha_ejec = etapas.length ? etapas[etapas.length-1].ha_ejec : 0;
    let av; if(ha_plan>0) av=Math.round(ha_ejec/ha_plan*1000)/10; else { const t=conf+ejec+pend; av=t?Math.round(conf/t*1000)/10:0; }

    return {nombre:c,ha_plan:Math.round(ha_plan*100)/100,ha_ejec,avance:av,tiene_rtk:ha_plan>0,conf,ejec,pend,costo,col:color(av),etapas,etapa_actual};
  }).filter(Boolean).sort((a,b)=>(b.ha_plan-a.ha_plan)||(b.costo-a.costo));
  if(avanceInconsistencias.length) console.warn('Avance de campo: '+avanceInconsistencias.length+' OT por hectareas sin Has. Reales valido (excluidas del avance, ver D.avance_inconsistencias).');

  // ---- OPERATIVAS ----
  // "Gastos operativos" = costo de OT Confirmadas cuya Actividad es una de las categorías no
  // agrícolas de OPERATIVAS (config.js) — MISMA clasificación y fórmula (o.imp) que ya usaba esta
  // sección desde siempre, nunca se inventa una nueva. `detalle` agrupa esas mismas OT por
  // (Servicio, Contratista) dentro de cada categoría — mismo criterio de agrupación/marcadores
  // '(Labor Propia)'/'(Sin contratista)' que ya usa `dmap` en Servicios más abajo — para el
  // desglose expandible de la sección "Gastos Operativos" del Resumen Ejecutivo. `otConfirmadas`
  // es la cantidad de OT que efectivamente componen `costo` (las Confirmadas); no confundir con
  // el total de OT de la categoría en cualquier estado, que no aporta al importe.
  const operativas=OPERATIVAS.map(c=>{
    const sub=OTS.filter(o=>o.act.toUpperCase()===c);
    if(!sub.length) return null;
    const conf=sub.filter(o=>o.estado==='Confirmado');
    const costo=conf.reduce((s,o)=>s+o.imp,0);
    const detMap={};
    // OT operativas sin Servicio cargado: verificado contra el dato real, son 100% consumo de
    // GASOIL (líneas de Insumo sin ninguna labor) — se rotulan como tal en vez del genérico
    // "(Sin servicio)", a pedido del usuario.
    conf.forEach(o=>{
      const contratista = o.contr && o.contr.trim() ? o.contr.trim() : (o.tercero>0 ? '(Sin contratista)' : '(Labor Propia)');
      const servicioLabel = o.serv || 'Gasto de combustible operativo';
      const key=servicioLabel+'|'+contratista;
      if(!detMap[key]) detMap[key]={servicio:servicioLabel,contratista,ot:0,costo:0};
      const d=detMap[key]; d.ot++; d.costo+=o.imp;
    });
    // Filas con costo ~0 (ej. "CONSTRUCCION PUENTES LABOR PROPIA": horas de labor propia sin
    // costo cargado) se excluyen del desglose — mostrarían US$ 0,00 sin aportar nada al total, a
    // pedido del usuario. Umbral <0.005 porque fmtUSD redondea a 2 decimales: cualquier resto por
    // debajo de eso ya se ve como 0,00 en pantalla.
    const detalle=Object.values(detMap).filter(d=>Math.abs(d.costo)>=0.005).sort((a,b)=>b.costo-a.costo);
    return {nombre:c,otConfirmadas:conf.length,costo,part:costo_total?Math.round(costo/costo_total*1000)/10:0,detalle};
  }).filter(Boolean).sort((a,b)=>b.costo-a.costo);
  const oper_costo=operativas.reduce((s,o)=>s+o.costo,0);
  const oper_part=Math.round(operativas.reduce((s,o)=>s+o.part,0)*10)/10;
  // % de cada categoría sobre el TOTAL OPERATIVO (oper_costo) — base distinta de `part` (arriba),
  // que es el % sobre el costo total DE TODA LA CAMPAÑA. Se calcula en un segundo paso porque
  // necesita oper_costo ya sumado. Con oper_costo=0 (sin gastos operativos) queda en 0, nunca
  // NaN/Infinity.
  operativas.forEach(o=>{ o.partOperativo = oper_costo ? Math.round(o.costo/oper_costo*1000)/10 : 0; });

  // ---- CONTROL DE HECTÁREAS ----
  const RTK_CROPS=['ARROZ','SOJA','SORGO','MAIZ'];
  const land=OTS.filter(o=>!(o.lines.every(l=>l.esHoras)) && RTK_CROPS.includes(o.act.toUpperCase()) && o.ha!=null && !LOTES_NO_PARCELA.includes(normLote(o.lote)));
  const exceso=[], sinrtk=[], cancelados=[];
  RTK_CROPS.forEach(c=>{
    const byLote={};
    land.filter(o=>o.act.toUpperCase()===c).forEach(o=>{ const k=normLote(o.lote); (byLote[k]=byLote[k]||[]).push(o); });
    // Lotes a recorrer: los que tienen OT cargada (byLote) MÁS los del plan RTK (RTK[c]) — un lote
    // cancelado (RTK≈0.01) puede no tener ninguna OT todavía, y aun así se quiere listar (a pedido
    // del usuario, para poder visualizar TODOS los lotes deshabilitados, no solo los que ya tienen
    // labor cargada). Fuera de la rama "cancelado", un lote solo del plan sin ninguna OT (byLote[k]
    // ausente) se sigue ignorando: no hay nada que comparar contra el RTK todavía.
    const lotes=new Set([...Object.keys(byLote), ...(RTK[c]?Object.keys(RTK[c]).filter(k=>!LOTES_NO_PARCELA.includes(k)):[])]);
    for(const k of lotes){
      const g=byLote[k], ha_rtk=RTK[c]?RTK[c][k]:undefined;
      if(ha_rtk==null){ g.forEach(o=>sinrtk.push({ot:o.ot,cult:c,lote:o.lote,act:o.estadio||'-',serv:o.serv||'-',ha:o.ha,estado:o.estado})); continue; }
      if(Math.abs(ha_rtk-RTK_LOTE_CANCELADO)<0.001){
        const dets=(g||[]).slice().sort((a,b)=>b.ha-a.ha).map(o=>({ot:o.ot,act:o.estadio||'-',serv:o.serv||'-',estado:o.estado}));
        cancelados.push({cult:c,lote:g?g[0].lote:k,n_ot:dets.length,dets});
        continue;
      }
      if(!g) continue;
      const ha_ot=Math.max.apply(null,g.map(o=>o.ha));
      const diff=Math.round((ha_ot-ha_rtk)*100)/100;
      if(diff>0.5){
        const dets=g.slice().sort((a,b)=>b.ha-a.ha).map(o=>({ot:o.ot,act:o.estadio||'-',serv:o.serv||'-',ha:o.ha,estado:o.estado,over:o.ha>ha_rtk+0.01}));
        exceso.push({cult:c,lote:g[0].lote,ha_rtk:Math.round(ha_rtk*100)/100,ha_ot:Math.round(ha_ot*100)/100,diff,pdiff:Math.round(diff/ha_rtk*1000)/10,n_ot:dets.length,dets});
      }
    }
  });
  exceso.sort((a,b)=>b.diff-a.diff);
  sinrtk.sort((a,b)=> a.cult<b.cult?-1:a.cult>b.cult?1:(a.lote<b.lote?-1:1));
  cancelados.sort((a,b)=> a.cult<b.cult?-1:a.cult>b.cult?1:(a.lote<b.lote?-1:1));
  const exc_kpi={n:exceso.length, ha:Math.round(exceso.reduce((s,e)=>s+e.diff,0)*100)/100,
    mayor:Math.round(Math.max(0,...exceso.map(e=>e.diff))*100)/100, n_sinrtk:sinrtk.length};

  // ---- ALERTAS ----
  // Tolerancia de 3 días completos posteriores a la Fecha Teórica antes de marcar una OT como
  // atrasada (a pedido del usuario — evita alertar por demoras administrativas normales de pocos
  // días). Fecha de referencia = fecha REAL del sistema (new Date()), normalizada al inicio del
  // día para no arrastrar errores de hora/huso horario — NUNCA "HOY" (definida más arriba como la
  // mayor Fecha Teórica encontrada en el Excel: eso solo indica qué tan actualizado está el
  // archivo para el rótulo "Datos al…"/D.fecha_datos, no qué día es hoy realmente).
  // esOTAtrasada() es la ÚNICA función que decide el atraso — la reutilizan el KPI (totalAtrasadas),
  // la marca "atrasada" de cada fila de la tabla y el badge de la pestaña (ver render.js), para que
  // nunca puedan desincronizarse. La tabla en sí muestra TODA la base (otsVisibles, más abajo), no
  // solo las atrasadas — a pedido del usuario, ya que para eso está el KPI aparte. diasTranscurridos
  // se calcula UNA sola vez acá (diasTranscurridosDesde) y se reutiliza tal cual (SIN descontar la
  // tolerancia) tanto en la tabla como en la decisión de atraso — a pedido del usuario, la tabla
  // muestra el día real transcurrido (0d/1d/2d/3d/4d…), la tolerancia de 3 días solo decide si esa
  // OT cuenta o no como atrasada, nunca qué número se imprime en la celda.
  const TOLERANCIA_ATRASO_DIAS=3;
  const HOY_REAL=new Date();
  HOY_REAL.setHours(0,0,0,0);
  function diasTranscurridosDesde(fecha){
    if(!fecha) return null; // sin Fecha Teórica válida: nunca atrasada, nunca NaN (ver más abajo)
    const f=new Date(fecha);
    f.setHours(0,0,0,0);
    return Math.floor((HOY_REAL-f)/86400000);
  }
  function esOTAtrasada(o){
    const dias=diasTranscurridosDesde(o.ft);
    return dias!=null && dias>TOLERANCIA_ATRASO_DIAS;
  }
  // otsVisibles = OT únicas (OTS ya agrupado por número de OT) con estado Pendiente o En Ejecución,
  // atrasadas o no. Única colección que alimenta la tabla y sus filtros — nunca se recorre OTS de
  // nuevo desde cero para esto. Cada fila trae diasTranscurridos crudo (puede ser negativo con
  // Fecha Teórica futura, o null sin Fecha Teórica válida — render.js decide ahí si muestra el
  // número o un guion) y "atrasada" (bool, vía esOTAtrasada), usada para el color de severidad de
  // fila y para separar otsAtrasadas más abajo.
  const otsVisibles=OTS.filter(o=>esPendiente(o)||esEnEjecucion(o)).map(o=>{
    const diasTranscurridos=diasTranscurridosDesde(o.ft);
    return {ot:o.ot,cult:o.act,act:o.estadio||'-',serv:o.serv||'-',lote:o.lote,estado:o.estado,
      ft:o.ft, diasTranscurridos, atrasada:esOTAtrasada(o)};
  }).sort((a,b)=>{
    // Mayor a menor diasTranscurridos: más atrasadas primero, luego las de menos días, luego
    // fecha futura (diasTranscurridos negativo, las más próximas antes que las lejanas) y sin
    // Fecha Teórica válida al final.
    if(a.diasTranscurridos==null && b.diasTranscurridos==null) return 0;
    if(a.diasTranscurridos==null) return 1;
    if(b.diasTranscurridos==null) return -1;
    return b.diasTranscurridos-a.diasTranscurridos;
  });
  // otsAtrasadas = subconjunto atrasado de otsVisibles — única fuente del KPI "OT Atrasadas"/badge
  // y de "Posibles Problemas" en Resumen Ejecutivo (ver más abajo), nunca se recalcula por separado
  // ni se usa como fuente de la tabla.
  const otsAtrasadas=otsVisibles.filter(a=>a.atrasada);
  const totalAtrasadas=otsAtrasadas.length;

  // ---- AUDITORIA: Presupuesto de Infraestructura vs ejecución real ----
  // Cruce definido en INFRA_MAP (config.js) entre "Especificacion" del presupuesto y "Servicio"
  // real de las OT. Primer relevamiento (solo Estadio="Infraestructura") encontraba 23 OT; una
  // búsqueda más amplia por palabra clave en Servicio (sin restringir por Estadio) encontró muchas
  // más OT reales bajo otros Estadios (Preparacion de Suelo, Operativo, Mantenimientos de
  // infraestructura, Cuidados, Secadero) — por eso acá NO se filtra por Estadio, solo por
  // Servicio. No hay match de texto confiable para la mayoría de los items, así que el mapeo es
  // MANUAL, no automático. Se usan todos los datos de OT tal como vienen cargados, sin
  // reinterpretar el campo Servicio (ej. una OT de Puentes Tercero cuya Observación menciona un
  // tubo se deja igual, no se "corrige" acá).
  const infraServiciosMapeados = new Set(Object.values(INFRA_MAP).flat());
  const infraRows = rows.filter(r=>infraServiciosMapeados.has(r.serv));
  // Puentes (Tercero/Propia) NO van en esta tabla generica: tienen su propia sección de KPIs por
  // unidad mas abajo (auditoria_puentes), con sus Servicio exactos confirmados.
  const auditoria_items = (presupuestoInfra||[])
    .filter(item=>item.especificacion!==INFRA_PUENTES_TERCERO_ESP && item.especificacion!==INFRA_PUENTES_PROPIA_ESP)
    .map(item=>{
      const servicios = INFRA_MAP[item.especificacion] || [];
      const sub = infraRows.filter(r=>servicios.includes(r.serv));
      const horas = Math.round(sub.filter(r=>r.esHoras).reduce((s,r)=>s+r.ud,0)*100)/100;
      const otPropia = new Set(sub.filter(r=>r.tipo==='Labor Propia').map(r=>r.ot)).size;
      const otTercero = new Set(sub.filter(r=>r.tipo==='Labor Tercero').map(r=>r.ot)).size;
      const otConfirmadas = new Set(sub.filter(r=>r.estado==='Confirmado').map(r=>r.ot)).size;
      return {especificacion:item.especificacion, unidadMedida:item.unidadMedida,
        cantidadPresupuestada:item.cantidadPresupuestada, horas, otPropia, otTercero, otConfirmadas,
        tieneOT: sub.length>0};
    });
  // Items presupuestados en Metros: no existe en las OT ningún campo de metraje/longitud real
  // (confirmado — solo Unidades/Litros/Horas), así que NO se calcula un % de avance en metros: se
  // muestra únicamente la cantidad de OT confirmadas como aproximación, rotulada como tal en el
  // render (nunca como metros reales ni como % inventado).
  const auditoria_metros = auditoria_items.filter(i=>i.unidadMedida==='Metros').map(i=>
    ({especificacion:i.especificacion, metrosPresupuestados:i.cantidadPresupuestada, otConfirmadas:i.otConfirmadas}));

  // ---- Sección 1: Puentes por Unidad ----
  // "PRESUPUESTO Aprob" para estos dos items del presupuesto es UNIDADES de puentes (no metros ni
  // importe): 28 Tercero, 14 Propia. Ejecutado = OT CONFIRMADAS con el Servicio exacto (confirmado
  // contra el dato real, ver constantes en config.js) — no se usan las OT "En Ejecución"/
  // "Pendiente" como ejecutadas, mismo criterio de "Confirmado" que el resto del dashboard.
  function puentesPorUnidad(especificacion, servicio, tipoLabel){
    const presu = (presupuestoInfra||[]).find(i=>i.especificacion===especificacion);
    const presupuestado = presu ? presu.cantidadPresupuestada : 0;
    const ejecutadas = new Set(rows.filter(r=>r.serv===servicio && r.estado==='Confirmado').map(r=>r.ot)).size;
    const avance = presupuestado>0 ? Math.round(ejecutadas/presupuestado*1000)/10 : null;
    return {tipo:tipoLabel, presupuestado, ejecutadas, avance};
  }
  const auditoria_puentes = [
    puentesPorUnidad(INFRA_PUENTES_TERCERO_ESP, INFRA_PUENTES_TERCERO_SERV, 'Tercero'),
    puentesPorUnidad(INFRA_PUENTES_PROPIA_ESP, INFRA_PUENTES_PROPIA_SERV, 'Propia'),
  ];

  // ---- Sección 2: Gastos — "Desalijo Karanda'y / Carandai" ----
  // Antes esta sección incluía también "Construccion de Puentes retro excavadora x Hs" y un
  // segundo grupo ("Desalijo Silo Bolsa"). A pedido del usuario se angosta a un ÚNICO concepto,
  // AUDITORIA_GASTO_DESALIJO (config.js) — pero el match NO es de la frase completa exacta (eso
  // dejaba la sección en 0 pese a que sí hay trabajo real cargado, verificado contra el .xlsx):
  // Servicio nunca trae ese texto, y ninguna Observación real coincide palabra por palabra con el
  // rótulo completo. Se busca en cambio el CONCEPTO puntual dentro de la Observación (que es el
  // campo real donde está cargado, confirmado en la inspección) — "desalijo" JUNTO con la palabra
  // "karanda"/"caranda" (normalizada con normEstadio ya existente: sin acentos/mayúsculas), que
  // cubre las variantes reales de ortografía encontradas (karanda'y, caranda'y, karanday, karandai,
  // karandaý...) sin ampliarse a otros trabajos: "Desalijo Silo Bolsa..." NO menciona
  // karanda/caranda y queda afuera; una fila como "Desalijo de madera para puente..." tampoco la
  // menciona y también queda afuera (no es este trabajo, aunque comparta la palabra "desalijo").
  // Se excluyen además las OT cuyo Servicio ya se cuenta en otra sección de Auditoría (ej. OT 3884,
  // Servicio="Cerrar camino retro excavadora x Hs", ya contado en "Reparacion de camino"; su
  // Observación menciona "carandai" de pasada, no es el trabajo de desalijo en sí).
  const auditoriaServiciosUsados = new Set([
    ...infraServiciosMapeados,
    INFRA_PUENTES_TERCERO_SERV, INFRA_PUENTES_PROPIA_SERV, INFRA_PUENTES_HORAS_SERV,
  ]);
  const desalijoKarandayOT = rows.filter(r=>
    !auditoriaServiciosUsados.has(r.serv) &&
    (normEstadio(r.serv).includes('desalij') || normEstadio(r.obs).includes('desalij')) &&
    (normEstadio(r.serv).includes('karand') || normEstadio(r.serv).includes('carand') ||
     normEstadio(r.obs).includes('karand') || normEstadio(r.obs).includes('carand')));
  function gastoDeOTs(sub){
    const horas = Math.round(sub.filter(r=>r.esHoras).reduce((s,r)=>s+r.ud,0)*100)/100;
    const litros = Math.round(sub.filter(r=>r.unidad.toLowerCase()==='litros').reduce((s,r)=>s+r.ud,0)*100)/100;
    const costo = Math.round(sub.reduce((s,r)=>s+r.cl+r.ci,0)*100)/100;
    const nOT = new Set(sub.map(r=>r.ot)).size;
    const nConfirmadas = new Set(sub.filter(r=>r.estado==='Confirmado').map(r=>r.ot)).size;
    return {horas, litros, costo, nOT, nConfirmadas};
  }
  const auditoria_gastos = [
    {trabajo:AUDITORIA_GASTO_DESALIJO, ...gastoDeOTs(desalijoKarandayOT)},
  ];

  // ---- GASTOS: detalle labores reales + gasoil por área (modulo SERVICIOS) ----
  // Todo el calculo del modulo Servicios quedo encapsulado en construirServicios(): recibe las OT
  // CONFIRMADAS de UNA campania y devuelve el paquete completo que consume la pestaña (gastos,
  // gasoil_sec, meses y las opciones de los filtros Labor/Etapa/Contratista). Es exactamente la
  // logica que antes iba en linea recta acá y en el bloque de totales de mas abajo — se movio sin
  // tocar ninguna formula, para poder recalcular el modulo sobre otra campania con LAS MISMAS
  // cuentas (filtro de Campaña de Servicios) en vez de escribir una version alternativa.
  function construirServicios(CONFin){
  const servOT=new Set(CONFin.filter(o=>o.tieneServ).map(o=>o.ot));
  const detOT=CONFin.filter(o=>servOT.has(o.ot));
  const gasOT=CONFin.filter(o=>!servOT.has(o.ot));
  // detalle (mes,labor,etapa,contratista) — se incluye la etapa (Estadio) porque una misma labor
  // puede ejecutarse en más de una etapa del ciclo del cultivo a lo largo de la campaña, y el
  // Contratista (campo real "contratista" de consultaOT — verificado 100% completo en OT de
  // Labor Tercero y 100% vacío en Labor Propia contra el .xlsx real) porque agrupar solo por
  // labor+etapa mezclaba más de un contratista real en ~19% de esos grupos. Marcadores internos
  // para las OT sin contratista real: '(Labor Propia)' cuando la OT no tiene costo de tercero,
  // '(Sin contratista)' si tuviera costo de tercero sin ese campo cargado (no ocurre hoy, pero se
  // contempla) — nunca se inventa un nombre. labelContratista() (utils.js) traduce estos
  // marcadores al texto que se muestra en la interfaz.
  const dmap={};
  detOT.forEach(o=>{ const m=o.fr?o.fr.getMonth()+1:0; const est=o.estadio&&o.estadio.trim()?o.estadio.trim():'(Sin etapa)';
    const contratista = o.contr && o.contr.trim() ? o.contr.trim() : (o.tercero>0 ? '(Sin contratista)' : '(Labor Propia)');
    // esH usa la modalidad de la LINEA PRINCIPAL de labor (o.modalidad, ver mas arriba), no
    // o.lines.every(l=>l.esHoras): una OT por horas con un insumo de otra unidad quedaba mal
    // clasificada como "por hectareas" con el criterio anterior. No cambia costos ni horas
    // sumadas, solo corrige a que fila del detalle se agrupan (puede fusionar filas antes separadas
    // por error).
    const esH = o.modalidad==='horas';
    // unidadTrabajo = en que unidad se mide el trabajo ejecutado de esta fila. Reemplaza al viejo
    // booleano esH en la clave de agrupacion para poder distinguir una tercera unidad (kg, fletes
    // por Dosis) sin cambiar el agrupamiento de las otras dos: 'hrs' es exactamente el viejo
    // esH===true y 'ha' exactamente el viejo esH===false (incluidas las OT de modalidad nula), asi
    // que ninguna fila que no sea flete-Dosis se separa ni se fusiona respecto de antes.
    const unidadTrabajo = esH ? 'hrs' : (o.modalidad==='dosis' ? 'kg' : 'ha');
    const key=m+'|'+o.serv+'|'+est+'|'+unidadTrabajo+'|'+contratista;
    if(!dmap[key]) dmap[key]={mesnum:m,labor:o.serv,estadio:est,esH,unidadTrabajo,contratista,n:0,ha:0,horas:0,kg:0,propia:0,tercero:0,insumos:0};
    const d=dmap[key]; d.n++; d.ha+=(o.ha||0); d.horas+=o.horas; d.kg+=(o.kg||0); d.propia+=o.propia; d.tercero+=o.tercero; d.insumos+=o.insumos; });
  const gastos=Object.values(dmap).map(d=>({...d,ha:Math.round(d.ha*100)/100,horas:Math.round(d.horas*100)/100,
    kg:Math.round(d.kg*100)/100,
    propia:Math.round(d.propia*100)/100,tercero:Math.round(d.tercero*100)/100,insumos:Math.round(d.insumos*100)/100}));
  // gasoil por (mes,area,personal) — se usa "Personal" (operario que retiró el combustible) y no
  // "Contratista" porque en las OT de gasoil el campo Contratista viene vacío; quien queda
  // registrado es el Personal interno que hizo la carga.
  const gmap={};
  gasOT.forEach(o=>{ const m=o.fr?o.fr.getMonth()+1:0; const area=o.estadio||'(sin área)'; const pers=o.personal&&o.personal.trim()?o.personal.trim():'(Sin dato)';
    const key=m+'|'+area+'|'+pers;
    const litros=o.lines.reduce((s,l)=>s+l.ud,0);
    if(!gmap[key]) gmap[key]={mesnum:m,area,personal:pers,n:0,litros:0,total:0};
    const gg=gmap[key]; gg.n++; gg.litros+=litros; gg.total+=o.imp; });
  const gasoil_sec=Object.values(gmap).map(g=>({...g,litros:Math.round(g.litros*10)/10,total:Math.round(g.total*100)/100}));
  const gasto_total=gastos.reduce((s,d)=>s+d.propia+d.tercero+d.insumos,0);
  const gasoil_total=gasOT.reduce((s,o)=>s+o.imp,0), gasoil_litros_total=gasOT.reduce((s,o)=>s+o.lines.reduce((a,l)=>a+l.ud,0),0);
  const gmes={}, glit={};
  gasOT.forEach(o=>{ const m=o.fr?o.fr.getMonth()+1:0; gmes[m]=(gmes[m]||0)+o.imp; glit[m]=(glit[m]||0)+o.lines.reduce((a,l)=>a+l.ud,0); });
  const meses=[...new Set([...gastos.map(d=>d.mesnum),...gasoil_sec.map(g=>g.mesnum)])].filter(m=>m>0).sort((a,b)=>a-b).map(m=>({k:m,lbl:MES[m]}));
  const labores=[...new Set(gastos.map(d=>d.labor))].sort((a,b)=>a.localeCompare(b,'es'));
  const estadios_labor=[...new Set(gastos.map(d=>d.estadio))].sort((a,b)=>a.localeCompare(b,'es'));
  // Contratistas reales de "Detalle por Labor" (para el filtro dependiente), con los marcadores
  // '(Labor Propia)'/'(Sin contratista)' siempre al final — labelContratista() (utils.js) los
  // traduce al texto que se muestra tanto en el filtro como en la columna de la tabla.
  const contratistas_labor=[...new Set(gastos.map(d=>d.contratista))].sort((a,b)=>{
    const esp=k=>k==='(Labor Propia)'||k==='(Sin contratista)';
    if(esp(a)&&!esp(b)) return 1; if(!esp(a)&&esp(b)) return -1;
    return labelContratista(a).localeCompare(labelContratista(b),'es');
  });
  // costo_conf = costo ejecutado de esta campania: importe de TODAS sus OT confirmadas, con la misma
  // definicion que ya tenia el KPI "Costo Ejecutado" del Resumen Ejecutivo (labores con Servicio +
  // OT de retiro de gasoil). Se suma directo sobre CONFin y no como gasto_total+gasoil_total porque
  // `gastos` ya viene redondeado a 2 decimales por fila y esa suma arrastra centavos de diferencia.
  const costo_conf=CONFin.reduce((s,o)=>s+o.imp,0);
  return {gastos,gasoil_sec,meses,gasto_total,gasoil_total,gasoil_litros_total,gmes,glit,
    labores,estadios_labor,contratistas_labor,costo_conf};
  }
  const SERVICIOS = construirServicios(CONF);
  const {gastos,gasoil_sec,meses,gasto_total,gasoil_total,gasoil_litros_total,gmes,glit,
    labores,estadios_labor,contratistas_labor} = SERVICIOS;
  // Un paquete de Servicios por cada campania presente en consultaOT. La campania vigente reusa el
  // paquete ya calculado (SERVICIOS): no se recalcula ni se duplica. Las demas se derivan con las
  // MISMAS funciones (normalizarFilasOT -> agruparOTS -> construirServicios) sobre sus propias
  // filas. Estas colecciones viven SOLO acá: ningun otro modulo del dashboard las lee, y `raw`/
  // `rows`/`OTS`/`CONF` (base de Resumen Ejecutivo, Insumos, Combustible, Auditoria, Control de
  // Hectareas y Alertas) siguen recortados a CAMPANIA_ACTUAL, sin ninguna modificacion.
  const servicios_campanias = {};
  servicios_campanias[CAMPANIA_ACTUAL] = SERVICIOS;
  campanias_ot.forEach(c=>{
    if(c===CAMPANIA_ACTUAL) return;
    const rowsC = normalizarFilasOT(rawTodasCampanias.filter(row=>campaniaDeFila(row)===c));
    servicios_campanias[c] = construirServicios(agruparOTS(rowsC).filter(o=>o.estado==='Confirmado'));
  });
  // ---- Costo ejecutado CONSOLIDADO (todas las campanias de consultaOT) ----
  // Es el unico numero economico que el Resumen Ejecutivo pasa a mirar mas alla de CAMPANIA_ACTUAL:
  // alimenta el KPI "Costo Ejecutado" y nada mas. Sin riesgo de doble conteo: cada fila de
  // consultaOT tiene exactamente un valor de 'campania', los paquetes de servicios_campanias se
  // construyen sobre particiones disjuntas de esas filas (verificado contra el dato: la suma de
  // filas por campania da el total exacto, no hay filas sin campania y ningun numero de OT aparece
  // en mas de una campania), y la campania vigente entra una sola vez porque el forEach de arriba
  // la saltea. `costo_total` (26/27) NO se toca: lo siguen usando los porcentajes de Gastos
  // Operativos (operativas[].part / oper_part) y la alerta de concentracion de costo por labor, que
  // deben seguir expresados sobre la campania vigente.
  const costo_por_campania = Object.keys(servicios_campanias)
    .map(c=>({campania:c, costo:Math.round(servicios_campanias[c].costo_conf*100)/100}))
    .sort((a,b)=>b.costo-a.costo);
  const costo_total_consolidado = Object.keys(servicios_campanias)
    .reduce((s,c)=>s+servicios_campanias[c].costo_conf,0);
  // ---- COMBUSTIBLE (litros y contratistas) ----
  // Fuente: consultaInsumos, filtrada a tipoInsumo="COMBUSTIBLES" y ya sin las filas de
  // "Existencia inicial" (separadas antes de llegar acá — ver combustible_existencia_inicial).
  // combustibleRaw llega con la misma forma que tenía el viejo Movimiento_de_combustible.csv:
  // Fecha, Referencia (comprobante), Unidades (litros, en valor absoluto), Tercero y
  // Descripción Tipo de Comprobante. Sin filtro de campaña ni de fecha: consultaInsumos se
  // procesa completo, tal como antes de introducir el filtro de campaña para consultaOT.
  // "Descripción Tipo de Comprobante" distingue el sentido del movimiento:
  //  - "Ingreso de Mercadería" = ENTRADA de combustible al depósito (compra a un proveedor, ej.
  //    VANE S.A.). No es consumo — mezclarlo con lo demás infla artificialmente el litraje de ese
  //    proveedor como si hubiera "usado" el combustible, cuando en realidad es quien lo trajo.
  //  - "Remisión por Venta" y "Comprobante Automático de Egreso de Stock" = SALIDA de combustible
  //    del depósito hacia una labor (consumo real, por Tercero o Labor Propia si viene vacío).
  // Por eso se separan en dos vistas: Consumo (egresos, "quién lo usó") e Ingresos (compras,
  // "quién lo trajo"). Referencia queda disponible para trazabilidad del comprobante puntual.
  const combRaw = (combustibleRaw||[]).map(rowRaw=>{ const row={}; for(const k in rowRaw){ row[normHdr(k)]=rowRaw[k]; } return row; });
  const combRows = combRaw.map(row=>({
    fecha: pdate(row['fecha']),
    referencia: String(row['referencia']||'').trim(),
    unidades: num(row['unidades']),
    tercero: String(row['tercero']||'').trim(),
    insumo: String(row['insumo']||'').trim(),
    tipoComp: String(row['descripcion tipo de comprobante']||'').trim(),
  })).filter(r=> (!r.insumo || r.insumo.toUpperCase()==='GASOIL') && r.fecha);
  const esIngreso = r => normEstadio(r.tipoComp).indexOf('ingreso')>-1;

  function agruparComb(list){
    const map={};
    list.forEach(r=>{
      const mesnum = r.fecha.getMonth()+1;
      const quien = r.tercero ? r.tercero : 'Labor Propia';
      const key = mesnum+'|'+quien;
      if(!map[key]) map[key]={mesnum,quien,n:0,litros:0};
      const c=map[key]; c.n++; c.litros+=r.unidades;
    });
    return Object.values(map).map(c=>({...c,litros:Math.round(c.litros*100)/100})).sort((a,b)=>b.litros-a.litros);
  }
  const combustible = agruparComb(combRows.filter(r=>!esIngreso(r)));
  const combustible_ingresos = agruparComb(combRows.filter(r=>esIngreso(r)));
  const combustible_meses=[...new Set(combustible.map(c=>c.mesnum))].sort((a,b)=>a-b).map(m=>({k:m,lbl:MES[m]}));
  const combustible_terceros=[...new Set(combustible.map(c=>c.quien))].sort((a,b)=>a.localeCompare(b,'es'));
  const combustible_litros_total = Math.round(combustible.reduce((s,c)=>s+c.litros,0)*100)/100;
  const combustible_n_total = combustible.reduce((s,c)=>s+c.n,0);
  const combustible_ingresos_litros_total = Math.round(combustible_ingresos.reduce((s,c)=>s+c.litros,0)*100)/100;
  const combustible_ingresos_n_total = combustible_ingresos.reduce((s,c)=>s+c.n,0);

  // ---- Stock Inicial de combustible (dinámico) ----
  // Sale de consultaInsumos: filas con tipoMovimiento="Existencia inicial" (stock de arranque
  // de campaña, fechadas al 1/1). Antes era un valor fijo; ahora se calcula sumando estas filas.
  // OJO: las filas individuales vienen con signo mixto (la mayoría negativas, algunas positivas)
  // — no representan cada una un "stock positivo", son un ajuste/asiento por lote. La suma NETA
  // (con signo, sin abs) es la que da el stock real de arranque; sumar valores absolutos da un
  // número absurdamente inflado. Se guardan también los registros crudos (no se usan para
  // Consumo/Ingreso) porque el signo mixto es poco habitual para un "saldo inicial" — quedan
  // disponibles para que gestión los revise, no se descartan.
  const combustible_existencia_inicial = (existenciaInicial||[]).map(rowRaw=>{
    const row={}; for(const k in rowRaw){ row[normHdr(k)]=rowRaw[k]; }
    return { fecha: pdate(row['fecha']), referencia: String(row['referencia']||'').trim(),
      unidades: num(row['unidades']), proveedor: String(row['proveedor']||'').trim() };
  });
  const stock_inicial_combustible = Math.round(combustible_existencia_inicial.reduce((s,r)=>s+r.unidades,0)*100)/100;

  // ---- INSUMOS (modulo nuevo: todo lo de consultaInsumos que no es combustible) ----
  // Ingreso y Consumo, en CANTIDAD real (columna "Unidades"), NUNCA en dinero — igual criterio
  // que ya usa Combustible (que tampoco muestra dinero, solo litros).
  // Tipos de movimiento reales encontrados en consultaInsumos (10 valores, verificados contra el
  // .xlsx del repo — no 8 como se penso en un principio: aparecen ademas "Egreso de Materia
  // Prima" y "Transferencia de Mercadería Electronica"):
  //   Comprobante Automático de Egreso de Stock, Remision por Venta, Transferencia de Mercadería,
  //   Ingreso de Mercaderia, Egreso de Materia Prima, Egreso de Mercaderia, Stock Inicial,
  //   Transferencia de Mercadería Electronica, Ajuste en Mas -Stock, Existencia inicial.
  // Por ahora Ingreso y Consumo usan cada uno un unico tipoMovimiento, sin mezclarse entre si ni
  // con ningun otro tipo: Ingreso = "Ingreso de Mercaderia"; Consumo = "Comprobante Automático de
  // Egreso de Stock" (en valor absoluto: estas filas vienen en negativo). Los demas tipos
  // (Remision por Venta, Egreso de Mercaderia, Egreso de Materia Prima, Transferencia...,
  // Ajuste...) quedan fuera de ambas secciones por el momento — no hay criterio funcional para
  // asignarlos a Ingreso o Consumo.
  // NO se filtra por campania acá: consultaInsumos se procesa completo (todas las campanias),
  // a diferencia de consultaOT/consultaCultivos. Solo se aplica el tipoMovimiento exacto.
  const MOV_INGRESO = 'Ingreso de Mercaderia';
  const MOV_CONSUMO = 'Comprobante Automático de Egreso de Stock';
  // ---- Filtro Ganadería (exclusivo de este módulo) ----
  // consultaInsumos puede traer registros agrícolas Y ganaderos mezclados. El módulo Insumos debe
  // trabajar SOLO con los agrícolas: categoriaInsumo = "Agricola" (normalizado) Y observaciones que
  // NO mencionen "GANADER" (cubre Ganadería/Ganadero/Ganadera/etc., sin depender de mayúsculas,
  // tildes ni espacios — normEstadio ya hace ese trabajo y es null-safe: categoriaInsumo/
  // observaciones ausentes o null no rompen la comparación, simplemente no matchean "agricola" y
  // la fila queda excluida). Se filtra sobre una COPIA derivada (otrosInsumosAgricolas) — nunca se
  // modifica ni se recorta "otrosInsumos" (la colección original, que sigue exponiéndose intacta
  // más abajo en D.insumos_pendiente_modulo para trazabilidad) ni nada de Combustible: ese módulo
  // usa combustibleRaw/existenciaInicial, arrays completamente aparte ya separados en
  // separarInsumos() (loader.js), que nunca pasan por este filtro.
  function esMovimientoAgricolaNoGanadero(r){
    const categoria = normEstadio(r.categoriaInsumo);
    const observacion = normEstadio(r.observaciones);
    return categoria==='agricola' && !observacion.includes('ganader');
  }
  const otrosInsumosAgricolas = (otrosInsumos||[]).filter(esMovimientoAgricolaNoGanadero);
  const insumosRowsAll = otrosInsumosAgricolas.map(rowRaw=>{
    const row={}; for(const k in rowRaw){ row[normHdr(k)]=rowRaw[k]; }
    return {
      fecha: pdate(row['fecha']),
      tipoMov: String(row['tipomovimiento']||'').trim(),
      tipo: String(row['tipoinsumo']||'').trim() || '(sin tipo)',
      nombre: String(row['nombre']||'').trim(),
      proveedor: String(row['proveedor']||'').trim(),
      unidad: String(row['unidadmedida']||'').trim() || '(sin unidad)',
      unidades: num(row['unidades']),
    };
  });
  const insumos_tipos = [...new Set(insumosRowsAll.map(r=>r.tipo))].sort((a,b)=>a.localeCompare(b,'es'));
  // Insumos (Nombre) agrupados por Tipo, para el filtro dependiente "Insumo" — solo incluye
  // insumos ACTIVOS: al menos un movimiento válido de Ingreso o Consumo (mismos MOV_INGRESO/
  // MOV_CONSUMO de arriba — no se reinterpreta la clasificación ya usada por agruparIngreso()/
  // agruparConsumo()). Tener únicamente "Existencia inicial"/"Stock Inicial" NO alcanza para
  // aparecer acá (a pedido del usuario): ese stock sigue sumando al Balance más abajo, pero no
  // habilita por sí solo la aparición en el filtro. La comparación usa una clave normalizada
  // (normHdr: sin acentos/mayúsculas, espacios colapsados) para que una diferencia de tipeo entre
  // el Ingreso y el Consumo de un mismo insumo no lo separe en dos ni lo deje afuera; el texto que
  // se muestra en la interfaz es siempre el original tal cual viene en los datos, nunca el
  // normalizado. Es dinámico: se recalcula en cada carga a partir de insumosRowsAll, sin lista
  // manual de insumos.
  const insumosActivosKeys = new Set();
  insumosRowsAll.forEach(r=>{
    if(!r.nombre) return;
    if(r.tipoMov===MOV_INGRESO || r.tipoMov===MOV_CONSUMO) insumosActivosKeys.add(normHdr(r.tipo)+'|'+normHdr(r.nombre));
  });
  const insumosPorTipoSet={};
  insumosRowsAll.forEach(r=>{
    if(!r.nombre) return;
    const nombreNorm = normHdr(r.nombre);
    if(!insumosActivosKeys.has(normHdr(r.tipo)+'|'+nombreNorm)) return;
    const porNombre = insumosPorTipoSet[r.tipo] = insumosPorTipoSet[r.tipo] || new Map();
    if(!porNombre.has(nombreNorm)) porNombre.set(nombreNorm, r.nombre);
  });
  const insumos_por_tipo={};
  Object.keys(insumosPorTipoSet).forEach(t=>{ insumos_por_tipo[t]=[...insumosPorTipoSet[t].values()].sort((a,b)=>a.localeCompare(b,'es')); });
  // ---- Ingreso y Consumo (detalle): Insumo, Proveedor, Registros, Unidad, Cantidad — agrupadas
  // por (mes, insumo, proveedor, unidad) para respetar el filtro de mes por Fecha. "tipo" viaja en
  // cada fila para poder filtrar por el selector global de Tipo de Insumo, pero NO se muestra como
  // columna en estas tablas (esa info ahora la da el filtro, no hace falta repetirla por fila).
  // Proveedor en Consumo viene vacío en el 100% de los casos reales (confirmado: 0 de 5.594 filas
  // de "Comprobante Automático de Egreso de Stock" no-combustible traen proveedor) — no se agrupa
  // por proveedor en Consumo (no aporta nada agrupar por un campo que siempre es igual) y no se
  // expone ese campo en el resultado: la columna Proveedor de Consumo debe quedar SIEMPRE vacía en
  // el render, sin texto por defecto ni dato calculado.
  function agruparIngreso(){
    const map={};
    insumosRowsAll.filter(r=>r.tipoMov===MOV_INGRESO).forEach(r=>{
      const m = r.fecha ? r.fecha.getMonth()+1 : 0;
      const prov = r.proveedor || '(sin dato)';
      const key = m+'|'+r.tipo+'|'+r.nombre+'|'+prov+'|'+r.unidad;
      if(!map[key]) map[key]={mesnum:m,tipo:r.tipo,nombre:r.nombre,proveedor:prov,unidad:r.unidad,n:0,cantidad:0};
      const o=map[key]; o.n++; o.cantidad += r.unidades;
    });
    return Object.values(map).map(o=>({...o,cantidad:Math.round(o.cantidad*100)/100}));
  }
  function agruparConsumo(){
    const map={};
    insumosRowsAll.filter(r=>r.tipoMov===MOV_CONSUMO).forEach(r=>{
      const m = r.fecha ? r.fecha.getMonth()+1 : 0;
      const key = m+'|'+r.tipo+'|'+r.nombre+'|'+r.unidad;
      if(!map[key]) map[key]={mesnum:m,tipo:r.tipo,nombre:r.nombre,unidad:r.unidad,n:0,cantidad:0};
      const o=map[key]; o.n++; o.cantidad += Math.abs(r.unidades);
    });
    return Object.values(map).map(o=>({...o,cantidad:Math.round(o.cantidad*100)/100}));
  }
  const insumos_ingreso = agruparIngreso();
  const insumos_consumo = agruparConsumo();
  const insumos_meses = [...new Set([...insumos_ingreso,...insumos_consumo].map(o=>o.mesnum))].filter(m=>m>0).sort((a,b)=>a-b).map(m=>({k:m,lbl:MES[m]}));

  // ---- Stock dinamico por (Tipo de Insumo, Insumo, Unidad de Medida) — misma logica que
  // Combustible ----
  // Combustible funciona con UN solo stock (un unico producto, Litros); Insumos mezcla muchos
  // productos con unidades incompatibles entre si (Kilos, Litros, Unidades, Dosis...), asi que el
  // flujo Stock Inicial -> Ingreso -> Consumo -> Balance se calcula por separado para cada
  // combinacion (Tipo, Insumo, Unidad) — es la unidad minima donde sumar/restar tiene sentido, y
  // permite filtrar tanto por Tipo de Insumo como por el filtro dependiente "Insumo" sin cambiar la
  // formula: los filtros solo deciden que fila(s) de esta grilla se suman para mostrar el KPI
  // ("Todos los insumos" de un tipo = sumar todas sus filas, igual que "Todos" ya sumaba por tipo).
  // Stock Inicial sale de "Existencia inicial" + "Stock Inicial" (ambos sin valor monetario real,
  // ya verificado), sumados CON signo (no valor absoluto) por el mismo motivo que
  // combustible_existencia_inicial: traen signo mixto (ajustes por lote) y la suma neta es la que
  // da el stock real de arranque.
  const stockInicialMap={};
  insumosRowsAll.filter(r=>r.tipoMov==='Existencia inicial' || r.tipoMov==='Stock Inicial').forEach(r=>{
    const key = r.tipo+'|'+r.nombre+'|'+r.unidad;
    if(!stockInicialMap[key]) stockInicialMap[key]={tipo:r.tipo,nombre:r.nombre,unidad:r.unidad,cantidad:0};
    stockInicialMap[key].cantidad += r.unidades;
  });
  function agruparPorInsumoMes(tipoMov, absoluto){
    const map={};
    insumosRowsAll.filter(r=>r.tipoMov===tipoMov).forEach(r=>{
      const m = r.fecha ? r.fecha.getMonth()+1 : 0;
      const key = m+'|'+r.tipo+'|'+r.nombre+'|'+r.unidad;
      if(!map[key]) map[key]={mesnum:m,tipo:r.tipo,nombre:r.nombre,unidad:r.unidad,cantidad:0};
      map[key].cantidad += absoluto ? Math.abs(r.unidades) : r.unidades;
    });
    return Object.values(map).map(o=>({...o,cantidad:Math.round(o.cantidad*100)/100}));
  }
  const insumos_ingreso_mensual = agruparPorInsumoMes(MOV_INGRESO, false);
  const insumos_consumo_mensual = agruparPorInsumoMes(MOV_CONSUMO, true);
  // Union de combinaciones (Tipo, Insumo, Unidad) que aparecen en Stock Inicial y/o en
  // movimientos, para que el flujo se muestre aunque falte alguno de los tres (ej. stock sin
  // movimiento este año). Se arma desde los objetos ya tipados (no split de un string armado) para
  // no depender de que "Insumo" nunca contenga el separador "|".
  const flujoClaves={};
  Object.values(stockInicialMap).forEach(o=>{ flujoClaves[o.tipo+'|'+o.nombre+'|'+o.unidad]={tipo:o.tipo,nombre:o.nombre,unidad:o.unidad}; });
  insumos_ingreso_mensual.forEach(o=>{ const k=o.tipo+'|'+o.nombre+'|'+o.unidad; if(!flujoClaves[k]) flujoClaves[k]={tipo:o.tipo,nombre:o.nombre,unidad:o.unidad}; });
  insumos_consumo_mensual.forEach(o=>{ const k=o.tipo+'|'+o.nombre+'|'+o.unidad; if(!flujoClaves[k]) flujoClaves[k]={tipo:o.tipo,nombre:o.nombre,unidad:o.unidad}; });
  const insumos_stock_flujo = Object.keys(flujoClaves).map(key=>{
    const {tipo,nombre,unidad}=flujoClaves[key];
    return {tipo,nombre,unidad,stockInicial:Math.round((stockInicialMap[key]?stockInicialMap[key].cantidad:0)*100)/100};
  }).sort((a,b)=>a.tipo.localeCompare(b.tipo,'es')||a.nombre.localeCompare(b.nombre,'es')||a.unidad.localeCompare(b.unidad,'es'));

  // ================= RESUMEN EJECUTIVO =================
  // Todo lo que sigue alimenta exclusivamente la pestaña Resumen Ejecutivo. Se calcula UNA sola
  // vez acá (no en render.js) y se reutilizan colecciones ya construidas arriba (cultivos,
  // otsAtrasadas, exceso, sinrtk, gastos, operativas) — nunca se vuelve a filtrar OTS/rows desde
  // cero para esto.

  // ---- Avance general de campaña (Ha Ejecutadas / Ha Planificadas, todos los cultivos) ----
  // Ya NO se muestra como KPI ni como gráfico (ambos se retiraron a pedido del usuario): la
  // superficie planificada/ejecutada ahora se presenta únicamente dentro de "Detalle de Etapas
  // por Cultivo" (por cultivo y por estadio, ver etapas más arriba). Este promedio general se
  // conserva SOLO porque la regla de "posibles problemas" crop_underperformance lo sigue usando
  // como referencia de comparación (avance del cultivo vs. avance general) — pctSeguro() evita
  // la división por cero devolviendo null en vez de inventar un 0%.
  const resumen_avance = pctSeguro(
    Math.round(cultivos.reduce((s,c)=>s+c.ha_ejec,0)*100)/100,
    Math.round(cultivos.reduce((s,c)=>s+c.ha_plan,0)*100)/100);

  // ---- Estado de las OT: categorías REALES encontradas en consultaOT (no una lista fija) — los 3
  // estados conocidos (Confirmado/En Ejecución/Pendiente) en orden fijo, y cualquier otro valor
  // real que aparezca se agrupa como "Otros" (con el detalle de qué valores incluye, nunca oculto).
  const OT_ESTADO_ORDEN=['Confirmado','En Ejecución','Pendiente'];
  const otEstadoCount={};
  OTS.forEach(o=>{ const e=o.estado||'(Sin estado)'; otEstadoCount[e]=(otEstadoCount[e]||0)+1; });
  const otrosEstadosNombres=Object.keys(otEstadoCount).filter(e=>!OT_ESTADO_ORDEN.includes(e));
  const nOtrosEstados=otrosEstadosNombres.reduce((s,e)=>s+otEstadoCount[e],0);
  const resumen_estadosOT=[
    ...OT_ESTADO_ORDEN.filter(e=>otEstadoCount[e]).map(e=>({estado:e,n:otEstadoCount[e]})),
    ...(nOtrosEstados?[{estado:'Otros',n:nOtrosEstados,detalle:otrosEstadosNombres.join(', ')}]:[]),
  ].map(e=>({...e,pct:pctSeguro(e.n,total_ot)||0}));

  // ---- Actividad operacional por mes: cantidad de OT CONFIRMADAS por mes de Fecha Real (mismo
  // campo/criterio que ya usa Servicios para agrupar por mes — o.fr.getMonth()+1). Se usa conteo
  // de OT y no hectáreas: no todas las OT traen Has. Reales (solo las de tierra/RTK_CROPS), así
  // que un total en hectáreas dejaría meses enteros en 0 aunque hubo actividad real. Se etiqueta
  // explícitamente como "OT" en el render para que no se confunda con hectáreas. Fechas inválidas
  // (fr null) se excluyen, igual criterio que el resto del dashboard; orden cronológico (mesnum),
  // nunca alfabético.
  const resumenActMap={};
  CONF.forEach(o=>{ if(!o.fr) return; const m=o.fr.getMonth()+1; resumenActMap[m]=(resumenActMap[m]||0)+1; });
  const resumen_actividadMensual=Object.keys(resumenActMap).map(Number).sort((a,b)=>a-b)
    .map(m=>({mesnum:m,lbl:MES[m],otConfirmadas:resumenActMap[m]}));

  // ---- Posibles problemas en la campaña: reglas separadas y trazables, cada una produce 0..N
  // tarjetas con severidad (critica/alta/media/informativa), reutilizando SIEMPRE una colección ya
  // calculada arriba (nunca se recorren OTS/rows de nuevo). Los umbrales usados están en
  // config.js (RESUMEN_*), no hardcodeados acá. Ninguna regla afirma una conclusión definitiva
  // sobre el campo — todas se redactan como desviación/posible problema para revisión.
  const RP=[];

  // 1) OT atrasadas — MISMA lógica exacta que Alertas Operacionales (otsAtrasadas/totalAtrasadas
  // ya calculados arriba). Severidad = la del atraso MÁXIMO encontrado (otsAtrasadas ya viene
  // ordenado desc por días). "OT Pendientes" no es lo mismo que "OT Atrasadas": acá solo entran
  // las que además tienen Fecha Teórica vencida, igual que en Alertas Operacionales.
  if(otsAtrasadas.length){
    // maxDias = días CRUDOS transcurridos (sin descontar la tolerancia de 3 días) — misma base
    // que la severidad de color de fila de Alertas Operacionales (umbrales 7/15/30 documentados).
    const maxDias=otsAtrasadas[0].diasTranscurridos;
    const sev = maxDias>30?'critica':(maxDias>15?'alta':(maxDias>7?'media':'informativa'));
    const porServicio={}; otsAtrasadas.forEach(a=>{ const k=a.serv&&a.serv!=='-'?a.serv:'(Sin servicio)'; porServicio[k]=(porServicio[k]||0)+1; });
    const top=Object.entries(porServicio).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>k+' ('+v+')').join(', ');
    RP.push({id:'delayed_work_orders', severidad:sev, titulo:'Órdenes de trabajo atrasadas',
      descripcion:otsAtrasadas.length+' OT (Pendiente o En Ejecución) con más de '+TOLERANCIA_ATRASO_DIAS+' día(s) posteriores a su Fecha Teórica. Atraso máximo: '+maxDias+' día(s).',
      metrica:otsAtrasadas.length+' OT', contexto:'Servicios más afectados: '+top,
      accion:'Ver Alertas Operacionales', destinoTab:5, impacto:otsAtrasadas.length});
  }

  // 2) Cultivos con avance por debajo del promedio de campaña — desviación RELATIVA (avance del
  // cultivo vs. avance general en hectáreas), nunca contra una curva agronómica o fecha objetivo
  // que no existe en los archivos. Rotulado explícitamente como desviación relativa, no como
  // atraso agronómico confirmado. No se asigna un destino de pestaña: el detalle ya está a la
  // vista en el gráfico "Avance por Cultivo" de esta misma página.
  if(resumen_avance!=null){
    cultivos.filter(c=>c.tiene_rtk).forEach(c=>{
      const diff=resumen_avance-c.avance;
      if(diff>=RESUMEN_DESVIACION_CULTIVO_MEDIA){
        const sev = diff>=RESUMEN_DESVIACION_CULTIVO_ALTA?'alta':'media';
        const nombreCap=c.nombre.charAt(0)+c.nombre.slice(1).toLowerCase();
        RP.push({id:'crop_underperformance', severidad:sev,
          titulo:nombreCap+': avance por debajo del promedio de la campaña',
          descripcion:'Avance de '+Math.round(c.avance)+'% vs. '+Math.round(resumen_avance)+'% general — desviación relativa, no confirma atraso agronómico.',
          metrica:Math.round(c.avance)+'%', contexto:fmt2(c.ha_ejec)+' de '+fmt2(c.ha_plan)+' ha ejecutadas',
          accion:null, destinoTab:null, impacto:diff});
      }
    });
  }

  // 3) Superficie ejecutada superior al plan — reutiliza exceso/exc_kpi ya calculados en Control
  // de Hectáreas, sin recalcular nada. Severidad según el % de exceso del PEOR caso encontrado.
  if(exc_kpi.n){
    const pctMayor = exceso.length ? Math.max(...exceso.map(e=>e.pdiff)) : 0;
    const sev = pctMayor>=RESUMEN_SOBREEJECUCION_CRITICA?'critica':(pctMayor>=RESUMEN_SOBREEJECUCION_ALTA?'alta':'media');
    RP.push({id:'crop_overexecution', severidad:sev, titulo:'Superficie ejecutada superior al plan',
      descripcion:exc_kpi.n+' lote(s) con hectáreas ejecutadas por encima de lo planificado (RTK).',
      metrica:'+'+fmt2(exc_kpi.ha)+' ha', contexto:'Mayor caso: +'+fmt2(exc_kpi.mayor)+' ha ('+Math.round(pctMayor)+'% de exceso)',
      accion:'Ver Control de Hectáreas', destinoTab:4, impacto:exc_kpi.ha});
  }

  // 4) OT sin correspondencia en el plan — reutiliza sinrtk ya calculado en Control de Hectáreas.
  if(sinrtk.length){
    const porCultivo={}; sinrtk.forEach(r=>{ porCultivo[r.cult]=(porCultivo[r.cult]||0)+1; });
    const top=Object.entries(porCultivo).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>k+' ('+v+')').join(', ');
    const sev = sinrtk.length>=RESUMEN_SINRTK_ALTA?'alta':'media';
    RP.push({id:'unmatched_orders', severidad:sev, titulo:'OT sin correspondencia en el plan RTK',
      descripcion:sinrtk.length+' OT cargadas en lotes que no existen en la planificación RTK.',
      metrica:sinrtk.length+' OT', contexto:'Principales cultivos: '+top,
      accion:'Ver Control de Hectáreas', destinoTab:4, impacto:sinrtk.length});
  }

  // 5) Cultivos planificados sin ejecución registrada — posible gracias al fix de "cultivos" de
  // arriba (ya no se descartan los que no tienen ninguna OT todavía). Redactado como "sin
  // ejecución REGISTRADA": no afirma que el trabajo físico no se haya realizado.
  cultivos.filter(c=>c.tiene_rtk && c.ha_ejec<=0).forEach(c=>{
    const nombreCap=c.nombre.charAt(0)+c.nombre.slice(1).toLowerCase();
    RP.push({id:'inactive_planned_crops', severidad:'media', titulo:nombreCap+': sin ejecución registrada',
      descripcion:'Tiene '+fmt2(c.ha_plan)+' ha planificadas y 0 ha ejecutadas en OT confirmadas.',
      metrica:fmt2(c.ha_plan)+' ha planificadas', contexto:'No implica necesariamente que el trabajo físico no se haya realizado.',
      accion:null, destinoTab:null, impacto:c.ha_plan});
  });

  // 6) Concentración elevada del gasto — generalización de la vieja verificación fija de "1°/2°
  // Disco": acá se busca dinámicamente qué LABOR real concentra más costo (reutilizando `gastos`,
  // ya agregado por labor/mes) en vez de un nombre de labor hardcodeado, para que siga
  // funcionando si cambian los nombres de labor de una campaña a otra.
  if(costo_total>0){
    const porLabor={};
    gastos.forEach(g=>{ porLabor[g.labor]=(porLabor[g.labor]||0)+g.propia+g.tercero+g.insumos; });
    const top=Object.entries(porLabor).sort((a,b)=>b[1]-a[1])[0];
    if(top){
      const pct=Math.round(top[1]/costo_total*1000)/10;
      if(pct>=RESUMEN_CONCENTRACION_GASTO){
        const sev = pct>=RESUMEN_CONCENTRACION_GASTO_ALTA?'alta':'media';
        RP.push({id:'high_cost_concentration', severidad:sev, titulo:'Concentración elevada del gasto en "'+top[0]+'"',
          descripcion:'Una sola labor concentra '+pct+'% del costo ejecutado de la campaña — para revisión, no implica error.',
          metrica:pct+'%', contexto:'US$ '+fmtUSD(top[1])+' de US$ '+fmtUSD(costo_total)+' del total',
          accion:'Ver Servicios', destinoTab:1, impacto:pct});
      }
    }
  }

  // 7) Datos incompletos o inconsistentes — solo se cuentan campos que SÍ son obligatorios según
  // la estructura real: Actividad (sin ella la OT no entra en ningún cultivo ni área operativa) y
  // Fecha Teórica (sin ella nunca puede detectarse como atrasada). El campo Servicio NO se cuenta
  // acá: hay OT reales sin Servicio por diseño (las de gasoil, ver gasOT) — no es un dato faltante.
  const otSinActividad=OTS.filter(o=>!o.act).length;
  const otSinFechaTeorica=OTS.filter(o=>!o.ft).length;
  if(otSinActividad || otSinFechaTeorica){
    const partes=[];
    if(otSinActividad) partes.push(otSinActividad+' OT sin Actividad/Cultivo');
    if(otSinFechaTeorica) partes.push(otSinFechaTeorica+' OT sin Fecha Teórica');
    const nTot=otSinActividad+otSinFechaTeorica;
    const sev = total_ot && (nTot/total_ot*100)>=RESUMEN_DATOS_INCOMPLETOS_PCT ? 'media' : 'informativa';
    RP.push({id:'missing_or_invalid_data', severidad:sev, titulo:'Datos incompletos en algunas OT',
      descripcion:partes.join(' · ')+'.', metrica:nTot+' OT', contexto:'Puede limitar la precisión de otros indicadores (avance, atrasos).',
      accion:null, destinoTab:null, impacto:nTot});
  }

  const SEV_ORDEN={critica:0,alta:1,media:2,informativa:3};
  RP.sort((a,b)=>(SEV_ORDEN[a.severidad]-SEV_ORDEN[b.severidad])||(b.impacto-a.impacto));

  const resumen = {
    // Solo los 3 KPIs operativos/financieros generales — las hectáreas planificadas/ejecutadas y
    // el avance general se retiraron de esta fila (ver "Detalle de Etapas por Cultivo" para esa
    // información, ahora desglosada por cultivo y por estadio en vez de un total de campaña).
    // "Gasto No Agrícola" (antes un 4to KPI acá) se retiró a pedido del usuario: mezclaba un
    // concepto parcial (solo Actividades operativas/no-agrícolas) con el resto del gasto sin dar
    // trazabilidad de a qué corresponde el resto. D.oper_costo/D.oper_part NO se tocan: los sigue
    // usando la sección "Gastos Operativos" (renderGastosOperativos, antes "Distribución del
    // Gasto: Áreas No Agrícolas").
    kpis:{
      otAtrasadas:totalAtrasadas, otConfirmadas:ot_conf,
      // Costo Ejecutado = consolidado de TODAS las campanias de consultaOT (ver
      // costo_total_consolidado), no solo la vigente. Misma definicion de siempre (importe de las OT
      // confirmadas), ampliada al resto de las campanias. Es el unico KPI de esta fila que sale de
      // la consolidacion: otConfirmadas/otAtrasadas siguen siendo de CAMPANIA_ACTUAL, igual que
      // antes, porque el pedido fue ampliar solo los costos de labores.
      costoEjecutado:costo_total_consolidado,
      costoPorCampania:costo_por_campania,
    },
    estadosOT:resumen_estadosOT,
    actividadMensual:resumen_actividadMensual,
    problemas:RP,
  };

  return {total_ot,ot_conf,ot_ejec:totalEnEjecucion,ot_pend:totalPendientes,costo_total,cultivos,operativas,oper_costo,oper_part,
    exceso,sinrtk,cancelados,exc_kpi,alertas:otsVisibles,n_ot_atrasadas:totalAtrasadas,
    auditoria_items,auditoria_metros,auditoria_puentes,auditoria_gastos,
    gastos,gasoil_sec,meses,gasto_total,gasoil_total,gasoil_litros_total,gmes,glit,
    labores,estadios_labor,contratistas_labor,
    // Solo para el filtro de Campaña del modulo Servicios (ver render.js: serviciosActivos()).
    campanias_ot,servicios_campanias,campania_actual:CAMPANIA_ACTUAL,
    // Costo ejecutado consolidado de todas las campanias + su desglose (KPI del Resumen Ejecutivo).
    costo_total_consolidado,costo_por_campania,
    combustible,combustible_litros_total,combustible_n_total,combustible_meses,combustible_terceros,
    combustible_ingresos,combustible_ingresos_litros_total,combustible_ingresos_n_total,
    combustible_existencia_inicial,stock_inicial_combustible,
    insumos_ingreso,insumos_consumo,insumos_meses,insumos_tipos,insumos_por_tipo,
    insumos_stock_flujo,insumos_ingreso_mensual,insumos_consumo_mensual,
    insumos_pendiente_modulo:otrosInsumos||[],
    // Filas excluidas del módulo Insumos (hoy solo "Afrecho de Arroz - CH", ver INSUMOS_EXCLUIDOS
    // en config.js) — se conservan crudas acá solo para trazabilidad, ningún render.js las lee.
    insumos_excluidos:insumosExcluidosRaw||[],
    // OT de trabajo por hectareas (avance del Resumen Ejecutivo) sin Has. Reales válido — quedan
    // fuera del cálculo de avance; se conservan acá solo para trazabilidad/depuración.
    avance_inconsistencias:avanceInconsistencias,
    resumen,
    fecha_datos:HOY};
}
