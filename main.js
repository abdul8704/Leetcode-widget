const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const path = require("path");
const account = require("./account");

// The widget sits in the top-left corner of the primary display's work area.
const MARGIN = 8;
const START_WIDTH = 400;
const START_HEIGHT = 290;

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

function cornerBounds(width, height) {
  const { x, y } = screen.getPrimaryDisplay().workArea;
  return { x: x + MARGIN, y: y + MARGIN, width: Math.round(width), height: Math.round(height) };
}

function createWindow() {
  const win = new BrowserWindow({
    ...cornerBounds(START_WIDTH, START_HEIGHT),
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));

  // Shown once the renderer has sized the window for its first state (collapsed or expanded).
  let shown = false;
  const showOnce = () => {
    if (!shown && !win.isDestroyed()) {
      shown = true;
      win.showInactive();
    }
  };
  setTimeout(showOnce, 3000);

  ipcMain.on("window:resize", (_event, { width, height }) => {
    win.setBounds(cornerBounds(width, height));
    showOnce();
  });

  ipcMain.on("window:menu", (event, { connected }) => {
    const send = (action) => () => event.sender.send("menu:action", action);
    Menu.buildFromTemplate([
      { label: "Refresh", click: send("refresh") },
      connected
        ? { label: "Disconnect AlgoMentor", click: send("disconnect") }
        : { label: "Connect AlgoMentor", click: send("connect") },
      { type: "separator" },
      { label: "Quit widget", click: () => app.quit() }
    ]).popup({ window: win });
  });

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
