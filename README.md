# Dashboard Campaña 26/27 · Del Sur

Dashboard de seguimiento de campaña agrícola (Campo La Teresa). Es una web estática (HTML/CSS/JS vanilla, sin build step) que al cargar descarga tres archivos de datos publicados en este mismo repo, todos bajo **`data/`**:

- **`data/datosCampania2627.xlsx`** — 3 hojas: `consultaOT`, `consultaCultivos`, `consultaInsumos`.
- **`data/PRESUPUESTO ALISON INFRAESTRUTURA 26-27.xlsx`** — 1 hoja (`INFRAESTRUTURA 26-27`), el presupuesto de infraestructura usado en la pestaña Auditoría.
- **`data/recetas-insumos-26-27.json`** — 179 registros con la dosis por hectárea recomendada por cultivo e insumo. Es una versión **reducida** del presupuesto de insumos: solo dosis, sin costos ni volúmenes. Alimenta el seguimiento de receta de Auditoría de Insumos por Parcela.

Los dos `.xlsx` se parsean en el navegador con SheetJS; el JSON de recetas **no** pasa por SheetJS (`resp.json()`). A partir de ellos se renderizan KPIs, tablas y alertas.

> **La carpeta `data/`.** Los archivos de datos vivían en la raíz del repo y se movieron a `data/`. La ruta se arma una sola vez en `config.js` (`SRC_DATA`), de donde salen `SRC_XLSX`, `INFRA_SRC_XLSX` y `RECETAS_SRC_JSON` con sus respectivos respaldos de GitHub.

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

1. **Resumen Ejecutivo** — KPIs ejecutivos, Detalle de Etapas por Cultivo, estado de las OT, actividad operacional por mes, distribución del gasto en áreas no agrícolas y Posibles Problemas en la Campaña. Ver sección propia más abajo.
2. **Servicios** *(antes "Resumen de Gastos" — se renombró el botón, sin tocar cálculos ni ids internos)* — gasto por servicio/estadio, consumo de gasoil por área, evolución del gasto.
   > **Los rótulos visibles de este módulo usan los nombres de la OT.** El panel se llama "Detalle por Servicio" (antes "Detalle por Labor") y sus columnas son **Servicio** y **Estadio** (antes "Labor" y "Etapa"), igual que los campos `servicio` y `estadio` de `consultaOT`. Es un cambio de rótulo: no se tocaron los ids (`glabor`, `gestadio`, `gld`, `gld-sub`), ni las claves internas (`r.labor`, `r.estadio`), ni un solo cálculo. La única cadena de datos que cambió es el marcador de las OT sin estadio cargado, `'(Sin etapa)'` → `'(Sin estadio)'` (`servicios.js`), que se muestra tal cual en el filtro y en la columna. "Detalle de Etapas por Cultivo" (Resumen Ejecutivo) **no** se renombró: es otro módulo y agrupa por las cuatro etapas de `ETAPA_ORDEN`, no por el estadio crudo de la OT.
3. **Combustible** — Ingreso por proveedor, **Consumo por Uso / Detalle** (la observación de la OT que generó el movimiento), KPI de Stock Inicial (dinámico) y Balance, con arrastre mes a mes.
4. **Insumos** — Ingreso/Consumo de insumos no-combustible en **cantidad real** (nunca en dinero), con flujo de Stock dinámico y filtros dependientes Tipo de Insumo → Insumo. Ver sección propia más abajo.
5. **Control de Hectáreas** — lotes con exceso de superficie vs. RTK, OT sin correspondencia en el plan.
6. **Alertas Operacionales** — OT atrasadas, con filtro por Estado (Pendiente / En Ejecución / Todas) y color por fila según días de atraso.
7. **Auditoría** — dos sub-módulos dentro de la misma pestaña, con navegación propia: **Infraestructura** (presupuesto vs. ejecución real) e **Insumos por Parcela** (qué insumo se aplicó en cada lote, cuánto por hectárea y con qué OT). Última pestaña de la barra. Ver sección propia más abajo.

## Contenido de cada carpeta

