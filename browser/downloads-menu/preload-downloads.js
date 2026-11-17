const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getRecentDownloads: () => ipcRenderer.invoke('downloads-get-recent'),
  openFile: (filePath) => ipcRenderer.send('downloads-open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.send('downloads-show-in-folder', filePath),
  openFolder: () => ipcRenderer.send('downloads-open-folder'),
  clearDownloads: () => ipcRenderer.invoke('downloads-clear'),
  closeMenu: () => ipcRenderer.send('downloads-menu-close'),
  startFileDrag: (filePath) => ipcRenderer.send('downloads-start-file-drag', filePath),
  onDownloadsUpdated: (callback) => {
    ipcRenderer.on('downloads-updated', (event, data) => callback(data));
  }
});
