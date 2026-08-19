// ================== RENDER ==================
function renderAll(){
  const fd=D.fecha_datos;
  const fdTxt=('0'+fd.getDate()).slice(-2)+'/'+('0'+(fd.getMonth()+1)).slice(-2)+'/'+fd.getFullYear();
  // Header: fecha Y hora de la última actualización real del archivo .xlsx (D.excel_actualizado,
  // calculada UNA sola vez en loader.js — nunca se recalcula acá ni cambia al navegar entre
  // módulos/filtros/menú móvil). Distinta de fd/fdTxt (arriba, sigue usándose tal cual en el pie
  // de página): fd es la Fecha Teórica más reciente de las OT (frescura del CONTENIDO); esto es
  // cuándo se modificó el ARCHIVO en sí. Formato 24 horas, sin segundos: DD/MM/YYYY · HH:mm.
  const fa=D.excel_actualizado;
  const faTxt=('0'+fa.getDate()).slice(-2)+'/'+('0'+(fa.getMonth()+1)).slice(-2)+'/'+fa.getFullYear()+' · '+('0'+fa.getHours()).slice(-2)+':'+('0'+fa.getMinutes()).slice(-2);
  document.getElementById('t-date').textContent=faTxt;
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
  document.getElementById('cancel-sub').textContent=D.cancelados.length+' lote(s)';
  let cancelHtml='';
  D.cancelados.forEach(e=>{
    cancelHtml+=`<tr class="grp"><td>${e.cult}</td><td class="mono">${e.lote}</td></tr>`;
    if(!e.n_ot){
      cancelHtml+=`<tr class="dethead"><td colspan="2">Sin OT cargadas todavía</td></tr>`;
    } else {
      cancelHtml+=`<tr class="dethead"><td colspan="2">OT que componen el lote · ${e.n_ot} OT (excl. labores por hora)</td></tr>`;
      e.dets.forEach(x=>{ cancelHtml+=`<tr class="det"><td class="dl mono">OT ${x.ot}</td><td>${x.act} · ${x.serv} · ${x.estado}</td></tr>`; });
    }
  });
  document.getElementById('cancel').innerHTML=cancelHtml;
  document.getElementById('sinrtk-sub').textContent=D.sinrtk.length+' OT · el lote no existe en el plan RTK';
  document.getElementById('sinrtk').innerHTML=D.sinrtk.map(r=>
    `<tr><td class="mono">OT ${r.ot}</td><td>${r.cult}</td><td class="mono">${r.lote}</td><td>${r.act}</td><td>${r.serv}</td><td class="tr mono">${fmt2(r.ha)}</td><td>${r.estado}</td></tr>`).join('');
  renderAlertas();
  // filtro de Campaña de Servicios: opciones dinámicas desde consultasOT (D.campanias_ot), con la
  // campaña vigente (D.campania_actual) preseleccionada si existe en el dato. Se puebla una sola
  // vez acá; los demás filtros de Servicios (Mes/Labor/Etapa/Contratista) dependen de la campaña
  // elegida y se repueblan en poblarFiltrosServicios() cada vez que cambia.
  const selCamp=document.getElementById('gcampania'); selCamp.innerHTML='';
  const campDisp=(D.campanias_ot||[]);
  // Orden de presentacion: primero las de CAMPANIA_ORDEN que existan en el dato, después cualquier
  // otra campania que traiga consultaOT (nunca se oculta ninguna). El value de cada option es
  // SIEMPRE la clave real de consultaOT; CAMPANIA_LABEL solo cambia el texto visible.
  const campOrdenadas=[...CAMPANIA_ORDEN.filter(c=>campDisp.includes(c)),
    ...campDisp.filter(c=>!CAMPANIA_ORDEN.includes(c))];
  campOrdenadas.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=CAMPANIA_LABEL[c]||c;selCamp.appendChild(o);});
  if([...selCamp.options].some(o=>o.value===D.campania_actual)) selCamp.value=D.campania_actual;
  poblarFiltrosServicios();
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
  // Sub-módulo "Insumos por Parcela" de Auditoría: sus 8 filtros se pueblan desde los propios
  // líneas de insumo de consultaOT (D.insumos_parcela), con la campaña vigente preseleccionada.
  inicializarFiltrosInsumosParcela();
  renderInsumosParcela();
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
    // Consolida todas las campañas de consultaOT (ver costo_total_consolidado en data.js).
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
// Suelo, Siembra, Cuidados, Cosecha por cada cultivo). El Mapa de Siembra (imagen estática, sin
// datos calculados) se agrega como UNA tarjeta más al final del mismo innerHTML — así queda en la
// misma cuadrícula .cults (cultivos.css) y ocupa las columnas vacías de la última fila en
// escritorio, sin agrandar el bloque; en móvil (grid de 2 columnas) pasa a ocupar el ancho
// completo debajo de todas las tarjetas de cultivo (.mapa-card, ver media query en mapa.css). El
// clic/Enter/Espacio que la abre ampliada está delegado sobre #cults en events.js, nunca atado
// directo a la imagen, porque este innerHTML (y por lo tanto el <img>) se reescribe entero acá. ----
function renderCultivoDetalle(){
  const mapaCard = `<div class="cult-card mapa-card">
    <div class="cc-name">Mapa de Siembra</div>
    <img id="mapa-siembra-img" class="mapa-siembra-thumb" src="img/mapa_siembra_2627.jpeg"
      alt="Mapa de siembra de la Campaña 26/27" tabindex="0" role="button" aria-label="Ampliar mapa de siembra"></div>`;
  document.getElementById('cults').innerHTML=D.cultivos.map(c=>{
    const plan=c.tiene_rtk?fmt2(c.ha_plan)+' ha':'s/ RTK';
    // Cada etapa muestra su avance y, al lado, las hectáreas ejecutadas de ESA etapa. Las ha salen
    // de e.ha_ejec — la ejecución equivalente que ya calcula data.js (equivalenteLoteEstadio: cada
    // labor capada al plan del lote y promediada por estadio) y que es la misma base del porcentaje.
    // NUNCA se derivan del porcentaje mostrado (que además va redondeado a entero para la pantalla).
    // Con la etiqueta y el valor arriba y la barra a lo ancho debajo, entran las dos cifras sin
    // dejar la barra en un hilo: la tarjeta mide ~274px y antes la barra ya usaba solo ~96px.
    const etapasHtml = c.etapas.length ? c.etapas.map(e=>{
      const col = e.avance==null ? 'o' : color(e.avance);
      const av = e.avance!=null ? Math.round(e.avance)+'%' : e.n_lotes+' lotes';
      const w = e.avance!=null ? Math.min(e.avance,100) : 0;
      return `<div class="et-row"><div class="et-lbl">${e.nombre}</div>
        <div class="et-val c-${col}">${av} <span class="et-ha">· ${fmt2(e.ha_ejec)} ha</span></div>
        <div class="bar et-bar"><div class="bar-fill f-${col}" style="width:${w}%"></div></div></div>`;
    }).join('') : '<div class="et-empty">Sin etapa registrada en OT confirmadas</div>';
    // Abajo queda únicamente Ha planificadas (el plan RTK del cultivo). "Ha ejecutadas" se movió al
    // detalle de cada etapa (arriba) y "OT conf. / total" se retiró a pedido del usuario — ambas
    // referían siempre al último estadio con actividad, no al cultivo entero, y esa información ya
    // vive donde corresponde: dentro de la fila de su etapa.
    return `<div class="cult-card">
      <div class="cc-name">${c.nombre}</div>
      ${c.etapa_actual?`<div class="cc-stage">Etapa actual: <b>${c.etapa_actual}</b></div>`:'<div class="cc-stage cc-stage-muted">Sin actividad confirmada aún</div>'}
      <div class="cc-etapas">${etapasHtml}</div>
      <div class="cc-ha">
        <div><span>Ha planificadas</span><b>${plan}</b></div>
      </div></div>`;}).join('') + mapaCard;
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

// ================== AUDITORÍA · INSUMOS POR PARCELA ==================
// Sub-módulo de la pestaña Auditoría. Trabaja SIEMPRE sobre D.insumos_parcela.movs (data.js): un
// objeto por línea de insumo de una OT confirmada, con su lote y sus hectáreas reales. Acá no se
// vuelve a leer el .xlsx ni se reinterpreta ninguna regla de origen — solo se filtra y se agrega.

// Cambio de sub-módulo dentro de Auditoría. No toca la navegación de módulos (.tab/.page).
function mostrarAuditoria(vista, btn){
  document.querySelectorAll('#audit-subnav .subtab').forEach(b=>b.classList.toggle('active', b===btn));
  document.querySelectorAll('.audit-view').forEach(v=>v.classList.toggle('active', v.id==='audit-view-'+vista));
}

// Parcela desplegada en "Resumen por Parcela" (una sola a la vez). Vive acá y no en el DOM porque
// la tabla se redibuja entera en cada filtro; guardarla en una variable evita que el detalle quede
// abierto sobre un lote que ya no está en el resultado.
let ipParcelaAbierta = null;

// Los filtros, en el mismo orden en que aparecen en la barra. 'campania' es el filtro padre (acota
// qué valores existen en todos los demás); el resto son independientes entre sí y se combinan con
// AND.
// No hay filtro de Zona ni de Campo: el dato real tiene un solo valor de cada uno (CENTRO / LA
// TERESA), así que un selector con una única opción no filtra nada. Tampoco hay filtro de período:
// la Campaña ya delimita el tiempo, y dentro de una campaña recortar por mes parte las aplicaciones
// de un mismo lote en pedazos que no se pueden comparar por hectárea.
const IP_FILTROS = [
  {sel:'ipcampania', campo:'campania'}, {sel:'iplote', campo:'lote'},
  {sel:'ipcultivo', campo:'cultivo'}, {sel:'iptipo', campo:'tipo'},
  {sel:'ipinsumo', campo:'insumo'},
];
function ipValor(sel){ const el=document.getElementById(sel); return el?el.value:'ALL'; }
// Aplica todos los filtros activos menos el indicado en `excepto` (que se usa para calcular las
// opciones disponibles de ese propio selector: un filtro nunca debe limitar su propia lista, si no
// al elegir un valor desaparecerían todos los demás y no se podría cambiar la selección).
function ipFiltrar(movs, excepto){
  return IP_FILTROS.reduce((acc,f)=>{
    if(f.sel===excepto) return acc;
    const v = ipValor(f.sel);
    if(v==='ALL') return acc;
    return acc.filter(m=>m[f.campo]===v);
  }, movs);
}
// Repuebla los 8 selectores con los valores REALES que quedan disponibles según los otros filtros,
// conservando la selección actual cuando sigue existiendo. Así nunca se ofrece una combinación que
// da cero resultados, y ningún valor presente en el dato queda oculto.
// Se repite hasta que ninguna selección cambie (máximo 4 vueltas, tantas como haga falta y nunca
// infinitas: una selección solo puede pasar a "Todas", nunca al revés, así que el proceso siempre
// converge). Hace falta porque los filtros se recorren en orden: al cambiar de campaña, una
// selección vieja que ya no existe —un lote de otra campaña, por ejemplo— dejaría sin opciones
// a los filtros que se procesan ANTES que ella, aunque después se reinicie sola.
function poblarFiltrosInsumosParcela(){
  for(let vuelta=0; vuelta<4; vuelta++){
    const antes = IP_FILTROS.map(f=>ipValor(f.sel)).join('|');
    poblarFiltrosInsumosParcelaUnaVuelta();
    if(IP_FILTROS.map(f=>ipValor(f.sel)).join('|')===antes) return;
  }
}
function poblarFiltrosInsumosParcelaUnaVuelta(){
  const todos = D.insumos_parcela.movs;
  IP_FILTROS.forEach(f=>{
    const sel = document.getElementById(f.sel);
    if(!sel) return;
    const disp = ipFiltrar(todos, f.sel);
    let opciones;
    if(f.campo==='campania'){
      // Campaña es el filtro PADRE: ofrece siempre todas las campañas presentes en las aplicaciones,
      // sin recortarse por los demás filtros. Si se recortara, al elegir un lote que existe en
      // una sola campaña el selector quedaría con una única opción y no se podría cambiar de
      // campaña sin limpiar antes el resto. Al cambiarla, las selecciones que ya no existen en la
      // campaña nueva se reinician solas (ver el bucle de convergencia más arriba).
      // El value es SIEMPRE la clave real de consultaOT ('26/27', '26'); CAMPANIA_LABEL solo
      // cambia el texto visible ('26' se lee "Zafriña26"), igual criterio que el filtro de Servicios.
      opciones = D.insumos_parcela.campanias.map(c=>({v:c, t:CAMPANIA_LABEL[c]||c}));
    } else {
      // numeric:true para que los lotes se ordenen como los lee una persona (.03A, .09B, 111, 205D)
      // y no en orden de caracteres, donde "111" caería antes que "21".
      opciones = [...new Set(disp.map(m=>m[f.campo]))].filter(v=>v)
        .sort((a,b)=>a.localeCompare(b,'es',{numeric:true})).map(v=>({v,t:v}));
    }
    const actual = sel.value;
    // Campaña no tiene opción "Todas": el costo por hectárea y las comparaciones entre lotes
    // solo tienen sentido dentro de una misma campaña.
    sel.querySelectorAll(f.campo==='campania' ? 'option' : 'option:not([value=ALL])').forEach(o=>o.remove());
    opciones.forEach(o=>{ const el=document.createElement('option'); el.value=o.v; el.textContent=o.t; sel.appendChild(el); });
    if([...sel.options].some(o=>o.value===actual)) sel.value=actual;
    else sel.value = f.campo==='campania' ? (opciones[0]?opciones[0].v:'') : 'ALL';
  });
}
// Primera carga: preselecciona la campaña vigente si aparece en las aplicaciones, y recién después
// puebla el resto de los filtros sobre esa campaña.
function inicializarFiltrosInsumosParcela(){
  const sel = document.getElementById('ipcampania');
  sel.innerHTML='';
  D.insumos_parcela.campanias.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=CAMPANIA_LABEL[c]||c; sel.appendChild(o); });
  if([...sel.options].some(o=>o.value===D.campania_actual)) sel.value=D.campania_actual;
  poblarFiltrosInsumosParcela();
}
// Al cambiar cualquier filtro: se recalculan las opciones de los demás y se cierra el detalle de
// lote abierto (puede haber quedado fuera del nuevo resultado).
function cambiarFiltroInsumosParcela(){
  ipParcelaAbierta = null;
  poblarFiltrosInsumosParcela();
  renderInsumosParcela();
}

