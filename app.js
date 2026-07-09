// ===== 跟我念 - 智能提词器 =====
// Main application logic: state management, playback engine, control integration

// ===== State =====
class AppState {
  constructor() {
    this.state = 'idle';
    this.currentLine = -1;
    this.currentCharIndex = 0;
    this.rows = [];
    this.speed = 1.0;
    this.globalPause = false;
    this.globalPauseSeconds = 5;
    this.smartPause = false;
    this.preCountdown = 0;
    this.smartPauseRate = 0.3;
    this.charHighlight = true;
    this.nightMode = false;
    this.countdownInterval = null;
    this.countdownRemaining = 0;
    this.preCountdownCancel = null;
    this.title = '跟读提词器';
  }
}

const app = new AppState();

// ===== Helpers =====
function createRowData(text = '', pauseSeconds = 2) {
  return { text, pauseSeconds, id: Date.now() + Math.random() };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Pause Calculation =====
function getPauseSeconds(idx) {
  if (app.globalPause) return app.globalPauseSeconds;
  if (app.smartPause) {
    const chars = (app.rows[idx]?.text || '').replace(/\s/g, '').length;
    return Math.max(Math.round(chars * app.smartPauseRate), 1);
  }
  const row = app.rows[idx];
  return row ? row.pauseSeconds : 2;
}

function updatePauseInputs() {
  app.rows.forEach(row => {
    if (row._pauseInputEl) {
      row._pauseInputEl.disabled = app.globalPause || app.smartPause || (app.state !== 'idle' && app.state !== 'finished');
      if (app.globalPause || app.smartPause) {
        const idx = app.rows.indexOf(row);
        const calc = getPauseSeconds(idx);
        row._pauseInputEl.value = calc;
        row._pauseInputEl.setAttribute('value', calc);
        if (row._pauseInputEl.parentElement) {
          row._pauseInputEl.parentElement.dataset.pause = calc;
          const $print = row._pauseInputEl.parentElement.querySelector('.row-pause-print');
          if ($print) $print.textContent = calc;
        }
      }
    }
  });
}

// ===== Countdown =====
function startCountdown(pauseSeconds) {
  app.countdownRemaining = pauseSeconds;
  refreshAllRowStatuses(app);

  app.countdownInterval = setInterval(() => {
    app.countdownRemaining--;
    if (app.countdownRemaining <= 0) {
      clearInterval(app.countdownInterval);
      app.countdownInterval = null;
      advanceToNextLine();
    } else {
      refreshAllRowStatuses(app);
    }
  }, 1000);
}

function stopCountdown() {
  if (app.countdownInterval) {
    clearInterval(app.countdownInterval);
    app.countdownInterval = null;
    app.countdownRemaining = 0;
  }
}

// ===== Playback Engine =====
async function advanceToNextLine() {
  stopCountdown();
  stopSpeaking();

  app.currentLine++;
  app.currentCharIndex = 0;

  if (app.currentLine >= app.rows.length) {
    app.state = 'finished';
    app.currentLine = app.rows.length - 1;
    updateStatusText('跟读完成', 'finished');
    refreshAllRowStatuses(app);
    updateProgress(app);
    updateButtonStates(app);
    return;
  }

  const row = app.rows[app.currentLine];
  if (!row || !row.text.trim()) {
    await sleep(300);
    advanceToNextLine();
    return;
  }

  app.state = 'speaking';
  updateStatusText(`第 ${app.currentLine + 1} 句 - 系统领读中`, 'speaking');
  refreshAllRowStatuses(app);

  // Clear previous character highlights
  app.rows.forEach(r => {
    if (r._rowEl) clearCharHighlight(r._rowEl);
  });

  if (row._rowEl && app.charHighlight) {
    renderCharHighlight(row._rowEl, row.text, 0);
  }

  updateProgress(app);
  updateButtonStates(app);

  try {
    const ttsConfig = { speed: app.speed };

    await speakWithConfig(row.text, ttsConfig, (charIdx) => {
      app.currentCharIndex = charIdx;
      if (app.charHighlight && row._rowEl) {
        renderCharHighlight(row._rowEl, row.text, charIdx);
      }
    });
  } catch (err) {
    console.error('TTS error:', err);
    let msg = 'TTS朗读出错，请检查浏览器语音支持';
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      msg = '当前浏览器未开放语音合成（Web Speech API），请用Chrome/Safari/Edge浏览器打开，避免使用微信/QQ等内置浏览器';
    } else if (err && err.error === 'voice-unavailable') {
      msg = '无可用的中文语音，请检查系统语言或浏览器设置';
    } else if (err && err.message) {
      msg = '朗读失败: ' + err.message;
    }
    updateStatusText(msg, '');
    app.state = 'idle';
    app.currentLine = -1;
    refreshAllRowStatuses(app);
    updateButtonStates(app);
    return;
  }

  if (app.state !== 'speaking') return;

  app.state = 'paused';
  const pauseSec = getPauseSeconds(app.currentLine);
  updateStatusText(`第 ${app.currentLine + 1} 句 - 请跟读 (${pauseSec}s)`, 'paused');
  refreshAllRowStatuses(app);
  updateProgress(app);
  updateButtonStates(app);
  startCountdown(pauseSec);
}

