'use strict';

// Adaptador para a bancada: restringe o provedor existente à aba ativa e
// pede consentimento novamente para cada operação. Não autentica o Copilot.
function criarContextoAtivo({ provedor, getActiveTabId, perguntar }) {
  if (!provedor || typeof getActiveTabId !== 'function' || typeof perguntar !== 'function') {
    throw new TypeError('Dependências do contexto ativo ausentes');
  }
  const continuaAtiva = alvo => !!alvo && alvo.id === getActiveTabId() && provedor.alvoAtual(alvo);
  return {
    async abaAlvo({ tabId, url } = {}) {
      const id = getActiveTabId();
      if (id == null || (tabId != null && tabId !== -1 && tabId !== id)) return null;
      const alvo = await provedor.abaAlvo({ tabId: id, url: url || '' });
      return continuaAtiva(alvo) ? alvo : null;
    },
    alvoAtual: continuaAtiva,
    async consentir({ origem, alvo, finalidade }) {
      if (!continuaAtiva(alvo)) return false;
      const resposta = await perguntar({ origem, finalidade, titulo: alvo.title });
      return resposta === 'uma-vez' && continuaAtiva(alvo);
    },
    async lerTexto(alvo, opcoes) {
      if (!continuaAtiva(alvo)) return null;
      const texto = await provedor.lerTexto(alvo, opcoes);
      return continuaAtiva(alvo) ? texto : null;
    },
    async lerPdf(alvo, opcoes) {
      if (!continuaAtiva(alvo) || typeof provedor.lerPdf !== 'function') return null;
      const texto = await provedor.lerPdf(alvo, opcoes);
      return continuaAtiva(alvo) ? texto : null;
    }
  };
}
function criarProtocoloContextoAtivo({ provedor, getActiveTabId, perguntar, log }) {
  const { criarProtocoloComercial } = require('./copilot-protocolo-comercial');
  const contexto = criarContextoAtivo({ provedor, getActiveTabId, perguntar });
  return criarProtocoloComercial({ provedor: contexto, log });
}
module.exports = { criarContextoAtivo, criarProtocoloContextoAtivo };
