import * as THREE from 'three';
import type { CollisionWorld } from './collision';
import type { ScenarioEnvironment } from './missions';

export interface DestructibleProp {
  id: number;
  colliderId: number;
  kind: 'barrel' | 'crate' | 'container' | 'tree' | 'sign';
  mesh: THREE.Object3D;
  hp: number;
  alive: boolean;
  falling: boolean;
  fallAngle: number;
  fallAxisX: number;
  fallAxisZ: number;
  explosive: boolean;
}

export interface AnimatedVehicle {
  mesh: THREE.Object3D;
  axis: 'x' | 'z';
  speed: number;
  minCoord: number;
  maxCoord: number;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function addDestructibleBarrelCluster(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
  centers: readonly (readonly [number, number, number])[],
): void {
  const barrelGeo = new THREE.CylinderGeometry(0.62, 0.62, 1.65, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0xc9382b, roughness: 0.45, metalness: 0.55 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.5, metalness: 0.3 });
  const stripeGeo = new THREE.CylinderGeometry(0.64, 0.64, 0.28, 12);

  for (const [cx, cy, cz] of centers) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(barrelGeo, barrelMat);
    body.position.y = 0.82;
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.82;
    group.add(body, stripe);
    group.position.set(cx, cy, cz);
    root.add(group);

    const propId = destructibles.length + 1;
    const colId = collision.addCylinder(cx, cz, 0.9, cy, cy + 1.8, 'metal', propId);
    destructibles.push({
      id: propId,
      colliderId: colId,
      kind: 'barrel',
      mesh: group,
      hp: 18,
      alive: true,
      falling: false,
      fallAngle: 0,
      fallAxisX: 1,
      fallAxisZ: 0,
      explosive: true,
    });
  }
}

function addDestructibleTrees(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
  positions: readonly (readonly [number, number, number])[],
  charred = false,
): void {
  const trunkMat = new THREE.MeshStandardMaterial({
    color: charred ? 0x2b211b : 0x5c4028,
    roughness: 0.9,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: charred ? 0x4a3520 : 0x2d5a36,
    roughness: 0.82,
  });
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.46, 5.5, 8);
  const coneGeo1 = new THREE.ConeGeometry(2.4, 5.2, 9);
  const coneGeo2 = new THREE.ConeGeometry(1.8, 4.4, 9);

  for (const [tx, ty, tz] of positions) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.75;
    const c1 = new THREE.Mesh(coneGeo1, foliageMat);
    c1.position.y = 5.6;
    const c2 = new THREE.Mesh(coneGeo2, foliageMat);
    c2.position.y = 8.1;
    tree.add(trunk, c1, c2);
    tree.position.set(tx, ty, tz);
    root.add(tree);

    const propId = destructibles.length + 1;
    const colId = collision.addCylinder(tx, tz, 1.15, ty, ty + 9.5, 'wood', propId);
    destructibles.push({
      id: propId,
      colliderId: colId,
      kind: 'tree',
      mesh: tree,
      hp: 25,
      alive: true,
      falling: false,
      fallAngle: 0,
      fallAxisX: 1,
      fallAxisZ: 0,
      explosive: false,
    });
  }
}

function addWeatherParticles(
  root: THREE.Group,
  color: number,
  size: number,
  opacity: number,
  count = 260,
  weatherKind: 'rain' | 'snow' | 'sand' | 'ash' | 'fog' = 'rain',
): THREE.Points {
  const rand = seededRandom(count * 97 + color);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * 140;
    pos[i * 3 + 1] = rand() * 44;
    pos[i * 3 + 2] = (rand() - 0.5) * 140;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  root.add(pts);

  pts.userData.updateWeather = (dt: number) => {
    const positionAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const array = positionAttr.array as Float32Array;
    const speedY =
      weatherKind === 'snow' ? 6.5 : weatherKind === 'ash' ? 3.8 : weatherKind === 'sand' ? 4.5 : 36.0;
    const driftX =
      weatherKind === 'sand' ? 24.0 : weatherKind === 'snow' ? 3.0 : 4.5;
    for (let i = 0; i < count; i++) {
      let y = array[i * 3 + 1] - speedY * dt;
      let x = array[i * 3] + driftX * dt;
      if (y < 0) {
        y += 44;
      }
      if (x > 70) {
        x -= 140;
      }
      array[i * 3] = x;
      array[i * 3 + 1] = y;
    }
    positionAttr.needsUpdate = true;
  };

  return pts;
}

function buildSculptedTerrainMesh(
  size: number,
  segments: number,
  heightFn: (x: number, z: number) => number,
  lowColor: number,
  midColor: number,
  highColor: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color(lowColor);
  const cMid = new THREE.Color(midColor);
  const cHigh = new THREE.Color(highColor);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightFn(x, z);
    pos.setY(i, y);
    const t = Math.max(0, Math.min(1, (y + 2) / 24));
    if (t < 0.45) tmp.copy(cLow).lerp(cMid, t / 0.45);
    else tmp.copy(cMid).lerp(cHigh, (t - 0.45) / 0.55);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.06 }),
  );
}

/**
 * 1. SERRA DA NEBLINA (highlands)
 */