async function startPlayback(fromLine = 0) {
  stopCountdown();
  stopSpeaking();

  if (app.preCountdown > 0 && fromLine === 0) {
    // Show countdown overlay before starting
    app.state = 'countdown';
    updateButtonStates(app);
    updateStatusText('准备开始...', 'countdown');

    app.preCountdownCancel = showCountdownOverlay(app.preCountdown, () => {
      app.state = 'idle';
      app.preCountdownCancel = null;
      beginPlayback(fromLine);
    });
    return;
  }

  beginPlayback(fromLine);
}

async function beginPlayback(fromLine) {
  app.currentLine = fromLine - 1;
  app.currentCharIndex = 0;
  updateStatusText('准备开始...', '');
  refreshAllRowStatuses(app);
  updateButtonStates(app);

  await sleep(300);
  advanceToNextLine();
}

function pausePlayback() {
  if (app.state === 'countdown') {
    if (app.preCountdownCancel) {
      app.preCountdownCancel();
      app.preCountdownCancel = null;
    }
    app.state = 'idle';
    updateStatusText('已取消', '');
    updateButtonStates(app);
    return;
  }

  if (app.state === 'speaking') {
    stopSpeaking();
    app.state = 'paused';
    updateStatusText('已暂停', '');
    refreshAllRowStatuses(app);
    updateButtonStates(app);
  } else if (app.state === 'paused') {
    stopCountdown();
    updateStatusText('已暂停', '');
    refreshAllRowStatuses(app);
  }
}

async function resumeFromPause() {
  unlockSpeech();
  stopCountdown();
  stopSpeaking();
  const row = app.rows[app.currentLine];
  if (!row || !row.text.trim()) {
    advanceToNextLine();
    return;
  }

  app.state = 'speaking';
  updateStatusText(`第 ${app.currentLine + 1} 句 - 系统领读中`, 'speaking');
  refreshAllRowStatuses(app);

  if (row._rowEl) {
    clearCharHighlight(row._rowEl);
    if (app.charHighlight) renderCharHighlight(row._rowEl, row.text, 0);
  }

  updateButtonStates(app);

  try {
    const ttsConfig = { speed: app.speed };

    await speakWithConfig(row.text, ttsConfig, (charIdx) => {
      app.currentCharIndex = charIdx;
      if (app.charHighlight && row._rowEl) {
        renderCharHighlight(row._rowEl, row.text, charIdx);
      }
    });
  } catch (err) {
    console.error('TTS error:', err);
    app.state = 'idle';
    refreshAllRowStatuses(app);
    updateButtonStates(app);
    return;
  }

  if (app.state !== 'speaking') return;
  app.state = 'paused';
  const pauseSec = getPauseSeconds(app.currentLine);
  updateStatusText(`第 ${app.currentLine + 1} 句 - 请跟读 (${pauseSec}s)`, 'paused');
  refreshAllRowStatuses(app);
  updateButtonStates(app);
  startCountdown(pauseSec);
}

function stopPlayback() {
  stopCountdown();
  stopSpeaking();
  if (app.preCountdownCancel) {
    app.preCountdownCancel();
    app.preCountdownCancel = null;
  }
  app.state = 'idle';
  app.currentLine = -1;
  app.currentCharIndex = 0;
  updateStatusText('已停止', '');

  // Clear all character highlights
  app.rows.forEach(r => {
    if (r._rowEl) clearCharHighlight(r._rowEl);
  });

  refreshAllRowStatuses(app);
  updateProgress(app);
  updateButtonStates(app);
}

