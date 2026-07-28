# Dashboard Campaña 26/27 · Del Sur

Dashboard de seguimiento de campaña agrícola (Campo La Teresa). Es una web estática (HTML/CSS/JS vanilla, sin build step) que al cargar descarga dos `.xlsx` publicados en este mismo repo:

- **`datosCampania2627.xlsx`** — 3 hojas: `consultaOT`, `consultaCultivos`, `consultaInsumos`.
- **`PRESUPUESTO ALISON INFRAESTRUTURA 26-27.xlsx`** — 1 hoja (`INFRAESTRUTURA 26-27`), el presupuesto de infraestructura usado en la pestaña Auditoría.

Ambos se parsean en el navegador con SheetJS y a partir de ellos se renderizan KPIs, tablas y alertas.

## Cómo arrancar un servidor local

El navegador bloquea `fetch()` sobre `file://`, así que hay que servir la carpeta por HTTP. Cualquiera de estas opciones funciona (parado en la carpeta del proyecto):

```bash
python -m http.server 8080
```

```bash
npx serve .
```

Luego abrir `http://localhost:8080` (o el puerto que indique el comando).

Como la app depende de internet (descarga ambos `.xlsx` desde `raw.githubusercontent.com` en tiempo real, con `cache:'no-store'` para no servir una copia vieja del navegador), hace falta conexión activa para ver datos; sin conexión se muestra la pantalla de error con reintento.

**⚠️ Editar el Excel no alcanza:** el dashboard lee los `.xlsx` desde GitHub (`raw.githubusercontent.com/Andresleetter/analisisCostos2627/main/...`), no el archivo local. Después de editar `datosCampania2627.xlsx` (o el presupuesto de infraestructura) en Excel hay que **commitear y pushear** ese archivo al repo — si no, el sitio en vivo sigue mostrando los datos del último commit, aunque el Excel local ya esté actualizado. No hay ningún paso de build/bundle intermedio (sitio 100% estático); el único requisito es que el archivo llegue a `main` en GitHub.

Si el archivo está abierto en Excel al momento de necesitar inspeccionarlo (ej. para depurar), Excel lo bloquea para lectura exclusiva — hay que copiarlo primero con `FileShare.ReadWrite` (o cerrarlo) antes de poder leerlo desde otro proceso.

## Pestañas del dashboard

1. **Resumen Ejecutivo** — KPIs ejecutivos, Detalle de Etapas por Cultivo, estado de las OT, actividad operacional por mes, distribución del gasto en áreas no agrícolas y Posibles Problemas en la Campaña. Ver sección propia más abajo.
2. **Servicios** *(antes "Resumen de Gastos" — se renombró el botón, sin tocar cálculos ni ids internos)* — gasto por labor/etapa, consumo de gasoil por área, evolución del gasto.
3. **Combustible** — Ingreso/Consumo de combustible por tercero, KPI de Stock Inicial (dinámico) y Balance, con arrastre mes a mes.
4. **Insumos** — Ingreso/Consumo de insumos no-combustible en **cantidad real** (nunca en dinero), con flujo de Stock dinámico y filtros dependientes Tipo de Insumo → Insumo. Ver sección propia más abajo.
5. **Control de Hectáreas** — lotes con exceso de superficie vs. RTK, OT sin correspondencia en el plan.
6. **Alertas Operacionales** — OT atrasadas, con filtro por Estado (Pendiente / En Ejecución / Todas) y color por fila según días de atraso.
7. **Auditoría** — presupuesto de infraestructura vs. ejecución real (OT). Última pestaña de la barra. Ver sección propia más abajo.

## Contenido de cada carpeta