export function buildHighlandsScenery(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
): THREE.Object3D {
  const heightFn = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    const valley = Math.max(0, (r - 22) * 0.14);
    const hills =
      Math.sin(x * 0.045) * Math.cos(z * 0.045) * 3.8 +
      Math.sin(x * 0.09 + z * 0.07) * 1.4;
    return Math.max(-0.5, valley + hills * Math.min(1, r / 18));
  };
  collision.setTerrain(heightFn, -1.8);
  root.add(buildSculptedTerrainMesh(340, 84, heightFn, 0x3b593f, 0x4f6d4a, 0x6f786d));

  // Pinheiros instanciados nas encostas
  const rand = seededRandom(1103);
  const pineCount = 120;
  const trunkInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.38, 4.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x523a28, roughness: 0.9 }),
    pineCount,
  );
  const crownInst = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.3, 7.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x264a30, roughness: 0.82 }),
    pineCount,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < pineCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 28 + rand() * 95;
    const px = Math.cos(angle) * dist;
    const pz = Math.sin(angle) * dist;
    const py = heightFn(px, pz);
    const scale = 0.85 + rand() * 0.65;
    dummy.position.set(px, py + 2.2 * scale, pz);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    dummy.position.set(px, py + 5.8 * scale, pz);
    dummy.updateMatrix();
    crownInst.setMatrixAt(i, dummy.matrix);
    if (dist < 82) {
      collision.addCylinder(px, pz, 1.2 * scale, py, py + 9.2 * scale, 'wood');
    }
  }
  root.add(trunkInst, crownInst);

  // Cabanas de madeira e torre de rádio
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4b32, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x38281e, roughness: 0.75 });
  for (const [cx, cz] of [
    [-32, -28],
    [36, -18],
    [4, 42],
  ] as const) {
    const cy = heightFn(cx, cz);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.8, 5.2), woodMat);
    cabin.position.set(cx, cy + 1.9, cz);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2.4, 4), roofMat);
    roof.position.set(cx, cy + 4.9, cz);
    roof.rotation.y = Math.PI / 4;
    root.add(cabin, roof);
    collision.addBox(cx, cy + 2.4, cz, 3.3, 2.6, 2.7, 0, 'wood');
  }

  // Torre de rádio metálica no morro norte
  const towerY = heightFn(0, -64);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 2.2, 26, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xb84a39, metalness: 0.6, roughness: 0.4, wireframe: true }),
  );
  tower.position.set(0, towerY + 13, -64);
  root.add(tower);
  collision.addCylinder(0, -64, 1.8, towerY, towerY + 26, 'metal');

  addDestructibleTrees(root, collision, destructibles, [
    [-16, heightFn(-16, -20), -20],
    [20, heightFn(20, -14), -14],
    [-14, heightFn(-14, 24), 24],
    [22, heightFn(22, 28), 28],
  ]);

  return addWeatherParticles(root, 0xdce8ec, 0.42, 0.35, 180, 'fog');
}

/**
 * 2. FLORESTA EM INCÊNDIO (wildfire)
 */
export function buildWildfireScenery(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
): THREE.Object3D {
  const heightFn = (x: number, z: number): number =>
    Math.sin(x * 0.04) * Math.cos(z * 0.04) * 2.4 + Math.max(0, (Math.hypot(x, z) - 45) * 0.12);
  collision.setTerrain(heightFn, -2.5);
  root.add(buildSculptedTerrainMesh(340, 76, heightFn, 0x291c14, 0x3d281a, 0x543824));

  // Focos luminosos de incêndio
  const fireCoords: readonly (readonly [number, number, number])[] = [
    [-34, 4, -26],
    [28, 4, -30],
    [0, 4, 4],
    [-30, 4, 32],
    [34, 4, 26],
  ];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff9e2c,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
  });
  for (const [fx, , fz] of fireCoords) {
    const fy = heightFn(fx, fz);
    const core = new THREE.Mesh(new THREE.ConeGeometry(4.5, 8.5, 10), flameMat);
    core.position.set(fx, fy + 4.2, fz);
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 8.2, 14, 14, 1, true), glowMat);
    halo.position.set(fx, fy + 7, fz);
    root.add(core, halo);
  }

  // Árvores queimadas que tombam ao impacto
  const treeCoords: [number, number, number][] = [];
  const rand = seededRandom(5502);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rand() * 0.2;
    const d = 18 + rand() * 62;
    const tx = Math.cos(a) * d;
    const tz = Math.sin(a) * d;
    treeCoords.push([tx, heightFn(tx, tz), tz]);
  }
  addDestructibleTrees(root, collision, destructibles, treeCoords, true);
  addDestructibleBarrelCluster(root, collision, destructibles, [
    [-12, heightFn(-12, -16), -16],
    [16, heightFn(16, 14), 14],
  ]);

  return addWeatherParticles(root, 0xff9b42, 0.36, 0.65, 260, 'ash');
}

/**
 * 3. DESERTO E CÂNION ÁRIDO (desert)
 */
