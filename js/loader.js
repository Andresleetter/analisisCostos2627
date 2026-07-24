// ================== LOAD ==================
function showError(msg){ const ov=document.getElementById('overlay'); ov.classList.add('err'); ov.style.display='flex';
  document.getElementById('ov-title').textContent='No se pudieron cargar los datos';
  document.getElementById('ov-msg').textContent=String(msg||'Error de red al descargar el archivo remoto.')+' Verifique la conexión o que la URL esté disponible.';
  document.getElementById('ov-retry').style.display='inline-block'; }

function cargarXLSX(nombre, url){
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
    })
    .catch(function(e){
      console.error('Error al cargar '+nombre+':', e.message||e, '| URL:', url);
      throw new Error('Error al descargar '+nombre+' desde '+url+': '+(e.message||e));
    });
}
function hojaARows(wb, nombreHoja){
  var sheet = wb.Sheets[nombreHoja];
  if(!sheet) throw new Error('El archivo no contiene la hoja «'+nombreHoja+'». Hojas disponibles: '+wb.SheetNames.join(', '));
  var rows = XLSX.utils.sheet_to_json(sheet, {defval:''});
  if(!rows.length) throw new Error('La hoja «'+nombreHoja+'» no contiene filas.');
  return rows;
}
// Separa consultaInsumos (trae TODOS los insumos) en tres grupos:
//  - combustible: filas de tipoInsumo=COMBUSTIBLES que son Ingreso/Consumo real, transformadas
//    a la MISMA forma que tenía el viejo Movimiento_de_combustible.csv (para no tocar buildData).
//    Nota: en esta hoja 'unidades' viene con signo (negativo=egreso); se pasa en valor absoluto,
//    igual que el CSV anterior.
//  - existenciaInicial: filas de tipoInsumo=COMBUSTIBLES con tipoMovimiento="Existencia inicial"
//    (stock de arranque de campaña) — no son Ingreso ni Consumo, se agregan aparte.
//  - otros: el resto de insumos (no combustible) — stub para el futuro módulo "insumos", sin
//    transformar ni calcular nada todavía.
// OJO: consultaInsumos NO se filtra por campaña acá (a diferencia de consultaOT/consultaCultivos)
// — se procesa completa, sin recortar por fecha ni campania, tal como antes de introducir ese filtro.
function separarInsumos(rows){
  var combustible = [], existenciaInicial = [], otros = [];
  rows.forEach(function(r){
    if(String(r.tipoInsumo||'').trim().toUpperCase() !== TIPO_INSUMO_COMBUSTIBLE){ otros.push(r); return; }
    if(String(r.tipoMovimiento||'').trim() === MOV_EXISTENCIA_INICIAL){ existenciaInicial.push(r); return; }
    combustible.push({
      'Fecha': r.fecha,
      'Referencia': r.referencia,
      'Unidades': Math.abs(num(r.unidades)),
      'Tercero': r.proveedor || '',
      'Insumo': r.nombre,
      'Descripción Tipo de Comprobante': r.tipoMovimiento,
    });
  });
  return {combustible:combustible, existenciaInicial:existenciaInicial, otros:otros};
}

function loadData(){
  var ov=document.getElementById('overlay'); ov.classList.remove('err'); ov.style.display='flex';
  document.getElementById('ov-retry').style.display='none';
  document.getElementById('ov-title').textContent='Cargando datos de campaña…';
  document.getElementById('ov-msg').textContent='Descargando datosCampania2627.xlsx desde GitHub…';
  document.getElementById('app').style.display='none';

  cargarXLSX('datosCampania2627.xlsx', SRC_XLSX)
    .then(function(wb){
      var consultaOT = hojaARows(wb, HOJA_OT);
      var consultaCultivos = hojaARows(wb, HOJA_CULTIVOS);
      var consultaInsumos = hojaARows(wb, HOJA_INSUMOS);
      console.log('consultaOT — registros:', consultaOT.length);
      console.log('consultaCultivos — registros:', consultaCultivos.length);
      console.log('consultaInsumos — registros:', consultaInsumos.length);
      var insumos = separarInsumos(consultaInsumos);
      console.log('consultaInsumos separado: combustible='+insumos.combustible.length+
        ', existencia inicial='+insumos.existenciaInicial.length+', otros insumos='+insumos.otros.length);
      try{ D = buildData(consultaOT, consultaCultivos, insumos); }
      catch(e){ console.error('Error al construir indicadores:', e); throw new Error('Error procesando los datos: '+e.message); }
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
