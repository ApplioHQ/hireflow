"use strict";

const $ = (sel) => document.querySelector(sel);
const NAMES = { claude: "Claude", hermes: "Hermes", chatgpt: "ChatGPT", auto: "Auto" };
const BADGES = {
  claude: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M9.218 2h2.402L16 12.987h-2.402zM4.379 2h2.512l4.38 10.987H8.82l-.895-2.308h-4.58l-.896 2.307H0L4.38 2.001zm2.755 6.64L5.635 4.777 4.137 8.64z"/></svg>`,
  hermes: `<img src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png@latest/dark/hermesagent.png" width="18" height="18" alt="" style="display:block;border-radius:3px">`,
  chatgpt: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z"/></svg>`,
};
const AVATARS = {
  claude: `<svg viewBox="0 0 16 16" width="16" height="16" fill="#fff"><path fill-rule="evenodd" d="M9.218 2h2.402L16 12.987h-2.402zM4.379 2h2.512l4.38 10.987H8.82l-.895-2.308h-4.58l-.896 2.307H0L4.38 2.001zm2.755 6.64L5.635 4.777 4.137 8.64z"/></svg>`,
  hermes: `<img src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png@latest/dark/hermesagent.png" width="28" height="28" alt="" style="display:block;border-radius:50%">`,
  chatgpt: `<svg viewBox="0 0 16 16" width="16" height="16" fill="#fff"><path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z"/></svg>`,
};
const nameOf = (agent) => String(agent).split("+").map((a) => NAMES[a] || a).join(" + ");

let state = { projects: [], agents: [], coders: [], orchestrator: "hermes", running: [], unavailable: {} };
let chat = null;
let pickedAgent = "";
let lastStateKey = "";
let lastChatKey = "";
let pollTimer = null;
let installPrompt = null;
let collapsed = {};
let searchResults = null;
let attachments = [];  // {id, name, size, path, url, uploading, error}
const MAX_FILE = 25 * 1024 * 1024;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
try { collapsed = JSON.parse(localStorage.getItem("collapsed") || "{}"); } catch { collapsed = {}; }

// ---- helpers ----

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

function route() {
  const [, pid = "", cid = ""] = location.hash.split("/").map(decodeURIComponent);
  return { pid, cid };
}

function go(pid, cid) {
  location.hash = cid ? `#/${encodeURIComponent(pid)}/${encodeURIComponent(cid)}` : pid ? `#/${encodeURIComponent(pid)}` : "";
  $(".app").classList.remove("nav-open");
}

function project(pid) {
  return state.projects.find((p) => p.id === pid);
}

function currentProject() {
  const { pid } = route();
  return project(pid) || state.projects[0] || null;
}

function chatSummary(pid, cid) {
  const p = project(pid);
  return p && p.chats.find((c) => c.id === cid);
}

function chatStatus(pid, cid) {
  const c = chatSummary(pid, cid);
  return c ? c.status : "idle";
}

function isBusy(pid, cid) {
  return ["running", "queued"].includes(chatStatus(pid, cid));
}

function defaultCoder(p) {
  const coders = ((p && p.coders) || state.coders).filter((c) => state.coders.includes(c));
  return coders.find((c) => !state.unavailable[c]) || coders[0] || "claude";
}

