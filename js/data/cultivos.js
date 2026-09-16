// ================== DATOS · CULTIVOS, PLAN RTK Y CONTROL DE HECTÁREAS ==================
// Todo lo que compara la ejecucion contra el plan RTK de consultaCultivos: el plan en si, el
// avance de campo por cultivo y etapa (Resumen Ejecutivo) y el Control de Hectareas.

// Clave con que se agrupan las labores del avance. Normaliza el texto del servicio (para que
// mayusculas/tildes/espacios no dupliquen el grupo) y ademas lo resuelve por LABORES_EQUIVALENTES
// (config.js): dos nombres distintos que son la misma labor entran al MISMO grupo. Es la unica
// definicion de "labor" del avance — la usan tanto el calculo como su desglose.
function claveLaborAvance(serv){
  const k = normHdr(serv) || '(sin labor)';
  return LABORES_EQUIVALENTES[k] || k;
}

// Las OT que componen una labor del desglose, en la forma que necesita su desplegable. Son las OT
// YA agrupadas por agruparOTS() (ordenes.js), asi que una OT con tres lineas de insumo y una de
// labor entra UNA sola vez. Ningun valor se recalcula: la superficie es haTrabajada(o) — la misma
// que usa el avance y el Trabajo Ejecutado de Servicios — y el costo es o.imp, el importe total de
// la OT (Labor Propia + Labor Tercero + Insumos) tal cual lo dejo el modelo.
// La unidad sale de la modalidad de la OT con el mismo criterio que unidadTrabajo en servicios.js:
// las labores que aportan avance son todas de modalidad hectareas, pero las que no aportan se
// muestran en su propia unidad (horas, kilos, trabajos) y nunca convertidas a hectareas.
const UNIDAD_TRABAJO_MODALIDAD={horas:'hrs',peso:'kg',camion_grua:'trabajos'};
// Por que una OT confirmada de una etapa del ciclo no acredita superficie. Son los descartes que el
// calculo del avance ya hacia, nombrados para poder mostrarlos.
const MOTIVO_SIN_APORTE={horas:'Trabajo medido en horas',peso:'Trabajo medido en peso',
  camion_grua:'Camión + grúa'};
function otsDeLabor(ots){
  const filas=ots.map(o=>{
    const unidad=UNIDAD_TRABAJO_MODALIDAD[o.modalidad]||'ha';
    const cant=unidad==='hrs'?o.horas:(unidad==='kg'?o.kg:(unidad==='trabajos'?o.trabajos:haTrabajada(o)));
    // El lote va normalizado (normLote) porque es la MISMA clave con la que el avance agrupo esa
    // OT: en el .xlsx el mismo lote aparece como "200" y como ".34E", y mostrarlo crudo haria que
    // la OT pareciera de otro lote que el que se capo contra el plan.
    return {ot:o.ot, fr:o.fr, lote:normLote(o.lote), cant, unidad, costo:o.imp};
  });
  // Mismo orden que el desplegable de Servicios: fecha ascendente y, a igual fecha, numero de OT.
  return ordenarOTsServicio(filas);
}

// Reparte `totalUnidades` (un entero: decimas de punto porcentual o centesimas de hectarea) entre
// las partes, en proporcion a sus pesos y con redondeo de mayor resto. La suma de las partes
// redondeadas da EXACTAMENTE el total. Hace falta porque el desglose tiene que explicar el numero
// que dice explicar: cuatro labores redondeadas cada una por su cuenta pueden sumar 89,9% contra un
// estadio que muestra 90,0%, y esa diferencia de representacion se lee como un error de negocio.
function repartirMayorResto(pesos, totalUnidades){
  const n = pesos.length;
  if(!n) return [];
  const suma = pesos.reduce((a,b)=>a+b,0);
  const crudos = pesos.map(p => suma>0 ? p/suma*totalUnidades : totalUnidades/n);
  const base = crudos.map(x=>Math.floor(x));
  let resto = totalUnidades - base.reduce((a,b)=>a+b,0);
  const orden = crudos.map((x,i)=>({i,frac:x-Math.floor(x)})).sort((a,b)=>(b.frac-a.frac)||(a.i-b.i));
  for(let j=0; resto>0 && j<n*2; j++, resto--) base[orden[j%n].i]++;
  return base;
}

