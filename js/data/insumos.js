// ================== DATOS · INSUMOS ==================
// Modulo Insumos: ingresos, consumos y flujo de stock por (Tipo, Insumo, Unidad).
// OJO: consultaInsumos NO se filtra por campania (a diferencia de consultaOT) — se procesa
// completa, tal como antes de introducir ese filtro.
function construirInsumos(otrosInsumos){
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
  // ---- Filtro Ganadería (exclusivo de este módulo) ----
  // consultaInsumos puede traer registros agrícolas Y ganaderos mezclados. El módulo Insumos debe
  // trabajar SOLO con los agrícolas: categoriaInsumo = "Agricola" (normalizado) Y observaciones que
  // NO mencionen "GANADER" (cubre Ganadería/Ganadero/Ganadera/etc., sin depender de mayúsculas,
  // tildes ni espacios — normEstadio ya hace ese trabajo y es null-safe: categoriaInsumo/
  // observaciones ausentes o null no rompen la comparación, simplemente no matchean "agricola" y
  // la fila queda excluida). Se filtra sobre una COPIA derivada (otrosInsumosAgricolas) — nunca se
  // modifica ni se recorta "otrosInsumos" (la colección original, que sigue exponiéndose intacta
  // más abajo en D.insumos_pendiente_modulo para trazabilidad) ni nada de Combustible: ese módulo
  // usa combustibleRaw/existenciaInicial, arrays completamente aparte ya separados en
  // separarInsumos() (loader.js), que nunca pasan por este filtro.
  function esMovimientoAgricolaNoGanadero(r){
    const categoria = normEstadio(r.categoriaInsumo);
    const observacion = normEstadio(r.observaciones);
    return categoria==='agricola' && !observacion.includes('ganader');
  }
  const otrosInsumosAgricolas = (otrosInsumos||[]).filter(esMovimientoAgricolaNoGanadero);
  const insumosRowsAll = otrosInsumosAgricolas.map(rowRaw=>{
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
  return {insumos_ingreso,insumos_consumo,insumos_meses,insumos_tipos,insumos_por_tipo,
    insumos_stock_flujo,insumos_ingreso_mensual,insumos_consumo_mensual};
}
