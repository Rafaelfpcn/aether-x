import './style.css';
import { AudioEngine } from './audio';
import { Game, type GameEvent } from './game';
import {
  calculateMissionPayout,
  computeDroneEffectiveStats,
  defaultDroneUpgrades,
  droneById,
  DRONE_CATALOG,
  dronesForStyle,
  getNextUpgradeCost,
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_LABELS,
  type DroneId,
} from './hangar';
import {
  campaignsForStyle,
  MISSIONS,
  missionById,
  missionIdAt,
  OPEN_WORLD_TASKS,
  openWorldModeForStyle,
  openWorldTasksForStyle,
  REALISTIC_MISSIONS,
  REALISTIC_OPEN_WORLD_TASKS,
  RIVER_STYLE_CONFIGS,
  type BossAttackPattern,
  type CampaignMissionId,
  type FuturisticCampaignMissionId,
  type MissionDefinition,
  type OpenWorldTaskId,
  type RealisticCampaignMissionId,
  type RiverStyle,
  type ScenarioId,
} from './missions';
import { type QualityLevel } from './quality';
import { canTransition, type GameState } from './state';
import {
  defaultHangarSave,
  loadExtras,
  loadHangarSave,
  loadRealisticCampaign,
  loadSave,
  purchaseDroneInSave,
  purchaseUpgradeInSave,
  saveData,
  saveExtras,
  saveHangarSave,
  saveRealisticCampaign,
  type MissionRecord,
  type ThemeId,
} from './storage';
import { type FlightModel, type VisualStyle } from './style-profile';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento obrigatório não encontrado: #${id}`);
  return element as T;
}

