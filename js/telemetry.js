export class Telemetry {
  constructor(eegCanvasId) {
    this.canvas = document.getElementById(eegCanvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    
    // UI Elements
    this.seizureBanner = document.getElementById('seizure-banner');
    this.seizurePct = document.getElementById('seizure-pct');
    this.seizureFill = document.getElementById('seizure-fill');
    this.spikeBadge = document.getElementById('spike-rate-badge');

    this.flyMotorText = document.getElementById('fly-motor-text');
    this.meterWingHz = document.getElementById('meter-wing-hz');
    this.barWingHz = document.getElementById('bar-wing-hz');
    this.meterLegTremor = document.getElementById('meter-leg-tremor');
    this.barLegTremor = document.getElementById('bar-leg-tremor');
    this.meterEyeStrobe = document.getElementById('meter-eye-strobe');
    this.barEyeStrobe = document.getElementById('bar-eye-strobe');
    this.meterSynapseStorm = document.getElementById('meter-synapse-storm');
    this.barSynapseStorm = document.getElementById('bar-synapse-storm');
    this.meterStepCadence = document.getElementById('meter-step-cadence');
    this.barStepCadence = document.getElementById('bar-step-cadence');

    this.flyWarningFlash = document.getElementById('fly-warning-flash');
    this.riskRating = document.getElementById('risk-rating');

    // Multi-channel EEG buffers (5 channels)
    this.numChannels = 5;
    this.bufferLength = 400;
    this.channelData = Array.from({ length: this.numChannels }, () => new Float32Array(this.bufferLength));
    this.channelColors = ['#00ff88', '#00f0ff', '#ffaa00', '#ff007f', '#ff2a55'];

    this.time = 0;
    this.spikeRate = 15; // Hz

    this.setupResize();
  }

  setupResize() {
    const resize = () => {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * (window.devicePixelRatio || 1);
      this.canvas.height = rect.height * (window.devicePixelRatio || 1);
    };
    window.addEventListener('resize', resize);
    setTimeout(resize, 100);
  }

  update(dt, seizureIndex, avgLuminance, frameDelta, flyModel) {
    this.time += dt;

    // 1. Calculate Estimated Neural Spike Rate (Hz)
    const baseHz = 12 + avgLuminance * 35 + frameDelta * 120;
    const seizureHz = (seizureIndex > 0.4) ? (seizureIndex * 280) : 0;
    this.spikeRate = Math.round(baseHz + seizureHz);
    if (this.spikeBadge) this.spikeBadge.textContent = `${this.spikeRate} Hz`;

    // 2. Update Header Seizure Banner
    const seizurePctVal = Math.round(seizureIndex * 100);
    if (this.seizurePct) this.seizurePct.textContent = `${seizurePctVal}%`;
    if (this.seizureFill) this.seizureFill.style.width = `${seizurePctVal}%`;

    if (this.seizureBanner) {
      if (seizureIndex > 0.6) {
        this.seizureBanner.className = 'seizure-banner state-critical';
        this.seizureBanner.querySelector('.seizure-title').textContent = '⚠️ CRITICAL: GENERALIZED EPILEPTIFORM CONVULSION';
      } else if (seizureIndex > 0.3) {
        this.seizureBanner.className = 'seizure-banner state-warning';
        this.seizureBanner.querySelector('.seizure-title').textContent = 'WARNING: HYPER-SYNCHRONOUS BURST DETECTED';
      } else {
        this.seizureBanner.className = 'seizure-banner state-normal';
        this.seizureBanner.querySelector('.seizure-title').textContent = 'STATUS: STEADY SYNAPTIC EQUILIBRIUM';
      }
    }

    // 3. Update Drosophila Reaction & Locomotion Meters
    const wingHzVal = Math.round((0.2 + seizureIndex * 1.8) * (seizureIndex > 0.25 ? 190 : 8));
    if (this.meterWingHz) this.meterWingHz.textContent = `${wingHzVal}`;
    if (this.barWingHz) this.barWingHz.style.width = `${Math.min(100, (wingHzVal / 220) * 100)}%`;

    const legTremorPct = Math.round(seizureIndex * 100);
    if (this.meterLegTremor) this.meterLegTremor.textContent = `${legTremorPct}%`;
    if (this.barLegTremor) this.barLegTremor.style.width = `${legTremorPct}%`;

    const eyeStrobePct = Math.round(Math.min(1.0, frameDelta * 3.5 + seizureIndex * 0.5) * 100);
    if (this.meterEyeStrobe) this.meterEyeStrobe.textContent = `${eyeStrobePct}%`;
    if (this.barEyeStrobe) this.barEyeStrobe.style.width = `${eyeStrobePct}%`;

    const stormPct = Math.round(seizureIndex * 100);
    if (this.meterSynapseStorm) this.meterSynapseStorm.textContent = `${stormPct}%`;
    if (this.barSynapseStorm) this.barSynapseStorm.style.width = `${stormPct}%`;

    // Step Cadence
    const stepCadence = flyModel ? flyModel.stepCadence : 0;
    if (this.meterStepCadence) this.meterStepCadence.textContent = `${stepCadence} steps/s`;
    if (this.barStepCadence) this.barStepCadence.style.width = `${Math.min(100, (stepCadence / 30) * 100)}%`;

    // Motor State Description
    if (this.flyMotorText) {
      if (seizureIndex > 0.65) {
        this.flyMotorText.textContent = 'EPILEPTIC TONIC-CLONIC SEIZURE';
        this.flyMotorText.className = 'state-value seizure';
        if (this.flyWarningFlash) this.flyWarningFlash.classList.remove('hidden');
      } else if (seizureIndex > 0.35) {
        this.flyMotorText.textContent = 'MYOCLONIC TWITCHING / SPASMS';
        this.flyMotorText.className = 'state-value spasm';
        if (this.flyWarningFlash) this.flyWarningFlash.classList.add('hidden');
      } else {
        if (flyModel && flyModel.walkMode === 'manual') {
          this.flyMotorText.textContent = 'MANUAL CONTROL (DRIVING)';
        } else if (flyModel && flyModel.walkMode === 'target') {
          this.flyMotorText.textContent = 'NAVIGATING TO BEACON';
        } else if (stepCadence > 0) {
          this.flyMotorText.textContent = 'WALKING (TRIPOD GAIT)';
        } else {
          this.flyMotorText.textContent = 'RESTING / GROOMING';
        }
        this.flyMotorText.className = 'state-value';
        if (this.flyWarningFlash) this.flyWarningFlash.classList.add('hidden');
      }
    }

    // Risk Rating Box
    if (this.riskRating) {
      if (seizureIndex > 0.6) {
        this.riskRating.textContent = `CRITICAL (${seizurePctVal}%)`;
        this.riskRating.className = 'risk-value risk-high';
      } else if (seizureIndex > 0.3) {
        this.riskRating.textContent = `ELEVATED (${seizurePctVal}%)`;
        this.riskRating.className = 'risk-value risk-med';
      } else {
        this.riskRating.textContent = `LOW (${seizurePctVal}%)`;
        this.riskRating.className = 'risk-value risk-low';
      }
    }

    // 4. Update and Draw EEG / LFP Multi-Channel Waveforms
    this.updateEEGWaveforms(seizureIndex, avgLuminance, frameDelta);
  }

  updateEEGWaveforms(seizureIndex, avgLum, delta) {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    const t = this.time;
    const isSeizure = seizureIndex > 0.4;
    const chHeight = h / this.numChannels;

    for (let ch = 0; ch < this.numChannels; ch++) {
      const buf = this.channelData[ch];
      for (let i = 0; i < this.bufferLength - 1; i++) {
        buf[i] = buf[i + 1];
      }

      let val = 0;
      const baseWave = Math.sin(t * (30 + ch * 12)) * 0.18 + Math.cos(t * 8) * 0.12;
      val += baseWave;

      if (ch < 2) {
        val += (Math.sin(t * 60 + ch * 2) * delta * 1.5) + (avgLum * 0.2);
      }

      if (isSeizure) {
        const spikePhase = (t * 8) % 1.0;
        let spike = 0;
        if (spikePhase < 0.15) {
          spike = (Math.sin(spikePhase / 0.15 * Math.PI) * 1.8) * (Math.random() > 0.3 ? 1 : -1);
        } else if (spikePhase < 0.45) {
          spike = -Math.sin((spikePhase - 0.15) / 0.3 * Math.PI) * 0.9;
        }
        val += spike * seizureIndex * 1.5 + (Math.random() - 0.5) * 0.4 * seizureIndex;
      }

      buf[this.bufferLength - 1] = Math.max(-1.0, Math.min(1.0, val));
    }

    this.ctx.clearRect(0, 0, w, h);

    for (let ch = 0; ch < this.numChannels; ch++) {
      const buf = this.channelData[ch];
      const centerY = (ch + 0.5) * chHeight;
      const color = this.channelColors[ch];

      this.ctx.beginPath();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1.4;
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = (seizureIndex > 0.4) ? 6 : 2;

      for (let i = 0; i < this.bufferLength; i++) {
        const x = (i / (this.bufferLength - 1)) * w;
        const y = centerY - buf[i] * (chHeight * 0.42);
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();
    }
  }
}
