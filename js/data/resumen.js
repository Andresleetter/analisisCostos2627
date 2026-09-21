// ================== DATOS · RESUMEN EJECUTIVO ==================
// Alimenta exclusivamente la pestaña Resumen Ejecutivo. Se calcula UNA sola vez aca (no en
// render.js) y SIEMPRE reutiliza colecciones ya construidas por los demas dominios — nunca se
// vuelve a recorrer OTS/rows desde cero.

// Gastos Operativos: costo de las OT confirmadas de las actividades no agricolas de OPERATIVAS.
function construirOperativas(OTS, costo_total){
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
  return {operativas,oper_costo,oper_part};
}

function construirResumen(ctx){
  const {OTS,CONF,rows,cultivos,operativas,gastos,exceso,sinrtk,exc_kpi,otsAtrasadas,
    totalAtrasadas,total_ot,ot_conf,costo_total,costo_total_consolidado,costo_por_campania,
    oper_costo,oper_part,TOLERANCIA_ATRASO_DIAS} = ctx;
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
    // La severidad sale del PORCENTAJE del peor lote, y el contexto nombra a ESE lote con sus dos
    // numeros propios (exc_kpi.peor, ver cultivos.js). Antes el texto tomaba las hectareas del lote
    // que mas hectareas excedia y el porcentaje del que mas porcentaje excedia: eran dos lotes
    // distintos y la frase describia uno que no existe.
    const peor = exc_kpi.peor;
    const pctMayor = peor ? peor.pdiff : 0;
    const sev = pctMayor>=RESUMEN_SOBREEJECUCION_CRITICA?'critica':(pctMayor>=RESUMEN_SOBREEJECUCION_ALTA?'alta':'media');
    RP.push({id:'crop_overexecution', severidad:sev, titulo:'Superficie ejecutada superior al plan',
      descripcion:exc_kpi.n+' lote(s) con hectáreas ejecutadas por encima de lo planificado (RTK).',
      metrica:'+'+fmt2(exc_kpi.ha)+' ha',
      contexto: peor ? 'Mayor caso: '+peor.cult+' '+peor.lote+' · +'+fmt2(peor.diff)+' ha sobre '+fmt2(peor.ha_rtk)+' (+'+Math.round(peor.pdiff)+'%)' : '',
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
      // Costo Ejecutado = importe de las OT confirmadas DE ESTA campania, la misma que produjo
      // otConfirmadas y otAtrasadas. Antes salia de costo_total_consolidado (la suma de todas las
      // campanias de consultaOT), pero desde que el Resumen Ejecutivo tiene su propio selector de
      // Campaña ese numero mezclaba campanias dentro de una vista que representa una sola: con el
      // selector en 25/26 el costo seguia siendo el de todas juntas. costo_total_consolidado y
      // costo_por_campania se siguen calculando y exponiendo en D para quien los necesite; este KPI
      // ya no los usa. costoPorCampania queda acá como contexto del desglose, sin sumarse.
      costoEjecutado:costo_total,
      costoPorCampania:costo_por_campania,
    },
    estadosOT:resumen_estadosOT,
    actividadMensual:resumen_actividadMensual,
    problemas:RP,
  };
  return resumen;
}

// ================== RESUMEN EJECUTIVO POR CAMPAÑA ==================
// El Resumen Ejecutivo (y la vista Avance Detallado que cuelga de el) tienen su propio selector de
// Campaña, independiente del resto del dashboard. Aca se arma UN paquete completo por cada campania
// presente en consultaOT, con todo lo que esas dos vistas leen, para que cambiar el selector sea
// elegir un paquete ya calculado y no recalcular nada en render.js.
//
// Mismo patron que construirServiciosPorCampania (servicios.js): la campania vigente NO se
// recalcula — se le pasa el paquete que buildData() ya armo con las colecciones de siempre, asi que
// 26/27 da exactamente los mismos numeros que antes. Las demas campanias se derivan con las MISMAS
// funciones (normalizarFilasOT -> agruparOTS -> construirCultivos/construirOperativas/...), nunca
// con una segunda implementacion en paralelo.
//
// Alcance: estos paquetes los leen SOLO el Resumen Ejecutivo y el Avance Detallado. Servicios,
// Combustible, Insumos, Control de Hectareas, Alertas Operativas y Auditoria siguen consumiendo
// D.exceso / D.alertas / D.gastos / etc., recortados a CAMPANIA_ACTUAL, sin ninguna modificacion.
// Por eso el paquete incluye su PROPIO control de hectareas y sus PROPIAS alertas: los necesitan las
// reglas de Posibles Problemas, y calcularlos aca evita tocar los que consumen esos modulos.
function construirPaqueteResumen(campania, OTS, RTK, RTK_TOT, SERV){
  const CONF = OTS.filter(o=>o.estado==='Confirmado');
  const total_ot = OTS.length, ot_conf = CONF.length;
  const costo_total = CONF.reduce((s,o)=>s+o.imp,0);
  // Padron fisico comun: consultaCultivos trae un solo juego de lotes (verificado contra el dato,
  // sus 277 filas son todas 26/27) y se reutiliza tal cual para todas las campanias. No se duplica
  // superficie: es el MISMO objeto RTK/RTK_TOT que ya construyo buildData(), no una copia por
  // campania. Una campania sin OT sobre un lote simplemente da 0 ha ejecutadas ahi.
  const {cultivos} = construirCultivos(OTS, RTK, RTK_TOT);
  const {exceso,sinrtk,exc_kpi} = construirControlHectareas(OTS, RTK);
  const {otsAtrasadas,totalAtrasadas,TOLERANCIA_ATRASO_DIAS} = construirAlertas(OTS);
  const {operativas,oper_costo,oper_part} = construirOperativas(OTS, costo_total);
  const resumen = construirResumen({OTS,CONF,cultivos,operativas,gastos:SERV?SERV.gastos:[],
    exceso,sinrtk,exc_kpi,otsAtrasadas,totalAtrasadas,total_ot,ot_conf,costo_total,
    oper_costo,oper_part,TOLERANCIA_ATRASO_DIAS});
  return {campania,total_ot,ot_conf,costo_total,cultivos,operativas,oper_costo,oper_part,resumen};
}

// Un paquete por campania. `vigente` es el de CAMPANIA_ACTUAL, ya armado por buildData() con las
// colecciones de siempre — se reusa tal cual, no se recalcula.
function construirResumenPorCampania(rawTodasCampanias, campanias_ot, RTK, RTK_TOT,
    servicios_campanias, vigente){
  const resumen_campanias = {};
  resumen_campanias[CAMPANIA_ACTUAL] = vigente;
  campanias_ot.forEach(c=>{
    if(c===CAMPANIA_ACTUAL) return;
    const OTS_c = agruparOTS(normalizarFilasOT(rawTodasCampanias.filter(row=>campaniaDeFila(row)===c)));
    // Cada campania se calcula con SUS propias OT y nada mas. Ninguna hereda ni presta OT a otra:
    // la siembra de Zafriña26 se ve en Zafriña26 y no en 26/27 (ver data.js).
    resumen_campanias[c] = construirPaqueteResumen(c, OTS_c, RTK, RTK_TOT, servicios_campanias[c]);
  });
  return resumen_campanias;
}
