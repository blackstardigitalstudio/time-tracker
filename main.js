const {
  app, BrowserWindow, Tray, Menu, globalShortcut,
  ipcMain, powerMonitor, shell, nativeImage, Notification, dialog
} = require('electron');
const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');

const dataFile = path.join(app.getPath('userData'), 'data.json');
const shotsDir = path.join(app.getPath('userData'), 'screenshots');

let state;
let win = null, tray = null, shotTimer = null, idleTimer = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function defaultState() {
  return {
    projects: [
      { id: uid(), name: 'Mario', key: 'M', color: '#22d3ee', rate: 0, vat: '', address: '' },
      { id: uid(), name: 'Luca',  key: 'L', color: '#a78bfa', rate: 0, vat: '', address: '' }
    ],
    sessions: [],
    activeProjectId: null,
    settings: { screenshotIntervalMin: 5, idleTimeoutMin: 5, screenshotsEnabled: true, lang: null },
    issuer: {
      name: '', vat: '', cf: '', address: '', iban: '',
      ivaPercent: 22, prefix: new Date().getFullYear() + '/', counter: 1, note: ''
    }
  };
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const d = defaultState();
    return {
      ...d, ...raw,
      settings: { ...d.settings, ...(raw.settings || {}) },
      issuer: { ...d.issuer, ...(raw.issuer || {}) }
    };
  } catch { return defaultState(); }
}

function saveState() {
  try { fs.writeFileSync(dataFile, JSON.stringify(state, null, 2)); }
  catch (e) { console.error('save error', e); }
}

const openSession = () => state.sessions.find(s => s.end === null);
const broadcast = () => { if (win && !win.isDestroyed()) win.webContents.send('state', state); };

function toggleProject(pid) {
  const now = Date.now();
  const open = openSession();
  if (open) open.end = now;
  if (open && open.projectId === pid) state.activeProjectId = null;
  else { state.sessions.push({ projectId: pid, start: now, end: null, auto: false }); state.activeProjectId = pid; }
  saveState(); broadcast(); updateTray();
}

function stopAll(auto = false) {
  const open = openSession();
  if (open) { open.end = Date.now(); open.auto = auto; }
  state.activeProjectId = null;
  saveState(); broadcast(); updateTray();
}

function checkIdle() {
  const open = openSession();
  if (!open) return;
  const idleSec = powerMonitor.getSystemIdleTime();
  if (idleSec >= (state.settings.idleTimeoutMin || 5) * 60) {
    open.end = Date.now() - idleSec * 1000;
    open.auto = true;
    state.activeProjectId = null;
    saveState(); broadcast(); updateTray();
    try { new Notification({ title: 'TimeTracker', body: 'Timer in pausa per inattività.' }).show(); } catch {}
  }
}

