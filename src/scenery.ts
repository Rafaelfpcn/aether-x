import * as THREE from 'three';
import type { ScenarioEnvironment } from './missions';

export interface SceneryLayer {
  root: THREE.Group;
  animatedTextures: THREE.Texture[];
  followCamera?: THREE.Object3D;
}

export function buildScenarioScenery(environment: Exclude<ScenarioEnvironment, 'city'>): SceneryLayer {
  const root = new THREE.Group();
  const animatedTextures: THREE.Texture[] = [];
  let followCamera: THREE.Object3D | undefined;
  if (environment === 'harbor') buildHarbor(root, animatedTextures);
  else if (environment === 'skyline') buildSkyline(root);
  else if (environment === 'dam') buildDam(root, animatedTextures);
  else followCamera = buildRiver(root, animatedTextures);
  return { root, animatedTextures, followCamera };
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
    color, map: texture, metalness: river ? 0.02 : 0.08, roughness: river ? 0.22 : 0.28, clearcoat: river ? 0.92 : 0.68,
    clearcoatRoughness: river ? 0.12 : 0.18, side: THREE.DoubleSide,
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
  const columns = 72;
  const rows = 12;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const random = seededRandom(9238);
  const stone = new THREE.Color(0x606b5b);
  const moss = new THREE.Color(0x52634c);
  const color = new THREE.Color();

  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const x = -72 + u * 144;
      const ledge = 25 + Math.sin(x * 0.075) * 3.5 + Math.sin(x * 0.19) * 1.2;
      const y = ledge * (1 - v) - 9 * v + Math.sin(x * 0.14 + row * 0.8) * 0.42;
      const z = -133 + Math.sin(x * 0.082) * 2.3 + Math.sin(row * 0.72 + x * 0.045) * 0.75;
      positions.push(x, y, z);
      color.copy(stone).lerp(moss, THREE.MathUtils.smoothstep(y, 12, 27) * 0.6);
      color.multiplyScalar(0.82 + random() * 0.3);
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
  const containerMaterials = [0x713e37, 0x31515b, 0x7a6542, 0x354448].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.36 }));
  const deckGeometry = new THREE.BoxGeometry(54, 2, 27);
  for (const side of [-1, 1]) {
    const pier = new THREE.Mesh(deckGeometry, concrete);
    pier.position.set(side * 57, -0.9, 4);
    root.add(pier);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const container = new THREE.Mesh(new THREE.BoxGeometry(10.5, 5.1 + ((row + column) % 2) * 1.6, 5.6), containerMaterials[(row * 3 + column + (side > 0 ? 1 : 0)) % containerMaterials.length]);
        container.position.set(side * (43 + column * 12), 2.5 + row * 5.4, -18 + row * 9);
        root.add(container);
        const ribs = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.2, 5.7), new THREE.MeshStandardMaterial({ color: 0x9a9d8f, metalness: 0.54, roughness: 0.48 }));
        ribs.position.set(container.position.x - side * 4.7, container.position.y, container.position.z);
        root.add(ribs);
      }
    }
    const craneMaterial = new THREE.MeshStandardMaterial({ color: 0x594e3d, metalness: 0.74, roughness: 0.38 });
    const crane = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.8, 38, 2.2), craneMaterial);
    mast.position.y = 18;
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2, 36), craneMaterial);
    boom.position.set(0, 37, -13);
    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 7), darkConcrete);
    counterweight.position.set(0, 32, 16);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.22, 16, 0.22), new THREE.MeshBasicMaterial({ color: 0xabbaad }));
    cable.position.set(0, 28, -24);
    crane.add(mast, boom, counterweight, cable);
    crane.position.set(side * 72, 0, -42);
    crane.rotation.y = side * 0.13;
    root.add(crane);
    for (let index = 0; index < 5; index++) {
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 8, 8), darkConcrete);
      piling.position.set(side * (38 + index * 9), -4, 23);
      root.add(piling);
    }
  }
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
  const dockLights = new THREE.MeshBasicMaterial({ color: 0xf2bc6f });
  for (const side of [-1, 1]) {
    for (let index = 0; index < 7; index++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), dockLights);
      lamp.position.set(side * 39, 0.28, -50 + index * 16);
      root.add(lamp);
    }
  }
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
  for (const x of [-66, -22, 22, 66]) {
    const portal = new THREE.Mesh(new THREE.BoxGeometry(21, 31, 3.5), inset);
    portal.position.set(x, 12.5, -102.1);
    root.add(portal);
    const waterTextureMap = waterTexture(true);
    textures.push(waterTextureMap);
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 28), new THREE.MeshBasicMaterial({ color: 0x9ac7c3, map: waterTextureMap, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
    spill.position.set(x, 12.5, -100.1);
    root.add(spill);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 58, 8), concrete);
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
  const shorelineRockGeometry = new THREE.DodecahedronGeometry(1, 1);
  const shorelineRocks = rockMaterials.map((material) => new THREE.InstancedMesh(shorelineRockGeometry, material, 26));
  const rockCounts = [0, 0, 0];
  const shorelineRandom = seededRandom(51081);
  const rockDummy = new THREE.Object3D();
  for (let index = 0; index < 76; index++) {
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
  for (const rocks of shorelineRocks) {
    rocks.instanceMatrix.needsUpdate = true;
    root.add(rocks);
  }

  const cliffMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 });
  const cliff = new THREE.Mesh(createRiverCliffGeometry(), cliffMaterial);
  cliff.receiveShadow = true;
  root.add(cliff);
  for (const side of [-1, 1]) {
    const outcrop = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rockMaterials[side < 0 ? 0 : 2]);
    outcrop.position.set(side * 42, 8 + (side < 0 ? 0 : 3), -127);
    outcrop.scale.set(28, 16, 9);
    root.add(outcrop);
  }
  const waterfallTexture = waterTexture(true);
  textures.push(waterfallTexture);
  waterfallTexture.repeat.set(1.2, 2.5);
  for (const [x, width, height, opacity] of [[-20, 12, 28, 0.62], [-7, 16, 33, 0.76], [10, 14, 30, 0.7], [23, 9, 24, 0.54]] as const) {
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height, 4, 10),
      new THREE.MeshBasicMaterial({ color: 0xd8eae0, map: waterfallTexture, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
    );
    sheet.position.set(x, 12.8 + height * 0.04, -129.2 + Math.abs(x) * 0.025);
    root.add(sheet);
  }
  const waterfallFoam = new THREE.Mesh(
    new THREE.CircleGeometry(15, 48),
    new THREE.MeshBasicMaterial({ color: 0xe1eee2, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }),
  );
  waterfallFoam.rotation.x = -Math.PI / 2;
  waterfallFoam.position.set(0, -1.76, -112.5);
  root.add(waterfallFoam);

  const random = seededRandom(2089);
  const count = 190;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.035, 0.08, 1, 7),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    count,
  );
  const canopy = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    count,
  );
  const canopyLower = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    count,
  );
  const canopyUpper = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    count,
  );
  const undergrowth = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    240,
  );
  const trunkColor = new THREE.Color();
  const canopyColor = new THREE.Color();
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (riverWaterEdge(side) + 10 + random() * 53);
    const z = -144 + random() * 292;
    const scale = 0.7 + random() * 0.9;
    const ground = riverbankHeight((Math.abs(x) - riverWaterEdge(side)) / 73, z);
    dummy.position.set(x, ground + 5.5 * scale, z);
    dummy.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.08);
    dummy.scale.set(0.78 * scale, 11 * scale, 0.78 * scale);
    dummy.updateMatrix();
    trunk.setMatrixAt(index, dummy.matrix);
    trunkColor.setHSL(0.09 + random() * 0.025, 0.27, 0.2 + random() * 0.08);
    trunk.setColorAt(index, trunkColor);
    dummy.position.set(x, ground + 9.2 * scale, z);
    dummy.rotation.set(random() * 0.08, random() * Math.PI, (random() - 0.5) * 0.1);
    dummy.scale.set(5.3 * scale, 4.6 * scale, 5.1 * scale);
    dummy.updateMatrix();
    canopy.setMatrixAt(index, dummy.matrix);
    canopyColor.setHSL(0.27 + random() * 0.075, 0.38 + random() * 0.18, 0.22 + random() * 0.11);
    canopy.setColorAt(index, canopyColor);
    dummy.position.set(x + side * 2.2 * scale, ground + 7.8 * scale, z + 1.9 * scale);
    dummy.rotation.set(random() * 0.12, random() * Math.PI, random() * 0.1);
    dummy.scale.set(4.2 * scale, 3.5 * scale, 4.8 * scale);
    dummy.updateMatrix();
    canopyLower.setMatrixAt(index, dummy.matrix);
    canopyLower.setColorAt(index, canopyColor.clone().multiplyScalar(0.82));
    dummy.position.set(x - side * 1.5 * scale, ground + 12.8 * scale, z - 1.2 * scale);
    dummy.rotation.set(random() * 0.14, random() * Math.PI, random() * 0.12);
    dummy.scale.set(3.5 * scale, 3.9 * scale, 3.6 * scale);
    dummy.updateMatrix();
    canopyUpper.setMatrixAt(index, dummy.matrix);
    canopyUpper.setColorAt(index, canopyColor.clone().multiplyScalar(1.12));
  }
  const undergrowthRandom = seededRandom(98312);
  for (let index = 0; index < 240; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const distance = 0.12 + undergrowthRandom() * 0.46;
    const z = -164 + undergrowthRandom() * 315;
    const x = side * (riverWaterEdge(side) + distance * 73);
    const size = 0.9 + undergrowthRandom() * 2.2;
    dummy.position.set(x, riverbankHeight(distance, z) + size * 0.42, z);
    dummy.rotation.set(undergrowthRandom() * 0.2, undergrowthRandom() * Math.PI, undergrowthRandom() * 0.16);
    dummy.scale.set(size * 1.45, size * 0.92, size * 1.3);
    dummy.updateMatrix();
    undergrowth.setMatrixAt(index, dummy.matrix);
    canopyColor.setHSL(0.25 + undergrowthRandom() * 0.12, 0.34 + undergrowthRandom() * 0.22, 0.18 + undergrowthRandom() * 0.13);
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

  const cabin = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x76543d, roughness: 0.9, metalness: 0.02 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x49392e, roughness: 0.94 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x46504a, roughness: 0.72, metalness: 0.18 });
  for (const x of [-3, 3]) for (const z of [-2.3, 2.3]) {
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
  const roofLeft = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.46, 8), roof);
  roofLeft.position.set(-1.9, 10, -0.55);
  roofLeft.rotation.z = -0.52;
  const roofRight = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.46, 8), roof);
  roofRight.position.set(1.9, 10, -0.55);
  roofRight.rotation.z = 0.52;
  cabin.add(roofLeft, roofRight);
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 8.5, 8), darkWood);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, 11.84, -0.55);
  cabin.add(ridge);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.8, 1.35), darkWood);
  chimney.position.set(1.75, 11.55, 1.25);
  cabin.add(chimney);
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.3, 1.7), roof);
  chimneyCap.position.set(1.75, 13.5, 1.25);
  cabin.add(chimneyCap);
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
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc878 });
  for (const side of [-1, 1]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 1.7), windowMaterial);
    window.position.set(side * 3.66, 7, -1.4);
    cabin.add(window);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.62, 1.98), darkWood);
    frame.position.set(side * 3.63, 7, -1.4);
    cabin.add(frame);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.28, 1.62), windowMaterial);
    glass.position.set(side * 3.73, 7, -1.4);
    cabin.add(glass);
  }
  const dock = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 18), darkWood);
  dock.position.set(0, 3.8, -11);
  cabin.add(dock);
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
  const canoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 5.2, 4, 10), new THREE.MeshStandardMaterial({ color: 0x704d36, roughness: 0.64, metalness: 0.04 }));
  canoe.rotation.z = Math.PI / 2;
  canoe.position.set(0, 0.05, -21);
  cabin.add(canoe);
  cabin.add(new THREE.PointLight(0xffb65f, 4.2, 28, 2).translateY(7.1));
  cabin.position.set(50, -1.9, 10);
  cabin.rotation.y = Math.PI / 2;
  root.add(cabin);

  const sprayGeometry = new THREE.BufferGeometry();
  const spray = new Float32Array(600 * 3);
  for (let index = 0; index < 600; index++) {
    spray[index * 3] = (random() - 0.5) * 42;
    spray[index * 3 + 1] = 0.2 + random() * 21;
    spray[index * 3 + 2] = -115 + (random() - 0.5) * 12;
  }
  sprayGeometry.setAttribute('position', new THREE.BufferAttribute(spray, 3));
  root.add(new THREE.Points(sprayGeometry, new THREE.PointsMaterial({ color: 0xe0eee5, size: 0.3, transparent: true, opacity: 0.52, depthWrite: false })));
  root.add(new THREE.HemisphereLight(0xc0ded4, 0x51634a, 0.65));
  const sun = new THREE.DirectionalLight(0xffe6bd, 1.1);
  sun.position.set(-25, 55, 35);
  root.add(sun);
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
