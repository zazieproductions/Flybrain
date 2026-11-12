/**
 * Universal Brain Stream Processor
 * Handles Video, Images/GIFs, Audio/Music Spectrograms, Text/Data/Code Bitstreams,
 * Webcams, and Procedural Optical Channels, mapping all multi-modal inputs into
 * a normalized high-frequency retinotopic pixel matrix to drive every neuron dot in the connectome.
 */
export class VideoProcessor {
  constructor(videoElementId, pipCanvasId) {
    this.video = document.getElementById(videoElementId);
    this.pipCanvas = document.getElementById(pipCanvasId);
    this.pipCtx = this.pipCanvas ? this.pipCanvas.getContext('2d', { willReadFrequently: true }) : null;

    this.width = 160;
    this.height = 120;
    if (this.pipCanvas) {
      this.pipCanvas.width = this.width;
      this.pipCanvas.height = this.height;
    }

    // Media mode: 'procedural', 'video', 'image', 'audio', 'text', 'webcam'
    this.mediaType = 'procedural';
    this.currentSource = 'optomotor'; // Start with calm Optomotor motion
    this.sourceLabel = '🪰 Optomotor Grating';
    this.sourceDetail = 'Wide-Field Motion & Retinotopic Stimulus';

    this.isPlaying = true;
    this.playbackSpeed = 1.0;
    this.seizureSensitivity = 1.4;
    this.ptxOverdrive = false;

    // Metrics
    this.previousFrameData = null;
    this.currentFrameData = null;
    this.avgLuminance = 0;
    this.frameDelta = 0;
    this.seizureIndex = 0;
    this.flickerAccumulator = 0;
    this.audioEnergy = 0;

    this.animTime = 0;
    this.webcamStream = null;

    // Offscreen canvas for composition
    this.procCanvas = document.createElement('canvas');
    this.procCanvas.width = this.width;
    this.procCanvas.height = this.height;
    this.procCtx = this.procCanvas.getContext('2d', { willReadFrequently: true });

    // Audio Analysis for Audio files
    this.audioElement = new Audio();
    this.audioElement.loop = true;
    this.audioCtx = null;
    this.audioAnalyser = null;
    this.audioSourceNode = null;
    this.audioFreqData = null;
    this.audioTimeData = null;

    // Image data cache
    this.loadedImage = null;
    this.imagePanOffset = { x: 0, y: 0 };

    // Text / Code Data streamer
    this.streamText = '';
    this.textCharIndex = 0;
    this.textByteMatrix = new Uint8Array(this.width * this.height);

    this.setupListeners();
  }

  setupListeners() {
    if (this.video) {
      this.video.addEventListener('loadedmetadata', () => {
        if (this.isPlaying) {
          this.video.play().catch(() => {});
        }
      });
      this.video.addEventListener('ended', () => {
        this.video.currentTime = 0;
        this.video.play().catch(() => {});
      });
    }
  }

  initAudioAnalysis() {
    if (this.audioCtx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
      this.audioAnalyser = this.audioCtx.createAnalyser();
      this.audioAnalyser.fftSize = 512;
      this.audioAnalyser.smoothingTimeConstant = 0.8;
      this.audioFreqData = new Uint8Array(this.audioAnalyser.frequencyBinCount);
      this.audioTimeData = new Uint8Array(this.audioAnalyser.frequencyBinCount);

      this.audioSourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
      this.audioSourceNode.connect(this.audioAnalyser);
      this.audioAnalyser.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn("Audio analysis init notice:", e);
    }
  }