// Agrupa las aplicaciones filtradas por lote. La superficie del lote es el MÁXIMO de las
// hectáreas reales de sus OT, no la suma: varias aplicaciones se hacen sobre la misma superficie
// física, sumarlas multiplicaría el terreno por la cantidad de pasadas y diluiría el costo por
// hectárea justo en los lotes más trabajados — que es lo que la auditoría busca detectar.
function ipAgruparParcelas(movs){
  const map = new Map();
  movs.forEach(m=>{
    let o = map.get(m.parcela);
    if(!o){ o={parcela:m.parcela, lote:m.lote, cultivo:m.cultivo, zona:m.zona, campo:m.campo,
      ha:null, ots:new Set(), insumos:new Set(), costo:0, movs:[]}; map.set(m.parcela,o); }
    o.costo += m.costoTotal;
    if(m.otRef) o.ots.add(m.otRef);
    o.insumos.add(m.tipo+'|'+m.insumo);
    if(m.ha!=null && (o.ha==null || m.ha>o.ha)) o.ha = m.ha;
    o.movs.push(m);
  });
  return [...map.values()].map(o=>({
    ...o, nOT:o.ots.size, nInsumos:o.insumos.size,
    costo: Math.round(o.costo*100)/100,
    costoHa: o.ha ? Math.round((o.costo/o.ha)*100)/100 : null,
  }));
}
function ipFecha(d){ return d ? ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear() : '—'; }
// Celda "por hectárea": sin hectáreas reales de la OT muestra un guion gris con la explicación en
// el tooltip, nunca un 0 ni un valor estimado.
function ipCelda(valor, ha, formato){
  if(ha==null || !ha) return '<span class="ip-sin" title="Esta orden no registra una superficie trabajada: sin hectáreas reales no se puede calcular el valor por hectárea">—</span>';
  return formato(valor);
}

