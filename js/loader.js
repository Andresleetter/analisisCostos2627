// ================== LOAD ==================
function showError(msg){ const ov=document.getElementById('overlay'); ov.classList.add('err'); ov.style.display='flex';
  document.getElementById('ov-title').textContent='No se pudieron cargar los datos';
  document.getElementById('ov-msg').textContent=String(msg||'Error de red al descargar el archivo remoto.')+' Verifique la conexión o que la URL esté disponible.';
  document.getElementById('ov-retry').style.display='inline-block'; }

// Descarga y parsea un .xlsx. `url` es la fuente normal (ruta relativa: el propio sitio, servido
// por Cloudflare — ver SRC_XLSX en config.js) y `urlRespaldo` es el plan B contra GitHub, que se
// intenta UNA sola vez si la primera falla. Cubre dos casos reales: que el sitio no pueda servir el
// archivo, y que alguien abra index.html directo desde el disco (ahí fetch de una ruta relativa no
// funciona por seguridad del navegador, pero la URL absoluta sí).
// El respaldo NO se usa al revés: GitHub limita conexiones (503/429 sostenidos el 17/08/2026) y no
// está pensado para servir tráfico de usuarios.
function descargarXLSX(nombre, url){
  console.log('Iniciando carga:', url);
  return fetch(url, {cache:'no-store'})
    .then(function(resp){
      console.log('HTTP Status:', resp.status, '('+nombre+')');
      if(!resp.ok) throw new Error('HTTP '+resp.status+' '+(resp.statusText||'')+' al descargar '+nombre);
      return resp.arrayBuffer();
    })
    .then(function(buf){
      var wb = XLSX.read(new Uint8Array(buf), {type:'array', cellDates:true});
      console.log('Hojas encontradas en '+nombre+':', wb.SheetNames.join(', '));
      return wb;
    });
}
function cargarXLSX(nombre, url, urlRespaldo){
  return descargarXLSX(nombre, url)
    .catch(function(e){
      if(!urlRespaldo) throw e;
      console.warn('No se pudo cargar '+nombre+' desde el sitio ('+(e.message||e)+'). Reintentando desde GitHub…');
      return descargarXLSX(nombre, urlRespaldo)
        .catch(function(e2){
          // Se informa el error del respaldo, que es el último que impidió cargar, pero se deja
          // constancia de los dos en consola para no perder el motivo original.
          console.error('Error al cargar '+nombre+' — sitio:', e.message||e, '| respaldo:', e2.message||e2);
          throw new Error('Error al descargar '+nombre+' desde '+urlRespaldo+': '+(e2.message||e2));
        });
    })
    .catch(function(e){
      console.error('Error al cargar '+nombre+':', e.message||e);
      throw e instanceof Error ? e : new Error('Error al descargar '+nombre+': '+e);
    });
}
// Descarga y parsea un .json, con el MISMO esquema de respaldo que cargarXLSX (sitio primero,
// GitHub como plan B, una sola vez). A diferencia de cargarRecetas, el error SI se propaga: este
// cargador se usa para datos sin los cuales el dashboard no puede armarse.
function descargarJSON(nombre, url){
  console.log('Iniciando carga:', url);
  return fetch(url, {cache:'no-store'}).then(function(resp){
    console.log('HTTP Status:', resp.status, '('+nombre+')');
    if(!resp.ok) throw new Error('HTTP '+resp.status+' '+(resp.statusText||'')+' al descargar '+nombre);
    return resp.json();
  });
}
function cargarJSON(nombre, url, urlRespaldo){
  return descargarJSON(nombre, url)
    .catch(function(e){
      if(!urlRespaldo) throw e;
      console.warn('No se pudo cargar '+nombre+' desde el sitio ('+(e.message||e)+'). Reintentando desde GitHub…');
      return descargarJSON(nombre, urlRespaldo)
        .catch(function(e2){
          console.error('Error al cargar '+nombre+' — sitio:', e.message||e, '| respaldo:', e2.message||e2);
          throw new Error('Error al descargar '+nombre+' desde '+urlRespaldo+': '+(e2.message||e2));
        });
    });
}