export function buildDesertScenery(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
): THREE.Object3D {
  const heightFn = (x: number, z: number): number => {
    const roadDist = Math.abs(x + z * 0.85);
    const canyonWall = roadDist > 26 ? Math.min(24, (roadDist - 26) * 0.55) : 0;
    const dunes = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 1.6;
    return Math.max(0, canyonWall + dunes);
  };
  collision.setTerrain(heightFn, -4);
  root.add(buildSculptedTerrainMesh(360, 84, heightFn, 0xb88652, 0xc99762, 0x9e5b36));

  // Mesas de arenito com colisão real
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0x9c5a38, roughness: 0.92 });
  const mesas: readonly (readonly [number, number, number, number, number])[] = [
    [-46, -24, 14, 22, 12],
    [48, 22, 16, 26, 14],
    [-42, 48, 12, 18, 12],
    [44, -48, 15, 24, 14],
    [0, -68, 18, 20, 12],
  ];
  for (const [mx, mz, rx, h, rz] of mesas) {
    const my = heightFn(mx, mz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(rx * 2, h, rz * 2), mesaMat);
    mesh.position.set(mx, my + h * 0.5, mz);
    root.add(mesh);
    collision.addBox(mx, my + h * 0.5, mz, rx, h * 0.5, rz, 0.2, 'rock');
  }

  addDestructibleBarrelCluster(root, collision, destructibles, [
    [-22, heightFn(-22, 18), 18],
    [20, heightFn(20, -14), -14],
    [38, heightFn(38, -30), -30],
  ]);

  return addWeatherParticles(root, 0xe6be8a, 0.38, 0.55, 280, 'sand');
}

/**
 * 4. COSTA COM FALÉSIAS E CARGUEIRO AO PÔR DO SOL (coast)
 */
export function buildCoastScenery(
  root: THREE.Group,
  textures: THREE.Texture[],
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
): THREE.Object3D {
  const heightFn = (x: number, z: number): number => {
    // Lado sul/oeste (z > 14) sobe suavemente em falésias costeiras; lado norte/leste é oceano aberto
    if (z > 14) {
      const t = Math.max(0, Math.min(1, (z - 14) / 38));
      const smooth = t * t * (3 - 2 * t);
      return -1.5 + smooth * (26 + Math.sin(x * 0.06) * 2.5);
    }
    return -1.5;
  };
  collision.setTerrain(heightFn, -1.2);
  root.add(buildSculptedTerrainMesh(360, 76, heightFn, 0xc2ab78, 0x5c7348, 0x6e685f));

  // Oceano Atlântico
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1e5670,
    roughness: 0.22,
    metalness: 0.65,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(380, 380), waterMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -1.2;
  root.add(ocean);
  void textures;

  // Farol nas falésias
  const lhX = -22;
  const lhZ = 38;
  const lhY = heightFn(lhX, lhZ);
  const lighthouse = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.6, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.5 }),
  );
  lighthouse.position.set(lhX, lhY + 9, lhZ);
  root.add(lighthouse);
  collision.addCylinder(lhX, lhZ, 2.6, lhY, lhY + 18, 'concrete');

  // Grande Navio Cargueiro ancorado em (0, -1, -46)
  const shipGroup = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(16, 7, 54),
    new THREE.MeshStandardMaterial({ color: 0x273642, roughness: 0.6, metalness: 0.4 }),
  );
  hull.position.set(0, 2.2, -46);
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(12, 10, 9),
    new THREE.MeshStandardMaterial({ color: 0xd9e2e8, roughness: 0.45 }),
  );
  bridge.position.set(0, 10.5, -64);
  shipGroup.add(hull, bridge);
  root.add(shipGroup);
  collision.addBox(0, 2.2, -46, 8, 3.6, 27, 0, 'metal');
  collision.addBox(0, 10.5, -64, 6, 5, 4.5, 0, 'metal');

  // Contêineres destrutíveis no convés do cargueiro
  const contColors = [0xc94a38, 0x2f6f9e, 0xd99b26];
  for (let i = 0; i < 6; i++) {
    const cx = (i % 2 === 0 ? -3.4 : 3.4);
    const cz = -32 - Math.floor(i / 2) * 10;
    const cy = 7.2;
    const cont = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 3.2, 8.2),
      new THREE.MeshStandardMaterial({ color: contColors[i % contColors.length], roughness: 0.55, metalness: 0.35 }),
    );
    cont.position.set(cx, cy, cz);
    root.add(cont);
    const propId = destructibles.length + 1;
    const colId = collision.addBox(cx, cy, cz, 2.6, 1.6, 4.1, 0, 'metal', propId);
    destructibles.push({
      id: propId,
      colliderId: colId,
      kind: 'container',
      mesh: cont,
      hp: 35,
      alive: true,
      falling: false,
      fallAngle: 0,
      fallAxisX: 1,
      fallAxisZ: 0,
      explosive: true,
    });
  }

  return addWeatherParticles(root, 0xffd2a6, 0.28, 0.3, 120);
}

/**
 * 5. MONTANHA NEVADA / BASE ÁRTICA (arctic)
 */
