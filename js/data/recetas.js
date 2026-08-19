// ================== DATOS · RECETAS DE INSUMOS ==================
// Compara la dosis REALMENTE aplicada por hectarea (la que ya calcula y muestra la Auditoria de
// Insumos por Parcela) contra la dosis recomendada de la campania.
//
// FUENTE UNICA: data/recetas-insumos-26-27.json, una version reducida del presupuesto de insumos
// (179 registros, campos campania/cultivo/grupo/insumo/descripcion/dosisHa/unidad). Los Excel de
// presupuesto NO se leen: este modulo no usa SheetJS ni ningun parser, solo el JSON.
//
// La receta es SOLO una referencia para auditar. Nada de lo que hay aca modifica la dosis real, ni
// las cantidades, ni las hectareas, ni los costos: se limita a agregarle a cada insumo ya calculado
// cuatro datos nuevos (dosis de receta, desvio absoluto, desvio porcentual y estado).
//
// Criterio de fondo: una comparacion incorrecta es PEOR que mostrar "Sin receta". Por eso todas las
// coincidencias son exactas sobre nombre normalizado; no hay coincidencia aproximada de ningun tipo,
// y cualquier ambiguedad real del dato termina en "Sin receta" en vez de elegir una receta al azar.

// Estados posibles de la comparacion. El unico juicio de valor es la tolerancia definida por el
// negocio (RECETA_TOLERANCIA_PCT en config.js, hoy 5%), y solo HACIA ARRIBA: pasarse hasta ese
// margen se considera aceptable, pero quedarse corto es una desviacion aunque sea por poco.
// Fuera de eso el dashboard no declara "correcto" ni "incorrecto": dice de que lado de la receta
// quedo la aplicacion y cuanto, y deja la lectura agronomica a quien audita.
const RECETA_ESTADO = {
  SOBRE:      'Sobre receta',
  BAJO:       'Bajo receta',
  TOLERANCIA: 'Dentro de tolerancia',
  SEGUN:      'Según receta',
  SIN:        'Sin receta',
  UNIDAD:     'Unidad no comparable',
};
// Orden de presentacion de los contadores del resumen (render.js).
const RECETA_ESTADOS_ORDEN = [RECETA_ESTADO.SOBRE, RECETA_ESTADO.BAJO, RECETA_ESTADO.TOLERANCIA,
  RECETA_ESTADO.SEGUN, RECETA_ESTADO.SIN, RECETA_ESTADO.UNIDAD];

// ---- Unidades ----
// Solo se unifican equivalencias EVIDENTES de la misma magnitud fisica. Cualquier unidad que no
// figure aca (BLS, Unidades, Dosis…) se conserva normalizada y solo puede compararse consigo misma:
// no se inventa ninguna equivalencia.
const RECETA_UNIDADES_EQUIV = {
  kg:  ['kg','kgs','kilo','kilos','kilogramo','kilogramos'],
  L:   ['l','lt','lts','litro','litros'],
  ton: ['ton','tn','tonelada','toneladas'],
};
function normUnidadDosis(u){
  const n = normHdr(u);
  if(!n) return null;   // receta sin unidad cargada (existe en el dato: "Biostar + Zn" de NUTRICIÓN)
  for(const canon in RECETA_UNIDADES_EQUIV){
    if(RECETA_UNIDADES_EQUIV[canon].indexOf(n)>-1) return canon;
  }
  return n;
}
// Factor para expresar una cantidad de `desde` en `hacia`. null = NO convertible.
// La unica conversion permitida es masa<->masa (1 ton = 1000 kg), porque el presupuesto carga los
// fertilizantes en toneladas por hectarea y las OT los descargan en kilos. Nunca se convierte entre
// masa y volumen (kg<->L) ni desde/hacia unidades de envase (BLS): son magnitudes distintas y
// asumir una densidad seria inventar el dato.
function factorConversionDosis(desde, hacia){
  if(desde==null || hacia==null) return null;
  if(desde===hacia) return 1;
  if(desde==='ton' && hacia==='kg') return 1000;
  if(desde==='kg' && hacia==='ton') return 1/1000;
  return null;
}

