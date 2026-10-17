import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { bossPatternForPhase, type BossAttackPattern, type EnemyArchetype, type MissionDefinition, type MissionId } from './missions';
import type { AudioEngine } from './audio';
import type { ThemeId } from './storage';
import { advanceBoostState, applyFrameIndependentDamping, classifyProjectilePass, pointToSegmentDistanceSquared } from './physics';

export type GameEvent =
  | { type: 'telemetry'; speed: number; altitude: number; boost: number }
  | { type: 'gate'; count: number }
  | { type: 'enemyDestroyed'; count: number; archetype?: EnemyArchetype }
  | { type: 'boss'; hp: number; phase: number; exposed: boolean }
  | { type: 'bossDestroyed' }
  | { type: 'damage'; shield: number }
  | { type: 'warning'; boss: boolean; pattern: BossAttackPattern }
  | { type: 'nearMiss'; count: number; points: number; score: number }
  | { type: 'score'; value: number }
  | { type: 'hitConfirmed' }
  | { type: 'lock'; locked: boolean }
  | { type: 'toast'; text: string };

interface Gate {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  collected: boolean;
  baseY: number;
}

interface Enemy {
  group: THREE.Group;
  core: THREE.Mesh;
  coreMaterial: THREE.MeshStandardMaterial;
  rings: THREE.Mesh[];
  alive: boolean;
  boss: boolean;
  archetype: EnemyArchetype;
  hp: number;
  maxHp: number;
  angle: number;
  radius: number;
  baseHeight: number;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  orbitSpeed: number;
  attackTimer: number;
  attackCharge: number;
  attackReady: boolean;
  attackPattern: BossAttackPattern;
  hitFlash: number;
}

interface Bolt {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  playerOwned: boolean;
  nearMissReported: boolean;
}

interface Burst {
  points: THREE.Points;
  velocities: THREE.Vector3[];
  material: THREE.PointsMaterial;
  age: number;
  maxAge: number;
}

interface Rotor {
  group: THREE.Group;
  direction: number;
}

interface GameCallbacks {
  onEvent: (event: GameEvent) => void;
  onPause: () => void;
}

const WORLD_LIMIT = 88;
const MAX_SHIELD = 100;

