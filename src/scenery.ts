import * as THREE from 'three';
import { CollisionWorld } from './collision';
import type { ScenarioEnvironment } from './missions';
import {
  buildArcticScenery,
  buildCoastScenery,
  buildDesertScenery,
  buildHighlandsScenery,
  buildRealisticMetroScenery,
  buildRefineryScenery,
  buildWildfireScenery,
  populateClassicColliders,
  type AnimatedVehicle,
  type DestructibleProp,
} from './scenery-realistic';

export interface SceneryLayer {
  root: THREE.Group;
  animatedTextures: THREE.Texture[];
  followCamera?: THREE.Object3D;
  collision: CollisionWorld;
  destructibles: DestructibleProp[];
  vehicles: AnimatedVehicle[];
}

export function buildScenarioScenery(environment: Exclude<ScenarioEnvironment, 'city'>): SceneryLayer {
  const root = new THREE.Group();
  const animatedTextures: THREE.Texture[] = [];
  const collision = new CollisionWorld(18);
  const destructibles: DestructibleProp[] = [];
  const vehicles: AnimatedVehicle[] = [];
  let followCamera: THREE.Object3D | undefined;

  if (environment === 'harbor') {
    buildHarbor(root, animatedTextures);
    populateClassicColliders('harbor', collision);
  } else if (environment === 'skyline') {
    buildSkyline(root);
    populateClassicColliders('skyline', collision);
  } else if (environment === 'dam') {
    buildDam(root, animatedTextures);
    populateClassicColliders('dam', collision);
  } else if (environment === 'openworld') {
    buildOpenWorldCity(root, animatedTextures);
    populateClassicColliders('openworld', collision);
  } else if (environment === 'highlands') {
    followCamera = buildHighlandsScenery(root, collision, destructibles);
  } else if (environment === 'wildfire') {
    followCamera = buildWildfireScenery(root, collision, destructibles);
  } else if (environment === 'desert') {
    followCamera = buildDesertScenery(root, collision, destructibles);
  } else if (environment === 'coast') {
    followCamera = buildCoastScenery(root, animatedTextures, collision, destructibles);
  } else if (environment === 'arctic') {
    followCamera = buildArcticScenery(root, collision, destructibles);
  } else if (environment === 'refinery') {
    followCamera = buildRefineryScenery(root, collision, destructibles);
  } else if (environment === 'metro') {
    followCamera = buildRealisticMetroScenery(root, collision, destructibles, vehicles, false);
  } else if (environment === 'metro-open') {
    followCamera = buildRealisticMetroScenery(root, collision, destructibles, vehicles, true);
  } else {
    followCamera = buildRiver(root, animatedTextures);
    populateClassicColliders('river', collision);
  }

  return { root, animatedTextures, followCamera, collision, destructibles, vehicles };
}

function waterTexture(vertical = false, river = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar a textura local de água.');
  const gradient = context.createLinearGradient(0, 0, vertical ? 256 : 0, vertical ? 0 : 256);
  gradient.addColorStop(0, vertical ? '#b6dcda' : river ? '#456d6c' : '#235963');
  gradient.addColorStop(0.52, vertical ? '#63aab0' : river ? '#75968b' : '#34727a');
  gradient.addColorStop(1, vertical ? '#e3f0e9' : river ? '#3e6465' : '#1a4653');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  for (let row = 0; row < (river ? 72 : 42); row++) {
    const base = (row / (river ? 72 : 42)) * 256;
    context.beginPath();
    if (vertical) {
      context.moveTo(base, 0);
      for (let step = 0; step <= 8; step++) context.lineTo(base + Math.sin(step * 1.5 + row) * 5, step * 32);
    } else {
      context.moveTo(0, base);
      for (let step = 0; step <= 8; step++) context.lineTo(step * 32, base + Math.sin(step * 1.55 + row) * 4);
    }
    context.strokeStyle = row % (river ? 6 : 4) === 0 ? 'rgba(230, 244, 224, .24)' : 'rgba(194, 223, 211, .1)';
    context.lineWidth = row % (river ? 6 : 4) === 0 ? (river ? 1.9 : 1.5) : 0.7;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(vertical ? 1.2 : 2.8, vertical ? 2.8 : 10);
  return texture;
}

function addWater(root: THREE.Group, textures: THREE.Texture[], width: number, length: number, color: number, z = 0, y = -1.5, river = false): THREE.Mesh {
  const texture = waterTexture(false, river);
  textures.push(texture);
  const material = new THREE.MeshPhysicalMaterial({
    color, map: texture, metalness: river ? 0.02 : 0.08, roughness: river ? 0.4 : 0.28, clearcoat: river ? 0.4 : 0.68,
    clearcoatRoughness: river ? 0.35 : 0.18, side: THREE.DoubleSide,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, y, z);
  root.add(water);
  return water;
}

function riverbankHeight(distance: number, z: number): number {
  const beach = THREE.MathUtils.smoothstep(distance, 0, 0.12);
  const slope = THREE.MathUtils.smoothstep(distance, 0.1, 0.82);
  return -1.8 + beach * 1.6 + slope * (2.3 + Math.sin(z * 0.043 + distance * 12) * 1.1);
}

function riverWaterEdge(side: -1 | 1): number {
  return side > 0 ? 33 : 47;
}

function createRiverbankGeometry(side: -1 | 1, seed: number): THREE.BufferGeometry {
  const columns = 18;
  const rows = 64;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const random = seededRandom(seed);
  const sand = new THREE.Color(0x978b68);
  const grass = new THREE.Color(0x52664a);
  const soil = new THREE.Color(0x45483a);
  const color = new THREE.Color();

  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    const z = -174 + v * 334;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const shoreline = riverWaterEdge(side) + u * 73;
      const irregularity = Math.sin(z * 0.061 + u * 8) * 0.9 + Math.sin(z * 0.019 - u * 21) * 1.8;
      const x = side * (shoreline + irregularity * (0.15 + u));
      const microTerrain = Math.sin(z * 0.17 + u * 14) * 0.16 + (random() - 0.5) * 0.14;
      const y = riverbankHeight(u, z) + microTerrain;
      positions.push(x, y, z);

      color.copy(sand).lerp(grass, THREE.MathUtils.smoothstep(u, 0.04, 0.2));
      color.lerp(soil, THREE.MathUtils.smoothstep(y, 2.5, 7) * 0.4);
      color.multiplyScalar(0.86 + random() * 0.24);
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = columns + 1;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (side > 0) indices.push(a, d, b, a, c, d);
      else indices.push(a, b, d, a, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRiverCliffGeometry(): THREE.BufferGeometry {
  const columns = 84;
  const rows = 20;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const random = seededRandom(9238);
  const darkWetStone = new THREE.Color(0x2f3831);
  const stone = new THREE.Color(0x5a6555);
  const warmStone = new THREE.Color(0x706e5c);
  const moss = new THREE.Color(0x4b6343);
  const color = new THREE.Color();

  for (let row = 0; row <= rows; row++) {
    const v = row / rows; // 0 = topo/platô, 1 = base submersa
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const x = -76 + u * 152;
      // Calha central escavada pela água entre x = -26 e x = 26
      const channelFactor = Math.exp(-Math.pow(x / 23, 2));
      const wingFactor = THREE.MathUtils.smoothstep(Math.abs(x), 18, 52);

      const crestHeight =
        26.5 -
        channelFactor * 2.8 +
        wingFactor * 4.2 +
        Math.sin(x * 0.08) * 1.8 +
        Math.cos(x * 0.21) * 0.75;

      // Degraus horizontais de rocha estratificada na parede vertical
      const strata = Math.sin(v * Math.PI * 7) * 0.55 + Math.cos(x * 0.17 + v * 9) * 0.45;
      const y =
        v < 0.12
          ? crestHeight + Math.sin((v / 0.12) * Math.PI) * 0.6
          : crestHeight * (1 - (v - 0.12) / 0.88) - 6.5 * Math.pow(v, 1.4) + strata * (1 - channelFactor * 0.5);

      // Anfiteatro côncavo: laterais avançam para frente, centro recua na garganta da cachoeira
      const gorgeRecess = channelFactor * (3.8 + Math.sin(v * Math.PI) * 2.4);
      const wingAdvance = wingFactor * 7.5;
      const terraceProtrusion = Math.pow(v, 1.35) * 4.6 + Math.max(0, Math.sin(v * Math.PI * 5)) * 1.35;
      const z =
        -133.5 -
        gorgeRecess +
        wingAdvance +
        terraceProtrusion +
        Math.sin(x * 0.09 + row * 0.5) * 1.4;

      positions.push(x, y, z);

      // Rocha escura e úmida perto da queda d'água, rocha estratificada nas laterais e musgo no topo
      color.copy(stone).lerp(warmStone, 0.35 + 0.35 * Math.sin(v * 16 + x * 0.05));
      color.lerp(darkWetStone, channelFactor * 0.72);
      if (v < 0.22) color.lerp(moss, (1 - v / 0.22) * (0.78 - channelFactor * 0.5));
      color.multiplyScalar(0.84 + random() * 0.24);
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = columns + 1;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildHarbor(root: THREE.Group, textures: THREE.Texture[]): void {
  addWater(root, textures, 300, 300, 0x557a82, 0, -2.4);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x394950, roughness: 0.88, metalness: 0.12 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x24343b, roughness: 0.82, metalness: 0.18 });
  const containerPalette = [0x713e37, 0x31515b, 0x7a6542, 0x354448].map((color) => new THREE.Color(color));
  const containerMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.36 });
  const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9d8f, metalness: 0.54, roughness: 0.48 });
  const craneMaterial = new THREE.MeshStandardMaterial({ color: 0x594e3d, metalness: 0.74, roughness: 0.38 });
  const cableMaterial = new THREE.MeshBasicMaterial({ color: 0xabbaad });
  const deckGeometry = new THREE.BoxGeometry(54, 2, 27);

  const containers = new THREE.InstancedMesh(new THREE.BoxGeometry(10.5, 1, 5.6), containerMaterial, 18);
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 5.2, 5.7), ribMaterial, 18);
  const pilings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.8, 8, 8), darkConcrete, 10);
  const dockLamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf2bc6f }), 14);
  const dummy = new THREE.Object3D();
  let containerIdx = 0;
  let pilingIdx = 0;
  let lampIdx = 0;

  for (const side of [-1, 1] as const) {
    const pier = new THREE.Mesh(deckGeometry, concrete);
    pier.position.set(side * 57, -0.9, 4);
    root.add(pier);

    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const cx = side * (43 + column * 12);
        const cy = 2.5 + row * 5.4;
        const cz = -18 + row * 9;
        const ch = 5.1 + ((row + column) % 2) * 1.6;
        dummy.position.set(cx, cy, cz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, ch, 1);
        dummy.updateMatrix();
        containers.setMatrixAt(containerIdx, dummy.matrix);
        containers.setColorAt(containerIdx, containerPalette[(row * 3 + column + (side > 0 ? 1 : 0)) % containerPalette.length]);

        dummy.position.set(cx - side * 4.7, cy, cz);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ribs.setMatrixAt(containerIdx, dummy.matrix);
        containerIdx++;
      }
    }

    const crane = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.8, 38, 2.2), craneMaterial);
    mast.position.y = 18;
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2, 36), craneMaterial);
    boom.position.set(0, 37, -13);
    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 7), darkConcrete);
    counterweight.position.set(0, 32, 16);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.22, 16, 0.22), cableMaterial);
    cable.position.set(0, 28, -24);
    crane.add(mast, boom, counterweight, cable);
    crane.position.set(side * 72, 0, -42);
    crane.rotation.y = side * 0.13;
    root.add(crane);

    for (let index = 0; index < 5; index++) {
      dummy.position.set(side * (38 + index * 9), -4, 23);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pilings.setMatrixAt(pilingIdx++, dummy.matrix);
    }

    for (let index = 0; index < 7; index++) {
      dummy.position.set(side * 39, 0.28, -50 + index * 16);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dockLamps.setMatrixAt(lampIdx++, dummy.matrix);
    }
  }

  containers.instanceMatrix.needsUpdate = true;
  if (containers.instanceColor) containers.instanceColor.needsUpdate = true;
  ribs.instanceMatrix.needsUpdate = true;
  pilings.instanceMatrix.needsUpdate = true;
  dockLamps.instanceMatrix.needsUpdate = true;
  root.add(containers, ribs, pilings, dockLamps);

  const rainGeometry = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(1500 * 3);
  let seed = 281;
  const random = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  for (let index = 0; index < 1500; index++) {
    rainPositions[index * 3] = (random() - 0.5) * 180;
    rainPositions[index * 3 + 1] = 5 + random() * 75;
    rainPositions[index * 3 + 2] = (random() - 0.5) * 180;
  }
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  root.add(new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: 0x91d7dd, size: 0.16, transparent: true, opacity: 0.42, depthWrite: false })));
}

