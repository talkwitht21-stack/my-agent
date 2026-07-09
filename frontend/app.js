"use strict";
const state = { ws: null, sessionId: crypto.randomUUID(), reconnectDelay: 500, pendingApproval: null, isSubmitting: false };
const $ = (id) => document.getElementById(id);
const dom = {
  form: $("task-form"), input: $("task-input"), submitBtn: $("submit-btn"),
  btnText: null, btnSpinner: null, outputLog: $("output-log"), emptyState: $("empty-state"),
  clearBtn: $("clear-btn"), sessionId: $("session-id"), statusBadge: $("connection-status"),
  statusText: null, overlay: $("hitl-overlay"), riskBadge: $("risk-badge"),
  riskScore: $("risk-score-value"), taskId: $("modal-task-id"), riskLevel: $("modal-risk-level"),
  command: $("modal-command"), reasons: $("modal-reasons"), allowBtn: $("allow-btn"), denyBtn: $("deny-btn"),
};

document.addEventListener("DOMContentLoaded", () => {
  dom.btnText = dom.submitBtn.querySelector(".btn-text");
  dom.btnSpinner = dom.submitBtn.querySelector(".btn-spinner");
  dom.statusText = dom.statusBadge.querySelector(".status-text");
  dom.sessionId.textContent = state.sessionId.slice(0, 8);
  dom.form.addEventListener("submit", onSubmit);
  dom.clearBtn.addEventListener("click", clearOutput);
  dom.allowBtn.addEventListener("click", () => respond("allow"));
  dom.denyBtn.addEventListener("click", () => respond("deny"));
  document.addEventListener("keydown", onKeyDown);
  connectWebSocket();
});

/* ── WebSocket with exponential-backoff reconnect ─── */
function connectWebSocket() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/hitl`);
  ws.addEventListener("open", () => {
    state.reconnectDelay = 500;
    updateConnectionStatus(true);
    appendMessage("system", "WebSocket connected.");
  });
  ws.addEventListener("message", (evt) => {
    let data;
    try { data = JSON.parse(evt.data); } catch { return; }
    if (data.type === "approval_request") {
      handleApprovalRequest(data);
    } else if (data.type === "task_update") {
      const label = data.status === "error" ? "error" : "result";
      const body = data.result ? JSON.stringify(data.result, null, 2) : `Task ${data.task_id} → ${data.status}`;
      appendMessage(label, body);
    }
  });
  ws.addEventListener("close", () => { updateConnectionStatus(false); scheduleReconnect(); });
  ws.addEventListener("error", () => ws.close());
  state.ws = ws;
}

function scheduleReconnect() {
  const delay = Math.min(state.reconnectDelay + Math.random() * 300, 30000);
  appendMessage("system", `Reconnecting in ${(delay / 1000).toFixed(1)}s…`);
  setTimeout(connectWebSocket, delay);
  state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30000);
}

function updateConnectionStatus(connected) {
  dom.statusBadge.classList.toggle("connected", connected);
  dom.statusBadge.classList.toggle("disconnected", !connected);
  dom.statusText.textContent = connected ? "Connected" : "Disconnected";
}

/* ── Task submission ────────────────────────────────── */
async function onSubmit(e) {
  e.preventDefault();
  const text = dom.input.value.trim();
  if (!text || state.isSubmitting) return;
  await submitTask(text);
}

async function submitTask(userMessage) {
  setLoading(true);
  appendMessage("user", userMessage);
  dom.input.value = "";
  try {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_message: userMessage, session_id: state.sessionId }),
    });
    const data = await res.json();
    if (!res.ok) { appendMessage("error", data.detail || `HTTP ${res.status}`); return; }
    appendMessage("result", JSON.stringify(data, null, 2));
  } catch (err) {
    appendMessage("error", `Network error: ${err.message}`);
  } finally { setLoading(false); }
}

function setLoading(on) {
  state.isSubmitting = on;
  dom.submitBtn.disabled = on;
  dom.btnText.classList.toggle("hidden", on);
  dom.btnSpinner.classList.toggle("hidden", !on);
}

/* ── HITL approval modal ────────────────────────────── */
function handleApprovalRequest(data) {
  state.pendingApproval = data.task_id;
  const score = data.risk_score ?? 0;
  const level = riskLevel(score);
  dom.riskScore.textContent = score;
  dom.riskBadge.className = `risk-badge ${level}`;
  dom.taskId.textContent = data.task_id;
  dom.riskLevel.textContent = (data.risk_level || level).toUpperCase();
  dom.riskLevel.className = `detail-value risk-text ${level}`;
  dom.command.textContent = data.command || "—";
  dom.reasons.innerHTML = "";
  (data.reasons || []).forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    dom.reasons.appendChild(li);
  });
  dom.overlay.classList.remove("hidden");
  dom.allowBtn.focus();
  appendMessage("system", `Approval requested for task ${data.task_id} (risk: ${score})`);
}

function respond(decision) {
  if (!state.pendingApproval) return;
  sendApprovalResponse(state.pendingApproval, decision);
  appendMessage("system", `Decision: ${decision.toUpperCase()} for ${state.pendingApproval}`);
  state.pendingApproval = null;
  dom.overlay.classList.add("hidden");
  dom.input.focus();
}

function sendApprovalResponse(taskId, decision) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "approval_response", task_id: taskId, decision }));
  }
}

function riskLevel(score) {
  return score <= 40 ? "low" : score <= 70 ? "medium" : "high";
}

/* ── Output log ─────────────────────────────────────── */
const MSG_LABELS = { user: "You", result: "Agent", error: "Error", system: "System" };

function appendMessage(type, content) {
  dom.emptyState.classList.add("hidden");
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = MSG_LABELS[type] || type;
  div.appendChild(label);
  if (type === "result" || type === "error") {
    const pre = document.createElement("pre");
    pre.textContent = content;
    div.appendChild(pre);
  } else {
    const span = document.createElement("span");
    span.textContent = content;
    div.appendChild(span);
  }
  dom.outputLog.appendChild(div);
  dom.outputLog.scrollTop = dom.outputLog.scrollHeight;
}

function clearOutput() {
  dom.outputLog.innerHTML = "";
  dom.emptyState.classList.remove("hidden");
}

/* ── Keyboard shortcuts ─────────────────────────────── */
function onKeyDown(e) {
  const modalOpen = !dom.overlay.classList.contains("hidden");
  if (e.key === "Enter" && modalOpen && !e.shiftKey) { e.preventDefault(); respond("allow"); return; }
  if (e.key === "Escape" && modalOpen) { e.preventDefault(); respond("deny"); return; }
  if (e.key === "Enter" && !e.shiftKey && document.activeElement === dom.input) { e.preventDefault(); dom.form.requestSubmit(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === "l") { e.preventDefault(); clearOutput(); }
}
