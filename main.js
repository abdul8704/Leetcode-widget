const { app, BrowserWindow, screen, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
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

const POSITION_FILE = () => path.join(app.getPath("userData"), "window-position.json");

function loadPosition() {
  try {
    const { x, y } = JSON.parse(fs.readFileSync(POSITION_FILE(), "utf8"));
    if (Number.isInteger(x) && Number.isInteger(y)) {
      // Ignore a saved spot that is no longer on any screen (unplugged monitor, new resolution).
      const visible = screen.getAllDisplays().some(({ workArea: a }) =>
        x >= a.x && y >= a.y && x < a.x + a.width - 40 && y < a.y + a.height - 40
      );
      if (visible) return { x, y };
    }
  } catch {}
  const { x, y } = screen.getPrimaryDisplay().workArea;
  return { x: x + MARGIN, y: y + MARGIN };
}

function savePosition() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  try {
    fs.writeFileSync(POSITION_FILE(), JSON.stringify({ x, y }));
  } catch (error) {
    console.error("[window] could not save position", error);
  }
}

// Resizing keeps the top-left corner where the user left it.
function setBoundsTopLeft(width, height) {
  const [cx, cy] = win.getPosition();
  const a = screen.getDisplayMatching(win.getBounds()).workArea;
  const x = Math.max(a.x, Math.min(cx, a.x + a.width - width));
  const y = Math.max(a.y, Math.min(cy, a.y + a.height - height));
  win.setBounds({ x, y, width, height });
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
  const { x, y } = loadPosition();

  // Start collapsed; the renderer expands the window when it needs the space.
  win = new BrowserWindow({
    width: COLLAPSED_WIDTH,
    height: COLLAPSED_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    resizable: true,
    // LeetCode logo in the taskbar (the packaged exe also gets it from build.icon).
    icon: path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png"),
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
  win.on("moved", savePosition);
}

const SUPPORTED_SIZES = new Set(["180x180", "330x330", "460x420"]);

ipcMain.on("resize-window", (_event, bounds) => {
  const { width, height } = bounds || {};
  if (win && Number.isInteger(width) && Number.isInteger(height) && SUPPORTED_SIZES.has(`${width}x${height}`)) {
    setBoundsTopLeft(width, height);
  }
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

// The login item and a manual start must not open two widgets.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) win.show();
  });
}

// Same id as build.appId, so Windows groups the taskbar button (and its icon) under this app.
if (process.platform === "win32") app.setAppUserModelId("com.abdulaziz.leetcodewidget");

app.whenReady().then(() => {
  if (!gotLock) return;
  createWindow();
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    // Running from source (npm start): the login item must launch Electron with this app's folder.
    args: app.isPackaged ? [] : [app.getAppPath()]
  });
});
