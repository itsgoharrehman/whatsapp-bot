"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // Views
  const authView = document.getElementById("authView");
  const dashboardView = document.getElementById("dashboardView");

  // Status Indicators
  const authStatus = document.getElementById("authStatus");
  const dashboardStatus = document.getElementById("dashboardStatus");
  const dashboardStatusText = document.getElementById("dashboardStatusText");

  // QR Block Elements
  const qrLoading = document.getElementById("qrLoading");
  const qrReady = document.getElementById("qrReady");
  const qrConnected = document.getElementById("qrConnected");
  const qrImage = document.getElementById("qrImage");
  const qrStateTitle = document.getElementById("qrStateTitle");
  const qrStateCopy = document.getElementById("qrStateCopy");
  const qrNote = document.getElementById("qrNote");

  // Control Buttons
  const serviceToggleBtn = document.getElementById("serviceToggleBtn") || document.getElementById("startBtn");
  const newSessionBtn = document.getElementById("newSessionBtn");
  const dashboardStopBtn = document.getElementById("dashboardStopBtn");
  const dashboardNewSessionBtn = document.getElementById("dashboardNewSessionBtn");

  // Dashboard Session Banner
  const sessionTitle = document.getElementById("sessionTitle");
  const sessionSubtitle = document.getElementById("sessionSubtitle");

  // Metrics
  const operatingMode = document.getElementById("operatingMode");
  const autoReplyState = document.getElementById("autoReplyState");
  const activeAiKey = document.getElementById("activeAiKey");
  const totalMessages = document.getElementById("totalMessages");
  const totalReplies = document.getElementById("totalReplies");

  // Terminal Controls
  const logArea = document.getElementById("logArea");
  const clearLog = document.getElementById("clearLog");
  const autoScroll = document.getElementById("autoScroll");

  const seenLogIds = new Set();
  let clearedTimestamp = parseInt(localStorage.getItem("terminal_cleared_timestamp") || "0", 10);

  function setQRState(state) {
    const states = {
      loading: qrLoading,
      ready: qrReady,
      connected: qrConnected
    };

    Object.values(states).forEach((node) => {
      if (node) node.classList.remove("active");
    });

    if (states[state]) {
      states[state].classList.add("active");
    }
  }

  function updateStatusBadges(status) {
    const isConnected = status === "CONNECTED";
    const isConnecting = status === "CONNECTING" || status === "QR_READY";

    if (authStatus) {
      const textEl = authStatus.querySelector(".status-text");
      if (textEl) textEl.textContent = status;
      authStatus.className = `status ${isConnected ? "connected" : isConnecting ? "connecting" : "disconnected"}`;
    }

    if (dashboardStatus) {
      if (dashboardStatusText) dashboardStatusText.textContent = status;
      dashboardStatus.className = `status ${isConnected ? "connected" : isConnecting ? "connecting" : "disconnected"}`;
    }

    // Dynamic Single Start/Stop Toggle Button
    if (serviceToggleBtn) {
      const isRunning = isConnected || isConnecting;
      if (isRunning) {
        serviceToggleBtn.textContent = "Stop";
        serviceToggleBtn.className = "button-danger";
      } else {
        serviceToggleBtn.textContent = "Start";
        serviceToggleBtn.className = "button-primary";
      }
    }
  }

  function updateDashboard(data) {
    const status = data.status || "DISCONNECTED";
    updateStatusBadges(status);

    if (status === "CONNECTED") {
      if (authView) authView.hidden = true;
      if (dashboardView) dashboardView.hidden = false;

      if (sessionTitle) sessionTitle.textContent = "Active Session Authenticated";
      if (sessionSubtitle) {
        sessionSubtitle.textContent = `WhatsApp socket connected. Bot JID: ${data.botJid || "Connected"}`;
      }
    } else if (status === "QR_READY" && data.qrCodeDataUrl) {
      if (authView) authView.hidden = false;
      if (dashboardView) dashboardView.hidden = true;

      setQRState("ready");
      if (qrImage) {
        qrImage.src = data.qrCodeDataUrl;
        qrImage.style.display = "block";
      }
      if (qrNote) qrNote.textContent = "Scan QR code using WhatsApp linked devices.";
    } else if (status === "CONNECTING") {
      if (authView) authView.hidden = false;
      if (dashboardView) dashboardView.hidden = true;

      setQRState("loading");
      if (qrStateTitle) qrStateTitle.textContent = "Connecting to WhatsApp";
      if (qrStateCopy) qrStateCopy.textContent = "Establishing secure socket connection...";
      if (qrNote) qrNote.textContent = "Please wait while WhatsApp socket initializes.";
    } else {
      if (authView) authView.hidden = false;
      if (dashboardView) dashboardView.hidden = true;

      setQRState("loading");
      if (qrStateTitle) qrStateTitle.textContent = "Service Disconnected";
      if (qrStateCopy) qrStateCopy.textContent = 'Click "Start" or "New QR" to generate pairing QR code.';
      if (qrNote) qrNote.textContent = "Codes expire automatically. Generate a new QR if needed.";
    }

    // Update Metrics
    if (autoReplyState) {
      autoReplyState.textContent = data.autoReply ? "ENABLED" : "DISABLED";
    }

    const aiStatus = data.aiStatus || data.groqStatus;
    if (aiStatus && activeAiKey) {
      const activeP = (aiStatus.activeProvider || "groq").toUpperCase();
      const pDetails = aiStatus[aiStatus.activeProvider] || aiStatus.groq || {};
      const keyIdx = (typeof pDetails.activeKeyIndex === "number")
        ? (pDetails.activeKeyIndex + 1)
        : ((typeof aiStatus.activeKeyIndex === "number") ? (aiStatus.activeKeyIndex + 1) : 1);
      const totalKeys = (typeof pDetails.keysConfigured === "number")
        ? pDetails.keysConfigured
        : (aiStatus.totalKeysConfigured || 1);
      activeAiKey.textContent = `[${activeP}] Key #${keyIdx} / ${totalKeys || 1}`;
    }

    if (data.analytics) {
      if (totalMessages) {
        totalMessages.textContent = (data.analytics.totalMessagesProcessed || 0).toLocaleString();
      }
      if (totalReplies) {
        totalReplies.textContent = (data.analytics.totalRepliesSent || 0).toLocaleString();
      }
    }
  }

  function getAuthKey() {
    const params = new URLSearchParams(window.location.search);
    return params.get("key") || localStorage.getItem("dashboard_key") || "";
  }

  function getAuthHeaders() {
    const key = getAuthKey();
    return key ? { "x-api-key": key, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  }

  function authFetch(url, options = {}) {
    const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
    return fetch(url, { ...options, headers }).then(async (res) => {
      if (res.status === 401) {
        const userKey = prompt("Dashboard Protected: Please enter your DASHBOARD_SECRET key:");
        if (userKey && userKey.trim()) {
          localStorage.setItem("dashboard_key", userKey.trim());
          const retryHeaders = { ...headers, "x-api-key": userKey.trim() };
          return fetch(url, { ...options, headers: retryHeaders });
        }
      }
      return res;
    });
  }

  async function fetchStatus() {
    try {
      const res = await authFetch("/api/status");
      if (!res.ok) throw new Error("Status fetch failed");
      const data = await res.json();
      updateDashboard(data);
    } catch (err) {
      updateStatusBadges("DISCONNECTED");
    }
  }

  async function fetchLogsFallback() {
    try {
      const res = await authFetch("/api/logs");
      if (res.ok) {
        const logs = await res.json();
        if (Array.isArray(logs)) {
          logs.forEach(appendLogEntry);
        }
      }
    } catch (err) {}
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function appendLogEntry(log) {
    if (!log || !logArea) return;
    if (clearedTimestamp && log.timestamp && new Date(log.timestamp).getTime() < clearedTimestamp) {
      return;
    }
    if (log.id && seenLogIds.has(log.id)) return;
    if (log.id) seenLogIds.add(log.id);

    const timeStr = log.timestamp
      ? log.timestamp.split("T")[1]?.split(".")[0] || log.timestamp
      : new Date().toLocaleTimeString([], { hour12: false });

    const div = document.createElement("div");
    div.className = `log-row ${log.level || "info"}`;

    let msg = (log.message || "").trim();

    // Strip redundant level prefix if it immediately precedes a category tag
    msg = msg.replace(/^\[(INFO|WARN|WARNING|SUCCESS|ERROR)\]\s*(?=\[)/i, "");

    let categoryHtml = "";
    const tagMatch = msg.match(
      /^\[(INPUT|ROUTE|SELECTION|OUTPUT|DISPATCH|COMMAND|ANTI-BAN|CONTEXT|FAILOVER|ROUTER|SYSTEM)\]\s*(.*)$/i
    );

    if (tagMatch) {
      const cat = tagMatch[1].toUpperCase();
      const rest = tagMatch[2];
      categoryHtml = `<span class="tag-badge tag-${cat.toLowerCase().replace(/[^a-z0-9]/g, "-")}">[${cat}]</span>`;
      msg = rest;
    } else {
      categoryHtml = `<span class="lvl">[${(log.level || "INFO").toUpperCase()}]</span>`;
    }

    div.innerHTML = `
      <span class="time">[${timeStr}]</span>
      ${categoryHtml}
      <span class="msg">${escapeHtml(msg)}</span>
      ${log.details ? `<span class="details"> (${escapeHtml(log.details)})</span>` : ""}
    `;

    logArea.appendChild(div);

    if (autoScroll && autoScroll.checked) {
      logArea.scrollTop = logArea.scrollHeight;
    }
  }

  function setupSSE() {
    try {
      const key = getAuthKey();
      const sseUrl = key ? `/api/logs/stream?key=${encodeURIComponent(key)}` : "/api/logs/stream";
      const sse = new EventSource(sseUrl);

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "cleared") {
            if (logArea) logArea.innerHTML = "";
            seenLogIds.clear();
            clearedTimestamp = Date.now();
            localStorage.setItem("terminal_cleared_timestamp", String(clearedTimestamp));
            appendLogEntry({
              timestamp: new Date().toISOString(),
              level: "info",
              message: "[SYSTEM] Terminal log cleared."
            });
          } else if (payload.type === "history" && Array.isArray(payload.logs)) {
            payload.logs.forEach(appendLogEntry);
          } else if (payload.type === "log" && payload.log) {
            appendLogEntry(payload.log);
            fetchStatus();
          }
        } catch (err) {}
      };

      sse.onerror = () => {
        sse.close();
        setTimeout(setupSSE, 5000);
      };
    } catch (err) {}
  }

  // Event Handlers for Controls
  if (serviceToggleBtn) {
    serviceToggleBtn.addEventListener("click", async () => {
      serviceToggleBtn.disabled = true;
      try {
        const isRunning = serviceToggleBtn.textContent.trim().toLowerCase() === "stop";
        if (isRunning) {
          await authFetch("/api/control/stop", { method: "POST" });
        } else {
          await authFetch("/api/control/start", { method: "POST" });
        }
        await fetchStatus();
      } catch (err) {}
      serviceToggleBtn.disabled = false;
    });
  }

  if (dashboardStopBtn) {
    dashboardStopBtn.addEventListener("click", async () => {
      dashboardStopBtn.disabled = true;
      try {
        await authFetch("/api/control/stop", { method: "POST" });
        await fetchStatus();
      } catch (err) {}
      dashboardStopBtn.disabled = false;
    });
  }

  if (newSessionBtn) {
    newSessionBtn.addEventListener("click", async () => {
      newSessionBtn.disabled = true;
      try {
        await authFetch("/api/control/reset_session", { method: "POST" });
        await fetchStatus();
      } catch (err) {}
      newSessionBtn.disabled = false;
    });
  }

  if (dashboardNewSessionBtn) {
    dashboardNewSessionBtn.addEventListener("click", async () => {
      if (confirm("Are you sure you want to clear the active WhatsApp session and generate a new QR code?")) {
        dashboardNewSessionBtn.disabled = true;
        try {
          await authFetch("/api/control/reset_session", { method: "POST" });
          await fetchStatus();
        } catch (err) {}
        dashboardNewSessionBtn.disabled = false;
      }
    });
  }

  if (clearLog) {
    clearLog.addEventListener("click", async () => {
      clearedTimestamp = Date.now();
      localStorage.setItem("terminal_cleared_timestamp", String(clearedTimestamp));
      if (logArea) logArea.innerHTML = "";
      seenLogIds.clear();
      appendLogEntry({
        timestamp: new Date().toISOString(),
        level: "info",
        message: "[SYSTEM] Terminal log cleared."
      });
      try {
        await authFetch("/api/logs/clear", { method: "POST" });
      } catch (err) {}
    });
  }

  // Initialize
  fetchStatus();
  setupSSE();

  // Low-frequency background status sync (every 10s instead of 3s)
  setInterval(fetchStatus, 10000);
});
