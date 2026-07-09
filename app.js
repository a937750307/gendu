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
    this.charHighlight = true;
    this.nightMode = false;
    this.countdownInterval = null;
    this.countdownRemaining = 0;
    this.preCountdownCancel = null;
  }
}

const app = new AppState();

// ===== Helpers =====
function createRowData(text = '', pauseSeconds = 3) {
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
    return Math.max(Math.round(chars * 0.3), 1);
  }
  const row = app.rows[idx];
  return row ? row.pauseSeconds : 3;
}

function updatePauseSelectors() {
  app.rows.forEach(row => {
    if (row._selectEl) {
      row._selectEl.disabled = app.globalPause || app.smartPause || (app.state !== 'idle' && app.state !== 'finished');
      if (app.smartPause) {
        // Show calculated value in disabled selector
        const idx = app.rows.indexOf(row);
        const calc = getPauseSeconds(idx);
        row._selectEl.value = Math.min(calc, 10);
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
    if (!window.speechSynthesis) {
      msg = '当前浏览器不支持语音合成，请换用 Chrome / Safari / Edge';
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
    resumeFromPause();
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

function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt';
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      const rows = importText(content);
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
    };
    reader.readAsText(file);
  });
  input.click();
}

// ===== Print =====
function handlePrint() {
  // Prepare row pause data attributes for print CSS
  app.rows.forEach((row, idx) => {
    if (row._rowEl) {
      if (row._selectEl) row._selectEl.style.display = 'none';
    }
  });

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
  updatePauseSelectors();
  saveToStorage(app);
}

function handleSmartPauseToggle(checked) {
  app.smartPause = checked;
  if (checked && app.globalPause) {
    app.globalPause = false;
    document.getElementById('globalPauseToggle').checked = false;
    document.getElementById('globalPauseSeconds').disabled = true;
  }
  updatePauseSelectors();
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

  document.getElementById('btnPlay').addEventListener('click', () => {
    unlockSpeech();
    startPlayback(0);
  });
  document.getElementById('btnPause').addEventListener('click', pausePlayback);
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

  document.getElementById('btnExport').addEventListener('click', handleExport);
  document.getElementById('btnImport').addEventListener('click', handleImport);
  document.getElementById('btnPrint').addEventListener('click', handlePrint);

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
      createRowData('', 3),
      createRowData('', 3),
      createRowData('', 3),
      createRowData('', 3),
    ];
  }

  if (stored.speed !== undefined) app.speed = stored.speed;
  if (stored.globalPause !== undefined) app.globalPause = stored.globalPause;
  if (stored.globalPauseSeconds !== undefined) app.globalPauseSeconds = stored.globalPauseSeconds;
  if (stored.smartPause !== undefined) app.smartPause = stored.smartPause;
  if (stored.preCountdown !== undefined) app.preCountdown = stored.preCountdown;
  if (stored.charHighlight !== undefined) app.charHighlight = stored.charHighlight;
  if (stored.nightMode !== undefined) app.nightMode = stored.nightMode;

  // Apply settings to UI
  document.getElementById('speedRange').value = app.speed;
  document.getElementById('speedLabel').textContent = app.speed.toFixed(1) + 'x';
  document.getElementById('globalPauseToggle').checked = app.globalPause;
  document.getElementById('smartPauseToggle').checked = app.smartPause;
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
  updatePauseSelectors();
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  init();
});
