const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const EXPANDED_WIDTH = 460;
const EXPANDED_HEIGHT = 420;
const COLLAPSED_WIDTH = 180;
const COLLAPSED_HEIGHT = 180;
const SETUP_WIDTH = 330;
const SETUP_HEIGHT = 330;
const THEME_KEY = "widgetTheme";
const DEFAULT_SAVE_BUTTON_LABEL = "Save";

let pieChartInstance = null;
let lineChartInstance = null;
let refreshIntervalId = null;
let isLoadingData = false;
// "account" = connected to AlgoMentor, "legacy" = LeetCode username only.
let mode = null;

const PLATFORMS = {
  leetcode: { label: "LeetCode", color: "#ffa116" },
  codeforces: { label: "Codeforces", color: "#3b9ae1" },
  atcoder: { label: "AtCoder", color: "#b5b5b5" },
  cses: { label: "CSES", color: "#a78bfa" }
};

function platformInfo(key) {
  return PLATFORMS[key] || { label: key.charAt(0).toUpperCase() + key.slice(1), color: "#9a9a9a" };
}

function $(id) {
  return document.getElementById(id);
}

function getCssVar(name) {
  const bodyStyles = getComputedStyle(document.body);
  let value = bodyStyles.getPropertyValue(name);
  if (!value) {
    const rootStyles = getComputedStyle(document.documentElement);
    value = rootStyles.getPropertyValue(name);
  }
  return (value || "").trim();
}

function getThemeColors() {
  const easyColor = getCssVar("--easy") || "#00b8a3";
  const mediumColor = getCssVar("--medium") || "#ffc01e";
  const hardColor = getCssVar("--hard") || "#ef4743";
  const accent = getCssVar("--accent") || easyColor;
  const accentSoft = getCssVar("--accent-soft") || "rgba(0, 184, 163, 0.15)";
  return { easyColor, mediumColor, hardColor, accent, accentSoft };
}

function applyThemeToCharts() {
  const { easyColor, mediumColor, hardColor, accent, accentSoft } = getThemeColors();

  if (pieChartInstance && pieChartInstance.data.datasets[0]) {
    pieChartInstance.data.datasets[0].backgroundColor = [easyColor, mediumColor, hardColor];
    pieChartInstance.update();
  }

  if (lineChartInstance && lineChartInstance.data.datasets[0]) {
    const dataset = lineChartInstance.data.datasets[0];
    dataset.borderColor = accent;
    dataset.backgroundColor = accentSoft;
    lineChartInstance.update();
  }
}

function setCardLoading(isLoading) {
  const cardElement = $("mainCard");
  if (!cardElement) {
    return;
  }

  if (isLoading) {
    cardElement.classList.add("loading");

    let overlay = cardElement.querySelector(".card-loading-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "card-loading-overlay";
      overlay.innerHTML = '<div class="loading-spinner loading-spinner--card" aria-hidden="true"></div>';
      cardElement.appendChild(overlay);
    }
  } else {
    cardElement.classList.remove("loading");
    const overlay = cardElement.querySelector(".card-loading-overlay");
    if (overlay) {
      overlay.remove();
    }
  }
}

function showLoading() {
  $("loadingScreen").style.display = "flex";
}

function hideLoading() {
  $("loadingScreen").style.display = "none";
}

function resizeWindow(width, height) {
  if (window.api && typeof window.api.resizeWindow === "function") {
    window.api.resizeWindow(width, height);
  }
}

// ---------------- charts ----------------

