import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadModule(entry) {
  const result = await build({
    entryPoints: [path.join(projectRoot, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    minify: true,
  });
  const source = result.outputFiles[0]?.text;
  assert.ok(source, `bundle ausente para ${entry}`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(url);
}

const [missions, physics, states, storage, droneModel, collision, objectives, quality, styleProfile, sceneryRealistic, hangar] = await Promise.all([
  loadModule('src/missions.ts'),
  loadModule('src/physics.ts'),
  loadModule('src/state.ts'),
  loadModule('src/storage.ts'),
  loadModule('src/drone-model.ts'),
  loadModule('src/collision.ts'),
  loadModule('src/objectives.ts'),
  loadModule('src/quality.ts'),
  loadModule('src/style-profile.ts'),
  loadModule('src/scenery-realistic.ts'),
  loadModule('src/hangar.ts'),
]);

test('campanha contém oito missões sequenciais e os modos Rio e Mundo Aberto ficam fora da progressão linear', () => {
  assert.equal(missions.MISSIONS.length, 8);
  assert.deepEqual(missions.MISSIONS.map((mission) => mission.index), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(missions.MISSIONS.map((mission) => mission.id), ['training', 'intercept', 'sentinel', 'harbor', 'skyline', 'canyon', 'blackout', 'dam']);
  assert.deepEqual(missions.MISSIONS.map((mission) => mission.objectiveKind), ['gates', 'kills', 'boss', 'kills', 'gates', 'kills', 'kills', 'boss']);
  assert.deepEqual(missions.MISSIONS.map((mission) => mission.objectiveTarget), [6, 6, 1, 8, 6, 8, 9, 1]);
  assert.equal(missions.missionIdAt(7), 'dam');
  assert.equal(missions.missionIdAt(8), null);
  assert.throws(() => missions.missionById('missing'));
  const intercept = missions.missionById('intercept');
  assert.equal(intercept.enemyWave.length, intercept.objectiveTarget);
  assert.deepEqual([...new Set(intercept.enemyWave)], ['scout', 'swarmer', 'gunner', 'bulwark']);
  const canyon = missions.missionById('canyon');
  assert.ok(canyon.enemyWave.includes('sniper') && canyon.enemyWave.includes('swarmer'));
  assert.deepEqual([1, 2, 3].map((phase) => missions.bossPatternForPhase(missions.missionById('sentinel').bossPatterns, phase)), ['volley', 'fan', 'charge']);
  assert.deepEqual([1, 2, 3].map((phase) => missions.bossPatternForPhase(missions.missionById('dam').bossPatterns, phase)), ['fan', 'charge', 'volley']);
  assert.deepEqual(new Set(missions.MISSIONS.map((mission) => mission.environment)), new Set(['city', 'harbor', 'skyline', 'river', 'dam']));
  assert.equal(missions.RIVER_MODE.id, 'river');
  assert.equal(missions.RIVER_MODE.environment, 'river');
  assert.equal(missions.RIVER_MODE.objectiveTarget, missions.RIVER_MODE.enemyWave.length);
  assert.ok(missions.RIVER_STYLE_CONFIGS.realistic && missions.RIVER_STYLE_CONFIGS.futuristic);
  assert.equal(missions.OPEN_WORLD_MODE.id, 'openworld');
  assert.equal(missions.OPEN_WORLD_MODE.environment, 'openworld');
  assert.equal(missions.OPEN_WORLD_TASKS.length, 5);
  assert.equal(missions.openWorldTaskById('ow-overlord')?.kind, 'boss');
});

test('câmera de perseguição abre o enquadramento com velocidade e oferece uma vista mais próxima', () => {
  const stopped = physics.cameraFollowProfile(0);
  const fast = physics.cameraFollowProfile(42);
  const close = physics.cameraFollowProfile(42, true);
  assert.ok(fast.distance > stopped.distance);
  assert.ok(fast.fieldOfView > stopped.fieldOfView);
  assert.ok(close.distance < fast.distance);
  assert.ok(close.height < fast.height);
  assert.ok(close.lookAhead < fast.lookAhead);
});

test('reforços só entram quando há espaço no combate e o intervalo terminou', () => {
  assert.equal(physics.reinforcementBatchSize(3, 5, 0), 0);
  assert.equal(physics.reinforcementBatchSize(2, 5, 0.1), 0);
  assert.equal(physics.reinforcementBatchSize(2, 5, 0), 2);
  assert.equal(physics.reinforcementBatchSize(1, 1, 0), 1);
  assert.equal(physics.reinforcementBatchSize(0, 0, 0), 0);
});

test('amortecimento produz o mesmo fator ao longo de um segundo em 30 e 120 FPS', () => {
  const dampedAt = (steps) => {
    const velocity = { x: 100, multiplyScalar(amount) { this.x *= amount; return this; } };
    for (let i = 0; i < steps; i++) physics.applyFrameIndependentDamping(velocity, 1.35, 1 / steps);
    return velocity.x;
  };
  const expected = 100 * Math.exp(-1.35);
  assert.ok(Math.abs(dampedAt(30) - expected) < 1e-9);
  assert.ok(Math.abs(dampedAt(120) - expected) < 1e-9);
});

test('colisão por segmento detecta projétil rápido e limita a projeção ao segmento', () => {
  const point = { x: 5, y: 0, z: 0 };
  assert.equal(physics.pointToSegmentDistanceSquared(point, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), 0);
  assert.equal(physics.pointToSegmentDistanceSquared({ x: 5, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), 4);
  assert.equal(physics.pointToSegmentDistanceSquared({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), 25);
  assert.equal(physics.pointToSegmentDistanceSquared({ x: -2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), 4);
  const relativeStart = { x: -5, y: 5, z: 0 };
  const relativeEnd = { x: 5, y: -5, z: 0 };
  assert.equal(physics.pointToSegmentDistanceSquared({ x: 0, y: 0, z: 0 }, relativeStart, relativeEnd), 0);
});

test('classificação de projétil distingue impacto, esquiva próxima e passagem segura', () => {
  const { classifyProjectilePass, pointToSegmentDistanceSquared } = physics;
  const start = { x: -80, y: 0, z: 0 };
  const end = { x: 80, y: 0, z: 0 };
  const direct = pointToSegmentDistanceSquared({ x: 0, y: 0, z: 0 }, start, end);
  const close = pointToSegmentDistanceSquared({ x: 0, y: 4, z: 0 }, start, end);
  const safe = pointToSegmentDistanceSquared({ x: 0, y: 8, z: 0 }, start, end);
  assert.equal(classifyProjectilePass(direct, 1.52, 5.4), 'hit');
  assert.equal(classifyProjectilePass(close, 1.52, 5.4), 'near-miss');
  assert.equal(classifyProjectilePass(safe, 1.52, 5.4), 'miss');
});

test('turbo drena e recarrega sem depender da taxa de quadros e exige reserva para reativar', () => {
  const runForSecond = (steps) => {
    let energy = 100;
    let active = false;
    for (let index = 0; index < steps; index++) {
      const next = physics.advanceBoostState(energy, true, active, 1 / steps);
      energy = next.energy;
      active = next.active;
    }
    return { energy, active };
  };
  const at30 = runForSecond(30);
  const at120 = runForSecond(120);
  assert.ok(Math.abs(at30.energy - at120.energy) < 1e-9);
  assert.ok(at30.active && at120.active);
  const recovering = physics.advanceBoostState(10, true, false, 1 / 60);
  assert.equal(recovering.active, false);
  assert.ok(recovering.energy > 10);
});

test('máquina de estados permite pausa e repetição e bloqueia saltos inválidos', () => {
  assert.equal(states.canTransition('menu', 'briefing'), true);
  assert.equal(states.canTransition('playing', 'paused'), true);
  assert.equal(states.canTransition('victory', 'briefing'), true);
  assert.equal(states.canTransition('menu', 'playing'), false);
  assert.equal(states.canTransition('defeat', 'victory'), false);
});

test('salvamento local tolera dados inválidos e limita configurações e recordes', () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  };
  assert.deepEqual(storage.loadSave(), { version: 2, unlocked: 1, records: {}, volume: 0.7, muted: false, theme: 'cyan', flightModel: 'arcade' });
  data.set('aether-x-save-v1', JSON.stringify({
    unlocked: 99, volume: 'bad', muted: 'false', theme: 'hacked',
    records: { training: { medal: 99, score: -5, time: -10, shield: 140 }, intercept: { medal: 'x' } },
  }));
  const loaded = storage.loadSave();
  assert.equal(loaded.unlocked, 8);
  assert.equal(loaded.volume, 0.7);
  assert.equal(loaded.muted, false);
  assert.equal(loaded.theme, 'cyan');
  assert.deepEqual(loaded.records.training, { medal: 3, score: 0, time: 0, shield: 100 });
  assert.equal(loaded.records.intercept, undefined);
  assert.ok(data.get('aether-x-save-v2'), 'a gravação antiga deve ser migrada automaticamente');
  storage.saveData(loaded);
  assert.ok(data.get('aether-x-save-v2'));
  data.delete('aether-x-save-v2');
  data.set('aether-x-save-v1', JSON.stringify({
    unlocked: 3,
    records: { sentinel: { medal: 2, score: 5200, time: 90, shield: 52 } },
  }));
  const completedLegacyCampaign = storage.loadSave();
  assert.equal(completedLegacyCampaign.unlocked, 4, 'quem já venceu o chefe final recebe acesso à primeira missão nova');
  assert.equal(completedLegacyCampaign.records.sentinel.score, 5200);
  storage.saveExtras({ completedTasks: ['ow-express', 'ow-express'], bestScore: 4200, riverStyle: 'futuristic' });
  const extras = storage.loadExtras();
  assert.deepEqual(extras.completedTasks, ['ow-express']);
  assert.equal(extras.bestScore, 4200);
  assert.equal(extras.riverStyle, 'futuristic');
});

test('fuselagem do AETHER-X e cascos inimigos são simétricos e apontam para o eixo frontal -Z', () => {
  const geometry = droneModel.createFuselageGeometry();
  const positions = geometry.getAttribute('position');
  const quantize = (value) => Number(value.toFixed(4));
  const pointKey = (x, y, z) => `${quantize(x)},${quantize(y)},${quantize(z)}`;
  const points = new Set();
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    points.add(pointKey(x, y, z));
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  for (let index = 0; index < positions.count; index++) {
    assert.ok(points.has(pointKey(-positions.getX(index), positions.getY(index), positions.getZ(index))), 'cada vértice deve ter um par espelhado');
  }
  assert.ok(minZ < -1.5, 'a ponta frontal deve ficar no eixo -Z');
  assert.ok(maxZ > 1.3, 'a traseira deve se estender para +Z');
  assert.equal(droneModel.PLAYER_ROTOR_LAYOUT.length, 4);
  assert.deepEqual(
    droneModel.PLAYER_ROTOR_LAYOUT.map(({ x, z }) => `${x},${z}`).sort(),
    ['-3.1,-2.35', '-3.1,2.35', '3.1,-2.35', '3.1,2.35'],
  );
  geometry.dispose();

  for (const kind of ['scout', 'gunner', 'bulwark', 'sniper', 'swarmer', 'boss', 'fpv', 'fixedwing', 'aaturret', 'heavyhex', 'gunboat', 'attackheli']) {
    const enemyGeo = droneModel.createEnemyHullGeometry(kind);
    assert.ok(enemyGeo.getAttribute('position').count > 20, `casco ${kind} possui malha válida`);
    enemyGeo.dispose();
  }
  const wingLeft = droneModel.createSweptWingGeometry(-1);
  const wingRight = droneModel.createSweptWingGeometry(1);
  assert.equal(wingLeft.getAttribute('position').count, wingRight.getAttribute('position').count);
  wingLeft.dispose();
  wingRight.dispose();
});

test('campanha realista possui 10 operações com biomas e objetivos variados e mundo aberto realista com 8 tasks', () => {
  assert.equal(missions.REALISTIC_MISSIONS.length, 10);
  assert.deepEqual(missions.REALISTIC_MISSIONS.map((m) => m.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(
    missions.REALISTIC_MISSIONS.map((m) => m.id),
    ['r-highlands', 'r-coast', 'r-harbor', 'r-metro', 'r-wildfire', 'r-desert', 'r-canyon', 'r-refinery', 'r-arctic', 'r-dam'],
  );
  assert.equal(missions.missionIdAt(9, 'realistic'), 'r-dam');
  assert.equal(missions.missionIdAt(10, 'realistic'), null);
  assert.equal(missions.REALISTIC_OPEN_WORLD_MODE.id, 'openworld-realistic');
  assert.equal(missions.REALISTIC_OPEN_WORLD_MODE.environment, 'metro-open');
  assert.equal(missions.REALISTIC_OPEN_WORLD_TASKS.length, 8);
  assert.equal(missions.openWorldTaskById('row-heli').bossKind, 'attackheli');
  assert.equal(missions.campaignsForStyle('realistic').length, 10);
  assert.equal(missions.campaignsForStyle('futuristic').length, 8);
});

test('CollisionWorld detecta contatos 3D, oclusão de projétil por segmento e linha de visão', () => {
  const world = new collision.CollisionWorld(16);
  world.setTerrain((x, z) => (Math.abs(x) < 10 && Math.abs(z) < 10 ? 2 : 0), -1.5);
  const boxId = world.addBox(0, 10, -20, 6, 10, 6, 0, 'concrete');
  world.addCylinder(18, -10, 3, 0, 14, 'wood', 42);
  world.addSphere(-15, 6, -12, 4, 'rock');

  const hitWall = world.sphereContacts(0, 8, -14.5, 1.2);
  assert.ok(hitWall.length > 0 && hitWall[0].tag === 'concrete');

  const hitGround = world.sphereContacts(0, 2.5, 0, 1.0);
  assert.ok(hitGround.some((c) => c.tag === 'terrain'));

  const ray = world.segmentCast(0, 8, 0, 0, 8, -40);
  assert.ok(ray && ray.colliderId === boxId && Math.abs(ray.z - -14) < 0.25);
  assert.equal(world.hasLineOfSight(0, 8, 0, 0, 8, -35), false);
  assert.equal(world.hasLineOfSight(0, 26, 0, 0, 26, -35), true);

  world.remove(boxId);
  assert.equal(world.hasLineOfSight(0, 8, 0, 0, 8, -35), true);
});

test('física de voo simulador responde a vento, efeito solo, massa de carga e impacto estrutural', () => {
  const sim = styleProfile.FLIGHT_PROFILES.realistic;
  const arc = styleProfile.FLIGHT_PROFILES.futuristic;
  const zeroState = { vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, yawVelocity: 0 };
  const input = { forward: 1, turn: 0, lift: 0, boost: false };
  const calmEnv = { windX: 0, windY: 0, windZ: 0, proximity: 0, groundGap: 10, cargoMass: 0 };

  const stepSim = physics.advanceFlight(zeroState, input, sim, calmEnv, 0.05);
  const stepArc = physics.advanceFlight(zeroState, input, arc, calmEnv, 0.05);
  assert.ok(Math.abs(stepArc.pitch) > Math.abs(stepSim.pitch), 'modo futurista inclina mais rápido que o simulador');

  const windyState = physics.advanceFlight(
    zeroState,
    { forward: 0, turn: 0, lift: 0, boost: false },
    sim,
    { windX: 12, windY: 0, windZ: 0, proximity: 0.5, groundGap: 1.2, cargoMass: 0 },
    0.1,
  );
  assert.ok(windyState.vx > 0, 'vento lateral desloca o drone no modo realista');
  assert.ok(windyState.vy > 0, 'efeito solo gera sustentação próxima ao chão');

  assert.equal(physics.impactDamage(4), 0);
  assert.ok(physics.impactDamage(18) > 10);
});

test('ObjectiveTracker processa resgate, reconhecimento, combate a incêndio, carga, escolta e sobrevivência', () => {
  // Resgate
  const rescue = new objectives.ObjectiveTracker({
    kind: 'rescue',
    points: [[0, 4, 0]],
    holdSeconds: 2,
    radius: 10,
    maxHoverSpeed: 6,
  });
  let res = rescue.step(1.0, { px: 0, py: 4, pz: 0, speed: 2, fwdX: 0, fwdY: 0, fwdZ: -1, droppingAction: false, hardImpactSpeed: 0, escortDamageTaken: 0 });
  assert.equal(res.status, 'running');
  res = rescue.step(1.2, { px: 0, py: 4, pz: 0, speed: 2, fwdX: 0, fwdY: 0, fwdZ: -1, droppingAction: false, hardImpactSpeed: 0, escortDamageTaken: 0 });
  assert.equal(res.status, 'completed');

  // Carga com queda por impacto forte
  const cargo = new objectives.ObjectiveTracker({
    kind: 'cargo',
    deliveries: [{ pickup: [0, 2, 0], dropoff: [0, 2, -50], mass: 0.4 }],
    radius: 10,
  });
  res = cargo.step(0.1, { px: 0, py: 2, pz: 0, speed: 2, fwdX: 0, fwdY: 0, fwdZ: -1, droppingAction: false, hardImpactSpeed: 0, escortDamageTaken: 0 });
  assert.equal(cargo.isCarryingCargo(), true);
  assert.ok(res.carryingCargoMass > 0);
  res = cargo.step(0.1, { px: 0, py: 2, pz: -20, speed: 10, fwdX: 0, fwdY: 0, fwdZ: -1, droppingAction: false, hardImpactSpeed: 16, escortDamageTaken: 0 });
  assert.equal(cargo.isCarryingCargo(), false, 'impacto forte derruba a carga');

  // Sobrevivência
  const surv = new objectives.ObjectiveTracker({ kind: 'survival', durationSeconds: 3 });
  res = surv.step(3.1, { px: 0, py: 10, pz: 0, speed: 5, fwdX: 0, fwdY: 0, fwdZ: -1, droppingAction: false, hardImpactSpeed: 0, escortDamageTaken: 0 });
  assert.equal(res.status, 'completed');
});

test('AutoQualityController aplica histerese de FPS e salvamento da campanha realista persiste recordes', () => {
  const ctrl = new quality.AutoQualityController('high');
  for (let i = 0; i < 80; i++) ctrl.sample(0.04);
  assert.equal(ctrl.getResolved(), 'medium');

  storage.saveRealisticCampaign({
    unlocked: 5,
    records: { 'r-highlands': { medal: 3, score: 3400, time: 62, shield: 94 } },
  });
  const loadedR = storage.loadRealisticCampaign();
  assert.equal(loadedR.unlocked, 5);
  assert.equal(loadedR.records['r-highlands']?.medal, 3);
});

test('colisores do Vale da Cachoeira e da Represa estão alinhados com a malha 3D sem barreiras invisíveis no corredor do rio', () => {
  const riverWorld = new collision.CollisionWorld(18);
  sceneryRealistic.populateClassicColliders('river', riverWorld);

  // Todo o corredor do rio (z de +30 até -128) e a posição (27, 30, -84) devem estar 100% livres de barreiras invisíveis
  for (let z = 30; z >= -128; z -= 8) {
    assert.equal(riverWorld.sphereContacts(0, 10, z, 1.35).length, 0, `corredor livre em z=${z}`);
  }
  assert.equal(riverWorld.sphereContacts(27, 30, -84, 1.35).length, 0, 'sem barreira invisível em (27, 30, -84)');
  // O paredão real da cachoeira fica em z = -138
  assert.ok(riverWorld.sphereContacts(0, 10, -133, 1.35).length > 0, 'paredão real da cachoeira em z=-138 bloqueia impacto');

  const damWorld = new collision.CollisionWorld(18);
  sceneryRealistic.populateClassicColliders('dam', damWorld);
  assert.equal(damWorld.sphereContacts(0, 14, -70, 1.35).length, 0, 'sem parede invisível em z=-70 na represa');
  assert.ok(damWorld.sphereContacts(0, 14, -104, 1.35).length > 0, 'paredão real da represa em z=-112 bloqueia impacto');
});

test('atalhos do HUD cabem em linhas agrupadas incluindo a alternância de câmera', async () => {
  const [html, css] = await Promise.all([
    readFile(path.join(projectRoot, 'index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'src/style.css'), 'utf8'),
  ]);
  const panel = html.match(/<div class="controls-hint plate"[\s\S]*?<\/div>\s*<\/footer>/)?.[0];
  assert.ok(panel, 'painel de controles encontrado');
  const rows = [...panel.matchAll(/<div><span class="control-label">([^<]+)<\/span><span class="control-keys">([\s\S]*?)<\/span><\/div>/g)];
  assert.deepEqual(rows.map(([, label]) => label), ['VOO', 'ALTITUDE', 'TURBO', 'DISPARO', 'CÂMERA']);
  assert.ok(rows.every(([, , keys]) => (keys.match(/<kbd>/g) ?? []).length > 0));
  assert.match(css, /\.controls-hint\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.controls-hint\s*>\s*div\s*\{[^}]*justify-content:\s*space-between/);
});

test('catálogo do hangar possui 8 drones (4 realistas e 4 cyberpunk) com progressão de tiers 1 a 4', () => {
  assert.equal(hangar.DRONE_CATALOG.length, 8);
  const realistic = hangar.dronesForStyle('realistic');
  const futuristic = hangar.dronesForStyle('futuristic');
  assert.equal(realistic.length, 4);
  assert.equal(futuristic.length, 4);

  assert.deepEqual(realistic.map((d) => d.id), ['dji-mavic', 'fpv-racer', 'heavy-hex', 'predator-uav']);
  assert.deepEqual(futuristic.map((d) => d.id), ['aether-x', 'specter-neon', 'valkyrie-gunship', 'omega-core']);

  assert.deepEqual(realistic.map((d) => d.tier), [1, 2, 3, 4]);
  assert.deepEqual(futuristic.map((d) => d.tier), [1, 2, 3, 4]);

  // Drones iniciais de cada modo são gratuitos
  assert.equal(hangar.droneById('dji-mavic').price, 0);
  assert.equal(hangar.droneById('aether-x').price, 0);
  // Drones superiores exigem créditos ganhos
  assert.ok(hangar.droneById('fpv-racer').price > 0);
  assert.ok(hangar.droneById('heavy-hex').price > hangar.droneById('fpv-racer').price);
  assert.ok(hangar.droneById('predator-uav').price > hangar.droneById('heavy-hex').price);
});

test('upgrades são isolados por drone e um drone de tier inferior totalmente melhorado supera o próximo tier de fábrica (overlap)', () => {
  // Teste de isolamento de upgrades
  const emptyUpgrades = hangar.defaultUpgradesForAllDrones();
  emptyUpgrades['dji-mavic'].propulsion = 5;
  emptyUpgrades['dji-mavic'].weapons = 5;
  // FPV Racer e Aether-X permanecem nível 0
  assert.equal(emptyUpgrades['fpv-racer'].propulsion, 0);
  assert.equal(emptyUpgrades['aether-x'].weapons, 0);

  // Curva de Overlap: Tier N Nv.5 > Tier N+1 Nv.0 para ambos os estilos
  const realisticDrones = hangar.dronesForStyle('realistic');
  for (let i = 0; i < realisticDrones.length - 1; i++) {
    const current = realisticDrones[i];
    const next = realisticDrones[i + 1];
    const maxCurrent = hangar.computeDroneEffectiveStats(current.id, {
      propulsion: 5,
      chassis: 5,
      weapons: 5,
      battery: 5,
      avionics: 5,
    });
    const stockNext = hangar.computeDroneEffectiveStats(next.id, hangar.defaultDroneUpgrades());
    assert.ok(
      maxCurrent.overallRating > stockNext.overallRating,
      `${current.name} Nv.5 (${maxCurrent.overallRating}) deve superar ${next.name} Nv.0 (${stockNext.overallRating})`,
    );
  }

  const futuristicDrones = hangar.dronesForStyle('futuristic');
  for (let i = 0; i < futuristicDrones.length - 1; i++) {
    const current = futuristicDrones[i];
    const next = futuristicDrones[i + 1];
    const maxCurrent = hangar.computeDroneEffectiveStats(current.id, {
      propulsion: 5,
      chassis: 5,
      weapons: 5,
      battery: 5,
      avionics: 5,
    });
    const stockNext = hangar.computeDroneEffectiveStats(next.id, hangar.defaultDroneUpgrades());
    assert.ok(
      maxCurrent.overallRating > stockNext.overallRating,
      `${current.name} Nv.5 (${maxCurrent.overallRating}) deve superar ${next.name} Nv.0 (${stockNext.overallRating})`,
    );
  }
});

test('sistema de economia calcula premiação de créditos de fase e gerencia compras no save do hangar', () => {
  // Vitória em missão com medalha de ouro
  const winPayout = hangar.calculateMissionPayout(true, 4, 3, 1200);
  assert.ok(winPayout.totalCredits >= 800, 'vitória com ouro concede créditos significativos');
  assert.ok(winPayout.baseCredits > 0);
  assert.ok(winPayout.medalBonus >= 400);

  // Derrota concede compensação parcial
  const failPayout = hangar.calculateMissionPayout(false, 4, 0, 500);
  assert.ok(failPayout.totalCredits > 0 && failPayout.totalCredits <= 220);

  // Operações de compra e dedução no save
  const testSave = storage.defaultHangarSave();
  assert.equal(testSave.credits, 800);
  assert.deepEqual(testSave.ownedDrones, ['dji-mavic', 'aether-x']);

  // Tentar comprar drone sem crédito suficiente falha
  const failBuy = storage.purchaseDroneInSave(testSave, 'heavy-hex'); // Preço 3200
  assert.equal(failBuy.ok, false);

  // Conceder créditos e comprar
  testSave.credits = 5000;
  const okBuy = storage.purchaseDroneInSave(testSave, 'heavy-hex');
  assert.equal(okBuy.ok, true);
  assert.ok(testSave.ownedDrones.includes('heavy-hex'));
  assert.equal(testSave.credits, 1800);

  // Comprar upgrade isolado para heavy-hex
  const upgRes = storage.purchaseUpgradeInSave(testSave, 'heavy-hex', 'propulsion');
  assert.equal(upgRes.ok, true);
  assert.equal(upgRes.newLevel, 1);
  assert.equal(testSave.upgradesByDrone['heavy-hex'].propulsion, 1);
  // dji-mavic permanece intocado
  assert.equal(testSave.upgradesByDrone['dji-mavic'].propulsion, 0);
});

test('interface HTML possui todos os novos modais e visões do Hub, Hangar e Upgrades', async () => {
  const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
  assert.ok(html.includes('id="menu-hub-view"'), 'visão principal do Hub existe');
  assert.ok(html.includes('id="menu-campaign-view"'), 'subvisão de campanha existe');
  assert.ok(html.includes('id="hangar-modal"'), 'modal do hangar existe');
  assert.ok(html.includes('id="upgrades-modal"'), 'modal de upgrades existe');
  assert.ok(html.includes('id="river-style-modal"'), 'modal de escolha de universo existe');
  assert.ok(html.includes('id="hub-campaign-button"'), 'botão da campanha no hub existe');
  assert.ok(html.includes('id="hub-hangar-button"'), 'botão do hangar no hub existe');
  assert.ok(html.includes('id="hub-upgrades-button"'), 'botão da oficina de upgrades no hub existe');
  assert.ok(html.includes('id="hub-settings-button"'), 'botão de configurações no hub existe');
  assert.ok(html.includes('id="result-credits-earned"'), 'exibição de créditos na tela de resultado existe');
});

test('estabilização ativa de hover (GPS/Altitude hold) freia o drone e impede movimento involuntário sem comando', () => {
  const sim = styleProfile.FLIGHT_PROFILES.realistic;
  // Drone em movimento inicial solta os comandos (forward: 0, turn: 0, lift: 0)
  let state = { vx: 4.0, vy: 1.0, vz: -4.0, yaw: 0, pitch: 0, roll: 0, yawVelocity: 0 };
  const releaseInput = { forward: 0, turn: 0, lift: 0, boost: false };
  const env = { windX: 3.2, windY: 0.5, windZ: 2.5, proximity: 0, groundGap: 20, cargoMass: 0 };

  // Avança 1.5 segundos sem comando
  for (let i = 0; i < 30; i++) {
    state = physics.advanceFlight(state, releaseInput, sim, env, 0.05);
  }

  // A velocidade deve ser zerada pela frenagem ativa e deadband de hover, e não acumular 29 km/h
  const finalSpeed = Math.hypot(state.vx, state.vy, state.vz);
  assert.equal(finalSpeed, 0, 'drone deve frear e pairar imóvel sem comandos');
});

test('desacoplamento de voo permite alternar entre perfil arcade e simulador independentemente do estilo visual', () => {
  assert.ok(styleProfile.FLIGHT_PROFILES_BY_MODEL.arcade, 'perfil arcade existe');
  assert.ok(styleProfile.FLIGHT_PROFILES_BY_MODEL.sim, 'perfil simulador existe');
  assert.equal(styleProfile.normalizeFlightModel('sim'), 'sim');
  assert.equal(styleProfile.normalizeFlightModel('arcade'), 'arcade');
  assert.equal(styleProfile.normalizeFlightModel('invalido'), 'arcade');
  // Arcade tem resposta angular e aceleração de guinada muito mais reativa
  assert.ok(styleProfile.FLIGHT_PROFILES_BY_MODEL.arcade.yawAccel > styleProfile.FLIGHT_PROFILES_BY_MODEL.sim.yawAccel);
  assert.ok(styleProfile.FLIGHT_PROFILES_BY_MODEL.arcade.angularResponse > styleProfile.FLIGHT_PROFILES_BY_MODEL.sim.angularResponse);
  // Simulador tem sensibilidade total ao vento e maior inclinação máxima de chassi
  assert.ok(styleProfile.FLIGHT_PROFILES_BY_MODEL.sim.windScale > styleProfile.FLIGHT_PROFILES_BY_MODEL.arcade.windScale);
  assert.ok(styleProfile.FLIGHT_PROFILES_BY_MODEL.sim.maxTiltRad > styleProfile.FLIGHT_PROFILES_BY_MODEL.arcade.maxTiltRad);
});

test('enquadramento da câmera de 3ª pessoa compensa o mergulho e mantém a mira 100% desobstruída acima do chassi', () => {
  const profile = physics.cameraFollowProfile(20);
  assert.ok(profile.targetElevation > 1.0, 'elevação do alvo de mira é positiva');

  // Voo reto nivelado (pitch 0):
  const levelFraming = physics.computeChaseCameraFraming(10, 0, profile);
  assert.equal(levelFraming.cameraY, 10 + profile.height);
  assert.ok(levelFraming.targetY > 10, 'mira fica elevada acima do centro do drone');

  // Mergulho agressivo de aceleração (pitch -0.42 rad ~ -24°):
  const diveFraming = physics.computeChaseCameraFraming(10, -0.42, profile);
  // A câmera sobe para olhar por cima da traseira empinada do drone
  assert.ok(diveFraming.cameraY > levelFraming.cameraY + 0.8, 'câmera sobe durante mergulho para não tapar o retículo');
  assert.ok(diveFraming.targetY > 10, 'visada de mira aponta adiante desobstruída');
});

test('Vale Atlântico possui relevo da Mata Atlântica de até 42m e interface com botão de compactação de tasks e modelo de voo', async () => {
  // Relevo da Mata Atlântica nos morros a noroeste
  assert.ok(sceneryRealistic.atlanticHillsHeight(-115, -120) > 35, 'pico do morro atinge mais de 35m');
  assert.ok(sceneryRealistic.atlanticHillsHeight(-55, -145) > 28, 'promontório do farol atinge mais de 28m');
  assert.equal(sceneryRealistic.atlanticHillsHeight(0, 0), 0, 'centro da cidade permanece em cota zero');

  // Interface possui botão de recolher/expandir tasks e seletor de modelo de voo
  const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
  assert.ok(html.includes('id="ow-toggle-list"'), 'botão de alternar lista de tasks existe');
  assert.ok(html.includes('id="flight-model-arcade"'), 'opção de voo arcade existe');
  assert.ok(html.includes('id="flight-model-sim"'), 'opção de voo simulador existe');
});

test('colisores da Megacidade e do Mundo Aberto Cyberpunk cobrem 100% dos prédios instanciados e estruturas', () => {
  const cityCol = new collision.CollisionWorld(18);
  sceneryRealistic.populateClassicColliders('city', cityCol);
  // Megacidade deve possuir 94 prédios + 24 marcos de arena = 118 colisores sólidos
  assert.equal(cityCol.byId.size, 118, 'megacidade possui exatamente 118 colisores físicos');

  const owCol = new collision.CollisionWorld(18);
  sceneryRealistic.populateClassicColliders('openworld', owCol);
  // Mundo aberto deve possuir 64 distritos + 84 megatorres + 6 helipontos + 4 pontes = 158 colisores
  assert.equal(owCol.byId.size, 158, 'mundo aberto cyberpunk possui 158 colisores correspondendo a todas as malhas');
});

test('chefes possuem balanceamento duradouro de HP e dano sem piso artificial', () => {
  const m3 = missions.missionById('sentinel');
  const m8 = missions.missionById('dam');
  assert.equal(m3.bossHealth, 1800, 'Sentinela possui 1800 HP para durar mais de 25s');
  assert.equal(m8.bossHealth, 3200, 'Leviatã possui 3200 HP');

  // Dano em chefes deve usar weapon.bossDamage sem ser forçado para 10
  const realWp = styleProfile.WEAPON_PROFILES.realistic;
  const futWp = styleProfile.WEAPON_PROFILES.futuristic;
  assert.equal(realWp.bossDamage, 3.6);
  assert.equal(Math.max(1, Math.round(realWp.bossDamage * 1.0)), 4, 'dano balístico no chefe calcula 4 sem piso de 10');
  assert.equal(Math.max(1, Math.round(futWp.bossDamage * 1.0)), 8, 'dano a laser no chefe calcula 8 sem piso de 10');
});

test('sistema de economia paga bônus de primeira conclusão e HUD exibe atalhos E e TAB', async () => {
  const firstClearPayout = hangar.calculateMissionPayout(true, 1, 3, 2000, true);
  const repeatPayout = hangar.calculateMissionPayout(true, 1, 3, 2000, false);
  assert.equal(firstClearPayout.firstClearBonus, 300, 'bônus de estreia deve pagar 300 CR');
  assert.equal(repeatPayout.firstClearBonus, 0, 'repetição de fase não paga bônus de estreia');
  assert.equal(firstClearPayout.totalCredits - repeatPayout.totalCredits, 300);

  const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
  assert.ok(html.includes('<kbd>E</kbd>'), 'HUD exibe atalho E de ação/carga');
  assert.ok(html.includes('<kbd>TAB</kbd>'), 'HUD exibe atalho TAB de tasks');
});




