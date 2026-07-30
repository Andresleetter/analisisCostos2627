// ================== RENDER ==================
function renderAll(){
  const fd=D.fecha_datos;
  const fdTxt=('0'+fd.getDate()).slice(-2)+'/'+('0'+(fd.getMonth()+1)).slice(-2)+'/'+fd.getFullYear();
  document.getElementById('t-date').textContent='Datos al '+fdTxt;
  document.getElementById('b-exc').textContent=D.exc_kpi.n;
  document.getElementById('b-al').textContent=D.n_ot_atrasadas;
  // TAB1: Resumen Ejecutivo (una función chica por bloque, ver detalle de cada una más abajo).
  // "Detalle de Etapas por Cultivo" es el primer bloque analítico tras los KPIs — los gráficos de
  // Avance General / Avance por Cultivo que iban antes se retiraron a pedido del usuario (ver
  // README.md). "Gastos Operativos" ocupa la MISMA posición que tenía el viejo panel
  // "Distribución del Gasto: Áreas No Agrícolas" (después de Actividad Mensual, antes de Posibles
  // Problemas) — a pedido del usuario, no se movió al reforzar su contenido.
  renderResumenKPIs();
  renderCultivoDetalle();
  renderEstadosOT();
  renderActividadMensual();
  renderGastosOperativos();
  renderProblemasResumen();
  // TAB3 control ha
  document.getElementById('ha-kpis').innerHTML=
    `<div class="kpi"><div class="k-lab">Lotes con Exceso</div><div class="k-val c-r">${D.exc_kpi.n}</div><div class="k-foot">Superficie ejecutada &gt; planificada</div></div>`+
    `<div class="kpi"><div class="k-lab">Ha Excedidas Acum.</div><div class="k-val c-r" style="font-size:22px">+${fmt2(D.exc_kpi.ha)}</div></div>`+
    `<div class="kpi"><div class="k-lab">Mayor Exceso</div><div class="k-val c-r" style="font-size:22px">+${fmt2(D.exc_kpi.mayor)} ha</div></div>`+
    `<div class="kpi"><div class="k-lab">OT Fuera de RTK</div><div class="k-val c-r">${D.exc_kpi.n_sinrtk}</div><div class="k-foot">Lote inexistente en plan</div></div>`;
  document.getElementById('exc-sub').textContent=D.exceso.length+' lotes · ordenado por mayor diferencia';
  let excHtml='';
  D.exceso.forEach(e=>{
    excHtml+=`<tr class="grp"><td>${e.cult}</td><td class="mono">${e.lote}</td><td class="tr">${fmt2(e.ha_rtk)}</td><td class="tr">${fmt2(e.ha_ot)}</td><td class="tr exd">+${fmt2(e.diff)}</td><td class="tr exd">+${Math.round(e.pdiff)}%</td></tr>`;
    excHtml+=`<tr class="dethead"><td colspan="6">OT que componen el lote · ${e.n_ot} OT (excl. labores por hora)</td></tr>`;
    e.dets.forEach(x=>{ const tag=x.over?'<span class="tag">superficie sobre RTK</span>':'';
      excHtml+=`<tr class="${x.over?'det-over':'det'}"><td class="dl mono">OT ${x.ot}</td><td>${x.act}</td><td colspan="2">${x.serv} ${tag}</td><td>${x.estado}</td><td class="tr ${x.over?'exd':''}">${fmt2(x.ha)} ha</td></tr>`; });
  });
  document.getElementById('exc').innerHTML=excHtml;
  document.getElementById('sinrtk-sub').textContent=D.sinrtk.length+' OT · el lote no existe en el plan RTK';
  document.getElementById('sinrtk').innerHTML=D.sinrtk.map(r=>
    `<tr><td class="mono">OT ${r.ot}</td><td>${r.cult}</td><td class="mono">${r.lote}</td><td>${r.act}</td><td>${r.serv}</td><td class="tr mono">${fmt2(r.ha)}</td><td>${r.estado}</td></tr>`).join('');
  renderAlertas();
  // filtro meses
  const sel=document.getElementById('gmes'); sel.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.meses.forEach(m=>{const o=document.createElement('option');o.value=m.k;o.textContent=m.lbl;sel.appendChild(o);});
  // filtros de Detalle por Labor (Labor / Etapa / Contratista) — opciones de toda la campaña, no
  // dependen del mes
  const selLab=document.getElementById('glabor'); selLab.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.labores.forEach(l=>{const o=document.createElement('option');o.value=l;o.textContent=l;selLab.appendChild(o);});
  const selEst=document.getElementById('gestadio'); selEst.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.estadios_labor.forEach(e=>{const o=document.createElement('option');o.value=e;o.textContent=e;selEst.appendChild(o);});
  const selCont=document.getElementById('gcontratista'); selCont.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.contratistas_labor.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=labelContratista(c);selCont.appendChild(o);});
  // filtros de la pestaña Combustible (Mes / Tercero)
  const selCMes=document.getElementById('cmes'); selCMes.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.combustible_meses.forEach(m=>{const o=document.createElement('option');o.value=m.k;o.textContent=m.lbl;selCMes.appendChild(o);});
  const selCTerc=document.getElementById('cterc'); selCTerc.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.combustible_terceros.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;selCTerc.appendChild(o);});
  // filtros de la pestaña Insumos (Mes / Tipo de Insumo, independientes de Combustible)
  const selIMes=document.getElementById('imes'); selIMes.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.insumos_meses.forEach(m=>{const o=document.createElement('option');o.value=m.k;o.textContent=m.lbl;selIMes.appendChild(o);});
  const selITipo=document.getElementById('itipo'); selITipo.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.insumos_tipos.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;selITipo.appendChild(o);});
  actualizarFiltroInsumo();
  document.getElementById('foot').innerHTML='Datos cargados automáticamente desde datosCampania2627.xlsx · solo OT confirmadas en importes · todo importe = Unidades/Dosis × Precio Unitario · litros = Unidades/Dosis · avance por Ha ejecutadas vs plan RTK · planificación desde consultaCultivos (clave de unión: cultivo=actividad + lote normalizado) · sin datos de rendimiento ni presupuesto · no se hallaron OT canceladas.<br>Desarrollos del Sur S.A. · Producción Agrícola-Ganadera · '+fdTxt;
  renderCombustible();
  renderG();
  renderInsumos();
  renderAuditoria();
}