function buildSkyline(root: THREE.Group): void {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(72, 280), new THREE.MeshStandardMaterial({ color: 0x242d34, roughness: 0.88, metalness: 0.16 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -1.7, -10);
  root.add(road);
  const lane = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 235), new THREE.MeshBasicMaterial({ color: 0x9bc5c4, transparent: true, opacity: 0.5 }));
  lane.position.set(0, -1.62, -10);
  root.add(lane);
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x29373e, roughness: 0.74, metalness: 0.26, emissive: 0x1c3338, emissiveIntensity: 0.2 });
  const facadeGeometry = new THREE.BoxGeometry(0.42, 1, 1.1);
  const facadeMaterial = new THREE.MeshBasicMaterial({ color: 0x5bb3b4, transparent: true, opacity: 0.68 });
  const buildings = new THREE.InstancedMesh(buildingGeometry, buildingMaterial, 36);
  const facades = new THREE.InstancedMesh(facadeGeometry, facadeMaterial, 36);
  const dummy = new THREE.Object3D();
  const random = seededRandom(5306);
  for (let index = 0; index < 36; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const z = -120 + row * 13.5 + random() * 5;
    const width = 11 + random() * 8;
    const depth = 10 + random() * 8;
    const height = 38 + random() * 56;
    const x = side * (48 + random() * 18);
    dummy.position.set(x, height / 2 - 2, z);
    dummy.scale.set(width, height, depth);
    dummy.rotation.y = random() * 0.22 * side;
    dummy.updateMatrix();
    buildings.setMatrixAt(index, dummy.matrix);
    dummy.position.set(x - side * width * 0.27, height * 0.5, z - depth * 0.51);
    dummy.scale.set(1, height * 0.78, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    facades.setMatrixAt(index, dummy.matrix);
  }
  buildings.instanceMatrix.needsUpdate = true;
  facades.instanceMatrix.needsUpdate = true;
  root.add(buildings, facades);
  for (const x of [-37, 37]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.2, 280), new THREE.MeshStandardMaterial({ color: 0x3e585c, metalness: 0.7, roughness: 0.34, emissive: 0x20484d, emissiveIntensity: 0.24 }));
    rail.position.set(x, -0.5, -10);
    root.add(rail);
  }
}

function buildDam(root: THREE.Group, textures: THREE.Texture[]): void {
  addWater(root, textures, 190, 300, 0x3e7780, 0, -2.6);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x78827d, roughness: 0.9, metalness: 0.12 });
  const inset = new THREE.MeshStandardMaterial({ color: 0x4a5c5c, roughness: 0.82, metalness: 0.22 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(190, 50, 17), concrete);
  wall.position.set(0, 20, -112);
  root.add(wall);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(202, 3.2, 19), new THREE.MeshStandardMaterial({ color: 0x9ba39a, roughness: 0.82, metalness: 0.2 }));
  crest.position.set(0, 45.8, -112);
  root.add(crest);
  const spillTex = waterfallSheetTexture(false);
  textures.push(spillTex);
  const spillMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, map: spillTex, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
  const foamTex = waterfallFoamPoolTexture();
  const portalGeo = new THREE.BoxGeometry(21, 31, 3.5);
  const towerGeo = new THREE.BoxGeometry(7, 58, 8);
  for (const [idx, x] of ([-66, -22, 22, 66] as const).entries()) {
    const portal = new THREE.Mesh(portalGeo, inset);
    portal.position.set(x, 12.5, -102.1);
    root.add(portal);
    const spill = new THREE.Mesh(createWaterfallCurtainGeometry(14.5, 29.2, 4.8, 701 + idx * 37), spillMaterial);
    spill.position.set(x, 26.8, -101.8);
    root.add(spill);
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 14),
      new THREE.MeshBasicMaterial({ color: 0xe6f8f5, map: foamTex, transparent: true, opacity: 0.58, depthWrite: false }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(x, -2.48, -94.5);
    root.add(foam);
    const tower = new THREE.Mesh(towerGeo, concrete);
    tower.position.set(x + (x < 0 ? -14 : 14), 24, -111);
    root.add(tower);
  }
  const road = new THREE.Mesh(new THREE.PlaneGeometry(190, 70), new THREE.MeshStandardMaterial({ color: 0x354247, roughness: 0.84 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.1, -57);
  root.add(road);
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xd4bb84 });
  for (const x of [-82, 82]) {
    const lightPole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 14, 8), inset);
    lightPole.position.set(x, 7, -70);
    const light = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.28, 0.8), beaconMaterial);
    light.position.set(x, 14, -70);
    root.add(lightPole, light);
  }
}

function isInsideCabinClearing(x: number, z: number): boolean {
  return x > 32 && x < 64 && z > -16 && z < 26;
}

