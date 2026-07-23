// ================== RENDER ==================
function renderAll(){
  const fd=D.fecha_datos;
  const fdTxt=('0'+fd.getDate()).slice(-2)+'/'+('0'+(fd.getMonth()+1)).slice(-2)+'/'+fd.getFullYear();
  document.getElementById('t-date').textContent='Datos al '+fdTxt;
  document.getElementById('b-prob').textContent=D.problemas.length;
  document.getElementById('b-exc').textContent=D.exc_kpi.n;
  document.getElementById('b-al').textContent=D.n_ot_atrasadas;
  // TAB1 cultivos
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
    return `<div class="cult-card">
      <div class="cc-name">${c.nombre}</div>
      ${c.etapa_actual?`<div class="cc-stage">Etapa actual: <b>${c.etapa_actual}</b></div>`:'<div class="cc-stage cc-stage-muted">Sin actividad confirmada aún</div>'}
      <div class="cc-etapas">${etapasHtml}</div>
      <div class="cc-ha"><div><span>Ha plan.</span><b>${plan}</b></div><div><span>OT conf. / total</span><b>${c.conf}/${c.conf+c.ejec+c.pend}</b></div></div></div>`;}).join('');
  document.getElementById('exec-kpis').innerHTML=
    `<div class="kpi"><div class="k-lab">Avance de Campaña</div><div class="k-val c-g">${D.avance_glob}<small>%</small></div><div class="k-foot">${D.ot_conf} de ${D.total_ot} OT confirmadas</div></div>`+
    `<div class="kpi"><div class="k-lab">Costo Ejecutado</div><div class="k-val" style="font-size:21px">US$ ${fmtUSD(D.costo_total)}</div><div class="k-foot">Solo OT confirmadas</div></div>`+
    `<div class="kpi"><div class="k-lab">Gasto No Agrícola</div><div class="k-val c-o" style="font-size:21px">US$ ${fmtUSD(D.oper_costo)}</div><div class="k-foot">${Math.round(D.oper_part)}% del total</div></div>`+
    `<div class="kpi"><div class="k-lab">Problemas Detectados</div><div class="k-val" style="color:var(--teal)">${D.problemas.length}</div><div class="k-foot">Para revisión de gestión</div></div>`;
  document.getElementById('prob-n').textContent=D.problemas.length;
  document.getElementById('probs').innerHTML=D.problemas.map(p=>
    `<div class="prob"><div class="p-left"><div class="p-tags"><span class="p-cat" style="background:${CATCOL[p.cat]}">${p.cat}</span></div>
      <div class="p-title">${p.titulo}</div><div class="p-desc">${p.desc}</div></div><div class="p-met">${p.met}</div></div>`).join('');
  document.getElementById('oper-sub').textContent=Math.round(D.oper_part)+'% del costo ejecutado · US$ '+fmtUSD(D.oper_costo);
  document.getElementById('oper').innerHTML=D.operativas.map(o=>
    `<tr><td>${o.nombre}</td><td class="tr">${o.ot}</td><td class="tr mono">US$ ${fmtUSD(o.costo)}</td><td class="tr"><div class="minibar"><div class="mb-fill f-o" style="width:${Math.min(o.part*2.5,100)}%"></div></div></td><td class="tr">${fmt1(o.part)}%</td></tr>`).join('');
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
  // TAB4 alertas
  document.getElementById('al-kpis').innerHTML=
    `<div class="ak r"><b>${D.n_ot_atrasadas}</b><span>OT ATRASADAS</span></div>`+
    `<div class="ak o"><b>${D.n_ejec_atraso}</b><span>OT EN EJECUCIÓN CON ATRASO</span></div>`+
    `<div class="ak t"><b>${D.exc_kpi.n}</b><span>LOTES CON EXCESO DE HECTÁREAS</span></div>`+
    `<div class="ak y"><b>${D.exc_kpi.n_sinrtk}</b><span>OT SIN CORRESPONDENCIA RTK</span></div>`;
  document.getElementById('al-sub').textContent=D.n_ot_atrasadas+' registros · ordenado por días de atraso';
  document.getElementById('al').innerHTML=D.alertas.map(a=>{ const sev=a.dias>60?'r':(a.dias>21?'o':'y');
    const ft=a.ft?(('0'+a.ft.getDate()).slice(-2)+'/'+('0'+(a.ft.getMonth()+1)).slice(-2)+'/'+a.ft.getFullYear()):'-';
    return `<tr class="al-${sev}"><td><span class="pill pill-${sev}">${a.dias}d</span></td><td class="mono">OT ${a.ot}</td><td>${a.act}</td><td>${a.serv}</td><td class="mono">${a.lote}</td><td>${a.cult}</td><td>${a.estado}</td><td class="mono">${ft}</td></tr>`;}).join('');
  // filtro meses
  const sel=document.getElementById('gmes'); sel.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.meses.forEach(m=>{const o=document.createElement('option');o.value=m.k;o.textContent=m.lbl;sel.appendChild(o);});
  // filtros de Detalle por Labor (Labor / Etapa) — opciones de toda la campaña, no dependen del mes
  const selLab=document.getElementById('glabor'); selLab.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.labores.forEach(l=>{const o=document.createElement('option');o.value=l;o.textContent=l;selLab.appendChild(o);});
  const selEst=document.getElementById('gestadio'); selEst.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.estadios_labor.forEach(e=>{const o=document.createElement('option');o.value=e;o.textContent=e;selEst.appendChild(o);});
  // filtros de la pestaña Combustible (Mes / Tercero)
  const selCMes=document.getElementById('cmes'); selCMes.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.combustible_meses.forEach(m=>{const o=document.createElement('option');o.value=m.k;o.textContent=m.lbl;selCMes.appendChild(o);});
  const selCTerc=document.getElementById('cterc'); selCTerc.querySelectorAll('option:not([value=ALL])').forEach(o=>o.remove());
  D.combustible_terceros.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;selCTerc.appendChild(o);});
  document.getElementById('foot').innerHTML='Datos cargados automáticamente desde datosCampania2627.xlsx · solo OT confirmadas en importes · todo importe = Unidades/Dosis × Precio Unitario · litros = Unidades/Dosis · avance por Ha ejecutadas vs plan RTK · planificación desde consultaCultivos (clave de unión: cultivo=actividad + lote normalizado) · sin datos de rendimiento ni presupuesto · no se hallaron OT canceladas.<br>Desarrollos del Sur S.A. · Producción Agrícola-Ganadera · '+fdTxt;
  renderCombustible();
  renderG();
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
  const stockInicioPeriodo = mes==='ALL' ? D.stock_inicial_combustible :
    D.stock_inicial_combustible
    + D.combustible_ingresos.filter(r=>r.mesnum<mes).reduce((s,r)=>s+r.litros,0)
    - D.combustible.filter(r=>r.mesnum<mes).reduce((s,r)=>s+r.litros,0);
  const balance=stockInicioPeriodo+totIngresoMes-totConsumoMes;
  const balCol=balance>=0?'g':'r';
  document.getElementById('comb-balance').innerHTML=
    `<div class="kpi"><div class="k-lab">Stock Inicial</div><div class="k-val c-g">${fmt2(stockInicioPeriodo)}<small> L</small></div><div class="k-foot">Campaña 26/27</div></div>`+
    `<div class="kpi"><div class="k-lab">Ingreso de Combustible</div><div class="k-val c-g">${fmt2(totIngresoMes)}<small> L</small></div><div class="k-foot">${selTxt}</div></div>`+
    `<div class="kpi"><div class="k-lab">Consumo de Combustible</div><div class="k-val c-o">${fmt2(totConsumoMes)}<small> L</small></div><div class="k-foot">${selTxt}</div></div>`+
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
  const selTxt=selV==='ALL'?'Toda la campaña':document.getElementById('gmes').selectedOptions[0].text;
  const mt=monthTotals(); const recs=sel==='ALL'?D.gastos:D.gastos.filter(r=>r.mesnum===sel);
  const by={}; recs.forEach(r=>{ if(!by[r.labor])by[r.labor]={labor:r.labor,esH:r.esH,n:0,ha:0,horas:0,prop:0,terc:0,ins:0};
    const o=by[r.labor];o.n+=r.n;o.ha+=r.ha;o.horas+=r.horas;o.prop+=r.propia;o.terc+=r.tercero;o.ins+=r.insumos; });
  const labs=Object.values(by).map(o=>({...o,tot:o.prop+o.terc+o.ins})).sort((a,b)=>b.tot-a.tot);
  const gasto=labs.reduce((s,l)=>s+l.tot,0), nOT=labs.reduce((s,l)=>s+l.n,0);
  const totTerc=labs.reduce((s,l)=>s+l.terc,0), totIns=labs.reduce((s,l)=>s+l.ins,0);
  const gasoil=sel==='ALL'?D.gasoil_total:(D.gmes[sel]||0), gasoilL=sel==='ALL'?D.gasoil_litros_total:(D.glit[sel]||0);
  const K=[['Gasto Total (labores)','US$ '+fmtUSD(gasto),selTxt],['OT Confirmadas',nOT,'con labor'],['Labores Ejecutadas',labs.length,'tipos de labor'],
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

// ---- Detalle por Labor: filtros de Labor y Etapa, afectan SOLO esta tabla ----
// (los KPIs, ranking y resumen por mes de arriba siguen agregando por labor sin importar la
// etapa, tal como antes; acá se desglosa además por Estadio para poder aislar en qué etapa
// del ciclo se ejecutó una labor puntual, dado que una misma labor puede repetirse en más
// de una etapa a lo largo de la campaña).
function renderLaborDetalle(){
  const selV=document.getElementById('gmes').value, sel=selV==='ALL'?'ALL':parseInt(selV);
  const selTxt=selV==='ALL'?'Toda la campaña':document.getElementById('gmes').selectedOptions[0].text;
  const laborV=document.getElementById('glabor').value, estV=document.getElementById('gestadio').value;
  let recs=sel==='ALL'?D.gastos:D.gastos.filter(r=>r.mesnum===sel);
  if(laborV!=='ALL') recs=recs.filter(r=>r.labor===laborV);
  if(estV!=='ALL') recs=recs.filter(r=>r.estadio===estV);
  const by={};
  recs.forEach(r=>{ const key=r.labor+'|'+r.estadio;
    if(!by[key]) by[key]={labor:r.labor,estadio:r.estadio,esH:r.esH,n:0,ha:0,horas:0,prop:0,propUd:0,terc:0,ins:0};
    const o=by[key]; o.n+=r.n; o.ha+=r.ha; o.horas+=r.horas; o.prop+=r.propia; o.propUd+=r.propia_ud; o.terc+=r.tercero; o.ins+=r.insumos; });
  const labs=Object.values(by).map(o=>({...o,tot:o.prop+o.terc+o.ins})).sort((a,b)=>b.tot-a.tot);
  const filtro=[laborV!=='ALL'?'Labor: '+laborV:null, estV!=='ALL'?'Etapa: '+estV:null].filter(Boolean).join(' · ');
  document.getElementById('gld-sub').textContent=selTxt+(filtro?' · '+filtro:'')+' · '+labs.length+' combinación(es) labor/etapa · ordenado por costo total';
  document.getElementById('gld').innerHTML= labs.length ? labs.map(l=>{
    const ha=l.esH?'<span style="color:var(--muted)">—</span>':fmt2(l.ha), hr=l.esH?fmt2(l.horas):'<span style="color:var(--muted)">—</span>';
    const chip=l.esH?'<span class="chip chip-hr">horas</span>':'<span class="chip chip-ha">ha</span>';
    const lt=l.prop+l.terc,pp=lt?l.prop/lt*100:0,pt=lt?l.terc/lt*100:0;
    const bar=`<div class="ptbar"><div class="pp" style="width:${pp}%"></div><div class="pt" style="width:${pt}%"></div></div>`;
    // Labor Propia no tiene costo asignado en el sistema (siempre US$ 0) — se muestra la
    // cantidad ejecutada (Unidades/Dosis) en su lugar, que sí varía y aporta información.
    return `<tr><td><span class="lname">${l.labor}</span> ${chip}</td><td><span class="chip chip-etapa">${l.estadio}</span></td><td class="tr mono">${l.n}</td><td class="tr mono">${ha}</td><td class="tr mono">${hr}</td><td class="tr mono col-terc">US$ ${fmtUSD(l.terc)}</td><td class="tr">${lt?bar:'—'}</td><td class="tr mono col-ins">US$ ${fmtUSD(l.ins)}</td><td class="tr mono col-tot">US$ ${fmtUSD(l.tot)}</td></tr>`;
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
