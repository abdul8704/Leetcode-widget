const { contextBridge, ipcRenderer } = require("electron");

let store = null;
let inMemoryStore = {
  leetcodeHandle: null
};

try {
  const Store = require("electron-store");
  const StoreClass = Store.default || Store;

  store = new StoreClass({
    projectName: "LeetCodeWidget"
  });
  // Clear any existing keys on startup so we always begin
  // from a clean state (e.g. forget previously saved handles).
  // try {
  //   store.clear();
  //   console.log("[preload] store cleared on startup");
  // } catch (clearError) {
  //   console.error("[preload] failed to clear store on startup", clearError);
  // }
  console.log("[preload] initialized", {
    storePath: store.path
  });
} catch (error) {
  console.error("[preload] store init failed, falling back to in-memory store", error);
}

contextBridge.exposeInMainWorld("api", {
  resizeWindow: (width, height) => {
    ipcRenderer.send("resize-window", { width, height });
  },

  getHandle: () => {
    if (store) {
      const handle = store.get("leetcodeHandle");
      console.log("[preload] getHandle (persistent)", { handle });
      return handle;
    }

    console.warn("[preload] getHandle using in-memory store");
    return inMemoryStore.leetcodeHandle || null;
  },

  setHandle: (handle) => {
    if (store) {
      console.log("[preload] setHandle (persistent)", { handle });
      store.set("leetcodeHandle", handle);
      const saved = store.get("leetcodeHandle");
      console.log("[preload] setHandle saved", { saved });
      return saved;
    }

    console.warn("[preload] setHandle using in-memory store", { handle });
    inMemoryStore.leetcodeHandle = handle;
    return handle;
  },

  fetchStats: async () => {
    const handle = store ? store.get("leetcodeHandle") : inMemoryStore.leetcodeHandle;
    if (!handle) return null;

    const res = await fetch(`https://leetcode-widget-server.onrender.com/leetcode/stats/${handle}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch stats (${res.status})`);
    }
    console.log(res);
    const json = await res.json();
    if (!json || typeof json !== "object") {
      throw new Error("Invalid stats response");
    }
    console.log("[preload] fetchStats response", { status: res.status, json });
    return json;
  }
});