async function takeShot() {
  if (!state.settings.screenshotsEnabled) return;
  const open = openSession();
  if (!open) return;
  if (powerMonitor.getSystemIdleTime() >= (state.settings.idleTimeoutMin || 5) * 60) return;
  const proj = state.projects.find(p => p.id === open.projectId);
  const safe = (proj ? proj.name : 'progetto').replace(/[^\w\-]+/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try { fs.writeFileSync(path.join(shotsDir, `${safe}_${stamp}.png`), await screenshot({ format: 'png' })); }
  catch (e) { console.error('screenshot error', e); }
}

function setupTimers() {
  if (shotTimer) clearInterval(shotTimer);
  if (idleTimer) clearInterval(idleTimer);
  shotTimer = setInterval(takeShot, Math.max(1, state.settings.screenshotIntervalMin || 5) * 60 * 1000);
  idleTimer = setInterval(() => { checkIdle(); updateTray(); }, 15 * 1000);
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  for (const p of state.projects) {
    if (!p.key) continue;
    try { globalShortcut.register(`CommandOrControl+Alt+${p.key.toUpperCase()}`, () => toggleProject(p.id)); } catch (e) {}
  }
  try { globalShortcut.register('CommandOrControl+Alt+0', () => stopAll(false)); } catch {}
  try { globalShortcut.register('CommandOrControl+Alt+T', () => showWindow()); } catch {}
}

function hardenWebContents(contents) {
  // Blocca apertura di nuove finestre e qualsiasi navigazione fuori dall'app.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.on('will-redirect', (e) => e.preventDefault());
  contents.on('will-attach-webview', (e) => e.preventDefault());
}

function createWindow() {
  win = new BrowserWindow({
    width: 500, height: 780, minWidth: 360, minHeight: 520,
    title: 'TimeTracker', backgroundColor: '#0b0f17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false
    }
  });
  win.loadFile('index.html');
  if (process.env.TT_DEBUG) {
    win.webContents.on('console-message', (_e, level, msg, line, src) => console.log(`[renderer ${level}] ${msg} (${src}:${line})`));
    win.webContents.on('did-fail-load', (_e, code, desc) => console.log(`[did-fail-load] ${code} ${desc}`));
    win.webContents.on('preload-error', (_e, p, err) => console.log(`[preload-error] ${err}`));
  }
  hardenWebContents(win.webContents);
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

function showWindow() { if (!win || win.isDestroyed()) createWindow(); win.show(); win.focus(); }

function trayImage() {
  const p = path.join(__dirname, 'icon.png');
  if (fs.existsSync(p)) { try { return nativeImage.createFromPath(p).resize({ width: 18, height: 18 }); } catch {} }
  return nativeImage.createEmpty();
}

function createTray() {
  try {
    tray = new Tray(trayImage());
    if (process.platform === 'darwin') tray.setTitle(' ⏱');
    tray.on('click', () => showWindow());
    updateTray();
  } catch (e) { console.error('tray error', e); }
}

function updateTray() {
  if (!tray) return;
  const active = state.projects.find(p => p.id === state.activeProjectId);
  tray.setToolTip(active ? `In corso: ${active.name}` : 'TimeTracker — fermo');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: active ? `▶ ${active.name}` : 'Nessun timer attivo', enabled: false },
    { type: 'separator' },
    { label: 'Mostra finestra', click: () => showWindow() },
    { label: 'Ferma tutto', click: () => stopAll(false) },
    { type: 'separator' },
    { label: 'Esci', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

// --- IPC ---
ipcMain.handle('get-state', () => state);
ipcMain.handle('get-locale', () => { try { return app.getLocale() || 'en'; } catch { return 'en'; } });
ipcMain.handle('toggle-project', (_e, id) => toggleProject(id));
ipcMain.handle('stop-all', () => stopAll(false));
ipcMain.handle('add-project', (_e, p) => {
  state.projects.push({ id: uid(), name: p.name || 'Nuovo', key: (p.key || '').toUpperCase(), color: p.color || '#22d3ee', rate: +p.rate || 0, vat: p.vat || '', address: p.address || '' });
  saveState(); registerShortcuts(); broadcast(); updateTray();
});
ipcMain.handle('update-project', (_e, p) => {
  const x = state.projects.find(q => q.id === p.id);
  if (x) { x.name = p.name; x.key = (p.key || '').toUpperCase(); x.color = p.color; x.rate = +p.rate || 0; x.vat = p.vat || ''; x.address = p.address || ''; }
  saveState(); registerShortcuts(); broadcast(); updateTray();
});
ipcMain.handle('delete-project', (_e, id) => {
  if (state.activeProjectId === id) stopAll();
  state.projects = state.projects.filter(q => q.id !== id);
  saveState(); registerShortcuts(); broadcast(); updateTray();
});
ipcMain.handle('update-settings', (_e, s) => { state.settings = { ...state.settings, ...s }; saveState(); setupTimers(); broadcast(); });
ipcMain.handle('update-issuer', (_e, o) => { state.issuer = { ...state.issuer, ...o }; saveState(); broadcast(); });
ipcMain.handle('open-shots', () => shell.openPath(shotsDir));
ipcMain.handle('reset-data', () => { state = defaultState(); saveState(); registerShortcuts(); broadcast(); updateTray(); });

ipcMain.handle('export-csv', async (_e, csv) => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath: `report_${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, '﻿' + csv, 'utf8');
  return true;
});

ipcMain.handle('export-pdf', async (_e, html, suggested) => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath: (suggested || `report_${new Date().toISOString().slice(0, 10)}`) + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return false;
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
  hardenWebContents(pdfWin.webContents);
  try {
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const data = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
    fs.writeFileSync(filePath, data);
    return true;
  } catch (e) { console.error('pdf error', e); return false; }
  finally { pdfWin.close(); }
});

// --- Avvio ---
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });
    state = loadState();
    createWindow(); createTray(); registerShortcuts(); setupTimers();
    app.on('activate', () => showWindow());
  });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { app.isQuitting = true; globalShortcut.unregisterAll(); saveState(); });
}