// Construye el plan RTK (hectareas planificadas por cultivo y lote) desde consultaCultivos.
function construirPlanRTK(proyecciones){
  // ---- PLAN RTK desde consultaCultivos ----
  // Soporta dos formatos:
  //  a) columnas separadas de lote/cultivo (export histórico "Proyecciones", o 'actividad_1'/
  //     'especie_1' cuando 'Actividad' aparece dos veces — ID numérico y texto).
  //  b) consultaCultivos (fuente actual): no trae lote/cultivo como columnas propias, vienen
  //     combinados en 'nombre' (ej. "LA TERESA 201 ARROZ 26/27"). Se derivan por posición fija
  //     "LA TERESA {LOTE} {CULTIVO} {CAMPAÑA}". Filas que no calzan ese patrón (parcelas de
  //     ensayo/operativos como "A RECUPERAR RH", "OPERATIVO", "PARCELA MAIZ ZAFRIÑA") quedan
  //     fuera del plan RTK — igual que antes, solo importan los 6 cultivos de CULTIVOS.
  // El emparejamiento es case/acento-insensible para tolerar variaciones de export.
  // Filtro de campania: consultaCultivos no trae un campo de texto "campania" propio (solo
  // idCampania, un ID interno sin mapeo conocido), pero el sufijo "26/27" ya viene en 'nombre'
  // (mismo string que se usa para derivar lote/cultivo). Se reusa ese sufijo para descartar
  // filas de otras campañas, igual criterio que consultaOT — así el plan RTK no mezcla
  // hectáreas planificadas de más de una campaña si el export llega a traerlas combinadas.
  // Filas sin sufijo reconocible (formato histórico sin 'nombre' con campaña) pasan sin filtrar,
  // ya que no hay forma de determinar su campania.
  const RTK={};
  let n_proy_sin_ha=0, n_proy_filas=0, n_proy_otra_campania=0;
  (proyecciones||[]).forEach(rowRaw=>{
    const row={}; for(const k in rowRaw){ row[normHdr(k)]=rowRaw[k]; }
    const campSuf = String(row['nombre']||'').match(/(\d{2}\/\d{2})\s*$/);
    if(campSuf && campSuf[1]!==CAMPANIA_ACTUAL){ n_proy_otra_campania++; return; }
    let cultivo, lote;
    const m = String(row['nombre']||'').match(/^LA TERESA\s+(\S+)\s+([A-ZÁÉÍÓÚÑ]+)\s+\d{2}\/\d{2}$/);
    if(m){ lote = normLote(m[1]); cultivo = m[2].toUpperCase(); }
    else {
      // cultivo: preferir la variante de texto (Actividad_1 / Especie_1) sobre el ID numérico
      cultivo = row['actividad_1'] ?? row['especie_1'] ?? row['cultivo'] ?? row['actividad'] ?? row['especie'];
      cultivo = String(cultivo||'').trim().toUpperCase();
      lote = normLote(row['lote'] ?? row['parcela']);
    }
    const haRaw = row['hectareas'] ?? row['has a aplicar'] ?? row['superficie'];
    const ha = num(haRaw);
    if(!cultivo || !lote) return;
    n_proy_filas++;
    if(!ha){ n_proy_sin_ha++; return; }
    if(!RTK[cultivo]) RTK[cultivo]={};
    RTK[cultivo][lote]=(RTK[cultivo][lote]||0)+ha;   // suma defensiva por si un lote se repite
  });
  if(n_proy_otra_campania) console.log('consultaCultivos: '+n_proy_otra_campania+' filas de otra campaña descartadas (no '+CAMPANIA_ACTUAL+').');
  if(n_proy_sin_ha) console.warn('consultaCultivos: '+n_proy_sin_ha+' de '+n_proy_filas+' filas sin hectáreas válidas (ignoradas).');
  const RTK_TOT={}; for(const c in RTK){ RTK_TOT[c]=Object.values(RTK[c]).reduce((a,b)=>a+b,0); }
  return {RTK,RTK_TOT};
}

