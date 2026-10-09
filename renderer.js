const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let pieChartInstance = null;
let lineChartInstance = null;
let refreshIntervalId = null;
let isLoadingData = false;
// "account" = connected to AlgoMentor, "legacy" = LeetCode username only.
let mode = null;
const DEFAULT_SAVE_BUTTON_LABEL = "Save";

const PLATFORMS = {
  leetcode: { label: "LeetCode", color: "#ffa116" },
  codeforces: { label: "Codeforces", color: "#3b9ae1" },
  atcoder: { label: "AtCoder", color: "#c9c9c9" },
  cses: { label: "CSES", color: "#7aa2f7" }
};

function platformInfo(key) {
  return PLATFORMS[key] || { label: key.charAt(0).toUpperCase() + key.slice(1), color: "#9a9a9a" };
}

function $(id) {
  return document.getElementById(id);
}

function showLoading() {
  $("loadingScreen").style.display = "flex";
}

function hideLoading() {
  $("loadingScreen").style.display = "none";
}

// ---------------- charts ----------------

function drawDoughnut(easy, medium, hard) {
  if (pieChartInstance) {
    pieChartInstance.destroy();
  }
  pieChartInstance = new Chart($("pieChart"), {
    type: "doughnut",
    data: {
      labels: ["Easy", "Medium", "Hard"],
      datasets: [{
        data: [easy, medium, hard],
        backgroundColor: ["#00b8a3", "#ffc01e", "#ef4743"],
        borderWidth: 0,
        spacing: 2,
        borderRadius: 6,
        hoverOffset: 0
      }]
    },
    options: {
      cutout: "89%",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

function drawLine(labels, counts) {
  if (lineChartInstance) {
    lineChartInstance.destroy();
  }
  lineChartInstance = new Chart($("barChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: counts,
        borderColor: "#00b8a3",
        backgroundColor: "rgba(0, 184, 163, 0.15)",
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function setDifficultyCounts(total, easy, medium, hard) {
  $("solvedCount").innerText = total;
  $("easyCount").innerText = easy;
  $("mediumCount").innerText = medium;
  $("hardCount").innerText = hard;
}

// ---------------- AlgoMentor (account) mode ----------------

function platformRow(key, count, { bar } = {}) {
  const info = platformInfo(key);
  const row = document.createElement("div");
  row.className = "platform-row";

  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = info.color;

  const name = document.createElement("span");
  name.className = "platform-name";
  name.textContent = info.label;

  const value = document.createElement("span");
  value.className = "platform-count";
  value.textContent = count;

  row.append(dot, name);
  if (bar !== undefined) {
    const track = document.createElement("div");
    track.className = "platform-bar";
    const fill = document.createElement("span");
    fill.style.width = `${bar}%`;
    fill.style.background = info.color;
    track.appendChild(fill);
    row.appendChild(track);
  }
  row.appendChild(value);
  return row;
}

function renderToday(solvedToday) {
  $("todayCount").textContent = solvedToday.total;

  const list = $("todayBreakdown");
  list.replaceChildren();
  if (!solvedToday.platforms.length) {
    const empty = document.createElement("div");
    empty.className = "today-empty";
    empty.textContent = "Nothing solved yet today.";
    list.appendChild(empty);
    return;
  }
  solvedToday.platforms.forEach((p) => list.appendChild(platformRow(p.platform, p.count)));
}

function renderPlatforms(platforms, total) {
  const list = $("platformList");
  list.replaceChildren();
  const active = platforms.filter((p) => p.solved > 0).sort((a, b) => b.solved - a.solved);
  list.style.display = active.length ? "grid" : "none";
  active.forEach((p) => {
    const pct = total > 0 ? Math.max(3, Math.round((p.solved / total) * 100)) : 0;
    list.appendChild(platformRow(p.platform, p.solved, { bar: pct }));
  });
}

function renderSummary(data) {
  const totals = data.totals || {};
  const easy = Number(totals.easy) || 0;
  const medium = Number(totals.medium) || 0;
  const hard = Number(totals.hard) || 0;
  const total = Number(totals.solved) || (easy + medium + hard);

  setDifficultyCounts(total, easy, medium, hard);
  drawDoughnut(easy, medium, hard);
  renderToday(data.solvedToday || { total: 0, platforms: [] });
  renderPlatforms(data.platforms || [], total);

  const days = data.last7Days || [];
  drawLine(
    days.map((d) => {
      const [y, m, day] = d.date.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, day)).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
    }),
    days.map((d) => Number(d.count) || 0)
  );

  $("accountName").textContent = data.user && data.user.name ? `AlgoMentor · ${data.user.name}` : "AlgoMentor";
}

function toggleToday() {
  const card = $("todayCard");
  const expanded = card.getAttribute("aria-expanded") === "true";
  card.setAttribute("aria-expanded", String(!expanded));
  $("todayBreakdown").style.display = expanded ? "none" : "grid";
}

async function loadAccountData() {
  const result = await window.account.fetchSummary();
  if (!result.ok) {
    if (result.code === "unauthorized") {
      // Revoked from AlgoMentor (or token cleared): go back to the connect screen.
      stopAutoRefresh();
      mode = null;
      showSetupScreen("This widget was disconnected. Connect again.");
      return;
    }
    throw new Error(result.error);
  }
  renderSummary(result.data);
}

// ---------------- LeetCode-handle (legacy) mode ----------------

async function loadLegacyData() {
  const data = await window.api.fetchStats();
  console.log("[renderer] loadData data", data);
  if (!data || typeof data !== "object") {
    return;
  }

  const easy = Number(data.easy) || 0;
  const medium = Number(data.medium) || 0;
  const hard = Number(data.hard) || 0;
  const total = Number(data.total) || (easy + medium + hard);

  setDifficultyCounts(total, easy, medium, hard);
  drawDoughnut(easy, medium, hard);

  const hasDailyObject = data.daily && !Array.isArray(data.daily) && typeof data.daily === "object";
  let dailyLabels = [];
  let dailyCounts = [];

  if (hasDailyObject) {
    dailyLabels = Object.keys(data.daily);
    dailyCounts = Object.values(data.daily).map((count) => Number(count) || 0);
  } else if (Array.isArray(data.daily)) {
    dailyCounts = data.daily.map((count) => Number(count) || 0);
    dailyLabels = Array.isArray(data.dailyDates)
      ? data.dailyDates
      : dailyCounts.map((_, i) => `D${i + 1}`);
  }

  if (dailyCounts.length === 0) {
    dailyLabels = ["Today"];
    dailyCounts = [0];
  }

  const lastDailyCount = dailyCounts[dailyCounts.length - 1] || 0;
  $("dailySolvedCount").innerText = `Number of questions solved today: ${lastDailyCount}`;

  drawLine(dailyLabels, dailyCounts);
}

// ---------------- shared flow ----------------

async function loadData({ showSpinner = true } = {}) {
  if (isLoadingData) {
    return;
  }
  isLoadingData = true;
  console.log("[renderer] loadData start", { mode });
  if (showSpinner) {
    showLoading();
  }
  try {
    if (mode === "account") {
      await loadAccountData();
    } else if (mode === "legacy") {
      await loadLegacyData();
    }
  } finally {
    if (showSpinner) {
      hideLoading();
    }
    isLoadingData = false;
  }
}

function showSetupPane(pane) {
  ["setupConnect", "setupWaiting", "setupLegacy"].forEach((id) => {
    $(id).style.display = id === pane ? "block" : "none";
  });
}

function showSetupScreen(message) {
  $("setupScreen").style.display = "flex";
  $("widgetContent").style.display = "none";
  showSetupPane("setupConnect");
  $("setupTitle").innerText = message || "Connect your AlgoMentor account";
}

function showWidget() {
  $("setupScreen").style.display = "none";
  $("widgetContent").style.display = "block";
  const isAccount = mode === "account";
  $("todayCard").style.display = isAccount ? "block" : "none";
  $("accountFooter").style.display = "flex";
  // Account mode offers Disconnect; a username-only install offers to connect.
  $("disconnectButton").textContent = isAccount ? "Disconnect" : "Connect AlgoMentor";
  if (!isAccount) {
    $("accountName").textContent = `LeetCode · ${window.api.getHandle() || ""}`;
  }
  $("dailySolvedCount").style.display = isAccount ? "none" : "block";
  if (!isAccount) {
    $("platformList").style.display = "none";
  }
}

function stopAutoRefresh() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();

  refreshIntervalId = setInterval(async () => {
    try {
      await loadData({ showSpinner: false });
    } catch (error) {
      console.error("[renderer] auto refresh failed", error);
    }
  }, REFRESH_INTERVAL_MS);
}

async function handleManualRefresh() {
  await loadData({ showSpinner: true });
}

async function enterWidget(nextMode) {
  mode = nextMode;
  showWidget();
  try {
    await loadData();
  } catch (error) {
    console.error("[renderer] initial load failed", error);
  }
  if (mode) {
    startAutoRefresh();
  }
}

// ---------------- connect flow ----------------

async function connectAccount() {
  const button = $("connectButton");
  button.disabled = true;
  showSetupScreen();
  window.account.onLinkCode((info) => {
    $("linkCode").textContent = info.userCode;
    showSetupPane("setupWaiting");
  });

  const result = await window.account.connect();
  button.disabled = false;

  if (result.ok) {
    await enterWidget("account");
    return;
  }
  if (mode === "legacy") {
    // Started from a username-only install: stay on that widget if it didn't work out.
    showWidget();
    return;
  }
  if (result.code === "cancelled") {
    showSetupScreen();
    return;
  }
  const messages = {
    expired_token: "The code expired. Try again.",
    access_denied: "Request denied. Try again.",
    network: "Can't reach AlgoMentor. Check your connection."
  };
  showSetupScreen(messages[result.code] || result.error || "Could not connect. Try again.");
}

async function disconnectAccount() {
  stopAutoRefresh();
  await window.account.disconnect();
  mode = null;
  showSetupScreen();
}

// ---------------- legacy handle setup ----------------

function setSaveButtonLoading(isLoading) {
  const saveButton = $("saveHandleButton");
  if (!saveButton) {
    return;
  }

  if (!saveButton.dataset.defaultLabel) {
    saveButton.dataset.defaultLabel = saveButton.textContent || DEFAULT_SAVE_BUTTON_LABEL;
  }

  if (isLoading) {
    saveButton.disabled = true;
    saveButton.innerHTML = '<span class="button-spinner" aria-hidden="true"></span><span>Saving...</span>';
    return;
  }

  saveButton.disabled = false;
  saveButton.textContent = saveButton.dataset.defaultLabel;
}

async function saveHandle() {
  const handle = $("username").value.trim();
  if (!handle) return;

  const title = document.querySelector("#setupLegacy h3");
  try {
    setSaveButtonLoading(true);
    if (!window.api || typeof window.api.setHandle !== "function" || typeof window.api.getHandle !== "function") {
      throw new Error("App bridge not available");
    }

    console.log("[renderer] saveHandle click", { handle });
    window.api.setHandle(handle);
    const savedHandle = window.api.getHandle();
    if (savedHandle !== handle) {
      throw new Error("Unable to save handle");
    }
    console.log("[renderer] saveHandle after setHandle", { savedHandle });

    await enterWidget("legacy");
  } catch (error) {
    console.error("[renderer] saveHandle error", error);
    showSetupScreen();
    showSetupPane("setupLegacy");
    if (title) {
      title.innerText = error.message || "Unable to save handle";
    }
  } finally {
    setSaveButtonLoading(false);
  }
}

function bind(id, event, handler) {
  const element = $(id);
  if (element) {
    element.addEventListener(event, handler);
  } else {
    console.warn("[renderer] element not found", id);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  bind("connectButton", "click", connectAccount);
  bind("cancelButton", "click", () => window.account.cancelConnect());
  bind("reopenButton", "click", () => window.account.reopenBrowser());
  bind("legacyLink", "click", () => showSetupPane("setupLegacy"));
  bind("backButton", "click", () => showSetupPane("setupConnect"));
  bind("saveHandleButton", "click", saveHandle);
  bind("refreshButton", "click", handleManualRefresh);
  bind("disconnectButton", "click", () => (mode === "account" ? disconnectAccount() : connectAccount()));
  bind("todayCard", "click", toggleToday);
  bind("todayCard", "keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleToday();
    }
  });

  if (!window.account || !window.api) {
    showSetupScreen("App bridge not available");
    return;
  }

  const status = await window.account.getStatus();
  const info = status.ok ? status.data : { connected: false, legacyHandle: "" };

  if (info.connected) {
    await enterWidget("account");
  } else if (info.legacyHandle) {
    // Existing install that only knows a LeetCode username: keep it working.
    await enterWidget("legacy");
  } else {
    showSetupScreen();
  }
});
