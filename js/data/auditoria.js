// ================== DATOS · AUDITORÍA ==================
// Los dos sub-modulos de la pestaña Auditoria: Infraestructura (presupuesto vs ejecucion) e
// Insumos por Parcela.

// Presupuesto de Infraestructura vs ejecucion real.
function construirAuditoriaInfraestructura(rows, presupuestoInfra){
  // ---- AUDITORIA: Presupuesto de Infraestructura vs ejecución real ----
  // Cruce definido en INFRA_MAP (config.js) entre "Especificacion" del presupuesto y "Servicio"
  // real de las OT. Primer relevamiento (solo Estadio="Infraestructura") encontraba 23 OT; una
  // búsqueda más amplia por palabra clave en Servicio (sin restringir por Estadio) encontró muchas
  // más OT reales bajo otros Estadios (Preparacion de Suelo, Operativo, Mantenimientos de
  // infraestructura, Cuidados, Secadero) — por eso acá NO se filtra por Estadio, solo por
  // Servicio. No hay match de texto confiable para la mayoría de los items, así que el mapeo es
  // MANUAL, no automático. Se usan todos los datos de OT tal como vienen cargados, sin
  // reinterpretar el campo Servicio (ej. una OT de Puentes Tercero cuya Observación menciona un
  // tubo se deja igual, no se "corrige" acá).
  const infraServiciosMapeados = new Set(Object.values(INFRA_MAP).flat());
  const infraRows = rows.filter(r=>infraServiciosMapeados.has(r.serv));
  // Puentes (Tercero/Propia) NO van en esta tabla generica: tienen su propia sección de KPIs por
  // unidad mas abajo (auditoria_puentes), con sus Servicio exactos confirmados.
  const auditoria_items = (presupuestoInfra||[])
    .filter(item=>item.especificacion!==INFRA_PUENTES_TERCERO_ESP && item.especificacion!==INFRA_PUENTES_PROPIA_ESP)
    .map(item=>{
      const servicios = INFRA_MAP[item.especificacion] || [];
      const sub = infraRows.filter(r=>servicios.includes(r.serv));
      const horas = Math.round(sub.filter(r=>r.esHoras).reduce((s,r)=>s+r.ud,0)*100)/100;
      const otPropia = new Set(sub.filter(r=>r.tipo==='Labor Propia').map(r=>r.ot)).size;
      const otTercero = new Set(sub.filter(r=>r.tipo==='Labor Tercero').map(r=>r.ot)).size;
      const otConfirmadas = new Set(sub.filter(r=>r.estado==='Confirmado').map(r=>r.ot)).size;
      return {especificacion:item.especificacion, unidadMedida:item.unidadMedida,
        cantidadPresupuestada:item.cantidadPresupuestada, horas, otPropia, otTercero, otConfirmadas,
        tieneOT: sub.length>0};
    });
  // Items presupuestados en Metros: no existe en las OT ningún campo de metraje/longitud real
  // (confirmado — solo Unidades/Litros/Horas), así que NO se calcula un % de avance en metros: se
  // muestra únicamente la cantidad de OT confirmadas como aproximación, rotulada como tal en el
  // render (nunca como metros reales ni como % inventado).
  const auditoria_metros = auditoria_items.filter(i=>i.unidadMedida==='Metros').map(i=>
    ({especificacion:i.especificacion, metrosPresupuestados:i.cantidadPresupuestada, otConfirmadas:i.otConfirmadas}));

  // ---- Sección 1: Puentes por Unidad ----
  // "PRESUPUESTO Aprob" para estos dos items del presupuesto es UNIDADES de puentes (no metros ni
  // importe): 28 Tercero, 14 Propia. Ejecutado = OT CONFIRMADAS con el Servicio exacto (confirmado
  // contra el dato real, ver constantes en config.js) — no se usan las OT "En Ejecución"/
  // "Pendiente" como ejecutadas, mismo criterio de "Confirmado" que el resto del dashboard.
  function puentesPorUnidad(especificacion, servicio, tipoLabel){
    const presu = (presupuestoInfra||[]).find(i=>i.especificacion===especificacion);
    const presupuestado = presu ? presu.cantidadPresupuestada : 0;
    const ejecutadas = new Set(rows.filter(r=>r.serv===servicio && r.estado==='Confirmado').map(r=>r.ot)).size;
    const avance = presupuestado>0 ? Math.round(ejecutadas/presupuestado*1000)/10 : null;
    return {tipo:tipoLabel, presupuestado, ejecutadas, avance};
  }
  const auditoria_puentes = [
    puentesPorUnidad(INFRA_PUENTES_TERCERO_ESP, INFRA_PUENTES_TERCERO_SERV, 'Tercero'),
    puentesPorUnidad(INFRA_PUENTES_PROPIA_ESP, INFRA_PUENTES_PROPIA_SERV, 'Propia'),
  ];

  // ---- Sección 2: Gastos — "Desalijo Karanda'y / Carandai" ----
  // Antes esta sección incluía también "Construccion de Puentes retro excavadora x Hs" y un
  // segundo grupo ("Desalijo Silo Bolsa"). A pedido del usuario se angosta a un ÚNICO concepto,
  // AUDITORIA_GASTO_DESALIJO (config.js) — pero el match NO es de la frase completa exacta (eso
  // dejaba la sección en 0 pese a que sí hay trabajo real cargado, verificado contra el .xlsx):
  // Servicio nunca trae ese texto, y ninguna Observación real coincide palabra por palabra con el
  // rótulo completo. Se busca en cambio el CONCEPTO puntual dentro de la Observación (que es el
  // campo real donde está cargado, confirmado en la inspección) — "desalijo" JUNTO con la palabra
  // "karanda"/"caranda" (normalizada con normEstadio ya existente: sin acentos/mayúsculas), que
  // cubre las variantes reales de ortografía encontradas (karanda'y, caranda'y, karanday, karandai,
  // karandaý...) sin ampliarse a otros trabajos: "Desalijo Silo Bolsa..." NO menciona
  // karanda/caranda y queda afuera; una fila como "Desalijo de madera para puente..." tampoco la
  // menciona y también queda afuera (no es este trabajo, aunque comparta la palabra "desalijo").
  // Se excluyen además las OT cuyo Servicio ya se cuenta en otra sección de Auditoría (ej. OT 3884,
  // Servicio="Cerrar camino retro excavadora x Hs", ya contado en "Reparacion de camino"; su
  // Observación menciona "carandai" de pasada, no es el trabajo de desalijo en sí).
  const auditoriaServiciosUsados = new Set([
    ...infraServiciosMapeados,
    INFRA_PUENTES_TERCERO_SERV, INFRA_PUENTES_PROPIA_SERV, INFRA_PUENTES_HORAS_SERV,
  ]);
  const desalijoKarandayOT = rows.filter(r=>
    !auditoriaServiciosUsados.has(r.serv) &&
    (normEstadio(r.serv).includes('desalij') || normEstadio(r.obs).includes('desalij')) &&
    (normEstadio(r.serv).includes('karand') || normEstadio(r.serv).includes('carand') ||
     normEstadio(r.obs).includes('karand') || normEstadio(r.obs).includes('carand')));
  function gastoDeOTs(sub){
    const horas = Math.round(sub.filter(r=>r.esHoras).reduce((s,r)=>s+r.ud,0)*100)/100;
    const litros = Math.round(sub.filter(r=>r.unidad.toLowerCase()==='litros').reduce((s,r)=>s+r.ud,0)*100)/100;
    const costo = Math.round(sub.reduce((s,r)=>s+r.cl+r.ci,0)*100)/100;
    const nOT = new Set(sub.map(r=>r.ot)).size;
    const nConfirmadas = new Set(sub.filter(r=>r.estado==='Confirmado').map(r=>r.ot)).size;
    return {horas, litros, costo, nOT, nConfirmadas};
  }
  const auditoria_gastos = [
    {trabajo:AUDITORIA_GASTO_DESALIJO, ...gastoDeOTs(desalijoKarandayOT)},
  ];
  return {auditoria_items,auditoria_metros,auditoria_puentes,auditoria_gastos};
}