export function buildArcticScenery(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
): THREE.Object3D {
  const heightFn = (x: number, z: number): number => {
    const ridge = Math.sin(x * 0.038) * Math.cos(z * 0.038) * 4.5;
    const bowl = Math.max(0, (Math.hypot(x, z) - 42) * 0.22);
    return Math.max(0, ridge + bowl);
  };
  collision.setTerrain(heightFn, -1.0);
  root.add(buildSculptedTerrainMesh(360, 84, heightFn, 0xd8e6f2, 0xeaf2f8, 0x9ab0c2));

  // 4 Domos Geodésicos de Radar + Hangares Polares
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.35, metalness: 0.2 });
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x3b5c76, roughness: 0.5, metalness: 0.45 });
  const domeCoords: readonly (readonly [number, number])[] = [
    [-36, -30],
    [36, -28],
    [-32, 32],
    [34, 34],
  ];
  for (const [dx, dz] of domeCoords) {
    const dy = heightFn(dx, dz);
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(5.6, 2), domeMat);
    dome.position.set(dx, dy + 4.2, dz);
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 12), hangarMat);
    base.position.set(dx, dy + 1.5, dz);
    root.add(base, dome);
    collision.addSphere(dx, dy + 4.2, dz, 5.6, 'ice');
  }

  addDestructibleBarrelCluster(root, collision, destructibles, [
    [-14, heightFn(-14, 0), 0],
    [14, heightFn(14, 0), 0],
    [0, heightFn(0, -18), -18],
  ]);

  return addWeatherParticles(root, 0xffffff, 0.48, 0.78, 320, 'snow');
}

/**
 * 6. REFINARIA NOTURNA (refinery)
 */
export function buildRefineryScenery(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
): THREE.Object3D {
  collision.setTerrain(() => 0, -2.0);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.85, metalness: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  const tankMat = new THREE.MeshStandardMaterial({ color: 0x6e7880, roughness: 0.42, metalness: 0.68 });
  const stackMat = new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.5, metalness: 0.6 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7b24 });

  // Tanques cilíndricos industriais
  for (const [tx, tz] of [
    [-38, -32],
    [38, -32],
    [-38, 32],
    [38, 32],
    [0, -48],
    [0, 48],
  ] as const) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 13, 20), tankMat);
    tank.position.set(tx, 6.5, tz);
    root.add(tank);
    collision.addCylinder(tx, tz, 8.5, 0, 13, 'metal');
  }

  // Torres de destilação e chaminés com chamas no topo
  for (const [sx, sz] of [
    [-22, 0],
    [22, 0],
    [-18, -28],
    [18, 28],
  ] as const) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 28, 14), stackMat);
    stack.position.set(sx, 14, sz);
    const flare = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5.5, 10), flameMat);
    flare.position.set(sx, 30.5, sz);
    root.add(stack, flare);
    collision.addCylinder(sx, sz, 2.2, 0, 28, 'metal');
  }

  // Múltiplos conjuntos de barris explosivos para reação em cadeia
  addDestructibleBarrelCluster(root, collision, destructibles, [
    [-12, 0, -12],
    [12, 0, -12],
    [-12, 0, 12],
    [12, 0, 12],
    [0, 0, -22],
    [0, 0, 22],
  ]);

  return addWeatherParticles(root, 0xff8c3b, 0.32, 0.48, 200);
}

/**
 * Perfil topográfico suave dos morros da Mata Atlântica do Vale Atlântico.
 */
export function atlanticHillsHeight(x: number, z: number): number {
  const dx1 = (x + 115) / 60;
  const dz1 = (z + 120) / 60;
  const d2_1 = dx1 * dx1 + dz1 * dz1;
  const hill1 = d2_1 < 3.2 ? Math.cos(Math.sqrt(d2_1) * (Math.PI * 0.5 / 1.78)) * 42 : 0;

  const dx2 = (x + 55) / 45;
  const dz2 = (z + 145) / 45;
  const d2_2 = dx2 * dx2 + dz2 * dz2;
  const hill2 = d2_2 < 3.0 ? Math.cos(Math.sqrt(d2_2) * (Math.PI * 0.5 / 1.73)) * 32 : 0;

  return Math.max(0, hill1, hill2);
}