- **`index.html`** — Markup semántico de la página (header, tabs, secciones por pestaña). No contiene estilos ni scripts inline; solo referencias a `css/` y `js/`. El orden de los botones `<button class="tab">` y de las `<section class="page">` debe coincidir 1 a 1 (`show(i, btn)` en `render.js` las empareja por posición, no por id) — mover una pestaña de lugar implica mover el botón **y** su sección juntos.
- **`css/`** — Un archivo por bloque visual, cargados en `index.html` en este orden: `base.css` (reset, variables `:root`, tipografía global, `.wrap`), `overlay.css`, `header.css`, `tabs.css`, `panel.css`, `kpis.css`, `cultivos.css`, `problemas.css`, `tables.css`, `gastos.css` (Servicios + Combustible + Insumos comparten estos estilos: `.gfilter`, `.kpis`/`.gkpis`, tablas con `.sopbar`), `alertas.css` (incluye el color de fila por días de atraso), `auditoria.css` (sub-navegación de la pestaña Auditoría y el sub-módulo Insumos por Parcela), `footer.css`.
- **`js/`** — Un módulo por responsabilidad, cargados en `index.html` en este orden (scripts clásicos con `defer`, sin módulos ES ni bundler):
  - `config.js` — constantes de la app: URLs de los tres archivos de `data/` (`SRC_DATA` + `SRC_XLSX` / `INFRA_SRC_XLSX` / `RECETAS_SRC_JSON`), nombres de hoja, catálogos de cultivos/etapas/operativas, `CAMPANIA_ACTUAL`, el mapeo manual `INFRA_MAP` (presupuesto ↔ Servicio de OT, ver sección Auditoría), y la variable de estado global `D`.
  - `utils.js` — funciones puras de formateo, parsing de números/fechas (incluye objetos `Date` nativos de SheetJS), normalización de texto, y `stockInicioDePeriodo()` — arrastre de stock mes a mes **genérico**, reutilizado tanto por Combustible como por Insumos (antes estaba escrito en línea solo para Combustible).
  - `data.js` — **orquestador** del modelo de datos. Conserva la única función pública `buildData(raw, proyecciones, insumos, presupuestoInfra, recetas)`, que ya no calcula nada: prepara las entradas, llama a las funciones de `js/data/` pasándoles explícitamente lo que necesitan, y ensambla el objeto final que consume `render.js`.
  - `js/data/` — el modelo de datos separado por dominio. Cada archivo expone funciones puras (reciben lo que necesitan por parámetro, devuelven colecciones explícitas) y **ninguno toca el DOM**:
    - `ordenes.js` — base compartida de `consultaOT`: normalización de filas, filtro por campaña (más la copia con todas las campañas que usa Servicios), agrupación por OT, modalidad de trabajo (hectáreas/horas/peso), importes, estados y KPIs de OT. Va primero porque todo lo demás depende de sus colecciones.
    - `cultivos.js` — plan RTK desde `consultaCultivos`, avance de campo por cultivo y etapa, y Control de Hectáreas (excesos, lotes inhabilitados, OT sin correspondencia en el plan).
    - `servicios.js` — módulo Servicios completo (`construirServicios()`: detalle por servicio, gasoil, filtros y totales) y el paquete equivalente por cada campaña presente en `consultaOT`.
    - `combustible.js` — consumo e ingresos de gasoil y stock inicial.
    - `insumos.js` — ingresos, consumos y flujo de stock por (Tipo, Insumo, Unidad).
    - `auditoria.js` — los dos sub-módulos de la pestaña Auditoría: Infraestructura (presupuesto vs ejecución) e Insumos por Parcela.
    - `recetas.js` — comparación de la dosis realmente aplicada por hectárea contra la receta de la campaña (`data/recetas-insumos-26-27.json`): normalización y conversión de unidades, índice de recetas, búsqueda conservadora y cálculo de desvío/estado. No lee ningún Excel.
    - `alertas.js` — OT Pendientes/En Ejecución y cuáles están atrasadas.
    - `resumen.js` — Gastos Operativos y todo `D.resumen` (KPIs, estados de OT, actividad mensual, posibles problemas). Se calcula último: reutiliza colecciones ya construidas por los demás dominios, nunca vuelve a recorrer las OT desde cero.

    **Orden de carga** (ver `index.html`): los nueve `js/data/*.js` van **antes** de `js/data.js`. Entre sí no tienen orden obligatorio (solo definen funciones, no ejecutan nada al cargarse), pero `data.js` sí tiene que ir último porque `buildData()` las invoca. `loader.js` sigue llamando a `buildData()` exactamente igual que antes.
  - `render.js` — todas las funciones que pintan el DOM (`renderAll`, `renderG`, `renderCombustible`, `renderInsumos`, `renderAlertas`, `renderAuditoria`, etc.) y el cambio de pestaña (`show`).
  - `events.js` — conecta los elementos interactivos del HTML (pestañas, selects de filtro, botón de reintento) con las funciones de `render.js`/`loader.js`. El filtro dependiente Tipo de Insumo → Insumo se resuelve acá: el `change` de `#itipo` llama primero a `actualizarFiltroInsumo()` (repuebla `#iinsumo` y limpia la selección si ya no aplica) y **después** a `renderInsumos()`.
  - `loader.js` — descarga ambos `.xlsx` y el JSON de recetas (`cargarRecetas()`), los parsea, separa `consultaInsumos` en combustible/existencia inicial/otros insumos, parsea el presupuesto de infraestructura (`leerPresupuestoInfra()`, rango fijo de filas — ver sección Auditoría), y dispara la carga inicial al terminar de cargar el DOM. Las tres descargas van en un mismo `Promise.all`, pero la del JSON de recetas **no puede tumbar la carga**: si falla, se registra en consola y devuelve `null`, y el dashboard sigue igual con el seguimiento de receta marcado como no disponible.
