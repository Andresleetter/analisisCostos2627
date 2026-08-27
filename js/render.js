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
  // Máquina: la lista llega ya resuelta y ordenada desde el modelo (D.combustible_maquinas, ver
  // js/data/combustible.js) y solo trae las que tienen movimientos. Acá no se normaliza ningún texto.
  const selCMaq=document.getElementById('cmaq'); selCMaq.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  (D.combustible_maquinas||[]).forEach(m=>{const o=document.createElement('option');o.value=m.val;o.textContent=m.lbl;selCMaq.appendChild(o);});
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
  // LABOR PROPIA). Las cuatro cifras llegan ya calculadas por OT única desde el modelo
  // (puentesPorUnidad, js/data/auditoria.js): acá no se cuenta ni se divide nada. El % de avance
  // es el de las Confirmadas — las columnas En Ejecución y Pendientes son informativas y se
  // atenúan cuando valen 0, para que no compitan con el número que sí es ejecución real.
  document.getElementById('audit-puentes').innerHTML = D.auditoria_puentes.map(p=>{
    const enCurso = n => n ? `<span class="pu-curso">${n}</span>` : '<span class="ip-sin">—</span>';
    return `<tr><td>${p.tipo}</td><td class="tr mono">${fmt2(p.presupuestado)}</td><td class="tr mono">${p.ejecutadas}</td>`+
      `<td class="tr mono">${enCurso(p.enEjecucion)}</td><td class="tr mono">${enCurso(p.pendientes)}</td>`+
      `<td class="tr mono">${p.avance!=null?fmt1(p.avance)+'%':'N/D'}</td></tr>`;
  }).join('');

  // Trabajo de Puentes por Horas: "Construccion de Puentes retro excavadora x Hs" del contratista
  // Cedrela, separado por estado. Estas OT NO son puentes construidos y por eso no aparecen en la
  // tabla de arriba. Las horas ya vienen sumadas por el modelo, con el marcador 0,01 de Albor
  // descontado; cuando un estado tiene OT pero ninguna hora cargada se muestra "—" y se aclara
  // cuántas OT están en esa situación, en vez de un 0,00 que se leería como "se trabajó cero".
  const ph = D.auditoria_puentes_horas;
  document.getElementById('audit-puentes-horas-sub').textContent =
    ph.servicio+' · contratista '+ph.contratista+' · sin presupuesto de horas: no lleva % de avance';
  document.getElementById('audit-puentes-horas').innerHTML = ph.estados.map(e=>{
    // La aclaración va en la celda de Horas, que es la que muestra el guion: explica por qué no
    // hay horas justo donde se ve el hueco, en vez de dejarlo sin motivo.
    const nota = e.sinHorasCargadas>0
      ? ` <span class="ip-nota">${e.sinHorasCargadas} OT sin horas cargadas</span>` : '';
    const horas = e.nOT===0 ? '<span class="ip-sin">—</span>'
      : (e.horas>0 ? fmt2(e.horas)+' h'+nota : `<span class="ip-sin">—</span>${nota}`);
    return `<tr><td>${e.estado}</td><td class="tr mono">${e.nOT}</td><td class="tr mono">${horas}</td></tr>`;
  }).join('');

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
// El "Estado de receta" NO entra en IP_FILTROS y no se aplica sobre los movimientos: el estado no
// es un dato de la linea de consultaOT sino el resultado de comparar la dosis del conjunto
// (cantidad del insumo en el lote / hectareas del lote) contra la receta. Filtrar movimientos por
// el estado cambiaria esas mismas sumas y el estado se volveria circular. Por eso se aplica DESPUES
// de agrupar, acotando que insumos y que lotes se listan; las cantidades, hectareas y costos de
// cada lote se siguen calculando sobre el lote completo.
function ipEstadoRecetaSel(){ return ipValor('ipreceta'); }
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
    if(!o){ o={parcela:m.parcela, lote:m.lote, cultivo:m.cultivo, campania:m.campania, zona:m.zona, campo:m.campo,
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

// Insumos de un lote, agrupados por (insumo, unidad) — un mismo insumo registrado en dos unidades
// distintas nunca se suma en una sola cantidad. Se extrajo de ipDetalleParcela() sin cambiarle una
// coma, para poder reusarlo tambien en los contadores del seguimiento de receta, que necesitan el
// estado de TODOS los lotes y no solo del que este abierto.
// dosisRealHa es la UNICA fuente de verdad de la dosis real: el mismo numero que imprime la columna
// "Dosis Real" es el que se pasa a la comparacion con receta. No se recalcula en ningun otro lado.
function ipInsumosDeParcela(p){
  const porInsumo = new Map();
  p.movs.forEach(m=>{
    const k = m.insumo+'|'+m.unidad;
    if(!porInsumo.has(k)) porInsumo.set(k, {insumo:m.insumo, unidad:m.unidad, cantidad:0, costo:0, fechas:new Set(), ots:new Set()});
    const o = porInsumo.get(k);
    o.cantidad += m.cantidad; o.costo += m.costoTotal;
    if(m.fecha) o.fechas.add(ipFecha(m.fecha));
    if(m.otRef) o.ots.add(m.otRef);
  });
  return [...porInsumo.values()].sort((a,b)=>b.costo-a.costo).map(i=>{
    const dosisRealHa = p.ha ? i.cantidad/p.ha : null;
    return Object.assign({}, i, {dosisRealHa, receta: evaluarDosisContraReceta(D.recetas,
      {campania:p.campania, cultivo:p.cultivo, insumo:i.insumo, unidad:i.unidad, dosisRealHa})});
  });
}
// Un lote entra en el listado si alguno de sus insumos esta en el estado de receta seleccionado.
function ipInsumosVisibles(lista){
  const est = ipEstadoRecetaSel();
  return est==='ALL' ? lista : lista.filter(i=>i.receta.estadoReceta===est);
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

  // ---- Seguimiento de receta ----
  // Los contadores se calculan sobre TODOS los lotes que dejan pasar los filtros del módulo, no
  // sobre el lote abierto ni sobre las filas visibles en pantalla. El filtro "Estado de receta" se
  // excluye a propósito del propio conteo (mismo criterio que el resto de los filtros del módulo,
  // que nunca limitan su propia lista): así el resumen sigue mostrando el panorama completo y se
  // puede volver a otro estado sin limpiar antes el filtro.
  const parcelasTodas = ipAgruparParcelas(movs);
  const insumosPorParcela = new Map();
  parcelasTodas.forEach(p=>insumosPorParcela.set(p.parcela, ipInsumosDeParcela(p)));
  const conteoReceta = new Map(RECETA_ESTADOS_ORDEN.map(e=>[e,0]));
  let recetaSinDosis = 0, recetaFilas = 0;
  insumosPorParcela.forEach(lista=>lista.forEach(i=>{
    recetaFilas++;
    const e = i.receta.estadoReceta;
    if(e==null){ recetaSinDosis++; return; }
    conteoReceta.set(e, (conteoReceta.get(e)||0)+1);
  }));
  const conReceta = (conteoReceta.get(RECETA_ESTADO.SOBRE)||0)+(conteoReceta.get(RECETA_ESTADO.BAJO)||0)
    +(conteoReceta.get(RECETA_ESTADO.TOLERANCIA)||0)+(conteoReceta.get(RECETA_ESTADO.SEGUN)||0);
  const ipRec = document.getElementById('ip-receta');
  if(!D.recetas || !D.recetas.disponible){
    ipRec.innerHTML = '<div class="rc-nodisp">Seguimiento de receta <b>no disponible</b>: no se pudieron cargar las recetas de la campaña. '+
      'La dosis real, las cantidades y los costos no se ven afectados.</div>';
  } else {
    const chip = (lbl,n,cls,tip) => '<div class="rc-chip '+cls+'" title="'+tip+'"><span class="rc-n">'+fmt(n)+'</span><span class="rc-l">'+lbl+'</span></div>';
    ipRec.innerHTML =
      chip('Con receta', conReceta, 'rc-con', 'Insumos de lote que se pudieron comparar contra una receta de la campaña')+
      chip('Sobre receta', conteoReceta.get(RECETA_ESTADO.SOBRE)||0, 'rc-sobre', 'La dosis aplicada por hectárea superó la receta en más de '+RECETA_TOLERANCIA_PCT+'%')+
      chip('Bajo receta', conteoReceta.get(RECETA_ESTADO.BAJO)||0, 'rc-bajo', 'La dosis aplicada por hectárea quedó por debajo de la receta. La tolerancia solo aplica hacia arriba: aplicar de menos siempre se marca, aunque sea por poco')+
      chip('Dentro de tolerancia', conteoReceta.get(RECETA_ESTADO.TOLERANCIA)||0, 'rc-tol', 'Se aplicó de más, pero sin superar la tolerancia de +'+RECETA_TOLERANCIA_PCT+'% definida para la campaña')+
      chip('Según receta', conteoReceta.get(RECETA_ESTADO.SEGUN)||0, 'rc-segun', 'La dosis aplicada coincide exactamente con la de la receta')+
      chip('Sin receta', conteoReceta.get(RECETA_ESTADO.SIN)||0, 'rc-sin', 'No hay una receta inequívoca para ese cultivo e insumo: no se compara ni se estima')+
      chip('Unidad no comparable', conteoReceta.get(RECETA_ESTADO.UNIDAD)||0, 'rc-unid', 'Hay receta, pero su unidad no es de la misma magnitud que la aplicada — nunca se convierte entre kilos y litros')+
      '<div class="rc-pie">'+fmt(recetaFilas)+' insumo(s) por lote evaluados · tolerancia +'+RECETA_TOLERANCIA_PCT+'% (solo hacia arriba: aplicar de menos siempre se marca)'+
      (recetaSinDosis? ' · '+fmt(recetaSinDosis)+' sin dosis real (el lote no registra hectáreas), no se comparan':'')+'</div>';
  }

  // ---- Resumen por lote (ordenado por costo/ha: es la comparación que busca la auditoría) ----
  const estRec = ipEstadoRecetaSel();
  const parcelas = parcelasTodas
    .filter(p=>estRec==='ALL' || ipInsumosVisibles(insumosPorParcela.get(p.parcela)).length>0)
    .sort((a,b)=>(b.costoHa==null?-1:b.costoHa)-(a.costoHa==null?-1:a.costoHa) || b.costo-a.costo);
  document.getElementById('ip-parcelas-sub').textContent =
    parcelas.length+' lote(s) · hectáreas = superficie real máxima de sus OT · clic en una fila para ver su detalle'+
    (estRec==='ALL' ? '' : ' · filtrado por estado de receta «'+estRec+'»: los importes de cada lote siguen siendo los del lote completo');
  document.getElementById('ip-parcelas').innerHTML = parcelas.length ? parcelas.map(p=>{
    const abierta = ipParcelaAbierta===p.parcela;
    let html = `<tr class="ip-parcela${abierta?' open':''}" data-parcela="${encodeURIComponent(p.parcela)}">`+
      `<td class="lname"><span class="ip-caret">${abierta?'▾':'▸'}</span> ${p.lote} <span class="ip-nota">${p.parcela}</span></td>`+
      `<td>${p.cultivo}</td>`+
      `<td class="tr mono">${p.ha!=null?fmt2(p.ha):'<span class="ip-sin">—</span>'}</td>`+
      `<td class="tr mono">${p.nOT}</td><td class="tr mono">${p.nInsumos}</td>`+
      `<td class="tr mono col-tot">US$ ${fmtUSD(p.costo)}</td>`+
      `<td class="tr mono">${ipCelda(p.costoHa, p.ha, v=>'US$ '+fmtUSD(v))}</td></tr>`;
    if(abierta) html += ipDetalleParcela(p, insumosPorParcela.get(p.parcela));
    return html;
  }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px">Sin aplicaciones para los filtros seleccionados</td></tr>';

}

// Detalle de un lote: qué insumos se usaron, cuánto de cada uno, por hectárea, cuánto costaron, en
// qué fechas, qué órdenes los originaron, y cómo se compara la dosis aplicada contra la receta de
// la campaña. Son las mismas 7 columnas de la tabla de lotes: las fechas y las OT pasaron a una
// segunda línea dentro de la celda del insumo —no se perdió ningún dato— para dejar lugar a dosis
// de receta, desvío y estado.
// Acá NO hay ninguna fórmula de comparación: la dosis de receta, el desvío y el estado llegan ya
// resueltos por evaluarDosisContraReceta() (js/data/recetas.js).
function ipDetalleParcela(p, listaCompleta){
  const lista = ipInsumosVisibles(listaCompleta || ipInsumosDeParcela(p));
  const estRec = ipEstadoRecetaSel();
  let html = `<tr class="dethead"><td colspan="7">Insumos utilizados en el lote ${p.lote} · ${lista.length} insumo(s)`+
    (estRec==='ALL'?'':' en estado «'+estRec+'»')+` · ${p.nOT} orden(es) de trabajo`+
    (p.ha!=null?` · superficie ${fmt2(p.ha)} ha`:' · sin hectáreas reales disponibles')+`</td></tr>`;
  html += `<tr class="detcols"><td>Insumo · fechas y órdenes</td><td>Cantidad</td><td class="tr">Dosis Real</td>`+
    `<td class="tr">Dosis Receta</td><td class="tr">Desvío</td><td class="tr">Estado</td><td class="tr">Costo</td></tr>`;
  html += lista.map(i=>{
    const r = i.receta;
    // La dosis de receta se imprime con la MISMA unidad que la dosis real de la fila (ya convertida
    // cuando hizo falta, ton -> kg). Así una misma fila nunca alterna "Kilos/ha" con "kg/ha".
    const dosisReceta = r.dosisRecetaComparable!=null
      ? fmtCantidadUnidad(r.dosisRecetaComparable, i.unidad)+'/ha'
      : (r.recetaEncontrada && r.dosisRecetaHa!=null
          ? `<span class="rc-crudo" title="La receta está en «${r.unidadReceta||'sin unidad'}», que no es comparable con ${i.unidad}">${fmt2(r.dosisRecetaHa)} ${r.unidadReceta||''}/ha</span>`
          : '<span class="ip-sin">—</span>');
    const desvio = (r.desvioAbsoluto!=null)
      ? `<span class="${r.desvioAbsoluto>0?'rc-up':(r.desvioAbsoluto<0?'rc-down':'')}">${r.desvioPct!=null?fmtPctFirmado(r.desvioPct):'—'}</span>`+
        `<div class="rc-abs">${fmtCantidadUnidad(r.desvioAbsoluto, i.unidad)}/ha</div>`
      : '<span class="ip-sin">—</span>';
    const estado = r.estadoReceta
      ? `<span class="rc-est ${RECETA_ESTADO_CLASE[r.estadoReceta]||''}" title="${ipTipReceta(r,i)}">${r.estadoReceta}</span>`
      : '<span class="ip-sin" title="El lote no registra hectáreas reales: sin dosis real no hay comparación posible">—</span>';
    return `<tr class="det"><td class="dl">${i.insumo}<div class="ip-nota">${[...i.fechas].join(' · ')} — ${[...i.ots].join(' · ')}</div></td>`+
      `<td class="qty-unit">${fmtCantidadUnidad(i.cantidad,i.unidad)}</td>`+
      // La cantidad por hectárea lleva SIEMPRE su unidad real ("142,73 Kilos/ha"), igual que la
      // cantidad total de la celda anterior: un número suelto no se puede
      // interpretar cuando el lote mezcla insumos en kilos, litros y unidades.
      `<td class="tr mono qty-unit">${ipCelda(i.dosisRealHa, p.ha, v=>fmtCantidadUnidad(v,i.unidad)+'/ha')}</td>`+
      `<td class="tr mono qty-unit">${dosisReceta}</td>`+
      `<td class="tr mono">${desvio}</td>`+
      `<td class="tr">${estado}</td>`+
      `<td class="tr mono">US$ ${fmtUSD(i.costo)}<div class="rc-abs">${ipCelda(i.costo/(p.ha||1), p.ha, v=>'US$ '+fmtUSD(v)+'/ha')}</div></td></tr>`;
  }).join('');
  return html;
}
// Clase CSS por estado (colores en css/auditoria.css).
const RECETA_ESTADO_CLASE = {
  'Sobre receta':'rc-e-sobre', 'Bajo receta':'rc-e-bajo', 'Dentro de tolerancia':'rc-e-tol',
  'Según receta':'rc-e-segun', 'Sin receta':'rc-e-sin', 'Unidad no comparable':'rc-e-unid',
};
// Explicación del estado, en el tooltip: por qué se comparó contra esa receta, o por qué no se pudo.
function ipTipReceta(r, i){
  if(r.estadoReceta===RECETA_ESTADO.SIN){
    if(r.motivo==='sin_indice') return 'No se pudieron cargar las recetas de la campaña';
    if(r.motivo==='ambigua') return 'El presupuesto trae este producto con más de una dosis para el mismo cultivo: no se elige ninguna';
    return 'El presupuesto de la campaña no tiene una receta para este cultivo e insumo';
  }
  if(r.estadoReceta===RECETA_ESTADO.UNIDAD)
    return 'Receta «'+(r.recetaInsumo||'')+'» en '+(r.unidadReceta||'sin unidad')+': no es comparable con '+i.unidad+', y nunca se convierte entre magnitudes distintas';
  const base = 'Receta «'+(r.recetaInsumo||'')+'»'+(r.recetaGrupo?' ('+r.recetaGrupo+')':'')+' — '+fmt2(r.dosisRecetaHa)+' '+(r.unidadReceta||'')+'/ha';
  if(r.estadoReceta===RECETA_ESTADO.TOLERANCIA) return base+'. Se aplicó de más, sin superar la tolerancia de +'+RECETA_TOLERANCIA_PCT+'% de la campaña';
  return base;
}
// Porcentaje con signo explícito: "+1,33%" se lee distinto de "1,33%" cuando lo que importa es de
// qué lado de la receta quedó la aplicación.
function fmtPctFirmado(v){ return (v>0?'+':'')+fmt2(v)+'%'; }

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
// ---- Combustible: balance Ingreso vs Consumo + consumo por Uso / Detalle ----
// Qué fila del Consumo está desplegada (clave usoOrigen|usoKey, ver renderCombustible). Vive acá
// y no en el DOM porque la tabla se regenera completa en cada cambio de filtro — mismo patrón que
// ipParcelaAbierta en la Auditoría de Insumos por Parcela.
let combUsoAbierto = null;
// Escape mínimo para meter texto del Excel dentro del HTML que arma esta página. Las observaciones
// de OT son texto libre cargado en Albor: hoy ninguna trae < > & o comillas (verificado sobre las
// 449 observaciones del archivo), pero cualquier carga futura podría traerlas y romper la tabla o
// el atributo title.
function escHtml(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(v){ return escHtml(v).replace(/"/g,'&quot;'); }
function renderCombustible(){
  const mesV=document.getElementById('cmes').value, mes=mesV==='ALL'?'ALL':parseInt(mesV);
  const tercV=document.getElementById('cterc').value;
  const maqV=document.getElementById('cmaq').value;
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
    `<div class="kpi"><div class="k-lab">Balance</div><div class="k-val c-${balCol}">${fmt2(balance)}<small> L</small></div><div class="k-foot">${balance>=0?'Queda stock disponible':'Stock consumido en exceso'}</div></div>`;

  // ---- Ingresos de Combustible (arriba): solo respeta el filtro de Mes ----
  const byIng={};
  ingresoMes.forEach(r=>{ if(!byIng[r.quien]) byIng[r.quien]={quien:r.quien,n:0,litros:0}; const o=byIng[r.quien]; o.n+=r.n; o.litros+=r.litros; });
  const rowsIng=Object.values(byIng).sort((a,b)=>b.litros-a.litros);
  const mxIng=Math.max(1,...rowsIng.map(r=>r.litros));
  document.getElementById('combingbody').innerHTML = rowsIng.length ? rowsIng.map(r=>
    `<tr><td><b>${r.quien}</b></td><td class="tr mono">${r.n}</td><td class="tr mono">${fmt2(r.litros)}</td><td class="tr"><div class="sopbar"><div style="width:${r.litros/mxIng*100}%"></div></div></td><td class="tr mono">${totIngresoMes?(r.litros/totIngresoMes*100).toFixed(1):0}%</td></tr>`
  ).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">Sin ingresos de stock en el período</td></tr>';

  // ---- Consumo de Combustible (abajo): agrupado por Uso / Detalle ----
  // La agrupación ya viene resuelta en D.combustible_uso (Mes + Uso / Detalle, ver
  // js/data/combustible.js): acá NO se cruza nada contra consultaOT ni se decide de dónde sale el
  // texto del uso — solo se filtra por Mes/Tercero y se presenta.
  // Se reagrupa a partir de los movimientos individuales de cada grupo (y no de sus totales ya
  // sumados) por una sola razón: el filtro de Tercero es por movimiento. Un único camino de
  // agrupación evita que la tabla filtrada y la sin filtrar se calculen de dos maneras distintas;
  // los litros son los mismos valores, así que "Toda la Campaña" da exactamente el mismo total que
  // el KPI de Consumo.
  const usoMes = mes==='ALL' ? D.combustible_uso : D.combustible_uso.filter(g=>g.mesnum===mes);
  // "Labor Propia" sigue siendo el rótulo del FILTRO de Tercero (proveedor vacío) porque ese filtro
  // no cambió — lo que dejó de usarse es como etiqueta del uso del combustible en la tabla.
  const quienDeMov = m => m.tercero ? m.tercero : 'Labor Propia';
  const byUso={};
  usoMes.forEach(g=>{ g.movs.forEach(m=>{
    if(tercV!=='ALL' && quienDeMov(m)!==tercV) return;
    // Filtro de Máquina: por movimiento, igual que el de Tercero. m.maquinaId llega ya resuelto
    // desde el modelo — acá no se lee ninguna observación ni se reconoce ningún texto.
    if(maqV!=='ALL' && m.maquinaId!==maqV) return;
    const key=g.usoOrigen+'|'+g.usoKey;
    if(!byUso[key]) byUso[key]={uso:g.uso,usoOrigen:g.usoOrigen,usoKey:g.usoKey,
      tipoVinculo:g.tipoVinculo,esOT:g.esOT,maquina:g.maquina,maquinaId:g.maquinaId,n:0,litros:0,movs:[]};
    const o=byUso[key]; o.n++; o.litros+=m.litros; o.movs.push(m);
  }); });
  const rowsC=Object.values(byUso)
    .map(o=>({...o, litros:Math.round(o.litros*100)/100,
      movs:o.movs.slice().sort((a,b)=>(b.fecha-a.fecha)||(b.litros-a.litros))}))
    .sort((a,b)=>b.litros-a.litros);
  const tot=rowsC.reduce((s,r)=>s+r.litros,0);
  const maqTxt=maqV==='ALL'?'':document.getElementById('cmaq').selectedOptions[0].text;
  document.getElementById('cnote').textContent=selTxt+(tercV!=='ALL'?' · Tercero: '+tercV:'')+(maqV!=='ALL'?' · Máquina: '+maqTxt:'');
  // Control discreto de trazabilidad, en el subtítulo del panel: cómo se atribuyeron los
  // movimientos del período. No es un KPI nuevo, es una línea de texto. Solo se nombran los
  // niveles que realmente tienen movimientos, para no llenarla de ceros.
  const nMov=rowsC.reduce((s,r)=>s+r.n,0);
  const porVinculo={};
  rowsC.forEach(r=>{ porVinculo[r.tipoVinculo]=(porVinculo[r.tipoVinculo]||0)+r.n; });
  const ordenVinculo=[VINCULO_OT,VINCULO_CONTRATISTA,VINCULO_OT_NO_DISPONIBLE,VINCULO_LABOR_PROPIA];
  const desglose=ordenVinculo.filter(v=>porVinculo[v]).map(v=>VINCULO_LABEL[v]+': '+porVinculo[v]).join(' · ');
  document.getElementById('comb-uso-sub').textContent =
    nMov ? fmtMovimientos(nMov)+' · '+desglose+' · clic en una fila para ver su detalle'
         : 'Sin movimientos en el período';
  const mx=Math.max(1,...rowsC.map(r=>r.litros));
  document.getElementById('combbody').innerHTML = rowsC.length ? rowsC.map(r=>{
    const clave=r.usoOrigen+'|'+r.usoKey;
    const abierta=combUsoAbierto===clave;
    // Chip del origen de la atribución: los cuatro niveles se distinguen de un vistazo y ninguno
    // se hace pasar por otro. El texto sale de VINCULO_LABEL (config.js), única fuente del rótulo.
    const chipVinc=`<span class="chip chip-vinc-${r.tipoVinculo}">${VINCULO_LABEL[r.tipoVinculo]||r.tipoVinculo}</span>`;
    // Observaciones largas (hay una de 349 caracteres en el dato real): la celda trunca con
    // ellipsis por CSS y el texto completo queda en el title. Nunca se recorta el dato en sí.
    let html=`<tr class="cu-fila${abierta?' open':''}" data-uso="${encodeURIComponent(clave)}">`+
      `<td class="cu-uso" title="${escAttr(r.uso)}"><span class="ip-caret">${abierta?'▾':'▸'}</span> `+
      `<b>${escHtml(r.uso)}</b> ${chipVinc}</td>`+
      `<td class="tr mono">${r.n}</td><td class="tr mono">${fmt2(r.litros)}</td>`+
      `<td class="tr"><div class="sopbar"><div style="width:${r.litros/mx*100}%"></div></div></td>`+
      `<td class="tr mono">${tot?(r.litros/tot*100).toFixed(1):0}%</td></tr>`;
    if(abierta) html+=combDetalleUso(r);
    return html;
  }).join('')+combFilaTotal(nMov, tot)
   : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">Sin registros de combustible para el filtro seleccionado</td></tr>';
}
// Fila de total al pie del Consumo. Es la suma de lo que se está viendo, no un dato nuevo: con los
// filtros en "Todas" coincide exactamente con el KPI de Consumo, y con un filtro activo (Mes,
// Tercero o Máquina) es el único lugar donde se lee el total de esa selección — el KPI de arriba
// sigue mostrando el consumo completo de la campaña, que es lo correcto para un KPI pero deja sin
// respuesta "cuánto gastó esta máquina". Los valores llegan ya sumados desde renderCombustible;
// acá no se recalcula nada.
function combFilaTotal(nMov, litros){
  return `<tr class="cu-total"><td>Total</td>`+
    `<td class="tr mono">${nMov}</td>`+
    `<td class="tr mono">${fmt2(litros)}</td>`+
    `<td></td><td class="tr mono">100,0%</td></tr>`;
}
// Detalle de un Uso / Detalle: los movimientos individuales que lo componen. Las columnas cambian
// según el origen de la atribución, para no mostrar columnas vacías ni —sobre todo— datos de OT
// que no existen. Acá NO se resuelve ningún vínculo: todo llega decidido desde
// js/data/combustible.js.
//  - OT vinculada       : Fecha · OT | Estadio | Lote | Retiró | Litros. No se muestra "Labor"
//    porque en estas OT el campo Servicio viene SIEMPRE vacío — el Estadio es el dato que sí
//    describe el trabajo. Tampoco Campo, que es siempre "LA TERESA". El Cultivo queda en el title
//    del Lote (el texto ya incluye el lote: "LA TERESA 211 ARROZ 26/27"), y en su lugar se muestra
//    "Retiró", que es el `personal` de la OT: en estas OT el Contratista viene siempre vacío y este
//    es el campo que registra quién cargó el combustible.
//  - OT no disponible   : Fecha | Referencia de origen | OT | Campaña | Litros. La referencia de
//    origen es el dato clave: dice de qué OT salió el combustible aunque su registro no esté en el
//    export. La columna OT dice "No disponible" — nunca un número inventado. No se muestran
//    Servicio, Cultivo, Campo ni Lote porque para estos movimientos no existen.
//  - Solo contratista / Labor Propia : Fecha | Comprobante | Tipo de comprobante | Campaña |
//    Litros, que es todo lo que el movimiento trae.
function combDetalleUso(g){
  const esOT = g.tipoVinculo===VINCULO_OT;
  const esOTNoDisp = g.tipoVinculo===VINCULO_OT_NO_DISPONIBLE;
  const cols = esOT ? ['Fecha · OT','Estadio','Lote','Retiró','Litros']
    : esOTNoDisp ? ['Fecha','Referencia de origen','OT','Campaña','Litros']
    : ['Fecha','Comprobante','Tipo de comprobante','Campaña','Litros'];
  // La máquina es una propiedad del grupo (todos sus movimientos comparten la misma observación),
  // así que va en la cabecera del detalle y no como una sexta columna que no entraría en la tabla.
  const maqTxt = g.maquinaId ? ' · '+escHtml(g.maquina) : '';
  let html=`<tr class="dethead"><td colspan="5">${escHtml(g.uso)} · ${VINCULO_LABEL[g.tipoVinculo]||''}${maqTxt} · ${fmtMovimientos(g.n)} · ${fmt2(g.litros)} L</td></tr>`;
  html+=`<tr class="detcols">`+cols.map((c,i)=>`<td${i===4?' class="tr"':''}>${c}</td>`).join('')+`</tr>`;
  const guion='<span class="ip-sin">—</span>';
  html+=g.movs.map(m=>{
    const litros=`<td class="tr mono">${fmt2(m.litros)}</td>`;
    if(esOT) return `<tr class="det"><td class="dl">${ipFecha(m.fecha)} · <b>OT ${escHtml(m.ot)}</b></td>`+
      `<td>${escHtml(m.estadio)||guion}</td>`+
      `<td title="${escAttr(m.cultivo)}">${escHtml(m.lote)||guion}</td>`+
      `<td>${escHtml(m.personal)||guion}</td>${litros}</tr>`;
    if(esOTNoDisp) return `<tr class="det"><td class="dl">${ipFecha(m.fecha)}</td>`+
      `<td class="mono">${escHtml(m.referenciaOrigen)||guion}</td>`+
      `<td><span class="ip-sin">No disponible</span></td>`+
      `<td>${escHtml(m.campania)||guion}</td>${litros}</tr>`;
    return `<tr class="det"><td class="dl">${ipFecha(m.fecha)}</td>`+
      `<td class="mono">${escHtml(m.referencia)||guion}</td>`+
      `<td>${escHtml(m.tipoComp)||guion}</td>`+
      `<td>${escHtml(m.campania)||guion}</td>${litros}</tr>`;
  }).join('');
  return html;
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
// Cultivo elegido en el filtro (clave normalizada, ver cultivoDeOT en js/data/servicios.js).
function cultivoSeleccionado(){ const sel=document.getElementById('gcultivo'); return sel?sel.value:'ALL'; }
// Paquete sobre el que se DIBUJA el módulo: el de la campaña activa, ya recalculado para el
// cultivo elegido. El filtro de Cultivo no esconde filas ya sumadas: vuelve a sumar cada grupo
// sobre sus propias OT de ese cultivo, con las mismas funciones del modelo (ver
// filtrarServiciosPorCultivo, js/data/servicios.js). Con "Todos" devuelve el paquete original tal
// cual, sin recalcular nada. Lo usan renderG, renderLaborDetalle y renderGasoil — nunca
// serviciosActivos() directo, para que los tres muestren siempre el mismo conjunto.
// poblarFiltrosServicios() sí usa serviciosActivos(): las opciones de los selectores son las de la
// campaña completa y no dependen del cultivo elegido (elegir un cultivo no reinicia los demás filtros).
function serviciosFiltrados(){ return filtrarServiciosPorCultivo(serviciosActivos(), cultivoSeleccionado()); }
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
  // Cultivo: opciones reales de la campaña seleccionada, con ARROZ/SOJA/SORGO/MAIZ primero y el
  // resto alfabético (el orden lo define construirServicios, acá solo se vuelca). Si el cultivo
  // que estaba elegido no existe en la campaña nueva, llenar() lo devuelve solo a "Todos".
  llenar('gcultivo', (S.cultivos_labor||[]).map(c=>({val:c.val,lbl:c.lbl})), v=>v.lbl);
  // Labor / Etapa / Contratista: opciones de toda la campaña seleccionada, no dependen del mes
  llenar('glabor', S.labores.map(l=>({val:l})), v=>v.val);
  llenar('gestadio', S.estadios_labor.map(e=>({val:e})), v=>v.val);
  llenar('gcontratista', S.contratistas_labor.map(c=>({val:c})), v=>labelContratista(v.val));
}
// Cambio de campaña: primero se repueblan los filtros dependientes (Mes/Labor/Etapa/Contratista),
// recién después se re-renderiza — mismo patrón que el filtro dependiente de Insumos.
function cambiarCampaniaServicios(){ poblarFiltrosServicios(); renderG(); }
function renderG(){
  const S=serviciosFiltrados();
  const selV=document.getElementById('gmes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const mt=monthTotals(S); const recs=sel==='ALL'?S.gastos:S.gastos.filter(r=>r.mesnum===sel);
  const by={}; recs.forEach(r=>{ if(!by[r.labor])by[r.labor]={labor:r.labor,esH:r.esH,n:0,ha:0,horas:0,prop:0,terc:0,ins:0};
    const o=by[r.labor];o.n+=r.n;o.ha+=r.ha;o.horas+=r.horas;o.prop+=r.propia;o.terc+=r.tercero;o.ins+=r.insumos; });
  const labs=Object.values(by).map(o=>({...o,tot:o.prop+o.terc+o.ins})).sort((a,b)=>b.tot-a.tot);
  const gasto=labs.reduce((s,l)=>s+l.tot,0), nOT=labs.reduce((s,l)=>s+l.n,0);
  const totTerc=labs.reduce((s,l)=>s+l.terc,0), totIns=labs.reduce((s,l)=>s+l.ins,0);
  const K=[['Gasto Total (servicios)','US$ '+fmtUSD(gasto),''],['OT Confirmadas',nOT,'con labor'],['Labores Ejecutadas',labs.length,'tipos de labor'],
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

// Qué fila del Detalle por Servicio está desplegada. Vive acá y no en el DOM porque la tabla se
// regenera entera en cada cambio de filtro — mismo patrón que ipParcelaAbierta (Auditoría) y
// combUsoAbierto (Combustible). Una sola fila abierta a la vez: abrir otra cierra la anterior.
let servFilaAbierta = null;
// Identificador estable de una fila: es la MISMA clave con que renderLaborDetalle agrupa (labor +
// estadio + contratista + unidad de trabajo), así que no depende del orden de la tabla ni de los
// filtros activos.
const claveFilaServicio = l => l.labor+'|'+l.estadio+'|'+l.contratista+'|'+l.unidadTrabajo;
// Unidades medidas de la columna "Trabajo Ejecutado". `chip` (columna Servicio) y `unid` (columna
// Trabajo Ejecutado) usan el MISMO color por unidad — ver las variables --u-ha/--u-hrs/--u-kg en
// gastos.css, única fuente de esos tres colores. 'ins' y 'trabajos' no entran acá: son conteos, no
// unidades de medida, y por eso no llevan chip.
const U_TRABAJO={ha:{txt:'ha',chip:'chip-ha',unid:'tw-unid-ha'},
  hrs:{txt:'hrs',chip:'chip-hr',unid:'tw-unid-hrs'},
  kg:{txt:'kg',chip:'chip-kg',unid:'tw-unid-kg'}};
// "Trabajo Ejecutado" — ÚNICA implementación del formato de esa celda. La usan la fila principal
// del Detalle por Servicio y cada OT de su desplegable, así que el desplegable no puede mostrar
// otra unidad ni otra regla que la fila que lo contiene. Acá NO hay ninguna fórmula: los cinco
// valores llegan ya resueltos desde el modelo (hectáreas, horas, kilos, líneas de insumo de
// Tratamiento de semillas y trabajos de Camión + grúa); esta función solo elige cuál mostrar
// según la unidad del grupo y le pone su rótulo.
function celdaTrabajoEjecutado(unidadTrabajo, v, sinEjec){
  // Servicios sin trabajo ejecutado medible (solo se usan insumos, ver
  // SERVICIOS_SIN_TRABAJO_EJECUTADO en config.js): la celda queda en "—", nunca en 0,00.
  if(sinEjec) return '<span class="tw-sin" title="Solo se usan insumos: la OT no registra trabajo ejecutado">—</span>';
  // Conteo de líneas de insumo (SERVICIOS_TRABAJO_MEDIDO_EN_INSUMOS): sin chip de unidad ni
  // decimales, y nunca junto a las hectáreas, que para estas labores no describen el trabajo.
  if(unidadTrabajo==='ins') return `${v.ins} <span class="tw-unid tw-unid-ins" title="Líneas de insumo aplicadas en las OT de esta labor">${v.ins===1?'insumo utilizado':'insumos utilizados'}</span>`;
  // Camión + grúa: cantidad de trabajos (bloques de 6 h de jornada). La cuenta llega resuelta por
  // OT desde el modelo (calcularTrabajosCamionGrua, ordenes.js): acá no se vuelve a aplicar.
  if(unidadTrabajo==='trabajos') return `${v.trabajos} <span class="tw-unid tw-unid-trabajos" title="Cada bloque de 6 horas de jornada es un trabajo (el límite inferior es inclusivo: 6 h ya son 2 trabajos)">${v.trabajos===1?'trabajo':'trabajos'}</span>`;
  const u=U_TRABAJO[unidadTrabajo]||U_TRABAJO.ha;
  const val=unidadTrabajo==='hrs'?v.horas:(unidadTrabajo==='kg'?v.kg:v.ha);
  return `${fmt2(val)} <span class="tw-unid ${u.unid}">${u.txt}</span>`;
}
// Desplegable de una fila: las OT individuales que la componen. NO vuelve a leer consultaOT ni
// recalcula nada — recorre `l.ots`, el resumen que construirServicios() (js/data/servicios.js)
// dejó guardado sobre las OT YA agrupadas por agruparOTS(), así que una OT con varias líneas
// (servicio + labor + insumos) aparece una sola vez. El costo total de cada OT es su aporte real
// al grupo: Labor Propia + Labor Tercero + Insumos, sin redondear antes de sumar.
function svDetalleOTs(l, sinEjec){
  const ots=ordenarOTsServicio(l.ots||[]);
  const filas=ots.map(o=>{
    const ejec=celdaTrabajoEjecutado(l.unidadTrabajo,{ha:o.ha,horas:o.horas,kg:o.kg,ins:o.n_insumos,trabajos:o.trabajos},sinEjec);
    return `<tr><td class="mono"><b>${escHtml(o.ot)}</b></td><td class="mono">${ipFecha(o.fr)}</td>`+
      `<td>${escHtml(o.cultivo)}</td><td>${escHtml(o.lote)||'<span class="ip-sin">—</span>'}</td>`+
      `<td class="tr mono">${ejec}</td>`+
      `<td class="tr mono col-tot">US$ ${fmtUSD(o.propia+o.tercero+o.insumos)}</td></tr>`;
  }).join('');
  return `<tr class="sv-det"><td colspan="8"><div class="sv-det-tit">${ots.length} orden(es) de trabajo · ${escHtml(l.labor)} · ${escHtml(l.estadio)}</div>`+
    `<div class="sv-det-wrap"><table class="sv-ots"><thead><tr><th>OT</th><th>Fecha</th><th>Cultivo</th><th>Lote</th>`+
    `<th class="tr">Trabajo Ejecutado</th><th class="tr">Costo Total</th></tr></thead><tbody>${filas}</tbody></table></div>`+
    `</td></tr>`;
}
// ---- Detalle por Servicio: filtros de Servicio, Estadio y Contratista, afectan SOLO esta tabla ----
// (los KPIs, ranking y resumen por mes de arriba siguen agregando por labor sin importar la
// etapa/contratista, tal como antes; acá se desglosa además por Estadio y por Contratista real
// (campo "contratista" de consultaOT) para poder aislar en qué etapa y con qué contratista se
// ejecutó una labor puntual — antes la columna "Propia / Tercero" mezclaba, en la misma fila,
// OT de más de un contratista real (~19% de los grupos labor+etapa); ahora cada fila de la tabla
// pertenece a un único contratista, o a "No aplica"/"Sin contratista" cuando corresponde).
function renderLaborDetalle(){
  const S=serviciosFiltrados();
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
    if(!by[key]) by[key]={labor:r.labor,estadio:r.estadio,contratista:r.contratista,esH:r.esH,unidadTrabajo:r.unidadTrabajo,n:0,ha:0,horas:0,kg:0,ins_lineas:0,trabajos:0,prop:0,terc:0,ins:0,ots:[]};
    // trabajos (Camión + grúa) se SUMA como los demás acumuladores: la cuenta ya viene resuelta por
    // jornada desde el modelo (agruparOTS → servicios.js) y acá nunca se recalcula la fórmula.
    // `ots` se concatena por el mismo motivo: son los resúmenes de OT que ya trae cada grupo del
    // modelo. Esta tabla une los grupos de varios meses, así que la lista se reordena al mostrarla
    // (ordenarOTsServicio, mismo criterio del modelo). Una OT pertenece a un solo grupo, nunca a dos.
    const o=by[key]; o.n+=r.n; o.ha+=r.ha; o.horas+=r.horas; o.kg+=r.kg; o.ins_lineas+=r.ins_lineas; o.trabajos+=(r.trabajos||0); o.prop+=r.propia; o.terc+=r.tercero; o.ins+=r.insumos; o.ots=o.ots.concat(r.ots||[]); });
  const labs=Object.values(by).map(o=>({...o,tot:o.prop+o.terc+o.ins})).sort((a,b)=>b.tot-a.tot);
  // Si la fila que estaba desplegada ya no forma parte del resultado (cambió Campaña, Mes,
  // Cultivo, Servicio, Estadio o Contratista), se cierra sola: nunca queda abierto un detalle que
  // corresponde a un filtro anterior.
  if(servFilaAbierta && !labs.some(l=>claveFilaServicio(l)===servFilaAbierta)) servFilaAbierta=null;
  document.getElementById('gld-sub').textContent=labs.length+' combinación(es) servicio/estadio/contratista · ordenado por costo total · clic en una fila para ver sus OT';
  document.getElementById('gld').innerHTML= labs.length ? labs.map(l=>{
    // "Trabajo Ejecutado": una sola columna con la cantidad ejecutada en la unidad propia de ese
    // trabajo (l.unidadTrabajo, ver dmap en js/data/servicios.js). Nunca se convierte ni se suma
    // entre unidades. El formato de la celda lo resuelve celdaTrabajoEjecutado(), la misma función
    // que usa cada OT del desplegable.
    const sinEjec=SERVICIOS_SIN_TRABAJO_EJECUTADO.includes(normHdr(l.labor));
    const ejec=celdaTrabajoEjecutado(l.unidadTrabajo,{ha:l.ha,horas:l.horas,kg:l.kg,ins:l.ins_lineas,trabajos:l.trabajos},sinEjec);
    // El chip de unidad de la columna Servicio solo existe para las tres unidades MEDIDAS: sin
    // trabajo ejecutado no hay unidad que rotular, y 'ins'/'trabajos' son conteos, no unidades.
    const u=U_TRABAJO[l.unidadTrabajo];
    const chip=(sinEjec||!u)?'':`<span class="chip ${u.chip}">${u.txt}</span>`;
    const contratistaTxt=labelContratista(l.contratista);
    // La fila es desplegable: el caret ▸/▾ va en la celda de "OT Conf." (no hay columna extra de
    // "Ver detalle") y el clic se atiende delegado sobre #gld, ver js/events.js.
    const clave=claveFilaServicio(l);
    const abierta=servFilaAbierta===clave;
    // Labor Propia no tiene costo de tercero asignado en el sistema (siempre US$ 0 en la columna
    // "Labor Tercero") — no hay columna de costo separada para Labor Propia en esta tabla.
    let html=`<tr class="sv-fila${abierta?' open':''}" data-fila="${encodeURIComponent(clave)}"><td><span class="lname">${l.labor}</span> ${chip}</td><td><span class="chip chip-etapa">${l.estadio}</span></td><td class="tr mono"><span class="ip-caret">${abierta?'▾':'▸'}</span> ${l.n}</td><td class="tr mono">${ejec}</td><td class="tr mono col-terc">US$ ${fmtUSD(l.terc)}</td><td class="col-contratista" title="${contratistaTxt}">${contratistaTxt}</td><td class="tr mono col-ins">US$ ${fmtUSD(l.ins)}</td><td class="tr mono col-tot">US$ ${fmtUSD(l.tot)}</td></tr>`;
    if(abierta) html+=svDetalleOTs(l, sinEjec);
    return html;
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px">Sin registros para el filtro seleccionado</td></tr>';
}

// ---- Consumo de Gasoil por Área ----
function renderGasoil(){
  const S=serviciosFiltrados();
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
