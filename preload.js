const { contextBridge, ipcRenderer } = require("electron");
const Store = require("electron-store");
const StoreClass = Store.default || Store;

let store;
try {
  store = new StoreClass({
    projectName: "LeetCodeWidget"
  });
  console.log("[preload] initialized", {
    storePath: store.path
  });
} catch (error) {
  console.error("[preload] store init failed", error);
}

contextBridge.exposeInMainWorld("account", {
  getStatus: () => ipcRenderer.invoke("account:status"),
  connect: () => ipcRenderer.invoke("account:connect"),
  cancelConnect: () => ipcRenderer.invoke("account:cancel"),
  reopenBrowser: () => ipcRenderer.invoke("account:reopen"),
  fetchSummary: () => ipcRenderer.invoke("account:summary"),
  disconnect: () => ipcRenderer.invoke("account:disconnect"),
  onLinkCode: (callback) => {
    ipcRenderer.removeAllListeners("account:code");
    ipcRenderer.on("account:code", (_event, info) => callback(info));
  }
});

contextBridge.exposeInMainWorld("widget", {
  resize: (width, height) => ipcRenderer.send("window:resize", { width, height }),
  showMenu: (connected) => ipcRenderer.send("window:menu", { connected }),
  onMenuAction: (callback) => {
    ipcRenderer.removeAllListeners("menu:action");
    ipcRenderer.on("menu:action", (_event, action) => callback(action));
  }
});

contextBridge.exposeInMainWorld("api", {
  getHandle: () => {
    if (!store) {
      throw new Error("Store unavailable");
    }
    const handle = store.get("leetcodeHandle");
    console.log("[preload] getHandle", { handle });
    return handle;
  },

  setHandle: (handle) => {
    if (!store) {
      throw new Error("Store unavailable");
    }
    console.log("[preload] setHandle", { handle });
    store.set("leetcodeHandle", handle);
    const saved = store.get("leetcodeHandle");
    console.log("[preload] setHandle saved", { saved });
    return saved;
  },

  fetchStats: async () => {
    if (!store) {
      throw new Error("Store unavailable");
    }
    const handle = store.get("leetcodeHandle");
    if (!handle) return null;

    const res = await fetch(`https://leetcode-widget-server.onrender.com/leetcode/stats/${handle}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch stats (${res.status})`);
    }
    const json = await res.json();
    if (!json || typeof json !== "object") {
      throw new Error("Invalid stats response");
    }
    console.log("[preload] fetchStats response", { status: res.status, json });
    return json;
  }
});
