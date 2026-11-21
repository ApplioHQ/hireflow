(function () {
  'use strict';
  const A = window.atomClassroom;
  const code = A.roomCode();
  const token = A.getToken(code, 'teacher');
  const root = document.getElementById('host-root');
  const status = document.getElementById('connection-status');
  let state = null;
  let report = null;
  let timer;

  document.body.classList.add('orbit-host');
  document.getElementById('room-code').textContent = code || '------';
  if (!code || !token) {
    root.innerHTML = '<div class="error-box">This teacher link is only available in the browser that created the room. Create a new room from the teacher home.</div>';
    return;
  }

  A.socket(code, token, next => {
    const justFinished = state?.phase !== 'finished' && next.phase === 'finished';
    state = next;
    if (justFinished || state.phase === 'finished') loadReport();
    else render();
  }, value => { status.textContent = value === 'connected' ? 'Live' : 'Reconnecting'; });
  A.request(`/api/session/${code}/state`, { headers: auth() }).then(next => {
    state = next;
    if (state.phase === 'finished') loadReport();
    else render();
  }).catch(error => { root.innerHTML = `<div class="error-box">${A.escapeHtml(error.message)}</div>`; });

  function auth() { return { Authorization: `Bearer ${token}` }; }
  function students() { return state.students.filter(student => !student.removed); }
  function responses() { return state.responses.filter(response => response.questionId === state.questions[state.questionIndex]?.id); }
  function joinUrl() { return `https://atom-edu.org/students/join?room=${encodeURIComponent(code)}`; }

  async function action(name) {
    try {
      state = await A.request(`/api/session/${code}/action`, { method: 'POST', headers: auth(), body: { action: name } });
      if (state.phase === 'finished') await loadReport();
      else render();
    } catch (error) { alert(error.message); }
  }

  async function loadReport() {
    try { report = await A.request(`/api/session/${code}/report`, { headers: auth() }); }
    catch (error) { report = { error: error.message }; }
    render();
  }

  async function grade(studentId, questionId, points) {
    try {
      state = await A.request(`/api/session/${code}/grade`, { method: 'POST', headers: auth(), body: { studentId, questionId, points } });
      await loadReport();
    } catch (error) { alert(error.message); }
  }

  function studentGrid() {
    return `<div class="student-list">${state.students.length ? state.students.map(student => `<div class="student-chip ${student.removed ? 'removed' : ''}"><strong>${A.escapeHtml(student.name)}</strong><span>${student.removed ? 'Removed' : 'Ready'}</span></div>`).join('') : '<p>No students yet. Share the code or QR link.</p>'}</div>`;
  }

  function lobby() {
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(joinUrl())}`;
    return `<section class="orbit-lobby">
      <div class="orbit-lobby-heading"><p class="eyebrow">${A.escapeHtml(state.title)}</p><h1>Students are joining</h1><span class="status-pill">${students().length}/50 students</span></div>
      <div class="orbit-join-row">
        <button class="orbit-code-copy" id="copy-room" type="button" aria-label="Copy student join link"><span>Room code</span><strong>${A.escapeHtml(code)}</strong><small id="copy-hint">Click to copy join link</small></button>
        <div class="orbit-qr"><img src="${qr}" alt="QR code for the student join link"><span>Scan to join</span></div>
        <button class="button button-primary orbit-start" id="start" ${students().length ? '' : 'disabled'}>Start room</button>
      </div>
      <div class="orbit-roster"><div><strong>Lobby</strong><span>Names appear as students join</span></div>${studentGrid()}</div>
    </section>`;
  }

  function optionGrid(question, reveal) {
    if (question.type === 'free-response' || question.type === 'fill-blank') {
      return `<div class="orbit-written-box"><span>${question.type === 'free-response' ? 'Written response' : 'Fill in the blank'}</span><strong>${question.points} ${question.points === 1 ? 'point' : 'points'}</strong><small>${question.type === 'free-response' ? 'Teacher graded after the room' : reveal ? `Answer: ${question.correct.map(A.escapeHtml).join(', ')}` : 'Students type their answer'}</small></div>`;
    }
    const options = question.options.filter(option => String(option).trim());
    return `<div class="orbit-option-grid option-count-${options.length} ${reveal ? 'reveal-grid' : ''}">${options.map((option, index) => {
      const correct = question.correct.includes(option);
      return `<div class="answer-choice answer-color-${index % 6} ${reveal ? (correct ? 'is-correct' : 'is-muted') : ''}"><span class="choice-shape">${reveal && correct ? '✓' : String.fromCharCode(65 + index)}</span><span>${A.escapeHtml(option)}</span></div>`;
    }).join('')}</div>`;
  }

  function questionStage(reveal) {
    const question = state.questions[state.questionIndex];
    return `<section class="orbit-question-stage">
      <div class="orbit-question-top"><div class="timer-ring" id="timer-ring"><span id="time-left">${question.seconds}s</span></div><div><p class="eyebrow">Question ${state.questionIndex + 1} of ${state.questions.length}</p><h1>${A.escapeHtml(question.prompt)}</h1></div><span class="orbit-response-count">${responses().length}/${students().length} answered</span></div>
      ${question.context ? `<div class="context">${A.escapeHtml(question.context)}</div>` : ''}
      ${question.image ? `<img class="stage-image" src="${question.image}" alt="Question image">` : ''}
      ${optionGrid(question, reveal)}
      <button class="button ${reveal ? 'button-primary' : 'button-dark'} orbit-stage-action" id="${reveal ? 'show-board' : 'show-result'}">${reveal ? 'Show leaderboard' : 'End question and reveal'}</button>
    </section>`;
  }

  function board() {
    return `<section class="orbit-board"><p class="eyebrow">After question ${state.questionIndex + 1}</p><h1>Top five</h1><div class="leaderboard">${state.leaderboard.map(item => `<div class="leader-row"><b>#${item.rank}</b><strong>${A.escapeHtml(item.name)}</strong><span>${item.score} pts</span></div>`).join('') || '<p>No scores yet.</p>'}</div><button class="button button-primary" id="next">${state.questionIndex + 1 === state.questions.length ? 'Finish room' : 'Next question'}</button></section>`;
  }

  function responseRows(student) {
    return state.questions.map((question, index) => {
      const response = student.responses.find(item => item.questionId === question.id);
      const answer = response?.answer?.length ? response.answer.map(A.escapeHtml).join(', ') : 'No answer';
      const grade = response ? (response.gradePoints ?? (response.correct ? question.points : 0)) : 0;
      const pending = response && response.graded === false;
      return `<tr><td><strong>${index + 1}. ${A.escapeHtml(question.prompt)}</strong><small class="report-answer">${answer}</small></td><td>${pending ? 'Pending' : response?.correct ? 'Correct' : response ? 'Incorrect' : 'No answer'}</td><td><div class="grade-editor"><input type="number" min="0" max="${question.points}" step="0.5" value="${grade}" data-grade-input="${student.id}:${question.id}" ${response ? '' : 'disabled'}><span>/ ${question.points}</span><button class="button button-secondary save-grade" data-student="${student.id}" data-question="${question.id}" ${response ? '' : 'disabled'}>Save</button></div></td><td>${response ? A.formatTime(response.elapsedMs) : '—'}</td></tr>`;
    }).join('');
  }

  function reportView() {
    if (!report) return '<div class="orbit-report-loading">Building the report…</div>';
    if (report.error) return `<div class="error-box">${A.escapeHtml(report.error)}</div>`;
    return `<section class="orbit-report"><div class="console-top"><div><p class="eyebrow">Orbit Room report</p><h1>${A.escapeHtml(report.title)}</h1><p>Accuracy is calculated from correct and incorrect answers, not game score.</p></div></div>
      <div class="analytics-grid"><div class="metric-card"><span>Class accuracy</span><strong>${report.averagePercent}%</strong></div><div class="metric-card"><span>Students</span><strong>${report.students.length}</strong></div><div class="metric-card"><span>Questions</span><strong>${report.questions.length}</strong></div></div>
      <table class="report-table"><thead><tr><th>Student</th><th>Game score</th><th>Accuracy</th><th>Grade</th><th>Avg. time</th></tr></thead><tbody>${report.students.map(student => `<tr><td>${A.escapeHtml(student.name)}</td><td>${student.gameScore}</td><td>${student.percent}%</td><td>${student.earned} / ${student.possible}</td><td>${A.formatTime(student.averageTimeMs)}</td></tr>`).join('')}</tbody></table>
      <h2>Individual reports and grading</h2>${report.students.map(student => `<details class="question-card report-student"><summary class="question-head"><strong>${A.escapeHtml(student.name)}</strong><span>${student.percent}% accuracy</span></summary><div class="question-body"><table class="report-table"><thead><tr><th>Question and response</th><th>Result</th><th>Points</th><th>Time</th></tr></thead><tbody>${responseRows(student)}</tbody></table></div></details>`).join('')}
      <h2>Question analysis</h2><table class="report-table"><thead><tr><th>Question</th><th>Responses</th><th>Accuracy</th><th>Avg. time</th></tr></thead><tbody>${report.questions.map(question => `<tr><td>${A.escapeHtml(question.prompt)}</td><td>${question.responseCount}</td><td>${question.accuracy}%</td><td>${A.formatTime(question.averageTimeMs)}</td></tr>`).join('')}</tbody></table>
    </section>`;
  }

  function render() {
    if (!state) return;
    document.body.classList.toggle('orbit-complete', state.phase === 'finished');
    if (state.phase === 'lobby') root.innerHTML = lobby();
    else if (state.phase === 'question') root.innerHTML = questionStage(false);
    else if (state.phase === 'result') root.innerHTML = questionStage(true);
    else if (state.phase === 'leaderboard') root.innerHTML = board();
    else root.innerHTML = reportView();
    wire();
    clearInterval(timer);
    tick();
    timer = setInterval(tick, 250);
  }

  function wire() {
    document.getElementById('start')?.addEventListener('click', () => action('start'));
    document.getElementById('show-result')?.addEventListener('click', () => action('result'));
    document.getElementById('show-board')?.addEventListener('click', () => action('leaderboard'));
    document.getElementById('next')?.addEventListener('click', () => action('next'));
    document.getElementById('copy-room')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(joinUrl());
      const hint = document.getElementById('copy-hint');
      if (hint) hint.textContent = 'Join link copied';
    });
    document.querySelectorAll('.save-grade').forEach(button => button.addEventListener('click', () => {
      const input = document.querySelector(`[data-grade-input="${button.dataset.student}:${button.dataset.question}"]`);
      grade(button.dataset.student, button.dataset.question, Number(input.value));
    }));
  }

  function tick() {
    if (!state?.questionEndsAt) return;
    const question = state.questions[state.questionIndex];
    const left = Math.max(0, state.questionEndsAt - Date.now());
    const ring = document.getElementById('timer-ring');
    if (ring) ring.style.setProperty('--progress', String(left / (question.seconds * 1000)));
    const label = document.getElementById('time-left');
    if (label) label.textContent = A.formatTime(left);
  }
})();