function q<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Seletor obrigatório não encontrado: ${selector}`);
  return element;
}

const save = loadSave();
const realisticSave = loadRealisticCampaign();
const extras = loadExtras();
const hangarSave = loadHangarSave();
let currentStyle: VisualStyle = extras.visualStyle ?? extras.riverStyle ?? 'realistic';
let state: GameState = 'menu';

function latestCampaignMissionForStyle(style: VisualStyle): CampaignMissionId {
  if (style === 'realistic') {
    return missionIdAt(Math.min(realisticSave.unlocked - 1, REALISTIC_MISSIONS.length - 1), 'realistic') ?? 'r-highlands';
  }
  return missionIdAt(Math.min(save.unlocked - 1, MISSIONS.length - 1), 'futuristic') ?? 'training';
}

let selectedMission: CampaignMissionId = latestCampaignMissionForStyle(currentStyle);
let selectedScenario: ScenarioId = selectedMission;
let styleModalTarget: 'campaign' | 'river' | 'openworld' = 'campaign';
let hangarTabStyle: VisualStyle = currentStyle;
let inspectingUpgradeDroneId: DroneId = hangarSave.selectedDroneByStyle[currentStyle];
let timer = 0;
let timerHandle = 0;
let warningTimer = 0;
let toastTimer = 0;
let hitTimer = 0;
let damageTimer = 0;

const menuScreen = byId('menu-screen');
const menuHubView = byId('menu-hub-view');
const menuCampaignView = byId('menu-campaign-view');
const riverStyleModal = byId('river-style-modal');
const hangarModal = byId('hangar-modal');
const upgradesModal = byId('upgrades-modal');
const briefingScreen = byId('briefing-screen');
const pauseScreen = byId('pause-screen');
const resultScreen = byId('result-screen');
const settingsModal = byId('settings-screen');
const hud = byId('hud');
const osdOverlay = byId('osd-overlay');
const osdGps = byId('osd-gps');
const osdWind = byId('osd-wind');
const osdAttitude = byId('osd-attitude');
const osdAmmo = byId('osd-ammo');
const osdHorizonLine = byId('osd-horizon-line');
const openworldHud = byId('openworld-hud');
const owHudEyebrow = byId('ow-hud-eyebrow');
const owStatusLabel = byId('ow-status-label');
const owTaskList = byId('ow-task-list');
const owToggleListBtn = byId<HTMLButtonElement>('ow-toggle-list');
const owAbortTaskBtn = byId<HTMLButtonElement>('ow-abort-task');
let owTaskListExpanded = false;
const missionList = byId('mission-list');
const audioPill = byId('audio-pill');
const creditsPill = byId('credits-pill');
const openworldProgressPill = byId('openworld-progress-pill');
const openworldTitle = byId('openworld-title');
const openworldDesc = byId('openworld-desc');
const openworldEyebrow = byId('openworld-eyebrow');
const riverStylePill = byId('river-style-pill');
const previewStyleTag = byId('preview-style-tag');
const previewDroneRating = byId('preview-drone-rating');
const globalStyleRealisticBtn = byId('global-style-realistic');
const globalStyleFuturisticBtn = byId('global-style-futuristic');
const hudSpeed = byId('hud-speed');
const hudAltitude = byId('hud-altitude');
const hudShield = byId('hud-shield');
const hudScore = byId('hud-score');
const hudTime = byId('hud-time');
const hudMissionCode = byId('hud-mission-code');
const hudObjective = byId('hud-objective');
const hudProgress = byId('hud-progress');
const shieldBar = byId('shield-bar');
const boostBar = byId('boost-bar');
const bossBar = byId('boss-bar');
const bossPhase = byId('boss-phase');
const bossState = byId('boss-state');
const bossFill = byId('boss-fill');
const reticle = byId('reticle');
const hitMarker = byId('hit-marker');
const lockLabel = byId('lock-label');
const warningBanner = byId('warning-banner');
const eventToast = byId('event-toast');
const damageFlash = byId('damage-flash');
const volumeRange = byId<HTMLInputElement>('volume-range');

const audio = new AudioEngine(() => {
  audioPill.textContent = 'ÁUDIO SINTÉTICO ATIVO';
});
audio.setVolume(save.volume);
audio.setMuted(save.muted);
volumeRange.value = String(Math.round(save.volume * 100));

const game = new Game(byId('scene-container'), byId<HTMLCanvasElement>('radar'), audio, {
  onEvent: handleGameEvent,
  onPause: () => {
    if (state === 'playing') setState('paused');
  },
});
game.setVisualStyle(currentStyle);
game.setQuality(extras.quality ?? 'auto');

function syncEquippedDroneToGame(style: VisualStyle = currentStyle): void {
  const droneId = hangarSave.selectedDroneByStyle[style];
  const levels = hangarSave.upgradesByDrone[droneId] ?? defaultDroneUpgrades();
  const stats = computeDroneEffectiveStats(droneId, levels);
  game.setEquippedDrone(droneId, stats);
}

function showMenuSubview(subview: 'hub' | 'campaign'): void {
  menuHubView.classList.toggle('hidden', subview !== 'hub');
  menuCampaignView.classList.toggle('hidden', subview !== 'campaign');
}

function setTheme(theme: ThemeId): void {
  save.theme = theme;
  const accent: Record<ThemeId, string> = { cyan: '#39e5ef', crimson: '#ff476b', gold: '#ffca68' };
  document.documentElement.style.setProperty('--accent', accent[theme]);
  document.querySelectorAll<HTMLElement>('.theme-chip').forEach((chip) => {
    chip.classList.toggle('selected', chip.dataset.theme === theme);
  });
  game.setTheme(theme);
  saveData(save);
}

function setQuality(quality: QualityLevel): void {
  extras.quality = quality;
  document.querySelectorAll<HTMLElement>('.quality-chip').forEach((chip) => {
    chip.classList.toggle('selected', chip.dataset.quality === quality);
  });
  game.setQuality(quality);
  saveExtras(extras);
}

function isOpenWorldScenario(id: ScenarioId): boolean {
  return id === 'openworld' || id === 'openworld-realistic';
}

function isCampaignScenario(id: ScenarioId): id is CampaignMissionId {
  return id !== 'river' && id !== 'openworld' && id !== 'openworld-realistic';
}

function isRealisticMissionId(id: ScenarioId): id is RealisticCampaignMissionId {
  return id.startsWith('r-');
}

function activeOpenWorldTasks() {
  if (selectedScenario === 'openworld-realistic') return REALISTIC_OPEN_WORLD_TASKS;
  if (selectedScenario === 'openworld') return OPEN_WORLD_TASKS;
  return openWorldTasksForStyle(currentStyle);
}

function completedCountForStyle(style: VisualStyle): { done: number; total: number } {
  const tasks = openWorldTasksForStyle(style);
  const done = tasks.filter((t) => extras.completedTasks.includes(t.id)).length;
  return { done, total: tasks.length };
}

function setGlobalStyle(style: VisualStyle): void {
  currentStyle = style;
  hangarTabStyle = style;
  inspectingUpgradeDroneId = hangarSave.selectedDroneByStyle[style];
  extras.visualStyle = style;
  extras.riverStyle = style;
  saveExtras(extras);
  syncEquippedDroneToGame(style);
  game.setVisualStyle(style);

  globalStyleRealisticBtn.classList.toggle('selected', style === 'realistic');
  globalStyleRealisticBtn.setAttribute('aria-selected', String(style === 'realistic'));
  globalStyleFuturisticBtn.classList.toggle('selected', style === 'futuristic');
  globalStyleFuturisticBtn.setAttribute('aria-selected', String(style === 'futuristic'));

  byId('campaign-view-title').textContent =
    style === 'realistic'
      ? 'Operações de Campanha · Modo Realista (10 Fases)'
      : 'Operações de Campanha · Modo Cyberpunk (8 Fases)';
  byId('campaign-view-copy').textContent =
    style === 'realistic'
      ? 'Domine as 10 operações realistas com física aerodinâmica, vento, balística e destruição 3D. Ganhe CR$ em cada missão!'
      : 'Domine as 8 operações Cyberpunk em Neo-Aether e no Cânion. Ganhe CR$ em cada missão para comprar novos drones e upgrades!';

  selectedMission = latestCampaignMissionForStyle(style);
  selectedScenario = selectedMission;
  renderMissionList();
  renderSelectedMission();
  renderSpecialPills();
  if (state === 'menu') {
    game.setMenuScene();
  }
}

function setState(next: GameState): void {
  if (!canTransition(state, next)) return;
  state = next;
  menuScreen.classList.toggle('active', state === 'menu');
  briefingScreen.classList.toggle('active', state === 'briefing');
  pauseScreen.classList.toggle('active', state === 'paused');
  resultScreen.classList.toggle('active', state === 'victory' || state === 'defeat');
  hud.classList.toggle('active', state === 'playing' || state === 'paused');
  game.setActive(state === 'playing');
  if (state === 'menu') {
    riverStyleModal.classList.remove('active');
    hangarModal.classList.remove('active');
    upgradesModal.classList.remove('active');
    audio.setScene('menu');
    syncEquippedDroneToGame(currentStyle);
    game.setVisualStyle(currentStyle);
    game.setMenuScene();
    renderSpecialPills();
  }
  if (state === 'paused') audio.setScene('paused');
  if (state === 'playing') {
    const mission = missionById(selectedScenario);
    const activeTask = game.getActiveOpenWorldTask();
    audio.setScene(mission.objectiveKind === 'boss' || activeTask?.kind === 'boss' ? 'boss' : 'combat');
  }
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function formatCredits(value: number): string {
  return `CR$ ${Math.max(0, Math.floor(value)).toLocaleString('pt-BR')}`;
}

function medalLabel(medal: MissionRecord['medal']): string {
  return medal === 3 ? 'OURO' : medal === 2 ? 'PRATA' : medal === 1 ? 'BRONZE' : 'SEM MEDALHA';
}

function objectiveTargetSummary(mission: MissionDefinition): string {
  switch (mission.objectiveKind) {
    case 'gates':
      return `${mission.objectiveTarget} Balizas`;
    case 'kills':
      return `${mission.objectiveTarget} Hostis`;
    case 'boss':
      return mission.bossKind === 'attackheli' ? '1 Helicóptero Chefe' : '1 Chefe';
    case 'rescue':
      return `${mission.objectiveTarget} Resgates`;
    case 'escort':
      return `${mission.objectiveTarget} Comboios`;
    case 'recon':
      return `${mission.objectiveTarget} Varreduras`;
    case 'cargo':
      return `${mission.objectiveTarget} Entregas`;
    case 'firefight':
      return `${mission.objectiveTarget} Focos`;
    case 'survival':
      return `${mission.objectiveTarget}s Sobrevivência`;
    default:
      return 'Mundo Aberto';
  }
}

function renderSpecialPills(): void {
  creditsPill.textContent = formatCredits(hangarSave.credits);
  byId('hangar-credits-pill').textContent = formatCredits(hangarSave.credits);
  byId('upgrades-credits-pill').textContent = formatCredits(hangarSave.credits);

  const equippedId = hangarSave.selectedDroneByStyle[currentStyle];
  const equippedDef = droneById(equippedId);
  const equippedLevels = hangarSave.upgradesByDrone[equippedId] ?? defaultDroneUpgrades();
  const equippedStats = computeDroneEffectiveStats(equippedId, equippedLevels);

  byId('hub-active-universe-badge').textContent =
    currentStyle === 'realistic' ? 'UNIVERSO ATIVO: REALISTA' : 'UNIVERSO ATIVO: CYBERPUNK';
  const campUnlocked = currentStyle === 'realistic' ? realisticSave.unlocked : save.unlocked;
  const campTotal = currentStyle === 'realistic' ? REALISTIC_MISSIONS.length : MISSIONS.length;
  byId('hub-campaign-progress').textContent = `${campUnlocked} / ${campTotal} FASES`;

  const owCounts = completedCountForStyle(currentStyle);
  openworldProgressPill.textContent = `${owCounts.done} / ${owCounts.total} TASKS`;
  if (currentStyle === 'realistic') {
    openworldEyebrow.textContent = 'MUNDO ABERTO · REALISTA / CYBERPUNK';
    openworldTitle.textContent = 'Mundo Aberto (Metrópole / Neo-Aether)';
    openworldDesc.textContent =
      'Escolha explorar a Metrópole Vale Atlântico (Modo Realista com 8 Tasks) ou a Megacidade Neo-Aether (Modo Cyberpunk com 5 Tasks).';
  } else {
    openworldEyebrow.textContent = 'MUNDO ABERTO · REALISTA / CYBERPUNK';
    openworldTitle.textContent = 'Mundo Aberto (Neo-Aether / Metrópole)';
    openworldDesc.textContent =
      'Escolha explorar a Megacidade Neo-Aether (Modo Cyberpunk com 5 Tasks) ou a Metrópole Vale Atlântico (Modo Realista com 8 Tasks).';
  }

  riverStylePill.textContent = currentStyle === 'realistic' ? 'MODO REALISTA' : 'MODO CYBERPUNK';
  previewStyleTag.textContent = `CONFIG // ${equippedDef.name.toUpperCase()}`;
  previewDroneRating.textContent = `RATING ${equippedStats.overallRating} · NV ${equippedStats.totalUpgradeLevel}/25`;
  byId('equipped-drone-tier').textContent = `TIER ${equippedDef.tier} · DRONE ATUAL (${currentStyle === 'realistic' ? 'REALISTA' : 'CYBERPUNK'})`;
  byId('equipped-drone-name').textContent = equippedDef.name;
  byId('equipped-drone-weapon').textContent = `${equippedDef.weaponLabel} · Escudo ${equippedStats.maxShield} HP`;

  byId('hub-hangar-summary').textContent = `${hangarSave.ownedDrones.length} / ${DRONE_CATALOG.length} Drones adquiridos · Saldo ${formatCredits(hangarSave.credits)}`;
  byId('hub-upgrades-summary').textContent = `${equippedDef.shortName} · Nível ${equippedStats.totalUpgradeLevel}/25 · Rating ${equippedStats.overallRating}`;

  byId('river-select-realistic').classList.toggle('selected', currentStyle === 'realistic');
  byId('river-select-futuristic').classList.toggle('selected', currentStyle === 'futuristic');
}

