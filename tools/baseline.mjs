// Regenera data/exceso-baseline.json: la foto de Control de Hectareas de la exportacion ANTERIOR.
//
// Hay que correrlo ANTES de commitear un datosCampania2627.xlsx nuevo. Ese JSON es contra lo que el
// tablero decide que lotes en exceso y que labores repetidas son NUEVOS (ver construirControlHectareas
// en js/data/cultivos.js). Si no se regenera, el aviso de "nuevo" sigue mostrando las novedades de la
// subida pasada, que es peor que no mostrar nada.
//
//   node tools/baseline.mjs              informa que cambiaria, sin tocar nada
//   node tools/baseline.mjs --escribir   ademas escribe data/exceso-baseline.json
//
// Corre desde cualquier directorio: la raiz del repo se deduce de la ubicacion de este archivo, asi
// que sirve igual en los dos clones. El .xlsx de HEAD se extrae a una carpeta temporal del sistema,
// nunca dentro del repo.
//
// No necesita npm install: usa el XLSX que ya esta en vendor/ y carga los scripts del tablero con
// node:vm, en el mismo orden que los declara index.html. Es decir, calcula con el buildData() real,
// no con una reimplementacion que podria desincronizarse.
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(REPO, 'data', 'exceso-baseline.json');
const escribir = process.argv.includes('--escribir');
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'buffer', maxBuffer: 1 << 28 });

// El .xlsx de HEAD es, por definicion, el de la exportacion anterior: lo que ya esta publicado.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-'));
const previo = path.join(tmp, 'head.xlsx');
fs.writeFileSync(previo, git('show', 'HEAD:data/datosCampania2627.xlsx'));
const commitBase = git('rev-parse', '--short', 'HEAD').toString('utf8').trim();

// ---- Arnes: el minimo navegador de mentira que necesitan los scripts del tablero ----
const noop = () => {};
const stubEl = { addEventListener: noop, classList: { add: noop, remove: noop }, style: {}, textContent: '', hidden: true };
const ctx = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, RegExp, Error,
  isNaN, parseFloat, parseInt, Intl, Promise, encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout,
  document: { addEventListener: noop, getElementById: () => stubEl, querySelectorAll: () => [], createElement: () => stubEl, body: stubEl },
  window: { addEventListener: noop }, location: { reload: noop, hash: '' }, navigator: { userAgent: 'node' },
  fetch: () => Promise.reject(new Error('sin red: este script no descarga nada')),
};
ctx.globalThis = ctx; ctx.self = ctx; ctx.window.document = ctx.document;
vm.createContext(ctx);
const cargar = rel => vm.runInContext(fs.readFileSync(path.join(REPO, rel), 'utf8'), ctx, { filename: rel });
cargar('vendor/xlsx.full.min.js'); cargar('js/config.js'); cargar('js/utils.js');
for (const f of ['ordenes', 'cultivos', 'servicios', 'combustible', 'insumos', 'auditoria', 'recetas', 'alertas', 'resumen']) {
  cargar(`js/data/${f}.js`);
}
cargar('js/data.js'); cargar('js/loader.js');
const run = c => vm.runInContext(c, ctx);
const leerJSON = rel => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));

function analizar(rutaXlsx) {
  ctx.__wb = ctx.XLSX.read(new Uint8Array(fs.readFileSync(rutaXlsx)), { type: 'array', cellDates: true });
  ctx.__ot = run('hojaARows(__wb, HOJA_OT)');
  ctx.__cul = run('hojaARows(__wb, HOJA_CULTIVOS)');
  ctx.__ins = run('separarInsumos(hojaARows(__wb, HOJA_INSUMOS))');
  ctx.__infra = run('leerPresupuestoInfra(' + JSON.stringify(leerJSON('data/presupuesto-infraestructura-26-27.json')) + ')');
  ctx.__recetas = leerJSON('data/recetas-insumos-26-27.json');
  ctx.__recLab = leerJSON('data/receta-labores-25-26.json');
  // excesoBaseline = null a proposito: aca se esta FABRICANDO la foto, no comparando contra una.
  const D = run('buildData(__ot, __cul, __ins, __infra, __recetas, __recLab, null)');
  return { D, modificado: run('fechaModificacionXLSX(__wb)') };
}

