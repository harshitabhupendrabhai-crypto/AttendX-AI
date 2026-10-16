/**
 * AttendX AI — main.js
 * Author: Vaidehi Kayasth
 * Dynamic QR token refresh, webcam/face-detection simulation,
 * real-time Chart.js charts, attendance marking, live records,
 * risk analytics, and report export.
 */

/* ══════════════════════════════════════════════
   SECTION NAVIGATION
══════════════════════════════════════════════ */
const sectionMap = {
  dashboard : "Executive Dashboard",
  mark      : "Mark Attendance",
  records   : "Live Records",
  risk      : "Risk Analytics",
  export    : "Export Report"
};

const sectionTitle = document.getElementById("sectionTitle");
const navItems     = document.querySelectorAll(".nav-item");
const sections     = document.querySelectorAll(".section");

function showSection(name) {
  sections.forEach(s => s.classList.toggle("active", s.id === `section-${name}`));
  navItems.forEach(n => n.classList.toggle("active", n.dataset.section === name));
  sectionTitle.textContent = sectionMap[name] || name;

  if (name === "records")   loadRecords();
  if (name === "risk")      loadRisk();
  if (name === "dashboard") loadMetrics();
}

navItems.forEach(item => {
  item.addEventListener("click", e => {
    e.preventDefault();
    showSection(item.dataset.section);
  });
});

// Sidebar toggle (mobile)
const sidebarEl     = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");

sidebarToggle.addEventListener("click", () => {
  sidebarEl.classList.toggle("open");
});

document.addEventListener("click", e => {
  if (sidebarEl.classList.contains("open") &&
      !sidebarEl.contains(e.target) &&
      e.target !== sidebarToggle) {
    sidebarEl.classList.remove("open");
  }
});

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
function updateClock() {
  const now = new Date();
  document.getElementById("clockDisplay").textContent =
    now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
updateClock();
setInterval(updateClock, 1000);

/* ══════════════════════════════════════════════
   CHART.JS INSTANCES
══════════════════════════════════════════════ */
Chart.defaults.color = "#7c8db0";
Chart.defaults.borderColor = "#1e2840";

const chartDefaults = {
  plugins: { legend: { labels: { color: "#7c8db0", font: { size: 12 } } } }
};

let trendChart   = null;
let donutChart   = null;
let riskBarChart = null;

function buildTrendChart(labels, data, totals) {
  const ctx = document.getElementById("trendChart").getContext("2d");
  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Present",
          data,
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6,182,212,0.1)",
          borderWidth: 2,
          pointBackgroundColor: "#06b6d4",
          pointRadius: 4,
          tension: 0.35,
          fill: true
        },
        {
          label: "Total Enrolled",
          data: totals,
          borderColor: "#2a3550",
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      ...chartDefaults,
      scales: {
        x: { grid: { color: "#1e2840" }, ticks: { color: "#7c8db0" } },
        y: {
          grid: { color: "#1e2840" },
          ticks: { color: "#7c8db0", stepSize: 1 },
          beginAtZero: true
        }
      }
    }
  });
}

function buildDonutChart(punctual, late, absent) {
  const ctx = document.getElementById("donutChart").getContext("2d");
  if (donutChart) donutChart.destroy();

  donutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Punctual", "Late", "Absent"],
      datasets: [{
        data: [punctual, late, absent],
        backgroundColor: ["#06b6d4", "#f59e0b", "#f43f5e"],
        borderColor:     ["#0e7490", "#b45309", "#9f1239"],
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      cutout: "66%",
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { position: "bottom", labels: { color: "#7c8db0", font: { size: 11 } } }
      }
    }
  });
}

function buildRiskBarChart(names, rates) {
  const ctx = document.getElementById("riskBarChart").getContext("2d");
  if (riskBarChart) riskBarChart.destroy();

  const barColors = rates.map(r =>
    r < 75 ? "rgba(244,63,94,0.7)" :
    r < 85 ? "rgba(245,158,11,0.7)" :
             "rgba(6,182,212,0.7)"
  );

  riskBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: names,
      datasets: [{
        label: "Attendance Rate (%)",
        data: rates,
        backgroundColor: barColors,
        borderColor:     barColors.map(c => c.replace("0.7", "1")),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      indexAxis: "y",
      ...chartDefaults,
      scales: {
        x: {
          min: 0,
          max: 100,
          grid: { color: "#1e2840" },
          ticks: { color: "#7c8db0", callback: v => v + "%" }
        },
        y: { grid: { display: false }, ticks: { color: "#7c8db0", font: { size: 11 } } }
      },
      plugins: {
        ...chartDefaults.plugins,
        annotation: {
          annotations: {
            threshold: {
              type: "line",
              scaleID: "x",
              value: 75,
              borderColor: "rgba(244,63,94,0.6)",
              borderWidth: 1.5,
              borderDash: [5, 5],
              label: { enabled: true, content: "75% min", color: "#f43f5e" }
            }
          }
        }
      }
    }
  });
}