function renderHangarModal(): void {
  byId('hangar-credits-pill').textContent = formatCredits(hangarSave.credits);
  byId('hangar-tab-realistic').classList.toggle('selected', hangarTabStyle === 'realistic');
  byId('hangar-tab-futuristic').classList.toggle('selected', hangarTabStyle === 'futuristic');

  const grid = byId('hangar-drone-grid');
  grid.replaceChildren();
  const list = dronesForStyle(hangarTabStyle);
  const equippedForTab = hangarSave.selectedDroneByStyle[hangarTabStyle];

  for (const def of list) {
    const owned = hangarSave.ownedDrones.includes(def.id);
    const isEquipped = equippedForTab === def.id;
    const levels = hangarSave.upgradesByDrone[def.id] ?? defaultDroneUpgrades();
    const stats = computeDroneEffectiveStats(def.id, levels);
    const maxStats = computeDroneEffectiveStats(def.id, {
      propulsion: 5,
      chassis: 5,
      weapons: 5,
      battery: 5,
      avionics: 5,
    });

    const card = document.createElement('div');
    card.className = `drone-shop-card${isEquipped ? ' equipped' : ''}${owned ? ' owned' : ''}`;
    card.setAttribute('role', 'listitem');

    const top = document.createElement('div');
    top.className = 'drone-card-top';
    const topLeft = document.createElement('div');
    const tierBadge = document.createElement('span');
    tierBadge.className = 'eyebrow';
    tierBadge.textContent = `TIER ${def.tier} · ${(def.role ?? def.manufacturer).toUpperCase()} · UPGRADES ${stats.totalUpgradeLevel}/25`;
    const title = document.createElement('h3');
    title.textContent = def.name;
    const sub = document.createElement('small');
    sub.textContent = `${def.subtitle ?? def.manufacturer} — ${def.weaponLabel ?? def.upgrades.weapons.name}`;
    topLeft.append(tierBadge, title, sub);

    const ratingBadge = document.createElement('span');
    ratingBadge.className = 'drone-rating-badge';
    ratingBadge.textContent = `RATING ${stats.overallRating} (MÁX ${maxStats.overallRating})`;
    top.append(topLeft, ratingBadge);

    const desc = document.createElement('small');
    desc.style.color = 'var(--muted)';
    desc.textContent = def.description ?? def.summary;

    const bars = document.createElement('div');
    bars.className = 'drone-stat-bars';
    const statRows: [string, number][] = [
      ['VELOCIDADE', stats.speed],
      ['MANOBRA', stats.agility],
      ['CHASSI/ESCUDO', stats.shield],
      ['ARMAMENTO', stats.firepower],
      ['BATERIA/TURBO', stats.turbo],
    ];
    for (const [label, val] of statRows) {
      const row = document.createElement('div');
      row.className = 'stat-bar-row';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      const track = document.createElement('div');
      track.className = 'stat-bar-track';
      const fill = document.createElement('div');
      fill.className = 'stat-bar-fill';
      fill.style.width = `${Math.min(100, Math.round((val / 138) * 100))}%`;
      track.append(fill);
      const num = document.createElement('strong');
      num.textContent = String(val);
      row.append(lbl, track, num);
      bars.append(row);
    }

    const actions = document.createElement('div');
    actions.className = 'drone-card-actions';
    if (!owned) {
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'primary-button';
      const canAfford = hangarSave.credits >= def.price;
      buyBtn.disabled = !canAfford;
      buyBtn.textContent = canAfford
        ? `COMPRAR DRONE · ${formatCredits(def.price)}`
        : `BLOQUEADO · ${formatCredits(def.price)}`;
      buyBtn.addEventListener('click', () => {
        const res = purchaseDroneInSave(hangarSave, def.id);
        if (!res.ok) {
          showToast(res.reason ?? 'CRÉDITOS INSUFICIENTES');
          return;
        }
        saveHangarSave(hangarSave);
        audio.play('purchase');
        setGlobalStyle(def.style);
        renderHangarModal();
        showToast(`${def.name.toUpperCase()} ADQUIRIDO E EQUIPADO!`);
      });
      actions.append(buyBtn);
    } else {
      const equipBtn = document.createElement('button');
      equipBtn.type = 'button';
      equipBtn.className = isEquipped ? 'ghost-button' : 'primary-button';
      equipBtn.textContent = isEquipped ? '✓ EQUIPADO NESTE MODO' : 'EQUIPAR DRONE';
      equipBtn.addEventListener('click', () => {
        hangarSave.selectedDroneByStyle[def.style] = def.id;
        saveHangarSave(hangarSave);
        audio.play('gate');
        setGlobalStyle(def.style);
        renderHangarModal();
      });

      const upgBtn = document.createElement('button');
      upgBtn.type = 'button';
      upgBtn.className = 'secondary-button';
      upgBtn.textContent = `UPGRADES (${stats.totalUpgradeLevel}/25)`;
      upgBtn.addEventListener('click', () => {
        hangarSave.selectedDroneByStyle[def.style] = def.id;
        saveHangarSave(hangarSave);
        setGlobalStyle(def.style);
        hangarModal.classList.remove('active');
        openUpgradesModal(def.id);
      });
      actions.append(equipBtn, upgBtn);
    }

    card.append(top, desc, bars, actions);
    grid.append(card);
  }
}

function openHangarModal(style: VisualStyle = currentStyle): void {
  audio.unlock();
  hangarTabStyle = style;
  upgradesModal.classList.remove('active');
  renderHangarModal();
  hangarModal.classList.add('active');
}

