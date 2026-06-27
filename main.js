'use strict';

const { app, BrowserWindow, nativeImage, ipcMain, globalShortcut, session } = require('electron');
const { spawn }              = require('child_process');
const path                   = require('path');

const ICON_PATH = path.join(__dirname, 'icon.png');

let mainWindow    = null;
let pythonProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1160,
    height:   800,
    minWidth: 860,
    minHeight: 620,
    icon: ICON_PATH,
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
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  // When packaged, __dirname points inside the .asar virtual filesystem which
  // Python cannot access. Use the unpacked path instead so the script exists
  // as a real file on disk.
  const appDir = app.isPackaged
    ? app.getAppPath().replace('app.asar', 'app.asar.unpacked')
    : __dirname;
  const scriptPath = path.join(appDir, 'beatrice_audio.py');
  console.log('[Beatrice] Spawning Python audio backend:', scriptPath);

  // Writable user data folder setup
  const userDataPath = app.getPath('userData');
  const customModelsPath = path.join(userDataPath, 'custom_models');
  const fs = require('fs');
  if (!fs.existsSync(customModelsPath)) {
    try {
      fs.mkdirSync(customModelsPath, { recursive: true });
    } catch (e) {
      console.error('[Beatrice] Failed to create custom_models directory:', e);
    }
  }

  // Migrate legacy custom models from project root to userData during development/startup
  const legacyCustomModelsPath = path.join(__dirname, 'custom_models');
  if (fs.existsSync(legacyCustomModelsPath) && legacyCustomModelsPath !== customModelsPath) {
    try {
      const folders = fs.readdirSync(legacyCustomModelsPath);
      for (const folder of folders) {
        const srcFolder = path.join(legacyCustomModelsPath, folder);
        const destFolder = path.join(customModelsPath, folder);
        if (fs.statSync(srcFolder).isDirectory()) {
          if (!fs.existsSync(destFolder)) {
            console.log(`[Beatrice] Migrating custom model: ${folder}`);
            fs.cpSync(srcFolder, destFolder, { recursive: true });
          }
        }
      }
    } catch (err) {
      console.error('[Beatrice] Migration of legacy custom models failed:', err);
    }
  }

  // Pass writable custom models base path to Python backend
  const env = Object.assign({}, process.env, {
    BEATRICE_CUSTOM_MODELS_DIR: customModelsPath
  });

  let spawnCmd = 'python3';
  let spawnArgs = ['-u', scriptPath];

  if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process');
      const isArm = execSync('sysctl -in hw.optional.arm64').toString().trim() === '1';
      if (isArm) {
        spawnCmd = 'arch';
        spawnArgs = ['-arm64', 'python3', '-u', scriptPath];
      }
    } catch (e) {
      console.error('[Beatrice] Failed to check for Apple Silicon:', e);
    }
  }

  pythonProcess = spawn(spawnCmd, spawnArgs, {
    cwd: appDir,
    env: env
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
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(ICON_PATH);
    app.dock.setIcon(icon);
  }
  
  // Strip Referer and Origin headers for MyInstants requests to bypass CORS/access restrictions
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.myinstants.com/*'] },
    (details, callback) => {
      delete details.requestHeaders['Referer'];
      delete details.requestHeaders['Origin'];
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

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
  globalShortcut.unregisterAll();
  if (pythonProcess) {
    console.log('[Beatrice] Terminating Python backend…');
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
});

// IPC Handler for soundboard global keybinds
ipcMain.on('register-sound-shortcuts', (event, shortcuts) => {
  globalShortcut.unregisterAll();

  shortcuts.forEach(s => {
    try {
      const ok = globalShortcut.register(s.keybind, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('play-sound-slot', s.index);
        }
      });
      if (!ok) {
        console.warn(`[Keybind] Failed to register global shortcut: ${s.keybind}`);
      }
    } catch (err) {
      console.error(`[Keybind] Error registering shortcut ${s.keybind}:`, err);
    }
  });
});

// IPC Handler to get the app userData path synchronously
ipcMain.on('get-user-data-path', (event) => {
  event.returnValue = app.getPath('userData');
});

