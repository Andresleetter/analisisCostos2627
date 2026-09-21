# Dashboard Campaña 26/27 · Del Sur

Dashboard de seguimiento de campaña agrícola (Campo La Teresa). Es una web estática (HTML/CSS/JS vanilla, sin build step) que al cargar descarga tres archivos de datos publicados en este mismo repo, todos bajo **`data/`**:

- **`data/datosCampania2627.xlsx`** — 3 hojas: `consultaOT`, `consultaCultivos`, `consultaInsumos`.
- **`data/presupuesto-infraestructura-26-27.json`** — 10 ítems con el presupuesto de infraestructura usado en la pestaña Auditoría (`especificacion`, `cantidadPresupuestada`, `unidadMedida`, `costo`, `importeTotal`).
- **`data/recetas-insumos-26-27.json`** — 202 registros con la dosis por hectárea recomendada por cultivo e insumo. Es una versión **reducida** del presupuesto de insumos: solo dosis, sin costos ni volúmenes. Alimenta el seguimiento de receta de Auditoría de Insumos por Parcela.

- **`data/receta-labores-25-26.json`** — cuántas labores distintas lleva cada cultivo en cada estadio, derivado del export de la campaña 25/26. Es el **divisor** del avance de campo: sin él, la primera labor confirmada sobre un lote lo dejaba en 100 % del estadio (ver **El divisor del avance**).

El `.xlsx` se parsea en el navegador con SheetJS; los JSON **no** pasan por SheetJS (`resp.json()`). A partir de ellos se renderizan KPIs, tablas y alertas.

> **El presupuesto de infraestructura pasó de Excel a JSON.** Antes se descargaba y parseaba un segundo `.xlsx` (`PRESUPUESTO ALISON INFRAESTRUTURA 26-27.xlsx`, hoja `INFRAESTRUTURA 26-27`) solo para leer 10 filas. El JSON se generó a partir de él con la misma lógica de parseo (mismo rango de filas, mismas columnas, mismos números pasados por `num()`), y se verificó que los indicadores de Auditoría salen **idénticos** con una fuente y con la otra. **Ese `.xlsx` ya no está en el repo** (se quitó a pedido del usuario una vez migrado el dato): el JSON es ahora la única fuente del presupuesto de infraestructura, y para actualizarlo se lo edita directamente. Si alguna vez hay un Excel nuevo, la sección Auditoría documenta qué filas y columnas hay que leer para regenerarlo.

> **La carpeta `data/`.** Los archivos de datos vivían en la raíz del repo y se movieron a `data/`. La ruta se arma una sola vez en `config.js` (`SRC_DATA`), de donde salen `SRC_XLSX`, `INFRA_SRC_JSON` y `RECETAS_SRC_JSON` con sus respectivos respaldos de GitHub.

## Cómo arrancar un servidor local

El navegador bloquea `fetch()` sobre `file://`, así que hay que servir la carpeta por HTTP. Cualquiera de estas opciones funciona (parado en la carpeta del proyecto):

```bash
python -m http.server 8080
```

```bash
npx serve .
```

Luego abrir `http://localhost:8080` (o el puerto que indique el comando).

La app descarga ambos `.xlsx` en tiempo real (con `cache:'no-store'`, para no servir una copia vieja del navegador), así que hace falta servirla desde un servidor; sin acceso al archivo se muestra la pantalla de error con reintento.

**De dónde salen los archivos de datos:** del **propio sitio**, por ruta relativa (`data/datosCampania2627.xlsx`). Cloudflare despliega el repo completo como assets estáticos (`wrangler.jsonc`: `assets.directory: "."`), así que el Excel que está en el repo se sirve desde el dominio del dashboard, por el CDN de Cloudflare. Si esa descarga falla, `loader.js` reintenta **una vez** contra `raw.githubusercontent.com` como respaldo (ver `SRC_XLSX` / `SRC_XLSX_RESPALDO` en `config.js`) — eso cubre el caso de abrir `index.html` directo desde el disco, donde `fetch` de una ruta relativa no funciona.

> Antes se leía siempre desde `raw.githubusercontent.com`. Se cambió el 17/08/2026: `raw` no es un CDN para tráfico de usuarios y limita conexiones — devolvió `503 Backend.max_conn reached` y `429 Too Many Requests` de forma sostenida desde el nodo de Buenos Aires, dejando el dashboard sin cargar (afectaba por igual al presupuesto de infraestructura, que no se había tocado).

**⚠️ Editar el Excel no alcanza:** el dashboard lee el `.xlsx` **publicado**, no el archivo local. Después de editar `datosCampania2627.xlsx` (o el presupuesto de infraestructura) en Excel hay que **commitear y pushear** ese archivo a `main` — si no, el sitio en vivo sigue mostrando los datos del último commit, aunque el Excel local ya esté actualizado. No hay ningún paso de build/bundle intermedio (sitio 100% estático): Cloudflare redespliega solo al llegar el push.

Si el archivo está abierto en Excel al momento de necesitar inspeccionarlo (ej. para depurar), Excel lo bloquea para lectura exclusiva — hay que copiarlo primero con `FileShare.ReadWrite` (o cerrarlo) antes de poder leerlo desde otro proceso.

## Pestañas del dashboard

1. **Resumen Ejecutivo** — KPIs ejecutivos, Detalle de Etapas por Cultivo, estado de las OT, actividad operacional por mes, distribución del gasto en áreas no agrícolas y Posibles Problemas en la Campaña. Desde "Detalle de Etapas por Cultivo" se entra a **Avance Detallado por Cultivo**, una vista de detalle que cuelga de esta pestaña y no ocupa un botón propio en la barra. Ver sección propia más abajo.
2. **Servicios** *(antes "Resumen de Gastos" — se renombró el botón, sin tocar cálculos ni ids internos)* — gasto por servicio/estadio, consumo de gasoil por área, trabajos hechos para terceros y evolución del gasto.
   > **Los rótulos visibles de este módulo usan los nombres de la OT.** El panel se llama "Detalle por Servicio" (antes "Detalle por Labor") y sus columnas son **Servicio** y **Estadio** (antes "Labor" y "Etapa"), igual que los campos `servicio` y `estadio` de `consultaOT`. Es un cambio de rótulo: no se tocaron los ids (`glabor`, `gestadio`, `gld`, `gld-sub`), ni las claves internas (`r.labor`, `r.estadio`), ni un solo cálculo. La única cadena de datos que cambió es el marcador de las OT sin estadio cargado, `'(Sin etapa)'` → `'(Sin estadio)'` (`servicios.js`), que se muestra tal cual en el filtro y en la columna. "Detalle de Etapas por Cultivo" (Resumen Ejecutivo) **no** se renombró: es otro módulo y agrupa por las cuatro etapas de `ETAPA_ORDEN`, no por el estadio crudo de la OT.
3. **Combustible** — Ingreso por proveedor y **Consumo por Uso / Detalle**, con cada movimiento atribuido por niveles (OT vinculada / Solo contratista / OT no disponible / Labor Propia) y filtros de Mes, Tercero y **Máquina**. KPI de Stock Inicial (dinámico) y Balance, con arrastre mes a mes.
4. **Insumos** — Ingreso/Consumo de insumos no-combustible en **cantidad real** (nunca en dinero), con flujo de Stock dinámico y filtros dependientes Tipo de Insumo → Insumo. Ver sección propia más abajo.
5. **Control de Hectáreas** — lotes con exceso de superficie vs. RTK (con tolerancia por servicio y sin alertar el sobrepase que la OT declara), labores de preparación repetidas que sumando superan el lote, lotes inhabilitados y OT sin correspondencia en el plan.
6. **Alertas Operacionales** — OT atrasadas, con filtro por Estado (Pendiente / En Ejecución / Todas) y color por fila según días de atraso.
7. **Auditoría** — tres sub-módulos dentro de la misma pestaña, con navegación propia: **Infraestructura** (presupuesto vs. ejecución real), **Insumos por Parcela** (qué insumo se aplicó en cada lote, cuánto por hectárea y con qué OT) y **Siembra por Parcela** (cruce de las OT de siembra confirmadas contra el campo `hectareasSembradas` de la parcela, para detectar errores de carga). Última pestaña de la barra. Ver secciones propias más abajo.

## Qué texto va en la pantalla

El dashboard muestra **cifras y rótulos, no explicaciones**. Un panel dice `17 lotes`, `1 de 11 OT`,
`Divisor: 5 (no aplicado)` — no cómo hay que leer esos números, por qué están ordenados así, ni qué
quedó fuera del cálculo.

El porqué de cada regla vive en dos lugares que no compiten con la pantalla: los comentarios del
código, junto a la línea que la implementa, y este README. Los datos de respaldo de cada hallazgo
siguen enteros en el modelo (por ejemplo `e.dets` conserva todas las OT de un lote con sus banderas
`over` / `tolerado` / `declarado`, aunque el panel liste solo las que sobrepasan).

Lo que sí se muestra, porque es dato y no comentario: los números, sus unidades, los rótulos de
columna, las observaciones reales de las OT y los estados vacíos (`Sin casos`, `Sin OT en el
período`).

## Contenido de cada carpeta

- **`index.html`** — Markup semántico de la página (header, tabs, secciones por pestaña). No contiene estilos ni scripts inline; solo referencias a `css/` y `js/`. El orden de los botones `<button class="tab">` y de las `<section class="page">` debe coincidir 1 a 1 (`show(i, btn)` en `render.js` las empareja por posición, no por id) — mover una pestaña de lugar implica mover el botón **y** su sección juntos.
- **`css/`** — Un archivo por bloque visual, cargados en `index.html` en este orden: `base.css` (reset, variables `:root`, tipografía global, `.wrap`), `overlay.css`, `header.css`, `tabs.css`, `panel.css`, `kpis.css`, `cultivos.css`, `problemas.css`, `tables.css`, `gastos.css` (Servicios + Combustible + Insumos comparten estos estilos: `.gfilter`, `.kpis`/`.gkpis`, tablas con `.sopbar`), `alertas.css` (incluye el color de fila por días de atraso), `auditoria.css` (sub-navegación de la pestaña Auditoría y los sub-módulos Insumos por Parcela y Siembra por Parcela), `footer.css`.
- **`js/`** — Un módulo por responsabilidad, cargados en `index.html` en este orden (scripts clásicos con `defer`, sin módulos ES ni bundler):
  - `config.js` — constantes de la app: URLs de los tres archivos de `data/` (`SRC_DATA` + `SRC_XLSX` / `INFRA_SRC_XLSX` / `RECETAS_SRC_JSON`), nombres de hoja, catálogos de cultivos/etapas/operativas, `CAMPANIA_ACTUAL`, el mapeo manual `INFRA_MAP` (presupuesto ↔ Servicio de OT, ver sección Auditoría), y la variable de estado global `D`.
  - `utils.js` — funciones puras de formateo, parsing de números/fechas (incluye objetos `Date` nativos de SheetJS), normalización de texto, y `stockInicioDePeriodo()` — arrastre de stock mes a mes **genérico**, reutilizado tanto por Combustible como por Insumos (antes estaba escrito en línea solo para Combustible).
  - `data.js` — **orquestador** del modelo de datos. Conserva la única función pública `buildData(raw, proyecciones, insumos, presupuestoInfra, recetas)`, que ya no calcula nada: prepara las entradas, llama a las funciones de `js/data/` pasándoles explícitamente lo que necesitan, y ensambla el objeto final que consume `render.js`.
  - `js/data/` — el modelo de datos separado por dominio. Cada archivo expone funciones puras (reciben lo que necesitan por parámetro, devuelven colecciones explícitas) y **ninguno toca el DOM**:
    - `ordenes.js` — base compartida de `consultaOT`: normalización de filas, filtro por campaña (más la copia con todas las campañas que usa Servicios), agrupación por OT, modalidad de trabajo (hectáreas/horas/peso), importes, estados y KPIs de OT. Va primero porque todo lo demás depende de sus colecciones.
    - `cultivos.js` — plan RTK desde `consultaCultivos`, avance de campo por cultivo y etapa (incluida la receta de labores que le pone piso al divisor, `construirRecetaLabores()`), y Control de Hectáreas (excesos con tolerancia por servicio, labores de preparación repetidas que sumando superan el lote, lotes inhabilitados, OT sin correspondencia en el plan).
    - `servicios.js` — módulo Servicios completo (`construirServicios()`: detalle por servicio, gasoil, filtros y totales) y el paquete equivalente por cada campaña presente en `consultaOT`.
    - `combustible.js` — consumo e ingresos de gasoil y stock inicial.
    - `insumos.js` — ingresos, consumos y flujo de stock por (Tipo, Insumo, Unidad).
    - `auditoria.js` — los tres sub-módulos de la pestaña Auditoría: Infraestructura (presupuesto vs ejecución), Insumos por Parcela y Siembra por Parcela.
    - `recetas.js` — comparación de la dosis realmente aplicada por hectárea contra la receta de la campaña (`data/recetas-insumos-26-27.json`): normalización y conversión de unidades, índice de recetas, búsqueda conservadora y cálculo de desvío/estado. No lee ningún Excel.
    - `alertas.js` — OT Pendientes/En Ejecución y cuáles están atrasadas.
    - `resumen.js` — Gastos Operativos y todo `D.resumen` (KPIs, estados de OT, actividad mensual, posibles problemas). Se calcula último: reutiliza colecciones ya construidas por los demás dominios, nunca vuelve a recorrer las OT desde cero.

    **Orden de carga** (ver `index.html`): los nueve `js/data/*.js` van **antes** de `js/data.js`. Entre sí no tienen orden obligatorio (solo definen funciones, no ejecutan nada al cargarse), pero `data.js` sí tiene que ir último porque `buildData()` las invoca. `loader.js` sigue llamando a `buildData()` exactamente igual que antes.
  - `render.js` — todas las funciones que pintan el DOM (`renderAll`, `renderG`, `renderCombustible`, `renderInsumos`, `renderAlertas`, `renderAuditoria`, etc.) y el cambio de pestaña (`show`).
  - `events.js` — conecta los elementos interactivos del HTML (pestañas, selects de filtro, botón de reintento) con las funciones de `render.js`/`loader.js`. El filtro dependiente Tipo de Insumo → Insumo se resuelve acá: el `change` de `#itipo` llama primero a `actualizarFiltroInsumo()` (repuebla `#iinsumo` y limpia la selección si ya no aplica) y **después** a `renderInsumos()`.
  - `loader.js` — descarga el `.xlsx` de campaña (`cargarXLSX()`), el JSON de presupuesto de infraestructura (`cargarJSON()`) y el JSON de recetas (`cargarRecetas()`), los parsea, separa `consultaInsumos` en combustible/existencia inicial/otros insumos, normaliza y valida el presupuesto de infraestructura (`leerPresupuestoInfra()`), y dispara la carga inicial al terminar de cargar el DOM. A eso se suma `cargarRecetaLabores()` (el divisor del avance). Las cuatro descargas van en un mismo `Promise.all`. `cargarJSON()` es genérico y usa el mismo esquema de respaldo que `cargarXLSX()` (el sitio primero, GitHub como plan B una sola vez), y su error **sí** se propaga: sin presupuesto no hay Auditoría. Las de los dos JSON de receta, en cambio, **no pueden tumbar la carga**: si fallan, se registran en consola y devuelven `null` — el dashboard sigue igual, con el seguimiento de receta marcado como no disponible y el avance calculado con el divisor de las labores confirmadas.