function drawDoughnut(easy, medium, hard) {
  const { easyColor, mediumColor, hardColor } = getThemeColors();
  if (pieChartInstance) {
    pieChartInstance.destroy();
  }
  pieChartInstance = new Chart($("pieChart"), {
    type: "doughnut",
    data: {
      labels: ["Easy", "Medium", "Hard"],
      datasets: [{
        data: [easy, medium, hard],
        backgroundColor: [easyColor, mediumColor, hardColor],
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

/** `details[i].platforms` (optional) is listed in the tooltip for point i. */
function drawLine(labels, counts, details) {
  const { accent, accentSoft } = getThemeColors();
  if (lineChartInstance) {
    lineChartInstance.destroy();
  }
  lineChartInstance = new Chart($("barChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: counts,
        borderColor: accent,
        backgroundColor: accentSoft,
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
      interaction: { mode: "nearest", intersect: true },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            label(context) {
              const lines = [`${context.parsed.y} solved`];
              const day = details && details[context.dataIndex];
              if (day && day.platforms) {
                day.platforms.forEach((p) => lines.push(`${platformInfo(p.platform).label}  ${p.count}`));
              }
              return lines;
            }
          }
        }
      }
    }
  });
}

function setDifficulty(easy, medium, hard) {
  $("easyCount").innerText = easy;
  $("mediumCount").innerText = medium;
  $("hardCount").innerText = hard;
}

function setRing(total, easy, medium, hard) {
  $("solvedCount").innerText = total;
  if (pieChartInstance) {
    pieChartInstance.data.datasets[0].data = [easy, medium, hard];
    pieChartInstance.update("none");
  }
}

// ---------------- AlgoMentor (account) mode ----------------

function renderToday(solvedToday) {
  $("legendTodayCount").innerText = solvedToday.total;
  $("todayStripCount").innerText = solvedToday.total;

  const chips = $("todayStripPlatforms");
  chips.replaceChildren();
  solvedToday.platforms.forEach((p) => {
    const info = platformInfo(p.platform);
    const chip = document.createElement("span");
    chip.className = "today-chip";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = info.color;
    chip.append(dot, `${info.label} ${p.count}`);
    chips.appendChild(chip);
  });
}

function renderPlatforms(platforms, totals) {
  const rows = $("platformRows");
  rows.replaceChildren();

  const combined = {
    solved: totals.solved,
    easy: totals.easy,
    medium: totals.medium,
    hard: totals.hard
  };

  const showStats = (stats, title) => {
    setDifficulty(stats.easy, stats.medium, stats.hard);
    setRing(stats.solved, stats.easy, stats.medium, stats.hard);
    $("difficultyTitle").textContent = title;
  };

  platforms
    .filter((p) => p.solved > 0)
    .sort((a, b) => b.solved - a.solved)
    .forEach((p) => {
      const info = platformInfo(p.platform);
      const row = document.createElement("div");
      row.className = "legend-row";

      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = info.color;

      const name = document.createElement("span");
      name.className = "legend-name";
      name.textContent = info.label;

      const count = document.createElement("span");
      count.className = "legend-count";
      count.textContent = p.solved;

      row.append(dot, name, count);
      row.addEventListener("mouseenter", () => showStats(p, info.label));
      row.addEventListener("mouseleave", () => showStats(combined, "Difficulty"));
      row.tabIndex = 0;
      row.addEventListener("focus", () => showStats(p, info.label));
      row.addEventListener("blur", () => showStats(combined, "Difficulty"));
      rows.appendChild(row);
    });

  showStats(combined, "Difficulty");
}

function renderSummary(data) {
  const totals = data.totals || {};
  const easy = Number(totals.easy) || 0;
  const medium = Number(totals.medium) || 0;
  const hard = Number(totals.hard) || 0;
  const total = Number(totals.solved) || (easy + medium + hard);

  drawDoughnut(easy, medium, hard);
  renderPlatforms(data.platforms || [], { solved: total, easy, medium, hard });
  renderToday(data.solvedToday || { total: 0, platforms: [] });

  const days = data.last7Days || [];
  drawLine(
    days.map((d) => {
      const [y, m, day] = d.date.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, day)).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
    }),
    days.map((d) => Number(d.count) || 0),
    days
  );
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

  setDifficulty(easy, medium, hard);
  drawDoughnut(easy, medium, hard);
  $("solvedCount").innerText = total;

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
  $("legendTodayCount").innerText = lastDailyCount;
  $("todayStripCount").innerText = lastDailyCount;
  $("todayStripPlatforms").replaceChildren();

  drawLine(dailyLabels, dailyCounts, null);
}

// ---------------- shared flow ----------------

