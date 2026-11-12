import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class FlyModel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
    this.camera.position.set(2.4, 2.2, 3.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 14;
    this.controls.minDistance = 0.8;
    this.controls.target.set(0, 0, 0);

    // Animation & Locomotion state
    this.seizureIntensity = 0;
    this.spikeActivity = 0;
    this.isXRay = true;
    this.time = 0;

    // Walking / Navigation System
    this.walkMode = 'roam'; // 'roam', 'manual', 'target', 'groom', 'seizure'
    this.walkSpeed = 1.0;   // speed multiplier
    this.gaitPhase = 0;
    this.stepCadence = 0;   // steps per second readout
    this.isMoving = true;

    // Fly Transform in Arena (XZ Plane)
    this.position = new THREE.Vector3(0, 0, 0);
    this.rotationY = 0;
    this.targetRotationY = 0;
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.targetPos = null;
    this.arenaRadius = 2.4;

    // Manual Input State (WASD)
    this.input = { forward: 0, turn: 0 };

    // Camera mode
    this.camMode = 'arena'; // 'arena', 'follow', 'macro', 'topdown'

    // Root groups
    this.arenaGroup = new THREE.Group();
    this.scene.add(this.arenaGroup);

    this.flyGroup = new THREE.Group();
    this.scene.add(this.flyGroup);

    this.parts = {
      headGroup: null,
      eyes: [],
      thorax: null,
      abdomen: null,
      leftWing: null,
      rightWing: null,
      legs: [],
      antennae: [],
      proboscis: null,
      internalBrain: null,
      sparks: null,
      shadow: null,
      navMarker: null
    };

    this.setupLighting();
    this.buildArena();
    this.buildFly();
    this.buildSparks();
    this.buildNavMarker();
    this.setupResize();
    this.setupFloorRaycaster();
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x354458, 2.2);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.6);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x00f0ff, 2.2);
    rimLight.position.set(-5, 4, -4);
    this.scene.add(rimLight);

    this.brainLight = new THREE.PointLight(0x00ff88, 2.0, 3.5);
    this.brainLight.position.set(0, 0.45, 0.7);
    this.flyGroup.add(this.brainLight);
  }

  buildArena() {
    // 1. Circular Arena Floor Pedestal
    const floorGeo = new THREE.CylinderGeometry(this.arenaRadius + 0.3, this.arenaRadius + 0.4, 0.15, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x070c14,
      roughness: 0.35,
      metalness: 0.75
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.075;
    this.arenaGroup.add(floorMesh);

    // 2. Holographic Grid & Concentric Navigation Rings
    const ringMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.35 });
    for (let r = 0.6; r <= this.arenaRadius; r += 0.6) {
      const ringGeo = new THREE.BufferGeometry();
      const pts = [];
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.1) {
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.005, Math.sin(a) * r));
      }
      ringGeo.setFromPoints(pts);
      this.arenaGroup.add(new THREE.Line(ringGeo, ringMat));
    }

    // Grid coordinates
    const grid = new THREE.GridHelper(this.arenaRadius * 2, 20, 0x00f0ff, 0x162438);
    grid.position.y = 0.002;
    grid.material.opacity = 0.25;
    grid.material.transparent = true;
    this.arenaGroup.add(grid);

    // Outer boundary barrier ring
    const borderGeo = new THREE.TorusGeometry(this.arenaRadius + 0.1, 0.025, 12, 48);
    borderGeo.rotateX(Math.PI / 2);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6 });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.y = 0.01;
    this.arenaGroup.add(borderMesh);
  }

  buildNavMarker() {
    const markerGeo = new THREE.RingGeometry(0.1, 0.16, 24);
    markerGeo.rotateX(-Math.PI / 2);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    this.parts.navMarker = new THREE.Mesh(markerGeo, markerMat);
    this.parts.navMarker.position.y = 0.015;
    this.scene.add(this.parts.navMarker);
  }

  createOmmatidiaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#800512';
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = '#380005';
    ctx.lineWidth = 1;
    const r = 6;
    for (let y = 0; y < 128 + r; y += r * 1.5) {
      for (let x = 0; x < 128 + r; x += r * Math.sqrt(3)) {
        const cx = x + ((Math.floor(y / (r * 1.5)) % 2) * (r * Math.sqrt(3) / 2));
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2;
          const px = cx + Math.cos(ang) * (r * 0.9);
          const py = y + Math.sin(ang) * (r * 0.9);
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  buildFly() {
    this.cuticleMaterial = new THREE.MeshStandardMaterial({
      color: 0x24140a,
      roughness: 0.28,
      metalness: 0.35
    });

    const eyeTex = this.createOmmatidiaTexture();
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      map: eyeTex,
      color: 0xaa0e20,
      emissive: 0x55000a,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.4
    });

    this.wingMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transmission: 0.92,
      opacity: 0.95,
      transparent: true,
      roughness: 0.08,
      ior: 1.52,
      reflectivity: 0.7,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      side: THREE.DoubleSide
    });

    // Shadow blob on ground
    const shadowGeo = new THREE.PlaneGeometry(1.2, 1.6);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.parts.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.parts.shadow.position.y = 0.005;
    this.flyGroup.add(this.parts.shadow);

    // 1. THORAX
    const thoraxGeo = new THREE.SphereGeometry(0.48, 24, 20);
    thoraxGeo.scale(0.85, 0.78, 1.2);
    this.parts.thorax = new THREE.Mesh(thoraxGeo, this.cuticleMaterial);
    this.parts.thorax.position.set(0, 0.45, 0);
    this.flyGroup.add(this.parts.thorax);

    const scutGeo = new THREE.ConeGeometry(0.22, 0.3, 16);
    scutGeo.rotateX(Math.PI / 2.3);
    const scutellum = new THREE.Mesh(scutGeo, this.cuticleMaterial);
    scutellum.position.set(0, 0.38, -0.5);
    this.parts.thorax.add(scutellum);

    // 2. HEAD & EYES
    this.parts.headGroup = new THREE.Group();
    this.parts.headGroup.position.set(0, 0.52, 0.72);
    this.flyGroup.add(this.parts.headGroup);

    const headGeo = new THREE.SphereGeometry(0.32, 20, 18);
    headGeo.scale(1.1, 0.85, 0.8);
    const headMesh = new THREE.Mesh(headGeo, this.cuticleMaterial);
    this.parts.headGroup.add(headMesh);

    // Internal Brain Hologram
    const brainMeshGeo = new THREE.IcosahedronGeometry(0.18, 2);
    this.internalBrainMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      transparent: true,
      opacity: 0.9
    });
    this.parts.internalBrain = new THREE.Mesh(brainMeshGeo, this.internalBrainMaterial);
    this.parts.internalBrain.position.set(0, 0.04, 0);
    this.parts.headGroup.add(this.parts.internalBrain);

    // Compound Eyes
    const eyeGeo = new THREE.SphereGeometry(0.24, 22, 18);
    eyeGeo.scale(0.85, 1.15, 0.95);

    const leftEye = new THREE.Mesh(eyeGeo, this.eyeMaterial);
    leftEye.position.set(-0.24, 0.05, 0.06);
    leftEye.rotation.set(0.1, -0.38, 0.2);
    this.parts.headGroup.add(leftEye);
    this.parts.eyes.push(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, this.eyeMaterial);
    rightEye.position.set(0.24, 0.05, 0.06);
    rightEye.rotation.set(0.1, 0.38, -0.2);
    this.parts.headGroup.add(rightEye);
    this.parts.eyes.push(rightEye);

    // Antennae
    for (let side = -1; side <= 1; side += 2) {
      const antGroup = new THREE.Group();
      antGroup.position.set(side * 0.07, 0.07, 0.28);

      const antBaseGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const antBase = new THREE.Mesh(antBaseGeo, this.cuticleMaterial);
      antGroup.add(antBase);

      const aristaCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.07, 0.1, 0.08),
        new THREE.Vector3(side * 0.16, 0.18, 0.06)
      ]);
      const aristaGeo = new THREE.TubeGeometry(aristaCurve, 10, 0.007, 6, false);
      const arista = new THREE.Mesh(aristaGeo, this.cuticleMaterial);
      antGroup.add(arista);

      this.parts.headGroup.add(antGroup);
      this.parts.antennae.push(antGroup);
    }

    // Proboscis
    const probGroup = new THREE.Group();
    probGroup.position.set(0, -0.18, 0.14);
    probGroup.rotation.x = -0.35;
    const probGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.26, 8);
    const probMesh = new THREE.Mesh(probGeo, this.cuticleMaterial);
    probGroup.add(probMesh);

    const labellumGeo = new THREE.SphereGeometry(0.065, 8, 8);
    labellumGeo.scale(1.2, 0.7, 1);
    const labellum = new THREE.Mesh(labellumGeo, this.cuticleMaterial);
    labellum.position.y = -0.14;
    probGroup.add(labellum);
    this.parts.headGroup.add(probGroup);
    this.parts.proboscis = probGroup;

    // 3. ABDOMEN
    const abdomenGroup = new THREE.Group();
    abdomenGroup.position.set(0, 0.42, -0.6);

    for (let i = 0; i < 6; i++) {
      const segRadius = 0.38 * (1.0 - i * 0.12);
      const segLen = 0.22;
      const segGeo = new THREE.CylinderGeometry(segRadius * 0.88, segRadius, segLen, 16);
      segGeo.rotateX(Math.PI / 2);

      const isDark = (i >= 2 && i % 2 === 1) || (i === 5);
      const segMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x150903 : 0x7a4816,
        roughness: 0.35,
        metalness: 0.15
      });

      const segMesh = new THREE.Mesh(segGeo, segMat);
      segMesh.position.z = -i * 0.19;
      abdomenGroup.add(segMesh);
    }
    this.flyGroup.add(abdomenGroup);
    this.parts.abdomen = abdomenGroup;

    // 4. WINGS
    this.parts.leftWing = this.createWing(1);
    this.parts.leftWing.position.set(0.22, 0.65, -0.05);
    this.flyGroup.add(this.parts.leftWing);

    this.parts.rightWing = this.createWing(-1);
    this.parts.rightWing.position.set(-0.22, 0.65, -0.05);
    this.flyGroup.add(this.parts.rightWing);

    // 5. SIX ARTICULATED WALKING LEGS (Alternating Tripod Geometry)
    // tripodGroup: 0 = Tripod A (L1, R2, L3), 1 = Tripod B (R1, L2, R3)
    const legConfigs = [
      { side: 1, z: 0.22, rotX: 0.28, name: 'L_Fore', tripod: 0, forwardReach: 0.2 },
      { side: -1, z: 0.22, rotX: 0.28, name: 'R_Fore', tripod: 1, forwardReach: 0.2 },
      { side: 1, z: 0.0, rotX: 0.0, name: 'L_Mid', tripod: 1, forwardReach: 0.0 },
      { side: -1, z: 0.0, rotX: 0.0, name: 'R_Mid', tripod: 0, forwardReach: 0.0 },
      { side: 1, z: -0.24, rotX: -0.32, name: 'L_Hind', tripod: 0, forwardReach: -0.2 },
      { side: -1, z: -0.24, rotX: -0.32, name: 'R_Hind', tripod: 1, forwardReach: -0.2 }
    ];

    legConfigs.forEach((lc) => {
      const leg = this.createArticulatedLeg(lc);
      this.flyGroup.add(leg.root);
      this.parts.legs.push(leg);
    });
  }

  createWing(side) {
    const wingGroup = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(side * 0.5, 0.2, side * 1.6, 0.25, side * 1.9, -0.35);
    shape.bezierCurveTo(side * 1.8, -0.85, side * 0.9, -0.75, 0, 0);

    const shapeGeo = new THREE.ShapeGeometry(shape, 24);
    const wingMesh = new THREE.Mesh(shapeGeo, this.wingMaterial);
    wingMesh.rotation.x = Math.PI / 2;
    wingGroup.add(wingMesh);

    const veinMat = new THREE.LineBasicMaterial({ color: 0x77aacc, transparent: true, opacity: 0.75 });
    const veinPoints1 = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 1.1, 0, -0.18),
      new THREE.Vector3(side * 1.8, 0, -0.35)
    ];
    wingGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(veinPoints1), veinMat));

    wingGroup.rotation.y = side * 0.22;
    wingGroup.rotation.z = side * 0.08;
    return wingGroup;
  }

  createArticulatedLeg(config) {
    const root = new THREE.Group();
    root.position.set(config.side * 0.28, 0.32, config.z);

    // Coxa / Femur
    const femurLen = 0.55;
    const femurGeo = new THREE.CylinderGeometry(0.035, 0.045, femurLen, 8);
    femurGeo.translate(0, -femurLen / 2, 0);
    const femur = new THREE.Mesh(femurGeo, this.cuticleMaterial);
    femur.rotation.z = config.side * 0.7;
    femur.rotation.x = config.rotX;
    root.add(femur);

    // Tibia
    const tibiaGroup = new THREE.Group();
    tibiaGroup.position.set(0, -femurLen, 0);
    const tibiaLen = 0.65;
    const tibiaGeo = new THREE.CylinderGeometry(0.022, 0.032, tibiaLen, 8);
    tibiaGeo.translate(0, -tibiaLen / 2, 0);
    const tibia = new THREE.Mesh(tibiaGeo, this.cuticleMaterial);
    tibia.rotation.z = -config.side * 1.15;
    tibiaGroup.add(tibia);
    femur.add(tibiaGroup);

    // Tarsus (Claw touching floor)
    const tarsusLen = 0.45;
    const tarsusGeo = new THREE.CylinderGeometry(0.012, 0.02, tarsusLen, 6);
    tarsusGeo.translate(0, -tarsusLen / 2, 0);
    const tarsus = new THREE.Mesh(tarsusGeo, this.cuticleMaterial);
    tarsus.position.set(0, -tibiaLen, 0);
    tarsus.rotation.z = config.side * 0.55;
    tarsus.rotation.x = config.rotX * 0.5;
    tibiaGroup.add(tarsus);

    return {
      root,
      femur,
      tibiaGroup,
      tarsus,
      side: config.side,
      baseZ: config.z,
      baseRotX: config.rotX,
      tripod: config.tripod,
      name: config.name,
      forwardReach: config.forwardReach
    };
  }

  buildSparks() {
    const sparkCount = 120;
    const sparkGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(sparkCount * 3);
    const colors = new Float32Array(sparkCount * 3);

    for (let i = 0; i < sparkCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1.8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
      colors[i * 3] = 0.2;
      colors[i * 3 + 1] = 0.95;
      colors[i * 3 + 2] = 1.0;
    }

    sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const sparkMat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending
    });

    this.parts.sparks = new THREE.Points(sparkGeo, sparkMat);
    this.flyGroup.add(this.parts.sparks);
  }

  setupFloorRaycaster() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      // Only set target if in click-to-walk or roam mode with Shift or double click
      if (e.button !== 0) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, this.camera);
      const intersectPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, intersectPoint)) {
        if (intersectPoint.length() <= this.arenaRadius) {
          this.setTargetPosition(intersectPoint.x, intersectPoint.z);
        }
      }
    });
  }

  setTargetPosition(x, z) {
    this.targetPos = new THREE.Vector3(x, 0, z);
    this.walkMode = 'target';
    if (this.parts.navMarker) {
      this.parts.navMarker.position.set(x, 0.015, z);
      this.parts.navMarker.material.opacity = 0.9;
    }
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

  setWalkMode(mode) {
    this.walkMode = mode;
    if (mode === 'roam') {
      this.targetPos = null;
    }
  }

  setWalkSpeed(spd) {
    this.walkSpeed = spd;
  }

  setManualInput(forward, turn) {
    this.input.forward = forward;
    this.input.turn = turn;
    if (forward !== 0 || turn !== 0) {
      this.walkMode = 'manual';
    }
  }

  setCamMode(mode) {
    this.camMode = mode;
    if (mode === 'arena') {
      this.camera.position.set(2.2, 2.0, 3.2);
      this.controls.target.set(0, 0.25, 0);
    } else if (mode === 'follow') {
      // Behind the fly
      this.camera.position.set(this.position.x, 1.2, this.position.z + 1.8);
      this.controls.target.copy(this.position);
    } else if (mode === 'macro') {
      this.camera.position.set(this.position.x + 0.3, 0.8, this.position.z + 0.8);
      this.controls.target.set(this.position.x, 0.45, this.position.z + 0.3);
    } else if (mode === 'topdown') {
      this.camera.position.set(0, 5.2, 0.01);
      this.controls.target.set(0, 0, 0);
    }
  }

  resetPosition() {
    this.position.set(0, 0, 0);
    this.rotationY = 0;
    this.targetRotationY = 0;
    this.velocity.set(0, 0, 0);
    this.targetPos = null;
    if (this.parts.navMarker) this.parts.navMarker.material.opacity = 0;
  }

  setSeizureState(intensity, spikeRate) {
    this.seizureIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
    this.spikeActivity = THREE.MathUtils.clamp(spikeRate, 0, 1);
  }

  setFluorophore(mode) {
    const colors = {
      gcamp: 0x00ff88,
      voltage: 0x00f0ff,
      heat: 0xffaa00,
      neon: 0xff007f,
      dopamine: 0xffd700
    };
    const c = colors[mode] || 0x00ff88;
    this.internalBrainMaterial.color.setHex(c);
    this.brainLight.color.setHex(c);
  }

  toggleXRay() {
    this.isXRay = !this.isXRay;
    this.parts.internalBrain.visible = this.isXRay;
    return this.isXRay;
  }

  /**
   * Main Locomotion Physics and Kinematics Update
   */
  update(dt) {
    this.time += dt;
    this.controls.update();

    const sz = this.seizureIntensity;
    const spk = this.spikeActivity;
    const isSeizing = sz > 0.35;

    // 1. UPDATE LOCOMOTION BEHAVIOR & STEERING
    let moveSpeed = 0;
    let turnSpeed = 0;

    if (isSeizing) {
      // Spastic erratic spinning / sprint / freeze
      moveSpeed = (sz > 0.6) ? 0.2 : (0.8 + sz * 1.5) * this.walkSpeed;
      turnSpeed = Math.sin(this.time * 12) * (sz * 6.0);
    } else if (this.walkMode === 'manual') {
      moveSpeed = this.input.forward * 1.2 * this.walkSpeed;
      turnSpeed = this.input.turn * 3.0;
    } else if (this.walkMode === 'target' && this.targetPos) {
      const diffX = this.targetPos.x - this.position.x;
      const diffZ = this.targetPos.z - this.position.z;
      const dist = Math.sqrt(diffX * diffX + diffZ * diffZ);

      if (dist > 0.1) {
        const desiredAngle = Math.atan2(diffX, diffZ);
        let angleDiff = desiredAngle - this.rotationY;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        turnSpeed = Math.max(-4.0, Math.min(4.0, angleDiff * 5.0));
        moveSpeed = Math.max(0.2, Math.min(1.4, dist * 1.5)) * this.walkSpeed;
      } else {
        this.targetPos = null;
        if (this.parts.navMarker) this.parts.navMarker.material.opacity = 0;
        this.walkMode = 'roam';
      }
    } else if (this.walkMode === 'roam') {
      // Autonomous gentle exploration & boundary avoidance
      const distFromCenter = this.position.length();

      if (distFromCenter > this.arenaRadius - 0.4) {
        // Steer back towards center
        const centerAngle = Math.atan2(-this.position.x, -this.position.z);
        let angleDiff = centerAngle - this.rotationY;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        turnSpeed = Math.max(-3.5, Math.min(3.5, angleDiff * 4.0));
        moveSpeed = 0.6 * this.walkSpeed;
      } else {
        // Natural wandering with random curves and occasional pause
        const wanderNoise = Math.sin(this.time * 0.8) * Math.cos(this.time * 1.4);
        turnSpeed = wanderNoise * 1.8;

        // Periodic pause to groom / rest
        const pauseCycle = Math.sin(this.time * 0.4);
        if (pauseCycle > 0.85) {
          moveSpeed = 0;
        } else {
          moveSpeed = (0.7 + Math.sin(this.time * 1.2) * 0.3) * this.walkSpeed;
        }
      }
    }

    // Integrate rotation and position
    this.rotationY += turnSpeed * dt;
    this.flyGroup.rotation.y = this.rotationY;

    const fwdX = Math.sin(this.rotationY);
    const fwdZ = Math.cos(this.rotationY);

    if (moveSpeed !== 0 && !isSeizing) {
      this.position.x += fwdX * moveSpeed * dt;
      this.position.z += fwdZ * moveSpeed * dt;

      // Clamp inside arena boundary
      if (this.position.length() > this.arenaRadius) {
        this.position.normalize().multiplyScalar(this.arenaRadius);
      }
    }

    this.flyGroup.position.x = this.position.x;
    this.flyGroup.position.z = this.position.z;

    // 2. ALTERNATING TRIPOD GAIT KINEMATICS
    const isActuallyWalking = Math.abs(moveSpeed) > 0.05 || Math.abs(turnSpeed) > 0.2;
    const baseGaitFreq = isActuallyWalking ? (6.0 * (moveSpeed + 0.4) * this.walkSpeed) : 0;
    const gaitFreq = isSeizing ? (30 + sz * 50) : baseGaitFreq;

    if (gaitFreq > 0) {
      this.gaitPhase += dt * gaitFreq * Math.PI * 2;
      this.stepCadence = Math.round(gaitFreq);
    } else {
      this.stepCadence = 0;
    }

    // Animate articulated legs with alternating tripod gait
    this.parts.legs.forEach((leg, i) => {
      if (isSeizing) {
        // Convulsive twitching & tremors
        const jitterFreq = 30 + (i % 3) * 15;
        const jitterX = Math.sin(this.time * jitterFreq + i) * (0.45 * sz);
        const jitterZ = Math.cos(this.time * jitterFreq + i * 2) * (0.55 * sz);

        leg.femur.rotation.x = leg.baseRotX + jitterX;
        leg.tibiaGroup.rotation.z = -leg.side * (1.15 + jitterZ);
      } else if (isActuallyWalking) {
        // Alternating tripod: Group A phase vs Group B phase (shifted by π)
        const phaseOffset = (leg.tripod === 0) ? 0 : Math.PI;
        const currentPhase = this.gaitPhase + phaseOffset;

        // Swing & Stance cycle
        const swing = Math.sin(currentPhase);
        const lift = Math.max(0, Math.cos(currentPhase));

        // Femur swings forward and backward
        leg.femur.rotation.x = leg.baseRotX + swing * 0.28;
        // Tibia lifts during swing phase to clear ground
        leg.tibiaGroup.rotation.z = -leg.side * (1.15 - lift * 0.35);
      } else {
        // Idle calm stance with subtle breathing
        const breathe = Math.sin(this.time * 2.0 + i) * 0.02;
        leg.femur.rotation.x = leg.baseRotX + breathe;
        leg.tibiaGroup.rotation.z = -leg.side * 1.15;
      }
    });

    // Body bobbing and pitch/roll while walking
    if (isActuallyWalking && !isSeizing) {
      const bob = Math.sin(this.gaitPhase * 2) * 0.02;
      this.flyGroup.position.y = bob;
      this.parts.thorax.rotation.z = Math.sin(this.gaitPhase) * 0.03;
    } else {
      this.flyGroup.position.y = 0;
      this.parts.thorax.rotation.z = 0;
    }

    // 3. WINGS - HIGH SPEED BUZZING & SEIZURE FLUTTER
    if (this.parts.leftWing && this.parts.rightWing) {
      if (sz > 0.25) {
        const wingFreq = 50 + sz * 75;
        const flutter = Math.sin(this.time * wingFreq) * (0.4 + sz * 0.8);
        this.parts.leftWing.rotation.x = flutter;
        this.parts.leftWing.rotation.y = 0.25 + Math.cos(this.time * wingFreq * 0.5) * 0.25;
        this.parts.rightWing.rotation.x = -flutter;
        this.parts.rightWing.rotation.y = -0.25 - Math.cos(this.time * wingFreq * 0.5) * 0.25;
      } else {
        const gentle = Math.sin(this.time * 2.5) * 0.04 + (spk * 0.1);
        this.parts.leftWing.rotation.x = gentle;
        this.parts.rightWing.rotation.x = -gentle;
      }
    }

    // 4. COMPOUND EYES & INTERNAL BRAIN GLOW
    const eyeEmissive = 0.3 + spk * 1.8 + (sz > 0.4 ? Math.sin(this.time * 45) * 0.9 : 0);
    this.eyeMaterial.emissiveIntensity = Math.max(0, eyeEmissive);
    if (sz > 0.45) {
      this.eyeMaterial.emissive.setHex(0xff2244);
    } else {
      this.eyeMaterial.emissive.setHex(0x55000a);
    }

    if (this.parts.internalBrain) {
      const brainScale = 1.0 + Math.sin(this.time * 18) * 0.12 * (spk + sz * 2.5);
      this.parts.internalBrain.scale.set(brainScale, brainScale, brainScale);
      this.parts.internalBrain.rotation.y += dt * (1.2 + sz * 12);
      this.brainLight.intensity = (0.6 + spk * 2.2 + sz * 4.5);
    }

    // 5. HEAD & PROBOSCIS VIBRATIONS
    if (this.parts.headGroup) {
      if (sz > 0.3) {
        this.parts.headGroup.rotation.x = (Math.random() - 0.5) * 0.3 * sz;
        this.parts.headGroup.rotation.y = (Math.random() - 0.5) * 0.35 * sz;
      } else {
        this.parts.headGroup.rotation.set(0, Math.sin(this.time * 1.2) * 0.04, 0);
      }
    }

    // 6. SEIZURE CONVULSION SHUDDER
    if (sz > 0.45) {
      // High frequency whole-body seizure jitter and arching
      this.flyGroup.position.y = Math.sin(this.time * 40) * 0.04 * sz;
      this.flyGroup.rotation.z = Math.sin(this.time * 30) * 0.15 * sz;
      this.flyGroup.rotation.x = Math.sin(this.time * 25) * 0.12 * sz - (sz * 0.2); // reared arch
    } else {
      this.flyGroup.rotation.x = 0;
    }

    // 7. SPARKS
    if (this.parts.sparks) {
      if (sz > 0.35) {
        this.parts.sparks.material.opacity = Math.min(1.0, (sz - 0.25) * 2.2);
        const pos = this.parts.sparks.geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += (Math.random() - 0.5) * 0.18;
          pos[i + 1] += (Math.random() - 0.5) * 0.18;
          pos[i + 2] += (Math.random() - 0.5) * 0.18;
          if (Math.sqrt(pos[i]**2 + pos[i+1]**2 + pos[i+2]**2) > 1.3) {
            pos[i] = (Math.random() - 0.5) * 0.5;
            pos[i + 1] = 0.25 + (Math.random() - 0.5) * 0.35;
            pos[i + 2] = (Math.random() - 0.5) * 0.5;
          }
        }
        this.parts.sparks.geometry.attributes.position.needsUpdate = true;
      } else {
        this.parts.sparks.material.opacity = 0;
      }
    }

    // 8. CAMERA FOLLOW MODE
    if (this.camMode === 'follow') {
      const targetCamPos = new THREE.Vector3(
        this.position.x - fwdX * 2.0,
        1.4,
        this.position.z - fwdZ * 2.0
      );
      this.camera.position.lerp(targetCamPos, 0.08);
      this.controls.target.lerp(this.position, 0.1);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
