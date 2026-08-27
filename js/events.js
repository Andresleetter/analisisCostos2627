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
  // Campaña es el filtro "padre" de Servicios: al cambiar, primero se repueblan Mes/Labor/Etapa/
  // Contratista con los valores de la campaña nueva y recién después se re-renderiza el módulo
  // completo (ver cambiarCampaniaServicios en render.js). Solo afecta a la pestaña Servicios.
  document.getElementById('gcampania').addEventListener('change', cambiarCampaniaServicios);
  document.getElementById('gmes').addEventListener('change', renderG);
  // Cultivo tiene el mismo alcance que Mes (KPIs, acumulado, Detalle por Servicio y Gasoil por
  // Área), así que dispara el mismo render completo. No repuebla los demás filtros: elegir un
  // cultivo no reinicia Servicio/Estadio/Contratista.
  document.getElementById('gcultivo').addEventListener('change', renderG);
  document.getElementById('glabor').addEventListener('change', renderLaborDetalle);
  document.getElementById('gestadio').addEventListener('change', renderLaborDetalle);
  document.getElementById('gcontratista').addEventListener('change', renderLaborDetalle);
  // Clic en una fila de "Detalle por Servicio": despliega/pliega las OT que componen esa fila.
  // Delegado sobre el tbody (fijo en el HTML) porque la tabla se redibuja entera en cada cambio de
  // filtro — mismo patrón que el detalle de parcelas de la Auditoría y el Consumo de Combustible.
  // Una sola fila abierta a la vez: abrir otra cierra la anterior.
  document.getElementById('gld').addEventListener('click', function(e){
    const fila = e.target.closest('tr.sv-fila');
    if(!fila) return;
    const clave = decodeURIComponent(fila.dataset.fila);
    servFilaAbierta = (servFilaAbierta===clave) ? null : clave;
    renderLaborDetalle();
  });
  document.getElementById('cmes').addEventListener('change', renderCombustible);
  document.getElementById('cterc').addEventListener('change', renderCombustible);
  // Máquina: mismo alcance que Mes y Tercero — filtra por movimiento y vuelve a dibujar la tabla
  // de Consumo. La máquina llega resuelta desde el modelo; acá no se interpreta ningún texto.
  document.getElementById('cmaq').addEventListener('change', renderCombustible);
  // Clic en una fila de "Consumo" (Combustible): despliega/pliega los movimientos de ese
  // Uso / Detalle. Delegado sobre el tbody (fijo en el HTML) porque la tabla se redibuja entera en
  // cada cambio de filtro — mismo patrón que el detalle de parcelas de la Auditoría.
  document.getElementById('combbody').addEventListener('click', function(e){
    const fila = e.target.closest('tr.cu-fila');
    if(!fila) return;
    const uso = decodeURIComponent(fila.dataset.uso);
    combUsoAbierto = (combUsoAbierto===uso) ? null : uso;
    renderCombustible();
  });
  document.getElementById('imes').addEventListener('change', renderInsumos);
  // Tipo de Insumo es el filtro "padre" del dependiente Insumo: primero se repueblan sus opciones
  // (y se limpia la seleccion si ya no corresponde al nuevo tipo), recien despues se re-renderiza.
  document.getElementById('itipo').addEventListener('change', function(){ actualizarFiltroInsumo(); renderInsumos(); });
  document.getElementById('iinsumo').addEventListener('change', renderInsumos);
  document.getElementById('aestado').addEventListener('change', renderAlertas);
  // ---- Auditoría: sub-navegación entre Infraestructura e Insumos por Parcela ----
  // Delegada sobre la barra (elemento fijo del HTML). Usa .subtab, no .tab: el listener de módulos
  // de más arriba indexa las .tab contra las .page, y un botón .tab de más rompería ese índice.
  document.getElementById('audit-subnav').addEventListener('click', function(e){
    const btn = e.target.closest('.subtab');
    if(btn) mostrarAuditoria(btn.dataset.audit, btn);
  });
  // Los 8 filtros de Insumos por Parcela comparten el mismo manejador: cada cambio recalcula las
  // opciones disponibles de los otros filtros y vuelve a renderizar (ver cambiarFiltroInsumosParcela
  // en render.js). No hay filtros con lógica propia acá.
  IP_FILTROS.forEach(function(f){
    document.getElementById(f.sel).addEventListener('change', cambiarFiltroInsumosParcela);
  });
  // Clic en una fila de "Resumen por Parcela": despliega/pliega el detalle de esa parcela.
  // Delegado sobre el tbody (fijo en el HTML) porque la tabla se redibuja entera en cada filtro.
  document.getElementById('ip-parcelas').addEventListener('click', function(e){
    const fila = e.target.closest('tr.ip-parcela');
    if(!fila) return;
    const parcela = decodeURIComponent(fila.dataset.parcela);
    ipParcelaAbierta = (ipParcelaAbierta===parcela) ? null : parcela;
    renderInsumosParcela();
  });
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