/* ══════════════════════════════════════════════
   METRICS LOADER
══════════════════════════════════════════════ */
async function loadMetrics() {
  try {
    const res  = await fetch("/api/metrics");
    const data = await res.json();

    // KPI cards
    document.getElementById("kpiEnrolled").textContent  = data.total_members;
    document.getElementById("kpiRate").textContent       = data.attendance_rate + "%";
    document.getElementById("kpiRateSub").textContent    =
      `${data.present_today} of ${data.total_members} present`;
    document.getElementById("kpiPunctual").textContent   = data.punctual_today;
    document.getElementById("kpiLate").textContent       = `Late: ${data.late_today}`;
    document.getElementById("kpiRisk").textContent       = data.at_risk_count;

    // Risk alert strip
    const strip = document.getElementById("riskStrip");
    const stripText = document.getElementById("riskStripText");
    if (data.at_risk_count > 0) {
      const names = data.at_risk_members.slice(0, 3).map(m => `${m.name} (${m.rate}%)`).join(", ");
      stripText.textContent =
        `${data.at_risk_count} member(s) are below the 75% attendance threshold: ${names}${data.at_risk_count > 3 ? " …" : ""}`;
      strip.classList.remove("hidden");
    } else {
      strip.classList.add("hidden");
    }

    // Charts
    const trend = data.weekly_trend || [];
    buildTrendChart(
      trend.map(t => t.date),
      trend.map(t => t.count),
      trend.map(t => t.total)
    );

    const absent = data.total_members - data.present_today;
    buildDonutChart(data.punctual_today, data.late_today, absent < 0 ? 0 : absent);

    // Sync QR token state with server
    qrToken      = data.qr_token;
    qrExpiresIn  = data.qr_expires_in;
    renderQR(qrToken);
    document.getElementById("qrTokenDisplay").textContent = qrToken;
    updateCountdownDisplay();

  } catch (err) {
    console.error("loadMetrics error:", err);
  }
}

loadMetrics();
setInterval(loadMetrics, 30000); // auto-refresh every 30 s

/* ══════════════════════════════════════════════
   QR CODE — ROLLING 15-SECOND TOKEN
══════════════════════════════════════════════ */
let qrToken     = "";
let qrExpiresIn = 15;
let qrInterval  = null;

const qrOverlay    = document.getElementById("qrOverlay");
const qrCountdown  = document.getElementById("qrCountdown");
const timerBar     = document.getElementById("timerBar");

function renderQR(token) {
  const canvas = document.getElementById("qrCanvas");
  if (!token) return;
  QRCode.toCanvas(canvas, `ATTENDX:${token}`, {
    width: 172,
    color: { dark: "#e2e8f0", light: "#0f1117" },
    margin: 1
  }, err => {
    if (!err) qrOverlay.classList.add("hidden");
  });
}

async function refreshQRToken() {
  try {
    const res  = await fetch("/api/qr-token");
    const data = await res.json();
    qrToken    = data.token;
    qrExpiresIn = data.expires_in;

    document.getElementById("qrTokenDisplay").textContent = qrToken;
    qrOverlay.classList.remove("hidden"); // briefly flash expired state
    setTimeout(() => {
      renderQR(qrToken);
      qrOverlay.classList.add("hidden");
    }, 300);

  } catch (err) {
    console.error("QR refresh error:", err);
  }
}

// Client-side countdown tick (syncs with server every refresh)
function tickQR() {
  if (qrExpiresIn <= 0) {
    qrOverlay.classList.remove("hidden");
    refreshQRToken();
    return;
  }
  qrExpiresIn--;
  updateCountdownDisplay();
}

function updateCountdownDisplay() {
  qrCountdown.textContent = qrExpiresIn;
  timerBar.style.width    = (qrExpiresIn / 15 * 100) + "%";
}

qrInterval = setInterval(tickQR, 1000);

