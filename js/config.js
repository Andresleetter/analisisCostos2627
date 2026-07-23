// ================== CONFIG ==================
// Fuente de datos: un único .xlsx en GitHub raw (antes eran 3 CSV separados; ahora 3 hojas de
// un mismo archivo, exportadas por Power Query: consultaOT, consultaCultivos, consultaInsumos).
const REPO = "Andresleetter/dashboard-campania-26-27";
const BRANCH = "main";
const SRC_XLSX = "https://raw.githubusercontent.com/"+REPO+"/"+BRANCH+"/datosCampania2627.xlsx";
const HOJA_OT = "consultaOT";
const HOJA_CULTIVOS = "consultaCultivos";
const HOJA_INSUMOS = "consultaInsumos";
// El plan RTK (hectáreas planificadas por lote/cultivo) se construye en runtime desde consultaCultivos.
// "HOY" (fecha de referencia para atrasos y para el rótulo "Datos al…") ya no es fija: se calcula
// más abajo, dentro de buildData(), como la Fecha Teórica más reciente encontrada en las OT de
// consultaOT (se carga con la fecha del día en que se crea la OT) — así se actualiza sola a
// medida que se cargan nuevas OT, y sirve para verificar si la web está al día.
const MES = {1:'Ene',2:'Feb',3:'Mar',4:'Abr',5:'May',6:'Jun',7:'Jul',8:'Ago',9:'Sep',10:'Oct',11:'Nov',12:'Dic'};
const CULTIVOS = ['ARROZ','SOJA','SORGO','MAIZ','AVENA','COBERTURA'];
// Etapas de campaña consideradas para los indicadores de "avance" (todo lo demás que traiga el
// campo Estadio — Secadero, Operativo, Mantenimientos, Infraestructura, Generador combustible, etc.
// — queda fuera por no ser una etapa del ciclo del cultivo). Orden fijo = secuencia agronómica.
const ETAPA_ORDEN = ['preparacion de suelo','siembra','cuidados','cosecha'];
const ETAPA_LABEL = {'preparacion de suelo':'Preparación de Suelo','siembra':'Siembra','cuidados':'Cuidados','cosecha':'Cosecha'};
const OPERATIVAS = ['OPERATIVO','PARCELA ARROZ','PARCELA SOJA','PARCELA SORGO','CUIDADOS DE PATIOS VIVIENDA','CUIDADOS DE PATIOS SILO','A RECUPERAR RH','MANTENIMIENTO DE BOMBAS'];
// Discriminadores dentro de consultaInsumos (que trae TODOS los insumos, no solo combustible):
// tipoInsumo = "COMBUSTIBLES" separa las filas de combustible del resto (fertilizantes,
// agroquímicos, repuestos, etc. — quedan en insumos_pendiente_modulo para un módulo futuro).
// tipoMovimiento = "Existencia inicial" son las filas de stock de arranque de campaña (fechadas
// al inicio), separadas del Ingreso/Consumo porque no son un movimiento sino un saldo de partida.
const TIPO_INSUMO_COMBUSTIBLE = 'COMBUSTIBLES';
const MOV_EXISTENCIA_INICIAL = 'Existencia inicial';
let D=null;
