/** Original, deliberately quiet lounge loop. No remote audio or licensed samples.
 * AudioContext is only created by an explicit music-button gesture. */
export class HoldemLoungeMusic {
  private context: AudioContext;
  private master: GainNode;
  private noise: AudioBuffer;
  private sources = new Set<AudioScheduledSourceNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private nextTime = 0;
  private generation = 0;
  private closed = false;

  constructor() {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.22;
    const softener = this.context.createBiquadFilter();
    softener.type = 'lowpass';
    softener.frequency.value = 4000;
    this.master.connect(softener);
    softener.connect(this.context.destination);
    this.noise = this.context.createBuffer(
      1,
      this.context.sampleRate,
      this.context.sampleRate,
    );
    const noise = this.noise.getChannelData(0);
    // A deterministic noise texture keeps this composition reproducible.
    let seed = 1948;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 16807) % 2147483647;
      noise[i] = ((seed / 2147483647) * 2 - 1) * 0.55;
    }
  }

  setVolume(volume: number) {
    if (this.closed) return;
    this.master.gain.setTargetAtTime(
      Math.min(0.6, Math.max(0, volume)),
      this.context.currentTime,
      0.06,
    );
  }

  /** Unlock in the music-setting click while the modal has paused the table. */
  async unlock() {
    if (this.closed) return;
    const generation = this.generation;
    await this.context.resume();
    if (!this.closed && generation === this.generation && !this.timer)
      await this.context.suspend();
  }

  async play() {
    if (this.closed || this.timer) return;
    const generation = ++this.generation;
    await this.context.resume();
    if (this.closed || generation !== this.generation) return;
    this.nextTime = this.context.currentTime + 0.07;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 250);
  }

  pause() {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
    }
    this.sources.clear();
    if (!this.closed) void this.context.suspend().catch(() => {});
  }

  close() {
    if (this.closed) return;
    this.pause();
    this.closed = true;
    void this.context.close().catch(() => {});
  }

  private keep(source: AudioScheduledSourceNode) {
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  private note(
    midi: number,
    time: number,
    duration: number,
    strength: number,
    bass = false,
  ) {
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(
      strength,
      time + (bass ? 0.02 : 0.012),
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    envelope.connect(this.master);
    const fundamental = 440 * 2 ** ((midi - 69) / 12);
    for (const [multiple, level] of bass
      ? [
          [1, 1],
          [2, 0.11],
        ]
      : [
          [1, 1],
          [2, 0.24],
          [3, 0.055],
        ]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = fundamental * multiple;
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(envelope);
      this.keep(oscillator);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.03);
    }
  }

  private brush(time: number, accent: boolean) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = 'highpass';
    filter.frequency.value = accent ? 1600 : 4200;
    gain.gain.setValueAtTime(accent ? 0.04 : 0.011, time);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      time + (accent ? 0.2 : 0.075),
    );
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    this.keep(source);
    source.start(time, (this.tick % 7) * 0.08);
    source.stop(time + 0.22);
  }

  private schedule() {
    if (this.closed) return;
    const eighth = 60 / 78 / 2;
    const chords = [
      [62, 65, 69, 72, 76],
      [59, 64, 69, 74],
      [60, 64, 67, 71, 74],
      [61, 67, 70, 76],
    ];
    const bass = [38, 43, 36, 33];
    while (this.nextTime < this.context.currentTime + 1.1) {
      const bar = Math.floor(this.tick / 8) % 8;
      const chord = Math.floor(bar / 2);
      const beat = this.tick % 8;
      const time = this.nextTime + (beat % 2 ? eighth * 0.11 : 0);
      if (beat === 0 || beat === 3 || (beat === 6 && bar % 2 === 1)) {
        chords[chord].forEach((pitch, i) =>
          this.note(pitch, time + i * 0.011, 1.5, 0.034),
        );
      }
      if (beat === 0 || beat === 4)
        this.note(bass[chord] + (beat === 4 ? 7 : 0), time, 0.67, 0.13, true);
      this.brush(time, beat === 2 || beat === 6);
      if (bar % 2 === 1 && beat === 5)
        this.note(chords[chord].at(-1)! + 12, time, 0.8, 0.025);
      this.tick++;
      this.nextTime += eighth;
    }
  }
}
