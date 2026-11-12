export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;

    // SFX audio instances
    this.sounds = {
      flyBuzz: new Audio('./sfx/fly_buzz.wav'),
      zap: new Audio('./sfx/zap.wav'),
      alarm: new Audio('./sfx/alarm.wav'),
      inject: new Audio('./sfx/inject.wav'),
      click: new Audio('./sfx/click.wav'),
      walkStep: new Audio('./sfx/walk_step.wav'),
      uplink: new Audio('./sfx/uplink.wav')
    };

    this.sounds.flyBuzz.loop = true;
    this.sounds.flyBuzz.volume = 0;

    this.lastZapTime = 0;
    this.lastAlarmTime = 0;
    this.lastStepTime = 0;
    this.buzzing = false;

    this.masterGain = null;
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.25;
      this.masterGain.connect(this.ctx.destination);
      this.isInitialized = true;
    } catch (e) {
      console.warn("AudioContext init warning", e);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.sounds.flyBuzz) {
      if (this.isMuted) {
        this.sounds.flyBuzz.pause();
      } else if (this.buzzing) {
        this.sounds.flyBuzz.play().catch(() => {});
      }
    }
    return !this.isMuted;
  }

  playClick() {
    if (this.isMuted) return;
    this.sounds.click.cloneNode().play().catch(() => {});
  }

  playInject() {
    if (this.isMuted) return;
    this.sounds.inject.cloneNode().play().catch(() => {});
  }

  playUplink() {
    if (this.isMuted) return;
    const up = this.sounds.uplink.cloneNode();
    up.volume = 0.6;
    up.play().catch(() => {});
  }

  playZap() {
    if (this.isMuted) return;
    const now = performance.now();
    if (now - this.lastZapTime > 350) {
      this.lastZapTime = now;
      const zap = this.sounds.zap.cloneNode();
      zap.volume = 0.6;
      zap.play().catch(() => {});
    }
  }

  playAlarm() {
    if (this.isMuted) return;
    const now = performance.now();
    if (now - this.lastAlarmTime > 3000) {
      this.lastAlarmTime = now;
      const alarm = this.sounds.alarm.cloneNode();
      alarm.volume = 0.5;
      alarm.play().catch(() => {});
    }
  }

  playStepSound() {
    if (this.isMuted) return;
    const now = performance.now();
    if (now - this.lastStepTime > 180) {
      this.lastStepTime = now;
      const step = this.sounds.walkStep.cloneNode();
      step.volume = 0.2;
      step.play().catch(() => {});
    }
  }

  update(seizureIndex, spikeRate, isWalking = false) {
    if (this.isMuted || !this.isInitialized) return;

    // Fly buzzing audio volume scaled with seizure / excitation
    if (seizureIndex > 0.3) {
      if (!this.buzzing) {
        this.buzzing = true;
        this.sounds.flyBuzz.play().catch(() => {});
      }
      this.sounds.flyBuzz.volume = Math.min(1.0, (seizureIndex - 0.2) * 1.2);
    } else {
      if (this.buzzing) {
        this.sounds.flyBuzz.volume = Math.max(0, this.sounds.flyBuzz.volume - 0.05);
        if (this.sounds.flyBuzz.volume <= 0.01) {
          this.sounds.flyBuzz.pause();
          this.buzzing = false;
        }
      }
    }

    if (seizureIndex > 0.65 && Math.random() < 0.12) {
      this.playZap();
    }

    if (seizureIndex > 0.75) {
      this.playAlarm();
    }

    if (this.ctx && spikeRate > 20 && Math.random() < 0.22) {
      this.synthesizeSpikePop();
    }
  }

  synthesizeSpikePop() {
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800 + Math.random() * 1200, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.015);

      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.02);
    } catch (e) {}
  }
}
