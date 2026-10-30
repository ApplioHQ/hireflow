"use strict";

const $ = (sel) => document.querySelector(sel);
const NAMES = { claude: "Claude", hermes: "Hermes" };
const nameOf = (agent) => (agent === "auto" ? "Auto" : String(agent).split("+").map((a) => NAMES[a] || a).join(" + "));
const isRelay = (owner) => String(owner).includes("+");
const relayPairs = () => (state.agents.length >= 2
  ? [`${state.agents[0]}+${state.agents[1]}`, `${state.agents[1]}+${state.agents[0]}`] : []);
const relayRoles = (owner) => {
  const [lead, reviewer] = String(owner).split("+");
  return `${nameOf(lead)} builds, ${nameOf(reviewer)} reviews, up to ${state.relay_turns || 4} turns`;
};

let state = { tasks: [], agents: [], current: null, queued: [] };
let thread = null;
let pickedAgent = null;
let lastStateKey = "";
let lastThreadKey = "";
let pollTimer = null;
let installPrompt = null;

// ---- helpers ----

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agents": "1" },
    body: JSON.stringify(body),
  };
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error("Can't reach the app server. Start it with: npm run app");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function selectedId() {
  const id = decodeURIComponent(location.hash.slice(1));
  return /^T\d+$/.test(id) ? id : null;
}

function select(id) {
  location.hash = id ? id : "";
  if (!id) history.replaceState(null, "", location.pathname);
  $(".app").classList.remove("nav-open");
}

function taskById(id) {
  return state.tasks.find((t) => t.id === id);
}

function quick() {
  return state.quick || { current: null, queued: [] };
}

function liveStatus(task) {
  if (state.current === task.id || quick().current === task.id) return "running";
  if (state.queued.includes(task.id) || quick().queued.includes(task.id)) return "queued";
  return task.status;
}

function isBusy(id) {
  return liveStatus({ id, status: "" }) === "running" || liveStatus({ id, status: "" }) === "queued";
}

function autoNote() {
  return state.auto ? `${nameOf(state.auto.answer)} answers questions, ${nameOf(state.auto.code)} makes code changes` : "";
}

// ---- agent text rendering ----