- **`data/`** — los archivos de datos que el dashboard descarga en runtime: `datosCampania2627.xlsx`, `presupuesto-infraestructura-26-27.json`, `recetas-insumos-26-27.json` y `receta-labores-25-26.json` (el divisor del avance, ver **El divisor del avance**). No hay build: se sirven tal cual desde el repo, así que actualizar los datos es commitear estos archivos.
- **`vendor/xlsx.full.min.js`** — copia sin modificar de [SheetJS](https://sheetjs.com) (`xlsx@0.18.5`), usada para leer el `.xlsx` en el navegador.

## Filtro de campaña (`CAMPANIA_ACTUAL`)

`config.js` define `const CAMPANIA_ACTUAL = '26/27'`.

**Se aplica a:**
1. **`consultaOT`** (`data.js`) — filtra por el campo `campania` exacto. Afecta a casi todo lo que depende de las OT: KPIs de OT, Detalle de Etapas por Cultivo, Control de Hectáreas, Alertas, Posibles Problemas, Servicios y Auditoría (todo se construye a partir de `OTS`/`rows`). Todas estas colecciones se arman sobre las OT ya agrupadas por `agruparOTS()`, que además descarta las líneas que no están en el estado de su OT — ver "Agrupación por OT" más abajo.
2. **`consultaCultivos`** (plan RTK, `data.js`) — esta hoja no trae una columna de texto `campania` propia, pero el campo `nombre` (ej. `"LA TERESA 201 ARROZ 26/27"`) siempre termina en el sufijo de campaña; se extrae con una regex y se descarta toda fila cuyo sufijo no coincida con `CAMPANIA_ACTUAL`. Filas sin sufijo reconocible (formato histórico) pasan sin filtrar, ya que no hay forma de determinar su campaña.

**NO se aplica a `consultaInsumos`** (ni Combustible ni el módulo Insumos): esta hoja se procesa **completa**, sin recortar por campaña ni por fecha — es una decisión explícita (antes se filtraba y se sacó a pedido), documentada en `loader.js` y `data.js`. Si el año que viene aparecen movimientos de más de una campaña mezclados ahí, van a entrar todos.

La tarjeta de avance de Maíz integra la siembra de las actividades `MAIZ` y `MAIZ ZAFRIÑA` de la campaña `26` (Zafriña26). El usuario confirmó que comparte el plan de Maíz 26/27 y que la separación de zafra es operativa. La siembra se suma contra ese único plan, con tope en la superficie total planificada, sin agregar otra meta. Los lotes se mantienen separados por campaña para agrupar las labores. Los indicadores y problemas de la campaña mantienen su base original.

`consultaOT` puede traer varias campañas mezcladas en la práctica (la fuente a veces incluye la campaña anterior completa) — sin este filtro, todos los KPIs quedarían inflados. `data.js` loguea en consola cuántas filas se descartaron por campaña en cada carga (tanto de `consultaOT` como de `consultaCultivos`).

### El costo consolidado de todas las campañas

`costo_total_consolidado` (`construirServiciosPorCampania`, `js/data/servicios.js`) suma el importe de las OT confirmadas de **todas** las campañas de `consultaOT`. Durante un tiempo fue lo que mostraba la tarjeta **Costo Ejecutado** del Resumen Ejecutivo; **ya no**. Desde que ese módulo tiene su propio selector de Campaña, la tarjeta muestra el costo de la campaña **seleccionada**, la misma que produce `OT Confirmadas` y `OT Atrasadas` a su lado (ver "Filtro de Campaña" más abajo). `costo_total_consolidado` y `costo_por_campania` se siguen calculando y exponiendo en `D` para quien los necesite, pero hoy **no se muestran en ninguna parte**: `render.js` no los lee.

Con el dato de la campaña 26/27 en curso:

| Campaña | Costo ejecutado | |
|---|--:|--:|
| **26/27** (vigente) | 1.195.032,45 | 96,2 % |
| 25/26 | 24.568,61 | 2,0 % |
| 26 | 22.279,29 | 1,8 % |
| 25 | 383,24 | 0,0 % |
| **Consolidado** | **1.242.263,58** | |

La tarjeta muestra la primera fila, no el total.

### Por qué el avance de cultivos NO puede incluir otras campañas

Es una pregunta que ya surgió, así que queda documentada para no volver a investigarla.

**`consultaCultivos` trae únicamente la campaña vigente.** Verificado contra el `.xlsx`: las 277 filas terminan en el sufijo `26/27`, ninguna en otro. El avance es *hectáreas ejecutadas ÷ hectáreas planificadas*, y el plan RTK es el denominador — sin plan de las campañas anteriores no hay porcentaje que calcular para ellas.

Y sumar sus OT al avance de la campaña vigente **no movería el número**. De las 111 OT de otras campañas, solo 19 llegan a un cultivo de `CULTIVOS` y a una etapa de `ETAPA_ORDEN` (las 59 de ARROZ *Secadero* quedan fuera porque Secadero no es una etapa del ciclo; el resto son MAIZ ZAFRIÑA, AVENA, OPERATIVO o PARCELA). Esas 19 caen sobre lotes que **no existen en el plan 26/27**:

- **MAIZ**, 14 OT de la campaña 26, todas sobre el lote `.23C`. El maíz 26/27 son los lotes 69, 70, 71A, 72A y 73A.
- **SORGO**, 5 OT de la 25/26, sobre 111, 113B y 113C. El sorgo 26/27 son 48, 49, 50, 51, 87, 98, 28D…

`equivalenteLoteEstadio` capa cada labor con `Math.min(ejecutadasReales, planificadas)` y `planificadas = RTK[cultivo][lote] || 0`, que para esos lotes vale **0**: aportarían 0,00 ha. Lo único que cambiaría son los contadores `OT Confirmadas / Totales` de cada etapa, que salen de `sub` y no se capan — es decir, mostraría más OT con el mismo avance, que es peor que no mostrarlas.

**Para que esto sea posible** hace falta que `consultaCultivos` traiga las parcelas de las otras campañas. Con ese dato, el camino correcto es un selector de campaña en el Detalle de Etapas por Cultivo (igual al que ya tiene Servicios), donde cada campaña se mide contra su propio plan — nunca una suma de todas contra el plan de la vigente.

## Agrupación por OT (`agruparOTS`)

Una orden de trabajo son **varias filas** de `consultaOT`: el servicio, una o más líneas de labor y las de insumos. `agruparOTS()` (`js/data/ordenes.js`) las junta por número de OT y de ahí salen el importe (`imp`), la superficie trabajada (`ha_trab`), las horas, los kilos y el reparto Labor Propia / Labor Tercero / Insumos.

### Una OT puede tener sus líneas en estados distintos

Albor confirma **por línea**, no por orden. El estado de la OT sigue siendo el de su primera línea (`r0.estado`), pero sus magnitudes ejecutadas se calculan **únicamente con las líneas que están en ese mismo estado**:

```js
const todas = otMap[id], r0 = todas[0];
const g = todas.filter(x => x.estado === r0.estado);
```

Antes se sumaban todas, y una OT confirmada a medias arrastraba al costo ejecutado y al avance trabajo que todavía no se había hecho.

**El caso que lo destapó (17/09/2026).** La OT 4958 hace dos labores en dos lotes:

| Línea | Servicio | Lote | Estado | ha | US$ |
|---|---|---|--:|--:|--:|
| 117242 | 2° Plaina | .43 | Confirmado | 22,76 | 751,08 |
| 117243 | 1° Plaina | .41 | **Pendiente** | 40,56 | **1.338,48** |

La línea pendiente trae `dosisReales = 0`, `Has. Reales` vacío y `facturada = NO`: no se hizo. Pero como la primera línea es la confirmada, la OT entera contaba como ejecutada. Tres síntomas, todos del mismo origen:

- **Costo ejecutado** US$ 1.196.370,93 en vez de **1.195.032,45** — la diferencia es exactamente esos 1.338,48. Lo detectó el usuario sumando las OT confirmadas en el Excel.
- **Preparación de Suelo de ARROZ** 3.509,49 ha (90,2 %) en vez de **3.502,73 ha (90,1 %)**: una 1° Plaina no hecha entraba al promedio del lote .41 como labor cumplida.
- **Servicios** atribuía las 40,56 ha y los 1.338,48 al grupo **2° Plaina**, porque el servicio de la OT también sale de la primera línea.

**Alcance.** Es la **única** OT mixta del dato: 1 de 1.987 contando las cuatro campañas, y ninguna línea viene sin estado. Para las otras 1.986 el filtro no descarta nada y `g` es idéntica al grupo completo. Verificado con el arnés comparando el modelo entero antes y después: de las **70 claves de `buildData()` solo se mueven 9**, todas por esta OT (`costo_total`, `costo_total_consolidado`, `gasto_total`, `costo_por_campania`, `cultivos`, `gastos`, `resumen`, `resumen_campanias`, `servicios_campanias`); en `gastos` cambia **1 de 213** entradas. Los conteos de OT (1.562 confirmadas, 160 en ejecución, 126 pendientes, 185 atrasadas), las alertas, el combustible, los insumos y las dos auditorías quedan idénticos.

**`lines` también queda filtrado.** Es lo que consumen Servicios (`servicios.js`), la Auditoría de Siembra (`haSembradaDeOT`) y el avance de cultivos, así que tiene que estar limpio por el mismo motivo. `lines_todas` conserva el grupo completo para rastreo; hoy no lo consume nadie.

> **Lo que esto no hace.** La parte pendiente de una OT mixta no se cuenta en ningún lado: la OT aporta su parte confirmada y nada más, y sigue figurando como una sola OT confirmada en los contadores. Es deliberado — el arreglo de fondo es en Albor, dejando la OT en un solo estado.

### La observación de la OT

`consultaOT.observaciones` es un **campo de la orden, no de la línea**: verificado sobre las 1.891
OT de la 26/27, ninguna trae dos textos distintos entre sus líneas. Por eso `agruparOTS` la expone
como `obs`, tomando la primera línea que la traiga.

1.351 OT la tienen cargada. Es el único lugar del dato donde constan cosas que ningún número dice, y
por eso dos módulos la leen: **Trabajos para Terceros** (Servicios) y **Control de Hectáreas**.

Hay que leerla con cuidado, porque la mayor parte es ruido: **561 OT tienen solo el sello `OT OK`**
—una marca de revisión, no información— y muchas otras traen únicamente la dosis aplicada
(`Garant: 0,035 L/ha`) o el nombre de la máquina, que es lo que ya usa `combustible.js` para
atribuir el gasoil. Por eso ningún módulo lee el texto entero: todos buscan un patrón declarado en
`config.js`.

El sello sirve además como indicador propio: **801 de las 1.697 OT confirmadas están revisadas**.

## Resumen Ejecutivo

### Filtro de Campaña (exclusivo de este módulo)

Arriba de los KPIs hay un selector de **Campaña** que controla **todo** el Resumen Ejecutivo y la vista **Avance Detallado** que cuelga de él: KPIs, costos, Detalle de Etapas por Cultivo, Estado de las OT, Actividad Mensual, Gastos Operativos y Posibles Problemas. Abre siempre en `26/27` y no recuerda la última elección entre cargas.

**No es un filtro global.** Servicios (que tiene su propio selector de campaña), Combustible, Insumos, Control de Hectáreas, Alertas Operativas y Auditoría **no reaccionan** a este selector: siguen leyendo `D.exceso` / `D.alertas` / `D.gastos` / etc., recortados a `CAMPANIA_ACTUAL`. Verificado con el arnés: de las 69 claves de `buildData()` la única que cambió al introducir el filtro es `resumen` (por el KPI de costo, ver abajo), y se agregó `resumen_campanias`.

Los dos selectores —el del Resumen y el del Avance Detallado— comparten un único estado, `campaniaResumenActiva` (`render.js`): cambiar cualquiera mueve el otro y vuelve a dibujar las dos vistas.

**Cómo está armado.** `construirResumenPorCampania()` (`js/data/resumen.js`) arma un paquete completo por cada campaña de `consultaOT`, con el mismo patrón que `construirServiciosPorCampania`: la campaña vigente **no se recalcula** —se le pasa lo que `buildData()` ya armó— y las demás se derivan con las **mismas** funciones (`normalizarFilasOT` → `agruparOTS` → `construirCultivos`/`construirOperativas`/`construirControlHectareas`/`construirAlertas`/`construirResumen`). Cambiar el selector es elegir un paquete ya calculado: no se relee el Excel ni se recalcula nada en `render.js`.

El paquete incluye su **propio** Control de Hectáreas y sus **propias** alertas porque las reglas de Posibles Problemas los necesitan; los que consumen esos módulos (`D.exceso`, `D.alertas`) quedan intactos. Ojo con la distinción: *Posibles Problemas* del Resumen sí cambia con la campaña, *Alertas Operativas* (módulo propio) no.

**El KPI "Costo Ejecutado" cambió de definición.** Antes era `costo_total_consolidado` (la suma de **todas** las campañas de `consultaOT`); ahora es el costo de las OT confirmadas **de la campaña seleccionada**, la misma que produce OT Confirmadas y OT Atrasadas. Con el selector en 25/26 el número anterior habría seguido siendo el de todas juntas. En 26/27 eso baja el KPI de **US$ 1.243.408,33 a US$ 1.196.253,29**; `costo_total_consolidado` y `costo_por_campania` se siguen calculando y exponiendo en `D` para quien los necesite.

**`consultaCultivos` es el padrón físico común.** Sus 277 filas son todas 26/27 (verificado contra el dato), así que el mismo objeto `RTK`/`RTK_TOT` se reutiliza para todas las campañas — no se copia ni se duplica superficie: las hectáreas planificadas por cultivo son idénticas en las cuatro campañas y el total sigue siendo 4.671,25 ha.

**Consecuencia real para campañas anteriores:** los lotes que trabajó 25/26 **no existen** en el padrón 26/27 (SORGO usó 113B, 113C y 111; ARROZ solo "SECADERO ARROZ"), así que su avance da 0 % aunque tenga OT y costo. No es un error de cálculo: es el tope contra el plan del lote aplicado sobre un lote sin plan. El propio dashboard lo explica — con 25/26 seleccionado aparece el problema *"OT sin correspondencia en el plan RTK: 64 OT"*. Para mostrar un avance histórico real haría falta el padrón RTK de esa campaña, que el Excel hoy no trae.

**La siembra de Zafriña26 ya no se pliega a Maíz 26/27.** Esa integración se agregó cuando el Resumen Ejecutivo solo podía mostrar 26/27 y era la única forma de ver esa siembra. Con el selector de campaña dejó de corresponder: hacía que el maíz figurara sembrado al 26,3 % en una campaña en la que **todavía no se sembró** — las dos únicas OT de siembra de maíz (1836 y 1837) son de campaña `26`, no hay ninguna de 26/27. Ahora cada campaña se calcula con sus propias OT y ninguna hereda ni presta OT a otra.

Efecto: MAIZ 26/27 pasa a mostrar Preparación de Suelo 100 % y Cuidados 100 %, sin etapa Siembra ("Sin actividad registrada en OT confirmadas"). El avance a nivel cultivo no cambia (sale del estadio más avanzado, Cuidados). ARROZ, SORGO y SOJA quedan idénticos.

Esa siembra sigue visible en la campaña Zafriña26 con sus OT, fechas y costos, pero con **0 ha de avance**: sus lotes (.23C, .23D) no están en el plan RTK de MAIZ (69, 70, 71A, 72A, 73A, SECADERO, PARCELA), así que el tope contra el plan del lote los deja en cero. El mecanismo de plegado sigue en `construirCultivos` (parámetro `rawTodasCampanias`, hoy sin ningún llamador que lo use) por si la regla vuelve a pedirse.


Vista gerencial: `D.resumen` (`js/data/resumen.js`, calculado una sola vez dentro de `buildData()`) alimenta todos los componentes; `render.js` solo pinta, no recalcula.

**El tratamiento de semillas no cuenta como avance de siembra.** El avance por etapa sale del campo `Estadio` de la OT, pero dentro de `Estadio = "Siembra"` se cargan trabajos que no son sembrar: hoy, tratamiento de semillas (se hace **antes** de sembrar y **sobre la semilla**, no sobre el lote). Verificado contra el dato real: en la campaña 26/27 ese estadio contiene *únicamente* "Tratamiento de semillas" (7 OT) y "Tratamiento de semilla arroz tractor x Hs" (1 OT), así que todo el avance de siembra que se mostraba venía de ahí — ARROZ figuraba con Siembra al 4,9% (188,48 ha) sin haber sembrado nada.

Esos servicios se excluyen con `SIEMBRA_SERVICIOS_NO_SIEMBRA` (`config.js`), una lista de **prefijos** comparados con `normHdr`, que **solo aplica dentro del Estadio Siembra**. Es una lista de exclusión y no una lista blanca de servicios de siembra a propósito: si mañana se carga la siembra con otro nombre tiene que contar sola, no quedar en 0% en silencio. La siembra real se carga con el servicio llamado exactamente `Siembra`. Las OT excluidas no se pierden: sus costos, su conteo y su presencia en Servicios/Insumos siguen igual, solo dejan de acreditar superficie sembrada, y quedan en `D.siembra_excluidas` para trazabilidad.

Orden de la pestaña, de arriba hacia abajo:
1. **KPIs ejecutivos** (`#exec-kpis`, `renderResumenKPIs()`) — **solo 4**, operativos/financieros generales: OT Confirmadas, OT Atrasadas (misma definición exacta que Alertas Operacionales), Costo Ejecutado y Gasto No Agrícola. Cada tarjeta usa un acento de color a la izquierda (`.kpi-g/-y/-o/-r/-gris`) en vez de pintar toda la tarjeta; en escritorio ocupan una sola fila (grilla de 4 columnas, heredada de `.kpis`), 2 por fila en pantallas medianas y apiladas en 1 columna en pantallas muy angostas (`.kpis-exec`, `resumen.css`). **Ya no existen** los KPIs generales de superficie (Hectáreas Planificadas/Ejecutadas/Pendientes, Avance General) — esa información se retiró de esta fila a pedido del usuario porque duplicaba, como un total de campaña, lo que ya se puede leer con más contexto en "Detalle de Etapas por Cultivo".
2. **Detalle de Etapas por Cultivo** (`#cults`, `renderCultivoDetalle()`) — bloque analítico por cultivo (sin gráficos intermedios): el progreso de Preparación de Suelo/Siembra/Cuidados/Cosecha, y — para el **estadio actual** (el más reciente con actividad confirmada) — Ha Planificadas (el plan RTK no tiene desglose por estadio, así que es siempre la meta de toda la campaña), Ha Ejecutadas y OT Confirmadas/Totales, los tres **del mismo estadio**, nunca mezclados con otro (`c.etapas[].ha_plan/otConfirmadas/otTotales` en `data.js`). Sin ninguna etapa reconocida todavía, se muestra 0 ha / 0 de las OT totales del cultivo, junto con el mensaje "Sin actividad confirmada aún".
3. **Estado de las Órdenes de Trabajo** (`#resumen-estados-ot`, `renderEstadosOT()`) — barra apilada + leyenda con las categorías reales de `Estado` en `consultaOT` (Confirmado/En Ejecución/Pendiente); cualquier otro valor real se agrupa como "Otros" con el detalle de qué estados incluye, nunca oculto.
4. **Actividad Operacional por Período** (`#resumen-actividad-mensual`, `renderActividadMensual()`) — columnas con la cantidad de OT Confirmadas por mes (Fecha Real); se rotula explícitamente como "OT" para no confundirse con hectáreas (no todas las OT traen Has. Reales).
5. **Gastos Operativos** (`#opex-total`/`#opex-rows`, `renderGastosOperativos()`) — misma posición y misma tarjeta (`.panel`) que ocupaba la vieja "Distribución del Gasto: Áreas No Agrícolas" (mismo cálculo, `D.operativas`/`D.oper_costo`/`D.oper_part` sobre `OPERATIVAS` en `config.js`, nunca se inventó una clasificación nueva ni se recalculó nada en `render.js`). Tarjeta con el total y **una sola fila por categoría** (nombre, barra proporcional, importe, % sobre el total operativo y OT, con el botón "Ver detalle" al final de la misma fila) — sin tabla aparte que repita la misma información (se eliminó a pedido del usuario). Cada categoría se puede expandir ("Ver detalle", delegación de evento en `events.js` sobre `#opex-rows`, sin listeners por fila) para ver, debajo de su propia fila, su composición real por Servicio + Contratista (mismos marcadores `'(Labor Propia)'`/`'(Sin contratista)'` que ya usa "Detalle por Servicio" en Servicios). El % de cada categoría (`o.partOperativo`) es sobre el total operativo, no sobre el costo total de toda la campaña; el total general solo se muestra en la tarjeta superior, no se repite al final de las filas. Sin gastos operativos para el alcance actual, muestra el estado vacío explícito (total en US$ 0,00, sin porcentajes inválidos).
6. **Posibles Problemas en la Campaña** (`#probs`, `renderProblemasResumen()`) — alertas dinámicas con severidad (`critica`/`alta`/`media`/`informativa`, colores `.prob-r/-o/-y/-gris`), ordenadas por severidad y luego por impacto. Reglas: OT atrasadas (misma lógica de Alertas Operacionales), cultivos con avance por debajo del promedio de campaña (desviación relativa, nunca un "atraso agronómico" confirmado), superficie ejecutada por encima del plan, OT sin correspondencia en el plan RTK, cultivos planificados sin ejecución registrada, concentración elevada del gasto en una sola labor, y datos incompletos (OT sin Actividad o sin Fecha Teórica). Los botones "Ver detalle" navegan a la pestaña correspondiente reutilizando `show()` (delegación de evento en `events.js`, sin `onclick` inline). Sin problemas detectados, se muestra un estado positivo explícito, nunca la sección vacía.

### Estadio vacío: respaldo por el servicio de la labor

El avance de cada etapa sale de la columna `Estadio` de la OT. Cuando esa columna viene **vacía** —y solo entonces— se usa el estadio que declara el servicio de su línea de labor (`Tipo de Insumo/Servicio`, expuesto como `o.estadioServicio` en `ordenes.js` y resuelto por `estadioAvance()` en `cultivos.js`). Sin esto, una OT sin estadio desaparecía del avance por completo: no sumaba en ninguna etapa ni figuraba en ningún listado.

El caso real es la **OT 4339** (ARROZ, lote 137, "1° Plaina", 20,48 ha, Confirmada, US$ 675,84): Albor la dejó sin `Estadio`, pero su línea de labor dice `PREPARACION DE SUELO`. Es la **única** OT Confirmada de toda la campaña sin estadio en ninguna de sus líneas.

**El respaldo nunca corrige un estadio ya cargado, solo completa un vacío.** Las dos columnas no son sinónimos: `Tipo de Insumo/Servicio` trae el tipo de insumo en las líneas de insumo (HERBICIDAS, SEMILLAS, COMBUSTIBLES) y el estadio del servicio en las de labor, y aun así discrepa del `Estadio` en 377 de las 1.228 líneas de labor de la campaña — "Tractor x Hs bomba lata" está en el Estadio *Secadero* y su servicio dice *CUIDADOS*. Si el respaldo pisara el valor cargado, 37 OT de secadero, infraestructura y trabajos operativos entrarían al avance agronómico, justo lo contrario de lo que se busca.

**Alcance:** vale únicamente para el avance de cultivos. El campo `estadio` de la OT no se toca, así que Servicios, Combustible, Insumos, Auditoría, Alertas y Control de Hectáreas siguen viendo exactamente lo mismo que antes — para ellos esa OT sigue sin estadio. Verificado con el arnés de regresión: de las 69 claves de `buildData()`, la única que cambió es `cultivos`.

**Efecto en el número:** ARROZ · Preparación de Suelo pasó de 90,1 % (3.506,08 ha) a 90,2 % (3.509,49 ha). Los 20,48 ha de la OT se convierten en 3,41 ha de aporte porque las reglas de siempre siguen aplicando: la OT entra al grupo "1° Plaina" del lote 137, que con ella llega a 87,95 ha —exactamente el plan RTK del lote, o sea que la plaina quedó completa entre la OT 3733 y esta— y ese valor se promedia con las otras 5 labores del lote (`20,48 / 6 = 3,41`).

### El divisor del avance: la receta de labores

El avance de un `(lote, estadio)` es el **promedio** de sus labores, cada una capada al plan del lote.
La pregunta es entre cuántas se promedia, y hasta el 18/09/2026 la respuesta era "entre las labores
que ya están confirmadas". Eso tiene una consecuencia que rompe el número:

> **la primera labor que se confirma sobre un lote lo deja en 100 % de ese estadio**, porque el
> divisor es 1.

El caso que lo destapó: **MAIZ marcaba 100 % de Cuidados sin haberse sembrado**. Sus 5 lotes tenían
una sola labor de cuidados confirmada (Esparcidor de Sólido), así que cada uno promediaba `x/1` y
daba el plan entero. Lo mismo, más diluido, en SORGO — 6 lotes al 100 % individual — y el efecto
inverso, ya conocido: **confirmar una labor nueva hacía BAJAR el porcentaje**, porque crecía el
divisor.

El dato no sabe cuántas labores lleva un ciclo. No existe en ningún lado: `consultaCultivos` planifica
hectáreas, no labores, y `recetas-insumos-26-27.json` es de insumos. Así que el divisor se saca de la
campaña anterior.

**`data/receta-labores-25-26.json`** — derivado del export de Consulta OT de la 25/26 (13.691 filas,
15/02/2025 a 17/09/2026: el ciclo completo) con **el mismo filtro que usa el avance** — solo
Confirmadas, estadio reconocido, modalidad hectáreas —, contando labores distintas por lote. El valor
de cada cultivo/estadio es la **mediana**, no el promedio: un lote que recibió once aplicaciones no
debe arrastrar al resto. El `.xlsx` fuente **no está en el repo**: se analiza una vez y lo que se
versiona es el JSON (14 KB).

```
divisor(lote, estadio) = max( labores confirmadas del lote , receta(cultivo, estadio) )
```

**Es un piso, nunca un tope.** Un lote que ya lleva más labores que la receta conserva las suyas, así
que la receta nunca puede inflar un avance: solo puede bajarlo hasta lo que el ciclo realmente exige.
Y un cultivo/estadio sin receta da divisor 0, que no impone nada y deja el cálculo como estaba.

| cultivo | Preparación | Siembra | Cuidados | Cosecha |
|---|---|---|---|---|
| ARROZ | **4** (118 lotes, 11 labores) | *excluida* | **7** (105 lotes, 18 labores) | 1 (104 lotes) |
| SOJA | **5** (34, 12) | *excluida* | **7** (30, 18) | 2 (30) |
| SORGO | **3,5** (14, 9) | *excluida* | **9** (14, 12) | — |
| MAIZ | **5** (7, 6) | *excluida* | **7** (7, 9) | — |

El efecto sobre la campaña 26/27, contra el cálculo sin receta:

| | sin receta | con receta |
|---|---|---|
| ARROZ Preparación | 90,1 % | **62,0 %** |
| ARROZ Siembra | 39,5 % | 39,5 % (sin cambio) |
| ARROZ Cuidados | 36,2 % | **5,6 %** |
| SORGO Preparación | 97,6 % | **65,5 %** |
| SORGO Cuidados | 34,7 % | **3,9 %** |
| SOJA Preparación | 96,2 % | **44,3 %** |
| SOJA Cuidados | 28,6 % | **4,1 %** |
| MAIZ Preparación | 100 % | **33,0 %** |
| MAIZ Cuidados | 100 % | **14,3 %** |

**Qué significa ahora el número.** Dejó de ser "cuánta superficie tocó esta etapa" y pasó a ser
**"cuánto del trabajo del ciclo está hecho"**. Ninguna etapa llega a 100 % hasta completar todas sus
labores sobre todos sus lotes. En ARROZ · Preparación, los divisores que aplican son 4, 5, 6 y 7 —
ninguno menor a 4; antes eran 1, 2, 4, 5, 6 y 7, y todos los lotes con una, dos o tres labores
confirmadas subieron a 4. De ahí sale la caída de 90,1 % a 62,0 %.

#### Siembra queda afuera (`RECETA_LABORES_ESTADIOS_EXCLUIDOS`)

No es una preferencia: **la receta de Siembra y el avance de Siembra no cuentan lo mismo**. La mediana
de 2 labores por lote de la 25/26 sale de contar `Siembra` **más** `Tratamiento de semillas`:

```
ARROZ siembra · 103 lotes · mediana 2
   Siembra                  102 lotes
   Tratamiento de semillas   87 lotes
   RESiembra                 10 lotes
   RESiembra s/implemento     2 lotes
```

Y el avance de Siembra **descarta explícitamente el tratamiento de semillas**, que no acredita
superficie sembrada (ver `esAvanceDeSiembraValido` y `SIEMBRA_SERVICIOS_NO_SIEMBRA`). Usar ese 2 como
divisor sería dividir por una labor que el numerador se niega a acreditar: el avance de siembra caería
a la mitad por una inconsistencia del cálculo, no porque falte trabajo. Para incorporarla habría que
aplicar el mismo filtro **al generar la receta**, no sacarla en el consumo.

#### Respaldo entre cultivos (`RECETA_LABORES_MIN_LOTES`, hoy 5)

Un cultivo que en la campaña anterior fue marginal tendría una receta que no representa nada. Por
debajo del umbral se usa la **mediana de las recetas representativas de los demás cultivos en el mismo
estadio** — el mismo estadístico, para no cambiar de criterio a mitad de camino.

El umbral está en 5 y no más alto por el maíz, el cultivo chico de la serie: 7 lotes. Con el export
completo su muestra quedó estrecha —preparación entre 5 y 6 labores en los 7 lotes, cuidados entre 6 y
8—, así que un umbral de 10 le descartaba una receta buena y le prestaba la de los demás. Con 5, hoy
**los cuatro cultivos usan su propia receta** y el respaldo queda como red por si un cultivo nuevo
aparece sin historia.

#### Detalles del cálculo

**Un divisor de 1 no se muestra.** Todo lote con actividad tiene al menos una labor, así que un
divisor 1 es inerte: la etapa expone `receta: null` y la pantalla no explica algo que no cambió ningún
número. El índice completo, con el origen de cada divisor, queda en `D.receta_labores`.

**La mediana puede no ser entera.** SORGO · Preparación da 3,5 porque son 14 lotes. Funciona igual
como divisor; se muestra con coma decimal (`fmtDivisor` en `render.js`) y sin decimal cuando es
entera.

**Si el JSON no se descarga, el avance vuelve al cálculo anterior.** `cargarRecetaLabores()` sigue el
mismo criterio que `cargarRecetas()`: el error se registra y devuelve `null`, nunca tumba la carga.
Verificado sacando el archivo del disco — el dashboard construye sin un error, con los números viejos.

**Nada fuera del avance se movió.** Comparando las 71 claves de `buildData()` con receta y sin ella,
cambian exactamente tres: `cultivos`, `receta_labores` (nueva) y `resumen_campanias` (que contiene a
`cultivos`). Costo ejecutado, gasto de servicios, consolidado, KPIs de OT, combustible, operativos,
alertas, Auditoría de Siembra y Control de Hectáreas quedan idénticos. La suma de los aportes sigue
dando el total de la etapa porque `desglosarEstadio` usa **el mismo divisor** que
`equivalenteLoteEstadio`.

**Lo que esto NO es.** No es un juicio agronómico sobre qué labores faltan: la receta aporta un
número, no una lista. Los nombres de las labores de la 25/26 casi no coinciden con los de la 26/27
(«Aplicación de Fungicida + Insecticida avion», «Guacheada ha» contra «Esparcidor de Sólido»,
«Fumigacion Imperator»), así que se usan solo como referencia en el tooltip. Y no corrige la
clasificación del dato: el Esparcidor de Sólido se ejecuta **antes de la siembra en las 54 OT de la
campaña** y sigue cargado en Albor con estadio Cuidados — se dejó donde está por decisión del usuario.

**Para actualizarla** hay que regenerar el JSON desde un export nuevo de la campaña de referencia,
con el mismo filtro. Mientras el ciclo de referencia no cambie, no hace falta tocarla.

#### Un lote ya sembrado no usa la receta

La receta es un **piso** sobre el divisor, y lo que ese piso representa es *las labores que todavía
tienen que venir sobre este lote*. Cuando el lote ya se sembró no viene ninguna más: **sembrar es
posterior a preparar**, así que la preparación de ese lote está terminada, tenga cargadas las labores
que tenga. Sostener el piso ahí no mide un atraso, lo inventa.

```
divisor(lote, estadio) = lote sembrado y estadio anterior a la siembra
                           ? labores confirmadas del lote
                           : max(labores confirmadas del lote, receta del cultivo+estadio)
```

Se resuelve **por lote, no por cultivo**. Es la misma razón agronómica, pero aplicada donde de
verdad vale: un cultivo a medio sembrar tiene lotes terminados y lotes que todavía esperan labores, y
darle a los dos el mismo trato volvería a mentir, ahora en el otro sentido.

Un lote cuenta como sembrado cuando su siembra cubre `AVANCE_LOTE_SEMBRADO_UMBRAL` (0,995) de su
plan. No es 1 exacto porque la superficie sembrada casi nunca cae clavada contra el plan RTK — el
lote 31A de arroz declara 50,39 sobre 52,94 —, y con 0,995 entran los redondeos y queda afuera
cualquier lote realmente a medio sembrar.

**Solo alcanza a las etapas anteriores a la siembra.** La siembra no tiene receta y los Cuidados
vienen *después* de sembrar, así que ahí el piso sigue valiendo entero. Ese recorte es además lo que
evita que `loteSembrado()` se llame a sí mismo.

Efecto sobre el dato (21/09/2026):

| Cultivo | Preparación antes | después | lotes sembrados |
|---|---|---|---|
| SOJA | 44,3 % | **96,2 %** | 12 de 12 |
| ARROZ | 62,0 % | **66,4 %** | 45 de 134 |
| SORGO | 65,5 % | 65,5 % | 0 |
| MAIZ | 33,0 % | 33,0 % | 0 |

Lo que motivó el cambio fue soja: sus 12 lotes están sembrados al 100 % y la preparación marcaba
44,3 %, porque la receta de 5 labores dividía lotes que traen entre 2 y 4.

El 3,8 % que le falta a soja para llegar a 100 **es real y está documentado en el dato**: diez de los
doce lotes quedan en 100 %, y los dos que no son el `111` (85,4 %: el 1° Disco cubre 7,05 de 16,87
ha) y el `112A` (75,0 %: el 2° Disco cubre 10,05 y el 1° Disco 13,53 de 23,58). La OT 5026 del `112A`
lo dice con todas las letras en su observación: *"Parcial. Disco uno que falta."*

La línea del divisor lo marca en corto: `Divisor: 5 (no aplicado)` cuando ningún lote de la etapa lo
usó, y `Divisor: 4 (no aplicado en 45/134)` cuando se aplicó solo en parte.

### Avance Detallado por Cultivo

Vista de detalle a la que se entra con **"Ver desglose detallado →"**, el botón que está a la derecha del encabezado de "Detalle de Etapas por Cultivo", y de la que se sale con **"← Volver al Resumen Ejecutivo"**. Es **una sola vista** con un selector de **Cultivo** (ARROZ, SOJA, SORGO, MAIZ, en el orden de `CULTIVOS`), no una pestaña por cultivo. Existe como `.page` (`#page-avance-detallado`) pero **no tiene botón `.tab` propio**, y va **última en el HTML** a propósito: `events.js` indexa las `.tab` contra las `.page` por posición, así que una `.page` intercalada correría los índices de todos los módulos.

Responde a una sola pregunta: **de dónde sale el porcentaje que muestra cada etapa**. Para cada uno de los cuatro estadios se ve su porcentaje —el **mismo** que el Resumen Ejecutivo, no uno recalculado— descompuesto en las labores que lo forman, y cada labor se puede abrir para ver las OT que la componen (OT · Fecha · Lote · Trabajo Ejecutado · Costo Total). Una sola labor abierta a la vez; cambiar de cultivo las cierra todas.

**El número de cada labor es un aporte, no un avance independiente.** Por eso se rotula "Aporte": si Preparación de Suelo va 90%, los aportes de sus labores suman exactamente 90 puntos, no cada una su propio porcentaje. La descomposición **no inventa ninguna ponderación**: sale de la misma cuenta que ya produce el avance. `equivalenteLoteEstadio` promedia las labores de cada lote, de modo que

```
ha_ejec(estadio) = Σ_lotes  Σ_labores  min(ejecutadas, plan del lote) / divisor(lote, estadio)
```

donde `divisor = max(labores confirmadas del lote, receta del cultivo)` — ver **El divisor del avance**
arriba. Cada labor ya tiene ahí su propio sumando, `min(...)/divisor`. `desglosarEstadio` (`js/data/cultivos.js`) agrupa esos sumandos por labor a través de los lotes: la suma de los aportes **es** el total del estadio por construcción. Los dos ajustes finales que no viven en la labor (el tope de Zafriña26 y el redondeo a 2 decimales) se trasladan repartiendo el total ya ajustado en proporción a los sumandos. El reparto usa **redondeo de mayor resto** (`repartirMayorResto`) sobre el total ya redondeado de la etapa, y no redondeando cada labor por su cuenta: sin eso, cuatro labores podían sumar 89,9% contra un estadio que muestra 90,0%, y esa diferencia de representación se lee como un error de negocio. Se muestra "Total aportes" al pie de cada estadio, que coincide siempre.

**Ninguna regla de avance cambió.** La vista lee `c.etapas[].labores` y `c.etapas[].labores_sin_aporte`, que `construirCultivos` arma con los mismos datos que ya usaba; `render.js` solo pinta. Verificado con el arnés de regresión de CLAUDE.md: el volcado completo de `buildData()`, quitando esas dos claves nuevas, da **16.761.796 bytes idénticos** en las 69 claves.

**Los tres pasos de la cuenta van a la vista, encadenados.** No alcanza con la superficie trabajada y el aporte final: entre las dos hay dos reglas que mueven el número y sin mostrarlas el salto no se puede seguir a mano.

```
2.472,80 ha ejecutadas → 2.400,00 ha que entran al promedio → 1.069,08 ha de aporte
                                                  · promediada entre 1 y 6 labores según el lote
```

1. **`ha_ejec`** — suma cruda de `ha_trab` de sus OT. Es la que cierra con el desplegable de OT.
2. **`ha_computada`** — cada lote capado a su plan RTK (`min(ejecutadas, plan del lote)`): la superficie que efectivamente se promedia. **Acá no se desglosa cuánto se recortó ni en qué lotes** — ese análisis es el de Control de Hectáreas y repetirlo sería tener el mismo dato en dos lugares. Esta vista solo dice con qué superficie se construyó el aporte.
3. **`aporte_ha`** — dividido por el divisor del lote: la cantidad de labores confirmadas, o la receta
   del cultivo si es mayor (ver **El divisor del avance**). El divisor se rotula: una labor puede tocar lotes con distinta cantidad de labores, así que el modelo guarda todos los divisores que aplicaron (`divisores`) y se muestra el valor exacto cuando hay uno solo ("promediada entre las 3 labores del lote") o el rango cuando hay varios. `divisores = [1]` significa que era la única labor de cada lote y no se promedió nada.

La fila principal queda con el qué y el cuánto (`N OT · N lote(s) · US$`), y la cadena en su propio renglón debajo.

**La misma labor cargada más de una vez en el mismo lote.** Es el único caso en que dos OT se **suman** entre sí — labores distintas se promedian, ver arriba — así que es donde conviene mirar de cerca. Al abrir una labor, arriba de la tabla se listan esos lotes con sus OT nombradas una por una.

Se reporta **solo cuando la suma supera el plan del lote**. Terminar un lote en dos tandas es normal y cierra clavado contra el plan (la 1° Plaina del lote 137: `67,47 + 20,48 = 87,95`, exacto), así que marcarlo sería ruido. Que la suma lo supere, en cambio, dice que la labor se rehizo sobre superficie ya trabajada — el caso más claro es SORGO · Fumigacion Imperator, con **8 lotes fumigados enteros dos veces**, en abril y de nuevo en julio.

El listado de excesos de Control de Hectáreas **no puede detectar esto por su propia cuenta**: allá el lote entra con el **máximo** de sus OT (`ha_ot = Math.max(...)`), no con la suma, así que dos cargas de 24,22 ha sobre un lote de 24,22 le dan exceso cero — es el 2° Disco del lote 214. Por eso Control de Hectáreas tiene desde el 18/09/2026 un panel propio para el caso, **Labores de Preparación Repetidas que Superan el Lote** (ver esa sección), que hace la cuenta por suma en vez de por máximo y se limita a Preparación de Suelo. Las dos vistas miran lo mismo desde ángulos distintos: acá se ve qué le hace al avance de la etapa, allá qué superficie se trabajó de más.

Quedan fuera los casos sin plan contra el cual compararse: la siembra de Zafriña26 (comparte el plan de Maíz), los lotes sin plan RTK y los dados de baja (`RTK_LOTE_CANCELADO`), donde cualquier superficie lo superaría.

**El costo es información adicional y no pondera nada.** Sale de `o.imp` (el importe total de la OT: Labor Propia + Labor Tercero + Insumos), y el costo de la labor es la suma del de sus OT. El aporte al estadio viene exclusivamente de la ejecución física.

**Las labores que no acreditan superficie figuran aparte**, bajo "No aportan al avance", con su motivo (trabajo medido en horas, tratamiento de semillas, sin Has. Reales), su cantidad de OT y su costo, y aporte 0% explícito. Son los mismos descartes que el cálculo del avance ya hacía y que antes desaparecían en silencio; nunca entran en ninguna suma. Las labores que `LABORES_EQUIVALENTES` unifica se muestran como **una sola**, con los nombres originales al lado.

## Control de Hectáreas

Compara la superficie ejecutada de cada lote contra su plan RTK. La superficie sale de
`haTrabajada(o)` — Unidades/Dosis de las líneas de **labor** de la OT (`categoria = Servicio`),
nunca de Has. Reales: ver **Agrupación por OT**. Solo OT Confirmadas: una Pendiente no ejecutó nada,
así que no puede haber excedido nada.

### Tolerancia de sobrepase por servicio

Un lote entra al listado de excesos cuando alguna de sus OT pasa el plan. `TOLERANCIA_EXCESO_SERVICIO`
(`config.js`) define cuánto puede pasarse cada servicio sin que se reporte, como fracción del plan:

```
divisor de decisión:  ha_ot > plan_del_lote × (1 + tolerancia(servicio))
```

Hoy tiene una sola entrada, **Fumigación Dron: 5 %**, a pedido del usuario. El dron aplica con solape
entre pasadas, así que cubrir un poco más que la superficie del lote es cómo trabaja, no un error de
carga. Lo que no figure en la tabla tolera 0.

**La tolerancia no cambia ninguna hectárea**: solo decide si el caso se reporta. El exceso que se
muestra sigue siendo la diferencia real contra el plan.

Dos consecuencias de diseño:

- **`ha_ot` es la mayor de las OT que sobrepasan**, no la mayor del lote. Si la OT más grande queda
  tolerada, no tiene sentido que sea ella la que fije el exceso que se reporta.
- **Una OT tolerada no se lista en el detalle**, porque lo que dice la tolerancia es justamente que
  está bien. Queda contada en el encabezado del lote (`1 de 11 OT`) y entera en `e.dets`, que es
  donde vive la trazabilidad.

Con el dato de la campaña la tolerancia saca **un solo lote** del listado —ARROZ `.40A`, donde la OT
4513 hace 42,80 ha sobre un plan de 40,77, un 4,98 %—. Los sobrepases grandes siguen enteros: el
`.32B` sigue con +22,9 %.

### El detalle lista solo las OT que sobrepasan

El detalle de cada lote muestra **únicamente las OT que pasan el plan**. Las que quedan dentro son
correctas y no explican nada del exceso: eran **74 de las 95 filas** del detalle, tres cuartas partes
del panel dedicadas a decir que todo estaba bien. El panel pasó de 123 a 48 filas.

El encabezado de cada lote da la cuenta (`1 de 11 OT`): cuántas se listan y cuántas tiene el lote.
El recorte es **solo de presentación** — `e.dets` sigue trayendo todas las OT con sus banderas
(`over`, `tolerado`, `declarado`), así que la trazabilidad completa está en el modelo.

### Sobrepase que la propia OT declara

Cuando la observación de la OT declara su sobrepase, **Control de Hectáreas no lo alerta**
(`OBS_SOBREPASE_DECLARADO` en `config.js`, `sobrepaseDeclarado()` en `cultivos.js`). El texto suele
traer la prueba:

```
Sobrepase de 27,81 hectáreas. Referente a la boleta de aplicación aérea Nro: 29.279
Sobrepase con 3% a más de la aplicación de la fecha 08/09. Por motivo de monte alrededor
  de ciertas parcelas a aplicar.
```

Volver a marcarlo sería pedir dos veces la misma explicación. Vale para las dos vistas del módulo:
la OT no cuenta como exceso y tampoco arrastra a su labor al panel de repetidas.

La OT queda igual en `e.dets` con la bandera `declarado` y su observación, así que el caso se puede
auditar desde el modelo aunque el panel no lo liste.

Hoy la regla **no saca ningún caso**, y eso es esperable, no un error: las 12 OT que declaran
sobrepase en la 26/27 son todas de cultivos `PARCELA` (arroz, soja y sorgo de parcela), y Control de
Hectáreas solo cubre los cuatro cultivos con plan RTK — ARROZ, SOJA, SORGO y MAIZ. La regla está
puesta para el día en que una de estas declaraciones caiga sobre un lote con plan.

### Labores de Preparación Repetidas que Superan el Lote

Panel propio, porque el listado de excesos **no puede verlo**: allí el lote entra con el **máximo** de
sus OT, no con la suma, así que dos pasadas de 24,22 ha sobre un lote de 24,22 dan exceso cero.

La cuenta acá es por suma, agrupando por **labor normalizada** (`claveLaborAvance`, la misma del
avance, para que dos nombres de la misma labor no queden como labores distintas):

```
suma de las OT de UNA labor de preparación sobre el lote  >  plan × (1 + tolerancia del servicio)
```

**Solo cuenta Preparación de Suelo** (`REPETIDAS_ESTADIOS`, `config.js`). Un cuidado se repite sobre
el mismo lote por diseño agronómico —se fumiga varias veces en la campaña—, así que sumar sus OT y
compararlas contra el plan no dice nada: dos fumigaciones de un lote entero dan 200 % y son correctas.
Preparar el suelo, en cambio, se hace una vez.

El filtro va **por OT y no por grupo**, y eso saca tres falsos positivos que no eran repeticiones: en
los lotes `147A`, `147B` y `148A` de arroz la «Fumigación Dron» aparecía dos veces, pero una OT es de
Preparación (desecación previa) y la otra de Cuidados — dos momentos distintos del ciclo que comparten
el nombre del servicio, no la misma pasada dos veces.

Se reporta solo cuando la suma supera el plan. Terminar un lote en dos tandas es normal y cierra
clavado contra el plan, así que marcarlo sería ruido; que lo supere dice que **la labor se rehizo
sobre superficie ya trabajada**. Vale la misma tolerancia por servicio que el listado de excesos, y
quedan fuera los lotes sin plan y los dados de baja (`RTK_LOTE_CANCELADO`), donde cualquier superficie
lo superaría.

El detalle de cada caso lleva la **fecha real** de cada OT, que es lo primero que se quiere ver: dos
pasadas separadas por meses son la firma de que la labor se rehizo. La 1° Plaina del lote `.33A` son
49,42 ha el 31/07 y otras 49,42 el 17/09 — el lote entero, dos veces.

Hoy son **15 casos y 296,97 ha** sobre el plan. El grueso es la Fumigación Imperator de sorgo —que en
ese cultivo es desecación de preparación, no un cuidado— con ocho lotes tratados enteros dos veces, en
abril y de nuevo en julio, más varios discos, plainas y una taipa.

El mismo hallazgo se ve en **Avance Detallado** desde el ángulo del avance (cuánto le quita a la
etapa); acá se ve desde el ángulo de la superficie (cuánta se trabajó de más). No son dos cálculos
distintos del mismo número: son dos preguntas distintas sobre los mismos datos.

## Servicios

### Filtro de Cultivo

Va al lado de Mes y tiene **el mismo alcance**: KPIs, gasto acumulado, Detalle por Servicio y Consumo de Gasoil por Área quedan todos expresados sobre `Campaña + Mes + Cultivo`. **No es un filtro visual**: `filtrarServiciosPorCultivo()` (`servicios.js`) vuelve a sumar cada grupo sobre sus propias OT de ese cultivo, con las mismas funciones que usó la construcción del módulo (`acumularGrupoServicio` / `acumularGrupoGasoil`) — no hay una segunda forma de calcular un total. Con `Todos` devuelve el paquete original **sin recalcular nada**.

El cultivo de una OT es el campo **`actividad`** de `consultaOT` (`o.act`), el mismo que ya usa el avance de campo del Resumen Ejecutivo. **No** se usa la columna `cultivo` del Excel: esa trae el nombre completo de la parcela (`"LA TERESA 211 ARROZ 26/27"`), no el cultivo. La clave se normaliza con `normHdr()`, así que `ARROZ`, `Arroz` y `" arroz "` son un único cultivo.

Las opciones se recalculan por campaña, en este orden: `Todos`, después los prioritarios de `CULTIVOS` (`ARROZ`, `SOJA`, `SORGO`, `MAIZ`) **solo si existen en el dato**, y después el resto alfabéticamente. Si el cultivo elegido no existe en la campaña nueva, el selector vuelve solo a `Todos`.

> El selector se arma sobre **todas** las OT confirmadas de la campaña (las del Detalle por Servicio y las de retiro de gasoil), para que el filtro sea una partición completa del módulo y ningún registro quede fuera de su alcance. Por eso puede aparecer un cultivo que solo tenga OT de gasoil — hoy `SECADERO` en 26/27 y `OPERATIVO` en 25/26 —: ahí el Detalle por Servicio queda vacío y el consumo de gasoil no.

### Detalle por Servicio desplegable

Cada fila se abre con clic (caret `▸`/`▾` en la celda **OT Conf.**, sin columna extra de "Ver detalle") y muestra las OT que la componen: `OT · Fecha · Cultivo · Lote · Trabajo Ejecutado · Costo Total`. Una sola fila abierta a la vez; si la fila deja de estar en el resultado tras cambiar un filtro, se cierra sola.

El desplegable **no recalcula nada ni vuelve a leer `consultaOT`**: recorre `l.ots`, el resumen que `construirServicios()` dejó guardado en el mismo recorrido con que sumó el grupo, sobre las OT **ya agrupadas** por `agruparOTS()` — por eso una OT con varias líneas (servicio + labor + insumos) aparece **una sola vez**. `Trabajo Ejecutado` usa `celdaTrabajoEjecutado()`, la misma función que la fila principal, con la unidad del grupo: hectáreas, horas, kilos, `3 insumos utilizados` en Tratamiento de semillas o `2 trabajos` en Camión + grúa. `Costo Total` de cada OT es su aporte real al grupo (`Labor Propia + Labor Tercero + Insumos`), sin redondear antes de sumar. Orden: fecha ascendente y, a igual fecha, número de OT ascendente.

Verificado contra el dato real: en las 4 campañas y sus 175 grupos, la cantidad de OT del desplegable coincide con `OT Conf.` y las sumas de `ha`, `horas`, `kg`, líneas de insumo, trabajos y los tres importes coinciden con la fila principal (hasta un centavo de redondeo de presentación); ninguna OT aparece en dos grupos.

### Unidades de "Trabajo Ejecutado"

La columna muestra la cantidad ejecutada en la unidad propia de cada trabajo, **nunca convertida a otra**. Hay cinco, y la elige `unidadTrabajo` (`servicios.js`) a partir de la modalidad de la línea principal de labor (`modalidadLaborOT`, `ordenes.js`):

| unidadTrabajo | qué muestra | de dónde sale |
|---|---|---|
| `ha` | hectáreas | `Has. Reales` |
| `hrs` | horas | `Unidades/Dosis` de las líneas en "Horas" |
| `kg` | kilos | `totalAplicado` de los fletes medidos por peso |
| `ins` | líneas de insumo aplicadas | `SERVICIOS_TRABAJO_MEDIDO_EN_INSUMOS` |
| `trabajos` | cantidad de trabajos | `SERVICIOS_CAMION_GRUA` (ver abajo) |

Los servicios de `SERVICIOS_SIN_TRABAJO_EJECUTADO` muestran "—".

### Trabajos para Terceros

Panel debajo del Consumo de Gasoil por Área. Lista los trabajos que la campaña hizo **para otra
empresa** y que hoy cargan su costo acá.

El dato sale exclusivamente de la observación de la OT, porque **no está en ningún otro campo**: el
Contratista dice quién ejecutó el trabajo, no para quién, y la actividad de todas estas OT es
`OPERATIVO`. `OBS_TERCEROS` (`config.js`) es el catálogo de terceros nombrados, con el mismo
criterio que el catálogo de máquinas de `combustible.js`: sale del dato real, tolera cómo está
escrito de verdad (`agrovial`, `Agro vial S.A`, `Exc Agrovial S.A`) y **a una OT que no coincida con
ninguna entrada no se le inventa un tercero**.

Se distinguen dos cosas que conviene no mezclar:

- Las que **piden el descuento** explícitamente (`OBS_A_DESCONTAR`), rotuladas «a descontar»:
  *"Translado de caranda'y para puentes descontar agrovial combustible tambien"*, *"Estirar
  camioneta trancada de IM S.A (a descontar)"*.
- Las que solo **nombran al tercero** sin pedirlo: *"Traslado de Retro desde P38 hasta P139 Cedrela
  S.A"*. Se listan igual, pero aparte. Pedir el descuento es una decisión de quien cargó la OT;
  suponerlo donde nadie lo escribió sería inventar plata.

Cada fila lleva su observación completa: es la única prueba de que ese trabajo fue para otro, así
que es dato y no comentario.

El panel se arma sobre las OT confirmadas enteras, no sobre el detalle de servicios ni sobre el
gasoil: un traslado para un tercero puede venir de cualquiera de las dos formas y es el mismo
hallazgo.

**Filtros.** Campaña y Cultivo de la barra de la pestaña siguen valiendo, porque definen el conjunto
de OT (filtrar por un cultivo lo deja vacío: estas OT son operativas y no tienen cultivo). El **Mes**
de esa barra **no** se aplica acá: el panel tiene el suyo (`#tercmes`), junto con un filtro de
**Tercero** (`#terctercero`). Son dos y no tres para que no se crucen y dejen la tabla vacía sin que
se pueda saber cuál de los dos meses la vació. Las opciones de ambos salen de las OT que quedaron
después de Campaña y Cultivo, y si el valor elegido deja de existir vuelve solo a «Todos».

**Presentación.** Las filas reusan la estructura de grupo + detalle de los paneles de exceso, pero
con la clase `.neutra`, que apaga el tinte rojo: ahí el rojo significa hallazgo y esto es
información, no un error. El pie de la tabla (`<tfoot>`) lleva el total de OT, horas e importe del
filtro activo, y cuánto de eso pide descuento.

Hoy son **20 OT y US$ 3.425,34**, de los cuales **US$ 2.200,92 en 9 OT piden el descuento**:

| Tercero | OT | Costo | Piden descuento |
|---|---|---|---|
| Agrovial S.A | 7 | 2.055,05 | 5 OT · 1.891,36 |
| Cedrela S.A | 8 | 1.082,31 | 1 OT · 86,48 |
| Agrícola JG | 2 | 136,63 | 2 OT · 136,63 |
| IM S.A | 1 | 86,46 | 1 OT · 86,46 |
| DINN S.A | 2 | 64,90 | — |

**El panel no descuenta nada.** El costo de la campaña sigue incluyendo estas OT: el dashboard
reporta lo que el dato dice, y sacarlas del costo es una decisión contable que no le corresponde
tomar a una vista.

### Camión + grúa: el trabajo se cuenta en trabajos, no en horas

Un trabajo es cada bloque de **6 horas** de jornada, con el límite inferior **inclusivo**:

```
0 < h < 6   -> 1 trabajo       12 <= h < 18 -> 3 trabajos
6 <= h < 12 -> 2 trabajos      18 <= h < 24 -> 4 trabajos
```

La fórmula es `Math.floor(h / 6) + 1`, **no** `Math.ceil(h / 6)`: con `ceil`, 6 horas exactas darían 1 trabajo y deben dar 2. Con `h <= 0` (o un valor no numérico) da **0 trabajos** — no se inventa una jornada que no existe. Vive en `calcularTrabajosCamionGrua()` (`ordenes.js`), única fuente de la cuenta; `servicios.js` y `render.js` solo **suman** y presentan lo ya calculado.

**Se calcula por jornada y después se suma**, nunca al revés: tres jornadas de 5 h, 6 h y 8 h son `1 + 2 + 2 = 5 trabajos`, no `19 h = 4 trabajos`. Cada línea de labor es una jornada (`trabajosCamionGruaDeLinea()`), y `agruparOTS` suma las de la OT.

> **El servicio `Camion + grua` a secas NO EXISTE en `consultaOT`.** Verificado contra el .xlsx: existen **dos** servicios, que son además los **únicos dos registros con `unidadMedida` = "General"** de toda la hoja (2 de 2.139 filas):
>
> | OT | Servicio | Unidad | Estado | Precio unit. | Contratista |
> |---|---|---|---|---|---|
> | 4586 | `Camion + grua por dia >6hs` | General | En Ejecución | 83,221 | Agro Continental S.A. |
> | 4497 | `Camion + grua por dia <6hs` | General | En Ejecución | 82,9474 | Agro Continental S.A. |
>
> Albor ya codifica el corte de 6 horas **en el nombre del servicio**, y **no carga las horas en ningún lado**: `hsPersonal`, `hsMaquinarias`, `cantidadResultado` y `toneladas` valen 0 en las 2.139 filas de la hoja, y estas OT traen `unidadesDosis = 0,01` (el marcador de "sin cantidad", el mismo de las labores por hectárea), `dosisReales = 0` y `hectareasReales = 0`.
>
> Por eso cada servicio declara en `SERVICIOS_CAMION_GRUA` (`config.js`) las horas que representa su tramo (1 h y 6 h), y la cuenta sale de aplicarles la **misma** fórmula de 6 horas: `<6hs` → 1 trabajo, `>6hs` → 2 trabajos. Decisión confirmada con el usuario. **Limitación conocida y aceptada:** una jornada de 14 h también se carga como ">6hs" y debería ser 3 trabajos, pero el dato no lo distingue. El día que Albor cargue horas reales, alcanza con leérselas y pasarlas a la fórmula.
>
> Como ambas están **En Ejecución** y el Detalle por Servicio solo muestra OT `Confirmado`, hoy todavía no se ven en la tabla.

**La detección es por nombre de servicio, jamás por unidad.** `esCamionGrua()` (`ordenes.js`) compara con `normHdr()` — recorta, colapsa espacios, ignora mayúsculas y acentos — contra la lista declarada, con coincidencia **exacta**, no parcial. Verificado: entran `"  CAMION + GRUA POR DIA <6HS  "` y `"Camión  +  grúa  por  dia  >6hs"`; **no** entran `Camion + grua`, `Camion`, `Grua`, `Camioneta`, `Camion + otro servicio`, `Estirar camion con tractor x Hs` ni `Descargar camión retropala x Hs`.

> **Nunca se creó una regla `unidadMedida === "General"`.** Eso habría convertido la excepción en una regla global. La unidad se usa solo como **control de consistencia**: `construirBaseOT` avisa por consola si aparece una fila "General" que no sea Camión + grúa, o una de Camión + grúa con otra unidad — avisa, no transforma. Probado con cuatro servicios sintéticos de unidad "General" (`Servicio X con unidad General`, `Camion`, `Grua`, `Camion + otro servicio`): los cuatro siguen dando modalidad `hectareas`, `unidadTrabajo` `ha` y el mismo importe.

**Los costos no se tocan.** El importe sigue siendo `Unidades/Dosis × Precio Unitario`, igual que antes; la cuenta de trabajos no entra en ninguna fórmula económica. Verificado con el dump completo del modelo: las **62 claves son idénticas** una vez que se descuenta el campo nuevo `trabajos` — incluidos `costo_total`, `gasto_total`, `costo_total_consolidado` y `costo_por_campania`.

En la tabla se muestra `1 trabajo` / `N trabajos` (singular y plural), sin chip de unidad y sin decimales: es un conteo, no una medida. Nunca muestra "General" ni hectáreas.

## Combustible

Las transferencias internas entre depósitos se excluyen de ingresos y consumos antes de agrupar los movimientos. Sus dos patas representan un traslado con saldo neto cero para el stock consolidado; contarlas en valor absoluto inflaba el consumo y reducía el balance. La exclusión aplica también al detalle, los filtros y el arrastre mensual. Los registros originales permanecen en el Excel.

- **Stock Inicial dinámico**: sale de `consultaInsumos`, filas con `tipoInsumo="COMBUSTIBLES"` y `tipoMovimiento="Existencia inicial"` (fechadas al 1/1). `data.js` suma estas filas **con signo** (no en valor absoluto — las filas individuales vienen con signo mixto, la suma neta es la que da el stock real de arranque) en `D.stock_inicial_combustible`.
- **Balance** = Stock Inicial + Ingreso − Consumo, acumulado mes a mes. El Stock Inicial de un mes puntual se calcula con `stockInicioDePeriodo()` (`utils.js`, genérica): stock base + todo lo ingresado/consumido en los meses **anteriores** — así el balance de cada mes sigue naturalmente al del anterior en vez de recalcularse desde cero.
- `unidades` en `consultaInsumos` viene con signo (negativo=egreso, positivo=ingreso); se normaliza a valor absoluto al separar Ingreso/Consumo en `loader.js`.

### Consumo por Uso / Detalle — vínculo con la Orden de Trabajo

La tabla de Consumo ya **no** agrupa por proveedor. Agrupa por el uso real del combustible, que sale de la OT que generó el movimiento.

**El vínculo.** Un movimiento de combustible de `consultaInsumos` trae en **`referenciaOrigen`** la orden de trabajo que lo generó (`"2026 - OT - 4410"`), y ése es exactamente el valor de la **`referencia`** propia de esa OT en `consultaOT`. La comparación es **exacta** sobre el texto recortado (`trim`), sin fuzzy matching y sin tocar números ni identificadores; las referencias vacías no son clave, son ausencia de referencia.

`construirIndiceOTPorReferencia()` (`ordenes.js`) arma el índice `referencia de OT → OT` **una sola vez**, al construir el modelo, y devuelve **una entrada por OT** (no una línea suelta), así que tener la OT varias líneas no puede duplicar un movimiento. `construirCombustible()` recorre los movimientos una vez: el cruce es `O(nOT + nMovimientos)`, nunca `O(nOT × nMovimientos)`, y no se repite en ningún render. `render.js` solo presenta.

> **Por qué se abandonó `referencia = referenciaAsiento`.** Una auditoría completa contra el `.xlsx` lo descartó con datos:
> - **La clave vieja no es única.** El número de comprobante de stock se comparte entre el subsistema agrícola y el ganadero: **848 comprobantes son usados por más de un movimiento y 673 de ellos mezclan un origen `OTG` (ganadero) con uno `OT` (agrícola)**. Eso colgaba **109 movimientos de ración vacuna de OT agrícolas sin relación** — p. ej. `2026 - STK - 9115` es a la vez 493 kg de "Silo Torta de maiz" (`OTG-1394`) y 7,4 L de IOP FULL (`OT-4027`), y la clave vieja le atribuía los dos a la OT 4027.
> - **La clave nueva sí es única.** `consultaOT.referencia` viene cargada en las 2.228 filas, su número **siempre** coincide con `ordenTrabajo`, y ninguna referencia abarca más de una OT ni ninguna OT tiene más de una referencia.
> - **Las cantidades cierran.** En los **371 grupos** OT+producto+unidad de combustible, la salida de stock coincide con el `totalAplicado` de la OT **hasta el último decimal** (0 diferencias), con el mismo producto y la misma unidad. La correspondencia además es biyectiva: las 371 OT con línea de gasoil tienen su movimiento y viceversa.
> - **Cobertura del 100 % en la campaña vigente**: los **364 de 364** egresos por OT de 26/27 encuentran su orden (29.500,10 L de 29.500,10 L).
>
> `referenciaAsiento` **ya no se consulta en este módulo, ni siquiera como respaldo**. El campo se conserva en el modelo porque es una columna real de la OT, pero ninguna funcionalidad lo usa como clave.

> **El índice se arma con TODAS las campañas, no solo con la vigente.** A diferencia de `consultaOT`, `consultaInsumos` no se recorta por campaña (ver arriba), así que hay movimientos cuya OT pertenece a otra. De los 390 que cruzan, **23 apuntan a OT de 25/26 y 3 a Zafriña 26**: recortando a `CAMPANIA_ACTUAL` se perderían esos vínculos sin ninguna razón. Se reutiliza `normalizarFilasOT()` — no existe una segunda interpretación de `consultaOT` en paralelo.

### Atribución por niveles

Un movimiento cae en **uno solo** de estos cuatro niveles, evaluados en orden. Son situaciones realmente distintas y ninguna se hace pasar por otra:

| # | `tipoVinculo` | Cuándo | Uso / Detalle | Chip | Movs | Litros |
|---|---|---|---|---|---|---|
| 1 | `ot` | `referenciaOrigen` encontró su OT | observación de la OT, o `Sin detalle` si está vacía | OT vinculada | 390 | 30.793,44 L |
| 2 | `contratista` | sin `referenciaOrigen`, con contratista | el nombre real del contratista | Solo contratista | 1.595 | 408.647,55 L |
| 3 | `ot_no_disponible` | con `referenciaOrigen`, pero esa OT no está en el export | la **parcela** que declara el propio movimiento | OT no disponible | 546 | 46.267,78 L |
| 4 | `labor_propia` | ni referencia ni contratista | `Labor Propia` | Labor Propia | 0 | 0,00 L |

Los cuatro suman exactamente el consumo original: **2.531 movimientos · 485.708,77 L**.

**El nivel 3 no es "sin OT".** Esos movimientos **sí** vienen de una orden de trabajo y se sabe cuál es — el número viaja en el detalle (`2026 - OT - 3910`). Lo que falta es su registro en `consultaOT`, que viene recortado por campaña. Verificado: los 546 son **todos de 25/26**, campaña de la que el export trae sólo 61 OT de las 569 que los movimientos referencian. Llamarlos `Sin OT vinculada` sería falso y llamarlos `Labor Propia` sería inventar.

**Y tampoco quedan bajo un rótulo genérico.** Su uso es la **parcela que trae el propio movimiento** (columna `cultivo` de `consultaInsumos`, el nombre completo `"LA TERESA Operativos OPERATIVO 25/26"` — mismo campo que `construirAuditoriaInsumosParcela` ya llama `parcela`). Aunque falte la OT, el dato dice **dónde** se usó el combustible, y los 546 movimientos se abren en 10 grupos legibles en vez de uno anónimo:

| Parcela | Movs | Litros |
|---|---|---|
| LA TERESA Operativos OPERATIVO 25/26 | 308 | 28.056,03 |
| LA TERESA Secadero Arroz ARROZ 25/26 | 149 | 10.610,64 |
| LA TERESA PARCELA ARROZ 25/26 | 26 | 4.287,90 |
| LA TERESA PARCELA SOJA 25/26 | 13 | 1.229,17 |
| LA TERESA SECADERO 25/26 | 33 | 1.043,97 |
| LA TERESA SILO BOLSAS CUIDADOS DE PATIOS GENERAL | 11 | 614,58 |
| LA TERESA .03A SOJA 25/26 | 2 | 169,00 |
| LA TERESA Secadero Soja SOJA 25/26 | 2 | 109,35 |
| LA TERESA MANTENIMIENTO DE BOMBAS 25/26 | 1 | 91,70 |
| LA TERESA PARCELA DE SORGO 25/26 | 1 | 55,44 |

> **El campo está validado, no supuesto.** Mismo método que con el contratista: se comparó `consultaInsumos.cultivo` contra `consultaOT.cultivo` en los 390 movimientos donde ambas fuentes existen y **coincide en 390 de 390 (100 %)**. Está cargado en los 546 históricos (100 %) y en los 390 con OT; en las remisiones por venta viene vacío (0 %), que es coherente: ese combustible no se usó en una parcela propia.
>
> **El texto se muestra tal cual, sin partirlo en lote y cultivo.** El patrón `"LA TERESA {lote} {CULTIVO} {campaña}"` que usa `construirPlanRTK` **no** sirve acá: 2 de los 10 textos no calzan (`"LA TERESA SILO BOLSAS CUIDADOS DE PATIOS GENERAL"`, `"LA TERESA SECADERO 25/26"`) y otros parten mal — `"MANTENIMIENTO DE BOMBAS"` daría `lote="MANTENIMIENTO DE"` y `cultivo="BOMBAS"`. Partirlo sería inventar; el texto completo es el dato. `USO_OT_NO_DISPONIBLE` (`"OT histórica no disponible"`) queda solo como respaldo por si un movimiento futuro llegara sin parcela — hoy: 0 casos.

**El contratista sirve para atribuir, nunca para deducir una OT.** No se usa contratista + fecha, + litros, + mes ni + producto para adivinar una orden: una OT se considera vinculada **sólo** si `referenciaOrigen = referencia`. Verificado en el modelo: **0 movimientos** fuera del nivel 1 traen número de OT, estadio, lote, cultivo, servicio o personal.

> **El contratista no rescata a los históricos.** La validación previa lo midió: el campo viene vacío en el **100 %** de los egresos por OT (los 390 vinculados y los 546 históricos) y sólo está poblado en las remisiones por venta. La razón es operativa: el gasoil de las OT es siempre trabajo propio, y el que usa un tercero sale por remisión y se le factura. Por eso el nivel 2 cubre las remisiones y no los históricos, y por eso hizo falta el nivel 3.

Nunca se usa `consultaInsumos.observaciones` como uso: en estos movimientos dice siempre lo mismo (`"Orden de Trabajo Agrícola > Comprobante Automático de Egreso de Stock"`) y no describe nada. `Labor Propia` sigue existiendo además como opción del **filtro de Tercero** (contratista vacío), que no cambió.

### Detalle desplegable

Las columnas cambian según el nivel, para no mostrar datos que no existen:

| Nivel | Columnas |
|---|---|
| `ot` | Fecha · OT \| Estadio \| Lote \| **Retiró** \| Litros |
| `ot_no_disponible` | Fecha \| Referencia de origen \| OT (`No disponible`) \| Campaña \| Litros |
| `contratista` / `labor_propia` | Fecha \| Comprobante \| Tipo de comprobante \| Campaña \| Litros |

### Filtro de Máquina

La observación de la OT nombra el equipo que cargó el gasoil (`"Arreglo de camino - Motoniveladora"`, `"Corpida - Tr 14"`). No es un campo propio: es texto libre, y la misma máquina aparece escrita de muchas formas. `COMBUSTIBLE_MAQUINAS` (`config.js`) es la **única fuente** de esa equivalencia — 25 equipos con sus variantes reales, relevadas una por una contra el `.xlsx`.

**La lista de equipos y su orden los dictó el usuario**, y el desplegable de Máquina los muestra en ese mismo orden (tractores → vehículos → maquinaria pesada), no por litros ni alfabéticamente.

**Resultado: los 394 movimientos del nivel `ot` identifican una máquina — ninguno queda sin identificar y ninguno coincide con dos a la vez.** El filtro suma exactamente esos 394 movimientos y 31.225,88 L.

| Máquina | Movs | Litros | | Máquina | Movs | Litros |
|---|---|---|---|---|---|---|
| Tr 01 | 7 | 375,13 | | Ford Ranger AAUG855 | 42 | 2.245,59 |
| Tr 02 | 11 | 989,11 | | Chevrolet D20 AGP645 | 21 | 1.053,94 |
| Tr 03 | 3 | 96,20 | | S10 UAB800 | 24 | 850,10 |
| Tr 04 | 24 | 1.829,52 | | S10 AAOZ829 | 19 | 1.121,39 |
| Tr 07 | 36 | 2.138,95 | | Amarok | 3 | 213,78 |
| Tr 14 | 34 | 1.550,33 | | Scania OCE825 | 1 | 22,10 |
| Tr Valtra | 4 | 96,30 | | Chevrolet BLB594 | 1 | 85,00 |
| Tr 7 John Deere | 11 | 562,43 | | Hilux HDX314 | 2 | 101,96 |
| Tr 3J John Deere | 5 | 299,91 | | Chevrolet FAD575 | 2 | 130,00 |
| Tr New Holland 7205 | 2 | 71,00 | | Motoniveladora | 43 | 9.318,00 |
| Tr New Holland 7260 | 1 | 27,00 | | Excavadora Sany Neumático | 55 | 3.753,33 |
| Tr Case 230 | 7 | 412,07 | | Generador | 20 | 3.193,44 |
| Tr Deutz | 16 | 689,30 | | | | |

**Reglas de la normalización** — sin fuzzy matching, sin coincidencia parcial, sin alias inventados:

- La variante se busca como **palabra completa** sobre el texto normalizado (`normHdr` + puntuación y guiones convertidos en espacios). El guion hace falta porque el dato trae la máquina pegada a él (`"Desalijo Silo Bolsa -Tr 07 AC"`) y el punto porque termina en él (`"Abastecer generador."`).
- Las variantes se prueban **de la más larga a la más corta**, para que `tr 07 ac` gane sobre `tr 07`.
- **Identidad de los tractores: un tractor de marca es un equipo DISTINTO del numerado**, aunque compartan el dígito. `Tr 07` y `Tr 7 John Deere` son dos máquinas, igual que `Tr 03` y `Tr 3J John Deere`. Lo hace posible la regla anterior: `tr 7 john deere` es más larga que `tr 07`, así que gana la coincidencia sin necesidad de ninguna regla especial. El dato lo soporta sin ambigüedad: las formas **con cero a la izquierda** (`Tr 01/02/03/04/07`) **nunca nombran una marca**, y las formas **sin cero** (`Tr 7`, `Tr 3J`) son las únicas que la nombran — las dos formas no se cruzan en ninguna observación real.
- **El `Tr 14` es la excepción**, a pedido del usuario: `Tr 14 John Deere` es el **mismo equipo** que `Tr 14`/`Tractor 14`, así que las tres formas van juntas en una sola entrada. Se separó en su momento y se volvió a unir — está así a propósito, no por omisión.
- Los números de **4 dígitos no son flota sino modelo** (`New Holland 7205`, `New Holland 7260`, `John Deere 6180`, `John Deere 7515`, `Case 230`): esas variantes van declaradas enteras y no se les extrae el número, para no inventar un "tractor 7205".
- **Un vehículo nombrado por chapa es el mismo que nombrado por modelo**, cuando el usuario lo confirma: `AAUG855` es el propio Ford Ranger, y `HDX314` es la chapa de la **Hilux** — el dato real siempre las nombra juntas (`"Logistica Salario - Hilux HDX314"`). `HDX314` era una entrada aparte rotulada "Chevrolet HDX314" y, al ser la variante más larga, le ganaba a `hilux`: esos movimientos se mostraban con la marca equivocada. La unificación **nunca** se deduce del dato: se hace solo con confirmación explícita.
- El horómetro o el kilometraje entre paréntesis se ignoran: `Motoniveladora (17397.8 Hs)` y `Ford Ranger (92.635 km)` son la misma máquina que sin el paréntesis.
- Un texto que no coincida con ninguna variante declarada **no recibe máquina** — no se le adivina una.

> **Los tractores de marca ya están desagregados.** Hasta esta versión el catálogo agrupaba **por número de flota**: `Tr 7 John Deere` caía dentro de Tractor 07 y `Tr 3J John Deere` dentro de Tractor 03. El usuario confirmó que son equipos distintos y dictó la lista definitiva, así que esa agrupación se deshizo. Además se corrigió `Tr New Holland 7260`, que era el **único** movimiento del módulo sin máquina reconocida: el catálogo lo declaraba como `tr 3 new holland 7260`, una forma que el dato nunca usa.

Solo el nivel `ot` tiene observación, así que **elegir una máquina deja fuera del resultado a `Solo contratista` y `OT no disponible`**: esos 2.144 movimientos no dicen qué equipo cargó el combustible. Es esperado, no un filtro roto.

### Orden y presentación de la tabla de Consumo

**El orden depende del filtro de Máquina**, porque las dos vistas responden preguntas distintas:

| Vista | Orden | Por qué |
|---|---|---|
| **Sin filtro de Máquina** (`Todas`) | **Por litros, de mayor a menor** | Es la vista general: lo que se busca es en qué se va el combustible, así que lo que más pesa va primero. Empate de litros: primero el más antiguo. |
| **Con una máquina elegida** | **Cronológico ascendente**, del más antiguo al más reciente | Ahí no se lee un ranking sino la cronología de **ese** equipo. Empate de fecha: primero la de más litros. |

Los filtros de **Mes y Tercero no cambian el orden** — solo el de Máquina.

Cada fila agrupa varios movimientos, así que para el orden cronológico **se ancla en el más viejo de los suyos**: ése define su posición.

**La tabla no tiene columna Fecha.** Una fila que agrupa movimientos de varios días no tiene una fecha que la represente, y una columna con la del primero se lee como si fuera la de todo el grupo. La fecha vive donde tiene sentido: **en el desplegable**, al lado del movimiento concreto al que pertenece. `fechaMin` queda solo como criterio de orden, sin llegar a la pantalla. Se probó la variante con columna (con el rango en el `title` cuando abarcaba varios días) y se descartó: sumaba una columna a las cinco que ya tenía la tabla para repetir un dato que el detalle ya daba mejor.

Los movimientos **dentro** del desplegable van al revés, de más reciente a más antiguo: adentro de un mismo uso interesa primero lo último que pasó.

**La barra de filtros de Combustible no lleva nota de contexto** (`.fnote`), a diferencia de Servicios y Alertas. Se quitó porque con `margin-left:auto` competía por el ancho con los tres selects y su texto era de largo variable (`"Toda la campaña · Tercero: Pablo Alberto Fernández Molinas"` vs `"Toda la campaña"`), así que **movía el ancho de los filtros en cada cambio**. Los propios selects ya dicen qué está filtrado, y el subtítulo del panel muestra el desglose por tipo de vínculo.

**Fila de Total al pie de la tabla de Consumo.** Suma lo que se está viendo con los filtros activos. Con todo en "Todas" coincide exactamente con el KPI de Consumo; con un filtro puesto (Mes, Tercero o Máquina) es el único lugar donde se lee el total de esa selección — el KPI de arriba sigue mostrando el consumo completo de la campaña, que es lo correcto para un KPI pero deja sin responder "cuánto gastó esta máquina". No es un dato nuevo ni un cálculo aparte: son los mismos valores ya sumados de las filas visibles.

**"Retiró"** es el campo `personal` de la OT: en las OT de gasoil el Contratista viene **siempre** vacío (390 de 390) y `personal` es el que registra quién cargó el combustible — el mismo criterio que ya usa el Consumo de Gasoil por Área de Servicios. Lo traen 389 de los 390 movimientos con OT. El Cultivo queda en el `title` del Lote (su texto ya incluye el lote: `"LA TERESA 211 ARROZ 26/27"`), y no se muestran Servicio ni Campo porque en estas OT el primero viene vacío y el segundo es siempre `LA TERESA`.

**Clave de agrupación**: `mes + origen + normHdr(uso)`. `normHdr` (`utils.js`) recorta, colapsa espacios repetidos e ignora mayúsculas y acentos, así que `"Logistica - UAB800"` y `"Logística - UAB800"` no aparecen como dos usos distintos; se guarda aparte el texto legible original. Sin corrección semántica ni fuzzy matching: dos observaciones que difieran en algo más que espaciado o acentos quedan separadas. El **origen entra en la clave** a propósito, para que una observación de OT nunca se fusione con un nombre de proveedor que casualmente se escriba igual.

**OT con varias líneas.** El índice devuelve **una sola** línea por `referenciaAsiento`, con regla determinista: gana la primera línea con observación no vacía; si ninguna la tiene, la primera del archivo. Nunca se concatenan observaciones. Así un movimiento de combustible no puede duplicarse por tener la OT varias líneas — verificado: 2.482 movimientos listados, 2.482 claves distintas, cero duplicados. En el dato de hoy el caso no se presenta (cada `referenciaAsiento` aparece en una única línea, y ninguna clave del índice tiene dos observaciones distintas), pero la regla queda fija.

**Detalle desplegable** (clic en la fila; `combUsoAbierto` en `render.js`, delegación de evento sobre `#combbody` en `events.js` — mismo patrón que el detalle de parcelas de la Auditoría). Las columnas cambian según el grupo, para no mostrar columnas vacías:

- **con OT**: `Fecha · OT` | `Estadio` | `Lote` | `Cultivo` | `Litros`. No se muestra "Labor" porque en estas OT el campo `servicio` viene **siempre vacío** (verificado: 340 de 340 OT vinculadas) — el `Estadio` es el dato que sí describe el trabajo. Tampoco `Campo`: es siempre `LA TERESA`.
- **sin OT**: `Fecha` | `Comprobante` | `Tipo de comprobante` | `Litros`, que es todo lo que existe.

**Nada de esto toca un cálculo.** `D.combustible` (agrupada por proveedor) se dejó **intacta**: de ella salen los KPI, el arrastre de stock y los filtros. `D.combustible_uso` es una colección nueva en paralelo que agrupa **los mismos** movimientos. Verificado: el dump completo del modelo mantiene sus 61 claves previas **idénticas byte a byte**, y la suma de la tabla cuadra con el KPI de Consumo mes por mes (479.495,89 L / 2.482 movimientos en toda la campaña). Los movimientos sin OT **no se ocultan**: siguen dentro de todos los totales.

`hectareasReales` de la OT vinculada se conserva en cada movimiento aunque hoy no se muestre, para poder calcular litros/ha más adelante sin volver a tocar el vínculo.

> **`referenciaOrigen` no sirve mejor.** Los movimientos traen también `referenciaOrigen` con el número de OT (`"2026 - OT - 1545"`), que parece un vínculo más directo. Se midió contra `consultaOT.referencia` y cubre **menos** (340 de 886 contra 359 por `referenciaAsiento`), así que se descartó.

## Insumos

Módulo separado de Combustible (pestaña propia, con sus propios datos — nunca se suman ni se mezclan con `D.combustible*`). Replica la misma estructura que Combustible (Stock Inicial → Ingreso → Consumo → Balance) pero en **cantidad real** (columna `Unidades`), **nunca en dinero**.

- Fuente: `consultaInsumos` con `tipoInsumo ≠ "COMBUSTIBLES"`, sin filtro de campaña (ver arriba).
- **Filtros dependientes**: `Tipo de Insumo` (global a la pestaña) y, dentro de él, `Insumo` (se repuebla según el tipo elegido; si el insumo seleccionado deja de pertenecer al nuevo tipo, se limpia solo a "Todos"). Ambos filtros acotan a la vez los KPIs de Stock, la tabla de Ingreso y la de Consumo.
- **Insumo = solo insumos "activos"**: el selector `Insumo` solo lista insumos con al menos un movimiento válido de Ingreso o Consumo (mismo criterio que la fila de abajo) — tener únicamente Stock Inicial **no alcanza** para aparecer en el selector (`D.insumos_por_tipo` en `data.js`, filtrado contra un Set de claves activas `tipo|nombre` normalizadas con `normHdr`). El Stock Inicial de un insumo sin Ingreso/Consumo sigue sumando al Balance (ver `insumos_stock_flujo`), simplemente no genera una opción en el filtro. Es dinámico: se recalcula en cada carga desde `consultaInsumos`, no hay lista manual.
- **Ingreso** = filas con Tipo de movimiento `"Ingreso de Mercaderia"`. **Consumo** = filas con Tipo de movimiento `"Comprobante Automático de Egreso de Stock"` (en valor absoluto — vienen en negativo). Los demás tipos de movimiento (Remisión por Venta, Egreso de Mercadería/Materia Prima, Transferencia, Ajuste, Stock Inicial/Existencia inicial) quedan fuera de ambas cifras por ahora.
- **"Afrecho de Arroz - CH" excluido por completo**: a pedido del usuario, no participa de ningún filtro/KPI/tabla del módulo. Se separa en `loader.js` (`separarInsumos()`, antes de que `data.js` construya nada) usando `INSUMOS_EXCLUIDOS` (`config.js`) — comparación normalizada (`normInsumoNombre()` en `utils.js`: `normHdr` + colapso de espacios alrededor del guion) para tolerar mayúsculas/acentos/espacios/guion sin ampliarse a otros insumos que solo compartan las palabras "arroz" o "afrecho" (ej. "Semilla de Arroz..."). Es a la vez un Tipo de Insumo y un Insumo con el mismo texto — al excluirlo, el Tipo desaparece solo (era su único insumo). Las filas excluidas se conservan crudas en `D.insumos_excluidos` solo para trazabilidad, sin usarse en ningún cálculo.
- **Stock dinámico**: como un mismo Tipo de Insumo puede mezclar unidades incompatibles entre sí (Litros, Kilos, Unidades, Dosis...), el flujo Stock Inicial → Ingreso → Consumo → Balance se calcula por separado para cada combinación **(Tipo, Insumo, Unidad)** — es la unidad mínima donde sumar/restar tiene sentido.
- **El modo "múltiples unidades" hoy no se puede alcanzar desde la interfaz.** Existe, está implementado y no se tocó, pero requiere que un insumo *seleccionable* tenga movimientos en más de una unidad, y eso hoy no ocurre. De los **2.043** insumos del flujo de stock, solo **4** tienen más de una unidad — `Cartucho de filtro`, `Filtro de aceite`, `Reten` y `Ruleman NTN`, todos de tipo `Repuestos` — y **ninguno aparece en el selector**, porque los cuatro tienen cero movimientos de Ingreso y cero de Consumo (solo Existencia Inicial), y el selector lista únicamente insumos activos (ver el punto anterior). Además su segunda unidad no es una unidad real: es `.` o `General`, un placeholder de carga (ej. `Reten`: 8 en "General" y 0 en "."). O sea que el caso no está probado en vivo por ausencia de dato, no por un problema del código.
- **Dos modos visuales mutuamente excluyentes** (`renderInsumos()` en `render.js`), para nunca sumar cantidades de unidades incompatibles en un solo total y para que nunca queden visibles ambos grupos de KPI a la vez. El modo se decide una sola vez por render, en un único punto (`determinarModoInsumos(insumoV)`), y depende **únicamente** de `#iinsumo` — el Tipo de Insumo (`#itipo`) nunca cambia cuál modo está activo, solo acota qué datos lo alimentan dentro del modo elegido. `actualizarVisibilidadInsumos(modo, insumoMultiUnidad)` es la fuente única de verdad de qué bloque se ve: alterna la clase `.hidden` (`display:none`, sin ocupar espacio) sobre los 4 bloques (`#ins-stock-kpis`, `#ins-activity-kpis`, `#ins-multi-unidad-warning`, `#ins-resumen-unidades-panel`) antes de rellenar contenido — no hay contenedor con altura reservada entre los KPIs y las tablas: cada modo usa su altura natural, así que la posición de "Ingreso de Insumos" cambia según cuánto contenido tenga el modo activo (no se estabiliza artificialmente).
  - **`summary`** (Insumo = Todos los Insumos, con Tipo de Insumo en Todos **o** en un tipo específico): 4 KPIs de actividad — Insumos con Movimiento, Unidades de Medida, Movimientos de Ingreso, Movimientos de Consumo — más el bloque **"Resumen de Cantidades por Unidad de Medida"** (una fila por cada unidad presente: Insumos, Stock Inicial, Ingreso, Consumo, Balance, cada una matemáticamente independiente, ordenadas por cantidad de insumos descendente y luego alfabéticamente por unidad — **sin fila de total general**), ubicado en el DOM **después** de las tablas de Ingreso/Consumo. Elegir un Tipo de Insumo **nunca oculta** estos KPIs: se recalculan con las filas de ese Tipo (mismo `flujoRows` ya acotado en `renderInsumos()`). No hay columna "Unidad" separada (era redundante): cada valor de Stock Inicial/Ingreso/Consumo/Balance lleva su unidad integrada (`fmtCantidadUnidad()`, ej. `1.884.427,12 Kilos`), así "Insumos" (cantidad de insumos agrupados, con tooltip aclaratorio en el encabezado) nunca se confunde con una magnitud.
  - **`specific_item`** (Insumo específico, cualquier Tipo): si el insumo resuelve a una única unidad real, los 4 KPIs tradicionales (Stock Inicial, Ingreso, Consumo, Balance) con su unidad como sufijo (`unidadUnicaDe()`/`fmtKpiUnidad()`, ej. `1.250,00 Litros`) — ocultando por completo los KPIs de actividad y el resumen general. Si el insumo igual tiene más de una unidad real (caso raro), no se suma ni se elige una arbitraria: se muestra un aviso compacto ("Este insumo tiene movimientos registrados en más de una unidad de medida.") y el mismo bloque de resumen por unidad (compartido con el modo `summary`), acotado a ese único insumo.
- **Estabilidad visual**: las tarjetas `.kpi` tienen una altura mínima fija y el valor/pie truncan con elipsis (`kpis.css`) en vez de partirse en dos líneas — así "0,00" y "88.800,00 Kilos", o un pie de filtro corto y uno largo, ocupan siempre el mismo alto de tarjeta. El texto contextual junto a los filtros (`.fnote`, hoy solo en Servicios y Alertas) trunca en una sola línea con elipsis en vez de pasar a dos líneas y aumentar el alto de la barra. **Combustible e Insumos ya no lo llevan**: con `margin-left:auto` compite por el ancho con los `select` y, al cambiar de largo con cada filtro, les movía el ancho en cada cambio. Las tablas "Ingreso de Insumos" y "Consumo de Insumos" usan altura natural (sin `min-height`): el estado vacío conserva el encabezado pero no reserva espacio de más. `.hidden` se define con `!important` (`base.css`) porque, sin eso, `.kpis{display:grid}` (cargado después en el orden de `<link>`) le gana en el cascade a un elemento con ambas clases y lo deja visible.
- **Proveedor en Consumo**: viene vacío en el 100% de los casos reales (confirmado contra los datos) — la columna se muestra igual pero **siempre vacía**, sin texto por defecto ni guion, para no sugerir un dato que no existe.
- Las tablas de Ingreso y Consumo **no muestran columna "Tipo de Insumo"** — esa info ya la da el filtro global, no hace falta repetirla por fila.
- **Columnas de Ingreso/Consumo de Insumos**: Insumo, Proveedor, **Movimientos**, **Cantidad**. "Movimientos" (antes "Registros") es la cantidad de registros agrupados, no una cantidad física — para que nunca se confunda con la columna Cantidad, ya no hay una columna "Unidad de Medida" separada: la unidad va **integrada dentro de Cantidad** (`fmtCantidadUnidad()`, `utils.js`, ej. `366.480,00 Kilos`), tomada siempre del dato real de `consultaInsumos` (nunca escrita a mano). Sin unidad real (o con el placeholder interno `(sin unidad)`) se muestra solo el número, nunca `undefined`/`null`. La agrupación (`agruparIngreso()`/`agruparConsumo()`, `data.js`) ya incluye la Unidad en su clave — un mismo insumo con movimientos en dos unidades distintas siempre aparece en filas separadas.
- `D.insumos_pendiente_modulo` guarda crudo (sin transformar) el resto de `consultaInsumos` que no entra en ninguna de las categorías anteriores.

## Alertas Operacionales

Filtro por **Estado** (`Todas` / `Pendiente` / `En Ejecución`), mismo patrón visual que los demás filtros del dashboard. Al cambiar, recalculan tanto los KPIs como la tabla de OT Atrasadas.

**Importante — "OT Pendientes" ≠ "OT Atrasadas":** el KPI "OT ATRASADAS" cuenta OT con Estado `Pendiente` **o** `En Ejecución` cuya Fecha Teórica ya pasó (comparada contra `HOY`, que es la Fecha Teórica más reciente encontrada en las OT — no la fecha real de hoy). Si alguien espera ver "1 tarea pendiente" pero el dashboard muestra más, probablemente esté comparando contra el conteo de `Estado=Pendiente` (que sí puede ser 1) en vez de contra "atrasadas" (que también suma el trabajo en ejecución demorado). El KPI separado "OT Pendientes" usa el mismo criterio `Estado=Pendiente` que el resto del dashboard, sin filtrar por atraso.

**Color de fila por días de atraso** (puramente visual, no depende del filtro de Estado): ≤7 días sin color (fila neutra), 8-15 amarillo suave, 16-30 naranja fuerte, >30 rojo intenso. El color se calcula por fila sobre el subconjunto ya filtrado por Estado, nunca al revés.

## Auditoría

Presupuesto de infraestructura (`data/presupuesto-infraestructura-26-27.json`) cruzado contra la ejecución real en `consultaOT`. Última pestaña de la barra.

**Estructura del archivo de presupuesto**: una lista de ítems, cada uno con `especificacion`, `cantidadPresupuestada`, `unidadMedida`, `costo` e `importeTotal`. `leerPresupuestoInfra()` (en `loader.js`) lo normaliza campo por campo — los números pasan por `num()` — y descarta los ítems sin `especificacion`.

**De dónde salió ese JSON.** Se generó desde `PRESUPUESTO ALISON INFRAESTRUTURA 26-27.xlsx` (hoja `INFRAESTRUTURA 26-27`), un archivo que **ya no está en el repo**, con la lógica que antes corría en el navegador: fila 3 = encabezados, filas 4-13 = los 10 ítems reales, fila 14 = TOTAL, filas 47-51 = cálculos sueltos sin relación a la tabla (se excluían). La cantidad presupuestada real sale de la columna **"PRESUPUESTO Aprob"** (col E), no de "Cant. De trabajo" (esa viene vacía en las 10 filas); las demás columnas son Especificación (C), Unidad Medida (F), Costo (G) e Importe Total sin IVA (H). Ese detalle queda documentado acá porque es lo que hay que reproducir si algún día se regenera el JSON desde un Excel actualizado.

**Cruce Especificación (presupuesto) ↔ Servicio (OT)**: no hay match de texto exacto ni parcial confiable para la mayoría de los ítems — el mapeo es **manual**, definido en `INFRA_MAP` (`config.js`), verificado ítem por ítem contra los datos reales. No se filtra por Estadio (una búsqueda amplia por palabra clave encontró trabajo real bajo varios Estadios distintos, no solo "Infraestructura") — solo por el Servicio exacto listado en `INFRA_MAP`. Ítems del presupuesto sin ningún Servicio real asociado todavía se muestran igual, con ceros, para dejar en evidencia qué falta cargar (o qué se cargó con otro nombre).

Secciones de la pestaña:
- **Puentes por Unidad**: los dos ítems de puentes (Labor Tercero / Labor Propia) se miden por **unidades** de puentes (no horas ni metros) — Servicio exacto `CONSTRUCCION PUENTE AGROVIAL` (Tercero) y `CONSTRUCCION PUENTES LABOR PROPIA` (Propia). Se cuentan por **número de OT único**, nunca por fila: una OT con varias líneas sigue siendo un solo puente. La tabla muestra **Confirmados / En Ejecución / Pendientes** por separado, pero el **% de avance usa solo los Confirmados** (`avance = confirmados / presupuestado`): una OT En Ejecución o Pendiente no es un puente construido. Los estados salen de los helpers ya existentes `esEnEjecucion()` / `esPendiente()` (`ordenes.js`), y la ampliación vive **solo en este módulo** — `CONF` y las colecciones globales no se tocan, así que Servicios, Resumen Ejecutivo, Alertas y los KPIs globales no cambian.

  > **Fila `Propia + Cedrela`**: los puentes trabajados con la retroexcavadora de Cedrela, que antes solo se veían en su propio panel. Cuenta **OT únicas** de ese servicio, igual que las otras dos filas, y **suma al total de puentes hechos** (decisión explícita del usuario). La celda de **Presupuestado va vacía** — no es 0 ni "—": el `.xlsx` de infraestructura no presupuesta este concepto (sus 10 ítems están en Unidades o Metros, ninguno en horas), y sin presupuesto propio no hay divisor, así que su % individual es `N/D`. Las cifras se leen tal cual de `D.auditoria_puentes_horas.estados`, el mismo modelo que alimenta el panel de abajo, así que las dos vistas no pueden discrepar.
  >
  > **Costo (Confirmados)** = `Costo Labor + Costo Insumo` de las OT **Confirmadas**, la misma fórmula que ya usa la sección de Gastos. Solo Confirmadas, el mismo criterio que el % de avance — y hoy además ninguna OT En Ejecución trae costo cargado. Se suma el valor propio de **cada línea**, nunca un valor de nivel OT repetido: verificado contra el `.xlsx`, las 38 OT de los tres servicios de puentes tienen **exactamente una línea cada una**, así que no hay posibilidad de duplicar.
  >
  > **`Propia` da US$ 0,00 y se muestra tal cual**, no como guion. No es un dato faltante: la hoja trae `Costo Labor` y `Costo Insumo` en **0 en las 11 OT confirmadas** de labor propia. Esconderlo detrás de un guión taparía justamente el hallazgo. Va atenuado y con un `title` que aclara que no significa que el trabajo no haya tenido costo, sino que no está cargado. Hoy: Tercero US$ 5.885,31 · Propia US$ 0,00 · Propia + Cedrela US$ 8.773,52 · **Total US$ 14.658,83**.
  >
  > **Ojo con el denominador del Total.** El presupuesto de 42 unidades cubre Tercero y Propia; Cedrela aporta confirmadas al numerador pero **ningún presupuesto al denominador**, así que el % del Total (hoy 32 de 42 = 76,2%) puede pasar de 100% si el trabajo con retro crece. No sería un error de cálculo sino lo que dice el dato: la barra se topa en 100% y el número no se recorta.
  >
  > **En Ejecución y Pendientes muestran siempre el número, incluido el `0`.** Acá un cero **no** es un dato faltante (para eso está el guion gris del resto del dashboard): es un conteo real de OT que dice "no hay ninguna en ese estado", y eso es información. Va atenuado para no competir con las cifras que sí tienen trabajo detrás, y en ámbar cuando hay OT en curso.
  >
  > La tabla cierra con una **fila de Total** que suma **las tres filas**, Cedrela incluida. Su % **no es el promedio de los porcentajes** (promediar 28,6% y 78,6% daría 53,6%, que no significa nada): es el mismo cociente que usa el modelo aplicado al total, `confirmados / presupuestados` = 32 de 42 = 76,2%.
  >
  > El % de avance lleva una **barra de magnitud** al lado del número. Es **neutra** — el teal del resto del dashboard, sin tramos de color: cuánto avance es "poco" o "suficiente" a esta altura de la campaña es una definición del negocio que nadie fijó, y un semáforo la inventaría. La barra da la escala de un vistazo; el número sigue siendo el dato.
- **Trabajo de Puentes Propia + Cedrela** (antes "Trabajo de Puentes por Horas"): `Construccion de Puentes retro excavadora x Hs` (`INFRA_PUENTES_HORAS_SERV`) del contratista `Cedrela S.A` (`INFRA_PUENTES_HORAS_CONTRATISTA`), separado por estado. Son las **horas de retroexcavadora de Cedrela que apoyan la construcción de los puentes de labor propia**. Es un trabajo de **apoyo medido en horas**: nunca es "1 OT = 1 puente", así que sus OT **no** entran en las unidades ejecutadas ni en el % de avance de la tabla anterior. Tampoco tiene presupuesto — el `.xlsx` de infraestructura no trae ninguna línea de horas para este concepto (sus 10 ítems están en Unidades o Metros), así que no lleva % de avance.

  > **El título dice "Propia + Cedrela" pero la tabla cuenta SOLO las horas de Cedrela.** Los puentes de labor propia como *unidades construidas* se cuentan arriba, en Puentes por Unidad, y no se repiten acá — una hora de retro no es un puente. Verificado contra el `.xlsx`: las 17 OT del servicio son **todas** de Cedrela, ninguna de labor propia. Los dos paneles de puentes **no llevan subtítulo** —se quitaron a pedido del usuario, eran tres renglones de texto sobre una tabla de cuatro filas—, así que esta regla vive acá y en los comentarios de `render.js`, no en pantalla.
  >
  > Cada estado se **despliega** y muestra sus OT (`Fecha · OT | Lote | Horas`), que salen de `D.auditoria_puentes_horas.ots` — el modelo ya lo traía calculado y ningún render lo leía. El filtrado por estado usa `normEstadio()`, exactamente el mismo criterio con el que el modelo armó las filas, así que el detalle nunca puede mostrar más ni menos OT que su fila. Un estado en cero no es clicable. Las OT sin horas cargadas muestran "— sin cargar", nunca `0,00 h`.

  > **El contratista real es `Cedrela S.A`**, sin punto final — verificado contra el `.xlsx`: es el único contratista del archivo cuyo nombre contiene "cedrela" y tiene las 17 OT del servicio. La comparación es **exacta** sobre el texto normalizado con `normHdr()` (tolera mayúsculas, acentos y espacios repetidos), nunca parcial ni fuzzy: `"  CEDRELA  S.A  "` entra, `"CEDRELA S.A."` (con punto) y cualquier otro contratista quedan fuera **y se avisan por consola** — se avisa, nunca se incluye solo.
  >
  > Las horas salen de `Unidades/Dosis` de las líneas en `"Horas"` (`r.esHoras`, la misma marca con que `agruparOTS` calcula `o.horas`), sumando el valor propio de cada línea — una OT con varias líneas no duplica sus horas. El **marcador `0,01` de Albor** (`INFRA_HORAS_MARCADOR_SIN_CARGAR`) no es una duración sino "horas todavía no cargadas": cuenta como **0** y la celda muestra "—" con la aclaración de cuántas OT están así, nunca `0,00 h` (que se leería como "se trabajó y dio cero"). Hoy las 4 OT En Ejecución traen exactamente ese marcador y ninguna fecha real.
- **Gastos**: muestra **un único concepto**, rotulado con `AUDITORIA_GASTO_DESALIJO` (`config.js`) = `"Desalijo Karanda'y / Carandai"` — fuente única de verdad para la etiqueta. "Construccion de Puentes retro excavadora x Hs" y "Desalijo Silo Bolsa" (Servicio real distinto, no menciona karanda/caranda) quedaron **fuera** de esta sección. El filtro (`data.js`) NO compara la frase completa contra los datos (ninguna OT la trae así) ni busca la palabra suelta "desalijo" (eso mezclaba otros trabajos): busca el **concepto puntual** dentro de Servicio/Observación de `consultaOT` — "desalijo" **junto con** "karanda"/"caranda" (normalizado con `normEstadio()`, ya existente: sin acentos/mayúsculas), que cubre las variantes reales de ortografía encontradas (karanda'y, caranda'y, karanday, karandai, karandaý...) sin ampliarse a otro trabajo. Se excluyen además las OT cuyo Servicio ya se cuenta en otra sección de Auditoría (ej. OT 3884, ya contada en "Reparacion de camino"). Verificado contra el `.xlsx`: **26 OT** coinciden (25 Confirmadas), con 99,41 horas, 878,55 litros y US$ 3.793,71 de costo — si en el futuro no hubiera ninguna coincidencia, la sección muestra el estado vacío ("Sin ejecución registrada", 0 en horas/litros/costo) en vez de mostrar otro trabajo.
- **Tabla de ítems** (el resto, sin los de puentes): Especificación, Unidad de Medida, Presupuestado, Horas Ejecutadas, OT Labor Propia, OT Labor Tercero.
- **Metros Presupuestados vs. Avance Ejecutado**: no existe en las OT ningún campo de metraje/longitud real (solo Unidades/Litros/Horas) — se muestra la cantidad de OT confirmadas como **aproximación**, rotulada como tal (nunca como metros reales ni como un % inventado). La columna de % Avance es `N/D` en **todas** las filas y lo va a seguir siendo mientras las OT no traigan metraje: la explicación vive una sola vez en el subtítulo del panel y la celda muestra el `N/D` escueto, en vez de repetir la frase entera cuatro veces. El rótulo **`aprox.`** sí se mantiene por fila — ahí no es repetición, es la advertencia de que ese número son OT contadas y no metros medidos.

## Auditoría de Insumos por Parcela

Segundo sub-módulo de la pestaña Auditoría (`js/data/auditoria.js` → `construirAuditoriaInsumosParcela()`, `renderInsumosParcela()` en `render.js`). Responde, para un lote: qué insumos se aplicaron, cuánto de cada uno, cuánto por hectárea, cuánto costaron y qué OT los originó.

**Fuente única: `consultaOT`**, sus líneas de insumo (`categoria = "Insumo"`) de OT **Confirmadas**. Es la única hoja donde cada línea de insumo ya trae, en columnas propias, la parcela completa (Campo / Lote / Zona / Actividad / Cultivo / Campaña) y las `Has. Reales` del trabajo — no hay que cruzar hojas ni interpretar texto. `consultaInsumos` **no** participa de este módulo.

> El módulo se construyó primero sobre `consultaInsumos` y se cambió a `consultaOT` a pedido del usuario. El cambio redujo el alcance (de 3.328 movimientos de stock a ~500 aplicaciones, de 2.046 insumos a ~35) pero eliminó el agujero de las hectáreas: las líneas sin superficie pasaron de 2.744 (82%) a 4.

**Validaciones hechas contra el dato real** (sobre las líneas confirmadas no combustibles): `Unidades/Dosis` coincide con `Total Aplicado` en todas; `Unidades/Dosis ÷ Has. Reales` coincide **exactamente** con la columna `dosisReales` que ya trae la hoja — o sea que la "cantidad por hectárea" que muestra el módulo es la misma dosis que registra el sistema, no una interpretación nuestra; ninguna OT trae dos valores distintos de `Has. Reales` entre sus líneas de insumo. El costo usa `Unidades/Dosis × Precio Unitario`, la misma fórmula que todo el dashboard, y **cierra al centavo** con la columna Insumos del módulo Servicios (no se usa la columna `costoInsumo` de la hoja, que difiere en ~US$ 886 por redondeos del origen: tener dos costos distintos conviviendo sería peor).

**Sin subtítulos en los paneles, sin fila de KPIs y sin nota de fuente.** Se quitaron a pedido del usuario: las cifras del módulo se leen en los paneles de abajo, que las dan desglosadas —por unidad de medida y por lote— en vez de agregadas en cuatro tarjetas. Los tres paneles —Seguimiento de Receta, Cantidad Utilizada por Unidad de Medida y Resumen por Lote— quedaron solo con su título, y el resumen de receta perdió su línea de pie. Las reglas que decían esos textos (qué hoja alimenta el módulo, las fórmulas de cantidad/costo/hectáreas, de dónde sale la receta, que las unidades nunca se suman entre sí, y que al filtrar por estado de receta los importes de cada lote siguen siendo los del lote completo) están acá y en los comentarios de `construirAuditoriaInsumosParcela` y `renderInsumosParcela`, que es donde sirven.

> Lo que **no** se quitó: el aviso de cobertura de hectáreas (`.ip-aviso`), porque es una alerta condicional y no un texto permanente —hoy no aparece porque las 517 aplicaciones tienen hectáreas—, y la cabecera del desplegable de cada lote, que identifica qué lote se abrió.

**Reglas de alcance** (`ipEsLineaInsumoAuditable()`): fuera COMBUSTIBLES (tiene su propio módulo), fuera `INSUMOS_EXCLUIDOS`, fuera movimientos ganaderos (hoy `consultaOT` no trae ninguno, pero la regla queda explícita), y **solo OT Confirmadas** — las Pendientes/En Ejecución traen el insumo previsto con costo 0 y mezclarlas sería confundir plan con ejecución.

**Actividades excluidas** (`AUDITORIA_INSUMOS_CULTIVOS_EXCLUIDOS`, `config.js`), todas por el mismo motivo: no son cultivo de renta, así que su gasto no entra en el presupuesto de insumos contra el que se audita el módulo. La comparación es **exacta** sobre el texto normalizado con `normHdr()`, nunca parcial.

- **AVENA y COBERTURA**: cultivos de servicio (cobertura de suelo entre zafras), no de renta. Efecto lateral verificado: eran los únicos que hacían aparecer un mismo lote con dos cultivos en la misma campaña (27 lotes: ARROZ+AVENA, MAIZ+COBERTURA, SORGO+COBERTURA), así que al excluirlos **cada lote queda con un solo cultivo por campaña** — por eso el módulo filtra y rotula por **Lote** y no por nombre de parcela.
- **CUIDADOS DE PATIOS SILO y CUIDADOS DE PATIOS VIVIENDA**: no son cultivo de nada, es el mantenimiento del patio del silo y del de la vivienda. Son **4 líneas y US$ 350,65** en 26/27 (herbicidas en los lotes `SILO BOLSAS` y `Patio vivienda Arrozal`), así que el costo del módulo pasa de US$ 144.088,38 a US$ 143.737,73. Efecto lateral verificado: son **exactamente las 4 aplicaciones sin hectáreas reales** del módulo, así que al sacarlas desaparece también el aviso de cobertura de hectáreas — es correcto, un patio no tiene superficie sembrada.

**Hectáreas.** Salen de `Has. Reales` de la propia línea. Las líneas de los servicios de `SERVICIOS_SIN_TRABAJO_EJECUTADO` no aportan superficie: traen `0,01` como **marcador**, no como medida (misma regla que ya aplica la columna "Trabajo Ejecutado" de Servicios). Sin esa exclusión, dividir por 0,01 daba costos por hectárea de decenas de miles de dólares que encabezaban la tabla siendo un artefacto. Verificado: las únicas líneas con `Has. Reales ≤ 0,01` son exactamente las de aplicación con mochila.

**Dos "por hectárea" distintos, rotulados aparte** para que no se lean como el mismo número mal calculado:

- el **KPI** divide por las hectáreas *trabajadas* = suma de las `Has. Reales` de las OT **distintas** (cada OT una sola vez; una misma OT aporta varias líneas de insumo y sumarlas multiplicaría la superficie);
- la **tabla** divide por la superficie del *lote* = **máximo** de las `Has. Reales` de sus OT, no la suma: varias aplicaciones se hacen sobre la misma superficie física, y sumarlas diluiría el costo por hectárea justo en los lotes más trabajados. Columna rotulada "Costo / ha del Lote".

**Qué NO tiene:** no hay comparación contra promedios de otros lotes ni umbrales de desvío inventados. Se retiraron a pedido del usuario, junto con el detalle línea por línea. Quedan los 4 KPIs, "Cantidad Utilizada por Unidad de Medida", el "Seguimiento de Receta" (abajo) y "Resumen por Lote" con su detalle desplegable por insumo — donde sigue estando la trazabilidad hasta la OT y las fechas de aplicación.

**Unidades:** cada unidad de medida se totaliza por separado (litros, kilos y unidades nunca se suman entre sí) y toda cantidad por hectárea se muestra con su unidad (`142,73 Kilos/ha`).

### Seguimiento de receta

Compara la **dosis real por hectárea** (la que ya calculaba y mostraba el módulo) contra la **dosis recomendada** de `data/recetas-insumos-26-27.json`. La lógica vive en `js/data/recetas.js`; `render.js` solo presenta — no hay ninguna fórmula de desvío ahí.

**Fuente única de la dosis real.** El valor que se compara es *exactamente* el que imprime la columna "Dosis Real" (`cantidad del insumo en el lote ÷ hectáreas del lote`, calculado una sola vez en `ipInsumosDeParcela()`). No se recalcula por otro camino: la receta **enriquece** los registros, no cambia ninguna cantidad, hectárea ni costo. Verificado con un volcado completo del modelo antes/después: `insumos_parcela` queda byte-idéntico.

**Coincidencia conservadora.** Una comparación incorrecta es peor que un "Sin receta", así que no hay coincidencia aproximada de ningún tipo. El orden es:

1. campaña + cultivo + nombre exacto normalizado contra `receta.insumo`;
2. si no hay, lo mismo contra `receta.descripcion`;
3. si no hay, un **alias declarado a mano** en `RECETAS_INSUMO_ALIAS` (`config.js`).

El alias va último a propósito: así nunca pisa una receta que ya coincide sola. Importa con el dato real — `Potasio KCL 00-00-60` existe tal cual en las recetas de MAIZ y SORGO, y con puntos en las de ARROZ; con este orden cada cultivo usa la suya y el alias solo cubre ARROZ. Hoy hay **quince** alias: dos por separador decimal (`GLIFEX GOLD 60.8` → `60,8`; `Potasio KCL 00-00-60` → `00.00.60`), `BIOSTART Zn FL Root` → `Biostar + Zn` fijando además el **grupo** `TRATAMIENTO DE SEMILLAS`, cuatro verificados uno por uno contra la fila del Excel que los define (`Glifex Full K` → `Glifex Full`, `PowerOil` → `Power Oil`, `TFP 50 FS` → `T.F.P`, `CIAMETOXAN` → `Ciametoxam`), `IOP FULL` → `Iop` **acotado a SOJA**, que es el único cultivo cuyo presupuesto lo llama así — en ARROZ, MAIZ y SORGO la receta ya dice `Iop Full` y cruza sola con su propia dosis, y el alias no debe alcanzarlos. Ese `cultivo` opcional del alias existe justamente para casos como este. El noveno es `Tafir- Oil` → `Tafir Oil`: Albor lo carga con un guion en el medio. El décimo desempata el `GLIFEX GOLD 60.8` de **SORGO**, que el presupuesto trae dos veces con dosis distintas (3 L/ha en DESECACIÓN y 0,4 L/ha en PRÉ EMERGENTES): el alias fija DESECACIÓN, respaldado por el dato — las 14 OT aplican ~3,03 L/ha y sus servicios son «Desecacion imperator» y «Fumigacion Imperator», ambos en Preparación de Suelo.

> **Prioridad entre aliases.** Un alias con `cultivo` declarado gana sobre el genérico del mismo producto, **sin depender del orden** en que estén escritos. Sin esto, el genérico `GLIFEX GOLD 60.8` → `GLIFEX GOLD 60,8` se llevaba también el caso de SORGO y el desempate por grupo nunca llegaba a aplicarse.

### Los insumos cargados con el nombre de las OT

La receta se cargó originalmente con los nombres del **presupuesto**, y `RECETAS_INSUMO_ALIAS`
(`config.js`) traduce el nombre de Albor al del presupuesto cuando difieren. Los 22 registros
agregados el **21/09/2026** —desde las hojas de agosto de ARROZ y SOJA, versión 3— van cargados
directamente con **el nombre que usa la OT**, a pedido del usuario: así cruzan sin necesidad de un
alias, y cada alias que no existe es una regla menos que mantener.

Cada uno sale de una fila concreta del presupuesto, y su nombre se verificó contra
`consultaOT.insumo` / `consultaInsumos.nombre`, no por parecido:

| Cultivo | Presupuesto dice | La OT dice | Dosis |
|---|---|---|---|
| ARROZ | `Glifotec Gold` | `Glifotec Gold` | 3 L (Desecación y Punto de Aguja) |
| ARROZ | `Fulminant top` | `Fulminant Top` | 0,15 L |
| ARROZ | `Thiamex seed` | `Thiamex Seeds GL 5L` | 0,14 L |
| ARROZ | `Promax Arrank` | `ProMax Arrank` | 0,15 L |
| ARROZ | `Cyperex` | `Cyperex 75` | 0,08 L |
| ARROZ | `Vulcano` | `VULCANO PQT` | 2 L |
| SOJA | `glifotec gold` | `Glifotec Gold` | 3 L / 1,8 kg |
| SOJA | `fascinate` | `Fascinate` | 2 L (Desecación y Pré Emergentes) |
| SOJA | `Abono 04.30.10 COFCO` | `Abono 04-30-10 COFCO` | 0,22 ton |
| SOJA | `Vibrance max- Metaflux` | `METAFLUX` | 0,075 L |
| SOJA | `Ampere Duo - Clothiex` | `Ampere Duo`, `Clothiex` | 0,1 L |
| SOJA | `Agriker seed` | `Agriker Seed` | 0,1 L |
| SOJA | `Nitropar aq azos` | `Nitropar Aq Azos` | 0,15 L |
| SOJA | tres variedades nuevas | igual que el presupuesto | 65 / 60 / 60 kg |

Dos excepciones, por falta de nombre de OT:

- **`Vizio`** (SOJA, 0,03 kg) no aparece en ninguna OT: su única huella en el dato es un movimiento
  de stock, `VIZIO - SAFLUFENACIL`. Se cargó con el nombre del presupuesto.
- **`Power Oil`** (SOJA, 2 L): Albor lo escribe `PowerOil` en 12 OT, y el alias `PowerOil → Power
  Oil` ya existía. Se cargó con el nombre del alias para no duplicar la regla.

**`Iop` pasó a llamarse `Iop Full`** en la receta de SOJA, y con eso se quitó el alias
`IOP FULL → Iop`: el presupuesto de agosto ya lo escribe igual que Albor.

Efecto sobre los 1.247 movimientos de insumo con hectáreas:

| Estado | Antes | Después |
|---|---|---|
| Sin receta | 225 | **69** |
| Bajo receta | 769 | 892 |
| Dentro de tolerancia | 180 | 186 |
| Sobre receta | 67 | 68 |
| Según receta | 6 | 6 |
| Unidad no comparable | 0 | 26 |

**Los 26 de «unidad no comparable» son un hallazgo, no una regresión.** Antes decían «Sin receta»,
que no distinguía entre *no hay presupuesto para esto* y *hay presupuesto pero está en otra unidad*.
Son dos productos del presupuesto de ARROZ que figuran en **litros** y que Albor carga en **kilos**:

```
Cyperex 75    25 movimientos · 34,70 kg sobre 500,87 ha = 0,069 kg/ha   (receta 0,08 lts)
VULCANO PQT    1 movimiento  · 26,00 kg sobre  43,87 ha = 0,593 kg/ha   (receta 2 lts)
```

Los dos son formulaciones sólidas (Pyrazosulfuron WG, Quinclorac), así que el kilo de Albor parece
el correcto y la unidad del presupuesto la equivocada. **No se cambió**: la receta es el
presupuesto, y corregir la unidad de la fuente es una decisión del usuario, no del dashboard. Hasta
entonces el módulo dice exactamente qué pasa en vez de comparar magnitudes distintas.

El `Cyperex` del presupuesto aparece en **dos grupos con dosis distintas** —0,21 L/ha en HERBICIDAS
PUNTO DE AGUJA y 0,08 en PÓS EMERGENTES—, lo que dejaría la fila en «Sin receta» por ambigüedad (ver
`resolverCandidatasReceta`). Se cargó **solo la de PÓS EMERGENTES** porque es la que el dato
respalda: las 33 líneas de Cyperex 75 de la campaña son todas del estadio **Cuidados**, a 0,055–0,070
kg/ha, y ninguna es una aplicación de punto de aguja.

### Equivalencias de campaña y cultivo

`RECETAS_EQUIVALENCIAS` (`config.js`) declara qué combinación de campaña y cultivo debe usar las recetas de otra. Hoy tiene dos entradas, ambas para la **zafriña de maíz**: en Albor se registra bajo la campaña `26` (Zafriña26) y con dos rótulos de cultivo (`MAIZ` y `MAIZ ZAFRIÑA`), pero no tiene presupuesto propio — se siembra con la misma fórmula de la hoja de MAIZ 26/27, **salvo la semilla**.

Es explícito y acotado a esas dos combinaciones: sin una entrada declarada, una campaña nunca usa las recetas de otra. La **semilla no se aliasa a propósito**: al ser el único insumo que cambia entre la campaña y la zafriña, queda en «Sin receta» en vez de compararse contra la de la 26/27.

Los cinco alias por fórmula de la zafriña (`Abono 04-30-10 COFCO`, `Kalium`, `METOMIL`, `SNIPER 40% SG`, `Urea 46-00-00`) se verificaron contra la columna Discripción del presupuesto —que es la fórmula—, no contra el parecido del nombre. Sobre la urea: el presupuesto la carga como `45.00.00` y Albor como `46-00-00`; es el mismo fertilizante (la urea es 46% de N) y la dosis real de 150,23 kg/ha coincide con los 0,15 ton/ha presupuestados.

> **El presupuesto de MAIZ se fusionó, no se reemplazó.** La hoja recibida trae la columna «Nombre Comercial» vacía en casi todas las filas, solo con el principio activo. Reemplazar el bloque habría borrado 14 nombres comerciales que ya estaban en el JSON y que son justamente los que cruzan con Albor (`Brivo`, `Alfamex`, `Rhino`, `Sniper`, `Tefluquit`…). El merge conserva todo lo anterior, agrega lo nuevo, y aborta si detecta una pérdida o un cambio de dosis.

**Recetas ambiguas.** El JSON trae el mismo producto en más de un grupo dentro del mismo cultivo. Si todas esas filas dicen la misma dosis y unidad (ARROZ `GLIFEX GOLD 60,8`: 3 L/ha en dos grupos) la receta es utilizable. Si difieren (ARROZ `Pyrazosulfuron` 0,21 vs 0,08 L/ha; ARROZ `Metomax` 0,1 kg vs 0,14 L; SORGO `Glifex gold 60,8` 3 vs 0,4 L/ha) **no se elige ninguna**: la fila queda "Sin receta" con el motivo en el tooltip. Un alias puede desempatar declarando el grupo.

**Unidades.** Solo se unifican equivalencias evidentes de la misma magnitud: `kg/kgs/Kilo(s)/Kilogramo(s)` → kg, `L/lt/lts/Litro(s)` → L, `ton/tn/Tonelada(s)` → ton. La **única conversión** permitida es `1 ton = 1000 kg` (el presupuesto carga los fertilizantes en toneladas por hectárea y las OT los descargan en kilos). Nunca se convierte entre masa y volumen ni desde/hacia `BLS`: en ese caso el estado es "Unidad no comparable" y no se calcula porcentaje. La dosis de receta se imprime con la **misma unidad que la dosis real de la fila**, para que una fila no alterne `Kilos/ha` con `kg/ha`.

**Estados.** El único juicio de valor es la **tolerancia de negocio**: `RECETA_TOLERANCIA_PCT` (`config.js`), hoy **5%**, general para todos los cultivos e insumos — cambiarla es editar esa única línea. Es **asimétrica**: solo absorbe los desvíos **hacia arriba**. Aplicar de menos queda siempre como "Bajo receta" aunque sea por poco —que el producto no haya llegado a la parcela es un hallazgo de auditoría—, mientras que pasarse hasta un 5% es variación operativa. Fuera de eso el dashboard no declara nada "correcto" ni "incorrecto": dice de qué lado quedó y cuánto.

| Estado | Cuándo |
| --- | --- |
| Sobre receta | dosis real > receta en más de la tolerancia |
| Bajo receta | dosis real < receta, **por cualquier margen** |
| Dentro de tolerancia | se aplicó de más, sin pasar de `RECETA_TOLERANCIA_PCT` (el límite exacto entra: se compara con el mismo margen de punto flotante que "Según receta", porque un +5% justo da 5,000000000000004 al dividir) |
| Según receta | iguales, con comparación numérica relativa (`RECETA_EPSILON_RELATIVO` = 1e-9, margen de punto flotante — **nunca** el valor redondeado que se muestra). Se evalúa **antes** que la tolerancia, para que "dio justo" no quede absorbido por "dio distinto pero aceptable" |
| Sin receta | no hay receta inequívoca (sin coincidencia, ambigua, o JSON no disponible) |
| Unidad no comparable | hay receta y el producto coincide, pero las unidades no son de la misma magnitud (o la receta no trae unidad) |

**Resumen y filtro.** Arriba de la tabla hay contadores por estado que reaccionan a los filtros del módulo. Se muestran **cuatro de los siete**: Con receta, Sobre receta, Dentro de tolerancia y Sin receta. **Bajo receta**, **Según receta** y **Unidad no comparable** se quitaron del resumen a pedido del usuario — los tres siguen calculándose, siguen marcándose por fila en el Resumen por Lote y siguen disponibles en el filtro Estado de Receta: lo que se quitó son sus tarjetas, no el dato.

> **Ojo al leer el resumen: las tarjetas visibles ya no suman «Con receta».** Ese contador sigue siendo la cantidad de insumos que se pudieron comparar, o sea los cuatro estados comparables (Sobre + Bajo + Dentro de tolerancia + Según), y dos de ellos ya no se ven. Se deja así a propósito: recortarlo para que cierre con lo que está en pantalla haría que el número dijera otra cosa.

**Resumen y filtro (cont.).** El filtro **Estado de Receta** se aplica *después* de agrupar, no sobre las líneas de `consultaOT`: el estado no es un dato de la línea sino el resultado de comparar la dosis del conjunto, así que filtrar líneas cambiaría esas mismas sumas y el estado se volvería circular. Acota qué lotes e insumos se listan; los importes de cada lote siguen siendo los del lote completo (el sub-título lo aclara cuando el filtro está activo). Los contadores se excluyen a sí mismos del recorte, igual que el resto de los filtros del módulo.

**Cobertura actual** — campaña 26/27 (445 insumos por lote): **412 con receta** — 58 sobre, 258 bajo, 92 dentro de tolerancia, 4 según — y **33 sin receta**. Por cultivo: SOJA y MAIZ ninguna sin receta, ARROZ 5, SORGO 24. Lo que falta ya no es cuestión de nombres, son productos que **no figuran en el presupuesto de ese cultivo**: `Triclon` en SORGO (sí está en el de ARROZ, pero nunca se aplica la receta de otro cultivo; `SPECTRO` estaba en la misma situación hasta que el usuario lo cargó al presupuesto de SORGO con 0,005 kg/ha, la misma dosis que ARROZ), `CLETOGROP` y `Snow Zero` en ARROZ, y los cuatro de mantenimiento de patios, que no son cultivos y nunca van a tener receta.

En la **zafriña 26** (33 insumos por lote): **20 con receta y 13 sin receta**. Lo que falta es la semilla —excluida a propósito— y seis productos que no figuran en el presupuesto de MAIZ con ninguna fórmula: `Eficiente 97 DF`, `BICARB ULTRA`, `Acefato Tafirel`, `Tiodicarb Tafirel`, `AZOXCY TOP` y `Tebuconazole SOMAX 43%`. Para comparar más hay que **agregar alias a mano**, nunca ampliar la coincidencia por parecido.

**Si el JSON falla:** el dashboard carga igual, la dosis real, las cantidades y los costos se muestran igual, y el panel de seguimiento avisa que no está disponible.

## Auditoría de Siembra por Parcela

Tercer sub-módulo de la pestaña Auditoría (`js/data/auditoria.js` → `construirAuditoriaSiembra()`, `renderAuditoriaSiembra()` en `render.js`). Es una auditoría **de carga**, no un indicador de gestión: dice qué hay que corregir en Albor. **No alimenta el avance, ni los costos, ni ningún KPI del dashboard.**

Cruza dos fuentes que declaran la misma superficie sembrada y que hoy no coinciden:

| Columna | De dónde sale |
|---|---|
| **Plan** | `consultaCultivos.hectareas` — la superficie de la parcela. |
| **Sembrado (OT)** | Las OT de siembra **confirmadas** de `consultaOT`. Misma fuente con que el Resumen Ejecutivo calcula el avance. |
| **Declarado (parcela)** | `consultaCultivos.hectareasSembradas`. **Ningún otro archivo del dashboard lee este campo** — entra al modelo únicamente para esta auditoría. |

### Qué OT cuentan como siembra

Los mismos criterios que el avance del Resumen Ejecutivo, para no inventar un segundo número:

- Estadio `Siembra`, **excluyendo** `SIEMBRA_SERVICIOS_NO_SIEMBRA` (tratamiento de semillas, que no es sembrar).
- Modalidad `hectareas` (`modalidadLaborOT`): las labores medidas en Horas — hoy "Pasada retro excavadora x Hs" — aparecen en el estadio Siembra pero **no acreditan superficie**.
- Solo **Confirmadas** para la superficie. Las OT de siembra abiertas se cuentan aparte y se muestran en la fila, porque son la otra explicación posible de una diferencia.

> **La superficie sale de `Unidades/Dosis`, NO de `Has. Reales`.** Es la diferencia entre medir bien y medir mal. En una siembra parcial, `Has. Reales` trae la superficie de **la parcela entera** mientras `Unidades/Dosis` trae lo que esa OT realmente sembró. Ejemplo real, lote 203: la OT 4781 declara `Has. Reales` 85,75 (todo el lote) pero `Unidades/Dosis` 1,77 — sembró 1,77 ha, no 85,75. Usar `Has. Reales` daba 5 falsos positivos.

La superficie sembrada del lote es la **suma de todas las labores de siembra**, capada al plan. Se suman, no se toma el máximo: cuando un lote tiene dos labores de siembra son dos siembras **parciales y complementarias**, no dos pasadas sobre la misma superficie. Verificado contra el `.xlsx`: en las 28 parcelas sembradas la suma de `Unidades/Dosis` **no supera el plan en ninguna**, y en los lotes terminados da exactamente el plan (lote 203: 83,98 + 1,77 = 85,75).

### Por qué el campo de la parcela queda mal

Cuando un lote se siembra en dos etapas con labores distintas ("Siembra" y "Siembra de arroz s/ implemento"), `hectareasSembradas` cuenta el lote completo **y encima le suma las hectáreas de una de las dos OT**, con lo que supera las hectáreas de la propia parcela — algo físicamente imposible.

La correlación es exacta contra el dato real, en las dos direcciones:

- Las 9 parcelas cuyo `hectareasSembradas` supera su plan son, una por una, las 9 que se sembraron en dos etapas. Ninguna otra parcela las tiene y ninguna otra tiene el problema.
- En las 9, el **exceso** (`hectareasSembradas` − plan) coincide **al centésimo** con las `Unidades/Dosis` de la OT cuyo Servicio es **"Siembra"** (no "Siembra de arroz s/ implemento").

El **exceso** de la tabla es `hectareasSembradas` − **plan** (no − sembrado): es lo que la parcela declara de más sobre su propia superficie.

| Lote | Plan | Sembrado (OT) | Declarado | Exceso s/ plan | OT "Siembra" | OT "s/ implemento" | ¿Lote terminado? |
|---|--:|--:|--:|--:|---|---|---|
| 203 | 85,75 | 85,75 | 169,73 | +83,98 | **4608** (83,98 ha) | 4781 (1,77 ha) | sí |
| 204 | 78,18 | 78,18 | 151,51 | +73,33 | **4655** (73,33 ha) | 4777 (4,85 ha) | sí |
| 205A | 71,72 | 71,72 | 141,62 | +69,90 | **4684** (69,90 ha) | 4783 (1,82 ha) | sí |
| 154 | 29,27 | 29,27 | 52,81 | +23,54 | **4760** (23,54 ha) | 4780 (5,73 ha) | sí |
| 206 | 51,15 | 51,15 | 66,08 | +14,93 | **4670** (14,93 ha) | 4779 (36,22 ha) | sí |
| 216 | 19,95 | 19,95 | 33,83 | +13,88 | **4696** (13,88 ha) | 4778 (6,07 ha) | sí |
| 211 | 32,80 | 30,81 | 45,82 | +13,02 | **4776** (13,02 ha) | 4729 (17,79 ha) | **no**, faltan 1,99 ha |
| 205D | 17,78 | 11,94 | 23,44 | +5,66 | **4689** (5,66 ha) | 4782 (6,28 ha) | **no**, faltan 5,84 ha |
| 208 | 28,55 | 10,33 | 29,98 | +1,43 | **4775** (1,43 ha) | 4704 (8,90 ha) | **no**, faltan 18,22 ha |

Las 18 OT son de Agro Continental S.A. y todas tienen fecha real 31/08/2026. Las nueve "s/ implemento" salvo dos (4704 y 4729) forman el bloque consecutivo **4775–4783**, una por lote, cargado de una sola vez.

Las nueve se parten en dos grupos, y el segundo es peor:

- **Seis lotes terminados** (203, 204, 205A, 154, 206, 216): las dos OT suman exactamente el plan, y la parcela declara *plan + la OT "Siembra"*. Es un error de suma limpio.
- **Tres lotes sin terminar** (211, 205D, 208): declaran más que su propio plan **sin haber terminado de sembrar**. El caso extremo es el **208**, que lleva 10,33 de 28,55 ha sembradas (36 %) y declara 29,98 — casi el triple de lo real.

El avance del Resumen Ejecutivo no cae en este problema porque capa cada labor al plan del lote y promedia por estadio (ver `construirCultivos` en `js/data/cultivos.js`).

### Clave de unión: cultivo + lote, nunca el lote solo

Verificado contra el `.xlsx`: **29 lotes de la 26/27 llevan dos cultivos a la vez** (el arroz y su cobertura de avena; maíz o sorgo sobre cobertura). Indexar por lote pisaba una parcela con la otra. Es la misma clave con que `construirPlanRTK` arma `RTK[cultivo][lote]`. Del lado de la OT el cultivo es el campo `actividad`.

Se descartan además las filas de `consultaCultivos` con plan ≤ 0,01 ha: son marcadores de parcelas sin superficie propia (`PARCELA`, `SECADERO`), no lotes reales.

> **Ojo con `normHdr`**: no separa el camelCase. La columna `hectareasSembradas` llega como `hectareassembradas`, todo junto — no `hectareas sembradas`.

### Diagnósticos

Se evalúan en este orden (`clasificarSiembra`); el orden importa porque "supera la parcela" es el único caso *imposible*, y por lo tanto un error de carga seguro y no una diferencia de criterio:

| Diagnóstico | Significa |
|---|---|
| **Supera la parcela** | La parcela declara más hectáreas sembradas que las que tiene. Hay que corregirlo en Albor. |
| **Sin OT de siembra** | La parcela declara siembra pero no existe ninguna OT de siembra para ese lote. |
| **OT sin confirmar** | Hay OT de siembra abiertas: hasta que no se confirmen, su superficie no se puede acreditar. Se reporta aunque los dos números den 0, porque acá el 0 no es "coincide" sino "falta cerrar". |
| **Falta cargar** | Las OT confirman siembra y la parcela sigue en cero. |
| **Coincide** | Los dos números dan lo mismo (tolerancia 0,01 ha). |
| **Difiere de la OT** | No coinciden. Puede ser siembra parcial ya cargada, o falta completarla. |

Los chips de estado reutilizan `.rc-est` del Seguimiento de Receta para no inventar un vocabulario visual nuevo: ámbar = hay que corregir, azul = falta completar, verde = coincide, gris = todavía no hay con qué comparar.

### Detalle desplegable y link a Albor

**Clic en una fila** despliega las OT que la componen, agrupadas por labor: número de OT, fecha real, contratista y hectáreas. Las OT **sin confirmar** van en su propio bloque al final — no suman superficie, pero explican por qué una parcela puede figurar corta. Mismo patrón delegado (`auditSiembraAbierta`, listener sobre `#sb-filas`) que los demás desplegables del dashboard: una fila abierta a la vez. Una parcela sin ninguna OT (hoy, el lote 13) no lleva `.sb-fila` y no responde al clic, porque no hay nada que mostrar.

Arriba de todo, en su propia barra (`#sb-acciones`), hay un botón **"Cargar hectáreas sembradas en Albor ↗"** que abre `ALBOR_CULTIVOS_URL` (`config.js`) = `https://prodato.alboragro.com/5/Cultivos`, la pantalla donde se cargan las hectáreas sembradas — o sea, donde se corrige lo que esta tabla señala. Reusa el botón de contorno `.prob-link` de Posibles Problemas para no inventar un estilo nuevo. Empezó siendo un link dentro del párrafo del aviso y **quedaba invisible**; leer la tabla y ir a corregir es la secuencia natural, así que el acceso va antes del texto, no enterrado en él. Es un link externo de sola navegación: **el dashboard no consulta la API de Albor**.

## Reorganización general (histórico)

Además de la migración de 3 CSV a un `.xlsx` único (y luego la incorporación de un segundo `.xlsx` para Auditoría) y de los módulos descritos arriba, esta es una reorganización estructural del artefacto original de un solo archivo: mismo diseño visual, sin build step, sin frameworks. Otros cambios de contenido respecto al original:
- Se retiró CSS muerto sin uso real en el HTML/JS (`.barcol`, `.bars`, `.tag-mx`, `.tag-mn`, `.cc-av`).
- Los atributos `onclick`/`onchange` del HTML se reemplazaron por `addEventListener` en `events.js` (mismo comportamiento, sin JS inline en el markup).
- La pestaña Auditoría se agregó en 2da posición y luego se movió a la última — si se vuelve a reordenar, recordar que el botón y la `<section>` viajan juntos (ver nota en "Contenido de cada carpeta").
- **Limpieza de textos redundantes** (todas las pestañas): se quitaron subtítulos y notas que repetían información ya visible en los filtros activos, en los títulos de panel o en los encabezados de tabla (ej. "Toda la campaña · Tipo · Insumo" debajo de un KPI cuando esos mismos filtros ya están seleccionados arriba) y nombres técnicos de archivo/hoja del Excel que aparecían en el encabezado principal y en un par de paneles de Auditoría. El contexto activo (mes, tipo, insumo, tercero, estado, contratista) se muestra principalmente a través de los propios controles de filtro, no repetido debajo de cada tarjeta o tabla. Las aclaraciones que evitan una mala interpretación de los datos (aproximaciones, unidades incompatibles, atrasadas vs. pendientes, etc.) se mantuvieron sin cambios.
