function showLoading() {
  document.getElementById("loadingScreen").style.display = "flex";
}

function hideLoading() {
  document.getElementById("loadingScreen").style.display = "none";
}

async function loadData({ showSpinner = true } = {}) {
  console.log("[renderer] loadData start");
  if (showSpinner) {
    showLoading();
  }
  try {
    const data = await window.api.fetchStats();
    console.log("[renderer] loadData data", data);
    if (!data) {
      return;
    }

  const total = data.total ?? (data.easy + data.medium + data.hard);

  document.getElementById("solvedCount").innerText = total;
  document.getElementById("easyCount").innerText = data.easy;
  document.getElementById("mediumCount").innerText = data.medium;
  document.getElementById("hardCount").innerText = data.hard;

  new Chart(document.getElementById("pieChart"), {
    type: "doughnut",
    data: {
      labels: ["Easy", "Medium", "Hard"],
      datasets: [{
        data: [data.easy, data.medium, data.hard],
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

  const hasDailyObject =
    data.daily &&
    !Array.isArray(data.daily) &&
    typeof data.daily === "object";

  const dailyLabels = hasDailyObject
    ? Object.keys(data.daily)
    : Array.isArray(data.dailyDates)
      ? data.dailyDates
      : data.daily.map((_, i) => `D${i + 1}`);

  const dailyCounts = hasDailyObject
    ? Object.values(data.daily)
    : data.daily;

  // Display daily solved count
  const lastDailyCount = dailyCounts[dailyCounts.length - 1] || 0;
  document.getElementById("dailySolvedCount").innerText = `Number of questions solved today: ${lastDailyCount}`;

  new Chart(document.getElementById("barChart"), {
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
  }
}

function showSetupScreen() {
  document.getElementById("setupScreen").style.display = "flex";
  document.getElementById("widgetContent").style.display = "none";
}

function showWidget() {
  document.getElementById("setupScreen").style.display = "none";
  document.getElementById("widgetContent").style.display = "block";
}

async function saveHandle() {
  const handle = document.getElementById("username").value.trim();
  if (!handle) return;

  const title = document.querySelector(".setup-card h3");
  try {
    showLoading();
    if (!window.api || typeof window.api.setHandle !== "function") {
      throw new Error("App bridge not available");
    }

    console.log("[renderer] saveHandle click", { handle });
    window.api.setHandle(handle);
    console.log("[renderer] saveHandle after setHandle");
    showWidget();
    await loadData({ showSpinner: false });
    console.log("[renderer] saveHandle after loadData");
  } catch (error) {
    console.error("[renderer] saveHandle error", error);
    showSetupScreen();
    if (title) {
      title.innerText = error.message || "Unable to save handle";
    }
  } finally {
    hideLoading();
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const saveButton = document.getElementById("saveHandleButton");
  if (saveButton) {
    saveButton.addEventListener("click", saveHandle);
    console.log("[renderer] bound save button");
  } else {
    console.warn("[renderer] save button not found");
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
  }
});