// Avance de campo por cultivo y etapa. Devuelve tambien las dos colecciones de trazabilidad que
// el avance deja de lado (OT sin Has. Reales validas, y trabajos del estadio Siembra que no son
// sembrar) — se exponen en D pero ningun render las lee.
function construirCultivos(OTS, RTK, RTK_TOT, rawTodasCampanias=[]){
  // La siembra de Zafriña26 se integra al avance de Maíz, a pedido del usuario.
  // Comparte el plan de Maíz 26/27: la separación de zafra es solo operativa.
  // No amplía las OT de costos, alertas ni Control de Hectáreas.
  const filasZafrina = rawTodasCampanias.filter(r=>campaniaDeFila(r)==='26' &&
    ['maiz','maiz zafrina'].includes(normHdr(r.actividad)) && normEstadio(r.estadio)==='siembra');
  const otsZafrina = agruparOTS(normalizarFilasOT(filasZafrina)).map(o=>({...o,
    act:'MAIZ', lote:'Zafriña26 / '+o.lote, planCompartidoZafrina:true}));
  OTS = OTS.concat(otsZafrina);
  // ---- CULTIVOS: avance de campo ----
  // Estructura de avance EXCLUSIVA del Resumen Ejecutivo — no toca land/exceso/sinrtk (Control de
  // Hectareas, mas abajo) ni gastos/dmap (Servicios). Antes se acreditaba la superficie RTK
  // COMPLETA del lote apenas aparecia UNA OT confirmada en ese lote, sin importar si era una tarea
  // de unas pocas horas (ej. una retroexcavadora) o una labor real de campo — eso inflaba el avance.
  // Ahora se usa Has. Reales de OT confirmadas de trabajo por hectareas (modalidadLaborOT, ver
  // arriba), agrupadas por lote+estadio+labor, cada labor capada al plan del lote y promediada por
  // estadio (labores distintas = pasadas distintas sobre la misma superficie, nunca se suman como
  // superficie fisica adicional). Las OT por horas aportan 0 ha; las OT por hectareas sin Has.
  // Reales valido se excluyen y quedan registradas en avanceInconsistencias, sin romper el render.
  const avanceInconsistencias=[];
  // Trabajos cargados en el Estadio "Siembra" que no son la siembra en si (hoy, tratamiento de
  // semillas — ver SIEMBRA_SERVICIOS_NO_SIEMBRA en config.js). Quedan fuera del avance de Siembra
  // pero NO se pierden: sus costos, su conteo de OT y su presencia en Servicios/Insumos siguen
  // exactamente igual, solo dejan de acreditar superficie sembrada.
  const siembraExcluidas=[];
  function esAvanceDeSiembraValido(o){
    if(normEstadio(o.estadio)!=='siembra') return true;   // otros estadios no se tocan
    const serv=normHdr(o.serv);
    if(!SIEMBRA_SERVICIOS_NO_SIEMBRA.some(p=>serv.startsWith(p))) return true;
    siembraExcluidas.push({ot:o.ot,lote:o.lote,servicio:o.serv});
    return false;
  }
  const cultivos=CULTIVOS.map(c=>{
    const sub=OTS.filter(o=>o.act.toUpperCase()===c);
    const ha_plan=RTK_TOT[c]||0;
    // Antes se descartaba todo cultivo sin ninguna OT (sub.length===0), lo que ocultaba por
    // completo un cultivo planificado (RTK>0) que todavía no tiene ninguna OT cargada — caso real
    // que el Resumen Ejecutivo necesita poder detectar ("cultivo planificado sin ejecución", ver
    // resumen.problemas más abajo). Ahora solo se descarta si NO tiene ni OT ni plan (irrelevante
    // para la campaña). No cambia nada para los cultivos que ya tenían OT.
    if(!sub.length && !ha_plan) return null;
    const conf=sub.filter(o=>o.estado==='Confirmado').length,
      ejec=sub.filter(o=>o.estado==='En Ejecución').length,
      pend=sub.filter(o=>o.estado==='Pendiente').length;
    const costo=sub.filter(o=>o.estado==='Confirmado').reduce((s,o)=>s+o.imp,0);

    // ---- Avance por ETAPA (campo "Estadio" de la OT) ----
    // Solo se consideran las 4 etapas de campaña: Preparación de Suelo, Siembra, Cuidados, Cosecha.
    // Se excluyen otros valores de Estadio que puedan aparecer (Secadero, Mantenimientos de
    // infraestructura, Operativo, Generador combustible, etc.) por no ser etapas del ciclo del
    // cultivo. Orden fijo = secuencia agronómica (no cronológico de carga).
    // esAvanceDeSiembraValido saca del avance los trabajos que estan en el Estadio "Siembra" pero
    // no son sembrar (tratamiento de semillas). Se aplica aca, sobre confOT, para que valga a la vez
    // para los lotes que cuentan como iniciados (etMap) y para las hectareas (porLoteEstadioLabor):
    // si no, un lote con la semilla tratada figuraba con la etapa Siembra empezada.
    const confEtapa = sub.filter(o=>o.estado==='Confirmado' && ETAPA_ORDEN.includes(normEstadio(o.estadio)));
    const confOT = confEtapa.filter(o=>esAvanceDeSiembraValido(o));
    // OT confirmadas de un estadio del ciclo que NO acreditan superficie, con el motivo por el que
    // quedaron afuera. No es una regla nueva ni un filtro nuevo: son exactamente los mismos descartes
    // que el calculo del avance ya hacia (tratamiento de semillas, modalidad distinta de hectareas,
    // sin Has. Reales), que hasta ahora se perdian en silencio. Solo alimentan el desglose del
    // Avance Detallado, donde figuran aparte y con aporte 0 — nunca entran en ninguna suma.
    const sinAporte=[];
    const conAporte=new Set(confOT);
    confEtapa.forEach(o=>{ if(!conAporte.has(o))
      sinAporte.push({o,motivo:'Tratamiento de semillas: no acredita siembra'}); });
    const etMap={};
    confOT.forEach(o=>{
      const key=normEstadio(o.estadio);
      if(!etMap[key]) etMap[key]={nombre:ETAPA_LABEL[key],lotes:new Set()};
      etMap[key].lotes.add(normLote(o.lote));
    });
    // porLoteEstadioLabor[lote][estadio][laborKey] = {planificadas, ejecutadasReales} — labor
    // normalizada (normHdr) para que mayusculas/tildes/espacios no dupliquen el grupo. Solo OT
    // Confirmadas, de un estadio reconocido y de modalidad "hectareas" (ver modalidadLaborOT).
    const porLoteEstadioLabor={};
    confOT.forEach(o=>{
      if(o.modalidad!=='hectareas'){ // por horas u otra unidad: no aporta ha al avance
        sinAporte.push({o,motivo:MOTIVO_SIN_APORTE[o.modalidad]||'Sin línea de labor identificable'}); return; }
      if(o.ha==null){ avanceInconsistencias.push({ot:o.ot,cultivo:c,lote:o.lote,estadio:o.estadio,motivo:'OT por hectareas sin Has. Reales'});
        sinAporte.push({o,motivo:'OT por hectáreas sin Has. Reales'}); return; }
      const lote=normLote(o.lote), estadio=normEstadio(o.estadio);
      // La labor se normaliza y ademas se resuelve por LABORES_EQUIVALENTES (config.js): dos
      // nombres distintos que son la misma labor entran al MISMO grupo y por lo tanto se suman
      // entre si. Sin eso, la siembra con implemento y la siembra sin implemento del mismo lote
      // quedaban como dos labores y se promediaban — que es lo correcto para Disco 1 + Disco 2
      // (dos pasadas sobre la misma superficie) pero no para dos PEDAZOS del mismo lote.
      const laborKey=claveLaborAvance(o.serv);
      const planificadas=(RTK[c]&&RTK[c][lote])||0;
      if(!porLoteEstadioLabor[lote]) porLoteEstadioLabor[lote]={};
      if(!porLoteEstadioLabor[lote][estadio]) porLoteEstadioLabor[lote][estadio]={};
      const est=porLoteEstadioLabor[lote][estadio];
      // `nombres` y `ots` son trazabilidad para el desglose (Avance Detallado) y no participan de
      // ningun calculo: equivalenteLoteEstadio solo mira ejecutadasReales/planificadas.
      if(!est[laborKey]) est[laborKey]={planificadas,ejecutadasReales:0,planCompartidoZafrina:!!o.planCompartidoZafrina,
        nombres:new Set(),ots:[]};
      // Superficie ejecutada = ha_trab (la dosis de la linea de labor), no o.ha (Has. Reales):
      // en una OT que trabajo solo parte de la parcela, Has. Reales reporta la parcela ENTERA y
      // el avance quedaba sobreestimado — OT 4781, lote 203: Has. Reales 85,75 contra 1,77 de
      // superficie real. Ver el campo ha_trab en ordenes.js.
      // El guardia de arriba sigue mirando o.ha: ha_trab cae a Has. Reales cuando la OT no tiene
      // linea de labor, asi que si o.ha es null, ha_trab tambien lo es.
      est[laborKey].ejecutadasReales+=haTrabajada(o);
      est[laborKey].nombres.add(String(o.serv||'').trim()||'(sin labor)');
      est[laborKey].ots.push(o);
    });
    // ---- Actividades "PARCELA <cultivo>" ----
    // NO aportan al avance de ninguna etapa. Son trabajos operativos sobre la parcela, aparte del
    // ciclo del cultivo, y asi estan clasificados en OPERATIVAS (config.js): su costo se muestra en
    // Gastos Operativos del Resumen Ejecutivo, no como ejecucion agronomica.
    // Entre el 11/08/2026 y el 14/09/2026 si aportaban: se sumaban a Preparacion de Suelo del
    // cultivo que nombraban, sin capar por el plan de su propio lote (en RTK figuran con 0,01 ha, el
    // marcador de lote sin plan) y con el tope aplicado recien al total de la etapa. Esa excepcion
    // dejaba a SOJA, SORGO y MAIZ clavados en 100,0% por efecto del tope, tapando por ejemplo que el
    // lote 111 de soja (16,87 ha) no tiene ninguna OT de preparacion confirmada. Se quito a pedido
    // del usuario: una fumigacion aerea o una desecacion de parcela no es preparacion de suelo.
    // El avance vuelve a salir unicamente de las labores del cultivo, cada una capada contra el plan
    // de SU lote, de modo que ya no puede pasar del plan y no hace falta ningun tope por etapa.

    // Ejecucion equivalente de un (lote,estadio): promedio de las labores presentes, cada una
    // capada (min) a la superficie planificada de ESE lote — nunca sumadas entre si (ver ejemplo
    // Disco 1 + Disco 2 en el pedido: dos pasadas sobre la misma superficie, no 2x la superficie).
    function equivalenteLoteEstadio(lote, estadio){
      const labores=(porLoteEstadioLabor[lote]&&porLoteEstadioLabor[lote][estadio])||null;
      if(!labores) return 0;
      const valores=Object.values(labores).map(l=>l.planCompartidoZafrina ? l.ejecutadasReales : Math.min(l.ejecutadasReales,l.planificadas));
      return valores.reduce((a,b)=>a+b,0)/valores.length;
    }

    // ---- Desglose del avance de un estadio en sus labores (vista "Avance Detallado") ----
    // NO es un segundo calculo de avance: es la MISMA cuenta de arriba, leida termino a termino.
    // equivalenteLoteEstadio promedia las labores de cada lote, asi que el total del estadio es
    //   ha_ejec(estadio) = Σ_lotes  Σ_labores  min(ejecutadas, plan del lote) / n_labores(lote)
    // y cada labor ya tiene ahi su propio sumando, min(...)/n_labores. Agrupando esos sumandos por
    // labor a traves de los lotes sale cuanto aporta cada una, sin ninguna ponderacion inventada y
    // con la garantia de que la suma de los aportes ES el total del estadio, por construccion.
    // Lo que NO vive en la labor son los dos ajustes finales del estadio (el tope de Zafriña y el
    // redondeo a 2 decimales): se trasladan al desglose repartiendo el total ya ajustado en
    // proporcion a los sumandos, de modo que Σ aportes cierre exacto contra lo que muestra la
    // pantalla. El costo no interviene en nada de esto: el aporte es solo ejecucion fisica.
    function desglosarEstadio(k, lotes, ha_e, av_e){
      const porLabor={};
      lotes.forEach(l=>{
        const labores=(porLoteEstadioLabor[l]&&porLoteEstadioLabor[l][k])||null;
        if(!labores) return;
        const claves=Object.keys(labores), n=claves.length;
        claves.forEach(lk=>{
          const d=labores[lk];
          const valor=d.planCompartidoZafrina ? d.ejecutadasReales : Math.min(d.ejecutadasReales,d.planificadas);
          if(!porLabor[lk]) porLabor[lk]={clave:lk,nombres:new Set(),peso:0,ha_ejec:0,ots:[]};
          const a=porLabor[lk];
          a.peso+=valor/n;                  // el mismo sumando que promedia equivalenteLoteEstadio
          a.ha_ejec+=d.ejecutadasReales;    // superficie cruda: la que cierra con el detalle de OT
          d.nombres.forEach(x=>a.nombres.add(x));
          d.ots.forEach(o=>a.ots.push(o));
        });
      });
      // Orden estable, independiente del orden de las filas del Excel: primero la labor que mas
      // aporta al estadio y, a igual aporte, alfabetico.
      const arr=Object.values(porLabor).map(a=>({...a,nombres:[...a.nombres].sort((x,y)=>x.localeCompare(y,'es'))}))
        .sort((a,b)=>(b.peso-a.peso)||a.nombres[0].localeCompare(b.nombres[0],'es'));
      const pesos=arr.map(a=>a.peso);
      const centesimas=repartirMayorResto(pesos, Math.round(ha_e*100));
      const decimas=av_e==null ? null : repartirMayorResto(pesos, Math.round(av_e*10));
      return arr.map((a,i)=>({
        clave:a.clave,
        nombre:a.nombres[0],
        // Mas de un nombre = la labor la unifico LABORES_EQUIVALENTES; se conservan todos para poder
        // mostrar de donde salio el grupo.
        nombres:a.nombres,
        aporte_pct:decimas ? decimas[i]/10 : null,   // puntos del % del estadio que pone esta labor
        aporte_ha:centesimas[i]/100,                 // las ha de e.ha_ejec que pone esta labor
        ha_ejec:Math.round(a.ha_ejec*100)/100,       // ha trabajadas, sin capar ni promediar
        n_ot:a.ots.length,
        costo:a.ots.reduce((s,o)=>s+o.imp,0),
        ots:otsDeLabor(a.ots),
      }));
    }
    // Labores del estadio que NO acreditan superficie, agrupadas con la MISMA clave que las que si
    // aportan (una labor con una parte por hectareas y otra por horas cae en las dos listas, cada
    // OT en la que le corresponde y sin duplicarse). Aporte 0 por definicion, nunca se suman.
    // Solo se arma para los estadios que estan en `etapas`, que son los mismos que muestra el
    // Resumen Ejecutivo. Un estadio cuya UNICA actividad confirmada no acreditara nada (por ejemplo
    // solo tratamiento de semillas) no aparece en ninguna de las dos vistas; hoy no ocurre — las 47
    // OT de tratamiento de semillas son de ARROZ, que ademas tiene siembra real.
    function sinAporteEstadio(k){
      const porLabor={};
      sinAporte.filter(x=>normEstadio(x.o.estadio)===k).forEach(x=>{
        const lk=claveLaborAvance(x.o.serv);
        if(!porLabor[lk]) porLabor[lk]={clave:lk,nombres:new Set(),motivos:new Set(),ots:[]};
        const a=porLabor[lk];
        a.nombres.add(String(x.o.serv||'').trim()||'(sin labor)');
        a.motivos.add(x.motivo);
        a.ots.push(x.o);
      });
      return Object.values(porLabor).map(a=>({
        clave:a.clave,
        nombre:[...a.nombres].sort((x,y)=>x.localeCompare(y,'es'))[0],
        nombres:[...a.nombres].sort((x,y)=>x.localeCompare(y,'es')),
        motivos:[...a.motivos].sort((x,y)=>x.localeCompare(y,'es')),
        n_ot:a.ots.length,
        costo:a.ots.reduce((s,o)=>s+o.imp,0),
        ots:otsDeLabor(a.ots),
      })).sort((a,b)=>(b.n_ot-a.n_ot)||a.nombre.localeCompare(b.nombre,'es'));
    }
    const etapas=ETAPA_ORDEN.filter(k=>etMap[k]).map(k=>{
      const e=etMap[k];
      const incluyeZafrina=confOT.some(o=>o.planCompartidoZafrina && normEstadio(o.estadio)===k && o.modalidad==='hectareas' && o.ha!=null);
      let ha_e=0; e.lotes.forEach(l=>{ ha_e+=equivalenteLoteEstadio(l,k); });
      // La siembra registrada en otra zafra usa el mismo plan total, sin duplicarlo.
      if(incluyeZafrina && ha_plan>0) ha_e=Math.min(ha_e,ha_plan);
      ha_e=Math.round(ha_e*100)/100;
      const av_e = ha_plan>0 ? Math.round(ha_e/ha_plan*1000)/10 : null;
      // OT de ESTE estadio puntual (cualquier Estado, no solo Confirmado) — para que "OT
      // Confirmadas/Totales" del Detalle de Etapas por Cultivo nunca mezcle OT de otro estadio.
      // "ha_plan" se repite tal cual (mismo valor que el cultivo): el plan RTK no tiene desglose
      // por estadio, así que la referencia planificada es siempre la meta de toda la campaña.
      const subEtapa = sub.filter(o=>normEstadio(o.estadio)===k);
      // "labores" es la descomposicion de ESTE mismo avance (ver desglosarEstadio): la suma de sus
      // aportes da ha_ejec y avance, no una segunda cuenta. "labores_sin_aporte" son las labores
      // confirmadas del estadio que no acreditan superficie, para que ninguna OT desaparezca sin
      // explicacion. Las dos son solo trazabilidad: ningun indicador existente las lee.
      return {nombre:e.nombre, ha_ejec:ha_e, avance:av_e, n_lotes:e.lotes.size, ha_plan, incluyeZafrina,
        otConfirmadas: subEtapa.filter(o=>o.estado==='Confirmado').length, otTotales: subEtapa.length,
        labores: desglosarEstadio(k, e.lotes, ha_e, av_e), labores_sin_aporte: sinAporteEstadio(k)};
    });
    const etapa_actual = etapas.length? etapas[etapas.length-1].nombre : null;
    // ha_ejec/avance a nivel cultivo = los del estadio actual (el mas avanzado de la secuencia
    // agronomica con actividad confirmada) — es lo mismo que ya se muestra en la tarjeta del
    // cultivo, y evita sumar superficie de mas de un estadio (que duplicaria el mismo lote).
    const ha_ejec = etapas.length ? etapas[etapas.length-1].ha_ejec : 0;
    let av; if(ha_plan>0) av=Math.round(ha_ejec/ha_plan*1000)/10; else { const t=conf+ejec+pend; av=t?Math.round(conf/t*1000)/10:0; }

    const incluyeZafrina=etapas.some(e=>e.incluyeZafrina);
    return {nombre:c,ha_plan:Math.round(ha_plan*100)/100,ha_ejec,avance:av,tiene_rtk:ha_plan>0,conf,ejec,pend,costo,col:color(av),etapas,etapa_actual,incluyeZafrina};
  }).filter(Boolean).sort((a,b)=>(b.ha_plan-a.ha_plan)||(b.costo-a.costo));
  if(avanceInconsistencias.length) console.warn('Avance de campo: '+avanceInconsistencias.length+' OT por hectareas sin Has. Reales valido (excluidas del avance, ver D.avance_inconsistencias).');
  if(siembraExcluidas.length) console.log('Avance de campo: '+siembraExcluidas.length+' OT del estadio Siembra excluidas del avance por no ser siembra ('+[...new Set(siembraExcluidas.map(x=>x.servicio))].join(', ')+') — ver D.siembra_excluidas.');
  return {cultivos,avanceInconsistencias,siembraExcluidas};
}

