# Dashboard Campaña 26/27 · Del Sur

Dashboard de seguimiento de Órdenes de Trabajo de campaña agrícola (Campo La Teresa). Es una web estática (HTML/CSS/JS vanilla, sin build step) que al cargar descarga un único `.xlsx` publicado en GitHub (`datosCampania2627.xlsx`, con 3 hojas: `consultaOT`, `consultaCultivos`, `consultaInsumos`), lo parsea en el navegador con SheetJS y renderiza KPIs, tablas y alertas a partir de ellos.

## Cómo arrancar un servidor local

El navegador bloquea `fetch()` sobre `file://`, así que hay que servir la carpeta por HTTP. Cualquiera de estas opciones funciona (parado en la carpeta del proyecto):

```bash
python -m http.server 8080
```

```bash
npx serve .
```

Luego abrir `http://localhost:8080` (o el puerto que indique el comando).

Como la app depende de internet (descarga el `.xlsx` desde `raw.githubusercontent.com` en tiempo real), hace falta conexión activa para ver datos; sin conexión se muestra la pantalla de error con reintento.

## Contenido de cada carpeta

- **`index.html`** — Markup semántico de la página (header, tabs, secciones por pestaña). No contiene estilos ni scripts inline; solo referencias a `css/` y `js/`.
- **`css/`** — Un archivo por bloque visual, cargados en `index.html` en este orden:
  - `base.css` — reset, variables CSS (`:root`) de color/tipografía/radios/sombras, tipografía global y el layout `.wrap`.
  - `overlay.css` — pantalla de carga y de error inicial.
  - `header.css` — cabecera con logo y fecha de datos.
  - `tabs.css` — barra de pestañas y transición entre páginas.
  - `panel.css` — contenedor `.panel` genérico y sus variantes (`hero-panel`, `sub`), más los helpers de color `c-*`/`f-*`.
  - `kpis.css` — tarjetas de indicadores (`.kpi`) usadas en varias pestañas.
  - `cultivos.css` — tarjetas de avance por cultivo y sus barras de etapa.
  - `problemas.css` — bloque de "Problemas Detectados".
  - `tables.css` — estilos genéricos de tabla usados en todas las pestañas.
  - `gastos.css` — filtros, KPIs y tablas específicas de la pestaña Resumen de Gastos (detalle por labor, gasoil por área).
  - `alertas.css` — KPIs y pills de la pestaña Alertas Operacionales.
  - `footer.css` — pie de página.
- **`js/`** — Un módulo por responsabilidad, cargados en `index.html` en este orden (scripts clásicos con `defer`, sin módulos ES ni bundler):
  - `config.js` — constantes de la app (URL del `.xlsx`, nombres de hoja, catálogos de cultivos/etapas/operativas) y la variable de estado `D`.
  - `utils.js` — funciones puras de formateo, parsing de números/fechas (incluye objetos `Date` nativos de SheetJS) y normalización de texto.
  - `data.js` — `buildData()`: toma las 3 hojas ya parseadas y construye todo el modelo de datos del dashboard.
  - `render.js` — todas las funciones que pintan el DOM (`renderAll`, `renderG`, `renderCombustible`, etc.) y el cambio de pestaña (`show`).
  - `events.js` — conecta los elementos interactivos del HTML (pestañas, selects de filtro, botón de reintento) con las funciones de `render.js`/`loader.js`.
  - `loader.js` — descarga el `.xlsx`, lo parsea con SheetJS, separa `consultaInsumos` en combustible/existencia inicial/otros insumos, y dispara la carga inicial al terminar de cargar el DOM.
- **`vendor/xlsx.full.min.js`** — copia sin modificar de [SheetJS](https://sheetjs.com) (`xlsx@0.18.5`), usada para leer el `.xlsx` en el navegador.

## Notas de la migración a un único .xlsx

Antes el dashboard leía 3 CSV (`campania.csv`, `Proyecciones2627.csv`, `Movimiento_de_combustible.csv`). Ahora lee un solo `datosCampania2627.xlsx` con 3 hojas (`consultaOT`, `consultaCultivos`, `consultaInsumos`). Detalles relevantes para quien mantenga esto:

- **`consultaInsumos` trae TODOS los insumos**, no solo combustible. `loader.js` la separa en tres grupos según `tipoInsumo`/`tipoMovimiento`:
  - `tipoInsumo="COMBUSTIBLES"` + movimiento real (Ingreso/Consumo) → se transforma a la misma forma que tenía el viejo CSV de combustible, para que `data.js` no necesite cambios en esa parte.
  - `tipoInsumo="COMBUSTIBLES"` + `tipoMovimiento="Existencia inicial"` → **Stock Inicial dinámico**: `data.js` suma estas filas (`D.stock_inicial_combustible`) en vez de usar un valor fijo. Las filas crudas quedan en `D.combustible_existencia_inicial` para poder auditarlas (varias traen valores individuales negativos, algo inusual para un "saldo inicial" — a revisar con el equipo si corresponde corregir el origen).
  - El resto de `tipoInsumo` (fertilizantes, agroquímicos, repuestos, etc.) queda intacto en `D.insumos_pendiente_modulo`, sin UI ni cálculo — es la base de un futuro módulo "Insumos".
  - Ojo: en esta hoja `unidades` viene con signo (negativo=egreso, positivo=ingreso); el CSV anterior siempre traía el valor positivo e inferá el sentido solo por `tipoMovimiento`. `loader.js` normaliza tomando el valor absoluto.
- **`consultaCultivos` no trae columnas separadas de lote/cultivo** (a diferencia del viejo `Proyecciones2627.csv`) — vienen combinadas en el campo `nombre` (ej. `"LA TERESA 201 ARROZ 26/27"`). `data.js` las separa por posición fija (`LA TERESA {LOTE} {CULTIVO} {CAMPAÑA}`); las filas que no calzan ese patrón (parcelas de ensayo, operativos como "A RECUPERAR RH") quedan fuera del plan RTK, igual que antes. Es un parseo de un string de display, no un campo estructurado — si el año que viene cambia la convención de nombres en el origen, este parseo hay que revisarlo.
- **`consultaOT`** sí tiene exactamente los mismos nombres de columna (camelCase) que ya esperaba `data.js`, no requirió cambios en la extracción de campos.

Fuera de la capa de ingesta, es una reorganización estructural pura: mismo diseño, mismos textos y mismo comportamiento que el artefacto original de un solo archivo. Otros cambios de contenido:
- Se retiró CSS muerto que no tenía ningún elemento del HTML ni del JS que lo usara (`.barcol`, `.bars`, `.tag-mx`, `.tag-mn`, `.cc-av`).
- Los atributos `onclick`/`onchange` del HTML se reemplazaron por `addEventListener` en `events.js` (mismo comportamiento, sin JS inline en el markup).
- La pestaña Combustible ahora muestra un KPI de Stock Inicial (dinámico, ver arriba) y el Balance se calcula como Stock Inicial + Ingreso − Consumo, acumulado mes a mes.