/* ══════════════════════════════════════════════
   MARK ATTENDANCE — QR MODE
══════════════════════════════════════════════ */
document.getElementById("btnMarkQR").addEventListener("click", async () => {
  const rollNo = document.getElementById("qrRollInput").value.trim();
  const fb     = document.getElementById("qrFeedback");
  if (!rollNo) return showFeedback(fb, "error", "Please enter a Roll No / Employee ID.");

  try {
    const res  = await fetch("/api/mark-attendance", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ roll_no: rollNo, mode: "QR", qr_token: qrToken })
    });
    const data = await res.json();
    if (data.success) {
      showFeedback(fb, "success",
        `✔ ${data.name} marked ${data.status} via QR at ${data.timestamp.split(" ")[1]}`);
      document.getElementById("qrRollInput").value = "";
      loadMetrics();
    } else {
      showFeedback(fb, "error", data.error || "Failed to mark attendance.");
    }
  } catch (err) {
    showFeedback(fb, "error", "Network error. Please retry.");
  }
});

/* ══════════════════════════════════════════════
   WEBCAM / FACE RECOGNITION SIMULATION
══════════════════════════════════════════════ */
let webcamStream  = null;
let scanAnimFrame = null;
let scanActive    = false;

const video       = document.getElementById("webcamVideo");
const webcamCanvas = document.getElementById("webcamCanvas");
const webcamIdle  = document.getElementById("webcamIdle");
const scanLine    = document.getElementById("scanLine");
const faceBox     = document.getElementById("faceBox");
const confBar     = document.getElementById("confidenceBar");
const confScore   = document.getElementById("confScore");

document.getElementById("btnStartCam").addEventListener("click", async () => {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = webcamStream;
    video.style.display = "block";
    webcamCanvas.style.display = "block";
    webcamIdle.style.display   = "none";
    scanLine.classList.add("active");
    document.getElementById("btnStartCam").disabled = true;
    document.getElementById("btnStopCam").disabled  = false;
    startFaceSimulation();
  } catch {
    // camera not available — run in pure simulation mode
    video.style.display = "none";
    webcamIdle.style.display   = "none";
    simulateFaceDetection();
    scanLine.classList.add("active");
    document.getElementById("btnStartCam").disabled = true;
    document.getElementById("btnStopCam").disabled  = false;
  }
});

document.getElementById("btnStopCam").addEventListener("click", () => {
  stopCam();
  document.getElementById("btnStartCam").disabled = false;
  document.getElementById("btnStopCam").disabled  = true;
});

function stopCam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  video.style.display        = "none";
  webcamCanvas.style.display = "none";
  webcamIdle.style.display   = "flex";
  scanLine.classList.remove("active");
  faceBox.style.display      = "none";
  clearInterval(scanAnimFrame);
  scanActive = false;
  confBar.style.width = "0%";
  confScore.textContent = "—";
}

function startFaceSimulation() {
  scanActive = true;
  simulateFaceDetection();
}

function simulateFaceDetection() {
  let tick = 0;
  const container = document.querySelector(".webcam-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  scanAnimFrame = setInterval(() => {
    if (!scanActive && !webcamStream) return;
    tick++;

    // Animate a fake bounding box every 80 ticks
    if (tick % 80 === 0) {
      const x = Math.random() * (cw * 0.3) + cw * 0.2;
      const y = Math.random() * (ch * 0.2) + ch * 0.15;
      const w = Math.random() * 50 + 80;
      const h = Math.random() * 30 + 90;
      faceBox.style.left    = x + "px";
      faceBox.style.top     = y + "px";
      faceBox.style.width   = w + "px";
      faceBox.style.height  = h + "px";
      faceBox.style.display = "block";

      // Animate confidence
      const conf = Math.floor(Math.random() * 14) + 86; // 86–99
      animateConfBar(conf);
    }
  }, 50);
}

function animateConfBar(targetConf) {
  let current = 0;
  const step  = setInterval(() => {
    current += 3;
    if (current >= targetConf) {
      current = targetConf;
      clearInterval(step);
    }
    confBar.style.width = current + "%";
    confBar.style.background = current >= 90 ? "#6366f1" :
                               current >= 75 ? "#f59e0b" : "#f43f5e";
    confScore.textContent = current + "%";
  }, 20);
}

