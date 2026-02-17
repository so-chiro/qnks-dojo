// ===== QNKS道場 — Core Application Logic =====

(function () {
  'use strict';

  // ===== State =====
  let notes = [];
  let lines = [];
  let summaryText = '';
  let questionText = '';
  let nextNoteId = 1;
  let ctrlSelectedNoteId = null;

  // Undo/Redo
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 30;

  // ===== DOM References =====
  const canvas = document.getElementById('canvas');
  const linesSvg = document.getElementById('lines-svg');
  const canvasHint = document.getElementById('canvas-hint');
  const inputQTop = document.getElementById('input-q-top');
  const btnApplyQTop = document.getElementById('btn-apply-q-top');
  const inputK = document.getElementById('input-k');
  const inputS = document.getElementById('input-s');
  const btnApplyK = document.getElementById('btn-apply-k');
  const btnClearK = document.getElementById('btn-clear-k');
  const btnReset = document.getElementById('btn-reset');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnShuffle = document.getElementById('btn-shuffle');
  const btnAdd = document.getElementById('btn-add');
  const btnSave = document.getElementById('btn-save');
  const btnSettings = document.getElementById('btn-settings');
  const btnTemplate = document.getElementById('btn-template');
  const btnGenerateAnswer = document.getElementById('btn-generate-answer');
  const aiAnswerPanel = document.getElementById('ai-answer-panel');
  const btnAiCorrect = document.getElementById('btn-ai-correct');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnSubmit = document.getElementById('btn-submit');
  const correctionPanel = document.getElementById('correction-panel');
  const correctionContent = document.getElementById('correction-content');
  const btnCloseCorrection = document.getElementById('btn-close-correction');

  // AI state
  let lastModelAnswer = '';

  // ===== Utility Functions =====
  function generateId() {
    return nextNoteId++;
  }

  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function getCanvasRect() {
    return canvas.getBoundingClientRect();
  }

  // ===== Settings Management =====
  function getSetting(key, defaultVal) {
    return localStorage.getItem('qnks_' + key) || defaultVal || '';
  }

  function setSetting(key, value) {
    localStorage.setItem('qnks_' + key, value);
  }

  function getApiKey() {
    return getSetting('api_key', '');
  }

  function getProvider() {
    return getSetting('ai_provider', 'gemini');
  }

  function getSubmitUrl() {
    return getSetting('submit_url', '');
  }

  function getStudentName() {
    return getSetting('student_name', '');
  }

  function isTeacherMode() {
    return getSetting('teacher_mode', '') === 'true';
  }

  function applyTeacherMode() {
    const sectionAi = document.getElementById('section-ai');
    if (sectionAi) {
      sectionAi.style.display = isTeacherMode() ? '' : 'none';
    }
    if (btnTemplate) {
      btnTemplate.style.display = isTeacherMode() ? '' : 'none';
    }
  }

  // ===== State Management =====
  function saveStateToHistory() {
    const state = {
      notes: JSON.parse(JSON.stringify(notes)),
      lines: JSON.parse(JSON.stringify(lines)),
      summaryText: summaryText,
      questionText: questionText,
      nextNoteId: nextNoteId
    };
    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStack.length = 0;
  }

  function restoreState(state) {
    notes = state.notes;
    lines = state.lines;
    summaryText = state.summaryText;
    questionText = state.questionText;
    nextNoteId = state.nextNoteId;
    inputQTop.value = questionText;
    inputS.value = summaryText;
  }

  function undo() {
    if (undoStack.length === 0) {
      showToast('戻せる操作がありません');
      return;
    }
    const currentState = {
      notes: JSON.parse(JSON.stringify(notes)),
      lines: JSON.parse(JSON.stringify(lines)),
      summaryText, questionText, nextNoteId
    };
    redoStack.push(currentState);
    const prev = undoStack.pop();
    restoreState(prev);
    renderAll();
    autoSave();
    showToast('ひとつ戻しました');
  }

  function redo() {
    if (redoStack.length === 0) {
      showToast('進める操作がありません');
      return;
    }
    const currentState = {
      notes: JSON.parse(JSON.stringify(notes)),
      lines: JSON.parse(JSON.stringify(lines)),
      summaryText, questionText, nextNoteId
    };
    undoStack.push(currentState);
    const next = redoStack.pop();
    restoreState(next);
    renderAll();
    autoSave();
    showToast('ひとつ進めました');
  }

  // ===== Save / Load =====
  function saveToLocalStorage() {
    const data = {
      notes, lines, summaryText, questionText, nextNoteId, lastModelAnswer
    };
    localStorage.setItem('qnks_dojo_data', JSON.stringify(data));
    showToast('💾 保存しました');
  }

  function loadFromLocalStorage() {
    const raw = localStorage.getItem('qnks_dojo_data');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      notes = data.notes || [];
      lines = data.lines || [];
      summaryText = data.summaryText || '';
      questionText = data.questionText || '';
      nextNoteId = data.nextNoteId || 1;
      lastModelAnswer = data.lastModelAnswer || '';
      inputQTop.value = questionText;
      inputS.value = summaryText;
      if (lastModelAnswer) {
        aiAnswerPanel.innerHTML = lastModelAnswer.replace(/\n/g, '<br>');
      }
    } catch (e) {
      console.warn('Failed to load data:', e);
    }
  }

  function autoSave() {
    const data = {
      notes, lines, summaryText, questionText, nextNoteId, lastModelAnswer
    };
    localStorage.setItem('qnks_dojo_data', JSON.stringify(data));
  }

  // ===== Render Functions =====
  function renderAll() {
    renderNotes();
    renderLines();
    updateHintVisibility();
  }

  function updateHintVisibility() {
    if (notes.length > 0) {
      canvasHint.style.display = 'none';
    } else {
      canvasHint.style.display = '';
    }
  }

  function renderNotes() {
    const existingNotes = canvas.querySelectorAll('.sticky-note');
    existingNotes.forEach(n => n.remove());

    notes.forEach(note => {
      const el = createNoteElement(note);
      canvas.appendChild(el);
    });
  }

  function createNoteElement(note) {
    const el = document.createElement('div');
    el.className = 'sticky-note';
    el.dataset.noteId = note.id;
    el.style.left = note.x + 'px';
    el.style.top = note.y + 'px';

    const colorMap = {
      'pink': 'note-pink',
      'yellow': 'note-yellow',
      'blue': 'note-blue',
      'green': 'note-green',
      'purple': 'note-purple'
    };

    if (note.type === 'question') {
      el.classList.add('note-q');
    } else {
      el.classList.add(colorMap[note.color] || 'note-yellow');
    }

    if (note.type === 'question') {
      const tag = document.createElement('span');
      tag.className = 'note-tag';
      tag.textContent = 'Q';
      el.appendChild(tag);
      el.appendChild(document.createElement('br'));
    }

    const content = document.createElement('div');
    content.className = 'note-content';
    content.contentEditable = true;
    content.textContent = note.text;
    content.addEventListener('blur', () => {
      note.text = content.textContent;
      autoSave();
    });
    content.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });
    el.appendChild(content);

    if (note.type !== 'question') {
      const del = document.createElement('button');
      del.className = 'note-delete';
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        saveStateToHistory();
        deleteNote(note.id);
        renderAll();
        autoSave();
        showToast('付箋を削除しました');
      });
      el.appendChild(del);
    }

    setupDrag(el, note);

    el.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        handleCtrlClick(note.id, el);
      }
    });

    return el;
  }

  // ===== Drag & Drop =====
  function setupDrag(el, note) {
    let isDragging = false;
    let startX, startY, noteStartX, noteStartY;

    const onPointerDown = (e) => {
      if (e.target.classList.contains('note-delete')) return;
      if (e.target.classList.contains('note-content') && document.activeElement === e.target) return;
      if (e.ctrlKey || e.metaKey) return;

      e.preventDefault();
      isDragging = true;
      el.classList.add('dragging');

      startX = e.clientX;
      startY = e.clientY;
      noteStartX = note.x;
      noteStartY = note.y;

      el.setPointerCapture(e.pointerId);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const rect = getCanvasRect();

      let newX = Math.max(0, Math.min(noteStartX + dx, rect.width - 120));
      let newY = Math.max(0, Math.min(noteStartY + dy, rect.height - 40));

      note.x = newX;
      note.y = newY;
      el.style.left = newX + 'px';
      el.style.top = newY + 'px';

      renderLines();
    };

    const onPointerUp = () => {
      isDragging = false;
      el.classList.remove('dragging');
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      autoSave();
    };

    el.addEventListener('pointerdown', onPointerDown);
  }

  // ===== Line Connections =====
  function handleCtrlClick(noteId, el) {
    if (ctrlSelectedNoteId === null) {
      ctrlSelectedNoteId = noteId;
      el.classList.add('ctrl-highlight');
    } else if (ctrlSelectedNoteId === noteId) {
      ctrlSelectedNoteId = null;
      el.classList.remove('ctrl-highlight');
    } else {
      const exists = lines.some(l =>
        (l.from === ctrlSelectedNoteId && l.to === noteId) ||
        (l.from === noteId && l.to === ctrlSelectedNoteId)
      );
      if (!exists) {
        saveStateToHistory();
        lines.push({ from: ctrlSelectedNoteId, to: noteId, label: '' });
        renderLines();
        autoSave();
        showToast('線を繋げました');
      }
      const prevEl = canvas.querySelector(`[data-note-id="${ctrlSelectedNoteId}"]`);
      if (prevEl) prevEl.classList.remove('ctrl-highlight');
      ctrlSelectedNoteId = null;
    }
  }

  function renderLines() {
    linesSvg.innerHTML = '';
    // Remove old line labels
    canvas.querySelectorAll('.line-label').forEach(el => el.remove());

    const canvasRect = getCanvasRect();
    linesSvg.setAttribute('width', canvasRect.width);
    linesSvg.setAttribute('height', canvasRect.height);

    lines.forEach((line, idx) => {
      const fromNote = notes.find(n => n.id === line.from);
      const toNote = notes.find(n => n.id === line.to);
      if (!fromNote || !toNote) return;

      const fromEl = canvas.querySelector(`[data-note-id="${fromNote.id}"]`);
      const toEl = canvas.querySelector(`[data-note-id="${toNote.id}"]`);
      if (!fromEl || !toEl) return;

      const fromCx = fromNote.x + fromEl.offsetWidth / 2;
      const fromCy = fromNote.y + fromEl.offsetHeight / 2;
      const toCx = toNote.x + toEl.offsetWidth / 2;
      const toCy = toNote.y + toEl.offsetHeight / 2;

      const svgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      svgLine.setAttribute('x1', fromCx);
      svgLine.setAttribute('y1', fromCy);
      svgLine.setAttribute('x2', toCx);
      svgLine.setAttribute('y2', toCy);
      svgLine.setAttribute('stroke', '#e2b340');
      svgLine.setAttribute('stroke-width', '2.5');
      svgLine.setAttribute('stroke-opacity', '0.6');
      svgLine.setAttribute('stroke-linecap', 'round');

      linesSvg.appendChild(svgLine);

      // Line label at midpoint
      const midX = (fromCx + toCx) / 2;
      const midY = (fromCy + toCy) / 2;

      const labelEl = document.createElement('div');
      labelEl.className = 'line-label';
      labelEl.style.left = midX + 'px';
      labelEl.style.top = midY + 'px';

      const labelText = document.createElement('span');
      labelText.className = 'line-label-text';
      labelText.textContent = line.label || '＋';
      if (!line.label) labelText.classList.add('line-label-empty');

      labelText.addEventListener('click', (e) => {
        e.stopPropagation();
        showLineLabelEditor(line, idx, labelEl);
      });

      const deleteBtn = document.createElement('span');
      deleteBtn.className = 'line-label-delete';
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveStateToHistory();
        lines.splice(idx, 1);
        renderLines();
        autoSave();
        showToast('線を削除しました');
      });

      labelEl.appendChild(labelText);
      labelEl.appendChild(deleteBtn);
      canvas.appendChild(labelEl);
    });
  }

  function showLineLabelEditor(line, idx, labelEl) {
    // Remove any existing editor
    const existing = document.querySelector('.line-label-editor');
    if (existing) existing.remove();

    const editor = document.createElement('div');
    editor.className = 'line-label-editor';
    editor.style.left = labelEl.style.left;
    editor.style.top = labelEl.style.top;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'line-label-input';
    input.value = line.label || '';
    input.placeholder = '接続詞を入力…';
    input.maxLength = 20;

    const save = () => {
      saveStateToHistory();
      line.label = input.value.trim();
      editor.remove();
      renderLines();
      autoSave();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') { editor.remove(); }
    });

    input.addEventListener('blur', save);

    editor.appendChild(input);
    canvas.appendChild(editor);
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }

  // ===== Note Operations =====
  function addNote(text, color, type, x, y) {
    const rect = getCanvasRect();
    if (x === undefined) x = 40 + Math.random() * (rect.width - 280);
    if (y === undefined) y = 40 + Math.random() * (rect.height - 120);

    const note = {
      id: generateId(),
      text, color: color || 'yellow', type: type || 'note', x, y
    };

    notes.push(note);
    return note;
  }

  function deleteNote(noteId) {
    notes = notes.filter(n => n.id !== noteId);
    lines = lines.filter(l => l.from !== noteId && l.to !== noteId);
  }

  // ===== Q Input (Top Bar) =====
  function applyQuestion() {
    const text = inputQTop.value.trim();
    if (!text) {
      showToast('問いを入力してください');
      return;
    }

    saveStateToHistory();

    const existingQ = notes.filter(n => n.type === 'question');
    existingQ.forEach(n => deleteNote(n.id));

    questionText = text;
    addNote(text, 'purple', 'question', 30, 30);

    renderAll();
    autoSave();
    showToast('Q を適用しました');
  }

  // ===== K Input =====
  function applyKeywords() {
    const raw = inputK.value.trim();
    if (!raw) {
      showToast('キーワードを入力してください');
      return;
    }

    saveStateToHistory();

    const keywords = raw.split('\n').map(k => k.trim()).filter(k => k);
    const colors = ['pink', 'yellow', 'blue', 'green', 'purple'];

    keywords.forEach((kw, i) => {
      addNote(kw, colors[i % colors.length], 'keyword');
    });

    renderAll();
    autoSave();
    showToast(`${keywords.length} 個のキーワードを追加しました`);
  }

  // ===== Shuffle =====
  function shuffleNotes() {
    if (notes.length === 0) {
      showToast('付箋がありません');
      return;
    }
    saveStateToHistory();
    const rect = getCanvasRect();
    notes.forEach(note => {
      note.x = 30 + Math.random() * (rect.width - 260);
      note.y = 30 + Math.random() * (rect.height - 100);
    });
    renderAll();
    autoSave();
    showToast('🎲 バラバラにしました');
  }

  // ===== Reset =====
  function resetAll() {
    if (!confirm('すべてリセットしますか？')) return;
    saveStateToHistory();
    notes = [];
    lines = [];
    summaryText = '';
    questionText = '';
    lastModelAnswer = '';
    nextNoteId = 1;
    inputQTop.value = '';
    inputK.value = '';
    inputS.value = '';
    aiAnswerPanel.innerHTML = '<p class="ai-placeholder">問いとキーワードを入力して「模範回答を生成」を押してください。</p>';
    correctionPanel.style.display = 'none';
    renderAll();
    autoSave();
    showToast('🔄 リセットしました');
  }

  // ===== Add Note Modal =====
  function showAddModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'add-note-modal';

    modal.innerHTML = `
      <h3 class="modal-title">＋ 付箋を追加</h3>
      <textarea class="modal-textarea" id="modal-note-text" placeholder="テキストを入力..."></textarea>
      <div class="color-picker">
        <div class="color-swatch swatch-pink selected" data-color="pink"></div>
        <div class="color-swatch swatch-yellow" data-color="yellow"></div>
        <div class="color-swatch swatch-blue" data-color="blue"></div>
        <div class="color-swatch swatch-green" data-color="green"></div>
        <div class="color-swatch swatch-purple" data-color="purple"></div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="modal-cancel">キャンセル</button>
        <button class="modal-btn modal-btn-submit" id="modal-submit">追加</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    let selectedColor = 'pink';
    const swatches = modal.querySelectorAll('.color-swatch');
    swatches.forEach(sw => {
      sw.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        selectedColor = sw.dataset.color;
      });
    });

    const close = () => { overlay.remove(); modal.remove(); };

    modal.querySelector('#modal-submit').addEventListener('click', () => {
      const text = modal.querySelector('#modal-note-text').value.trim();
      if (!text) { showToast('テキストを入力してください'); return; }
      saveStateToHistory();
      addNote(text, selectedColor, 'note');
      renderAll();
      autoSave();
      close();
      showToast('付箋を追加しました');
    });

    modal.querySelector('#modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', close);
    setTimeout(() => modal.querySelector('#modal-note-text').focus(), 100);
  }

  // ===== Settings Modal =====
  function showSettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'settings-modal';

    const currentKey = getSetting('api_key', '');
    const currentProvider = getProvider();
    const currentSubmitUrl = getSubmitUrl();
    const currentName = getStudentName();

    const currentTeacher = isTeacherMode();

    modal.innerHTML = `
      <h3 class="modal-title">⚙️ 設定</h3>

      <label class="settings-label">AIプロバイダー</label>
      <select class="settings-select" id="settings-provider">
        <option value="gemini" ${currentProvider === 'gemini' ? 'selected' : ''}>Gemini (Google)</option>
        <option value="openai" ${currentProvider === 'openai' ? 'selected' : ''}>OpenAI (GPT)</option>
      </select>

      <label class="settings-label">APIキー</label>
      <input type="password" class="settings-input" id="settings-api-key"
        placeholder="APIキーを入力..." value="${currentKey}">
      <p class="settings-hint">
        Gemini: <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a> /
        OpenAI: <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>
      </p>

      <hr class="settings-divider">

      <label class="settings-label">🧑‍🏫 先生モード（模範回答を表示）</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:14px;">
        <input type="checkbox" id="settings-teacher" ${currentTeacher ? 'checked' : ''}
          style="width:18px;height:18px;accent-color:var(--color-accent);cursor:pointer;">
        <span style="font-size:13px;color:var(--color-text-muted);">ONにすると AI 模範回答パネルが表示されます</span>
      </label>

      <hr class="settings-divider">

      <label class="settings-label">📤 回答提出先（Google Apps Script URL）</label>
      <input type="text" class="settings-input" id="settings-submit-url"
        placeholder="https://script.google.com/macros/s/..." value="${currentSubmitUrl}">
      <p class="settings-hint">先生から共有されたURLを入力してください。</p>

      <label class="settings-label">名前（提出時に記録）</label>
      <input type="text" class="settings-input" id="settings-student-name"
        placeholder="山田太郎" value="${currentName}">

      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="settings-cancel">キャンセル</button>
        <button class="modal-btn modal-btn-submit" id="settings-save">保存</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    const close = () => { overlay.remove(); modal.remove(); };

    modal.querySelector('#settings-save').addEventListener('click', () => {
      const provider = modal.querySelector('#settings-provider').value;
      const key = modal.querySelector('#settings-api-key').value.trim();
      const submitUrl = modal.querySelector('#settings-submit-url').value.trim();
      const studentName = modal.querySelector('#settings-student-name').value.trim();
      const teacherMode = modal.querySelector('#settings-teacher').checked;

      setSetting('ai_provider', provider);
      if (key) {
        setSetting('api_key', key);
      } else {
        localStorage.removeItem('qnks_api_key');
      }
      setSetting('submit_url', submitUrl);
      setSetting('student_name', studentName);
      setSetting('teacher_mode', teacherMode ? 'true' : 'false');

      applyTeacherMode();
      showToast('✅ 設定を保存しました');
      close();
    });

    modal.querySelector('#settings-cancel').addEventListener('click', close);
    overlay.addEventListener('click', close);
    setTimeout(() => modal.querySelector('#settings-provider').focus(), 100);
  }

  // ===== AI API Call (Gemini / OpenAI) =====
  async function callAI(prompt) {
    const apiKey = getApiKey();
    if (!apiKey) {
      showToast('⚙️ まず設定からAPIキーを入力してください');
      showSettingsModal();
      return null;
    }

    const provider = getProvider();

    if (provider === 'openai') {
      return await callOpenAI(apiKey, prompt);
    } else {
      return await callGemini(apiKey, prompt);
    }
  }

  async function callGemini(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 403) {
        throw new Error('Gemini APIキーが正しくありません。設定を確認してください。');
      }
      throw new Error('Gemini APIエラー (' + response.status + ')');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AIの応答が空でした');
    return text;
  }

  async function callOpenAI(apiKey, prompt) {
    const url = 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'あなたは小学生にもわかるように教える、やさしい先生です。日本語で、かんたんな言葉を使って回答してください。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('OpenAI APIキーが正しくありません。設定を確認してください。');
      }
      throw new Error('OpenAI APIエラー (' + response.status + ')');
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('AIの応答が空でした');
    return text;
  }

  // ===== AI Model Answer Generation =====
  async function generateModelAnswer() {
    const question = inputQTop.value.trim();
    if (!question) { showToast('問いを入力してください'); return; }

    const keywords = inputK.value.trim().split('\n').map(k => k.trim()).filter(k => k);
    if (keywords.length === 0) { showToast('キーワードを入力してください'); return; }

    btnGenerateAnswer.disabled = true;
    aiAnswerPanel.innerHTML = '<div class="ai-loading"><div class="spinner"></div>模範回答を生成中...</div>';

    const prompt = `あなたは小学生にもわかるように教える、やさしい先生です。以下の問いについて、指定されたキーワードをすべて使用して、200字程度の模範回答を作成してください。回答は小学生でも理解できるかんたんな言葉で、わかりやすく書いてください。

問い：「${question}」

使用するキーワード：${keywords.join('、')}

模範回答のみを出力してください。解説や前置きは不要です。`;

    try {
      const answer = await callAI(prompt);
      if (answer) {
        lastModelAnswer = answer;
        aiAnswerPanel.innerHTML = answer.replace(/\n/g, '<br>');
        autoSave();
        showToast('✨ 模範回答を生成しました');
      }
    } catch (error) {
      aiAnswerPanel.innerHTML = `<p class="ai-placeholder" style="color: var(--color-coral);">⚠️ ${error.message}</p>`;
      showToast('エラーが発生しました');
    } finally {
      btnGenerateAnswer.disabled = false;
    }
  }

  // ===== AI Correction =====
  async function correctSummary() {
    const question = inputQTop.value.trim();
    const summary = inputS.value.trim();

    if (!question) { showToast('問いを入力してください'); return; }
    if (!summary) { showToast('Sに文章を入力してください'); return; }

    btnAiCorrect.disabled = true;
    correctionPanel.style.display = 'block';
    correctionContent.innerHTML = '<div class="ai-loading"><div class="spinner"></div>添削中...</div>';

    const keywords = inputK.value.trim().split('\n').map(k => k.trim()).filter(k => k);
    const keywordNote = keywords.length > 0 ? `\nキーワード：${keywords.join('、')}` : '';

    const prompt = `あなたは小学生にもわかるように教える、やさしい先生です。以下の問いに対する生徒の回答を読んで、アドバイスしてください。

※重要なルール：
- 修正した文章や書き直した文章は絶対に書かないでください
- 答えを教えるのではなく、自分で考えるためのヒントだけを出してください
- 小学生にもわかるような、かんたんでやさしい言葉でアドバイスしてください
- 絵文字を使って親しみやすくしてください

問い：「${question}」${keywordNote}

生徒の回答：「${summary}」

以下の形式で回答してください：
1. 【いいところ ✨】がんばった点やいいところを2〜3文でほめてください。
2. 【ヒント 💡】もっとよくなるためのヒントを箇条書きで出してください。「〜について考えてみよう」「〜を付け加えるといいかも」のように、考えるきっかけを与える形にしてください。`;

    try {
      const result = await callAI(prompt);
      if (result) {
        const formatted = result
          .replace(/\n/g, '<br>')
          .replace(/【(.+?)】/g, '<strong>【$1】</strong>');
        correctionContent.innerHTML = formatted;
        showToast('📝 添削が完了しました');
      }
    } catch (error) {
      correctionContent.innerHTML = `<p class="ai-placeholder" style="color: var(--color-coral);">⚠️ ${error.message}</p>`;
      showToast('エラーが発生しました');
    } finally {
      btnAiCorrect.disabled = false;
    }
  }

  // ===== CSV Export =====
  function exportCsv() {
    const question = inputQTop.value.trim();
    const keywords = inputK.value.trim().split('\n').map(k => k.trim()).filter(k => k);
    const summary = inputS.value.trim();

    if (!question && !summary) { showToast('出力するデータがありません'); return; }

    const BOM = '\uFEFF';
    const headers = ['名前', '問い(Q)', 'キーワード(K)', 'まとめ(S)', '模範回答'];
    const row = [
      escapeCsv(getStudentName()),
      escapeCsv(question),
      escapeCsv(keywords.join('、')),
      escapeCsv(summary),
      escapeCsv(lastModelAnswer)
    ];

    const csv = BOM + headers.join(',') + '\n' + row.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qnks_${formatDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📊 CSVをダウンロードしました');
  }

  function escapeCsv(str) {
    if (!str) return '""';
    return '"' + str.replace(/"/g, '""') + '"';
  }

  function formatDate() {
    const d = new Date();
    return d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '_' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
  }

  // ===== Submit to Google Sheets =====
  async function submitToSheets() {
    const submitUrl = getSubmitUrl();
    if (!submitUrl) {
      showToast('⚙️ 設定から提出先URLを入力してください');
      showSettingsModal();
      return;
    }

    const studentName = getStudentName();
    if (!studentName) {
      showToast('⚙️ 設定から名前を入力してください');
      showSettingsModal();
      return;
    }

    const question = inputQTop.value.trim();
    const keywords = inputK.value.trim().split('\n').map(k => k.trim()).filter(k => k);
    const summary = inputS.value.trim();

    if (!summary) {
      showToast('Sに文章を入力してから提出してください');
      return;
    }

    btnSubmit.disabled = true;
    showToast('📸 キャンバスを撮影中...');

    // Capture canvas as image
    let canvasImage = '';
    try {
      const canvasWrapper = document.getElementById('canvas-wrapper');
      if (canvasWrapper && typeof html2canvas !== 'undefined') {
        const capturedCanvas = await html2canvas(canvasWrapper, {
          backgroundColor: '#0f0f1a',
          scale: 1.5,
          useCORS: true,
          logging: false
        });
        canvasImage = capturedCanvas.toDataURL('image/png');
      }
    } catch (e) {
      console.warn('Canvas capture failed:', e);
    }

    const payload = {
      name: studentName,
      question: question,
      keywords: keywords.join('、'),
      summary: summary,
      modelAnswer: lastModelAnswer,
      canvasImage: canvasImage,
      timestamp: new Date().toLocaleString('ja-JP')
    };

    try {
      await fetch(submitUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });

      // no-cors mode always returns opaque response, so we assume success
      showToast('📤 提出しました！');
    } catch (error) {
      console.error('Submit error:', error);
      showToast('⚠️ 提出に失敗しました。URLを確認してください。');
    } finally {
      btnSubmit.disabled = false;
    }
  }

  // ===== URL Template Feature =====
  function loadFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const k = params.get('k');
    const key = params.get('key');
    const provider = params.get('provider');

    if (!q && !k && !key) return false;

    if (q) {
      inputQTop.value = q;
      questionText = q;

      // Remove existing Q notes and add new one
      const existingQ = notes.filter(n => n.type === 'question');
      existingQ.forEach(n => deleteNote(n.id));
      addNote(q, 'purple', 'question', 30, 30);
    }

    if (k) {
      const keywords = k.split(',').map(kw => kw.trim()).filter(kw => kw);
      inputK.value = keywords.join('\n');

      const colors = ['pink', 'yellow', 'blue', 'green', 'purple'];
      keywords.forEach((kw, i) => {
        addNote(kw, colors[i % colors.length], 'keyword');
      });
    }

    // Auto-set API key and provider
    if (key) {
      setSetting('api_key', key);
      showToast('🔑 APIキーが自動設定されました');
    }
    if (provider) {
      setSetting('ai_provider', provider);
    }

    renderAll();
    autoSave();
    showToast('📝 テンプレートを読み込みました');

    // Clean URL without reloading
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  }

  function showTemplateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'settings-modal';

    const currentQ = inputQTop.value.trim();
    const currentK = inputK.value.trim();

    modal.innerHTML = `
      <h3 class="modal-title">📝 テンプレートURL生成</h3>
      <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:16px;">問いとキーワードを入力すると、生徒に配布できるURLが生成されます。</p>

      <label class="settings-label">問い（Q）</label>
      <input type="text" class="settings-input" id="tmpl-question"
        placeholder="例：戦国の三英傑について説明しよう" value="${currentQ.replace(/"/g, '&quot;')}">

      <label class="settings-label">キーワード（K）<span style="font-size:12px;color:var(--color-text-muted);">カンマ区切り</span></label>
      <input type="text" class="settings-input" id="tmpl-keywords"
        placeholder="例：織田信長,豊臣秀吉,徳川家康" value="${currentK.split('\n').join(',')}">

      <label class="settings-label">📤 提出先URL（任意）</label>
      <input type="text" class="settings-input" id="tmpl-submit-url"
        placeholder="https://script.google.com/macros/s/..." value="${getSubmitUrl()}">
      <p class="settings-hint">入れると生徒の設定に自動反映されます。</p>

      <label class="settings-label">🔑 APIキー（任意）</label>
      <input type="text" class="settings-input" id="tmpl-api-key"
        placeholder="AIxxx... or sk-xxx..." value="${getApiKey()}">
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
        <label style="font-size:12px;color:var(--color-text-muted);">プロバイダー:</label>
        <select class="settings-input" id="tmpl-provider" style="flex:1;padding:4px 8px;">
          <option value="gemini" ${getProvider() === 'gemini' ? 'selected' : ''}>Gemini</option>
          <option value="openai" ${getProvider() === 'openai' ? 'selected' : ''}>OpenAI</option>
        </select>
      </div>
      <p class="settings-hint">入れると生徒がキー設定不要になります。</p>

      <hr class="settings-divider">

      <label class="settings-label">🔗 配布用URL</label>
      <textarea class="sidebar-textarea" id="tmpl-result" rows="3" readonly
        style="font-size:12px;word-break:break-all;background:rgba(0,0,0,0.3);cursor:text;"
        placeholder="上を入力するとURLが生成されます"></textarea>

      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="tmpl-close">閉じる</button>
        <button class="modal-btn modal-btn-submit" id="tmpl-generate">URL生成</button>
        <button class="modal-btn modal-btn-submit" id="tmpl-copy" style="background:var(--color-green);">📋 コピー</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    const close = () => { overlay.remove(); modal.remove(); };

    const generateUrl = () => {
      const q = modal.querySelector('#tmpl-question').value.trim();
      const k = modal.querySelector('#tmpl-keywords').value.trim();
      const submitUrl = modal.querySelector('#tmpl-submit-url').value.trim();
      const apiKey = modal.querySelector('#tmpl-api-key').value.trim();
      const provider = modal.querySelector('#tmpl-provider').value;

      if (!q) { showToast('問いを入力してください'); return; }

      const base = window.location.origin + window.location.pathname;
      const params = new URLSearchParams();
      params.set('q', q);
      if (k) params.set('k', k);
      if (submitUrl) params.set('url', submitUrl);
      if (apiKey) {
        params.set('key', apiKey);
        params.set('provider', provider);
      }

      const url = base + '?' + params.toString();
      modal.querySelector('#tmpl-result').value = url;
    };

    modal.querySelector('#tmpl-generate').addEventListener('click', generateUrl);

    modal.querySelector('#tmpl-copy').addEventListener('click', () => {
      const result = modal.querySelector('#tmpl-result').value;
      if (!result) { showToast('先にURLを生成してください'); return; }
      navigator.clipboard.writeText(result).then(() => {
        showToast('📋 URLをコピーしました！');
      }).catch(() => {
        modal.querySelector('#tmpl-result').select();
        document.execCommand('copy');
        showToast('📋 URLをコピーしました！');
      });
    });

    modal.querySelector('#tmpl-close').addEventListener('click', close);
    overlay.addEventListener('click', close);
    setTimeout(() => modal.querySelector('#tmpl-question').focus(), 100);
  }

  // ===== Event Listeners =====
  btnReset.addEventListener('click', resetAll);
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnShuffle.addEventListener('click', shuffleNotes);
  btnAdd.addEventListener('click', showAddModal);
  btnSave.addEventListener('click', saveToLocalStorage);
  btnSettings.addEventListener('click', showSettingsModal);
  btnTemplate.addEventListener('click', showTemplateModal);

  btnApplyQTop.addEventListener('click', applyQuestion);
  inputQTop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyQuestion(); }
  });

  btnApplyK.addEventListener('click', applyKeywords);
  btnClearK.addEventListener('click', () => { inputK.value = ''; showToast('クリアしました'); });

  inputS.addEventListener('input', () => { summaryText = inputS.value; autoSave(); });

  btnGenerateAnswer.addEventListener('click', generateModelAnswer);
  btnAiCorrect.addEventListener('click', correctSummary);
  btnExportCsv.addEventListener('click', exportCsv);
  btnSubmit.addEventListener('click', submitToSheets);
  btnCloseCorrection.addEventListener('click', () => { correctionPanel.style.display = 'none'; });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveToLocalStorage(); }
  });

  // ===== Initialize =====
  function init() {
    loadFromLocalStorage();
    renderAll();
    applyTeacherMode();

    // Load URL template params (overrides saved data)
    const params = new URLSearchParams(window.location.search);
    if (params.has('q') || params.has('k') || params.has('key')) {
      loadFromUrlParams();
    }

    // Auto-set submit URL from URL param
    const urlParam = params.get('url');
    if (urlParam && !getSubmitUrl()) {
      setSetting('submit_url', urlParam);
      showToast('📤 提出先URLが設定されました');
    }

    if (!getApiKey()) {
      const hint = aiAnswerPanel.querySelector('.ai-placeholder');
      if (hint) hint.textContent = '⚙️ AI機能を使うには設定からキーを入力してください。';
    }
  }

  init();

})();