function ago(iso) {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

// ---- agent text ----

function inline(text) {
  return esc(text).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

function hideCodexDiagnostics(text, agent) {
  if (agent !== "chatgpt") return text;
  return text.split("\n").filter((line) =>
    !/^\d{4}-\d\d-\d\dT\S+\s+WARN\s+codex_(?:skills|app_server_protocol)::/.test(line)
  ).join("\n").trim();
}

// syntax highlighting keywords by language
const KEYWORDS = {
  js: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|new|this|async|await|try|catch|throw|typeof|instanceof|of|in|switch|case|break|continue|null|undefined|true|false)\b/g,
  py: /\b(def|class|return|if|elif|else|for|while|import|from|as|with|try|except|raise|yield|async|await|lambda|not|and|or|is|in|None|True|False|self|print)\b/g,
  sh: /\b(if|then|else|fi|for|do|done|while|case|esac|function|return|exit|echo|cd|ls|grep|sed|awk|cat|mkdir|rm|cp|mv|export|source)\b/g,
  css: /\b(color|background|display|flex|grid|margin|padding|border|width|height|font|position|top|left|right|bottom|z-index|overflow|opacity|transition|transform|animation)\b/g,
  html: /(&lt;\/?)([\w-]+)/g,
};

function detectLang(code, hint) {
  if (hint && ["js","javascript","jsx","ts","tsx"].some(l => hint.includes(l))) return "js";
  if (hint && ["py","python"].some(l => hint.includes(l))) return "py";
  if (hint && ["sh","bash","zsh","shell"].some(l => hint.includes(l))) return "sh";
  if (hint && ["css","scss","sass"].some(l => hint.includes(l))) return "css";
  if (hint && ["html","htm","xml","svg"].some(l => hint.includes(l))) return "html";
  if (/\b(const|let|var|=>|function\s)\b/.test(code)) return "js";
  if (/\b(def |import |class .*:)/.test(code)) return "py";
  if (/^\s*(#!\/|if \[|echo |cd |export )/.test(code)) return "sh";
  return "";
}

function stripHtmlTags(text) {
  return text
    .replace(/<span\s+class="[^"]*">/g, "")
    .replace(/<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/"hl-\w+">/g, "")
    .replace(/"hl-\w+"/g, "")
    .replace(/\bhl-\w+/g, "");
}

function highlightCode(text, lang) {
  let html = esc(text);
  if (lang === "html") {
    return html.replace(KEYWORDS.html, '$1<span class="hl-tag">$2</span>');
  }
  const parts = [];
  const tokenRe = /(["'`])(?:(?!\1).)*?\1|\/\/.*|#(?!!).*$/gm;
  let last = 0;
  for (const m of html.matchAll(tokenRe)) {
    if (m.index > last) parts.push({ type: "code", text: html.slice(last, m.index) });
    parts.push({ type: /^["'`]/.test(m[0]) ? "str" : "cmt", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < html.length) parts.push({ type: "code", text: html.slice(last) });
  const kwRe = KEYWORDS[lang];
  return parts.map((p) => {
    if (p.type === "str") return `<span class="hl-str">${p.text}</span>`;
    if (p.type === "cmt") return `<span class="hl-cmt">${p.text}</span>`;
    return kwRe ? p.text.replace(kwRe, '<span class="hl-kw">$&</span>') : p.text;
  }).join("");
}

let codeBlockId = 0;

function renderAgentText(text) {
  const out = [];
  let para = [];
  let code = null;
  let codeLang = "";
  let tools = [];
  const flush = () => {
    const joined = para.join("\n").trim();
    if (joined) out.push(`<p>${inline(joined)}</p>`);
    para = [];
  };
  const flushTools = () => {
    if (!tools.length) return;
    const id = `tools-${++codeBlockId}`;
    const count = tools.length;
    out.push(`<details class="tool-group"><summary class="tool-summary">${count} tool call${count > 1 ? "s" : ""}</summary><div class="tool-list">${tools.join("")}</div></details>`);
    tools = [];
  };
  for (const line of text.split("\n")) {
    if (code !== null) {
      if (line.trim().startsWith("```")) {
        const id = `code-${++codeBlockId}`;
        const raw = stripHtmlTags(code.join("\n"));
        const lang = detectLang(raw, codeLang);
        const highlighted = highlightCode(raw, lang);
        const runnable = ["python", "py", "sh", "bash", "shell", "zsh"].includes((codeLang || lang).toLowerCase());
        const runBtn = runnable ? `<button type="button" class="run-btn" data-run="${id}" data-lang="${esc(codeLang || lang)}">Run</button>` : "";
        out.push(`<div class="code-block"><div class="code-head"><span class="code-lang">${esc(codeLang || lang)}</span>${runBtn}<button type="button" class="copy-btn" data-copy="${id}">Copy</button></div><pre id="${id}"><code>${highlighted}</code></pre></div>`);
        code = null;
        continue;
      }
      code.push(line);
      continue;
    }
    const fenceMatch = line.trim().match(/^```(\w*)/);
    if (fenceMatch) { flush(); flushTools(); code = []; codeLang = fenceMatch[1] || ""; continue; }
    if (/^\W*(DELEGATE|REVIEW|TITLE|BLOCKED):/.test(line)) continue;
    const tool = line.match(/^> (\S+)\s*(.*)$/);
    if (tool) {
      flush();
      tools.push(`<div class="tool"><span class="tool-name">${esc(tool[1])}</span><span class="tool-arg" title="${esc(tool[2])}">${esc(tool[2])}</span></div>`);
      continue;
    }
    if (!line.trim()) {
      if (!tools.length) { flush(); }
      continue;
    }
    if (tools.length) flushTools();
    const meta = line.match(/^\[(cost \$[\d.]+|\d+ tokens|stopped by user)\]$/);
    if (meta) { flush(); out.push(`<div class="meta-line">${esc(meta[1])}</div>`); continue; }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) { flush(); const tag = `h${heading[1].length + 2}`; out.push(`<${tag} class="agent-heading">${inline(heading[2])}</${tag}>`); continue; }
    if (line.match(/^\s*[-*]\s+/)) {
      flush();
      out.push(`<p class="list-item">${inline(line.replace(/^\s*[-*]\s+/, ""))}</p>`);
      continue;
    }
    para.push(line);
  }
  if (code !== null) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  flush();
  flushTools();
  return out.join("");
}

// ---- sidebar ----

function renderSidebar() {
  const { pid, cid } = route();
  const nav = $("#projects");
  if (searchResults) {
    nav.innerHTML = searchResults.length ? searchResults.map((r) => `
      <button type="button" class="task" data-open="${esc(r.project)}|${esc(r.chat)}">
        <span class="task-text"><span class="task-title">${esc(r.title)}</span>
        <span class="task-meta">${esc(project(r.project)?.name || r.project)} - ${esc(r.snippet)}</span></span>
      </button>`).join("") : `<div class="list-label">No matches</div>`;
    return;
  }
  const strip = state.agents.length ? `<div class="agent-strip">${state.agents.map((a) => {
    const avail = !state.unavailable[a];
    return `<span class="agent-chip">${badge(a)}<span class="agent-name">${esc(nameOf(a))}</span><span class="status-dot ${avail ? "available" : "unavailable"}"></span></span>`;
  }).join("")}</div>` : "";
  const active = pid || state.projects[0]?.id;
  nav.innerHTML = strip + state.projects.map((p) => {
    const open = !collapsed[p.id];
    const chats = open ? p.chats.slice(0, 40).map((c) => `
      <div class="task-row">
        <button type="button" class="task${p.id === pid && c.id === cid ? " active" : ""}" data-open="${esc(p.id)}|${esc(c.id)}">
          <span class="dot ${esc(c.status === "idle" ? (c.failed ? "blocked" : "done") : c.status)}"></span>
          <span class="task-text"><span class="task-title">${c.pinned ? "&#9733; " : ""}${esc(c.title)}</span>
          <span class="task-meta">${esc(ago(c.updated))}${c.status !== "idle" ? " - " + esc(c.status) : ""}</span></span>
        </button>
        <button type="button" class="row-delete" data-delete="${esc(p.id)}|${esc(c.id)}" title="Delete chat" aria-label="Delete ${esc(c.title)}">&times;</button>
      </div>`).join("") : "";
    return `<div class="project${p.id === active ? " current" : ""}">
      <div class="project-row">
        <button type="button" class="project-name" data-toggle="${esc(p.id)}" title="${esc(p.path)}">
          <span class="chev">${open ? "&#9662;" : "&#9656;"}</span>${esc(p.name)}${p.exists ? "" : " (missing)"}
        </button>
        <span class="project-coder" title="Default coder">${esc(nameOf(defaultCoder(p)))}</span>
        <button type="button" class="icon-btn small" data-settings="${esc(p.id)}" aria-label="${esc(p.name)} settings">&#9881;</button>
        <button type="button" class="icon-btn small" data-new="${esc(p.id)}" aria-label="New chat in ${esc(p.name)}">+</button>
      </div>
      ${open ? (chats || `<div class="empty-chats">No chats yet</div>`) : ""}
    </div>`;
  }).join("") || `<div class="list-label">Add a project folder to start.</div>`;
}

// ---- header ----

function renderHead() {
  const { pid, cid } = route();
  const p = project(pid);
  const menu = `<button type="button" class="icon-btn menu-btn" id="menu-btn" aria-label="Chats">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`;
  if (!chat || !p) {
    const cp = currentProject();
    $("#head").innerHTML = `${menu}<div class="head-title"><h1>New chat${cp ? " in " + esc(cp.name) : ""}</h1>
      <div class="head-meta">Hermes reads every message: it answers questions and hands code to ${esc(nameOf(defaultCoder(cp)))}.</div></div>`;
    return;
  }
  const status = chatStatus(pid, cid);
  const stopBtn = isBusy(pid, cid) ? `<button type="button" class="icon-btn" data-action="stop" title="${status === "queued" ? "Cancel" : "Stop"}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--bad)" stroke-width="2" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>` : "";
  $("#head").innerHTML = `${menu}<div class="head-title"><h1 title="${esc(chat.title)}">${esc(chat.title)}</h1>
    <div class="head-meta"><span>${esc(p.name)}</span><span class="muted">${esc(p.path)}</span>
    ${status !== "idle" ? `<span class="pill running">${esc(status)}</span>` : ""}</div></div>
    <div class="head-actions">${stopBtn}<button type="button" class="icon-btn" data-panel="diff" title="Changes"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></button><button type="button" class="icon-btn head-more" id="head-more" title="More actions"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></button></div>
    <div class="head-menu" id="head-menu" hidden>
      <button type="button" data-action="pin">${chat.pinned ? "Unpin" : "Pin"}</button>
      <button type="button" data-action="rename">Rename</button>
      <button type="button" data-action="archive">${chat.archived ? "Unarchive" : "Archive"}</button>
      <button type="button" data-action="screenshot">Screenshot</button>
      <button type="button" class="bad-text" data-action="delete">Delete</button>
    </div>`;
}

// ---- messages ----

function renderWelcome() {
  const p = currentProject();
  if (!p) return `<div class="welcome"><h2>Add a project folder</h2><p>Use "Add project folder" in the sidebar, then start a chat.</p></div>`;
  return `<div class="welcome">
    <h2>What should we do in ${esc(p.name)}?</h2>
    <p>Hermes reads your message. Questions it answers itself; changes it hands to ${esc(nameOf(defaultCoder(p)))}, then reports back.</p>
    <div class="welcome-tips">
      <button type="button" class="tip" data-tip="What does this project do, and where are the main entry points?">Explain this project</button>
      <button type="button" class="tip" data-tip="Find any leftover debug logging and remove it">Remove leftover debug logging</button>
      <button type="button" class="tip" data-tip="Review the uncommitted changes and list anything risky. Do not change files.">Review uncommitted changes</button>
    </div></div>`;
}

function badge(agent) {
  const icon = BADGES[agent];
  return icon
    ? `<span class="badge ${esc(agent)}">${icon}</span>`
    : `<span class="badge">${esc(nameOf(agent).charAt(0))}</span>`;
}

function fileUrl(pid, f) {
  return `/pf/${encodeURIComponent(pid)}/${f.split("/").map(encodeURIComponent).join("/")}`;
}

function previewFor(pid, f) {
  const url = fileUrl(pid, f);
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(f)) {
    return `<a class="preview-img" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(f)}"><img src="${esc(url)}" alt="${esc(f)}" loading="lazy"></a>`;
  }
  if (/\.html?$/i.test(f)) {
    return `<div class="preview-html"><div class="preview-bar"><span title="${esc(f)}">${esc(f.split("/").pop())}</span>
      <a href="${esc(url)}" target="_blank" rel="noopener">Open full</a></div></div>`;
  }
  return "";
}

function previews(files) {
  const { pid } = route();
  const made = files.map((f) => previewFor(pid, f)).filter(Boolean).slice(0, 6);
  return made.length ? `<div class="previews">${made.join("")}</div>` : "";
}

function avatar(agent) {
  const key = String(agent).split("+")[0];
  const icon = AVATARS[key];
  return icon
    ? `<div class="msg-avatar ${esc(key)}">${icon}</div>`
    : `<div class="msg-avatar" style="background:var(--faint);color:#fff;font-size:12px;font-weight:600">${esc(nameOf(agent).charAt(0))}</div>`;
}

function renderResult(m) {
  const files = (m.files || []).filter(Boolean);
  if (m.answer) {
    const showFiles = files.slice(0, 12);
    const moreCount = files.length - 12;
    return files.length ? `<div class="result bad"><div class="result-title">Changed files while answering</div>
      <ul class="result-files">${showFiles.map((f) => `<li>${esc(f)}</li>`).join("")}${moreCount > 0 ? `<li>+${moreCount} more</li>` : ""}</ul>${previews(showFiles)}</div>` : "";
  }
  const ok = m.ok;
  const maxPills = 12;
  const shown = files.slice(0, maxPills);
  const extra = files.length - maxPills;
  const filePills = files.length ? `<div class="result-pills">${shown.map((f) =>
    `<span class="file-pill" title="${esc(f)}">${esc(f.split("/").pop())}</span>`
  ).join("")}${extra > 0 ? `<span class="file-pill more">+${extra} more</span>` : ""}</div>` : "";
  const check = !ok && m.check ? `<pre class="result-check">${esc(m.check)}</pre>` : "";
  const statusClass = ok ? "ok" : "bad";
  const statusText = ok
    ? `${files.length} file${files.length !== 1 ? "s" : ""} changed`
    : `Not finished: ${esc(m.reason || "see the log")}`;
  const strip = `<div class="status-strip">
    <span class="live-dot ${statusClass}"></span>
    <span>${statusText}</span>
    <span class="status-right ${statusClass}">${ok ? (m.checked === false ? "Done" : "Done, check passed") : "Failed"}</span>
  </div>`;
  return `${filePills}${previews(files)}${check}${strip}
    ${files.length ? `<div class="result-actions"><button type="button" class="btn" data-panel="diff">View changes</button></div>` : ""}`;
}

function renderMessage(m) {
  if (m.text) m = Object.assign({}, m, { text: stripHtmlTags(m.text) });
  if (m.role === "user") {
    const { pid, cid } = route();
    const files = (m.files || []).map((f) => {
      const fileName = f.split("/").pop();
      if (IMAGE.test(fileName)) {
        const src = `/api/attachment?project=${encodeURIComponent(pid)}&chat=${encodeURIComponent(cid)}&name=${encodeURIComponent(fileName)}`;
        return `<a class="attachment-image" href="${esc(src)}" target="_blank" rel="noopener" title="${esc(fileName)}"><img src="${esc(src)}" alt="${esc(fileName)}" loading="lazy"></a>`;
      }
      return `<span class="attachment" title="${esc(f)}">${esc(fileName)}</span>`;
    }).join("");
    return `<div class="msg user"><div class="bubble">${esc(m.text)}</div>${files ? `<div class="attachments">${files}</div>` : ""}</div>`;
  }
  if (m.role === "note") {
    const shots = (m.screenshots || []).map((s) => {
      const name = s.split("/").pop();
      return `<a class="preview-img" href="${esc(s)}" target="_blank" rel="noopener"><img src="${esc(s)}" alt="${esc(name)}" loading="lazy"></a>`;
    }).join("");
    return `<div class="note">${esc(m.text)}${shots ? `<div class="previews">${shots}</div>` : ""}</div>`;
  }
  if (m.role === "result") {
    const agent = m.agent || "";
    const key = String(agent).split("+")[0];
    return `<div class="msg agent">${avatar(agent)}<div class="msg-body">
      <div class="msg-name">${esc(nameOf(agent))}</div>
      <div class="body">${renderResult(m)}</div></div></div>`;
  }
  const agent = m.agent || "agent";
  if (m.step === "delegate") {
    const coder = m.coder || "";
    const coderClass = coder.split("+")[0];
    const arrowSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
    return `<div class="route-card">
      <span class="route-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></span>
      <span class="route-from">Auto</span>
      <span class="route-arrow">${arrowSvg}</span>
      ${badge(coderClass)}
      <span class="route-to ${esc(coderClass)}">${esc(nameOf(coder))}</span>
      ${m.review ? `<span class="route-reason">with review</span>` : ""}
      ${m.brief ? `<span class="route-reason">${esc(m.brief.split("\n")[0].slice(0, 80))}</span>` : ""}
    </div>`;
  }
  const labels = { orchestrate: "deciding", code: "coding", fix: "fixing the check", review: "reviewing", report: "update" };
  const doing = { orchestrate: "thinking", code: "working", fix: "fixing", review: "reviewing", report: "writing an update" }[m.step] || "working";
  const visibleText = hideCodexDiagnostics(m.text, agent);
  const body = visibleText ? renderAgentText(visibleText) : (m.live ? "" : `<div class="empty-agent">No response recorded.</div>`);
  const working = m.live ? `<div class="working"><span class="spinner"></span>${esc(nameOf(agent))} is ${doing}...</div>` : "";
  const label = labels[m.step] ? `<span class="step">${esc(labels[m.step])}</span>` : "";
  return `<div class="msg agent${m.step === "report" ? " report" : ""}">${avatar(agent)}<div class="msg-body">
    <div class="msg-name">${esc(nameOf(agent))} ${label}</div>
    <div class="body">${body}</div>${working}</div></div>`;
}

function renderMessages(force) {
  const box = $("#messages");
  const { pid, cid } = route();
  const key = JSON.stringify([pid, cid, chat, chatStatus(pid, cid)]);
  if (!force && key === lastChatKey) return;
  lastChatKey = key;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  if (!chat) box.innerHTML = renderWelcome();
  else {
    const parts = chat.messages.map(renderMessage);
    if (chatStatus(pid, cid) === "queued") parts.push(`<div class="working"><span class="spinner"></span>Queued behind other work in ${esc(project(pid)?.name || "")}.</div>`);
    box.innerHTML = `<div class="thread">${parts.join("")}</div>`;
  }
  ensureScrollFab();
  if ((nearBottom && !userScrolledUp) || force) box.scrollTop = box.scrollHeight;
  const fab = document.getElementById("scroll-fab");
  if (fab) fab.classList.toggle("visible", userScrolledUp);
  renderComposer();
}

// ---- attachments ----

function renderChips() {
  const box = $("#chips");
  box.hidden = attachments.length === 0;
  box.innerHTML = attachments.map((a) => `
    <div class="chip${a.error ? " chip-error" : ""}" title="${esc(a.error || a.name)}">
      ${a.url ? `<img src="${esc(a.url)}" alt="">` : `<span class="chip-icon">${esc((a.name.split(".").pop() || "file").slice(0, 4))}</span>`}
      <span class="chip-name">${esc(a.name)}</span>
      <span class="chip-meta">${a.uploading ? "uploading..." : a.error ? "failed" : esc(sizeLabel(a.size))}</span>
      <button type="button" class="chip-remove" data-remove="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">&times;</button>
    </div>`).join("");
  renderComposer();
}

function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function attach(file, pasted = false) {
  let name = file.name || "attachment";
  if (pasted && /^image\.(png|jpe?g)$/i.test(name)) {
    const t = new Date();
    name = `screenshot-${t.getHours()}${String(t.getMinutes()).padStart(2, "0")}${String(t.getSeconds()).padStart(2, "0")}.png`;
  }
  const item = { id: Math.random().toString(36).slice(2), name, size: file.size, path: "", uploading: true, error: "",
    url: IMAGE.test(name) || (file.type || "").startsWith("image/") ? URL.createObjectURL(file) : "" };
  attachments.push(item);
  if (file.size > MAX_FILE) {
    item.uploading = false;
    item.error = "Files can be up to 25 MB.";
    renderChips();
    return;
  }
  renderChips();
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "X-Agents": "1", "X-Filename": encodeURIComponent(name), "Content-Type": "application/octet-stream" },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    item.path = data.path;
    item.size = data.size;
  } catch (e) {
    item.error = e.message.includes("fetch") ? "Can't reach the app server." : e.message;
  } finally {
    item.uploading = false;
    renderChips();
  }
}

function removeAttachment(id) {
  const item = attachments.find((a) => a.id === id);
  attachments = attachments.filter((a) => a.id !== id);
  if (item) {
    if (item.url) URL.revokeObjectURL(item.url);
    if (item.path) api("/api/uploads/discard", { files: [item.path] }).catch(() => {});
  }
  renderChips();
}

function clearAttachments() {
  attachments.forEach((a) => a.url && URL.revokeObjectURL(a.url));
  attachments = [];
  renderChips();
}

// ---- composer ----

function renderComposer() {
  const { pid, cid } = route();
  const p = chat ? project(pid) : currentProject();
  const options = [["", "Hermes"], ["auto", "Auto"], ...state.coders.map((c) => [c, nameOf(c)])];
  if (!options.some(([v]) => v === pickedAgent)) pickedAgent = "";
  const AGENT_COLORS = { "": "#5b7fd6", auto: "#c96442", claude: "#d97757", chatgpt: "#10a37f" };
  $("#agent-pick").innerHTML = options.map(([value, label]) => {
    const dot = `<span class="seg-dot" style="background:${AGENT_COLORS[value] || "var(--faint)"}"></span>`;
    return `<button type="button" role="radio" aria-checked="${value === pickedAgent}" data-agent="${esc(value)}"
    title="${value === "auto" ? "Hermes picks the best coder for each prompt" : value ? `Send straight to ${esc(label)}` : "Hermes answers or hands it to a coder"}">${dot}${esc(label)}</button>`;
  }).join("");
  const projectPick = $("#project-pick");
  projectPick.hidden = Boolean(chat);
  if (!chat) {
    projectPick.innerHTML = state.projects.map((x) => `<option value="${esc(x.id)}"${p && x.id === p.id ? " selected" : ""}>${esc(x.name)}</option>`).join("");
  }
  const input = $("#input");
  const busy = chat && isBusy(pid, cid);
  input.disabled = Boolean(busy) || !p;
  input.placeholder = busy ? "Working. You can send another message when it finishes." : chat ? "Reply..." : "Ask anything or describe a change...";
  $("#attach-btn").disabled = input.disabled;
  $("#composer-note").textContent = !p ? "" : pickedAgent === "auto" ? "Hermes picks the best coder for this prompt" : pickedAgent ? `Goes straight to ${nameOf(pickedAgent)}` : `Hermes answers, or hands code to ${nameOf(defaultCoder(p))}`;
  const uploading = attachments.some((a) => a.uploading);
  $("#send-btn").disabled = input.disabled || uploading;
  if (uploading) $("#composer-note").textContent = "Uploading attachments...";
}

function autosize() {
  const input = $("#input");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 240) + "px";
}

async function send() {
  const input = $("#input");
  if (attachments.some((a) => a.uploading)) { toast("Still uploading. Send again in a moment."); return; }
  const failed = attachments.filter((a) => a.error);
  if (failed.length) { toast(`Remove the attachment that failed: ${failed[0].name}`); return; }
  const files = attachments.map((a) => a.path);
  let text = input.value.trim();
  if (!text && files.length) text = files.length === 1 ? "Take a look at the attached file." : "Take a look at the attached files.";
  if (!text || input.disabled) return;
  // Slash commands
  if (text.startsWith("/screenshot")) {
    const url = text.replace("/screenshot", "").trim() || $("#preview-url").value.trim();
    if (!url) { toast("Usage: /screenshot <url>"); input.value = ""; autosize(); return; }
    input.value = ""; autosize();
    toast("Taking screenshot...");
    try {
      const res = await api("/api/screenshot", { url });
      if (res.url) {
        const resp = await fetch(res.url);
        const blob = await resp.blob();
        addFiles([new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" })]);
        toast("Screenshot attached. Send a message to include it.");
      }
    } catch (err) { toast("Screenshot failed: " + err.message); }
    return;
  }
  if (text.startsWith("/preview")) {
    const url = text.replace("/preview", "").trim();
    if (url) $("#preview-url").value = url;
    input.value = ""; autosize();
    openPreview();
    return;
  }
  if (text.startsWith("/diff")) {
    const parts = text.replace("/diff", "").trim().split(/\s+/);
    if (parts.length < 2) { toast("Usage: /diff <before-url> <after-url>"); input.value = ""; autosize(); return; }
    input.value = ""; autosize();
    toast("Creating visual diff...");
    try {
      const res = await api("/api/visual-diff", { before: parts[0], after: parts[1] });
      if (res.diff_url) {
        loadPreview(res.diff_url);
        openPreview();
      }
    } catch (err) { toast("Diff failed: " + err.message); }
    return;
  }
  if (text.startsWith("/test-flow")) {
    toast("Test flows coming soon. Define them in project settings.");
    input.value = ""; autosize();
    return;
  }
  const { pid, cid } = route();
  $("#send-btn").disabled = true;
  try {
    if (chat) {
      await api("/api/chats/send", { project: pid, chat: cid, text, agent: pickedAgent, files });
    } else {
      const target = $("#project-pick").value || currentProject()?.id;
      const res = await api("/api/chats", { project: target, text, agent: pickedAgent, files });
      go(target, res.chat);
    }
    input.value = "";
    clearAttachments();
    autosize();
    requestNotifPermission();
    await refresh(true);
  } catch (e) {
    toast(e.message);
  } finally {
    renderComposer();
  }
}

// ---- panels ----

function renderDiff(data) {
  if (!data.git) return `<p class="muted">This project isn't a git repository, so there's no diff. Each result card lists the files the coder changed.</p>`;
  const status = data.status.trim() ? `<pre class="status-list">${esc(data.status.trimEnd())}</pre>` : `<p class="muted">No uncommitted changes.</p>`;
  if (!data.diff.trim()) return status;
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

function renderDoctor(data) {
  const agents = data.agents.map((a) => `<tr><td>${badge(a.agent)} ${esc(a.name)}</td><td>${esc(a.role)}</td>
    <td>${a.installed ? "installed" : '<span class="bad-text">not installed</span>'}</td>
    <td>${esc(a.login)}${a.limited ? `<div class="bad-text">${esc(a.limited)}</div>` : ""}</td></tr>`).join("");
  const projects = data.projects.map((p) => `<tr><td>${esc(p.name)}</td><td class="muted">${esc(p.path)}</td>
    <td>${p.exists ? (p.git ? "git" : "no git") : '<span class="bad-text">missing</span>'}</td><td>${esc(p.coders.map(nameOf).join(", "))}</td></tr>`).join("");
  return `<h3>Agents</h3><table class="table">${agents}</table><h3>Projects</h3><table class="table">${projects}</table>`;
}

function renderSettings(p) {
  const order = (c) => (p.coders.includes(c) ? p.coders.indexOf(c) : 99);
  const coders = state.coders.slice().sort((a, b) => order(a) - order(b));
  return `<form class="settings" data-project="${esc(p.id)}">
    <label>Name<input name="name" value="${esc(p.name)}"></label>
    <label>Folder<input value="${esc(p.path)}" disabled></label>
    <label>Default coder<select name="coder">${coders.map((c) => `<option value="${esc(c)}"${c === p.coders[0] ? " selected" : ""}>${esc(nameOf(c))}</option>`).join("")}</select></label>
    <p class="muted">If the default coder hits a usage limit, the other one takes over.</p>
    <label>Check command <span class="muted">(runs after every coding turn; leave empty for none)</span><input name="check" value="${esc(p.check || "")}"></label>
    <label>Deploy command <span class="muted">(runs after successful changes to go live; leave empty for none)</span><input name="deploy" value="${esc(p.deploy || "")}"></label>
    <label>Preview URL <span class="muted">(for live preview and auto-screenshots after changes)</span><input name="preview_url" value="${esc(p.preview_url || "")}" placeholder="http://localhost:3000"></label>
    <label>Preview pages <span class="muted">(comma-separated paths to screenshot, e.g. /,/login,/dashboard)</span><input name="preview_pages" value="${esc((p.preview_pages || []).join(", "))}" placeholder="/"></label>
    ${p.notes ? `<p class="muted">Project rules: ${esc(p.notes)}</p>` : ""}
    <button type="submit" class="btn primary">Save</button></form>`;
}

function shortModel(m) {
  const slash = m.lastIndexOf("/");
  const name = slash >= 0 ? m.slice(slash + 1) : m;
  return name.replace(/:free$/, "");
}

function renderModels(data) {
  const agents = Object.entries(data);
  if (!agents.length) return `<p class="muted">No agents have model options configured.</p>`;
  return agents.map(([agent, info]) => {
    const options = info.models.map((m) => {
      const label = shortModel(m);
      const active = info.selected === m;
      return `<button type="button" class="model-btn${active ? " active" : ""}" data-set-model="${esc(agent)}|${esc(m)}">${badge(agent)} ${esc(label)}</button>`;
    }).join("");
    const current = info.selected ? shortModel(info.selected) : "default";
    return `<div class="model-group">
      <div class="model-agent">${badge(agent)} ${esc(nameOf(agent))} <span class="muted">- ${esc(current)}</span></div>
      <div class="model-options">${options}</div>
      ${info.selected ? `<button type="button" class="btn small" data-set-model="${esc(agent)}|">Reset to default</button>` : ""}
    </div>`;
  }).join("");
}

async function setModel(agent, model) {
  try {
    const res = await api("/api/models/set", { agent, model: model || null });
    state.models = res.models;
    if ($("#panel").dataset.kind === "models") {
      $("#panel-body").innerHTML = renderModels(res.models);
    }
    toast(`${nameOf(agent)} model ${model ? "set to " + shortModel(model) : "reset to default"}`);
  } catch (e) {
    toast(e.message);
  }
}

async function openPanel(kind, pid) {
  const p = project(pid) || (chat ? project(route().pid) : currentProject());
  const titles = { diff: `Changes${p ? " in " + p.name : ""}`, memory: `Memory${p ? " for " + p.name : ""}`, doctor: "Agents and projects", settings: `${p ? p.name : ""} settings`, models: "Agent models" };
  $("#panel-title").textContent = titles[kind];
  $("#panel-body").innerHTML = `<p class="muted">Loading...</p>`;
  $("#panel").hidden = false;
  $("#panel").dataset.kind = kind;
  try {
    if (kind === "diff") $("#panel-body").innerHTML = p ? renderDiff(await api(`/api/diff?project=${encodeURIComponent(p.id)}`)) : "";
    else if (kind === "memory") $("#panel-body").innerHTML = p ? `<pre>${esc((await api(`/api/memory?project=${encodeURIComponent(p.id)}`)).text)}</pre>` : "";
    else if (kind === "doctor") $("#panel-body").innerHTML = renderDoctor(await api("/api/doctor"));
    else if (kind === "settings") $("#panel-body").innerHTML = p ? renderSettings(p) : "";
    else if (kind === "models") $("#panel-body").innerHTML = renderModels(state.models || {});
  } catch (e) {
    $("#panel-body").innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

// ---- data loop ----

async function refresh(force = false) {
  try {
    const next = await api("/api/state");
    const { pid, cid } = route();
    let nextChat = null;
    if (pid && cid) {
      try { nextChat = await api(`/api/chat?project=${encodeURIComponent(pid)}&chat=${encodeURIComponent(cid)}`); }
      catch { nextChat = null; }
    }
    const key = JSON.stringify(next);
    state = next;
    chat = nextChat;
    if (key !== lastStateKey || force) {
      lastStateKey = key;
      renderSidebar();
      renderHead();
    }
    renderMessages(force);
    checkNotifications();
  } catch (e) {
    toast(e.message);
  }
  clearTimeout(pollTimer);
  pollTimer = setTimeout(refresh, state.running.length ? 800 : 4000);
}

async function deleteChat(pid, cid) {
  const summary = chatSummary(pid, cid);
  const title = summary ? summary.title : "this chat";
  if (isBusy(pid, cid)) { toast("Stop the chat before deleting it."); return; }
  if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
  try {
    await api("/api/chats/delete", { project: pid, chat: cid });
    if (route().cid === cid) go(pid);
    toast("Chat deleted.");
    await refresh(true);
  } catch (err) { toast(err.message); }
}

// ---- events ----

// ---- copy & run button handlers ----
document.addEventListener("click", async (e) => {
  const copyBtn = e.target.closest(".copy-btn");
  if (copyBtn) {
    const pre = document.getElementById(copyBtn.dataset.copy);
    if (pre) {
      navigator.clipboard.writeText(pre.textContent).then(() => {
        copyBtn.textContent = "Copied";
        copyBtn.classList.add("copied");
        setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.classList.remove("copied"); }, 1500);
      });
    }
    return;
  }
  const runBtn = e.target.closest(".run-btn");
  if (runBtn) {
    const pre = document.getElementById(runBtn.dataset.run);
    if (!pre) return;
    const code = pre.textContent;
    const lang = runBtn.dataset.lang || "";
    const pid = currentProject()?.id;
    runBtn.textContent = "Running...";
    runBtn.disabled = true;
    try {
      const res = await api("/api/exec", { code, lang, project: pid });
      const block = pre.closest(".code-block");
      let output = block.querySelector(".run-output");
      if (!output) { output = document.createElement("pre"); output.className = "run-output"; block.appendChild(output); }
      const text = (res.stdout || "") + (res.stderr || "");
      output.textContent = text.trim() || (res.ok ? "(no output)" : `exit code ${res.code}`);
      output.classList.toggle("run-error", !res.ok);
      runBtn.textContent = res.ok ? "Done" : "Failed";
    } catch (err) {
      const block = pre.closest(".code-block");
      let output = block.querySelector(".run-output");
      if (!output) { output = document.createElement("pre"); output.className = "run-output"; block.appendChild(output); }
      output.textContent = err.message || "Failed to run";
      output.classList.add("run-error");
      runBtn.textContent = "Error";
    }
    setTimeout(() => { runBtn.textContent = "Run"; runBtn.disabled = false; }, 3000);
    return;
  }
});

// ---- scroll-to-bottom FAB ----
let userScrolledUp = false;
const msgBox = $("#messages");

function ensureScrollFab() {
  if (document.getElementById("scroll-fab")) return;
  const wrapper = msgBox.parentElement;
  wrapper.style.position = "relative";
  const fab = document.createElement("button");
  fab.id = "scroll-fab";
  fab.className = "scroll-fab";
  fab.type = "button";
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 16l-6-6h12z" fill="currentColor"/></svg>';
  fab.addEventListener("click", () => { msgBox.scrollTop = msgBox.scrollHeight; userScrolledUp = false; fab.classList.remove("visible"); });
  wrapper.appendChild(fab);
}

msgBox.addEventListener("scroll", () => {
  const gap = msgBox.scrollHeight - msgBox.scrollTop - msgBox.clientHeight;
  userScrolledUp = gap > 200;
  const fab = document.getElementById("scroll-fab");
  if (fab) fab.classList.toggle("visible", userScrolledUp);
});

// ---- browser notifications ----
let lastBusy = {};
function checkNotifications() {
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    for (const p of state.projects) {
      for (const c of p.chats) {
        const key = `${p.id}/${c.id}`;
        if (lastBusy[key] && c.status === "idle") {
          new Notification(`${c.title}`, { body: `${nameOf(c.last_agent || "Agent")} finished in ${p.name}`, tag: key });
        }
        lastBusy[key] = ["running", "queued"].includes(c.status);
      }
    }
  } else {
    for (const p of state.projects) {
      for (const c of p.chats) {
        lastBusy[`${p.id}/${c.id}`] = ["running", "queued"].includes(c.status);
      }
    }
  }
}

// request notification permission on first send
function requestNotifPermission() {
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("button, .tip");
  if (!el || (el.type === "submit" && el.closest("form"))) return;
  if (el.id === "new-chat") { go(currentProject()?.id || ""); $("#input").focus(); return; }
  if (el.id === "menu-btn") { $(".app").classList.add("nav-open"); return; }
  if (el.id === "head-more") { const m = $("#head-menu"); if (m) m.hidden = !m.hidden; return; }
  if (el.id === "panel-close") { $("#panel").hidden = true; return; }
  if (el.id === "term-toggle") { $("#term-drawer").hidden ? openTerminal() : closeTerminal(); return; }
  if (el.id === "term-close") { closeTerminal(); return; }
  if (el.id === "install" && installPrompt) { installPrompt.prompt(); installPrompt = null; el.hidden = true; return; }
  if (el.id === "add-project") {
    const path = prompt("Full path of the project folder (for example /Users/you/stockbot):");
    if (!path) return;
    try {
      const res = await api("/api/projects", { path: path.trim() });
      await refresh(true);
      go(res.project);
      openPanel("settings", res.project);
    } catch (err) { toast(err.message); }
    return;
  }
  if (el.dataset.open) { const [p, c] = el.dataset.open.split("|"); searchResults = null; $("#search").value = ""; go(p, c); return; }
  if (el.dataset.toggle) {
    collapsed[el.dataset.toggle] = !collapsed[el.dataset.toggle];
    try { localStorage.setItem("collapsed", JSON.stringify(collapsed)); } catch { /* private mode */ }
    renderSidebar();
    return;
  }
  if (el.dataset.new) { go(el.dataset.new); $("#input").focus(); return; }
  if (el.id === "attach-btn") { $("#file-input").click(); return; }
  if (el.dataset.remove) { removeAttachment(el.dataset.remove); return; }
  if (el.dataset.delete) { const [p, c] = el.dataset.delete.split("|"); deleteChat(p, c); return; }
  if (el.dataset.setModel) { const [a, m] = el.dataset.setModel.split("|"); setModel(a, m); return; }
  if (el.dataset.settings) { openPanel("settings", el.dataset.settings); return; }
  if (el.dataset.panel) { openPanel(el.dataset.panel); return; }
  if (el.dataset.agent !== undefined && el.closest("#agent-pick")) { pickedAgent = el.dataset.agent; renderComposer(); $("#input").focus(); return; }
  if (el.dataset.tip) { $("#input").value = el.dataset.tip; autosize(); $("#input").focus(); return; }
  const action = el.dataset.action;
  const { pid, cid } = route();
  if (!action || !chat) return;
  const hm = $("#head-menu"); if (hm) hm.hidden = true;
  try {
    if (action === "stop") {
      const res = await api("/api/chats/stop", { project: pid, chat: cid });
      toast(res.result === "cancelled" ? "Removed from the queue." : "Stopping...");
    } else if (action === "pin") {
      await api("/api/chats/update", { project: pid, chat: cid, pinned: !chat.pinned });
    } else if (action === "archive") {
      await api("/api/chats/update", { project: pid, chat: cid, archived: !chat.archived });
      if (!chat.archived) go(pid);
    } else if (action === "delete") {
      return deleteChat(pid, cid);
    } else if (action === "rename") {
      const title = prompt("Chat name:", chat.title);
      if (title && title.trim()) await api("/api/chats/update", { project: pid, chat: cid, title: title.trim() });
    } else if (action === "screenshot") {
      const url = prompt("URL to screenshot:", "http://localhost:3000");
      if (url) {
        toast("Taking screenshot...");
        try {
          const res = await api("/api/screenshot", { url: url.trim() });
          if (res.url) toast("Screenshot saved");
        } catch (err) { toast("Screenshot failed: " + err.message); }
      }
      return;
    }
    await refresh(true);
  } catch (err) { toast(err.message); }
});

document.addEventListener("submit", async (e) => {
  if (e.target.id === "composer") { e.preventDefault(); send(); return; }
  if (!e.target.matches("form.settings")) return;
  e.preventDefault();
  const form = e.target;
  const pid = form.dataset.project;
  const p = project(pid);
  const first = form.coder.value;
  const coders = [first, ...state.coders.filter((c) => c !== first)];
  try {
    const previewPages = (form.preview_pages?.value || "").split(",").map((s) => s.trim()).filter(Boolean);
    await api("/api/projects/update", {
      project: pid, name: form.elements.name.value.trim() || p.name, coders, check: form.check.value,
      deploy: form.deploy?.value || "",
      preview_url: form.preview_url?.value?.trim() || "",
      preview_pages: previewPages.length ? previewPages : undefined,
    });
    toast("Saved.");
    await refresh(true);
  } catch (err) { toast(err.message); }
});

let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(async () => {
    if (!q) { searchResults = null; renderSidebar(); return; }
    try { searchResults = (await api(`/api/search?q=${encodeURIComponent(q)}`)).results; renderSidebar(); }
    catch (err) { toast(err.message); }
  }, 200);
});
$("#project-pick").addEventListener("change", (e) => go(e.target.value));
$("#scrim").addEventListener("click", () => $(".app").classList.remove("nav-open"));
$("#input").addEventListener("input", autosize);
$("#file-input").addEventListener("change", (e) => {
  [...e.target.files].forEach((f) => attach(f));
  e.target.value = "";
  $("#input").focus();
});
$("#input").addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length) return;
  e.preventDefault();  // a pasted screenshot becomes an attachment, not text
  files.forEach((f) => attach(f, true));
});
let dragDepth = 0;
const mainEl = document.querySelector(".main");
mainEl.addEventListener("dragenter", (e) => {
  if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
  e.preventDefault();
  dragDepth += 1;
  $("#composer-box").classList.add("dragging");
});
mainEl.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
mainEl.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $("#composer-box").classList.remove("dragging");
});
mainEl.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  dragDepth = 0;
  $("#composer-box").classList.remove("dragging");
  if ($("#input").disabled) { toast("Wait for this chat to finish, then attach."); return; }
  [...e.dataTransfer.files].forEach((f) => attach(f));
  $("#input").focus();
});
$("#input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("#panel").hidden = true; $(".app").classList.remove("nav-open"); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#search").focus(); }
  if (e.ctrlKey && e.key === "`") { e.preventDefault(); $("#term-drawer").hidden ? openTerminal() : closeTerminal(); }
});
window.addEventListener("hashchange", () => {
  chat = null;
  lastChatKey = "";
  refresh(true);
  if (!$("#term-drawer").hidden) openTerminal();  // follow the project switch
});

