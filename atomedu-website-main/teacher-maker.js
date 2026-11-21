(function () {
  'use strict';
  const A = window.atomClassroom;
  const root = document.getElementById('maker-root');
  if (!root) return;
  const mode = document.body.dataset.makerMode === 'quiz' ? 'quiz' : 'orbit';
  const questions = [];

  const freshQuestion = () => ({
    id: crypto.randomUUID(), title: '', prompt: '', context: '', image: '', type: 'multiple-choice',
    options: ['', '', '', ''], correct: [], seconds: 30, points: 1,
  });

  function render() {
    root.innerHTML = `<div class="maker-layout"><section class="maker-main">
      <div class="question-card"><div class="question-body question-grid">
        <div class="field wide"><label for="activity-title">${mode === 'quiz' ? 'Quiz' : 'Room'} title</label><input id="activity-title" maxlength="120" placeholder="${mode === 'quiz' ? 'Unit 4 assessment' : 'Algebra review'}"></div>
        ${mode === 'quiz' ? '<div class="field"><label for="quiz-password">Required password</label><input id="quiz-password" type="password" minlength="4" maxlength="120" placeholder="At least 4 characters"></div><div class="field"><label for="quiz-duration">Total time (minutes)</label><input id="quiz-duration" type="number" min="1" max="240" value="30"></div>' : ''}
      </div></div>
      <div id="question-list"></div>
      <button class="button button-secondary" id="add-question" type="button">+ Add another question</button>
    </section><aside class="maker-sidebar"><h2>Ready to launch?</h2><p>${mode === 'quiz' ? 'Students will need the quiz ID and password. The teacher console stays available for this browser session.' : 'You will receive a six-digit room code and move into the live lobby.'}</p><button class="button button-primary button-block" id="launch-activity" type="button">${mode === 'quiz' ? 'Create quiz' : 'Host Orbit Room'}</button><div class="error-box" id="maker-error" hidden></div></aside></div>`;
    document.getElementById('add-question').addEventListener('click', () => { syncAll(); questions.push(freshQuestion()); drawQuestions(); });
    document.getElementById('launch-activity').addEventListener('click', launch);
    drawQuestions();
  }

  function typeOptions(selected) {
    const types = [['multiple-choice','Multiple choice'],['multi-select','Multi-select'],['true-false','True / false'],['free-response','Free response'],['fill-blank','Fill in the blank']];
    return types.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  }

  function drawQuestions() {
    const list = document.getElementById('question-list');
    list.innerHTML = questions.map((q, index) => `<article class="question-card" data-index="${index}"><div class="question-head"><span class="question-number">${index + 1}</span><strong>${A.escapeHtml(q.title || `Question ${index + 1}`)}</strong>${questions.length > 1 ? '<button class="icon-button remove-question" type="button" aria-label="Remove question">×</button>' : ''}</div><div class="question-body"><div class="question-grid">
      ${mode === 'quiz' ? `<div class="field"><label>Question title</label><input data-key="title" maxlength="120" value="${A.escapeHtml(q.title)}" placeholder="A short label"></div>` : ''}
      <div class="field"><label>Answer type</label><select data-key="type">${typeOptions(q.type)}</select></div>
      <div class="field wide"><label>Question</label><textarea data-key="prompt" maxlength="4000" placeholder="What should students solve?">${A.escapeHtml(q.prompt)}</textarea></div>
      ${mode === 'quiz' ? `<div class="field wide"><label>Passage or additional context (optional)</label><textarea data-key="context" maxlength="8000" placeholder="Paste a source, passage, dataset, or instructions. LaTeX such as \\(x^2\\) is supported as text.">${A.escapeHtml(q.context)}</textarea></div>` : ''}
      <div class="field"><label>Attach image (optional)</label><input class="image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif">${q.image ? `<img class="image-preview" src="${q.image}" alt="Question preview">` : ''}</div>
      ${mode === 'orbit' ? `<div class="field"><label>Time for this question</label><select data-key="seconds">${[10,15,20,30,45,60,90,120].map(n => `<option value="${n}" ${n === q.seconds ? 'selected' : ''}>${n} seconds</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Points</label><input data-key="points" type="number" min="1" max="100" value="${q.points}"></div>
    </div><div class="choice-editor">${choiceEditor(q)}</div></div></article>`).join('');
    list.querySelectorAll('[data-key]').forEach(input => input.addEventListener('input', syncInput));
    list.querySelectorAll('[data-option]').forEach(input => input.addEventListener('input', event => { const card = event.target.closest('[data-index]'); const q = questions[Number(card.dataset.index)]; syncOptions(card, q); q.correct = Array.from(card.querySelectorAll('[data-correct="choice"]:checked')).map(choice => q.options[Number(choice.value)]).filter(Boolean); }));
    list.querySelectorAll('[data-correct]').forEach(input => input.addEventListener('change', syncCorrect));
    list.querySelectorAll('.remove-question').forEach(button => button.addEventListener('click', event => { questions.splice(Number(event.target.closest('[data-index]').dataset.index), 1); drawQuestions(); }));
    list.querySelectorAll('.image-input').forEach(input => input.addEventListener('change', readImage));
  }

  function choiceEditor(q) {
    if (q.type === 'free-response') return `<div class="manual-answer-note"><strong>Teacher graded</strong><span>Students write a response. You assign points in the report after the session.</span></div>`;
    if (q.type === 'fill-blank') return `<div class="field"><label>Accepted answer</label><input data-correct="text" maxlength="500" value="${A.escapeHtml(q.correct[0] || '')}" placeholder="Students must match this answer (case-insensitive)"></div>`;
    const options = q.type === 'true-false' ? ['True', 'False'] : q.options;
    const multiple = q.type === 'multi-select';
    return `<span class="field-label">Mark the correct ${multiple ? 'answer(s)' : 'answer'}</span>${options.map((option, index) => `<label class="choice-row"><input data-correct="choice" type="${multiple ? 'checkbox' : 'radio'}" name="correct-${q.id}" value="${index}" ${q.correct.includes(option) ? 'checked' : ''}><input data-option="${index}" type="text" maxlength="300" value="${A.escapeHtml(option)}" ${q.type === 'true-false' ? 'readonly' : ''} placeholder="Choice ${index + 1}"><span class="choice-shape">${String.fromCharCode(65 + index)}</span></label>`).join('')}`;
  }

  function syncInput(event) {
    const card = event.target.closest('[data-index]'); const q = questions[Number(card.dataset.index)]; const key = event.target.dataset.key;
    if (key === 'type') { q.type = event.target.value; q.correct = []; if (q.type === 'true-false') q.options = ['True','False']; drawQuestions(); return; }
    q[key] = ['seconds','points'].includes(key) ? Number(event.target.value) : event.target.value;
    if (key === 'title') card.querySelector('.question-head strong').textContent = event.target.value || `Question ${Number(card.dataset.index) + 1}`;
  }
  function syncCorrect(event) {
    const card = event.target.closest('[data-index]'); const q = questions[Number(card.dataset.index)];
    if (event.target.dataset.correct === 'text') q.correct = [event.target.value];
    else { syncOptions(card, q); q.correct = Array.from(card.querySelectorAll('[data-correct="choice"]:checked')).map(input => q.options[Number(input.value)]).filter(Boolean); }
  }
  function syncOptions(card, q) { card.querySelectorAll('[data-option]').forEach(input => { q.options[Number(input.dataset.option)] = input.value; }); }
  function syncAll() { document.querySelectorAll('[data-index]').forEach(card => { const q = questions[Number(card.dataset.index)]; card.querySelectorAll('[data-key]').forEach(input => { q[input.dataset.key] = ['seconds','points'].includes(input.dataset.key) ? Number(input.value) : input.value; }); syncOptions(card, q); const text = card.querySelector('[data-correct="text"]'); if (text) q.correct = [text.value]; else q.correct = Array.from(card.querySelectorAll('[data-correct="choice"]:checked')).map(input => q.options[Number(input.value)]).filter(Boolean); }); }
  function readImage(event) {
    const file = event.target.files[0]; const q = questions[Number(event.target.closest('[data-index]').dataset.index)];
    if (!file) return; if (file.size > 650000) return showError('Images must be smaller than 650 KB.');
    const reader = new FileReader(); reader.onload = () => { q.image = String(reader.result); drawQuestions(); }; reader.readAsDataURL(file);
  }
  function showError(message) { const box = document.getElementById('maker-error'); box.textContent = message; box.hidden = false; }

  async function launch() {
    syncAll(); const button = document.getElementById('launch-activity'); const title = document.getElementById('activity-title').value.trim();
    if (!title) return showError('Give this activity a title.');
    const invalid = questions.findIndex(q => !q.prompt.trim() || (q.type !== 'free-response' && (!q.correct.length || q.correct.some(value => !String(value).trim()))));
    if (invalid >= 0) return showError(`Question ${invalid + 1} needs a prompt and correct answer.`);
    button.disabled = true; button.textContent = 'Creating…';
    try {
      const data = await A.request('/api/session', { method:'POST', body:{ mode, title, password: mode === 'quiz' ? document.getElementById('quiz-password').value : '', durationMinutes: mode === 'quiz' ? Number(document.getElementById('quiz-duration').value) : 0, questions } });
      A.saveToken(data.code, data.teacherToken, 'teacher');
      location.href = `${mode === 'quiz' ? '/teachers-quiz-console' : '/teachers-orbit-host'}?room=${encodeURIComponent(data.code)}`;
    } catch (error) { showError(error.message); button.disabled = false; button.textContent = mode === 'quiz' ? 'Create quiz' : 'Host Orbit Room'; }
  }
  questions.push(freshQuestion()); render();
})();
