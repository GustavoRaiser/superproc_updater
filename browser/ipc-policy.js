'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Capacidades de cada superfície local. Um preload copiado para outra janela
// não concede acesso: identidade, documento atual e frame também são conferidos.
const LOCAL_CHANNELS = {
  titlebar: `window-minimize window-maximize window-close window-is-maximized tabs-get-all
    tab-switch tab-switch-subaba tab-switch-processo tab-new tab-split-create tab-close tab-close-whole tab-reorder tab-merge-stack tab-reload tab-back tab-forward
    show-split-tab-context-menu get-active-url navigate-to open-link panel-open panel-close
    config-get config-add-link config-remove-link config-update-link
    extension-open-options show-cfg-menu show-downloads-menu show-history-menu show-hover-menu
    hide-hover-menu cancel-hover-hide dialog-open history-get history-clear history-remove-item
    toggle-devtools clear-cache page-save find-open find-close select-download-folder get-download-config
    set-download-config get-recent-downloads clear-recent-downloads open-download-folder open-downloaded-file fechar-arvores
    copilot-coluna-get copilot-coluna-toggle copilot-coluna-clique eproc-botoes-barra-acao eproc-botoes-barra-estado`,
  dialog: `dialog-close dialog-get-data dialog-add-link config-update-link config-remove-link
    config-set-category-links config-save-all-categories config-move-link dialog-navigate-to
    clear-cache clear-preferences clear-extensions extensions-status clear-all-data dialog-open config-set-corretor-ortografico config-set-menos-abas config-set-botoes-eproc-barra config-set-smart-locs-eventos config-set-localizadores-coloridos config-set-barra-botoes-capa config-set-linha-capa config-set-navegacao-lista config-set-arvore-automarca config-set-arvore-colorida config-set-arvore-evento-cor config-set-arvore-compacta config-set-menu-eventos-rapido config-set-menu-eventos-atalho config-set-copilot-contexto config-set-copilot-ia-local config-set-copilot-texto-completo config-get-copilot-admin config-get-copilot-politicas-ia config-set-copilot-politica-ia config-set-copilot-politicas-ia-lote config-set-copilot-admin config-get
    get-download-config set-download-config select-download-folder`,
  cfg: 'cfg-action cfg-close cfg-layout',
  downloads: `downloads-get-recent downloads-open-file downloads-show-in-folder downloads-open-folder
    downloads-clear downloads-menu-close downloads-start-file-drag`,
  history: `history-get history-open-url history-open-process history-item-action history-remove-item history-clear history-menu-close`,
  hover: `hover-menu-open-link hover-menu-open-add-dialog hover-menu-open-manage-dialog hover-sub-open
    hover-sub-close hide-hover-menu cancel-hover-hide hover-drag-start hover-drag-move hover-drag-target hover-drag-end`,
  find: 'find-search find-next find-stop find-close find-resize find-glossary-request find-glossary-jump',
  panel: `panel-toggle-pin panel-toggle-copilot panel-home panel-back panel-forward panel-reload panel-promote-to-tab panel-close
    panel-hide panel-resize-delta panel-resize-start panel-resize-end find-open find-close`,
  empty: 'empty-action-home empty-action-localizadores empty-action-undo empty-action-close',
  spell: 'spell-get-lists spell-add-word spell-remove-word spell-import spell-export spell-manage-close',
  fastcopilot: 'fc-box-get fc-box-submit fc-box-cancel',
  copilotanfitriao: 'copilot-anfitriao-msg copilot-anfitriao-falha',
  copilotshell: 'copilot-shell-estado copilot-shell-acao copilot-shell-consumidor',
  copilotconsent: 'copilot-consentimento-decisao',
  organizador: 'org-origens org-ler org-gravar org-ler-cores org-gravar-regras org-gravar-cor org-fechar',
  locs: 'locs-gravar locs-buscar locs-navegar locs-fechar locs-tamanho locs-ponteiro'
};
const capabilities = new Map(Object.entries(LOCAL_CHANNELS).map(([role, channels]) => [role, new Set(channels.split(/\s+/))]));
const PAGE_CHANNELS = new Set(['tab-open-process-url', 'tab-page-close-request', 'tab-refresh-parent-request',
  'page-navbar-dimension', 'superproc:eproc-session', 'panel-content-toggle-pin', 'superproc:print-pdf', 'superproc:eproc-cedo', 'superproc:modulo-usuario', 'superproc:abrir-organizador', 'superproc:organizador-navegador', 'superproc:modulos-controlados',
  // Ponte do cr-host: só o quadro principal da coluna do Copilot numa origem do cr-host (conferido em allowPage).
  'copilot-cr-abrir', 'copilot-cr-msg', 'copilot-cr-fechar', 'copilot-cr-unico', 'copilot-cr-nota']);

function isLocalFrame(event, contents, file) {
  try {
    if (!contents || contents.isDestroyed() || event.sender !== contents || !event.senderFrame ||
        event.senderFrame !== contents.mainFrame) return false;
    const current = new URL(event.senderFrame.url);
    current.search = ''; current.hash = '';
    return current.href === pathToFileURL(path.resolve(file)).href;
  } catch { return false; }
}

function createGuardedIpc(ipcMain, { surfaces, allowPage }) {
  function allowed(channel, event) {
    try {
      if (PAGE_CHANNELS.has(channel)) return !!allowPage(channel, event);
      return surfaces().some(({ role, contents, file }) =>
        capabilities.get(role)?.has(channel) && isLocalFrame(event, contents, file));
    } catch { return false; } // Uma superfície destruída nunca concede acesso.
  }
  function assertKnown(channel) {
    if (!PAGE_CHANNELS.has(channel) && ![...capabilities.values()].some(channels => channels.has(channel))) {
      throw Error('Canal IPC sem política: ' + channel);
    }
  }
  return {
    on(channel, listener) {
      assertKnown(channel);
      return ipcMain.on(channel, (event, ...args) => {
        if (!allowed(channel, event)) return;
        return listener(event, ...args);
      });
    },
    handle(channel, listener) {
      assertKnown(channel);
      return ipcMain.handle(channel, (event, ...args) => {
        if (!allowed(channel, event)) throw Error('Origem IPC não autorizada.');
        return listener(event, ...args);
      });
    }
  };
}

function isRecordedDownload(file, records) {
  if (typeof file !== 'string' || file.includes('\0') || !path.isAbsolute(file)) return false;
  const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return records.some(record => typeof record.path === 'string' && path.isAbsolute(record.path) && key(record.path) === key(file));
}

function isProcessNavigation(source, target) {
  try {
    if (typeof target !== 'string' || target.length > 16384) return false;
    const from = new URL(source), to = new URL(target);
    return from.protocol === 'https:' && from.hostname.endsWith('.jus.br') &&
      to.origin === from.origin && !to.username && !to.password;
  } catch { return false; }
}

module.exports = { createGuardedIpc, isLocalFrame, isRecordedDownload, isProcessNavigation, LOCAL_CHANNELS, PAGE_CHANNELS };
