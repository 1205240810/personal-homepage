/** Original, self-contained Web Audio score. No fetched files, samples or shared contexts. */
export type AudioTheme = 'sudoku' | 'yahtzee' | 'stud';
export type AudioEvent = 'tap' | 'success' | 'error' | 'roll' | 'card' | 'win';
export interface GameAudio {
  /** Call only from a click/key gesture. False means audio is unavailable/blocked. */
  start(): Promise<boolean>;
  setMusicEnabled(enabled: boolean): void;
  setMusicVolume(volume: number): void;
  setSfxEnabled(enabled: boolean): void;
  setSfxVolume(volume: number): void;
  play(event: AudioEvent): void;
  pause(): void;
  resume(): Promise<boolean>;
  suspend(): void;
  dispose(): void;
}
interface Score { bpm: number; chords: number[][]; bass: number[]; melody: (number | null)[][] }
const R = null;
/** Sixteen composed 4/4 bars; MIDI notes are inspectable, with deliberate breathing room. */
export const AUDIO_SCORES: Record<AudioTheme, Score> = {
  sudoku: {
    bpm: 76,
    chords: [[60,64,67],[57,60,64],[53,57,60],[55,59,62],[60,64,67],[57,60,64],[53,57,60],[55,59,62],
      [57,60,64],[53,57,60],[60,64,67],[55,59,62],[53,57,60],[55,59,62],[60,64,67],[60,64,67]],
    bass: [36,33,41,43,36,33,41,43,33,41,36,43,41,43,36,36],
    melody: [[64,R,67,69],[67,64,R,60],[65,R,64,60],[62,R,59,R],[64,67,R,72],[71,69,64,R],[65,64,60,R],[62,67,R,R],
      [69,R,67,64],[65,69,R,67],[64,R,62,60],[62,59,R,67],[65,R,64,60],[62,64,67,R],[64,R,60,R],[67,R,R,R]],
  },
  yahtzee: {
    bpm: 88,
    chords: [[62,66,69],[59,62,66],[55,59,62],[57,61,64],[62,66,69],[59,62,66],[55,59,62],[57,61,64],
      [55,59,62],[62,66,69],[59,62,66],[57,61,64],[55,59,62],[57,61,64],[62,66,69],[62,66,69]],
    bass: [38,35,43,45,38,35,43,45,43,38,35,45,43,45,38,38],
    melody: [[66,69,R,66],[62,R,66,69],[67,66,62,R],[64,R,61,64],[66,R,69,73],[71,69,R,66],[67,71,69,R],[64,61,R,R],
      [67,R,71,69],[66,62,R,66],[69,66,62,R],[64,R,69,R],[67,66,62,R],[64,66,69,R],[66,69,62,R],[66,R,R,R]],
  },
  stud: {
    bpm: 72,
    chords: [[57,60,64,67],[53,57,60,64],[50,53,57,60],[52,56,59,62],[57,60,64,67],[53,57,60,64],[50,53,57,60],[52,56,59,62],
      [53,57,60,64],[55,59,62,65],[57,60,64,67],[52,56,59,62],[50,53,57,60],[52,56,59,62],[57,60,64,67],[57,60,64,67]],
    bass: [33,41,38,40,33,41,38,40,41,43,33,40,38,40,33,33],
    melody: [[64,R,60,59],[60,R,57,R],[62,R,60,57],[59,56,R,R],[64,67,64,R],[60,R,64,60],[62,60,57,R],[59,R,56,R],
      [60,64,R,65],[62,R,59,R],[60,R,64,67],[64,59,R,56],[57,R,62,60],[59,56,59,R],[60,R,57,R],[64,R,R,R]],
  },
};
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
type Voice = { osc: OscillatorNode; gain: GainNode; kind: 'music' | 'sfx' };

