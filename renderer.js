const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// Window sizes match the card: a small "solved today" tile, or the full card.
const COLLAPSED_SIZE = { width: 180, height: 96 };
const EXPANDED_SIZE = { width: 400, height: 290 };

let pieChartInstance = null;
let lineChartInstance = null;
let refreshIntervalId = null;
let isLoadingData = false;
// "account" = connected to AlgoMentor, "legacy" = LeetCode username only.
let mode = null;
const DEFAULT_SAVE_BUTTON_LABEL = "Save";

// What the panel currently shows: combined totals plus one entry per platform.
let view = {
  totals: { solved: 0, easy: 0, medium: 0, hard: 0 },
  platforms: [],
  days: []
};
let selectedPlatform = null;

const PLATFORMS = {
  leetcode: "LeetCode",
  codeforces: "Codeforces",
  atcoder: "AtCoder",
  cses: "CSES"
};

function platformLabel(key) {
  return PLATFORMS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function platformColor(key) {
  return cssVar(PLATFORMS[key] ? `--${key}` : "--other");
}

function $(id) {
  return document.getElementById(id);
}

function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // preferences are a convenience only
  }
}

function showLoading() {
  $("loadingScreen").style.display = "flex";
}

function hideLoading() {
  $("loadingScreen").style.display = "none";
}

// ---------------- layout ----------------

function isCollapsedPref() {
  return readPref("collapsed") !== "false";
}

/** Sizes the window for the current state; setup screens always use the full card. */
function applyLayout() {
  const onWidget = $("widgetContent").style.display !== "none";
  const collapsed = onWidget && isCollapsedPref();
  $("card").classList.toggle("collapsed", collapsed);
  const size = collapsed ? COLLAPSED_SIZE : EXPANDED_SIZE;
  window.widget.resize(size.width, size.height);
  if (!collapsed && lineChartInstance) {
    // The canvases were hidden while collapsed; let Chart.js re-measure.
    requestAnimationFrame(() => {
      lineChartInstance && lineChartInstance.resize();
      pieChartInstance && pieChartInstance.resize();
    });
  }
}

function setCollapsed(collapsed) {
  writePref("collapsed", String(collapsed));
  applyLayout();
}

function applyTheme() {
  const light = readPref("theme") === "light";
  document.body.classList.toggle("light-theme", light);
  const label = light ? "Switch to dark mode" : "Switch to light mode";
  $("themeButton").title = label;
  $("themeButton").setAttribute("aria-label", label);
  $("themeButton").textContent = light ? "\u{1F31E}" : "\u{1F319}";
}

function toggleTheme() {
  writePref("theme", readPref("theme") === "light" ? "dark" : "light");
  applyTheme();
  renderView();
}

// ---------------- charts ----------------

