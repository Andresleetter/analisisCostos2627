// ================== EVENTOS ==================
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.tab').forEach(function(btn, i){
    btn.addEventListener('click', function(){ show(i, btn); });
  });
  document.getElementById('ov-retry').addEventListener('click', loadData);
  document.getElementById('gmes').addEventListener('change', renderG);
  document.getElementById('glabor').addEventListener('change', renderLaborDetalle);
  document.getElementById('gestadio').addEventListener('change', renderLaborDetalle);
  document.getElementById('gcontratista').addEventListener('change', renderLaborDetalle);
  document.getElementById('cmes').addEventListener('change', renderCombustible);
  document.getElementById('cterc').addEventListener('change', renderCombustible);
  document.getElementById('imes').addEventListener('change', renderInsumos);
  // Tipo de Insumo es el filtro "padre" del dependiente Insumo: primero se repueblan sus opciones
  // (y se limpia la seleccion si ya no corresponde al nuevo tipo), recien despues se re-renderiza.
  document.getElementById('itipo').addEventListener('change', function(){ actualizarFiltroInsumo(); renderInsumos(); });
  document.getElementById('iinsumo').addEventListener('change', renderInsumos);
  document.getElementById('aestado').addEventListener('change', renderAlertas);
  // "Ver detalle" de las tarjetas de Posibles Problemas (Resumen Ejecutivo): delegado sobre el
  // contenedor #probs (fijo en el HTML) porque las tarjetas se regeneran en cada carga — así un
  // único listener sigue funcionando sin volver a atarse por tarjeta. Reutiliza show(), la misma
  // función de cambio de pestaña que usan los botones .tab; no hay onclick inline en el HTML.
  document.getElementById('probs').addEventListener('click', function(e){
    const btn = e.target.closest('.prob-link');
    if(!btn) return;
    const i = parseInt(btn.dataset.tab, 10);
    if(isNaN(i)) return;
    const tabs = document.querySelectorAll('.tab');
    show(i, tabs[i]);
  });
});