function renderUpgradesModal(): void {
  const def = droneById(inspectingUpgradeDroneId);
  const levels = hangarSave.upgradesByDrone[def.id] ?? defaultDroneUpgrades();
  const stats = computeDroneEffectiveStats(def.id, levels);

  byId('upgrades-credits-pill').textContent = formatCredits(hangarSave.credits);
  byId('upgrades-rating-pill').textContent = `RATING ${stats.overallRating} · NV ${stats.totalUpgradeLevel}/25`;
  byId('upgrades-drone-name').textContent = `${def.name} (${def.style === 'realistic' ? 'Modo Realista' : 'Modo Cyberpunk'})`;
  byId('upgrades-drone-desc').textContent =
    `Upgrades exclusivos do ${def.shortName}: as melhorias compradas abaixo pertencem somente a este drone e não são compartilhadas com outros modelos.`;

  // Switcher rápido entre os drones já comprados pelo jogador
  const switcher = byId('upgrades-owned-switcher');
  switcher.replaceChildren();
  for (const ownedId of hangarSave.ownedDrones) {
    const ownedDef = droneById(ownedId);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `style-tab${ownedId === def.id ? ' selected' : ''}`;
    chip.textContent = ownedDef.shortName.toUpperCase();
    chip.addEventListener('click', () => {
      inspectingUpgradeDroneId = ownedId;
      hangarSave.selectedDroneByStyle[ownedDef.style] = ownedId;
      saveHangarSave(hangarSave);
      setGlobalStyle(ownedDef.style);
      renderUpgradesModal();
    });
    switcher.append(chip);
  }

  // Barra de comparação com o próximo Tier (mostra que um drone melhorado supera o próximo modelo básico!)
  const sameStyleDrones = dronesForStyle(def.style);
  const nextTierDef = sameStyleDrones.find((d) => d.tier === def.tier + 1);
  const compBar = byId('upgrades-tier-comparison');
  if (nextTierDef) {
    const nextStock = computeDroneEffectiveStats(nextTierDef.id, defaultDroneUpgrades());
    const maxThis = computeDroneEffectiveStats(def.id, {
      propulsion: 5,
      chassis: 5,
      weapons: 5,
      battery: 5,
      avionics: 5,
    });
    if (stats.overallRating > nextStock.overallRating) {
      compBar.textContent =
        `★ SUPERAÇÃO DE TIER ATIVA: Seu ${def.shortName} melhorado (Rating ${stats.overallRating}) já supera o ${nextTierDef.shortName} de fábrica (Rating Stock ${nextStock.overallRating})! Compre o ${nextTierDef.shortName} e melhore-o para alcançar até Rating 355.`;
    } else {
      compBar.textContent =
        `POTENCIAL DE OVERLAP: Rating Atual ${stats.overallRating} (Teto Nível 5: ${maxThis.overallRating}) vs. Próximo Drone Stock (${nextTierDef.shortName}: Rating ${nextStock.overallRating}) — No Nível 5 este drone supera o próximo modelo de fábrica!`;
    }
  } else {
    compBar.textContent =
      `★ AERONAVE TIER 4 DE ELITE: Seu ${def.shortName} está com Rating ${stats.overallRating} (Teto Máximo Absoluto: 355).`;
  }

  const trackList = byId('upgrades-track-list');
  trackList.replaceChildren();
  for (const cat of UPGRADE_CATEGORIES) {
    const curLevel = levels[cat];
    const cost = getNextUpgradeCost(def.id, cat, curLevel);
    const trackSpec = def.upgrades[cat];

    const row = document.createElement('div');
    row.className = 'upgrade-track-row';
    row.setAttribute('role', 'listitem');

    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${UPGRADE_CATEGORY_LABELS[cat]}: ${trackSpec.name}`;
    const sub = document.createElement('small');
    sub.textContent = `${trackSpec.description} · Nível atual: ${curLevel}/5`;
    info.append(title, sub);

    const pips = document.createElement('div');
    pips.className = 'level-pips';
    for (let i = 1; i <= 5; i++) {
      const pip = document.createElement('span');
      pip.className = `level-pip${i <= curLevel ? ' filled' : ''}`;
      pips.append(pip);
    }

    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    if (cost === null || curLevel >= 5) {
      buyBtn.className = 'ghost-button tiny-button';
      buyBtn.disabled = true;
      buyBtn.textContent = 'NÍVEL MÁXIMO (5/5)';
    } else {
      const canAfford = hangarSave.credits >= cost;
      buyBtn.className = 'primary-button tiny-button';
      buyBtn.disabled = !canAfford;
      buyBtn.textContent = `MELHORAR NV.${curLevel + 1} · ${formatCredits(cost)}`;
      buyBtn.addEventListener('click', () => {
        const res = purchaseUpgradeInSave(hangarSave, def.id, cat);
        if (!res.ok) {
          showToast(res.reason ?? 'CRÉDITOS INSUFICIENTES');
          return;
        }
        saveHangarSave(hangarSave);
        audio.play('purchase');
        syncEquippedDroneToGame(currentStyle);
        renderSpecialPills();
        renderUpgradesModal();
        showToast(`${trackSpec.name.toUpperCase()} NÍVEL ${res.newLevel}/5 INSTALADO NO ${def.shortName.toUpperCase()}!`);
      });
    }

    row.append(info, pips, buyBtn);
    trackList.append(row);
  }
}

function openUpgradesModal(droneId: DroneId = hangarSave.selectedDroneByStyle[currentStyle]): void {
  audio.unlock();
  inspectingUpgradeDroneId = droneId;
  hangarModal.classList.remove('active');
  renderUpgradesModal();
  upgradesModal.classList.add('active');
}

function renderOpenWorldHud(): void {
  const activeTask = game.getActiveOpenWorldTask();
  const tasks = activeOpenWorldTasks();
  owAbortTaskBtn.classList.toggle('hidden', !activeTask);
  openworldHud.classList.toggle('compact', !owTaskListExpanded);
  owToggleListBtn.textContent = owTaskListExpanded ? 'RECOLHER [TAB]' : `TASKS [TAB] (${tasks.length})`;
  owHudEyebrow.textContent =
    selectedScenario === 'openworld-realistic'
      ? 'VALE ATLÂNTICO · 8 OPERAÇÕES URBANAS'
      : 'NEO-AETHER · 5 TASKS DINÂMICAS';
  owStatusLabel.textContent = activeTask
    ? `EM CURSO: ${activeTask.name} (${activeTask.district})`
    : 'VOO LIVRE — Pressione [TAB] para escolher tarefa';

  owTaskList.replaceChildren();
  tasks.forEach((task) => {
    const done = extras.completedTasks.includes(task.id);
    const isCurrent = activeTask?.id === task.id;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `ow-task-chip${isCurrent ? ' active' : ''}${done ? ' completed' : ''}`;
    const left = document.createElement('div');
    const title = document.createElement('span');
    title.textContent = `${done ? '✓ ' : '◎ '}${task.name}`;
    const sub = document.createElement('small');
    sub.style.display = 'block';
    sub.textContent = `${task.district} · +${task.rewardPoints} pts`;
    left.append(title, sub);

    const badge = document.createElement('small');
    badge.textContent = isCurrent ? 'ATIVA' : done ? 'CONCLUÍDA' : 'INICIAR';
    chip.append(left, badge);
    chip.addEventListener('click', () => {
      chip.blur();
      audio.unlock();
      owTaskListExpanded = false;
      game.startOpenWorldTask(task.id);
      renderOpenWorldHud();
    });
    owTaskList.append(chip);
  });
}

function renderMissionList(): void {
  missionList.replaceChildren();
  const list = campaignsForStyle(currentStyle);
  const unlocked = currentStyle === 'realistic' ? realisticSave.unlocked : save.unlocked;
  list.forEach((mission) => {
    const missionId = mission.id as CampaignMissionId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mission-item${missionId === selectedMission ? ' selected' : ''}`;
    button.disabled = mission.index > unlocked;
    const record =
      currentStyle === 'realistic'
        ? realisticSave.records[missionId as RealisticCampaignMissionId]
        : save.records[missionId as FuturisticCampaignMissionId];
    const left = document.createElement('div');
    const code = document.createElement('small');
    code.textContent = `${mission.code} · +CR$ ${280 + mission.index * 95}`;
    const name = document.createElement('strong');
    name.textContent = mission.name;
    left.append(code, name);
    const right = document.createElement('small');
    right.textContent =
      mission.index > unlocked
        ? 'BLOQUEADA'
        : record
          ? `${medalLabel(record.medal)} · ${record.score} pts`
          : 'DISPONÍVEL';
    button.append(left, right);
    button.addEventListener('click', () => {
      selectedMission = missionId;
      selectedScenario = missionId;
      renderMissionList();
      renderSelectedMission();
      renderSpecialPills();
    });
    missionList.append(button);
  });
}