function skipToNext() {
  if (app.state === 'paused' || app.state === 'speaking') {
    stopCountdown();
    stopSpeaking();
    advanceToNextLine();
  }
}

function skipToPrev() {
  if (app.state === 'idle' || app.state === 'finished') return;
  stopCountdown();
  stopSpeaking();
  if (app.currentLine > 0) {
    app.currentLine -= 2;
    if (app.currentLine < -1) app.currentLine = -1;
    advanceToNextLine();
  } else {
    app.currentLine = -1;
    advanceToNextLine();
  }
}

// ===== Status Text Helper =====
function updateStatusText(msg, className) {
  const $el = document.getElementById('statusText');
  if (!$el) return;
  $el.textContent = msg;
  $el.className = 'status-text';
  if (className) $el.classList.add(className);
}

// ===== Drag and Drop =====
let dragSrcIdx = null;

function onDragStart(e, idx) {
  dragSrcIdx = idx;
  const $row = app.rows[idx]._rowEl;
  if ($row) $row.classList.add('dragging');

  const onMove = (ev) => {
    ev.preventDefault();
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!target) return;
    const $targetRow = target.closest('.row');
    if (!$targetRow) return;
    const targetIdx = parseInt($targetRow.dataset.index);
    if (isNaN(targetIdx) || targetIdx === dragSrcIdx) return;

    const row = app.rows.splice(dragSrcIdx, 1)[0];
    app.rows.splice(targetIdx, 0, row);
    dragSrcIdx = targetIdx;
    if (app.currentLine === dragSrcIdx) app.currentLine = targetIdx;
    else if (app.currentLine === targetIdx) app.currentLine = dragSrcIdx;
    renderUI();
    saveToStorage(app);
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (app.rows[dragSrcIdx] && app.rows[dragSrcIdx]._rowEl) {
      app.rows[dragSrcIdx]._rowEl.classList.remove('dragging');
    }
    dragSrcIdx = null;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ===== Row Management =====
function deleteRow(idx) {
  app.rows.splice(idx, 1);
  if (app.currentLine >= app.rows.length) app.currentLine = app.rows.length - 1;
  if (app.state === 'idle') app.currentLine = -1;
  renderUI();
  saveToStorage(app);
}

function addRow() {
  const lastRow = app.rows[app.rows.length - 1];
  const pauseSec = lastRow ? lastRow.pauseSeconds : 3;
  app.rows.push(createRowData('', pauseSec));
  renderUI();
  saveToStorage(app);
}

function rowPlayFrom(idx) {
  unlockSpeech();
  stopCountdown();
  stopSpeaking();
  if (app.preCountdownCancel) {
    app.preCountdownCancel();
    app.preCountdownCancel = null;
  }
  app.state = 'idle';
  beginPlayback(idx);
}

function renderUI() {
  const $rowsContainer = document.getElementById('rowsContainer');
  if (!$rowsContainer) return;
  renderRows(app, $rowsContainer, onDragStart, rowPlayFrom, deleteRow, () => saveToStorage(app));
}

// ===== Import / Export =====
function handleExport() {
  const content = exportText(app.rows);
  const filename = generateFilename('跟读文稿');
  downloadFile(content, filename);
  showToast('文稿已导出');
}

// Import modal state
let importFileContent = null;

function handleImport() {
  importFileContent = null;
  const modal = document.getElementById('importModal');
  if (!modal) return;
  modal.style.display = 'flex';
  // Reset to paste tab
  switchImportTab('paste');
  document.getElementById('importTextarea').value = '';
}

function handleImportClose() {
  const modal = document.getElementById('importModal');
  if (!modal) return;
  modal.style.display = 'none';
  importFileContent = null;
}

function switchImportTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  // Update panels
  document.querySelectorAll('.modal-panel').forEach(panel => {
    panel.style.display = panel.dataset.panel === tabName ? '' : 'none';
  });
}