// ================== RESUMEN EJECUTIVO ==================
// D.resumen.* ya viene calculado en buildData() (data.js) — acá solo se renderiza, sin recalcular
// nada. Una función chica por bloque visual (KPIs, avance general, avance por cultivo, estado de
// OT, actividad mensual, distribución del gasto, problemas), en el orden pedido por el usuario.

function kpiCard(lab,val,foot,col){
  return `<div class="kpi kpi-acc kpi-${col}"><div class="k-lab">${lab}</div><div class="k-val">${val}</div><div class="k-foot">${foot}</div></div>`;
}

// ---- 1. Estado general de la campaña: fila de KPIs operativos/financieros ----
// Las hectáreas planificadas/ejecutadas y el avance general se retiraron de esta fila a pedido
// del usuario — esa información vive ahora en "Detalle de Etapas por Cultivo" (por cultivo y por
// estadio, ver renderCultivoDetalle()), no como un total general de campaña.
function renderResumenKPIs(){
  const k=D.resumen.kpis;
  const atrasCol = k.otAtrasadas>0 ? (k.otAtrasadas>10?'r':'o') : 'g';
  document.getElementById('exec-kpis').innerHTML=[
    kpiCard('OT Confirmadas', k.otConfirmadas, 'de '+D.total_ot+' totales', 'g'),
    kpiCard('OT Atrasadas', k.otAtrasadas, 'Pendiente/En Ejecución vencidas', atrasCol),
    kpiCard('Costo Ejecutado', 'US$ '+fmtUSD(k.costoEjecutado), 'Solo OT confirmadas', 'gris'),
  ].join('');
}

// ---- 2. Ejecución operacional: estado de las OT (barra apilada + leyenda), categorías reales
// (ver D.resumen.estadosOT en data.js — "Otros" solo aparece si hay algún estado real distinto de
// los 3 conocidos, con el detalle de cuáles). ----
function renderEstadosOT(){
  const list=D.resumen.estadosOT;
  const cont=document.getElementById('resumen-estados-ot');
  document.getElementById('resumen-ot-sub').textContent=D.total_ot+' OT totales';
  if(!list.length){ cont.innerHTML='<div class="resumen-empty">Sin OT registradas.</div>'; return; }
  const ESTADO_COL={'Confirmado':'g','En Ejecución':'y','Pendiente':'o','Otros':'gris'};
  const bar=list.map(e=>`<div class="estbar-seg f-${ESTADO_COL[e.estado]||'gris'}" style="width:${e.pct}%" title="${e.estado}: ${e.n} (${e.pct}%)"></div>`).join('');
  const legend=list.map(e=>`<div class="estbar-leg"><span class="estbar-dot f-${ESTADO_COL[e.estado]||'gris'}"></span>${e.estado}<b>${e.n}</b><small>${e.pct}%</small>${e.detalle?` <span title="${e.detalle}">(?)</span>`:''}</div>`).join('');
  cont.innerHTML=`<div class="estbar-track">${bar}</div><div class="estbar-legend">${legend}</div>`;
}

// ---- 3b. Ejecución operacional: actividad por mes (OT confirmadas, Fecha Real) ----
function renderActividadMensual(){
  const list=D.resumen.actividadMensual;
  const cont=document.getElementById('resumen-actividad-mensual');
  if(!list.length){ cont.innerHTML='<div class="resumen-empty">Sin fechas válidas para graficar actividad mensual.</div>'; return; }
  const max=Math.max(1,...list.map(m=>m.otConfirmadas));
  cont.innerHTML=`<div class="colchart">${list.map(m=>{
    const h=Math.round(m.otConfirmadas/max*100);
    return `<div class="colchart-col"><div class="colchart-bar-wrap"><div class="colchart-bar" style="height:${h}%" title="${m.lbl}: ${m.otConfirmadas} OT confirmadas"></div></div>
      <div class="colchart-val">${m.otConfirmadas}</div><div class="colchart-lbl">${m.lbl}</div></div>`;
  }).join('')}</div><div class="colchart-note">OT confirmadas por mes (Fecha Real) — no representa hectáreas</div>`;
}