- **`data/`** — los archivos de datos que el dashboard descarga en runtime: `datosCampania2627.xlsx`, `PRESUPUESTO ALISON INFRAESTRUTURA 26-27.xlsx` y `recetas-insumos-26-27.json`. No hay build: se sirven tal cual desde el repo, así que actualizar los datos es commitear estos archivos.
- **`vendor/xlsx.full.min.js`** — copia sin modificar de [SheetJS](https://sheetjs.com) (`xlsx@0.18.5`), usada para leer los `.xlsx` en el navegador.

## Filtro de campaña (`CAMPANIA_ACTUAL`)

`config.js` define `const CAMPANIA_ACTUAL = '26/27'`.

**Se aplica a:**
1. **`consultaOT`** (`data.js`) — filtra por el campo `campania` exacto. Afecta a **todo** lo que depende de las OT: KPIs, Detalle de Etapas por Cultivo, Control de Hectáreas, Alertas, Posibles Problemas, Servicios, y Auditoría (todo se construye a partir de `OTS`/`rows`).
2. **`consultaCultivos`** (plan RTK, `data.js`) — esta hoja no trae una columna de texto `campania` propia, pero el campo `nombre` (ej. `"LA TERESA 201 ARROZ 26/27"`) siempre termina en el sufijo de campaña; se extrae con una regex y se descarta toda fila cuyo sufijo no coincida con `CAMPANIA_ACTUAL`. Filas sin sufijo reconocible (formato histórico) pasan sin filtrar, ya que no hay forma de determinar su campaña.

**NO se aplica a `consultaInsumos`** (ni Combustible ni el módulo Insumos): esta hoja se procesa **completa**, sin recortar por campaña ni por fecha — es una decisión explícita (antes se filtraba y se sacó a pedido), documentada en `loader.js` y `data.js`. Si el año que viene aparecen movimientos de más de una campaña mezclados ahí, van a entrar todos.

`consultaOT` puede traer varias campañas mezcladas en la práctica (la fuente a veces incluye la campaña anterior completa) — sin este filtro, todos los KPIs quedarían inflados. `data.js` loguea en consola cuántas filas se descartaron por campaña en cada carga (tanto de `consultaOT` como de `consultaCultivos`).

## Resumen Ejecutivo

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

- **Stock Inicial dinámico**: sale de `consultaInsumos`, filas con `tipoInsumo="COMBUSTIBLES"` y `tipoMovimiento="Existencia inicial"` (fechadas al 1/1). `data.js` suma estas filas **con signo** (no en valor absoluto — las filas individuales vienen con signo mixto, la suma neta es la que da el stock real de arranque) en `D.stock_inicial_combustible`.
- **Balance** = Stock Inicial + Ingreso − Consumo, acumulado mes a mes. El Stock Inicial de un mes puntual se calcula con `stockInicioDePeriodo()` (`utils.js`, genérica): stock base + todo lo ingresado/consumido en los meses **anteriores** — así el balance de cada mes sigue naturalmente al del anterior en vez de recalcularse desde cero.
- `unidades` en `consultaInsumos` viene con signo (negativo=egreso, positivo=ingreso); se normaliza a valor absoluto al separar Ingreso/Consumo en `loader.js`.

### Consumo por Uso / Detalle — vínculo con la Orden de Trabajo

La tabla de Consumo ya **no** agrupa por proveedor. Agrupa por el uso real del combustible, que sale de la OT que generó el movimiento.

**El vínculo.** Un movimiento de combustible de `consultaInsumos` trae en `referencia` el comprobante de stock que lo generó (`"2026 - STK - 10424"`); la línea de `consultaOT` que lo originó trae ese mismo comprobante en `referenciaAsiento`. La comparación es **exacta** sobre el texto recortado (`trim`), sin fuzzy matching y sin tocar números ni identificadores; las referencias vacías no son clave, son ausencia de referencia.

`construirIndiceOTPorAsiento()` (`ordenes.js`) arma el índice `referenciaAsiento → línea de OT` **una sola vez**, al construir el modelo. `construirCombustible()` recorre los movimientos una vez y busca cada referencia en ese índice: el cruce es `O(nOT + nMovimientos)`, nunca `O(nOT × nMovimientos)`, y no se repite en ningún render. `render.js` solo presenta — no hay una sola línea de cruce ahí.

> **El índice se arma con TODAS las campañas, no solo con la vigente.** A diferencia de `consultaOT`, `consultaInsumos` no se recorta por campaña (ver arriba), así que hay movimientos cuya OT pertenece a otra. De los 359 que cruzan, **23 apuntan a OT de 25/26 y 26**: recortando a `CAMPANIA_ACTUAL` se perderían esos vínculos sin ninguna razón. Se reutiliza `normalizarFilasOT()` — no existe una segunda interpretación de `consultaOT` en paralelo.

**De dónde sale el texto de Uso / Detalle**, en este orden:

| # | Situación | Uso / Detalle | Movimientos | Litros |
|---|---|---|---|---|
| 1 | OT vinculada **con** observación | `consultaOT.observaciones` | 359 | 28.507 L |
| 2 | OT vinculada **sin** observación | `Sin detalle` (`USO_SIN_DETALLE`) | 0 | 0 L |
| 3 | Sin OT, con proveedor informado | el nombre del proveedor | 1.577 | 404.722 L |
| 4 | Sin OT y sin proveedor | `Sin OT vinculada` (`USO_SIN_OT`) | 546 | 46.268 L |

Nunca se usa `consultaInsumos.observaciones` como uso: en estos movimientos dice siempre lo mismo (`"Orden de Trabajo Agrícola > Comprobante Automático de Egreso de Stock"`) y no describe nada. **`Labor Propia` desapareció como etiqueta de uso** — sigue existiendo solo como opción del filtro de Tercero (proveedor vacío), que no cambió.

> **Por qué el caso 3 conserva el nombre del proveedor.** El pedido original mandaba `Sin OT vinculada` para todo lo que no cruzara. Eso habría metido 2.123 movimientos y 450.990 L — el **94% del consumo** — en una sola fila anónima, borrando de la vista a Cedrela S.A (817 mov, 251.761 L), Agro Vial, Rafael Heisecke y el resto, que hoy sí se leen. Decisión confirmada con el usuario: se conserva el proveedor cuando existe. **No** es la vieja suposición "proveedor vacío = Labor Propia" — es un nombre que el dato sí trae. El genérico que se quería eliminar era el caso 4, y ese bucket bajó de 905 a 546 movimientos.

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
- **Estabilidad visual**: las tarjetas `.kpi` tienen una altura mínima fija y el valor/pie truncan con elipsis (`kpis.css`) en vez de partirse en dos líneas — así "0,00" y "88.800,00 Kilos", o un pie de filtro corto y uno largo, ocupan siempre el mismo alto de tarjeta. El texto contextual junto a los filtros (`.fnote`, ej. "Toda la campaña · COADYUVANTE · Agriker Aqua") trunca en una sola línea con elipsis en vez de pasar a dos líneas y aumentar el alto de la barra de filtros. Las tablas "Ingreso de Insumos" y "Consumo de Insumos" usan altura natural (sin `min-height`): el estado vacío conserva el encabezado pero no reserva espacio de más. `.hidden` se define con `!important` (`base.css`) porque, sin eso, `.kpis{display:grid}` (cargado después en el orden de `<link>`) le gana en el cascade a un elemento con ambas clases y lo deja visible.
- **Proveedor en Consumo**: viene vacío en el 100% de los casos reales (confirmado contra los datos) — la columna se muestra igual pero **siempre vacía**, sin texto por defecto ni guion, para no sugerir un dato que no existe.
- Las tablas de Ingreso y Consumo **no muestran columna "Tipo de Insumo"** — esa info ya la da el filtro global, no hace falta repetirla por fila.
- **Columnas de Ingreso/Consumo de Insumos**: Insumo, Proveedor, **Movimientos**, **Cantidad**. "Movimientos" (antes "Registros") es la cantidad de registros agrupados, no una cantidad física — para que nunca se confunda con la columna Cantidad, ya no hay una columna "Unidad de Medida" separada: la unidad va **integrada dentro de Cantidad** (`fmtCantidadUnidad()`, `utils.js`, ej. `366.480,00 Kilos`), tomada siempre del dato real de `consultaInsumos` (nunca escrita a mano). Sin unidad real (o con el placeholder interno `(sin unidad)`) se muestra solo el número, nunca `undefined`/`null`. La agrupación (`agruparIngreso()`/`agruparConsumo()`, `data.js`) ya incluye la Unidad en su clave — un mismo insumo con movimientos en dos unidades distintas siempre aparece en filas separadas.
- `D.insumos_pendiente_modulo` guarda crudo (sin transformar) el resto de `consultaInsumos` que no entra en ninguna de las categorías anteriores.

## Alertas Operacionales

Filtro por **Estado** (`Todas` / `Pendiente` / `En Ejecución`), mismo patrón visual que los demás filtros del dashboard. Al cambiar, recalculan tanto los KPIs como la tabla de OT Atrasadas.

**Importante — "OT Pendientes" ≠ "OT Atrasadas":** el KPI "OT ATRASADAS" cuenta OT con Estado `Pendiente` **o** `En Ejecución` cuya Fecha Teórica ya pasó (comparada contra `HOY`, que es la Fecha Teórica más reciente encontrada en las OT — no la fecha real de hoy). Si alguien espera ver "1 tarea pendiente" pero el dashboard muestra más, probablemente esté comparando contra el conteo de `Estado=Pendiente` (que sí puede ser 1) en vez de contra "atrasadas" (que también suma el trabajo en ejecución demorado). El KPI separado "OT Pendientes" usa el mismo criterio `Estado=Pendiente` que el resto del dashboard, sin filtrar por atraso.

**Color de fila por días de atraso** (puramente visual, no depende del filtro de Estado): ≤7 días sin color (fila neutra), 8-15 amarillo suave, 16-30 naranja fuerte, >30 rojo intenso. El color se calcula por fila sobre el subconjunto ya filtrado por Estado, nunca al revés.

## Auditoría

Presupuesto de infraestructura (`PRESUPUESTO ALISON INFRAESTRUTURA 26-27.xlsx`, hoja `INFRAESTRUTURA 26-27`) cruzado contra la ejecución real en `consultaOT`. Última pestaña de la barra.

**Estructura del archivo de presupuesto** (`leerPresupuestoInfra()` en `loader.js`, rango fijo de filas): fila 3 = encabezados, filas 4-13 = los 10 ítems reales, fila 14 = TOTAL, filas 47-51 = cálculos sueltos sin relación a la tabla (se excluyen). La cantidad presupuestada real está en la columna **"PRESUPUESTO Aprob"**, no en "Cant. De trabajo" (esa viene vacía en las 10 filas).

**Cruce Especificación (presupuesto) ↔ Servicio (OT)**: no hay match de texto exacto ni parcial confiable para la mayoría de los ítems — el mapeo es **manual**, definido en `INFRA_MAP` (`config.js`), verificado ítem por ítem contra los datos reales. No se filtra por Estadio (una búsqueda amplia por palabra clave encontró trabajo real bajo varios Estadios distintos, no solo "Infraestructura") — solo por el Servicio exacto listado en `INFRA_MAP`. Ítems del presupuesto sin ningún Servicio real asociado todavía se muestran igual, con ceros, para dejar en evidencia qué falta cargar (o qué se cargó con otro nombre).

Secciones de la pestaña:
- **Puentes por Unidad**: los dos ítems de puentes (Labor Tercero / Labor Propia) se miden por **unidades** de puentes (no horas ni metros) — Servicio exacto `CONSTRUCCION PUENTE AGROVIAL` (Tercero) y `CONSTRUCCION PUENTES LABOR PROPIA` (Propia). Se cuentan por **número de OT único**, nunca por fila: una OT con varias líneas sigue siendo un solo puente. La tabla muestra **Confirmados / En Ejecución / Pendientes** por separado, pero el **% de avance usa solo los Confirmados** (`avance = confirmados / presupuestado`): una OT En Ejecución o Pendiente no es un puente construido. Los estados salen de los helpers ya existentes `esEnEjecucion()` / `esPendiente()` (`ordenes.js`), y la ampliación vive **solo en este módulo** — `CONF` y las colecciones globales no se tocan, así que Servicios, Resumen Ejecutivo, Alertas y los KPIs globales no cambian.
- **Trabajo de Puentes por Horas**: `Construccion de Puentes retro excavadora x Hs` (`INFRA_PUENTES_HORAS_SERV`) del contratista `Cedrela S.A` (`INFRA_PUENTES_HORAS_CONTRATISTA`), separado por estado. Es un trabajo de **apoyo medido en horas**: nunca es "1 OT = 1 puente", así que sus OT **no** entran en las unidades ejecutadas ni en el % de avance de la tabla anterior. Tampoco tiene presupuesto — el `.xlsx` de infraestructura no trae ninguna línea de horas para este concepto (sus 10 ítems están en Unidades o Metros), así que no lleva % de avance.

  > **El contratista real es `Cedrela S.A`**, sin punto final — verificado contra el `.xlsx`: es el único contratista del archivo cuyo nombre contiene "cedrela" y tiene las 17 OT del servicio. La comparación es **exacta** sobre el texto normalizado con `normHdr()` (tolera mayúsculas, acentos y espacios repetidos), nunca parcial ni fuzzy: `"  CEDRELA  S.A  "` entra, `"CEDRELA S.A."` (con punto) y cualquier otro contratista quedan fuera **y se avisan por consola** — se avisa, nunca se incluye solo.
  >
  > Las horas salen de `Unidades/Dosis` de las líneas en `"Horas"` (`r.esHoras`, la misma marca con que `agruparOTS` calcula `o.horas`), sumando el valor propio de cada línea — una OT con varias líneas no duplica sus horas. El **marcador `0,01` de Albor** (`INFRA_HORAS_MARCADOR_SIN_CARGAR`) no es una duración sino "horas todavía no cargadas": cuenta como **0** y la celda muestra "—" con la aclaración de cuántas OT están así, nunca `0,00 h` (que se leería como "se trabajó y dio cero"). Hoy las 4 OT En Ejecución traen exactamente ese marcador y ninguna fecha real.
- **Gastos**: muestra **un único concepto**, rotulado con `AUDITORIA_GASTO_DESALIJO` (`config.js`) = `"Desalijo Karanda'y / Carandai"` — fuente única de verdad para la etiqueta. "Construccion de Puentes retro excavadora x Hs" y "Desalijo Silo Bolsa" (Servicio real distinto, no menciona karanda/caranda) quedaron **fuera** de esta sección. El filtro (`data.js`) NO compara la frase completa contra los datos (ninguna OT la trae así) ni busca la palabra suelta "desalijo" (eso mezclaba otros trabajos): busca el **concepto puntual** dentro de Servicio/Observación de `consultaOT` — "desalijo" **junto con** "karanda"/"caranda" (normalizado con `normEstadio()`, ya existente: sin acentos/mayúsculas), que cubre las variantes reales de ortografía encontradas (karanda'y, caranda'y, karanday, karandai, karandaý...) sin ampliarse a otro trabajo. Se excluyen además las OT cuyo Servicio ya se cuenta en otra sección de Auditoría (ej. OT 3884, ya contada en "Reparacion de camino"). Verificado contra el `.xlsx`: **26 OT** coinciden (25 Confirmadas), con 99,41 horas, 878,55 litros y US$ 3.793,71 de costo — si en el futuro no hubiera ninguna coincidencia, la sección muestra el estado vacío ("Sin ejecución registrada", 0 en horas/litros/costo) en vez de mostrar otro trabajo.
- **Tabla de ítems** (el resto, sin los de puentes): Especificación, Unidad de Medida, Presupuestado, Horas Ejecutadas, OT Labor Propia, OT Labor Tercero.
- **Metros Presupuestados vs. Avance Ejecutado**: no existe en las OT ningún campo de metraje/longitud real (solo Unidades/Litros/Horas) — se muestra la cantidad de OT confirmadas como **aproximación**, rotulada como tal (nunca como metros reales ni como un % inventado).

## Auditoría de Insumos por Parcela

Segundo sub-módulo de la pestaña Auditoría (`js/data/auditoria.js` → `construirAuditoriaInsumosParcela()`, `renderInsumosParcela()` en `render.js`). Responde, para un lote: qué insumos se aplicaron, cuánto de cada uno, cuánto por hectárea, cuánto costaron y qué OT los originó.

**Fuente única: `consultaOT`**, sus líneas de insumo (`categoria = "Insumo"`) de OT **Confirmadas**. Es la única hoja donde cada línea de insumo ya trae, en columnas propias, la parcela completa (Campo / Lote / Zona / Actividad / Cultivo / Campaña) y las `Has. Reales` del trabajo — no hay que cruzar hojas ni interpretar texto. `consultaInsumos` **no** participa de este módulo.

> El módulo se construyó primero sobre `consultaInsumos` y se cambió a `consultaOT` a pedido del usuario. El cambio redujo el alcance (de 3.328 movimientos de stock a ~500 aplicaciones, de 2.046 insumos a ~35) pero eliminó el agujero de las hectáreas: las líneas sin superficie pasaron de 2.744 (82%) a 4.

**Validaciones hechas contra el dato real** (sobre las líneas confirmadas no combustibles): `Unidades/Dosis` coincide con `Total Aplicado` en todas; `Unidades/Dosis ÷ Has. Reales` coincide **exactamente** con la columna `dosisReales` que ya trae la hoja — o sea que la "cantidad por hectárea" que muestra el módulo es la misma dosis que registra el sistema, no una interpretación nuestra; ninguna OT trae dos valores distintos de `Has. Reales` entre sus líneas de insumo. El costo usa `Unidades/Dosis × Precio Unitario`, la misma fórmula que todo el dashboard, y **cierra al centavo** con la columna Insumos del módulo Servicios (no se usa la columna `costoInsumo` de la hoja, que difiere en ~US$ 886 por redondeos del origen: tener dos costos distintos conviviendo sería peor).

**Reglas de alcance** (`ipEsLineaInsumoAuditable()`): fuera COMBUSTIBLES (tiene su propio módulo), fuera `INSUMOS_EXCLUIDOS`, fuera movimientos ganaderos (hoy `consultaOT` no trae ninguno, pero la regla queda explícita), y **solo OT Confirmadas** — las Pendientes/En Ejecución traen el insumo previsto con costo 0 y mezclarlas sería confundir plan con ejecución.

**AVENA y COBERTURA quedan fuera** (`AUDITORIA_INSUMOS_CULTIVOS_EXCLUIDOS`, `config.js`): son cultivos de servicio, no de renta. Efecto lateral verificado: eran los únicos que hacían aparecer un mismo lote con dos cultivos en la misma campaña (27 lotes: ARROZ+AVENA, MAIZ+COBERTURA, SORGO+COBERTURA), así que al excluirlos **cada lote queda con un solo cultivo por campaña** — por eso el módulo filtra y rotula por **Lote** y no por nombre de parcela.

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

**Resumen y filtro.** Arriba de la tabla hay contadores por estado que reaccionan a los filtros del módulo. El filtro **Estado de Receta** se aplica *después* de agrupar, no sobre las líneas de `consultaOT`: el estado no es un dato de la línea sino el resultado de comparar la dosis del conjunto, así que filtrar líneas cambiaría esas mismas sumas y el estado se volvería circular. Acota qué lotes e insumos se listan; los importes de cada lote siguen siendo los del lote completo (el sub-título lo aclara cuando el filtro está activo). Los contadores se excluyen a sí mismos del recorte, igual que el resto de los filtros del módulo.

**Cobertura actual** — campaña 26/27 (445 insumos por lote): **412 con receta** — 58 sobre, 258 bajo, 92 dentro de tolerancia, 4 según — y **33 sin receta**. Por cultivo: SOJA y MAIZ ninguna sin receta, ARROZ 5, SORGO 24. Lo que falta ya no es cuestión de nombres, son productos que **no figuran en el presupuesto de ese cultivo**: `Triclon` y `SPECTRO` en SORGO (sí están en el de ARROZ, pero nunca se aplica la receta de otro cultivo), `CLETOGROP` y `Snow Zero` en ARROZ, y los cuatro de mantenimiento de patios, que no son cultivos y nunca van a tener receta.

En la **zafriña 26** (33 insumos por lote): **20 con receta y 13 sin receta**. Lo que falta es la semilla —excluida a propósito— y seis productos que no figuran en el presupuesto de MAIZ con ninguna fórmula: `Eficiente 97 DF`, `BICARB ULTRA`, `Acefato Tafirel`, `Tiodicarb Tafirel`, `AZOXCY TOP` y `Tebuconazole SOMAX 43%`. Para comparar más hay que **agregar alias a mano**, nunca ampliar la coincidencia por parecido.

**Si el JSON falla:** el dashboard carga igual, la dosis real, las cantidades y los costos se muestran igual, y el panel de seguimiento avisa que no está disponible.

## Reorganización general (histórico)

Además de la migración de 3 CSV a un `.xlsx` único (y luego la incorporación de un segundo `.xlsx` para Auditoría) y de los módulos descritos arriba, esta es una reorganización estructural del artefacto original de un solo archivo: mismo diseño visual, sin build step, sin frameworks. Otros cambios de contenido respecto al original:
- Se retiró CSS muerto sin uso real en el HTML/JS (`.barcol`, `.bars`, `.tag-mx`, `.tag-mn`, `.cc-av`).
- Los atributos `onclick`/`onchange` del HTML se reemplazaron por `addEventListener` en `events.js` (mismo comportamiento, sin JS inline en el markup).
- La pestaña Auditoría se agregó en 2da posición y luego se movió a la última — si se vuelve a reordenar, recordar que el botón y la `<section>` viajan juntos (ver nota en "Contenido de cada carpeta").
- **Limpieza de textos redundantes** (todas las pestañas): se quitaron subtítulos y notas que repetían información ya visible en los filtros activos, en los títulos de panel o en los encabezados de tabla (ej. "Toda la campaña · Tipo · Insumo" debajo de un KPI cuando esos mismos filtros ya están seleccionados arriba) y nombres técnicos de archivo/hoja del Excel que aparecían en el encabezado principal y en un par de paneles de Auditoría. El contexto activo (mes, tipo, insumo, tercero, estado, contratista) se muestra principalmente a través de los propios controles de filtro, no repetido debajo de cada tarjeta o tabla. Las aclaraciones que evitan una mala interpretación de los datos (aproximaciones, unidades incompatibles, atrasadas vs. pendientes, etc.) se mantuvieron sin cambios.