// Las mismas claves que compara el tablero: un lote en exceso es cultivo+lote, y una labor repetida
// es cultivo+lote+servicio, porque el mismo lote puede tener dos labores repetidas distintas.
const claveLotes = D => [...new Set(D.exceso.map(e => e.cult + '|' + e.lote))].sort();
const claveRepetidas = D => [...new Set(D.repetidas.map(r => r.cult + '|' + r.lote + '|' + r.serv))].sort();

const dos = n => String(n).padStart(2, '0');
const fmt = d => d ? `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}` : null;

const anterior = analizar(previo);
const lotes = claveLotes(anterior.D);
const repetidas = claveRepetidas(anterior.D);
const exportacionBase = fmt(anterior.modificado);

const rutaActual = path.join(REPO, 'data', 'datosCampania2627.xlsx');
// Seguro: si no hay un .xlsx sin commitear, no hay nada que subir y por lo tanto nada que
// rebasear. Escribir igual adelantaria la foto a la exportacion que YA esta publicada, y con eso
// los avisos de "nuevo" que hoy se ven en Control de Hectareas quedarian en cero — justo lo que
// este archivo existe para evitar.
const hayXlsxNuevo = !fs.readFileSync(previo).equals(fs.readFileSync(rutaActual));
const nuevo = analizar(rutaActual);
const lotesN = claveLotes(nuevo.D);
const repetidasN = claveRepetidas(nuevo.D);
const nuevosLotes = lotesN.filter(k => !lotes.includes(k));
const nuevasRepetidas = repetidasN.filter(k => !repetidas.includes(k));

const viejo = JSON.parse(fs.readFileSync(SALIDA, 'utf8'));
console.log('\nbaseline commiteado hoy');
console.log(`   ${viejo.exportacion_base}   commit ${viejo.commit_base}   ${viejo.lotes.length} lotes, ${viejo.repetidas.length} repetidas`);
console.log('\nbaseline que corresponde (foto del .xlsx de HEAD)');
console.log(`   ${exportacionBase}   commit ${commitBase}   ${lotes.length} lotes, ${repetidas.length} repetidas`);
console.log(`\n.xlsx en el working tree   exportacion ${fmt(nuevo.modificado)}` +
            (hayXlsxNuevo ? '   (sin commitear)' : '   (es el mismo de HEAD: no hay datos nuevos)'));
console.log(`   ${lotesN.length} lotes en exceso, ${repetidasN.length} labores repetidas`);
console.log('\nse van a marcar como NUEVOS en pantalla:');
console.log(`   ${nuevosLotes.length} lote(s) en exceso${nuevosLotes.length ? ':' : ''}`);
nuevosLotes.forEach(k => console.log('        ' + k));
console.log(`   ${nuevasRepetidas.length} labor(es) repetida(s)${nuevasRepetidas.length ? ':' : ''}`);
nuevasRepetidas.forEach(k => console.log('        ' + k));

fs.rmSync(tmp, { recursive: true, force: true });

if (!escribir) {
  console.log('\n(solo informe: no se escribio nada. Agregar --escribir)');
  process.exit(0);
}
if (!hayXlsxNuevo) {
  console.error('\nNO se escribio nada: data/datosCampania2627.xlsx es identico al de HEAD, asi que\n' +
                'no hay datos nuevos para subir. Rebasear ahora adelantaria la foto a la exportacion\n' +
                'que ya esta publicada y dejaria en cero los avisos de "nuevo" de Control de Hectareas.\n' +
                'Copia primero el .xlsx nuevo a data/ y volve a correrlo.');
  process.exit(1);
}
// Sin la fecha de la exportacion anterior el rotulo de pantalla queda vacio, asi que se corta antes
// de escribir un baseline a medias.
if (!exportacionBase) throw new Error('el .xlsx de HEAD no trae Props.ModifiedDate');

fs.writeFileSync(SALIDA, JSON.stringify({
  _comentario: viejo._comentario,
  exportacion_base: exportacionBase,
  commit_base: commitBase,
  lotes,
  repetidas,
}, null, 1) + '\n');
console.log('\nok  data/exceso-baseline.json');