function renderInsumosParcela(){
  const movs = ipFiltrar(D.insumos_parcela.movs, null)
    .slice().sort((a,b)=>(b.fecha?b.fecha.getTime():0)-(a.fecha?a.fecha.getTime():0));
  const insumoV = ipValor('ipinsumo');

  // ---- KPIs ----
  const costoTotal = Math.round(movs.reduce((s,m)=>s+m.costoTotal,0)*100)/100;
  // Hectáreas trabajadas = suma de las hectáreas reales de las OT DISTINTAS que originaron estos
  // aplicaciones, contando cada OT una sola vez (una misma OT aporta varias líneas de insumo, sumarlas
  // por línea multiplicaría la superficie por la cantidad de insumos aplicados).
  const haPorOT = new Map();
  movs.forEach(m=>{ if(m.otRef && m.ha!=null && !haPorOT.has(m.otRef)) haPorOT.set(m.otRef, m.ha); });
  const haTrabajadas = Math.round([...haPorOT.values()].reduce((s,h)=>s+h,0)*100)/100;
  const costoHa = haTrabajadas ? costoTotal/haTrabajadas : null;
  // Cantidad utilizada: solo se muestra como un número con su unidad cuando hay un Insumo puntual
  // elegido y ese insumo resuelve a una única unidad real (mismo criterio que el módulo Insumos,
  // ver unidadUnicaDe/fmtKpiUnidad en utils.js). Con "Todos", el KPI cuenta insumos distintos y el
  // panel de abajo da la cantidad desglosada por unidad — nunca se suman litros con kilos.
  const unidadSel = insumoV!=='ALL' ? unidadUnicaDe(movs) : null;
  const cantTotal = movs.reduce((s,m)=>s+m.cantidad,0);
  const nInsumos = new Set(movs.map(m=>m.tipo+'|'+m.insumo)).size;
  const unidades = [...new Set(movs.map(m=>m.unidad))];
  const kpiCant = (unidadSel && unidadSel!=='MULTI')
    ? kpiCard('Insumos Utilizados', fmtKpiUnidad(cantTotal, unidadSel), insumoV, 'g')
    : kpiCard('Insumos Utilizados', nInsumos, nInsumos===1?'1 insumo distinto':nInsumos+' insumos en '+unidades.length+' unidad(es) de medida', 'g');
  document.getElementById('ip-kpis').innerHTML = kpiCant+
    kpiCard('Costo Total de Insumos', 'US$ '+fmtUSD(costoTotal), movs.length+' aplicación(es) de insumo', 'gris')+
    kpiCard('Hectáreas Trabajadas', haTrabajadas?fmt2(haTrabajadas):'—', haPorOT.size+' OT con hectáreas reales', 'gris')+
    kpiCard('Costo de Insumos por ha', costoHa!=null?'US$ '+fmtUSD(costoHa):'—',
      costoHa!=null?'Costo total ÷ ha trabajadas (suma de las OT)':'Sin hectáreas reales disponibles', costoHa!=null?'o':'gris');

  // ---- Aviso de cobertura de hectáreas ----
  // Las líneas sin hectáreas reales se muestran igual (lote, insumo,
  // cantidad y costo son datos propios de consultaInsumos), pero no pueden expresarse por hectárea.
  // Se avisa con el número exacto en vez de dejar guiones sin explicación.
  const sinHaMovs = movs.filter(m=>m.ha==null);
  const aviso = document.getElementById('ip-aviso');
  aviso.classList.toggle('hidden', sinHaMovs.length===0);
  if(sinHaMovs.length){
    const costoSinHa = Math.round(sinHaMovs.reduce((s,m)=>s+m.costoTotal,0)*100)/100;
    const sinSup = sinHaMovs.filter(m=>m.motivoSinHa==='sin_superficie').length;
    const otros = sinHaMovs.length-sinSup;
    const motivos=[];
    if(sinSup) motivos.push('<b>'+fmt(sinSup)+'</b> porque son trabajos donde solo se usan insumos (aplicación con mochila y similares): la orden no registra una superficie trabajada');
    if(otros) motivos.push('<b>'+fmt(otros)+'</b> porque su orden no trae Has. Reales cargadas');
    aviso.innerHTML = '<b>'+fmt(sinHaMovs.length)+' de '+fmt(movs.length)+' aplicaciones</b> (US$ '+fmtUSD(costoSinHa)+
      ') no tienen hectáreas reales: '+motivos.join('; ')+'. Se muestran igual con su lote, cantidad y costo, '+
      'pero las columnas y KPIs «por hectárea» las dejan fuera — no se las estima ni se las reemplaza por las '+
      'hectáreas planificadas, que son otra magnitud.';
  }

  // ---- Cantidad utilizada por unidad de medida ----
  const porUnidad = new Map();
  movs.forEach(m=>{
    const k = normHdr(m.unidad)||'(sin unidad)';
    if(!porUnidad.has(k)) porUnidad.set(k, {unidad:m.unidad, cantidad:0, costo:0, insumos:new Set()});
    const o = porUnidad.get(k);
    o.cantidad += m.cantidad; o.costo += m.costoTotal; o.insumos.add(m.tipo+'|'+m.insumo);
  });
  const unidadesOrd = [...porUnidad.values()].sort((a,b)=>b.costo-a.costo);
  document.getElementById('ip-unidades').innerHTML = unidadesOrd.length ? unidadesOrd.map(u=>
    `<tr><td>${u.unidad}</td><td class="tr mono">${u.insumos.size}</td><td class="tr mono qty-unit">${fmtCantidadUnidad(u.cantidad,u.unidad)}</td><td class="tr mono">US$ ${fmtUSD(u.costo)}</td></tr>`
  ).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">Sin aplicaciones para los filtros seleccionados</td></tr>';

  // ---- Resumen por lote (ordenado por costo/ha: es la comparación que busca la auditoría) ----
  const parcelas = ipAgruparParcelas(movs)
    .sort((a,b)=>(b.costoHa==null?-1:b.costoHa)-(a.costoHa==null?-1:a.costoHa) || b.costo-a.costo);
  document.getElementById('ip-parcelas-sub').textContent =
    parcelas.length+' lote(s) · hectáreas = superficie real máxima de sus OT · clic en una fila para ver su detalle';
  document.getElementById('ip-parcelas').innerHTML = parcelas.length ? parcelas.map(p=>{
    const abierta = ipParcelaAbierta===p.parcela;
    let html = `<tr class="ip-parcela${abierta?' open':''}" data-parcela="${encodeURIComponent(p.parcela)}">`+
      `<td class="lname"><span class="ip-caret">${abierta?'▾':'▸'}</span> ${p.lote} <span class="ip-nota">${p.parcela}</span></td>`+
      `<td>${p.cultivo}</td>`+
      `<td class="tr mono">${p.ha!=null?fmt2(p.ha):'<span class="ip-sin">—</span>'}</td>`+
      `<td class="tr mono">${p.nOT}</td><td class="tr mono">${p.nInsumos}</td>`+
      `<td class="tr mono col-tot">US$ ${fmtUSD(p.costo)}</td>`+
      `<td class="tr mono">${ipCelda(p.costoHa, p.ha, v=>'US$ '+fmtUSD(v))}</td></tr>`;
    if(abierta) html += ipDetalleParcela(p);
    return html;
  }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px">Sin aplicaciones para los filtros seleccionados</td></tr>';

}

// Detalle de un lote: qué insumos se usaron, cuánto de cada uno, por hectárea, cuánto costaron,
// en qué fechas y qué órdenes los originaron. Se agrupa por (insumo, unidad) — un mismo insumo
// registrado en dos unidades distintas nunca se suma en una sola cantidad.
function ipDetalleParcela(p){
  const porInsumo = new Map();
  p.movs.forEach(m=>{
    const k = m.insumo+'|'+m.unidad;
    if(!porInsumo.has(k)) porInsumo.set(k, {insumo:m.insumo, unidad:m.unidad, cantidad:0, costo:0, fechas:new Set(), ots:new Set()});
    const o = porInsumo.get(k);
    o.cantidad += m.cantidad; o.costo += m.costoTotal;
    if(m.fecha) o.fechas.add(ipFecha(m.fecha));
    if(m.otRef) o.ots.add(m.otRef);
  });
  const lista = [...porInsumo.values()].sort((a,b)=>b.costo-a.costo);
  let html = `<tr class="dethead"><td colspan="7">Insumos utilizados en el lote ${p.lote} · ${lista.length} insumo(s) · ${p.nOT} orden(es) de trabajo`+
    (p.ha!=null?` · superficie ${fmt2(p.ha)} ha`:' · sin hectáreas reales disponibles')+`</td></tr>`;
  html += lista.map(i=>
    `<tr class="det"><td class="dl">${i.insumo}</td>`+
    `<td class="qty-unit">${fmtCantidadUnidad(i.cantidad,i.unidad)}</td>`+
    // La cantidad por hectárea lleva SIEMPRE su unidad real ("142,73 Kilos/ha"), igual que la
    // cantidad total de la celda anterior: un número suelto no se puede
    // interpretar cuando el lote mezcla insumos en kilos, litros y unidades.
    `<td class="tr mono qty-unit">${ipCelda(i.cantidad/(p.ha||1), p.ha, v=>fmtCantidadUnidad(v,i.unidad)+'/ha')}</td>`+
    `<td class="tr mono">US$ ${fmtUSD(i.costo)}</td>`+
    `<td class="tr mono qty-unit">${ipCelda(i.costo/(p.ha||1), p.ha, v=>'US$ '+fmtUSD(v)+'/ha')}</td>`+
    `<td colspan="2" class="ip-nota">${[...i.fechas].join(' · ')} — ${[...i.ots].join(' · ')}</td></tr>`
  ).join('');
  return html;
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

function monthTotals(S){ const t={}; S.meses.forEach(m=>t[m.k]={k:m.k,lbl:m.lbl,tot:0,ot:0,horas:0});
  S.gastos.forEach(r=>{const o=t[r.mesnum]; if(o){o.tot+=r.propia+r.tercero+r.insumos;o.ot+=r.n;o.horas+=(r.esH?r.horas:0);}}); return S.meses.map(m=>t[m.k]); }
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

// ================== SERVICIOS ==================
// El módulo Servicios trabaja siempre sobre UN paquete de datos (D.servicios_campanias[campaña]),
// no sobre las colecciones globales: el filtro de Campaña elige cuál. Cada paquete lo construyó
// buildData() con las mismas funciones y fórmulas (ver construirServicios en js/data/servicios.js), así que
// cambiar de campaña no cambia ningún cálculo — solo el conjunto de registros sobre el que se
// calcula. Fallback a D si el paquete no existiera, para no romper el render.
function serviciosActivos(){
  const sel=document.getElementById('gcampania');
  const c=sel?sel.value:null;
  return (D.servicios_campanias && D.servicios_campanias[c]) ? D.servicios_campanias[c] : D;
}
// Opciones de Mes / Labor / Etapa / Contratista: dependen de la campaña activa, así que se
// repueblan al cargar y en cada cambio de campaña. Si el valor que estaba elegido sigue existiendo
// en la campaña nueva se conserva; si no existe, vuelve a "ALL" (nunca queda un filtro apuntando a
// un valor inexistente, que dejaría la tabla vacía sin explicación).
function poblarFiltrosServicios(){
  const S=serviciosActivos();
  const llenar=(id,items,texto)=>{
    const sel=document.getElementById(id), previo=sel.value;
    sel.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
    items.forEach(v=>{const o=document.createElement('option');o.value=v.val;o.textContent=texto(v);sel.appendChild(o);});
    sel.value=[...sel.options].some(o=>o.value===previo)?previo:'ALL';
  };
  llenar('gmes', S.meses.map(m=>({val:String(m.k),lbl:m.lbl})), v=>v.lbl);
  // Labor / Etapa / Contratista: opciones de toda la campaña seleccionada, no dependen del mes
  llenar('glabor', S.labores.map(l=>({val:l})), v=>v.val);
  llenar('gestadio', S.estadios_labor.map(e=>({val:e})), v=>v.val);
  llenar('gcontratista', S.contratistas_labor.map(c=>({val:c})), v=>labelContratista(v.val));
}
// Cambio de campaña: primero se repueblan los filtros dependientes (Mes/Labor/Etapa/Contratista),
// recién después se re-renderiza — mismo patrón que el filtro dependiente de Insumos.
function cambiarCampaniaServicios(){ poblarFiltrosServicios(); renderG(); }
function renderG(){
  const S=serviciosActivos();
  const selV=document.getElementById('gmes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const mt=monthTotals(S); const recs=sel==='ALL'?S.gastos:S.gastos.filter(r=>r.mesnum===sel);
  const by={}; recs.forEach(r=>{ if(!by[r.labor])by[r.labor]={labor:r.labor,esH:r.esH,n:0,ha:0,horas:0,prop:0,terc:0,ins:0};
    const o=by[r.labor];o.n+=r.n;o.ha+=r.ha;o.horas+=r.horas;o.prop+=r.propia;o.terc+=r.tercero;o.ins+=r.insumos; });
  const labs=Object.values(by).map(o=>({...o,tot:o.prop+o.terc+o.ins})).sort((a,b)=>b.tot-a.tot);
  const gasto=labs.reduce((s,l)=>s+l.tot,0), nOT=labs.reduce((s,l)=>s+l.n,0);
  const totTerc=labs.reduce((s,l)=>s+l.terc,0), totIns=labs.reduce((s,l)=>s+l.ins,0);
  const K=[['Gasto Total (labores)','US$ '+fmtUSD(gasto),''],['OT Confirmadas',nOT,'con labor'],['Labores Ejecutadas',labs.length,'tipos de labor'],
    ['Costo Labor Tercero','US$ '+fmtUSD(totTerc),gasto?Math.round(totTerc/gasto*100)+'% del gasto':''],
    ['Costo Insumos','US$ '+fmtUSD(totIns),gasto?Math.round(totIns/gasto*100)+'% del gasto':'']];
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
  const S=serviciosActivos();
  const selV=document.getElementById('gmes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const laborV=document.getElementById('glabor').value, estV=document.getElementById('gestadio').value;
  const contV=document.getElementById('gcontratista').value;
  let recs=sel==='ALL'?S.gastos:S.gastos.filter(r=>r.mesnum===sel);
  if(laborV!=='ALL') recs=recs.filter(r=>r.labor===laborV);
  if(estV!=='ALL') recs=recs.filter(r=>r.estadio===estV);
  if(contV!=='ALL') recs=recs.filter(r=>r.contratista===contV);
  // La unidad del trabajo (r.unidadTrabajo: ha / hrs / kg) entra en la clave de agrupación: sin eso,
  // una misma labor+etapa+contratista medida en dos unidades distintas caía en una sola fila y la
  // columna "Trabajo Ejecutado" tenía que elegir una — mezclando unidades. Cada fila de la tabla
  // queda ahora con una única unidad, y su cantidad se acumula solo en el campo que le corresponde.
  const by={};
  recs.forEach(r=>{ const key=r.labor+'|'+r.estadio+'|'+r.contratista+'|'+r.unidadTrabajo;
    if(!by[key]) by[key]={labor:r.labor,estadio:r.estadio,contratista:r.contratista,esH:r.esH,unidadTrabajo:r.unidadTrabajo,n:0,ha:0,horas:0,kg:0,ins_lineas:0,prop:0,terc:0,ins:0};
    const o=by[key]; o.n+=r.n; o.ha+=r.ha; o.horas+=r.horas; o.kg+=r.kg; o.ins_lineas+=r.ins_lineas; o.prop+=r.propia; o.terc+=r.tercero; o.ins+=r.insumos; });
  const labs=Object.values(by).map(o=>({...o,tot:o.prop+o.terc+o.ins})).sort((a,b)=>b.tot-a.tot);
  document.getElementById('gld-sub').textContent=labs.length+' combinación(es) labor/etapa/contratista · ordenado por costo total';
  document.getElementById('gld').innerHTML= labs.length ? labs.map(l=>{
    // "Trabajo Ejecutado": una sola columna con la cantidad ejecutada en la unidad propia de ese
    // trabajo (l.unidadTrabajo, ver dmap en data.js). Nunca se convierte ni se suma entre unidades:
    //   'ha'  -> Has. Reales      'hrs' -> horas de la labor      'kg' -> totalAplicado (fletes por Dosis)
    // `chip` (columna Labor) y `unid` (columna Trabajo Ejecutado) usan el MISMO color por unidad —
    // ver las variables --u-ha/--u-hrs/--u-kg en gastos.css, unica fuente de esos tres colores.
    const U={ha:{val:l.ha,txt:'ha',chip:'chip-ha',unid:'tw-unid-ha'},
      hrs:{val:l.horas,txt:'hrs',chip:'chip-hr',unid:'tw-unid-hrs'},
      kg:{val:l.kg,txt:'kg',chip:'chip-kg',unid:'tw-unid-kg'}};
    const u=U[l.unidadTrabajo]||U.ha;
    // Cuarto caso: labores cuyo trabajo ejecutado son las lineas de insumo aplicadas
    // (unidadTrabajo 'ins', ver SERVICIOS_TRABAJO_MEDIDO_EN_INSUMOS en config.js). No lleva chip de
    // unidad ni numero decimal: es un conteo de lineas, y se muestra SOLO ese conteo — nunca junto
    // a las hectareas, que para estas labores no describen el trabajo. Las tres unidades medidas
    // ('ha', 'hrs', 'kg') siguen renderizandose exactamente igual que antes.
    const porInsumos = l.unidadTrabajo==='ins';
    // Servicios sin trabajo ejecutado medible (solo se usan insumos, ver
    // SERVICIOS_SIN_TRABAJO_EJECUTADO en config.js): la celda queda en "—". Solo afecta a esta
    // columna y al chip de unidad de la columna Labor (sin trabajo ejecutado no hay unidad de
    // trabajo que rotular); OT Confirmadas y los tres importes siguen igual.
    const sinEjec=SERVICIOS_SIN_TRABAJO_EJECUTADO.includes(normHdr(l.labor));
    const ejec=sinEjec?'<span class="tw-sin" title="Solo se usan insumos: la OT no registra trabajo ejecutado">—</span>'
      :porInsumos?`${l.ins_lineas} <span class="tw-unid tw-unid-ins" title="Líneas de insumo aplicadas en las OT de esta labor">${l.ins_lineas===1?'insumo utilizado':'insumos utilizados'}</span>`
      :`${fmt2(u.val)} <span class="tw-unid ${u.unid}">${u.txt}</span>`;
    const chip=(sinEjec||porInsumos)?'':`<span class="chip ${u.chip}">${u.txt}</span>`;
    const contratistaTxt=labelContratista(l.contratista);
    // Labor Propia no tiene costo de tercero asignado en el sistema (siempre US$ 0 en la columna
    // "Labor Tercero") — no hay columna de costo separada para Labor Propia en esta tabla.
    return `<tr><td><span class="lname">${l.labor}</span> ${chip}</td><td><span class="chip chip-etapa">${l.estadio}</span></td><td class="tr mono">${l.n}</td><td class="tr mono">${ejec}</td><td class="tr mono col-terc">US$ ${fmtUSD(l.terc)}</td><td class="col-contratista" title="${contratistaTxt}">${contratistaTxt}</td><td class="tr mono col-ins">US$ ${fmtUSD(l.ins)}</td><td class="tr mono col-tot">US$ ${fmtUSD(l.tot)}</td></tr>`;
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px">Sin registros para el filtro seleccionado</td></tr>';
}

// ---- Consumo de Gasoil por Área ----
function renderGasoil(){
  const S=serviciosActivos();
  const selV=document.getElementById('gmes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const recs=sel==='ALL'?S.gasoil_sec:S.gasoil_sec.filter(r=>r.mesnum===sel);
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
