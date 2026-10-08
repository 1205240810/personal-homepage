/** Optional native action announcements. Never reads private opponent cards. */
let ownedUtterance: SpeechSynthesisUtterance | null = null;

export function pokerVoiceAvailability() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return {
      supported: false,
      ready: false,
      chinese: false,
      hasVoices: false,
      voice: undefined,
    };
  }
  const voices = window.speechSynthesis.getVoices();
  const chinese =
    voices.find((voice) => /^zh[-_]CN$/i.test(voice.lang)) ??
    voices.find((voice) => /^zh(?:-|_|$)/i.test(voice.lang));
  return {
    supported: true,
    ready: Boolean(chinese),
    chinese: Boolean(chinese),
    hasVoices: voices.length > 0,
    voice: chinese,
  };
}

export function announcePoker(text: string) {
  const available = pokerVoiceAvailability();
  if (!available.supported || !available.ready) return false;
  // SpeechSynthesis has a single global queue. Never interrupt another reader
  // when this module owns no queued announcement.
  if (
    !ownedUtterance &&
    (window.speechSynthesis.speaking || window.speechSynthesis.pending)
  )
    return false;
  stopPokerVoice();
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = available.voice!.lang;
  speech.voice = available.voice!;
  speech.rate = 1.04;
  speech.pitch = 1;
  speech.volume = 0.72;
  ownedUtterance = speech;
  const release = () => {
    if (ownedUtterance === speech) ownedUtterance = null;
  };
  speech.onend = release;
  speech.onerror = release;
  try {
    window.speechSynthesis.speak(speech);
  } catch {
    release();
    return false;
  }
  return true;
}

/** Only this table's own pending announcement; other readers never delay play. */
export function pokerVoiceBusy() {
  return ownedUtterance !== null;
}

export function stopPokerVoice() {
  if (!ownedUtterance) return;
  ownedUtterance = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window)
    window.speechSynthesis.cancel();
}