// Control de Hectareas: lotes con exceso de superficie, lotes inhabilitados y OT sin
// correspondencia en el plan RTK.
function construirControlHectareas(OTS, RTK){
  // ---- CONTROL DE HECTÁREAS ----
  const RTK_CROPS=['ARROZ','SOJA','SORGO','MAIZ'];
  // Solo OT Confirmadas: una OT Pendiente o En Ejecucion no ejecuto superficie todavia, asi que no
  // puede haber excedido nada. Antes entraban todos los estados.
  // La superficie sale de Unidades/Dosis (haTrabajada, ver utils.js) y no de Has. Reales: es la
  // superficie que se trabajo y se facturo — el importe de la labor es unidadesDosis * precio.
  const land=OTS.filter(o=>o.estado==='Confirmado' && !(o.lines.every(l=>l.esHoras))
    && RTK_CROPS.includes(o.act.toUpperCase()) && haTrabajada(o)!=null
    && !LOTES_NO_PARCELA.includes(normLote(o.lote)));
  const exceso=[], sinrtk=[], cancelados=[];
  RTK_CROPS.forEach(c=>{
    const byLote={};
    land.filter(o=>o.act.toUpperCase()===c).forEach(o=>{ const k=normLote(o.lote); (byLote[k]=byLote[k]||[]).push(o); });
    // Lotes a recorrer: los que tienen OT cargada (byLote) MÁS los del plan RTK (RTK[c]) — un lote
    // cancelado (RTK≈0.01) puede no tener ninguna OT todavía, y aun así se quiere listar (a pedido
    // del usuario, para poder visualizar TODOS los lotes deshabilitados, no solo los que ya tienen
    // labor cargada). Fuera de la rama "cancelado", un lote solo del plan sin ninguna OT (byLote[k]
    // ausente) se sigue ignorando: no hay nada que comparar contra el RTK todavía.
    const lotes=new Set([...Object.keys(byLote), ...(RTK[c]?Object.keys(RTK[c]).filter(k=>!LOTES_NO_PARCELA.includes(k)):[])]);
    for(const k of lotes){
      const g=byLote[k], ha_rtk=RTK[c]?RTK[c][k]:undefined;
      if(ha_rtk==null){ g.forEach(o=>sinrtk.push({ot:o.ot,cult:c,lote:o.lote,act:o.estadio||'-',serv:o.serv||'-',ha:haTrabajada(o),estado:o.estado})); continue; }
      if(Math.abs(ha_rtk-RTK_LOTE_CANCELADO)<0.001){
        const dets=(g||[]).slice().sort((a,b)=>haTrabajada(b)-haTrabajada(a)).map(o=>({ot:o.ot,act:o.estadio||'-',serv:o.serv||'-',estado:o.estado}));
        cancelados.push({cult:c,lote:g?g[0].lote:k,n_ot:dets.length,dets});
        continue;
      }
      if(!g) continue;
      // Superficie con que el lote entra al control: la trabajada/facturada, no Has. Reales.
      // Con Has. Reales el lote 207 figuraba con 11,89 ha de exceso que nunca se facturaron (la
      // OT 4219 traia Has. Reales 38,50 sobre un lote de 26,61 pero cobro 26,79), y al mismo
      // tiempo se perdian 7 lotes donde SI se facturo de mas: en ellos Has. Reales coincide
      // exacto con el plan y la dosis lo supera (ej. Fumigacion Dron en .32B: 11,92 ha cobradas
      // sobre 9,70 de lote).
      const ha_ot=Math.max.apply(null,g.map(o=>haTrabajada(o)));
      const diff=Math.round((ha_ot-ha_rtk)*100)/100;
      if(diff>0.5){
        const dets=g.slice().sort((a,b)=>haTrabajada(b)-haTrabajada(a)).map(o=>({ot:o.ot,act:o.estadio||'-',serv:o.serv||'-',ha:haTrabajada(o),estado:o.estado,over:haTrabajada(o)>ha_rtk+0.01}));
        exceso.push({cult:c,lote:g[0].lote,ha_rtk:Math.round(ha_rtk*100)/100,ha_ot:Math.round(ha_ot*100)/100,diff,pdiff:Math.round(diff/ha_rtk*1000)/10,n_ot:dets.length,dets});
      }
    }
  });
  exceso.sort((a,b)=>b.diff-a.diff);
  sinrtk.sort((a,b)=> a.cult<b.cult?-1:a.cult>b.cult?1:(a.lote<b.lote?-1:1));
  cancelados.sort((a,b)=> a.cult<b.cult?-1:a.cult>b.cult?1:(a.lote<b.lote?-1:1));
  const exc_kpi={n:exceso.length, ha:Math.round(exceso.reduce((s,e)=>s+e.diff,0)*100)/100,
    mayor:Math.round(Math.max(0,...exceso.map(e=>e.diff))*100)/100, n_sinrtk:sinrtk.length};
  return {exceso,sinrtk,cancelados,exc_kpi};
}