function handleImportPaste() {
  const textarea = document.getElementById('importTextarea');
  const content = textarea.value;
  if (!content.trim()) {
    showToast('请输入文本内容');
    return;
  }
  const rows = importText(content);
  if (!rows) {
    showToast('文本内容无效');
    return;
  }
  app.rows = rows;
  app.currentLine = -1;
  app.state = 'idle';
  renderUI();
  saveToStorage(app);
  showToast(`已导入 ${rows.length} 行文本`);
  handleImportClose();
}

function handleImportFile() {
  if (!importFileContent) {
    showToast('请先选择文件');
    return;
  }
  const rows = importText(importFileContent);
  if (!rows) {
    showToast('文件内容为空或格式无效');
    return;
  }
  app.rows = rows;
  app.currentLine = -1;
  app.state = 'idle';
  renderUI();
  saveToStorage(app);
  showToast(`已导入 ${rows.length} 行文本`);
  handleImportClose();
}

// ===== Print =====
function handlePrint() {
  window.print();
}

// ===== Smart Pause / Global Pause mutual exclusion =====
function handleGlobalPauseToggle(checked) {
  app.globalPause = checked;
  if (checked && app.smartPause) {
    app.smartPause = false;
    document.getElementById('smartPauseToggle').checked = false;
  }
  document.getElementById('globalPauseSeconds').disabled = !app.globalPause;
  updatePauseInputs();
  saveToStorage(app);
}

function handleSmartPauseToggle(checked) {
  app.smartPause = checked;
  if (checked && app.globalPause) {
    app.globalPause = false;
    document.getElementById('globalPauseToggle').checked = false;
    document.getElementById('globalPauseSeconds').disabled = true;
  }
  updatePauseInputs();
  saveToStorage(app);
}

// ===== Night Mode =====
function handleNightModeToggle() {
  app.nightMode = !app.nightMode;
  applyNightMode(app.nightMode);
  saveToStorage(app);
}

// ===== Event Bindings =====
function bindEvents() {
  document.getElementById('addRowBtn').addEventListener('click', addRow);

  document.getElementById('btnPause').addEventListener('click', () => {
    unlockSpeech();
    if (app.state === 'idle' || app.state === 'finished') {
      startPlayback(0);
    } else if (app.state === 'paused') {
      stopCountdown();
      resumeFromPause();
    } else {
      pausePlayback();
    }
  });
  document.getElementById('btnStop').addEventListener('click', stopPlayback);
  document.getElementById('btnPrev').addEventListener('click', skipToPrev);
  document.getElementById('btnNext').addEventListener('click', skipToNext);

  document.getElementById('speedRange').addEventListener('input', (e) => {
    app.speed = parseFloat(e.target.value);
    document.getElementById('speedLabel').textContent = app.speed.toFixed(1) + 'x';
    saveToStorage(app);
  });

  document.getElementById('globalPauseToggle').addEventListener('change', (e) => {
    handleGlobalPauseToggle(e.target.checked);
  });

  document.getElementById('smartPauseToggle').addEventListener('change', (e) => {
    handleSmartPauseToggle(e.target.checked);
  });

  document.getElementById('smartPauseRateInput').addEventListener('input', (e) => {
    let v = parseFloat(e.target.value);
    if (isNaN(v) || v < 0.1) v = 0.1;
    if (v > 0.6) v = 0.6;
    e.target.value = v.toFixed(1);
    app.smartPauseRate = v;
    saveToStorage(app);
  });

  document.getElementById('globalPauseSeconds').addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    if (isNaN(v) || v < 0) return;
    app.globalPauseSeconds = v;
    saveToStorage(app);
  });

  document.getElementById('preCountdownInput').addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    if (isNaN(v) || v < 0 || v > 10) return;
    app.preCountdown = v;
    saveToStorage(app);
  });

  document.getElementById('charHighlightToggle').addEventListener('change', (e) => {
    app.charHighlight = e.target.checked;
    saveToStorage(app);
  });

  document.getElementById('btnNightMode').addEventListener('click', handleNightModeToggle);

  // Editable title
  const $title = document.getElementById('appTitle');
  if ($title) {
    $title.addEventListener('input', () => {
      app.title = $title.textContent.trim() || '跟读提词器';
      saveToStorage(app);
    });
    $title.addEventListener('blur', () => {
      app.title = $title.textContent.trim() || '跟读提词器';
      $title.textContent = app.title;
      saveToStorage(app);
    });
    $title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $title.blur();
      }
    });
  }

  document.getElementById('btnExport').addEventListener('click', handleExport);
  document.getElementById('btnImport').addEventListener('click', handleImport);
  document.getElementById('btnPrint').addEventListener('click', handlePrint);
  document.getElementById('btnReset').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });

  // Import modal events
  document.getElementById('btnImportModalClose').addEventListener('click', handleImportClose);
  document.getElementById('btnImportPaste').addEventListener('click', handleImportPaste);
  document.getElementById('btnImportFile').addEventListener('click', handleImportFile);

  // Modal tab switching
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => switchImportTab(tab.dataset.tab));
  });

  // File upload area events
  const fileUploadArea = document.getElementById('fileUploadArea');
  const importFileInput = document.getElementById('importFileInput');
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      importFileContent = ev.target.result;
      fileUploadArea.querySelector('p').textContent = `已选择: ${file.name}`;
    };
    reader.readAsText(file);
  });
  // Drag & drop for file upload
  fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.style.borderColor = 'var(--accent)';
  });
  fileUploadArea.addEventListener('dragleave', () => {
    fileUploadArea.style.borderColor = 'var(--border)';
  });
  fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.style.borderColor = 'var(--border)';
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.endsWith('.txt')) {
      showToast('仅支持 .txt 文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      importFileContent = ev.target.result;
      fileUploadArea.querySelector('p').textContent = `已选择: ${file.name}`;
    };
    reader.readAsText(file);
  });

  // Close modal on overlay click
  document.getElementById('importModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) handleImportClose();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (app.state === 'countdown' && app.preCountdownCancel) {
        app.preCountdownCancel();
        app.preCountdownCancel = null;
        app.state = 'idle';
        updateStatusText('已取消', '');
        updateButtonStates(app);
        return;
      }
      stopPlayback();
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (app.state === 'idle' || app.state === 'finished') {
          startPlayback(0);
        } else if (app.state === 'paused') {
          stopCountdown();
          resumeFromPause();
        } else {
          pausePlayback();
        }
        break;
      case 'ArrowRight':
        if (app.state === 'paused') skipToNext();
        break;
      case 'ArrowLeft':
        if (app.state === 'paused') skipToPrev();
        break;
    }
  });
}