- **`index.html`** — Markup semántico de la página (header, tabs, secciones por pestaña). No contiene estilos ni scripts inline; solo referencias a `css/` y `js/`. El orden de los botones `<button class="tab">` y de las `<section class="page">` debe coincidir 1 a 1 (`show(i, btn)` en `render.js` las empareja por posición, no por id) — mover una pestaña de lugar implica mover el botón **y** su sección juntos.
- **`css/`** — Un archivo por bloque visual, cargados en `index.html` en este orden: `base.css` (reset, variables `:root`, tipografía global, `.wrap`), `overlay.css`, `header.css`, `tabs.css`, `panel.css`, `kpis.css`, `cultivos.css`, `problemas.css`, `tables.css`, `gastos.css` (Servicios + Combustible + Insumos comparten estos estilos: `.gfilter`, `.kpis`/`.gkpis`, tablas con `.minibar`), `alertas.css` (incluye el color de fila por días de atraso), `footer.css`.
- **`js/`** — Un módulo por responsabilidad, cargados en `index.html` en este orden (scripts clásicos con `defer`, sin módulos ES ni bundler):
  - `config.js` — constantes de la app: URLs de ambos `.xlsx`, nombres de hoja, catálogos de cultivos/etapas/operativas, `CAMPANIA_ACTUAL`, el mapeo manual `INFRA_MAP` (presupuesto ↔ Servicio de OT, ver sección Auditoría), y la variable de estado global `D`.
  - `utils.js` — funciones puras de formateo, parsing de números/fechas (incluye objetos `Date` nativos de SheetJS), normalización de texto, y `stockInicioDePeriodo()` — arrastre de stock mes a mes **genérico**, reutilizado tanto por Combustible como por Insumos (antes estaba escrito en línea solo para Combustible).
  - `data.js` — `buildData()`: toma las hojas ya parseadas y construye todo el modelo de datos del dashboard (KPIs, cultivos, hectáreas, alertas, Servicios, Combustible, Insumos, Auditoría).
  - `render.js` — todas las funciones que pintan el DOM (`renderAll`, `renderG`, `renderCombustible`, `renderInsumos`, `renderAlertas`, `renderAuditoria`, etc.) y el cambio de pestaña (`show`).
  - `events.js` — conecta los elementos interactivos del HTML (pestañas, selects de filtro, botón de reintento) con las funciones de `render.js`/`loader.js`. El filtro dependiente Tipo de Insumo → Insumo se resuelve acá: el `change` de `#itipo` llama primero a `actualizarFiltroInsumo()` (repuebla `#iinsumo` y limpia la selección si ya no aplica) y **después** a `renderInsumos()`.
  - `loader.js` — descarga ambos `.xlsx`, los parsea con SheetJS, separa `consultaInsumos` en combustible/existencia inicial/otros insumos, parsea el presupuesto de infraestructura (`leerPresupuestoInfra()`, rango fijo de filas — ver sección Auditoría), y dispara la carga inicial al terminar de cargar el DOM.