function renderSelectedMission(): void {
  const mission = missionById(selectedMission);
  const record = isRealisticMissionId(selectedMission)
    ? realisticSave.records[selectedMission]
    : save.records[selectedMission as FuturisticCampaignMissionId];
  const indexPad = String(mission.index).padStart(2, '0');
  byId('selected-mission-code').textContent =
    currentStyle === 'realistic' ? `REALISTA ${indexPad}` : `MISSÃO ${indexPad}`;
  byId('selected-mission-name').textContent = mission.name;
  byId('selected-mission-sector').textContent = mission.sector;
  byId('selected-mission-target').textContent = objectiveTargetSummary(mission);
  byId('selected-mission-record').textContent = record ? `${medalLabel(record.medal)} (${record.score})` : 'Sem registro';
  byId('hud-mute').textContent = save.muted ? 'MUDO' : 'SOM';
}

function updateUniverseModalConfirmLabel(): void {
  const modeLabel = currentStyle === 'realistic' ? 'REALISTA' : 'CYBERPUNK';
  const confirmBtn = byId('river-confirm-button');
  if (styleModalTarget === 'campaign') {
    confirmBtn.textContent = `ABRIR CAMPANHA ${modeLabel}`;
  } else if (styleModalTarget === 'openworld') {
    confirmBtn.textContent = `INICIAR MUNDO ABERTO ${modeLabel}`;
  } else {
    confirmBtn.textContent = `INICIAR VALE DA CACHOEIRA ${modeLabel}`;
  }
}

function openStyleChoiceModal(target: 'campaign' | 'river' | 'openworld'): void {
  audio.unlock();
  styleModalTarget = target;
  byId('modal-mode-eyebrow').textContent =
    target === 'campaign'
      ? 'MODO CAMPANHA · ESCOLHA DE UNIVERSO'
      : target === 'openworld'
        ? 'MODO MUNDO ABERTO · ESCOLHA DE UNIVERSO'
        : 'MODO VALE DA CACHOEIRA · ESCOLHA DE UNIVERSO';
  byId('river-style-title').textContent =
    target === 'campaign'
      ? 'Campanha: Modo Realista ou Modo Cyberpunk?'
      : target === 'openworld'
        ? 'Mundo Aberto: Modo Realista ou Modo Cyberpunk?'
        : 'Vale da Cachoeira: Modo Realista ou Modo Cyberpunk?';
  byId('river-style-copy').textContent =
    target === 'campaign'
      ? 'Escolha jogar as 10 operações da Campanha Realista (física aerodinâmica, vento, balística e frota DJI/Militar) ou as 8 operações da Campanha Cyberpunk (arcade neon de alta voltagem).'
      : target === 'openworld'
        ? 'Explore a Metrópole Vale Atlântico (Modo Realista com 8 operações táticas, tráfego e ponte estaiada) ou a Megacidade Neo-Aether (Modo Cyberpunk com 5 Tasks neon).'
        : 'O Desfiladeiro da Cachoeira pode ser voado como expedição naturalista diurna (Modo Realista) ou incursão Cyberpunk noturna.';
  renderSpecialPills();
  updateUniverseModalConfirmLabel();
  riverStyleModal.classList.add('active');
}

function selectModalStyle(style: RiverStyle): void {
  setGlobalStyle(style);
  updateUniverseModalConfirmLabel();
}

function confirmStyleChoiceModal(): void {
  riverStyleModal.classList.remove('active');
  if (styleModalTarget === 'campaign') {
    showMenuSubview('campaign');
    renderMissionList();
    renderSelectedMission();
  } else if (styleModalTarget === 'openworld') {
    openBriefing(openWorldModeForStyle(currentStyle).id);
  } else {
    openBriefing('river');
  }
}

function openBriefing(scenarioId: ScenarioId = selectedMission): void {
  audio.unlock();
  riverStyleModal.classList.remove('active');
  selectedScenario = scenarioId;
  const mission = missionById(selectedScenario);
  const missionStyle: VisualStyle =
    mission.style === 'realistic' || (selectedScenario === 'river' && currentStyle === 'realistic')
      ? 'realistic'
      : 'futuristic';
  syncEquippedDroneToGame(missionStyle);
  renderSpecialPills();
  const equippedDef = droneById(hangarSave.selectedDroneByStyle[missionStyle]);
  if (selectedScenario === 'river') {
    const cfg = RIVER_STYLE_CONFIGS[currentStyle];
    byId('briefing-code').textContent = `${mission.code} // ${cfg.label.toUpperCase()}`;
    byId('briefing-title').textContent = `${mission.name} (${cfg.label})`;
    byId('briefing-summary').textContent = `${cfg.summary} Aeronave equipada: ${equippedDef.name}.`;
  } else {
    byId('briefing-code').textContent = mission.code;
    byId('briefing-title').textContent = mission.name;
    byId('briefing-summary').textContent = `${mission.summary} Aeronave equipada: ${equippedDef.name}.`;
  }
  byId('briefing-objective').textContent = mission.objective;
  byId('briefing-threat').textContent = mission.threat;
  byId('briefing-gold').textContent = `${mission.medalTargets.goldScore} pts em até ${formatTime(mission.medalTargets.goldTime)}`;
  setState('briefing');
}

function startMission(): void {
  const mission = missionById(selectedScenario);
  const effectiveStyle: VisualStyle =
    mission.style === 'realistic' || (selectedScenario === 'river' && currentStyle === 'realistic')
      ? 'realistic'
      : 'futuristic';
  timer = 0;
  hudTime.textContent = '00:00';
  hudMissionCode.textContent =
    selectedScenario === 'river'
      ? `${mission.code} · ${RIVER_STYLE_CONFIGS[currentStyle].label.toUpperCase()}`
      : mission.code;
  hudObjective.textContent = mission.hudTarget;

  const owCounts = completedCountForStyle(effectiveStyle);
  hudProgress.style.width =
    mission.objectiveKind === 'openworld' ? `${(owCounts.done / Math.max(1, owCounts.total)) * 100}%` : '0%';
  bossBar.classList.toggle('visible', mission.objectiveKind === 'boss');
  openworldHud.classList.toggle('visible', isOpenWorldScenario(selectedScenario));
  osdOverlay.classList.toggle('visible', effectiveStyle === 'realistic');
  osdHorizonLine.classList.toggle('visible', effectiveStyle === 'realistic');

  bossPhase.textContent = `${mission.name.toUpperCase()} // FASE 01`;
  bossState.textContent = 'JANELA DE ATAQUE ABERTA';
  bossFill.style.width = '100%';
  game.startMission(mission);
  if (isOpenWorldScenario(selectedScenario)) renderOpenWorldHud();
  setState('playing');
  window.clearInterval(timerHandle);
  timerHandle = window.setInterval(() => {
    if (state === 'playing') {
      timer = Math.floor(game.getElapsed());
      hudTime.textContent = formatTime(timer);
    }
  }, 1000);
}

