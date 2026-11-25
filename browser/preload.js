const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('superprocAPI', {
  // Controles de Janela
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window-state-changed', (event, state) => callback(state));
  },

  // Gerenciamento de Abas
  getTabs: () => ipcRenderer.invoke('tabs-get-all'),
  switchTab: (tabId) => ipcRenderer.send('tab-switch', tabId),
  switchSubtab: (tabId) => ipcRenderer.send('tab-switch-subaba', tabId),
  switchProcess: (tabId) => ipcRenderer.send('tab-switch-processo', tabId),
  newTab: (url, depoisDeId) => ipcRenderer.send('tab-new', url, depoisDeId),
  createSplitTab: (targetUrl) => ipcRenderer.send('tab-split-create', targetUrl),
  closeTab: (tabId) => ipcRenderer.send('tab-close', tabId),
  closeWholeTab: (tabId) => ipcRenderer.send('tab-close-whole', tabId),
  reorderTab: (fromIndex, toIndex) => ipcRenderer.send('tab-reorder', { fromIndex, toIndex }),
  mergeTabStack: (fromIndex, toIndex) => ipcRenderer.send('tab-merge-stack', { fromIndex, toIndex }),
  showSplitTabContextMenu: (data) => ipcRenderer.send('show-split-tab-context-menu', data),
  reloadTab: (tabId) => ipcRenderer.send('tab-reload', tabId),
  goBack: (tabId) => ipcRenderer.send('tab-back', tabId),
  goForward: (tabId) => ipcRenderer.send('tab-forward', tabId),
  onTabsUpdated: (callback) => {
    ipcRenderer.on('tabs-updated', (event, tabs) => callback(tabs));
  },
  onActiveTabChanged: (callback) => {
    ipcRenderer.on('active-tab-changed', (event, activeTab) => callback(activeTab));
  },
  onThemeColorUpdated: (callback) => {
    ipcRenderer.on('theme-color-updated', (event, color) => callback(color));
  },
  onNavbarWidthUpdated: (callback) => {
    ipcRenderer.on('navbar-width-updated', (event, data) => callback(data));
  },
  // Recuo à esquerda da barra de título (largura da coluna do Copilot, 0 fora desse modo)
  onTitlebarInset: (callback) => {
    ipcRenderer.on('titlebar-inset', (event, data) => callback(data));
  },
  // Coluna do Copilot (modo integrado): estado do botão da barra e alternância mostrar/ocultar
  onCopilotColuna: (callback) => {
    ipcRenderer.on('copilot-coluna-state', (event, data) => callback(data));
  },
  getCopilotColuna: () => ipcRenderer.invoke('copilot-coluna-get'),
  toggleCopilotColuna: () => ipcRenderer.send('copilot-coluna-toggle'),
  cliqueCopilotColuna: (botao) => ipcRenderer.invoke('copilot-coluna-clique', botao),
  // Início / Meus Localizadores raptados da navbar do eproc (botoes-eproc-barra.js)
  onBotoesEproc: (callback) => {
    ipcRenderer.on('eproc-botoes-barra', (event, data) => callback(data));
  },
  getBotoesEproc: () => ipcRenderer.invoke('eproc-botoes-barra-estado'),
  acaoBotoesEproc: (acao, rect) => ipcRenderer.send('eproc-botoes-barra-acao', { acao, rect: rect || null }),

  // URL & Navegação
  getActiveUrl: () => ipcRenderer.invoke('get-active-url'),
  navigateTo: (url) => ipcRenderer.send('navigate-to', url),
  openLink: (url, inNewTab = true) => ipcRenderer.send('open-link', { url, inNewTab }),
  openInPanel: (data) => ipcRenderer.send('panel-open', data),
  closePanel: () => ipcRenderer.send('panel-close'),

  // Configuração (Juris, Leis, Preferências)
  getConfig: () => ipcRenderer.invoke('config-get'),
  addLink: (category, nome, url) => ipcRenderer.invoke('config-add-link', { category, nome, url }),
  removeLink: (category, id) => ipcRenderer.invoke('config-remove-link', { category, id }),
  updateLink: (category, id, nome, url) => ipcRenderer.invoke('config-update-link', { category, id, nome, url }),
  onConfigUpdated: (callback) => {
    ipcRenderer.on('config-updated', (event, config) => callback(config));
  },

  // Extensões
  openExtensionOptions: (extensionName, coords) => ipcRenderer.send('extension-open-options', extensionName, coords),

  // Menus e Modais
  showCfgMenu: (coords) => ipcRenderer.send('show-cfg-menu', coords),
  onPopupMenuState: (callback) => ipcRenderer.on('popup-menu-state', (_event, state) => callback(state)),
  onPopupMenuFocus: (callback) => ipcRenderer.on('popup-menu-focus', (_event, id) => callback(id)),
  onToolbarFocus: (callback) => ipcRenderer.on('toolbar-focus', () => callback()),
  showDownloadsMenu: (coords) => ipcRenderer.send('show-downloads-menu', coords),
  showHistoryMenu: (coords) => ipcRenderer.send('show-history-menu', coords),
  showHoverMenu: (data) => ipcRenderer.send('show-hover-menu', data),
  hideHoverMenu: (immediate = false) => ipcRenderer.send('hide-hover-menu', immediate),
  cancelHoverHide: () => ipcRenderer.send('cancel-hover-hide'),
  openDialog: (type) => ipcRenderer.send('dialog-open', type),

  // Histórico Duplo (URLs e Processos)
  getHistory: () => ipcRenderer.invoke('history-get'),
  clearHistory: (type) => ipcRenderer.invoke('history-clear', type),
  removeHistoryItem: (type, id) => ipcRenderer.invoke('history-remove-item', { type, id }),
  onHistoryUpdated: (callback) => {
    ipcRenderer.on('history-updated', (event, data) => callback(data));
  },

  // Ferramentas / Chromium
  toggleDevTools: () => ipcRenderer.send('toggle-devtools'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  savePage: () => ipcRenderer.send('page-save'),

  // Busca na Página (Find in Page / Ctrl+F)
  openFind: (target = 'tab') => ipcRenderer.send('find-open', target),
  closeFind: () => ipcRenderer.send('find-close'),

  // Downloads & Arquivos
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  getDownloadConfig: () => ipcRenderer.invoke('get-download-config'),
  setDownloadConfig: (cfg) => ipcRenderer.invoke('set-download-config', cfg),
  getRecentDownloads: () => ipcRenderer.invoke('get-recent-downloads'),
  clearRecentDownloads: () => ipcRenderer.invoke('clear-recent-downloads'),
  openDownloadFolder: () => ipcRenderer.send('open-download-folder'),
  openDownloadedFile: (filePath) => ipcRenderer.send('open-downloaded-file', filePath),
  onDownloadsUpdated: (callback) => {
    ipcRenderer.on('downloads-updated', (event, data) => callback(data));
  }
});