function drawDoughnut(easy, medium, hard) {
  const data = [easy, medium, hard];
  const colors = [cssVar("--easy"), cssVar("--medium"), cssVar("--hard")];
  if (pieChartInstance) {
    pieChartInstance.data.datasets[0].data = data;
    pieChartInstance.data.datasets[0].backgroundColor = colors;
    pieChartInstance.update();
    return;
  }
  pieChartInstance = new Chart($("pieChart"), {
    type: "doughnut",
    data: {
      labels: ["Easy", "Medium", "Hard"],
      datasets: [{
        data,
        backgroundColor: colors,
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
      animation: { duration: 250 },
      events: [],
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

function formatDay(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** HTML tooltip for the line chart: the day's total and its split by platform. */
function lineTooltip(context) {
  const tip = $("lineTooltip");
  const { chart, tooltip } = context;
  if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
    tip.style.display = "none";
    return;
  }
  const day = view.days[tooltip.dataPoints[0].dataIndex];
  if (!day) {
    tip.style.display = "none";
    return;
  }

  const title = el("div", "tooltip-title");
  title.append(el("span", "", day.label), el("span", "", `${day.count} solved`));
  const children = [title];
  day.platforms.forEach((p) => {
    const row = el("div", "tooltip-row");
    const dot = el("span", "dot");
    dot.style.background = platformColor(p.platform);
    const count = el("b", "", String(p.count));
    row.append(dot, el("span", "", platformLabel(p.platform)), count);
    children.push(row);
  });
  tip.replaceChildren(...children);
  tip.style.display = "block";

  // Keep the box inside the chart area, flipping to the left of the point near the edge.
  const wrap = chart.canvas.parentNode;
  const x = tooltip.caretX;
  const y = tooltip.caretY;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left = x + 10;
  if (left + w > wrap.clientWidth) left = x - w - 10;
  let top = y - h / 2;
  top = Math.max(0, Math.min(top, wrap.clientHeight - h));
  tip.style.left = `${Math.max(0, left)}px`;
  tip.style.top = `${top}px`;
}

function drawLine() {
  const labels = view.days.map((d) => d.label);
  const counts = view.days.map((d) => d.count);
  const accent = cssVar("--accent");
  const accentSoft = cssVar("--accent-soft");
  const muted = cssVar("--muted");
  const grid = cssVar("--grid");

  if (lineChartInstance) {
    lineChartInstance.destroy();
  }
  lineChartInstance = new Chart($("lineChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: counts,
        borderColor: accent,
        backgroundColor: accentSoft,
        pointBackgroundColor: accent,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointHitRadius: 14,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 4, right: 4 } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: muted, font: { size: 10 } } },
        y: {
          beginAtZero: true,
          grid: { color: grid },
          ticks: { color: muted, font: { size: 10 }, precision: 0, maxTicksLimit: 5 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: lineTooltip }
      }
    }
  });
}

// ---------------- panel ----------------

function difficultyFor(key) {
  if (!key) return { ...view.totals, label: "Solved" };
  const p = view.platforms.find((x) => x.platform === key);
  if (!p) return { ...view.totals, label: "Solved" };
  return { solved: p.solved, easy: p.easy, medium: p.medium, hard: p.hard, label: platformLabel(key) };
}

/** Difficulty column and donut follow the hovered platform, or show all platforms. */
function renderSelection() {
  const d = difficultyFor(selectedPlatform);
  $("solvedCount").textContent = d.solved;
  $("solvedLabel").textContent = d.label;
  $("difficultyTitle").textContent = selectedPlatform ? `${platformLabel(selectedPlatform)}` : "Difficulty";
  $("easyCount").textContent = d.easy;
  $("mediumCount").textContent = d.medium;
  $("hardCount").textContent = d.hard;
  drawDoughnut(d.easy, d.medium, d.hard);
  document.querySelectorAll(".platform-row").forEach((row) => {
    row.classList.toggle("active", row.dataset.platform === selectedPlatform);
  });
}

function selectPlatform(key) {
  if (selectedPlatform === key) return;
  selectedPlatform = key;
  renderSelection();
}

function renderPlatforms() {
  const list = $("platformList");
  const active = view.platforms.filter((p) => p.solved > 0).sort((a, b) => b.solved - a.solved);
  if (!active.length) {
    list.replaceChildren(el("div", "platforms-empty", "No solves yet"));
    return;
  }
  list.replaceChildren(...active.map((p) => {
    const row = el("div", "row platform-row");
    row.dataset.platform = p.platform;
    const dot = el("span", "dot");
    dot.style.background = platformColor(p.platform);
    row.append(dot, el("span", "row-name", platformLabel(p.platform)), el("span", "row-count", String(p.solved)));
    row.addEventListener("mouseenter", () => selectPlatform(p.platform));
    return row;
  }));
}

function renderView() {
  if (selectedPlatform && !view.platforms.some((p) => p.platform === selectedPlatform)) {
    selectedPlatform = null;
  }
  renderPlatforms();
  renderSelection();
  drawLine();
}

function setTodayCount(count) {
  $("todayCount").textContent = count;
}

// ---------------- AlgoMentor (account) mode ----------------

function renderSummary(data) {
  const totals = data.totals || {};
  const easy = Number(totals.easy) || 0;
  const medium = Number(totals.medium) || 0;
  const hard = Number(totals.hard) || 0;

  view = {
    totals: { solved: Number(totals.solved) || (easy + medium + hard), easy, medium, hard },
    platforms: (data.platforms || []).map((p) => ({
      platform: p.platform,
      solved: Number(p.solved) || 0,
      easy: Number(p.easy) || 0,
      medium: Number(p.medium) || 0,
      hard: Number(p.hard) || 0
    })),
    days: (data.last7Days || []).map((d) => ({
      label: formatDay(d.date),
      count: Number(d.count) || 0,
      // Older servers send only the combined count.
      platforms: (d.platforms || []).filter((p) => p.count > 0)
    }))
  };
  setTodayCount((data.solvedToday && data.solvedToday.total) || 0);
  renderView();
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
  if (!data || typeof data !== "object") {
    return;
  }

  const easy = Number(data.easy) || 0;
  const medium = Number(data.medium) || 0;
  const hard = Number(data.hard) || 0;
  const total = Number(data.total) || (easy + medium + hard);

  let labels = [];
  let counts = [];
  if (data.daily && !Array.isArray(data.daily) && typeof data.daily === "object") {
    labels = Object.keys(data.daily);
    counts = Object.values(data.daily).map((count) => Number(count) || 0);
  } else if (Array.isArray(data.daily)) {
    counts = data.daily.map((count) => Number(count) || 0);
    labels = Array.isArray(data.dailyDates) ? data.dailyDates : counts.map((_, i) => `D${i + 1}`);
  }
  if (counts.length === 0) {
    labels = ["Today"];
    counts = [0];
  }

  view = {
    totals: { solved: total, easy, medium, hard },
    platforms: [{ platform: "leetcode", solved: total, easy, medium, hard }],
    days: counts.map((count, i) => ({
      label: labels[i],
      count,
      platforms: count > 0 ? [{ platform: "leetcode", count }] : []
    }))
  };
  setTodayCount(counts[counts.length - 1] || 0);
  renderView();
}

// ---------------- shared flow ----------------

async function loadData({ showSpinner = true } = {}) {
  if (isLoadingData) {
    return;
  }
  isLoadingData = true;
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
  applyLayout();
}

function showWidget() {
  $("setupScreen").style.display = "none";
  $("widgetContent").style.display = "block";
  applyLayout();
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
  const previousMode = mode;
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
  if (previousMode === "legacy") {
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

function handleMenuAction(action) {
  if (action === "refresh") {
    loadData().catch((error) => console.error("[renderer] refresh failed", error));
  } else if (action === "disconnect") {
    disconnectAccount();
  } else if (action === "connect") {
    connectAccount();
  }
}

// ---------------- legacy handle setup ----------------

function setSaveButtonLoading(isLoading) {
  const saveButton = $("saveHandleButton");
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
    window.api.setHandle(handle);
    if (window.api.getHandle() !== handle) {
      throw new Error("Unable to save handle");
    }
    await enterWidget("legacy");
  } catch (error) {
    console.error("[renderer] saveHandle error", error);
    showSetupScreen();
    showSetupPane("setupLegacy");
    title.innerText = error.message || "Unable to save handle";
  } finally {
    setSaveButtonLoading(false);
  }
}

function bind(id, event, handler) {
  $(id).addEventListener(event, handler);
}

window.addEventListener("DOMContentLoaded", async () => {
  if (!window.account || !window.api || !window.widget) {
    $("card").textContent = "App bridge not available";
    return;
  }

  applyTheme();
  Chart.defaults.font.family = '"Space Grotesk", "Segoe UI", sans-serif';

  bind("connectButton", "click", connectAccount);
  bind("cancelButton", "click", () => window.account.cancelConnect());
  bind("reopenButton", "click", () => window.account.reopenBrowser());
  bind("legacyLink", "click", () => showSetupPane("setupLegacy"));
  bind("backButton", "click", () => showSetupPane("setupConnect"));
  bind("saveHandleButton", "click", saveHandle);
  bind("expandButton", "click", () => setCollapsed(false));
  bind("collapseButton", "click", () => setCollapsed(true));
  bind("themeButton", "click", toggleTheme);
  // Leaving the platform column goes back to the all-platform breakdown.
  bind("platformList", "mouseleave", () => selectPlatform(null));
  bind("lineChart", "mouseleave", () => ($("lineTooltip").style.display = "none"));

  window.widget.onMenuAction(handleMenuAction);
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    window.widget.showMenu(mode === "account");
  });

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
