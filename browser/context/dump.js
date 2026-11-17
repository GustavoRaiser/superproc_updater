'use strict';
// Comando de desenvolvimento: imprime o estado do workspace lido pelo ContextBroker.
// Por padrão mostra só metadados e tamanhos (os autos são sigilosos); o conteúdo só sai com incluirConteudo=true.
async function dumpWorkspaceContext(broker, { incluirConteudo = false, escrever = (t) => console.log(t) } = {}) {
  const ws = await broker.readAllTabs();
  const saida = {
    activeTabId: ws.activeTabId,
    tabs: ws.tabs.map((t) => (t.error
      ? { id: t.tabId, error: t.error }
      : {
        id: t.tabId,
        type: t.type,
        title: t.title,
        url: t.url,
        processNumber: t.processNumber,
        content: incluirConteudo ? t.content.visibleText : { characters: t.content.visibleText.length, truncated: t.truncated }
      }))
  };
  escrever(JSON.stringify(saida, null, 2));
  return saida;
}

module.exports = { dumpWorkspaceContext };