// ---- interactive terminal (xterm.js over a WebSocket to the project's shell) ----
let term = null;
let fit = null;
let ws = null;
let termPid = null;

function termTheme() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  return dark
    ? { background: "#1a1918", foreground: "#ecebe8", cursor: "#d97757", selectionBackground: "#3a3836" }
    : { background: "#ffffff", foreground: "#1f1e1c", cursor: "#c96442", selectionBackground: "#e4e1dc" };
}

function openTerminal() {
  const p = currentProject();
  if (!p) { toast("Add a project folder first."); return; }
  if (typeof Terminal === "undefined") { toast("Terminal failed to load."); return; }
  $("#term-drawer").hidden = false;
  if (!term) {
    term = new Terminal({ fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      cursorBlink: true, scrollback: 8000, theme: termTheme() });
    fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open($("#term-body"));
    term.onData((d) => { if (ws && ws.readyState === 1) ws.send(new TextEncoder().encode(d)); });
    new ResizeObserver(() => fitTerm()).observe($("#term-body"));
  }
  $("#term-title").textContent = `Terminal - ${p.name}`;
  connectTerm(p.id);
  requestAnimationFrame(() => { fitTerm(); term.focus(); });
}

function closeTerminal() {
  $("#term-drawer").hidden = true;
  if (ws) { ws.close(); ws = null; }
}

