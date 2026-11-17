'use strict';
const api = window.jfAPI;

api.aoReceberDados(({ titulo }) => { document.getElementById('titulo').textContent = String(titulo || ''); });

// Arrasto por ponteiro capturado: usa coordenadas de tela, pois o próprio quadro se move durante o arrasto.
function arrastar(ev, modo) {
  if (ev.button !== 0 || ev.target.closest('button')) return;
  ev.preventDefault();
  const alvo = ev.currentTarget;
  alvo.setPointerCapture(ev.pointerId);
  const x0 = ev.screenX, y0 = ev.screenY;
  api.arrasto({ fase: 'inicio', modo });
  const mover = (m) => api.arrasto({ fase: 'mover', dx: m.screenX - x0, dy: m.screenY - y0 });
  const fim = () => {
    alvo.removeEventListener('pointermove', mover);
    alvo.removeEventListener('pointerup', fim);
    alvo.removeEventListener('pointercancel', fim);
    api.arrasto({ fase: 'fim' });
  };
  alvo.addEventListener('pointermove', mover);
  alvo.addEventListener('pointerup', fim);
  alvo.addEventListener('pointercancel', fim);
}

const barra = document.getElementById('barra');
barra.addEventListener('pointerdown', (ev) => arrastar(ev, 'mover'));
barra.addEventListener('dblclick', (ev) => { if (!ev.target.closest('button')) api.maximizar(); });
document.querySelectorAll('.alca').forEach((el) => el.addEventListener('pointerdown', (ev) => arrastar(ev, el.dataset.modo)));
document.getElementById('max').addEventListener('click', () => api.maximizar());
document.getElementById('fechar').addEventListener('click', () => api.fechar());
