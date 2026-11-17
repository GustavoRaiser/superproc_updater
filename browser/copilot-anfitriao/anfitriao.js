'use strict';
// Página-anfitriã local (modo teste). Hospeda o Copilot num iframe e responde ao protocolo de contexto via host.
// Não toca no DOM do iframe (impossível entre origens) e só aceita mensagens do próprio iframe, na origem esperada.
(function () {
  const ALVOS = ['https://copilot.cloud.microsoft', 'https://m365.cloud.microsoft'];
  // O carregamento corporativo pode terminar depois do bootstrap da página. Mantemos o
  // anfitrião disponível pelo mesmo prazo máximo de uma leitura, sem presumir que
  // silêncio imediato significa recusa do protocolo.
  const ESPERA_INICIAL_MS = 120000;
  const quadro = document.getElementById('copilot');
  let destino;
  try { destino = new URL(new URLSearchParams(location.search).get('alvo') || ''); } catch (_) { destino = null; }
  if (!destino || destino.protocol !== 'https:' || !ALVOS.includes(destino.origin)) { document.getElementById('aviso').hidden = false; return; }
  let recebeu = false;
  window.addEventListener('message', async (e) => {
    if (e.source !== quadro.contentWindow || e.origin !== destino.origin) return;
    const nome = e.data && e.data.eventName;
    if (typeof nome === 'string' && /^(Edge\.|Discover\.|Copilot\.)/.test(nome)) recebeu = true;
    let respostas = [];
    try { respostas = await window.superprocAnfitriao.mensagem(e.data, e.origin); } catch (_) {}
    for (const r of Array.isArray(respostas) ? respostas : []) quadro.contentWindow.postMessage(r, destino.origin);
  });
  quadro.src = destino.href;
  setTimeout(() => { if (!recebeu) window.superprocAnfitriao.falhou('sem-mensagens-120s').catch(() => {}); }, ESPERA_INICIAL_MS);
})();