  /**
   * Universal Brain Upload Handler
   * Accepts any File instance (video, image, audio, text, json, code, etc.)
   */
  loadUploadedFile(file) {
    if (!file) return;
    const name = file.name || 'Unknown Upload';
    const type = file.type || '';
    const ext = name.split('.').pop().toLowerCase();

    // Reset current streams
    this.stopWebcam();
    this.audioElement.pause();
    if (this.video) this.video.pause();

    if (type.startsWith('video/') || ['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(ext)) {
      this.mediaType = 'video';
      this.sourceLabel = `Video: ${name.slice(0, 20)}`;
      this.sourceDetail = `${(file.size / 1024 / 1024).toFixed(1)} MB • Video Stream`;
      const url = URL.createObjectURL(file);
      this.video.srcObject = null;
      this.video.src = url;
      this.video.currentTime = 0;
      this.isPlaying = true;
      this.video.play().catch(() => {});
    } else if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) {
      this.mediaType = 'image';
      this.sourceLabel = `Image: ${name.slice(0, 20)}`;
      this.sourceDetail = `${(file.size / 1024).toFixed(0)} KB • Retinotopic Texture Map`;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          this.loadedImage = img;
          this.isPlaying = true;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } else if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) {
      this.mediaType = 'audio';
      this.sourceLabel = `Audio: ${name.slice(0, 20)}`;
      this.sourceDetail = `Spectrogram & Tonotopic Frequency Map`;
      this.initAudioAnalysis();
      const url = URL.createObjectURL(file);
      this.audioElement.src = url;
      this.isPlaying = true;
      this.audioElement.play().catch(() => {});
    } else {
      // Text, Code, JSON, CSV, Markdown, Binary Data
      this.mediaType = 'text';
      this.sourceLabel = `Data: ${name.slice(0, 20)}`;
      this.sourceDetail = `${(file.size / 1024).toFixed(1)} KB • Neuro-Bitstream Matrix`;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.streamText = e.target.result;
        this.textCharIndex = 0;
        this.isPlaying = true;
      };
      reader.readAsText(file);
    }
  }

  setSource(sourceType, customFile = null) {
    this.stopWebcam();
    this.audioElement.pause();

    if (sourceType === 'file' && customFile) {
      this.loadUploadedFile(customFile);
      return;
    }

    if (sourceType === 'webcam') {
      this.mediaType = 'webcam';
      this.sourceLabel = 'Live Optical Sensor (Webcam)';
      this.sourceDetail = 'Real-Time Biological Vision';
      navigator.mediaDevices?.getUserMedia({ video: { width: 320, height: 240 } })
        .then(stream => {
          this.webcamStream = stream;
          this.video.srcObject = stream;
          this.video.play().catch(console.error);
          this.isPlaying = true;
        })
        .catch(err => {
          console.warn("Webcam unavailable, falling back to strobe", err);
          this.setSource('strobe');
        });
      return;
    }

    // Procedural channels
    this.mediaType = 'procedural';
    this.currentSource = sourceType;
    if (this.video) {
      this.video.srcObject = null;
      this.video.removeAttribute('src');
    }

    const labels = {
      strobe: { label: '⚡ Hyper-Strobe (EP-34)', detail: 'High-Frequency 18Hz Photostimulation' },
      optomotor: { label: '🪰 Optomotor Grating', detail: 'Wide-Field Motion & Loom Stimulus' },
      badapple: { label: '🍎 Cyber Matrix Morph', detail: 'High-Contrast Edge Detector' },
      calcium: { label: '🧬 Calcium Ion Wave', detail: 'Spatiotemporal GCaMP Cascade' },
      techno: { label: '🎵 Bass Rave Audio-Visual', detail: 'Sub-Bass Tonotopic Rhythms' },
      avalanche: { label: '🧠 Synaptic Avalanche', detail: 'Self-Organized Criticality Bursts' }
    };

    if (labels[sourceType]) {
      this.sourceLabel = labels[sourceType].label;
      this.sourceDetail = labels[sourceType].detail;
    }
  }

  stopWebcam() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    if (this.mediaType === 'video' || this.mediaType === 'webcam') {
      if (this.isPlaying) this.video.play().catch(() => {});
      else this.video.pause();
    } else if (this.mediaType === 'audio') {
      if (this.isPlaying) this.audioElement.play().catch(() => {});
      else this.audioElement.pause();
    }
    return this.isPlaying;
  }

  setSpeed(spd) {
    this.playbackSpeed = spd;
    if (this.video) this.video.playbackRate = spd;
    if (this.audioElement) this.audioElement.playbackRate = spd;
  }

  setSensitivity(val) {
    this.seizureSensitivity = val;
  }

  setPtxOverdrive(enabled) {
    this.ptxOverdrive = enabled;
  }

  /**
   * Main Frame Processing Loop
   * Returns complete pixelData array (RGBA) mapped to 160x120 for connectome ingestion
   */
  processFrame(dt) {
    if (!this.isPlaying && this.currentFrameData) {
      return {
        pixelData: this.currentFrameData.data,
        width: this.width,
        height: this.height,
        seizureIndex: this.seizureIndex,
        avgLuminance: this.avgLuminance,
        frameDelta: this.frameDelta,
        audioEnergy: this.audioEnergy,
        sourceLabel: this.sourceLabel,
        sourceDetail: this.sourceDetail,
        mediaType: this.mediaType
      };
    }

    this.animTime += dt * this.playbackSpeed;

    // Render corresponding media source to procCanvas
    if (this.mediaType === 'video' || this.mediaType === 'webcam') {
      if (this.video && this.video.readyState >= 2) {
        this.procCtx.drawImage(this.video, 0, 0, this.width, this.height);
      }
    } else if (this.mediaType === 'image') {
      this.renderImageFrame(this.animTime);
    } else if (this.mediaType === 'audio') {
      this.renderAudioSpectrogramFrame(this.animTime);
    } else if (this.mediaType === 'text') {
      this.renderTextBitstreamFrame(dt);
    } else {
      // Procedural channel
      this.renderProceduralFrame(this.currentSource, this.animTime);
    }

    // Mirror to PiP preview canvas
    if (this.pipCtx) {
      this.pipCtx.drawImage(this.procCanvas, 0, 0, this.width, this.height);
    }

    // Extract RGBA pixels
    const imgData = this.procCtx.getImageData(0, 0, this.width, this.height);
    this.currentFrameData = imgData;
    const pixels = imgData.data;

    // Fast sampling of luminance and temporal delta
    let totalLum = 0;
    let totalDelta = 0;
    const prevPixels = this.previousFrameData ? this.previousFrameData.data : null;
    const step = 4 * 3;
    let samples = 0;

    for (let i = 0; i < pixels.length; i += step) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLum += lum;

      if (prevPixels) {
        const prevLum = 0.299 * prevPixels[i] + 0.587 * prevPixels[i + 1] + 0.114 * prevPixels[i + 2];
        totalDelta += Math.abs(lum - prevLum);
      }
      samples++;
    }

    const prevAvgLum = this.avgLuminance || 0;
    this.avgLuminance = totalLum / (samples * 255);
    this.frameDelta = prevPixels ? totalDelta / (samples * 255) : 0;
    const globalFlashDelta = Math.abs(this.avgLuminance - prevAvgLum);

    // Seizure score computation: Driven by global whole-screen flash + high strobe
    let baseStrobe = 0;
    if (this.currentSource === 'strobe') {
      baseStrobe = 0.90;
    } else if (this.currentSource === 'avalanche') {
      baseStrobe = 0.60;
    } else {
      // Global rapid full-screen flashes drive seizure
      baseStrobe = Math.min(1.0, globalFlashDelta * 4.0);
    }

    const soundScore = this.audioEnergy * 0.3;
    const instantaneousExcitation = Math.min(1.0, baseStrobe + soundScore);

    this.flickerAccumulator = this.flickerAccumulator * 0.90 + instantaneousExcitation * 0.10;

    let rawSeizure = (instantaneousExcitation * 0.6 + this.flickerAccumulator * 0.4) * (this.seizureSensitivity * 0.8);
    if (this.ptxOverdrive) rawSeizure = Math.min(1.0, rawSeizure * 2.2 + 0.5);

    this.seizureIndex = Math.max(0, Math.min(1.0, rawSeizure));

    if (!this.previousFrameData) {
      this.previousFrameData = this.procCtx.createImageData(this.width, this.height);
    }
    this.previousFrameData.data.set(pixels);

    return {
      pixelData: pixels,
      width: this.width,
      height: this.height,
      seizureIndex: this.seizureIndex,
      avgLuminance: this.avgLuminance,
      frameDelta: this.frameDelta,
      audioEnergy: this.audioEnergy,
      sourceLabel: this.sourceLabel,
      sourceDetail: this.sourceDetail,
      mediaType: this.mediaType
    };
  }

  renderImageFrame(t) {
    const ctx = this.procCtx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    if (this.loadedImage) {
      // Dynamic scanning & breathing zoom over uploaded image
      const zoom = 1.0 + Math.sin(t * 0.8) * 0.15;
      const panX = Math.sin(t * 0.5) * 12;
      const panY = Math.cos(t * 0.4) * 8;

      ctx.save();
      ctx.translate(w / 2 + panX, h / 2 + panY);
      ctx.scale(zoom, zoom);
      ctx.drawImage(this.loadedImage, -w / 2, -h / 2, w, h);
      ctx.restore();

      // Optical scanline laser sweep
      const scanY = ((t * 80) % (h + 20)) - 10;
      ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.fillRect(0, scanY, w, 3);
    }
  }

  renderAudioSpectrogramFrame(t) {
    const ctx = this.procCtx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, w, h);

    if (this.audioAnalyser && this.audioFreqData) {
      this.audioAnalyser.getByteFrequencyData(this.audioFreqData);
      this.audioAnalyser.getByteTimeDomainData(this.audioTimeData);

      // Compute total audio energy
      let sum = 0;
      for (let i = 0; i < this.audioFreqData.length; i++) sum += this.audioFreqData[i];
      this.audioEnergy = sum / (this.audioFreqData.length * 255);

      // Draw multi-band 2D tonotopic spectrogram matrix
      const numBands = 32;
      const bandW = w / numBands;

      for (let b = 0; b < numBands; b++) {
        const dataIdx = Math.floor((b / numBands) * this.audioFreqData.length);
        const val = this.audioFreqData[dataIdx] / 255;
        const barH = val * (h * 0.9);

        // Gradient coloring: Low bass (cyan/green) -> Mids (amber) -> High (magenta/white)
        const hue = (b / numBands) * 300;
        ctx.fillStyle = `hsla(${hue}, 100%, ${40 + val * 50}%, ${0.6 + val * 0.4})`;
        ctx.fillRect(b * bandW, h - barH, bandW - 1, barH);
      }

      // Center radial waveform scope
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.audioTimeData.length; i += 4) {
        const x = (i / this.audioTimeData.length) * w;
        const y = ((this.audioTimeData[i] / 255) - 0.5) * (h * 0.6) + (h / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  renderTextBitstreamFrame(dt) {
    const ctx = this.procCtx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#03060a';
    ctx.fillRect(0, 0, w, h);

    const chars = this.streamText || '01011001 FLY_BRAIN CONNECTOME STREAMING NEURAL_ENCODING ';
    const charsPerSec = 120 * this.playbackSpeed;
    this.textCharIndex = (this.textCharIndex + dt * charsPerSec) % chars.length;

    // Draw high-speed digital matrix code waterfall
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#00ff88';

    const cols = 16;
    const rows = 10;
    const cellW = w / cols;
    const cellH = h / rows;

    let idx = Math.floor(this.textCharIndex);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const char = chars[(idx + r * cols + c) % chars.length] || ' ';
        const code = char.charCodeAt(0);
        const brightness = (code % 10) / 10;

        if ((r + c) % 3 === 0) {
          ctx.fillStyle = `rgba(0, 240, 255, ${0.4 + brightness * 0.6})`;
        } else {
          ctx.fillStyle = `rgba(0, 255, 136, ${0.3 + brightness * 0.7})`;
        }

        ctx.fillText(char, c * cellW + 2, r * cellH + 10);
      }
    }

    // High frequency flashing data pulses
    if (Math.sin(this.animTime * 20) > 0.8) {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.25)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  renderProceduralFrame(channel, t) {
    const ctx = this.procCtx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    if (channel === 'strobe') {
      const strobeRate = 18.0;
      const isFlash = Math.sin(t * strobeRate * Math.PI * 2) > 0;
      const gridSize = 16;
      for (let y = 0; y < h; y += gridSize) {
        for (let x = 0; x < w; x += gridSize) {
          const check = ((x / gridSize + y / gridSize) % 2 === 0);
          const active = isFlash ? check : !check;
          ctx.fillStyle = active ? '#ffffff' : '#000000';
          ctx.fillRect(x, y, gridSize, gridSize);
        }
      }

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(t * 8.0);
      for (let a = 0; a < 8; a++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 55, (a / 8) * Math.PI * 2, ((a + 0.5) / 8) * Math.PI * 2);
        ctx.fillStyle = isFlash ? '#ffffff' : '#ff0055';
        ctx.fill();
      }
      ctx.restore();

    } else if (channel === 'optomotor') {
      const barWidth = 14;
      const speed = 120.0;
      const offset = (t * speed) % (barWidth * 2);

      for (let x = -barWidth * 2; x < w + barWidth * 2; x += barWidth * 2) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + offset, 0, barWidth, h);
      }

      ctx.save();
      ctx.translate(w / 2, h / 2);
      const spiralR = Math.max(0.5, Math.abs((t * 50) % 45));
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, spiralR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

    } else if (channel === 'badapple') {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.sin(t * 2) * 0.5);
      const scale = 1.0 + Math.sin(t * 4) * 0.3;
      ctx.scale(scale, scale);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + t * 3;
        const rad = 25 + Math.sin(ang * 3 + t * 5) * 18;
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      if (Math.sin(t * 12) > 0.3) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-w / 2, -h / 2, w, 6);
        ctx.fillRect(-w / 2, h / 2 - 6, w, 6);
      }
      ctx.restore();

    } else if (channel === 'calcium') {
      const cx = w / 2 + Math.sin(t * 1.5) * 35;
      const cy = h / 2 + Math.cos(t * 1.8) * 25;

      const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 65);
      const intensity = 0.5 + Math.sin(t * 8) * 0.5;
      grad.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
      grad.addColorStop(0.4, `rgba(0, 255, 136, ${intensity * 0.8})`);
      grad.addColorStop(0.8, 'rgba(0, 50, 20, 0.2)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 1)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

    } else if (channel === 'techno') {
      const bars = 16;
      const barW = w / bars;
      for (let i = 0; i < bars; i++) {
        const beatVal = Math.abs(Math.sin(t * 10 + i * 0.8));
        const barH = beatVal * h;
        ctx.fillStyle = (i % 2 === 0) ? '#ff007f' : '#00f0ff';
        ctx.fillRect(i * barW, h - barH, barW - 2, barH);
      }

      if (Math.sin(t * 15) > 0.85) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(0, 0, w, h);
      }

    } else if (channel === 'avalanche') {
      // Synaptic avalanche fractal branching
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1.5;
      for (let branch = 0; branch < 5; branch++) {
        ctx.beginPath();
        let curX = w / 2;
        let curY = 0;
        ctx.moveTo(curX, curY);
        for (let seg = 0; seg < 8; seg++) {
          curX += (Math.sin(t * 15 + branch * 2 + seg) * 16);
          curY += h / 8;
          ctx.lineTo(curX, curY);
        }
        ctx.stroke();
      }
      if (Math.sin(t * 25) > 0.6) {
        ctx.fillStyle = 'rgba(0, 255, 136, 0.4)';
        ctx.fillRect(0, 0, w, h);
      }
    }
  }
}
