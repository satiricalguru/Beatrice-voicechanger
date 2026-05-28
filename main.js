'use strict';

const { app, BrowserWindow } = require('electron');
const { spawn }              = require('child_process');
const path                   = require('path');

let mainWindow    = null;
let pythonProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1160,
    height:   800,
    minWidth: 860,
    minHeight: 620,
    title: 'Project Beatrice – AI Voice Changer',
    // macOS: hide the default titlebar, show traffic lights at correct coords
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 13 },
    backgroundColor: '#05050b',
    show: false,           // avoid white flash on load
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');

  // Uncomment to open DevTools for debugging:
  // mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  const scriptPath = path.join(__dirname, 'beatrice_audio.py');
  console.log('[Beatrice] Spawning Python audio backend:', scriptPath);

  pythonProcess = spawn('python3', ['-u', scriptPath], {
    cwd: __dirname,
  });

  pythonProcess.stdout.on('data', data =>
    console.log('[Python]', data.toString().trimEnd()));

  pythonProcess.stderr.on('data', data =>
    console.error('[Python ERR]', data.toString().trimEnd()));

  pythonProcess.on('error', err =>
    console.error('[Beatrice] Failed to start Python backend:', err.message));

  pythonProcess.on('close', code =>
    console.log('[Beatrice] Python backend exited with code', code));
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS it is conventional to keep the process running
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (pythonProcess) {
    console.log('[Beatrice] Terminating Python backend…');
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
});
