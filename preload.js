const { contextBridge, ipcRenderer } = require('electron');

// Exponemos una API segura para el proceso de renderizado
contextBridge.exposeInMainWorld('electronAPI', {
  // Funciones para IPC con el proceso principal
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  saveConnection: connection => ipcRenderer.invoke('save-connection', connection),
  getConnections: () => ipcRenderer.invoke('get-connections'),
  deleteConnection: name => ipcRenderer.invoke('delete-connection', name),
  listLocalDirectory: directory => ipcRenderer.invoke('list-local-directory', directory),

  // Funciones FTP a través de IPC (ahora ejecutadas en el proceso principal)
  ftpConnect: config => ipcRenderer.invoke('ftp-connect', config),
  ftpListDirectory: remotePath => ipcRenderer.invoke('ftp-list-directory', remotePath),
  ftpDownloadFile: (remotePath, localPath) => ipcRenderer.invoke('ftp-download-file', remotePath, localPath),
  ftpUploadFile: (localPath, remotePath) => ipcRenderer.invoke('ftp-upload-file', localPath, remotePath),
  ftpDisconnect: () => ipcRenderer.invoke('ftp-disconnect'),
});
