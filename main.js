const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const path = require("path");
const Store = require("electron-store");
const account = require("./account");

const StoreClass = Store.default || Store;
const windowStore = new StoreClass({ projectName: "LeetCodeWidget", name: "window" });

// The widget starts in the top-left corner of the primary display's work area;
// once dragged, its top-left corner stays where the user put it.
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

function defaultPosition() {
  const { x, y } = screen.getPrimaryDisplay().workArea;
  return { x: x + MARGIN, y: y + MARGIN };
}

/** The saved position, if it still lands on a connected display. */
function savedPosition() {
  const pos = windowStore.get("position");
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
    pos.x >= a.x - 20 && pos.y >= a.y - 20 && pos.x < a.x + a.width - 40 && pos.y < a.y + a.height - 40
  );
  return onScreen ? pos : null;
}

function createWindow() {
  const start = savedPosition() || defaultPosition();
  const win = new BrowserWindow({
    ...start,
    width: START_WIDTH,
    height: START_HEIGHT,
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

  // Collapsing/expanding keeps the top-left corner in place.
  ipcMain.on("window:resize", (_event, { width, height }) => {
    const [x, y] = win.getPosition();
    win.setBounds({ x, y, width: Math.round(width), height: Math.round(height) });
    showOnce();
  });

  win.on("moved", () => {
    const [x, y] = win.getPosition();
    windowStore.set("position", { x, y });
  });

  let connected = false;
  const showMenu = () => {
    const send = (action) => () => win.webContents.send("menu:action", action);
    Menu.buildFromTemplate([
      { label: "Refresh", click: send("refresh") },
      connected
        ? { label: "Disconnect AlgoMentor", click: send("disconnect") }
        : { label: "Connect AlgoMentor", click: send("connect") },
      { label: "Reset position", click: () => {
        windowStore.delete("position");
        win.setPosition(defaultPosition().x, defaultPosition().y);
      } },
      { type: "separator" },
      { label: "Quit widget", click: () => app.quit() }
    ]).popup({ window: win });
  };

  ipcMain.on("window:menu", (_event, state) => {
    connected = !!state.connected;
    showMenu();
  });
  ipcMain.on("window:state", (_event, state) => {
    connected = !!state.connected;
  });
  // Right-clicks on drag regions go to the OS window menu (Windows); show ours instead.
  win.on("system-context-menu", (event) => {
    event.preventDefault();
    showMenu();
  });

  win.webContents.on("console-message", (_event, _level, message, line, sourceId) => {
    console.log("[renderer]", message, { sourceId, line });
  });

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[preload-error]", preloadPath, error);
  });
}

// One widget at a time: a second launch (e.g. login item + manual start) just exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else app.whenReady().then(() => {
  createWindow();
  // Start with Windows/macOS. An unpackaged run (npm start) must also pass the app folder to electron.exe.
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()]
  });
});