function computeMedal(mission: MissionDefinition, score: number, elapsed: number, shield: number): 1 | 2 | 3 {
  if (score >= mission.medalTargets.goldScore && elapsed <= mission.medalTargets.goldTime && shield >= 55) return 3;
  if (score >= mission.medalTargets.silverScore && shield >= 25) return 2;
  return 1;
}

function finishMission(victory: boolean): void {
  window.clearInterval(timerHandle);
  const mission = missionById(selectedScenario);
  const score = game.getScore();
  const shield = game.getPlayerShield();
  const missionElapsed = Math.floor(game.getElapsed());
  if (missionElapsed > 0) timer = missionElapsed;
  const medal = victory ? computeMedal(mission, score, timer, shield) : 0;
  audio.play(victory ? 'win' : 'fail');

  const isFirstClear =
    victory &&
    isCampaignScenario(selectedScenario) &&
    (isRealisticMissionId(selectedScenario)
      ? !realisticSave.records[selectedScenario as RealisticCampaignMissionId]
      : !save.records[selectedScenario as FuturisticCampaignMissionId]);

  const payout = calculateMissionPayout(victory, mission.index, medal, score, isFirstClear);
  hangarSave.credits += payout.totalCredits;
  hangarSave.totalCreditsEarned += payout.totalCredits;
  saveHangarSave(hangarSave);

  if (victory && isCampaignScenario(selectedScenario)) {
    if (isRealisticMissionId(selectedScenario)) {
      const rId: RealisticCampaignMissionId = selectedScenario;
      const previous = realisticSave.records[rId];
      realisticSave.unlocked = Math.min(
        REALISTIC_MISSIONS.length,
        Math.max(realisticSave.unlocked, mission.index + 1),
      );
      if (!previous || score > previous.score || medal > previous.medal) {
        realisticSave.records[rId] = {
          medal,
          score: Math.max(score, previous?.score ?? 0),
          time: previous ? Math.min(timer, previous.time) : timer,
          shield: Math.max(shield, previous?.shield ?? 0),
        };
      }
      saveRealisticCampaign(realisticSave);
    } else {
      const fId: FuturisticCampaignMissionId = selectedScenario;
      const previous = save.records[fId];
      save.unlocked = Math.min(MISSIONS.length, Math.max(save.unlocked, mission.index + 1));
      if (!previous || score > previous.score || medal > previous.medal) {
        save.records[fId] = {
          medal,
          score: Math.max(score, previous?.score ?? 0),
          time: previous ? Math.min(timer, previous.time) : timer,
          shield: Math.max(shield, previous?.shield ?? 0),
        };
      }
      saveData(save);
    }
  } else if (isOpenWorldScenario(selectedScenario)) {
    extras.bestScore = Math.max(extras.bestScore, score);
    saveExtras(extras);
  }

  const campaignTotal = isRealisticMissionId(selectedScenario) ? REALISTIC_MISSIONS.length : MISSIONS.length;
  const owCounts = completedCountForStyle(currentStyle);
  byId('result-eyebrow').textContent = victory ? 'OPERAÇÃO BEM-SUCEDIDA' : 'DRONE DESATIVADO';
  byId('result-title').textContent = victory ? `${mission.name}: Concluída` : `${mission.name}: Falhou`;
  byId('result-copy').textContent = victory
    ? selectedScenario === 'river'
      ? `Voo pelo Vale da Cachoeira (${RIVER_STYLE_CONFIGS[currentStyle].label}) concluído.`
      : isOpenWorldScenario(selectedScenario)
        ? `Patrulha em Mundo Aberto encerrada com ${owCounts.done} de ${owCounts.total} Tasks concluídas.`
        : mission.index < campaignTotal
          ? 'Telemetria gravada. O próximo setor da campanha já está liberado.'
          : 'Todos os setores da campanha foram estabilizados. Você domina o espaço aéreo AETHER-X.'
    : 'A integridade estrutural chegou a zero ou o objetivo crítico falhou. Use os créditos recebidos para aprimorar seu drone na Oficina.';
  byId('result-score').textContent = String(score);
  byId('result-time').textContent = formatTime(timer);
  byId('result-shield').textContent = `${shield}%`;
  byId('result-credits-earned').textContent = `+CR$ ${payout.totalCredits.toLocaleString('pt-BR')}`;
  const breakdownExtra = payout.firstClearBonus > 0 ? ` · Estreia +CR$ ${payout.firstClearBonus}` : '';
  byId('result-credits-breakdown').textContent = victory
    ? `Base CR$ ${payout.baseCredits} · Medalha +CR$ ${payout.medalBonus}${breakdownExtra} · Pontos +CR$ ${payout.scoreBonus} · Saldo Total: CR$ ${hangarSave.credits.toLocaleString('pt-BR')}`
    : `Compensação tática +CR$ ${payout.baseCredits} · Pontos +CR$ ${payout.scoreBonus} · Saldo Total: CR$ ${hangarSave.credits.toLocaleString('pt-BR')}`;

  const medals = byId('result-medals');
  medals.replaceChildren();
  (['BRONZE', 'PRATA', 'OURO'] as const).forEach((label, index) => {
    const pill = document.createElement('span');
    pill.className = `medal-pill${medal >= index + 1 ? ' earned' : ''}`;
    pill.textContent = label;
    medals.append(pill);
  });

  const nextMission = isCampaignScenario(selectedScenario)
    ? missionIdAt(mission.index, isRealisticMissionId(selectedScenario) ? 'realistic' : 'futuristic')
    : null;
  const nextButton = byId<HTMLButtonElement>('result-next');
  nextButton.style.display = victory && nextMission ? 'inline-flex' : 'none';
  nextButton.onclick = () => {
    if (!nextMission) return;
    selectedMission = nextMission;
    selectedScenario = nextMission;
    renderMissionList();
    renderSelectedMission();
    openBriefing(nextMission);
  };
  renderMissionList();
  renderSelectedMission();
  renderSpecialPills();
  setState(victory ? 'victory' : 'defeat');
}

function showToast(text: string): void {
  eventToast.textContent = text;
  eventToast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => eventToast.classList.remove('visible'), 1350);
}

function warningPatternLabel(pattern: BossAttackPattern): string {
  if (pattern === 'fan') return 'LEQUE DE DISPAROS';
  if (pattern === 'charge') return 'MERGULHO RASANTE';
  if (pattern === 'sniper') return 'FEIXE DE PRECISÃO';
  if (pattern === 'burst') return 'RAJADA SATURADA';
  return 'RAJADA DIRETA';
}