// Recetas de insumos: JSON estatico y chico (data/recetas-insumos-26-27.json). Se descarga UNA sola
// vez, en la carga inicial, junto con los .xlsx — nunca al cambiar un filtro, abrir un lote o
// cambiar de pestaña: el indice queda en memoria durante toda la sesion (ver D.recetas).
// NO usa SheetJS: es JSON, se parsea con resp.json().
// Mismo esquema de respaldo que los .xlsx (sitio primero, GitHub como plan B).
function cargarRecetas(url, urlRespaldo){
  var pedir = function(u){
    console.log('Iniciando carga:', u);
    return fetch(u, {cache:'no-store'}).then(function(resp){
      console.log('HTTP Status:', resp.status, '(recetas de insumos)');
      if(!resp.ok) throw new Error('HTTP '+resp.status+' al descargar las recetas de insumos');
      return resp.json();
    });
  };
  return pedir(url)
    .catch(function(e){
      if(!urlRespaldo) throw e;
      console.warn('No se pudieron cargar las recetas desde el sitio ('+(e.message||e)+'). Reintentando desde GitHub…');
      return pedir(urlRespaldo);
    })
    .then(function(json){
      if(!Array.isArray(json)) throw new Error('El JSON de recetas no es una lista de registros.');
      return json;
    })
    // El seguimiento de receta es informacion ADICIONAL: si no se puede cargar, la Auditoria debe
    // seguir mostrando la dosis real, las cantidades y los costos igual que siempre. Por eso el
    // error se registra y se devuelve null en vez de propagarse — no entra al catch de loadData()
    // ni muestra la pantalla de error.
    .catch(function(e){
      console.error('No se pudieron cargar las recetas de insumos:', e.message||e,
        '— la Auditoría de Insumos por Parcela funciona igual, sin el seguimiento de receta.');
      return null;
    });
}

