import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class BrainRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
    this.camera.position.set(0, 0, 5.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 14;
    this.controls.minDistance = 1.2;

    this.time = 0;
    this.viewMode = '3d'; // '3d', 'matrix', 'synapses', 'retinotopy'
    this.sliceMode = false;
    this.slicePlaneZ = 0;
    this.fluorophore = 'gcamp';
    this.lumGain = 1.5;
    this.seizureIntensity = 0;
    this.laserColor = 0x00f0ff; // 470nm default

    // Groups
    this.brainGroup = new THREE.Group();
    this.scene.add(this.brainGroup);

    this.matrixGroup = new THREE.Group();
    this.matrixGroup.visible = false;
    this.scene.add(this.matrixGroup);

    this.neuronData = [];
    this.matrixDotData = [];
    this.synapticLines = null;
    this.axonParticles = null;

    this.setupLighting();
    this.generateConnectome();
    this.generateOptogeneticMatrixGrid();
    this.setupAxonPulses();
    this.setupLaserProbes();
    this.setupResize();
    this.setupClickHandler();
  }

  setupLighting() {
    const ambient = new THREE.AmbientLight(0x223344, 2.0);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    // Glowing center optogenetic source
    this.coreLight = new THREE.PointLight(0x00ff88, 2.5, 6.0);
    this.coreLight.position.set(0, 0, 0);
    this.brainGroup.add(this.coreLight);
  }

  createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.25, 'rgba(120, 255, 220, 0.9)');
    grad.addColorStop(0.6, 'rgba(0, 200, 255, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(canvas);
  }

  generateConnectome() {
    const totalNeurons = 6800;
    const positions = new Float32Array(totalNeurons * 3);
    const colors = new Float32Array(totalNeurons * 3);
    const sizes = new Float32Array(totalNeurons);

    this.neuronData = [];
    let idx = 0;

    // 1. OPTIC LOBES (Left & Right Medulla, Lobula, Lamina) - ~3000 neurons
    const opticCount = 3000;
    for (let i = 0; i < opticCount; i++) {
      const side = (i % 2 === 0) ? -1 : 1;
      const u = Math.random();
      const v = Math.random();

      const theta = (u - 0.5) * Math.PI * 0.95;
      const x = side * (1.15 + Math.cos(theta) * 0.78 + (Math.random() - 0.5) * 0.28);
      const y = Math.sin(theta) * 0.95 + (Math.random() - 0.5) * 0.32;
      const z = (v - 0.5) * 1.15 + (Math.random() - 0.5) * 0.25;

      const videoU = (side === -1) 
        ? (0.5 - THREE.MathUtils.clamp((x + 1.8) / 1.6, 0, 0.5)) 
        : (0.5 + THREE.MathUtils.clamp((x - 1.1) / 1.6, 0, 0.5));
      const videoV = THREE.MathUtils.clamp((y + 0.95) / 1.9, 0, 1.0);

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      sizes[idx] = 0.05 + Math.random() * 0.035;

      this.neuronData.push({
        index: idx,
        x, y, z,
        origX: x, origY: y, origZ: z,
        region: (side === -1) ? 'optic_l' : 'optic_r',
        videoU,
        videoV,
        lum: 0,
        activity: 0.1,
        spikeCount: 0
      });
      idx++;
    }

    // 2. CENTRAL COMPLEX (Ellipsoid Body, Fan-Shaped Body, Bridge) - ~1300 neurons
    const ccCount = 1300;
    for (let i = 0; i < ccCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 0.28 + Math.random() * 0.25;
      const x = Math.cos(theta) * r + (Math.random() - 0.5) * 0.1;
      const y = Math.sin(theta) * (r * 0.75) + (Math.random() - 0.5) * 0.1;
      const z = (Math.random() - 0.5) * 0.4;

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      sizes[idx] = 0.055 + Math.random() * 0.035;

      this.neuronData.push({
        index: idx,
        x, y, z,
        origX: x, origY: y, origZ: z,
        region: 'central_complex',
        videoU: 0.5 + (x / 1.6),
        videoV: 0.5 + (y / 1.6),
        lum: 0,
        activity: 0.15,
        spikeCount: 0
      });
      idx++;
    }

    // 3. MUSHROOM BODIES (Kenyon Cells & Calyx) - ~1300 neurons
    const mbCount = 1300;
    for (let i = 0; i < mbCount; i++) {
      const side = (i % 2 === 0) ? -1 : 1;
      const t = Math.random();
      const x = side * (0.38 + t * 0.48 + (Math.random() - 0.5) * 0.16);
      const y = 0.48 + Math.sin(t * Math.PI) * 0.48 + (Math.random() - 0.5) * 0.16;
      const z = (1 - t) * 0.42 - t * 0.42 + (Math.random() - 0.5) * 0.22;

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      sizes[idx] = 0.048 + Math.random() * 0.035;

      this.neuronData.push({
        index: idx,
        x, y, z,
        origX: x, origY: y, origZ: z,
        region: 'mushroom_body',
        videoU: 0.5 + (x / 2.0),
        videoV: 0.5 + (y / 2.0),
        lum: 0,
        activity: 0.1,
        spikeCount: 0
      });
      idx++;
    }

    // 4. SUBESOPHAGEAL ZONE & DESCENDING MOTOR TRACT - remaining
    const motorCount = totalNeurons - idx;
    for (let i = 0; i < motorCount; i++) {
      const t = Math.random();
      const spread = (1.0 - t * 0.7);
      const x = (Math.random() - 0.5) * 0.6 * spread;
      const y = -0.38 - t * 0.9 + (Math.random() - 0.5) * 0.12;
      const z = (Math.random() - 0.5) * 0.38;

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      sizes[idx] = 0.052 + Math.random() * 0.035;

      this.neuronData.push({
        index: idx,
        x, y, z,
        origX: x, origY: y, origZ: z,
        region: 'descending_motor',
        videoU: 0.5 + (x / 1.6),
        videoV: 0.5 + (y / 1.6),
        lum: 0,
        activity: 0.1,
        spikeCount: 0
      });
      idx++;
    }

    this.neuronGeometry = new THREE.BufferGeometry();
    this.neuronGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.neuronGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleTexture = this.createGlowTexture();
    this.neuronMaterial = new THREE.PointsMaterial({
      size: 0.09,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.neuronPoints = new THREE.Points(this.neuronGeometry, this.neuronMaterial);
    this.brainGroup.add(this.neuronPoints);

    this.buildSynapticLines();
  }

  /**
   * Generates a high-density 2D/3D flat Optogenetic Micro-LED Matrix Grid
   * Each dot directly represents an optogenetic activation channel!
   */
  generateOptogeneticMatrixGrid() {
    const cols = 32;
    const rows = 24;
    const totalMatrixDots = cols * rows;
    const positions = new Float32Array(totalMatrixDots * 3);
    const colors = new Float32Array(totalMatrixDots * 3);

    const gridW = 3.6;
    const gridH = 2.7;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const u = c / (cols - 1);
        const v = r / (rows - 1);

        const x = (u - 0.5) * gridW;
        const y = (0.5 - v) * gridH;
        const z = 0;

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        colors[i * 3] = 0.0;
        colors[i * 3 + 1] = 0.4;
        colors[i * 3 + 2] = 0.3;

        this.matrixDotData.push({
          index: i,
          col: c,
          row: r,
          u, v,
          x, y, z,
          activity: 0.1
        });
      }
    }

    this.matrixGeometry = new THREE.BufferGeometry();
    this.matrixGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.matrixGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const matTex = this.createGlowTexture();
    this.matrixMaterial = new THREE.PointsMaterial({
      size: 0.12,
      map: matTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.matrixPoints = new THREE.Points(this.matrixGeometry, this.matrixMaterial);
    this.matrixGroup.add(this.matrixPoints);

    // Matrix outer frame HUD border
    const frameGeo = new THREE.PlaneGeometry(gridW + 0.2, gridH + 0.2);
    const frameEdges = new THREE.EdgesGeometry(frameGeo);
    const frameMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.4 });
    const frameLine = new THREE.LineSegments(frameEdges, frameMat);
    this.matrixGroup.add(frameLine);
  }

  buildSynapticLines() {
    const linePositions = [];
    const lineColors = [];
    const maxLines = 4800;
    let created = 0;

    for (let i = 0; i < this.neuronData.length && created < maxLines; i += 3) {
      const n1 = this.neuronData[i];
      for (let j = i + 1; j < Math.min(this.neuronData.length, i + 28); j++) {
        const n2 = this.neuronData[j];
        const distSq = (n1.x - n2.x)**2 + (n1.y - n2.y)**2 + (n1.z - n2.z)**2;
        if (distSq < 0.14 && distSq > 0.01) {
          linePositions.push(n1.x, n1.y, n1.z);
          linePositions.push(n2.x, n2.y, n2.z);

          lineColors.push(0.0, 0.4, 0.3);
          lineColors.push(0.0, 0.4, 0.3);

          created++;
          if (created >= maxLines) break;
        }
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    this.synapseMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.synapticLines = new THREE.LineSegments(lineGeo, this.synapseMaterial);
    this.brainGroup.add(this.synapticLines);
  }

  setupAxonPulses() {
    const pulseCount = 350;
    const pulseGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(pulseCount * 3);
    const col = new Float32Array(pulseCount * 3);

    for (let i = 0; i < pulseCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;

      col[i * 3] = 1.0;
      col[i * 3 + 1] = 1.0;
      col[i * 3 + 2] = 1.0;
    }

    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pulseGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const pulseMat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.axonParticles = new THREE.Points(pulseGeo, pulseMat);
    this.brainGroup.add(this.axonParticles);
  }

  setupLaserProbes() {
    const laserGeo = new THREE.CylinderGeometry(0.015, 0.015, 4.5, 12);
    laserGeo.translate(0, 2.25, 0);
    this.laserMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending
    });
    this.laserProbe = new THREE.Mesh(laserGeo, this.laserMaterial);
    this.laserProbe.rotation.x = Math.PI / 2;
    this.scene.add(this.laserProbe);
  }

  setupClickHandler() {
    this.mouse = new THREE.Vector2();
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.triggerLaserShock(this.mouse.x, this.mouse.y);
    });
  }

  setupResize() {
    window.addEventListener('resize', () => {
      if (!this.container) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  setViewMode(mode) {
    this.viewMode = mode;
    if (mode === '3d') {
      this.brainGroup.visible = true;
      this.matrixGroup.visible = false;
      this.resetCamera();
    } else if (mode === 'matrix') {
      this.brainGroup.visible = false;
      this.matrixGroup.visible = true;
      this.camera.position.set(0, 0, 4.2);
      this.controls.target.set(0, 0, 0);
    } else if (mode === 'synapses') {
      this.brainGroup.visible = true;
      this.matrixGroup.visible = false;
      this.synapseMaterial.opacity = 0.8;
      this.neuronMaterial.opacity = 0.5;
    } else if (mode === 'retinotopy') {
      this.brainGroup.visible = true;
      this.matrixGroup.visible = true;
      this.camera.position.set(0, 1.2, 4.5);
      this.controls.target.set(0, 0, 0);
    }
  }

  setFluorophore(mode) {
    this.fluorophore = mode;
    if (mode === 'gcamp') {
      this.coreLight.color.setHex(0x00ff88);
    } else if (mode === 'voltage') {
      this.coreLight.color.setHex(0x00f0ff);
    } else if (mode === 'heat') {
      this.coreLight.color.setHex(0xffaa00);
    } else if (mode === 'neon') {
      this.coreLight.color.setHex(0xff007f);
    } else if (mode === 'dopamine') {
      this.coreLight.color.setHex(0xffd700);
    }
  }

  setGain(val) {
    this.lumGain = val;
  }

  toggleSliceMode() {
    this.sliceMode = !this.sliceMode;
    return this.sliceMode;
  }

  resetCamera() {
    this.camera.position.set(0, 0, 5.2);
    this.controls.target.set(0, 0, 0);
  }

  triggerLaserShock(ndcX = 0, ndcY = 0, regionTarget = null) {
    this.laserMaterial.opacity = 0.95;
    this.laserProbe.position.set(ndcX * 2.0, ndcY * 2.0, 2.0);

    const shockRadius = 1.3;
    this.neuronData.forEach(n => {
      let excite = false;
      if (regionTarget) {
        if (n.region === regionTarget || (regionTarget === 'optic' && (n.region === 'optic_l' || n.region === 'optic_r'))) {
          excite = true;
        }
      } else {
        const d = Math.sqrt((n.x - ndcX * 2.0)**2 + (n.y - ndcY * 2.0)**2);
        if (d < shockRadius) {
          n.activity = Math.min(3.5, n.activity + (1.3 - d) * 3.0);
        }
      }

      if (excite) {
        n.activity = Math.min(3.5, n.activity + 2.5);
      }
    });

    // Also trigger on matrix dots
    this.matrixDotData.forEach(dot => {
      const d = Math.sqrt((dot.x - ndcX * 2.0)**2 + (dot.y - ndcY * 2.0)**2);
      if (d < shockRadius) {
        dot.activity = Math.min(3.5, dot.activity + 2.5);
      }
    });

    setTimeout(() => {
      this.laserMaterial.opacity = 0;
    }, 280);
  }

  /**
   * Universal Retinotopic / Tonotopic Video Frame & Bitstream Mapping
   * Plays uploaded media through EVERY single dot in both 3D connectome and Optogenetic Matrix!
   */
  mapVideoFrame(pixelData, width, height, seizureIndex, audioEnergy = 0) {
    this.seizureIntensity = seizureIndex;
    if (!pixelData || pixelData.length === 0) return;

    const colors = this.neuronGeometry.attributes.color.array;
    const isSeizure = seizureIndex > 0.42;
    const szStorm = seizureIndex * 2.0;

    if (this.sliceMode) {
      this.slicePlaneZ = Math.sin(this.time * 2.2) * 0.9;
    }

    // Color palette constants based on active fluorophore
    let baseR, baseG, baseB, peakR, peakG, peakB;
    if (this.fluorophore === 'gcamp') {
      baseR = 0.0; baseG = 0.28; baseB = 0.12;
      peakR = 0.2; peakG = 1.0; peakB = 0.45;
    } else if (this.fluorophore === 'voltage') {
      baseR = 0.0; baseG = 0.18; baseB = 0.4;
      peakR = 0.0; peakG = 0.9; peakB = 1.0;
    } else if (this.fluorophore === 'heat') {
      baseR = 0.28; baseG = 0.08; baseB = 0.0;
      peakR = 1.0; peakG = 0.55; peakB = 0.0;
    } else if (this.fluorophore === 'neon') {
      baseR = 0.2; baseG = 0.0; baseB = 0.35;
      peakR = 0.95; peakG = 0.1; peakB = 0.85;
    } else { // dopamine gold
      baseR = 0.25; baseG = 0.2; baseB = 0.0;
      peakR = 1.0; peakG = 0.85; peakB = 0.1;
    }

    // 1. Map into all 6800 3D Connectome Neurons
    for (let i = 0; i < this.neuronData.length; i++) {
      const n = this.neuronData[i];

      const px = Math.floor(n.videoU * (width - 1));
      const py = Math.floor((1.0 - n.videoV) * (height - 1));
      const pIdx = (py * width + px) * 4;

      const r = pixelData[pIdx] / 255;
      const g = pixelData[pIdx + 1] / 255;
      const b = pixelData[pIdx + 2] / 255;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) * this.lumGain;

      n.lum = lum;
      n.activity = n.activity * 0.80 + (lum + audioEnergy * 0.5) * 0.20;

      if (isSeizure) {
        const epilepticWave = Math.sin(this.time * 42.0 + n.z * 6.0 + n.x * 4.0);
        n.activity += Math.max(0, epilepticWave) * szStorm;
      }

      let sliceFactor = 1.0;
      if (this.sliceMode) {
        const distZ = Math.abs(n.z - this.slicePlaneZ);
        sliceFactor = Math.max(0.08, 1.0 - distZ * 3.8);
      }

      const act = Math.min(2.8, n.activity);
      let finalR = (baseR + (peakR - baseR) * Math.min(1.0, act)) * sliceFactor;
      let finalG = (baseG + (peakG - baseG) * Math.min(1.0, act)) * sliceFactor;
      let finalB = (baseB + (peakB - baseB) * Math.min(1.0, act)) * sliceFactor;

      if (act > 1.15 || isSeizure) {
        finalR = Math.min(1.0, finalR + (act - 1.0) * 0.85);
        finalG = Math.min(1.0, finalG + (act - 1.0) * 0.5);
        finalB = Math.min(1.0, finalB + (act - 1.0) * 0.4);
      }

      colors[i * 3] = finalR;
      colors[i * 3 + 1] = finalG;
      colors[i * 3 + 2] = finalB;
    }
    this.neuronGeometry.attributes.color.needsUpdate = true;

    // 2. Map into Optogenetic Matrix Grid (All 768 Micro-LED Dots)
    if (this.matrixGeometry) {
      const matColors = this.matrixGeometry.attributes.color.array;
      for (let i = 0; i < this.matrixDotData.length; i++) {
        const dot = this.matrixDotData[i];
        const px = Math.floor(dot.u * (width - 1));
        const py = Math.floor(dot.v * (height - 1));
        const pIdx = (py * width + px) * 4;

        const r = pixelData[pIdx] / 255;
        const g = pixelData[pIdx + 1] / 255;
        const b = pixelData[pIdx + 2] / 255;
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) * this.lumGain;

        dot.activity = dot.activity * 0.78 + (lum + audioEnergy * 0.5) * 0.22;
        if (isSeizure) {
          dot.activity += Math.max(0, Math.sin(this.time * 40 + dot.x * 5)) * szStorm;
        }

        const act = Math.min(2.5, dot.activity);
        matColors[i * 3] = (baseR + (peakR - baseR) * Math.min(1.0, act));
        matColors[i * 3 + 1] = (baseG + (peakG - baseG) * Math.min(1.0, act));
        matColors[i * 3 + 2] = (baseB + (peakB - baseB) * Math.min(1.0, act));
      }
      this.matrixGeometry.attributes.color.needsUpdate = true;
    }

    if (this.synapseMaterial) {
      this.synapseMaterial.opacity = 0.25 + (seizureIndex * 0.7);
    }
    this.coreLight.intensity = 1.2 + seizureIndex * 5.0 + audioEnergy * 3.0;
  }

  update(dt) {
    this.time += dt;
    this.controls.update();

    // Idle brain float / rotation
    if (this.viewMode === '3d' || this.viewMode === 'synapses') {
      this.brainGroup.rotation.y = Math.sin(this.time * 0.35) * 0.12;
    }

    // Axon action potential pulses movement
    if (this.axonParticles) {
      const pos = this.axonParticles.geometry.attributes.position.array;
      const speed = 1.2 + this.seizureIntensity * 4.5;

      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] -= dt * speed * 0.9;
        if (pos[i + 1] < -1.4) {
          pos[i] = (Math.random() - 0.5) * 1.8;
          pos[i + 1] = 0.8 + Math.random() * 0.4;
          pos[i + 2] = (Math.random() - 0.5) * 1.0;
        }
      }
      this.axonParticles.geometry.attributes.position.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