function inline(text) {
  return esc(text)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

function renderAgentText(text) {
  const out = [];
  let para = [];
  let code = null;
  const flush = () => {
    const joined = para.join("\n").trim();
    if (joined) out.push(`<p>${inline(joined)}</p>`);
    para = [];
  };
  for (const line of text.split("\n")) {
    if (code !== null) {
      if (line.trim().startsWith("```")) {
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (line.trim().startsWith("```")) { flush(); code = []; continue; }
    const tool = line.match(/^> (\S+)\s*(.*)$/);
    if (tool) {
      flush();
      out.push(`<div class="tool"><span class="tool-name">${esc(tool[1])}</span><span class="tool-arg" title="${esc(tool[2])}">${esc(tool[2])}</span></div>`);
      continue;
    }
    const meta = line.match(/^\[(cost \$[\d.]+|\d+ tokens|stopped by user)\]$/);
    if (meta) { flush(); out.push(`<div class="meta-line">${esc(meta[1])}</div>`); continue; }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) { flush(); out.push(`<p><strong>${inline(heading[1])}</strong></p>`); continue; }
    if (!line.trim()) { flush(); continue; }
    para.push(line);
  }
  if (code !== null) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  flush();
  return out.join("");
}

// ---- sidebar ----

function renderSidebar() {
  const id = selectedId();
  $("#new-task").classList.toggle("active", !id);
  const list = [...state.tasks].reverse();
  $("#task-list").innerHTML = list.length ? list.map((t) => {
    const status = liveStatus(t);
    return `<button type="button" class="task${t.id === id ? " active" : ""}" data-id="${esc(t.id)}">
      <span class="dot ${esc(status)}" title="${esc(status)}"></span>
      <span class="task-text">
        <span class="task-title">${esc(t.task)}</span>
        <span class="task-meta">${esc(t.id)} - ${esc(t.owner === "unassigned" ? "no owner" : nameOf(t.owner))} - ${esc(status.replace("_", " "))}</span>
      </span>
    </button>`;
  }).join("") : `<div class="list-label">No tasks yet</div>`;
  $("#repo").textContent = state.repo ? `${state.repo} - ${state.branch || "?"}` : "";
}

// ---- header ----

function renderHead() {
  const id = selectedId();
  const task = id && taskById(id);
  const menu = `<button type="button" class="icon-btn menu-btn" id="menu-btn" aria-label="Tasks">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`;
  if (!task) {
    $("#head").innerHTML = `${menu}<div class="head-title"><h1>New task</h1>
      <div class="head-meta">One agent works at a time. Tasks you start while one is running wait in the queue.</div></div>`;
    return;
  }
  const status = liveStatus(task);
  const busy = isBusy(id);
  const choices = [...(state.auto ? ["auto"] : []), ...state.agents, ...relayPairs()];
  const ownerOptions = choices.map((a) => `<option value="${esc(a)}"${a === task.owner ? " selected" : ""}>${esc(nameOf(a))}</option>`).join("");
  const owner = busy
    ? `<span class="pill">${esc(nameOf(task.owner))}</span>`
    : `<select class="owner-select" id="owner-select" aria-label="Agent">${choices.includes(task.owner) ? "" : '<option value="" selected>Pick an agent</option>'}${ownerOptions}</select>`;
  const actions = [];
  if (busy) actions.push(`<button type="button" class="btn danger" data-action="stop">${liveStatus(task) === "running" ? "Stop" : "Cancel"}</button>`);
  if (!busy && ["pending", "blocked"].includes(task.status)) actions.push(`<button type="button" class="btn primary" data-action="run">${task.status === "blocked" ? "Run again" : "Run"}</button>`);
  if (!busy && task.status === "blocked") actions.push(`<button type="button" class="btn" data-action="reset">Reset</button>`);
  actions.push(`<button type="button" class="btn" data-panel="diff">Changes</button>`);
  $("#head").innerHTML = `${menu}<div class="head-title"><h1 title="${esc(task.task)}">${esc(task.task)}</h1>
    <div class="head-meta"><span>${esc(id)}</span>${owner}<span class="pill ${esc(status)}">${esc(status.replace("_", " "))}</span></div></div>
    <div class="head-actions">${actions.join("")}</div>`;
}

// ---- messages ----

function renderWelcome() {
  return `<div class="welcome">
    <h2>What should the agents work on?</h2>
    <p>Ask a question or describe a change. On Auto, Hermes answers questions and hands code changes to Claude. You can also pick Claude, Hermes, or Both yourself.</p>
    <div class="welcome-tips">
      <button type="button" class="tip" data-tip="Audit sitemap.xml for URLs whose .html file no longer exists and remove them">Audit sitemap.xml for missing pages</button>
      <button type="button" class="tip" data-tip="Add a short comment block at the top of js/config.js explaining what each setting does">Document js/config.js settings</button>
      <button type="button" class="tip" data-tip="Find any console.log calls left in js/ and remove the ones that are debug leftovers">Remove leftover debug logs in js/</button>
    </div>
  </div>`;
}

function renderRelayResult(m) {
  const ok = m.relay === "agreed";
  const title = ok ? "Both agents agree: done" : `No agreement: ${esc(m.reason)}`;
  const hint = ok
    ? "Review the changes, then commit when you're happy. Reply below to ask for more."
    : "Reply below with directions, or press Run again.";
  return `<div class="result ${ok ? "ok" : "bad"}"><div class="result-title">${title}</div>
    <div class="result-hint">${esc(m.text || "")} ${hint}</div>
    <div class="result-actions"><button type="button" class="btn" data-panel="diff">View changes</button></div></div>`;
}

function renderTurnResult(m) {
  const files = (m.files || []).filter((f) => f && !f.startsWith("agent_state/"));
  let label;
  if (!m.ok) label = m.reason === "stopped by user" ? "Stopped" : `Check failed${m.reason ? `: ${esc(m.reason)}` : ""}`;
  else if (m.approved) label = "Approved, check passed";
  else if (m.step === "review") label = files.length ? "Made fixes, check passed" : "Not approved yet";
  else label = "Built, check passed";
  const check = !m.ok && m.check && m.check !== "skipped: agent failed" ? `<pre class="result-check">${esc(m.check)}</pre>` : "";
  return `<div class="turn-result ${m.ok ? "ok" : "bad"}"><span>${label}</span>
    ${files.length ? `<span class="turn-files">${files.map(esc).join(", ")}</span>` : ""}</div>${check}`;
}

function renderAnswerResult(m) {
  const files = (m.files || []).filter(Boolean);
  if (m.ok && !files.length) return "";
  if (!m.ok) return `<div class="turn-result bad"><span>Stopped${m.reason ? `: ${esc(m.reason)}` : ""}</span></div>`;
  return `<div class="result bad"><div class="result-title">Changed files while answering</div>
    <ul class="result-files">${files.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    <div class="result-hint">It was asked not to change anything. Check these before committing.</div>
    <div class="result-actions"><button type="button" class="btn" data-panel="diff">View changes</button></div></div>`;
}

function renderResult(m, task) {
  if (m.relay) return renderRelayResult(m);
  if (m.answer) return renderAnswerResult(m);
  if (m.step) return renderTurnResult(m);
  const files = (m.files || []).filter(Boolean);
  const title = m.ok
    ? `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Done, check passed`
    : `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 7v6M12 17h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="2" fill="none"/></svg>Blocked${m.reason ? `: ${esc(m.reason)}` : ""}`;
  const fileList = files.length ? `<ul class="result-files">${files.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : `<div class="result-hint">No file changes detected.</div>`;
  const check = !m.ok && m.check && m.check !== "skipped: agent failed" ? `<pre class="result-check">${esc(m.check)}</pre>` : "";
  const hint = m.ok
    ? `<div class="result-hint">Review the changes, then commit when you're happy. Reply below to ask for more.</div>`
    : `<div class="result-hint">Reply below to tell the agent how to fix it, or run it again.</div>`;
  return `<div class="result ${m.ok ? "ok" : "bad"}">
    <div class="result-title">${title}</div>${fileList}${check}${hint}
    <div class="result-actions"><button type="button" class="btn" data-panel="diff">View changes</button>
    ${m.log ? `<span class="meta-line">log: ${esc(m.log)}</span>` : ""}</div></div>`;
}

function renderThread() {
  const id = selectedId();
  const task = id && taskById(id);
  if (!task || !thread) return renderWelcome();
  const parts = thread.messages.map((m) => {
    if (m.role === "user") {
      const files = (m.files || []).map((f) => `<span class="attachment" title="${esc(f)}">${esc(f.split("/").pop())}</span>`).join("");
      return `<div class="msg user"><div class="bubble">${esc(m.text)}</div>${files ? `<div class="attachments">${files}</div>` : ""}</div>`;
    }
    if (m.role === "result") return renderResult(m, task);
    const agent = m.agent || thread.agent || task.owner;
    const body = m.text.trim() ? renderAgentText(m.text) : (m.live ? "" : `<div class="empty-agent">No output.</div>`);
    const doing = { review: "reviewing", auto: "thinking" }[m.step] || "working";
    const working = m.live ? `<div class="working"><span class="dot running"></span>${esc(nameOf(agent))} is ${doing}...</div>` : "";
    let step = "";
    if (m.step === "route") step = `<span class="step">routing</span>`;
    else if (m.step === "build" || m.step === "review") step = `<span class="step">${m.step} - turn ${m.turn}</span>`;
    return `<div class="msg agent"><div class="who"><span class="badge ${esc(agent)}">${esc(nameOf(agent).charAt(0))}</span>${esc(nameOf(agent))}${step}</div><div class="body">${body}</div>${working}</div>`;
  });
  if (state.queued.includes(id) || quick().queued.includes(id)) parts.push(`<div class="working"><span class="dot queued"></span>Queued. Starts when ${esc(state.current || "the current task")} finishes.</div>`);
  if (task.status === "pending" && !isBusy(id) && thread.messages.length <= 1) parts.push(`<div class="result-hint">This task hasn't run yet. Press Run when you're ready.</div>`);
  return `<div class="thread">${parts.join("")}</div>`;
}

function renderMessages(force) {
  const box = $("#messages");
  const key = JSON.stringify([selectedId(), thread, state.current, state.queued, taskById(selectedId())]);
  if (!force && key === lastThreadKey) return;
  lastThreadKey = key;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  box.innerHTML = renderThread();
  if (nearBottom || force) box.scrollTop = box.scrollHeight;
  renderComposer();
}

// ---- composer ----

function renderComposer() {
  const id = selectedId();
  const task = id && taskById(id);
  const input = $("#input");
  const pick = $("#agent-pick");
  const note = $("#composer-note");
  const queueBtn = $("#queue-btn");
  const canRelay = state.agents.length >= 2;
  const valid = (a) => state.agents.includes(a) || (a === "relay" && canRelay) || (a === "auto" && state.auto);
  if (!pickedAgent || !valid(pickedAgent)) pickedAgent = state.auto ? "auto" : state.agents[0] || null;

  if (!task) {
    pick.hidden = false;
    const options = [...(state.auto ? [["auto", "Auto"]] : []), ...state.agents.map((a) => [a, nameOf(a)]),
      ...(canRelay ? [["relay", "Both"]] : [])];
    pick.innerHTML = options.map(([value, label]) => `<button type="button" role="radio" aria-checked="${value === pickedAgent}" data-agent="${esc(value)}">${esc(label)}</button>`).join("");
    const relay = pickedAgent === "relay";
    const auto = pickedAgent === "auto";
    if (auto) input.placeholder = "Ask a question or describe a change...";
    else if (relay) input.placeholder = `Describe a task for ${nameOf(relayPairs()[0])} to do together...`;
    else input.placeholder = `Describe a task for ${nameOf(pickedAgent)}...`;
    input.disabled = false;
    if (auto) note.textContent = autoNote();
    else if (state.current) note.textContent = `${state.current} is running; this will queue.`;
    else note.textContent = relay ? relayRoles(relayPairs()[0]) : "";
    queueBtn.hidden = false;
    $("#send-btn").disabled = false;
    return;
  }
  pick.hidden = true;
  queueBtn.hidden = true;
  const busy = isBusy(id);
  const agent = nameOf(task.owner);
  if (busy) {
    input.disabled = true;
    input.placeholder = liveStatus(task) === "running" ? "Working. You can reply when it finishes." : "Queued. You can reply after it runs.";
    note.textContent = "";
  } else if (task.status === "pending") {
    input.disabled = true;
    input.placeholder = "Run this task first, then reply here to follow up.";
    note.textContent = "";
  } else if (task.owner === "auto") {
    input.disabled = false;
    input.placeholder = "Ask a follow-up or request a change...";
    note.textContent = autoNote();
  } else if (isRelay(task.owner)) {
    input.disabled = false;
    input.placeholder = `Reply to ${agent}...`;
    const [lead, reviewer] = task.owner.split("+");
    note.textContent = `${nameOf(lead)} takes your reply, then ${nameOf(reviewer)} reviews`;
  } else {
    input.disabled = false;
    input.placeholder = `Reply to ${agent}...`;
    note.textContent = thread && thread.session_id ? `Continues ${agent}'s session` : `Starts a new ${agent} session with your reply`;
  }
  $("#send-btn").disabled = input.disabled;
}

function autosize() {
  const input = $("#input");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 240) + "px";
}

async function send(run = true) {
  const input = $("#input");
  const text = input.value.trim();
  if (!text || input.disabled) return;
  const id = selectedId();
  const sendBtn = $("#send-btn");
  sendBtn.disabled = true;
  try {
    if (id) {
      await api(`/api/tasks/${id}/reply`, { text });
    } else {
      const res = await api("/api/tasks", { agent: pickedAgent, text, run });
      select(res.id);
      if (!run) toast(`${res.id} added to the queue. Press Run when you're ready.`);
    }
    input.value = "";
    autosize();
    await refresh(true);
  } catch (e) {
    toast(e.message);
  } finally {
    sendBtn.disabled = false;
    renderComposer();
  }
}

// ---- side panel ----

function renderDiff(data) {
  const status = data.status.trim()
    ? `<pre class="status-list">${esc(data.status.trimEnd())}</pre>`
    : `<p class="muted">No uncommitted changes.</p>`;
  if (!data.diff.trim()) {
    const untracked = data.status.includes("??") ? `<p class="muted">New files (marked ??) aren't shown as a diff until they're added to git.</p>` : "";
    return status + untracked;
  }
  const lines = data.diff.split("\n").map((line) => {
    let cls = "";
    if (line.startsWith("diff --git")) cls = "diff-file";
    else if (line.startsWith("+") && !line.startsWith("+++")) cls = "diff-add";
    else if (line.startsWith("-") && !line.startsWith("---")) cls = "diff-del";
    else if (line.startsWith("@@")) cls = "diff-hunk";
    return `<span class="diff-line ${cls}">${esc(line) || " "}</span>`;
  }).join("");
  return `${status}<pre class="diff">${lines}</pre>`;
}

async function openPanel(kind) {
  const titles = { handoff: "Latest handoff", context: "Decisions log", diff: "Uncommitted changes" };
  $("#panel-title").textContent = titles[kind];
  $("#panel-body").innerHTML = `<p class="muted">Loading...</p>`;
  $("#panel").hidden = false;
  $("#panel").dataset.kind = kind;
  try {
    if (kind === "diff") {
      $("#panel-body").innerHTML = renderDiff(await api("/api/diff"));
    } else {
      const data = await api(`/api/files/${kind}`);
      $("#panel-body").innerHTML = `<pre>${esc(data.text || "(empty)")}</pre>`;
    }
  } catch (e) {
    $("#panel-body").innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

// ---- data loop ----

async function refresh(forceScroll = false) {
  try {
    const next = await api("/api/state");
    const id = selectedId();
    let nextThread = null;
    if (id && next.tasks.some((t) => t.id === id)) nextThread = await api(`/api/threads/${id}`);
    const stateKey = JSON.stringify(next);
    state = next;
    thread = nextThread;
    if (stateKey !== lastStateKey) {
      lastStateKey = stateKey;
      renderSidebar();
      renderHead();
      renderComposer();
    }
    renderMessages(forceScroll);
  } catch (e) {
    toast(e.message);
  }
  schedule();
}

function schedule() {
  clearTimeout(pollTimer);
  const active = state.current || state.queued.length || quick().current || quick().queued.length;
  pollTimer = setTimeout(refresh, active ? 800 : 4000);
}

function rerenderAll() {
  lastStateKey = "";
  lastThreadKey = "";
  renderSidebar();
  renderHead();
  renderComposer();
  renderMessages(true);
}

// ---- events ----

document.addEventListener("click", async (e) => {
  const el = e.target.closest("button, .tip");
  if (!el) return;
  if (el.id === "new-task") { select(null); return; }
  if (el.id === "menu-btn") { $(".app").classList.add("nav-open"); return; }
  if (el.id === "panel-close") { $("#panel").hidden = true; return; }
  if (el.id === "queue-btn") { send(false); return; }
  if (el.id === "install" && installPrompt) {
    installPrompt.prompt();
    installPrompt = null;
    el.hidden = true;
    return;
  }
  if (el.dataset.id) { select(el.dataset.id); return; }
  if (el.dataset.panel) { openPanel(el.dataset.panel); return; }
  if (el.dataset.agent) { pickedAgent = el.dataset.agent; renderComposer(); $("#input").focus(); return; }
  if (el.dataset.tip) { $("#input").value = el.dataset.tip; autosize(); $("#input").focus(); return; }
  const action = el.dataset.action;
  const id = selectedId();
  if (action && id) {
    el.disabled = true;
    try {
      const res = await api(`/api/tasks/${id}/${action}`, {});
      if (action === "stop") toast(res.result === "cancelled" ? `${id} removed from the queue.` : `Stopping ${id}...`);
      if (action === "reset") toast(`${id} is pending again. Check Changes for leftovers from the failed run.`);
      await refresh(true);
    } catch (err) {
      toast(err.message);
      el.disabled = false;
    }
  }
});

document.addEventListener("change", async (e) => {
  if (e.target.id !== "owner-select" || !e.target.value) return;
  try {
    await api(`/api/tasks/${selectedId()}/owner`, { agent: e.target.value });
    await refresh();
  } catch (err) {
    toast(err.message);
  }
});

$("#scrim").addEventListener("click", () => $(".app").classList.remove("nav-open"));
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); send(true); });
$("#input").addEventListener("input", autosize);
$("#input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(true); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("#panel").hidden = true; $(".app").classList.remove("nav-open"); }
});
window.addEventListener("hashchange", () => {
  thread = null;
  rerenderAll();
  refresh(true);
  if (!$("#panel").hidden && $("#panel").dataset.kind === "diff") openPanel("diff");
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("#install").hidden = false;
});
window.addEventListener("appinstalled", () => { $("#install").hidden = true; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

refresh(true);
