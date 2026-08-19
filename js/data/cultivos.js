// ================== DATOS · CULTIVOS, PLAN RTK Y CONTROL DE HECTÁREAS ==================
// Todo lo que compara la ejecucion contra el plan RTK de consultaCultivos: el plan en si, el
// avance de campo por cultivo y etapa (Resumen Ejecutivo) y el Control de Hectareas.

// Construye el plan RTK (hectareas planificadas por cultivo y lote) desde consultaCultivos.
function construirPlanRTK(proyecciones){
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
  return {RTK,RTK_TOT};
}

// Avance de campo por cultivo y etapa. Devuelve tambien las dos colecciones de trazabilidad que
// el avance deja de lado (OT sin Has. Reales validas, y trabajos del estadio Siembra que no son
// sembrar) — se exponen en D pero ningun render las lee.
function construirCultivos(OTS, RTK, RTK_TOT){
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
  // Trabajos cargados en el Estadio "Siembra" que no son la siembra en si (hoy, tratamiento de
  // semillas — ver SIEMBRA_SERVICIOS_NO_SIEMBRA en config.js). Quedan fuera del avance de Siembra
  // pero NO se pierden: sus costos, su conteo de OT y su presencia en Servicios/Insumos siguen
  // exactamente igual, solo dejan de acreditar superficie sembrada.
  const siembraExcluidas=[];
  function esAvanceDeSiembraValido(o){
    if(normEstadio(o.estadio)!=='siembra') return true;   // otros estadios no se tocan
    const serv=normHdr(o.serv);
    if(!SIEMBRA_SERVICIOS_NO_SIEMBRA.some(p=>serv.startsWith(p))) return true;
    siembraExcluidas.push({ot:o.ot,lote:o.lote,servicio:o.serv});
    return false;
  }
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
    // esAvanceDeSiembraValido saca del avance los trabajos que estan en el Estadio "Siembra" pero
    // no son sembrar (tratamiento de semillas). Se aplica aca, sobre confOT, para que valga a la vez
    // para los lotes que cuentan como iniciados (etMap) y para las hectareas (porLoteEstadioLabor):
    // si no, un lote con la semilla tratada figuraba con la etapa Siembra empezada.
    const confOT = sub.filter(o=>o.estado==='Confirmado' && ETAPA_ORDEN.includes(normEstadio(o.estadio))
      && esAvanceDeSiembraValido(o));
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
    // ---- Actividades "PARCELA <cultivo>" -> Preparacion de Suelo de ESE cultivo ----
    // En consultaOT existen actividades propias tipo "PARCELA ARROZ" / "PARCELA SOJA" / "PARCELA
    // SORGO" / "PARCELA MAIZ", que hasta ahora quedaban fuera del avance porque `sub` exige
    // actividad === cultivo exacto. Son trabajos generales sobre parcelas del cultivo (limpieza o
    // desinfeccion de valos con avion, desecacion, etc.) que pueden afectar varias parcelas a la vez,
    // asi que NO tienen una superficie planificada propia: en el plan RTK figuran con 0,01 ha (el
    // mismo marcador de lote sin plan) y encima ni entran a RTK, porque el parseo de consultaCultivos
    // exige un lote de una sola palabra. Por eso, y a diferencia de las labores normales:
    //   - sus Has. Reales se toman como ejecucion, SIN capar por el plan de su propio lote (capar
    //     contra 0,01 ha las dejaria aportando 0,00 y no se veria nada);
    //   - el tope se aplica al final contra las hectareas planificadas del CULTIVO, de modo que
    //     Preparacion de Suelo nunca pueda pasar del 100% (ver el Math.min de `etapas` abajo).
    // Las labores normales siguen controladas por lote exactamente como antes: esta excepcion vale
    // solo para las actividades PARCELA.
    // La relacion PARCELA+cultivo se detecta por los tokens de la actividad (no por una lista literal
    // de nombres): primera palabra "PARCELA" y el nombre del cultivo entre las demas, sin acentos ni
    // sensibilidad a mayusculas — asi tolera variantes de carga ("PARCELA DE SORGO", "Parcela Maiz").
    const K_PREP = ETAPA_ORDEN[0]; // 'preparacion de suelo'
    const actTokens = s => stripAccents(String(s||'')).toUpperCase().replace(/\s+/g,' ').trim().split(' ');
    const esParcelaDelCultivo = o => { const t=actTokens(o.act); return t[0]==='PARCELA' && t.includes(c); };
    // Mismos requisitos que las labores normales: OT Confirmada, modalidad hectareas y Has. Reales
    // validas. Las OT por horas o de solo insumo no aportan superficie, igual que en el resto.
    const parcelaPorLabor={};
    OTS.filter(o=>o.estado==='Confirmado' && esParcelaDelCultivo(o)).forEach(o=>{
      if(o.modalidad!=='hectareas') return;
      if(o.ha==null){ avanceInconsistencias.push({ot:o.ot,cultivo:c,lote:o.lote,estadio:o.estadio,motivo:'OT de PARCELA por hectareas sin Has. Reales'}); return; }
      const laborKey=normHdr(o.serv)||'(sin labor)';
      parcelaPorLabor[laborKey]=(parcelaPorLabor[laborKey]||0)+o.ha;
    });
    // Promedio entre labores, nunca suma: dos labores distintas sobre la parcela son dos pasadas
    // sobre la misma superficie, mismo criterio que equivalenteLoteEstadio usa para los lotes.
    const parcelaValores=Object.values(parcelaPorLabor);
    const ha_parcela = parcelaValores.length ? parcelaValores.reduce((a,b)=>a+b,0)/parcelaValores.length : 0;
    // Si el cultivo tiene ejecucion de PARCELA pero ninguna OT normal en Preparacion de Suelo, la
    // etapa igual debe existir para poder mostrarla (hoy no ocurre, pero deja el caso cubierto).
    if(ha_parcela>0 && !etMap[K_PREP]) etMap[K_PREP]={nombre:ETAPA_LABEL[K_PREP],lotes:new Set()};

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
      // Excepcion PARCELA (solo Preparacion de Suelo, ver ha_parcela mas arriba): se suma su
      // ejecucion y el TOTAL de la etapa se capa a las hectareas planificadas del cultivo, para que
      // no pueda pasar del 100%. Sin plan (ha_plan=0) no hay contra qué capar y el avance ya sale
      // null, asi que se suma sin tope.
      if(k===K_PREP && ha_parcela>0) ha_e = ha_plan>0 ? Math.min(ha_e+ha_parcela, ha_plan) : ha_e+ha_parcela;
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
  if(siembraExcluidas.length) console.log('Avance de campo: '+siembraExcluidas.length+' OT del estadio Siembra excluidas del avance por no ser siembra ('+[...new Set(siembraExcluidas.map(x=>x.servicio))].join(', ')+') — ver D.siembra_excluidas.');
  return {cultivos,avanceInconsistencias,siembraExcluidas};
}

// Control de Hectareas: lotes con exceso de superficie, lotes inhabilitados y OT sin
// correspondencia en el plan RTK.
function construirControlHectareas(OTS, RTK){
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
  return {exceso,sinrtk,cancelados,exc_kpi};
}