export class Game {
  private readonly container: HTMLElement;
  private readonly radarCanvas: HTMLCanvasElement;
  private readonly radarContext: CanvasRenderingContext2D;
  private readonly audio: AudioEngine;
  private readonly callbacks: GameCallbacks;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 550);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly clock = new THREE.Clock();
  private readonly drone = new THREE.Group();
  private readonly rotors: Rotor[] = [];
  private readonly gates: Gate[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly bursts: Burst[] = [];
  private readonly themeMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly keys = new Set<string>();
  private readonly laserGeometry = new THREE.CylinderGeometry(0.055, 0.055, 3.3, 8);
  private readonly laserMaterial = new THREE.MeshBasicMaterial({ color: 0x39e5ef });
  private readonly enemyBoltGeometry = new THREE.SphereGeometry(0.26, 12, 12);
  private readonly enemyBoltMaterial = new THREE.MeshBasicMaterial({ color: 0xff4568 });
  private readonly droneVelocity = new THREE.Vector3();
  private readonly previousPlayerPosition = new THREE.Vector3();
  private readonly cameraOffset = new THREE.Vector3(0, 4.5, 12);
  private readonly forward = new THREE.Vector3();
  private mission: MissionDefinition | null = null;
  private mode: MissionId | null = null;
  private active = false;
  private firing = false;
  private lastShot = 0;
  private lastTelemetry = 0;
  private radarAngle = 0;
  private lockedEnemy: Enemy | null = null;
  private shield = MAX_SHIELD;
  private gateCount = 0;
  private enemyKillCount = 0;
  private nearMissCount = 0;
  private scoreBonus = 0;
  private boostEnergy = 100;
  private boosting = false;
  private damageCooldown = 0;
  private cameraShake = 0;
  private arenaGrid: THREE.GridHelper | null = null;
  private readonly arenaAccents: THREE.MeshBasicMaterial[] = [];
  private bossPhase = 1;
  private bossCycle = 0;
  private bossExposed = true;
  private themeColor = 0x39e5ef;
  private disposed = false;
  private elapsed = 0;
  private boundaryToastCooldown = 0;
  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);
  private readonly onKeyUp = (event: KeyboardEvent): void => this.handleKeyUp(event);
  private readonly onPointerDown = (event: PointerEvent): void => this.handlePointerDown(event);
  private readonly onPointerUp = (): void => { this.firing = false; };
  private readonly onBlur = (): void => { this.clearInput(); };
  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.active) this.callbacks.onPause();
  };
  private readonly onResize = (): void => this.resize();

  constructor(container: HTMLElement, radarCanvas: HTMLCanvasElement, audio: AudioEngine, callbacks: GameCallbacks) {
    this.container = container;
    this.radarCanvas = radarCanvas;
    const context = radarCanvas.getContext('2d');
    if (!context) throw new Error('O navegador não disponibilizou Canvas 2D para o radar.');
    this.radarContext = context;
    this.audio = audio;
    this.callbacks = callbacks;
    this.scene.background = new THREE.Color(0x070b12);
    this.scene.fog = new THREE.FogExp2(0x101a29, 0.0035);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');

    this.camera.position.set(0, 12, 20);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.92, 0.38, 0.24);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.bloom);
    this.buildLighting();
    this.buildEnvironment();
    this.buildDrone();
    this.buildGates();
    this.resize();
    this.installInput();
    this.animate();
  }

  getPlayerShield(): number { return this.shield; }
  getScore(): number { return this.gateCount * 100 + this.enemyKillCount * 250 + this.scoreBonus; }

  setTheme(theme: ThemeId): void {
    const colors: Record<ThemeId, number> = { cyan: 0x39e5ef, crimson: 0xff476b, gold: 0xffca68 };
    this.themeColor = colors[theme];
    this.themeMaterials.forEach((material) => {
      material.color.setHex(this.themeColor);
      material.emissive.setHex(this.themeColor);
    });
    this.laserMaterial.color.setHex(this.themeColor);
    for (const gate of this.gates) {
      const color = gate.collected ? 0x70f0c2 : this.themeColor;
      gate.ring.material.color.setHex(color);
      gate.ring.material.emissive.setHex(color);
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.clearInput();
    if (active && this.clock.running === false) this.clock.start();
  }

  startMission(mission: MissionDefinition): void {
    this.setActive(false);
    this.clearDynamicObjects();
    this.mission = mission;
    this.mode = mission.id;
    this.gateCount = 0;
    this.enemyKillCount = 0;
    this.nearMissCount = 0;
    this.scoreBonus = 0;
    this.shield = MAX_SHIELD;
    this.boostEnergy = 100;
    this.boosting = false;
    this.damageCooldown = 0;
    this.cameraShake = 0;
    this.elapsed = 0;
    this.bossPhase = 1;
    this.bossCycle = 0;
    this.bossExposed = true;
    this.lastTelemetry = 0;
    this.lastShot = 0;
    this.boundaryToastCooldown = 0;
    this.drone.position.set(0, 8, 0);
    this.previousPlayerPosition.copy(this.drone.position);
    this.drone.rotation.set(0, 0, 0);
    this.droneVelocity.set(0, 0, 0);
    this.camera.position.set(0, 12, 20);
    this.camera.lookAt(0, 8, -10);
    this.lockedEnemy = null;
    this.applyMissionPalette(mission);
    this.gates.forEach((gate, index) => {
      gate.collected = false;
      gate.group.visible = mission.id === 'training';
      gate.group.position.copy(this.gatePosition(index));
      gate.baseY = gate.group.position.y;
      const base = gate.group.position.clone().multiplyScalar(0.94);
      base.y = gate.group.position.y;
      gate.group.lookAt(base.x, base.y, base.z);
      const color = this.themeColor;
      gate.ring.material.color.setHex(color);
      gate.ring.material.emissive.setHex(color);
    });
    if (mission.id === 'intercept') {
      const wave = mission.enemyWave ?? [];
      wave.forEach((archetype, index) => this.enemies.push(this.createEnemy(index, false, wave.length, archetype)));
    } else if (mission.id === 'sentinel') {
      this.enemies.push(this.createEnemy(0, true, 1));
    }
    this.callbacks.onEvent({ type: 'damage', shield: this.shield });
    this.callbacks.onEvent({ type: 'gate', count: 0 });
    this.callbacks.onEvent({ type: 'enemyDestroyed', count: 0 });
    this.callbacks.onEvent({ type: 'score', value: 0 });
    this.callbacks.onEvent({ type: 'boss', hp: 1, phase: 1, exposed: true });
    this.callbacks.onEvent({ type: 'telemetry', speed: 0, altitude: 16, boost: 100 });
    this.audio.play('gate');
  }

  setBloomStrength(value: number): void {
    this.bloom.strength = Math.max(0, Math.min(2.4, value));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.setActive(false);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.composer.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.container.replaceChildren();
  }

  private buildLighting(): void {
    this.scene.add(new THREE.AmbientLight(0xa2b9d1, 1.35));
    const key = new THREE.DirectionalLight(0xd9f4ff, 2.1);
    key.position.set(32, 55, 24);
    this.scene.add(key);
    const fill = new THREE.HemisphereLight(0x70b8d4, 0x263448, 1.45);
    this.scene.add(fill);
  }

  private buildEnvironment(): void {
    const grid = new THREE.GridHelper(270, 108, 0x266e81, 0x163041);
    this.arenaGrid = grid;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.46;
    this.scene.add(grid);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(185, 96),
      new THREE.MeshBasicMaterial({ color: 0x122131, transparent: true, opacity: 0.56, side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.12;
    this.scene.add(floor);

    for (const [index, radius] of [24, 48, 72].entries()) {
      const material = new THREE.MeshBasicMaterial({ color: index === 0 ? 0x2d9eb7 : 0x24445d, transparent: true, opacity: index === 0 ? 0.28 : 0.2 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.075, 6, 144), material);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.04;
      this.scene.add(ring);
      this.arenaAccents.push(material);
    }

    const random = this.seededRandom(80989);
    const city = new THREE.Group();
    const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
    const buildingMaterials = [0x1a2a3c, 0x203349, 0x142536].map((color) => new THREE.MeshStandardMaterial({ color, emissive: 0x07111d, emissiveIntensity: 0.55, metalness: 0.12, roughness: 0.76 }));
    const beaconMaterials = [0x36c4d8, 0xd4537c, 0xe0b45f].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86 }));
    const windowGeometry = new THREE.BoxGeometry(0.12, 0.55, 0.06);
    for (let index = 0; index < 94; index++) {
      const angle = random() * Math.PI * 2;
      const distance = 98 + random() * 74;
      const width = 4.5 + random() * 7;
      const depth = width * (0.65 + random() * 0.45);
      const height = 14 + random() * 51;
      const mesh = new THREE.Mesh(buildingGeometry, buildingMaterials[index % buildingMaterials.length]);
      mesh.scale.set(width, height, depth);
      mesh.position.set(Math.cos(angle) * distance, height / 2 - 1, Math.sin(angle) * distance);
      mesh.rotation.y = -angle + random() * 0.4;
      city.add(mesh);
      if (index % 2 === 0) {
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(width * 1.03, 0.22, depth * 1.03), beaconMaterials[index % beaconMaterials.length]);
        beacon.position.set(mesh.position.x, height - 1.5, mesh.position.z);
        city.add(beacon);
      }
      for (let floorIndex = 0; floorIndex < Math.min(4, Math.floor(height / 13)); floorIndex++) {
        const windowLight = new THREE.Mesh(windowGeometry, beaconMaterials[(index + floorIndex) % beaconMaterials.length]);
        windowLight.position.set(mesh.position.x + width * 0.25, 3 + floorIndex * 4.3, mesh.position.z - depth * 0.51);
        windowLight.rotation.y = mesh.rotation.y;
        city.add(windowLight);
      }
    }
    this.scene.add(city);

    const starPositions = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 115 + random() * 210;
      starPositions[i * 3] = Math.cos(angle) * radius;
      starPositions[i * 3 + 1] = 24 + random() * 100;
      starPositions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const stars = new THREE.BufferGeometry();
    stars.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x7bdce7, size: 0.65, transparent: true, opacity: 0.65, sizeAttenuation: true })));
    this.buildArenaMarkers();
  }

  private applyMissionPalette(mission: MissionDefinition): void {
    this.scene.background = new THREE.Color(mission.palette.background);
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.setHex(mission.palette.fog);
    this.arenaAccents.forEach((material, index) => material.color.setHex(index === 0 ? mission.palette.gridCenter : mission.palette.gridLines));
    const materials = this.arenaGrid?.material;
    if (!materials) return;
    const list = Array.isArray(materials) ? materials : [materials];
    list.forEach((material, index) => {
      if (material instanceof THREE.LineBasicMaterial) {
        material.color.setHex(index === 0 ? mission.palette.gridCenter : mission.palette.gridLines);
      }
    });
  }

  private buildArenaMarkers(): void {
    for (let index = 0; index < 24; index++) {
      const angle = (index / 24) * Math.PI * 2;
      const radius = 88;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 3.5, 0.45),
        new THREE.MeshBasicMaterial({ color: 0x1b7b90, transparent: true, opacity: 0.6 }),
      );
      marker.position.set(Math.cos(angle) * radius, 1.7, Math.sin(angle) * radius);
      marker.lookAt(0, 1.7, 0);
      this.scene.add(marker);
    }
  }

  private buildDrone(): void {
    const armor = new THREE.MeshStandardMaterial({ color: 0x34495d, emissive: 0x081723, emissiveIntensity: 0.9, metalness: 0.38, roughness: 0.4 });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x172635, emissive: 0x07131d, emissiveIntensity: 0.7, metalness: 0.22, roughness: 0.52 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0x9ab0ba, metalness: 0.94, roughness: 0.16 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xb86742, metalness: 0.85, roughness: 0.28 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c3444, metalness: 0.16, roughness: 0.12, transmission: 0.22, transparent: true, opacity: 0.9, clearcoat: 0.9 });
    const neon = this.makeNeonMaterial();
    this.drone.position.set(0, 8, 0);
    const core = new THREE.Group();
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 1), armor);
    body.scale.set(1.25, 0.65, 1.55);
    core.add(body);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 16), glass);
    canopy.scale.set(1, 0.56, 1.3);
    canopy.position.set(0, 0.28, -0.18);
    core.add(canopy);
    const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 1), neon);
    coreCrystal.position.set(0, 0.5, -0.15);
    core.add(coreCrystal);
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.045, 10, 48), neon);
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.y = -0.02;
    core.add(coreRing);
    this.drone.add(core);
    const coreLight = new THREE.PointLight(this.themeColor, 4.2, 17, 2);
    coreLight.position.set(0, 0.4, -0.25);
    this.drone.add(coreLight);

    for (const side of [-1, 1]) {
      for (const forwardSide of [-1, 1]) {
        const rotorX = side * 3.1;
        const rotorZ = forwardSide * 2.35;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 1), armor);
        arm.position.set(rotorX * 0.5, -0.08, rotorZ * 0.5);
        arm.rotation.y = Math.atan2(rotorX, rotorZ);
        arm.scale.z = Math.hypot(rotorX, rotorZ) * 1.25;
        this.drone.add(arm);
        const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 1), neon);
        conduit.position.set(rotorX * 0.48, -0.19, rotorZ * 0.48);
        conduit.rotation.y = Math.atan2(rotorX, rotorZ);
        conduit.scale.z = Math.hypot(rotorX, rotorZ) * 1.18;
        this.drone.add(conduit);

        const rotor = new THREE.Group();
        rotor.position.set(rotorX, 0.05, rotorZ);
        const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.42, 16), armor);
        rotor.add(mount);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.045, 8, 36), copper);
        collar.rotation.x = Math.PI / 2;
        collar.position.y = -0.01;
        rotor.add(collar);
        const guard = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.075, 10, 48), carbon);
        guard.rotation.x = Math.PI / 2;
        guard.position.y = 0.23;
        rotor.add(guard);
        const guardGlow = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.024, 8, 48), neon);
        guardGlow.rotation.x = Math.PI / 2;
        guardGlow.position.y = 0.24;
        rotor.add(guardGlow);
        const blades = new THREE.Group();
        for (let bladeIndex = 0; bladeIndex < 3; bladeIndex++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.88), chrome);
          blade.position.z = 0.5;
          blade.rotation.y = (bladeIndex / 3) * Math.PI * 2;
          blades.add(blade);
        }
        rotor.add(blades);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.26, 12), neon);
        hub.position.y = 0.28;
        rotor.add(hub);
        this.drone.add(rotor);
        this.rotors.push({ group: blades, direction: side === forwardSide ? 1 : -1 });
      }
    }

    for (const side of [-1, 1]) {
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.76), armor);
      mount.position.set(side * 0.92, -0.28, -1.1);
      this.drone.add(mount);
      const barrel = new THREE.Group();
      barrel.position.set(side * 0.92, -0.27, -1.28);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 1.18, 12), chrome);
      tube.rotation.x = Math.PI / 2;
      tube.position.z = -0.4;
      barrel.add(tube);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 8, 16), neon);
      muzzle.position.z = -0.98;
      barrel.add(muzzle);
      this.drone.add(barrel);
    }
    const skid = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.15), chrome);
    skid.position.set(0, -1.0, 0.4);
    this.drone.add(skid);
    this.scene.add(this.drone);
  }

  private buildGates(): void {
    for (let index = 0; index < 6; index++) {
      const material = this.makeNeonMaterial();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.13, 14, 52), material);
      const group = new THREE.Group();
      group.add(ring);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(3.65, 0.025, 6, 48), new THREE.MeshBasicMaterial({ color: this.themeColor, transparent: true, opacity: 0.32 }));
      group.add(inner);
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), material);
      marker.position.y = 4.7;
      group.add(marker);
      group.add(new THREE.PointLight(this.themeColor, 0.8, 10));
      group.visible = false;
      this.scene.add(group);
      this.gates.push({ group, ring, collected: false, baseY: 0 });
    }
  }

  private gatePosition(index: number): THREE.Vector3 {
    const angle = (index / 6) * Math.PI * 2 + 0.14;
    const radius = 47 + (index % 2) * 8;
    return new THREE.Vector3(Math.sin(angle) * radius, 9 + Math.sin(index * 1.4) * 3.8, Math.cos(angle) * radius);
  }

  private createEnemy(index: number, boss: boolean, total: number, archetype: EnemyArchetype = 'scout'): Enemy {
    const group = new THREE.Group();
    const scale = boss ? 2.65 : archetype === 'bulwark' ? 1.25 : archetype === 'gunner' ? 1.08 : 0.86;
    group.scale.setScalar(scale);
    const archetypeColor: Record<EnemyArchetype, number> = { scout: 0xff476b, gunner: 0xb56cff, bulwark: 0xff9b54 };
    const archetypeEmissive: Record<EnemyArchetype, number> = { scout: 0x641226, gunner: 0x35134d, bulwark: 0x54200e };
    const color = boss ? 0xff3159 : archetypeColor[archetype];
    const coreMaterial = new THREE.MeshStandardMaterial({ color, emissive: boss ? 0x8b102c : archetypeEmissive[archetype], emissiveIntensity: boss ? 2.7 : 2.0, metalness: 0.28, roughness: 0.18 });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(boss ? 1.1 : 0.82, 1), coreMaterial);
    group.add(core);
    const rings: THREE.Mesh[] = [];
    for (let ringIndex = 0; ringIndex < (boss ? 3 : 2); ringIndex++) {
      const ringMaterial = new THREE.MeshStandardMaterial({ color: ringIndex === 0 ? 0x3a1827 : color, emissive: ringIndex === 0 ? 0x260816 : archetypeEmissive[archetype], emissiveIntensity: 1.5, metalness: 0.78, roughness: 0.22 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry((boss ? 1.7 : 1.4) - ringIndex * 0.23, boss ? 0.09 : 0.065, 10, 40), ringMaterial);
      ring.rotation.x = ringIndex * 0.85;
      ring.rotation.y = ringIndex * 0.65;
      group.add(ring);
      rings.push(ring);
    }
    for (let armIndex = 0; armIndex < 4; armIndex++) {
      const angle = (armIndex / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(boss ? 0.4 : 0.27, boss ? 2.3 : 1.55, 5), new THREE.MeshStandardMaterial({ color: 0x222532, metalness: 0.78, roughness: 0.32 }));
      blade.position.set(Math.cos(angle) * (boss ? 1.65 : 1.42), 0, Math.sin(angle) * (boss ? 1.65 : 1.42));
      blade.rotation.z = Math.PI / 2;
      blade.rotation.y = -angle;
      group.add(blade);
    }
    const glow = new THREE.PointLight(boss ? 0xff204e : color, boss ? 7 : archetype === 'bulwark' ? 3.2 : 2.6, boss ? 34 : 16, 2);
    group.add(glow);
    const angle = boss ? Math.PI : (index / total) * Math.PI * 2;
    const radius = boss ? 40 : archetype === 'scout' ? 32 + (index % 2) * 13 : archetype === 'gunner' ? 52 + (index % 2) * 5 : 42;
    const baseHeight = boss ? 15 : archetype === 'scout' ? 10 + (index % 3) * 5 : archetype === 'gunner' ? 19 : 13;
    group.position.set(Math.cos(angle) * radius, baseHeight, Math.sin(angle) * radius);
    this.scene.add(group);
    const bossPattern = bossPatternForPhase(this.mission?.bossPatterns, 1);
    return {
      group, core, coreMaterial, rings, alive: true, boss, archetype,
      hp: boss ? 720 : archetype === 'scout' ? 70 : archetype === 'gunner' ? 120 : 200,
      maxHp: boss ? 720 : archetype === 'scout' ? 70 : archetype === 'gunner' ? 120 : 200,
      angle, radius, baseHeight,
      previousPosition: group.position.clone(), velocity: new THREE.Vector3(),
      orbitSpeed: boss ? 0.13 : (archetype === 'scout' ? 0.52 : archetype === 'gunner' ? 0.18 : 0.11) * (index % 2 === 0 ? 1 : -1),
      attackTimer: boss ? 2.5 : (archetype === 'scout' ? 2.8 : archetype === 'gunner' ? 3.3 : 4.0) + (index % 3) * 0.32,
      attackCharge: 0,
      attackReady: false,
      attackPattern: boss ? bossPattern : archetype === 'gunner' ? 'fan' : archetype === 'bulwark' ? 'charge' : 'volley',
      hitFlash: 0,
    };
  }

  private installInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
      if (this.active && !event.repeat) {
        event.preventDefault();
        this.callbacks.onPause();
      }
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('button, input, textarea, select'))) return;
    if (!this.active) return;
    this.audio.unlock();
    const key = event.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
    this.keys.add(key);
    if (key === 'f') this.firing = true;
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    this.keys.delete(key);
    if (key === 'f') this.firing = false;
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.active) return;
    this.audio.unlock();
    this.firing = true;
    this.firePlayerWeapons();
  }

  private clearInput(): void {
    this.keys.clear();
    this.firing = false;
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  private animate = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    if (this.active) this.update(dt, elapsed);
    this.updateAmbient(elapsed, dt);
    this.drawRadar(dt);
    this.composer.render();
  };

  private update(dt: number, elapsed: number): void {
    this.elapsed += dt;
    this.previousPlayerPosition.copy(this.drone.position);
    this.updatePlayer(dt);
    this.updateEnemies(dt, elapsed);
    this.updateGates(dt, elapsed);
    if (this.firing) this.firePlayerWeapons();
    this.updateBolts(dt);
    this.updateBursts(dt);
    this.updateLock();
    this.cameraOffset.set(0, 4.5, 12).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.drone.rotation.y);
    const desiredPosition = this.drone.position.clone().add(this.cameraOffset);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 3.8);
    desiredPosition.x += Math.sin(elapsed * 57) * this.cameraShake;
    desiredPosition.y += Math.cos(elapsed * 43) * this.cameraShake * 0.38;
    this.camera.position.lerp(desiredPosition, 1 - Math.exp(-5.3 * dt));
    const viewTarget = this.drone.position.clone().add(this.forward.set(0, 0, -12).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.drone.rotation.y));
    this.camera.lookAt(viewTarget);
    if (this.elapsed - this.lastTelemetry > 0.1) {
      this.lastTelemetry = this.elapsed;
      this.callbacks.onEvent({
        type: 'telemetry',
        speed: Math.round(this.droneVelocity.length() * 6.5),
        altitude: Math.round(this.drone.position.y * 2),
        boost: Math.round(this.boostEnergy),
      });
    }
    this.audio.update(this.droneVelocity.length(), this.boosting);
  }

  private updatePlayer(dt: number): void {
    this.boundaryToastCooldown = Math.max(0, this.boundaryToastCooldown - dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    const key = (letter: string, arrow: string): boolean => this.keys.has(letter) || this.keys.has(arrow);
    const boostState = advanceBoostState(this.boostEnergy, this.keys.has('shift'), this.boosting, dt);
    this.boostEnergy = boostState.energy;
    this.boosting = boostState.active;
    const boost = this.boosting;
    const acceleration = boost ? 42 : 28;
    const turnSpeed = 2.1;
    if (key('a', 'arrowleft')) this.drone.rotation.y += turnSpeed * dt;
    if (key('d', 'arrowright')) this.drone.rotation.y -= turnSpeed * dt;
    const heading = this.forward.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.drone.rotation.y);
    if (key('w', 'arrowup')) this.droneVelocity.addScaledVector(heading, acceleration * dt);
    if (key('s', 'arrowdown')) this.droneVelocity.addScaledVector(heading, -acceleration * 0.68 * dt);
    if (this.keys.has(' ')) this.droneVelocity.y += 17 * dt;
    if (this.keys.has('c')) this.droneVelocity.y -= 17 * dt;
    applyFrameIndependentDamping(this.droneVelocity, 1.35, dt);
    const maxSpeed = boost ? 42 : 28;
    if (this.droneVelocity.length() > maxSpeed) this.droneVelocity.setLength(maxSpeed);
    this.drone.position.addScaledVector(this.droneVelocity, dt);
    this.drone.position.y = THREE.MathUtils.clamp(this.drone.position.y, 2.4, 46);
    const radialDistance = Math.hypot(this.drone.position.x, this.drone.position.z);
    if (radialDistance > WORLD_LIMIT) {
      this.drone.position.x *= WORLD_LIMIT / radialDistance;
      this.drone.position.z *= WORLD_LIMIT / radialDistance;
      this.droneVelocity.multiplyScalar(0.24);
      if (this.boundaryToastCooldown <= 0) {
        this.boundaryToastCooldown = 1.5;
        this.callbacks.onEvent({ type: 'toast', text: 'LIMITE DO PERÍMETRO' });
      }
    }
    const pitchTarget = (this.keys.has('w') || this.keys.has('arrowup') ? -0.26 : this.keys.has('s') || this.keys.has('arrowdown') ? 0.2 : 0) * (boost ? 1.25 : 1);
    const rollTarget = this.keys.has('a') || this.keys.has('arrowleft') ? 0.34 : this.keys.has('d') || this.keys.has('arrowright') ? -0.34 : 0;
    this.drone.rotation.x = THREE.MathUtils.lerp(this.drone.rotation.x, pitchTarget, 1 - Math.exp(-6 * dt));
    this.drone.rotation.z = THREE.MathUtils.lerp(this.drone.rotation.z, rollTarget, 1 - Math.exp(-6 * dt));
    this.rotors.forEach(({ group, direction }) => { group.rotation.y += direction * dt * (boost ? 62 : 42); });
  }

  private updateAmbient(elapsed: number, dt: number): void {
    const crystal = this.drone.children.find((child) => child instanceof THREE.Group);
    if (crystal) crystal.rotation.y += dt * 0.32;
    this.gates.forEach((gate, index) => {
      if (!gate.group.visible) return;
      gate.ring.rotation.z += dt * (0.75 + index * 0.025);
      gate.group.position.y = gate.baseY + Math.sin(elapsed * 1.5 + index) * 0.42;
    });
  }

  private updateGates(dt: number, elapsed: number): void {
    if (this.mode !== 'training') return;
    for (const gate of this.gates) {
      if (gate.collected || this.drone.position.distanceTo(gate.group.position) > 5.4) continue;
      gate.collected = true;
      gate.group.visible = false;
      this.gateCount++;
      this.audio.play('gate');
      this.spawnBurst(gate.group.position, 0x70f0c2, 28, 13, 0.7);
      this.callbacks.onEvent({ type: 'gate', count: this.gateCount });
      this.callbacks.onEvent({ type: 'score', value: this.getScore() });
      this.callbacks.onEvent({ type: 'toast', text: `BALIZA ${String(this.gateCount).padStart(2, '0')} / 06` });
    }
    void dt;
    void elapsed;
  }

  private updateEnemies(dt: number, elapsed: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (!enemy.boss) {
        enemy.angle += enemy.orbitSpeed * dt;
        const weave = enemy.archetype === 'scout' ? Math.sin(elapsed * 2.7 + enemy.angle) * 5 : enemy.archetype === 'gunner' ? Math.sin(elapsed * 0.9 + enemy.angle) * 2 : Math.sin(elapsed * 0.55 + enemy.angle) * 1.1;
        enemy.group.position.set(Math.cos(enemy.angle) * enemy.radius + weave, enemy.baseHeight + Math.sin(elapsed * (enemy.archetype === 'scout' ? 2.8 : 1.05) + enemy.angle) * (enemy.archetype === 'bulwark' ? 1.1 : 2.4), Math.sin(enemy.angle) * enemy.radius);
        enemy.group.rotation.z = Math.sin(elapsed * (enemy.archetype === 'scout' ? 2.6 : 0.8) + enemy.angle) * (enemy.archetype === 'scout' ? 0.26 : 0.08);
      } else {
        enemy.group.position.set(Math.sin(elapsed * 0.17) * 10, 14 + Math.sin(elapsed * 0.85) * 2.2, -40 + Math.sin(elapsed * 0.21) * 7);
        this.updateBossPhase(enemy, dt);
      }
      if (dt > 0) enemy.velocity.subVectors(enemy.group.position, enemy.previousPosition).divideScalar(dt);
      enemy.previousPosition.copy(enemy.group.position);
      enemy.core.rotation.y += dt * (enemy.boss ? 1.15 : 1.8);
      enemy.core.rotation.x += dt * 0.72;
      enemy.rings.forEach((ring, index) => {
        ring.rotation.x += dt * (index % 2 === 0 ? 0.8 : -1.1);
        ring.rotation.y += dt * (index % 2 === 0 ? -0.62 : 0.7);
      });
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.coreMaterial.emissiveIntensity = enemy.attackReady ? 4.4 + Math.sin(elapsed * 18) * 1.4 : enemy.hitFlash > 0 ? 4 : enemy.boss ? 2.7 : 2;
      this.updateEnemyAttack(enemy, dt);
    }
  }

  private updateBossPhase(boss: Enemy, dt: number): void {
    const nextPhase = boss.hp > 480 ? 1 : boss.hp > 240 ? 2 : 3;
    if (nextPhase !== this.bossPhase) {
      this.bossPhase = nextPhase;
      this.bossCycle = 0;
      this.bossExposed = true;
      boss.attackTimer = 0.9;
      boss.attackCharge = 0;
      boss.attackReady = false;
      this.callbacks.onEvent({ type: 'boss', hp: boss.hp / boss.maxHp, phase: this.bossPhase, exposed: true });
      this.callbacks.onEvent({ type: 'toast', text: `NÚCLEO INSTÁVEL · FASE 0${this.bossPhase}` });
      this.audio.play('warning');
    }
    this.bossCycle += dt;
    const phaseDuration = this.bossPhase === 1 ? 7.2 : this.bossPhase === 2 ? 6.1 : 5.0;
    const openDuration = this.bossPhase === 1 ? 3.2 : this.bossPhase === 2 ? 2.7 : 2.3;
    const exposed = (this.bossCycle % phaseDuration) < openDuration;
    if (exposed !== this.bossExposed) {
      this.bossExposed = exposed;
      this.callbacks.onEvent({ type: 'boss', hp: boss.hp / boss.maxHp, phase: this.bossPhase, exposed });
      if (exposed) this.callbacks.onEvent({ type: 'toast', text: 'NÚCLEO EXPOSTO · DISPARAR' });
    }
  }

  private updateEnemyAttack(enemy: Enemy, dt: number): void {
    enemy.attackTimer -= dt;
    if (enemy.boss) enemy.attackPattern = bossPatternForPhase(this.mission?.bossPatterns, this.bossPhase);
    const windup = enemy.boss
      ? enemy.attackPattern === 'charge' ? 1.25 : enemy.attackPattern === 'fan' ? 1.0 : 0.82
      : enemy.archetype === 'gunner' ? 0.96 : enemy.archetype === 'bulwark' ? 1.12 : 0.7;
    if (enemy.attackTimer <= windup && !enemy.attackReady) {
      enemy.attackReady = true;
      enemy.attackCharge = windup;
      this.callbacks.onEvent({ type: 'warning', boss: enemy.boss, pattern: enemy.attackPattern });
      this.audio.play('warning');
    }
    if (enemy.attackReady) {
      enemy.attackCharge -= dt;
      if (enemy.attackCharge <= 0) {
        this.fireEnemyAttack(enemy);
        enemy.attackReady = false;
        enemy.attackTimer = enemy.boss ? (this.bossPhase === 1 ? 5.8 : this.bossPhase === 2 ? 4.8 : 4.0) : enemy.archetype === 'scout' ? 5.4 : enemy.archetype === 'gunner' ? 5.8 : 6.6;
      }
    }
  }

  private fireEnemyAttack(enemy: Enemy): void {
    if (enemy.group.position.distanceTo(this.drone.position) > 88) return;
    const start = enemy.group.position.clone();
    const aim = this.drone.position.clone().sub(start).normalize();
    const count = enemy.attackPattern === 'fan' ? (enemy.boss ? 5 : 3) : enemy.attackPattern === 'charge' ? (enemy.boss ? 1 : 3) : 1;
    const spread = enemy.boss ? 0.24 : 0.18;
    for (let index = 0; index < count; index++) {
      const offset = count === 1 ? 0 : (index / (count - 1) - 0.5) * spread * 2;
      const direction = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offset).normalize();
      const speed = enemy.attackPattern === 'charge' ? (enemy.boss ? 32 : 18) : enemy.boss ? 18 : enemy.archetype === 'scout' ? 15 : 13;
      this.fireEnemyBolt(start, direction, speed, enemy.attackPattern === 'charge');
    }
  }

  private fireEnemyBolt(start: THREE.Vector3, direction: THREE.Vector3, speed: number, charged: boolean): void {
    const mesh = new THREE.Mesh(this.enemyBoltGeometry, this.enemyBoltMaterial);
    mesh.position.copy(start);
    if (charged) mesh.scale.setScalar(1.7);
    this.scene.add(mesh);
    this.bolts.push({ mesh, velocity: direction.clone().multiplyScalar(speed), life: 0, playerOwned: false, nearMissReported: false });
  }

  private firePlayerWeapons(): void {
    if (!this.active || !this.mission) return;
    const now = performance.now();
    if (now - this.lastShot < 210) return;
    this.lastShot = now;
    this.audio.play('shot');
    const target = this.findLockedEnemy();
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.drone.rotation).normalize();
    for (const side of [-1, 1]) {
      const start = new THREE.Vector3(side * 1.0, -0.28, -2.15).applyEuler(this.drone.rotation).add(this.drone.position);
      const direction = target
        ? target.group.position.clone().addScaledVector(target.velocity, Math.min(0.55, start.distanceTo(target.group.position) / 142)).sub(start).normalize()
        : forward.clone();
      const mesh = new THREE.Mesh(this.laserGeometry, this.laserMaterial);
      mesh.position.copy(start);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      this.scene.add(mesh);
      this.bolts.push({ mesh, velocity: direction.multiplyScalar(142), life: 0, playerOwned: true, nearMissReported: false });
    }
  }

  private findLockedEnemy(): Enemy | null {
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.drone.rotation).normalize();
    let best: Enemy | null = null;
    let bestAlignment = 0.91;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const toEnemy = enemy.group.position.clone().sub(this.drone.position);
      if (toEnemy.length() > 112) continue;
      const alignment = forward.dot(toEnemy.normalize());
      if (alignment > bestAlignment) { bestAlignment = alignment; best = enemy; }
    }
    return best;
  }

  private updateLock(): void {
    const next = this.findLockedEnemy();
    if (next === this.lockedEnemy) return;
    this.lockedEnemy = next;
    this.callbacks.onEvent({ type: 'lock', locked: Boolean(next) });
  }

  private updateBolts(dt: number): void {
    for (let index = this.bolts.length - 1; index >= 0; index--) {
      const bolt = this.bolts[index];
      const previous = bolt.mesh.position.clone();
      const step = bolt.velocity.clone().multiplyScalar(dt);
      bolt.mesh.position.add(step);
      if (!bolt.playerOwned) {
        const relativeStart = previous.clone().sub(this.previousPlayerPosition);
        const relativeEnd = bolt.mesh.position.clone().sub(this.drone.position);
        const distanceSquared = pointToSegmentDistanceSquared({ x: 0, y: 0, z: 0 }, relativeStart, relativeEnd);
        const pass = classifyProjectilePass(distanceSquared, 1.52, 5.4);
        if (pass === 'hit') {
          this.damagePlayer();
          this.removeBolt(index);
          continue;
        }
        if (pass === 'near-miss' && !bolt.nearMissReported) {
          bolt.nearMissReported = true;
          this.nearMissCount++;
          this.scoreBonus += 120;
          this.audio.play('nearMiss');
          this.callbacks.onEvent({ type: 'nearMiss', count: this.nearMissCount, points: 120, score: this.getScore() });
        }
      } else {
        let hit = false;
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          const radius = enemy.boss ? 4.0 : 2.2;
          const relativeStart = previous.clone().sub(enemy.previousPosition);
          const relativeEnd = bolt.mesh.position.clone().sub(enemy.group.position);
          if (pointToSegmentDistanceSquared({ x: 0, y: 0, z: 0 }, relativeStart, relativeEnd) >= radius * radius) continue;
          hit = true;
          if (enemy.boss && !this.bossExposed) {
            this.spawnBurst(bolt.mesh.position, 0xffca68, 7, 4, 0.22);
            this.audio.play('hit');
            this.callbacks.onEvent({ type: 'toast', text: 'BLINDAGEM ATIVA' });
          } else {
            enemy.hp -= enemy.boss ? 8 : 20;
            enemy.hitFlash = 0.1;
            this.cameraShake = Math.max(this.cameraShake, 0.08);
            this.audio.play('hit');
            this.callbacks.onEvent({ type: 'hitConfirmed' });
            this.spawnBurst(bolt.mesh.position, enemy.boss ? 0xffca68 : 0x39e5ef, 10, 6, 0.3);
            if (enemy.boss) this.callbacks.onEvent({ type: 'boss', hp: Math.max(0, enemy.hp / enemy.maxHp), phase: this.bossPhase, exposed: this.bossExposed });
            if (enemy.hp <= 0) this.destroyEnemy(enemy);
          }
          break;
        }
        if (hit) { this.removeBolt(index); continue; }
      }
      bolt.life += dt;
      if (bolt.life > (bolt.playerOwned ? 1.15 : 7.5)) this.removeBolt(index);
    }
  }

  private destroyEnemy(enemy: Enemy): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.spawnBurst(enemy.group.position, enemy.boss ? 0xffca68 : 0xff476b, enemy.boss ? 100 : 46, enemy.boss ? 19 : 14, enemy.boss ? 1.25 : 0.8);
    enemy.group.visible = false;
    this.audio.play('explosion');
    if (enemy.boss) {
      this.scoreBonus += 1000;
      this.callbacks.onEvent({ type: 'bossDestroyed' });
    } else {
      this.enemyKillCount++;
      this.callbacks.onEvent({ type: 'enemyDestroyed', count: this.enemyKillCount, archetype: enemy.archetype });
      this.callbacks.onEvent({ type: 'score', value: this.getScore() });
      this.callbacks.onEvent({ type: 'toast', text: `ALVO ELIMINADO · ${this.enemyKillCount}` });
    }
  }

  private damagePlayer(): void {
    if (this.damageCooldown > 0) return;
    this.damageCooldown = 0.46;
    this.shield = Math.max(0, this.shield - (this.mode === 'sentinel' ? 22 : 18));
    this.cameraShake = Math.max(this.cameraShake, 1.05);
    this.audio.play('damage');
    this.callbacks.onEvent({ type: 'damage', shield: this.shield });
    if (this.shield <= 0) this.callbacks.onEvent({ type: 'toast', text: 'ESCUDO CRÍTICO' });
  }

  private removeBolt(index: number): void {
    const [bolt] = this.bolts.splice(index, 1);
    if (bolt) this.scene.remove(bolt.mesh);
  }

  private spawnBurst(position: THREE.Vector3, color: number, count: number, speed: number, lifetime: number): void {
    const values = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let index = 0; index < count; index++) {
      values[index * 3] = position.x;
      values[index * 3 + 1] = position.y;
      values[index * 3 + 2] = position.z;
      const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.9));
      velocities.push(direction);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(values, 3));
    const material = new THREE.PointsMaterial({ color, size: 0.25, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.bursts.push({ points, velocities, material, age: 0, maxAge: lifetime });
  }

  private updateBursts(dt: number): void {
    for (let index = this.bursts.length - 1; index >= 0; index--) {
      const burst = this.bursts[index];
      burst.age += dt;
      const positions = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let item = 0; item < burst.velocities.length; item++) {
        const velocity = burst.velocities[item];
        velocity.multiplyScalar(Math.exp(-1.3 * dt));
        positions.setXYZ(item, positions.getX(item) + velocity.x * dt, positions.getY(item) + velocity.y * dt, positions.getZ(item) + velocity.z * dt);
      }
      positions.needsUpdate = true;
      burst.material.opacity = Math.max(0, 1 - burst.age / burst.maxAge);
      if (burst.age >= burst.maxAge) {
        this.scene.remove(burst.points);
        burst.points.geometry.dispose();
        burst.material.dispose();
        this.bursts.splice(index, 1);
      }
    }
  }

  private drawRadar(dt: number): void {
    const ctx = this.radarContext;
    const width = this.radarCanvas.width;
    const height = this.radarCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 7;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(3, 13, 21, .88)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(83, 208, 221, .22)';
    ctx.lineWidth = 1;
    for (const factor of [0.34, 0.67, 1]) {
      ctx.beginPath(); ctx.arc(cx, cy, radius * factor, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.stroke();
    this.radarAngle += dt * 1.7;
    const sweepX = cx + Math.cos(this.radarAngle) * radius;
    const sweepY = cy + Math.sin(this.radarAngle) * radius;
    const gradient = ctx.createLinearGradient(cx, cy, sweepX, sweepY);
    gradient.addColorStop(0, 'rgba(57, 229, 239, .38)'); gradient.addColorStop(1, 'rgba(57, 229, 239, 0)');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, this.radarAngle - 0.55, this.radarAngle); ctx.closePath(); ctx.fill();
    const yaw = this.drone.rotation.y;
    const drawBlip = (position: THREE.Vector3, color: string, size: number): void => {
      const dx = position.x - this.drone.position.x;
      const dz = position.z - this.drone.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 90) return;
      const angle = Math.atan2(dx, dz) - yaw;
      const amount = (distance / 90) * (radius - 9);
      const x = cx + Math.sin(angle) * amount;
      const y = cy + Math.cos(angle) * amount;
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    };
    for (const gate of this.gates) if (gate.group.visible && !gate.collected) drawBlip(gate.group.position, '#70f0c2', 2.6);
    const enemyColors: Record<EnemyArchetype, string> = { scout: '#ff476b', gunner: '#b56cff', bulwark: '#ff9b54' };
    for (const enemy of this.enemies) if (enemy.alive) drawBlip(enemy.group.position, enemy.boss ? '#ffca68' : enemyColors[enemy.archetype], enemy.boss ? 4.4 : enemy.archetype === 'bulwark' ? 4 : 3.2);
    ctx.fillStyle = '#dffeff'; ctx.shadowColor = '#39e5ef'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx + 4, cy + 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(57, 229, 239, .85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  }

  private makeNeonMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color: this.themeColor, emissive: this.themeColor, emissiveIntensity: 2.1, metalness: 0.15, roughness: 0.2 });
    this.themeMaterials.push(material);
    return material;
  }

  private clearDynamicObjects(): void {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.group);
      enemy.group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    }
    this.enemies.length = 0;
    for (const bolt of this.bolts) this.scene.remove(bolt.mesh);
    this.bolts.length = 0;
    for (const burst of this.bursts) {
      this.scene.remove(burst.points);
      burst.points.geometry.dispose();
      burst.material.dispose();
    }
    this.bursts.length = 0;
  }

  private seededRandom(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x100000000;
    };
  }
}
