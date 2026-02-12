const { contextBridge } = require("electron");

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
  console.log("[preload] initialized", {
    storePath: store.path
  });
} catch (error) {
  console.error("[preload] store init failed, falling back to in-memory store", error);
}

contextBridge.exposeInMainWorld("api", {
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
