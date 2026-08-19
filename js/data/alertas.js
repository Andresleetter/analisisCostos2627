// ================== DATOS · ALERTAS OPERACIONALES ==================
// OT Pendientes / En Ejecución y cuales de ellas estan atrasadas.
// TOLERANCIA_ATRASO_DIAS se devuelve porque el Resumen Ejecutivo la cita textualmente en la
// tarjeta de "OT atrasadas": tiene que ser el mismo numero, no una copia.
function construirAlertas(OTS){
  // ---- ALERTAS ----
  // Tolerancia de 3 días completos posteriores a la Fecha Teórica antes de marcar una OT como
  // atrasada (a pedido del usuario — evita alertar por demoras administrativas normales de pocos
  // días). Fecha de referencia = fecha REAL del sistema (new Date()), normalizada al inicio del
  // día para no arrastrar errores de hora/huso horario — NUNCA "HOY" (definida más arriba como la
  // mayor Fecha Teórica encontrada en el Excel: eso solo indica qué tan actualizado está el
  // archivo para el rótulo "Datos al…"/D.fecha_datos, no qué día es hoy realmente).
  // esOTAtrasada() es la ÚNICA función que decide el atraso — la reutilizan el KPI (totalAtrasadas),
  // la marca "atrasada" de cada fila de la tabla y el badge de la pestaña (ver render.js), para que
  // nunca puedan desincronizarse. La tabla en sí muestra TODA la base (otsVisibles, más abajo), no
  // solo las atrasadas — a pedido del usuario, ya que para eso está el KPI aparte. diasTranscurridos
  // se calcula UNA sola vez acá (diasTranscurridosDesde) y se reutiliza tal cual (SIN descontar la
  // tolerancia) tanto en la tabla como en la decisión de atraso — a pedido del usuario, la tabla
  // muestra el día real transcurrido (0d/1d/2d/3d/4d…), la tolerancia de 3 días solo decide si esa
  // OT cuenta o no como atrasada, nunca qué número se imprime en la celda.
  const TOLERANCIA_ATRASO_DIAS=3;
  const HOY_REAL=new Date();
  HOY_REAL.setHours(0,0,0,0);
  function diasTranscurridosDesde(fecha){
    if(!fecha) return null; // sin Fecha Teórica válida: nunca atrasada, nunca NaN (ver más abajo)
    const f=new Date(fecha);
    f.setHours(0,0,0,0);
    return Math.floor((HOY_REAL-f)/86400000);
  }
  function esOTAtrasada(o){
    const dias=diasTranscurridosDesde(o.ft);
    return dias!=null && dias>TOLERANCIA_ATRASO_DIAS;
  }
  // otsVisibles = OT únicas (OTS ya agrupado por número de OT) con estado Pendiente o En Ejecución,
  // atrasadas o no. Única colección que alimenta la tabla y sus filtros — nunca se recorre OTS de
  // nuevo desde cero para esto. Cada fila trae diasTranscurridos crudo (puede ser negativo con
  // Fecha Teórica futura, o null sin Fecha Teórica válida — render.js decide ahí si muestra el
  // número o un guion) y "atrasada" (bool, vía esOTAtrasada), usada para el color de severidad de
  // fila y para separar otsAtrasadas más abajo.
  const otsVisibles=OTS.filter(o=>esPendiente(o)||esEnEjecucion(o)).map(o=>{
    const diasTranscurridos=diasTranscurridosDesde(o.ft);
    return {ot:o.ot,cult:o.act,act:o.estadio||'-',serv:o.serv||'-',lote:o.lote,estado:o.estado,
      ft:o.ft, diasTranscurridos, atrasada:esOTAtrasada(o)};
  }).sort((a,b)=>{
    // Mayor a menor diasTranscurridos: más atrasadas primero, luego las de menos días, luego
    // fecha futura (diasTranscurridos negativo, las más próximas antes que las lejanas) y sin
    // Fecha Teórica válida al final.
    if(a.diasTranscurridos==null && b.diasTranscurridos==null) return 0;
    if(a.diasTranscurridos==null) return 1;
    if(b.diasTranscurridos==null) return -1;
    return b.diasTranscurridos-a.diasTranscurridos;
  });
  // otsAtrasadas = subconjunto atrasado de otsVisibles — única fuente del KPI "OT Atrasadas"/badge
  // y de "Posibles Problemas" en Resumen Ejecutivo (ver más abajo), nunca se recalcula por separado
  // ni se usa como fuente de la tabla.
  const otsAtrasadas=otsVisibles.filter(a=>a.atrasada);
  const totalAtrasadas=otsAtrasadas.length;
  return {otsVisibles,otsAtrasadas,totalAtrasadas,TOLERANCIA_ATRASO_DIAS};
}
