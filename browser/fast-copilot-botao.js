'use strict';
// Fast Copilot no Editor (host): botão do Copilot na barra do CKEditor. Roda em MUNDO ISOLADO (a página não
// enxerga o código). O clique avisa o host por postMessage (ponte do preload de sessão); o host decide.
// O botão usa o id sp-fc-botao (o gerenciador de marcações ancora a aba nele). O ícone é o favicon oficial
// carregado pela coluna do Copilot, entregue em tempo de execução; sem ele, um ícone genérico próprio.

const BOTAO_ID = 'sp-fc-botao';

function noIsoladoBotao(cfg) {
  const antigo = globalThis.__spFcBotao;
  if (antigo && antigo.versao === 2) { antigo.icone(cfg.icone); return { ok: true, reinstalado: false }; }
  if (antigo) { try { antigo.destruir(); } catch (_) {} } // versão anterior: remove e recria no lugar certo
  const GENERICO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1l1.8 4.6L14.5 7l-4.7 1.4L8 13l-1.8-4.6L1.5 7l4.7-1.4z" fill="#0b5cad"/></svg>');
  const TITULO = { livre: 'Copilot: abre a caixa de instruções', ocupado: 'Cancelar pedido ao Copilot' };
  let btn = null, ocupado = false, iconeAtual = cfg.icone || GENERICO;
  function montar() {
    const ref = document.querySelector('.cke_button__imprimir');
    const grupo = ref && ref.parentNode; // mesmo grupo dos botões PDF / IA: herda a mesma moldura do CKEditor
    if (!grupo) return;
    if (btn && btn.isConnected) return;
    const velho = document.getElementById(cfg.id); if (velho) velho.remove();
    btn = document.createElement('a');
    btn.id = cfg.id; btn.className = 'cke_button cke_button_off'; btn.href = 'javascript:void(0)'; btn.setAttribute('role', 'button');
    btn.innerHTML = '<span class="cke_button_icon" style="background:none;display:inline-block;width:auto;padding:0 2px;line-height:16px"><img alt="" style="width:16px;height:16px;display:block;margin:0 auto"></span><span class="cke_button_label">Copilot</span>';
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // não tira a seleção do editor
    btn.addEventListener('click', (e) => { e.preventDefault(); window.postMessage({ type: 'superproc:fast-copilot-click' }, location.origin); });
    // depois do último botão próprio do SuperPROC (PDF, IA); senão, logo após o Imprimir
    const ultimo = document.getElementById('az-btn-gerar-pdf-custom') || ref;
    ultimo.parentNode.insertBefore(btn, ultimo.nextSibling);
    pintar();
  }
  function pintar() {
    if (!btn) return;
    const img = btn.querySelector('img'); if (img) img.src = iconeAtual;
    btn.title = ocupado ? TITULO.ocupado : TITULO.livre; btn.setAttribute('aria-label', btn.title);
    btn.classList.toggle('cke_button_on', ocupado); btn.classList.toggle('cke_button_off', !ocupado);
  }
  const mo = new MutationObserver(() => { if (!btn || !btn.isConnected) montar(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  globalThis.__spFcBotao = { versao: 2, icone(url) { if (url) { iconeAtual = url; pintar(); } }, ocupado(v) { ocupado = !!v; pintar(); },
    destruir() { mo.disconnect(); if (btn) btn.remove(); delete globalThis.__spFcBotao; } };
  montar();
  return { ok: true, reinstalado: true };
}

const chamada = (fn, arg) => `(${fn.toString()})(${JSON.stringify(arg).replace(/</g, '\\u003c')})`;
const scripts = {
  instalar: (icone = null) => chamada(noIsoladoBotao, { id: BOTAO_ID, icone: typeof icone === 'string' && /^data:image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|webp);/.test(icone) ? icone : null }),
  ocupado: (v) => `(globalThis.__spFcBotao && globalThis.__spFcBotao.ocupado(${v ? 'true' : 'false'}), true)`,
  destruir: () => `(globalThis.__spFcBotao && globalThis.__spFcBotao.destruir(), true)`
};

module.exports = { BOTAO_ID, scripts };
