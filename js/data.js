// ================== BUILD DATA ==================
function buildData(raw, proyecciones, insumos, presupuestoInfra){
  const { combustible: combustibleRaw, existenciaInicial, otros: otrosInsumos } = insumos || {};
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
  // Filtro de campania: consultaOT trae TODAS las campanias (25/26, 26/27, 26, 25 mezcladas,
  // crecio de ~1200 a ~7300 filas al incluir la campania anterior completa). Solo entra la
  // campania vigente (CAMPANIA_ACTUAL). Sin este filtro, todos los KPIs/cultivos/hectareas/
  // alertas quedarian inflados con datos de la campania 25/26.
  const n_ot_total_sin_filtrar = raw.length;
  raw = raw.filter(row => String(row['campania']||'').trim() === CAMPANIA_ACTUAL);
  console.log('consultaOT: '+raw.length+' de '+n_ot_total_sin_filtrar+' filas son de la campaña '+CAMPANIA_ACTUAL+' (resto descartado).');
  const rows = raw.map(r=>({
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
    tipo:String(keyOf(r,['tipoItem','Tipo de Item'])||'').trim(),
    contr:String(keyOf(r,['contratista','Contratista'])||'').trim(),
    personal:String(keyOf(r,['personal','Personal'])||'').trim(),
    insumo:String(keyOf(r,['insumo','Insumo'])||'').trim(),
    unidad:String(keyOf(r,['unidadMedida','Unidad de medida'])||'').trim(),
    obs:String(keyOf(r,['observaciones','Observación','Observacion'])||'').trim(),
  })).filter(r=>r.ot && r.ot!=='undefined' && r.ot!=='nan');
  rows.forEach(r=>{ r.imp=r.ud*r.pu; r.esHoras=r.unidad.toLowerCase()==='horas'; });
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

  // group by OT
  const otMap={};
  rows.forEach(r=>{ (otMap[r.ot]=otMap[r.ot]||[]).push(r); });
  const OTS = Object.keys(otMap).map(id=>{
    const g=otMap[id], r0=g[0];
    const has=g.map(x=>x.hr).filter(x=>x!=null);
    return { ot:id, act:r0.act, lote:r0.lote, estadio:r0.estadio, serv:r0.serv, estado:r0.estado,
      ft:r0.ft, fr:r0.fr, tieneServ: r0.serv!=='' && r0.serv.toLowerCase()!=='nan',
      contr:r0.contr, personal:r0.personal,
      ha: has.length?Math.max.apply(null,has):null,
      horas: g.filter(x=>x.esHoras).reduce((s,x)=>s+x.ud,0),
      imp: g.reduce((s,x)=>s+x.imp,0),
      propia: g.filter(x=>x.tipo==='Labor Propia').reduce((s,x)=>s+x.imp,0),
      propia_ud: g.filter(x=>x.tipo==='Labor Propia').reduce((s,x)=>s+x.ud,0),
      tercero: g.filter(x=>x.tipo==='Labor Tercero').reduce((s,x)=>s+x.imp,0),
      insumos: g.filter(x=>x.tipo==='Insumo').reduce((s,x)=>s+x.imp,0),
      lines: g };
  });
  const CONF = OTS.filter(o=>o.estado==='Confirmado');
  const isPrep = s => String(s).trim().toLowerCase().startsWith('preparacion de suelo');

  // ---- KPIs OT ----
  const total_ot=OTS.length, ot_conf=CONF.length,
    ot_ejec=OTS.filter(o=>o.estado==='En Ejecución').length,
    ot_pend=OTS.filter(o=>o.estado==='Pendiente').length;
  const costo_total=CONF.reduce((s,o)=>s+o.imp,0);

  // ---- CULTIVOS ----
  const cultivos=CULTIVOS.map(c=>{
    const sub=OTS.filter(o=>o.act.toUpperCase()===c);
    if(!sub.length) return null;
    const conf=sub.filter(o=>o.estado==='Confirmado').length,
      ejec=sub.filter(o=>o.estado==='En Ejecución').length,
      pend=sub.filter(o=>o.estado==='Pendiente').length;
    const costo=sub.filter(o=>o.estado==='Confirmado').reduce((s,o)=>s+o.imp,0);
    const ha_plan=RTK_TOT[c]||0;
    const lotConf=new Set(sub.filter(o=>o.estado==='Confirmado').map(o=>normLote(o.lote)));
    let ha_ejec=0; if(RTK[c]) lotConf.forEach(k=>{ if(k in RTK[c]) ha_ejec+=RTK[c][k]; });
    ha_ejec=Math.round(ha_ejec*100)/100;
    let av; if(ha_plan>0) av=Math.round(ha_ejec/ha_plan*1000)/10; else { const t=conf+ejec+pend; av=t?Math.round(conf/t*1000)/10:0; }

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
    const etapas=ETAPA_ORDEN.filter(k=>etMap[k]).map(k=>{
      const e=etMap[k];
      let ha_e=0; if(RTK[c]) e.lotes.forEach(l=>{ if(l in RTK[c]) ha_e+=RTK[c][l]; });
      ha_e=Math.round(ha_e*100)/100;
      const av_e = ha_plan>0 ? Math.round(ha_e/ha_plan*1000)/10 : null;
      return {nombre:e.nombre, ha_ejec:ha_e, avance:av_e, n_lotes:e.lotes.size};
    });
    const etapa_actual = etapas.length? etapas[etapas.length-1].nombre : null;

    return {nombre:c,ha_plan:Math.round(ha_plan*100)/100,ha_ejec,avance:av,tiene_rtk:ha_plan>0,conf,ejec,pend,costo,col:color(av),etapas,etapa_actual};
  }).filter(Boolean).sort((a,b)=>(b.ha_plan-a.ha_plan)||(b.costo-a.costo));

  // ---- OPERATIVAS ----
  const operativas=OPERATIVAS.map(c=>{
    const sub=OTS.filter(o=>o.act.toUpperCase()===c);
    if(!sub.length) return null;
    const costo=sub.filter(o=>o.estado==='Confirmado').reduce((s,o)=>s+o.imp,0);
    return {nombre:c,ot:sub.length,costo,part:costo_total?Math.round(costo/costo_total*1000)/10:0};
  }).filter(Boolean).sort((a,b)=>b.costo-a.costo);
  const oper_costo=operativas.reduce((s,o)=>s+o.costo,0);
  const oper_part=Math.round(operativas.reduce((s,o)=>s+o.part,0)*10)/10;

  // ---- CONTROL DE HECTÁREAS ----
  const RTK_CROPS=['ARROZ','SOJA','SORGO','MAIZ'];
  const land=OTS.filter(o=>!(o.lines.every(l=>l.esHoras)) && RTK_CROPS.includes(o.act.toUpperCase()) && o.ha!=null);
  const exceso=[], sinrtk=[];
  RTK_CROPS.forEach(c=>{
    const byLote={};
    land.filter(o=>o.act.toUpperCase()===c).forEach(o=>{ const k=normLote(o.lote); (byLote[k]=byLote[k]||[]).push(o); });
    for(const k in byLote){
      const g=byLote[k], ha_rtk=RTK[c]?RTK[c][k]:undefined;
      if(ha_rtk==null){ g.forEach(o=>sinrtk.push({ot:o.ot,cult:c,lote:o.lote,act:o.estadio||'-',serv:o.serv||'-',ha:o.ha,estado:o.estado})); continue; }
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
  const exc_kpi={n:exceso.length, ha:Math.round(exceso.reduce((s,e)=>s+e.diff,0)*100)/100,
    mayor:Math.round(Math.max(0,...exceso.map(e=>e.diff))*100)/100, n_sinrtk:sinrtk.length};

  // ---- ALERTAS ----
  const nc=OTS.filter(o=>o.estado==='Pendiente'||o.estado==='En Ejecución');
  const atr=nc.filter(o=>o.ft && o.ft<HOY).map(o=>({ot:o.ot,cult:o.act,act:o.estadio||'-',serv:o.serv||'-',lote:o.lote,estado:o.estado,
      ft:o.ft, dias:Math.round((HOY-o.ft)/86400000)})).sort((a,b)=>b.dias-a.dias);
  const n_ot_atrasadas=atr.length, n_ejec_atraso=atr.filter(a=>a.estado==='En Ejecución').length;

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

  // ---- Sección 2: Gastos (trabajos medidos en Horas o Litros, no en Unidades) ----
  // El nombre de "trabajo" en esta tabla es siempre el valor real del campo Servicio de la OT
  // (nunca una descripción inventada) — a pedido del usuario, para que coincida 1 a 1 con lo que
  // se ve en consultaOT. Cuando el Servicio viene vacío en la OT (pasa seguido en las filas de
  // Desalijo), esas filas se agrupan aparte como "(Sin Servicio)" en vez de inventarles un nombre.
  // "Construcción de puentes x horas": Servicio distinto de los dos de Puentes por Unidad (esos
  // son por Unidad) — existe medido en Horas: "Construccion de Puentes retro excavadora x Hs"
  // (Labor Tercero).
  const auditoriaServiciosUsados = new Set([
    ...infraServiciosMapeados,
    INFRA_PUENTES_TERCERO_SERV, INFRA_PUENTES_PROPIA_SERV, INFRA_PUENTES_HORAS_SERV,
  ]);
  const puentesHorasOT = rows.filter(r=>r.serv===INFRA_PUENTES_HORAS_SERV);
  // "Desalijos": no está en el presupuesto ni fue pedido antes — se buscó "desalijo"/"desalij" en
  // Servicio y Observación (para descartar que en realidad fuera "desmonte": ese texto literal
  // solo aparece 2 veces, ya contabilizadas en "Contrucion camino nuevo", así que NO se mezcla
  // acá). Se separan en 2 grupos según lo que describe la Observación (a pedido del usuario, en
  // vez de una sola fila combinada como antes): descarga de silo bolsa de arroz ("Desalijo Silo
  // Bolsa...") vs desmalezado/despeje de palmera "karanda'y"/"carandai" — EXCEPTO las filas que ya
  // tienen un Servicio contado en otra sección de Auditoría (ej. OT 3884, Servicio="Cerrar camino
  // retro excavadora x Hs", cuya Observación menciona "Desalijo de carandai" de pasada: esa OT ya
  // suma sus horas en "Reparacion de camino"; incluirla también acá la contaba dos veces).
  const desalijoOT = rows.filter(r=>
    (normEstadio(r.serv).includes('desalij') || normEstadio(r.obs).includes('desalij'))
    && !auditoriaServiciosUsados.has(r.serv));
  const desalijoSiloBolsaOT = desalijoOT.filter(r=>normEstadio(r.obs).includes('silo'));
  const desalijoKarandayOT = desalijoOT.filter(r=>!normEstadio(r.obs).includes('silo'));
  function gastoDeOTs(sub){
    const horas = Math.round(sub.filter(r=>r.esHoras).reduce((s,r)=>s+r.ud,0)*100)/100;
    const litros = Math.round(sub.filter(r=>r.unidad.toLowerCase()==='litros').reduce((s,r)=>s+r.ud,0)*100)/100;
    const costo = Math.round(sub.reduce((s,r)=>s+r.cl+r.ci,0)*100)/100;
    const nOT = new Set(sub.map(r=>r.ot)).size;
    const nConfirmadas = new Set(sub.filter(r=>r.estado==='Confirmado').map(r=>r.ot)).size;
    return {horas, litros, costo, nOT, nConfirmadas};
  }
  // Dentro de cada grupo de Desalijo, una fila por cada Servicio real distinto que aparece en la
  // OT; las filas sin Servicio se juntan en una única fila "(Sin Servicio)" al final del grupo.
  function filasPorServicioReal(sub, grupo){
    const porServicio = {};
    sub.forEach(r=>{ const key=r.serv||'(Sin Servicio)'; (porServicio[key]=porServicio[key]||[]).push(r); });
    return Object.keys(porServicio)
      .sort((a,b)=> (a==='(Sin Servicio)')-(b==='(Sin Servicio)') || a.localeCompare(b))
      .map(trabajo=>({grupo, trabajo, ...gastoDeOTs(porServicio[trabajo])}));
  }
  const auditoria_gastos = [
    {trabajo:INFRA_PUENTES_HORAS_SERV, ...gastoDeOTs(puentesHorasOT)},
    ...filasPorServicioReal(desalijoSiloBolsaOT, 'Desalijo Silo Bolsa'),
    ...filasPorServicioReal(desalijoKarandayOT, "Desalijo Karanda'y / Carandai"),
  ];

  // ---- GASTOS: detalle labores reales + gasoil por área ----
  const servOT=new Set(CONF.filter(o=>o.tieneServ).map(o=>o.ot));
  const detOT=CONF.filter(o=>servOT.has(o.ot));
  const gasOT=CONF.filter(o=>!servOT.has(o.ot));
  // detalle (mes,labor,etapa) — se incluye la etapa (Estadio) porque una misma labor puede
  // ejecutarse en más de una etapa del ciclo del cultivo a lo largo de la campaña.
  const dmap={};
  detOT.forEach(o=>{ const m=o.fr?o.fr.getMonth()+1:0; const est=o.estadio&&o.estadio.trim()?o.estadio.trim():'(Sin etapa)';
    const key=m+'|'+o.serv+'|'+est+'|'+(o.lines.every(l=>l.esHoras));
    if(!dmap[key]) dmap[key]={mesnum:m,labor:o.serv,estadio:est,esH:o.lines.every(l=>l.esHoras),n:0,ha:0,horas:0,propia:0,propia_ud:0,tercero:0,insumos:0};
    const d=dmap[key]; d.n++; d.ha+=(o.ha||0); d.horas+=o.horas; d.propia+=o.propia; d.propia_ud+=o.propia_ud; d.tercero+=o.tercero; d.insumos+=o.insumos; });
  const gastos=Object.values(dmap).map(d=>({...d,ha:Math.round(d.ha*100)/100,horas:Math.round(d.horas*100)/100,
    propia:Math.round(d.propia*100)/100,propia_ud:Math.round(d.propia_ud*100)/100,tercero:Math.round(d.tercero*100)/100,insumos:Math.round(d.insumos*100)/100}));
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
  const insumosRowsAll = (otrosInsumos||[]).map(rowRaw=>{
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

  const gasto_total=gastos.reduce((s,d)=>s+d.propia+d.tercero+d.insumos,0);
  const gasoil_total=gasOT.reduce((s,o)=>s+o.imp,0), gasoil_litros_total=gasOT.reduce((s,o)=>s+o.lines.reduce((a,l)=>a+l.ud,0),0);
  const gmes={}, glit={};
  gasOT.forEach(o=>{ const m=o.fr?o.fr.getMonth()+1:0; gmes[m]=(gmes[m]||0)+o.imp; glit[m]=(glit[m]||0)+o.lines.reduce((a,l)=>a+l.ud,0); });
  const meses=[...new Set([...gastos.map(d=>d.mesnum),...gasoil_sec.map(g=>g.mesnum)])].filter(m=>m>0).sort((a,b)=>a-b).map(m=>({k:m,lbl:MES[m]}));
  const labores=[...new Set(gastos.map(d=>d.labor))].sort((a,b)=>a.localeCompare(b,'es'));
  const estadios_labor=[...new Set(gastos.map(d=>d.estadio))].sort((a,b)=>a.localeCompare(b,'es'));

  // ---- PROBLEMAS (neutral, por categoría) ----
  const P=[]; const cd={}; cultivos.forEach(c=>cd[c.nombre]=c);
  ['MAIZ','SOJA','SORGO','ARROZ'].forEach(c=>{ const o=cd[c]; if(o&&o.tiene_rtk&&o.avance<80)
    P.push({cat:'Avance',titulo:c.charAt(0)+c.slice(1).toLowerCase()+': avance '+Math.round(o.avance)+'% del plan',
      met:fmt(o.ha_ejec)+' / '+fmt(o.ha_plan)+' ha',desc:'Ejecutadas '+fmt(o.ha_ejec)+' ha de '+fmt(o.ha_plan)+' planificadas en RTK. '+(o.pend+o.ejec)+' OT sin confirmar.'}); });
  P.push({cat:'Hectáreas',titulo:exc_kpi.n+' lotes con superficie ejecutada mayor a la planificada',met:'+'+fmt2(exc_kpi.ha)+' ha en exceso',
    desc:'La superficie cargada en OT supera el RTK (mayor caso +'+fmt2(exc_kpi.mayor)+' ha). Posible error de carga que distorsiona costos por hectárea.'});
  P.push({cat:'Controles',titulo:sinrtk.length+' OT sin correspondencia en el plan RTK',met:sinrtk.length+' OT',
    desc:'Órdenes cargadas en lotes que no existen en la planificación RTK. Requieren revisión de nomenclatura o alta de superficie.'});
  const terc=CONF.reduce((s,o)=>s+o.tercero,0), prop=CONF.reduce((s,o)=>s+o.propia,0);
  P.push({cat:'Gastos',titulo:'El 100% del costo de labor corresponde a terceros',met:'US$ '+fmtUSD(terc),
    desc:'No se registra costo de labor propia (US$ '+fmtUSD(prop)+'). Impide comparar el uso de maquinaria propia vs contratada y controlar el gasto tercerizado.'});
  P.push({cat:'Gastos',titulo:'Actividades no agrícolas concentran el '+Math.round(oper_part)+'% del gasto',met:'US$ '+fmtUSD(oper_costo),
    desc:'Operativos, parcelas de ensayo, infraestructura y cuidados suman US$ '+fmtUSD(oper_costo)+' de gasto ejecutado que no corresponde a producción de cultivos.'});
  const disco=gastos.filter(d=>/^[12]° Disco$/.test(d.labor)).reduce((s,d)=>s+d.propia+d.tercero+d.insumos,0);
  if(disco>0) P.push({cat:'Gastos',titulo:'Alta concentración del gasto en preparación de suelo (disco)',met:'US$ '+fmtUSD(disco)+' · '+Math.round(disco/costo_total*100)+'%',
    desc:'1° y 2° Disco representan el '+Math.round(disco/costo_total*100)+'% del gasto ejecutado de campaña.'});
  const catord={'Avance':0,'Gastos':1,'Hectáreas':2,'Controles':3};
  P.sort((a,b)=>(catord[a.cat]-catord[b.cat])||(a.titulo<b.titulo?-1:1));

  return {total_ot,ot_conf,ot_ejec,ot_pend,costo_total,cultivos,operativas,oper_costo,oper_part,
    exceso,sinrtk,exc_kpi,alertas:atr,n_ot_atrasadas,n_ejec_atraso,
    auditoria_items,auditoria_metros,auditoria_puentes,auditoria_gastos,
    gastos,gasoil_sec,meses,gasto_total,gasoil_total,gasoil_litros_total,gmes,glit,
    labores,estadios_labor,
    combustible,combustible_litros_total,combustible_n_total,combustible_meses,combustible_terceros,
    combustible_ingresos,combustible_ingresos_litros_total,combustible_ingresos_n_total,
    combustible_existencia_inicial,stock_inicial_combustible,
    insumos_ingreso,insumos_consumo,insumos_meses,insumos_tipos,insumos_por_tipo,
    insumos_stock_flujo,insumos_ingreso_mensual,insumos_consumo_mensual,
    insumos_pendiente_modulo:otrosInsumos||[],
    problemas:P,
    fecha_datos:HOY,
    avance_glob:Math.round(ot_conf/total_ot*100)};
}
