import { FlyModel } from './flyModel.js';
import { BrainRenderer } from './brainRenderer.js';
import { VideoProcessor } from './videoProcessor.js';
import { AudioEngine } from './audioEngine.js';
import { Telemetry } from './telemetry.js';

class App {
  constructor() {
    this.brainRenderer = new BrainRenderer('brain-canvas-container');
    this.flyModel = new FlyModel('fly-canvas-container');
    this.videoProcessor = new VideoProcessor('source-video', 'video-pixel-canvas');
    this.audioEngine = new AudioEngine();
    this.telemetry = new Telemetry('eeg-canvas');

    this.gabaActive = false;
    this.ptxActive = false;
    this.gabaTimer = null;

    this.isPiPVisible = true;
    this.lastTime = performance.now();

    // Key states for manual fly drive
    this.keysPressed = {};

    this.setupUIBindings();
    this.setupDragAndDrop();
    this.setupKeyboardControls();
    this.setupAudioTriggerOnFirstClick();
    this.startLoop();
  }

  setupAudioTriggerOnFirstClick() {
    const unlock = () => {
      this.audioEngine.init();
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
  }

  setupDragAndDrop() {
    const dropzone = document.getElementById('universal-dropzone');
    
    ['dragenter', 'dragover'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropzone) dropzone.classList.add('active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (eventName === 'drop' || (e.target === dropzone && eventName === 'dragleave')) {
          if (dropzone) dropzone.classList.remove('active');
        }
      });
    });

    window.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        this.handleUniversalUpload(file);
      }
    });
  }

  handleUniversalUpload(file) {
    if (!file) return;
    this.audioEngine.playUplink();
    this.videoProcessor.loadUploadedFile(file);

    // Update active channel buttons
    document.querySelectorAll('.btn-ch').forEach(b => b.classList.remove('active'));
    const customBadge = document.getElementById('active-source-badge');
    if (customBadge) {
      customBadge.textContent = file.name.slice(0, 18);
      customBadge.classList.remove('hidden');
    }
  }

  setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      this.keysPressed[e.key.toLowerCase()] = true;
      this.updateManualFlyDrive();

      // Quick shortcuts
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        const playing = this.videoProcessor.togglePlay();
        const playIcon = document.getElementById('play-icon');
        if (playIcon) playIcon.textContent = playing ? '⏸' : '▶';
        this.audioEngine.playClick();
      } else if (e.key.toLowerCase() === 'g') {
        document.getElementById('btn-gaba')?.click();
      } else if (e.key.toLowerCase() === 'p') {
        document.getElementById('btn-ptx')?.click();
      } else if (e.key.toLowerCase() === 'z') {
        document.getElementById('btn-shock')?.click();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.key.toLowerCase()] = false;
      this.updateManualFlyDrive();
    });
  }

  updateManualFlyDrive() {
    let fwd = 0;
    let turn = 0;

    if (this.keysPressed['w'] || this.keysPressed['arrowup']) fwd += 1;
    if (this.keysPressed['s'] || this.keysPressed['arrowdown']) fwd -= 0.6;
    if (this.keysPressed['a'] || this.keysPressed['arrowleft']) turn += 1;
    if (this.keysPressed['d'] || this.keysPressed['arrowright']) turn -= 1;

    if (fwd !== 0 || turn !== 0) {
      this.flyModel.setManualInput(fwd, turn);
      // Highlight manual button
      document.querySelectorAll('.btn-walk-mode').forEach(b => b.classList.remove('active'));
      document.getElementById('btn-walk-manual')?.classList.add('active');
    } else if (this.flyModel.walkMode === 'manual') {
      this.flyModel.setManualInput(0, 0);
    }
  }

  setupUIBindings() {
    // 1. Video Channel Presets
    const chButtons = document.querySelectorAll('.btn-ch');
    chButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        chButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const customBadge = document.getElementById('active-source-badge');
        if (customBadge) customBadge.classList.add('hidden');

        const source = btn.dataset.source;
        this.videoProcessor.setSource(source);
        this.audioEngine.playClick();
      });
    });

    // 2. Universal File Upload Input
    const fileInput = document.getElementById('universal-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleUniversalUpload(e.target.files[0]);
        }
      });
    }

    // 3. Webcam Input
    const btnWebcam = document.getElementById('btn-webcam');
    if (btnWebcam) {
      btnWebcam.addEventListener('click', () => {
        chButtons.forEach(b => b.classList.remove('active'));
        btnWebcam.classList.add('active');
        this.videoProcessor.setSource('webcam');
        this.audioEngine.playClick();
      });
    }

    // 4. Playback Controls
    const btnPlay = document.getElementById('btn-play-pause');
    const playIcon = document.getElementById('play-icon');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        const playing = this.videoProcessor.togglePlay();
        if (playIcon) playIcon.textContent = playing ? '⏸' : '▶';
        this.audioEngine.playClick();
      });
    }

    const selectSpeed = document.getElementById('select-speed');
    if (selectSpeed) {
      selectSpeed.addEventListener('change', (e) => {
        this.videoProcessor.setSpeed(parseFloat(e.target.value));
      });
    }

    const scrubber = document.getElementById('video-scrubber');
    if (scrubber) {
      scrubber.addEventListener('input', (e) => {
        if (this.videoProcessor.video && this.videoProcessor.video.duration) {
          this.videoProcessor.video.currentTime = (e.target.value / 100) * this.videoProcessor.video.duration;
        }
      });
    }

    // 5. Audio Mute
    const btnMute = document.getElementById('btn-audio-mute');
    const audioIcon = document.getElementById('audio-icon');
    if (btnMute) {
      btnMute.addEventListener('click', () => {
        const isUnmuted = this.audioEngine.toggleMute();
        if (audioIcon) audioIcon.textContent = isUnmuted ? '🔊' : '🔇';
      });
    }

    // 6. Pharmacological & Optogenetic Intervention Triggers
    const btnGABA = document.getElementById('btn-gaba');
    if (btnGABA) {
      btnGABA.addEventListener('click', () => {
        this.audioEngine.playInject();
        this.gabaActive = true;
        this.ptxActive = false;
        document.getElementById('btn-ptx')?.classList.remove('active');
        this.videoProcessor.setPtxOverdrive(false);
        this.videoProcessor.setSensitivity(0.2);
        
        const sliderSens = document.getElementById('slider-sensitivity');
        const valSens = document.getElementById('val-sensitivity');
        if (sliderSens) sliderSens.value = 0.2;
        if (valSens) valSens.textContent = 'Subdued';

        if (this.gabaTimer) clearTimeout(this.gabaTimer);
        this.gabaTimer = setTimeout(() => {
          this.gabaActive = false;
          this.videoProcessor.setSensitivity(1.4);
          if (sliderSens) sliderSens.value = 1.4;
          if (valSens) valSens.textContent = 'High';
        }, 5000);
      });
    }

    const btnPTX = document.getElementById('btn-ptx');
    if (btnPTX) {
      btnPTX.addEventListener('click', () => {
        this.audioEngine.playInject();
        this.ptxActive = !this.ptxActive;
        btnPTX.classList.toggle('active', this.ptxActive);
        this.videoProcessor.setPtxOverdrive(this.ptxActive);
        if (this.ptxActive) {
          this.audioEngine.playZap();
        }
      });
    }

    const btnShock = document.getElementById('btn-shock');
    if (btnShock) {
      btnShock.addEventListener('click', () => {
        this.audioEngine.playZap();
        this.brainRenderer.triggerLaserShock(0, 0);
      });
    }

    // 7. Neuropil Stimulation Markers
    document.querySelector('.mark-optic-l')?.addEventListener('click', () => {
      this.brainRenderer.triggerLaserShock(-0.7, 0.2, 'optic_l');
      this.audioEngine.playZap();
    });
    document.querySelector('.mark-optic-r')?.addEventListener('click', () => {
      this.brainRenderer.triggerLaserShock(0.7, 0.2, 'optic_r');
      this.audioEngine.playZap();
    });
    document.querySelector('.mark-central')?.addEventListener('click', () => {
      this.brainRenderer.triggerLaserShock(0, 0, 'central_complex');
      this.audioEngine.playZap();
    });
    document.querySelector('.mark-mushroom')?.addEventListener('click', () => {
      this.brainRenderer.triggerLaserShock(0, 0.6, 'mushroom_body');
      this.audioEngine.playZap();
    });
    document.querySelector('.mark-vnc')?.addEventListener('click', () => {
      this.brainRenderer.triggerLaserShock(0, -0.6, 'descending_motor');
      this.audioEngine.playZap();
    });

    // 8. Brain View Mode Switchers
    const btnView3D = document.getElementById('btn-view-3d');
    const btnViewMatrix = document.getElementById('btn-view-matrix');
    const btnViewSynapses = document.getElementById('btn-view-synapses');

    if (btnView3D) {
      btnView3D.addEventListener('click', () => {
        [btnView3D, btnViewMatrix, btnViewSynapses].forEach(b => b?.classList.remove('active'));
        btnView3D.classList.add('active');
        this.brainRenderer.setViewMode('3d');
        this.audioEngine.playClick();
      });
    }

    if (btnViewMatrix) {
      btnViewMatrix.addEventListener('click', () => {
        [btnView3D, btnViewMatrix, btnViewSynapses].forEach(b => b?.classList.remove('active'));
        btnViewMatrix.classList.add('active');
        this.brainRenderer.setViewMode('matrix');
        this.audioEngine.playClick();
      });
    }

    if (btnViewSynapses) {
      btnViewSynapses.addEventListener('click', () => {
        [btnView3D, btnViewMatrix, btnViewSynapses].forEach(b => b?.classList.remove('active'));
        btnViewSynapses.classList.add('active');
        this.brainRenderer.setViewMode('synapses');
        this.audioEngine.playClick();
      });
    }

    // Fluorophore Selector
    const selectFluorophore = document.getElementById('select-fluorophore');
    if (selectFluorophore) {
      selectFluorophore.addEventListener('change', (e) => {
        const mode = e.target.value;
        this.brainRenderer.setFluorophore(mode);
        this.flyModel.setFluorophore(mode);
        this.audioEngine.playClick();
      });
    }

    // Brain Gain Slider
    const sliderGain = document.getElementById('slider-lum-gain');
    const valGain = document.getElementById('val-lum-gain');
    if (sliderGain) {
      sliderGain.addEventListener('input', (e) => {
        const g = parseFloat(e.target.value);
        if (valGain) valGain.textContent = `${g.toFixed(1)}x`;
        this.brainRenderer.setGain(g);
      });
    }

    // Seizure Sensitivity Slider
    const sliderSens = document.getElementById('slider-sensitivity');
    const valSens = document.getElementById('val-sensitivity');
    if (sliderSens) {
      sliderSens.addEventListener('input', (e) => {
        const s = parseFloat(e.target.value);
        this.videoProcessor.setSensitivity(s);
        if (valSens) {
          if (s < 0.6) valSens.textContent = 'Subdued';
          else if (s < 1.6) valSens.textContent = 'High';
          else valSens.textContent = 'Ultra';
        }
      });
    }

    // Slice scanner
    const btnSlice = document.getElementById('btn-slice-mode');
    if (btnSlice) {
      btnSlice.addEventListener('click', () => {
        const active = this.brainRenderer.toggleSliceMode();
        btnSlice.classList.toggle('active', active);
        this.audioEngine.playClick();
      });
    }

    document.getElementById('btn-reset-cam-brain')?.addEventListener('click', () => {
      this.brainRenderer.resetCamera();
    });

    // 9. Fly Locomotion & Walking Controls
    const btnWalkRoam = document.getElementById('btn-walk-roam');
    const btnWalkManual = document.getElementById('btn-walk-manual');
    const btnWalkReset = document.getElementById('btn-walk-reset');

    if (btnWalkRoam) {
      btnWalkRoam.addEventListener('click', () => {
        document.querySelectorAll('.btn-walk-mode').forEach(b => b.classList.remove('active'));
        btnWalkRoam.classList.add('active');
        this.flyModel.setWalkMode('roam');
        this.audioEngine.playClick();
      });
    }

    if (btnWalkManual) {
      btnWalkManual.addEventListener('click', () => {
        document.querySelectorAll('.btn-walk-mode').forEach(b => b.classList.remove('active'));
        btnWalkManual.classList.add('active');
        this.flyModel.setWalkMode('manual');
        this.audioEngine.playClick();
      });
    }

    if (btnWalkReset) {
      btnWalkReset.addEventListener('click', () => {
        this.flyModel.resetPosition();
        this.audioEngine.playClick();
      });
    }

    const sliderFlySpeed = document.getElementById('slider-fly-speed');
    const valFlySpeed = document.getElementById('val-fly-speed');
    if (sliderFlySpeed) {
      sliderFlySpeed.addEventListener('input', (e) => {
        const spd = parseFloat(e.target.value);
        this.flyModel.setWalkSpeed(spd);
        if (valFlySpeed) valFlySpeed.textContent = `${spd.toFixed(1)}x`;
      });
    }

    // Fly Camera Mode Buttons
    const camButtons = document.querySelectorAll('.btn-fly-cam');
    camButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        camButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.flyModel.setCamMode(btn.dataset.cam);
        this.audioEngine.playClick();
      });
    });

    const btnXRay = document.getElementById('btn-toggle-xray');
    if (btnXRay) {
      btnXRay.addEventListener('click', () => {
        const active = this.flyModel.toggleXRay();
        btnXRay.classList.toggle('active', active);
        this.audioEngine.playClick();
      });
    }

    // On-screen Virtual D-Pad buttons
    const dpadUp = document.getElementById('dpad-up');
    const dpadDown = document.getElementById('dpad-down');
    const dpadLeft = document.getElementById('dpad-left');
    const dpadRight = document.getElementById('dpad-right');

    const bindDpad = (el, fwd, turn) => {
      if (!el) return;
      const start = (e) => {
        e.preventDefault();
        this.flyModel.setManualInput(fwd, turn);
        document.querySelectorAll('.btn-walk-mode').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-walk-manual')?.classList.add('active');
      };
      const end = (e) => {
        e.preventDefault();
        this.flyModel.setManualInput(0, 0);
      };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointerleave', end);
    };

    bindDpad(dpadUp, 1, 0);
    bindDpad(dpadDown, -0.6, 0);
    bindDpad(dpadLeft, 0, 1);
    bindDpad(dpadRight, 0, -1);

    // 10. PiP Video Controls
    const pipContainer = document.getElementById('pip-video-container');
    const btnPipClose = document.getElementById('btn-pip-close');
    const btnViewVideo = document.getElementById('btn-view-video-overlay');

    if (btnPipClose) {
      btnPipClose.addEventListener('click', () => {
        pipContainer?.classList.add('hidden');
        btnViewVideo?.classList.remove('active');
      });
    }

    if (btnViewVideo) {
      btnViewVideo.addEventListener('click', () => {
        this.isPiPVisible = !this.isPiPVisible;
        pipContainer?.classList.toggle('hidden', !this.isPiPVisible);
        btnViewVideo?.classList.toggle('active', this.isPiPVisible);
        this.audioEngine.playClick();
      });
    }
  }

  startLoop() {
    const loop = (time) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (time - this.lastTime) / 1000);
      this.lastTime = time;

      // 1. Process Video / Image / Audio / Bitstream Frame
      const frameData = this.videoProcessor.processFrame(dt);

      // Video PiP Readouts & Source Status
      const lumEl = document.getElementById('video-lum');
      if (lumEl) lumEl.textContent = frameData.avgLuminance.toFixed(2);

      const streamTitleEl = document.getElementById('current-stream-title');
      if (streamTitleEl) streamTitleEl.textContent = frameData.sourceLabel;
      const streamDetailEl = document.getElementById('current-stream-detail');
      if (streamDetailEl) streamDetailEl.textContent = frameData.sourceDetail;

      // Scrubber update if playing video
      const v = this.videoProcessor.video;
      if (v && v.duration && this.videoProcessor.mediaType === 'video') {
        const pct = (v.currentTime / v.duration) * 100;
        const scrubber = document.getElementById('video-scrubber');
        if (scrubber) scrubber.value = pct;

        const curMin = Math.floor(v.currentTime / 60);
        const curSec = Math.floor(v.currentTime % 60);
        const durMin = Math.floor(v.duration / 60);
        const durSec = Math.floor(v.duration % 60);
        const timeCur = document.getElementById('time-current');
        const timeDur = document.getElementById('time-duration');
        if (timeCur) timeCur.textContent = `${String(curMin).padStart(2, '0')}:${String(curSec).padStart(2, '0')}`;
        if (timeDur) timeDur.textContent = `${String(durMin).padStart(2, '0')}:${String(durSec).padStart(2, '0')}`;
      }

      // 2. Stream into Connectome Neurons & Optogenetic Matrix Dots
      this.brainRenderer.mapVideoFrame(
        frameData.pixelData,
        frameData.width,
        frameData.height,
        frameData.seizureIndex,
        frameData.audioEnergy
      );
      this.brainRenderer.update(dt);

      // 3. Update 3D Fruitfly Locomotion & Reaction
      this.flyModel.setSeizureState(frameData.seizureIndex, this.telemetry.spikeRate / 300);
      this.flyModel.update(dt);

      // 4. Update Audio Engine
      const isWalking = this.flyModel.stepCadence > 0;
      this.audioEngine.update(frameData.seizureIndex, this.telemetry.spikeRate, isWalking);

      // 5. Update Telemetry, Locomotion Metrics & Multi-Channel EEG
      this.telemetry.update(dt, frameData.seizureIndex, frameData.avgLuminance, frameData.frameDelta, this.flyModel);
    };

    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.flyBrainApp = new App();
});
