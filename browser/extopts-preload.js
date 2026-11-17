'use strict';
// Preload da janela de opções das extensões. Expõe só o pedido de módulos importados; o host confere que quem chama é a
// página popup da extensão SuperPROC (AZflow e Epryx, que usam a mesma janela, são recusadas no lado do host).
const { ipcRenderer } = require('electron');
if (location.protocol === 'chrome-extension:') {
  window.superprocHost = Object.freeze({ modulo: (pedido) => ipcRenderer.invoke('superproc:modulo-usuario', pedido), abrirOrganizador: (tipo) => ipcRenderer.invoke('superproc:abrir-organizador', tipo) });
}
