const { safeStorage, shell } = require("electron");
const Store = require("electron-store");
const StoreClass = Store.default || Store;

// Runs in the main process only: the AlgoMentor token never reaches the renderer.
const BASE_URL = (process.env.ALGOMENTOR_URL || "https://dsa-mentor-seven.vercel.app").replace(/\/$/, "");
const DEVICE_NAME = `LeetCode Widget on ${
  { win32: "Windows", darwin: "macOS", linux: "Linux" }[process.platform] || process.platform
}`;

const store = new StoreClass({ projectName: "LeetCodeWidget" });

class AccountError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------- token storage ----------

function saveSession(token, name) {
  if (safeStorage.isEncryptionAvailable()) {
    store.set("algomentorTokenEnc", safeStorage.encryptString(token).toString("base64"));
    store.delete("algomentorToken");
  } else {
    // No OS keychain (e.g. some Linux setups): fall back to the app's config file.
    store.set("algomentorToken", token);
    store.delete("algomentorTokenEnc");
  }
  store.set("algomentorName", name || "");
}

function loadToken() {
  const enc = store.get("algomentorTokenEnc");
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, "base64"));
    } catch (error) {
      console.error("[account] token decrypt failed", error);
      clearSession();
      return null;
    }
  }
  return store.get("algomentorToken") || null;
}

function clearSession() {
  store.delete("algomentorTokenEnc");
  store.delete("algomentorToken");
  store.delete("algomentorName");
}

function getStatus() {
  return {
    connected: !!loadToken(),
    name: store.get("algomentorName") || "",
    legacyHandle: store.get("leetcodeHandle") || "",
  };
}

// ---------- HTTP ----------

async function request(path, { method = "GET", body, token, signal } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON error page
  }
  return { res, json };
}

function errorFrom({ res, json }) {
  const code = (json && json.error && json.error.code) || `http_${res.status}`;
  const message = (json && json.error && json.error.message) || `Request failed (${res.status})`;
  return new AccountError(code, message);
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new AccountError("cancelled", "Cancelled"));
      },
      { once: true }
    );
  });

// ---------- pairing flow ----------

let pending = null;
let lastVerifyUrl = null;

function openVerifyUrl(url) {
  // Only ever open our own site, whatever the server response says.
  if (url && new URL(url).origin === new URL(BASE_URL).origin) {
    return shell.openExternal(url);
  }
}

function reopenBrowser() {
  return openVerifyUrl(lastVerifyUrl);
}

/** Starts pairing, opens the browser, and resolves once the user approves. onCode gets { userCode, verifyUrl }. */
async function connect(onCode) {
  if (pending) pending.abort();
  const ctrl = new AbortController();
  pending = ctrl;
  try {
    const start = await request("/api/widget/v1/link/start", {
      method: "POST",
      body: { deviceName: DEVICE_NAME },
      signal: ctrl.signal,
    });
    if (!start.res.ok) throw errorFrom(start);

    const { deviceCode, userCode, verifyUrl, expiresIn, interval } = start.json;
    lastVerifyUrl = verifyUrl;
    onCode({ userCode, verifyUrl });
    await openVerifyUrl(verifyUrl);

    const deadline = Date.now() + expiresIn * 1000;
    let failures = 0;
    while (Date.now() < deadline) {
      await sleep(Math.max(2, interval || 2) * 1000, ctrl.signal);

      let poll;
      try {
        poll = await request("/api/widget/v1/link/token", {
          method: "POST",
          body: { deviceCode },
          signal: ctrl.signal,
        });
      } catch (error) {
        if (ctrl.signal.aborted) throw new AccountError("cancelled", "Cancelled");
        if (++failures > 15) throw new AccountError("network", "Can't reach AlgoMentor.");
        continue;
      }
      failures = 0;

      if (poll.res.ok) {
        saveSession(poll.json.token, poll.json.user && poll.json.user.name);
        return { name: (poll.json.user && poll.json.user.name) || "" };
      }
      const error = errorFrom(poll);
      if (error.code === "authorization_pending") continue;
      if (error.code === "rate_limited") {
        await sleep(5000, ctrl.signal);
        continue;
      }
      throw error;
    }
    throw new AccountError("expired_token", "The code expired. Try again.");
  } finally {
    if (pending === ctrl) pending = null;
  }
}

function cancelConnect() {
  if (pending) pending.abort();
}

// ---------- data ----------

async function fetchSummary() {
  const token = loadToken();
  if (!token) throw new AccountError("unauthorized", "Not connected");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const out = await request(`/api/widget/v1/me/summary?tz=${encodeURIComponent(tz)}`, { token });
  if (out.res.status === 401) {
    clearSession();
    throw new AccountError("unauthorized", "This widget was disconnected from AlgoMentor.");
  }
  if (!out.res.ok) throw errorFrom(out);
  return out.json.data;
}

async function disconnect() {
  const token = loadToken();
  clearSession();
  if (token) {
    try {
      await request("/api/widget/v1/me/token", { method: "DELETE", token });
    } catch {
      // Already disconnected locally; the user can also revoke it in AlgoMentor settings.
    }
  }
}

module.exports = { getStatus, connect, cancelConnect, reopenBrowser, fetchSummary, disconnect, AccountError };
