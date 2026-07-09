// ===== TTS Engine Module =====
// Handles speech synthesis with character-level boundary callbacks

function getVoices() {
  return new Promise(resolve => {
    let voices = speechSynthesis.getVoices();
    if (voices.length) { resolve(voices); return; }
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}

// Speak text with speed config and character boundary callback
function speakWithConfig(text, config, onCharBoundary) {
  return new Promise((resolve, reject) => {
    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = config.speed || 1.0;
    utter.pitch = 1;
    utter.volume = 1;

    getVoices().then(voices => {
      // Try to find a Chinese voice
      const zhVoice = voices.find(v => v.lang.startsWith('zh') || v.lang.startsWith('cmn'));
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

      speechSynthesis.speak(utter);
    });
  });
}

function stopSpeaking() {
  speechSynthesis.cancel();
}
