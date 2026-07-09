// ===== UI Module =====
// Handles DOM rendering, row management, mode switching, and toast notifications

// SVG Icons
const ICONS = {
  dot: '<div class="icon-dot"></div>',
  check: '<svg class="icon-check" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#34c759" stroke-width="1.5"/><path d="M6 9l2 2 4-4" stroke="#34c759" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  speaker: '<svg class="icon-speaker" viewBox="0 0 18 18" fill="none"><path d="M4 6.5H2.5a1 1 0 00-1 1v3a1 1 0 001 1H4l4 3V3.5l-4 3z" fill="#0071e3" stroke="none"/><line x1="10" y1="5.5" x2="13" y2="5.5" stroke="#0071e3" stroke-width="1.2" stroke-linecap="round"/><line x1="11" y1="4" x2="14" y2="4" stroke="#0071e3" stroke-width="1.2" stroke-linecap="round"/><line x1="9" y1="7" x2="16" y2="7" stroke="#0071e3" stroke-width="1.2" stroke-linecap="round"/></svg>',
  rowPlay: '<svg class="row-play-icon" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M7 5.5l5 3.5-5 3.5V5.5z" fill="currentColor" stroke="none"/></svg>',
  timerRing: (remaining, total) => {
    const r = 10;
    const circ = 2 * Math.PI * r;
    const pct = total > 0 ? remaining / total : 0;
    const offset = circ * (1 - pct);
    return `<svg class="icon-timer-ring" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#e8e8ed" stroke-width="2" fill="none"/>
      <circle cx="12" cy="12" r="10" stroke="#30d158" stroke-width="2" fill="none"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
        transform="rotate(-90 12 12)" style="transition: stroke-dashoffset 1s linear"/>
      <text x="12" y="13" text-anchor="middle" font-size="9" fill="#30d158" font-weight="600">${remaining}</text>
    </svg>`;
  },
  drag: '<svg viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4" r="1.2" fill="#aeaeb2"/><circle cx="9" cy="4" r="1.2" fill="#aeaeb2"/><circle cx="5" cy="7" r="1.2" fill="#aeaeb2"/><circle cx="9" cy="7" r="1.2" fill="#aeaeb2"/><circle cx="5" cy="10" r="1.2" fill="#aeaeb2"/><circle cx="9" cy="10" r="1.2" fill="#aeaeb2"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a6 6 0 106 6 6.5 6.5 0 01-6-6z"/></svg>',
  sun: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M2.2 2.2l1.4 1.4M12.4 12.4l1.4 1.4M1 8h2M13 8h2M2.2 13.8l1.4-1.4M12.4 3.6l1.4-1.4"/></svg>'
};

// Toast notification
let toastTimer = null;
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// Render all rows
function renderRows(app, $rowsContainer, dragHandler, rowPlayHandler, deleteHandler, saveFn) {
  $rowsContainer.innerHTML = '';
  app.rows.forEach((row, idx) => {
    const $row = document.createElement('div');
    $row.className = 'row';
    $row.dataset.index = idx;

    // Drag handle
    const $drag = document.createElement('span');
    $drag.className = 'drag-handle';
    $drag.innerHTML = ICONS.drag;
    $drag.addEventListener('mousedown', (e) => dragHandler(e, idx));

    // Row play button
    const $playBtn = document.createElement('button');
    $playBtn.className = 'row-play-btn';
    $playBtn.dataset.idx = idx;
    $playBtn.title = '从此行开始播放';
    $playBtn.innerHTML = ICONS.rowPlay;
    $playBtn.addEventListener('click', () => rowPlayHandler(idx));

    // Status
    const $status = document.createElement('span');
    $status.className = 'row-status';
    updateRowStatus($status, idx, app);

    // Text
    const $text = document.createElement('div');
    $text.className = 'row-text';
    const $input = document.createElement('input');
    $input.type = 'text';
    $input.value = row.text;
    $input.placeholder = '输入文本...';
    $input.addEventListener('input', (e) => {
      row.text = e.target.value;
      if (saveFn) saveFn();
    });

    // Disable input during playback
    if (app.state !== 'idle' && app.state !== 'finished') {
      $input.disabled = true;
    }

    $text.appendChild($input);

    // Pause selector
    const $pause = document.createElement('div');
    $pause.className = 'row-pause';
    const $select = document.createElement('select');
    for (let s = 1; s <= 10; s++) {
      $select.innerHTML += `<option value="${s}" ${row.pauseSeconds === s ? 'selected' : ''}>${s}s</option>`;
    }
    $select.disabled = app.globalPause || app.smartPause;
    $select.addEventListener('change', () => {
      row.pauseSeconds = parseInt($select.value);
      if (saveFn) saveFn();
    });
    $pause.appendChild($select);

    // Actions
    const $actions = document.createElement('div');
    $actions.className = 'row-actions';
    const $delBtn = document.createElement('button');
    $delBtn.innerHTML = ICONS.close;
    $delBtn.title = '删除此行';
    $delBtn.addEventListener('click', () => deleteHandler(idx));
    $actions.appendChild($delBtn);

    $row.appendChild($drag);
    $row.appendChild($playBtn);
    $row.appendChild($status);
    $row.appendChild($text);
    $row.appendChild($pause);
    $row.appendChild($actions);
    $rowsContainer.appendChild($row);

    // Store refs for later updates
    row._statusEl = $status;
    row._selectEl = $select;
    row._inputEl = $input;
    row._rowEl = $row;
  });

  updateProgress(app);
  updateButtonStates(app);
}

