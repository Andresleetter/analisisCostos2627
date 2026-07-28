// ================== HELPERS ==================
const fmt = n => Math.round(n||0).toLocaleString('es-AR');
const fmt1 = n => (n||0).toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
const fmt2 = n => (n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtUSD = n => (n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
function num(v){ if(v==null) return 0; if(typeof v==='number') return v; let s=String(v).trim(); if(!s) return 0;
  s=s.replace(/\s/g,''); if(s.indexOf(',')>-1 && s.indexOf('.')>-1){ s=s.replace(/\./g,'').replace(',', '.'); }
  else if(s.indexOf(',')>-1){ s=s.replace(',', '.'); } const n=parseFloat(s); return isNaN(n)?0:n; }
function numN(v){ if(v==null||String(v).trim()==='') return null; const n=num(v); return n; }
function normLote(x){ let s=String(x==null?'':x).trim().replace(/^\.+/,'').trim().toUpperCase(); s=s.replace(/^0+(?=\d)/,''); return s; }
function pdate(v){ if(!v) return null;
  // SheetJS (lectura del .xlsx con cellDates:true) entrega las celdas de fecha como Date nativos.
  if(v instanceof Date) return isNaN(v)?null:v;
  const s=String(v).trim(); if(!s) return null;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if(m){ let y=+m[3]; if(y<100)y+=2000; return new Date(y,+m[2]-1,+m[1]); }
  const d=new Date(s); return isNaN(d)?null:d; }
function keyOf(row,names){ for(const n of names){ if(n in row) return row[n]; const k=Object.keys(row).find(k=>k.trim()===n.trim()); if(k) return row[k]; } return undefined; }
function color(av){ return av>=95?'g':(av>=80?'y':(av>=50?'o':'r')); }
// Porcentaje seguro: evita division por cero devolviendo null (no NaN/Infinity) cuando no hay una
// base valida — el llamador decide como mostrar la ausencia de dato (ej. "Sin plan disponible"),
// en vez de que un 0 o un NaN se cuele silenciosamente en un KPI.
function pctSeguro(parte,total){ if(!total) return null; return Math.round((parte/total)*1000)/10; }
// Severidad de "Posibles problemas" (Resumen Ejecutivo): reutiliza los mismos colores de estado ya
// usados en el resto del dashboard (c-g/c-y/c-o/c-r + el neutro c-gris, ver panel.css). Se separa
// de color() porque la escala de severidad no es un porcentaje de avance sino una clasificación
// categórica de 4 niveles fija (critica/alta/media/informativa) — "informativa" usa el neutro
// (gris), no el verde, para no leerse como "todo bien" cuando en realidad es una desviación,
// aunque de baja severidad.
const SEVERIDAD_COLOR={critica:'r',alta:'o',media:'y',informativa:'gris'};
const SEVERIDAD_LABEL={critica:'Crítica',alta:'Alta',media:'Media',informativa:'Informativa'};
function colorSeveridad(sev){ return SEVERIDAD_COLOR[sev]||'gris'; }
function labelSeveridad(sev){ return SEVERIDAD_LABEL[sev]||'Info'; }
function normEstadio(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function stripAccents(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function normHdr(s){ return stripAccents(s).toLowerCase().replace(/\uFEFF/g,'').replace(/\s+/g,' ').trim(); }
// Arrastre de stock mes a mes, reutilizable (misma logica que ya usaba Combustible antes de
// refactorizarse para usar esta funcion): para "Toda la Campa\u00F1a" el stock inicial del periodo es
// el stock base de arranque; para un mes puntual es ese stock base mas todo lo ingresado/consumido
// en los meses ANTERIORES (mesnum < mes), asi el balance de cada mes sigue naturalmente al del mes
// previo en vez de recalcularse desde cero. `movsIngreso`/`movsConsumo` son arrays con {mesnum,
// cantidad} ya filtrados a la clave que corresponda (ej. un tercero, o un tipo+unidad de insumo).
function stockInicioDePeriodo(mes, stockBase, movsIngreso, movsConsumo){
  if(mes==='ALL') return stockBase;
  return stockBase
    + movsIngreso.filter(r=>r.mesnum<mes).reduce((s,r)=>s+r.cantidad,0)
    - movsConsumo.filter(r=>r.mesnum<mes).reduce((s,r)=>s+r.cantidad,0);
}
// ---- Insumos: unidad de medida dinámica de los KPIs (Stock Inicial/Ingreso/Consumo/Balance) ----
// La unidad de cada KPI se deriva de las filas de insumos_stock_flujo que quedan tras aplicar los
// filtros activos (Tipo de Insumo + Insumo, y el período vía como se arma flujoRows en render.js).
// No hay lista fija de unidades: sale 100% de la columna "Unidad de medida" de consultaInsumos, tal
// como ya la trae cada fila. Se compara normalizada (normHdr: sin acentos/mayúsculas, espacios
// colapsados) para no separar la misma unidad por una diferencia de tipeo, pero se conserva y
// muestra siempre el texto original. Si hay más de una unidad real entre las filas, NO se suman
// como si fueran homogéneas (litros + kilos no es una cantidad válida) — se devuelve el marcador
// 'MULTI' para que el llamador (fmtKpiUnidad) nunca la muestre junto al valor.
// OJO: el llamador (renderInsumos, en render.js) solo debe invocar esta función cuando el usuario
// eligió un Insumo puntual en #iinsumo — con "Todos los Insumos" (o un Tipo sin Insumo elegido) la
// unidad NO debe mostrarse aunque el conjunto resulte homogéneo; esa condición se decide por el
// filtro elegido, no por si el resultado tiene una sola unidad.
function unidadUnicaDe(filasConUnidad){
  const porNorm = new Map();
  (filasConUnidad||[]).forEach(f=>{
    const u = String(f.unidad||'').trim();
    if(!u || u==='(sin unidad)') return;
    const k = normHdr(u);
    if(!porNorm.has(k)) porNorm.set(k, u);
  });
  if(porNorm.size===0) return null;
  if(porNorm.size===1) return [...porNorm.values()][0];
  return 'MULTI';
}
// Formatea un KPI de Insumos combinando valor + unidad resuelta por unidadUnicaDe(): con una sola
// unidad válida la agrega en <small>, mismo patrón ya usado en los KPI de Combustible
// (fmt2(valor)+'<small> L</small>'). Sin unidad resuelta (null: no corresponde mostrarla porque
// #iinsumo está en "Todos", o no hay unidad válida) o con 'MULTI' (el Insumo puntual elegido igual
// tiene varias unidades) se deja el valor tal cual, SIN sufijo y sin ningún texto explicativo — no
// se avisa "Múltiples unidades", simplemente no se muestra unidad.
function fmtKpiUnidad(valor, unidadResuelta){
  const u = (unidadResuelta && unidadResuelta!=='MULTI') ? unidadResuelta : null;
  return fmt2(valor) + (u ? '<small> '+u+'</small>' : '');
}
// Normaliza un nombre de insumo/tipo para COMPARAR (nunca para mostrar): se compone sobre normHdr
// ya existente (acentos/mayúsculas/espacios) y además colapsa los espacios alrededor de un guion
// ("Arroz - CH" y "Arroz-CH" quedan iguales) — variantes de tipeo explícitamente pedidas para la
// exclusión de insumos (ver INSUMOS_EXCLUIDOS en config.js). No amplía la coincidencia a otros
// insumos que solo compartan una palabra: sigue siendo una comparación de cadena completa.
function normInsumoNombre(s){ return normHdr(s).replace(/\s*-\s*/g,'-'); }
// Agrupa filas de flujo de Insumos (ya filtradas por Tipo/Insumo/Mes en render.js, a partir de las
// colecciones precomputadas en data.js) por Unidad de Medida — nunca suma cantidades de unidades
// distintas en un solo total. Cada fila resultante es matemáticamente independiente de las demás.
// "cantidadInsumos" cuenta insumos distintos (Tipo+Nombre) presentes en esa unidad dentro del
// filtro activo, mismo criterio que ya usaba Stock Inicial (incluye insumos con solo Stock Inicial,
// no solo los "activos" por Ingreso/Consumo — el selector de Insumo ya los excluye aparte).
function resumenInsumosPorUnidad(filasDeFlujo){
  const porUnidad = new Map();
  (filasDeFlujo||[]).forEach(f=>{
    const key = normHdr(f.unidad) || '(sin unidad)';
    if(!porUnidad.has(key)) porUnidad.set(key, {unidad:f.unidad||'(sin unidad)', stockInicial:0, ingreso:0, consumo:0, balance:0, insumos:new Set()});
    const o = porUnidad.get(key);
    o.stockInicial+=f.stockInicio; o.ingreso+=f.ingresoPeriodo; o.consumo+=f.consumoPeriodo; o.balance+=f.balance;
    o.insumos.add(f.tipo+'|'+f.nombre);
  });
  return [...porUnidad.values()].map(o=>({
    unidad:o.unidad, stockInicial:Math.round(o.stockInicial*100)/100, ingreso:Math.round(o.ingreso*100)/100,
    consumo:Math.round(o.consumo*100)/100, balance:Math.round(o.balance*100)/100, cantidadInsumos:o.insumos.size,
  })).sort((a,b)=> b.cantidadInsumos-a.cantidadInsumos || a.unidad.localeCompare(b.unidad,'es'));
}
