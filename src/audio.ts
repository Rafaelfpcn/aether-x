export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private volume = 0.7;
  private muted = false;
  private readonly onReady: () => void;

  constructor(onReady: () => void) {
    this.onReady = onReady;
  }

  unlock(): void {
    if (!this.context) {
      const Context = window.AudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.context.destination);
      this.engineOsc = this.context.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 70;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      filter.Q.value = 2.4;
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0.035;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      this.onReady();
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.applyGain();
  }

  setMuted(value: boolean): void {
    this.muted = value;
    this.applyGain();
  }

  isMuted(): boolean {
    return this.muted;
  }

  update(speed: number, boosting: boolean): void {
    if (!this.context || !this.engineOsc) return;
    const now = this.context.currentTime;
    const target = 58 + Math.min(1, speed / 42) * 150 + (boosting ? 70 : 0);
    this.engineOsc.frequency.setTargetAtTime(target, now, 0.08);
  }

  play(kind: 'shot' | 'hit' | 'damage' | 'warning' | 'gate' | 'explosion' | 'win' | 'fail'): void {
    this.unlock();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const sequence: Record<typeof kind, { from: number; to: number; duration: number; wave: OscillatorType; gain: number }> = {
      shot: { from: 930, to: 170, duration: 0.12, wave: 'sawtooth', gain: 0.14 },
      hit: { from: 520, to: 100, duration: 0.09, wave: 'triangle', gain: 0.18 },
      damage: { from: 180, to: 52, duration: 0.26, wave: 'sawtooth', gain: 0.24 },
      warning: { from: 280, to: 460, duration: 0.22, wave: 'square', gain: 0.08 },
      gate: { from: 640, to: 1040, duration: 0.28, wave: 'sine', gain: 0.14 },
      explosion: { from: 160, to: 38, duration: 0.38, wave: 'triangle', gain: 0.22 },
      win: { from: 520, to: 1040, duration: 0.48, wave: 'triangle', gain: 0.16 },
      fail: { from: 240, to: 70, duration: 0.45, wave: 'sawtooth', gain: 0.16 },
    };
    const note = sequence[kind];
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.from, now);
    if (note.to > 0) oscillator.frequency.exponentialRampToValueAtTime(note.to, now + note.duration);
    envelope.gain.setValueAtTime(Math.max(0.001, note.gain), now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + note.duration);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + note.duration + 0.02);
  }

  private applyGain(): void {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.04);
  }
}
