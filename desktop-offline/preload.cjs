const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopOffline', {
  saveThreads: (scope, threads) => ipcRenderer.invoke('offline:saveThreads', scope, threads),
  readThreads: (scope) => ipcRenderer.invoke('offline:readThreads', scope),
  saveMessages: (key, thread, messages) => ipcRenderer.invoke('offline:saveMessages', key, thread, messages),
  readMessages: (key) => ipcRenderer.invoke('offline:readMessages', key),
  cacheMedia: (url) => ipcRenderer.invoke('offline:cacheMedia', url),
  dataPath: () => ipcRenderer.invoke('offline:dataPath')
});