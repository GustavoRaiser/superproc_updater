'use strict';
// Abas do navegador que pertencem ao mesmo trabalho do solicitante (capa, árvore, divisão e abas nativas ligadas).
// O editor de minutas fica de fora do agrupamento por grupo: só entra se for a própria origem ou a divisão dela.
function resolveManagedTargets(tabs, sender) {
  const owner = tabs.find(tab => tab.view?.webContents === sender);
  if (!owner) return [];
  return tabs.filter(tab => tab.id === owner.id || tab.id === owner.splitWith || tab.splitWith === owner.id ||
    (owner.groupId && tab.groupId === owner.groupId && tab.processRole !== 'editor') ||
    (tab.nativeSourceTabId === owner.id && !tab.nativeStandalone))
    .map(tab => tab.view?.webContents).filter(wc => wc && !wc.isDestroyed());
}
module.exports = { resolveManagedTargets };
