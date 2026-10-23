export class SpaceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private rumble: OscillatorNode | null = null;
  private previousMach = 0;
  private lastAlarm = -10;
  private lastRcs = -10;
  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext(); this.ctx = ctx;
    const master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination); this.master = master;
    const engine = ctx.createGain(); engine.gain.value = 0; engine.connect(master); this.engine = engine;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 240;
    noise.connect(filter); filter.connect(engine); noise.start(); this.filter = filter;
    const rumble = ctx.createOscillator(); rumble.type = 'sine'; rumble.frequency.value = 36;
    const lowGain = ctx.createGain(); lowGain.gain.value = 0.3; rumble.connect(lowGain); lowGain.connect(engine); rumble.start(); this.rumble = rumble;
  }
  setMuted(muted: boolean) { if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.35, this.ctx.currentTime, 0.05); }
  update(throttle: number, mach: number, alarm: boolean, rcs: number) {
    const ctx = this.ctx; if (!ctx || !this.engine) return;
    this.engine.gain.setTargetAtTime(throttle * 0.7, ctx.currentTime, 0.08);
    this.filter?.frequency.setTargetAtTime(120 + throttle * 650, ctx.currentTime, 0.08);
    this.rumble?.frequency.setTargetAtTime(28 + throttle * 22, ctx.currentTime, 0.08);
    if (mach >= 1 && this.previousMach < 1) this.tone(65, 0.5, 'sine', 0.6);
    if (alarm && ctx.currentTime - this.lastAlarm > 2) { this.tone(880, 0.12, 'square', 0.08); this.lastAlarm = ctx.currentTime; }
    if (rcs > 0.1 && ctx.currentTime - this.lastRcs > 0.15) { this.tone(1800 + rcs * 300, 0.08, 'sawtooth', 0.025); this.lastRcs = ctx.currentTime; }
    this.previousMach = mach;
  }
  private tone(freq: number, duration: number, type: OscillatorType, volume: number) {
    const ctx = this.ctx; if (!ctx || !this.master) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(); osc.stop(ctx.currentTime + duration);
  }
  dispose() { void this.ctx?.close(); this.ctx = null; }
}