function handleGameEvent(event: GameEvent): void {
  const mission = missionById(selectedScenario);
  if (event.type === 'telemetry') {
    hudSpeed.textContent = String(event.speed).padStart(3, '0');
    hudAltitude.textContent = String(event.altitude).padStart(3, '0');
    boostBar.style.width = `${event.boost}%`;
    if (game.getVisualStyle() === 'realistic') {
      const windSpeed = event.windSpeed ?? 0;
      const pitch = event.pitchDeg ?? 0;
      const roll = event.rollDeg ?? 0;
      const lat = (-23.5489 + (event.gpsZ ?? 0) * 0.0001).toFixed(4);
      const lon = (-46.6388 + (event.gpsX ?? 0) * 0.0001).toFixed(4);
      osdGps.textContent = `GPS ${lat}, ${lon}`;
      osdWind.textContent = `VENTO ${String(windSpeed).padStart(2, '0')} KM/H`;
      const pSign = pitch >= 0 ? '+' : '';
      const rSign = roll >= 0 ? '+' : '';
      osdAttitude.textContent = `PITCH ${pSign}${pitch}° · ROLL ${rSign}${roll}°`;
      osdHorizonLine.style.transform = `translateY(${Math.max(-28, Math.min(28, pitch * 1.1))}px) rotate(${-roll}deg)`;
    }
    if (event.ammo === null || event.ammo === undefined) {
      osdAmmo.textContent = 'MUN ∞ PLASMA';
    } else if (event.reloading) {
      osdAmmo.textContent = 'RECARREGANDO... [R]';
    } else {
      osdAmmo.textContent = `MUN ${String(event.ammo).padStart(2, '0')}/${event.maxAmmo ?? 90} [R]`;
    }
  }
  if (event.type === 'score') hudScore.textContent = String(event.value).padStart(4, '0');
  if (event.type === 'damage') {
    hudShield.textContent = `${event.shield}%`;
    shieldBar.style.width = `${event.shield}%`;
    if (event.shield < 100) {
      damageFlash.classList.add('visible');
      window.clearTimeout(damageTimer);
      damageTimer = window.setTimeout(() => damageFlash.classList.remove('visible'), 170);
    }
    if (event.shield <= 0 && state === 'playing') finishMission(false);
  }
  if (event.type === 'gate') {
    const target = event.target ?? mission.objectiveTarget;
    hudProgress.style.width = `${Math.min(100, (event.count / target) * 100)}%`;
    const activeTask = game.getActiveOpenWorldTask();
    if (activeTask) {
      hudObjective.textContent = `${activeTask.name.toUpperCase()} · ${event.count}/${target} BALIZAS`;
    } else if (mission.objectiveKind === 'gates') {
      hudObjective.textContent = `BALIZAS SINCRONIZADAS · ${event.count}/${mission.objectiveTarget}`;
      if (event.count >= mission.objectiveTarget && state === 'playing') finishMission(true);
    }
  }
  if (event.type === 'enemyDestroyed') {
    const target = event.target ?? mission.objectiveTarget;
    const activeTask = game.getActiveOpenWorldTask();
    if (activeTask && activeTask.kind === 'kills') {
      hudProgress.style.width = `${Math.min(100, (event.count / target) * 100)}%`;
      hudObjective.textContent = `${activeTask.name.toUpperCase()} · ${event.count}/${target} HOSTIS`;
    } else if (!activeTask && mission.objectiveKind === 'kills') {
      hudProgress.style.width = `${Math.min(100, (event.count / mission.objectiveTarget) * 100)}%`;
      hudObjective.textContent = `HOSTIS NEUTRALIZADOS · ${event.count}/${mission.objectiveTarget}`;
      if (event.count >= mission.objectiveTarget && state === 'playing') finishMission(true);
    }
  }
  if (event.type === 'objectiveProgress') {
    const activeTask = game.getActiveOpenWorldTask();
    hudObjective.textContent = activeTask
      ? `${activeTask.name.toUpperCase()} · ${event.hudText}`
      : event.hudText;
    hudProgress.style.width = `${Math.round(event.fraction * 100)}%`;
    if (!activeTask && state === 'playing') {
      if (event.status === 'completed') finishMission(true);
      else if (event.status === 'failed') finishMission(false);
    }
  }
  if (event.type === 'boss') {
    bossBar.classList.add('visible');
    const title = game.getActiveOpenWorldTask()?.name.toUpperCase() ?? mission.name.toUpperCase();
    bossPhase.textContent = `${title} // FASE 0${event.phase}`;
    bossState.textContent = event.exposed ? 'JANELA CRÍTICA — ATAQUE AGORA' : 'BLINDAGEM ATIVA — DESVIE DAS RAJADAS';
    bossFill.style.width = `${Math.round(event.hp * 100)}%`;
    hudProgress.style.width = `${Math.round((1 - event.hp) * 100)}%`;
  }
  if (event.type === 'bossDestroyed' && state === 'playing') {
    bossFill.style.width = '0%';
    hudProgress.style.width = '100%';
    finishMission(true);
  }
  if (event.type === 'openWorldTaskStarted') {
    hudMissionCode.textContent = `${event.task.code} · ${event.task.district.toUpperCase()}`;
    hudObjective.textContent = event.task.objective.toUpperCase();
    hudProgress.style.width = '0%';
    bossBar.classList.toggle('visible', event.task.kind === 'boss');
    audio.setScene(event.task.kind === 'boss' ? 'boss' : 'combat');
    renderOpenWorldHud();
  }
  if (event.type === 'openWorldTaskCompleted') {
    if (!extras.completedTasks.includes(event.task.id as OpenWorldTaskId)) {
      extras.completedTasks.push(event.task.id as OpenWorldTaskId);
    }
    const taskCredits = Math.round(event.task.rewardPoints * 0.45);
    hangarSave.credits += taskCredits;
    hangarSave.totalCreditsEarned += taskCredits;
    saveHangarSave(hangarSave);
    extras.bestScore = Math.max(extras.bestScore, event.totalScore);
    saveExtras(extras);
    bossBar.classList.remove('visible');
    const tasks = activeOpenWorldTasks();
    const done = tasks.filter((t) => extras.completedTasks.includes(t.id)).length;
    hudMissionCode.textContent = mission.code;
    hudObjective.textContent = `TASKS CONCLUÍDAS: ${done} / ${tasks.length} · +CR$ ${taskCredits}`;
    hudProgress.style.width = `${(done / Math.max(1, tasks.length)) * 100}%`;
    audio.setScene('combat');
    renderSpecialPills();
    renderOpenWorldHud();
  }
  if (event.type === 'openWorldFreeRoam') {
    bossBar.classList.remove('visible');
    const tasks = activeOpenWorldTasks();
    const done = tasks.filter((t) => extras.completedTasks.includes(t.id)).length;
    hudMissionCode.textContent = mission.code;
    hudObjective.textContent = `VOO LIVRE · ${done}/${tasks.length} TASKS CONCLUÍDAS`;
    hudProgress.style.width = `${(done / Math.max(1, tasks.length)) * 100}%`;
    audio.setScene('combat');
    renderOpenWorldHud();
  }
  if (event.type === 'warning') {
    warningBanner.textContent = event.boss
      ? `CHEFE · ${warningPatternLabel(event.pattern)}`
      : `ALERTA · ${warningPatternLabel(event.pattern)}`;
    warningBanner.classList.add('visible');
    window.clearTimeout(warningTimer);
    warningTimer = window.setTimeout(() => warningBanner.classList.remove('visible'), 820);
  }
  if (event.type === 'nearMiss') {
    hudScore.textContent = String(event.score).padStart(4, '0');
    showToast(`ESQUIVA RASANTE +${event.points}`);
  }
  if (event.type === 'hitConfirmed') {
    hitMarker.classList.add('visible');
    window.clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => hitMarker.classList.remove('visible'), 110);
  }
  if (event.type === 'lock') {
    reticle.classList.toggle('locked', event.locked);
    lockLabel.textContent = event.locked ? 'ALVO TRAVADO // DISPARO ASSISTIDO' : 'SISTEMA DE MIRA ATIVO';
  }
  if (event.type === 'toast') showToast(event.text);
}

