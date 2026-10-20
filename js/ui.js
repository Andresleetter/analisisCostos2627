// ================== CAPA DE INTERFAZ ==================
// Todo lo que es presentación pura y no toca ni un dato: tema claro/oscuro, encabezado que se
// compacta al hacer scroll, revelado de bloques al entrar en pantalla y el espejo de aria-current
// sobre la pestaña activa.
//
// Vive en su propio archivo a propósito: si algo de acá falla, el dashboard tiene que seguir
// funcionando igual. Por eso nada de esto es necesario para leer un número — el tema ya quedó
// aplicado por el script inline del <head>, y sin revelado los bloques simplemente están visibles
// desde el principio (la clase .reveal la pone este archivo, no el HTML).
//
// Script clásico con defer, como el resto del proyecto: sin módulos, sin import/export.
(function(){
  'use strict';

  var raiz = document.documentElement;

  // ---------------------------------------------------------------- tema
  // Tres estados, no dos. "auto" no es un lujo: es el estado correcto por defecto, porque quien
  // tiene el sistema en oscuro no debería recibir una pantalla blanca a las 6 de la mañana. El
  // ciclo del botón es auto -> claro -> oscuro -> auto.
  var CLAVE = 'delsur-tema';
  var MODOS = ['auto', 'light', 'dark'];
  var ETIQUETA = {auto:'Automático', light:'Claro', dark:'Oscuro'};
  var mqOscuro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function leerModo(){
    try{
      var v = localStorage.getItem(CLAVE);
      return MODOS.indexOf(v) > -1 ? v : 'auto';
    }catch(e){ return 'auto'; }   // modo privado / cookies bloqueadas
  }

  // El atributo data-theme SIEMPRE queda resuelto a light u dark (nunca "auto"): así el CSS no
  // necesita duplicar cada regla dentro de un @media prefers-color-scheme.
  function resolver(modo){
    if(modo === 'auto') return (mqOscuro && mqOscuro.matches) ? 'dark' : 'light';
    return modo;
  }

  function aplicar(modo){
    raiz.setAttribute('data-theme', resolver(modo));
    raiz.setAttribute('data-theme-modo', modo);
    // La barra del navegador móvil acompaña al fondo del tablero.
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if(meta) meta.setAttribute('content', resolver(modo) === 'dark' ? '#141010' : '#FBF8F5');
    pintarBoton(modo);
  }

  // Dos iconos, dibujados con SVG inline para no pedir una fuente de iconos por dos glifos.
  var ICO = {
    light:'<svg class="tt-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4"/></svg>',
    dark:'<svg class="tt-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>'
  };

  function pintarBoton(modo){
    var b = document.getElementById('theme-toggle');
    if(!b) return;
    var efectivo = resolver(modo);
    b.innerHTML = ICO[efectivo] + '<span class="tt-txt">' + ETIQUETA[modo] + '</span>';
    // El rótulo dice qué hay AHORA y a qué se pasa: un botón que cicla entre tres estados es
    // ilegible para un lector de pantalla si solo anuncia el estado actual.
    var siguiente = MODOS[(MODOS.indexOf(modo) + 1) % MODOS.length];
    b.setAttribute('aria-label', 'Tema: ' + ETIQUETA[modo] + '. Cambiar a ' + ETIQUETA[siguiente] + '.');
    b.setAttribute('title', 'Tema: ' + ETIQUETA[modo]);
  }

  function ciclar(){
    var modo = MODOS[(MODOS.indexOf(leerModo()) + 1) % MODOS.length];
    try{ localStorage.setItem(CLAVE, modo); }catch(e){}
    aplicar(modo);
  }

  // Cambio de tema del sistema estando en "auto": el tablero acompaña sin recargar.
  if(mqOscuro){
    var alCambiarSistema = function(){ if(leerModo() === 'auto') aplicar('auto'); };
    if(mqOscuro.addEventListener) mqOscuro.addEventListener('change', alCambiarSistema);
    else if(mqOscuro.addListener) mqOscuro.addListener(alCambiarSistema);
  }

  // ---------------------------------------------------------------- encabezado al hacer scroll
  // Throttle con requestAnimationFrame: el evento scroll dispara decenas de veces por segundo y
  // tocar clases en cada uno fuerza recalculos de estilo que se notan en una tabla larga.
  function vigilarScroll(){
    var top = document.querySelector('.top');
    if(!top) return;
    var pendiente = false, estaba = false;
    function evaluar(){
      pendiente = false;
      var ahora = window.scrollY > 24;
      if(ahora !== estaba){ estaba = ahora; top.classList.toggle('scrolled', ahora); }
    }
    window.addEventListener('scroll', function(){
      if(!pendiente){ pendiente = true; requestAnimationFrame(evaluar); }
    }, {passive:true});
    evaluar();
  }

  // ---------------------------------------------------------------- revelado al entrar en pantalla
  // Solo bloques de primer nivel (paneles, filas de KPI, tarjetas de problema): revelar fila por
  // fila una tabla de 300 registros sería ruido, no diseño.
  // Los elementos se observan aunque estén dentro de una pestaña oculta: el IntersectionObserver
  // los reporta recién cuando esa pestaña se muestra, que es justo el momento correcto.
  function prepararRevelado(){
    if(!('IntersectionObserver' in window)) return;
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var objetivos = document.querySelectorAll('.panel, .kpis, .gkpis, .probs, .subtabs, .gfilter');
    if(!objetivos.length) return;

    var obs = new IntersectionObserver(function(entradas){
      for(var i = 0; i < entradas.length; i++){
        if(entradas[i].isIntersecting){
          entradas[i].target.classList.add('in');
          obs.unobserve(entradas[i].target);   // se revela una sola vez, no en cada scroll
        }
      }
    }, {rootMargin:'0px 0px -8% 0px', threshold:0.02});

    for(var i = 0; i < objetivos.length; i++){
      objetivos[i].classList.add('reveal');
      obs.observe(objetivos[i]);
    }
  }

  // ---------------------------------------------------------------- aria-current en la pestaña
  // events.js es el único dueño de la clase .active (ahí vive la lógica de módulos); acá solo se
  // refleja ese estado en aria-current para los lectores de pantalla. Con MutationObserver y no
  // con un click listener propio, para no depender del orden en que se registran los handlers.
  function espejarPestanaActiva(){
    var nav = document.getElementById('tabs-nav');
    if(!nav) return;
    function sincronizar(){
      var tabs = nav.querySelectorAll('.tab');
      for(var i = 0; i < tabs.length; i++){
        if(tabs[i].classList.contains('active')) tabs[i].setAttribute('aria-current', 'page');
        else tabs[i].removeAttribute('aria-current');
      }
    }
    sincronizar();
    if(!('MutationObserver' in window)) return;
    new MutationObserver(sincronizar).observe(nav, {
      subtree:true, attributes:true, attributeFilter:['class']
    });
  }

  // ---------------------------------------------------------------- arranque
  // ---------------------------------------------------------------- badges
  // Dos cosas, las dos de presentación pura (render.js sigue siendo el único que escribe los
  // números):
  //   1. Un badge en cero no es información: se oculta. Antes todas las pestañas mostraban un "0"
  //      permanente que competía con los avisos reales.
  //   2. Control de Hectáreas y Alertas son sub-secciones de O. Trabajo, así que sus badges viven
  //      en las sub-pestañas. El del módulo (#b-ot) refleja la suma, para no perder el aviso de un
  //      vistazo cuando el módulo está cerrado.
  function vigilarBadges(){
    var bExc = document.getElementById('b-exc');
    var bAl  = document.getElementById('b-al');
    var bOt  = document.getElementById('b-ot');
    var todos = document.querySelectorAll('.badge');
    if(!todos.length) return;

    function num(el){
      var n = parseInt(String((el && el.textContent) || '0').replace(/\D/g, ''), 10);
      return isNaN(n) ? 0 : n;
    }
    function sincronizar(){
      if(bOt && bExc && bAl){
        var suma = String(num(bExc) + num(bAl));
        // Solo si cambió: escribir el mismo texto igual dispara el observer y entraría en bucle.
        if(bOt.textContent !== suma) bOt.textContent = suma;
      }
      for(var i = 0; i < todos.length; i++) todos[i].hidden = num(todos[i]) === 0;
    }
    sincronizar();
    if(!('MutationObserver' in window)) return;
    var obs = new MutationObserver(sincronizar);
    for(var j = 0; j < todos.length; j++){
      obs.observe(todos[j], {childList:true, characterData:true, subtree:true});
    }
  }

  function iniciar(){
    aplicar(leerModo());
    var b = document.getElementById('theme-toggle');
    if(b) b.addEventListener('click', ciclar);
    vigilarScroll();
    prepararRevelado();
    espejarPestanaActiva();
    vigilarBadges();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
