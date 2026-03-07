const { app, BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");

const EXPANDED_WIDTH = 330;
const EXPANDED_HEIGHT = 420;
const COLLAPSED_WIDTH = 180;
const COLLAPSED_HEIGHT = 180;
const MARGIN = 8;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  // Start with collapsed size since widget defaults to collapsed
  const win = new BrowserWindow({
    width: COLLAPSED_WIDTH,
    height: COLLAPSED_HEIGHT,
    x: width - COLLAPSED_WIDTH - MARGIN,
    y: y + MARGIN,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));

  win.webContents.on("console-message", (_event, _level, message, line, sourceId) => {
    console.log("[renderer]", message, { sourceId, line });
  });

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[preload-error]", preloadPath, error);
  });

  ipcMain.on("resize-window", (_event, { width: newWidth, height: newHeight }) => {
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    const newX = workArea.x + workArea.width - newWidth - MARGIN;
    const newY = workArea.y + MARGIN;
    win.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight });
  });
}

app.whenReady().then(() => {
  createWindow();
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe')
  });
});
