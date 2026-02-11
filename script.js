// Sample front-end script to render the widget using static data
// This version does NOT rely on the Electron bridge (window.api).

let pieChartInstance = null;
let lineChartInstance = null;

// Example data shape matching what renderer.js expects from the backend
const sampleStats = {
  easy: 120,
  medium: 80,
  hard: 30,
  total: 230,
  // daily can be an object (date -> count) or an array
  daily: {
    "2026-02-05": 2,
    "2026-02-06": 5,
    "2026-02-07": 1,
    "2026-02-08": 4,
    "2026-02-09": 3,
    "2026-02-10": 0,
    "2026-02-11": 6
  }
};

function renderFromData(data) {
  if (!data || typeof data !== "object") return;

  const easy = Number(data.easy) || 0;
  const medium = Number(data.medium) || 0;
  const hard = Number(data.hard) || 0;
  const total = Number(data.total) || (easy + medium + hard);

  const solvedCountEl = document.getElementById("solvedCount");
  const easyCountEl = document.getElementById("easyCount");
  const mediumCountEl = document.getElementById("mediumCount");
  const hardCountEl = document.getElementById("hardCount");

  if (solvedCountEl) solvedCountEl.innerText = total;
  if (easyCountEl) easyCountEl.innerText = easy;
  if (mediumCountEl) mediumCountEl.innerText = medium;
  if (hardCountEl) hardCountEl.innerText = hard;

  // PIE CHART
  if (pieChartInstance) {
    pieChartInstance.destroy();
  }
  const pieCtx = document.getElementById("pieChart");
  if (pieCtx && window.Chart) {
    pieChartInstance = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: ["Easy", "Medium", "Hard"],
        datasets: [
          {
            data: [easy, medium, hard],
            backgroundColor: ["#00b8a3", "#ffc01e", "#ef4743"],
            borderWidth: 0,
            spacing: 2,
            borderRadius: 6,
            hoverOffset: 0
          }
        ]
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

  // DAILY DATA → LINE CHART
  const hasDailyObject =
    data.daily && !Array.isArray(data.daily) && typeof data.daily === "object";
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
  const legendTodayCountEl = document.getElementById("legendTodayCount");
  if (legendTodayCountEl) {
    legendTodayCountEl.innerText = lastDailyCount;
  }

  if (lineChartInstance) {
    lineChartInstance.destroy();
  }
  const barCtx = document.getElementById("barChart");
  if (barCtx && window.Chart) {
    lineChartInstance = new Chart(barCtx, {
      type: "line",
      data: {
        labels: dailyLabels,
        datasets: [
          {
            data: dailyCounts,
            borderColor: "#00b8a3",
            backgroundColor: "rgba(0, 184, 163, 0.15)",
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 4,
            fill: true
          }
        ]
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
}

function bindToggles() {
  const legendToggleButton = document.getElementById("legendToggleButton");
  const cardToggleButton = document.getElementById("cardToggleButton");
  const cardElement = document.querySelector(".card");

  if (legendToggleButton && cardElement) {
    legendToggleButton.addEventListener("click", () => {
      const showDifficulty = cardElement.classList.toggle("show-difficulty");
      legendToggleButton.setAttribute(
        "aria-label",
        showDifficulty ? "Show questions solved today" : "Show difficulty breakdown"
      );
      legendToggleButton.setAttribute(
        "title",
        legendToggleButton.getAttribute("aria-label") || "Toggle legend view"
      );
    });
  }

  if (cardToggleButton && cardElement) {
    cardToggleButton.addEventListener("click", () => {
      const isCollapsed = cardElement.classList.toggle("collapsed");
      const label = isCollapsed ? "Expand widget" : "Collapse widget";
      cardToggleButton.setAttribute("aria-label", label);
      cardToggleButton.setAttribute("title", label);
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // In this sample, we skip the setup screen and show the widget directly
  const setupScreen = document.getElementById("setupScreen");
  const widgetContent = document.getElementById("widgetContent");
  if (setupScreen) setupScreen.style.display = "none";
  if (widgetContent) widgetContent.style.display = "block";

  bindToggles();
  renderFromData(sampleStats);
});
