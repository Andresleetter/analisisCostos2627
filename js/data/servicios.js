// ================== DATOS · SERVICIOS ==================
// Modulo Servicios completo: detalle por labor, gasoil por area, filtros y el paquete equivalente
// para cada campania presente en consultaOT.

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
    // esTrabajoPorInsumos: labores de SERVICIOS_TRABAJO_MEDIDO_EN_INSUMOS (config.js), donde el
    // trabajo ejecutado se expresa en cantidad de lineas de insumo y no en hectareas/horas/kilos.
    const esTrabajoPorInsumos = SERVICIOS_TRABAJO_MEDIDO_EN_INSUMOS.includes(normHdr(o.serv));
    // El contratista sale del dato, nunca del nombre de la labor: si hay contratista cargado se usa
    // ese (Labor Tercero sigue exactamente igual que antes). El marcador '(Ejecución Labor Propia)'
    // solo se usa cuando la OT trae realmente una linea de tipo "Labor Propia" — ahi el campo no es
    // "No aplica" sino un dato: la labor la ejecuto personal propio. Se limita a estas labores para
    // no cambiar el texto que ya muestran todas las demas filas del Detalle por Labor.
    const ejecucionPropia = esTrabajoPorInsumos && o.lines.some(l=>l.tipo==='Labor Propia');
    const contratista = o.contr && o.contr.trim() ? o.contr.trim()
      : (o.tercero>0 ? '(Sin contratista)' : (ejecucionPropia ? '(Ejecución Labor Propia)' : '(Labor Propia)'));
    // esH usa la modalidad de la LINEA PRINCIPAL de labor (o.modalidad, ver mas arriba), no
    // o.lines.every(l=>l.esHoras): una OT por horas con un insumo de otra unidad quedaba mal
    // clasificada como "por hectareas" con el criterio anterior. No cambia costos ni horas
    // sumadas, solo corrige a que fila del detalle se agrupan (puede fusionar filas antes separadas
    // por error).
    const esH = o.modalidad==='horas';
    // unidadTrabajo = en que unidad se mide el trabajo ejecutado de esta fila. Reemplaza al viejo
    // booleano esH en la clave de agrupacion para poder distinguir una tercera unidad (kg, fletes
    // medidos por peso) sin cambiar el agrupamiento de las otras dos: 'hrs' es exactamente el viejo
    // esH===true y 'ha' exactamente el viejo esH===false (incluidas las OT de modalidad nula), asi
    // que ninguna fila que no sea un flete por peso se separa ni se fusiona respecto de antes.
    // 'ins' es una cuarta unidad de trabajo, con el mismo criterio con que se agrego 'kg': entra en
    // la clave de agrupacion y acumula en su propio campo, sin tocar como se clasifican ni se suman
    // 'ha', 'hrs' y 'kg'. Se evalua primero porque estas OT traen la superficie del lote en Has.
    // Reales y con el criterio anterior caian en 'ha'.
    const unidadTrabajo = esTrabajoPorInsumos ? 'ins' : (esH ? 'hrs' : (o.modalidad==='peso' ? 'kg' : 'ha'));
    const key=m+'|'+o.serv+'|'+est+'|'+unidadTrabajo+'|'+contratista;
    if(!dmap[key]) dmap[key]={mesnum:m,labor:o.serv,estadio:est,esH,unidadTrabajo,contratista,n:0,ha:0,horas:0,kg:0,ins_lineas:0,propia:0,tercero:0,insumos:0};
    const d=dmap[key]; d.n++; d.ha+=(o.ha||0); d.horas+=o.horas; d.kg+=(o.kg||0); d.ins_lineas+=o.n_insumos; d.propia+=o.propia; d.tercero+=o.tercero; d.insumos+=o.insumos; });
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
    const esp=k=>k==='(Labor Propia)'||k==='(Sin contratista)'||k==='(Ejecución Labor Propia)';
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

// Un paquete de Servicios por cada campania presente en consultaOT, mas los totales consolidados.
function construirServiciosPorCampania(rawTodasCampanias, campanias_ot, SERVICIOS){
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
  return {servicios_campanias,costo_por_campania,costo_total_consolidado};
}