// Fecha/hora de última modificación real del .xlsx (metadata de Office, docProps/core.xml —
// Excel la actualiza sola cada vez que se guarda el archivo, sin intervención del usuario). Se
// usa para el rótulo de "actualizado" del header (ver render.js) porque representa cuándo cambió
// el ARCHIVO en sí, no cuándo el usuario abrió la página ni la fecha de los datos que contiene.
// raw.githubusercontent.com no expone un header HTTP Last-Modified (verificado contra la
// respuesta real), así que esta metadata interna es la única fuente confiable disponible.
function fechaModificacionXLSX(wb){
  var md = wb && wb.Props && wb.Props.ModifiedDate;
  return (md instanceof Date && !isNaN(md)) ? md : null;
}
function hojaARows(wb, nombreHoja){
  var sheet = wb.Sheets[nombreHoja];
  if(!sheet) throw new Error('El archivo no contiene la hoja «'+nombreHoja+'». Hojas disponibles: '+wb.SheetNames.join(', '));
  var rows = XLSX.utils.sheet_to_json(sheet, {defval:''});
  if(!rows.length) throw new Error('La hoja «'+nombreHoja+'» no contiene filas.');
  return rows;
}
// Separa consultaInsumos (trae TODOS los insumos) en cuatro grupos:
//  - combustible: filas de tipoInsumo=COMBUSTIBLES que son Ingreso/Consumo real, transformadas
//    a la MISMA forma que tenía el viejo Movimiento_de_combustible.csv (para no tocar buildData).
//    Nota: en esta hoja 'unidades' viene con signo (negativo=egreso); se pasa en valor absoluto,
//    igual que el CSV anterior.
//  - existenciaInicial: filas de tipoInsumo=COMBUSTIBLES con tipoMovimiento="Existencia inicial"
//    (stock de arranque de campaña) — no son Ingreso ni Consumo, se agregan aparte.
//  - excluidos: filas cuyo insumo está en INSUMOS_EXCLUIDOS (config.js) — hoy solo "Afrecho de
//    Arroz - CH". Se separan ACÁ, antes de que data.js construya ningún filtro/KPI/tabla del
//    módulo Insumos, para que no participen de nada visible. Se conservan en su propia colección
//    (nunca se descartan del todo) solo para trazabilidad — no se usan en ningún cálculo.
//  - otros: el resto de insumos (no combustible, no excluidos) — alimenta el módulo Insumos.
// OJO: consultaInsumos NO se filtra por campaña acá (a diferencia de consultaOT/consultaCultivos)
// — se procesa completa, sin recortar por fecha ni campania, tal como antes de introducir ese filtro.
function esInsumoExcluido(nombre){
  var nombreNorm = normInsumoNombre(nombre);
  return INSUMOS_EXCLUIDOS.some(function(ex){ return normInsumoNombre(ex)===nombreNorm; });
}
function separarInsumos(rows){
  var combustible = [], existenciaInicial = [], otros = [], excluidos = [];
  rows.forEach(function(r){
    if(String(r.tipoInsumo||'').trim().toUpperCase() !== TIPO_INSUMO_COMBUSTIBLE){
      if(esInsumoExcluido(r.nombre)){ excluidos.push(r); return; }
      otros.push(r); return;
    }
    if(String(r.tipoMovimiento||'').trim() === MOV_EXISTENCIA_INICIAL){ existenciaInicial.push(r); return; }
    combustible.push({
      'Fecha': r.fecha,
      'Referencia': r.referencia,
      // referenciaOrigen = la ORDEN DE TRABAJO que genero el egreso ("2026 - OT - 4410"). Es un
      // campo distinto de Referencia (el comprobante de stock, "2026 - STK - 10424") y los dos se
      // conservan: Referencia sigue siendo la trazabilidad del comprobante y referenciaOrigen es
      // la unica clave con que Combustible busca la OT (ver construirCombustible).
      'Referencia Origen': r.referenciaOrigen,
      'Unidades': Math.abs(num(r.unidades)),
      'Tercero': r.proveedor || '',
      'Insumo': r.nombre,
      'Descripción Tipo de Comprobante': r.tipoMovimiento,
      // Campania declarada por el propio movimiento. No filtra nada (consultaInsumos se sigue
      // procesando completo): solo queda disponible en el detalle para poder distinguir un
      // movimiento historico de uno de la campania vigente.
      // Clave SIN ene: normHdr() (utils.js) quita los acentos y la tilde de la ene, asi que
      // 'Campaña' llegaria a construirCombustible como 'campana' y no como 'campania'.
      'Campania': r.campania || '',
      // Parcela del movimiento: la columna 'cultivo' de consultaInsumos, que NO es el cultivo a
      // secas sino el nombre completo de la parcela ("LA TERESA 211 ARROZ 26/27") — mismo criterio
      // con que construirAuditoriaInsumosParcela ya la llama `parcela`. Describe DONDE se uso el
      // combustible y la trae el propio movimiento, sin depender de la OT.
      'Parcela': r.cultivo || '',
    });
  });
  return {combustible:combustible, existenciaInicial:existenciaInicial, otros:otros, excluidos:excluidos};
}

// Presupuesto de Infraestructura: ya viene como lista de items en el JSON (ver INFRA_SRC_JSON en
// config.js), con los mismos campos que antes producia el parseo del .xlsx. Aca solo se normaliza
// y se valida: los campos se leen uno por uno (no se confia en la forma del archivo tal cual) y
// los numeros pasan por num(), igual que antes. Los items sin Especificacion se descartan.
function leerPresupuestoInfra(json){
  if(!Array.isArray(json)) throw new Error('El presupuesto de infraestructura no es una lista de items.');
  var items = json.map(function(item){
    item = item || {};
    return {
      especificacion: String(item.especificacion||'').trim(),
      cantidadPresupuestada: num(item.cantidadPresupuestada),
      unidadMedida: String(item.unidadMedida||'').trim(),
      costo: num(item.costo),
      importeTotal: num(item.importeTotal),
    };
  }).filter(function(item){ return item.especificacion; });
  if(!items.length) throw new Error('El presupuesto de infraestructura no contiene ningún item con Especificación.');
  return items;
}

