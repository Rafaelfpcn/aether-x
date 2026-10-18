import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  bossPatternForPhase,
  missionById,
  OPEN_WORLD_TASKS,
  openWorldTaskById,
  REALISTIC_OPEN_WORLD_TASKS,
  RIVER_STYLE_CONFIGS,
  type BossAttackPattern,
  type EnemyArchetype,
  type MissionDefinition,
  type OpenWorldTaskDefinition,
  type OpenWorldTaskId,
  type RiverStyle,
  type ScenarioEnvironment,
  type ScenarioId,
} from './missions';
import type { AudioEngine } from './audio';
import type { ThemeId } from './storage';
import {
  advanceBoostState,
  advanceFlight,
  cameraFollowProfile,
  classifyProjectilePass,
  computeChaseCameraFraming,
  impactDamage,
  pointToSegmentDistanceSquared,
  reinforcementBatchSize,
  windAt,
} from './physics';
import {
  createEnemyHullGeometry,
  createFuselageGeometry,
  createPropellerBladeGeometry,
  createSweptWingGeometry,
  PLAYER_HEX_EXTRA_ROTORS,
  PLAYER_ROTOR_LAYOUT,
} from './drone-model';
import {
  computeDroneEffectiveStats,
  defaultDroneUpgrades,
  droneById,
  type DroneId,
  type EffectiveDroneStats,
} from './hangar';
import { buildScenarioScenery, type SceneryLayer } from './scenery';
import { CollisionWorld } from './collision';
import { populateClassicColliders, type AnimatedVehicle, type DestructibleProp } from './scenery-realistic';
import { ObjectiveTracker } from './objectives';
import { AutoQualityController, QUALITY_PRESETS, type QualityLevel, type ResolvedQuality } from './quality';
import {
  FLIGHT_PROFILES_BY_MODEL,
  WEAPON_PROFILES,
  type FlightModel,
  type VisualStyle,
} from './style-profile';

export type GameEvent =
  | {
      type: 'telemetry';
      speed: number;
      altitude: number;
      boost: number;
      ammo?: number | null;
      maxAmmo?: number | null;
      reloading?: boolean;
      windSpeed?: number;
      gpsX?: number;
      gpsZ?: number;
      pitchDeg?: number;
      rollDeg?: number;
      headingDeg?: number;
    }
  | { type: 'gate'; count: number; target?: number }
  | { type: 'enemyDestroyed'; count: number; target?: number; archetype?: EnemyArchetype }
  | { type: 'boss'; hp: number; phase: number; exposed: boolean }
  | { type: 'bossDestroyed' }
  | { type: 'damage'; shield: number }
  | { type: 'warning'; boss: boolean; pattern: BossAttackPattern }
  | { type: 'nearMiss'; count: number; points: number; score: number }
  | { type: 'score'; value: number }
  | { type: 'hitConfirmed' }
  | { type: 'lock'; locked: boolean }
  | { type: 'toast'; text: string }
  | { type: 'openWorldTaskStarted'; task: OpenWorldTaskDefinition }
  | { type: 'openWorldTaskCompleted'; task: OpenWorldTaskDefinition; totalScore: number }
  | { type: 'openWorldFreeRoam' }
  | {
      type: 'objectiveProgress';
      fraction: number;
      hudText: string;
      status: 'running' | 'completed' | 'failed';
    }
  | { type: 'qualityChanged'; resolved: ResolvedQuality };

interface Gate {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  collected: boolean;
  baseY: number;
}

interface TaskBeacon {
  task: OpenWorldTaskDefinition;
  style: VisualStyle;
  group: THREE.Group;
  ring: THREE.Mesh;
  crest: THREE.Mesh;
  baseY: number;
}

