export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

const PENTATONIC_RATIOS = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5];

const SEASON_BGM_NOTES: Record<SeasonId, number[]> = {
  // Spring: warm F major pentatonic
  spring: [349.23, 392.0, 440.0, 523.25, 587.33, 523.25, 440.0, 392.0],
  // Summer: serene G major / night sky pentatonic
  summer: [392.0, 440.0, 493.88, 587.33, 659.25, 587.33, 493.88, 440.0],
  // Autumn: nostalgic D minor pentatonic
  autumn: [293.66, 349.23, 392.0, 440.0, 523.25, 440.0, 392.0, 349.23],
  // Winter: crystalline C major celesta
  winter: [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33],
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxMuted = false;
  private bgmEnabled = true;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private currentSeason: SeasonId = 'spring';
  private isPlayingState = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.sfxMuted = muted;
  }

  public isMuted(): boolean {
    return this.sfxMuted;
  }

  public setBgmEnabled(enabled: boolean) {
    this.bgmEnabled = enabled;
    if (!enabled) {
      this.stopBgmLoop();
    } else if (this.isPlayingState) {
      this.startBgmLoop();
    }
  }

  public isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  public setSeason(season: SeasonId) {
    this.currentSeason = season;
  }

  public setGameActive(active: boolean) {
    this.isPlayingState = active;
    if (active && this.bgmEnabled) {
      this.startBgmLoop();
    } else {
      this.stopBgmLoop();
    }
  }

  private startBgmLoop() {
    if (this.bgmTimer !== null || !this.bgmEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const tickNote = () => {
      if (!this.bgmEnabled || !this.isPlayingState) return;
      const audioCtx = this.ensureContext();
      if (!audioCtx) return;

      const scale = SEASON_BGM_NOTES[this.currentSeason];
      // Subtle melodic variation across 16 steps
      const pattern = [0, 2, 3, 4, 2, 5, 4, 1, 0, 3, 4, 6, 4, 3, 2, 1];
      const idx = pattern[this.bgmStep % pattern.length] % scale.length;
      const freq = scale[idx];
      const isDownbeat = this.bgmStep % 4 === 0;

      this.playToneOnCtx(
        audioCtx,
        freq,
        0.55,
        'sine',
        isDownbeat ? 0.032 : 0.022,
        freq * 0.998,
        0
      );

      if (isDownbeat) {
        // Gentle warm bass root octave below
        this.playToneOnCtx(
          audioCtx,
          scale[0] * 0.5,
          0.95,
          'triangle',
          0.025,
          undefined,
          0
        );
      }

      this.bgmStep += 1;
    };

    tickNote();
    this.bgmTimer = window.setInterval(tickNote, 480);
  }

  private stopBgmLoop() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private playToneOnCtx(
    ctx: AudioContext,
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    volume = 0.08,
    endFreq?: number,
    delay = 0
  ) {
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    volume = 0.08,
    endFreq?: number,
    delay = 0
  ) {
    if (this.sfxMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playToneOnCtx(ctx, freq, duration, type, volume, endFreq, delay);
  }

  private playNoiseBurst(duration: number, filterFreq: number, volume = 0.05) {
    if (this.sfxMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start();
  }

  public move() {
    this.playTone(280, 0.036, 'triangle', 0.04, 230);
    this.playNoiseBurst(0.02, 1600, 0.02);
  }

  public rotate() {
    this.playTone(440, 0.055, 'sine', 0.055, 587);
    this.playTone(660, 0.05, 'triangle', 0.03, 784, 0.012);
  }

  public hold() {
    this.playTone(349.23, 0.06, 'triangle', 0.055, 440, 0);
    this.playTone(523.25, 0.08, 'sine', 0.05, 587.33, 0.045);
  }

  public softDrop() {
    this.playTone(175, 0.028, 'triangle', 0.032, 145);
  }

  public hardDrop() {
    this.playTone(165, 0.1, 'triangle', 0.11, 52);
    this.playTone(95, 0.12, 'sine', 0.12, 42);
    this.playNoiseBurst(0.075, 950, 0.065);
  }

  public lock() {
    this.playTone(195, 0.055, 'triangle', 0.055, 115);
    this.playNoiseBurst(0.03, 600, 0.025);
  }

  public clearLines(count: number, combo = 0, isTSpin = false) {
    const comboMult = PENTATONIC_RATIOS[Math.min(combo, PENTATONIC_RATIOS.length - 1)];

    if (count >= 4 || isTSpin) {
      const root = 440 * Math.min(1.4, comboMult);
      this.playTone(root, 0.12, 'triangle', 0.09, undefined, 0);
      this.playTone(root * 1.25, 0.12, 'triangle', 0.09, undefined, 0.055);
      this.playTone(root * 1.5, 0.14, 'triangle', 0.09, undefined, 0.11);
      this.playTone(root * 2, 0.28, 'sine', 0.11, root * 2.01, 0.165);
      this.playNoiseBurst(0.14, 3200, 0.035);
    } else {
      const base = (392 + count * 65) * Math.min(1.5, comboMult);
      this.playTone(base, 0.1, 'triangle', 0.085, base * 1.12, 0);
      this.playTone(base * 1.25, 0.14, 'sine', 0.08, base * 1.5, 0.055);
      this.playNoiseBurst(0.08, 2200, 0.025);
    }
  }

  public levelUp() {
    this.playTone(523.25, 0.09, 'triangle', 0.08, undefined, 0);
    this.playTone(659.25, 0.09, 'triangle', 0.08, undefined, 0.07);
    this.playTone(783.99, 0.09, 'triangle', 0.08, undefined, 0.14);
    this.playTone(1046.5, 0.24, 'sine', 0.095, undefined, 0.21);
  }

  public gameStart() {
    this.playTone(392.0, 0.08, 'triangle', 0.07, undefined, 0);
    this.playTone(493.88, 0.08, 'triangle', 0.07, undefined, 0.06);
    this.playTone(587.33, 0.14, 'sine', 0.08, undefined, 0.12);
  }

  public pause() {
    this.playTone(440, 0.07, 'sine', 0.06, 330, 0);
    this.playTone(330, 0.11, 'sine', 0.05, 260, 0.06);
  }

  public resume() {
    this.playTone(330, 0.07, 'sine', 0.05, 440, 0);
    this.playTone(440, 0.11, 'sine', 0.06, 523.25, 0.06);
  }

  public seasonChange(season: SeasonId) {
    const notes = SEASON_BGM_NOTES[season];
    this.playTone(notes[0] * 1.5, 0.28, 'sine', 0.04, undefined, 0);
    this.playTone(notes[2] * 1.5, 0.32, 'sine', 0.035, undefined, 0.09);
    this.playTone(notes[4] * 1.5, 0.42, 'sine', 0.03, undefined, 0.18);
  }

  public gameOver() {
    this.playTone(349.23, 0.16, 'sawtooth', 0.055, 261.63, 0);
    this.playTone(261.63, 0.18, 'sawtooth', 0.055, 196.0, 0.15);
    this.playTone(196.0, 0.34, 'triangle', 0.075, 110.0, 0.31);
  }
}

export const soundEngine = new SoundEngine();