// ---- Indice ----
// Clave: campania | cultivo | insumo, todo normalizado con las utilidades que ya usa el proyecto
// (normHdr para campania/cultivo, normInsumoNombre para el nombre del insumo — el mismo
// normalizador con que se comparan los INSUMOS_EXCLUIDOS). Se arma UNA sola vez al cargar el
// dashboard; despues cada celda resuelve su receta con un Map.get(), sin recorrer los 179 registros.
// Cada clave guarda un ARRAY: el JSON real trae el mismo insumo en mas de un grupo dentro del mismo
// cultivo (ej. ARROZ "Pyrazosulfuron" en dos grupos con 0,21 y 0,08 L/ha). Esa ambiguedad se
// resuelve al buscar, no al indexar — ver resolverCandidatasReceta.
function construirIndiceRecetas(recetasRaw){
  const porInsumo = new Map(), porDescripcion = new Map();
  const filas = [];
  const agregar = (mapa, clave, fila) => {
    if(!clave) return;
    if(!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(fila);
  };
  (recetasRaw||[]).forEach(r=>{
    const dosis = numN(r.dosisHa);
    const insumo = String(r.insumo==null?'':r.insumo).trim();
    if(!insumo || dosis==null) return;   // registro incompleto: no participa de ninguna comparacion
    const fila = {
      campania:    String(r.campania==null?'':r.campania).trim(),
      cultivo:     String(r.cultivo==null?'':r.cultivo).trim(),
      grupo:       String(r.grupo==null?'':r.grupo).trim(),
      insumo:      insumo,
      descripcion: String(r.descripcion==null?'':r.descripcion).trim(),
      dosisHa:     dosis,
      unidad:      String(r.unidad==null?'':r.unidad).trim(),
      unidadNorm:  normUnidadDosis(r.unidad),
    };
    filas.push(fila);
    const base = normHdr(fila.campania)+'|'+normHdr(fila.cultivo)+'|';
    agregar(porInsumo, base+normInsumoNombre(fila.insumo), fila);
    if(fila.descripcion) agregar(porDescripcion, base+normInsumoNombre(fila.descripcion), fila);
  });
  return {
    disponible: filas.length>0,
    porInsumo, porDescripcion, total: filas.length,
    campanias: [...new Set(filas.map(f=>f.campania).filter(c=>c))],
  };
}
// Indice vacio: es lo que se usa cuando el JSON no pudo descargarse. Todo el modulo sigue
// funcionando y cada fila queda como "Sin receta" con motivo 'sin_indice' — el dashboard nunca se
// bloquea por esto.
function indiceRecetasVacio(){
  return {disponible:false, porInsumo:new Map(), porDescripcion:new Map(), total:0, campanias:[]};
}

// Varias filas de receta para el mismo cultivo+insumo: solo sirve si TODAS dicen lo mismo.
// Dos grupos distintos con identica dosis y unidad (ej. ARROZ "GLIFEX GOLD 60,8" en DESECACIÓN y en
// HERBICIDAS PUNTO DE AGUJA, 3 L/ha las dos) no son ambiguos: den donde den, el valor a comparar es
// el mismo. Si las dosis difieren, no hay forma de saber cual corresponde y se devuelve null, que
// el llamador traduce a "Sin receta" — nunca se elige una.
// `grupo` permite desempatar cuando el alias lo declara explicitamente (ver RECETAS_INSUMO_ALIAS).
function resolverCandidatasReceta(lista, grupo){
  if(!lista || !lista.length) return null;
  let cand = lista;
  if(grupo){
    const g = normHdr(grupo);
    const filtradas = cand.filter(f=>normHdr(f.grupo)===g);
    if(!filtradas.length) return null;
    cand = filtradas;
  }
  const distintas = new Map();
  cand.forEach(f=>distintas.set(f.dosisHa+'|'+f.unidadNorm, f));
  return distintas.size===1 ? cand[0] : null;
}

// Busca la receta de un insumo. Orden deliberado y conservador:
//   1. nombre exacto normalizado contra receta.insumo;
//   2. nombre exacto normalizado contra receta.descripcion, solo si resuelve a un unico valor;
//   3. alias DECLARADO A MANO en RECETAS_INSUMO_ALIAS (config.js).
// El alias va ultimo a proposito: asi nunca pisa una coincidencia real. Importa con el dato actual —
// "Potasio KCL 00-00-60" existe tal cual en las recetas de MAIZ y SORGO, y con puntos
// ("Potasio KCL 00.00.60") en las de ARROZ; con este orden, MAIZ y SORGO usan su receta propia y el
// alias solo entra a cubrir ARROZ.
// Traduce (campania, cultivo) a la combinacion cuyas recetas hay que usar, cuando el negocio
// declaro una equivalencia explicita en RECETAS_EQUIVALENCIAS (config.js). Sin equivalencia devuelve
// lo mismo que recibio: nunca se cruza una campania o un cultivo con otro por su cuenta.
function resolverEquivalenciaReceta(campania, cultivo){
  const eq = RECETAS_EQUIVALENCIAS.find(e=>normHdr(e.campania)===normHdr(campania)
    && normHdr(e.cultivo)===normHdr(cultivo));
  return eq ? {campania:eq.usarCampania, cultivo:eq.usarCultivo} : {campania, cultivo};
}
function buscarReceta(indice, campania, cultivo, insumoOriginal){
  if(!indice || !indice.disponible) return {fila:null, motivo:'sin_indice', via:null};
  const eq = resolverEquivalenciaReceta(campania, cultivo);
  campania = eq.campania; cultivo = eq.cultivo;
  const insumo = insumoOriginal;
  const base = normHdr(campania)+'|'+normHdr(cultivo)+'|';
  const clave = base+normInsumoNombre(insumo);
  const porNombre = indice.porInsumo.get(clave);
  if(porNombre){
    const f = resolverCandidatasReceta(porNombre, null);
    if(f) return {fila:f, motivo:null, via:'insumo'};
    return {fila:null, motivo:'ambigua', via:null};
  }
  const porDesc = indice.porDescripcion.get(clave);
  if(porDesc){
    const f = resolverCandidatasReceta(porDesc, null);
    if(f) return {fila:f, motivo:null, via:'descripcion'};
    return {fila:null, motivo:'ambigua', via:null};
  }
  const aliasPosibles = RECETAS_INSUMO_ALIAS.filter(a=>normInsumoNombre(a.insumo)===normInsumoNombre(insumo)
    && (!a.cultivo || normHdr(a.cultivo)===normHdr(cultivo)));
  // Un alias declarado para ESTE cultivo gana sobre el generico del mismo producto: permite afinar
  // un solo cultivo (por ejemplo fijandole el grupo) sin tocar el resto y, sobre todo, sin que el
  // resultado dependa del orden en que esten escritos en config.js.
  const alias = aliasPosibles.find(a=>a.cultivo) || aliasPosibles[0];
  if(alias){
    const porAlias = indice.porInsumo.get(base+normInsumoNombre(alias.receta));
    if(porAlias){
      const f = resolverCandidatasReceta(porAlias, alias.grupo);
      if(f) return {fila:f, motivo:null, via:'alias'};
      return {fila:null, motivo:'ambigua', via:null};
    }
  }
  return {fila:null, motivo:'sin_coincidencia', via:null};
}

// Compara UNA dosis real contra su receta.
// `dosisRealHa` llega YA CALCULADA por el modulo de Auditoria (cantidad aplicada / hectareas del
// lote): esta funcion no la recalcula ni la corrige — hay una sola fuente de verdad para la dosis
// real, y es la que se muestra en la tabla.
// Devuelve siempre el mismo contrato, para que render.js solo tenga que presentar campos.
function evaluarDosisContraReceta(indice, datos){
  const campania = datos && datos.campania, cultivo = datos && datos.cultivo;
  const insumo = datos && datos.insumo, unidadReal = datos && datos.unidad;
  const dosisRealHa = (datos && datos.dosisRealHa!=null) ? datos.dosisRealHa : null;
  const salida = {
    recetaEncontrada:false, recetaInsumo:null, recetaGrupo:null,
    dosisRecetaHa:null, unidadReceta:null,
    // dosisRecetaHa expresada en la MISMA unidad que la dosis real (unica conversion posible:
    // ton -> kg). Es el valor contra el que se calcula el desvio.
    dosisRecetaComparable:null,
    desvioAbsoluto:null, desvioPct:null,
    estadoReceta: RECETA_ESTADO.SIN, motivo:null,
  };
  const hallazgo = buscarReceta(indice, campania, cultivo, insumo);
  salida.motivo = hallazgo.motivo;
  if(!hallazgo.fila) return salida;

  salida.recetaEncontrada = true;
  salida.recetaInsumo = hallazgo.fila.insumo;
  salida.recetaGrupo  = hallazgo.fila.grupo;
  salida.dosisRecetaHa = hallazgo.fila.dosisHa;
  salida.unidadReceta = hallazgo.fila.unidad || null;
  salida.viaReceta = hallazgo.via;

  const factor = factorConversionDosis(hallazgo.fila.unidadNorm, normUnidadDosis(unidadReal));
  if(factor==null){
    // Hay receta y el producto coincide, pero las unidades no son de la misma magnitud (o la receta
    // no trae unidad cargada). No se convierte ni se compara: se dice explicitamente.
    salida.estadoReceta = RECETA_ESTADO.UNIDAD;
    salida.motivo = 'unidad_incompatible';
    return salida;
  }
  salida.dosisRecetaComparable = hallazgo.fila.dosisHa*factor;

  if(dosisRealHa==null){
    // El lote no registra hectareas reales, asi que no hay dosis real que comparar. La receta se
    // conserva (es informacion valida) pero no se inventa ni un desvio ni un estado.
    salida.estadoReceta = null;
    salida.motivo = 'sin_dosis_real';
    return salida;
  }

  salida.desvioAbsoluto = dosisRealHa - salida.dosisRecetaComparable;
  if(salida.dosisRecetaComparable>0){
    salida.desvioPct = (salida.desvioAbsoluto/salida.dosisRecetaComparable)*100;
  }
  // "Según receta" se decide con una comparacion numerica relativa, NUNCA con el valor redondeado
  // que se muestra en pantalla: 0,1500000001 y 0,15 son el mismo dato, pero 0,1504 no lo es aunque
  // ambos se impriman "0,15". Se evalua ANTES que la tolerancia para que la coincidencia exacta no
  // quede absorbida por ella: "dio justo" y "dio distinto pero aceptable" son cosas distintas.
  const escala = Math.max(Math.abs(salida.dosisRecetaComparable), Math.abs(dosisRealHa));
  if(Math.abs(salida.desvioAbsoluto) <= escala*RECETA_EPSILON_RELATIVO){
    salida.estadoReceta = RECETA_ESTADO.SEGUN;
    return salida;
  }
  // Dentro de la tolerancia de negocio (RECETA_TOLERANCIA_PCT, config.js). Es ASIMETRICA a pedido
  // del usuario: solo absorbe los desvios HACIA ARRIBA. Aplicar de menos es una desviacion real
  // aunque sea chica —el producto no llego a la parcela—, mientras que pasarse hasta un 5% es
  // variacion operativa normal. Por eso un +3% queda "Dentro de tolerancia" y un -3% queda
  // "Bajo receta".
  // Se mide sobre el desvio PORCENTUAL, asi que requiere que exista: con una receta de dosis 0 no
  // hay porcentaje posible y la fila cae en Sobre/Bajo, que sigue siendo la lectura correcta.
  // El limite se compara con el mismo margen de punto flotante que "Según receta": un +5% exacto
  // da 5.000000000000004 al dividir (ej. 2,10 sobre 2,00) y sin esto caeria en "Sobre receta".
  const limiteTolerancia = Math.abs(salida.dosisRecetaComparable)*(RECETA_TOLERANCIA_PCT/100);
  if(salida.desvioAbsoluto>0 && salida.desvioAbsoluto <= limiteTolerancia*(1+RECETA_EPSILON_RELATIVO)){
    salida.estadoReceta = RECETA_ESTADO.TOLERANCIA;
    return salida;
  }
  salida.estadoReceta = salida.desvioAbsoluto>0 ? RECETA_ESTADO.SOBRE : RECETA_ESTADO.BAJO;
  return salida;
}