// ---- 4. Gastos Operativos: tarjeta con el total + una fila por categoría (nombre, barra,
// importe, %, OT y botón "Ver detalle" — sin tabla aparte, para no repetir la misma información
// dos veces). Reutiliza D.operativas/D.oper_costo/D.oper_part tal cual vienen calculados en
// data.js (única fuente de verdad) — acá solo se renderiza, nunca se recalcula un importe.
// `o.partOperativo` (% sobre el TOTAL OPERATIVO) es la base pedida para esta sección, distinta de
// `o.part` (% sobre el costo total de toda la campaña, que no se usa acá). El detalle expandible
// de cada categoría cuelga debajo de su propia fila (.opex-detail), nunca en un panel separado. ----
function renderGastosOperativos(){
  const list=D.operativas, total=D.oper_costo;
  const totalCont=document.getElementById('opex-total');
  const rowsCont=document.getElementById('opex-rows');
  const subCont=document.getElementById('opex-sub');
  // Sin gastos operativos para el alcance actual: total en cero, sin porcentajes inválidos
  // (NaN/Infinity), estado vacío explícito — nunca se oculta la sección entera.
  if(!list.length || total<=0){
    subCont.textContent='';
    totalCont.innerHTML=`<div class="ot-lab">Total Gastos Operativos</div><div class="ot-val">US$ 0,00</div>`;
    rowsCont.innerHTML='<div class="resumen-empty">Sin gastos operativos registrados</div>';
    return;
  }
  subCont.textContent=list.length+' categoría(s) · '+fmt1(D.oper_part)+'% del costo ejecutado de la campaña · ordenado por importe';
  totalCont.innerHTML=`<div class="ot-lab">Total Gastos Operativos</div><div class="ot-val">US$ ${fmtUSD(total)}</div><div class="ot-foot">US$ ${fmtUSD(D.costo_total)} de costo total ejecutado en la campaña</div>`;
  const max=Math.max(1,...list.map(o=>o.costo));
  rowsCont.innerHTML=list.map(o=>{
    const detalleHtml = o.detalle.length ? o.detalle.map(d=>
      `<tr><td>${d.servicio}</td><td>${labelContratista(d.contratista)}</td><td class="tr mono">${d.ot}</td><td class="tr mono">US$ ${fmtUSD(d.costo)}</td></tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:10px">Sin detalle disponible</td></tr>';
    return `<div class="opex-row">
      <div class="opex-row-main">
        <div class="opex-cat" title="${o.nombre}">${o.nombre}</div>
        <div class="opex-bar-track"><div class="opex-bar-fill" style="width:${(o.costo/max*100).toFixed(1)}%"></div></div>
        <div class="opex-amt">US$ ${fmtUSD(o.costo)}</div>
        <div class="opex-pct">${fmt1(o.partOperativo)}%</div>
        <div class="opex-ot">${o.otConfirmadas} OT</div>
        <button type="button" class="opex-toggle" aria-expanded="false" aria-label="Ver detalle de ${o.nombre}">Ver detalle</button>
      </div>
      <div class="opex-detail hidden"><table class="opex-detail-table"><thead><tr><th>Servicio</th><th>Contratista</th><th class="tr">OT</th><th class="tr">Importe</th></tr></thead><tbody>${detalleHtml}</tbody></table></div>
    </div>`;
  }).join('');
}

// ---- 5. Posibles problemas en la campaña: tarjetas de alerta por severidad (ver reglas y orden
// en data.js). "Ver detalle" usa data-tab + delegación de evento en events.js (reutiliza show(),
// nunca onclick inline). Sin problemas => estado positivo explícito, nunca la sección vacía. ----
function renderProblemasResumen(){
  const list=D.resumen.problemas;
  document.getElementById('prob-n').textContent=list.length;
  document.getElementById('b-prob').textContent=list.length;
  const cont=document.getElementById('probs');
  if(!list.length){
    cont.innerHTML='<div class="prob prob-ok"><div class="p-left"><div class="p-title">No se detectaron problemas relevantes con las reglas actuales.</div></div></div>';
    return;
  }
  cont.innerHTML=list.map(p=>{
    const col=colorSeveridad(p.severidad);
    const accion=(p.accion && p.destinoTab!=null)?`<button type="button" class="prob-link" data-tab="${p.destinoTab}">${p.accion}</button>`:'';
    return `<div class="prob prob-${col}"><div class="p-left"><div class="p-tags"><span class="p-cat f-${col}">${labelSeveridad(p.severidad)}</span></div>
      <div class="p-title">${p.titulo}</div><div class="p-desc">${p.descripcion}</div>
      ${p.contexto?`<div class="p-ctx">${p.contexto}</div>`:''}${accion}</div>
      <div class="p-met">${p.metrica}</div></div>`;
  }).join('');
}

// ---- Detalle de Etapas por Cultivo: primer bloque analítico tras los KPIs (Preparación de
// Suelo, Siembra, Cuidados, Cosecha por cada cultivo). ----
function renderCultivoDetalle(){
  document.getElementById('cults').innerHTML=D.cultivos.map(c=>{
    const plan=c.tiene_rtk?fmt2(c.ha_plan)+' ha':'s/ RTK';
    const etapasHtml = c.etapas.length ? c.etapas.map(e=>{
      const col = e.avance==null ? 'o' : color(e.avance);
      const val = e.avance!=null ? Math.round(e.avance)+'%' : e.n_lotes+' lotes';
      const w = e.avance!=null ? Math.min(e.avance,100) : 0;
      return `<div class="et-row"><div class="et-lbl">${e.nombre}</div>
        <div class="bar et-bar"><div class="bar-fill f-${col}" style="width:${w}%"></div></div>
        <div class="et-val c-${col}">${val}</div></div>`;
    }).join('') : '<div class="et-empty">Sin etapa registrada en OT confirmadas</div>';
    // Ha Ejecutadas y OT Confirmadas/Totales corresponden SIEMPRE al mismo estadio que "Etapa
    // actual" (el más reciente con actividad confirmada, último elemento de c.etapas) — nunca se
    // mezclan con otro estadio. Sin ninguna etapa reconocida todavía (etapa_actual=null) no hay un
    // estadio al que referirlos: se muestran en 0 ha / 0 de las OT totales del cultivo, consistente
    // con el mensaje "Sin actividad confirmada aún" de arriba.
    const ultimaEtapa = c.etapas.length ? c.etapas[c.etapas.length-1] : null;
    const haEjec = fmt2(ultimaEtapa ? ultimaEtapa.ha_ejec : 0)+' ha';
    const otTexto = ultimaEtapa ? ultimaEtapa.otConfirmadas+' / '+ultimaEtapa.otTotales : '0 / '+(c.conf+c.ejec+c.pend);
    return `<div class="cult-card">
      <div class="cc-name">${c.nombre}</div>
      ${c.etapa_actual?`<div class="cc-stage">Etapa actual: <b>${c.etapa_actual}</b></div>`:'<div class="cc-stage cc-stage-muted">Sin actividad confirmada aún</div>'}
      <div class="cc-etapas">${etapasHtml}</div>
      <div class="cc-ha">
        <div><span>Ha planificadas</span><b>${plan}</b></div>
        <div><span>Ha ejecutadas</span><b>${haEjec}</b></div>
        <div><span>OT conf. / total</span><b>${otTexto}</b></div>
      </div></div>`;}).join('');
}

// ---- Auditoría: Presupuesto de Infraestructura vs ejecución real ----
// D.auditoria_* ya viene cruzado (INFRA_MAP y constantes de puentes en config.js) entre
// Especificación del presupuesto y Servicio real de OT — acá solo se renderiza, sin recalcular
// nada. Items sin ninguna OT que matchee (tieneOT=false) se muestran igual, con 0 en todo, para
// dejar en evidencia cuáles del presupuesto todavía no tienen ejecución cargada (o cargada con
// otro nombre).
function renderAuditoria(){
  // Puentes por Unidad: Tercero (CONSTRUCCION PUENTE AGROVIAL) y Propia (CONSTRUCCION PUENTES
  // LABOR PROPIA) — Ejecutadas = OT Confirmadas con ese Servicio exacto, no "En Ejecución".
  document.getElementById('audit-puentes').innerHTML = D.auditoria_puentes.map(p=>
    `<tr><td>${p.tipo}</td><td class="tr mono">${fmt2(p.presupuestado)}</td><td class="tr mono">${p.ejecutadas}</td><td class="tr mono">${p.avance!=null?fmt1(p.avance)+'%':'N/D'}</td></tr>`
  ).join('');

  // Gastos: un único concepto, "Desalijo Karanda'y / Carandai" (AUDITORIA_GASTO_DESALIJO,
  // config.js) — ver nota en data.js sobre el criterio de coincidencia (concepto puntual dentro
  // de Servicio/Observación, no la frase completa ni la palabra "desalijo" sola). Si nOT===0 (sin
  // ninguna OT que coincida) se muestra el estado vacío explícito en vez de una fila con puros
  // ceros silenciosos, y nunca se completa con otro trabajo para evitar dejarla vacía.
  document.getElementById('audit-gastos-sub').textContent = 'Costo = Costo Labor + Costo Insumo de esas OT (cuando está disponible)';
  document.getElementById('audit-gastos').innerHTML = D.auditoria_gastos.map(g=>
    g.nOT
      ? `<tr><td>${g.trabajo}</td><td class="tr mono">${g.horas?fmt2(g.horas):'-'}</td><td class="tr mono">${g.litros?fmt2(g.litros):'-'}</td><td class="tr mono">US$ ${fmtUSD(g.costo)}</td><td class="tr mono">${g.nOT} (${g.nConfirmadas} conf.)</td></tr>`
      : `<tr><td>${g.trabajo}</td><td class="tr mono">0,00</td><td class="tr mono">0,00</td><td class="tr mono">US$ 0,00</td><td class="tr" style="color:var(--muted)">Sin ejecución registrada</td></tr>`
  ).join('');

  document.getElementById('audit-items').innerHTML = D.auditoria_items.map(i=>
    `<tr${i.tieneOT?'':' style="color:var(--muted)"'}><td>${i.especificacion}</td><td>${i.unidadMedida||'-'}</td><td class="tr mono">${i.cantidadPresupuestada?fmt2(i.cantidadPresupuestada):'-'}</td><td class="tr mono">${fmt2(i.horas)}</td><td class="tr mono">${i.otPropia}</td><td class="tr mono">${i.otTercero}</td></tr>`
  ).join('');
  document.getElementById('audit-metros').innerHTML = D.auditoria_metros.length ? D.auditoria_metros.map(i=>
    `<tr><td>${i.especificacion}</td><td class="tr mono">${fmt2(i.metrosPresupuestados)}</td><td class="tr mono">${i.otConfirmadas} OT confirmadas <span style="color:var(--muted);font-size:10.5px">(aprox., no metros reales)</span></td><td class="tr" style="color:var(--muted)">N/D — sin metraje real en OT</td></tr>`
  ).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">Sin ítems presupuestados en Metros</td></tr>';
}

// ---- Alertas Operacionales: filtro por Estado (Pendiente / En Ejecución / Todas) ----
function renderAlertas(){
  const estV = document.getElementById('aestado').value;
  // `alertas` es la TABLA COMPLETA: TODAS las OT Pendiente/En Ejecución (D.alertas = otsVisibles,
  // ver data.js), atrasadas o no — a pedido del usuario, el KPI "OT Atrasadas" ya cubre ese recorte
  // aparte, la tabla debe mostrar todos los datos. El filtro de Estado solo acota qué filas se ven
  // acá (y el contador de registros); los 3 KPIs de abajo NUNCA se calculan desde esta lista — usan
  // siempre D.n_ot_atrasadas/D.ot_pend/D.ot_ejec (totalAtrasadas/totalPendientes/totalEnEjecucion,
  // alcance general de toda la campaña, ya calculados en data.js desde OTS/otsAtrasadas). D.ot_pend/
  // D.ot_ejec son totales de OT ÚNICAS por Estado (no "con atraso" — eso es D.n_ot_atrasadas, un
  // concepto distinto).
  const alertas = estV==='ALL' ? D.alertas : D.alertas.filter(a=>a.estado===estV);
  const estTxt = estV==='ALL' ? 'Todas' : estV;
  document.getElementById('anote').textContent = estTxt;
  // KPIs con el mismo estilo que el resto del dashboard (.kpi, fondo blanco) — Lotes con Exceso
  // y OT sin Correspondencia RTK NO se repiten acá: ya se muestran en Control de Hectáreas.
  document.getElementById('al-kpis').innerHTML=
    `<div class="kpi"><div class="k-lab">OT Atrasadas</div><div class="k-val c-r">${D.n_ot_atrasadas}</div></div>`+
    `<div class="kpi"><div class="k-lab">Pendientes</div><div class="k-val">${D.ot_pend}</div></div>`+
    `<div class="kpi"><div class="k-lab">En Ejecución</div><div class="k-val c-o">${D.ot_ejec}</div></div>`;
  document.getElementById('al-sub').textContent=alertas.length+' registros · ordenado por días de atraso';
  document.getElementById('al').innerHTML = alertas.length ? alertas.map(a=>{
    // Celda de días: SIEMPRE el día real transcurrido (a.diasTranscurridos, sin descontar la
    // tolerancia de 3) — 0d/1d/2d/3d/4d… tal cual, nunca se resta nada acá; la tolerancia solo
    // decide a.atrasada (usada para el color), no qué número se imprime. Guion únicamente cuando
    // no hay una comparación válida: sin Fecha Teórica (null) o Fecha Teórica futura (negativo).
    // Color por FILA — puramente visual, solo aplica si la OT está efectivamente atrasada
    // (a.atrasada, diasTranscurridos>3): <=7 sin color, 8-15 amarillo suave, 16-30 naranja fuerte,
    // >30 rojo intenso.
    const sinComparacionValida = a.diasTranscurridos==null || a.diasTranscurridos<0;
    const sev = a.atrasada ? (a.diasTranscurridos>30?'r':(a.diasTranscurridos>15?'o':(a.diasTranscurridos>7?'y':null))) : null;
    const ft=a.ft?(('0'+a.ft.getDate()).slice(-2)+'/'+('0'+(a.ft.getMonth()+1)).slice(-2)+'/'+a.ft.getFullYear()):'-';
    const rowCls = sev?` class="al-${sev}"`:'';
    const diasCell = sinComparacionValida ? `<span class="mono">-</span>`
      : sev ? `<span class="pill pill-${sev}">${a.diasTranscurridos}d</span>` : `<span class="mono">${a.diasTranscurridos}d</span>`;
    return `<tr${rowCls}><td>${diasCell}</td><td class="mono">OT ${a.ot}</td><td>${a.act}</td><td>${a.serv}</td><td class="mono">${a.lote}</td><td>${a.cult}</td><td>${a.estado}</td><td class="mono">${ft}</td></tr>`;}).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px">Sin OT para el filtro seleccionado</td></tr>';
}

// ---- Insumos (no combustible): filtros dependientes Tipo de Insumo -> Insumo, + Mes ----
// Ingreso y Consumo en CANTIDAD real, no en dinero. "Afrecho de Arroz - CH" se excluye antes de
// llegar acá (separarInsumos(), loader.js). Cascada Tipo -> Insumo: repuebla #iinsumo y limpia la
// selección si ya no pertenece al tipo elegido, antes de que renderInsumos() lea su valor.
function actualizarFiltroInsumo(){
  const tipoV=document.getElementById('itipo').value;
  const nombres = tipoV==='ALL'
    ? [...new Set(Object.values(D.insumos_por_tipo).flat())].sort((a,b)=>a.localeCompare(b,'es'))
    : (D.insumos_por_tipo[tipoV]||[]);
  const selIInsumo=document.getElementById('iinsumo');
  const actual=selIInsumo.value;
  selIInsumo.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  nombres.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;selIInsumo.appendChild(o);});
  selIInsumo.value = nombres.includes(actual) ? actual : 'ALL';
}

// ---- Insumos: modos visuales mutuamente excluyentes ----
// "summary" mientras Insumo="Todos los Insumos" (con o sin Tipo elegido); "specific_item" en
// cuanto se elige un Insumo puntual. El Tipo de Insumo nunca cambia cuál modo está activo, solo
// acota los datos dentro del modo elegido.
function determinarModoInsumos(insumoV){
  return insumoV!=='ALL' ? 'specific_item' : 'summary';
}
// Visibilidad centralizada acá — cada bloque usa .hidden (display:none) y no ocupa espacio cuando
// está oculto. insumoMultiUnidad es el único caso donde, en modo específico, el resumen por unidad
// se muestra en vez de los 4 KPIs tradicionales.
function actualizarVisibilidadInsumos(modo, insumoMultiUnidad){
  document.getElementById('ins-stock-kpis').classList.toggle('hidden', !(modo==='specific_item' && !insumoMultiUnidad));
  document.getElementById('ins-activity-kpis').classList.toggle('hidden', modo!=='summary');
  document.getElementById('ins-multi-unidad-warning').classList.toggle('hidden', !insumoMultiUnidad);
  document.getElementById('ins-resumen-unidades-panel').classList.toggle('hidden', !(modo==='summary' || insumoMultiUnidad));
}
function renderResumenUnidadesInsumos(flujoRows){
  const resumenUnidades = resumenInsumosPorUnidad(flujoRows);
  document.getElementById('ins-resumen-unidades').innerHTML = resumenUnidades.length ? resumenUnidades.map(u=>
    `<tr><td class="tr mono">${u.cantidadInsumos}</td><td class="tr mono qty-unit">${fmtCantidadUnidad(u.stockInicial,u.unidad)}</td><td class="tr mono qty-unit">${fmtCantidadUnidad(u.ingreso,u.unidad)}</td><td class="tr mono qty-unit">${fmtCantidadUnidad(u.consumo,u.unidad)}</td><td class="tr mono qty-unit">${fmtCantidadUnidad(u.balance,u.unidad)}</td></tr>`
  ).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">Sin datos para el filtro seleccionado</td></tr>';
}
// Modo "summary": 4 KPIs de actividad + resumen por unidad. "Insumos con Movimiento" solo cuenta
// filas con Ingreso o Consumo en el período (Stock Inicial solo no habilita).
function renderModoInsumosResumen(flujoRows, nMovIngreso, nMovConsumo){
  const insumosConMovimiento = new Set(flujoRows.filter(f=>f.ingresoPeriodo!==0||f.consumoPeriodo!==0).map(f=>f.tipo+'|'+f.nombre)).size;
  const unidadesDistintas = new Set(flujoRows.map(f=>normHdr(f.unidad)||'(sin unidad)')).size;
  document.getElementById('ins-activity-kpis').innerHTML =
    kpiCard('Insumos con Movimiento', insumosConMovimiento, '', 'g')+
    kpiCard('Unidades de Medida', unidadesDistintas, '', 'gris')+
    kpiCard('Movimientos de Ingreso', nMovIngreso, '', 'g')+
    kpiCard('Movimientos de Consumo', nMovConsumo, '', 'o');
  renderResumenUnidadesInsumos(flujoRows);
}
// Modo "specific_item": si el insumo resuelve a una única unidad real, los 4 KPIs tradicionales;
// si tiene más de una unidad, no se suma nada — aviso + resumen por unidad acotado a ese insumo.
function renderModoInsumosEspecifico(flujoRows, unidadInsumo, insumoMultiUnidad){
  if(!insumoMultiUnidad){
    const stockInicioTot = flujoRows.reduce((s,f)=>s+f.stockInicio,0);
    const ingresoTot = flujoRows.reduce((s,f)=>s+f.ingresoPeriodo,0);
    const consumoTot = flujoRows.reduce((s,f)=>s+f.consumoPeriodo,0);
    const balanceTot = flujoRows.reduce((s,f)=>s+f.balance,0);
    const balCol = balanceTot>=0?'g':'r';
    document.getElementById('ins-stock-kpis').innerHTML=
      `<div class="kpi"><div class="k-lab">Stock Inicial</div><div class="k-val c-g">${fmtKpiUnidad(stockInicioTot,unidadInsumo)}</div></div>`+
      `<div class="kpi"><div class="k-lab">Ingreso</div><div class="k-val c-g">${fmtKpiUnidad(ingresoTot,unidadInsumo)}</div></div>`+
      `<div class="kpi"><div class="k-lab">Consumo</div><div class="k-val c-o">${fmtKpiUnidad(consumoTot,unidadInsumo)}</div></div>`+
      `<div class="kpi"><div class="k-lab">Balance</div><div class="k-val c-${balCol}">${fmtKpiUnidad(balanceTot,unidadInsumo)}</div></div>`;
  } else {
    document.getElementById('ins-multi-unidad-warning').textContent =
      'Este insumo tiene movimientos registrados en más de una unidad de medida.';
    renderResumenUnidadesInsumos(flujoRows);
  }
}
function renderInsumos(){
  const selV=document.getElementById('imes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const tipoV=document.getElementById('itipo').value;
  const insumoV=document.getElementById('iinsumo').value;

  let ingreso = sel==='ALL' ? D.insumos_ingreso : D.insumos_ingreso.filter(r=>r.mesnum===sel);
  let consumo = sel==='ALL' ? D.insumos_consumo : D.insumos_consumo.filter(r=>r.mesnum===sel);
  if(tipoV!=='ALL'){ ingreso=ingreso.filter(r=>r.tipo===tipoV); consumo=consumo.filter(r=>r.tipo===tipoV); }
  if(insumoV!=='ALL'){ ingreso=ingreso.filter(r=>r.nombre===insumoV); consumo=consumo.filter(r=>r.nombre===insumoV); }
  const ingresoOrd = ingreso.slice().sort((a,b)=>b.cantidad-a.cantidad);
  const consumoOrd = consumo.slice().sort((a,b)=>b.cantidad-a.cantidad);
  const nMovIngreso = ingresoOrd.reduce((s,o)=>s+o.n,0);
  const nMovConsumo = consumoOrd.reduce((s,o)=>s+o.n,0);

  // Stock por (Tipo, Insumo, Unidad), mismo arrastre mes a mes que Combustible
  // (stockInicioDePeriodo(), utils.js). Balance = Stock Inicial + Ingreso − Consumo del período.
  let flujo = D.insumos_stock_flujo;
  if(tipoV!=='ALL') flujo = flujo.filter(f=>f.tipo===tipoV);
  if(insumoV!=='ALL') flujo = flujo.filter(f=>f.nombre===insumoV);
  const flujoRows = flujo.map(f=>{
    const movI = D.insumos_ingreso_mensual.filter(r=>r.tipo===f.tipo && r.nombre===f.nombre && r.unidad===f.unidad);
    const movC = D.insumos_consumo_mensual.filter(r=>r.tipo===f.tipo && r.nombre===f.nombre && r.unidad===f.unidad);
    const stockInicio = stockInicioDePeriodo(sel, f.stockInicial, movI, movC);
    const ingresoPeriodo = (sel==='ALL'?movI:movI.filter(r=>r.mesnum===sel)).reduce((s,r)=>s+r.cantidad,0);
    const consumoPeriodo = (sel==='ALL'?movC:movC.filter(r=>r.mesnum===sel)).reduce((s,r)=>s+r.cantidad,0);
    const balance = stockInicio+ingresoPeriodo-consumoPeriodo;
    return {tipo:f.tipo,nombre:f.nombre,unidad:f.unidad,stockInicio,ingresoPeriodo,consumoPeriodo,balance};
  });

  const modo = determinarModoInsumos(insumoV);
  const unidadInsumo = modo==='specific_item' ? unidadUnicaDe(flujoRows) : null;
  const insumoMultiUnidad = modo==='specific_item' && unidadInsumo==='MULTI';

  actualizarVisibilidadInsumos(modo, insumoMultiUnidad);
  if(modo==='summary') renderModoInsumosResumen(flujoRows, nMovIngreso, nMovConsumo);
  else renderModoInsumosEspecifico(flujoRows, unidadInsumo, insumoMultiUnidad);

  document.getElementById('ins-ingreso-sub').textContent=fmtMovimientos(nMovIngreso);
  document.getElementById('ins-ingreso').innerHTML = ingresoOrd.length ? ingresoOrd.map(o=>
    `<tr><td>${o.nombre}</td><td>${o.proveedor}</td><td class="tr mono">${o.n}</td><td class="tr mono qty-unit">${fmtCantidadUnidad(o.cantidad,o.unidad)}</td></tr>`
  ).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">Sin ingresos de insumos en el período</td></tr>';

  // Proveedor siempre vacío en Consumo: no es un dato que exista para estos movimientos.
  document.getElementById('ins-consumo-sub').textContent=fmtMovimientos(nMovConsumo);
  document.getElementById('ins-consumo').innerHTML = consumoOrd.length ? consumoOrd.map(o=>
    `<tr><td>${o.nombre}</td><td></td><td class="tr mono">${o.n}</td><td class="tr mono qty-unit">${fmtCantidadUnidad(o.cantidad,o.unidad)}</td></tr>`
  ).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">Sin consumo de insumos en el período</td></tr>';
}

function monthTotals(){ const t={}; D.meses.forEach(m=>t[m.k]={k:m.k,lbl:m.lbl,tot:0,ot:0,horas:0});
  D.gastos.forEach(r=>{const o=t[r.mesnum]; if(o){o.tot+=r.propia+r.tercero+r.insumos;o.ot+=r.n;o.horas+=(r.esH?r.horas:0);}}); return D.meses.map(m=>t[m.k]); }
// ---- Combustible: balance Ingreso vs Consumo + detalle por tercero/proveedor ----
function renderCombustible(){
  const mesV=document.getElementById('cmes').value, mes=mesV==='ALL'?'ALL':parseInt(mesV);
  const tercV=document.getElementById('cterc').value;
  const selTxt=mesV==='ALL'?'Toda la campaña':document.getElementById('cmes').selectedOptions[0].text;

  // ---- KPI de balance: Ingreso vs Consumo del período (solo filtra por Mes, no por Tercero,
  // para comparar siempre el consumo TOTAL contra lo ingresado, sin importar qué tercero se mire
  // abajo en el detalle) ----
  let ingresoMes=D.combustible_ingresos, consumoMes=D.combustible;
  if(mes!=='ALL'){ ingresoMes=ingresoMes.filter(r=>r.mesnum===mes); consumoMes=consumoMes.filter(r=>r.mesnum===mes); }
  const totIngresoMes=ingresoMes.reduce((s,r)=>s+r.litros,0);
  const totConsumoMes=consumoMes.reduce((s,r)=>s+r.litros,0);

  // Stock Inicial del período: para "Toda la Campaña" es el stock de arranque de la campaña
  // (D.stock_inicial_combustible, calculado en buildData desde las filas "Existencia inicial"
  // de consultaInsumos); para un mes puntual es el stock que quedó acumulado al cierre del mes
  // anterior (stock inicial + todo lo ingresado/consumido en los meses previos). Así el Balance
  // de cada mes sigue naturalmente al del mes anterior en vez de recalcular desde cero.
  // stockInicioDePeriodo() es generica (ver utils.js) — la reutiliza tambien Insumos.
  const stockInicioPeriodo = stockInicioDePeriodo(mes, D.stock_inicial_combustible,
    D.combustible_ingresos.map(r=>({mesnum:r.mesnum,cantidad:r.litros})),
    D.combustible.map(r=>({mesnum:r.mesnum,cantidad:r.litros})));
  const balance=stockInicioPeriodo+totIngresoMes-totConsumoMes;
  const balCol=balance>=0?'g':'r';
  document.getElementById('comb-balance').innerHTML=
    `<div class="kpi"><div class="k-lab">Stock Inicial</div><div class="k-val c-g">${fmt2(stockInicioPeriodo)}<small> L</small></div></div>`+
    `<div class="kpi"><div class="k-lab">Ingreso</div><div class="k-val c-g">${fmt2(totIngresoMes)}<small> L</small></div></div>`+
    `<div class="kpi"><div class="k-lab">Consumo</div><div class="k-val c-o">${fmt2(totConsumoMes)}<small> L</small></div></div>`+
    `<div class="kpi"><div class="k-lab">Balance (Stock Inicial + Ingreso − Consumo)</div><div class="k-val c-${balCol}">${fmt2(balance)}<small> L</small></div><div class="k-foot">${balance>=0?'Queda stock disponible':'Stock consumido en exceso'}</div></div>`;

  // ---- Ingresos de Combustible (arriba): solo respeta el filtro de Mes ----
  const byIng={};
  ingresoMes.forEach(r=>{ if(!byIng[r.quien]) byIng[r.quien]={quien:r.quien,n:0,litros:0}; const o=byIng[r.quien]; o.n+=r.n; o.litros+=r.litros; });
  const rowsIng=Object.values(byIng).sort((a,b)=>b.litros-a.litros);
  const mxIng=Math.max(1,...rowsIng.map(r=>r.litros));
  document.getElementById('combingbody').innerHTML = rowsIng.length ? rowsIng.map(r=>
    `<tr><td><b>${r.quien}</b></td><td class="tr mono">${r.n}</td><td class="tr mono">${fmt2(r.litros)}</td><td class="tr"><div class="sopbar"><div style="width:${r.litros/mxIng*100}%"></div></div></td><td class="tr mono">${totIngresoMes?(r.litros/totIngresoMes*100).toFixed(1):0}%</td></tr>`
  ).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">Sin ingresos de stock en el período</td></tr>';

  // ---- Consumo de Combustible (abajo): respeta Mes y también el filtro de Tercero ----
  let recs=consumoMes;
  if(tercV!=='ALL') recs=recs.filter(r=>r.quien===tercV);
  const by={};
  recs.forEach(r=>{ if(!by[r.quien]) by[r.quien]={quien:r.quien,n:0,litros:0}; const o=by[r.quien]; o.n+=r.n; o.litros+=r.litros; });
  const rowsC=Object.values(by).sort((a,b)=>b.litros-a.litros);
  const tot=rowsC.reduce((s,r)=>s+r.litros,0);
  document.getElementById('cnote').textContent=selTxt+(tercV!=='ALL'?' · Tercero: '+tercV:'');
  const mx=Math.max(1,...rowsC.map(r=>r.litros));
  document.getElementById('combbody').innerHTML = rowsC.length ? rowsC.map(r=>
    `<tr><td><b>${r.quien}</b></td><td class="tr mono">${r.n}</td><td class="tr mono">${fmt2(r.litros)}</td><td class="tr"><div class="sopbar"><div style="width:${r.litros/mx*100}%"></div></div></td><td class="tr mono">${tot?(r.litros/tot*100).toFixed(1):0}%</td></tr>`
  ).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">Sin registros de combustible para el filtro seleccionado</td></tr>';
}

function renderG(){
  const selV=document.getElementById('gmes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const mt=monthTotals(); const recs=sel==='ALL'?D.gastos:D.gastos.filter(r=>r.mesnum===sel);
  const by={}; recs.forEach(r=>{ if(!by[r.labor])by[r.labor]={labor:r.labor,esH:r.esH,n:0,ha:0,horas:0,prop:0,terc:0,ins:0};
    const o=by[r.labor];o.n+=r.n;o.ha+=r.ha;o.horas+=r.horas;o.prop+=r.propia;o.terc+=r.tercero;o.ins+=r.insumos; });
  const labs=Object.values(by).map(o=>({...o,tot:o.prop+o.terc+o.ins})).sort((a,b)=>b.tot-a.tot);
  const gasto=labs.reduce((s,l)=>s+l.tot,0), nOT=labs.reduce((s,l)=>s+l.n,0);
  const totTerc=labs.reduce((s,l)=>s+l.terc,0), totIns=labs.reduce((s,l)=>s+l.ins,0);
  const gasoil=sel==='ALL'?D.gasoil_total:(D.gmes[sel]||0), gasoilL=sel==='ALL'?D.gasoil_litros_total:(D.glit[sel]||0);
  const K=[['Gasto Total (labores)','US$ '+fmtUSD(gasto),''],['OT Confirmadas',nOT,'con labor'],['Labores Ejecutadas',labs.length,'tipos de labor'],
    ['Costo Labor Tercero','US$ '+fmtUSD(totTerc),gasto?Math.round(totTerc/gasto*100)+'% del gasto':''],
    ['Costo Insumos','US$ '+fmtUSD(totIns),gasto?Math.round(totIns/gasto*100)+'% del gasto':''],
    ['Gasto de Gasoil','US$ '+fmtUSD(gasoil),fmt1(gasoilL)+' L']];
  document.getElementById('gkpis').innerHTML=K.map(k=>`<div class="gkpi"><div class="k-lab">${k[0]}</div><div class="k-val">${k[1]}</div><div class="k-foot">${k[2]}</div></div>`).join('');
  document.getElementById('gnote').textContent=sel==='ALL'?'Mostrando la campaña completa':'Detalle del período seleccionado';
  let acc=0; const pts=mt.map(m=>{acc+=m.tot;return{lbl:m.lbl,acc};}); const W=1000,H=200,pad=34,aMax=acc||1;
  const xs=i=>pad+i*(W-2*pad)/Math.max(pts.length-1,1), ys=v=>H-24-(v/aMax)*(H-50);
  const poly=pts.map((p,i)=>xs(i).toFixed(0)+','+ys(p.acc).toFixed(0)).join(' ');
  const area=pad+','+(H-24)+' '+poly+' '+xs(pts.length-1).toFixed(0)+','+(H-24);
  const dots=pts.map((p,i)=>`<circle cx="${xs(i).toFixed(0)}" cy="${ys(p.acc).toFixed(0)}" r="4" fill="var(--green)"/><text x="${xs(i).toFixed(0)}" y="${(ys(p.acc)-9).toFixed(0)}" text-anchor="middle" style="font-size:11px;font-weight:700;fill:var(--teal)">${fmt(p.acc/1000)}k</text><text x="${xs(i).toFixed(0)}" y="${H-6}" text-anchor="middle" style="font-size:11px;fill:var(--muted)">${p.lbl}</text>`).join('');
  document.getElementById('gacc').innerHTML=`<svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><polygon points="${area}" fill="rgba(90,160,44,.12)"/><polyline points="${poly}" fill="none" stroke="var(--green)" stroke-width="2.5"/>${dots}</svg>`;
  renderLaborDetalle();
  renderGasoil();
}

// ---- Detalle por Labor: filtros de Labor, Etapa y Contratista, afectan SOLO esta tabla ----
// (los KPIs, ranking y resumen por mes de arriba siguen agregando por labor sin importar la
// etapa/contratista, tal como antes; acá se desglosa además por Estadio y por Contratista real
// (campo "contratista" de consultaOT) para poder aislar en qué etapa y con qué contratista se
// ejecutó una labor puntual — antes la columna "Propia / Tercero" mezclaba, en la misma fila,
// OT de más de un contratista real (~19% de los grupos labor+etapa); ahora cada fila de la tabla
// pertenece a un único contratista, o a "No aplica"/"Sin contratista" cuando corresponde).
function renderLaborDetalle(){
  const selV=document.getElementById('gmes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const laborV=document.getElementById('glabor').value, estV=document.getElementById('gestadio').value;
  const contV=document.getElementById('gcontratista').value;
  let recs=sel==='ALL'?D.gastos:D.gastos.filter(r=>r.mesnum===sel);
  if(laborV!=='ALL') recs=recs.filter(r=>r.labor===laborV);
  if(estV!=='ALL') recs=recs.filter(r=>r.estadio===estV);
  if(contV!=='ALL') recs=recs.filter(r=>r.contratista===contV);
  const by={};
  recs.forEach(r=>{ const key=r.labor+'|'+r.estadio+'|'+r.contratista;
    if(!by[key]) by[key]={labor:r.labor,estadio:r.estadio,contratista:r.contratista,esH:r.esH,n:0,ha:0,horas:0,prop:0,terc:0,ins:0};
    const o=by[key]; o.n+=r.n; o.ha+=r.ha; o.horas+=r.horas; o.prop+=r.propia; o.terc+=r.tercero; o.ins+=r.insumos; });
  const labs=Object.values(by).map(o=>({...o,tot:o.prop+o.terc+o.ins})).sort((a,b)=>b.tot-a.tot);
  document.getElementById('gld-sub').textContent=labs.length+' combinación(es) labor/etapa/contratista · ordenado por costo total';
  document.getElementById('gld').innerHTML= labs.length ? labs.map(l=>{
    const ha=l.esH?'<span style="color:var(--muted)">—</span>':fmt2(l.ha), hr=l.esH?fmt2(l.horas):'<span style="color:var(--muted)">—</span>';
    const chip=l.esH?'<span class="chip chip-hr">horas</span>':'<span class="chip chip-ha">ha</span>';
    const contratistaTxt=labelContratista(l.contratista);
    // Labor Propia no tiene costo de tercero asignado en el sistema (siempre US$ 0 en la columna
    // "Labor Tercero") — no hay columna de costo separada para Labor Propia en esta tabla.
    return `<tr><td><span class="lname">${l.labor}</span> ${chip}</td><td><span class="chip chip-etapa">${l.estadio}</span></td><td class="tr mono">${l.n}</td><td class="tr mono">${ha}</td><td class="tr mono">${hr}</td><td class="tr mono col-terc">US$ ${fmtUSD(l.terc)}</td><td class="col-contratista" title="${contratistaTxt}">${contratistaTxt}</td><td class="tr mono col-ins">US$ ${fmtUSD(l.ins)}</td><td class="tr mono col-tot">US$ ${fmtUSD(l.tot)}</td></tr>`;
  }).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:16px">Sin registros para el filtro seleccionado</td></tr>';
}

// ---- Consumo de Gasoil por Área ----
function renderGasoil(){
  const selV=document.getElementById('gmes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const recs=sel==='ALL'?D.gasoil_sec:D.gasoil_sec.filter(r=>r.mesnum===sel);
  const by={}; recs.forEach(r=>{ const key=r.area;
    if(!by[key]) by[key]={area:r.area,n:0,litros:0,total:0};
    const o=by[key]; o.n+=r.n; o.litros+=r.litros; o.total+=r.total; });
  const rows=Object.values(by).sort((a,b)=>b.total-a.total);
  const tot=rows.reduce((s,r)=>s+r.total,0), litros=rows.reduce((s,r)=>s+r.litros,0);
  document.getElementById('gastop').innerHTML=`<div class="sop-kpi"><div class="l">Total Gasoil</div><div class="v">US$ ${fmtUSD(tot)}</div></div><div class="sop-kpi"><div class="l">Litros Consumidos</div><div class="v">${fmt1(litros)} L</div></div>`;
  const mx=Math.max(1,...rows.map(r=>r.total));
  document.getElementById('gasbody').innerHTML=rows.length?rows.map(r=>`<tr><td><b>${r.area}</b></td><td class="tr mono">${r.n}</td><td class="tr mono">${fmt1(r.litros)}</td><td class="tr mono col-tot">US$ ${fmtUSD(r.total)}</td><td class="tr"><div class="sopbar"><div style="width:${r.total/mx*100}%"></div></div></td><td class="tr mono">${tot?(r.total/tot*100).toFixed(1):0}%</td></tr>`).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">Sin consumo de gasoil en el período</td></tr>';
}
function show(i,btn){ document.querySelectorAll('.page').forEach((p,j)=>p.classList.toggle('active',j===i));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); btn.classList.add('active'); window.scrollTo({top:0,behavior:'smooth'}); }
