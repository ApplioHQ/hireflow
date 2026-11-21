(function () {
  'use strict';
  const A = window.atomClassroom; const page = document.body.dataset.studentPage;
  if (page === 'join') return initJoin();
  const code = A.roomCode(); const token = A.getToken(code, 'student'); const root = document.getElementById('student-root');
  let state = null; let shownQuestion = 0; let questionShownAt = Date.now(); let activeQuestionId = ''; let timer; let lockdown = false; let modifierTimer; let modifierInterval; let modifierKey = ''; const drafts = new Map();
  if (!code || !token) { location.replace(`/students/join${code ? `?room=${code}` : ''}`); return; }
  A.socket(code, token, next => { captureDraft(); state = next; render(); }, () => {});
  A.request(`/api/session/${code}/state`, { headers:{ Authorization:`Bearer ${token}` } }).then(next => { state = next; render(); }).catch(error => root.innerHTML = `<div class="error-box">${A.escapeHtml(error.message)}</div>`);

  function initJoin() {
    const form = document.getElementById('join-form'); const codeInput = document.getElementById('join-code'); const passwordField = document.getElementById('password-field'); const errorBox = document.getElementById('join-error');
    form.querySelector('button[type="submit"]').textContent = 'Continue';
    codeInput.value = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    const update = () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); passwordField.hidden = codeInput.value.length <= 6; document.getElementById('join-password').required = !passwordField.hidden; }; update(); codeInput.addEventListener('input', update);
    form.addEventListener('submit', async event => { event.preventDefault(); errorBox.hidden = true; const code = codeInput.value; const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Joining…'; try { const result = await A.request(`/api/session/${encodeURIComponent(code)}/join`, { method:'POST', body:{ name:document.getElementById('join-name').value, password:document.getElementById('join-password').value } }); A.saveToken(code, result.studentToken, 'student'); location.href = `${result.mode === 'quiz' ? '/students/quiz' : '/students/room'}?room=${encodeURIComponent(code)}`; } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; button.disabled = false; button.textContent = 'Continue'; } });
  }
  function auth() { return { Authorization:`Bearer ${token}` }; }
  function updateHeader() { document.getElementById('student-name').textContent = state.student.name; if (page === 'orbit') document.getElementById('student-score').textContent = `${state.student.score} pts`; }
  function answerValue(question) { if (question.type === 'free-response' || question.type === 'fill-blank') return document.getElementById('student-answer')?.value || ''; return Array.from(document.querySelectorAll('[name="answer"]:checked')).map(input => input.value); }
  function captureDraft() { const question = page === 'quiz' ? state?.questions?.[shownQuestion] : state?.question; if (!question || !document.getElementById('student-answer') && !document.querySelector('[name="answer"]')) return; drafts.set(question.id, answerValue(question)); }
  async function submit(question) { const value = answerValue(question); if (!String(Array.isArray(value) ? value.join('') : value).trim()) throw new Error('Choose or enter an answer first.'); drafts.set(question.id, value); return A.request(`/api/session/${code}/answer`, { method:'POST', headers:auth(), body:{ questionId:question.id, answer:value, elapsedMs:Date.now() - questionShownAt } }); }
  function questionCard(question, index, quiz = false) { const selected = drafts.get(question.id) || state.responses?.find(item => item.questionId === question.id)?.answer || []; return `<p class="eyebrow">${quiz ? `Question ${index + 1} of ${state.questions.length}` : question.title}</p>${question.context ? `<div class="context">${A.escapeHtml(question.context)}</div>` : ''}<h1>${A.escapeHtml(question.prompt)}</h1>${question.image ? `<img class="stage-image" src="${question.image}" alt="Question image">` : ''}${A.answerControl(question, selected)}<div class="error-box" id="answer-error" hidden></div>`; }
  function waiting(title, text) { root.innerHTML = `<p class="eyebrow">Room ${A.escapeHtml(code)}</p><h1>${title}</h1><p>${text}</p>`; }

  function renderOrbit() {
    updateHeader(); clearInterval(timer);
    if (state.phase === 'lobby') return waiting('You’re in!', 'Your teacher can see you in the lobby. The first question will appear when the room starts.');
    if (state.phase === 'question') {
      if (state.answered) return waiting('Answer locked in.', 'Watch the teacher screen for the reveal.');
      if (activeQuestionId !== state.question.id) { activeQuestionId = state.question.id; questionShownAt = Date.now(); } root.innerHTML = `<div class="timer-ring" id="timer-ring"><span id="time-left">--:--</span></div>${questionCard(state.question, state.questionIndex)}<button class="button button-primary button-block" id="submit-answer" style="margin-top:18px">Lock in answer</button>`;
      document.getElementById('submit-answer').addEventListener('click', async () => { const button = document.getElementById('submit-answer'); try { button.disabled = true; state = await submit(state.question); render(); } catch (error) { document.getElementById('answer-error').textContent = error.message; document.getElementById('answer-error').hidden = false; button.disabled = false; } }); tickOrbit(); timer = setInterval(tickOrbit, 250); return;
    }
    if (state.phase === 'result') { const result = state.lastResult; if (result?.manual && !result.graded) { root.innerHTML = `<div class="result-icon correct">✓</div><h1>Response submitted.</h1><p>Your teacher will assign up to <strong>${state.question?.points || 0} points</strong> in the report.</p>`; return; } root.innerHTML = `<div class="result-icon ${result?.correct ? 'correct' : 'wrong'}">${result?.correct ? '✓' : '×'}</div><h1>${result?.correct ? 'That’s right.' : 'Not this time.'}</h1><p>You gained <strong>${result?.points || 0} points</strong>${state.student.streak > 1 ? ` · ${state.student.streak} answer streak` : ''}.</p><p>Look to the teacher screen for the correct answer.</p>`; return; }
    if (state.phase === 'leaderboard') return waiting(`You’re #${state.position || '—'}.`, 'The top five are on the teacher screen. Your score is in the header.');
    root.innerHTML = `<p class="eyebrow">Orbit complete</p><h1>You finished #${state.position || '—'}.</h1><p>Nice work, ${A.escapeHtml(state.student.name)}. Your final score is <strong>${state.student.score} points</strong>.</p>`;
  }
  function tickOrbit() { const left = Math.max(0, state.questionEndsAt - Date.now()); const total = state.question.seconds * 1000; const ring = document.getElementById('timer-ring'); if (ring) ring.style.setProperty('--progress', String(left / total)); const label = document.getElementById('time-left'); if (label) label.textContent = A.formatTime(left); }

  function renderQuiz() {
    updateHeader(); clearInterval(timer);
    if (state.student.removed) return removedScreen();
    if (state.phase === 'lobby') return waiting('You’re in!', 'Wait here. Your teacher will start the quiz for everyone.');
    if (state.student.finished) return completedScreen();
    if (state.phase === 'finished') return completedScreen('The quiz time has ended.');
    if (!lockdown || !document.fullscreenElement) { root.innerHTML = `<p class="eyebrow">Atom Lockdown Browser</p><h1>Ready for a focused quiz?</h1><p>This assessment requires fullscreen. Leaving fullscreen removes you immediately. Holding Control, Command/Search, or Alt for five seconds also removes you. Copy, paste, and the context menu are disabled in the quiz.</p><div class="lockdown-consent">Your browser cannot close other tabs or block operating-system shortcuts. Close unrelated tabs yourself before beginning. By continuing, you consent to the in-page integrity monitoring described above.</div><button class="button button-primary button-block" id="enter-lockdown" style="margin-top:18px">Enter fullscreen and begin</button>`; document.getElementById('enter-lockdown').addEventListener('click', enterLockdown); return; }
    shownQuestion = Math.min(shownQuestion, state.questions.length - 1); const question = state.questions[shownQuestion]; if (activeQuestionId !== question.id) { activeQuestionId = question.id; questionShownAt = Date.now(); }
    root.innerHTML = `${questionCard(question, shownQuestion, true)}<div class="maker-actions" style="margin-top:20px"><button class="button button-secondary" id="previous" ${shownQuestion === 0 ? 'disabled' : ''}>Previous</button><button class="button button-primary" id="next-question">${shownQuestion + 1 === state.questions.length ? 'Finish quiz' : 'Save and next'}</button></div><div class="progress-boxes" style="justify-content:center;margin-top:18px">${state.questions.map((q,index) => `<button class="progress-box ${state.responses?.some(r => r.questionId === q.id) ? 'done' : ''}" data-go="${index}">${index + 1}</button>`).join('')}</div>`;
    document.getElementById('previous').addEventListener('click', () => navigate(shownQuestion - 1, false)); document.getElementById('next-question').addEventListener('click', () => navigate(shownQuestion + 1, true)); document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(Number(button.dataset.go), false))); tickQuiz(); timer = setInterval(tickQuiz, 250);
  }
  async function enterLockdown() { try { await document.documentElement.requestFullscreen({ navigationUI:'hide' }); lockdown = true; installLockdown(); renderQuiz(); } catch (_) { const box = document.createElement('div'); box.className = 'error-box'; box.textContent = 'Fullscreen permission is required to begin this quiz.'; root.append(box); } }
  async function navigate(next, requireAnswer) { const question = state.questions[shownQuestion]; try { const value = answerValue(question); if (String(Array.isArray(value) ? value.join('') : value).trim()) { drafts.set(question.id, value); state = await submit(question); } else if (requireAnswer) throw new Error('Answer this question before moving on.'); if (next >= state.questions.length) return finishQuiz(); shownQuestion = Math.max(0, next); renderQuiz(); } catch (error) { const box = document.getElementById('answer-error'); box.textContent = error.message; box.hidden = false; } }
  async function finishQuiz() { try { state = await A.request(`/api/session/${code}/complete`, { method:'POST', headers:auth() }); lockdown = false; if (document.fullscreenElement) await document.exitFullscreen(); renderQuiz(); } catch (error) { alert(error.message); } }
  function tickQuiz() { const left = Math.max(0, state.questionEndsAt - Date.now()); document.getElementById('quiz-timer').textContent = A.formatTime(left); }
  function completedScreen(prefix = 'Your answers are submitted.') { lockdown = false; root.innerHTML = `<div class="result-icon correct">✓</div><h1>Quiz complete.</h1><p>${prefix} Your teacher has the live report.</p>`; }
  function removedScreen() { lockdown = false; clearModifier(); document.getElementById('lockdown-warning')?.setAttribute('hidden',''); root.innerHTML = '<div class="lockdown-overlay removed"><div><p class="eyebrow">Atom Lockdown Browser</p><h2>Cheating detected</h2><p>You’ve been removed from this quiz. Your teacher can review the event and allow you back in.</p></div></div>'; }
  function combo(event) { return [event.ctrlKey ? 'Ctrl' : '', event.metaKey ? 'Command/Search' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', !['Control','Meta','Alt','Shift'].includes(event.key) ? event.key : ''].filter(Boolean).join(' + '); }
  function installLockdown() {
    if (document.body.dataset.lockdownInstalled) return; document.body.dataset.lockdownInstalled = 'true';
    ['copy','cut','paste','contextmenu'].forEach(type => document.addEventListener(type, event => { if (lockdown) { event.preventDefault(); logIncident(type, type, false); } }));
    document.addEventListener('keydown', event => { if (!lockdown || !(event.ctrlKey || event.metaKey || event.altKey)) return; event.preventDefault(); if (!modifierTimer) startModifier(combo(event), event.key); });
    document.addEventListener('keyup', event => { if (['Control','Meta','Alt'].includes(event.key)) clearModifier(); });
    window.addEventListener('blur', clearModifier);
    document.addEventListener('fullscreenchange', () => { if (lockdown && !document.fullscreenElement) logIncident('fullscreen-exit', 'Fullscreen', true); });
    document.addEventListener('visibilitychange', () => { if (lockdown && document.hidden) logIncident('tab-hidden', 'Visibility', true); });
  }
  function startModifier(label, key) { modifierKey = label; const overlay = document.getElementById('lockdown-warning'); overlay.hidden = false; let end = Date.now() + 5000; const update = () => document.getElementById('lockdown-countdown').textContent = A.formatTime(end - Date.now()); update(); modifierInterval = setInterval(update, 100); modifierTimer = setTimeout(() => { clearInterval(modifierInterval); modifierTimer = null; logIncident('modifier-held', key, true, label); }, 5000); }
  function clearModifier() { clearTimeout(modifierTimer); clearInterval(modifierInterval); modifierTimer = null; modifierInterval = null; modifierKey = ''; const overlay = document.getElementById('lockdown-warning'); if (overlay) overlay.hidden = true; }
  async function logIncident(type, key, remove, label = modifierKey) { try { state = await A.request(`/api/session/${code}/incident`, { method:'POST', headers:auth(), body:{ type, key, combo:label, remove } }); if (remove) renderQuiz(); } catch (_) {} }
  function render() { if (!state) return; page === 'orbit' ? renderOrbit() : renderQuiz(); }
})();
