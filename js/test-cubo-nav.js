// ============ NAVEGACION INTERNA DE LA VISTA DE PRUEBA ============
// Alterna entre los modulos "Cubo Contable" y "Cash Flow" de test-cubo-contable.html mostrando y
// ocultando la seccion correspondiente. No navega, no recarga y no toca el estado de ningun modulo:
// lo que ya se cargo en uno sigue ahi al volver.
// Es lo UNICO que hace este archivo — la logica de cada modulo vive en su propio JS.

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('tc-nav');
  if (!nav) return;
  const botones = [...nav.querySelectorAll('button[data-mod]')];

  function mostrar(mod) {
    botones.forEach(b => {
      const activo = b.dataset.mod === mod;
      b.classList.toggle('is-activo', activo);
      // aria-current: para lectores de pantalla, cual de los dos modulos se esta viendo.
      if (activo) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      const sec = document.getElementById('mod-' + b.dataset.mod);
      if (sec) sec.hidden = !activo;
    });
  }

  nav.addEventListener('click', e => {
    const b = e.target.closest('button[data-mod]');
    if (b) mostrar(b.dataset.mod);
  });
});
