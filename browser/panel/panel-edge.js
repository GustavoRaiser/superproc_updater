// Borda arrastável do painel lateral: mesma lógica da alça do cabeçalho (panel-header.js), em toda a altura do painel.
document.addEventListener('DOMContentLoaded', () => {
  const api = window.panelAPI;
  const edge = document.getElementById('edge');
  if (!api || !edge) return;

  let arrastando = false;
  let ultimoX = 0;

  edge.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    arrastando = true;
    ultimoX = e.screenX;
    edge.classList.add('dragging');
    edge.setPointerCapture(e.pointerId);
    if (api.startResize) api.startResize();
    e.preventDefault();
  });

  edge.addEventListener('pointermove', (e) => {
    if (!arrastando) return;
    const delta = e.screenX - ultimoX;
    ultimoX = e.screenX;
    // Mouse para a esquerda (delta negativo) aumenta a largura do painel ancorado à direita.
    if (Number.isFinite(delta) && delta !== 0) api.resizeDelta(-delta);
  });

  function parar(e) {
    if (!arrastando) return;
    arrastando = false;
    edge.classList.remove('dragging');
    if (api.endResize) api.endResize();
    try { edge.releasePointerCapture(e.pointerId); } catch (_) { /* já liberado */ }
  }

  edge.addEventListener('pointerup', parar);
  edge.addEventListener('pointercancel', parar);
});