function buildRiver(root: THREE.Group, textures: THREE.Texture[]): THREE.Mesh {
  const panoramaTexture = riverPanoramaTexture();
  const panorama = new THREE.Mesh(
    new THREE.SphereGeometry(420, 64, 32),
    new THREE.MeshBasicMaterial({ map: panoramaTexture, side: THREE.BackSide, depthWrite: false, toneMapped: false }),
  );
  panorama.rotation.y = Math.PI / 2;
  panorama.renderOrder = -100;
  root.add(panorama);
  addWater(root, textures, 80, 342, 0xb1c1b2, -7, -1.9, true);
  const bank = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  for (const side of [-1, 1] as const) {
    const terrain = new THREE.Mesh(createRiverbankGeometry(side, side < 0 ? 2981 : 9157), bank);
    terrain.receiveShadow = true;
    root.add(terrain);
  }

  const rockMaterials = [0x596258, 0x6b6a57, 0x777664].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0 }));
  const shorelineRockGeometry = createSculptedRockGeometry(3190);
  const shorelineRocks = rockMaterials.map((material) => new THREE.InstancedMesh(shorelineRockGeometry, material, 26));
  const rockCounts = [0, 0, 0];
  const shorelineRandom = seededRandom(51081);
  const rockDummy = new THREE.Object3D();
  for (let index = 0; index < 78; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const distance = 0.035 + shorelineRandom() * 0.18;
    const z = -158 + shorelineRandom() * 304;
    const x = side * (riverWaterEdge(side) + distance * 73);
    const size = 0.7 + shorelineRandom() * 2.4;
    rockDummy.position.set(x, riverbankHeight(distance, z) + size * 0.22, z);
    rockDummy.rotation.set(shorelineRandom() * 0.3, shorelineRandom() * Math.PI, shorelineRandom() * 0.2);
    rockDummy.scale.set(size * (0.9 + shorelineRandom() * 0.8), size * (0.35 + shorelineRandom() * 0.5), size * (1.1 + shorelineRandom() * 1.2));
    rockDummy.updateMatrix();
    const materialIndex = index % shorelineRocks.length;
    shorelineRocks[materialIndex].setMatrixAt(rockCounts[materialIndex]++, rockDummy.matrix);
  }
  shorelineRocks.forEach((rocks, idx) => {
    rocks.count = rockCounts[idx];
    rocks.instanceMatrix.needsUpdate = true;
    root.add(rocks);
  });

  const cliffMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.02 });
  const cliff = new THREE.Mesh(createRiverCliffGeometry(), cliffMaterial);
  cliff.receiveShadow = true;
  root.add(cliff);

  for (const side of [-1, 1] as const) {
    const massif = new THREE.Mesh(createCliffOutcropGeometry(side < 0 ? 4109 : 8821, side), cliffMaterial);
    massif.position.set(side * 44, -2.2, -125);
    massif.castShadow = true;
    massif.receiveShadow = true;
    root.add(massif);
  }

  // Lagoa superior (nascente no topo do cânion) alimentando a queda d'água
  const upperRiverTex = waterTexture(false, true);
  textures.push(upperRiverTex);
  const headwaters = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x6f9e95,
      map: upperRiverTex,
      roughness: 0.25,
      metalness: 0.04,
      clearcoat: 0.65,
      clearcoatRoughness: 0.22,
    }),
  );
  headwaters.rotation.x = -Math.PI / 2;
  headwaters.position.set(0, 24.4, -148);
  root.add(headwaters);

  // Rochas basálticas úmidas ancoradas nos divisores da crista, no degrau intermediário e na bacia de impacto
  const wetRockMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3630, roughness: 0.34, metalness: 0.08 });
  const rockGeo = createSculptedRockGeometry(7712);

  // 3 grandes promontórios rochosos encaixados na parede dividindo as quedas principais + 2 paredões nas bordas
  const crestSplitters = [
    { x: -24.5, y: 21.8, z: -133.2, sx: 4.8, sy: 6.2, sz: 4.5, ry: 0.3 },
    { x: -13.2, y: 21.2, z: -134.5, sx: 3.4, sy: 5.8, sz: 4.2, ry: 1.1 },
    { x: 0.4, y: 21.5, z: -134.8, sx: 4.2, sy: 6.4, sz: 4.6, ry: 2.2 },
    { x: 13.4, y: 21.0, z: -134.4, sx: 3.2, sy: 5.5, sz: 4.0, ry: 0.7 },
    { x: 23.8, y: 21.4, z: -133.0, sx: 4.6, sy: 6.0, sz: 4.4, ry: 1.8 },
    // Degraus rochosos intermediários (meia altura) onde a água bate e abre em véu
    { x: -16.5, y: 10.5, z: -129.8, sx: 4.4, sy: 3.8, sz: 4.2, ry: 0.5 },
    { x: -2.5, y: 9.8, z: -130.2, sx: 5.2, sy: 4.0, sz: 4.6, ry: 1.9 },
    { x: 11.5, y: 10.2, z: -129.6, sx: 4.6, sy: 3.6, sz: 4.2, ry: 2.7 },
  ] as const;

  const plungeBoulders = new THREE.InstancedMesh(rockGeo, wetRockMaterial, crestSplitters.length + 22);
  const boulderDummy = new THREE.Object3D();
  const boulderRandom = seededRandom(7719);
  let bIdx = 0;

  for (const sp of crestSplitters) {
    boulderDummy.position.set(sp.x, sp.y, sp.z);
    boulderDummy.rotation.set(0.08, sp.ry, -0.05);
    boulderDummy.scale.set(sp.sx, sp.sy, sp.sz);
    boulderDummy.updateMatrix();
    plungeBoulders.setMatrixAt(bIdx++, boulderDummy.matrix);
  }

  // Rochas semi-submersas nas laterais da bacia (deixando o centro livre para a espuma brilhante)
  for (let i = 0; i < 22; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const bx = side * (9 + boulderRandom() * 19) + (i < 6 ? (boulderRandom() - 0.5) * 14 : 0);
    const by = -1.95 + boulderRandom() * 0.85;
    const bz = -124.5 + boulderRandom() * 11.5;
    const s = 1.5 + boulderRandom() * 2.8;
    boulderDummy.position.set(bx, by, bz);
    boulderDummy.rotation.set(boulderRandom() * 0.35, boulderRandom() * Math.PI * 2, boulderRandom() * 0.35);
    boulderDummy.scale.set(s * (1.15 + boulderRandom() * 0.45), s * (0.48 + boulderRandom() * 0.35), s * (0.95 + boulderRandom() * 0.45));
    boulderDummy.updateMatrix();
    plungeBoulders.setMatrixAt(bIdx++, boulderDummy.matrix);
  }
  plungeBoulders.instanceMatrix.needsUpdate = true;
  root.add(plungeBoulders);

  const waterfallMainTex = waterfallSheetTexture(false);
  const waterfallMistTex = waterfallSheetTexture(true);
  textures.push(waterfallMainTex, waterfallMistTex);

  // Cortinas principais de queda d'água com relevo de degrau intermediário e vertex colors
  const streams = [
    { x: -18.8, width: 10.2, topY: 24.5, drop: 26.5, arch: 6.2, opacity: 0.92, seed: 101 },
    { x: -6.4, width: 13.8, topY: 24.6, drop: 26.6, arch: 7.4, opacity: 0.96, seed: 202 },
    { x: 7.0, width: 13.2, topY: 24.6, drop: 26.6, arch: 7.0, opacity: 0.95, seed: 303 },
    { x: 18.4, width: 9.6, topY: 24.3, drop: 26.3, arch: 5.8, opacity: 0.9, seed: 404 },
  ] as const;

  for (const stream of streams) {
    const coreSheet = new THREE.Mesh(
      createWaterfallCurtainGeometry(stream.width, stream.drop, stream.arch, stream.seed),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        map: waterfallMainTex,
        transparent: true,
        opacity: stream.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    coreSheet.position.set(stream.x, stream.topY, -135.2);
    root.add(coreSheet);

    const outerVeil = new THREE.Mesh(
      createWaterfallCurtainGeometry(stream.width * 1.16, stream.drop * 1.01, stream.arch + 1.45, stream.seed + 50),
      new THREE.MeshBasicMaterial({
        color: 0xe8faf7,
        vertexColors: true,
        map: waterfallMistTex,
        transparent: true,
        opacity: stream.opacity * 0.62,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    outerVeil.position.set(stream.x, stream.topY + 0.12, -134.7);
    root.add(outerVeil);
  }

  // Poço de espuma em múltiplas camadas + nuvens volumétricas de névoa na base e no degrau intermediário
  const foamPoolTex = waterfallFoamPoolTexture();
  for (const [scaleX, scaleZ, zOffset, opacity] of [
    [36, 16, -123.5, 0.88],
    [44, 23, -119.5, 0.56],
    [52, 32, -114.0, 0.3],
  ] as const) {
    const foamDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(scaleX, scaleZ),
      new THREE.MeshBasicMaterial({
        color: 0xf4fcfa,
        map: foamPoolTex,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    foamDisc.rotation.x = -Math.PI / 2;
    foamDisc.position.set(-0.5, -1.76, zOffset);
    root.add(foamDisc);
  }

  // Nuvens suaves de spray e vapor d'água (substituindo os pontos brancos duros)
  const mistCloudTex = waterfallMistCloudTexture();
  const mistBillboards = [
    { x: -16, y: 2.2, z: -122.5, sx: 18, sy: 9, op: 0.42 },
    { x: -4, y: 2.8, z: -121.2, sx: 22, sy: 11, op: 0.48 },
    { x: 9, y: 2.6, z: -121.6, sx: 20, sy: 10, op: 0.46 },
    { x: 18, y: 2.0, z: -122.8, sx: 16, sy: 8.5, op: 0.38 },
    { x: -7, y: 11.2, z: -127.4, sx: 18, sy: 7.5, op: 0.32 },
    { x: 8, y: 11.0, z: -127.6, sx: 17, sy: 7.2, op: 0.3 },
    { x: 0, y: 4.5, z: -117.5, sx: 34, sy: 12, op: 0.28 },
  ] as const;
  for (const mb of mistBillboards) {
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(mb.sx, mb.sy),
      new THREE.MeshBasicMaterial({
        color: 0xf0faf8,
        map: mistCloudTex,
        transparent: true,
        opacity: mb.op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    cloud.position.set(mb.x, mb.y, mb.z);
    root.add(cloud);
  }

  const random = seededRandom(2089);
  const count = 190;
  const trunk = new THREE.InstancedMesh(
    createNaturalTrunkGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.94, metalness: 0 }),
    count,
  );
  const canopy = new THREE.InstancedMesh(
    createSculptedCanopyGeometry(3101, 1.0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0 }),
    count,
  );
  const canopyLower = new THREE.InstancedMesh(
    createSculptedCanopyGeometry(5209, 0.86),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 }),
    count,
  );
  const canopyUpper = new THREE.InstancedMesh(
    createSculptedCanopyGeometry(7411, 0.78),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0 }),
    count,
  );
  const undergrowth = new THREE.InstancedMesh(
    createSculptedCanopyGeometry(9103, 0.65),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 }),
    240,
  );
  const trunkColor = new THREE.Color();
  const canopyColor = new THREE.Color();
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    const side = random() < 0.5 ? -1 : 1;
    let x = side * (riverWaterEdge(side) + 10 + random() * 53);
    let z = -144 + random() * 292;
    if (isInsideCabinClearing(x, z)) {
      z = z < 5 ? -22 - random() * 25 : 30 + random() * 25;
    }
    const scale = 0.75 + random() * 0.92;
    const ground = riverbankHeight((Math.abs(x) - riverWaterEdge(side)) / 73, z);
    const yaw = random() * Math.PI * 2;
    const leanX = (random() - 0.5) * 0.08;
    const leanZ = (random() - 0.5) * 0.08;

    dummy.position.set(x, ground, z);
    dummy.rotation.set(leanX, yaw, leanZ);
    dummy.scale.set(1.05 * scale, 9.6 * scale, 1.05 * scale);
    dummy.updateMatrix();
    trunk.setMatrixAt(index, dummy.matrix);
    trunkColor.setHSL(0.075 + random() * 0.03, 0.34, 0.24 + random() * 0.09);
    trunk.setColorAt(index, trunkColor);

    dummy.position.set(x, ground + 8.9 * scale, z);
    dummy.rotation.set(leanX, yaw, leanZ);
    dummy.scale.set(4.5 * scale, 3.8 * scale, 4.4 * scale);
    dummy.updateMatrix();
    canopy.setMatrixAt(index, dummy.matrix);
    canopyColor.setHSL(0.26 + random() * 0.08, 0.42 + random() * 0.16, 0.34 + random() * 0.12);
    canopy.setColorAt(index, canopyColor);

    dummy.position.set(x + side * 2.1 * scale, ground + 7.4 * scale, z + 1.7 * scale);
    dummy.rotation.set(random() * 0.1, yaw + 1.1, random() * 0.1);
    dummy.scale.set(3.6 * scale, 3.0 * scale, 3.9 * scale);
    dummy.updateMatrix();
    canopyLower.setMatrixAt(index, dummy.matrix);
    canopyLower.setColorAt(index, canopyColor.clone().multiplyScalar(0.84));

    dummy.position.set(x - side * 1.2 * scale, ground + 11.4 * scale, z - 1.0 * scale);
    dummy.rotation.set(random() * 0.1, yaw + 2.3, random() * 0.1);
    dummy.scale.set(3.2 * scale, 3.1 * scale, 3.2 * scale);
    dummy.updateMatrix();
    canopyUpper.setMatrixAt(index, dummy.matrix);
    canopyUpper.setColorAt(index, canopyColor.clone().multiplyScalar(1.14));
  }
  const undergrowthRandom = seededRandom(98312);
  for (let index = 0; index < 240; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const distance = 0.09 + undergrowthRandom() * 0.48;
    let z = -164 + undergrowthRandom() * 315;
    const x = side * (riverWaterEdge(side) + distance * 73);
    if (isInsideCabinClearing(x, z)) {
      z = z < 5 ? -20 - undergrowthRandom() * 20 : 28 + undergrowthRandom() * 20;
    }
    const size = 0.85 + undergrowthRandom() * 1.9;
    dummy.position.set(x, riverbankHeight(distance, z) + size * 0.28, z);
    dummy.rotation.set(undergrowthRandom() * 0.18, undergrowthRandom() * Math.PI * 2, undergrowthRandom() * 0.16);
    dummy.scale.set(size * 1.35, size * 0.88, size * 1.25);
    dummy.updateMatrix();
    undergrowth.setMatrixAt(index, dummy.matrix);
    canopyColor.setHSL(0.25 + undergrowthRandom() * 0.11, 0.38 + undergrowthRandom() * 0.2, 0.28 + undergrowthRandom() * 0.14);
    undergrowth.setColorAt(index, canopyColor);
  }
  trunk.instanceMatrix.needsUpdate = true;
  canopy.instanceMatrix.needsUpdate = true;
  canopyLower.instanceMatrix.needsUpdate = true;
  canopyUpper.instanceMatrix.needsUpdate = true;
  undergrowth.instanceMatrix.needsUpdate = true;
  if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  if (canopyLower.instanceColor) canopyLower.instanceColor.needsUpdate = true;
  if (canopyUpper.instanceColor) canopyUpper.instanceColor.needsUpdate = true;
  if (undergrowth.instanceColor) undergrowth.instanceColor.needsUpdate = true;
  root.add(trunk, canopy, canopyLower, canopyUpper, undergrowth);
  buildRiverPalms(root);

  const cabin = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x76543d, roughness: 0.9, metalness: 0.02 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x49392e, roughness: 0.94 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x46504a, roughness: 0.72, metalness: 0.18 });
  for (const x of [-3.8, 0, 3.8]) for (const z of [-3.4, 3.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 6.2, 8), darkWood);
    post.position.set(x, 1.1, z);
    cabin.add(post);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.72, 8.5), darkWood);
  deck.position.set(0, 4, 0);
  cabin.add(deck);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(7.2, 5, 6.2), wood);
  walls.position.set(0, 6.75, -0.55);
  cabin.add(walls);

  // Oitões triangulares sob o telhado de duas águas (cumeeira em y = 10.65)
  const gableGeo = new THREE.ConeGeometry(4.1, 1.85, 4);
  gableGeo.rotateY(Math.PI / 4);
  for (const gz of [-3.55, 2.45]) {
    const gable = new THREE.Mesh(gableGeo, wood);
    gable.scale.set(1.24, 1, 0.08);
    gable.position.set(0, 9.85, gz);
    cabin.add(gable);
  }

  // Telhado de duas águas correto (em Λ, subindo das bordas até a cumeeira central)
  const roofLeft = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.38, 8.4), roof);
  roofLeft.position.set(-2.05, 9.62, -0.55);
  roofLeft.rotation.z = 0.46;
  const roofRight = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.38, 8.4), roof);
  roofRight.position.set(2.05, 9.62, -0.55);
  roofRight.rotation.z = -0.46;
  cabin.add(roofLeft, roofRight);
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 8.6, 8), darkWood);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, 10.68, -0.55);
  cabin.add(ridge);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.8, 1.35), darkWood);
  chimney.position.set(1.75, 11.2, 1.25);
  cabin.add(chimney);
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.3, 1.7), roof);
  chimneyCap.position.set(1.75, 13.15, 1.25);
  cabin.add(chimneyCap);

  // Guarda-corpo da varanda frontal e traseira
  for (let index = 0; index < 10; index++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.7, 0.12), darkWood);
    slat.position.set(-3.45 + index * 0.76, 6.76, 2.63);
    cabin.add(slat);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.45, 3.4, 0.16), darkWood);
  door.position.set(0.7, 6.55, -3.72);
  cabin.add(door);
  const doorInset = new THREE.Mesh(new THREE.BoxGeometry(1.12, 2.95, 0.04), wood);
  doorInset.position.set(0.7, 6.55, -3.82);
  cabin.add(doorInset);
  const doorHandle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0xb69a68, metalness: 0.78, roughness: 0.28 }));
  doorHandle.position.set(1.15, 6.45, -3.9);
  cabin.add(doorHandle);
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd58a });
  for (const side of [-1, 1]) {
    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 1.7), windowMaterial);
    windowMesh.position.set(side * 3.66, 7, -1.4);
    cabin.add(windowMesh);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.62, 1.98), darkWood);
    frame.position.set(side * 3.63, 7, -1.4);
    cabin.add(frame);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.28, 1.62), windowMaterial);
    glass.position.set(side * 3.73, 7, -1.4);
    cabin.add(glass);
  }

  // Lanterna de alpendre aquecida (emissiva, sem PointLight extra para economizar FPS)
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.14, 0.42, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe29a }),
  );
  lantern.position.set(-0.65, 7.65, -3.88);
  cabin.add(lantern);

  const dock = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 18), darkWood);
  dock.position.set(0, 3.8, -11);
  cabin.add(dock);
  for (const x of [-1.8, 1.8]) for (const z of [-10, -18.5]) {
    const dockPile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.4, 8), darkWood);
    dockPile.position.set(x, 0.9, z);
    cabin.add(dockPile);
  }
  for (let index = 0; index < 5; index++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.08, 0.18), wood);
    plank.position.set(0, 4.14, -18 + index * 3.2);
    cabin.add(plank);
  }
  for (const side of [-1, 1]) {
    const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.5, 7), darkWood);
    railPost.position.set(side * 2.15, 4.9, -12.5);
    cabin.add(railPost);
    const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 6.2), wood);
    handrail.position.set(side * 2.15, 5.55, -12.5);
    cabin.add(handrail);
  }
  const fishingRod = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.4, 4.45, -15.5),
      new THREE.Vector3(-1.6, 6.2, -17.5),
      new THREE.Vector3(-1.8, 8.5, -20.5),
    ]), 18, 0.045, 6, false),
    darkWood,
  );
  cabin.add(fishingRod);
  const fishingLine = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.8, 8.5, -20.5),
      new THREE.Vector3(-1.2, 5.4, -22.5),
      new THREE.Vector3(-0.4, 0.4, -24.5),
    ]), 12, 0.012, 4, false),
    new THREE.MeshBasicMaterial({ color: 0xd5ddcb, transparent: true, opacity: 0.8 }),
  );
  cabin.add(fishingLine);

  // Canoa esculpida com casco côncavo aberto, bancos de madeira e remo
  const canoeGroup = createWoodenCanoeGroup(wood, darkWood);
  canoeGroup.position.set(1.6, 0.12, -21.2);
  canoeGroup.rotation.y = 0.18;
  cabin.add(canoeGroup);

  cabin.position.set(50, -1.9, 10);
  cabin.rotation.y = Math.PI / 2;
  root.add(cabin);

  return panorama;
}

function riverPanoramaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar o panorama local do vale.');
  const sky = context.createLinearGradient(0, 0, 0, 620);
  sky.addColorStop(0, '#b7caca');
  sky.addColorStop(0.5, '#a6c0bd');
  sky.addColorStop(0.82, '#d3d4bf');
  sky.addColorStop(1, '#889e88');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = seededRandom(73214);
  const drawRidge = (baseY: number, amplitude: number, color: string, blur: number): void => {
    context.save();
    context.filter = `blur(${blur}px)`;
    context.beginPath();
    context.moveTo(0, canvas.height);
    context.lineTo(0, baseY);
    for (let x = 0; x <= canvas.width; x += 24) context.lineTo(x, baseY + (random() - 0.5) * amplitude);
    context.lineTo(canvas.width, canvas.height);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.restore();
  };
  drawRidge(434, 44, '#a1b2a4', 7);
  drawRidge(470, 68, '#718b76', 4);
  drawRidge(505, 76, '#526f58', 2);
  drawRidge(536, 62, '#3d6049', 0.8);
  const distantForest = context.createLinearGradient(0, 430, 0, 704);
  distantForest.addColorStop(0, 'rgba(74, 105, 77, .46)');
  distantForest.addColorStop(0.42, 'rgba(53, 88, 59, .86)');
  distantForest.addColorStop(1, '#344f3b');
  context.fillStyle = distantForest;
  context.fillRect(0, 495, canvas.width, 220);
  for (let index = 0; index < 520; index++) {
    const x = random() * canvas.width;
    const base = 475 + random() * 215;
    const radius = 7 + random() * 25;
    const hue = 93 + random() * 30;
    const light = 20 + random() * 15;
    context.fillStyle = `hsl(${hue} 25% ${light}%)`;
    context.beginPath();
    context.ellipse(x, base, radius, radius * (0.72 + random() * 0.55), random() * 0.3, 0, Math.PI * 2);
    context.fill();
  }
  const haze = context.createLinearGradient(0, 410, 0, 700);
  haze.addColorStop(0, 'rgba(222, 232, 220, .44)');
  haze.addColorStop(0.42, 'rgba(209, 226, 214, .12)');
  haze.addColorStop(1, 'rgba(209, 226, 214, 0)');
  context.fillStyle = haze;
  context.fillRect(0, 410, canvas.width, 290);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.UVMapping;
  return texture;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function createCliffOutcropGeometry(seed: number, side: -1 | 1): THREE.BufferGeometry {
  const columns = 28;
  const rows = 20;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const random = seededRandom(seed);
  const darkRock = new THREE.Color(0x3f473e);
  const warmRock = new THREE.Color(0x666555);
  const mossTop = new THREE.Color(0x496442);
  const color = new THREE.Color();

  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // 0 no topo, 1 na base
    for (let c = 0; c <= columns; c++) {
      // Ângulo de -0.25*PI a +1.25*PI para fechar totalmente a parte de trás contra o paredão
      const u = -0.22 * Math.PI + (c / columns) * 1.44 * Math.PI;
      const baseRadiusX = 24 * (0.7 + 0.42 * Math.sin(v * Math.PI * 0.88));
      const baseRadiusZ = 15 * (0.75 + 0.38 * Math.sin(v * Math.PI * 0.92));
      const terrace = Math.floor(v * 5) * 0.42 + Math.sin(v * 20) * 0.5;
      const crag = Math.sin(u * 6 + seed * 0.1) * 1.4 + Math.cos(u * 11 - v * 8) * 0.75;
      const rx = Math.max(5, baseRadiusX + crag + terrace);
      const rz = Math.max(4, baseRadiusZ + crag * 0.6);

      const x = Math.cos(u) * rx * -side * 0.85;
      const sinU = Math.sin(u);
      // Parte de trás (sinU < 0) ancorada no paredão para nunca vazar céu
      const z = sinU >= 0 ? sinU * rz - 3 * (1 - v) : sinU * 8 - 5;
      const maxH = 27.2 + (side > 0 ? 2.2 : 0.6);
      const plateau = v < 0.18 ? maxH - v * 6 + Math.sin(u * 4) * 0.6 : maxH * (1 - Math.pow((v - 0.18) / 0.82, 1.18));
      const y = v === 1 ? -2.5 : Math.max(-2.0, plateau + (random() - 0.5) * 0.4);

      positions.push(x, y, z);

      color.copy(darkRock).lerp(warmRock, 0.35 + 0.45 * Math.sin(v * 14 + u * 3));
      if (v < 0.3) color.lerp(mossTop, (1 - v / 0.3) * 0.76);
      color.multiplyScalar(0.85 + random() * 0.2);
      colors.push(color.r, color.g, color.b);
    }
  }

  // Fechamento do topo do promontório (tampa de platô com musgo)
  const capCenterIdx = positions.length / 3;
  positions.push(0, 27.0 + (side > 0 ? 2.2 : 0.6), -2);
  colors.push(mossTop.r * 0.92, mossTop.g * 0.92, mossTop.b * 0.92);
  for (let c = 0; c < columns; c++) {
    indices.push(capCenterIdx, c + 1, c);
  }

  const stride = columns + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const d = a + stride;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function weldGeometry(raw: THREE.BufferGeometry): { positions: number[]; indices: number[] } {
  const pos = raw.getAttribute('position');
  const map = new Map<string, number>();
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${Math.round(x * 10000)},${Math.round(y * 10000)},${Math.round(z * 10000)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      map.set(key, idx);
      positions.push(x, y, z);
    }
    indices.push(idx);
  }
  raw.dispose();
  return { positions, indices };
}