// Update a single row's status icon
function updateRowStatus($status, idx, app) {
  if (app.state === 'idle') {
    $status.innerHTML = ICONS.dot;
    $status.className = 'row-status';
    return;
  }
  if (app.state === 'finished') {
    if (idx <= app.currentLine) {
      $status.innerHTML = ICONS.check;
      $status.className = 'row-status done';
    } else {
      $status.innerHTML = ICONS.dot;
      $status.className = 'row-status';
    }
    return;
  }

  if (idx < app.currentLine) {
    $status.innerHTML = ICONS.check;
    $status.className = 'row-status done';
  } else if (idx === app.currentLine) {
    if (app.state === 'speaking') {
      $status.innerHTML = ICONS.speaker;
      $status.className = 'row-status speaking';
    } else if (app.state === 'paused') {
      $status.innerHTML = ICONS.timerRing(app.countdownRemaining, app.rows[idx].pauseSeconds);
      $status.className = 'row-status paused breathe';
    }
  } else {
    $status.innerHTML = ICONS.dot;
    $status.className = 'row-status';
  }
}

// Refresh all row status icons
function refreshAllRowStatuses(app) {
  if (!app.rows.length) return;
  app.rows.forEach((row, idx) => {
    if (row._statusEl) updateRowStatus(row._statusEl, idx, app);
    if (row._rowEl) updateRowClasses(row._rowEl, idx, app);
  });
}

// Update row CSS classes based on state
function updateRowClasses($el, idx, app) {
  $el.classList.remove('speaking', 'paused', 'completed');
  if (app.state === 'idle') return;
  if (idx < app.currentLine) {
    $el.classList.add('completed');
  } else if (idx === app.currentLine) {
    if (app.state === 'speaking') $el.classList.add('speaking');
    else if (app.state === 'paused') $el.classList.add('paused');
  }
}

// Render character-level highlight for a row
function renderCharHighlight(rowEl, text, charIndex) {
  const textContainer = rowEl.querySelector('.row-text');
  if (!textContainer) return;

  // Find or create display-text span
  let display = textContainer.querySelector('.display-text');
  if (!display) {
    const input = textContainer.querySelector('input');
    display = document.createElement('span');
    display.className = 'display-text';
    if (input) input.style.display = 'none';
    textContainer.appendChild(display);
  }

  // Build highlighted spans
  let html = '';
  for (let i = 0; i < text.length; i++) {
    let cls = 'char';
    if (i < charIndex) {
      cls += ' highlighted';
    }
    if (charIndex >= text.length) {
      cls += ' all-highlighted';
    }
    html += `<span class="${cls}">${text[i]}</span>`;
  }
  display.innerHTML = html;
}

// Clear character highlight (restore input)
function clearCharHighlight(rowEl) {
  const textContainer = rowEl.querySelector('.row-text');
  if (!textContainer) return;
  const display = textContainer.querySelector('.display-text');
  if (display) display.remove();
  const input = textContainer.querySelector('input');
  if (input) input.style.display = '';
}

