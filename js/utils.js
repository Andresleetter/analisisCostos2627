// ================== HELPERS ==================
const fmt = n => Math.round(n||0).toLocaleString('es-AR');
const fmt1 = n => (n||0).toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
const fmt2 = n => (n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtUSD = n => (n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
function num(v){ if(v==null) return 0; if(typeof v==='number') return v; let s=String(v).trim(); if(!s) return 0;
  s=s.replace(/\s/g,''); if(s.indexOf(',')>-1 && s.indexOf('.')>-1){ s=s.replace(/\./g,'').replace(',', '.'); }
  else if(s.indexOf(',')>-1){ s=s.replace(',', '.'); } const n=parseFloat(s); return isNaN(n)?0:n; }
function numN(v){ if(v==null||String(v).trim()==='') return null; const n=num(v); return n; }
function normLote(x){ let s=String(x==null?'':x).trim().replace(/^\.+/,'').trim().toUpperCase(); s=s.replace(/^0+(?=\d)/,''); return s; }
function pdate(v){ if(!v) return null;
  // SheetJS (lectura del .xlsx con cellDates:true) entrega las celdas de fecha como Date nativos.
  if(v instanceof Date) return isNaN(v)?null:v;
  const s=String(v).trim(); if(!s) return null;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if(m){ let y=+m[3]; if(y<100)y+=2000; return new Date(y,+m[2]-1,+m[1]); }
  const d=new Date(s); return isNaN(d)?null:d; }
function keyOf(row,names){ for(const n of names){ if(n in row) return row[n]; const k=Object.keys(row).find(k=>k.trim()===n.trim()); if(k) return row[k]; } return undefined; }
function color(av){ return av>=95?'g':(av>=80?'y':(av>=50?'o':'r')); }
const CATCOL={'Gastos':'#1E6B5C','Hectáreas':'#5AA02C','Avance':'#F57C00','Controles':'#8e6a1f'};
function normEstadio(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function stripAccents(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function normHdr(s){ return stripAccents(s).toLowerCase().replace(/\uFEFF/g,'').replace(/\s+/g,' ').trim(); }
