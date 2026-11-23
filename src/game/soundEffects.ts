class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    volume = 0.08,
    endFreq?: number,
    delay = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  public move() {
    this.playTone(260, 0.04, 'triangle', 0.045, 220);
  }

  public rotate() {
    this.playTone(420, 0.06, 'sine', 0.06, 560);
  }

  public hold() {
    this.playTone(340, 0.07, 'triangle', 0.06, 480);
  }

  public softDrop() {
    this.playTone(180, 0.03, 'triangle', 0.03, 150);
  }

  public hardDrop() {
    this.playTone(150, 0.09, 'square', 0.065, 65);
  }

  public lock() {
    this.playTone(190, 0.055, 'triangle', 0.05, 110);
  }

  public clearLines(count: number) {
    if (count >= 4) {
      // Celebratory 4-note Tetris arpeggio
      this.playTone(523.25, 0.1, 'triangle', 0.09, undefined, 0);
      this.playTone(659.25, 0.1, 'triangle', 0.09, undefined, 0.06);
      this.playTone(783.99, 0.1, 'triangle', 0.09, undefined, 0.12);
      this.playTone(1046.5, 0.22, 'triangle', 0.11, undefined, 0.18);
    } else {
      const base = 440 + count * 80;
      this.playTone(base, 0.09, 'triangle', 0.08, base * 1.25, 0);
      this.playTone(base * 1.25, 0.12, 'triangle', 0.07, base * 1.5, 0.06);
    }
  }

  public levelUp() {
    this.playTone(440, 0.08, 'sine', 0.07, undefined, 0);
    this.playTone(554.37, 0.08, 'sine', 0.07, undefined, 0.07);
    this.playTone(659.25, 0.16, 'sine', 0.09, undefined, 0.14);
  }

  public gameOver() {
    this.playTone(320, 0.16, 'sawtooth', 0.06, 240, 0);
    this.playTone(240, 0.16, 'sawtooth', 0.06, 180, 0.15);
    this.playTone(180, 0.28, 'sawtooth', 0.06, 95, 0.3);
  }
}

export const soundEngine = new SoundEngine();
