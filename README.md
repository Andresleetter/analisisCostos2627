# Dashboard Campaña 26/27 · Del Sur

Dashboard de seguimiento de campaña agrícola (Campo La Teresa). Es una web estática (HTML/CSS/JS vanilla, sin build step) que al cargar descarga un único `.xlsx` publicado en este mismo repo (`datosCampania2627.xlsx`, con 3 hojas: `consultaOT`, `consultaCultivos`, `consultaInsumos`), lo parsea en el navegador con SheetJS y renderiza KPIs, tablas y alertas a partir de ellos.

## Cómo arrancar un servidor local

El navegador bloquea `fetch()` sobre `file://`, así que hay que servir la carpeta por HTTP. Cualquiera de estas opciones funciona (parado en la carpeta del proyecto):

```bash
python -m http.server 8080
```

```bash
npx serve .
```

Luego abrir `http://localhost:8080` (o el puerto que indique el comando).

Como la app depende de internet (descarga el `.xlsx` desde `raw.githubusercontent.com` en tiempo real, con `cache:'no-store'` para no servir una copia vieja del navegador), hace falta conexión activa para ver datos; sin conexión se muestra la pantalla de error con reintento.

**⚠️ Editar el Excel no alcanza:** el dashboard lee el `.xlsx` desde GitHub (`raw.githubusercontent.com/Andresleetter/analisisCostos2627/main/datosCampania2627.xlsx`), no el archivo local. Después de editar `datosCampania2627.xlsx` en Excel hay que **commitear y pushear** ese archivo al repo — si no, el sitio en vivo sigue mostrando los datos del último commit, aunque el Excel local ya esté actualizado. No hay ningún paso de build/bundle intermedio (sitio 100% estático); el único requisito es que el archivo llegue a `main` en GitHub.

## Pestañas del dashboard

1. **Resumen Ejecutivo** — avance por cultivo vs. plan RTK, KPIs generales, Problemas Detectados, distribución del gasto en áreas no agrícolas.
2. **Servicios** *(antes "Resumen de Gastos" — se renombró el botón, sin tocar cálculos ni ids internos)* — gasto por labor/etapa, consumo de gasoil por área, evolución del gasto.
3. **Combustible** — Ingreso/Consumo de combustible por tercero, KPI de Stock Inicial (dinámico) y Balance.
4. **Insumos** — gasto en insumos no-combustible (fertilizantes, agroquímicos, etc.), independiente de Combustible.
5. **Control de Hectáreas** — lotes con exceso de superficie vs. RTK, OT sin correspondencia en el plan.
6. **Alertas Operacionales** — OT atrasadas, con filtro por Estado (Pendiente / En Ejecución / Todas).

## Contenido de cada carpeta

- **`index.html`** — Markup semántico de la página (header, tabs, secciones por pestaña). No contiene estilos ni scripts inline; solo referencias a `css/` y `js/`.
- **`css/`** — Un archivo por bloque visual, cargados en `index.html` en este orden: `base.css` (reset, variables `:root`, tipografía global, `.wrap`), `overlay.css`, `header.css`, `tabs.css`, `panel.css`, `kpis.css`, `cultivos.css`, `problemas.css`, `tables.css`, `gastos.css` (Servicios + Combustible + Insumos comparten estos estilos: `.gfilter`, `.kpis`/`.gkpis`, tablas con `.minibar`), `alertas.css`, `footer.css`.
- **`js/`** — Un módulo por responsabilidad, cargados en `index.html` en este orden (scripts clásicos con `defer`, sin módulos ES ni bundler):
  - `config.js` — constantes de la app: URL del `.xlsx`, nombres de hoja, catálogos de cultivos/etapas/operativas, `CAMPANIA_ACTUAL` (ver más abajo), y la variable de estado global `D`.
  - `utils.js` — funciones puras de formateo, parsing de números/fechas (incluye objetos `Date` nativos de SheetJS) y normalización de texto.
  - `data.js` — `buildData()`: toma las 3 hojas ya parseadas y construye todo el modelo de datos del dashboard (KPIs, cultivos, hectáreas, alertas, Servicios, Combustible, Insumos).
  - `render.js` — todas las funciones que pintan el DOM (`renderAll`, `renderG`, `renderCombustible`, `renderInsumos`, `renderAlertas`, etc.) y el cambio de pestaña (`show`).
  - `events.js` — conecta los elementos interactivos del HTML (pestañas, selects de filtro, botón de reintento) con las funciones de `render.js`/`loader.js`.
  - `loader.js` — descarga el `.xlsx`, lo parsea con SheetJS, separa `consultaInsumos` en combustible/existencia inicial/otros insumos, y dispara la carga inicial al terminar de cargar el DOM.
