// ===== TTS Engine Module =====
// Handles speech synthesis with character-level boundary callbacks

let cachedVoices = null;

if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = () => {
    cachedVoices = speechSynthesis.getVoices();
  };
}

function getVoicesSync() {
  if (cachedVoices && cachedVoices.length) return cachedVoices;
  try {
    cachedVoices = speechSynthesis.getVoices();
    return cachedVoices || [];
  } catch (e) {
    return [];
  }
}

function getBestVoice(voices) {
  return voices.find(v => v.lang.startsWith('zh') || v.lang.startsWith('cmn')) || null;
}

// Attempt to unlock speech synthesis on mobile (iOS requires user gesture).
// This should be called synchronously inside a click/touch event handler.
function unlockSpeech() {
  if (typeof speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
    speechSynthesis.cancel();
  } catch (e) {
    // ignore
  }
}

// Speak text with speed config and character boundary callback
function speakWithConfig(text, config, onCharBoundary) {
  return new Promise((resolve, reject) => {
    if (typeof speechSynthesis === 'undefined') {
      reject(new Error('浏览器不支持语音合成'));
      return;
    }

    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = config.speed || 1.0;
    utter.pitch = 1;
    utter.volume = 1;

    // Try to pick a Chinese voice synchronously (best effort on mobile)
    const voices = getVoicesSync();
    const zhVoice = getBestVoice(voices);
    if (zhVoice) utter.voice = zhVoice;

    const textLength = text.length;
    let lastCharIndex = 0;
    let charTimer = null;

    // Use onboundary for word-level tracking
    utter.onboundary = (e) => {
      if (e.charIndex !== undefined && e.charIndex > lastCharIndex) {
        lastCharIndex = e.charIndex;
        if (onCharBoundary) onCharBoundary(lastCharIndex);
      }
    };

    // Fallback: evenly distribute characters over estimated duration
    // Estimate: ~250ms per character for Chinese at rate=1
    const estDuration = (textLength * 250) / (config.speed || 1.0);
    const charInterval = Math.max(50, estDuration / textLength);

    charTimer = setInterval(() => {
      if (lastCharIndex < textLength) {
        lastCharIndex++;
        if (onCharBoundary) onCharBoundary(lastCharIndex);
      }
    }, charInterval);

    utter.onstart = () => {
      if (onCharBoundary) onCharBoundary(0);
    };

    utter.onend = () => {
      clearInterval(charTimer);
      if (onCharBoundary) onCharBoundary(textLength);
      resolve();
    };

    utter.onerror = (e) => {
      clearInterval(charTimer);
      if (e.error === 'canceled' || e.error === 'interrupted') {
        resolve();
      } else {
        reject(e);
      }
    };

    // Speak must be called synchronously (do not await first) so that
    // mobile browsers (especially iOS Safari) recognize it as part of the
    // user gesture that triggered playback.
    speechSynthesis.speak(utter);
  });
}

function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
}
