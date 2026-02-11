const { contextBridge } = require("electron");
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

    const res = await fetch(`http://localhost:4000/leetcode/stats/${handle}`);
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