- **`vendor/xlsx.full.min.js`** — copia sin modificar de [SheetJS](https://sheetjs.com) (`xlsx@0.18.5`), usada para leer el `.xlsx` en el navegador.

## Filtro de campaña (`CAMPANIA_ACTUAL`)

`config.js` define `const CAMPANIA_ACTUAL = '26/27'`. Se usa en exactamente 3 lugares (buscar `CAMPANIA_ACTUAL` para ubicarlos):

1. **`data.js`**, al construir `raw` desde `consultaOT` — filtra por el campo `campania`. Esto afecta a **todo** lo que depende de las OT: KPIs, Avance por Cultivo, Control de Hectáreas, Alertas, Problemas Detectados, y Servicios (todo se construye a partir de `OTS`).
2. **`loader.js`**, al separar `consultaInsumos` — filtra los movimientos de **Combustible** (Ingreso/Consumo) por `campania`.
3. **`data.js`**, en la sección de **Insumos** — filtra esos movimientos por `campania` también.

**Lo que el filtro NO cubre** (a tener en cuenta si el año que viene se mezclan campañas en el origen):
- **`consultaCultivos`** (el plan RTK) no tiene chequeo de `campania` — no existe esa columna con un valor de texto limpio ahí. `data.js` deriva lote/cultivo parseando el campo `nombre` (ej. `"LA TERESA 201 ARROZ 26/27"`) con una regex que exige el patrón `LA TERESA {LOTE} {CULTIVO} XX/YY` — acepta cualquier campaña con ese formato, no específicamente "26/27". Hoy funciona porque las 278 filas de esa hoja son todas de la campaña vigente; si se mezclan campañas ahí, hay que agregar el chequeo explícito.
- **Existencia inicial de combustible** (Stock Inicial) — a propósito queda fuera de este filtro: esas filas no tienen `campania` (están fechadas al 1/1, son un saldo de arranque, no un movimiento de la campaña).

`consultaOT` puede traer varias campañas mezcladas en la práctica (la fuente a veces incluye la campaña anterior completa) — sin este filtro, todos los KPIs quedarían inflados. `data.js` loguea en consola cuántas filas se descartaron por campaña en cada carga.

## Combustible

- **Stock Inicial dinámico**: sale de `consultaInsumos`, filas con `tipoInsumo="COMBUSTIBLES"` y `tipoMovimiento="Existencia inicial"` (fechadas al 1/1). `data.js` suma estas filas **con signo** (no en valor absoluto — las filas individuales vienen con signo mixto, la suma neta es la que da el stock real de arranque) en `D.stock_inicial_combustible`. Las filas crudas quedan en `D.combustible_existencia_inicial` para auditar (varias traen valores individuales negativos, algo inusual para un "saldo inicial").
- **Balance** = Stock Inicial + Ingreso − Consumo, acumulado mes a mes (el Stock Inicial de un mes puntual es el Balance del mes anterior). Sin signo `+` visible cuando es positivo, solo `-` cuando hay pérdida.
- `unidades` en `consultaInsumos` viene con signo (negativo=egreso, positivo=ingreso); se normaliza a valor absoluto al separar Ingreso/Consumo en `loader.js`.

## Insumos

Módulo separado de Combustible (pestaña propia, con su propio filtro de mes `imes`, sus propios datos `D.insumos_agg` — nunca se suman ni se mezclan con `D.combustible*`).

- Fuente: `consultaInsumos` con `tipoInsumo ≠ "COMBUSTIBLES"`.
- Gasto = `importeMonedaExtranjera` en valor absoluto (es la columna en USD — `importeMonedaFiscal` es el mismo importe en Guaraníes, con una relación de ~6060 entre ambas, consistente con el tipo de cambio).
- Solo cuentan como gasto los movimientos de egreso real: `...Egreso de Stock`, `Egreso de Materia Prima`, `Egreso de Mercadería`, `Remisión por Venta`. Quedan afuera `Existencia inicial`/`Stock Inicial` (saldo, no gasto) y `Transferencia.../Ajuste...` (no son consumo).
- La tabla "Gasto por Tipo de Insumo" incluye una columna **Unidad de Medida** (campo real `unidadMedida`: hoy aparecen "Litros" y "Kilos" en la campaña vigente). Se agrupa por `(tipo, unidad)`, no solo por tipo: si un mismo tipo mezcla unidades reales (ej. **HERBICIDAS** trae filas en Kilos y en Litros a la vez), aparece como **dos filas separadas**, cada una con su propio conteo de movimientos y gasto acotados a esa unidad — nunca se mezclan cantidades de unidades distintas en una misma fila.
- **"Gasto por Proveedor" no existe**: de las filas de egreso real, menos del 1% tiene proveedor cargado (el resto es Labor Propia) — no hay dato real que sostenga ese indicador.
- Sin gráfico (se sacó a pedido) — solo KPIs y tablas.
- `D.insumos_pendiente_modulo` guarda crudo (sin transformar) el resto de `consultaInsumos` que no entra en ninguna de las categorías anteriores, por si hace falta auditar o ampliar el alcance más adelante.

## Alertas Operacionales

Filtro por **Estado** (`Todas` / `Pendiente` / `En Ejecución`), mismo patrón visual que los demás filtros del dashboard. Al cambiar, recalculan tanto los KPIs como la tabla de OT Atrasadas.

**Importante — "OT Pendientes" ≠ "OT Atrasadas":** el badge de la pestaña y el KPI "OT ATRASADAS" cuentan OT con Estado `Pendiente` **o** `En Ejecución` cuya Fecha Teórica ya pasó (comparada contra `HOY`, que es la Fecha Teórica más reciente encontrada en las OT — no la fecha real de hoy). Si alguien espera ver "1 tarea pendiente" pero el dashboard muestra más, probablemente esté comparando contra el conteo de `Estado=Pendiente` (que sí puede ser 1) en vez de contra "atrasadas" (que también suma el trabajo en ejecución demorado). Usar el filtro de Estado = "Pendiente" para ver ese número específico.

## Reorganización general (histórico)

Además de la migración de 3 CSV a este `.xlsx` único y de los módulos descritos arriba, esta es una reorganización estructural del artefacto original de un solo archivo: mismo diseño visual, sin build step, sin frameworks. Otros cambios de contenido respecto al original:
- Se retiró CSS muerto sin uso real en el HTML/JS (`.barcol`, `.bars`, `.tag-mx`, `.tag-mn`, `.cc-av`).
- Los atributos `onclick`/`onchange` del HTML se reemplazaron por `addEventListener` en `events.js` (mismo comportamiento, sin JS inline en el markup).