function buildAtlanticHills(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
): void {
  const geo = new THREE.PlaneGeometry(210, 190, 42, 38);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) - 105;
    const wz = pos.getZ(i) - 125;
    pos.setX(i, wx);
    pos.setZ(i, wz);
    const h = atlanticHillsHeight(wx, wz);
    pos.setY(i, h);
    const ratio = Math.min(1, h / 42);
    colors[i * 3 + 0] = 0.16 + ratio * 0.08;
    colors[i * 3 + 1] = 0.35 + ratio * 0.12;
    colors[i * 3 + 2] = 0.18 + ratio * 0.06;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const hillMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
  });
  const hillMesh = new THREE.Mesh(geo, hillMat);
  hillMesh.receiveShadow = true;
  root.add(hillMesh);

  // Farol Costeiro do Cabo (no promontório costeiro em x = -55, z = -145, y = 32)
  const lighthousY = 32;
  const lighthouse = new THREE.Group();
  lighthouse.position.set(-55, lighthousY, -145);

  const towerMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.45 });
  const redBandMat = new THREE.MeshStandardMaterial({ color: 0xb52b27, roughness: 0.45 });
  const darkIronMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.3, metalness: 0.8 });
  const lanternGlassMat = new THREE.MeshBasicMaterial({ color: 0xffea88 });

  const tower1 = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 5, 16), towerMat);
  tower1.position.y = 2.5;
  const band1 = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 4, 16), redBandMat);
  band1.position.y = 7;
  const tower2 = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.3, 4, 16), towerMat);
  tower2.position.y = 11;
  const band2 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 3, 16), redBandMat);
  band2.position.y = 14.5;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 16), darkIronMat);
  gallery.position.y = 16.2;
  const lanternRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12), lanternGlassMat);
  lanternRoom.position.y = 17.5;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), redBandMat);
  dome.position.y = 18.6;

  lighthouse.add(tower1, band1, tower2, band2, gallery, lanternRoom, dome);
  root.add(lighthouse);
  collision.addCylinder(-55, -145, 3.2, lighthousY, lighthousY + 19, 'concrete');

  // Árvores nas encostas da Mata Atlântica
  const hillTrees: [number, number, number][] = [
    [-100, atlanticHillsHeight(-100, -100), -100],
    [-115, atlanticHillsHeight(-115, -110), -110],
    [-85, atlanticHillsHeight(-85, -115), -115],
    [-130, atlanticHillsHeight(-130, -95), -95],
    [-95, atlanticHillsHeight(-95, -135), -135],
    [-75, atlanticHillsHeight(-75, -130), -130],
    [-65, atlanticHillsHeight(-65, -110), -110],
    [-120, atlanticHillsHeight(-120, -140), -140],
    [-145, atlanticHillsHeight(-145, -125), -125],
    [-70, atlanticHillsHeight(-70, -155), -155],
  ];
  addDestructibleTrees(root, collision, destructibles, hillTrees);
}

function buildAtlanticHarbor(root: THREE.Group, collision: CollisionWorld): void {
  // Doca principal de concreto (x: 84..114, z: -80..50)
  const dockMat = new THREE.MeshStandardMaterial({ color: 0x7a838b, roughness: 0.82, metalness: 0.18 });
  const dock = new THREE.Mesh(new THREE.BoxGeometry(32, 3.2, 136), dockMat);
  dock.position.set(98, 0.2, -15);
  dock.receiveShadow = true;
  root.add(dock);
  collision.addBox(98, 0.2, -15, 16, 1.6, 68, 0, 'concrete');

  // Quebra-mar de blocos maciços (x = 126, z: -95..75)
  const breakwaterMat = new THREE.MeshStandardMaterial({ color: 0x4f5860, roughness: 0.94, metalness: 0.1 });
  const breakwater = new THREE.Mesh(new THREE.BoxGeometry(10, 4.4, 172), breakwaterMat);
  breakwater.position.set(126, 0.7, -10);
  breakwater.receiveShadow = true;
  root.add(breakwater);
  collision.addBox(126, 0.7, -10, 5, 2.2, 86, 0, 'concrete');

  // Navio Cargueiro Porta-Contêineres ancorado ao lado da doca (x = 110, z = -12)
  const shipGroup = new THREE.Group();
  shipGroup.position.set(110, -0.6, -12);

  const hullRedMat = new THREE.MeshStandardMaterial({ color: 0x8a2323, roughness: 0.65 });
  const hullDarkMat = new THREE.MeshStandardMaterial({ color: 0x22272c, roughness: 0.55 });
  const shipBridgeMat = new THREE.MeshStandardMaterial({ color: 0xe0e6eb, roughness: 0.4 });

  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(12, 3.6, 74), hullRedMat);
  lowerHull.position.y = 0.8;
  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(13.4, 2.8, 74), hullDarkMat);
  upperHull.position.y = 3.6;

  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 6.7, 14, 3), hullDarkMat);
  bow.rotation.y = Math.PI;
  bow.position.set(0, 3.6, 42);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(11, 8.5, 10), shipBridgeMat);
  bridge.position.set(0, 7.8, -26);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 4.2, 8), hullRedMat);
  funnel.position.set(0, 13.2, -28);

  shipGroup.add(lowerHull, upperHull, bow, bridge, funnel);
  root.add(shipGroup);
  collision.addBox(110, 2.8, -12, 6.7, 4.5, 37, 0, 'metal');
  collision.addBox(110, 7.2, -38, 5.5, 4.5, 5, 0, 'metal');

  // Guindastes de Pórtico Portuário (Gantry Cranes) amarelados em x = 94, z = -36 e z = 16
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xdf8a14, roughness: 0.45, metalness: 0.55 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x232c33, roughness: 0.35 });

  for (const cz of [-36, 16]) {
    const craneGroup = new THREE.Group();
    craneGroup.position.set(94, 0, cz);

    for (const sx of [-4.5, 4.5]) {
      for (const sz of [-5.5, 5.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 26, 0.8), craneMat);
        leg.position.set(sx, 13, sz);
        craneGroup.add(leg);
      }
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(26, 2.2, 3.4), craneMat);
    beam.position.set(6, 26.5, 0);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 2.8), cabMat);
    cabin.position.set(8, 24.5, 0);

    craneGroup.add(beam, cabin);
    root.add(craneGroup);
    collision.addBox(94, 13, cz, 5, 13, 6, 0, 'metal');
    collision.addBox(100, 26.5, cz, 13, 1.2, 1.8, 0, 'metal');
  }

  // Pátio de Contêineres com InstancedMesh (x: 85..89, z: -68..44)
  const containerGeo = new THREE.BoxGeometry(6.2, 2.6, 2.5);
  const containerColors = [0x1f4e79, 0x8b262a, 0x1e6b42, 0xc86414];
  const containerMaterials = containerColors.map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.35 }),
  );
  const instancedContainers = containerMaterials.map(
    (mat) => new THREE.InstancedMesh(containerGeo, mat, 24),
  );
  const counts = [0, 0, 0, 0];
  const dummy = new THREE.Object3D();

  let cIdx = 0;
  for (const cz of [-68, -60, -52, 28, 36, 44]) {
    for (const cx of [85, 89]) {
      const tiers = (cIdx % 2) + 1;
      for (let t = 0; t < tiers; t++) {
        dummy.position.set(cx, 1.8 + t * 2.6 + 1.3, cz);
        dummy.rotation.y = 0;
        dummy.updateMatrix();
        const matIdx = cIdx % 4;
        instancedContainers[matIdx].setMatrixAt(counts[matIdx]++, dummy.matrix);
        collision.addBox(cx, 1.8 + t * 2.6 + 1.3, cz, 3.1, 1.3, 1.25, 0, 'metal');
        cIdx++;
      }
    }
  }

  instancedContainers.forEach((mesh, idx) => {
    mesh.count = counts[idx];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  });
}

