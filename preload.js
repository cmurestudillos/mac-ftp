const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Suscripción a eventos del proceso principal; devuelve la función para cancelarla
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Exponemos una API segura para el proceso de renderizado
contextBridge.exposeInMainWorld('electronAPI', {
  // Funciones para IPC con el proceso principal
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getHomeDirectory: () => ipcRenderer.invoke('get-home-directory'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  saveConnection: connection => ipcRenderer.invoke('save-connection', connection),
  getConnections: () => ipcRenderer.invoke('get-connections'),
  deleteConnection: name => ipcRenderer.invoke('delete-connection', name),
  listLocalDirectory: directory => ipcRenderer.invoke('list-local-directory', directory),
  // Ruta en disco de un archivo soltado desde el Explorador/Finder
  getPathForFile: file => webUtils.getPathForFile(file),

  // Funciones FTP a través de IPC (ejecutadas en el proceso principal)
  ftpConnect: config => ipcRenderer.invoke('ftp-connect', config),
  ftpListDirectory: remotePath => ipcRenderer.invoke('ftp-list-directory', remotePath),
  ftpIsDirectory: remotePath => ipcRenderer.invoke('ftp-is-directory', remotePath),
  ftpTransfer: job => ipcRenderer.invoke('ftp-transfer', job),
  ftpCancel: () => ipcRenderer.invoke('ftp-cancel'),
  ftpDisconnect: () => ipcRenderer.invoke('ftp-disconnect'),

  onTransferProgress: callback => subscribe('transfer-progress', callback),
  onConnectionChange: callback => subscribe('ftp-connection', callback),
});
