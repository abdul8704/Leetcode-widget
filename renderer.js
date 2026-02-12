const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let pieChartInstance = null;
let lineChartInstance = null;
let refreshIntervalId = null;
let isLoadingData = false;
const DEFAULT_SAVE_BUTTON_LABEL = "Save";

function showLoading() {
  document.getElementById("loadingScreen").style.display = "flex";
}

function hideLoading() {
  document.getElementById("loadingScreen").style.display = "none";
}

async function loadData({ showSpinner = true } = {}) {
  if (isLoadingData) {
    return;
  }
  isLoadingData = true;
  console.log("[renderer] loadData start");
  if (showSpinner) {
    showLoading();
  }
  try {
    const data = await window.api.fetchStats();
    console.log("[renderer] loadData data", data);
    if (!data || typeof data !== "object") {
      return;
    }

  const easy = Number(data.easy) || 0;
  const medium = Number(data.medium) || 0;
  const hard = Number(data.hard) || 0;
  const total = Number(data.total) || (easy + medium + hard);

  document.getElementById("solvedCount").innerText = total;
  document.getElementById("easyCount").innerText = easy;
  document.getElementById("mediumCount").innerText = medium;
  document.getElementById("hardCount").innerText = hard;

  if (pieChartInstance) {
    pieChartInstance.destroy();
  }
  pieChartInstance = new Chart(document.getElementById("pieChart"), {
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

  // Display daily solved count
  const lastDailyCount = dailyCounts[dailyCounts.length - 1] || 0;
  const legendTodayCountEl = document.getElementById("legendTodayCount");
  if (legendTodayCountEl) {
    legendTodayCountEl.innerText = lastDailyCount;
  }

  if (lineChartInstance) {
    lineChartInstance.destroy();
  }
  lineChartInstance = new Chart(document.getElementById("barChart"), {
    type: "line",
    data: {
      labels: dailyLabels,
      datasets: [{
        data: dailyCounts,
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
  } finally {
    if (showSpinner) {
      hideLoading();
    }
    isLoadingData = false;
  }
}

function showSetupScreen() {
  document.getElementById("setupScreen").style.display = "flex";
  document.getElementById("widgetContent").style.display = "none";
}

function showWidget() {
  document.getElementById("setupScreen").style.display = "none";
  document.getElementById("widgetContent").style.display = "block";

  const cardElement = document.getElementById("mainCard");
  if (cardElement && !cardElement.classList.contains("collapsed")) {
    cardElement.classList.add("collapsed");
  }
}

function startAutoRefresh() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
  }

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

function setSaveButtonLoading(isLoading) {
  const saveButton = document.getElementById("saveHandleButton");
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
  const handle = document.getElementById("username").value.trim();
  if (!handle) return;

  const title = document.querySelector(".setup-card h3");
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

    showWidget();
    startAutoRefresh();

    try {
      await loadData({ showSpinner: false });
    } catch (error) {
      console.error("[renderer] initial refresh after save failed", error);
    }

    console.log("[renderer] saveHandle after loadData");
  } catch (error) {
    console.error("[renderer] saveHandle error", error);
    showSetupScreen();
    if (title) {
      title.innerText = error.message || "Unable to save handle";
    }
  } finally {
    setSaveButtonLoading(false);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const saveButton = document.getElementById("saveHandleButton");
  const refreshButton = document.getElementById("refreshButton");
  const legendToggleButton = document.getElementById("legendToggleButton");
  const cardToggleButton = document.getElementById("cardToggleButton");
  const cardElement = document.querySelector(".card");
  if (saveButton) {
    saveButton.addEventListener("click", saveHandle);
    console.log("[renderer] bound save button");
  } else {
    console.warn("[renderer] save button not found");
  }
  if (refreshButton) {
    refreshButton.addEventListener("click", handleManualRefresh);
    console.log("[renderer] bound refresh button");
  } else {
    console.warn("[renderer] refresh button not found");
  }

  if (legendToggleButton && cardElement) {
    legendToggleButton.addEventListener("click", () => {
      const showDifficulty = cardElement.classList.toggle("show-difficulty");
      legendToggleButton.setAttribute(
        "aria-label",
        showDifficulty ? "Show questions solved today" : "Show difficulty breakdown"
      );
      legendToggleButton.setAttribute("title", legendToggleButton.getAttribute("aria-label") || "Toggle legend view");
    });
    console.log("[renderer] bound legend toggle button");
  } else {
    console.warn("[renderer] legend toggle button or card element not found", {
      hasButton: !!legendToggleButton,
      hasCard: !!cardElement
    });
  }

  if (cardToggleButton && cardElement) {
    cardToggleButton.addEventListener("click", () => {
      const isCollapsed = cardElement.classList.toggle("collapsed");
      const label = isCollapsed ? "Expand widget" : "Collapse widget";
      cardToggleButton.setAttribute("aria-label", label);
      cardToggleButton.setAttribute("title", label);
    });
    console.log("[renderer] bound card toggle button");
  } else {
    console.warn("[renderer] card toggle button or card element not found", {
      hasButton: !!cardToggleButton,
      hasCard: !!cardElement
    });
  }

  console.log("[renderer] DOMContentLoaded", {
    hasApi: !!window.api,
    hasGetHandle: !!(window.api && window.api.getHandle)
  });
  if (!window.api || typeof window.api.getHandle !== "function") {
    showSetupScreen();
    const title = document.querySelector(".setup-card h3");
    if (title) {
      title.innerText = "App bridge not available";
    }
    return;
  }

  const handle = window.api.getHandle();

  if (!handle) {
    showSetupScreen();
  } else {
    showWidget();
    await loadData();
    startAutoRefresh();
  }
});