export function createAudio(theme: AudioTheme): GameAudio {
  const score = AUDIO_SCORES[theme] || AUDIO_SCORES.sudoku;
  let context: AudioContext | null = null;
  let musicBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let enabledMusic = false, enabledSfx = false, authorized = false, paused = false, disposed = false;
  let musicVolume = 0.28, sfxVolume = 0.35;
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextBeat = 0, beat = 0;
  const voices = new Set<Voice>();
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const active = () => !disposed && authorized && !paused && visible() && context?.state === 'running';

  function ramp(bus: GainNode | null, value: number) {
    if (!context || !bus) return;
    try {
      const now = context.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(value, now + 0.045);
    } catch { /* Device loss should never interrupt a game. */ }
  }
  function clearTimer() { if (timer !== null) clearInterval(timer); timer = null; }
  function stopVoices(kind?: Voice['kind']) {
    if (!context) return;
    for (const voice of voices) {
      if (kind && voice.kind !== kind) continue;
      try {
        const now = context.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.012);
        voice.osc.stop(now + 0.065);
      } catch { /* It may have ended already. */ }
    }
  }
  function tone(note: number, at: number, duration: number, amplitude: number, kind: Voice['kind'], waveform: OscillatorType = 'sine') {
    if (!context || disposed || voices.size >= 96) return;
    let osc: OscillatorNode | null = null, gain: GainNode | null = null, voice: Voice | null = null;
    try {
      osc = context.createOscillator(); gain = context.createGain();
      osc.type = waveform; osc.frequency.value = hz(note);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(amplitude, at + Math.min(0.11, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain); gain.connect(kind === 'music' ? musicBus! : sfxBus!);
      voice = { osc, gain, kind }; voices.add(voice);
      const playingVoice = voice;
      osc.onended = () => { try { playingVoice.osc.disconnect(); playingVoice.gain.disconnect(); } catch { /* Device loss remains silent. */ } finally { voices.delete(playingVoice); } };
      osc.start(at); osc.stop(at + duration + 0.02);
    } catch {
      if (voice) voices.delete(voice);
      try { osc?.disconnect(); gain?.disconnect(); } catch { /* Silent fallback. */ }
    }
  }
  function tick() {
    if (!active() || !enabledMusic || !context) { clearTimer(); return; }
    const seconds = 60 / score.bpm;
    // Rebase after throttling instead of replaying a backlog of missed notes.
    if (nextBeat < context.currentTime - 0.15) nextBeat = context.currentTime + 0.04;
    let scheduled = 0;
    while (nextBeat < context.currentTime + 0.18 && scheduled++ < 4) {
      const bar = Math.floor(beat / 4) % 16, position = beat % 4;
      if (position === 0) {
        // Stud's seventh voicings and quiet triangle partials soften the lounge color.
        for (const note of score.chords[bar]) tone(note, nextBeat, seconds * 3.85, theme === 'stud' ? 0.026 : 0.036, 'music', theme === 'stud' ? 'triangle' : 'sine');
        tone(score.bass[bar], nextBeat, seconds * 2.7, 0.075, 'music');
      }
      const note = score.melody[bar][position];
      if (note !== null) {
        tone(note, nextBeat, seconds * 1.45, theme === 'stud' ? 0.077 : 0.095, 'music');
        // Quiet octave partial supplies a softened bell color without sharp attacks.
        tone(note + 12, nextBeat, seconds * 0.75, 0.007, 'music');
      }
      nextBeat += seconds; beat = (beat + 1) % 64;
    }
  }
  function sync() {
    ramp(musicBus, active() && enabledMusic ? musicVolume : 0);
    ramp(sfxBus, active() && enabledSfx ? sfxVolume : 0);
    if (active() && enabledMusic && timer === null && context) {
      nextBeat = context.currentTime + 0.05;
      timer = setInterval(tick, 50); tick();
    } else if (!active() || !enabledMusic) clearTimer();
  }
  async function resume(): Promise<boolean> {
    if (disposed || !authorized || !context) return false;
    paused = false;
    if (!visible()) return false;
    try { await context.resume(); if (disposed) return false; sync(); return context.state === 'running'; }
    catch { return false; }
  }
  function pause() {
    if (disposed) return;
    paused = true; clearTimer(); stopVoices(); sync();
    if (context) void context.suspend().catch(() => {});
  }
  function visibilityChange() {
    if (disposed || !context) return;
    if (!visible()) {
      clearTimer(); stopVoices();
      void context.suspend().catch(() => {});
    } else if (authorized && !paused && (enabledMusic || enabledSfx)) {
      void resume();
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityChange);
  return {
    async start() {
      if (disposed) return false;
      try {
        if (!context) {
          const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
          const Constructor = scope.AudioContext || scope.webkitAudioContext;
          if (!Constructor) return false;
          context = new Constructor();
          musicBus = context.createGain(); sfxBus = context.createGain();
          musicBus.gain.value = 0; sfxBus.gain.value = 0;
          musicBus.connect(context.destination); sfxBus.connect(context.destination);
        }
        authorized = true;
        return await resume();
      } catch { return false; }
    },
    setMusicEnabled(value) { if (disposed) return; enabledMusic = !!value; if (!value) stopVoices('music'); sync(); },
    setMusicVolume(value) { musicVolume = clamp(value); if (!disposed) sync(); },
    setSfxEnabled(value) { if (disposed) return; enabledSfx = !!value; if (!value) stopVoices('sfx'); sync(); },
    setSfxVolume(value) { sfxVolume = clamp(value); if (!disposed) sync(); },
    play(event) {
      if (!active() || !enabledSfx || !context) return;
      const at = context.currentTime + 0.008;
      const phrases: Record<AudioEvent, number[]> = { tap: [60], card: [55,62], roll: [55,62,59,64], success: [60,64,67], error: [55,53], win: [60,64,67,72,67] };
      const notes = phrases[event]; if (!notes) return;
      notes.forEach((note, i) => tone(note, at + i * 0.085, event === 'win' ? 0.55 : 0.22, 0.14 / Math.sqrt(notes.length), 'sfx'));
    },
    pause, resume, suspend: pause,
    dispose() {
      if (disposed) return;
      disposed = true; clearTimer();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityChange);
      for (const voice of voices) {
        try { voice.osc.onended = null; voice.osc.stop(); voice.osc.disconnect(); voice.gain.disconnect(); } catch { /* Already gone. */ }
      }
      voices.clear();
      try { musicBus?.disconnect(); sfxBus?.disconnect(); } catch { /* Already gone. */ }
      if (context) void context.close().catch(() => {});
      context = null; musicBus = null; sfxBus = null;
    },
  };
}
