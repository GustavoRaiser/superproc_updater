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
  onFocusMenu: (callback) => ipcRenderer.on('hover-menu-focus', () => callback()),
  onMenuData: (callback) => {
    ipcRenderer.on('render-hover-menu', (event, data) => callback(data));
  }
});
