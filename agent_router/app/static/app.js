"use strict";

const $ = (sel) => document.querySelector(sel);
const NAMES = { claude: "Claude", hermes: "Hermes", chatgpt: "ChatGPT" };
const BADGES = {
  claude: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M15.3 3.7c-.5-.3-1.1-.1-1.4.3l-5.8 9.2-2.4-2.4c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l3.3 3.3c.2.2.5.3.7.3.1 0 .2 0 .3 0 .3-.1.6-.3.7-.6l6.3-10c.3-.5.1-1.1-.3-1.4z" fill="currentColor"/></svg>`,
  hermes: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 3L4 9v6l8 6 8-6V9l-8-6zm0 2.2L18 10v4l-6 4.5L6 14v-4l6-4.8z" fill="currentColor"/></svg>`,
  chatgpt: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a2.5 2.5 0 0 1 2.5 2.5c0 .8-.4 1.6-1 2L12 11l-1.5-1.5c-.6-.5-1-1.2-1-2A2.5 2.5 0 0 1 12 5zm-4 7.5c0-.8.4-1.5 1-2l1.5-1L12 11l1.5-1.5 1.5 1c.6.5 1 1.2 1 2A2.5 2.5 0 0 1 12 15a2.5 2.5 0 0 1-4-2.5z" fill="currentColor"/></svg>`,
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

function highlightCode(text, lang) {
  let html = esc(text);
  if (lang === "html") {
    html = html.replace(KEYWORDS.html, '$1<span class="hl-tag">$2</span>');
  } else if (KEYWORDS[lang]) {
    html = html.replace(KEYWORDS[lang], '<span class="hl-kw">$&</span>');
  }
  html = html.replace(/(["'`])(?:(?!\1).)*?\1/g, '<span class="hl-str">$&</span>');
  html = html.replace(/(\/\/.*|#(?!!).*)/gm, '<span class="hl-cmt">$&</span>');
  return html;
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
        const lang = detectLang(code.join("\n"), codeLang);
        const highlighted = highlightCode(code.join("\n"), lang);
        out.push(`<div class="code-block"><div class="code-head"><span class="code-lang">${esc(codeLang || lang)}</span><button type="button" class="copy-btn" data-copy="${id}">Copy</button></div><pre id="${id}"><code>${highlighted}</code></pre></div>`);
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
    if (!line.trim()) { flush(); flushTools(); continue; }
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
  const active = pid || state.projects[0]?.id;
  nav.innerHTML = state.projects.map((p) => {
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
  const actions = [];
  if (isBusy(pid, cid)) actions.push(`<button type="button" class="btn danger" data-action="stop">${status === "queued" ? "Cancel" : "Stop"}</button>`);
  actions.push(`<button type="button" class="btn" data-action="pin">${chat.pinned ? "Unpin" : "Pin"}</button>`);
  actions.push(`<button type="button" class="btn" data-action="rename">Rename</button>`);
  actions.push(`<button type="button" class="btn" data-action="archive">${chat.archived ? "Unarchive" : "Archive"}</button>`);
  actions.push(`<button type="button" class="btn" data-panel="diff">Changes</button>`);
  actions.push(`<button type="button" class="btn danger" data-action="delete">Delete</button>`);
  $("#head").innerHTML = `${menu}<div class="head-title"><h1 title="${esc(chat.title)}">${esc(chat.title)}</h1>
    <div class="head-meta"><span>${esc(p.name)}</span><span class="muted">${esc(p.path)}</span>
    ${status !== "idle" ? `<span class="pill running">${esc(status)}</span>` : ""}</div></div>
    <div class="head-actions">${actions.join("")}</div>`;
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
      <a href="${esc(url)}" target="_blank" rel="noopener">Open full</a></div>
      <iframe src="${esc(url)}" sandbox="allow-scripts allow-popups allow-forms" loading="lazy" title="${esc(f)}"></iframe></div>`;
  }
  return "";
}

function previews(files) {
  const { pid } = route();
  const made = files.map((f) => previewFor(pid, f)).filter(Boolean).slice(0, 6);
  return made.length ? `<div class="previews">${made.join("")}</div>` : "";
}

function renderResult(m) {
  const files = (m.files || []).filter(Boolean);
  if (m.answer) {
    return files.length ? `<div class="result bad"><div class="result-title">Changed files while answering</div>
      <ul class="result-files">${files.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>${previews(files)}</div>` : "";
  }
  const title = m.ok
    ? `Done${m.checked === false ? "" : ", check passed"}${m.agent ? ` - ${esc(nameOf(m.agent))}` : ""}`
    : `Not finished: ${esc(m.reason || "see the log")}`;
  const fileList = files.length ? `<ul class="result-files">${files.map((f) => {
    const ext = f.split(".").pop();
    return `<li><span class="file-badge mod">M</span><span title="${esc(f)}">${esc(f)}</span></li>`;
  }).join("")}</ul>` : `<div class="result-hint">No file changes.</div>`;
  const check = !m.ok && m.check ? `<pre class="result-check">${esc(m.check)}</pre>` : "";
  return `<div class="result ${m.ok ? "ok" : "bad"}"><div class="result-title">${title}</div>${fileList}${previews(files)}${check}
    ${files.length ? `<div class="result-actions"><button type="button" class="btn" data-panel="diff">View changes</button></div>` : ""}</div>`;
}

function renderMessage(m) {
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
  if (m.role === "note") return `<div class="note">${esc(m.text)}</div>`;
  if (m.role === "result") return renderResult(m);
  const agent = m.agent || "agent";
  if (m.step === "delegate") {
    return `<div class="handoff">${badge("hermes")}<span><strong>Hermes</strong> handed this to <strong>${esc(nameOf(m.coder || ""))}</strong>${m.review ? " (with review)" : ""}</span>
      ${m.brief ? `<details><summary>Brief</summary><div class="brief">${renderAgentText(m.brief)}</div></details>` : ""}</div>`;
  }
  const labels = { orchestrate: "deciding", code: "coding", fix: "fixing the check", review: "reviewing", report: "update" };
  const doing = { orchestrate: "thinking", code: "working", fix: "fixing", review: "reviewing", report: "writing an update" }[m.step] || "working";
  const body = m.text.trim() ? renderAgentText(m.text) : (m.live ? "" : `<div class="empty-agent">No output.</div>`);
  const working = m.live ? `<div class="working"><span class="spinner"></span>${esc(nameOf(agent))} is ${doing}...</div>` : "";
  const label = labels[m.step] ? `<span class="step">${esc(labels[m.step])}</span>` : "";
  return `<div class="msg agent${m.step === "report" ? " report" : ""}"><div class="who">${badge(agent)}${esc(nameOf(agent))}${label}</div><div class="body">${body}</div>${working}</div>`;
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
  const options = [["", "Hermes"], ...state.coders.map((c) => [c, nameOf(c)])];
  if (!options.some(([v]) => v === pickedAgent)) pickedAgent = "";
  $("#agent-pick").innerHTML = options.map(([value, label]) => `<button type="button" role="radio" aria-checked="${value === pickedAgent}" data-agent="${esc(value)}"
    title="${value ? `Send straight to ${esc(label)}` : "Hermes answers or hands it to a coder"}">${esc(label)}</button>`).join("");
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
  $("#composer-note").textContent = !p ? "" : pickedAgent ? `Goes straight to ${nameOf(pickedAgent)}` : `Hermes answers, or hands code to ${nameOf(defaultCoder(p))}`;
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
    ${p.notes ? `<p class="muted">Project rules: ${esc(p.notes)}</p>` : ""}
    <button type="submit" class="btn primary">Save</button></form>`;
}

async function openPanel(kind, pid) {
  const p = project(pid) || (chat ? project(route().pid) : currentProject());
  const titles = { diff: `Changes${p ? " in " + p.name : ""}`, memory: `Memory${p ? " for " + p.name : ""}`, doctor: "Agents and projects", settings: `${p ? p.name : ""} settings` };
  $("#panel-title").textContent = titles[kind];
  $("#panel-body").innerHTML = `<p class="muted">Loading...</p>`;
  $("#panel").hidden = false;
  $("#panel").dataset.kind = kind;
  try {
    if (kind === "diff") $("#panel-body").innerHTML = p ? renderDiff(await api(`/api/diff?project=${encodeURIComponent(p.id)}`)) : "";
    else if (kind === "memory") $("#panel-body").innerHTML = p ? `<pre>${esc((await api(`/api/memory?project=${encodeURIComponent(p.id)}`)).text)}</pre>` : "";
    else if (kind === "doctor") $("#panel-body").innerHTML = renderDoctor(await api("/api/doctor"));
    else if (kind === "settings") $("#panel-body").innerHTML = p ? renderSettings(p) : "";
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

// ---- copy button handler ----
document.addEventListener("click", (e) => {
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
  if (el.dataset.settings) { openPanel("settings", el.dataset.settings); return; }
  if (el.dataset.panel) { openPanel(el.dataset.panel); return; }
  if (el.dataset.agent !== undefined && el.closest("#agent-pick")) { pickedAgent = el.dataset.agent; renderComposer(); $("#input").focus(); return; }
  if (el.dataset.tip) { $("#input").value = el.dataset.tip; autosize(); $("#input").focus(); return; }
  const action = el.dataset.action;
  const { pid, cid } = route();
  if (!action || !chat) return;
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
    await api("/api/projects/update", { project: pid, name: form.elements.name.value.trim() || p.name, coders, check: form.check.value });
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
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; $("#install").hidden = false; });
window.addEventListener("appinstalled", () => { $("#install").hidden = true; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

refresh(true);
