// ================== DATOS · COMBUSTIBLE ==================
// Modulo Combustible: consumo e ingresos de gasoil y stock inicial. Trabaja sobre las filas de
// consultaInsumos que loader.js ya separo como combustible, y las VINCULA con su Orden de Trabajo
// a traves del indice referencia de OT -> OT que arma ordenes.js (ver mas abajo). El cruce se hace
// una sola vez aca, en la construccion del modelo, nunca al renderizar.
// ---- Maquina que consumio el combustible, deducida de la observacion de la OT ----
// UNICA implementacion del reconocimiento. El catalogo de equivalencias vive en COMBUSTIBLE_MAQUINAS
// (config.js) y no se repite en ningun otro archivo; render.js recibe la maquina ya resuelta.
//
// La lista de variantes se aplana y se ordena de la mas larga a la mas corta UNA sola vez, al
// cargar el script: asi "tr 07 ac" se prueba antes que "tr 07" y gana la coincidencia mas
// especifica. La busqueda es por palabra completa sobre el texto normalizado — nunca por
// coincidencia parcial: sin los espacios de guarda, "d20" coincidiria dentro de otra palabra.
const COMBUSTIBLE_MAQUINA_VARIANTES = COMBUSTIBLE_MAQUINAS
  .flatMap(m=>m.variantes.map(v=>({id:m.id, label:m.label, v:normHdr(v)})))
  .sort((a,b)=>b.v.length-a.v.length);
