"use strict";
function generateUUID() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
const state = { ws: null, sessionId: generateUUID(), reconnectDelay: 500, pendingApproval: null, isSubmitting: false, events: [] };
const $ = (id) => document.getElementById(id);
const dom = {
  form: $("task-form"), input: $("task-input"), submitBtn: $("submit-btn"),
  btnText: null, btnSpinner: null, outputLog: $("output-log"), emptyState: $("empty-state"),
  clearBtn: $("clear-btn"), sessionId: $("session-id"), statusBadge: $("connection-status"),
  statusText: null, overlay: $("hitl-overlay"), riskBadge: $("risk-badge"),
  riskScore: $("risk-score-value"), taskId: $("modal-task-id"), riskLevel: $("modal-risk-level"),
  command: $("modal-command"), reasons: $("modal-reasons"), allowBtn: $("allow-btn"), denyBtn: $("deny-btn"),
};

function initApp() {
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
  loadHistory();
}

async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    if (data.success && data.history) {
      appendMessage("system", "--- Lịch sử công việc trước đây ---", true);
      appendMessage("system", data.history, true);
      appendMessage("system", "--- Phiên làm việc mới ---", true);
    }
  } catch (e) {
    console.error("Failed to load history", e);
  }
  
  // Restore session history from sessionStorage
  try {
    const saved = sessionStorage.getItem('chatHistory');
    if (saved) {
      const events = JSON.parse(saved);
      state.events = []; // clear since playback will push if not careful, wait, we pass noSave = true
      events.forEach(e => {
        if (e.action === 'message') appendMessage(e.type, e.content, true);
        else if (e.action === 'update') appendTaskUpdate(e.data, true);
      });
      state.events = events; // restore full list
    }
  } catch (err) {
    console.error("Failed to restore session history", err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

/* ── Socket.io Connection ─── */
function connectWebSocket() {
  const socket = io();
  
  socket.on("connect", () => {
    updateConnectionStatus(true);
    appendMessage("system", "Socket.io connected.");
  });

  socket.on("approval_request", (data) => {
    handleApprovalRequest(data);
  });

  socket.on("task_update", (data) => {
    appendTaskUpdate(data);
  });

  socket.on("disconnect", () => {
    updateConnectionStatus(false);
    appendMessage("system", "Socket.io disconnected.");
  });

  state.ws = socket;
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
  
  const autoRun = document.getElementById('auto-run-toggle').checked;
  if (autoRun) {
    sendApprovalResponse(data.task_id, 'allow');
    appendMessage("system", `[Auto-Run] Automatically approved task ${data.task_id}`);
    state.pendingApproval = null;
    return;
  }

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
  if (state.ws && state.ws.connected) {
    state.ws.emit('approval_response', { task_id: taskId, decision });
  }
}

function riskLevel(score) {
  return score <= 40 ? "low" : score <= 70 ? "medium" : "high";
}

/* ── Output log ─────────────────────────────────────── */
const MSG_LABELS = { user: "You", result: "Agent", error: "Error", system: "System" };
let currentTaskBox = null;
let currentAiChatBox = null;
let currentConsoleBox = null;
let currentGroupEl = null;

function appendTaskUpdate(data, noSave = false) {
  if (!noSave) {
    state.events.push({ action: 'update', data });
  }

  if (!currentConsoleBox || !currentAiChatBox) {
    appendMessage("system", JSON.stringify(data), true);
    if (!noSave) saveHistory();
    return;
  }
  
  if (data.status === 'planning') {
    const p = document.createElement('div');
    p.className = 'sys-msg';
    p.textContent = `> [System] ${data.message}`;
    currentConsoleBox.appendChild(p);
  } else if (data.status === 'plan_ready' && data.result) {
    if (data.result.content) {
      currentAiChatBox.style.display = 'block';
      const md = data.result.content.replace(/\n/g, '<br>');
      currentAiChatBox.innerHTML += `<p><strong>Agent:</strong> ${md}</p>`;
    }
    if (data.result.command) {
      const p = document.createElement('div');
      p.className = 'cmd-run';
      p.textContent = `$ ${data.result.command}`;
      currentConsoleBox.appendChild(p);
    }
  } else if (data.status === 'executing') {
    const p = document.createElement('div');
    p.className = 'cmd-run';
    p.textContent = `$ ${data.message.replace('Running: ', '').replace('Writing file: ', 'write ')}`;
    currentConsoleBox.appendChild(p);
  } else if (data.status === 'completed' && data.result) {
    if (data.result.stdout) {
      const p = document.createElement('div');
      p.className = 'cmd-out';
      p.textContent = data.result.stdout;
      currentConsoleBox.appendChild(p);
    }
    if (data.result.stderr) {
      const p = document.createElement('div');
      p.className = 'cmd-err';
      p.textContent = data.result.stderr;
      currentConsoleBox.appendChild(p);
    }
    if (data.result.message) {
      const p = document.createElement('div');
      p.className = 'sys-msg';
      p.textContent = `> ${data.result.message}`;
      currentConsoleBox.appendChild(p);
    }
  } else if (data.status === 'error') {
    const p = document.createElement('div');
    p.className = 'cmd-err';
    p.textContent = `[Error] ${data.message}`;
    currentConsoleBox.appendChild(p);
  }
  
  currentConsoleBox.scrollTop = currentConsoleBox.scrollHeight;
  dom.outputLog.scrollTop = dom.outputLog.scrollHeight;
  
  if (!noSave) saveHistory();
}

function createMessageElement(type, content) {
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
  return div;
}

function saveHistory() {
  sessionStorage.setItem('chatHistory', JSON.stringify(state.events));
}

function appendMessage(type, content, noSave = false) {
  if (!noSave) {
    state.events.push({ action: 'message', type, content });
  }

  dom.emptyState.classList.add("hidden");
  
  if (type === 'user') {
    // Create new task accordion group
    const group = document.createElement('div');
    group.className = 'task-group';
    
    const header = document.createElement('div');
    header.className = 'task-header open';
    
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.innerHTML = '▶';
    
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = content;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon btn-danger-icon';
    deleteBtn.title = 'Delete Task';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.style.marginLeft = 'auto';
    deleteBtn.style.border = 'none';
    deleteBtn.style.background = 'transparent';
    deleteBtn.style.fontSize = '1rem';
    deleteBtn.style.cursor = 'pointer';
    
    header.appendChild(chevron);
    header.appendChild(title);
    header.appendChild(deleteBtn);
    
    const body = document.createElement('div');
    body.className = 'task-content';
    
    header.addEventListener('click', (e) => {
      if (e.target === deleteBtn) {
        if (confirm('Delete this task history?')) {
          group.remove();
          if (currentGroupEl === group) {
            currentTaskBox = null;
            currentAiChatBox = null;
            currentConsoleBox = null;
            currentGroupEl = null;
          }
          // Note: Full persistent removal from state.events is complex,
          // for now we just remove from DOM. Refreshing will bring it back.
          // To fix permanently, we would filter state.events based on task chunks.
          if (dom.outputLog.children.length === 0) {
            dom.emptyState.classList.remove('hidden');
          }
        }
        return;
      }
      header.classList.toggle('open');
    });
    
    group.appendChild(header);
    group.appendChild(body);
    
    const splitView = document.createElement('div');
    splitView.className = 'task-split-view';
    
    const aiChat = document.createElement('div');
    aiChat.className = 'ai-chat-section';
    aiChat.style.display = 'none';
    
    const consoleLog = document.createElement('div');
    consoleLog.className = 'console-section';
    
    splitView.appendChild(aiChat);
    splitView.appendChild(consoleLog);
    body.appendChild(splitView);
    
    currentAiChatBox = aiChat;
    currentConsoleBox = consoleLog;
    currentTaskBox = body;
    currentGroupEl = group;
    
    dom.outputLog.appendChild(group);
    
    // Do not create a separate 'msg user' block inside the body, 
    // the title in the header is enough for the user prompt.
  } else {
    const msgEl = createMessageElement(type, content);
    if (currentTaskBox && type !== 'user' && !content.includes('---')) {
      currentTaskBox.appendChild(msgEl);
    } else {
      dom.outputLog.appendChild(msgEl);
    }
  }

  dom.outputLog.scrollTop = dom.outputLog.scrollHeight;
  
  if (!noSave) {
    try {
      saveHistory();
    } catch (e) {}
  }
}

function clearOutput() {
  dom.outputLog.innerHTML = "";
  dom.emptyState.classList.remove("hidden");
  sessionStorage.removeItem('chatHistory');
  state.events = [];
  currentTaskBox = null;
  currentAiChatBox = null;
  currentConsoleBox = null;
  currentGroupEl = null;
}

/* ── Keyboard shortcuts ─────────────────────────────── */
function onKeyDown(e) {
  const modalOpen = !dom.overlay.classList.contains("hidden");
  if (e.key === "Enter" && modalOpen && !e.shiftKey) { e.preventDefault(); respond("allow"); return; }
  if (e.key === "Escape" && modalOpen) { e.preventDefault(); respond("deny"); return; }
  if (e.key === "Enter" && !e.shiftKey && document.activeElement === dom.input) { e.preventDefault(); dom.form.requestSubmit(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === "l") { e.preventDefault(); clearOutput(); }
}