/**
 * 7. CIDADE REALISTA DIURNA (metro) & MUNDO ABERTO REALISTA — METRÓPOLE VALE ATLÂNTICO (metro-open)
 * Planta totalmente distinta da Neo-Aether:
 * - Rio Atlântico cortando no eixo X (z entre -16 e +10) com Ponte Estaiada monumental
 * - Centro Financeiro (noroeste/nordeste) com torres de concreto e vidro reflexivo
 * - Parque Municipal com lago e árvores (sudoeste)
 * - Estádio Olímpico (sudeste)
 * - Morros da Mata Atlântica e Farol Costeiro (noroeste)
 * - Porto Mercantil, Quebra-mar, Navio Cargueiro, Guindastes e Contêineres (leste)
 * - Carros em movimento nas avenidas
 */
export function buildRealisticMetroScenery(
  root: THREE.Group,
  collision: CollisionWorld,
  destructibles: DestructibleProp[],
  vehicles: AnimatedVehicle[],
  openWorld: boolean,
): THREE.Object3D {
  collision.setTerrain((x, z) => {
    if (z > -16 && z < 8 && Math.abs(x) > 12) return -1.4;
    if (openWorld) {
      const h = atlanticHillsHeight(x, z);
      if (h > 0) return h;
      if (x > 118) return -2.2;
    }
    return 0;
  }, -2.2);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 460),
    new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.9, metalness: 0.08 }),
  );
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  if (openWorld) {
    buildAtlanticHills(root, collision, destructibles);
    buildAtlanticHarbor(root, collision);
  }

  // Rio Atlântico cortando a metrópole + Ponte Estaiada
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(440, 26),
    new THREE.MeshStandardMaterial({ color: 0x266582, roughness: 0.22, metalness: 0.55 }),
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, -0.08, -4);
  root.add(river);

  // Tabuleiro da Ponte Estaiada (x = 0, z = -22..14)
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x8c969e, roughness: 0.6, metalness: 0.3 });
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xe6edf2, roughness: 0.4, metalness: 0.25 });
  const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 44), deckMat);
  bridgeDeck.position.set(0, 6.5, -4);
  root.add(bridgeDeck);
  collision.addBox(0, 6.5, -4, 8, 0.8, 22, 0, 'concrete');

  // Mastro central da Ponte Estaiada
  for (const side of [-1, 1] as const) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.2, 34, 2.4), pylonMat);
    pylon.position.set(side * 7.2, 17, -4);
    root.add(pylon);
    collision.addBox(side * 7.2, 17, -4, 1.2, 17, 1.3, 0, 'concrete');
  }

  // Parque Municipal (Sudoeste: x = -72, z = 34)
  const parkLawn = new THREE.Mesh(
    new THREE.PlaneGeometry(68, 64),
    new THREE.MeshStandardMaterial({ color: 0x437346, roughness: 0.88 }),
  );
  parkLawn.rotation.x = -Math.PI / 2;
  parkLawn.position.set(-72, 0.05, 34);
  root.add(parkLawn);
  addDestructibleTrees(root, collision, destructibles, [
    [-62, 0, 22],
    [-82, 0, 26],
    [-70, 0, 44],
    [-58, 0, 48],
    [-86, 0, 42],
  ]);

  // Estádio Olímpico (Sudeste: x = 78, z = 62)
  if (openWorld) {
    const stadiumBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(28, 22, 14, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd8dfe6, roughness: 0.5, side: THREE.DoubleSide }),
    );
    stadiumBowl.position.set(78, 7, 62);
    const pitch = new THREE.Mesh(
      new THREE.CircleGeometry(21, 24),
      new THREE.MeshStandardMaterial({ color: 0x3b8c47, roughness: 0.8 }),
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(78, 0.12, 62);
    root.add(stadiumBowl, pitch);
    collision.addCylinder(78, 62, 26, 0, 14, 'concrete');
  }

  // Prédios de concreto e vidro reflexivo com colisão real
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.65, metalness: 0.2 });
  const glassTowerMat = new THREE.MeshStandardMaterial({ color: 0x4a708a, roughness: 0.22, metalness: 0.72 });
  const warmConcreteMat = new THREE.MeshStandardMaterial({ color: 0xb8afa4, roughness: 0.7, metalness: 0.15 });
  const mats = [concreteMat, glassTowerMat, warmConcreteMat];

  const rand = seededRandom(openWorld ? 9081 : 4012);
  const maxCoord = openWorld ? 132 : 76;
  const step = 28;
  let bIdx = 0;

  for (let gx = -maxCoord; gx <= maxCoord; gx += step) {
    for (let gz = -maxCoord; gz <= maxCoord; gz += step) {
      // Deixar livre o canal do rio (z em [-22, 14]), as avenidas (x ~ 0, x ~ 36) e o centro de pouso
      if (Math.hypot(gx, gz) < 24) continue;
      if (gz > -24 && gz < 14) continue;
      if (Math.abs(gx) < 14 || Math.abs(gx - 36) < 12) continue;
      // Deixar livre o Parque Sudoeste e o Estádio Sudeste
      if (gx < -38 && gz > 8 && gz < 66) continue;
      if (openWorld && Math.hypot(gx - 78, gz - 62) < 34) continue;
      // Deixar livre a Zona de Colinas e Farol da Mata Atlântica (gx < -38 e gz < -35)
      if (openWorld && gx < -38 && gz < -35) continue;
      // Deixar livre o Porto Mercantil e Doca Leste (gx > 70 e gz < 52)
      if (openWorld && gx > 70 && gz < 52) continue;

      const w = 9 + rand() * 7;
      const d = 9 + rand() * 7;
      const h = 14 + rand() * 34;
      const mat = mats[bIdx % mats.length];
      bIdx++;

      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      building.position.set(gx, h * 0.5, gz);
      root.add(building);
      collision.addBox(gx, h * 0.5, gz, w * 0.5, h * 0.5, d * 0.5, 0, 'concrete');
    }
  }

  // Veículos animados nas avenidas (Avenida Norte-Sul x=36 e Marginal do Rio z=16)
  const carGeo = new THREE.BoxGeometry(2.1, 1.3, 4.2);
  const carColors = [0xd93829, 0x2b6cb0, 0xe2e8f0, 0xd69e2e, 0x2d3748];
  const carCount = openWorld ? 16 : 8;
  for (let i = 0; i < carCount; i++) {
    const isZ = i % 2 === 0;
    const carMat = new THREE.MeshStandardMaterial({
      color: carColors[i % carColors.length],
      roughness: 0.35,
      metalness: 0.55,
    });
    const car = new THREE.Mesh(carGeo, carMat);
    if (isZ) {
      const zPos = -110 + (i / carCount) * 220;
      car.position.set(36 + (i % 4 === 0 ? 2.5 : -2.5), 0.7, zPos);
      vehicles.push({ mesh: car, axis: 'z', speed: i % 4 === 0 ? 14 : -14, minCoord: -120, maxCoord: 120 });
    } else {
      const xPos = -110 + (i / carCount) * 220;
      car.rotation.y = Math.PI / 2;
      car.position.set(xPos, 0.7, 16);
      vehicles.push({ mesh: car, axis: 'x', speed: 15, minCoord: -120, maxCoord: 120 });
    }
    root.add(car);
  }

  addDestructibleBarrelCluster(root, collision, destructibles, [
    [82, 0, -34],
    [-44, 0, -40],
  ]);

  return addWeatherParticles(root, 0xffffff, 0.22, 0.18, 80);
}

