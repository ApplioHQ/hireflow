(function () {
  'use strict';
  const apiBase = String(window.ATOM_CLASSROOM_API || '').replace(/\/$/, '');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  document.querySelectorAll('.teacher-brand').forEach(brand => {
    const label = brand.textContent.replace(/atomEDU/i, '').trim() || 'for Teachers';
    brand.innerHTML = `<span class="brand-core">atom<b>EDU</b></span><span class="brand-context">${escapeHtml(label)}</span>`;
  });
  document.querySelectorAll('.student-header > span').forEach(brand => {
    const label = brand.textContent.replace(/atomEDU|Atom/i, '').trim() || 'for Students';
    brand.innerHTML = `<span class="brand-core">atom<b>EDU</b></span><span class="brand-context">${escapeHtml(label)}</span>`;
  });
  document.querySelectorAll('.teacher-back').forEach(link => {
    if (link.querySelector('svg')) return;
    const label = link.textContent.replace(/[←]/g, '').trim() || 'Back to site';
    link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.5 5.5-6 6 6 6M8 11.5h11"/></svg><span>${escapeHtml(label)}</span>`;
  });
  async function request(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(`${apiBase}${path}`, { ...options, headers, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The classroom service could not complete that request.');
    return data;
  }
  function tokenKey(code, role = 'teacher') { return `atomClassroom:${role}:${String(code).toUpperCase()}`; }
  function saveToken(code, token, role = 'teacher') { sessionStorage.setItem(tokenKey(code, role), token); }
  function getToken(code, role = 'teacher') { return sessionStorage.getItem(tokenKey(code, role)) || ''; }
  function roomCode() { return (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function socket(code, token, onState, onStatus) {
    const protocol = apiBase.startsWith('https:') ? 'wss:' : 'ws:';
    const url = `${protocol}//${new URL(apiBase).host}/api/session/${encodeURIComponent(code)}/ws?token=${encodeURIComponent(token)}`;
    let ws; let stopped = false; let retry = 700;
    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(url);
      ws.addEventListener('open', () => { retry = 700; onStatus?.('connected'); });
      ws.addEventListener('message', event => { if (event.data === 'pong') return; try { const message = JSON.parse(event.data); if (message.type === 'state') onState(message.data); } catch (_) {} });
      ws.addEventListener('close', () => { onStatus?.('reconnecting'); if (!stopped) setTimeout(connect, retry = Math.min(retry * 1.7, 8000)); });
      ws.addEventListener('error', () => ws.close());
    };
    connect();
    const ping = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send('ping'); }, 25000);
    return () => { stopped = true; clearInterval(ping); ws?.close(); };
  }
  function formatTime(ms) { const total = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
  function answerControl(question, selected = []) {
    const chosen = new Set(Array.isArray(selected) ? selected : [selected]);
    if (question.type === 'free-response' || question.type === 'fill-blank') return `<textarea class="student-response" id="student-answer" rows="4" placeholder="Type your answer"></textarea>`;
    const options = question.options.filter(option => String(option).trim());
    return `<div class="answer-grid option-count-${options.length}">${options.map((option, index) => `<label class="answer-choice answer-color-${index % 6}"><input type="${question.type === 'multi-select' ? 'checkbox' : 'radio'}" name="answer" value="${escapeHtml(option)}" ${chosen.has(option) ? 'checked' : ''}><span class="choice-shape">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></label>`).join('')}</div>`;
  }
  window.atomClassroom = { $, $$, escapeHtml, request, saveToken, getToken, roomCode, socket, formatTime, answerControl, apiBase };
})();
