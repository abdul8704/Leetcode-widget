const { contextBridge } = require("electron");
const Store = require("electron-store");
const StoreClass = Store.default || Store;
require('dotenv').config();

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
  },

  fetchStats: async () => {
    if (!store) {
      throw new Error("Store unavailable");
    }
    const handle = store.get("leetcodeHandle");
    if (!handle) return null;

    const res = await fetch(`https://leetcode-widget-server.onrender.com/leetcode/stats/${handle}`);
    const json = await res.json();
    console.log("[preload] fetchStats response", { status: res.status, json });
    return json;
  }
});