/**
 * Registra colisores físicos para os cenários existentes (city, harbor, skyline, dam, river, openworld)
 * para que a física de colisão, oclusão de projéteis e queda de destroços funcione em TODAS as fases do jogo.
 */
export function populateClassicColliders(
  environment: ScenarioEnvironment,
  collision: CollisionWorld,
): void {
  if (environment === 'city') {
    collision.setTerrain(() => -1.5, -2.0);
    const random = seededRandom(80989);
    for (let index = 0; index < 94; index++) {
      const angle = random() * Math.PI * 2;
      const distance = 98 + random() * 74;
      const width = 4.5 + random() * 7;
      const depth = width * (0.65 + random() * 0.45);
      const height = 14 + random() * 51;
      const bx = Math.cos(angle) * distance;
      const bz = Math.sin(angle) * distance;
      const byaw = -angle + random() * 0.4;
      collision.addBox(bx, height / 2 - 1, bz, width * 0.5, height * 0.5, depth * 0.5, byaw, 'glass');
    }
    for (let index = 0; index < 24; index++) {
      const angle = (index / 24) * Math.PI * 2;
      const radius = 88;
      collision.addBox(Math.cos(angle) * radius, 1.7, Math.sin(angle) * radius, 0.1, 1.75, 0.225, -angle, 'metal');
    }
    return;
  }

  if (environment === 'harbor') {
    collision.setTerrain(() => -2.4, -2.4);
    // Coordenadas exatas de buildHarbor em src/scenery.ts
    for (const side of [-1, 1] as const) {
      collision.addBox(side * 57, -0.9, 4, 27, 1.0, 13.5, 0, 'concrete');
      collision.addBox(side * 55, 6.5, -9, 17, 6.5, 12, 0, 'metal');
      collision.addCylinder(side * 72, -42, 2.2, 0, 38, 'metal');
    }
    return;
  }

  if (environment === 'skyline') {
    collision.setTerrain(() => -1.7, -12);
    // Coordenadas exatas dos prédios laterais de buildSkyline (corredor central [-37, 37] 100% livre)
    const random = seededRandom(5306);
    for (let index = 0; index < 36; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const z = -120 + row * 13.5 + random() * 5;
      const width = 11 + random() * 8;
      const depth = 10 + random() * 8;
      const height = 38 + random() * 56;
      const x = side * (48 + random() * 18);
      const yaw = random() * 0.22 * side;
      collision.addBox(x, height / 2 - 2, z, width * 0.5, height * 0.5, depth * 0.5, yaw, 'glass');
    }
    return;
  }

  if (environment === 'dam') {
    collision.setTerrain(() => -2.6, -2.6);
    // Paredão real da represa em z = -112 e torres de comporta em z = -111 (buildDam em src/scenery.ts)
    collision.addBox(0, 20, -112, 95, 25, 8.5, 0, 'concrete');
    for (const x of [-66, -22, 22, 66] as const) {
      collision.addBox(x + (x < 0 ? -14 : 14), 24, -111, 3.5, 29, 4, 0, 'concrete');
    }
    return;
  }

  if (environment === 'river') {
    // Relevo suave das margens de buildRiver (água entre x = -47 e x = +33, subindo suavemente até ~2.1m)
    collision.setTerrain((x, z) => {
      const edge = x >= 0 ? 33 : 47;
      const dist = Math.abs(x) - edge;
      if (dist <= 0) return -1.9;
      const u = Math.min(1, dist / 73);
      const beach = u < 0.12 ? u / 0.12 : 1;
      const slope = u < 0.1 ? 0 : Math.min(1, (u - 0.1) / 0.72);
      return -1.8 + beach * 1.6 + slope * (2.3 + Math.sin(z * 0.043 + u * 12) * 0.8);
    }, -1.9);
    // Paredão rochoso real da cachoeira em z = -138 (deixando o rio e a bacia de espuma totalmente navegáveis)
    collision.addBox(0, 12, -138, 68, 14.5, 5.5, 0, 'rock');
    // Promontórios laterais em x = ±44, z = -125
    collision.addSphere(-44, 8, -125, 9.5, 'rock');
    collision.addSphere(44, 8, -125, 9.5, 'rock');
    // Cabana real na margem direita em (44, 5, -42), alinhada à cena de buildRiver.
    collision.addBox(44, 5.2, -42, 4.8, 5.2, 5.1, 0, 'wood');
    return;
  }

  if (environment === 'openworld') {
    collision.setTerrain(() => 0, -1.5);
    const random = seededRandom(4091);
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

    // 64 distritos internos
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
      const yaw = (Math.floor(random() * 4) * Math.PI) / 2;
      collision.addBox(bx, h * 0.5, bz, w * 0.5, h * 0.5, d * 0.5, yaw, 'glass');
    }

    // 84 megatorres no anel externo monumental
    for (let i = 0; i < 84; i++) {
      const angle = (i / 84) * Math.PI * 2 + random() * 0.04;
      const dist = 174 + random() * 58;
      const bx = Math.cos(angle) * dist;
      const bz = Math.sin(angle) * dist;
      const w = 9 + random() * 12;
      const d = 9 + random() * 12;
      const h = 28 + random() * 68;
      collision.addBox(bx, h * 0.5, bz, w * 0.5, h * 0.5, d * 0.5, -angle, 'glass');
    }

    // 6 Torres de Heliponto para Task 03
    const helipadCoords: readonly [number, number, number][] = [
      [-68, 25, -54],
      [-26, 29, -82],
      [36, 31, -74],
      [82, 27, -14],
      [44, 30, 62],
      [-48, 26, 54],
    ];
    for (const [hx, hy, hz] of helipadCoords) {
      collision.addCylinder(hx, hz, 6.2, 0, hy + 0.6, 'concrete');
    }

    // 4 Pontes Suspensas sobre Avenidas Centrais
    for (const zPos of [-88, -46, 46, 88]) {
      collision.addBox(0, 21, zPos, 14, 0.6, 2.1, 0, 'metal');
    }
  }
}
