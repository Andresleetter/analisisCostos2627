// ================== DATOS · COMBUSTIBLE ==================
// Modulo Combustible: consumo e ingresos de gasoil y stock inicial. Trabaja sobre las filas de
// consultaInsumos que loader.js ya separo como combustible — nunca sobre consultaOT.
function construirCombustible(combustibleRaw, existenciaInicial){
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
  return {combustible,combustible_ingresos,combustible_meses,combustible_terceros,
    combustible_litros_total,combustible_n_total,
    combustible_ingresos_litros_total,combustible_ingresos_n_total,
    combustible_existencia_inicial,stock_inicial_combustible};
}
