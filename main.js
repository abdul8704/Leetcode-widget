const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const account = require("./account");

// Errors thrown inside ipcMain.handle lose their code, so every call returns { ok, ... }.
function wrap(fn) {
  return async (...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      return { ok: false, code: error.code || "error", error: error.message || "Something went wrong" };
    }
  };
}

ipcMain.handle("account:status", wrap(() => account.getStatus()));
ipcMain.handle("account:connect", wrap((event) =>
  account.connect((info) => event.sender.send("account:code", info))
));
ipcMain.handle("account:cancel", wrap(() => account.cancelConnect()));
ipcMain.handle("account:reopen", wrap(() => account.reopenBrowser()));
ipcMain.handle("account:summary", wrap(() => account.fetchSummary()));
ipcMain.handle("account:disconnect", wrap(() => account.disconnect()));

function createWindow() {
  const win = new BrowserWindow({
    width: 330,
    height: 480,
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
