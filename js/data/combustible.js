// ================== DATOS · COMBUSTIBLE ==================
// Modulo Combustible: consumo e ingresos de gasoil y stock inicial. Trabaja sobre las filas de
// consultaInsumos que loader.js ya separo como combustible, y las VINCULA con su Orden de Trabajo
// a traves del indice referenciaAsiento -> linea de OT que arma ordenes.js (ver mas abajo). El
// cruce se hace una sola vez aca, en la construccion del modelo, nunca al renderizar.
function construirCombustible(combustibleRaw, existenciaInicial, indiceOTAsiento){
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

  // ---- Vinculo con la Orden de Trabajo, y "Uso / Detalle" del combustible ----
  // Un movimiento de combustible trae en `referencia` el comprobante de stock que lo genero
  // ("2026 - STK - 10424"); la linea de OT que lo origino trae ese mismo comprobante en
  // `referenciaAsiento`. El indice ya viene armado (construirIndiceOTPorAsiento, ordenes.js), asi
  // que aca solo se recorre UNA vez la lista de movimientos y se busca cada referencia: el cruce es
  // O(nMovimientos), no O(nMovimientos x nOT).
  //
  // Se enriquece el movimiento, no se recalcula: ni los litros (`unidades`), ni la fecha, ni el
  // proveedor (`tercero`), ni el tipo de comprobante se tocan. Todo lo que ya existia sigue igual y
  // los totales de Ingreso/Consumo/Stock/Balance salen de las mismas colecciones que antes.
  //
  // De donde sale el texto de "Uso / Detalle", en este orden:
  //  1. OT vinculada con observacion -> la observacion de la OT (consultaOT.observaciones). Es la
  //     unica fuente del uso real; nunca se usa consultaInsumos.observaciones, que en estos
  //     movimientos siempre dice lo mismo ("Orden de Trabajo Agricola > Comprobante Automatico de
  //     Egreso de Stock") y no describe nada.
  //  2. OT vinculada sin observacion -> USO_SIN_DETALLE. Tener OT y no tener observacion es una
  //     situacion distinta de no tener OT, y se muestran separadas.
  //  3. Sin OT pero con proveedor informado -> el nombre del proveedor. Son las remisiones por
  //     venta a un contratista real (Cedrela S.A, Agro Vial, …): 1.577 movimientos y 404.722 L en
  //     el dato de hoy. NO es la vieja suposicion "proveedor vacio = Labor Propia" — es un nombre
  //     que el dato SI trae, y mandarlo a "Sin OT vinculada" borraria de la vista el 94% del
  //     consumo bajo una sola fila anonima.
  //  4. Sin OT y sin proveedor -> USO_SIN_OT. Es lo que antes caia en el generico "Labor Propia".
  //
  // `Labor Propia` ya no se usa como etiqueta de uso en ningun caso.
  const idxOT = indiceOTAsiento || new Map();
  combRows.forEach(r=>{
    const ot = r.referencia ? (idxOT.get(r.referencia) || null) : null;
    r.ot = ot;
    // otVinculada deja el resultado del cruce explicito en el movimiento; la referencia usada para
    // el match es `r.referencia`, que ya estaba y no se duplica. Con esos dos campos se puede
    // auditar despues por que un movimiento no encontro OT.
    r.otVinculada = !!ot;
    // Observacion de la OT con los saltos de linea y espacios repetidos colapsados: algunas
    // observaciones del Excel traen \r\n y sangrias que romperian la celda de la tabla. No se
    // corrige ni se recorta el contenido, solo el espaciado.
    const obsOT = ot ? String(ot.obs||'').replace(/\s+/g,' ').trim() : '';
    r.obsOT = obsOT;
    if(ot){ r.uso = obsOT || USO_SIN_DETALLE; r.usoOrigen = obsOT ? 'ot' : 'ot-sin-obs'; }
    else if(r.tercero){ r.uso = r.tercero; r.usoOrigen = 'proveedor'; }
    else { r.uso = USO_SIN_OT; r.usoOrigen = 'sin-ot'; }
  });

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

  // ---- Consumo agrupado por Mes + Uso / Detalle ----
  // Coleccion NUEVA, en paralelo a `combustible`: agrupa exactamente los mismos movimientos de
  // consumo (mismo filtro, mismos litros) pero por el uso real en vez de por proveedor. `combustible`
  // se deja intacta porque de ella salen los KPI de Consumo, el arrastre de stock, el filtro de
  // Mes y el de Tercero — nada de eso se recalcula.
  //
  // La clave de agrupacion usa normHdr (utils.js): recorta, colapsa espacios repetidos e ignora
  // mayusculas/minusculas y acentos, para que "Logistica - UAB800" y "Logística - UAB800" no
  // aparezcan como dos usos distintos. Se guarda aparte el texto legible original (`uso`, el de la
  // primera aparicion). No hay ninguna correccion semantica ni fuzzy matching: dos observaciones
  // que difieren en algo mas que espaciado/acentos quedan separadas.
  //
  // El origen entra en la clave a proposito: asi una observacion de OT nunca se fusiona con un
  // nombre de proveedor que casualmente se escriba igual.
  function agruparPorUso(list){
    const map={};
    list.forEach(r=>{
      const mesnum = r.fecha.getMonth()+1;
      const usoKey = normHdr(r.uso);
      const key = mesnum+'|'+r.usoOrigen+'|'+usoKey;
      if(!map[key]) map[key]={mesnum, uso:r.uso, usoKey, usoOrigen:r.usoOrigen,
        esOT:r.otVinculada, n:0, litros:0, movs:[]};
      const c=map[key];
      c.n++; c.litros+=r.unidades;
      // Movimientos individuales del grupo, para el detalle desplegable. Cada movimiento aparece en
      // UN solo grupo: la OT vinculada es una sola linea (regla determinista del indice), asi que
      // tener la OT varias lineas no puede duplicar un movimiento de combustible.
      // hectareasReales se conserva aunque hoy no se muestre: queda disponible para un control
      // futuro de litros/ha sin volver a tocar el vinculo entre Combustible y OT.
      c.movs.push({fecha:r.fecha, litros:r.unidades, referencia:r.referencia, tercero:r.tercero,
        tipoComp:r.tipoComp, otVinculada:r.otVinculada, obsOT:r.obsOT,
        ot: r.ot ? r.ot.ot : '', estadio: r.ot ? r.ot.estadio : '', servicio: r.ot ? r.ot.serv : '',
        lote: r.ot ? r.ot.lote : '', campo: r.ot ? r.ot.campo : '', cultivo: r.ot ? r.ot.cultivo : '',
        fechaOT: r.ot ? r.ot.fr : null, hectareasReales: r.ot ? r.ot.hr : null});
    });
    return Object.values(map).map(c=>({...c, litros:Math.round(c.litros*100)/100,
      movs:c.movs.slice().sort((a,b)=> (b.fecha-a.fecha) || (b.litros-a.litros))}))
      .sort((a,b)=>b.litros-a.litros);
  }
  const combustible_uso = agruparPorUso(combRows.filter(r=>!esIngreso(r)));

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
    combustible_uso,
    combustible_existencia_inicial,stock_inicial_combustible};
}