function loadData(){
  var ov=document.getElementById('overlay'); ov.classList.remove('err'); ov.style.display='flex';
  document.getElementById('ov-retry').style.display='none';
  document.getElementById('ov-title').textContent='Cargando datos de campaña…';
  document.getElementById('ov-msg').textContent='Descargando datosCampania2627.xlsx y el presupuesto de infraestructura…';
  document.getElementById('app').style.display='none';

  Promise.all([
    cargarXLSX('datosCampania2627.xlsx', SRC_XLSX, SRC_XLSX_RESPALDO),
    cargarJSON('presupuesto-infraestructura-26-27.json', INFRA_SRC_JSON, INFRA_SRC_JSON_RESPALDO),
    cargarRecetas(RECETAS_SRC_JSON, RECETAS_SRC_JSON_RESPALDO)
  ])
    .then(function(wbs){
      var wb = wbs[0], jsonInfra = wbs[1], recetas = wbs[2];
      var consultaOT = hojaARows(wb, HOJA_OT);
      var consultaCultivos = hojaARows(wb, HOJA_CULTIVOS);
      var consultaInsumos = hojaARows(wb, HOJA_INSUMOS);
      console.log('consultaOT — registros:', consultaOT.length);
      console.log('consultaCultivos — registros:', consultaCultivos.length);
      console.log('consultaInsumos — registros:', consultaInsumos.length);
      var insumos = separarInsumos(consultaInsumos);
      console.log('consultaInsumos separado: combustible='+insumos.combustible.length+
        ', existencia inicial='+insumos.existenciaInicial.length+', otros insumos='+insumos.otros.length+
        ', excluidos='+insumos.excluidos.length+' ('+INSUMOS_EXCLUIDOS.join(', ')+')');
      var presupuestoInfra = leerPresupuestoInfra(jsonInfra);
      console.log('Presupuesto de Infraestructura — items:', presupuestoInfra.length);
      console.log('Recetas de insumos — registros:', recetas ? recetas.length : '(no disponibles)');
      try{ D = buildData(consultaOT, consultaCultivos, insumos, presupuestoInfra, recetas); }
      catch(e){ console.error('Error al construir indicadores:', e); throw new Error('Error procesando los datos: '+e.message); }
      // D.excel_actualizado se fija UNA sola vez acá, por carga exitosa — nunca se recalcula en
      // render.js ni cambia al navegar entre módulos, usar filtros o abrir/cerrar el menú móvil.
      // Con metadata real del archivo (caso normal) refleja cuándo se guardó por última vez el
      // .xlsx; sin ella (caso excepcional, ver advertencia) cae a "el momento en que terminó esta
      // descarga" — D.excel_actualizado_esFallback deja esa diferencia trazable internamente, sin
      // hacer pasar una carga de página por una modificación real del archivo.
      var modXlsx = fechaModificacionXLSX(wb);
      D.excel_actualizado = modXlsx || new Date();
      D.excel_actualizado_esFallback = !modXlsx;
      if(!modXlsx) console.warn('El .xlsx no trae metadata de última modificación (Props.ModifiedDate); se usa el momento de esta descarga como aproximación.');
      var conPlan=D.cultivos.filter(function(c){return c.tiene_rtk;}).length;
      console.log('Cultivos con plan (RTK) cruzados desde consultaCultivos:', conPlan);
      if(conPlan===0) console.warn('Advertencia: consultaCultivos no aportó hectáreas planificadas.');
      renderAll();
      ov.style.display='none'; document.getElementById('app').style.display='block';
      console.log('Dashboard renderizado correctamente.');
    })
    .catch(function(err){
      console.error('Error de carga (detalle técnico):', err);
      showError(err && err.message ? err.message : String(err));
    });
}

document.addEventListener('DOMContentLoaded',loadData);