async function loadData({ showSpinner = true } = {}) {
  if (isLoadingData) {
    return;
  }
  isLoadingData = true;
  console.log("[renderer] loadData start", { mode });
  setCardLoading(true);
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
    setCardLoading(false);
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
  resizeWindow(SETUP_WIDTH, SETUP_HEIGHT);
}

function showWidget() {
  $("setupScreen").style.display = "none";
  $("widgetContent").style.display = "block";

  const cardElement = $("mainCard");
  cardElement.classList.toggle("legacy", mode === "legacy");
  setCardCollapsed(true, { animate: false });
}

const CARD_ANIMATION_MS = 550;
const CARD_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
let cardAnimationTimer = null;

// Grows or shrinks the card from its current size to its new one. The window is already big
// enough (expanding) or shrinks afterwards (collapsing), so the transparent area hides the resize.
function animateCard(card, change, done) {
  clearTimeout(cardAnimationTimer);
  card.classList.remove("animating");
  card.style.cssText = "";

  const fromWidth = card.offsetWidth;
  const fromHeight = card.offsetHeight;
  change();
  card.style.transition = "none";
  card.style.maxHeight = "none";
  const toWidth = card.offsetWidth;
  const toHeight = card.offsetHeight;

  if (!fromWidth || !fromHeight || (fromWidth === toWidth && fromHeight === toHeight)) {
    card.style.cssText = "";
    done();
    return;
  }

  card.classList.add("animating");
  card.style.width = `${fromWidth}px`;
  card.style.height = `${fromHeight}px`;
  card.getBoundingClientRect();
  card.style.transition = `width ${CARD_ANIMATION_MS}ms ${CARD_EASING}, height ${CARD_ANIMATION_MS}ms ${CARD_EASING}`;
  card.style.width = `${toWidth}px`;
  card.style.height = `${toHeight}px`;

  cardAnimationTimer = setTimeout(() => {
    card.classList.remove("animating");
    card.style.cssText = "";
    done();
  }, CARD_ANIMATION_MS + 30);
}

function setCardCollapsed(collapsed, { animate = true } = {}) {
  const cardElement = $("mainCard");
  const button = $("cardToggleButton");
  const label = collapsed ? "Expand widget" : "Collapse widget";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  const resize = () =>
    resizeWindow(collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH, collapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT);
  const change = () => cardElement.classList.toggle("collapsed", collapsed);

  if (!animate) {
    change();
    resize();
    return;
  }
  if (!collapsed) resize();
  animateCard(cardElement, change, () => {
    if (collapsed) resize();
  });
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
  if (!mode) {
    return;
  }
  try {
    await loadData({ showSpinner: true });
  } catch (error) {
    console.error("[renderer] refresh failed", error);
  }
}

async function enterWidget(nextMode) {
  mode = nextMode;
  showWidget();
  try {
    await loadData({ showSpinner: false });
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
    await handleManualRefresh();
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

// ---------------- theme ----------------

function applyTheme(isLight) {
  const button = $("themeToggleButton");
  document.body.classList.toggle("light-theme", isLight);
  const label = isLight ? "Switch to dark mode" : "Switch to light mode";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.textContent = isLight ? "🌞" : "🌙";
  applyThemeToCharts();
}

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light";
  } catch {
    return false;
  }
}

function saveTheme(isLight) {
  try {
    localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
  } catch {
    // Theme just won't persist.
  }
}

// ---------------- start-up ----------------

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
  bind("cardToggleButton", "click", () => setCardCollapsed(!$("mainCard").classList.contains("collapsed")));
  bind("menuButton", "click", () => window.menu.show());
  bind("themeToggleButton", "click", () => {
    const isLight = !document.body.classList.contains("light-theme");
    saveTheme(isLight);
    applyTheme(isLight);
  });

  applyTheme(readSavedTheme());

  if (!window.account || !window.api) {
    showSetupScreen("App bridge not available");
    return;
  }

  window.menu.onAction((action) => {
    if (action === "refresh") handleManualRefresh();
    if (action === "disconnect") disconnectAccount();
    if (action === "connect") connectAccount();
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