// Auditoria de Insumos por Parcela.
function construirAuditoriaInsumosParcela(rawTodasCampanias){
  // ================= AUDITORIA DE INSUMOS POR PARCELA =================
  // Vista de auditoria (pestaña Auditoría, sub-modulo "Insumos por Parcela"): que insumo se aplico,
  // en que parcela, cuanto, cuanto por hectarea, a que costo y en que orden de trabajo.
  //
  // FUENTE UNICA: la hoja consultaOT, sus lineas de INSUMO (categoria/tipoItem = "Insumo"). Es la
  // unica hoja donde cada linea de insumo YA trae, en columnas propias, la parcela completa
  // (Campo / Lote / Zona / Actividad / Cultivo / Campania) y las hectareas reales del trabajo — no
  // hay que cruzar hojas, ni interpretar texto, ni derivar nada. consultaInsumos NO se usa acá.
  //
  // Se toma rawTodasCampanias (consultaOT sin recortar por campania) para que el filtro de Campaña
  // del modulo pueda ofrecer todas las campanias presentes, igual que hace Servicios. El resto del
  // dashboard sigue trabajando sobre `raw` recortado a CAMPANIA_ACTUAL, sin cambios.
  //
  // Verificado contra el .xlsx real, sobre las 584 lineas de insumo confirmadas no combustibles:
  //  - Unidades/Dosis coincide exactamente con Total Aplicado en las 584 (0 diferencias).
  //  - Unidades/Dosis / Has. Reales coincide exactamente con la columna "dosisReales" que ya trae
  //    el propio dato en las 580 con superficie real: la "cantidad por hectarea" que calcula este
  //    modulo es la misma dosis que registra el sistema, no una interpretacion nuestra.
  //  - Ninguna OT trae mas de un valor de Has. Reales entre sus lineas de insumo, y ningun par
  //    OT+insumo aparece repetido.
  const INSUMO_CATEGORIA_OT = 'Insumo';
  function ipEsLineaInsumoAuditable(r){
    // Mismas reglas de alcance que el modulo Insumos, aplicadas a esta hoja:
    //  - COMBUSTIBLES fuera: tiene su propio modulo (Combustible), nunca se mezcla con Insumos.
    //  - INSUMOS_EXCLUIDOS fuera (config.js), misma comparacion normInsumoNombre que usa loader.js.
    //  - Movimientos ganaderos fuera. Hoy consultaOT no trae ninguno (verificado: 0 filas), pero la
    //    regla queda explicita para que un dato ganadero futuro no entre solo.
    // Y una regla propia de esta hoja: solo OT CONFIRMADAS, igual criterio que usa todo el resto
    // del dashboard para los importes (ver CONF mas arriba y el pie de pagina). Las Pendientes/En
    // Ejecucion traen el insumo previsto pero costo 0: sumarlas mezclaria plan con ejecucion.
    if(String(keyOf(r,['categoria','Categoria'])||'').trim()!==INSUMO_CATEGORIA_OT) return false;
    if(String(keyOf(r,['estado','Estado'])||'').trim()!=='Confirmado') return false;
    if(String(keyOf(r,['tipoInsumo','Tipo de Insumo'])||'').trim().toUpperCase()===TIPO_INSUMO_COMBUSTIBLE) return false;
    const nombre = String(keyOf(r,['insumo','Insumo'])||'').trim();
    if(!nombre) return false;
    if(INSUMOS_EXCLUIDOS.some(ex=>normInsumoNombre(ex)===normInsumoNombre(nombre))) return false;
    if(normEstadio(keyOf(r,['observaciones','Observación','Observacion'])).includes('ganader')) return false;
    // Cultivos de servicio fuera de la auditoria (AVENA/COBERTURA, ver config.js).
    const actividad = String(keyOf(r,['actividad','Actividad'])||'').trim();
    if(AUDITORIA_INSUMOS_CULTIVOS_EXCLUIDOS.some(c=>normHdr(c)===normHdr(actividad))) return false;
    return true;
  }
  const insumos_parcela_movs = rawTodasCampanias.filter(ipEsLineaInsumoAuditable).map(r=>{
    const servicio = String(keyOf(r,['servicio','Servicio'])||'').trim();
    // Fecha del trabajo: Fecha Real (la de ejecucion). Todas las lineas confirmadas la traen
    // cargada (verificado: 0 vacias); el resto de las fechas queda como respaldo por si el export
    // llegara a cambiar, mismo orden de preferencia que usa el resto del dashboard.
    const fecha = pdate(keyOf(r,['fechaReal','Fecha real'])) || pdate(keyOf(r,['fecha','Fecha']))
      || pdate(keyOf(r,['fechaTeorica','Fecha Teórica','Fecha Teorica']));
    // Cantidad utilizada = Unidades/Dosis, y costo = Unidades/Dosis x Precio Unitario. Es la MISMA
    // formula que usa todo el dashboard para los importes (ver `imp` en normalizarFilasOT y el pie
    // de pagina), asi que el costo de insumos de este modulo cierra con el de Servicios. La hoja
    // trae ademas una columna "costoInsumo" ya calculada, que difiere en US$ 886,51 sobre el total
    // (540 de 584 filas con diferencias de centavos por redondeo del origen): se usa la formula, no
    // esa columna, para no tener dos costos distintos conviviendo en el mismo dashboard.
    const cantidad = num(keyOf(r,['unidadesDosis','Unidades/Dosis']));
    const costoUnitario = num(keyOf(r,['precioUnitario','Precio Unitario']));
    // Has. Reales de la propia linea. Las lineas de los servicios de SERVICIOS_SIN_TRABAJO_EJECUTADO
    // (config.js) no aportan superficie: en esos trabajos solo se usan insumos y el 0,01 que traen
    // es un marcador, no una medida. Es la MISMA regla que ya aplica la columna "Trabajo Ejecutado"
    // de Servicios. Sin esta exclusion, dividir por 0,01 daria costos por hectarea de decenas de
    // miles de dolares que encabezarian la auditoria siendo un artefacto del marcador. Verificado:
    // las unicas 4 lineas con Has. Reales <= 0,01 son exactamente las de aplicacion con mochila.
    const sinSuperficie = SERVICIOS_SIN_TRABAJO_EJECUTADO.includes(normHdr(servicio));
    const haRaw = numN(keyOf(r,['hectareasReales','Has. Reales']));
    const ha = (sinSuperficie || haRaw==null || haRaw<=0) ? null : haRaw;
    const lote = String(keyOf(r,['lote','Lote'])||'').trim();
    const otNum = String(keyOf(r,['ordenTrabajo','OT'])||'').trim();
    return {
      fecha,
      campania: String(keyOf(r,['campania','Campaña','Campania'])||'').trim(),
      // Clave interna de agrupacion: el Cultivo completo ("LA TERESA .34F ARROZ 26/27"), que
      // identifica lote + cultivo + campania sin ambiguedad y no mezcla el mismo lote entre
      // campanias. En pantalla el modulo rotula y filtra por LOTE, que —ya excluidos AVENA y
      // COBERTURA— es equivalente dentro de una campania (ver AUDITORIA_INSUMOS_CULTIVOS_EXCLUIDOS).
      parcela: String(keyOf(r,['cultivo','Cultivo'])||'').trim() || '(sin parcela)',
      campo: String(keyOf(r,['campo','Campo'])||'').trim() || '(sin campo)',
      lote: lote || '(sin lote)',
      zona: String(keyOf(r,['zona','Zona'])||'').trim() || '(sin zona)',
      cultivo: String(keyOf(r,['actividad','Actividad'])||'').trim() || '(sin cultivo)',
      tipo: String(keyOf(r,['tipoInsumo','Tipo de Insumo'])||'').trim() || '(sin tipo)',
      insumo: String(keyOf(r,['insumo','Insumo'])||'').trim(),
      unidad: String(keyOf(r,['unidadMedida','Unidad de medida'])||'').trim() || '(sin unidad)',
      cantidad, costoUnitario,
      costoTotal: Math.round(cantidad*costoUnitario*100)/100,
      // Trazabilidad: la orden de trabajo que aplico el insumo, con su servicio y su comprobante de
      // asiento de stock — permite ir del numero hasta el movimiento que lo genero.
      ot: otNum, otRef: String(keyOf(r,['referencia','Referencia'])||'').trim() || (otNum?'OT '+otNum:''),
      servicio, estadoOT: String(keyOf(r,['estado','Estado'])||'').trim(),
      comprobante: String(keyOf(r,['referenciaAsiento','Referencia Asiento'])||'').trim(),
      ha,
      motivoSinHa: ha!=null ? null : (sinSuperficie ? 'sin_superficie' : 'ot_sin_ha'),
    };
  });
  // Campanias presentes, en el orden de presentacion de CAMPANIA_ORDEN (config.js) y despues
  // cualquier otra que aparezca — nunca se oculta ninguna. El valor es SIEMPRE la clave real de
  // consultaOT ('26/27', '26'); CAMPANIA_LABEL solo cambia el texto visible, igual que en Servicios.
  const ipCampaniasPresentes = [...new Set(insumos_parcela_movs.map(m=>m.campania).filter(c=>c))];
  const insumos_parcela = {
    movs: insumos_parcela_movs,
    campanias: [
      ...CAMPANIA_ORDEN.filter(c=>ipCampaniasPresentes.includes(c)),
      ...ipCampaniasPresentes.filter(c=>!CAMPANIA_ORDEN.includes(c)).sort((a,b)=>a.localeCompare(b,'es')),
    ],
    total: insumos_parcela_movs.length,
    // Lineas sin hectareas reales: se muestran igual (parcela, insumo, cantidad y costo son datos
    // propios de la linea), pero no pueden expresarse por hectarea. Se expone el conteo para
    // avisarlo en pantalla en vez de dejar celdas vacias sin explicacion.
    sin_ha: insumos_parcela_movs.filter(m=>m.ha==null).length,
  };
  return insumos_parcela;
}