function fitTerm() {
  if (!term || $("#term-drawer").hidden) return;
  try { fit.fit(); } catch { /* not mounted yet */ }
  sendResize();
}

function sendResize() {
  if (ws && ws.readyState === 1 && term) ws.send(JSON.stringify({ resize: [term.cols, term.rows] }));
}

function connectTerm(pid) {
  if (ws && termPid === pid && ws.readyState <= 1) return;
  if (ws) ws.close();
  termPid = pid;
  if (term) term.reset();
  $("#term-status").textContent = "connecting...";
  ws = new WebSocket(`ws://${location.host}/ws/terminal?project=${encodeURIComponent(pid)}`);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => { $("#term-status").textContent = ""; sendResize(); };
  ws.onmessage = (e) => { if (term) term.write(new Uint8Array(e.data)); };
  ws.onclose = () => { $("#term-status").textContent = $("#term-drawer").hidden ? "" : "disconnected - reopen to reconnect"; };
  ws.onerror = () => { $("#term-status").textContent = "connection failed"; };
}
// ---- live preview ----

function openPreview() {
  const drawer = $("#preview-drawer");
  drawer.hidden = false;
  const p = chat ? project(route().pid) : currentProject();
  const url = $("#preview-url").value.trim();
  if (!url && p) {
    $("#preview-url").value = p.preview_url || "http://localhost:3000";
  }
  if ($("#preview-url").value) loadPreview($("#preview-url").value);
}

