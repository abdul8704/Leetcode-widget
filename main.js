const { app, BrowserWindow, screen } = require("electron");
const path = require("path");

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y } = primaryDisplay.workArea;

  const win = new BrowserWindow({
    width: 330,
    height: 420,
    x: x + 8,
    y: y + 8,
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
}

app.whenReady().then(() => {
  createWindow();
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe')
  });
});
