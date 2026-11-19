const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hoverAPI', {
  openLink: (data) => ipcRenderer.send('hover-menu-open-link', data),
  openAddLink: (category) => ipcRenderer.send('hover-menu-open-add-dialog', category),
  openManageLinks: (category) => ipcRenderer.send('hover-menu-open-manage-dialog', category),
  openSub: (data) => ipcRenderer.send('hover-sub-open', data),
  closeSub: (keyboard = false) => ipcRenderer.send('hover-sub-close', keyboard === true),
  closeMenu: () => ipcRenderer.send('hide-hover-menu', { keyboard: true, restoreFocus: true }),
  hideMenu: () => ipcRenderer.send('hide-hover-menu', true),
  cancelHide: (keyboard = false) => ipcRenderer.send('cancel-hover-hide', keyboard === true),
  // Arrastar e soltar (Acesso Rápido): a origem informa início/posição/fim; o host repassa a posição à janela
  // sob o mouse (onDragOver), que responde com o destino (dragTarget).
  dragStart: (data) => ipcRenderer.send('hover-drag-start', data),
  dragMove: (data) => ipcRenderer.send('hover-drag-move', data),
  dragTarget: (alvo) => ipcRenderer.send('hover-drag-target', alvo),
  dragEnd: (data) => ipcRenderer.send('hover-drag-end', data),
  onDragOver: (callback) => ipcRenderer.on('hover-drag-over', (event, data) => callback(data)),
  onFocusMenu: (callback) => ipcRenderer.on('hover-menu-focus', () => callback()),
  onMenuData: (callback) => {
    ipcRenderer.on('render-hover-menu', (event, data) => callback(data));
  }
});