function closePreview() {
  $("#preview-drawer").hidden = true;
  $("#preview-frame").src = "about:blank";
}

function loadPreview(url) {
  if (!url) return;
  if (!url.startsWith("http")) url = "http://" + url;
  $("#preview-url").value = url;
  $("#preview-frame").src = url;
}

function resizePreview() {
  const [w, h] = ($("#preview-size").value || "100%|100%").split("|");
  const frame = $("#preview-frame");
  frame.style.width = w;
  frame.style.maxWidth = "100%";
  frame.style.height = h === "100%" ? "100%" : h;
}

async function takeScreenshot() {
  const url = $("#preview-url").value.trim();
  if (!url) { toast("Enter a URL first"); return; }
  toast("Taking screenshot...");
  try {
    const res = await api("/api/screenshot", { url });
    if (res.url) {
      // Add as an attachment to the current chat
      const name = `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.png`;
      const resp = await fetch(res.url);
      const blob = await resp.blob();
      const file = new File([blob], name, { type: "image/png" });
      addFiles([file]);
      toast("Screenshot attached. Send a message to include it.");
    }
  } catch (e) {
    toast("Screenshot failed: " + e.message);
  }
}

// Preview event handlers
document.addEventListener("click", (e) => {
  const el = e.target.closest("button, select");
  if (!el) return;
  if (el.id === "preview-toggle") { $("#preview-drawer").hidden ? openPreview() : closePreview(); return; }
  if (el.id === "preview-close") { closePreview(); return; }
  if (el.id === "preview-go") { loadPreview($("#preview-url").value.trim()); return; }
  if (el.id === "preview-refresh") { const f = $("#preview-frame"); f.src = f.src; return; }
  if (el.id === "preview-screenshot") { takeScreenshot(); return; }
  if (el.id === "preview-back") { try { $("#preview-frame").contentWindow.history.back(); } catch { /* cross-origin */ } return; }
});
$("#preview-url").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); loadPreview(e.target.value.trim()); } });
$("#preview-size").addEventListener("change", resizePreview);

document.addEventListener("mousedown", (e) => { const m = $("#head-menu"); if (m && !m.hidden && !e.target.closest("#head-more, #head-menu")) m.hidden = true; });
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; $("#install").hidden = false; });
window.addEventListener("appinstalled", () => { $("#install").hidden = true; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

refresh(true);
