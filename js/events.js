// ================== EVENTOS ==================
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.tab').forEach(function(btn, i){
    btn.addEventListener('click', function(){ show(i, btn); });
  });
  document.getElementById('ov-retry').addEventListener('click', loadData);
  document.getElementById('gmes').addEventListener('change', renderG);
  document.getElementById('glabor').addEventListener('change', renderLaborDetalle);
  document.getElementById('gestadio').addEventListener('change', renderLaborDetalle);
  document.getElementById('cmes').addEventListener('change', renderCombustible);
  document.getElementById('cterc').addEventListener('change', renderCombustible);
  document.getElementById('imes').addEventListener('change', renderInsumos);
  document.getElementById('aestado').addEventListener('change', renderAlertas);
});
