const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState:       () => ipcRenderer.invoke('get-state'),
  getLocale:      () => ipcRenderer.invoke('get-locale'),
  onState:        (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  toggleProject:  (id) => ipcRenderer.invoke('toggle-project', id),
  stopAll:        () => ipcRenderer.invoke('stop-all'),
  addProject:     (p) => ipcRenderer.invoke('add-project', p),
  updateProject:  (p) => ipcRenderer.invoke('update-project', p),
  deleteProject:  (id) => ipcRenderer.invoke('delete-project', id),
  updateSettings: (s) => ipcRenderer.invoke('update-settings', s),
  updateIssuer:   (o) => ipcRenderer.invoke('update-issuer', o),
  openShots:      () => ipcRenderer.invoke('open-shots'),
  resetData:      () => ipcRenderer.invoke('reset-data'),
  exportCsv:      (csv) => ipcRenderer.invoke('export-csv', csv),
  exportPdf:      (html, name) => ipcRenderer.invoke('export-pdf', html, name),
  isMac:          process.platform === 'darwin'
});
