// ================== BUILD DATA ==================
// Orquestador del modelo de datos del dashboard. La logica de cada dominio vive en js/data/*.js
// (ordenes, cultivos, servicios, combustible, insumos, auditoria, alertas, resumen), que se cargan
// ANTES que este archivo — ver index.html. Aca no se calcula nada: solo se preparan las entradas,
// se llaman las funciones especializadas pasandoles explicitamente lo que necesitan, y se arma el
// objeto final que consume render.js.
//
// El contrato de salida (los nombres de las propiedades devueltas) es el que leen render.js y
// events.js: no se renombra nada aunque internamente venga de otro archivo.
function buildData(raw, proyecciones, insumos, presupuestoInfra){
  const { combustible: combustibleRaw, existenciaInicial, otros: otrosInsumos, excluidos: insumosExcluidosRaw } = insumos || {};

  // ---- Base compartida ----
  // Plan RTK (consultaCultivos) y las colecciones de OT (consultaOT) que consumen todos los demas
  // dominios. Van primero porque el resto depende de ellas.
  const {RTK,RTK_TOT} = construirPlanRTK(proyecciones);
  const {rawTodasCampanias,campanias_ot,rows,HOY,OTS,CONF,
    total_ot,ot_conf,totalEnEjecucion,totalPendientes,costo_total} = construirBaseOT(raw);

  // ---- Dominios que solo dependen de la base ----
  const {cultivos,avanceInconsistencias,siembraExcluidas} = construirCultivos(OTS, RTK, RTK_TOT);
  const {exceso,sinrtk,cancelados,exc_kpi} = construirControlHectareas(OTS, RTK);
  const {otsVisibles,otsAtrasadas,totalAtrasadas,TOLERANCIA_ATRASO_DIAS} = construirAlertas(OTS);
  const {operativas,oper_costo,oper_part} = construirOperativas(OTS, costo_total);
  const {auditoria_items,auditoria_metros,auditoria_puentes,auditoria_gastos} =
    construirAuditoriaInfraestructura(rows, presupuestoInfra);
  const insumos_parcela = construirAuditoriaInsumosParcela(rawTodasCampanias);

  // ---- Servicios ----
  // SERVICIOS es el paquete de la campania vigente; construirServiciosPorCampania lo reutiliza tal
  // cual (no lo recalcula) y agrega uno por cada campania restante de consultaOT.
  const SERVICIOS = construirServicios(CONF);
  const {gastos,gasoil_sec,meses,gasto_total,gasoil_total,gasoil_litros_total,gmes,glit,
    labores,estadios_labor,contratistas_labor} = SERVICIOS;
  const {servicios_campanias,costo_por_campania,costo_total_consolidado} =
    construirServiciosPorCampania(rawTodasCampanias, campanias_ot, SERVICIOS);

  // ---- Dominios que salen de consultaInsumos ----
  // OJO: consultaInsumos NO se recorta por campania, a diferencia de consultaOT.
  const {combustible,combustible_ingresos,combustible_meses,combustible_terceros,
    combustible_litros_total,combustible_n_total,
    combustible_ingresos_litros_total,combustible_ingresos_n_total,
    combustible_existencia_inicial,stock_inicial_combustible} =
    construirCombustible(combustibleRaw, existenciaInicial);
  const {insumos_ingreso,insumos_consumo,insumos_meses,insumos_tipos,insumos_por_tipo,
    insumos_stock_flujo,insumos_ingreso_mensual,insumos_consumo_mensual} =
    construirInsumos(otrosInsumos);

  // ---- Resumen Ejecutivo ----
  // Va ultimo a proposito: reutiliza colecciones ya construidas por los demas dominios y no vuelve
  // a recorrer OTS/rows desde cero.
  const resumen = construirResumen({OTS,CONF,rows,cultivos,operativas,gastos,exceso,sinrtk,exc_kpi,
    otsAtrasadas,totalAtrasadas,total_ot,ot_conf,costo_total,costo_total_consolidado,
    costo_por_campania,oper_costo,oper_part,TOLERANCIA_ATRASO_DIAS});

  return {total_ot,ot_conf,ot_ejec:totalEnEjecucion,ot_pend:totalPendientes,costo_total,cultivos,operativas,oper_costo,oper_part,
    exceso,sinrtk,cancelados,exc_kpi,alertas:otsVisibles,n_ot_atrasadas:totalAtrasadas,
    auditoria_items,auditoria_metros,auditoria_puentes,auditoria_gastos,
    gastos,gasoil_sec,meses,gasto_total,gasoil_total,gasoil_litros_total,gmes,glit,
    labores,estadios_labor,contratistas_labor,
    // Solo para el filtro de Campaña del modulo Servicios (ver render.js: serviciosActivos()).
    campanias_ot,servicios_campanias,campania_actual:CAMPANIA_ACTUAL,
    // Costo ejecutado consolidado de todas las campanias + su desglose (KPI del Resumen Ejecutivo).
    costo_total_consolidado,costo_por_campania,
    combustible,combustible_litros_total,combustible_n_total,combustible_meses,combustible_terceros,
    combustible_ingresos,combustible_ingresos_litros_total,combustible_ingresos_n_total,
    combustible_existencia_inicial,stock_inicial_combustible,
    insumos_ingreso,insumos_consumo,insumos_meses,insumos_tipos,insumos_por_tipo,
    insumos_stock_flujo,insumos_ingreso_mensual,insumos_consumo_mensual,
    insumos_pendiente_modulo:otrosInsumos||[],
    // Auditoría de Insumos por Parcela (pestaña Auditoría) — mismas filas de consumo del módulo
    // Insumos, cruzadas con la parcela y la OT que las generó. Ningún otro módulo la lee.
    insumos_parcela,
    // Filas excluidas del módulo Insumos (hoy solo "Afrecho de Arroz - CH", ver INSUMOS_EXCLUIDOS
    // en config.js) — se conservan crudas acá solo para trazabilidad, ningún render.js las lee.
    insumos_excluidos:insumosExcluidosRaw||[],
    // OT de trabajo por hectareas (avance del Resumen Ejecutivo) sin Has. Reales válido — quedan
    // fuera del cálculo de avance; se conservan acá solo para trazabilidad/depuración.
    avance_inconsistencias:avanceInconsistencias,
    // OT del estadio Siembra que no acreditan avance de siembra (tratamiento de semillas). Solo
    // para trazabilidad: ningun render las lee, y sus costos siguen contando en el resto.
    siembra_excluidas:siembraExcluidas,
    resumen,
    fecha_datos:HOY};
}