// Update progress bar and label
function updateProgress(app) {
  const $progressFill = document.getElementById('progressFill');
  const $progressLabel = document.getElementById('progressLabel');
  if (!$progressFill || !$progressLabel) return;

  const total = app.rows.length;
  if (total === 0) {
    $progressFill.style.width = '0%';
    $progressLabel.textContent = '0 / 0 句';
    return;
  }
  const done = Math.max(0, app.currentLine + 1);
  const pct = Math.min(100, Math.round((done / total) * 100));
  $progressFill.style.width = pct + '%';
  $progressLabel.textContent = `${done} / ${total} 句`;
}

// Update button enabled/disabled states
function updateButtonStates(app) {
  const $btnPlay = document.getElementById('btnPlay');
  const $btnPause = document.getElementById('btnPause');
  const $btnStop = document.getElementById('btnStop');
  const $btnPrev = document.getElementById('btnPrev');
  const $btnNext = document.getElementById('btnNext');

  const isPlaying = app.state === 'speaking' || app.state === 'paused';
  const hasRows = app.rows.length > 0;

  if ($btnPlay) $btnPlay.disabled = !hasRows && app.state === 'idle';
  if ($btnPause) $btnPause.disabled = !isPlaying;
  if ($btnStop) $btnStop.disabled = !isPlaying;
  if ($btnPrev) $btnPrev.disabled = !isPlaying;
  if ($btnNext) $btnNext.disabled = !isPlaying;

  // Update pause button text
  if ($btnPause) {
    if (app.state === 'paused') {
      $btnPause.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5l8 4.5-8 4.5V3.5z"/></svg>';
      $btnPause.title = '继续';
    } else {
      $btnPause.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="0.5"/><rect x="9" y="3" width="3" height="10" rx="0.5"/></svg>';
      $btnPause.title = '暂停';
    }
  }

  // Disable text editing during playback
  app.rows.forEach(row => {
    if (row._inputEl) row._inputEl.disabled = isPlaying || app.state === 'countdown';
    if (row._selectEl) row._selectEl.disabled = isPlaying || app.globalPause || app.smartPause;
  });
}

// Night mode toggle
function applyNightMode(nightMode) {
  if (nightMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  updateNightModeButton(nightMode);
}

function updateNightModeButton(nightMode) {
  const $btn = document.getElementById('btnNightMode');
  if (!$btn) return;
  if (nightMode) {
    $btn.innerHTML = ICONS.sun + ' 日间';
    $btn.title = '切换到日间模式';
  } else {
    $btn.innerHTML = ICONS.moon + ' 夜间';
    $btn.title = '切换到夜间模式';
  }
}

// Show pre-playback countdown overlay
function showCountdownOverlay(seconds, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'countdown-overlay';
  overlay.id = 'countdownOverlay';
  document.body.appendChild(overlay);

  let remaining = seconds;
  const showNumber = () => {
    if (remaining <= 0) {
      overlay.remove();
      if (onDone) onDone();
      return;
    }
    overlay.innerHTML = `<div class="countdown-number">${remaining}</div>`;
    remaining--;
    setTimeout(showNumber, 1000);
  };
  showNumber();

  return () => {
    overlay.remove();
  };
}

// Show export progress
function showExportProgress(current, total) {
  let el = document.getElementById('exportProgress');
  if (!el) {
    el = document.createElement('div');
    el.id = 'exportProgress';
    el.className = 'export-progress';
    el.innerHTML = `
      <div class="export-progress-text"></div>
      <div class="export-progress-bar">
        <div class="export-progress-fill" style="width:0%"></div>
      </div>
    `;
    document.body.appendChild(el);
  }
  el.classList.add('show');
  const text = el.querySelector('.export-progress-text');
  const fill = el.querySelector('.export-progress-fill');
  if (text) text.textContent = `正在合成 第 ${current} / 共 ${total} 句`;
  if (fill) fill.style.width = `${(current / total) * 100}%`;
}

function hideExportProgress() {
  const el = document.getElementById('exportProgress');
  if (el) el.classList.remove('show');
}
