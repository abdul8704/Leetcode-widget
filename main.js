const { app, BrowserWindow, screen, ipcMain, Menu } = require("electron");
const path = require("path");
const account = require("./account");

const COLLAPSED_WIDTH = 180;
const COLLAPSED_HEIGHT = 180;
const MARGIN = 8;

let win = null;

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

function setBoundsTopLeft(width, height) {
  const { x, y } = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: x + MARGIN, y: y + MARGIN, width, height });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

// Right-clicks on the card's drag area never reach the page on Windows, so the same menu
// is also opened from the "..." button.
function showMenu() {
  const connected = account.getStatus().connected;
  const template = [
    { label: "Refresh", click: () => send("menu:refresh") },
    connected
      ? { label: "Disconnect AlgoMentor", click: () => send("menu:disconnect") }
      : { label: "Connect AlgoMentor", click: () => send("menu:connect") },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ];
  Menu.buildFromTemplate(template).popup({ window: win });
}

function createWindow() {
  const { x, y } = screen.getPrimaryDisplay().workArea;

  // Start collapsed; the renderer expands the window when it needs the space.
  win = new BrowserWindow({
    width: COLLAPSED_WIDTH,
    height: COLLAPSED_HEIGHT,
    x: x + MARGIN,
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

  win.webContents.on("context-menu", showMenu);
}

ipcMain.on("resize-window", (_event, { width, height }) => {
  if (win) setBoundsTopLeft(width, height);
});
ipcMain.on("show-menu", showMenu);

ipcMain.handle("account:status", wrap(() => account.getStatus()));
ipcMain.handle("account:connect", wrap((event) =>
  account.connect((info) => event.sender.send("account:code", info))
));
ipcMain.handle("account:cancel", wrap(() => account.cancelConnect()));
ipcMain.handle("account:reopen", wrap(() => account.reopenBrowser()));
ipcMain.handle("account:summary", wrap(() => account.fetchSummary()));
ipcMain.handle("account:disconnect", wrap(() => account.disconnect()));

app.whenReady().then(() => {
  createWindow();
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe')
  });
});
