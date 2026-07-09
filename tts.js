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

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Attempt to unlock speech synthesis on mobile (iOS requires user gesture).
// This should be called synchronously inside a click/touch event handler.
function unlockSpeech() {
  if (typeof speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch (e) {
    // ignore
  }
}

// Core speak helper, returns a function to start speaking.
// Kept separate so we can call speechSynthesis.speak() synchronously.
function createUtterance(text, config, onCharBoundary, onDone, onError) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = config.speed || 1.0;
  utter.pitch = 1;
  utter.volume = 1;

  // On mobile, use the browser's default voice to avoid issues where
  // the device has no matching Chinese voice. On desktop, prefer Chinese.
  if (!isMobile()) {
    utter.lang = 'zh-CN';
    const voices = getVoicesSync();
    const zhVoice = getBestVoice(voices);
    if (zhVoice) utter.voice = zhVoice;
  }

  const textLength = text.length;
  let lastCharIndex = 0;
  let charTimer = null;

  utter.onboundary = (e) => {
    if (e.charIndex !== undefined && e.charIndex > lastCharIndex) {
      lastCharIndex = e.charIndex;
      if (onCharBoundary) onCharBoundary(lastCharIndex);
    }
  };

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
    if (onDone) onDone();
  };

  utter.onerror = (e) => {
    clearInterval(charTimer);
    if (onError) onError(e);
  };

  return utter;
}

// Speak text with speed config and character boundary callback
function speakWithConfig(text, config, onCharBoundary) {
  return new Promise((resolve, reject) => {
    if (typeof speechSynthesis === 'undefined') {
      reject(new Error('浏览器不支持语音合成'));
      return;
    }

    speechSynthesis.cancel();

    function onDone() {
      resolve();
    }

    function onError(e, fallback) {
      if (e.error === 'canceled' || e.error === 'interrupted') {
        resolve();
        return;
      }
      if (fallback) {
        reject(e);
        return;
      }
      // First attempt failed, try again with browser defaults
      try {
        const fallbackUtter = new SpeechSynthesisUtterance(text);
        fallbackUtter.rate = (config && config.speed) || 1.0;
        fallbackUtter.pitch = 1;
        fallbackUtter.volume = 1;
        fallbackUtter.onend = onDone;
        fallbackUtter.onerror = (err) => onError(err, true);
        speechSynthesis.speak(fallbackUtter);
      } catch (err) {
        reject(err);
      }
    }

    // Speak must be called synchronously (do not await first) so that
    // mobile browsers (especially iOS Safari) recognize it as part of the
    // user gesture that triggered playback.
    try {
      const utter = createUtterance(text, config || {}, onCharBoundary, onDone, (e) => onError(e, false));
      speechSynthesis.speak(utter);
    } catch (e) {
      reject(e);
    }
  });
}

function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
}