// Texto listo para buscar: normHdr (minusculas, sin acentos, espacios colapsados) mas la puntuacion
// y los guiones convertidos en espacios, porque el dato real trae la maquina pegada al guion
// ("Desalijo Silo Bolsa -Tr 07 AC") y terminada en punto ("Abastecer generador.").
function textoBuscableObservacion(obs){
  return ' '+normHdr(obs).replace(/[().,;:\-\/]/g,' ').replace(/\s+/g,' ').trim()+' ';
}
// Devuelve la primera entrada del catalogo que aparece en la observacion, o null. Verificado contra
// el dato: ninguna observacion real coincide con dos maquinas distintas.
function maquinaDeObservacion(obs){
  if(!obs) return null;
  const t = textoBuscableObservacion(obs);
  for(const x of COMBUSTIBLE_MAQUINA_VARIANTES){ if(t.includes(' '+x.v+' ')) return {id:x.id, label:x.label}; }
  return null;
}
function construirCombustible(combustibleRaw, existenciaInicial, indiceOTReferencia){
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
    // referencia = comprobante de stock ("2026 - STK - 10424"): trazabilidad del movimiento.
    referencia: String(row['referencia']||'').trim(),
    // referenciaOrigen = la OT que genero el egreso ("2026 - OT - 4410"): UNICA clave del vinculo.
    // Son dos campos distintos y los dos se conservan; ninguno reemplaza al otro.
    referenciaOrigen: String(row['referencia origen']||'').trim(),
    unidades: num(row['unidades']),
    tercero: String(row['tercero']||'').trim(),
    insumo: String(row['insumo']||'').trim(),
    tipoComp: String(row['descripcion tipo de comprobante']||'').trim(),
    campania: String(row['campania']||'').trim(),
    // parcela = columna `cultivo` de consultaInsumos: el nombre completo del lote/cultivo/campania
    // ("LA TERESA Operativos OPERATIVO 25/26"). Es un dato del MOVIMIENTO, no de la OT. Validado
    // contra el dato real: en los 390 movimientos que si tienen OT coincide con consultaOT.cultivo
    // en 390 de 390 (100%), asi que describe la misma parcela que registraria la orden.
    parcela: String(row['parcela']||'').trim(),
  })).filter(r=> (!r.insumo || r.insumo.toUpperCase()==='GASOIL') && r.fecha);
  const esIngreso = r => normEstadio(r.tipoComp).indexOf('ingreso')>-1;

  // ---- Vinculo con la Orden de Trabajo, y "Uso / Detalle" del combustible ----
  // Un movimiento de combustible trae en `referenciaOrigen` la ORDEN DE TRABAJO que lo genero
  // ("2026 - OT - 4410"), que es exactamente la `referencia` propia de esa OT. El indice ya viene
  // armado (construirIndiceOTPorReferencia, ordenes.js), asi que aca solo se recorre UNA vez la
  // lista de movimientos: el cruce es O(nMovimientos), no O(nMovimientos x nOT).
  //
  // Este vinculo reemplaza al anterior (referencia = referenciaAsiento), que se descarto con una
  // auditoria completa contra el dato real:
  //  - referenciaOrigen -> referencia cubre el 100% de los egresos por OT de la campania vigente
  //    (364 de 364, 29.500,10 L de 29.500,10 L);
  //  - las cantidades cierran exactamente: en los 371 grupos OT+producto+unidad de combustible, la
  //    salida de stock coincide con el totalAplicado de la OT hasta el ultimo decimal;
  //  - y a diferencia del numero de comprobante de stock, la referencia de OT es unica: el viejo
  //    vinculo colgaba 109 movimientos de racion vacuna de OT agricolas sin ninguna relacion.
  // referenciaAsiento ya no se consulta en ningun punto de este modulo, ni siquiera como respaldo.
  //
  // Se enriquece el movimiento, no se recalcula: ni los litros (`unidades`), ni la fecha, ni el
  // contratista (`tercero`), ni el tipo de comprobante se tocan. Todo lo que ya existia sigue igual
  // y los totales de Ingreso/Consumo/Stock/Balance salen de las mismas colecciones que antes. Los
  // litros SIEMPRE salen de consultaInsumos: la coincidencia con la cantidad de la OT sirvio para
  // validar el vinculo, nunca para reemplazar una fuente con la otra.
  //
  // ATRIBUCION POR NIVELES — se evaluan en este orden y son excluyentes, asi que cada movimiento
  // cae en UNO solo:
  //  1. VINCULO_OT                 referenciaOrigen encontro su OT. El uso es la observacion real
  //                                de esa OT, o USO_SIN_DETALLE si la OT no tiene observacion
  //                                cargada (el vinculo existe igual, solo falta el texto). Nunca se
  //                                usa consultaInsumos.observaciones, que en estos movimientos
  //                                siempre repite "Orden de Trabajo Agricola > Comprobante
  //                                Automatico de Egreso de Stock" y no describe nada.
  //  2. VINCULO_CONTRATISTA        Sin referenciaOrigen pero con contratista informado: son las
  //                                remisiones por venta de combustible a un tercero. El uso es su
  //                                nombre real. El contratista NUNCA se usa para deducir una OT —
  //                                solo para atribuir el consumo.
  //  3. VINCULO_OT_NO_DISPONIBLE   Trae referenciaOrigen pero esa OT no esta en consultaOT, que
  //                                viene recortado por campania. Verificado: los 546 casos de hoy
  //                                son TODOS de 25/26. Decir "sin OT" seria falso —la OT existio y
  //                                se sabe cual es—, y decir "Labor Propia" seria inventar. El
  //                                numero de OT viaja en el movimiento para que quede trazable.
  //  4. VINCULO_LABOR_PROPIA       Ni referenciaOrigen ni contratista. Hoy: 0 movimientos.
  const idxOT = indiceOTReferencia || new Map();
  combRows.forEach(r=>{
    const ot = r.referenciaOrigen ? (idxOT.get(r.referenciaOrigen) || null) : null;
    r.ot = ot;
    r.otVinculada = !!ot;
    // Observacion de la OT con los saltos de linea y espacios repetidos colapsados: algunas
    // observaciones del Excel traen \r\n y sangrias que romperian la celda de la tabla. No se
    // corrige ni se recorta el contenido, solo el espaciado.
    const obsOT = ot ? String(ot.obs||'').replace(/\s+/g,' ').trim() : '';
    r.obsOT = obsOT;
    if(ot){
      r.tipoVinculo = VINCULO_OT;
      r.uso = obsOT || USO_SIN_DETALLE;
    } else if(!r.referenciaOrigen && r.tercero){
      r.tipoVinculo = VINCULO_CONTRATISTA;
      r.uso = r.tercero;
    } else if(r.referenciaOrigen){
      r.tipoVinculo = VINCULO_OT_NO_DISPONIBLE;
      // El uso es la PARCELA que trae el propio movimiento, no un rotulo generico: aunque falte la
      // OT, el dato dice donde se uso el combustible. Se muestra TAL CUAL viene, sin partirlo en
      // lote y cultivo: el patron "LA TERESA {lote} {CULTIVO} {campania}" no calza en todos los
      // textos reales ("LA TERESA SILO BOLSAS CUIDADOS DE PATIOS GENERAL", "LA TERESA SECADERO
      // 25/26") y en otros parte mal ("MANTENIMIENTO DE BOMBAS" daria lote="MANTENIMIENTO DE" y
      // cultivo="BOMBAS"). Partirlo seria inventar; el texto completo es el dato.
      r.uso = r.parcela || USO_OT_NO_DISPONIBLE;
    } else {
      r.tipoVinculo = VINCULO_LABOR_PROPIA;
      r.uso = USO_LABOR_PROPIA;
    }
    // Maquina que cargo el gasoil. Solo puede salir de la observacion de la OT, asi que existe en el
    // nivel 1 y queda vacia en los demas — no se deduce del proveedor, de la parcela ni de la fecha.
    const maq = maquinaDeObservacion(obsOT);
    r.maquinaId = maq ? maq.id : '';
    r.maquina = maq ? maq.label : COMBUSTIBLE_MAQUINA_SIN_DATO;
    // usoOrigen se conserva con el mismo rol de antes (entra en la clave de agrupacion para que dos
    // textos iguales de distinto origen no se fusionen); ahora su valor ES el tipo de vinculo, con
    // 'ot-sin-obs' separado para no mezclar "OT sin observacion" con las observaciones reales.
    r.usoOrigen = (r.tipoVinculo===VINCULO_OT && !obsOT) ? 'ot-sin-obs' : r.tipoVinculo;
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
      // maquina/maquinaId viajan tambien en el grupo: como la clave incluye el texto del uso, todos
      // los movimientos de un grupo comparten la misma observacion y por lo tanto la misma maquina.
      if(!map[key]) map[key]={mesnum, uso:r.uso, usoKey, usoOrigen:r.usoOrigen,
        tipoVinculo:r.tipoVinculo, esOT:r.otVinculada,
        maquina:r.maquina, maquinaId:r.maquinaId, n:0, litros:0, movs:[]};
      const c=map[key];
      c.n++; c.litros+=r.unidades;
      // Movimientos individuales del grupo, para el detalle desplegable. Cada movimiento aparece en
      // UN solo grupo: la OT vinculada es una sola linea (regla determinista del indice), asi que
      // tener la OT varias lineas no puede duplicar un movimiento de combustible.
      // hectareasReales se conserva aunque hoy no se muestre: queda disponible para un control
      // futuro de litros/ha sin volver a tocar el vinculo entre Combustible y OT.
      c.movs.push({fecha:r.fecha, litros:r.unidades, referencia:r.referencia,
        referenciaOrigen:r.referenciaOrigen, campania:r.campania, parcela:r.parcela, tercero:r.tercero,
        tipoComp:r.tipoComp, tipoVinculo:r.tipoVinculo, otVinculada:r.otVinculada, obsOT:r.obsOT,
        maquina:r.maquina, maquinaId:r.maquinaId,
        ot: r.ot ? r.ot.ot : '', estadio: r.ot ? r.ot.estadio : '', servicio: r.ot ? r.ot.serv : '',
        lote: r.ot ? r.ot.lote : '', campo: r.ot ? r.ot.campo : '', cultivo: r.ot ? r.ot.cultivo : '',
        // personal = quien retiro el combustible segun la OT. En estas OT el Contratista viene
        // siempre vacio (390 de 390) y este es el campo que si trae el dato — el mismo criterio que
        // ya usa el Consumo de Gasoil por Area de Servicios. Solo existe cuando hay OT: para los
        // demas niveles queda vacio y el render no lo muestra.
        personal: r.ot ? r.ot.personal : '', estadoOT: r.ot ? r.ot.estado : '',
        campaniaOT: r.ot ? r.ot.campania : '',
        fechaOT: r.ot ? r.ot.fr : null, hectareasReales: r.ot ? r.ot.hr : null});
    });
    return Object.values(map).map(c=>({...c, litros:Math.round(c.litros*100)/100,
      movs:c.movs.slice().sort((a,b)=> (b.fecha-a.fecha) || (b.litros-a.litros))}))
      .sort((a,b)=>b.litros-a.litros);
  }
  const combustible_uso = agruparPorUso(combRows.filter(r=>!esIngreso(r)));
  // Maquinas realmente presentes en el consumo, en el orden del catalogo (no alfabetico: el catalogo
  // ya agrupa tractores / maquinaria pesada / vehiculos). Solo se ofrecen las que tienen movimientos:
  // el filtro nunca muestra una opcion que dejaria la tabla vacia.
  const maquinasConMovimientos = new Set(combustible_uso.filter(g=>g.maquinaId).map(g=>g.maquinaId));
  const combustible_maquinas = COMBUSTIBLE_MAQUINAS
    .filter(m=>maquinasConMovimientos.has(m.id))
    .map(m=>({val:m.id, lbl:m.label}));

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
    combustible_uso,combustible_maquinas,
    combustible_existencia_inicial,stock_inicial_combustible};
}