interface Enemy {
  group: THREE.Group;
  core: THREE.Mesh;
  coreMaterial: THREE.MeshStandardMaterial;
  rings: THREE.Mesh[];
  petals: THREE.Mesh[];
  heliMainRotor?: THREE.Object3D;
  heliTailRotor?: THREE.Object3D;
  alive: boolean;
  boss: boolean;
  archetype: EnemyArchetype;
  spawnIndex: number;
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

interface FallingEnemy {
  group: THREE.Group;
  velocity: THREE.Vector3;
  rotVel: THREE.Vector3;
  age: number;
  smokeTimer: number;
  boss: boolean;
}

interface DebrisPiece {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotVel: THREE.Vector3;
  age: number;
  maxAge: number;
}

interface Bolt {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  gravityScale: number;
  life: number;
  maxLife: number;
  playerOwned: boolean;
  nearMissReported: boolean;
}

interface Burst {
  points: THREE.Points;
  velocities: THREE.Vector3[];
  material: THREE.PointsMaterial;
  gravity: number;
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

const WORLD_LIMIT = 136;
const OPEN_WORLD_LIMIT = 168;
const KEY_LIGHT_OFFSET = new THREE.Vector3(34, 62, 26);
const MAX_SHIELD = 100;

// Vetores de rascunho em escopo de módulo para eliminar alocações e GC spikes nos caminhos quentes de render
const _UP = new THREE.Vector3(0, 1, 0);
const _SCRATCH_TARGET = new THREE.Vector3();
const _SCRATCH_FORWARD = new THREE.Vector3();
const _FORWARD_VEC = new THREE.Vector3();
const _TO_ENEMY_VEC = new THREE.Vector3();
const _TASK_CENTER_VEC = new THREE.Vector3();
const _FPV_TO_PLAYER = new THREE.Vector3();
const _ORIGIN = { x: 0, y: 0, z: 0 };
const _REL_START = { x: 0, y: 0, z: 0 };
const _REL_END = { x: 0, y: 0, z: 0 };

export class Game {
  private readonly container: HTMLElement;
  private readonly radarCanvas: HTMLCanvasElement;
  private readonly radarContext: CanvasRenderingContext2D;
  private readonly audio: AudioEngine;
  private readonly callbacks: GameCallbacks;
  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 550);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly clock = new THREE.Clock();
  private readonly ambientLight = new THREE.AmbientLight(0x8fa8c4, 0.28);
  private readonly hemiLight = new THREE.HemisphereLight(0x70b8d4, 0x1a2538, 0.62);
  private readonly keyLight = new THREE.DirectionalLight(0xe4f2ff, 2.6);
  private readonly rimLight = new THREE.DirectionalLight(0x5fb4ff, 0.9);
  private readonly drone = new THREE.Group();
  private droneParts: {
    hull: THREE.MeshStandardMaterial;
    armor: THREE.MeshStandardMaterial;
    carbon: THREE.MeshStandardMaterial;
    chrome: THREE.MeshStandardMaterial;
    copper: THREE.MeshStandardMaterial;
    neon: THREE.MeshStandardMaterial;
    glass: THREE.MeshPhysicalMaterial;
    lens: THREE.MeshPhysicalMaterial;
    tip: THREE.MeshStandardMaterial;
  } | null = null;
  private readonly droneCyberOnly: THREE.Object3D[] = [];
  private readonly droneHexExtras: THREE.Object3D[] = [];
  private readonly droneWingExtras: THREE.Object3D[] = [];
  private readonly droneRacerExtras: THREE.Object3D[] = [];
  private equippedDroneId: DroneId = 'dji-mavic';
  private equippedStats: EffectiveDroneStats = computeDroneEffectiveStats('dji-mavic', defaultDroneUpgrades());
  private droneCoreLight: THREE.PointLight | null = null;
  private droneCargoMesh: THREE.Mesh | null = null;
  private droneRealistic = false;
  private riverStyle: RiverStyle = 'realistic';
  private visualStyle: VisualStyle = 'realistic';
  private flightModel: FlightModel = 'arcade';
  private qualityLevel: QualityLevel = 'auto';
  private resolvedQuality: ResolvedQuality = 'medium';
  private readonly autoQuality = new AutoQualityController('medium');
  private readonly rotors: Rotor[] = [];
  private readonly gates: Gate[] = [];
  private readonly taskBeacons: TaskBeacon[] = [];
  private activeOpenWorldTask: OpenWorldTaskDefinition | null = null;
  private openWorldTaskCooldown = 0;
  private readonly enemies: Enemy[] = [];
  private readonly fallingEnemies: FallingEnemy[] = [];
  private readonly debrisPieces: DebrisPiece[] = [];
  private pendingEnemyWave: { archetype: EnemyArchetype; index: number }[] = [];
  private waveSpawnTimer = 0;
  private readonly bolts: Bolt[] = [];
  private readonly bursts: Burst[] = [];
  private readonly themeMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly keys = new Set<string>();
  private readonly laserGeometry = new THREE.CylinderGeometry(0.055, 0.055, 3.3, 8);
  private readonly laserMaterial = new THREE.MeshBasicMaterial({ color: 0x39e5ef });
  private readonly tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffb84d });
  private readonly enemyBoltGeometry = new THREE.SphereGeometry(0.26, 12, 12);
  private readonly enemyBoltMaterial = new THREE.MeshBasicMaterial({ color: 0xff4568 });
  private readonly debrisGeometry = new THREE.DodecahedronGeometry(0.32, 0);
  private readonly debrisMaterial = new THREE.MeshStandardMaterial({
    color: 0x38414a,
    metalness: 0.65,
    roughness: 0.42,
  });
  private readonly enemyHullGeometries = {
    scout: createEnemyHullGeometry('scout'),
    gunner: createEnemyHullGeometry('gunner'),
    bulwark: createEnemyHullGeometry('bulwark'),
    sniper: createEnemyHullGeometry('sniper'),
    swarmer: createEnemyHullGeometry('swarmer'),
    fpv: createEnemyHullGeometry('fpv'),
    fixedwing: createEnemyHullGeometry('fixedwing'),
    aaturret: createEnemyHullGeometry('aaturret'),
    heavyhex: createEnemyHullGeometry('heavyhex'),
    gunboat: createEnemyHullGeometry('gunboat'),
    boss: createEnemyHullGeometry('boss'),
    attackheli: createEnemyHullGeometry('attackheli'),
  };
  private readonly enemyCoreGeo = new THREE.OctahedronGeometry(0.56, 1);
  private readonly bossCoreGeo = new THREE.OctahedronGeometry(0.76, 2);
  private readonly enemyRingGeos = [
    new THREE.TorusGeometry(1.42, 0.055, 10, 40),
    new THREE.TorusGeometry(1.18, 0.048, 10, 36),
  ];
  private readonly bossRingGeos = [
    new THREE.TorusGeometry(1.75, 0.085, 12, 48),
    new THREE.TorusGeometry(1.48, 0.072, 12, 44),
    new THREE.TorusGeometry(1.22, 0.06, 10, 40),
  ];
  private readonly enemyWingLeftGeo = createSweptWingGeometry(-1);
  private readonly enemyWingRightGeo = createSweptWingGeometry(1);
  private readonly enemyPodGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.48, 10);
  private readonly enemyRailGeo = new THREE.BoxGeometry(0.09, 0.14, 2.35);
  private readonly enemyRotorRingGeo = new THREE.TorusGeometry(0.36, 0.04, 8, 20);
  private readonly enemyShieldPlateGeo = new THREE.BoxGeometry(0.72, 0.64, 0.18);
  private readonly bossBladeGeo = new THREE.ConeGeometry(0.38, 2.35, 6);
  private readonly enemyHaloGeo = new THREE.SphereGeometry(1.18, 14, 10);
  private readonly bossHaloGeo = new THREE.SphereGeometry(1.62, 16, 12);
  private readonly sharedEnemyArmorMat = new THREE.MeshStandardMaterial({
    color: 0x222938,
    metalness: 0.78,
    roughness: 0.3,
  });
  private readonly sharedEnemyDarkMat = new THREE.MeshStandardMaterial({
    color: 0x151b26,
    metalness: 0.65,
    roughness: 0.42,
  });
  private readonly sharedEnemyRealisticMat = new THREE.MeshStandardMaterial({
    color: 0x3b443c,
    metalness: 0.28,
    roughness: 0.62,
  });
  private readonly droneVelocity = new THREE.Vector3();
  private droneYawVelocity = 0;
  private lastImpactSpeed = 0;
  private readonly previousPlayerPosition = new THREE.Vector3();
  private readonly cameraOffset = new THREE.Vector3(0, 4.5, 12);
  private readonly forward = new THREE.Vector3();
  private mission: MissionDefinition | null = null;
  private mode: ScenarioId | null = null;
  private active = false;
  private firing = false;
  private lastShot = 0;
  private ammoCount = 90;
  private reloadTimer = 0;
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
  private collisionCooldown = 0;
  private waterSprayCooldown = 0;
  private cameraShake = 0;
  private arenaGrid: THREE.GridHelper | null = null;
  private readonly arenaAccents: THREE.MeshBasicMaterial[] = [];
  private readonly cityCollision = new CollisionWorld(18);
  private readonly environmentGroups = new Map<ScenarioEnvironment, THREE.Group>();
  private readonly environmentLayers = new Map<ScenarioEnvironment, SceneryLayer>();
  private readonly environmentFollowers = new Map<ScenarioEnvironment, THREE.Object3D>();
  private readonly animatedTextures: THREE.Texture[] = [];
  private activeCollision: CollisionWorld = this.cityCollision;
  private activeDestructibles: DestructibleProp[] = [];
  private activeVehicles: AnimatedVehicle[] = [];
  private objectiveTracker: ObjectiveTracker | null = null;
  private readonly objectiveMarkerGroup = new THREE.Group();
  private readonly objectiveMarkers: THREE.Group[] = [];
  private escortVehicleMesh: THREE.Group | null = null;
  private bossPhase: 1 | 2 | 3 = 1;
  private bossCycle = 0;
  private bossExposed = true;
  private themeColor = 0x39e5ef;
  private disposed = false;
  private elapsed = 0;
  private boundaryToastCooldown = 0;
  private closeCamera = false;
  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);
  private readonly onKeyUp = (event: KeyboardEvent): void => this.handleKeyUp(event);
  private readonly onPointerDown = (event: PointerEvent): void => this.handlePointerDown(event);
  private readonly onPointerUp = (): void => {
    this.firing = false;
  };
  private readonly onBlur = (): void => {
    this.clearInput();
  };
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
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    const initWidth = container.clientWidth || window.innerWidth;
    const initHeight = container.clientHeight || window.innerHeight;
    this.renderer.setSize(initWidth, initHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.replaceChildren(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');

    this.camera.position.set(0, 12, 20);
    const renderTarget = new THREE.WebGLRenderTarget(initWidth, initHeight, {
      samples: 4,
      type: THREE.HalfFloatType,
    });
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(initWidth * 0.5)), Math.max(1, Math.floor(initHeight * 0.5))),
      0.5,
      0.45,
      0.9,
    );
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.buildLighting();
    this.buildEnvironment();
    this.buildDrone();
    this.buildGates();
    this.buildTaskBeacons();
    this.buildEscortVehicle();
    this.scene.add(this.objectiveMarkerGroup);
    this.resize();
    this.installInput();
    this.animate();
  }

  getPlayerShield(): number {
    return this.shield;
  }
  getScore(): number {
    return this.gateCount * 100 + this.enemyKillCount * 250 + this.scoreBonus;
  }
  getRiverStyle(): RiverStyle {
    return this.riverStyle;
  }
  getVisualStyle(): VisualStyle {
    return this.visualStyle;
  }
  getQuality(): QualityLevel {
    return this.qualityLevel;
  }
  getActiveOpenWorldTask(): OpenWorldTaskDefinition | null {
    return this.activeOpenWorldTask;
  }
  getEquippedDroneId(): DroneId {
    return this.equippedDroneId;
  }
  getEquippedDroneStats(): EffectiveDroneStats {
    return this.equippedStats;
  }

  setEquippedDrone(droneId: DroneId, stats: EffectiveDroneStats): void {
    this.equippedDroneId = droneId;
    this.equippedStats = stats;
    this.applyDroneStyle(this.isRealisticMode());
  }

  setRiverStyle(style: RiverStyle): void {
    this.riverStyle = style;
    this.visualStyle = style;
    if (this.mission) {
      this.applyMissionPalette(this.mission);
    } else {
      this.applyDroneStyle(style === 'realistic');
    }
  }

  setVisualStyle(style: VisualStyle): void {
    this.setRiverStyle(style);
  }

  getFlightModel(): FlightModel {
    return this.flightModel;
  }

  setFlightModel(model: FlightModel): void {
    this.flightModel = model;
  }

  setQuality(level: QualityLevel): void {
    this.qualityLevel = level;
    const resolved: ResolvedQuality = level === 'auto' ? this.autoQuality.getResolved() : level;
    this.applyResolvedQuality(resolved);
  }

  getElapsed(): number {
    return this.elapsed;
  }

  private applyResolvedQuality(resolved: ResolvedQuality): void {
    this.resolvedQuality = resolved;
    const preset = QUALITY_PRESETS[resolved];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    const shadowChanged = this.renderer.shadowMap.enabled !== preset.shadows;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.keyLight.castShadow = preset.shadows;
    if (this.keyLight.shadow) {
      this.keyLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      if (this.keyLight.shadow.map) {
        this.keyLight.shadow.map.dispose();
        (this.keyLight.shadow as any).map = null;
      }
    }
    if (shadowChanged) {
      this.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (m) m.needsUpdate = true;
          });
        }
      });
    }
    this.bloom.enabled = preset.bloomEnabled;
    this.resize();
  }

  isRealisticMode(): boolean {
    if (this.mission?.style) return this.mission.style === 'realistic';
    if (this.mission?.id === 'river') return this.riverStyle === 'realistic';
    return this.visualStyle === 'realistic';
  }

  setTheme(theme: ThemeId): void {
    const colors: Record<ThemeId, number> = { cyan: 0x39e5ef, crimson: 0xff476b, gold: 0xffca68 };
    this.themeColor = colors[theme];
    this.themeMaterials.forEach((material) => {
      if (this.droneRealistic && material === this.droneParts?.neon) return;
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

  setMenuScene(): void {
    this.setActive(false);
    this.clearDynamicObjects();
    this.mission = null;
    this.mode = null;
    this.activeOpenWorldTask = null;
    this.objectiveTracker = null;
    this.clearObjectiveMarkers();
    if (this.escortVehicleMesh) this.escortVehicleMesh.visible = false;
    if (this.droneCargoMesh) this.droneCargoMesh.visible = false;
    this.setTaskBeaconsVisible(false);
    this.gates.forEach((gate) => {
      gate.group.visible = false;
    });
    if (this.visualStyle === 'realistic') {
      this.setEnvironment('highlands');
      this.applyMissionPalette(missionById('r-highlands'));
    } else {
      this.setEnvironment('city');
      this.applyMissionPalette(missionById('training'));
    }
    this.drone.position.set(0, 8, 0);
    this.drone.rotation.set(0, 0, 0);
    this.droneVelocity.set(0, 0, 0);
    this.droneYawVelocity = 0;
    this.camera.position.set(0, 12, 20);
    this.camera.lookAt(0, 8, -10);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
  }

  startMission(mission: MissionDefinition): void {
    this.setActive(false);
    this.clearDynamicObjects();
    this.mission = mission;
    this.mode = mission.id;
    this.activeOpenWorldTask = null;
    this.openWorldTaskCooldown = 1.5;
    this.gateCount = 0;
    this.enemyKillCount = 0;
    this.nearMissCount = 0;
    this.scoreBonus = 0;
    this.shield = MAX_SHIELD;
    this.boostEnergy = 100;
    this.boosting = false;
    this.damageCooldown = 0;
    this.collisionCooldown = 0;
    this.cameraShake = 0;
    this.elapsed = 0;
    this.bossPhase = 1;
    this.bossCycle = 0;
    this.bossExposed = true;
    this.lastTelemetry = 0;
    this.lastShot = 0;
    const maxMag = this.getMaxMagazine();
    this.ammoCount = maxMag;
    this.reloadTimer = 0;
    this.boundaryToastCooldown = 0;
    this.drone.position.set(0, mission.environment === 'river' ? 10 : 12, mission.environment === 'river' ? 24 : 0);
    this.previousPlayerPosition.copy(this.drone.position);
    this.drone.rotation.set(0, 0, 0);
    this.droneVelocity.set(0, 0, 0);
    this.droneYawVelocity = 0;
    this.lastImpactSpeed = 0;
    this.camera.position.set(0, 12, 20);
    this.camera.lookAt(0, 8, -10);
    this.lockedEnemy = null;
    this.applyMissionPalette(mission);
    this.setEnvironment(mission.environment);
    const isOw = mission.id === 'openworld' || mission.id === 'openworld-realistic';
    this.setTaskBeaconsVisible(isOw, mission.id === 'openworld-realistic' ? 'realistic' : 'futuristic');

    // Configura objetivos especiais (rescue, recon, firefight, cargo, escort, survival)
    this.setupObjectiveForSpec(mission.objectiveSpec ?? null);

    this.gates.forEach((gate, index) => {
      gate.collected = false;
      gate.group.visible = mission.objectiveKind === 'gates' && index < mission.objectiveTarget;
      const point = mission.gatePath?.[index];
      gate.group.position.copy(point ? new THREE.Vector3(...point) : this.gatePosition(index));
      gate.baseY = gate.group.position.y;
      const base = gate.group.position.clone().multiplyScalar(0.94);
      base.y = gate.group.position.y;
      gate.group.lookAt(base.x, base.y, base.z);
      const color = this.themeColor;
      gate.ring.material.color.setHex(color);
      gate.ring.material.emissive.setHex(color);
    });
    this.pendingEnemyWave = [];
    this.waveSpawnTimer = 0;
    if (mission.enemyWave && mission.enemyWave.length > 0 && mission.objectiveKind !== 'boss') {
      const wave = mission.enemyWave;
      const staged = wave.length > 4;
      const initialCount = staged ? Math.min(4, wave.length) : wave.length;
      wave.forEach((archetype, index) => {
        if (index < initialCount) this.enemies.push(this.createEnemy(index, false, wave.length, archetype));
        else this.pendingEnemyWave.push({ archetype, index });
      });
      this.waveSpawnTimer = staged ? 3.8 : 0;
    } else if (mission.objectiveKind === 'boss') {
      this.enemies.push(this.createEnemy(0, true, 1));
    }
    this.callbacks.onEvent({ type: 'damage', shield: this.shield });
    this.callbacks.onEvent({ type: 'gate', count: 0, target: mission.objectiveTarget });
    this.callbacks.onEvent({ type: 'enemyDestroyed', count: 0, target: mission.objectiveTarget });
    this.callbacks.onEvent({ type: 'score', value: 0 });
    if (mission.objectiveKind === 'boss') this.callbacks.onEvent({ type: 'boss', hp: 1, phase: 1, exposed: true });
    if (isOw) this.callbacks.onEvent({ type: 'openWorldFreeRoam' });
    this.callbacks.onEvent({
      type: 'telemetry',
      speed: 0,
      altitude: 16,
      boost: 100,
      ammo: this.isRealisticMode() ? this.ammoCount : null,
      maxAmmo: this.isRealisticMode() ? maxMag : null,
      reloading: false,
    });
    this.audio.play('gate');
  }

  private isOpenWorldActive(): boolean {
    return this.mode === 'openworld' || this.mode === 'openworld-realistic';
  }

  startOpenWorldTask(taskId: OpenWorldTaskId): void {
    if (!this.isOpenWorldActive()) return;
    const task = openWorldTaskById(taskId);
    this.clearDynamicObjects();
    this.activeOpenWorldTask = task;
    this.setTaskBeaconsVisible(false);
    this.gateCount = 0;
    this.enemyKillCount = 0;
    this.bossPhase = 1;
    this.bossCycle = 0;
    this.bossExposed = true;

    this.setupObjectiveForSpec(task.objectiveSpec ?? null);

    this.gates.forEach((gate, index) => {
      gate.collected = false;
      const point = task.gatePath?.[index];
      gate.group.visible = task.kind === 'gates' && index < task.target && Boolean(point);
      if (point) {
        gate.group.position.set(point[0], point[1], point[2]);
        gate.baseY = point[1];
        const nextPoint = task.gatePath?.[index + 1] ?? task.gatePath?.[0];
        if (nextPoint) gate.group.lookAt(nextPoint[0], point[1], nextPoint[2]);
      }
      gate.ring.material.color.setHex(task.color);
      gate.ring.material.emissive.setHex(task.color);
    });

    if (task.enemyWave && task.enemyWave.length > 0 && task.kind !== 'boss') {
      const wave = task.enemyWave;
      const initialCount = Math.min(4, wave.length);
      wave.forEach((archetype, index) => {
        if (index < initialCount) this.enemies.push(this.createEnemy(index, false, wave.length, archetype));
        else this.pendingEnemyWave.push({ archetype, index });
      });
      this.waveSpawnTimer = 3.5;
    } else if (task.kind === 'boss') {
      this.enemies.push(this.createEnemy(0, true, 1));
      this.callbacks.onEvent({ type: 'boss', hp: 1, phase: 1, exposed: true });
    }

    this.audio.play('gate');
    this.callbacks.onEvent({ type: 'openWorldTaskStarted', task });
    this.callbacks.onEvent({ type: 'toast', text: `${task.code} · INICIADA` });
  }

  cancelOpenWorldTask(): void {
    if (!this.isOpenWorldActive() || !this.activeOpenWorldTask) return;
    this.clearDynamicObjects();
    this.gates.forEach((gate) => {
      gate.group.visible = false;
    });
    this.activeOpenWorldTask = null;
    this.objectiveTracker = null;
    this.clearObjectiveMarkers();
    if (this.escortVehicleMesh) this.escortVehicleMesh.visible = false;
    if (this.droneCargoMesh) this.droneCargoMesh.visible = false;
    this.openWorldTaskCooldown = 2.5;
    this.setTaskBeaconsVisible(true, this.mode === 'openworld-realistic' ? 'realistic' : 'futuristic');
    this.callbacks.onEvent({ type: 'openWorldFreeRoam' });
    this.callbacks.onEvent({ type: 'toast', text: 'TASK ABORTADA · VOO LIVRE RETOMADO' });
  }

  private completeOpenWorldTask(): void {
    const task = this.activeOpenWorldTask;
    if (!task) return;
    this.scoreBonus += task.rewardPoints;
    this.shield = MAX_SHIELD;
    this.clearDynamicObjects();
    this.gates.forEach((gate) => {
      gate.group.visible = false;
    });
    this.activeOpenWorldTask = null;
    this.objectiveTracker = null;
    this.clearObjectiveMarkers();
    if (this.escortVehicleMesh) this.escortVehicleMesh.visible = false;
    if (this.droneCargoMesh) this.droneCargoMesh.visible = false;
    this.openWorldTaskCooldown = 3.2;
    this.setTaskBeaconsVisible(true, this.mode === 'openworld-realistic' ? 'realistic' : 'futuristic');
    this.audio.play('win');
    this.spawnBurst(this.drone.position, task.color, 65, 16, 1.0);
    this.callbacks.onEvent({ type: 'damage', shield: this.shield });
    this.callbacks.onEvent({ type: 'score', value: this.getScore() });
    this.callbacks.onEvent({ type: 'openWorldTaskCompleted', task, totalScore: this.getScore() });
    this.callbacks.onEvent({ type: 'toast', text: `TASK CONCLUÍDA! +${task.rewardPoints} PTS` });
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
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.dispose();
    this.composer.dispose();
    const disposedTextures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
              disposedTextures.add(value);
              value.dispose();
            }
          }
          material.dispose();
        });
      }
    });
    this.container.replaceChildren();
  }

  private buildLighting(): void {
    const shadow = this.keyLight.shadow;
    const shadowExtent = 38;
    this.keyLight.castShadow = true;
    shadow.mapSize.set(1024, 1024);
    shadow.camera.near = 6;
    shadow.camera.far = 160;
    shadow.camera.left = -shadowExtent;
    shadow.camera.right = shadowExtent;
    shadow.camera.top = shadowExtent;
    shadow.camera.bottom = -shadowExtent;
    shadow.bias = -0.00035;
    shadow.normalBias = 0.02;
    this.scene.add(this.ambientLight, this.hemiLight, this.keyLight, this.keyLight.target);
    this.updateKeyLight();
    this.rimLight.position.set(-40, 22, -48);
    this.scene.add(this.rimLight);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture;
    environment.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    pmrem.dispose();
  }

  /** Alterna o drone entre o visual cyberpunk e o realista, aplicando o chassi equipado. */
  private applyDroneStyle(realistic: boolean): void {
    const parts = this.droneParts;
    if (!parts) return;
    this.droneRealistic = realistic;
    const def = droneById(this.equippedDroneId);
    const style = (
      material: THREE.MeshStandardMaterial,
      color: number,
      emissive: number,
      emissiveIntensity: number,
      metalness: number,
      roughness: number,
    ): void => {
      material.color.setHex(color);
      material.emissive.setHex(emissive);
      material.emissiveIntensity = emissiveIntensity;
      material.metalness = metalness;
      material.roughness = roughness;
    };
    if (realistic) {
      style(parts.hull, def.colors.hull, 0x000000, 0, 0.2, 0.46);
      style(parts.armor, def.colors.armor, 0x000000, 0, 0.25, 0.5);
      style(parts.carbon, def.colors.propTip, 0x000000, 0, 0.14, 0.58);
      style(parts.chrome, 0x303337, 0x000000, 0, 0.38, 0.38);
      style(parts.copper, 0x3a3d41, 0x000000, 0, 0.42, 0.44);
      style(parts.neon, def.colors.accent, def.colors.accent, 0.35, 0.25, 0.42);
      style(parts.glass, 0x10161a, 0x000000, 0, 0.1, 0.08);
      style(parts.lens, 0x0b0f12, 0x000000, 0, 0.6, 0.05);
      parts.tip.color.setHex(def.colors.accent);
    } else {
      style(parts.hull, def.colors.hull, 0x07131d, 0.68, 0.28, 0.48);
      style(parts.armor, def.colors.armor, 0x081723, 0.9, 0.4, 0.38);
      style(parts.carbon, def.colors.propTip, 0x07131d, 0.7, 0.24, 0.5);
      style(parts.chrome, 0x9ab0ba, 0x000000, 1, 0.94, 0.16);
      style(parts.copper, 0xb86742, 0x000000, 1, 0.85, 0.28);
      style(parts.neon, def.colors.accent, def.colors.accent, 2.2, 0.15, 0.2);
      style(parts.glass, 0x1a5268, 0x061923, 0.35, 0.08, 0.2);
      style(parts.lens, def.colors.accent, def.colors.accent, 1.5, 0.35, 0.12);
      parts.tip.color.setHex(def.colors.accent);
    }
    const hullFlat = !realistic;
    if (parts.hull.flatShading !== hullFlat) {
      parts.hull.flatShading = hullFlat;
      parts.hull.needsUpdate = true;
    }
    this.droneCyberOnly.forEach((object) => {
      object.visible = !realistic;
    });
    this.droneHexExtras.forEach((object) => {
      object.visible = def.chassisShape === 'hex';
    });
    this.droneWingExtras.forEach((object) => {
      object.visible = def.chassisShape === 'wing';
    });
    this.droneRacerExtras.forEach((object) => {
      object.visible = def.chassisShape === 'racer';
    });
    if (this.droneCoreLight) {
      this.droneCoreLight.color.setHex(def.colors.accent);
      this.droneCoreLight.intensity = realistic ? 0 : 3.2;
    }
  }

  private updateKeyLight(): void {
    const target = this.drone.position;
    this.keyLight.target.position.copy(target);
    this.keyLight.position.copy(target).add(KEY_LIGHT_OFFSET);
    this.keyLight.target.updateMatrixWorld();
  }

  private prepareObject(root: THREE.Object3D, cast: boolean, receive: boolean, envIntensity: number): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      let lit = false;
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.envMapIntensity =
            material instanceof THREE.MeshPhysicalMaterial && material.clearcoat > 0
              ? envIntensity * 0.4
              : envIntensity;
          lit = true;
        }
      }
      if (!lit) return;
      object.castShadow = cast;
      object.receiveShadow = receive;
    });
  }

  private buildEnvironment(): void {
    const city = new THREE.Group();
    const grid = new THREE.GridHelper(270, 108, 0x266e81, 0x163041);
    this.arenaGrid = grid;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.46;
    city.add(grid);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(185, 96),
      new THREE.MeshBasicMaterial({ color: 0x122131, transparent: true, opacity: 0.56, side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.12;
    city.add(floor);

    for (const [index, radius] of [24, 48, 72].entries()) {
      const material = new THREE.MeshBasicMaterial({
        color: index === 0 ? 0x2d9eb7 : 0x24445d,
        transparent: true,
        opacity: index === 0 ? 0.28 : 0.2,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.075, 6, 144), material);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.04;
      city.add(ring);
      this.arenaAccents.push(material);
    }

    const random = this.seededRandom(80989);
    const buildingPalette = [0x1a2a3c, 0x203349, 0x142536].map((color) => new THREE.Color(color));
    const beaconPalette = [0x36c4d8, 0xd4537c, 0xe0b45f].map((color) => new THREE.Color(color));
    const buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x07111d,
        emissiveIntensity: 0.55,
        metalness: 0.16,
        roughness: 0.72,
      }),
      94,
    );
    const beacons = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.03, 0.22, 1.03),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 }),
      47,
    );
    const windows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.12, 0.55, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.86 }),
      376,
    );
    const dummy = new THREE.Object3D();
    let beaconCount = 0;
    let windowCount = 0;
    for (let index = 0; index < 94; index++) {
      const angle = random() * Math.PI * 2;
      const distance = 98 + random() * 74;
      const width = 4.5 + random() * 7;
      const depth = width * (0.65 + random() * 0.45);
      const height = 14 + random() * 51;
      const bx = Math.cos(angle) * distance;
      const bz = Math.sin(angle) * distance;
      const byaw = -angle + random() * 0.4;

      dummy.position.set(bx, height / 2 - 1, bz);
      dummy.rotation.set(0, byaw, 0);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      buildings.setMatrixAt(index, dummy.matrix);
      buildings.setColorAt(index, buildingPalette[index % buildingPalette.length]);

      if (index % 2 === 0) {
        dummy.position.set(bx, height - 1.5, bz);
        dummy.rotation.set(0, byaw, 0);
        dummy.scale.set(width, 1, depth);
        dummy.updateMatrix();
        beacons.setMatrixAt(beaconCount, dummy.matrix);
        beacons.setColorAt(beaconCount, beaconPalette[index % beaconPalette.length]);
        beaconCount++;
      }
      for (let floorIndex = 0; floorIndex < Math.min(4, Math.floor(height / 13)); floorIndex++) {
        dummy.position.set(bx + width * 0.25, 3 + floorIndex * 4.3, bz - depth * 0.51);
        dummy.rotation.set(0, byaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        windows.setMatrixAt(windowCount, dummy.matrix);
        windows.setColorAt(windowCount, beaconPalette[(index + floorIndex) % beaconPalette.length]);
        windowCount++;
      }
    }
    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    beacons.count = beaconCount;
    beacons.instanceMatrix.needsUpdate = true;
    if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;
    windows.count = windowCount;
    windows.instanceMatrix.needsUpdate = true;
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    city.add(buildings, beacons, windows);

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
    city.add(
      new THREE.Points(
        stars,
        new THREE.PointsMaterial({ color: 0x7bdce7, size: 0.65, transparent: true, opacity: 0.65, sizeAttenuation: true }),
      ),
    );
    this.buildArenaMarkers(city);
    populateClassicColliders('city', this.cityCollision);
    this.prepareObject(city, false, true, 0.35);
    this.scene.add(city);
    this.environmentGroups.set('city', city);
  }

  /** Carrega sob demanda (lazy) o cenário 3D solicitado para não travar o boot inicial. */
  private ensureEnvironmentLoaded(environment: ScenarioEnvironment): void {
    if (this.environmentGroups.has(environment)) return;
    if (environment === 'city') return;
    const layer = buildScenarioScenery(environment);
    layer.root.visible = false;
    this.prepareObject(layer.root, false, true, 0.35);
    this.scene.add(layer.root);
    this.environmentGroups.set(environment, layer.root);
    this.environmentLayers.set(environment, layer);
    if (layer.followCamera) this.environmentFollowers.set(environment, layer.followCamera);
    this.animatedTextures.push(...layer.animatedTextures);
  }

  private applyMissionPalette(mission: MissionDefinition): void {
    const activePalette =
      mission.id === 'river' ? RIVER_STYLE_CONFIGS[this.riverStyle].palette : mission.palette;
    const realistic = this.isRealisticMode();
    const daylight =
      realistic &&
      mission.environment !== 'refinery';
    this.scene.background = new THREE.Color(activePalette.background);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(activePalette.fog);
      this.scene.fog.density =
        mission.environment === 'river'
          ? daylight
            ? 0.0021
            : 0.0028
          : mission.environment === 'openworld' || mission.environment === 'metro-open'
            ? 0.0019
            : mission.environment === 'harbor' || mission.environment === 'wildfire'
              ? 0.0044
              : 0.0032;
    }
    this.renderer.toneMappingExposure = daylight ? 0.92 : 1.1;
    this.ambientLight.color.setHex(daylight ? 0xc8ded4 : 0x8fa8c4);
    this.ambientLight.intensity = daylight ? 0.45 : 0.28;
    this.hemiLight.color.setHex(daylight ? 0xd2ebe2 : 0x70b8d4);
    this.hemiLight.groundColor.setHex(daylight ? 0x4d6146 : 0x1a2538);
    this.hemiLight.intensity = daylight ? 1.15 : 0.62;
    this.keyLight.color.setHex(daylight ? 0xfff0d2 : 0xe4f2ff);
    this.keyLight.intensity = daylight ? 1.65 : 2.6;
    this.rimLight.color.setHex(daylight ? 0x9ec7be : 0x5fb4ff);
    this.rimLight.intensity = daylight ? 0.55 : 0.9;
    this.applyDroneStyle(realistic);
    this.bloom.threshold = realistic ? 1.18 : 0.9;
    this.bloom.strength = realistic ? 0.26 : 0.52;
    this.arenaAccents.forEach((material, index) =>
      material.color.setHex(index === 0 ? activePalette.gridCenter : activePalette.gridLines),
    );
    const materials = this.arenaGrid?.material;
    if (!materials) return;
    const list = Array.isArray(materials) ? materials : [materials];
    list.forEach((material, index) => {
      if (material instanceof THREE.LineBasicMaterial) {
        material.color.setHex(index === 0 ? activePalette.gridCenter : activePalette.gridLines);
      }
    });
  }

  private setEnvironment(environment: ScenarioEnvironment): void {
    this.ensureEnvironmentLoaded(environment);
    for (const [kind, group] of this.environmentGroups) {
      group.visible = kind === environment;
    }
    if (environment === 'city') {
      this.activeCollision = this.cityCollision;
      this.activeDestructibles = [];
      this.activeVehicles = [];
    } else {
      const layer = this.environmentLayers.get(environment);
      if (layer) {
        this.activeCollision = layer.collision;
        this.activeDestructibles = layer.destructibles;
        this.activeVehicles = layer.vehicles;
      }
    }
  }

  private buildArenaMarkers(parent: THREE.Group): void {
    for (let index = 0; index < 24; index++) {
      const angle = (index / 24) * Math.PI * 2;
      const radius = 88;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 3.5, 0.45),
        new THREE.MeshBasicMaterial({ color: 0x1b7b90, transparent: true, opacity: 0.6 }),
      );
      marker.position.set(Math.cos(angle) * radius, 1.7, Math.sin(angle) * radius);
      marker.lookAt(0, 1.7, 0);
      parent.add(marker);
    }
  }

  private buildDrone(): void {
    const armor = new THREE.MeshStandardMaterial({
      color: 0x34495d,
      emissive: 0x081723,
      emissiveIntensity: 0.9,
      metalness: 0.38,
      roughness: 0.4,
    });
    const carbon = new THREE.MeshStandardMaterial({
      color: 0x172635,
      emissive: 0x07131d,
      emissiveIntensity: 0.7,
      metalness: 0.22,
      roughness: 0.52,
    });
    const hull = new THREE.MeshStandardMaterial({
      color: 0x263a4d,
      emissive: 0x07131d,
      emissiveIntensity: 0.65,
      metalness: 0.24,
      roughness: 0.54,
      flatShading: true,
    });
    const chrome = new THREE.MeshStandardMaterial({ color: 0x9ab0ba, metalness: 0.94, roughness: 0.16 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xb86742, metalness: 0.85, roughness: 0.28 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x1a5268,
      emissive: 0x061923,
      emissiveIntensity: 0.35,
      metalness: 0.08,
      roughness: 0.2,
      transmission: 0.12,
      transparent: true,
      opacity: 0.9,
      clearcoat: 0.9,
    });
    const neon = this.makeNeonMaterial();
    this.drone.position.set(0, 8, 0);
    const core = new THREE.Group();
    const body = new THREE.Mesh(createFuselageGeometry(), hull);
    core.add(body);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), glass);
    canopy.scale.set(1, 0.42, 1.12);
    canopy.position.set(0, 0.39, -0.16);
    core.add(canopy);
    const cameraHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.2, 12), armor);
    cameraHousing.position.set(0, 0.42, -0.48);
    core.add(cameraHousing);
    const cameraLens = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 16, 10),
      new THREE.MeshPhysicalMaterial({
        color: 0x65e9f0,
        emissive: 0x1599ac,
        emissiveIntensity: 1.5,
        metalness: 0.35,
        roughness: 0.12,
        clearcoat: 1,
      }),
    );
    cameraLens.scale.set(1, 0.82, 0.42);
    cameraLens.position.set(0, 0.45, -0.59);
    core.add(cameraLens);
    const lensBezel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), chrome);
    lensBezel.position.set(0, 0.45, -0.61);
    core.add(lensBezel);
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.045, 10, 48), neon);
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.y = -0.02;
    core.add(coreRing);
    this.droneCyberOnly.push(coreRing);

    const armorPanel = new THREE.BoxGeometry(0.72, 0.13, 0.9);
    const panelInset = new THREE.BoxGeometry(0.48, 0.045, 0.58);
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(armorPanel, armor);
      panel.position.set(side * 0.53, 0.24, 0.24);
      panel.rotation.z = side * -0.14;
      core.add(panel);
      const inset = new THREE.Mesh(panelInset, carbon);
      inset.position.set(side * 0.53, 0.32, 0.25);
      inset.rotation.z = side * -0.14;
      core.add(inset);

      const sideLight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.52), neon);
      sideLight.position.set(side * 0.91, 0.1, -0.42);
      sideLight.rotation.y = side * 0.16;
      core.add(sideLight);
      this.droneCyberOnly.push(sideLight);

      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.42), chrome);
      vent.position.set(side * 0.34, 0.2, 0.88);
      vent.rotation.y = side * 0.22;
      core.add(vent);
    }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.64), neon);
    spine.position.set(0, 0.25, 0.62);
    core.add(spine);
    this.droneCyberOnly.push(spine);
    this.drone.add(core);
    const coreLight = new THREE.PointLight(this.themeColor, 3.2, 13, 2);
    coreLight.position.set(0, 0.45, -0.2);
    this.drone.add(coreLight);
    this.droneCoreLight = coreLight;

    // Caixa de carga médica suspensa (visível quando carregando carga no objetivo 'cargo')
    const cargoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.65, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xe85d04, roughness: 0.4, metalness: 0.25 }),
    );
    cargoMesh.position.set(0, -1.25, 0);
    cargoMesh.visible = false;
    this.drone.add(cargoMesh);
    this.droneCargoMesh = cargoMesh;

    const blurTexture = this.createRotorBlurTexture();
    const bladeGeoCW = createPropellerBladeGeometry(1);
    const bladeGeoCCW = createPropellerBladeGeometry(-1);
    const tipMaterial = new THREE.MeshStandardMaterial({ color: 0xe86830, roughness: 0.35, metalness: 0.15 });

    const makeRotorArm = (rotorX: number, rotorZ: number, direction: number, parentGroup: THREE.Group): void => {
      const armLength = Math.hypot(rotorX, rotorZ);
      const armYaw = Math.atan2(rotorX, rotorZ);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 1), armor);
      arm.position.set(rotorX * 0.5, -0.06, rotorZ * 0.5);
      arm.rotation.y = armYaw;
      arm.scale.z = armLength;
      parentGroup.add(arm);
      const armStrut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.075, 1), carbon);
      armStrut.position.set(rotorX * 0.5, -0.145, rotorZ * 0.5);
      armStrut.rotation.y = armYaw;
      armStrut.scale.z = armLength * 0.92;
      parentGroup.add(armStrut);
      const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1), neon);
      conduit.position.set(rotorX * 0.5, -0.19, rotorZ * 0.5);
      conduit.rotation.y = armYaw;
      conduit.scale.z = armLength;
      parentGroup.add(conduit);
      this.droneCyberOnly.push(conduit);

      const rotor = new THREE.Group();
      rotor.position.set(rotorX, 0.05, rotorZ);
      const mountBase = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.44, 0.14, 24), carbon);
      mountBase.position.y = -0.14;
      rotor.add(mountBase);
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.28, 24), armor);
      mount.position.y = 0.04;
      rotor.add(mount);
      const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.16, 20), copper);
      stator.position.y = 0.12;
      rotor.add(stator);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.038, 10, 36), copper);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.17;
      rotor.add(collar);
      const guard = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.065, 12, 48), carbon);
      guard.rotation.x = Math.PI / 2;
      guard.position.y = 0.26;
      rotor.add(guard);
      this.droneCyberOnly.push(guard);
      const guardGlow = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.022, 8, 48), neon);
      guardGlow.rotation.x = Math.PI / 2;
      guardGlow.position.y = 0.275;
      rotor.add(guardGlow);
      this.droneCyberOnly.push(guardGlow);

      const propWash = new THREE.Mesh(
        new THREE.CircleGeometry(0.86, 32),
        new THREE.MeshBasicMaterial({
          color: this.themeColor,
          transparent: true,
          opacity: 0.055,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      propWash.rotation.x = -Math.PI / 2;
      propWash.position.y = 0.08;
      rotor.add(propWash);
      this.droneCyberOnly.push(propWash);

      const blades = new THREE.Group();
      blades.position.y = 0.27;
      const bladeGeometry = direction > 0 ? bladeGeoCW : bladeGeoCCW;
      for (let bladeIndex = 0; bladeIndex < 3; bladeIndex++) {
        const pivot = new THREE.Group();
        pivot.rotation.y = (bladeIndex / 3) * Math.PI * 2;
        const blade = new THREE.Mesh(bladeGeometry, carbon);
        pivot.add(blade);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.11), tipMaterial);
        tip.position.set(direction * 0.055, 0.002, 0.93);
        tip.rotation.z = 0.16 * direction;
        pivot.add(tip);
        blades.add(pivot);
      }
      const motionDisc = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 1.03, 48),
        new THREE.MeshBasicMaterial({
          map: blurTexture,
          transparent: true,
          opacity: 0.34,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      motionDisc.rotation.x = -Math.PI / 2;
      motionDisc.position.y = 0.005;
      blades.add(motionDisc);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.14, 20), chrome);
      hub.position.y = 0.02;
      blades.add(hub);
      const spinnerCap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.14, 20), neon);
      spinnerCap.position.y = 0.15;
      blades.add(spinnerCap);

      rotor.add(blades);
      parentGroup.add(rotor);
      this.rotors.push({ group: blades, direction });
    };

    for (const { x: rotorX, z: rotorZ, direction } of PLAYER_ROTOR_LAYOUT) {
      makeRotorArm(rotorX, rotorZ, direction, this.drone);
    }

    // Braços laterais extras para drones Hexacópteros (Heavy-Hex / Valkyrie Gunship)
    const hexGroup = new THREE.Group();
    for (const { x: rotorX, z: rotorZ, direction } of PLAYER_HEX_EXTRA_ROTORS) {
      makeRotorArm(rotorX, rotorZ, direction, hexGroup);
    }
    this.drone.add(hexGroup);
    this.droneHexExtras.push(hexGroup);

    // Asas enflechadas e cauda V-Tail para VANTs Híbridos (Predator / Omega-Core)
    const wingGroup = new THREE.Group();
    const leftWing = new THREE.Mesh(this.enemyWingLeftGeo, armor);
    leftWing.scale.set(1.65, 1.1, 1.25);
    leftWing.position.set(-0.6, 0.06, 0.08);
    const rightWing = new THREE.Mesh(this.enemyWingRightGeo, armor);
    rightWing.scale.set(1.65, 1.1, 1.25);
    rightWing.position.set(0.6, 0.06, 0.08);
    const vTailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.48), neon);
    vTailLeft.position.set(-0.42, 0.42, 1.22);
    vTailLeft.rotation.z = 0.45;
    const vTailRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.48), neon);
    vTailRight.position.set(0.42, 0.42, 1.22);
    vTailRight.rotation.z = -0.45;
    wingGroup.add(leftWing, rightWing, vTailLeft, vTailRight);
    this.drone.add(wingGroup);
    this.droneWingExtras.push(wingGroup);

    // Aletas aerodinâmicas dorsais para drones Racer (FPV-Racer / Specter-Neon)
    const racerGroup = new THREE.Group();
    for (const side of [-1, 1] as const) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.85), neon);
      fin.position.set(side * 0.56, 0.44, 0.48);
      fin.rotation.z = side * -0.22;
      racerGroup.add(fin);
    }
    this.drone.add(racerGroup);
    this.droneRacerExtras.push(racerGroup);

    for (const side of [-1, 1]) {
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.62), armor);
      mount.position.set(side * 0.64, -0.14, -0.68);
      this.drone.add(mount);
      const barrel = new THREE.Group();
      barrel.position.set(side * 0.86, -0.16, -0.82);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 1.18, 12), chrome);
      tube.rotation.x = Math.PI / 2;
      tube.position.z = -0.38;
      barrel.add(tube);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 8, 16), neon);
      muzzle.position.z = -0.96;
      barrel.add(muzzle);
      this.drone.add(barrel);
    }
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.86, 8), armor);
      strut.position.set(side * 1.03, -0.67, 0.26);
      strut.rotation.z = side * -0.28;
      this.drone.add(strut);
      const skidPath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.78, -0.78, -0.5),
        new THREE.Vector3(side * 1.28, -1.12, -0.2),
        new THREE.Vector3(side * 1.3, -1.14, 0.95),
        new THREE.Vector3(side * 0.96, -0.78, 1.18),
      ]);
      this.drone.add(new THREE.Mesh(new THREE.TubeGeometry(skidPath, 18, 0.065, 7, false), chrome));
    }
    this.droneParts = {
      hull,
      armor,
      carbon,
      chrome,
      copper,
      glass,
      neon,
      lens: cameraLens.material as THREE.MeshPhysicalMaterial,
      tip: tipMaterial,
    };
    this.applyDroneStyle(false);
    this.prepareObject(this.drone, true, false, 1.2);
    this.scene.add(this.drone);
  }

  private buildGates(): void {
    for (let index = 0; index < 8; index++) {
      const material = this.makeNeonMaterial();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.13, 14, 52), material);
      const group = new THREE.Group();
      group.add(ring);
      const inner = new THREE.Mesh(
        new THREE.TorusGeometry(3.65, 0.025, 6, 48),
        new THREE.MeshBasicMaterial({ color: this.themeColor, transparent: true, opacity: 0.32 }),
      );
      group.add(inner);
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), material);
      marker.position.y = 4.7;
      group.add(marker);
      group.visible = false;
      this.scene.add(group);
      this.gates.push({ group, ring, collected: false, baseY: 0 });
    }
  }

  private buildTaskBeacons(): void {
    const allTasks: { task: OpenWorldTaskDefinition; style: VisualStyle }[] = [
      ...OPEN_WORLD_TASKS.map((task) => ({ task, style: 'futuristic' as const })),
      ...REALISTIC_OPEN_WORLD_TASKS.map((task) => ({ task, style: 'realistic' as const })),
    ];
    for (const { task, style } of allTasks) {
      const group = new THREE.Group();
      const ringMat = new THREE.MeshStandardMaterial({
        color: task.color,
        emissive: task.color,
        emissiveIntensity: style === 'realistic' ? 1.1 : 2.2,
        metalness: 0.2,
        roughness: 0.25,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.2, 14, 48), ringMat);
      group.add(ring);

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(4.4, 4.4, 24, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: task.color,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      pillar.position.y = -4;
      group.add(pillar);

      const crest = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), ringMat);
      crest.position.y = 6.8;
      group.add(crest);

      const [bx, by, bz] = task.beaconPosition;
      group.position.set(bx, by, bz);
      group.lookAt(0, by, 0);
      group.visible = false;
      this.scene.add(group);
      this.taskBeacons.push({ task, style, group, ring, crest, baseY: by });
    }
  }

  private setTaskBeaconsVisible(visible: boolean, style: VisualStyle = 'futuristic'): void {
    for (const beacon of this.taskBeacons) {
      beacon.group.visible = visible && beacon.style === style;
    }
  }

  private buildEscortVehicle(): void {
    const group = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 2.2, 6.8),
      new THREE.MeshStandardMaterial({ color: 0x4b5d46, roughness: 0.55, metalness: 0.35 }),
    );
    chassis.position.y = 1.4;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 1.5, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xd8e2dc, roughness: 0.35 }),
    );
    cabin.position.set(0, 2.6, -1.6);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x39e5ef }),
    );
    beacon.position.set(0, 3.6, -1.6);
    group.add(chassis, cabin, beacon);
    group.visible = false;
    this.scene.add(group);
    this.escortVehicleMesh = group;
  }

  private clearObjectiveMarkers(): void {
    for (const m of this.objectiveMarkers) {
      this.objectiveMarkerGroup.remove(m);
    }
    this.objectiveMarkers.length = 0;
  }

  private setupObjectiveForSpec(spec: MissionDefinition['objectiveSpec'] | null): void {
    this.clearObjectiveMarkers();
    if (this.escortVehicleMesh) this.escortVehicleMesh.visible = false;
    if (this.droneCargoMesh) this.droneCargoMesh.visible = false;
    if (!spec) {
      this.objectiveTracker = null;
      return;
    }
    this.objectiveTracker = new ObjectiveTracker(spec);

    const makeMarker = (x: number, y: number, z: number, color: number): THREE.Group => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.8, 0.18, 12, 36),
        new THREE.MeshBasicMaterial({ color }),
      );
      ring.rotation.x = Math.PI / 2;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.6, 18, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      beam.position.y = 8;
      g.add(ring, beam);
      g.position.set(x, y, z);
      this.objectiveMarkerGroup.add(g);
      this.objectiveMarkers.push(g);
      return g;
    };

    if (spec.kind === 'rescue') {
      for (const [x, y, z] of spec.points) makeMarker(x, y, z, 0x52b788);
    } else if (spec.kind === 'recon') {
      for (const [x, y, z] of spec.targets) makeMarker(x, y, z, 0x3ba8ff);
    } else if (spec.kind === 'firefight') {
      for (const [x, y, z] of spec.fires) makeMarker(x, y, z, 0xff595e);
    } else if (spec.kind === 'cargo') {
      const first = spec.deliveries[0];
      if (first) makeMarker(first.pickup[0], first.pickup[1], first.pickup[2], 0xffca3a);
    } else if (spec.kind === 'escort' && this.escortVehicleMesh) {
      this.escortVehicleMesh.visible = true;
      const start = spec.waypoints[0] ?? [0, 0, 0];
      this.escortVehicleMesh.position.set(start[0], start[1], start[2]);
    }
  }

  private gatePosition(index: number): THREE.Vector3 {
    const angle = (index / 6) * Math.PI * 2 + 0.14;
    const radius = 47 + (index % 2) * 8;
    return new THREE.Vector3(Math.sin(angle) * radius, 9 + Math.sin(index * 1.4) * 3.8, Math.cos(angle) * radius);
  }

  private createEnemy(index: number, boss: boolean, total: number, archetype: EnemyArchetype = 'scout'): Enemy {
    const group = new THREE.Group();
    const isAttackHeli =
      boss &&
      (this.activeOpenWorldTask?.bossKind === 'attackheli' || this.mission?.bossKind === 'attackheli');
    const scale = boss
      ? this.mission?.id === 'dam' || this.mission?.id === 'r-dam'
        ? 3.0
        : 2.7
      : archetype === 'bulwark' || archetype === 'heavyhex' || archetype === 'gunboat'
        ? 1.32
        : archetype === 'sniper' || archetype === 'fixedwing' || archetype === 'aaturret'
          ? 1.18
          : archetype === 'gunner'
            ? 1.1
            : archetype === 'swarmer' || archetype === 'fpv'
              ? 0.82
              : 0.9;
    group.scale.setScalar(scale);

    const archetypeColor: Record<EnemyArchetype, number> = {
      scout: 0xff476b,
      gunner: 0xb56cff,
      bulwark: 0xff9b54,
      sniper: 0x39e5ef,
      swarmer: 0x70f0c2,
      fpv: 0xff6b35,
      fixedwing: 0x4ea8de,
      aaturret: 0xe63946,
      heavyhex: 0xf4a261,
      gunboat: 0x2ec4b6,
    };
    const archetypeEmissive: Record<EnemyArchetype, number> = {
      scout: 0x641226,
      gunner: 0x35134d,
      bulwark: 0x54200e,
      sniper: 0x0b4f5c,
      swarmer: 0x114d38,
      fpv: 0x5c1f08,
      fixedwing: 0x123b52,
      aaturret: 0x590d16,
      heavyhex: 0x542d0e,
      gunboat: 0x0b4a44,
    };
    const color = boss ? 0xff3159 : archetypeColor[archetype];
    const emissiveHex = boss ? 0x8b102c : archetypeEmissive[archetype];
    const isRealistic = this.isRealisticMode();

    const hullGeo = isAttackHeli
      ? this.enemyHullGeometries.attackheli
      : boss
        ? this.enemyHullGeometries.boss
        : this.enemyHullGeometries[archetype];
    const hullMesh = new THREE.Mesh(
      hullGeo,
      isRealistic ? this.sharedEnemyRealisticMat : this.sharedEnemyArmorMat,
    );
    group.add(hullMesh);

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0xd96b27 : color,
      emissive: isRealistic ? 0x421b05 : emissiveHex,
      emissiveIntensity: isRealistic ? 0.9 : boss ? 2.7 : 2.0,
      metalness: 0.28,
      roughness: 0.18,
    });
    const core = new THREE.Mesh(boss ? this.bossCoreGeo : this.enemyCoreGeo, coreMaterial);
    if (isRealistic) core.scale.setScalar(0.58);
    group.add(core);

    const rings: THREE.Mesh[] = [];
    const petals: THREE.Mesh[] = [];
    let heliMainRotor: THREE.Object3D | undefined;
    let heliTailRotor: THREE.Object3D | undefined;

    const ringGeoList = boss ? this.bossRingGeos : this.enemyRingGeos;
    if (!isRealistic) {
      for (let ringIndex = 0; ringIndex < ringGeoList.length; ringIndex++) {
        const ringMaterial = new THREE.MeshStandardMaterial({
          color: ringIndex === 0 ? 0x3a1827 : color,
          emissive: ringIndex === 0 ? 0x260816 : emissiveHex,
          emissiveIntensity: 1.5,
          metalness: 0.78,
          roughness: 0.22,
        });
        const ring = new THREE.Mesh(ringGeoList[ringIndex], ringMaterial);
        ring.rotation.x = ringIndex * 0.85;
        ring.rotation.y = ringIndex * 0.65;
        group.add(ring);
        rings.push(ring);
      }
    }

    if (isAttackHeli) {
      // Helicóptero de ataque realista: rotor principal de 4 pás + cauda + rotor de cauda + asas de foguetes
      const mainRotor = new THREE.Group();
      mainRotor.position.set(0, 0.92, 0);
      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 0.22), this.sharedEnemyDarkMat);
        blade.rotation.y = (b / 4) * Math.PI * 2;
        mainRotor.add(blade);
      }
      group.add(mainRotor);
      heliMainRotor = mainRotor;

      const tailRouter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.14), this.sharedEnemyDarkMat);
      tailRouter.position.set(0.28, 0.35, 2.25);
      group.add(tailRouter);
      heliTailRotor = tailRouter;

      for (const side of [-1, 1] as const) {
        const stubWing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.55), this.sharedEnemyRealisticMat);
        stubWing.position.set(side * 1.1, -0.05, -0.1);
        const pod = new THREE.Mesh(this.enemyPodGeo, this.sharedEnemyDarkMat);
        pod.rotation.x = Math.PI / 2;
        pod.position.set(side * 1.35, -0.24, -0.15);
        group.add(stubWing, pod);
      }
    } else if (boss) {
      for (let armIndex = 0; armIndex < 6; armIndex++) {
        const armAngle = (armIndex / 6) * Math.PI * 2;
        const blade = new THREE.Mesh(this.bossBladeGeo, this.sharedEnemyDarkMat);
        blade.position.set(Math.cos(armAngle) * 1.72, 0, Math.sin(armAngle) * 1.72);
        blade.rotation.z = Math.PI / 2;
        blade.rotation.y = -armAngle;
        group.add(blade);
        petals.push(blade);
      }
    } else if (archetype === 'scout' || archetype === 'fixedwing') {
      const leftWing = new THREE.Mesh(this.enemyWingLeftGeo, this.sharedEnemyDarkMat);
      leftWing.position.set(-0.32, 0.02, 0.1);
      const rightWing = new THREE.Mesh(this.enemyWingRightGeo, this.sharedEnemyDarkMat);
      rightWing.position.set(0.32, 0.02, 0.1);
      if (archetype === 'fixedwing') {
        leftWing.scale.set(1.45, 1, 1.1);
        rightWing.scale.set(1.45, 1, 1.1);
      }
      group.add(leftWing, rightWing);
    } else if (archetype === 'gunner' || archetype === 'aaturret' || archetype === 'gunboat') {
      for (const side of [-1, 1] as const) {
        const pod = new THREE.Mesh(this.enemyPodGeo, this.sharedEnemyDarkMat);
        pod.rotation.x = Math.PI / 2;
        pod.position.set(side * 1.04, -0.1, -0.22);
        group.add(pod);
      }
    } else if (archetype === 'sniper') {
      for (const side of [-1, 1] as const) {
        const rail = new THREE.Mesh(this.enemyRailGeo, this.sharedEnemyDarkMat);
        rail.position.set(side * 0.42, -0.02, -0.82);
        group.add(rail);
      }
    } else if (archetype === 'swarmer' || archetype === 'fpv') {
      for (const [rx, rz] of [
        [-0.86, -0.68],
        [0.86, -0.68],
        [-0.86, 0.68],
        [0.86, 0.68],
      ] as const) {
        const rotorRing = new THREE.Mesh(this.enemyRotorRingGeo, this.sharedEnemyDarkMat);
        rotorRing.rotation.x = Math.PI / 2;
        rotorRing.position.set(rx, 0.18, rz);
        group.add(rotorRing);
      }
    } else {
      for (let plateIdx = 0; plateIdx < 6; plateIdx++) {
        const pAngle = (plateIdx / 6) * Math.PI * 2;
        const plate = new THREE.Mesh(this.enemyShieldPlateGeo, this.sharedEnemyDarkMat);
        plate.position.set(Math.cos(pAngle) * 1.28, 0, Math.sin(pAngle) * 1.28);
        plate.rotation.y = -pAngle + Math.PI / 2;
        group.add(plate);
      }
    }

    if (!isRealistic) {
      const halo = new THREE.Mesh(
        boss ? this.bossHaloGeo : this.enemyHaloGeo,
        new THREE.MeshBasicMaterial({
          color: boss ? 0xff204e : color,
          transparent: true,
          opacity: boss ? 0.16 : 0.11,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      group.add(halo);
    }

    const activeTask = this.activeOpenWorldTask;
    const centerOffset = activeTask ? new THREE.Vector3(...activeTask.beaconPosition) : new THREE.Vector3(0, 0, 0);
    const angle = boss ? Math.PI : (index / Math.max(1, total)) * Math.PI * 2;
    const radius = boss
      ? 40
      : archetype === 'swarmer' || archetype === 'fpv'
        ? 25 + (index % 2) * 7
        : archetype === 'scout'
          ? 32 + (index % 2) * 12
          : archetype === 'sniper' || archetype === 'fixedwing'
            ? 56 + (index % 2) * 8
            : 44 + (index % 2) * 6;
    const baseHeight = boss
      ? 16
      : archetype === 'gunboat'
        ? Math.max(1.2, this.activeCollision.getWaterLevel() + 1.8)
        : archetype === 'aaturret'
          ? 4.5
          : archetype === 'sniper' || archetype === 'fixedwing'
            ? 22 + (index % 2) * 4
            : archetype === 'swarmer' || archetype === 'fpv'
              ? 9 + (index % 3) * 3
              : 14;

    if (!boss && this.mission?.environment === 'river') {
      group.position.set(((index % 4) - 1.5) * 11, baseHeight, -52 + index * 13);
    } else if (activeTask) {
      group.position.set(
        centerOffset.x * 0.55 + Math.cos(angle) * (radius * 0.78),
        baseHeight,
        centerOffset.z * 0.55 + Math.sin(angle) * (radius * 0.78),
      );
    } else {
      group.position.set(Math.cos(angle) * radius, baseHeight, Math.sin(angle) * radius);
    }
    this.prepareObject(group, true, false, 0.9);
    this.scene.add(group);
    const bossPatterns = activeTask?.bossPatterns ?? this.mission?.bossPatterns;
    const bossPattern = bossPatternForPhase(bossPatterns, 1);
    const maxHp = boss
      ? activeTask?.bossHealth ?? this.mission?.bossHealth ?? 720
      : archetype === 'swarmer' || archetype === 'fpv'
        ? 55
        : archetype === 'scout'
          ? 70
          : archetype === 'sniper' || archetype === 'fixedwing'
            ? 90
            : archetype === 'gunner' || archetype === 'aaturret' || archetype === 'gunboat'
              ? 125
              : 200;
    const attackPattern: BossAttackPattern = boss
      ? bossPattern
      : archetype === 'sniper'
        ? 'sniper'
        : archetype === 'swarmer' || archetype === 'fpv' || archetype === 'fixedwing'
          ? 'burst'
          : archetype === 'gunner' || archetype === 'aaturret'
            ? 'fan'
            : archetype === 'bulwark' || archetype === 'heavyhex'
              ? 'charge'
              : 'volley';
    return {
      group,
      core,
      coreMaterial,
      rings,
      petals,
      heliMainRotor,
      heliTailRotor,
      alive: true,
      boss,
      archetype,
      spawnIndex: index,
      hp: maxHp,
      maxHp,
      angle,
      radius,
      baseHeight,
      previousPosition: group.position.clone(),
      velocity: new THREE.Vector3(),
      orbitSpeed: boss
        ? 0.13
        : archetype === 'aaturret'
          ? 0.02
          : (archetype === 'swarmer' || archetype === 'fpv' || archetype === 'fixedwing'
              ? 0.66
              : archetype === 'scout'
                ? 0.52
                : 0.16) * (index % 2 === 0 ? 1 : -1),
      attackTimer: boss ? 2.5 : 2.6 + (index % 3) * 0.32,
      attackCharge: 0,
      attackReady: false,
      attackPattern,
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
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
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
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') ||
        target.tagName === 'TEXTAREA')
    ) {
      return;
    }
    if (!this.active) return;
    this.audio.unlock();
    const key = event.key.toLowerCase();
    if (key === 'v' && !event.repeat) {
      this.closeCamera = !this.closeCamera;
      this.callbacks.onEvent({
        type: 'toast',
        text: this.closeCamera ? 'CÂMERA PRÓXIMA' : 'CÂMERA DE PERSEGUIÇÃO',
      });
      return;
    }
    if (key === 'r' && !event.repeat && this.isRealisticMode()) {
      this.startReload();
      return;
    }
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'c', 'shift'].includes(key)) {
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }
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

  private getMaxMagazine(): number {
    return this.equippedStats.magazineSize;
  }

  private startReload(): void {
    const maxMag = this.getMaxMagazine();
    if (this.reloadTimer > 0 || this.ammoCount >= maxMag) return;
    this.reloadTimer = WEAPON_PROFILES.realistic.reloadSeconds * this.equippedStats.reloadTimeMultiplier;
    this.audio.play('reload');
    this.callbacks.onEvent({ type: 'toast', text: 'RECARREGANDO METRALHADORA TRAÇANTE...' });
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
    if (this.qualityLevel === 'auto') {
      const nextQ = this.autoQuality.sample(dt);
      if (nextQ) {
        this.applyResolvedQuality(nextQ);
        this.callbacks.onEvent({ type: 'qualityChanged', resolved: nextQ });
      }
    }
    if (this.active) this.update(dt, elapsed);
    this.updateAmbient(elapsed, dt);
    this.drawRadar(dt);
    this.updateKeyLight();
    this.composer.render();
  };

  private update(dt: number, elapsed: number): void {
    this.elapsed += dt;
    this.previousPlayerPosition.copy(this.drone.position);
    this.updatePlayer(dt);
    this.updateTaskBeacons(dt);
    this.updateObjectives(dt);
    this.updateEnemies(dt, elapsed);
    this.updateFallingEnemies(dt);
    this.updateDebris(dt);
    this.updateDestructibles(dt);
    this.updateGates(dt, elapsed);
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) {
        this.ammoCount = this.getMaxMagazine();
        this.audio.play('reload');
      }
    }
    if (this.firing) this.firePlayerWeapons();
    this.updateBolts(dt);
    this.updateBursts(dt);
    this.updateLock();
    const cameraProfile = cameraFollowProfile(this.droneVelocity.length(), this.closeCamera);
    const framing = computeChaseCameraFraming(this.drone.position.y, this.drone.rotation.x, cameraProfile);
    this.cameraOffset
      .set(0, framing.cameraY - this.drone.position.y, cameraProfile.distance)
      .applyAxisAngle(_UP, this.drone.rotation.y);
    const desiredPosition = _SCRATCH_TARGET.copy(this.drone.position).add(this.cameraOffset);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 3.8);
    desiredPosition.x += Math.sin(elapsed * 57) * this.cameraShake;
    desiredPosition.y += Math.cos(elapsed * 43) * this.cameraShake * 0.38;
    this.camera.position.lerp(desiredPosition, 1 - Math.exp(-5.8 * dt));
    const follower = this.environmentFollowers.get(this.mission?.environment ?? 'city');
    if (follower) {
      follower.position.copy(this.camera.position);
      if (typeof follower.userData?.updateWeather === 'function') {
        follower.userData.updateWeather(dt);
      }
    }
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, cameraProfile.fieldOfView, 1 - Math.exp(-2.8 * dt));
    this.camera.updateProjectionMatrix();
    this.forward
      .set(0, 0, -cameraProfile.lookAhead)
      .applyAxisAngle(_UP, this.drone.rotation.y);
    const viewTarget = _SCRATCH_FORWARD
      .set(this.drone.position.x, framing.targetY, this.drone.position.z)
      .add(this.forward);
    this.camera.lookAt(viewTarget);
    if (this.elapsed - this.lastTelemetry > 0.1) {
      this.lastTelemetry = this.elapsed;
      const wind = windAt(this.elapsed, this.drone.position.x, this.drone.position.z);
      const rawSpeed = this.droneVelocity.length();
      this.callbacks.onEvent({
        type: 'telemetry',
        speed: rawSpeed < 0.12 ? 0 : Math.round(rawSpeed * 3.6),
        altitude: Math.round(this.drone.position.y * 2),
        boost: Math.round(this.boostEnergy),
        ammo: this.isRealisticMode() ? this.ammoCount : null,
        maxAmmo: this.isRealisticMode() ? this.getMaxMagazine() : null,
        reloading: this.isRealisticMode() && this.reloadTimer > 0,
        windSpeed: Math.round(Math.hypot(wind.x, wind.z) * 3.6),
        gpsX: Math.round(this.drone.position.x),
        gpsZ: Math.round(this.drone.position.z),
        pitchDeg: Math.round(THREE.MathUtils.radToDeg(this.drone.rotation.x)),
        rollDeg: Math.round(THREE.MathUtils.radToDeg(this.drone.rotation.z)),
        headingDeg: ((Math.round(THREE.MathUtils.radToDeg(-this.drone.rotation.y)) % 360) + 360) % 360,
      });
    }
    this.audio.update(this.droneVelocity.length(), this.boosting);
  }

  private updatePlayer(dt: number): void {
    this.boundaryToastCooldown = Math.max(0, this.boundaryToastCooldown - dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.waterSprayCooldown = Math.max(0, this.waterSprayCooldown - dt);

    const st = this.equippedStats;
    const key = (letter: string, arrow: string): boolean => this.keys.has(letter) || this.keys.has(arrow);
    const wantsBoost = this.keys.has('shift');
    const boostDt = dt * (wantsBoost ? st.boostDrainMultiplier : st.boostRechargeMultiplier);
    const boostState = advanceBoostState(this.boostEnergy, wantsBoost, this.boosting, boostDt);
    this.boostEnergy = boostState.energy;
    this.boosting = boostState.active;

    const baseProfile = FLIGHT_PROFILES_BY_MODEL[this.flightModel];
    const profile = {
      ...baseProfile,
      thrust: baseProfile.thrust * st.speedMultiplier,
      boostThrust: baseProfile.boostThrust * (0.94 + (st.speedMultiplier - 1) * 0.25),
      liftAccel: baseProfile.liftAccel * st.speedMultiplier,
      maxSpeed: baseProfile.maxSpeed * st.speedMultiplier,
      boostMaxSpeed: baseProfile.boostMaxSpeed * st.speedMultiplier,
      yawRate: baseProfile.yawRate * st.angularResponseMultiplier,
      yawAccel: baseProfile.yawAccel * st.angularResponseMultiplier,
      angularResponse: baseProfile.angularResponse * st.angularResponseMultiplier,
      windScale: baseProfile.windScale * st.windResistanceMultiplier,
      turbulenceScale: baseProfile.turbulenceScale * st.windResistanceMultiplier,
      collisionDamageFactor: baseProfile.collisionDamageFactor * st.collisionResistMultiplier,
    };
    const wind = windAt(this.elapsed, this.drone.position.x, this.drone.position.z);
    const prox = this.activeCollision.proximity(this.drone.position.x, this.drone.position.y, this.drone.position.z, 7.5);
    const groundY = Math.max(
      this.activeCollision.getTerrainHeight(this.drone.position.x, this.drone.position.z),
      this.activeCollision.getWaterLevel(),
    );
    const groundGap = Math.max(0, this.drone.position.y - groundY);
    const cargoMass = this.objectiveTracker?.isCarryingCargo() ? 0.36 : 0;

    const forwardInput = (key('w', 'arrowup') ? 1 : 0) - (key('s', 'arrowdown') ? 1 : 0);
    const turnInput = (key('a', 'arrowleft') ? 1 : 0) - (key('d', 'arrowright') ? 1 : 0);
    const liftInput = (this.keys.has(' ') ? 1 : 0) - (this.keys.has('c') ? 1 : 0);

    const nextFlight = advanceFlight(
      {
        vx: this.droneVelocity.x,
        vy: this.droneVelocity.y,
        vz: this.droneVelocity.z,
        yaw: this.drone.rotation.y,
        pitch: this.drone.rotation.x,
        roll: this.drone.rotation.z,
        yawVelocity: this.droneYawVelocity,
      },
      {
        forward: forwardInput,
        turn: turnInput,
        lift: liftInput,
        boost: this.boosting,
      },
      profile,
      {
        windX: wind.x,
        windY: wind.y,
        windZ: wind.z,
        proximity: prox,
        groundGap,
        cargoMass,
      },
      dt,
    );

    this.droneVelocity.set(nextFlight.vx, nextFlight.vy, nextFlight.vz);
    this.drone.rotation.set(nextFlight.pitch, nextFlight.yaw, nextFlight.roll);
    this.droneYawVelocity = nextFlight.yawVelocity;
    this.drone.position.addScaledVector(this.droneVelocity, dt);

    const limit = this.isOpenWorldActive() ? OPEN_WORLD_LIMIT : WORLD_LIMIT;
    const radialDistance = Math.hypot(this.drone.position.x, this.drone.position.z);
    if (radialDistance > limit) {
      const rx = this.drone.position.x / radialDistance;
      const rz = this.drone.position.z / radialDistance;
      this.drone.position.x = rx * limit;
      this.drone.position.z = rz * limit;
      const outwardVel = this.droneVelocity.x * rx + this.droneVelocity.z * rz;
      if (outwardVel > 0) {
        this.droneVelocity.x -= rx * outwardVel;
        this.droneVelocity.z -= rz * outwardVel;
      }
      if (this.boundaryToastCooldown <= 0) {
        this.boundaryToastCooldown = 1.5;
        this.callbacks.onEvent({ type: 'toast', text: 'LIMITE DO PERÍMETRO' });
      }
    }

    // Colisão física real do drone contra prédios, rochas, árvores, pontes e relevo
    this.lastImpactSpeed = 0;
    const contacts = this.activeCollision.sphereContacts(
      this.drone.position.x,
      this.drone.position.y,
      this.drone.position.z,
      1.35,
    );
    for (const c of contacts) {
      if (c.tag === 'terrain') {
        this.drone.position.y += c.depth;
        if (this.droneVelocity.y < 0) {
          const vn = -this.droneVelocity.y;
          this.lastImpactSpeed = Math.max(this.lastImpactSpeed, vn);
          this.droneVelocity.y = vn * profile.collisionRestitution;
        }
        continue;
      }
      this.drone.position.x += c.nx * c.depth;
      this.drone.position.y += c.ny * c.depth;
      this.drone.position.z += c.nz * c.depth;
      const vn = -(this.droneVelocity.x * c.nx + this.droneVelocity.y * c.ny + this.droneVelocity.z * c.nz);
      if (vn > 0) {
        this.lastImpactSpeed = Math.max(this.lastImpactSpeed, vn);
        const impulse = (1 + profile.collisionRestitution) * vn;
        this.droneVelocity.x += c.nx * impulse;
        this.droneVelocity.y += c.ny * impulse;
        this.droneVelocity.z += c.nz * impulse;
        if (c.destructibleId && vn > 5) {
          this.damageDestructible(c.destructibleId, vn * 2.5, this.droneVelocity.x, this.droneVelocity.z);
        }
        const dmg = impactDamage(vn, profile.collisionDamageFactor);
        if (dmg > 0 && this.collisionCooldown <= 0) {
          this.collisionCooldown = 0.55;
          this.applyDirectDamage(dmg, 'COLISÃO ESTRUTURAL');
          this.audio.play('crash');
          this.spawnBurst(this.drone.position, 0xffb84d, 18, 9, 0.45, 9.8);
        }
      }
    }

    this.drone.position.y = THREE.MathUtils.clamp(this.drone.position.y, 1.8, 52);

    // Spray de água quando voando rasante sobre água
    const waterY = this.activeCollision.getWaterLevel();
    if (
      this.drone.position.y - waterY < 3.0 &&
      this.droneVelocity.length() > 6 &&
      this.waterSprayCooldown <= 0
    ) {
      this.waterSprayCooldown = 0.14;
      _SCRATCH_TARGET.set(this.drone.position.x, waterY + 0.3, this.drone.position.z);
      this.spawnBurst(
        _SCRATCH_TARGET,
        0xd8f3ff,
        10,
        5,
        0.38,
        6.5,
      );
    }

    // Dispersão manual de água/retardante (tecla E)
    if (this.keys.has('e') && this.waterSprayCooldown <= 0) {
      this.waterSprayCooldown = 0.11;
      _SCRATCH_TARGET.set(this.drone.position.x, this.drone.position.y - 0.8, this.drone.position.z);
      this.spawnBurst(
        _SCRATCH_TARGET,
        0x72efdd,
        14,
        8,
        0.5,
        14,
      );
    }

    this.rotors.forEach(({ group, direction }) => {
      group.rotation.y += direction * dt * (this.boosting ? 62 : 42);
    });
  }

  private updateObjectives(dt: number): void {
    if (!this.objectiveTracker) return;
    const forward = _FORWARD_VEC.set(0, 0, -1).applyEuler(this.drone.rotation).normalize();
    let escortDamageTaken = 0;
    const escortPos = this.objectiveTracker.getEscortPosition();
    if (escortPos) {
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const dist = Math.hypot(
          enemy.group.position.x - escortPos[0],
          enemy.group.position.z - escortPos[2],
        );
        if (dist < 28 && enemy.attackReady) {
          escortDamageTaken += dt * 2.2;
        }
      }
    }

    const res = this.objectiveTracker.step(dt, {
      px: this.drone.position.x,
      py: this.drone.position.y,
      pz: this.drone.position.z,
      speed: this.droneVelocity.length(),
      fwdX: forward.x,
      fwdY: forward.y,
      fwdZ: forward.z,
      droppingAction: this.keys.has('e'),
      hardImpactSpeed: this.lastImpactSpeed,
      escortDamageTaken,
    });

    if (this.droneCargoMesh) {
      this.droneCargoMesh.visible = res.carryingCargoMass > 0;
    }

    if (this.objectiveTracker.spec.kind === 'cargo') {
      const targetCoord = this.objectiveTracker.getActiveCargoTarget();
      if (targetCoord && this.objectiveMarkers[0]) {
        this.objectiveMarkers[0].position.set(targetCoord[0], targetCoord[1], targetCoord[2]);
      }
    } else {
      this.objectiveMarkers.forEach((m, idx) => {
        m.visible = !this.objectiveTracker?.isMarkerCompleted(idx);
      });
    }

    if (res.escortPosition && this.escortVehicleMesh) {
      this.escortVehicleMesh.position.set(res.escortPosition[0], res.escortPosition[1], res.escortPosition[2]);
      this.escortVehicleMesh.rotation.y = res.escortYaw;
    }

    if (res.toastText) {
      if (this.objectiveTracker.spec.kind === 'recon') this.audio.play('shutter');
      else this.audio.play('gate');
      this.scoreBonus += 220;
      this.callbacks.onEvent({ type: 'score', value: this.getScore() });
      this.callbacks.onEvent({ type: 'toast', text: res.toastText });
    }

    this.callbacks.onEvent({
      type: 'objectiveProgress',
      fraction: res.fraction,
      hudText: res.hudText,
      status: res.status,
    });

    if (res.status === 'completed') {
      this.objectiveTracker = null;
      this.clearObjectiveMarkers();
      if (this.droneCargoMesh) this.droneCargoMesh.visible = false;
      if (this.isOpenWorldActive() && this.activeOpenWorldTask) {
        this.completeOpenWorldTask();
      }
    }
  }

  private updateAmbient(elapsed: number, dt: number): void {
    const env = this.mission?.environment;
    const texSpeed =
      env === 'river'
        ? 0.11
        : env === 'openworld' || env === 'metro-open'
          ? 0.08
          : env === 'harbor' || env === 'dam' || env === 'coast'
            ? 0.045
            : 0;
    if (texSpeed) {
      this.animatedTextures.forEach((texture) => {
        texture.offset.y -= dt * texSpeed;
      });
    }
    for (const v of this.activeVehicles) {
      if (v.axis === 'z') {
        v.mesh.position.z += v.speed * dt;
        if (v.mesh.position.z > v.maxCoord) v.mesh.position.z = v.minCoord;
        if (v.mesh.position.z < v.minCoord) v.mesh.position.z = v.maxCoord;
      } else {
        v.mesh.position.x += v.speed * dt;
        if (v.mesh.position.x > v.maxCoord) v.mesh.position.x = v.minCoord;
        if (v.mesh.position.x < v.minCoord) v.mesh.position.x = v.maxCoord;
      }
    }
    if (!this.active) {
      this.rotors.forEach(({ group, direction }) => {
        group.rotation.y += direction * dt * 28;
      });
      if (!this.mission) {
        this.drone.position.y = 8 + Math.sin(elapsed * 1.6) * 0.28;
        this.drone.rotation.z = Math.sin(elapsed * 0.9) * 0.06;
        const orbitAngle = Math.sin(elapsed * 0.28) * 0.42;
        this.camera.position.set(
          Math.sin(orbitAngle) * 16,
          11.2 + Math.cos(elapsed * 0.5) * 0.6,
          Math.cos(orbitAngle) * 18,
        );
        this.camera.lookAt(0, 7.8, -2);
      }
    }
    this.gates.forEach((gate, index) => {
      if (!gate.group.visible) return;
      gate.ring.rotation.z += dt * (0.75 + index * 0.025);
      gate.group.position.y = gate.baseY + Math.sin(elapsed * 1.5 + index) * 0.42;
    });
    this.taskBeacons.forEach((beacon, index) => {
      if (!beacon.group.visible) return;
      beacon.ring.rotation.z += dt * 0.9;
      beacon.crest.rotation.y += dt * 1.8;
      beacon.crest.position.y = 6.8 + Math.sin(elapsed * 2.2 + index) * 0.45;
    });
  }

  private updateTaskBeacons(dt: number): void {
    if (!this.isOpenWorldActive() || this.activeOpenWorldTask) return;
    this.openWorldTaskCooldown = Math.max(0, this.openWorldTaskCooldown - dt);
    if (this.openWorldTaskCooldown > 0) return;
    for (const beacon of this.taskBeacons) {
      if (!beacon.group.visible) continue;
      if (this.drone.position.distanceTo(beacon.group.position) <= 8.5) {
        this.startOpenWorldTask(beacon.task.id);
        return;
      }
    }
  }

  private updateGates(dt: number, elapsed: number): void {
    const activeTask = this.activeOpenWorldTask;
    const isGatesObjective =
      this.mission?.objectiveKind === 'gates' || (this.isOpenWorldActive() && activeTask?.kind === 'gates');
    if (!isGatesObjective) return;
    const targetCount = activeTask ? activeTask.target : (this.mission?.objectiveTarget ?? 6);
    for (const gate of this.gates) {
      if (!gate.group.visible || gate.collected || this.drone.position.distanceTo(gate.group.position) > 5.6) continue;
      gate.collected = true;
      gate.group.visible = false;
      this.gateCount++;
      this.audio.play('gate');
      this.spawnBurst(gate.group.position, 0x70f0c2, 28, 13, 0.7);
      this.callbacks.onEvent({ type: 'gate', count: this.gateCount, target: targetCount });
      this.callbacks.onEvent({ type: 'score', value: this.getScore() });
      this.callbacks.onEvent({
        type: 'toast',
        text: `BALIZA ${String(this.gateCount).padStart(2, '0')} / ${String(targetCount).padStart(2, '0')}`,
      });
      if (this.isOpenWorldActive() && activeTask && this.gateCount >= activeTask.target) {
        this.completeOpenWorldTask();
        return;
      }
    }
    void dt;
    void elapsed;
  }

  private updateEnemies(dt: number, elapsed: number): void {
    const activeTask = this.activeOpenWorldTask;
    const totalWaveLength = activeTask?.enemyWave?.length ?? this.mission?.enemyWave?.length ?? 1;
    if (this.pendingEnemyWave.length) {
      this.waveSpawnTimer = Math.max(0, this.waveSpawnTimer - dt);
      const activeCount = this.enemies.filter((enemy) => enemy.alive && !enemy.boss).length;
      const batchSize = reinforcementBatchSize(activeCount, this.pendingEnemyWave.length, this.waveSpawnTimer);
      if (batchSize > 0) {
        const reinforcements = this.pendingEnemyWave.splice(0, batchSize);
        for (const enemy of reinforcements) {
          this.enemies.push(this.createEnemy(enemy.index, false, totalWaveLength, enemy.archetype));
        }
        this.callbacks.onEvent({
          type: 'toast',
          text: this.pendingEnemyWave.length
            ? `REFORÇOS DETECTADOS · ${this.pendingEnemyWave.length} NA RESERVA`
            : 'ÚLTIMO GRUPO DE REFORÇOS NO SETOR',
        });
        this.audio.play('warning');
        this.waveSpawnTimer = this.pendingEnemyWave.length ? 4.0 : 0;
      }
    }
    const taskCenter = activeTask
      ? _TASK_CENTER_VEC.set(
          activeTask.beaconPosition[0] * 0.5,
          activeTask.beaconPosition[1] * 0.5,
          activeTask.beaconPosition[2] * 0.5,
        )
      : null;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (enemy.heliMainRotor) enemy.heliMainRotor.rotation.y += dt * 32;
      if (enemy.heliTailRotor) enemy.heliTailRotor.rotation.x += dt * 38;

      if (!enemy.boss) {
        if (enemy.archetype === 'fpv') {
          // FPV Kamikaze persegue o jogador diretamente com desvio de obstáculos e explode no contato!
          const toPlayer = _FPV_TO_PLAYER.subVectors(this.drone.position, enemy.group.position);
          const dist = toPlayer.length();
          if (dist < 2.8) {
            this.applyDirectDamage(22, 'IMPACTO DE DRONE FPV KAMIKAZE');
            this.destroyEnemy(enemy);
            continue;
          }
          toPlayer.normalize();
          enemy.group.position.addScaledVector(toPlayer, 15.5 * dt);
          enemy.group.position.y += Math.sin(elapsed * 5 + enemy.spawnIndex) * 1.8 * dt;
          enemy.group.lookAt(this.drone.position);
        } else if (enemy.archetype === 'aaturret') {
          // Torreta antiaérea permanece ancorada e gira mirando no jogador
          const gy = Math.max(
            0,
            this.activeCollision.getTerrainHeight(enemy.group.position.x, enemy.group.position.z),
          );
          enemy.group.position.y = gy + 2.2;
          enemy.group.lookAt(this.drone.position.x, enemy.group.position.y, this.drone.position.z);
        } else if (this.mission?.environment === 'river') {
          const lane = (enemy.spawnIndex % 4) - 1.5;
          const heightWave = Math.sin(elapsed * 1.05 + enemy.spawnIndex) * 1.4;
          enemy.group.position.set(
            lane * 11 + Math.sin(elapsed * 0.72 + enemy.spawnIndex) * 3.5,
            enemy.baseHeight + heightWave,
            -52 + enemy.spawnIndex * 13 + Math.sin(elapsed * 0.55 + enemy.spawnIndex) * 2.5,
          );
          enemy.group.rotation.z = Math.sin(elapsed * 0.92 + enemy.spawnIndex) * 0.09;
        } else {
          enemy.angle += enemy.orbitSpeed * dt;
          const weave =
            enemy.archetype === 'swarmer' || enemy.archetype === 'fixedwing'
              ? Math.sin(elapsed * 3.4 + enemy.angle) * 6.2
              : enemy.archetype === 'scout'
                ? Math.sin(elapsed * 2.7 + enemy.angle) * 5
                : enemy.archetype === 'gunner'
                  ? Math.sin(elapsed * 0.9 + enemy.angle) * 2
                  : Math.sin(elapsed * 0.55 + enemy.angle) * 1.1;
          const cx = taskCenter ? taskCenter.x : 0;
          const cz = taskCenter ? taskCenter.z : 0;
          const orbitR = taskCenter ? enemy.radius * 0.78 : enemy.radius;
          const nextY =
            enemy.archetype === 'gunboat'
              ? enemy.baseHeight + Math.sin(elapsed * 2.2 + enemy.spawnIndex) * 0.25
              : enemy.baseHeight +
                Math.sin(
                  elapsed * (enemy.archetype === 'scout' || enemy.archetype === 'swarmer' ? 2.8 : 1.05) + enemy.angle,
                ) *
                  (enemy.archetype === 'bulwark' || enemy.archetype === 'sniper' ? 1.0 : 2.4);
          enemy.group.position.set(
            cx + Math.cos(enemy.angle) * orbitR + weave,
            nextY,
            cz + Math.sin(enemy.angle) * orbitR,
          );
          enemy.group.rotation.z =
            Math.sin(elapsed * (enemy.archetype === 'scout' ? 2.6 : 0.8) + enemy.angle) *
            (enemy.archetype === 'scout' || enemy.archetype === 'swarmer' ? 0.26 : 0.08);
          enemy.group.lookAt(this.drone.position.x, enemy.group.position.y, this.drone.position.z);
        }
      } else {
        const bx = taskCenter ? taskCenter.x : 0;
        const bz = taskCenter ? taskCenter.z : -40;
        enemy.group.position.set(
          bx + Math.sin(elapsed * 0.17) * 12,
          16 + Math.sin(elapsed * 0.85) * 2.4,
          bz + Math.sin(elapsed * 0.21) * 8,
        );
        enemy.group.lookAt(this.drone.position.x, enemy.group.position.y, this.drone.position.z);
        this.updateBossPhase(enemy, dt);
        const petalRadius = this.bossExposed ? 2.25 : 1.38;
        enemy.petals.forEach((petal, pIdx) => {
          const armAngle = (pIdx / 6) * Math.PI * 2 + elapsed * 0.35;
          petal.position.set(Math.cos(armAngle) * petalRadius, 0, Math.sin(armAngle) * petalRadius);
          petal.rotation.y = -armAngle;
        });
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
      enemy.coreMaterial.emissiveIntensity = enemy.attackReady
        ? 4.4 + Math.sin(elapsed * 18) * 1.4
        : enemy.hitFlash > 0
          ? 4
          : enemy.boss
            ? 2.7
            : 2;
      this.updateEnemyAttack(enemy, dt);
    }
  }

  /**
   * Atualiza inimigos abatidos em queda livre com gravidade, giro e rastro de fumaça,
   * despedaçando-os em destroços físicos quando batem no chão/prédios/água.
   */
  private updateFallingEnemies(dt: number): void {
    for (let i = this.fallingEnemies.length - 1; i >= 0; i--) {
      const f = this.fallingEnemies[i];
      f.age += dt;
      f.smokeTimer += dt;
      f.velocity.y -= 19.5 * dt;
      f.group.position.addScaledVector(f.velocity, dt);
      f.group.rotation.x += f.rotVel.x * dt;
      f.group.rotation.y += f.rotVel.y * dt;
      f.group.rotation.z += f.rotVel.z * dt;

      if (f.smokeTimer >= 0.06) {
        f.smokeTimer = 0;
        this.spawnBurst(f.group.position, 0xff7b29, 4, 3.5, 0.35, -2.5);
      }

      const contacts = this.activeCollision.sphereContacts(
        f.group.position.x,
        f.group.position.y,
        f.group.position.z,
        1.4,
      );
      const hitWater = f.group.position.y <= this.activeCollision.getWaterLevel() + 0.5;
      if (contacts.length > 0 || hitWater || f.age >= 2.2) {
        this.spawnDebrisExplosion(f.group.position, f.boss ? 10 : 6);
        this.spawnBurst(f.group.position, hitWater ? 0xd8f3ff : 0xff6b35, f.boss ? 65 : 32, 14, 0.75, 11);
        this.disposeEnemyGroup(f.group);
        this.fallingEnemies.splice(i, 1);
      }
    }
  }

  private spawnDebrisExplosion(origin: THREE.Vector3, count: number): void {
    const cap = QUALITY_PRESETS[this.resolvedQuality].debrisCap;
    for (let i = 0; i < count; i++) {
      if (this.debrisPieces.length >= cap) {
        const oldest = this.debrisPieces.shift();
        if (oldest) this.scene.remove(oldest.mesh);
      }
      const mesh = new THREE.Mesh(this.debrisGeometry, this.debrisMaterial);
      mesh.position.copy(origin);
      mesh.scale.set(0.6 + Math.random() * 0.9, 0.4 + Math.random() * 0.7, 0.6 + Math.random() * 0.9);
      this.scene.add(mesh);
      this.debrisPieces.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 18,
          5 + Math.random() * 11,
          (Math.random() - 0.5) * 18,
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
        ),
        age: 0,
        maxAge: 3.4,
      });
    }
  }

  private updateDebris(dt: number): void {
    for (let i = this.debrisPieces.length - 1; i >= 0; i--) {
      const d = this.debrisPieces[i];
      d.age += dt;
      d.velocity.y -= 18.5 * dt;
      d.mesh.position.addScaledVector(d.velocity, dt);
      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;
      d.mesh.rotation.z += d.rotVel.z * dt;

      const groundY = Math.max(
        this.activeCollision.getTerrainHeight(d.mesh.position.x, d.mesh.position.z),
        this.activeCollision.getWaterLevel(),
      );
      if (d.mesh.position.y < groundY + 0.25) {
        d.mesh.position.y = groundY + 0.25;
        d.velocity.y = Math.abs(d.velocity.y) * 0.36;
        d.velocity.x *= 0.68;
        d.velocity.z *= 0.68;
      }
      if (d.age >= d.maxAge) {
        this.scene.remove(d.mesh);
        this.debrisPieces.splice(i, 1);
      }
    }
  }

  private damageDestructible(id: number, dmg: number, pushX = 1, pushZ = 0): void {
    const prop = this.activeDestructibles.find((item) => item.id === id);
    if (!prop || !prop.alive) return;
    prop.hp -= dmg;
    if (prop.hp > 0) return;
    prop.alive = false;
    this.activeCollision.remove(prop.colliderId);
    this.scoreBonus += 150;
    this.callbacks.onEvent({ type: 'score', value: this.getScore() });

    const pos = prop.mesh.position.clone();
    if (prop.kind === 'tree') {
      prop.falling = true;
      const len = Math.hypot(pushX, pushZ) || 1;
      prop.fallAxisX = -pushZ / len;
      prop.fallAxisZ = pushX / len;
      this.callbacks.onEvent({ type: 'toast', text: 'ÁRVORE DERRUBADA +150 PTS' });
    } else {
      prop.mesh.visible = false;
      this.audio.play('explosion');
      this.spawnDebrisExplosion(pos, 6);
      this.spawnBurst(pos, prop.explosive ? 0xff5a1f : 0xd9a05b, 42, 16, 0.85, 10);
      if (prop.explosive) {
        this.callbacks.onEvent({ type: 'toast', text: 'DETONAÇÃO SECUNDÁRIA +150 PTS' });
        // Dano em área nos inimigos próximos e reação em cadeia
        for (const enemy of this.enemies) {
          if (enemy.alive && enemy.group.position.distanceTo(pos) < 16) {
            enemy.hp -= 85;
            if (enemy.hp <= 0) this.destroyEnemy(enemy);
          }
        }
      }
    }
  }

  private updateDestructibles(dt: number): void {
    for (const prop of this.activeDestructibles) {
      if (!prop.falling) continue;
      prop.fallAngle = Math.min(Math.PI * 0.48, prop.fallAngle + dt * 1.85);
      prop.mesh.rotation.x = prop.fallAxisX * prop.fallAngle;
      prop.mesh.rotation.z = prop.fallAxisZ * prop.fallAngle;
      if (prop.fallAngle >= Math.PI * 0.48) {
        prop.falling = false;
        this.spawnBurst(prop.mesh.position, 0x8c6239, 18, 7, 0.6, 8);
      }
    }
  }

  private updateBossPhase(boss: Enemy, dt: number): void {
    const nextPhase = boss.hp > boss.maxHp * (2 / 3) ? 1 : boss.hp > boss.maxHp * (1 / 3) ? 2 : 3;
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
    const exposed = this.bossCycle % phaseDuration < openDuration;
    if (exposed !== this.bossExposed) {
      this.bossExposed = exposed;
      this.callbacks.onEvent({ type: 'boss', hp: boss.hp / boss.maxHp, phase: this.bossPhase, exposed });
      if (exposed) this.callbacks.onEvent({ type: 'toast', text: 'ALVO EXPOSTO · DISPARAR' });
    }
  }

  private updateEnemyAttack(enemy: Enemy, dt: number): void {
    if (enemy.archetype === 'fpv') return; // FPV ataca por impacto direto
    enemy.attackTimer -= dt;
    const bossPatterns = this.activeOpenWorldTask?.bossPatterns ?? this.mission?.bossPatterns;
    if (enemy.boss) enemy.attackPattern = bossPatternForPhase(bossPatterns, this.bossPhase);
    const windup = enemy.boss
      ? enemy.attackPattern === 'charge' || enemy.attackPattern === 'sniper'
        ? 1.25
        : enemy.attackPattern === 'fan'
          ? 1.0
          : 0.82
      : enemy.archetype === 'sniper'
        ? 1.18
        : 0.85;
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
        enemy.attackTimer = enemy.boss
          ? this.bossPhase === 1
            ? 5.8
            : this.bossPhase === 2
              ? 4.8
              : 4.0
          : 5.2;
      }
    }
  }

  private fireEnemyAttack(enemy: Enemy): void {
    const maxRange = enemy.archetype === 'sniper' || enemy.boss ? 128 : 96;
    if (enemy.group.position.distanceTo(this.drone.position) > maxRange) return;
    const start = enemy.group.position.clone();
    // Verifica linha de visada (permite usar prédios/rochas como cobertura!)
    if (
      !enemy.boss &&
      !this.activeCollision.hasLineOfSight(
        start.x,
        start.y,
        start.z,
        this.drone.position.x,
        this.drone.position.y,
        this.drone.position.z,
      )
    ) {
      return;
    }
    const aim = this.drone.position.clone().sub(start).normalize();
    const count =
      enemy.attackPattern === 'fan'
        ? enemy.boss
          ? 5
          : 3
        : enemy.attackPattern === 'burst'
          ? 2
          : enemy.attackPattern === 'charge'
            ? enemy.boss
              ? 1
              : 3
            : 1;
    const spread = enemy.boss ? 0.24 : enemy.attackPattern === 'burst' ? 0.09 : 0.18;
    for (let index = 0; index < count; index++) {
      const offset = count === 1 ? 0 : (index / (count - 1) - 0.5) * spread * 2;
      const direction = aim.clone().applyAxisAngle(_UP, offset).normalize();
      const speed =
        enemy.attackPattern === 'sniper'
          ? 34
          : enemy.attackPattern === 'charge'
            ? enemy.boss
              ? 32
              : 18
            : enemy.attackPattern === 'burst'
              ? 19
              : 15;
      this.fireEnemyBolt(start, direction, speed, enemy.attackPattern === 'charge' || enemy.attackPattern === 'sniper');
    }
  }

  private fireEnemyBolt(start: THREE.Vector3, direction: THREE.Vector3, speed: number, charged: boolean): void {
    const mesh = new THREE.Mesh(this.enemyBoltGeometry, this.enemyBoltMaterial);
    mesh.position.copy(start);
    if (charged) mesh.scale.setScalar(1.7);
    this.scene.add(mesh);
    this.bolts.push({
      mesh,
      velocity: direction.clone().multiplyScalar(speed),
      gravityScale: 0,
      life: 0,
      maxLife: 7.5,
      playerOwned: false,
      nearMissReported: false,
    });
  }

  private firePlayerWeapons(): void {
    if (!this.active || !this.mission) return;
    const realistic = this.isRealisticMode();
    const weapon = WEAPON_PROFILES[realistic ? 'realistic' : 'futuristic'];
    const st = this.equippedStats;
    if (realistic && this.reloadTimer > 0) return;
    const now = performance.now();
    if (now - this.lastShot < weapon.fireIntervalMs * st.fireIntervalMultiplier) return;
    this.lastShot = now;

    if (realistic) {
      if (this.ammoCount <= 0) {
        this.startReload();
        return;
      }
      this.ammoCount = Math.max(0, this.ammoCount - 2);
      if (this.ammoCount === 0) this.startReload();
      this.audio.play('tracer');
    } else {
      this.audio.play('shot');
    }

    const target = this.findLockedEnemy();
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.drone.rotation).normalize();
    const flightProfile = FLIGHT_PROFILES_BY_MODEL[this.flightModel];
    const aimStrength = Math.min(0.68, flightProfile.aimAssistStrength + st.aimAssistBonus);

    for (const side of [-1, 1]) {
      const start = new THREE.Vector3(side * 1.0, -0.28, -2.15)
        .applyEuler(this.drone.rotation)
        .add(this.drone.position);
      let direction = forward.clone();
      if (target) {
        const assisted = target.group.position
          .clone()
          .addScaledVector(target.velocity, Math.min(0.55, start.distanceTo(target.group.position) / weapon.muzzleSpeed))
          .sub(start)
          .normalize();
        direction.lerp(assisted, aimStrength).normalize();
      }
      if (weapon.spread > 0) {
        const effectiveSpread = Math.max(0.004, weapon.spread * (1 - st.aimAssistBonus * 1.4));
        direction.x += (Math.random() - 0.5) * effectiveSpread;
        direction.y += (Math.random() - 0.5) * effectiveSpread;
        direction.z += (Math.random() - 0.5) * effectiveSpread;
        direction.normalize();
      }
      const mesh = new THREE.Mesh(this.laserGeometry, realistic ? this.tracerMaterial : this.laserMaterial);
      mesh.position.copy(start);
      mesh.quaternion.setFromUnitVectors(_UP, direction);
      this.scene.add(mesh);
      this.bolts.push({
        mesh,
        velocity: direction.multiplyScalar(weapon.muzzleSpeed),
        gravityScale: weapon.gravityScale,
        life: 0,
        maxLife: weapon.lifetime,
        playerOwned: true,
        nearMissReported: false,
      });
    }
  }

  private findLockedEnemy(): Enemy | null {
    _FORWARD_VEC.set(0, 0, -1).applyEuler(this.drone.rotation).normalize();
    let best: Enemy | null = null;
    let bestAlignment = Math.max(
      0.7,
      FLIGHT_PROFILES_BY_MODEL[this.flightModel].aimAssistCone - this.equippedStats.aimConeBonus,
    );
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      _TO_ENEMY_VEC.subVectors(enemy.group.position, this.drone.position);
      const distSq = _TO_ENEMY_VEC.lengthSq();
      if (distSq > 118 * 118 || distSq < 0.0001) continue;
      const dist = Math.sqrt(distSq);
      const alignment =
        (_FORWARD_VEC.x * _TO_ENEMY_VEC.x + _FORWARD_VEC.y * _TO_ENEMY_VEC.y + _FORWARD_VEC.z * _TO_ENEMY_VEC.z) / dist;
      if (alignment > bestAlignment) {
        bestAlignment = alignment;
        best = enemy;
      }
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
    const weapon = WEAPON_PROFILES[this.isRealisticMode() ? 'realistic' : 'futuristic'];
    const dmgScale = this.equippedStats.weaponDamageMultiplier;
    const effectiveDamage = Math.max(1, Math.round(weapon.damage * dmgScale));
    const effectiveBossDamage = Math.max(1, Math.round(weapon.bossDamage * dmgScale));
    for (let index = this.bolts.length - 1; index >= 0; index--) {
      const bolt = this.bolts[index];
      const prevX = bolt.mesh.position.x;
      const prevY = bolt.mesh.position.y;
      const prevZ = bolt.mesh.position.z;
      if (bolt.gravityScale > 0) {
        bolt.velocity.y -= 9.8 * bolt.gravityScale * dt;
      }
      bolt.mesh.position.x += bolt.velocity.x * dt;
      bolt.mesh.position.y += bolt.velocity.y * dt;
      bolt.mesh.position.z += bolt.velocity.z * dt;

      // Verificação física de impacto do projétil contra prédios, rochas, árvores e terreno
      const sceneryHit = this.activeCollision.segmentCast(
        prevX,
        prevY,
        prevZ,
        bolt.mesh.position.x,
        bolt.mesh.position.y,
        bolt.mesh.position.z,
      );
      if (sceneryHit) {
        _SCRATCH_TARGET.set(sceneryHit.x, sceneryHit.y, sceneryHit.z);
        this.spawnBurst(
          _SCRATCH_TARGET,
          sceneryHit.tag === 'metal' ? 0xffb84d : 0xd8e2dc,
          7,
          6,
          0.25,
          9.8,
        );
        if (sceneryHit.destructibleId && bolt.playerOwned) {
          this.damageDestructible(sceneryHit.destructibleId, effectiveDamage, bolt.velocity.x, bolt.velocity.z);
        }
        this.removeBolt(index);
        continue;
      }

      if (!bolt.playerOwned) {
        _REL_START.x = prevX - this.previousPlayerPosition.x;
        _REL_START.y = prevY - this.previousPlayerPosition.y;
        _REL_START.z = prevZ - this.previousPlayerPosition.z;
        _REL_END.x = bolt.mesh.position.x - this.drone.position.x;
        _REL_END.y = bolt.mesh.position.y - this.drone.position.y;
        _REL_END.z = bolt.mesh.position.z - this.drone.position.z;
        const distanceSquared = pointToSegmentDistanceSquared(_ORIGIN, _REL_START, _REL_END);
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
          const radius = enemy.boss ? 4.0 : 2.35;
          _REL_START.x = prevX - enemy.previousPosition.x;
          _REL_START.y = prevY - enemy.previousPosition.y;
          _REL_START.z = prevZ - enemy.previousPosition.z;
          _REL_END.x = bolt.mesh.position.x - enemy.group.position.x;
          _REL_END.y = bolt.mesh.position.y - enemy.group.position.y;
          _REL_END.z = bolt.mesh.position.z - enemy.group.position.z;
          if (pointToSegmentDistanceSquared(_ORIGIN, _REL_START, _REL_END) >= radius * radius) {
            continue;
          }
          hit = true;
          if (enemy.boss && !this.bossExposed) {
            this.spawnBurst(bolt.mesh.position, 0xffca68, 7, 4, 0.22, 6);
            this.audio.play('hit');
            this.callbacks.onEvent({ type: 'toast', text: 'BLINDAGEM ATIVA' });
          } else {
            enemy.hp -= enemy.boss ? effectiveBossDamage : effectiveDamage;
            enemy.hitFlash = 0.1;
            this.cameraShake = Math.max(this.cameraShake, 0.08);
            this.audio.play('hit');
            this.callbacks.onEvent({ type: 'hitConfirmed' });
            this.spawnBurst(bolt.mesh.position, enemy.boss ? 0xffca68 : 0x39e5ef, 10, 6, 0.3, 8);
            if (enemy.boss) {
              this.callbacks.onEvent({
                type: 'boss',
                hp: Math.max(0, enemy.hp / enemy.maxHp),
                phase: this.bossPhase,
                exposed: this.bossExposed,
              });
            }
            if (enemy.hp <= 0) this.destroyEnemy(enemy);
          }
          break;
        }
        if (hit) {
          this.removeBolt(index);
          continue;
        }
      }
      bolt.life += dt;
      if (bolt.life > bolt.maxLife) this.removeBolt(index);
    }
  }

  private destroyEnemy(enemy: Enemy): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.spawnBurst(
      enemy.group.position,
      enemy.boss ? 0xffca68 : 0xff476b,
      enemy.boss ? 85 : 36,
      enemy.boss ? 18 : 13,
      enemy.boss ? 1.1 : 0.7,
      9.8,
    );
    // Em vez de sumir instantaneamente, o inimigo entra em queda livre física girando e soltando fumaça!
    this.fallingEnemies.push({
      group: enemy.group,
      velocity: new THREE.Vector3(
        enemy.velocity.x * 0.4 + (Math.random() - 0.5) * 6,
        2.5,
        enemy.velocity.z * 0.4 + (Math.random() - 0.5) * 6,
      ),
      rotVel: new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
      ),
      age: 0,
      smokeTimer: 0,
      boss: enemy.boss,
    });
    this.audio.play('explosion');
    const activeTask = this.activeOpenWorldTask;
    if (enemy.boss) {
      this.scoreBonus += 1000;
      if (this.isOpenWorldActive() && activeTask) {
        this.completeOpenWorldTask();
      } else {
        this.callbacks.onEvent({ type: 'bossDestroyed' });
      }
    } else {
      this.enemyKillCount++;
      const target = activeTask ? activeTask.target : (this.mission?.objectiveTarget ?? 1);
      this.callbacks.onEvent({
        type: 'enemyDestroyed',
        count: this.enemyKillCount,
        target,
        archetype: enemy.archetype,
      });
      this.callbacks.onEvent({ type: 'score', value: this.getScore() });
      this.callbacks.onEvent({ type: 'toast', text: `ALVO ABATIDO · ${this.enemyKillCount}` });
      if (this.isOpenWorldActive() && activeTask && activeTask.kind === 'kills' && this.enemyKillCount >= activeTask.target) {
        this.completeOpenWorldTask();
      }
    }
  }

  private applyDirectDamage(damageAmount: number, reasonToast?: string): void {
    const shieldScale = 100 / Math.max(80, this.equippedStats.maxShield);
    const effectiveDamage = Math.max(1, Math.round(damageAmount * shieldScale));
    this.shield = Math.max(0, this.shield - effectiveDamage);
    this.cameraShake = Math.max(this.cameraShake, 0.95);
    this.audio.play('damage');
    this.callbacks.onEvent({ type: 'damage', shield: this.shield });
    if (this.shield <= 0) {
      this.callbacks.onEvent({ type: 'toast', text: 'ESCUDO CRÍTICO' });
    } else if (reasonToast) {
      this.callbacks.onEvent({ type: 'toast', text: `${reasonToast} (-${effectiveDamage}%)` });
    }
  }

  private damagePlayer(): void {
    if (this.damageCooldown > 0) return;
    this.damageCooldown = 0.46;
    const isBoss = this.mission?.objectiveKind === 'boss' || this.activeOpenWorldTask?.kind === 'boss';
    const damageAmount = isBoss ? (this.mode === 'dam' || this.mode === 'r-dam' ? 23 : 22) : 18;
    this.applyDirectDamage(damageAmount);
  }

  private removeBolt(index: number): void {
    const [bolt] = this.bolts.splice(index, 1);
    if (bolt) this.scene.remove(bolt.mesh);
  }

  private spawnBurst(
    position: THREE.Vector3,
    color: number,
    count: number,
    speed: number,
    lifetime: number,
    gravity = 5.5,
  ): void {
    const values = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let index = 0; index < count; index++) {
      values[index * 3] = position.x;
      values[index * 3 + 1] = position.y;
      values[index * 3 + 2] = position.z;
      const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.35 + Math.random() * 0.9));
      velocities.push(direction);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(values, 3));
    const material = new THREE.PointsMaterial({
      color,
      size: 0.26,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.bursts.push({ points, velocities, material, gravity, age: 0, maxAge: lifetime });
  }

  private updateBursts(dt: number): void {
    for (let index = this.bursts.length - 1; index >= 0; index--) {
      const burst = this.bursts[index];
      burst.age += dt;
      const positions = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let item = 0; item < burst.velocities.length; item++) {
        const velocity = burst.velocities[item];
        velocity.y -= burst.gravity * dt;
        velocity.multiplyScalar(Math.exp(-1.3 * dt));
        positions.setXYZ(
          item,
          positions.getX(item) + velocity.x * dt,
          positions.getY(item) + velocity.y * dt,
          positions.getZ(item) + velocity.z * dt,
        );
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
    if (!this.active) return;
    const ctx = this.radarContext;
    const width = this.radarCanvas.width;
    const height = this.radarCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 7;
    const maxRadarDist = this.isOpenWorldActive() ? 155 : 125;
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
      ctx.beginPath();
      ctx.arc(cx, cy, radius * factor, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();
    this.radarAngle += dt * 1.7;
    const sweepX = cx + Math.cos(this.radarAngle) * radius;
    const sweepY = cy + Math.sin(this.radarAngle) * radius;
    const gradient = ctx.createLinearGradient(cx, cy, sweepX, sweepY);
    gradient.addColorStop(0, 'rgba(57, 229, 239, .38)');
    gradient.addColorStop(1, 'rgba(57, 229, 239, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, this.radarAngle - 0.55, this.radarAngle);
    ctx.closePath();
    ctx.fill();
    const yaw = this.drone.rotation.y;
    const drawBlip = (position: THREE.Vector3, color: string, size: number, ringOnly = false): void => {
      const dx = position.x - this.drone.position.x;
      const dz = position.z - this.drone.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > maxRadarDist) return;
      const angle = Math.atan2(dx, dz) - yaw;
      const amount = (distance / maxRadarDist) * (radius - 9);
      const x = cx + Math.sin(angle) * amount;
      const y = cy + Math.cos(angle) * amount;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      if (ringOnly) {
        ctx.lineWidth = 2.0;
        ctx.stroke();
      } else {
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }
    };
    for (const beacon of this.taskBeacons) {
      if (beacon.group.visible) {
        const hex = `#${beacon.task.color.toString(16).padStart(6, '0')}`;
        drawBlip(beacon.group.position, hex, 4.2, true);
      }
    }
    for (const m of this.objectiveMarkers) {
      if (m.visible) drawBlip(m.position, '#52b788', 3.8, true);
    }
    if (this.escortVehicleMesh?.visible) {
      drawBlip(this.escortVehicleMesh.position, '#3ba8ff', 4.0);
    }
    for (const gate of this.gates) {
      if (gate.group.visible && !gate.collected) drawBlip(gate.group.position, '#70f0c2', 2.6);
    }
    const enemyColors: Record<EnemyArchetype, string> = {
      scout: '#ff476b',
      gunner: '#b56cff',
      bulwark: '#ff9b54',
      sniper: '#39e5ef',
      swarmer: '#70f0c2',
      fpv: '#ff6b35',
      fixedwing: '#4ea8de',
      aaturret: '#e63946',
      heavyhex: '#f4a261',
      gunboat: '#2ec4b6',
    };
    for (const enemy of this.enemies) {
      if (enemy.alive) {
        drawBlip(
          enemy.group.position,
          enemy.boss ? '#ffca68' : enemyColors[enemy.archetype],
          enemy.boss ? 4.4 : enemy.archetype === 'bulwark' || enemy.archetype === 'heavyhex' ? 4 : 3.2,
        );
      }
    }
    ctx.fillStyle = '#dffeff';
    ctx.shadowColor = '#39e5ef';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(57, 229, 239, .85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  private makeNeonMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: this.themeColor,
      emissive: this.themeColor,
      emissiveIntensity: 2.1,
      metalness: 0.15,
      roughness: 0.2,
    });
    this.themeMaterials.push(material);
    return material;
  }

  private createRotorBlurTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const cx = 128;
      const cy = 128;
      const radial = ctx.createRadialGradient(cx, cy, 18, cx, cy, 124);
      radial.addColorStop(0, 'rgba(180, 195, 205, 0)');
      radial.addColorStop(0.22, 'rgba(160, 175, 185, 0.22)');
      radial.addColorStop(0.78, 'rgba(120, 135, 145, 0.18)');
      radial.addColorStop(0.93, 'rgba(232, 104, 48, 0.42)');
      radial.addColorStop(1, 'rgba(232, 104, 48, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, 256, 256);

      for (let blade = 0; blade < 3; blade++) {
        const baseAngle = (blade / 3) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(baseAngle);
        const grad = ctx.createLinearGradient(0, -28, 0, 28);
        grad.addColorStop(0, 'rgba(60, 70, 80, 0)');
        grad.addColorStop(0.5, 'rgba(85, 98, 110, 0.45)');
        grad.addColorStop(1, 'rgba(60, 70, 80, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(20, -8);
        ctx.lineTo(118, -24);
        ctx.lineTo(118, 24);
        ctx.lineTo(20, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private disposeEnemyGroup(group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (
            material !== this.sharedEnemyArmorMat &&
            material !== this.sharedEnemyDarkMat &&
            material !== this.sharedEnemyRealisticMat
          ) {
            material.dispose();
          }
        });
      }
    });
  }

  private clearDynamicObjects(): void {
    for (const enemy of this.enemies) {
      if (enemy.alive) this.disposeEnemyGroup(enemy.group);
    }
    this.enemies.length = 0;
    for (const falling of this.fallingEnemies) {
      this.disposeEnemyGroup(falling.group);
    }
    this.fallingEnemies.length = 0;
    for (const d of this.debrisPieces) {
      this.scene.remove(d.mesh);
    }
    this.debrisPieces.length = 0;
    this.pendingEnemyWave = [];
    this.waveSpawnTimer = 0;
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