globalStyleRealisticBtn.addEventListener('click', () => {
  audio.unlock();
  setGlobalStyle('realistic');
});
globalStyleFuturisticBtn.addEventListener('click', () => {
  audio.unlock();
  setGlobalStyle('futuristic');
});

byId('hub-campaign-button').addEventListener('click', () => openStyleChoiceModal('campaign'));
q('#openworld-mode-button').addEventListener('click', () => openStyleChoiceModal('openworld'));
byId('openworld-style-button').addEventListener('click', () => openStyleChoiceModal('openworld'));
q('#river-mode-button').addEventListener('click', () => openStyleChoiceModal('river'));

byId('campaign-back-hub').addEventListener('click', () => showMenuSubview('hub'));

q('#continue-button').addEventListener('click', () => {
  const latest = latestCampaignMissionForStyle(currentStyle);
  selectedMission = latest;
  selectedScenario = latest;
  renderMissionList();
  renderSelectedMission();
  openBriefing(latest);
});
q('#launch-button').addEventListener('click', () => openBriefing(selectedMission));

byId('river-select-realistic').addEventListener('click', () => selectModalStyle('realistic'));
byId('river-select-futuristic').addEventListener('click', () => selectModalStyle('futuristic'));
byId('river-cancel-button').addEventListener('click', () => riverStyleModal.classList.remove('active'));
byId('river-confirm-button').addEventListener('click', () => confirmStyleChoiceModal());

// Hangar & Upgrades Modals
['hangar-top-button', 'hub-hangar-button', 'campaign-hangar-button', 'aside-hangar-button', 'result-hangar-button'].forEach((id) => {
  byId(id).addEventListener('click', () => openHangarModal(currentStyle));
});
byId('upgrades-back-hangar').addEventListener('click', () => {
  upgradesModal.classList.remove('active');
  openHangarModal(droneById(inspectingUpgradeDroneId).style);
});
['upgrades-top-button', 'hub-upgrades-button', 'campaign-upgrades-button', 'aside-upgrades-button', 'result-upgrades-button'].forEach((id) => {
  byId(id).addEventListener('click', () => openUpgradesModal(hangarSave.selectedDroneByStyle[currentStyle]));
});
byId('hangar-open-upgrades-button').addEventListener('click', () => {
  hangarModal.classList.remove('active');
  openUpgradesModal(hangarSave.selectedDroneByStyle[hangarTabStyle]);
});
byId('hangar-tab-realistic').addEventListener('click', () => {
  hangarTabStyle = 'realistic';
  renderHangarModal();
});
byId('hangar-tab-futuristic').addEventListener('click', () => {
  hangarTabStyle = 'futuristic';
  renderHangarModal();
});
byId('hangar-close-button').addEventListener('click', () => hangarModal.classList.remove('active'));
byId('upgrades-close-button').addEventListener('click', () => upgradesModal.classList.remove('active'));

byId('briefing-back').addEventListener('click', () => setState('menu'));
byId('briefing-start').addEventListener('click', startMission);
byId('ow-abort-task').addEventListener('click', () => game.cancelOpenWorldTask());
byId('ow-finish-session').addEventListener('click', () => finishMission(true));

byId('hud-pause').addEventListener('click', () => setState('paused'));
byId('hud-mute').addEventListener('click', () => {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  byId('hud-mute').textContent = save.muted ? 'MUDO' : 'SOM';
  saveData(save);
});
byId('pause-resume').addEventListener('click', () => setState('playing'));
byId('pause-restart').addEventListener('click', () => {
  setState('briefing');
  startMission();
});
byId('pause-menu').addEventListener('click', () => {
  window.clearInterval(timerHandle);
  setState('menu');
});
byId('result-menu').addEventListener('click', () => setState('menu'));
byId('result-retry').addEventListener('click', () => {
  setState('briefing');
  startMission();
});
q('#settings-button').addEventListener('click', () => settingsModal.classList.add('active'));
byId('hub-settings-button').addEventListener('click', () => settingsModal.classList.add('active'));
byId('settings-close').addEventListener('click', () => settingsModal.classList.remove('active'));
volumeRange.addEventListener('input', () => {
  save.volume = Number(volumeRange.value) / 100;
  audio.setVolume(save.volume);
  saveData(save);
});
document.querySelectorAll<HTMLElement>('.theme-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const theme = chip.dataset.theme;
    if (theme === 'cyan' || theme === 'crimson' || theme === 'gold') setTheme(theme);
  });
});
document.querySelectorAll<HTMLElement>('.quality-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const qVal = chip.dataset.quality;
    if (qVal === 'low' || qVal === 'medium' || qVal === 'high' || qVal === 'auto') {
      setQuality(qVal);
    }
  });
});
byId('reset-progress').addEventListener('click', () => {
  save.unlocked = 1;
  save.records = {};
  realisticSave.unlocked = 1;
  realisticSave.records = {};
  extras.completedTasks = [];
  extras.bestScore = 0;
  Object.assign(hangarSave, defaultHangarSave());
  saveHangarSave(hangarSave);
  selectedMission = latestCampaignMissionForStyle(currentStyle);
  selectedScenario = selectedMission;
  saveData(save);
  saveRealisticCampaign(realisticSave);
  saveExtras(extras);
  syncEquippedDroneToGame(currentStyle);
  renderMissionList();
  renderSelectedMission();
  renderSpecialPills();
});

owToggleListBtn.addEventListener('click', () => {
  owToggleListBtn.blur();
  owTaskListExpanded = !owTaskListExpanded;
  renderOpenWorldHud();
});

function setFlightModel(model: FlightModel): void {
  save.flightModel = model;
  extras.flightModel = model;
  game.setFlightModel(model);
  saveData(save);
  saveExtras(extras);
  document.querySelectorAll<HTMLElement>('.flight-chip').forEach((chip) => {
    chip.classList.toggle('selected', chip.dataset.flightModel === model);
  });
}

document.querySelectorAll<HTMLElement>('.flight-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const fVal = chip.dataset.flightModel;
    if (fVal === 'arcade' || fVal === 'sim') {
      setFlightModel(fVal);
    }
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && isOpenWorldScenario(selectedScenario) && state === 'playing') {
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    owTaskListExpanded = !owTaskListExpanded;
    renderOpenWorldHud();
  }
});

setTheme(save.theme);
setQuality(extras.quality ?? 'auto');
setFlightModel(save.flightModel ?? 'arcade');
setGlobalStyle(currentStyle);
showMenuSubview('hub');

document.addEventListener('click', () => {
  if (state === 'playing') {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  }
});

