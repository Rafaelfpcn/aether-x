export class AudioEngine {
  private scene: 'menu' | 'combat' | 'boss' | 'paused' = 'menu';
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private volume = 0.7;
  private muted = false;
  private musicTimer = 0;
  private musicStep = 0;
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
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      this.onReady();
      this.startMusic();
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

  setScene(scene: 'menu' | 'combat' | 'boss' | 'paused'): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.musicStep = 0;
    if (this.engineGain && this.context) {
      const targetGain = scene === 'combat' || scene === 'boss' ? 0.035 : 0;
      this.engineGain.gain.setTargetAtTime(targetGain, this.context.currentTime, 0.05);
    }
    if (scene === 'paused') {
      window.clearInterval(this.musicTimer);
      this.musicTimer = 0;
      return;
    }
    this.startMusic();
  }

  update(speed: number, boosting: boolean): void {
    if (!this.context || !this.engineOsc) return;
    const now = this.context.currentTime;
    const target = 58 + Math.min(1, speed / 42) * 150 + (boosting ? 70 : 0);
    this.engineOsc.frequency.setTargetAtTime(target, now, 0.08);
  }

  play(
    kind:
      | 'shot'
      | 'tracer'
      | 'reload'
      | 'crash'
      | 'shutter'
      | 'hit'
      | 'damage'
      | 'warning'
      | 'gate'
      | 'nearMiss'
      | 'explosion'
      | 'win'
      | 'fail'
      | 'purchase',
  ): void {
    this.unlock();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const sequence: Record<typeof kind, { from: number; to: number; duration: number; wave: OscillatorType; gain: number }> = {
      shot: { from: 930, to: 170, duration: 0.12, wave: 'sawtooth', gain: 0.14 },
      tracer: { from: 420, to: 85, duration: 0.065, wave: 'square', gain: 0.13 },
      reload: { from: 310, to: 680, duration: 0.16, wave: 'triangle', gain: 0.12 },
      crash: { from: 140, to: 36, duration: 0.28, wave: 'sawtooth', gain: 0.25 },
      shutter: { from: 1400, to: 880, duration: 0.07, wave: 'sine', gain: 0.14 },
      hit: { from: 520, to: 100, duration: 0.09, wave: 'triangle', gain: 0.18 },
      damage: { from: 180, to: 52, duration: 0.26, wave: 'sawtooth', gain: 0.24 },
      warning: { from: 280, to: 460, duration: 0.22, wave: 'square', gain: 0.08 },
      gate: { from: 640, to: 1040, duration: 0.28, wave: 'sine', gain: 0.14 },
      nearMiss: { from: 780, to: 1320, duration: 0.19, wave: 'triangle', gain: 0.12 },
      explosion: { from: 160, to: 38, duration: 0.38, wave: 'triangle', gain: 0.22 },
      win: { from: 520, to: 1040, duration: 0.48, wave: 'triangle', gain: 0.16 },
      fail: { from: 240, to: 70, duration: 0.45, wave: 'sawtooth', gain: 0.16 },
      purchase: { from: 560, to: 1220, duration: 0.24, wave: 'sine', gain: 0.15 },
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

  private startMusic(): void {
    if (!this.context || this.musicTimer || this.scene === 'paused') return;
    this.musicTimer = window.setInterval(() => this.playMusicBeat(), 500);
    this.playMusicBeat();
  }

  private playMusicBeat(): void {
    if (!this.context || !this.master || this.scene === 'paused') return;
    const patterns: Record<Exclude<typeof this.scene, 'paused'>, number[]> = {
      menu: [130.81, 196, 164.81, 196, 261.63, 196, 164.81, 196],
      combat: [146.83, 220, 174.61, 261.63, 146.83, 220, 196, 261.63],
      boss: [110, 164.81, 130.81, 196, 110, 164.81, 146.83, 196],
    };
    const pattern = patterns[this.scene];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(pattern[this.musicStep % pattern.length], now);
    filter.type = 'lowpass';
    filter.frequency.value = 760;
    envelope.gain.setValueAtTime(0.001, now);
    envelope.gain.linearRampToValueAtTime(this.scene === 'boss' ? 0.045 : 0.03, now + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    oscillator.connect(filter).connect(envelope).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.44);
    this.musicStep++;
  }

  private applyGain(): void {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.04);
  }
}