/* ══════════════════════════════════════════════
   MARK ATTENDANCE — FACE MODE
══════════════════════════════════════════════ */
document.getElementById("btnMarkFace").addEventListener("click", async () => {
  const rollNo = document.getElementById("faceRollInput").value.trim();
  const fb     = document.getElementById("faceFeedback");
  if (!rollNo) return showFeedback(fb, "error", "Please enter a Roll No / Employee ID.");

  // Show scanning animation
  showFeedback(fb, "success", "⟳ Scanning face…");
  confBar.style.width = "0%";
  confScore.textContent = "scanning…";

  await delay(1800); // simulate scan delay

  try {
    const res  = await fetch("/api/mark-attendance", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ roll_no: rollNo, mode: "Face" })
    });
    const data = await res.json();
    if (data.success) {
      animateConfBar(Math.round(data.confidence));
      showFeedback(fb, "success",
        `✔ ${data.name} verified — Confidence ${data.confidence}% — marked ${data.status}`);
      document.getElementById("faceRollInput").value = "";
      loadMetrics();
    } else {
      showFeedback(fb, "error", data.error || "Face recognition failed.");
      if (data.error && data.error.includes("confidence")) {
        animateConfBar(parseInt(data.error.match(/\d+/)?.[0] || "85", 10));
      }
    }
  } catch {
    showFeedback(fb, "error", "Network error. Please retry.");
  }
});

/* ══════════════════════════════════════════════
   MEMBER CHIP CLICK → AUTO-FILL ROLL NO
══════════════════════════════════════════════ */
document.querySelectorAll(".member-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const roll = chip.dataset.roll;
    document.getElementById("qrRollInput").value   = roll;
    document.getElementById("faceRollInput").value = roll;
  });
});

/* ══════════════════════════════════════════════
   LIVE RECORDS
══════════════════════════════════════════════ */
const recordsBody = document.getElementById("recordsBody");

async function loadRecords() {
  const dateVal = document.getElementById("dateFilter").value;
  let url = "/api/records?limit=100";
  if (dateVal) url += `&date=${dateVal}`;

  try {
    const res  = await fetch(url);
    const rows = await res.json();

    if (!rows.length) {
      recordsBody.innerHTML =
        `<tr><td colspan="8" class="table-empty">No records found for the selected filter.</td></tr>`;
      return;
    }

    recordsBody.innerHTML = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.name}</strong></td>
        <td><code style="font-size:11px;color:#7c8db0">${r.roll_no}</code></td>
        <td>${r.date}</td>
        <td>${r.timestamp.split(" ")[1] || r.timestamp}</td>
        <td><span class="mode-badge mode-${r.mode}">${r.mode}</span></td>
        <td><span class="status-badge status-${r.status}">${r.status}</span></td>
        <td>${r.confidence != null ? r.confidence + "%" : "—"}</td>
      </tr>
    `).join("");
  } catch (err) {
    recordsBody.innerHTML =
      `<tr><td colspan="8" class="table-empty">Error loading records.</td></tr>`;
  }
}

document.getElementById("btnRefreshRecords").addEventListener("click", loadRecords);
document.getElementById("dateFilter").addEventListener("change", loadRecords);

// Set today as default date filter
document.getElementById("dateFilter").value = todayIso();

/* ══════════════════════════════════════════════
   RISK ANALYTICS
══════════════════════════════════════════════ */
const riskBody  = document.getElementById("riskBody");
const riskCount = document.getElementById("riskCount");

async function loadRisk() {
  try {
    const res  = await fetch("/api/absenteeism-risk");
    const data = await res.json();

    const at_risk = data.filter(m => m.at_risk);
    riskCount.textContent = `${at_risk.length} at risk`;

    // Risk bar chart
    buildRiskBarChart(
      data.map(m => m.name),
      data.map(m => m.attendance_rate)
    );

    if (!data.length) {
      riskBody.innerHTML =
        `<tr><td colspan="7" class="table-empty">No data available.</td></tr>`;
      return;
    }

    riskBody.innerHTML = data.map(m => `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td><code style="font-size:11px;color:#7c8db0">${m.roll_no}</code></td>
        <td>${m.department}</td>
        <td>
          <span style="color:${m.attendance_rate < 75 ? '#f43f5e' :
                                m.attendance_rate < 85 ? '#f59e0b' : '#10b981'};
                       font-weight:700;">
            ${m.attendance_rate}%
          </span>
        </td>
        <td>${m.consecutive_absent_days} day${m.consecutive_absent_days !== 1 ? "s" : ""}</td>
        <td>${m.last_seen}</td>
        <td>
          ${m.at_risk
            ? `<span class="risk-badge-high">⚠ HIGH RISK</span>`
            : `<span class="risk-badge-low">✔ On Track</span>`}
        </td>
      </tr>
    `).join("");
  } catch (err) {
    riskBody.innerHTML =
      `<tr><td colspan="7" class="table-empty">Error loading risk data.</td></tr>`;
  }
}

/* ══════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════ */
function showFeedback(el, type, message) {
  el.textContent = message;
  el.className   = `feedback-msg ${type}`;
  el.classList.remove("hidden");
  if (type === "success") {
    setTimeout(() => el.classList.add("hidden"), 6000);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}
