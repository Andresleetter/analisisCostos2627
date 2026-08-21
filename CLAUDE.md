# CLAUDE.md

Notas para trabajar en este repo. El **README.md** documenta *qué hace* el dashboard y por qué cada
regla de negocio es como es — leelo antes de tocar cálculos. Este archivo cubre lo operativo: cómo
correrlo, cómo verificar que no rompiste nada, y las trampas que ya nos mordieron.

## Idioma

Respuestas, comentarios de código y mensajes de commit **en español**.

## Entorno

- **Node está fuera del PATH.** Usar la ruta completa: `"/c/Program Files/nodejs/node.exe"`.
- **Hay dos clones del repo.** Trabajar SIEMPRE en el de OneDrive
  (`OneDrive - Desarrollos Del Sur S.A/Documentos/analisisCostos2627`), que es el que tiene el
  remoto `origin`. El de `Documents/` está desactualizado.
- No hay `package.json`, `node_modules`, bundler ni build step. **No migrar** a ES Modules, npm,
  TypeScript, React ni ningún bundler: es JS vanilla con scripts clásicos y `defer`.
- Servidor local para probar: cualquier estático sobre la carpeta (`python -m http.server`,
  `npx serve .`). El navegador bloquea `fetch()` sobre `file://`.

## Datos: se usa el Excel, no la API

El dashboard se alimenta de `datosCampania2627.xlsx`. **La API de Albor no se usa**: cada consulta
gasta tokens y son limitados. El proxy del Worker (`worker/index.js`, con el Durable Object
`AlborAuth`) quedó en el repo pero **sin ningún consumidor** — no lo llames ni propongas volver a
la API sin que el usuario lo pida. No es un problema técnico: se validó contra el dato real que la
API devuelve exactamente los mismos KPIs, costos y OT que la hoja `consultaOT`.

Los archivos de datos viven en **`data/`** (ruta armada una sola vez en `config.js`: `SRC_DATA`).
Además de los dos `.xlsx` está `data/recetas-insumos-26-27.json` (dosis por hectárea de la campaña),
que se carga con `fetch`+`resp.json()`, **no** con SheetJS, y cuyo fallo nunca bloquea la carga.
Los `.xlsx` se descargan **del propio sitio** por ruta relativa (Cloudflare sirve el repo como
assets estáticos), con `raw.githubusercontent.com` solo como respaldo. Ver README.

## Arquitectura del modelo de datos

`buildData()` en `js/data.js` es solo un **orquestador**: prepara entradas, llama a las funciones de
`js/data/*.js` y ensambla el objeto final. La lógica vive por dominio en `js/data/`:

| Archivo | Dominio |
|---|---|
| `ordenes.js` | Base de `consultaOT` — todo lo demás depende de sus colecciones |
| `cultivos.js` | Plan RTK, avance por cultivo/etapa, Control de Hectáreas |
| `servicios.js` | Módulo Servicios y el paquete por campaña |
| `combustible.js` | Gasoil — incluye el cruce con la OT que generó cada movimiento (`referencia` = `referenciaAsiento`) para el Consumo por Uso / Detalle |
| `insumos.js` | Módulo Insumos |
| `auditoria.js` | Infraestructura + Insumos por Parcela |
| `recetas.js` | Dosis real vs receta: unidades, índice, búsqueda y desvío |
| `alertas.js` | OT pendientes/atrasadas |
| `resumen.js` | Gastos Operativos y `D.resumen` |

Reglas al tocar esto:

- Los archivos de `js/data/` **no tocan el DOM** y reciben lo que necesitan por parámetro.
- `render.js` **solo pinta**, no calcula. Si te encontrás calculando en `render.js`, va a `js/data/`.
- **Orden de carga en `index.html`:** los nueve `js/data/*.js` van antes de `js/data.js`. Si agregás
  uno nuevo, acordate del `<script>`.
- No renombrar propiedades del objeto que devuelve `buildData()`: es el contrato que leen
  `render.js` y `events.js`.

## Verificar que un cambio no alteró el modelo

Para refactorizaciones o cambios que *no deberían* mover ningún número, hay una técnica que ya
funcionó: un arnés que ejecuta el `buildData()` real fuera del navegador y vuelca todo el modelo en
JSON canónico (claves ordenadas, `Set`/`Map`/`Date` en forma estable), antes y después del cambio.
Se cargan los scripts con `node:vm` en un único contexto, en el mismo orden que declara
`index.html`, y se comparan los dos volcados. En la separación de `data.js` en `js/data/` eso dio
**9.672.151 bytes idénticos byte a byte** en las 60 claves — que es la única prueba real de que no
se movió ninguna fórmula. Reconstruilo en el scratchpad cuando haga falta.

## Reglas de negocio que NO se tocan sin pedido explícito

Están explicadas en el README; acá va el resumen de lo que es fácil romper sin darse cuenta:

- **`CAMPANIA_ACTUAL` NO se aplica a `consultaInsumos`.** Solo a `consultaOT` y a `consultaCultivos`.
- **Importes = `Unidades/Dosis × Precio Unitario`**, en todo el dashboard. No usar las columnas de
  costo ya calculadas de la hoja: difieren por redondeos y tener dos costos conviviendo es peor.
- **Solo OT Confirmadas** en cualquier importe.
- **Nunca sumar unidades de medida distintas** (litros + kilos no es una cantidad válida).
- **`Has. Reales = 0,01` es un marcador, no una superficie** (fletes, aplicación con mochila).
  Dividir por ese valor produce números absurdos.
- **Tolerancia de 3 días** en las alertas de atraso.
- Datos faltantes se muestran como guion gris, **nunca como 0** — un cero se lee como "se midió y
  dio cero".

## Git

- **No commitear ni pushear sin permiso explícito del usuario**, aunque el trabajo esté terminado.
- **`datoFinanzas.xlsx` no se sube** hasta que el usuario lo ordene.
- Al subir el Excel, verificar antes las hojas y la cantidad de filas, y reportar el cambio.
- Cloudflare redespliega solo al llegar el push a `main` (~1-2 min).
