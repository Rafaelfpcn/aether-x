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

function waterTexture(vertical = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar a textura local de água.');
  const gradient = context.createLinearGradient(0, 0, vertical ? 256 : 0, vertical ? 0 : 256);
  gradient.addColorStop(0, vertical ? '#b6dcda' : '#235963');
  gradient.addColorStop(0.52, vertical ? '#63aab0' : '#34727a');
  gradient.addColorStop(1, vertical ? '#e3f0e9' : '#1a4653');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 42; row++) {
    const base = (row / 42) * 256;
    context.beginPath();
    if (vertical) {
      context.moveTo(base, 0);
      for (let step = 0; step <= 8; step++) context.lineTo(base + Math.sin(step * 1.5 + row) * 5, step * 32);
    } else {
      context.moveTo(0, base);
      for (let step = 0; step <= 8; step++) context.lineTo(step * 32, base + Math.sin(step * 1.55 + row) * 4);
    }
    context.strokeStyle = row % 4 === 0 ? 'rgba(224, 248, 235, .22)' : 'rgba(164, 219, 213, .1)';
    context.lineWidth = row % 4 === 0 ? 1.5 : 0.7;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(vertical ? 1.2 : 2.8, vertical ? 2.8 : 10);
  return texture;
}

function addWater(root: THREE.Group, textures: THREE.Texture[], width: number, length: number, color: number, z = 0, y = -1.5): THREE.Mesh {
  const texture = waterTexture();
  textures.push(texture);
  const material = new THREE.MeshPhysicalMaterial({
    color, map: texture, metalness: 0.08, roughness: 0.28, clearcoat: 0.68,
    clearcoatRoughness: 0.18, side: THREE.DoubleSide,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, y, z);
  root.add(water);
  return water;
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
  addWater(root, textures, 76, 330, 0xc3d4c8, -7, -1.9);
  const bank = new THREE.MeshStandardMaterial({ color: 0x556b4c, roughness: 1, metalness: 0 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x75845a, roughness: 1, metalness: 0 });
  for (const side of [-1, 1]) {
    const shore = new THREE.Mesh(new THREE.BoxGeometry(54, 3, 340), bank);
    shore.position.set(side * 62, -2.1, -7);
    root.add(shore);
    for (let index = 0; index < 16; index++) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), index % 3 === 0 ? grass : bank);
      const x = side * (31 + (index % 4) * 3.1);
      const z = -116 + index * 14.2 + (side > 0 ? 5 : 0);
      rock.position.set(x, -0.1 + (index % 3) * 0.35, z);
      rock.scale.set(3.5 + (index % 3), 1.2 + (index % 2) * 0.9, 5 + (index % 4));
      root.add(rock);
    }
  }
  const cliff = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x596c56, roughness: 1 }));
  cliff.position.set(0, 10, -134);
  cliff.scale.set(100, 38, 18);
  root.add(cliff);
  const waterfallTexture = waterTexture(true);
  textures.push(waterfallTexture);
  const waterfall = new THREE.Mesh(new THREE.PlaneGeometry(53, 32), new THREE.MeshBasicMaterial({ color: 0xc6e2d9, map: waterfallTexture, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }));
  waterfall.position.set(0, 14.5, -119.1);
  root.add(waterfall);
  const waterfallEdges = new THREE.Mesh(new THREE.PlaneGeometry(68, 35), new THREE.MeshBasicMaterial({ color: 0x7e9985, transparent: true, opacity: 0.34, side: THREE.DoubleSide }));
  waterfallEdges.position.set(0, 15.2, -119.4);
  root.add(waterfallEdges);

  const random = seededRandom(2089);
  const count = 190;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.45, 0.72, 9, 7),
    new THREE.MeshStandardMaterial({ color: 0x473c2d, roughness: 1 }),
    count,
  );
  const canopy = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x49724c, roughness: 1 }),
    count,
  );
  const trunkColor = new THREE.Color();
  const canopyColor = new THREE.Color();
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (43 + random() * 53);
    const z = -144 + random() * 292;
    const scale = 0.7 + random() * 0.9;
    dummy.position.set(x, 2.5 * scale - 1.9, z);
    dummy.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.08);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunk.setMatrixAt(index, dummy.matrix);
    trunkColor.setHSL(0.09 + random() * 0.025, 0.27, 0.2 + random() * 0.08);
    trunk.setColorAt(index, trunkColor);
    dummy.position.set(x, 8.1 * scale - 1, z);
    dummy.rotation.set(random() * 0.08, random() * Math.PI, (random() - 0.5) * 0.1);
    dummy.scale.set(4.4 * scale, 5.1 * scale, 4.4 * scale);
    dummy.updateMatrix();
    canopy.setMatrixAt(index, dummy.matrix);
    canopyColor.setHSL(0.26 + random() * 0.08, 0.34 + random() * 0.2, 0.22 + random() * 0.13);
    canopy.setColorAt(index, canopyColor);
  }
  trunk.instanceMatrix.needsUpdate = true;
  canopy.instanceMatrix.needsUpdate = true;
  if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  root.add(trunk, canopy);

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
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc878 });
  for (const side of [-1, 1]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 1.7), windowMaterial);
    window.position.set(side * 3.66, 7, -1.4);
    cabin.add(window);
  }
  const dock = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 18), darkWood);
  dock.position.set(0, 3.8, -11);
  cabin.add(dock);
  for (let index = 0; index < 5; index++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.08, 0.18), wood);
    plank.position.set(0, 4.14, -18 + index * 3.2);
    cabin.add(plank);
  }
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
  drawRidge(445, 65, '#728b77', 3.5);
  drawRidge(480, 90, '#526f58', 1.8);
  drawRidge(516, 74, '#3d6049', 0.7);
  const distantForest = context.createLinearGradient(0, 410, 0, 625);
  distantForest.addColorStop(0, 'rgba(53, 88, 59, .72)');
  distantForest.addColorStop(0.7, 'rgba(43, 74, 51, .95)');
  distantForest.addColorStop(1, '#344f3b');
  context.fillStyle = distantForest;
  context.fillRect(0, 474, canvas.width, 176);
  for (let index = 0; index < 420; index++) {
    const x = random() * canvas.width;
    const base = 460 + random() * 170;
    const radius = 8 + random() * 26;
    const hue = 93 + random() * 30;
    const light = 20 + random() * 15;
    context.fillStyle = `hsl(${hue} 25% ${light}%)`;
    context.beginPath();
    context.ellipse(x, base, radius, radius * (0.72 + random() * 0.55), random() * 0.3, 0, Math.PI * 2);
    context.fill();
  }
  const falls = context.createLinearGradient(0, 400, 0, 637);
  falls.addColorStop(0, 'rgba(219, 232, 222, .12)');
  falls.addColorStop(0.18, 'rgba(225, 239, 230, .88)');
  falls.addColorStop(0.75, 'rgba(174, 211, 207, .9)');
  falls.addColorStop(1, 'rgba(221, 239, 228, .2)');
  context.fillStyle = falls;
  context.beginPath();
  context.moveTo(902, 423);
  context.quadraticCurveTo(1020, 397, 1146, 423);
  context.lineTo(1192, 613);
  context.quadraticCurveTo(1024, 647, 857, 613);
  context.closePath();
  context.fill();
  for (let index = 0; index < 54; index++) {
    const x = 884 + random() * 282;
    const top = 426 + random() * 13;
    context.beginPath();
    context.moveTo(x, top);
    context.bezierCurveTo(x - 10 + random() * 20, 500, x - 8 + random() * 16, 571, x + (random() - 0.5) * 18, 614 + random() * 15);
    context.strokeStyle = `rgba(242, 249, 239, ${0.08 + random() * 0.3})`;
    context.lineWidth = 1 + random() * 3;
    context.stroke();
  }
  const river = context.createLinearGradient(0, 610, 0, canvas.height);
  river.addColorStop(0, '#628a83');
  river.addColorStop(0.18, '#557d7a');
  river.addColorStop(1, '#315c60');
  context.fillStyle = river;
  context.fillRect(0, 610, canvas.width, canvas.height - 610);
  for (let index = 0; index < 100; index++) {
    const x = random() * canvas.width;
    const y = 626 + random() * 394;
    const length = 8 + random() * 85;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + (random() - 0.5) * 4);
    context.strokeStyle = `rgba(211, 230, 214, ${0.04 + random() * 0.17})`;
    context.lineWidth = 0.6 + random() * 1.3;
    context.stroke();
  }
  const haze = context.createLinearGradient(0, 420, 0, 670);
  haze.addColorStop(0, 'rgba(209, 226, 214, .36)');
  haze.addColorStop(0.48, 'rgba(209, 226, 214, .04)');
  haze.addColorStop(1, 'rgba(209, 226, 214, 0)');
  context.fillStyle = haze;
  context.fillRect(0, 420, canvas.width, 250);
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
