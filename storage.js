// ===== Storage Module =====
// Handles localStorage persistence, text import/export, and file download

const STORAGE_KEYS = {
  rows: 'followme_rows',
  speed: 'followme_speed',
  globalPause: 'followme_globalPause',
  globalPauseSeconds: 'followme_globalPauseSeconds',
  smartPause: 'followme_smartPause',
  preCountdown: 'followme_preCountdown',
  charHighlight: 'followme_charHighlight',
  nightMode: 'followme_nightMode'
};

function saveToStorage(state) {
  const data = state.rows.map(r => ({ text: r.text, pauseSeconds: r.pauseSeconds }));
  localStorage.setItem(STORAGE_KEYS.rows, JSON.stringify(data));
  localStorage.setItem(STORAGE_KEYS.speed, state.speed);
  localStorage.setItem(STORAGE_KEYS.globalPause, state.globalPause);
  localStorage.setItem(STORAGE_KEYS.globalPauseSeconds, state.globalPauseSeconds);
  localStorage.setItem(STORAGE_KEYS.smartPause, state.smartPause || false);
  localStorage.setItem(STORAGE_KEYS.preCountdown, state.preCountdown || 0);
  localStorage.setItem(STORAGE_KEYS.charHighlight, state.charHighlight !== false);
  localStorage.setItem(STORAGE_KEYS.nightMode, state.nightMode || false);
}

function loadFromStorage() {
  const state = {};
  try {
    const rowsData = localStorage.getItem(STORAGE_KEYS.rows);
    if (rowsData) {
      const parsed = JSON.parse(rowsData);
      state.rows = parsed.map(d => createRowData(d.text, d.pauseSeconds));
    }
    const speed = localStorage.getItem(STORAGE_KEYS.speed);
    if (speed) state.speed = parseFloat(speed);
    const gp = localStorage.getItem(STORAGE_KEYS.globalPause);
    if (gp) state.globalPause = gp === 'true';
    const gps = localStorage.getItem(STORAGE_KEYS.globalPauseSeconds);
    if (gps) state.globalPauseSeconds = parseInt(gps);
    const sp = localStorage.getItem(STORAGE_KEYS.smartPause);
    if (sp) state.smartPause = sp === 'true';
    const pc = localStorage.getItem(STORAGE_KEYS.preCountdown);
    if (pc) state.preCountdown = parseInt(pc);
    const ch = localStorage.getItem(STORAGE_KEYS.charHighlight);
    if (ch !== null) state.charHighlight = ch === 'true';
    const nm = localStorage.getItem(STORAGE_KEYS.nightMode);
    if (nm) state.nightMode = nm === 'true';
  } catch (e) {
    // Ignore corrupt storage
  }
  return state;
}

// Export text content from all rows
function exportText(rows) {
  return rows.map(r => r.text).join('\n');
}

// Import text content and parse into rows
function importText(content) {
  if (!content || !content.trim()) {
    return null;
  }
  const lines = content.split('\n');
  if (lines.length === 0) return null;
  return lines.map(line => createRowData(line.trim(), 3));
}

// Generate filename with timestamp
function generateFilename(prefix) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${ts}.txt`;
}

// Trigger browser file download
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
