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

  // ---------------------------------------------------------------- tema: NO VA
  // Aca vivia un conmutador de tres estados (auto / claro / oscuro) con su preferencia en
  // localStorage. Se quito el 23/10/2026 por decision del usuario: el tablero no lleva modo
  // oscuro. El motivo esta medido: hay 136 colores literales sin tokenizar en 13 de las 16 hojas,
  // todos escritos para fondo claro, y definir el oscuro hoy dejaba unas 62 reglas ilegibles el
  // mismo dia — abrir una fila del Detalle por Servicio la dejaba en blanco sobre blanco.
  //
  // Se fue entero y no desactivado con una bandera a proposito: dejarlo escribiendo un
  // localStorage que nadie respeta es peor que no tenerlo. Si algun dia se retoma, se recupera
  // del historial, pero PRIMERO hay que tokenizar esos literales, una hoja por vez.
  // Con el se fueron tambien el boton #theme-toggle (que nunca existio en index.html), sus
  // estilos en ui.css y la regla de brillo del logo en oscuro.

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
    vigilarScroll();
    prepararRevelado();
    espejarPestanaActiva();
    vigilarBadges();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
