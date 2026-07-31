// ================== EVENTOS ==================
document.addEventListener('DOMContentLoaded', function(){
  // Menú hamburguesa (solo visible en móvil, ver tabs.css): reutiliza los mismos botones .tab de
  // #tabs-nav, nunca duplica la navegación — la barra pasa de fila horizontal a panel desplegable.
  const menuToggle = document.getElementById('menu-toggle');
  const tabsNav = document.getElementById('tabs-nav');
  const menuBackdrop = document.getElementById('menu-backdrop');
  function abrirMenuModulos(){
    tabsNav.classList.add('open');
    menuBackdrop.hidden = false;
    menuToggle.classList.add('open');
    menuToggle.setAttribute('aria-expanded','true');
    menuToggle.setAttribute('aria-label','Cerrar menú de módulos');
  }
  function cerrarMenuModulos(){
    tabsNav.classList.remove('open');
    menuBackdrop.hidden = true;
    menuToggle.classList.remove('open');
    menuToggle.setAttribute('aria-expanded','false');
    menuToggle.setAttribute('aria-label','Abrir menú de módulos');
  }
  menuToggle.addEventListener('click', function(){
    if(tabsNav.classList.contains('open')) cerrarMenuModulos(); else abrirMenuModulos();
  });
  menuBackdrop.addEventListener('click', cerrarMenuModulos);

  // Mapa de Siembra (Resumen Ejecutivo): ahora es una tarjeta más dentro de #cults (ver
  // renderCultivoDetalle, render.js), que reescribe su innerHTML completo en cada carga — por eso
  // el listener va delegado sobre #cults (elemento estable) y no atado directo a #mapa-siembra-img
  // (se destruye y recrea junto con las tarjetas de cultivo). Clic/Enter/Espacio sobre la imagen
  // la abre ampliada en #mapa-lightbox; clic sobre el lightbox o Escape la cierra.
  const cultsCont = document.getElementById('cults');
  const mapaLightbox = document.getElementById('mapa-lightbox');
  function abrirMapaLightbox(){ mapaLightbox.classList.add('open'); }
  function cerrarMapaLightbox(){ mapaLightbox.classList.remove('open'); }
  cultsCont.addEventListener('click', function(e){
    if(e.target.closest('#mapa-siembra-img')) abrirMapaLightbox();
  });
  cultsCont.addEventListener('keydown', function(e){
    if((e.key==='Enter' || e.key===' ') && e.target.closest('#mapa-siembra-img')){ e.preventDefault(); abrirMapaLightbox(); }
  });
  mapaLightbox.addEventListener('click', cerrarMapaLightbox);

  document.addEventListener('keydown', function(e){
    if(e.key!=='Escape') return;
    if(tabsNav.classList.contains('open')) cerrarMenuModulos();
    if(mapaLightbox.classList.contains('open')) cerrarMapaLightbox();
  });
  window.addEventListener('resize', function(){
    if(window.innerWidth>900) cerrarMenuModulos();
  });

  document.querySelectorAll('.tab').forEach(function(btn, i){
    btn.addEventListener('click', function(){ show(i, btn); cerrarMenuModulos(); });
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
    cerrarMenuModulos();
  });
  // Gastos Operativos (Resumen Ejecutivo): "Ver detalle" expande/colapsa el detalle de esa misma
  // categoría (.opex-detail, dentro de su .opex-row — ver renderGastosOperativos, render.js).
  // Delegado sobre #opex-rows (fijo en el HTML) porque las filas se regeneran en cada carga — un
  // único listener sigue funcionando sin volver a atarse por fila.
  document.getElementById('opex-rows').addEventListener('click', function(e){
    const btn = e.target.closest('.opex-toggle');
    if(!btn) return;
    const detail = btn.closest('.opex-row').querySelector('.opex-detail');
    const abierto = !detail.classList.contains('hidden');
    detail.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!abierto));
    btn.textContent = abierto ? 'Ver detalle' : 'Ocultar detalle';
  });
});