function createSculptedRockGeometry(seed: number): THREE.BufferGeometry {
  const welded = weldGeometry(new THREE.IcosahedronGeometry(1, 1));
  const random = seededRandom(seed);
  const p1 = random() * 6.28;
  const p2 = random() * 6.28;
  for (let i = 0; i < welded.positions.length; i += 3) {
    const x = welded.positions[i];
    const y = welded.positions[i + 1];
    const z = welded.positions[i + 2];
    const facet = 1 + 0.18 * Math.sin(x * 3.7 + p1) * Math.cos(z * 3.4 + p2) + 0.1 * Math.sin(y * 5.2);
    welded.positions[i] = x * facet;
    welded.positions[i + 1] = y * (y < 0 ? 0.55 : 0.88) * facet;
    welded.positions[i + 2] = z * facet;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(welded.positions, 3));
  geometry.setIndex(welded.indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWaterfallCurtainGeometry(width: number, drop: number, arch: number, seed: number): THREE.BufferGeometry {
  const cols = 20;
  const rows = 36;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const random = seededRandom(seed);
  const phase = random() * Math.PI * 2;
  const topTeal = new THREE.Color(0x8ecbc4);
  const pureFoam = new THREE.Color(0xf5fffd);
  const vColor = new THREE.Color();

  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // 0 = canal superior, 1 = impacto no poço
    const spread = 1 + v * 0.24 + Math.pow(v, 3.5) * 0.34;
    // Ressalto hidráulico em v ~ 0.56 onde a água bate no degrau rochoso intermediário
    const ledgeBounce = Math.exp(-Math.pow((v - 0.56) / 0.11, 2)) * 1.65;
    // Trajetória hidrodinâmica: trecho horizontal de entrada -> crista arredondada -> queda parabólica -> degrau -> saia
    const zCurve =
      v < 0.1
        ? (v / 0.1) * 3.2
        : 3.2 + Math.sin(((v - 0.1) / 0.9) * Math.PI * 0.54) * arch + ledgeBounce + Math.pow(v, 3) * 2.1;
    const yDrop =
      v < 0.08
        ? -(v / 0.08) * 0.45
        : -0.45 - Math.pow((v - 0.08) / 0.92, 1.28) * drop + ledgeBounce * 0.28;

    // Espuma branca intensa na crista (v ~ 0.12), no degrau (v ~ 0.56) e no impacto (v > 0.82)
    const crestFoam = Math.exp(-Math.pow((v - 0.12) / 0.09, 2)) * 0.75;
    const shelfFoam = Math.exp(-Math.pow((v - 0.56) / 0.12, 2)) * 0.85;
    const plungeFoam = THREE.MathUtils.smoothstep(v, 0.72, 1.0);
    const foamFactor = Math.min(1, 0.25 + crestFoam + shelfFoam + plungeFoam);

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const centered = u - 0.5;
      const x = centered * width * spread;
      const flute =
        Math.sin(u * Math.PI * 6 + phase) * (0.22 + v * 0.62) +
        Math.cos(u * Math.PI * 11 - v * 7) * 0.18;
      const edgeBack = Math.pow(Math.abs(centered) * 2, 2) * -1.05;
      positions.push(x, yDrop, zCurve + flute + edgeBack);
      uvs.push(u, (1 - v) * 2.6);

      const ribFoam = Math.max(0, Math.sin(u * Math.PI * 6 + phase)) * 0.25;
      vColor.copy(topTeal).lerp(pureFoam, Math.min(1, foamFactor + ribFoam));
      colors.push(vColor.r, vColor.g, vColor.b);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const d = a + stride;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function waterfallSheetTexture(mistLayer: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível criar a textura da cachoeira.');
  const random = seededRandom(mistLayer ? 6091 : 3049);

  ctx.clearRect(0, 0, 512, 512);

  if (!mistLayer) {
    const baseGrad = ctx.createLinearGradient(0, 0, 512, 0);
    baseGrad.addColorStop(0, 'rgba(120, 182, 176, 0)');
    baseGrad.addColorStop(0.1, 'rgba(132, 194, 188, 0.62)');
    baseGrad.addColorStop(0.32, 'rgba(195, 234, 228, 0.88)');
    baseGrad.addColorStop(0.5, 'rgba(150, 208, 202, 0.76)');
    baseGrad.addColorStop(0.68, 'rgba(205, 240, 235, 0.9)');
    baseGrad.addColorStop(0.9, 'rgba(132, 194, 188, 0.62)');
    baseGrad.addColorStop(1, 'rgba(120, 182, 176, 0)');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 512, 512);
  }

  // Filamentos hidrodinâmicos de espuma e água em queda (tileable em Y)
  const streakCount = mistLayer ? 140 : 230;
  for (let i = 0; i < streakCount; i++) {
    const xBase = 24 + random() * 464;
    const edgeFade = Math.sin((xBase / 512) * Math.PI);
    const isBrightCore = i % 5 === 0;
    const alpha = (mistLayer ? 0.1 + random() * 0.24 : (isBrightCore ? 0.32 : 0.14) + random() * 0.38) * edgeFade;
    const width = mistLayer ? 3 + random() * 10 : isBrightCore ? 2.2 + random() * 6.5 : 0.9 + random() * 3.8;
    const freq = 1 + Math.floor(random() * 3);
    const phase = random() * Math.PI * 2;
    const amp = 1.5 + random() * 5.5;

    ctx.beginPath();
    for (let step = 0; step <= 32; step++) {
      const y = (step / 32) * 512;
      const angle = (step / 32) * Math.PI * 2 * freq + phase;
      const x = xBase + Math.sin(angle) * amp;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = isBrightCore
      ? `rgba(250, 255, 254, ${alpha.toFixed(3)})`
      : `rgba(218, 244, 239, ${alpha.toFixed(3)})`;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // Arcos em V e bolhas de espuma aerada (efeito de queda livre)
  for (let i = 0; i < 260; i++) {
    const x = 32 + random() * 448;
    const y = random() * 512;
    const rx = 2.5 + random() * 8;
    const ry = 10 + random() * 34;
    const edgeFade = Math.sin((x / 512) * Math.PI);
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.07 + random() * 0.24 * edgeFade).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, mistLayer ? 1.5 : 2.1);
  return texture;
}

function waterfallMistCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const random = seededRandom(8841);
    for (let i = 0; i < 18; i++) {
      const cx = 68 + random() * 120;
      const cy = 78 + random() * 100;
      const r = 42 + random() * 58;
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      grad.addColorStop(0, 'rgba(242, 252, 250, 0.22)');
      grad.addColorStop(0.5, 'rgba(220, 242, 238, 0.1)');
      grad.addColorStop(1, 'rgba(220, 242, 238, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function waterfallFoamPoolTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 256;
    const cy = 256;
    const grad = ctx.createRadialGradient(cx, cy, 12, cx, cy, 248);
    grad.addColorStop(0, 'rgba(248, 255, 252, 0.95)');
    grad.addColorStop(0.38, 'rgba(225, 245, 238, 0.68)');
    grad.addColorStop(0.72, 'rgba(190, 226, 218, 0.28)');
    grad.addColorStop(1, 'rgba(190, 226, 218, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const random = seededRandom(4402);
    for (let ring = 0; ring < 8; ring++) {
      const r = 36 + ring * 26;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.42 - ring * 0.045).toFixed(3)})`;
      ctx.lineWidth = 2.8 - ring * 0.22;
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) {
        const theta = (a / 64) * Math.PI * 2;
        const wobble = r + Math.sin(theta * 6 + ring) * 5 + (random() - 0.5) * 3;
        const x = cx + Math.cos(theta) * wobble;
        const y = cy + Math.sin(theta) * wobble;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNaturalTrunkGeometry(): THREE.BufferGeometry {
  const radialSegs = 9;
  const heightSegs = 10;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Tronco principal de y = 0 até y = 1 com raízes alargadas (buttress roots) e leve curva S
  for (let h = 0; h <= heightSegs; h++) {
    const t = h / heightSegs;
    const y = t;
    const baseFlare = Math.pow(1 - t, 3.2) * 0.11;
    const radius = THREE.MathUtils.lerp(0.11, 0.042, t) + baseFlare;
    const bendX = Math.sin(t * Math.PI * 1.2) * 0.045;
    const bendZ = Math.cos(t * Math.PI * 0.9) * 0.03;

    for (let s = 0; s < radialSegs; s++) {
      const angle = (s / radialSegs) * Math.PI * 2;
      // Nervuras de raiz na base
      const rootFlute = 1 + Math.pow(1 - t, 2.4) * 0.32 * Math.cos(angle * 4);
      const r = radius * rootFlute;
      positions.push(bendX + Math.cos(angle) * r, y, bendZ + Math.sin(angle) * r);
      const shade = 0.62 + 0.38 * t + 0.08 * Math.cos(angle * 3);
      colors.push(shade, shade * 0.96, shade * 0.9);
    }
  }

  for (let h = 0; h < heightSegs; h++) {
    const rowA = h * radialSegs;
    const rowB = (h + 1) * radialSegs;
    for (let s = 0; s < radialSegs; s++) {
      const next = (s + 1) % radialSegs;
      indices.push(rowA + s, rowB + next, rowB + s, rowA + s, rowA + next, rowB + next);
    }
  }

  // Galhos secundários saindo da parte alta do tronco em direção às copas laterais
  const branches = [
    { startY: 0.64, dirX: 0.26, dirZ: 0.16, endY: 0.92, r0: 0.045, r1: 0.022 },
    { startY: 0.72, dirX: -0.22, dirZ: -0.14, endY: 0.98, r0: 0.04, r1: 0.02 },
  ] as const;
  const branchSegs = 6;
  const branchRings = 4;

  for (const br of branches) {
    const baseVertex = positions.length / 3;
    for (let r = 0; r <= branchRings; r++) {
      const t = r / branchRings;
      const cx = br.dirX * Math.pow(t, 0.85);
      const cy = THREE.MathUtils.lerp(br.startY, br.endY, t);
      const cz = br.dirZ * Math.pow(t, 0.85);
      const rad = THREE.MathUtils.lerp(br.r0, br.r1, t);
      for (let s = 0; s < branchSegs; s++) {
        const a = (s / branchSegs) * Math.PI * 2;
        positions.push(cx + Math.cos(a) * rad, cy, cz + Math.sin(a) * rad * 0.55);
        const shade = 0.78 + 0.18 * t;
        colors.push(shade, shade * 0.96, shade * 0.9);
      }
    }
    for (let r = 0; r < branchRings; r++) {
      const rowA = baseVertex + r * branchSegs;
      const rowB = baseVertex + (r + 1) * branchSegs;
      for (let s = 0; s < branchSegs; s++) {
        const next = (s + 1) % branchSegs;
        indices.push(rowA + s, rowB + next, rowB + s, rowA + s, rowA + next, rowB + next);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSculptedCanopyGeometry(seed: number, detailScale: number): THREE.BufferGeometry {
  const random = seededRandom(seed);
  // 5 tufos foliares sobrepostos formando uma copa frondosa orgânica
  const puffs = [
    { ox: 0, oy: 0.08, oz: 0, sx: 0.9, sy: 0.76, sz: 0.88 },
    { ox: -0.44, oy: -0.06, oz: 0.22, sx: 0.66, sy: 0.56, sz: 0.64 },
    { ox: 0.46, oy: -0.05, oz: 0.18, sx: 0.64, sy: 0.54, sz: 0.66 },
    { ox: -0.22, oy: -0.08, oz: -0.4, sx: 0.64, sy: 0.54, sz: 0.62 },
    { ox: 0.12, oy: 0.34, oz: -0.06, sx: 0.62, sy: 0.52, sz: 0.6 },
  ] as const;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const p1 = random() * 6.28;
  const p2 = random() * 6.28;
  const p3 = random() * 6.28;

  const welded = weldGeometry(new THREE.IcosahedronGeometry(1, 1));
  const vertCount = welded.positions.length / 3;

  for (let pIndex = 0; pIndex < puffs.length; pIndex++) {
    const puff = puffs[pIndex];
    const vertexOffset = positions.length / 3;
    const puffPhase = pIndex * 1.37;

    for (let i = 0; i < vertCount; i++) {
      const nx = welded.positions[i * 3];
      const ny = welded.positions[i * 3 + 1];
      const nz = welded.positions[i * 3 + 2];

      const leafBump =
        1 +
        0.13 * detailScale * Math.sin(nx * 4.2 + p1 + puffPhase) * Math.cos(nz * 4.2 + p2) +
        0.07 * detailScale * Math.sin(ny * 5.5 + p3);
      const flattenBottom = ny < -0.2 ? 0.74 : 1.0;

      const vx = puff.ox + nx * puff.sx * leafBump;
      const vy = puff.oy + ny * puff.sy * flattenBottom * leafBump;
      const vz = puff.oz + nz * puff.sz * leafBump;
      positions.push(vx, vy, vz);

      const heightFactor = THREE.MathUtils.clamp((vy + 0.65) / 1.45, 0, 1);
      const radialFactor = THREE.MathUtils.clamp(Math.hypot(vx, vz) / 1.05, 0, 1);
      const sunTint = 0.54 + heightFactor * 0.52 + radialFactor * 0.12 + (leafBump - 1) * 0.8;
      const rShade = sunTint * (0.94 + heightFactor * 0.14);
      const gShade = sunTint * (0.98 + heightFactor * 0.06);
      const bShade = sunTint * (0.88 - heightFactor * 0.08);
      colors.push(rShade, gShade, bShade);
    }

    for (let i = 0; i < welded.indices.length; i++) {
      indices.push(vertexOffset + welded.indices[i]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildRiverPalms(root: THREE.Group): void {
  const palmCount = 48;
  const random = seededRandom(61420);

  // Estipe (tronco) curvado e anelado da palmeira + capitel verde-oliva no topo
  const trunkSegs = 8;
  const trunkRings = 11;
  const tPos: number[] = [];
  const tCol: number[] = [];
  const tIdx: number[] = [];
  for (let r = 0; r <= trunkRings; r++) {
    const t = r / trunkRings;
    const y = t * 9.65;
    const curveX = Math.pow(Math.min(1, t * 1.05), 1.7) * 1.45;
    const isCrownshaft = r >= trunkRings - 1;
    const rad = isCrownshaft
      ? (r === trunkRings ? 0.05 : 0.28)
      : THREE.MathUtils.lerp(0.29, 0.14, t) * (1 + 0.08 * Math.sin(t * Math.PI * 18));
    for (let s = 0; s < trunkSegs; s++) {
      const a = (s / trunkSegs) * Math.PI * 2;
      tPos.push(curveX + Math.cos(a) * rad, y, Math.sin(a) * rad);
      const ringTone = 0.72 + 0.22 * t + 0.08 * Math.sin(t * Math.PI * 18);
      if (isCrownshaft) tCol.push(ringTone * 0.78, ringTone * 0.96, ringTone * 0.68);
      else tCol.push(ringTone, ringTone * 0.94, ringTone * 0.85);
    }
  }
  for (let r = 0; r < trunkRings; r++) {
    const rowA = r * trunkSegs;
    const rowB = (r + 1) * trunkSegs;
    for (let s = 0; s < trunkSegs; s++) {
      const next = (s + 1) % trunkSegs;
      tIdx.push(rowA + s, rowB + next, rowB + s, rowA + s, rowA + next, rowB + next);
    }
  }
  const palmTrunkGeo = new THREE.BufferGeometry();
  palmTrunkGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
  palmTrunkGeo.setAttribute('color', new THREE.Float32BufferAttribute(tCol, 3));
  palmTrunkGeo.setIndex(tIdx);
  palmTrunkGeo.computeVertexNormals();

  // Coroa de 9 folhas arqueadas em 3D no topo do estipe (x = 1.45, y = 9.5, z = 0)
  const cPos: number[] = [];
  const cCol: number[] = [];
  const cIdx: number[] = [];
  const frondCount = 9;
  const frondSteps = 8;
  for (let f = 0; f < frondCount; f++) {
    const yaw = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.14;
    const lift = f % 2 === 0 ? 0.35 : 0.15;
    const length = f % 2 === 0 ? 4.4 : 3.8;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const baseVertex = cPos.length / 3;

    for (let s = 0; s <= frondSteps; s++) {
      const t = s / frondSteps;
      const dist = t * length;
      const archY = Math.sin(t * Math.PI * 0.78) * (1.1 + lift) - Math.pow(t, 2.2) * 1.95;
      const halfWidth = Math.sin(Math.pow(t, 0.65) * Math.PI) * 0.68;
      const droopY = -halfWidth * 0.28;

      // 3 vértices por seção transversal: borda esquerda, nervura central elevada, borda direita
      const pts = [
        { lat: -halfWidth, dy: droopY, shade: 0.76 + t * 0.18 },
        { lat: 0, dy: 0.08, shade: 0.96 + t * 0.16 },
        { lat: halfWidth, dy: droopY, shade: 0.76 + t * 0.18 },
      ];
      for (const pt of pts) {
        const wx = 1.45 + cosY * dist - sinY * pt.lat;
        const wy = 9.45 + archY + pt.dy;
        const wz = sinY * dist + cosY * pt.lat;
        cPos.push(wx, wy, wz);
        cCol.push(pt.shade * 0.95, pt.shade * 1.04, pt.shade * 0.82);
      }
    }
    for (let s = 0; s < frondSteps; s++) {
      const rA = baseVertex + s * 3;
      const rB = baseVertex + (s + 1) * 3;
      cIdx.push(rA, rB, rA + 1, rA + 1, rB, rB + 1);
      cIdx.push(rA + 1, rB + 1, rA + 2, rA + 2, rB + 1, rB + 2);
    }
  }
  const palmCrownGeo = new THREE.BufferGeometry();
  palmCrownGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
  palmCrownGeo.setAttribute('color', new THREE.Float32BufferAttribute(cCol, 3));
  palmCrownGeo.setIndex(cIdx);
  palmCrownGeo.computeVertexNormals();

  const palmTrunks = new THREE.InstancedMesh(
    palmTrunkGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 }),
    palmCount,
  );
  const palmCrowns = new THREE.InstancedMesh(
    palmCrownGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide }),
    palmCount,
  );

  const dummy = new THREE.Object3D();
  const trunkColor = new THREE.Color();
  const crownColor = new THREE.Color();

  for (let i = 0; i < palmCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const distRatio = 0.05 + random() * 0.26;
    const x = side * (riverWaterEdge(side) + distRatio * 73);
    let z = -138 + random() * 276;
    if (isInsideCabinClearing(x, z)) {
      z = z < 5 ? -20 - random() * 18 : 28 + random() * 18;
    }
    const ground = riverbankHeight(distRatio, z);
    const scale = 0.78 + random() * 0.52;
    const yaw = (side < 0 ? 0 : Math.PI) + (random() - 0.5) * 1.1;

    dummy.position.set(x, ground - 0.15, z);
    dummy.rotation.set((random() - 0.5) * 0.08, yaw, (random() - 0.5) * 0.08);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();

    palmTrunks.setMatrixAt(i, dummy.matrix);
    palmCrowns.setMatrixAt(i, dummy.matrix);

    trunkColor.setHSL(0.08 + random() * 0.025, 0.28, 0.28 + random() * 0.08);
    crownColor.setHSL(0.26 + random() * 0.06, 0.48 + random() * 0.14, 0.36 + random() * 0.1);
    palmTrunks.setColorAt(i, trunkColor);
    palmCrowns.setColorAt(i, crownColor);
  }

  palmTrunks.instanceMatrix.needsUpdate = true;
  palmCrowns.instanceMatrix.needsUpdate = true;
  if (palmTrunks.instanceColor) palmTrunks.instanceColor.needsUpdate = true;
  if (palmCrowns.instanceColor) palmCrowns.instanceColor.needsUpdate = true;
  root.add(palmTrunks, palmCrowns);
}

function createWoodenCanoeGroup(wood: THREE.Material, darkWood: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const lengthSegs = 14;
  const profilePts = 7; // seção em U de bombordo a estibordo
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= lengthSegs; i++) {
    const u = i / lengthSegs;
    const x = (u - 0.5) * 6.2; // comprimento ao longo de X (paralelo à margem)
    const endFactor = Math.sin(u * Math.PI); // 0 na proa/popa, 1 no meio
    const halfBeam = Math.pow(endFactor, 0.72) * 0.68;
    const sheerLift = Math.pow(Math.abs(u - 0.5) * 2, 2.2) * 0.34;
    const keelY = -0.22 * endFactor + sheerLift * 0.35;
    const gunwaleY = 0.28 + sheerLift;

    for (let j = 0; j < profilePts; j++) {
      const v = (j / (profilePts - 1)) * 2 - 1; // -1 a +1
      const z = v * halfBeam;
      const y = THREE.MathUtils.lerp(keelY, gunwaleY, Math.pow(Math.abs(v), 1.55));
      positions.push(x, y, z);
    }
  }

  for (let i = 0; i < lengthSegs; i++) {
    const rA = i * profilePts;
    const rB = (i + 1) * profilePts;
    for (let j = 0; j < profilePts - 1; j++) {
      indices.push(rA + j, rB + j, rA + j + 1, rA + j + 1, rB + j, rB + j + 1);
    }
  }

  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hullGeo.setIndex(indices);
  hullGeo.computeVertexNormals();

  const hullMaterial = (wood as THREE.MeshStandardMaterial).clone();
  hullMaterial.side = THREE.DoubleSide;
  group.add(new THREE.Mesh(hullGeo, hullMaterial));

  // Três bancos transversais (thwarts)
  for (const [bx, bw] of [[-1.35, 0.92], [0, 1.22], [1.35, 0.92]] as const) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, bw), darkWood);
    seat.position.set(bx, 0.16, 0);
    group.add(seat);
  }

  // Remo de madeira apoiado dentro da canoa
  const paddle = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), darkWood);
  shaft.rotation.z = Math.PI / 2;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.18), wood);
  blade.position.x = 0.95;
  paddle.add(shaft, blade);
  paddle.position.set(0.2, 0.24, 0.12);
  paddle.rotation.set(0.15, 0.22, 0.08);
  group.add(paddle);

  return group;
}

function createTrafficStreamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 256);
    for (let i = 0; i < 18; i++) {
      const x = 14 + (i % 4) * 32;
      const y = (i * 37) % 220;
      const len = 18 + (i % 3) * 12;
      const grad = ctx.createLinearGradient(0, y, 0, y + len);
      const cyan = i % 2 === 0;
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, cyan ? 'rgba(57, 229, 239, 0.85)' : 'rgba(255, 71, 107, 0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, 3, len);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 6);
  return texture;
}

function buildOpenWorldCity(root: THREE.Group, textures: THREE.Texture[]): void {
  const random = seededRandom(4091);

  // Piso urbano reflexivo expandido + malha viária iluminada
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(245, 96),
    new THREE.MeshStandardMaterial({ color: 0x0a1320, roughness: 0.42, metalness: 0.48 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.18;
  root.add(floor);

  const grid = new THREE.GridHelper(380, 120, 0x2a869e, 0x132c42);
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.44;
  root.add(grid);

  // Anéis das rodovias orbitais e Praça Nexus central
  for (const [idx, r] of [26, 62, 114, 165].entries()) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, idx === 3 ? 0.22 : 0.12, 8, 128),
      new THREE.MeshBasicMaterial({
        color: idx === 0 ? 0xffca68 : idx === 3 ? 0xff476b : 0x39e5ef,
        transparent: true,
        opacity: idx === 3 ? 0.42 : 0.3,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    root.add(ring);
  }

  // Avenidas radiais Norte-Sul e Leste-Oeste com faixas de tráfego aéreo animadas
  const trafficTex = createTrafficStreamTexture();
  textures.push(trafficTex);
  const laneMat = new THREE.MeshBasicMaterial({
    map: trafficTex,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const rotY of [0, Math.PI / 2]) {
    for (const h of [0.25, 9.5, 21.5]) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(14, 310), laneMat);
      lane.rotation.x = -Math.PI / 2;
      lane.rotation.z = rotY;
      lane.position.y = h;
      root.add(lane);
    }
  }

  // Quarteirões internos navegáveis (64 edifícios nos 4 distritos) + 84 megatorres no horizonte externo
  const totalBuildings = 148;
  const buildingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.62,
  });
  const neonTrimMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), buildingMat, totalBuildings);
  const trims = new THREE.InstancedMesh(new THREE.BoxGeometry(1.03, 0.35, 1.03), neonTrimMat, totalBuildings * 2);

  const hullPalette = [0x162436, 0x1b2c42, 0x122030, 0x1f283d, 0x182b38].map((hex) => new THREE.Color(hex));
  const neonPalette = [0x39e5ef, 0xff476b, 0x70f0c2, 0xffca68, 0xb56cff].map((hex) => new THREE.Color(hex));
  const dummy = new THREE.Object3D();
  let bIdx = 0;
  let tIdx = 0;

  // 4 Distritos internos (deixando avenidas livres em |x| < 18 e |z| < 18 e ao redor dos sinalizadores de Task)
  const beaconZones: readonly [number, number][] = [
    [0, -38],
    [68, -22],
    [-66, -26],
    [52, 64],
    [-54, 62],
  ];

  const isNearAvenueOrBeacon = (x: number, z: number): boolean => {
    if (Math.abs(x) < 17 || Math.abs(z) < 17) return true;
    if (Math.hypot(x, z) < 30) return true;
    for (const [bx, bz] of beaconZones) {
      if (Math.hypot(x - bx, z - bz) < 15) return true;
    }
    return false;
  };

  for (let i = 0; i < 64; i++) {
    const quadrantX = i % 2 === 0 ? 1 : -1;
    const quadrantZ = i % 4 < 2 ? -1 : 1;
    let bx = quadrantX * (22 + random() * 112);
    let bz = quadrantZ * (22 + random() * 112);
    if (isNearAvenueOrBeacon(bx, bz)) {
      bx += quadrantX * 18;
      bz += quadrantZ * 18;
    }
    const w = 6.5 + random() * 7.5;
    const d = 6.5 + random() * 7.5;
    const h = 14 + random() * 32;
    dummy.position.set(bx, h * 0.5, bz);
    dummy.rotation.set(0, (Math.floor(random() * 4) * Math.PI) / 2, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    buildings.setMatrixAt(bIdx, dummy.matrix);
    buildings.setColorAt(bIdx, hullPalette[i % hullPalette.length]);

    for (const bandFactor of [0.55, 0.96]) {
      dummy.position.set(bx, h * bandFactor, bz);
      dummy.scale.set(w, 1, d);
      dummy.updateMatrix();
      trims.setMatrixAt(tIdx, dummy.matrix);
      trims.setColorAt(tIdx, neonPalette[(i + tIdx) % neonPalette.length]);
      tIdx++;
    }
    bIdx++;
  }

  // Anel externo monumental da Megacidade
  for (let i = 0; i < 84; i++) {
    const angle = (i / 84) * Math.PI * 2 + random() * 0.04;
    const dist = 174 + random() * 58;
    const bx = Math.cos(angle) * dist;
    const bz = Math.sin(angle) * dist;
    const w = 9 + random() * 12;
    const d = 9 + random() * 12;
    const h = 28 + random() * 68;
    dummy.position.set(bx, h * 0.5, bz);
    dummy.rotation.set(0, -angle, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    buildings.setMatrixAt(bIdx, dummy.matrix);
    buildings.setColorAt(bIdx, hullPalette[i % hullPalette.length]);

    dummy.position.set(bx, h * 0.94, bz);
    dummy.scale.set(w, 1, d);
    dummy.updateMatrix();
    trims.setMatrixAt(tIdx, dummy.matrix);
    trims.setColorAt(tIdx, neonPalette[i % neonPalette.length]);
    tIdx++;
    bIdx++;
  }

  buildings.count = bIdx;
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  trims.count = tIdx;
  trims.instanceMatrix.needsUpdate = true;
  if (trims.instanceColor) trims.instanceColor.needsUpdate = true;
  root.add(buildings, trims);

  // 6 Torres de Heliponto para a Task 03 (Sincronia de Helipontos)
  const helipadCoords: readonly [number, number, number][] = [
    [-68, 25, -54],
    [-26, 29, -82],
    [36, 31, -74],
    [82, 27, -14],
    [44, 30, 62],
    [-48, 26, 54],
  ];
  const padTowerMat = new THREE.MeshStandardMaterial({ color: 0x1b2d42, roughness: 0.4, metalness: 0.7 });
  const padRingMat = new THREE.MeshBasicMaterial({ color: 0x70f0c2 });
  for (const [hx, hy, hz] of helipadCoords) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.8, hy, 8), padTowerMat);
    tower.position.set(hx, hy * 0.5, hz);
    root.add(tower);
    const padDeck = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 6.2, 0.6, 16), padTowerMat);
    padDeck.position.set(hx, hy + 0.3, hz);
    root.add(padDeck);
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.14, 8, 32), padRingMat);
    padRing.rotation.x = Math.PI / 2;
    padRing.position.set(hx, hy + 0.65, hz);
    root.add(padRing);
  }

  // Pontes Suspensas / Arcos Neon sobre as Avenidas Centrais
  const archMat = new THREE.MeshStandardMaterial({ color: 0x233952, roughness: 0.35, metalness: 0.78 });
  const archGlowMat = new THREE.MeshBasicMaterial({ color: 0x39e5ef });
  for (const zPos of [-88, -46, 46, 88]) {
    const bridge = new THREE.Group();
    const span = new THREE.Mesh(new THREE.BoxGeometry(28, 1.2, 4.2), archMat);
    span.position.y = 21;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(28.2, 0.24, 4.4), archGlowMat);
    glow.position.y = 20.25;
    bridge.add(span, glow);
    bridge.position.set(0, 0, zPos);
    root.add(bridge);
  }
}