// ===== Init =====
function init() {
  const stored = loadFromStorage();
  if (stored.rows && stored.rows.length) {
    app.rows = stored.rows;
  } else {
    app.rows = [
      createRowData('', 2),
      createRowData('', 2),
      createRowData('', 2),
      createRowData('', 2),
    ];
  }

  if (stored.speed !== undefined) app.speed = stored.speed;
  if (stored.globalPause !== undefined) app.globalPause = stored.globalPause;
  if (stored.globalPauseSeconds !== undefined) app.globalPauseSeconds = stored.globalPauseSeconds;
  if (stored.smartPause !== undefined) app.smartPause = stored.smartPause;
  if (stored.smartPauseRate !== undefined) app.smartPauseRate = stored.smartPauseRate;
  if (stored.preCountdown !== undefined) app.preCountdown = stored.preCountdown;
  if (stored.charHighlight !== undefined) app.charHighlight = stored.charHighlight;
  if (stored.nightMode !== undefined) app.nightMode = stored.nightMode;
  if (stored.title !== undefined) app.title = stored.title;

  // Apply settings to UI
  const $title = document.getElementById('appTitle');
  if ($title && app.title) {
    $title.textContent = app.title;
  }
  document.getElementById('speedRange').value = app.speed;
  document.getElementById('speedLabel').textContent = app.speed.toFixed(1) + 'x';
  document.getElementById('globalPauseToggle').checked = app.globalPause;
  document.getElementById('smartPauseToggle').checked = app.smartPause;
  document.getElementById('smartPauseRateInput').value = app.smartPauseRate.toFixed(1);
  document.getElementById('globalPauseSeconds').value = app.globalPauseSeconds;
  document.getElementById('globalPauseSeconds').disabled = !app.globalPause;
  document.getElementById('preCountdownInput').value = app.preCountdown;
  document.getElementById('charHighlightToggle').checked = app.charHighlight;

  // Apply night mode
  if (app.nightMode) {
    applyNightMode(true);
  }

  // Render
  renderUI();
  updateButtonStates(app);
  updatePauseInputs();
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  init();
});