- **`vendor/xlsx.full.min.js`** — copia sin modificar de [SheetJS](https://sheetjs.com) (`xlsx@0.18.5`), usada para leer los `.xlsx` en el navegador.

## Filtro de campaña (`CAMPANIA_ACTUAL`)

`config.js` define `const CAMPANIA_ACTUAL = '26/27'`.

**Se aplica a:**
1. **`consultaOT`** (`data.js`) — filtra por el campo `campania` exacto. Afecta a **todo** lo que depende de las OT: KPIs, Detalle de Etapas por Cultivo, Control de Hectáreas, Alertas, Posibles Problemas, Servicios, y Auditoría (todo se construye a partir de `OTS`/`rows`).
2. **`consultaCultivos`** (plan RTK, `data.js`) — esta hoja no trae una columna de texto `campania` propia, pero el campo `nombre` (ej. `"LA TERESA 201 ARROZ 26/27"`) siempre termina en el sufijo de campaña; se extrae con una regex y se descarta toda fila cuyo sufijo no coincida con `CAMPANIA_ACTUAL`. Filas sin sufijo reconocible (formato histórico) pasan sin filtrar, ya que no hay forma de determinar su campaña.

**NO se aplica a `consultaInsumos`** (ni Combustible ni el módulo Insumos): esta hoja se procesa **completa**, sin recortar por campaña ni por fecha — es una decisión explícita (antes se filtraba y se sacó a pedido), documentada en `loader.js` y `data.js`. Si el año que viene aparecen movimientos de más de una campaña mezclados ahí, van a entrar todos.

`consultaOT` puede traer varias campañas mezcladas en la práctica (la fuente a veces incluye la campaña anterior completa) — sin este filtro, todos los KPIs quedarían inflados. `data.js` loguea en consola cuántas filas se descartaron por campaña en cada carga (tanto de `consultaOT` como de `consultaCultivos`).

## Resumen Ejecutivo

Vista gerencial: `D.resumen` (`data.js`, calculado una sola vez dentro de `buildData()`) alimenta todos los componentes; `render.js` solo pinta, no recalcula.

Orden de la pestaña, de arriba hacia abajo:
1. **KPIs ejecutivos** (`#exec-kpis`, `renderResumenKPIs()`) — **solo 4**, operativos/financieros generales: OT Confirmadas, OT Atrasadas (misma definición exacta que Alertas Operacionales), Costo Ejecutado y Gasto No Agrícola. Cada tarjeta usa un acento de color a la izquierda (`.kpi-g/-y/-o/-r/-gris`) en vez de pintar toda la tarjeta; en escritorio ocupan una sola fila (grilla de 4 columnas, heredada de `.kpis`), 2 por fila en pantallas medianas y apiladas en 1 columna en pantallas muy angostas (`.kpis-exec`, `resumen.css`). **Ya no existen** los KPIs generales de superficie (Hectáreas Planificadas/Ejecutadas/Pendientes, Avance General) — esa información se retiró de esta fila a pedido del usuario porque duplicaba, como un total de campaña, lo que ya se puede leer con más contexto en "Detalle de Etapas por Cultivo".
2. **Detalle de Etapas por Cultivo** (`#cults`, `renderCultivoDetalle()`) — primer bloque analítico tras los KPIs (sin gráficos intermedios): por cada cultivo, el progreso de Preparación de Suelo/Siembra/Cuidados/Cosecha, y — para el **estadio actual** (el más reciente con actividad confirmada) — Ha Planificadas (el plan RTK no tiene desglose por estadio, así que es siempre la meta de toda la campaña), Ha Ejecutadas y OT Confirmadas/Totales, los tres **del mismo estadio**, nunca mezclados con otro (`c.etapas[].ha_plan/otConfirmadas/otTotales` en `data.js`). Sin ninguna etapa reconocida todavía, se muestra 0 ha / 0 de las OT totales del cultivo, junto con el mensaje "Sin actividad confirmada aún".
3. **Estado de las Órdenes de Trabajo** (`#resumen-estados-ot`, `renderEstadosOT()`) — barra apilada + leyenda con las categorías reales de `Estado` en `consultaOT` (Confirmado/En Ejecución/Pendiente); cualquier otro valor real se agrupa como "Otros" con el detalle de qué estados incluye, nunca oculto.
4. **Actividad Operacional por Período** (`#resumen-actividad-mensual`, `renderActividadMensual()`) — columnas con la cantidad de OT Confirmadas por mes (Fecha Real); se rotula explícitamente como "OT" para no confundirse con hectáreas (no todas las OT traen Has. Reales).
5. **Distribución del Gasto: Áreas No Agrícolas** (`#resumen-gasto`, `renderDistribucionGasto()`) — barras horizontales sobre `D.operativas` (mismo cálculo que ya usaba esta sección, ver `OPERATIVAS` en `config.js`), sin duplicar el cálculo.
6. **Posibles Problemas en la Campaña** (`#probs`, `renderProblemasResumen()`) — alertas dinámicas con severidad (`critica`/`alta`/`media`/`informativa`, colores `.prob-r/-o/-y/-gris`), ordenadas por severidad y luego por impacto. Reglas: OT atrasadas (misma lógica de Alertas Operacionales), cultivos con avance por debajo del promedio de campaña (desviación relativa, nunca un "atraso agronómico" confirmado), superficie ejecutada por encima del plan, OT sin correspondencia en el plan RTK, cultivos planificados sin ejecución registrada, concentración elevada del gasto en una sola labor, y datos incompletos (OT sin Actividad o sin Fecha Teórica). Los botones "Ver detalle" navegan a la pestaña correspondiente reutilizando `show()` (delegación de evento en `events.js`, sin `onclick` inline). Sin problemas detectados, se muestra un estado positivo explícito, nunca la sección vacía.

## Combustible

- **Stock Inicial dinámico**: sale de `consultaInsumos`, filas con `tipoInsumo="COMBUSTIBLES"` y `tipoMovimiento="Existencia inicial"` (fechadas al 1/1). `data.js` suma estas filas **con signo** (no en valor absoluto — las filas individuales vienen con signo mixto, la suma neta es la que da el stock real de arranque) en `D.stock_inicial_combustible`.
- **Balance** = Stock Inicial + Ingreso − Consumo, acumulado mes a mes. El Stock Inicial de un mes puntual se calcula con `stockInicioDePeriodo()` (`utils.js`, genérica): stock base + todo lo ingresado/consumido en los meses **anteriores** — así el balance de cada mes sigue naturalmente al del anterior en vez de recalcularse desde cero.
- `unidades` en `consultaInsumos` viene con signo (negativo=egreso, positivo=ingreso); se normaliza a valor absoluto al separar Ingreso/Consumo en `loader.js`.

## Insumos

Módulo separado de Combustible (pestaña propia, con sus propios datos — nunca se suman ni se mezclan con `D.combustible*`). Replica la misma estructura que Combustible (Stock Inicial → Ingreso → Consumo → Balance) pero en **cantidad real** (columna `Unidades`), **nunca en dinero**.

- Fuente: `consultaInsumos` con `tipoInsumo ≠ "COMBUSTIBLES"`, sin filtro de campaña (ver arriba).
- **Filtros dependientes**: `Tipo de Insumo` (global a la pestaña) y, dentro de él, `Insumo` (se repuebla según el tipo elegido; si el insumo seleccionado deja de pertenecer al nuevo tipo, se limpia solo a "Todos"). Ambos filtros acotan a la vez los KPIs de Stock, la tabla de Ingreso y la de Consumo.
- **Insumo = solo insumos "activos"**: el selector `Insumo` solo lista insumos con al menos un movimiento válido de Ingreso o Consumo (mismo criterio que la fila de abajo) — tener únicamente Stock Inicial **no alcanza** para aparecer en el selector (`D.insumos_por_tipo` en `data.js`, filtrado contra un Set de claves activas `tipo|nombre` normalizadas con `normHdr`). El Stock Inicial de un insumo sin Ingreso/Consumo sigue sumando al Balance (ver `insumos_stock_flujo`), simplemente no genera una opción en el filtro. Es dinámico: se recalcula en cada carga desde `consultaInsumos`, no hay lista manual.
- **Ingreso** = filas con Tipo de movimiento `"Ingreso de Mercaderia"`. **Consumo** = filas con Tipo de movimiento `"Comprobante Automático de Egreso de Stock"` (en valor absoluto — vienen en negativo). Los demás tipos de movimiento (Remisión por Venta, Egreso de Mercadería/Materia Prima, Transferencia, Ajuste, Stock Inicial/Existencia inicial) quedan fuera de ambas cifras por ahora.
- **"Afrecho de Arroz - CH" excluido por completo**: a pedido del usuario, no participa de ningún filtro/KPI/tabla del módulo. Se separa en `loader.js` (`separarInsumos()`, antes de que `data.js` construya nada) usando `INSUMOS_EXCLUIDOS` (`config.js`) — comparación normalizada (`normInsumoNombre()` en `utils.js`: `normHdr` + colapso de espacios alrededor del guion) para tolerar mayúsculas/acentos/espacios/guion sin ampliarse a otros insumos que solo compartan las palabras "arroz" o "afrecho" (ej. "Semilla de Arroz..."). Es a la vez un Tipo de Insumo y un Insumo con el mismo texto — al excluirlo, el Tipo desaparece solo (era su único insumo). Las filas excluidas se conservan crudas en `D.insumos_excluidos` solo para trazabilidad, sin usarse en ningún cálculo.
- **Stock dinámico**: como un mismo Tipo de Insumo puede mezclar unidades incompatibles entre sí (Litros, Kilos, Unidades, Dosis...), el flujo Stock Inicial → Ingreso → Consumo → Balance se calcula por separado para cada combinación **(Tipo, Insumo, Unidad)** — es la unidad mínima donde sumar/restar tiene sentido.
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
- **Puentes por Unidad**: los dos ítems de puentes (Labor Tercero / Labor Propia) se miden por **unidades** de puentes (no horas ni metros) — Servicio exacto `CONSTRUCCION PUENTE AGROVIAL` (Tercero) y `CONSTRUCCION PUENTES LABOR PROPIA` (Propia). Ejecutadas = OT **Confirmadas** con ese Servicio exacto.
- **Gastos**: muestra **un único concepto**, rotulado con `AUDITORIA_GASTO_DESALIJO` (`config.js`) = `"Desalijo Karanda'y / Carandai"` — fuente única de verdad para la etiqueta. "Construccion de Puentes retro excavadora x Hs" y "Desalijo Silo Bolsa" (Servicio real distinto, no menciona karanda/caranda) quedaron **fuera** de esta sección. El filtro (`data.js`) NO compara la frase completa contra los datos (ninguna OT la trae así) ni busca la palabra suelta "desalijo" (eso mezclaba otros trabajos): busca el **concepto puntual** dentro de Servicio/Observación de `consultaOT` — "desalijo" **junto con** "karanda"/"caranda" (normalizado con `normEstadio()`, ya existente: sin acentos/mayúsculas), que cubre las variantes reales de ortografía encontradas (karanda'y, caranda'y, karanday, karandai, karandaý...) sin ampliarse a otro trabajo. Se excluyen además las OT cuyo Servicio ya se cuenta en otra sección de Auditoría (ej. OT 3884, ya contada en "Reparacion de camino"). Verificado contra el `.xlsx`: **26 OT** coinciden (25 Confirmadas), con 99,41 horas, 878,55 litros y US$ 3.793,71 de costo — si en el futuro no hubiera ninguna coincidencia, la sección muestra el estado vacío ("Sin ejecución registrada", 0 en horas/litros/costo) en vez de mostrar otro trabajo.
- **Tabla de ítems** (el resto, sin los de puentes): Especificación, Unidad de Medida, Presupuestado, Horas Ejecutadas, OT Labor Propia, OT Labor Tercero.
- **Metros Presupuestados vs. Avance Ejecutado**: no existe en las OT ningún campo de metraje/longitud real (solo Unidades/Litros/Horas) — se muestra la cantidad de OT confirmadas como **aproximación**, rotulada como tal (nunca como metros reales ni como un % inventado).

## Reorganización general (histórico)

Además de la migración de 3 CSV a un `.xlsx` único (y luego la incorporación de un segundo `.xlsx` para Auditoría) y de los módulos descritos arriba, esta es una reorganización estructural del artefacto original de un solo archivo: mismo diseño visual, sin build step, sin frameworks. Otros cambios de contenido respecto al original:
- Se retiró CSS muerto sin uso real en el HTML/JS (`.barcol`, `.bars`, `.tag-mx`, `.tag-mn`, `.cc-av`).
- Los atributos `onclick`/`onchange` del HTML se reemplazaron por `addEventListener` en `events.js` (mismo comportamiento, sin JS inline en el markup).
- La pestaña Auditoría se agregó en 2da posición y luego se movió a la última — si se vuelve a reordenar, recordar que el botón y la `<section>` viajan juntos (ver nota en "Contenido de cada carpeta").
- **Limpieza de textos redundantes** (todas las pestañas): se quitaron subtítulos y notas que repetían información ya visible en los filtros activos, en los títulos de panel o en los encabezados de tabla (ej. "Toda la campaña · Tipo · Insumo" debajo de un KPI cuando esos mismos filtros ya están seleccionados arriba) y nombres técnicos de archivo/hoja del Excel que aparecían en el encabezado principal y en un par de paneles de Auditoría. El contexto activo (mes, tipo, insumo, tercero, estado, contratista) se muestra principalmente a través de los propios controles de filtro, no repetido debajo de cada tarjeta o tabla. Las aclaraciones que evitan una mala interpretación de los datos (aproximaciones, unidades incompatibles, atrasadas vs. pendientes, etc.) se mantuvieron sin cambios.
