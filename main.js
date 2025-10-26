/**
 * Revival Guild Phase 1 prototype main script.
 * Handles state management, UI rendering, and persistence for the mini prototype.
 */

const DEBUG_MODE = typeof window !== 'undefined' && window.location.search.includes('debug=1');

const CONFIG = {
  START_GOLD: 500,
  START_YEAR: 21,
  START_MONTH: 4,
  MERC_POOL_SIZE: 5,
  MERC_SIGN_MIN: 20,
  MERC_SIGN_MAX: 120,
  MERC_WAGE_MIN: 5,
  MERC_WAGE_MAX: 40,
  STAT_MIN: 1,
  STAT_MAX: 10,
  QUEST_SLOTS: 3,
  QUEST_VISIBLE_TURNS_MIN: 1,
  QUEST_VISIBLE_TURNS_MAX: 4,
  QUEST_REWARD_MIN: 50,
  QUEST_REWARD_MAX: 200,
  QUEST_TURNS_MIN: 5,
  QUEST_TURNS_MAX: 12,
  RECRUIT_ONCE_PER_TURN: true,
  ASSET_BG: 'assets/bg/medieval.jpg',
  ASSET_MERC: (mercId) => `assets/mercs/${mercId}.jpg`,
  ASSET_DUNGEON_THUMB: 'assets/monsters/dungeon.jpg',
  LOG_LIMIT: 12,
  SMALL_INJURY_PROB: 0.12,
  QUEST_JOURNAL_LIMIT: 4,
  STANCE: {
    meticulous: {
      overdueProbPerTurn: 0.15,
      bonusLootProbPerTurn: 0.25,
      bonusGoldRange: [5, 20],
      repPenaltyBase: 2,
      repGainCoef: 1.1
    },
    on_time: {
      overdueProbPerTurn: 0.03,
      bonusLootProbPerTurn: 0.05,
      bonusGoldRange: [0, 8],
      repPenaltyBase: 0,
      repGainCoef: 1.0
    }
  },
  BID_TEMP: 0.35,
  WEIGHTS_BY_IMPORTANCE: {
    gold: { bid: 0.7, stats: 0.15, rep: 0.15 },
    reputation: { bid: 0.2, stats: 0.35, rep: 0.45 },
    stats: { bid: 0.25, stats: 0.55, rep: 0.2 }
  },
  REP_MIN: 0,
  REP_MAX: 100
};

const QUEST_CONFIG = {
  spawnRate: 0.6,
  rewardMultiplier: {
    S: 1.85,
    A: 1.4,
    B: 1.1,
    C: 0.85
  }
};

const FIRST_NAMES = ['Egon', 'Lira', 'Bran', 'Kara', 'Sven', 'Toma', 'Nia', 'Roth', 'Elda', 'Finn', 'Mara', 'Ivo', 'Cael', 'Rina', 'Dane'];
const CLAN_NAMES = ['Stone', 'Ash', 'Rook', 'Vale', 'Gale', 'Holt', 'Ember', 'Reed', 'Crow', 'Voss', 'Thorn', 'Hale'];
const RARE_SUFFIXES = ['′', '•', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', ' of Vale'];
const SUPERSCRIPT_DIGITS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

const STORAGE_KEY = 'rg_v1_save';

const QUEST_TIER_DISTRIBUTION = [
  { tier: 'S', weight: 0.1 },
  { tier: 'A', weight: 0.25 },
  { tier: 'B', weight: 0.35 },
  { tier: 'C', weight: 0.3 }
];

const QUEST_IMPORTANCE_BY_TIER = {
  S: ['reputation', 'stats'],
  A: ['stats', 'reputation', 'gold'],
  B: ['gold', 'stats', 'reputation'],
  C: ['gold', 'gold', 'stats']
};

const REPUTATION_REWARD_BY_TIER = {
  S: 6,
  A: 4,
  B: 3,
  C: 2
};

const DEFAULT_RIVALS = [
  { id: 'r1', name: 'Iron Fang', rep: 52 },
  { id: 'r2', name: 'Moonlight', rep: 47 },
  { id: 'r3', name: 'Ashen Company', rep: 61 }
];

const guildLevel = 1;

let usedNameRegistry = new Set();
let mercDisplayNameCache = new Map();

const CURRENCY_LOOT_TABLE = [
  { name: '고대 주화 꾸러미', description: '폐허에서 회수한 금빛 주화.', min: 25, max: 70 },
  { name: '연합 교역권', description: '길드 연합 상인에게 통용되는 수표.', min: 40, max: 90 },
  { name: '마나 파편 묶음', description: '연구가들의 관심을 받는 환광 파편.', min: 55, max: 120 }
];

const uiState = {
  activeMainTab: 'quests',
  activeInventoryTab: 'currency',
  backgroundDimmed: false,
  probabilityPreview: DEBUG_MODE,
  showDebugConfig: false
};

/** @type {{start_gold: number, merc_names: string[]}} */
let seedData = { start_gold: CONFIG.START_GOLD, merc_names: [] };

/** @type {GameState & {log: string[]}} */
let state = {
  gold: CONFIG.START_GOLD,
  turn: 1,
  mercs: [],
  quests: [],
  log: [],
  lastRecruitTurn: null,
  reputation: 25,
  rivals: DEFAULT_RIVALS.map((rival) => ({ ...rival })),
  inventory: createEmptyInventory(),
  meta: { usedNames: [] }
};

let currentRecruitCandidates = [];
let currentQuestId = null;
let assetChecklist = [];
let assetChecklistLoading = true;
let lastAssetLogSignature = '';
const tempSelections = {};

function createEmptyInventory() {
  return { equip: [], currency: [], consumable: [] };
}

function ensureMeta() {
  if (!state.meta || typeof state.meta !== 'object') {
    state.meta = { usedNames: [] };
  }
}

function syncUsedNamesToState() {
  ensureMeta();
  state.meta.usedNames = Array.from(usedNameRegistry);
}

function initializeUsedNames() {
  ensureMeta();
  const saved = Array.isArray(state.meta.usedNames) ? state.meta.usedNames : [];
  usedNameRegistry = new Set(saved);
  (Array.isArray(state.mercs) ? state.mercs : []).forEach((merc) => {
    if (merc && typeof merc.name === 'string') {
      usedNameRegistry.add(merc.name);
    }
  });
  syncUsedNamesToState();
  updateMercDisplayNameCache();
}

function recordUsedName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return;
  }
  usedNameRegistry.add(name);
  syncUsedNamesToState();
}

function toSuperscript(number) {
  return String(number)
    .split('')
    .map((char) => SUPERSCRIPT_DIGITS[char] || char)
    .join('');
}

function decorateDuplicateName(baseName, duplicateIndex) {
  if (duplicateIndex < RARE_SUFFIXES.length) {
    return `${baseName}${RARE_SUFFIXES[duplicateIndex]}`;
  }
  return `${baseName}${toSuperscript(duplicateIndex + 2)}`;
}

function generateUniqueMercName() {
  ensureMeta();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const base = `${randomChoice(FIRST_NAMES) || 'Nameless'} ${randomChoice(CLAN_NAMES) || 'Wanderer'}`;
    if (!usedNameRegistry.has(base)) {
      recordUsedName(base);
      return base;
    }
    for (let suffixIndex = 0; suffixIndex < RARE_SUFFIXES.length + 8; suffixIndex += 1) {
      const decorated = decorateDuplicateName(base, suffixIndex);
      if (!usedNameRegistry.has(decorated)) {
        recordUsedName(decorated);
        return decorated;
      }
    }
  }
  const fallback = `Nameless ${toSuperscript(usedNameRegistry.size + 1)}`;
  recordUsedName(fallback);
  return fallback;
}

function updateMercDisplayNameCache() {
  mercDisplayNameCache = new Map();
  const occurrences = new Map();
  (Array.isArray(state.mercs) ? state.mercs : []).forEach((merc) => {
    if (!merc) {
      return;
    }
    const name = typeof merc.name === 'string' ? merc.name : '용병';
    const count = (occurrences.get(name) || 0) + 1;
    occurrences.set(name, count);
    const displayName = count === 1 ? name : decorateDuplicateName(name, count - 2);
    mercDisplayNameCache.set(merc.id, displayName);
  });
}

function getMercDisplayName(merc) {
  if (!merc) {
    return '용병';
  }
  return mercDisplayNameCache.get(merc.id) || merc.name || '용병';
}

const EXPLORATION_SCENARIOS = {
  encounter: ['좁은 복도에서 매복을 뚫고 전진했습니다.', '고블린 순찰대를 분산시키고 길을 확보했습니다.', '갑작스러운 함정과 맞닥뜨렸지만 재빠르게 회피했습니다.'],
  discovery: ['먼지 쌓인 보관실을 발견했습니다.', '숨겨진 측면 통로를 찾아냈습니다.', '고대 문양이 새겨진 문을 조사했습니다.'],
  rest: ['짧은 휴식으로 숨을 고르며 체력을 회복했습니다.', '전투 후 진형을 재정비했습니다.', '조용한 방에서 경계를 세우며 휴식을 취했습니다.'],
  item: ['예비 물약을 사용해 기운을 되찾았습니다.', '보호 부적을 사용해 함정을 무력화했습니다.', '빛나는 횃불을 교체하며 시야를 확보했습니다.']
};

const EXPLORATION_SCENARIO_KEYS = Object.keys(EXPLORATION_SCENARIOS);
const INJURY_MESSAGES = ['작은 찰과상을 입었습니다.', '함정 조각에 살짝 베였습니다.', '체력이 소폭 감소했습니다.', '지친 발걸음으로 속도가 느려졌습니다.'];

const QUEST_TIMELINE_TEMPLATES = {
  camp: [
    '모닥불을 피우고 장비를 정비했습니다.',
    '휴식 중 서약을 나누며 결속을 다졌습니다.',
    '교대로 경계하며 마음을 가다듬었습니다.',
    '수비 진형을 구축하고 피로를 달랬습니다.',
    '감시조와 휴식조를 번갈아 배치해 위험을 낮췄습니다.'
  ],
  boss: ['던전 우두머리의 전리품을 회수했습니다.', '최종 방에서 마지막 저항을 꺾었습니다.', '지휘관을 쓰러뜨리고 던전의 위협을 제거했습니다.'],
  chest: ['밀실에 숨겨진 상자를 열었습니다.', '비밀 저장고에서 귀중품을 획득했습니다.', '봉인 상자를 해제하고 보상을 챙겼습니다.'],
  trap: ['발판이 꺼지며 위험천만한 함정을 통과했습니다.', '독침이 날아왔지만 피해를 최소화했습니다.', '붕괴된 구역을 돌파하며 장비를 손질했습니다.'],
  story: ['던전의 벽화에서 고대 기록을 확인했습니다.', '새로운 통로를 지도에 추가했습니다.', '진행 상황을 기록하며 마음을 다잡았습니다.'],
  fight: ['격렬한 교전을 승리로 이끌었습니다.', '적의 재집결을 저지했습니다.', '위기 상황을 전술로 돌파했습니다.']
};

const QUEST_EVENT_ICONS = {
  trap: '⚠️',
  fight: '⚔️',
  chest: '💎',
  boss: '👑',
  camp: '🔥',
  story: '📜'
};

const RETURN_TALE_TEMPLATES = {
  high: [
    '{{party}}가 무사 귀환하자 시민들의 환호가 이어졌습니다.',
    '광장에서 {{party}}에게 축하의 꽃비가 내렸습니다.',
    '{{party}}의 승전가가 성문을 가득 메웠습니다.'
  ],
  mid: [
    '{{party}}가 작전 보고를 마치고 휴식에 들어갔습니다.',
    '{{party}}가 약탈품을 정리하며 다음 의뢰를 논의했습니다.',
    '{{party}}가 조용한 연회장에서 체력을 회복했습니다.'
  ],
  low: [
    '{{party}}가 조용히 본부로 복귀해 부상자를 살폈습니다.',
    '{{party}}가 들키지 않게 보고서를 남기고 사라졌습니다.',
    '{{party}}가 묵묵히 장비를 정비하며 다음을 준비했습니다.'
  ]
};

const MOOD_TEMPLATES = {
  fatigue: ['[T{{turn}}] {{name}}이(가) 지친 기색을 감추지 못합니다.', '[T{{turn}}] {{name}}: "잠깐만이라도 눈을 붙이면 좋겠군..."'],
  benched: ['[T{{turn}}] {{name}}이(가) 한숨을 쉬며 출전을 갈망합니다.', '[T{{turn}}] {{name}}: "다음 임무엔 반드시 참가하게 해줘."'],
  relationship: ['[T{{turn}}] {{name}}이(가) 길드에 한층 깊은 신뢰를 표했습니다.', '[T{{turn}}] {{name}}: "이번 협력, 잊지 않겠습니다."']
};

const elements = {
  goldValue: document.getElementById('gold-value'),
  mercList: document.getElementById('merc-list'),
  questList: document.getElementById('quest-list'),
  logList: document.getElementById('log-list'),
  reputationValue: document.getElementById('reputation-value'),
  assetList: document.getElementById('missing-assets-list'),
  assetNote: document.getElementById('asset-note'),
  recruitBtn: document.getElementById('recruit-btn'),
  newTurnBtn: document.getElementById('new-turn-btn'),
  questSpawnRate: document.getElementById('quest-spawn-rate'),
  modalOverlay: document.getElementById('modal-overlay'),
  modal: document.getElementById('modal-content'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.getElementById('modal-close'),
  modalReqSummary: document.getElementById('modal-req-summary'),
  modalReqSum: document.getElementById('reqSum'),
  calendarDisplay: document.getElementById('calendar-display'),
  formulaToggle: document.getElementById('board-formula-toggle'),
  formulaContent: document.getElementById('board-formula-content'),
  formulaBox: document.getElementById('board-formula'),
  backgroundToggle: document.getElementById('background-toggle'),
  mainTabs: document.getElementById('main-tabs'),
  mainTabPanels: document.querySelectorAll('[data-tab-panel]'),
  inventoryTabs: document.getElementById('inventory-tabs'),
  inventoryPanels: document.querySelectorAll('[data-inventory-panel]'),
  inventoryEquipList: document.getElementById('inventory-equip'),
  inventoryCurrencyList: document.getElementById('inventory-currency'),
  inventoryConsumableList: document.getElementById('inventory-consumable'),
  questDashboard: document.getElementById('quest-dashboard'),
  probabilityToggle: document.getElementById('probability-preview-toggle'),
  debugConfig: document.getElementById('debug-config'),
  configDump: document.getElementById('config-dump'),
  debugConfigToggle: document.getElementById('debug-config-toggle'),
  debugSaveBtn: document.getElementById('debug-save-btn'),
  debugLoadBtn: document.getElementById('debug-load-btn')
};

/**
 * Initialize the game state from seed data and persistent storage.
 * Loads saved state if present, otherwise seeds a fresh state.
 */
async function init() {
  try {
    const response = await fetch('data/seed.json');
    if (response.ok) {
      seedData = await response.json();
      if (typeof seedData.start_gold === 'number') {
        CONFIG.START_GOLD = seedData.start_gold;
      }
    }
  } catch (error) {
    console.warn('Failed to load seed data, using defaults.', error);
  }

  load();
  bindEvents();
  ensureFoldersNote();
  render();
  await refreshAssetChecklist();

  if (state.quests.length === 0) {
    log('던전 퀘스트가 없습니다. "턴 진행" 버튼으로 새로운 퀘스트를 생성하세요.');
  }
}

document.addEventListener('DOMContentLoaded', init);

/**
 * Attach global event listeners for top-level actions and modal close.
 */
function bindEvents() {
  elements.recruitBtn.addEventListener('click', () => openRecruit());
  elements.newTurnBtn.addEventListener('click', () => newTurn());
  elements.modalClose.addEventListener('click', closeModal);
  if (elements.formulaToggle) {
    elements.formulaToggle.addEventListener('click', toggleBoardFormula);
  }
  if (elements.backgroundToggle) {
    elements.backgroundToggle.addEventListener('click', toggleBackgroundEmphasis);
  }
  if (elements.probabilityToggle) {
    elements.probabilityToggle.addEventListener('click', toggleProbabilityPreview);
  }
  if (elements.debugConfigToggle) {
    elements.debugConfigToggle.addEventListener('click', toggleDebugConfig);
  }
  if (elements.debugSaveBtn) {
    elements.debugSaveBtn.addEventListener('click', handleManualSave);
  }
  if (elements.debugLoadBtn) {
    elements.debugLoadBtn.addEventListener('click', handleManualLoad);
  }
  bindTabNavigation();
  elements.modalOverlay.addEventListener('click', (event) => {
    if (event.target === elements.modalOverlay) {
      closeModal();
    }
  });
}

function resetModalRequirementSummary() {
  if (elements.modalReqSummary) {
    elements.modalReqSummary.classList.add('hidden');
  }
  if (elements.modalReqSum) {
    elements.modalReqSum.innerHTML = '';
  }
}

function computeSelectedStats(mercIds) {
  const totals = { atk: 0, def: 0, stam: 0 };
  if (!Array.isArray(mercIds) || mercIds.length === 0) {
    return totals;
  }
  mercIds.forEach((mercId) => {
    const merc = state.mercs.find((entry) => entry.id === mercId);
    if (!merc) {
      return;
    }
    totals.atk += Number(merc.atk) || 0;
    totals.def += Number(merc.def) || 0;
    totals.stam += Number(merc.stamina) || 0;
  });
  return totals;
}

function bindTabNavigation() {
  const mainButtons = elements.mainTabs
    ? Array.from(elements.mainTabs.querySelectorAll('[data-main-tab]'))
    : [];
  mainButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.mainTab;
      if (tab) {
        switchMainTab(tab);
      }
    });
  });

  const inventoryButtons = elements.inventoryTabs
    ? Array.from(elements.inventoryTabs.querySelectorAll('[data-inventory-tab]'))
    : [];
  inventoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.inventoryTab;
      if (tab) {
        switchInventoryTab(tab);
      }
    });
  });

  updateTabVisibility();
}

function switchMainTab(tabId) {
  if (!tabId) {
    return;
  }
  if (uiState.activeMainTab !== tabId) {
    uiState.activeMainTab = tabId;
  }
  updateTabVisibility();
}

function switchInventoryTab(tabId) {
  if (!tabId) {
    return;
  }
  if (uiState.activeInventoryTab !== tabId) {
    uiState.activeInventoryTab = tabId;
  }
  updateTabVisibility();
}

function updateTabVisibility() {
  const mainButtons = elements.mainTabs
    ? Array.from(elements.mainTabs.querySelectorAll('[data-main-tab]'))
    : [];
  mainButtons.forEach((button) => {
    const key = button.dataset.mainTab;
    button.classList.toggle('is-active', key === uiState.activeMainTab);
  });

  const tabPanels = Array.from(elements.mainTabPanels || []);
  tabPanels.forEach((panel) => {
    const key = panel.dataset.tabPanel;
    panel.classList.toggle('is-active', key === uiState.activeMainTab);
  });

  const inventoryButtons = elements.inventoryTabs
    ? Array.from(elements.inventoryTabs.querySelectorAll('[data-inventory-tab]'))
    : [];
  inventoryButtons.forEach((button) => {
    const key = button.dataset.inventoryTab;
    button.classList.toggle('is-active', key === uiState.activeInventoryTab);
  });

  const inventoryLists = {
    equip: elements.inventoryEquipList,
    currency: elements.inventoryCurrencyList,
    consumable: elements.inventoryConsumableList
  };
  Object.entries(inventoryLists).forEach(([key, list]) => {
    if (list) {
      list.classList.toggle('is-active', key === uiState.activeInventoryTab);
    }
  });
}

function toggleBackgroundEmphasis() {
  uiState.backgroundDimmed = !uiState.backgroundDimmed;
  updatePanelDimming();
}

function toggleProbabilityPreview() {
  uiState.probabilityPreview = !uiState.probabilityPreview;
  renderDebugPanel();
  render();
}

function toggleDebugConfig() {
  uiState.showDebugConfig = !uiState.showDebugConfig;
  renderDebugPanel();
}

function handleManualSave() {
  syncUsedNamesToState();
  save();
  log(`[T${state.turn}] 디버그: 수동 저장을 실행했습니다.`);
  renderDebugPanel();
}

async function handleManualLoad() {
  load();
  render();
  await refreshAssetChecklist();
  log(`[T${state.turn}] 디버그: 저장 데이터를 불러왔습니다.`);
  renderDebugPanel();
}

function updatePanelDimming() {
  const panels = Array.from(document.querySelectorAll('.panel'));
  panels.forEach((panel) => {
    panel.classList.toggle('dimmed', uiState.backgroundDimmed);
  });
  if (elements.backgroundToggle) {
    elements.backgroundToggle.textContent = uiState.backgroundDimmed ? '배경 강조 해제' : '배경 강조';
  }
}

function renderDebugPanel() {
  if (elements.probabilityToggle) {
    const active = uiState.probabilityPreview;
    elements.probabilityToggle.textContent = active ? '확률 프리뷰 끄기' : '확률 프리뷰 켜기';
  }
  if (elements.debugConfigToggle) {
    elements.debugConfigToggle.textContent = uiState.showDebugConfig ? 'CONFIG 숨기기' : 'CONFIG 보기';
  }
  if (elements.debugConfig) {
    const show = uiState.showDebugConfig;
    elements.debugConfig.classList.toggle('hidden', !show);
    if (show && elements.configDump) {
      elements.configDump.textContent = JSON.stringify({ CONFIG, QUEST_CONFIG }, null, 2);
    }
  }
}

function shouldShowProbabilityPreview() {
  return uiState.probabilityPreview || DEBUG_MODE;
}

function renderInventory() {
  if (!state.inventory || typeof state.inventory !== 'object') {
    state.inventory = createEmptyInventory();
  }
  renderInventoryList('equip', state.inventory.equip);
  renderInventoryList('currency', state.inventory.currency);
  renderInventoryList('consumable', state.inventory.consumable);
}

function renderInventoryList(category, items) {
  const listMap = {
    equip: elements.inventoryEquipList,
    currency: elements.inventoryCurrencyList,
    consumable: elements.inventoryConsumableList
  };
  const list = listMap[category];
  if (!list) {
    return;
  }
  list.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'inventory-empty';
    empty.textContent = category === 'currency'
      ? '획득한 재화가 없습니다.'
      : '보관 중인 아이템이 없습니다.';
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const entry = document.createElement('li');
    entry.className = 'inventory-item';

    const details = document.createElement('div');
    details.className = 'inventory-item__details';

    const name = document.createElement('strong');
    name.textContent = item.name || '미상 재화';
    details.appendChild(name);

    if (item.description) {
      const desc = document.createElement('span');
      desc.textContent = item.description;
      details.appendChild(desc);
    }

    const totalValue = Math.max(0, Number(item.value) || 0) * Math.max(1, Number(item.quantity) || 1);
    const valueLine = document.createElement('span');
    valueLine.className = 'inventory-item__value';
    const quantityText = Number(item.quantity) > 1 ? `x${item.quantity} · ` : '';
    valueLine.textContent = `${quantityText}가치 ${totalValue}G`;
    details.appendChild(valueLine);

    entry.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'inventory-item__actions';

    const equipBtn = document.createElement('button');
    equipBtn.className = 'btn btn--primary btn--disabled';
    equipBtn.textContent = '착용';
    equipBtn.disabled = true;
    actions.appendChild(equipBtn);

    const sellBtn = document.createElement('button');
    sellBtn.className = 'btn btn--accent';
    sellBtn.textContent = '판매';
    if (category === 'currency') {
      sellBtn.addEventListener('click', () => sellInventoryItem(item.id));
    } else {
      sellBtn.disabled = true;
      sellBtn.classList.add('btn--disabled');
    }
    actions.appendChild(sellBtn);

    entry.appendChild(actions);
    list.appendChild(entry);
  });
}

function sellInventoryItem(itemId) {
  if (!itemId || !state.inventory || !Array.isArray(state.inventory.currency)) {
    return;
  }
  const index = state.inventory.currency.findIndex((item) => item.id === itemId);
  if (index === -1) {
    return;
  }
  const [item] = state.inventory.currency.splice(index, 1);
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const unitValue = Math.max(0, Number(item.value) || 0);
  const totalValue = unitValue * quantity;
  if (totalValue > 0) {
    state.gold += totalValue;
  }
  log(`[T${state.turn}] 창고 판매: ${item.name}을(를) ${totalValue}G에 판매했습니다.`);
  save();
  render();
}

function getTempQuestDraft(questId) {
  const entry = tempSelections[questId];
  if (!entry) {
    return { mercs: [], stance: null };
  }
  if (Array.isArray(entry)) {
    return { mercs: entry.slice(), stance: null };
  }
  return {
    mercs: Array.isArray(entry.mercs) ? entry.mercs.slice() : [],
    stance: typeof entry.stance === 'string' ? entry.stance : null
  };
}

function setTempQuestDraft(questId, draft) {
  const mercs = Array.isArray(draft?.mercs) ? draft.mercs.slice() : [];
  const stance = typeof draft?.stance === 'string' ? draft.stance : null;
  tempSelections[questId] = { mercs, stance };
}

function clearTempQuestDraft(questId) {
  delete tempSelections[questId];
}

function randomChoice(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  return list[Math.floor(Math.random() * list.length)];
}

function addQuestJournalEntry(quest, message) {
  if (!quest || !message) {
    return;
  }
  if (!Array.isArray(quest.journal)) {
    quest.journal = [];
  }
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) {
    return;
  }
  const alreadyTimed = /^\[T\d+\]/.test(trimmed);
  const entry = alreadyTimed ? trimmed : `[T${state.turn}] ${trimmed}`;
  quest.journal.push(entry);
  if (quest.journal.length > CONFIG.QUEST_JOURNAL_LIMIT) {
    quest.journal = quest.journal.slice(-CONFIG.QUEST_JOURNAL_LIMIT);
  }
}

function formatQuestLogLabel(quest) {
  if (!quest) {
    return '퀘스트';
  }
  return `퀘스트 ${quest.id || ''}`.trim();
}

function getStanceConfig(quest) {
  const stanceKey = quest && typeof quest.stance === 'string' && CONFIG.STANCE[quest.stance]
    ? quest.stance
    : 'meticulous';
  return { key: stanceKey, config: CONFIG.STANCE[stanceKey] };
}

function computeQuestDifficultyWeight(quest) {
  if (!quest || !quest.req) {
    return 1;
  }
  const total = (Number(quest.req.atk) || 0) + (Number(quest.req.def) || 0) + (Number(quest.req.stam) || 0);
  return Math.max(1, Math.ceil(total / 12));
}

function renderTemplate(template, context = {}) {
  if (typeof template !== 'string' || template.length === 0) {
    return '';
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key];
    return value != null ? String(value) : '';
  });
}

function ensureQuestTimeline(quest) {
  if (!quest || typeof quest !== 'object') {
    return;
  }
  if (!Array.isArray(quest.events)) {
    quest.events = [];
  }
  if (!Array.isArray(quest.animKeyTimeline)) {
    quest.animKeyTimeline = [];
  }
  if (typeof quest.campPlaced !== 'boolean') {
    quest.campPlaced = quest.events.some((entry) => entry && entry.type === 'camp');
  }
}

function registerQuestEvent(quest, event) {
  if (!quest || !event) {
    return null;
  }
  ensureQuestTimeline(quest);
  const currentTurn = Number.isFinite(event.turn) ? event.turn : (Number.isFinite(state?.turn) ? state.turn : 0);
  const type = event.type || 'story';
  const text = typeof event.text === 'string' ? event.text : '';
  const animKey = event.animKey || type;
  const entry = { turn: currentTurn, type, text, animKey };
  quest.events.push(entry);
  quest.animKeyTimeline.push(animKey);
  return entry;
}

function generateReturnAnecdote(assignedMercs) {
  const reputation = Number.isFinite(state?.reputation) ? state.reputation : 0;
  const tier = reputation >= 70 ? 'high' : reputation >= 40 ? 'mid' : 'low';
  const pool = RETURN_TALE_TEMPLATES[tier] || RETURN_TALE_TEMPLATES.mid || [];
  const template = randomChoice(pool) || '원정대가 담담히 귀환했습니다.';
  let party = '원정대';
  if (Array.isArray(assignedMercs) && assignedMercs.length > 0) {
    const names = assignedMercs.map((merc) => getMercDisplayName(merc)).filter(Boolean);
    if (names.length <= 2) {
      party = names.join(', ');
    } else {
      const lead = names.slice(0, 2).join(', ');
      party = `${lead} 외 ${names.length - 2}명`;
    }
  }
  return renderTemplate(template, { party });
}

function clampMood(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  return clamp(Math.round(numeric), 0, 100);
}

function updateMercMoodStates(activeAssignments) {
  const moodLogs = [];
  const threshold = { fatigue: 60, benched: 80, relationship: 75 };

  state.mercs.forEach((merc) => {
    if (!merc) {
      return;
    }
    const wasFatigue = clampMood(merc.fatigue);
    const wasBenched = clampMood(merc.benched);
    const wasRelationship = clampMood(merc.relationship);
    const isActive = activeAssignments.has(merc.id);

    const fatigueDelta = isActive ? randomInt(8, 14) : -randomInt(4, 8);
    const relationshipDelta = isActive ? randomInt(2, 5) : -randomInt(0, 3);
    const benchedDelta = isActive ? -randomInt(10, 18) : randomInt(6, 12);

    merc.fatigue = clampMood(wasFatigue + fatigueDelta);
    merc.relationship = clampMood(wasRelationship + relationshipDelta);
    merc.benched = clampMood(wasBenched + benchedDelta);
    if (!Array.isArray(merc.journal)) {
      merc.journal = [];
    }

    const name = getMercDisplayName(merc);
    const context = { name, turn: state.turn };

    if (merc.fatigue >= threshold.fatigue) {
      const template = randomChoice(MOOD_TEMPLATES.fatigue) || '';
      if (template) {
        moodLogs.push(renderTemplate(template, context));
      }
    }
    if (merc.benched >= threshold.benched) {
      const template = randomChoice(MOOD_TEMPLATES.benched) || '';
      if (template) {
        moodLogs.push(renderTemplate(template, context));
      }
    }
    if (merc.relationship >= threshold.relationship) {
      const template = randomChoice(MOOD_TEMPLATES.relationship) || '';
      if (template) {
        moodLogs.push(renderTemplate(template, context));
      }
    }
  });

  return moodLogs;
}

function appendMercJournalEntry(merc, text) {
  if (!merc || !text) {
    return;
  }
  if (!Array.isArray(merc.journal)) {
    merc.journal = [];
  }
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    return;
  }
  const alreadyTimed = /^\[T\d+\]/.test(trimmed);
  const entry = alreadyTimed ? trimmed : `[T${state.turn}] ${trimmed}`;
  merc.journal.push(entry);
  if (merc.journal.length > 8) {
    merc.journal = merc.journal.slice(-8);
  }
}

/**
 * Load state from localStorage, falling back to a freshly seeded state.
 */
function load() {
  const stored = localStorage.getItem(STORAGE_KEY);
  let loadedFromStorage = false;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const normalizedRivals = Array.isArray(parsed.rivals)
        ? normalizeRivals(parsed.rivals)
        : DEFAULT_RIVALS.map((rival) => ({ ...rival }));
      state = {
        gold: Math.max(0, Number(parsed.gold) || CONFIG.START_GOLD),
        turn: Math.max(1, Number(parsed.turn) || 1),
        mercs: Array.isArray(parsed.mercs) ? parsed.mercs.map(normalizeMerc).filter(Boolean) : [],
        quests: Array.isArray(parsed.quests)
          ? parsed.quests.map((quest) => normalizeQuest(quest, normalizedRivals)).filter(Boolean)
          : [],
        log: Array.isArray(parsed.log) ? parsed.log.slice(-CONFIG.LOG_LIMIT) : [],
        lastRecruitTurn: typeof parsed.lastRecruitTurn === 'number' ? parsed.lastRecruitTurn : null,
        reputation: clampRep(Number(parsed.reputation), 25),
        rivals: normalizedRivals,
        inventory: normalizeInventory(parsed.inventory),
        meta: {
          usedNames: Array.isArray(parsed.meta?.usedNames)
            ? parsed.meta.usedNames.filter((name) => typeof name === 'string')
            : []
        }
      };
      loadedFromStorage = true;
    } catch (error) {
      console.warn('Failed to parse stored state, starting fresh.', error);
    }
  }

  if (!loadedFromStorage) {
    state = {
      gold: CONFIG.START_GOLD,
      turn: 1,
      mercs: [],
      quests: [],
      log: [],
      lastRecruitTurn: null,
      reputation: 25,
      rivals: DEFAULT_RIVALS.map((rival) => ({ ...rival })),
      inventory: createEmptyInventory(),
      meta: { usedNames: [] }
    };
  }

  initializeUsedNames();
  ensureQuestSlots();
  if (!loadedFromStorage) {
    spawnQuestsForEmptySlots(true);
    save();
  }
  syncMercBusyFromQuests();
}

/**
 * Persist the current state to localStorage.
 */
function save() {
  syncUsedNamesToState();
  const toSave = {
    gold: state.gold,
    turn: state.turn,
    mercs: state.mercs,
    quests: state.quests,
    log: state.log,
    lastRecruitTurn: state.lastRecruitTurn,
    reputation: state.reputation,
    rivals: state.rivals,
    inventory: state.inventory,
    meta: state.meta
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

/**
 * Render a reminder that assets must be uploaded manually.
 */
function ensureFoldersNote() {
  if (!elements.assetNote) {
    return;
  }
  elements.assetNote.innerHTML = `
    <p>이미지는 직접 업로드가 필요합니다. 아래 경로로 파일을 추가하세요.</p>
    <ul class="asset-note__list">
      <li>배경 → <code>${CONFIG.ASSET_BG}</code></li>
      <li>용병 예: m1 → <code>${CONFIG.ASSET_MERC('m1')}</code></li>
      <li>던전 썸네일 → <code>${CONFIG.ASSET_DUNGEON_THUMB}</code></li>
      <li>업로드 후 하드 리로드(Ctrl+F5 / ⌘+Shift+R)</li>
    </ul>
  `;
}

/**
 * Derive the list of asset paths required by the current state.
 * @returns {string[]}
 */
function computeRequiredAssets() {
  const required = new Set();
  if (CONFIG.ASSET_BG) {
    required.add(CONFIG.ASSET_BG);
  }
  if (state.quests.length > 0 && CONFIG.ASSET_DUNGEON_THUMB) {
    required.add(CONFIG.ASSET_DUNGEON_THUMB);
  }
  state.mercs.forEach((merc) => {
    const mercPath = CONFIG.ASSET_MERC ? CONFIG.ASSET_MERC(merc.id) : null;
    if (mercPath) {
      required.add(mercPath);
    }
  });
  return Array.from(required);
}

/**
 * Check whether each asset path resolves successfully.
 * @param {string[]} paths
 * @returns {Promise<{path: string, exists: boolean}[]>}
 */
async function checkAssetsExistence(paths) {
  const uniquePaths = Array.from(new Set((paths || []).filter(Boolean)));
  if (uniquePaths.length === 0) {
    return [];
  }
  if (typeof Image === 'undefined') {
    return uniquePaths.map((path) => ({ path, exists: false }));
  }

  const checks = uniquePaths.map((path) => new Promise((resolve) => {
    const img = new Image();
    const finalize = (exists) => {
      img.onload = null;
      img.onerror = null;
      resolve({ path, exists });
    };
    img.onload = () => finalize(true);
    img.onerror = () => finalize(false);
    img.src = `${path}?cb=${Date.now()}`;
  }));

  return Promise.all(checks);
}

/**
 * Render the missing assets list using ✅/❌ indicators.
 * @param {{path: string, exists: boolean}[]} list
 */
function renderMissingAssetsPanel(list) {
  if (!elements.assetList) {
    return;
  }
  elements.assetList.innerHTML = '';

  if (!list || list.length === 0) {
    const item = document.createElement('li');
    item.className = 'asset-list__item';
    item.textContent = '확인할 에셋이 없습니다.';
    elements.assetList.appendChild(item);
    return;
  }

  list.forEach(({ path, exists }) => {
    const item = document.createElement('li');
    item.className = `asset-list__item ${exists ? 'asset-list__item--present' : 'asset-list__item--missing'}`;

    const status = document.createElement('span');
    status.textContent = exists ? '✅' : '❌';

    const pathSpan = document.createElement('span');
    pathSpan.className = 'asset-list__path';
    pathSpan.textContent = path;

    item.append(status, pathSpan);
    elements.assetList.appendChild(item);
  });
}

/** Render the current checklist accounting for loading state. */
function renderAssetChecklist() {
  if (!elements.assetList) {
    return;
  }
  if (assetChecklistLoading) {
    elements.assetList.innerHTML = '';
    const loadingItem = document.createElement('li');
    loadingItem.className = 'asset-list__item asset-list__item--loading';
    loadingItem.textContent = '에셋 확인 중...';
    elements.assetList.appendChild(loadingItem);
    return;
  }
  renderMissingAssetsPanel(assetChecklist);
}

/**
 * Log the checklist to the console to mirror the on-screen guidance.
 * @param {{path: string, exists: boolean}[]} list
 */
function reportAssetChecklistToConsole(list) {
  if (!Array.isArray(list)) {
    return;
  }
  const signature = list.map((item) => `${item.path}:${item.exists ? '1' : '0'}`).join('|');
  if (signature === lastAssetLogSignature) {
    return;
  }
  lastAssetLogSignature = signature;
  console.info('📦 Missing Assets Checklist');
  list.forEach(({ path, exists }) => {
    console.info(`${exists ? '✅' : '❌'} ${path}`);
  });
}

/** Refresh the checklist UI and console output. */
async function refreshAssetChecklist() {
  assetChecklistLoading = true;
  renderAssetChecklist();
  const required = computeRequiredAssets();
  assetChecklist = await checkAssetsExistence(required);
  assetChecklistLoading = false;
  applyAssetFallbacks(assetChecklist);
  renderAssetChecklist();
  reportAssetChecklistToConsole(assetChecklist);
}

/** Ensure the UI adapts when required assets are missing. */
function applyAssetFallbacks(list) {
  if (typeof document === 'undefined' || !Array.isArray(list)) {
    return;
  }
  const bgEntry = list.find((item) => item.path === CONFIG.ASSET_BG);
  const hasBackground = bgEntry ? bgEntry.exists : true;
  document.body.classList.toggle('no-bg-asset', !hasBackground);
}

/**
 * Advance the game to a new turn, refreshing all quest slots.
 */
function newTurn() {
  state.turn += 1;
  const completionLogs = [];
  const completionReports = [];
  const expirationLogs = [];
  const explorationLogs = [];
  const delayLogs = [];

  const activeAssignments = new Map();
  (Array.isArray(state.quests) ? state.quests : []).forEach((quest) => {
    if (!quest || quest.deleted || quest.status !== 'in_progress') {
      return;
    }
    if (Array.isArray(quest.assigned_merc_ids)) {
      quest.assigned_merc_ids.forEach((id) => activeAssignments.set(id, quest.id));
    }
  });

  state.quests = (Array.isArray(state.quests) ? state.quests : []).map((quest) => {
    if (!quest || quest.deleted || quest.status === 'empty') {
      return createEmptyQuestSlot(quest);
    }
    if (quest.status === 'in_progress') {
      ensureQuestTimeline(quest);
      const { config: stanceConfig } = getStanceConfig(quest);
      const effectiveConfig = stanceConfig || CONFIG.STANCE.meticulous;
      const currentRemaining = Number.isFinite(quest.remaining_turns) ? quest.remaining_turns : quest.turns_cost;
      const previousProgress = Number.isFinite(quest.progress) ? quest.progress : 0;
      quest.progress = previousProgress + 1;
      quest.remaining_turns = Math.max(0, currentRemaining - 1);
      const deadline = Number.isFinite(quest.deadline_turn) ? quest.deadline_turn : quest.turns_cost;
      if (quest.progress > deadline) {
        quest.overdue = true;
      }
      if (!Number.isFinite(quest.bonusGold)) {
        quest.bonusGold = 0;
      }
      if (!Array.isArray(quest.journal)) {
        quest.journal = [];
      }

      const scenarioType = randomChoice(EXPLORATION_SCENARIO_KEYS) || 'encounter';
      const basePool = EXPLORATION_SCENARIOS[scenarioType] || [];
      const baseMessage = randomChoice(basePool) || '어둠 속을 조심스럽게 전진했습니다.';
      const fragments = [baseMessage];
      const eventType = scenarioType === 'encounter' ? 'fight' : 'story';
      registerQuestEvent(quest, { type: eventType, text: baseMessage, animKey: eventType, turn: state.turn });
      addQuestJournalEntry(quest, baseMessage);

      const range = Array.isArray(effectiveConfig.bonusGoldRange) ? effectiveConfig.bonusGoldRange : [0, 0];
      const bonusMin = Math.max(0, Number(range[0]) || 0);
      const bonusMax = Math.max(bonusMin, Number(range[1]) || bonusMin);
      if (Math.random() < effectiveConfig.bonusLootProbPerTurn) {
        const bonusGold = randomInt(bonusMin, bonusMax);
        if (bonusGold > 0) {
          quest.bonusGold += bonusGold;
          const bonusMessage = `상자 발견 (+${bonusGold}G)`;
          fragments.push(bonusMessage);
          addQuestJournalEntry(quest, bonusMessage);
          registerQuestEvent(quest, { type: 'chest', text: bonusMessage, animKey: 'chest', turn: state.turn });
        }
      }

      if (Math.random() < CONFIG.SMALL_INJURY_PROB) {
        const injuryDetail = randomChoice(INJURY_MESSAGES) || '작은 부상을 입었습니다.';
        const injuryMessage = `작은 부상: ${injuryDetail}`;
        fragments.push(injuryMessage);
        addQuestJournalEntry(quest, injuryMessage);
        registerQuestEvent(quest, { type: 'trap', text: injuryMessage, animKey: 'trap', turn: state.turn });
      }

      if (quest.turns_cost > 6 && !quest.campPlaced) {
        const midpoint = Math.ceil(Math.max(1, Number(quest.turns_cost)) / 2);
        if (quest.progress >= midpoint) {
          const campMessage = randomChoice(QUEST_TIMELINE_TEMPLATES.camp) || '야영지를 마련해 숨을 고르었습니다.';
          quest.campPlaced = true;
          fragments.push(campMessage);
          addQuestJournalEntry(quest, campMessage);
          registerQuestEvent(quest, { type: 'camp', text: campMessage, animKey: 'camp', turn: state.turn });
        }
      }

      const questLabel = formatQuestLogLabel(quest);
      let replacementQuest = quest;
      let completed = false;

      if (quest.remaining_turns <= 0) {
        const shouldDelay = Math.random() < effectiveConfig.overdueProbPerTurn;
        if (shouldDelay) {
          quest.remaining_turns = 1;
          quest.overdue = true;
          const delayMessage = `[T${state.turn}] ${questLabel} 일정 지연: 추가 탐색으로 한 턴이 더 소요됩니다.`;
          delayLogs.push(delayMessage);
          addQuestJournalEntry(quest, '일정 지연: 추가 탐색을 진행합니다.');
          fragments.push('일정 지연으로 탐색을 이어갑니다.');
          registerQuestEvent(quest, {
            type: 'story',
            text: '일정 지연: 추가 탐색을 진행합니다.',
            animKey: 'story',
            turn: state.turn
          });
        } else {
          const bossMessage = randomChoice(QUEST_TIMELINE_TEMPLATES.boss) || '최종 전투를 마무리했습니다.';
          fragments.push(bossMessage);
          addQuestJournalEntry(quest, bossMessage);
          registerQuestEvent(quest, { type: 'boss', text: bossMessage, animKey: 'boss', turn: state.turn });
          const { completionMessage, replacement, lootMessage, report } = finalizeQuest(quest);
          completionLogs.push(completionMessage);
          if (lootMessage) {
            completionLogs.push(lootMessage);
          }
          if (report) {
            completionReports.push(report);
            if (report.returnLog) {
              completionLogs.push(report.returnLog);
            }
          }
          replacementQuest = replacement;
          completed = true;
        }
      }

      explorationLogs.push(`[T${state.turn}] ${questLabel}: ${fragments.join(' / ')}`);
      return replacementQuest;
    }
    if (quest.status === 'bid_failed') {
      return generateQuest();
    }
    if (quest.status === 'ready') {
      const currentVisible = Math.round(Number(quest.remaining_visible_turns));
      const nextVisible = Math.max(0, Number.isFinite(currentVisible) ? currentVisible - 1 : randomVisibleTurns() - 1);
      quest.remaining_visible_turns = nextVisible;
      if (nextVisible <= 0) {
        expirationLogs.push(`[T${state.turn}] 퀘스트 ${quest.id}가 만료되었습니다.`);
        return generateQuest();
      }
      return quest;
    }
    return quest;
  });

  const moodLogs = updateMercMoodStates(activeAssignments);

  spawnQuestsForEmptySlots(false);
  ensureQuestSlots();
  syncMercBusyFromQuests();
  state.lastRecruitTurn = null;
  currentRecruitCandidates = [];

  log(`[T${state.turn}] 새 턴이 시작되었습니다.`);
  moodLogs.forEach((message) => log(message));
  explorationLogs.forEach((message) => log(message));
  delayLogs.forEach((message) => log(message));
  completionLogs.forEach((message) => log(message));
  expirationLogs.forEach((message) => log(message));

  save();
  render();
  if (completionReports.length > 0) {
    openQuestCompletionReportModal(completionReports);
  }
  refreshAssetChecklist();
}

/**
 * Create a random quest.
 * @returns {Quest}
 */
function generateQuest() {
  const tier = rollQuestTier();
  const [minTurns, maxTurns] = tier === 'S' ? [8, 12] : [5, 6];
  const turns_cost = randomInt(minTurns, maxTurns);
  const rewardMultiplier = QUEST_CONFIG.rewardMultiplier[tier] ?? 1;
  const baseReward = randomInt(CONFIG.QUEST_REWARD_MIN, CONFIG.QUEST_REWARD_MAX);
  const reward = Math.max(CONFIG.QUEST_REWARD_MIN, Math.round(baseReward * rewardMultiplier));
  const importance = pickQuestImportance(tier);
  return {
    id: `quest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'dungeon',
    tier,
    importance,
    reward,
    turns_cost,
    req: generateQuestRequirements(turns_cost),
    status: 'ready',
    remaining_turns: 0,
    assigned_merc_ids: [],
    bids: generateQuestBids(reward),
    remaining_visible_turns: randomVisibleTurns(),
    deleted: false,
    stance: null,
    deadline_turn: turns_cost,
    overdue: false,
    progress: 0,
    bonusGold: 0,
    journal: [],
    events: [],
    animKeyTimeline: [],
    campPlaced: false,
    contractProb: createInitialContractProb()
  };
}

function createEmptyQuestSlot(base = {}) {
  return {
    id: typeof base.id === 'string' ? base.id : `empty_${Math.random().toString(36).slice(2, 7)}`,
    type: 'dungeon',
    tier: base.tier || 'C',
    importance: base.importance || 'gold',
    reward: 0,
    turns_cost: 0,
    req: { atk: 0, def: 0, stam: 0 },
    status: 'empty',
    remaining_turns: 0,
    assigned_merc_ids: [],
    bids: { player: undefined, rivals: [], winner: null },
    remaining_visible_turns: 0,
    deleted: true,
    stance: null,
    deadline_turn: 0,
    overdue: false,
    progress: 0,
    bonusGold: 0,
    journal: [],
    events: [],
    animKeyTimeline: [],
    campPlaced: false,
    contractProb: createInitialContractProb()
  };
}

function rollQuestTier() {
  const roll = Math.random();
  let cumulative = 0;
  for (const entry of QUEST_TIER_DISTRIBUTION) {
    cumulative += entry.weight;
    if (roll <= cumulative) {
      return entry.tier;
    }
  }
  return QUEST_TIER_DISTRIBUTION[QUEST_TIER_DISTRIBUTION.length - 1].tier;
}

function pickQuestImportance(tier) {
  const options = QUEST_IMPORTANCE_BY_TIER[tier] || ['gold'];
  const index = Math.floor(Math.random() * options.length);
  return options[Math.max(0, Math.min(options.length - 1, index))];
}

function createInitialContractProb() {
  const base = { player: 0 };
  const rivals = Array.isArray(state?.rivals) && state.rivals.length > 0 ? state.rivals : DEFAULT_RIVALS;
  rivals.forEach((rival) => {
    base[rival.id] = 0;
  });
  return base;
}

function spawnQuestsForEmptySlots(force = false) {
  const rate = Math.min(1, Math.max(0, Number(QUEST_CONFIG.spawnRate) || 0));
  state.quests = (Array.isArray(state.quests) ? state.quests : []).map((quest) => {
    const isEmpty = !quest || quest.deleted || quest.status === 'empty';
    if (!isEmpty) {
      return quest;
    }
    if (force || Math.random() < rate) {
      return generateQuest();
    }
    return createEmptyQuestSlot(quest);
  });
}

function generateQuestBids(reward) {
  const rivals = Array.isArray(state.rivals) && state.rivals.length > 0 ? state.rivals : DEFAULT_RIVALS;
  return {
    player: undefined,
    rivals: rivals.map((rival) => ({ id: rival.id, value: generateRivalBid(reward) })),
    winner: null
  };
}

function generateRivalBid(reward) {
  const multiplier = 0.85 + Math.random() * (1.15 - 0.85);
  const value = Math.round(reward * multiplier);
  return clamp(value, 1, 9999);
}

/**
 * Generate quest requirements based on its difficulty/turn cost.
 * @param {number} turns
 * @returns {{atk: number, def: number, stam: number}}
 */
function generateQuestRequirements(turns) {
  const difficulty = Math.max(1, Number(turns) || 1);
  const base = difficulty * 4;
  return {
    atk: randomInt(Math.max(2, base - 2), base + 3),
    def: randomInt(Math.max(2, base - 3), base + 2),
    stam: randomInt(Math.max(0, base - 4), base + 1)
  };
}

function maybeGenerateQuestLoot(quest) {
  if (!state.inventory || typeof state.inventory !== 'object') {
    state.inventory = createEmptyInventory();
  }
  const dropRoll = Math.random();
  if (dropRoll >= 0.15) {
    return null;
  }
  const lootTable = Array.isArray(CURRENCY_LOOT_TABLE) && CURRENCY_LOOT_TABLE.length > 0
    ? CURRENCY_LOOT_TABLE
    : [{ name: '신비한 재화', description: '', min: 20, max: 60 }];
  const entry = randomChoice(lootTable) || lootTable[0];
  const minValue = Math.max(1, Number(entry.min) || 1);
  const maxValue = Math.max(minValue, Number(entry.max) || minValue);
  const amount = randomInt(minValue, maxValue);
  const item = {
    id: `cur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: entry.name,
    description: entry.description || '',
    value: amount,
    quantity: 1
  };
  state.inventory.currency.push(item);
  return {
    item,
    log: `[T${state.turn}] ${formatQuestLogLabel(quest)}에서 ${item.name}을(를) 확보했습니다. (가치 ${item.value}G)`
  };
}

/**
 * Finalize a quest that has completed this turn.
 * @param {Quest} quest
 * @returns {{completionMessage: string, replacement: Quest, lootMessage: (string|null), report: {id: string, title: string, events: QuestEvent[], animKeyTimeline: string[], returnTale: string, returnLog: string}}}
 */
function finalizeQuest(quest) {
  const assignedMercs = quest.assigned_merc_ids
    .map((id) => state.mercs.find((merc) => merc.id === id))
    .filter(Boolean);

  ensureQuestTimeline(quest);
  const timeline = Array.isArray(quest.events)
    ? quest.events.map((event) => ({
        turn: Number.isFinite(event?.turn) ? event.turn : state.turn,
        type: event?.type || 'story',
        text: typeof event?.text === 'string' ? event.text : '',
        animKey: event?.animKey || event?.type || 'story'
      }))
    : [];
  const animTimeline = Array.isArray(quest.animKeyTimeline) ? quest.animKeyTimeline.slice() : [];

  const totalWages = assignedMercs.reduce((sum, merc) => sum + (merc.wage_per_quest || 0), 0);
  const previousGold = state.gold;
  const contractValue = typeof quest.bids?.player === 'number' ? quest.bids.player : quest.reward;
  const bonusGold = Math.max(0, Number(quest.bonusGold) || 0);
  const finalReward = contractValue + bonusGold;
  const netGain = finalReward - totalWages;
  state.gold = Math.max(0, state.gold + netGain);

  const { config: stanceConfig } = getStanceConfig(quest);
  const penaltyBase = stanceConfig?.repPenaltyBase || 0;
  const difficultyWeight = computeQuestDifficultyWeight(quest);
  const gainBase = REPUTATION_REWARD_BY_TIER[quest.tier] || REPUTATION_REWARD_BY_TIER.C;
  const repGainCoef = stanceConfig?.repGainCoef || 1;
  const repGain = !quest.overdue ? Math.max(0, Math.round(gainBase * repGainCoef)) : 0;
  if (repGain > 0) {
    state.reputation = clampRep(state.reputation + repGain, state.reputation + repGain);
  }
  const repPenalty = quest.overdue ? Math.ceil(Math.max(0, penaltyBase) * difficultyWeight) : 0;
  if (repPenalty > 0) {
    state.reputation = clampRep(state.reputation - repPenalty, state.reputation - repPenalty);
  }

  const statusText = quest.overdue ? '기한 초과' : '기한 준수';
  const repNotes = [];
  if (repGain > 0) {
    repNotes.push(`평판 +${repGain}`);
  }
  if (repPenalty > 0) {
    repNotes.push(`평판 -${repPenalty}`);
  }
  const repNoteText = repNotes.length > 0 ? `, ${repNotes.join(' / ')}` : '';
  const baseMessage = `[T${state.turn}] 완료: ${formatQuestLogLabel(quest)} → ${statusText}, 계약 ${contractValue}G + 보너스 ${bonusGold}G − 임금 ${totalWages}G = ${netGain >= 0 ? '+' : ''}${netGain}G (Gold ${previousGold}→${state.gold})`;

  const lootResult = maybeGenerateQuestLoot(quest);

  const returnTale = generateReturnAnecdote(assignedMercs);
  const questTitle = getQuestDisplayTitle(quest);
  const returnLog = `[T${state.turn}] 귀환 보고: ${returnTale}`;

  assignedMercs.forEach((merc) => {
    merc.busy = false;
    appendMercJournalEntry(merc, `${questTitle} · ${returnTale}`);
  });

  return {
    completionMessage: `${baseMessage}${repNoteText}`,
    replacement: generateQuest(),
    lootMessage: lootResult ? lootResult.log : null,
    report: {
      id: quest.id,
      title: questTitle,
      events: timeline,
      animKeyTimeline: animTimeline,
      returnTale,
      returnLog
    }
  };
}

/** Ensure quest slots are filled up to the configured amount. */
function ensureQuestSlots() {
  const slots = Array.isArray(state.quests) ? state.quests.slice(0, CONFIG.QUEST_SLOTS) : [];
  state.quests = slots.map((quest) => {
    if (!quest || typeof quest !== 'object') {
      return createEmptyQuestSlot();
    }
    if (quest.deleted || quest.status === 'empty') {
      return createEmptyQuestSlot(quest);
    }
    if (!quest.req || typeof quest.req !== 'object') {
      quest.req = generateQuestRequirements(quest.turns_cost || CONFIG.QUEST_TURNS_MIN);
    }
    if (!quest.bids) {
      quest.bids = generateQuestBids(quest.reward);
    } else {
      quest.bids = normalizeQuestBids(quest.bids, quest.reward, state.rivals);
    }
    const visibleValue = Math.round(Number(quest.remaining_visible_turns));
    if (quest.status === 'ready') {
      quest.remaining_visible_turns = clamp(
        Number.isFinite(visibleValue) && visibleValue > 0 ? visibleValue : randomVisibleTurns(),
        CONFIG.QUEST_VISIBLE_TURNS_MIN,
        Math.max(CONFIG.QUEST_VISIBLE_TURNS_MIN, CONFIG.QUEST_VISIBLE_TURNS_MAX)
      );
    } else {
      quest.remaining_visible_turns = Math.max(0, Number.isFinite(visibleValue) ? visibleValue : 0);
    }
    if (!Array.isArray(quest.assigned_merc_ids)) {
      quest.assigned_merc_ids = [];
    }
    quest.tier = typeof quest.tier === 'string' && ['S', 'A', 'B', 'C'].includes(quest.tier) ? quest.tier : rollQuestTier();
    quest.importance = typeof quest.importance === 'string' && CONFIG.WEIGHTS_BY_IMPORTANCE[quest.importance]
      ? quest.importance
      : pickQuestImportance(quest.tier);
    quest.stance = typeof quest.stance === 'string' && CONFIG.STANCE[quest.stance] ? quest.stance : null;
    const defaultDeadline = quest.turns_cost || CONFIG.QUEST_TURNS_MIN;
    const storedDeadline = Number(quest.deadline_turn);
    quest.deadline_turn = Number.isFinite(storedDeadline) && storedDeadline > 0 ? storedDeadline : defaultDeadline;
    quest.overdue = Boolean(quest.overdue);
    quest.progress = Math.max(0, Number(quest.progress) || 0);
    const storedBonus = Number.isFinite(quest.bonusGold) ? quest.bonusGold : quest.tempBonusGold;
    quest.bonusGold = Math.max(0, Number(storedBonus) || 0);
    if (!Array.isArray(quest.journal)) {
      quest.journal = [];
    }
    ensureQuestTimeline(quest);
    quest.contractProb = normalizeContractProb(quest.contractProb, quest.bids, state.rivals);
    quest.deleted = false;
    return quest;
  });
  while (state.quests.length < CONFIG.QUEST_SLOTS) {
    state.quests.push(createEmptyQuestSlot());
  }
}

function normalizeInventory(rawInventory) {
  const normalized = createEmptyInventory();
  if (!rawInventory || typeof rawInventory !== 'object') {
    return normalized;
  }
  if (Array.isArray(rawInventory.equip)) {
    normalized.equip = rawInventory.equip.slice();
  }
  if (Array.isArray(rawInventory.currency)) {
    normalized.currency = rawInventory.currency
      .map(normalizeCurrencyItem)
      .filter(Boolean);
  }
  if (Array.isArray(rawInventory.consumable)) {
    normalized.consumable = rawInventory.consumable.slice();
  }
  return normalized;
}

function normalizeCurrencyItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const value = Math.max(0, Number(item.value) || 0);
  const quantity = Math.max(1, Number(item.quantity) || 1);
  return {
    id: typeof item.id === 'string' ? item.id : `cur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: typeof item.name === 'string' ? item.name : '재화',
    description: typeof item.description === 'string' ? item.description : '',
    value,
    quantity
  };
}

/** Normalize a mercenary object loaded from storage. */
function normalizeMerc(merc) {
  if (!merc || typeof merc !== 'object') {
    return null;
  }
  const grade = typeof merc.grade === 'string' ? merc.grade : 'C';
  const hasName = typeof merc.name === 'string' && merc.name.trim().length > 0;
  const name = hasName ? merc.name : generateUniqueMercName();
  const level = Number.isFinite(merc.level)
    ? Math.max(1, Math.round(merc.level))
    : defaultLevelForGrade(grade);
  const age = Number.isFinite(merc.age)
    ? Math.max(18, Math.round(merc.age))
    : clamp(randomInt(20, 38), 18, 48);
  const fatigue = clampMood(merc.fatigue);
  const relationship = clampMood(merc.relationship || 30);
  const benched = clampMood(merc.benched);
  const journal = Array.isArray(merc.journal)
    ? merc.journal
        .map((entry) => (typeof entry === 'string' ? entry : ''))
        .filter((entry) => entry && entry.trim().length > 0)
        .slice(-8)
    : [];
  return {
    ...merc,
    name,
    grade,
    level,
    age,
    busy: Boolean(merc.busy),
    fatigue,
    relationship,
    benched,
    journal
  };
}

/** Normalize a quest object loaded from storage. */
function normalizeQuest(quest, rivals = DEFAULT_RIVALS) {
  if (!quest || typeof quest !== 'object') {
    return createEmptyQuestSlot();
  }
  if (quest.deleted || quest.status === 'empty') {
    return createEmptyQuestSlot(quest);
  }
  const turns_cost = Math.max(CONFIG.QUEST_TURNS_MIN, Math.min(CONFIG.QUEST_TURNS_MAX, Number(quest.turns_cost) || CONFIG.QUEST_TURNS_MIN));
  const status = quest.status === 'in_progress'
    ? 'in_progress'
    : quest.status === 'bid_failed'
      ? 'bid_failed'
      : 'ready';
  const req = quest.req && typeof quest.req === 'object'
    ? {
        atk: Math.max(0, Number(quest.req.atk) || 0),
        def: Math.max(0, Number(quest.req.def) || 0),
        stam: Math.max(0, Number(quest.req.stam) || 0)
      }
    : generateQuestRequirements(turns_cost);

  const rewardValue = Number(quest.reward);
  const tier = typeof quest.tier === 'string' && ['S', 'A', 'B', 'C'].includes(quest.tier)
    ? quest.tier
    : rollQuestTier();
  const importance = typeof quest.importance === 'string' && CONFIG.WEIGHTS_BY_IMPORTANCE[quest.importance]
    ? quest.importance
    : pickQuestImportance(tier);

  const normalized = {
    id: typeof quest.id === 'string' ? quest.id : `quest_${Math.random().toString(36).slice(2, 8)}`,
    type: typeof quest.type === 'string' ? quest.type : 'dungeon',
    tier,
    importance,
    reward: clamp(isNaN(rewardValue) ? CONFIG.QUEST_REWARD_MIN : rewardValue, CONFIG.QUEST_REWARD_MIN, CONFIG.QUEST_REWARD_MAX),
    turns_cost,
    req,
    status,
    remaining_turns: status === 'in_progress'
      ? Math.max(0, Number(quest.remaining_turns) || turns_cost)
      : 0,
    assigned_merc_ids: Array.isArray(quest.assigned_merc_ids) && status === 'in_progress' ? quest.assigned_merc_ids : [],
    journal: Array.isArray(quest.journal)
      ? quest.journal
          .map((entry) => (typeof entry === 'string' ? entry : ''))
          .filter((entry) => entry && entry.trim().length > 0)
          .slice(-CONFIG.QUEST_JOURNAL_LIMIT)
      : []
  };
  if (typeof quest.started_turn === 'number') {
    normalized.started_turn = quest.started_turn;
  }
  normalized.bids = normalizeQuestBids(quest.bids, normalized.reward, rivals);
  if (status === 'bid_failed') {
    normalized.remaining_turns = 0;
    normalized.assigned_merc_ids = [];
  }
  const events = Array.isArray(quest.events)
    ? quest.events.map((event) => ({
        turn: Number.isFinite(event?.turn) ? event.turn : normalized.started_turn || state.turn || 0,
        type: event?.type || 'story',
        text: typeof event?.text === 'string' ? event.text : '',
        animKey: event?.animKey || event?.type || 'story'
      }))
    : [];
  normalized.events = events;
  normalized.animKeyTimeline = Array.isArray(quest.animKeyTimeline)
    ? quest.animKeyTimeline.filter((key) => typeof key === 'string' && key.trim().length > 0)
    : [];
  normalized.campPlaced = Boolean(quest.campPlaced) || events.some((event) => event.type === 'camp');
  const visibleValue = Math.round(Number(quest.remaining_visible_turns));
  if (status === 'ready') {
    normalized.remaining_visible_turns = clamp(
      Number.isFinite(visibleValue) && visibleValue > 0 ? visibleValue : randomVisibleTurns(),
      CONFIG.QUEST_VISIBLE_TURNS_MIN,
      Math.max(CONFIG.QUEST_VISIBLE_TURNS_MIN, CONFIG.QUEST_VISIBLE_TURNS_MAX)
    );
  } else {
    normalized.remaining_visible_turns = Math.max(0, Number.isFinite(visibleValue) ? visibleValue : 0);
  }
  normalized.deleted = false;
  normalized.stance = typeof quest.stance === 'string' && CONFIG.STANCE[quest.stance] ? quest.stance : null;
  const storedDeadline = Number(quest.deadline_turn);
  normalized.deadline_turn = Number.isFinite(storedDeadline) && storedDeadline > 0 ? storedDeadline : turns_cost;
  normalized.overdue = Boolean(quest.overdue);
  normalized.progress = Math.max(0, Number(quest.progress) || 0);
  const storedBonus = Number.isFinite(quest.bonusGold) ? quest.bonusGold : quest.tempBonusGold;
  normalized.bonusGold = Math.max(0, Number(storedBonus) || 0);
  normalized.journal = Array.isArray(quest.journal) ? quest.journal.slice(-CONFIG.QUEST_JOURNAL_LIMIT) : [];
  normalized.contractProb = normalizeContractProb(quest.contractProb, normalized.bids, rivals);
  return normalized;
}

function normalizeQuestBids(bids, reward, rivals = DEFAULT_RIVALS) {
  const rivalMap = new Map(rivals.map((rival) => [rival.id, rival]));
  const normalizedRivals = Array.isArray(bids?.rivals)
    ? bids.rivals
        .map((entry) => {
          const id = typeof entry.id === 'string' ? entry.id : null;
          if (!id || !rivalMap.has(id)) {
            return null;
          }
          return {
            id,
            value: clamp(Math.round(Number(entry.value) || reward), 1, 9999)
          };
        })
        .filter(Boolean)
    : [];

  rivals.forEach((rival) => {
    if (!normalizedRivals.some((entry) => entry.id === rival.id)) {
      normalizedRivals.push({ id: rival.id, value: generateRivalBid(reward) });
    }
  });

  const rivalOrder = new Map(rivals.map((rival, index) => [rival.id, index]));
  normalizedRivals.sort((a, b) => {
    const aIndex = rivalOrder.has(a.id) ? rivalOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bIndex = rivalOrder.has(b.id) ? rivalOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });

  const playerBid = typeof bids?.player === 'number' ? clamp(Math.round(bids.player), 1, 9999) : undefined;
  const winner = bids?.winner && typeof bids.winner === 'object'
    ? {
        type: bids.winner.type === 'rival' ? 'rival' : 'player',
        id: bids.winner.type === 'rival' && typeof bids.winner.id === 'string' ? bids.winner.id : 'player',
        value: typeof bids.winner.value === 'number' ? clamp(Math.round(bids.winner.value), 1, 9999) : (playerBid || null)
      }
    : null;

  return {
    player: playerBid,
    rivals: normalizedRivals,
    winner
  };
}

function normalizeContractProb(contractProb, bids, rivals = DEFAULT_RIVALS) {
  const normalized = { player: 0 };
  const rivalList = Array.isArray(rivals) && rivals.length > 0 ? rivals : DEFAULT_RIVALS;
  rivalList.forEach((rival) => {
    normalized[rival.id] = 0;
  });

  if (contractProb && typeof contractProb === 'object') {
    Object.keys(normalized).forEach((key) => {
      const value = Number(contractProb[key]);
      if (Number.isFinite(value)) {
        normalized[key] = clamp(value, 0, 1);
      }
    });
  }

  if (Array.isArray(bids?.rivals)) {
    bids.rivals.forEach((entry) => {
      if (!(entry.id in normalized)) {
        normalized[entry.id] = 0;
      }
    });
  }

  return normalized;
}

function normalizeRivals(rivals) {
  return rivals
    .map((rival) => {
      if (!rival || typeof rival !== 'object') {
        return null;
      }
      return {
        id: typeof rival.id === 'string' ? rival.id : `r${Math.random().toString(36).slice(2, 6)}`,
        name: typeof rival.name === 'string' ? rival.name : 'Rival Guild',
        rep: clampRep(Number(rival.rep), DEFAULT_RIVALS[0]?.rep || CONFIG.REP_MIN)
      };
    })
    .filter(Boolean);
}

/** Sync merc busy flags from quests in progress. */
function syncMercBusyFromQuests() {
  const busyIds = new Set();
  state.quests.forEach((quest) => {
    if (quest && !quest.deleted && quest.status === 'in_progress') {
      quest.assigned_merc_ids.forEach((id) => busyIds.add(id));
    }
  });
  state.mercs.forEach((merc) => {
    merc.busy = busyIds.has(merc.id);
  });
}

/**
 * Open the recruit modal with a persistent pool of candidate mercenaries.
 */
function openRecruit() {
  if (CONFIG.RECRUIT_ONCE_PER_TURN && state.lastRecruitTurn === state.turn) {
    log(`[T${state.turn}] 이번 턴에는 이미 용병 모집을 진행했습니다.`);
    return;
  }

  if (state.lastRecruitTurn !== state.turn || currentRecruitCandidates.length === 0) {
    currentRecruitCandidates = Array.from({ length: CONFIG.MERC_POOL_SIZE }, () => ({ ...generateMerc(), hired: false }));
  }

  state.lastRecruitTurn = state.turn;
  save();

  elements.modalTitle.textContent = '용병 모집';
  renderRecruitModalBody();
  openModal();
  render();
}

/** Render the recruit modal body based on current candidates. */
function renderRecruitModalBody() {
  resetModalRequirementSummary();
  elements.modalBody.innerHTML = '';

  const description = document.createElement('p');
  description.textContent = '고용할 용병을 선택하세요. 계약금이 즉시 차감됩니다.';
  description.className = 'modal-description';
  elements.modalBody.appendChild(description);

  currentRecruitCandidates.forEach((candidate) => {
    const card = document.createElement('div');
    card.className = 'recruit-card';
    if (candidate.hired) {
      card.classList.add('recruit-card--sold');
    }

    const portrait = createPortraitElement(candidate);

    const body = document.createElement('div');
    body.className = 'recruit-card__body';

    const header = document.createElement('div');
    header.className = 'recruit-card__header';
    const name = document.createElement('strong');
    name.textContent = `${candidate.name} [${candidate.grade}]`;
    const cost = document.createElement('span');
    cost.textContent = `계약금 ${candidate.signing_bonus}G`;
    header.append(name, cost);

    const stats = document.createElement('div');
    stats.className = 'merc-card__stats';
    stats.innerHTML = `ATK ${candidate.atk} · DEF ${candidate.def} · STAM ${candidate.stamina} · 임금 ${candidate.wage_per_quest}G`;

    const hireBtn = document.createElement('button');
    hireBtn.className = 'btn btn--accent';
    hireBtn.textContent = candidate.hired ? 'SOLD OUT' : '고용하기';
    hireBtn.disabled = candidate.hired;
    if (candidate.hired) {
      hireBtn.classList.add('btn--disabled');
    } else {
      hireBtn.addEventListener('click', () => hireMerc(candidate.id));
    }

    body.append(header, stats, hireBtn);
    card.append(portrait, body);
    elements.modalBody.appendChild(card);
  });
}

/**
 * Attempt to hire a mercenary and deduct the signing bonus.
 * @param {string} mercId
 */
function hireMerc(mercId) {
  const candidate = currentRecruitCandidates.find((merc) => merc.id === mercId);
  if (!candidate || candidate.hired) {
    return;
  }

  if (state.gold < candidate.signing_bonus) {
    log(`[T${state.turn}] 골드가 부족하여 ${candidate.name} 용병을 고용할 수 없습니다.`);
    return;
  }

  state.gold -= candidate.signing_bonus;
  candidate.hired = true;
  const hiredMerc = { ...candidate };
  delete hiredMerc.hired;
  state.mercs.push(hiredMerc);
  log(`[T${state.turn}] ${candidate.name} [${candidate.grade}] 용병을 고용했습니다. 계약금 ${candidate.signing_bonus}G 지급.`);
  save();
  render();
  renderRecruitModalBody();
  refreshAssetChecklist();
}

/**
 * Open the modal to assign mercenaries to a quest.
 * @param {string} questId
 */
function openQuestAssignModal(questId) {
  const quest = state.quests.find((q) => q.id === questId);
  if (!quest) {
    log('선택한 퀘스트를 찾을 수 없습니다.');
    return;
  }

  if (quest.deleted || quest.status === 'empty') {
    log('이 슬롯에는 진행 가능한 퀘스트가 없습니다.');
    return;
  }

  if (state.mercs.length === 0) {
    log('투입할 용병이 없습니다. 먼저 용병을 고용하세요.');
    return;
  }

  if (quest.status !== 'ready') {
    if (quest.status === 'bid_failed') {
      log(`[T${state.turn}] 이 퀘스트는 이미 다른 길드가 낙찰했습니다.`);
      return;
    }
    log(`[T${state.turn}] 이 퀘스트는 현재 진행 중입니다.`);
    return;
  }

  currentQuestId = questId;
  const statOrder = ['atk', 'def', 'stam'];
  const statLabels = { atk: 'ATK', def: 'DEF', stam: 'STAM' };
  const requirements = quest.req || { atk: 0, def: 0, stam: 0 };
  const draft = getTempQuestDraft(questId);
  const savedSelection = Array.isArray(draft.mercs) ? draft.mercs : [];
  const initialSelection = savedSelection.filter((mercId) => {
    const merc = state.mercs.find((entry) => entry.id === mercId);
    return merc && !merc.busy;
  });
  const stanceDraft = typeof draft.stance === 'string' ? draft.stance : null;
  setTempQuestDraft(questId, { mercs: initialSelection, stance: stanceDraft });
  const currentDraft = getTempQuestDraft(questId);

  elements.modalTitle.textContent = '용병 배치';
  elements.modalBody.innerHTML = '';

  if (elements.modalReqSummary) {
    elements.modalReqSummary.classList.remove('hidden');
    elements.modalReqSummary.innerHTML = '';
  }
  if (elements.modalReqSum) {
    elements.modalReqSum.textContent = '선택 합계 → ';
  }
  if (elements.modalReqSummary && elements.modalReqSum) {
    elements.modalReqSummary.appendChild(elements.modalReqSum);
  }

  const summary = document.createElement('p');
  summary.textContent = `보상 ${quest.reward}G, 소모 ${quest.turns_cost} 턴`;
  summary.className = 'modal-description';
  elements.modalBody.appendChild(summary);

  const requirementInfo = document.createElement('p');
  requirementInfo.className = 'modal-highlight req';
  requirementInfo.append('요구 능력치 → ');
  const requirementStatElements = {};
  statOrder.forEach((stat, index) => {
    const span = document.createElement('span');
    span.dataset.stat = stat;
    span.textContent = `${statLabels[stat]} ${requirements[stat] || 0}`;
    requirementInfo.appendChild(span);
    requirementStatElements[stat] = span;
    if (index < statOrder.length - 1) {
      requirementInfo.append(' / ');
    }
  });
  elements.modalBody.appendChild(requirementInfo);

  if (elements.modalReqSummary) {
    requirementInfo.insertAdjacentElement('afterend', elements.modalReqSummary);
  }

  const stanceWrapper = document.createElement('div');
  stanceWrapper.className = 'stance-select';
  const stanceTitle = document.createElement('p');
  stanceTitle.className = 'stance-select__title';
  stanceTitle.textContent = '탐험 성향 선택';
  stanceWrapper.appendChild(stanceTitle);

  const stanceOptions = document.createElement('div');
  stanceOptions.className = 'stance-select__options';

  const stanceConfigs = [
    {
      value: 'meticulous',
      label: '꼼꼼히 탐색',
      description: '보물 탐색에 집중 (추가 보상 ↑, 기한 초과 위험 ↑)'
    },
    {
      value: 'on_time',
      label: '기한 준수',
      description: '계획된 루트 준수 (추가 보상 ↓, 기한 초과 위험 ↓)'
    }
  ];

  const defaultStance = currentDraft.stance || 'meticulous';
  if (!currentDraft.stance) {
    currentDraft.stance = defaultStance;
    setTempQuestDraft(questId, currentDraft);
  }

  stanceConfigs.forEach((config) => {
    const option = document.createElement('label');
    option.className = 'stance-select__option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'quest-stance';
    radio.value = config.value;
    radio.checked = currentDraft.stance === config.value;
    radio.addEventListener('change', () => {
      currentDraft.stance = radio.value;
      setTempQuestDraft(questId, currentDraft);
      updateSelectionUI();
    });

    const textWrapper = document.createElement('div');
    textWrapper.className = 'stance-select__description';
    const label = document.createElement('strong');
    label.textContent = config.label;
    const description = document.createElement('span');
    description.textContent = config.description;
    textWrapper.append(label, description);

    option.append(radio, textWrapper);
    stanceOptions.appendChild(option);
  });

  stanceWrapper.appendChild(stanceOptions);
  elements.modalBody.appendChild(stanceWrapper);

  const list = document.createElement('div');
  list.className = 'assign-list';

  const sumStatElements = {};
  if (elements.modalReqSum) {
    statOrder.forEach((stat, index) => {
      const span = document.createElement('span');
      span.dataset.stat = stat;
      span.textContent = `${statLabels[stat]} 0`;
      elements.modalReqSum.appendChild(span);
      sumStatElements[stat] = span;
      if (index < statOrder.length - 1) {
        elements.modalReqSum.append(' / ');
      }
    });
  }

  let intel = null;

  const updateSpanState = (span, meets) => {
    if (!span) {
      return;
    }
    span.classList.remove('ok', 'ng');
    span.classList.add(meets ? 'ok' : 'ng');
  };

  const updateSelectionUI = () => {
    const selected = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    const selectedMercObjects = selected
      .map((id) => state.mercs.find((entry) => entry.id === id))
      .filter(Boolean);
    currentDraft.mercs = selected;
    setTempQuestDraft(questId, currentDraft);
    const totals = computeSelectedStats(selected);
    let meetsAll = true;
    statOrder.forEach((stat) => {
      const meets = totals[stat] >= (requirements[stat] || 0);
      updateSpanState(requirementStatElements[stat], meets);
      updateSpanState(sumStatElements[stat], meets);
      if (sumStatElements[stat]) {
        sumStatElements[stat].textContent = `${statLabels[stat]} ${totals[stat]}`;
      }
      if (!meets) {
        meetsAll = false;
      }
    });
    const hasSelection = selectedMercObjects.length > 0;
    const stanceSelected = Boolean(currentDraft.stance);
    const canStart = hasSelection && meetsAll && stanceSelected;
    confirmBtn.disabled = !canStart;
    if (!canStart) {
      confirmBtn.classList.add('btn--disabled');
      confirmBtn.title = availableMercs.length === 0
        ? '투입할 수 있는 용병이 없습니다.'
        : !hasSelection
          ? '최소 한 명의 용병을 선택해야 합니다.'
          : !meetsAll
            ? '요구 능력치를 충족해야 시작할 수 있습니다.'
            : '탐험 성향을 선택해야 합니다.';
    } else {
      confirmBtn.classList.remove('btn--disabled');
      confirmBtn.title = '';
    }

    let percentMap = probabilitiesToPercentages(quest.contractProb);
    if (selectedMercObjects.length > 0) {
      const preview = calculateContractProbabilities(quest, quest.reward, selectedMercObjects);
      percentMap = probabilitiesToPercentages(preview.probabilities);
      if (intel && intel.debugLine && shouldShowProbabilityPreview()) {
        const debugSummary = formatProbabilityEntries(preview.probabilities).join(' / ');
        intel.debugLine.textContent = debugSummary || '낙찰 확률 데이터 없음';
      }
    } else if (intel && intel.debugLine && shouldShowProbabilityPreview()) {
      intel.debugLine.textContent = '낙찰 확률 데이터 없음';
    }
    if (intel && intel.infoLine) {
      intel.infoLine.textContent = renderRivalInfoInModal(quest, percentMap);
    }
  };

  const availableMercs = state.mercs.filter((merc) => !merc.busy);

  if (availableMercs.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'assign-item assign-item--disabled';
    emptyItem.textContent = '투입 가능한 용병이 없습니다. 임무 완료를 기다리세요.';
    list.appendChild(emptyItem);
  }

  availableMercs.forEach((merc) => {
    const item = document.createElement('div');
    item.className = 'assign-item';

    const label = document.createElement('label');
    label.setAttribute('for', `assign-${merc.id}`);
    const detailText = `임금 ${merc.wage_per_quest}G · ATK ${merc.atk} · DEF ${merc.def} · STAM ${merc.stamina}`;
    label.innerHTML = `<strong>${getMercDisplayName(merc)} [${merc.grade}]</strong><span>${detailText}</span>`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `assign-${merc.id}`;
    checkbox.value = merc.id;
    if (initialSelection.includes(merc.id)) {
      checkbox.checked = true;
    }

    checkbox.addEventListener('change', updateSelectionUI);

    item.addEventListener('click', (event) => {
      const target = event.target;
      if (target && target.tagName && target.tagName.toLowerCase() === 'input') {
        return;
      }
      if (target instanceof HTMLElement && target.closest('label') === label) {
        return;
      }
      checkbox.checked = !checkbox.checked;
      updateSelectionUI();
    });

    item.append(label, checkbox);
    list.appendChild(item);
  });

  elements.modalBody.appendChild(list);

  intel = createModalIntelBlock(quest, probabilitiesToPercentages(quest.contractProb));
  if (intel && intel.container) {
    elements.modalBody.appendChild(intel.container);
  }

  const actions = document.createElement('div');
  actions.className = 'modal__actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn--primary';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => closeModal());

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--accent';
  confirmBtn.textContent = '시작';
  confirmBtn.disabled = true;
  confirmBtn.classList.add('btn--disabled');
  confirmBtn.title = '요구 능력치를 충족해야 시작할 수 있습니다.';
  confirmBtn.addEventListener('click', () => {
    const selected = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    if (selected.length === 0) {
      log('최소 한 명의 용병을 선택해야 합니다.');
      return;
    }
    currentDraft.mercs = selected;
    setTempQuestDraft(questId, currentDraft);
    const stance = currentDraft.stance;
    if (!stance) {
      log('탐험 성향을 선택해야 합니다.');
      return;
    }
    const preparation = prepareQuestAssignment(questId, selected, stance);
    if (!preparation) {
      return;
    }
    openBidModal(preparation.quest, preparation.assignedMercs, preparation.stance);
  });

  actions.append(cancelBtn, confirmBtn);
  elements.modalBody.appendChild(actions);

  updateSelectionUI();
  openModal();
}

function prepareQuestAssignment(questId, selectedMercIds, stance) {
  const questIndex = state.quests.findIndex((quest) => quest.id === questId);
  if (questIndex === -1) {
    log('퀘스트를 찾을 수 없습니다.');
    return null;
  }

  const quest = state.quests[questIndex];
  if (!quest || quest.deleted || quest.status === 'empty') {
    log('이 슬롯에는 진행 가능한 퀘스트가 없습니다.');
    return null;
  }
  if (quest.status !== 'ready') {
    if (quest.status === 'bid_failed') {
      log(`[T${state.turn}] 이 퀘스트는 이미 다른 길드가 낙찰했습니다.`);
      return null;
    }
    log(`[T${state.turn}] 이 퀘스트는 이미 진행 중입니다.`);
    return null;
  }

  const assignedMercs = state.mercs.filter((merc) => selectedMercIds.includes(merc.id));
  if (assignedMercs.length === 0) {
    log('선택된 용병이 없습니다.');
    return null;
  }

  if (assignedMercs.some((merc) => merc.busy)) {
    log(`[T${state.turn}] 일부 용병이 이미 임무 중입니다.`);
    return null;
  }

  const totals = assignedMercs.reduce((acc, merc) => {
    return {
      atk: acc.atk + (merc.atk || 0),
      def: acc.def + (merc.def || 0),
      stam: acc.stam + (merc.stamina || 0)
    };
  }, { atk: 0, def: 0, stam: 0 });

  const requirements = quest.req || { atk: 0, def: 0, stam: 0 };
  const meetsRequirements = totals.atk >= requirements.atk && totals.def >= requirements.def && totals.stam >= requirements.stam;
  if (!meetsRequirements) {
    log(`[T${state.turn}] 요구 능력치가 부족합니다. (보유 ATK ${totals.atk} / DEF ${totals.def} / STAM ${totals.stam})`);
    return null;
  }

  setTempQuestDraft(questId, { mercs: selectedMercIds, stance });

  return { quest, assignedMercs, stance };
}

function openBidModal(quest, assignedMercs, stance) {
  resetModalRequirementSummary();
  if (!quest.bids) {
    quest.bids = generateQuestBids(quest.reward);
  } else {
    quest.bids = normalizeQuestBids(quest.bids, quest.reward, state.rivals);
  }
  elements.modalTitle.textContent = '입찰 제출';
  elements.modalBody.innerHTML = '';

  const summary = document.createElement('p');
  summary.className = 'modal-description';
  summary.textContent = `제안 입찰가를 입력하세요. 기본 보상은 ${quest.reward}G입니다.`;
  elements.modalBody.appendChild(summary);

  const stanceLine = document.createElement('p');
  stanceLine.className = 'modal-subtle';
  const stanceLabel = stance === 'on_time' ? '기한 준수' : '꼼꼼히 탐색';
  stanceLine.textContent = `선택한 성향: ${stanceLabel}`;
  elements.modalBody.appendChild(stanceLine);

  const intel = createModalIntelBlock(quest, probabilitiesToPercentages(quest.contractProb));
  if (intel && intel.container) {
    elements.modalBody.appendChild(intel.container);
  }

  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'bid-input';
  const label = document.createElement('label');
  label.setAttribute('for', 'player-bid-input');
  label.textContent = '플레이어 입찰 (G)';
  const input = document.createElement('input');
  input.type = 'number';
  input.id = 'player-bid-input';
  input.min = '1';
  input.max = '9999';
  input.step = '1';
  input.value = `${quest.reward}`;
  inputWrapper.append(label, input);
  elements.modalBody.appendChild(inputWrapper);

  const probabilityPreview = document.createElement('p');
  probabilityPreview.className = 'modal-probability';
  elements.modalBody.appendChild(probabilityPreview);

  const updateProbabilityPreview = () => {
    const rawValue = Number(input.value);
    if (!Number.isFinite(rawValue) || rawValue < 1) {
      probabilityPreview.textContent = '예상 낙찰 확률: 계산 불가';
      return;
    }
    const bidValue = clamp(Math.round(rawValue), 1, 9999);
    const { probabilities } = calculateContractProbabilities(quest, bidValue, assignedMercs);
    const summary = formatProbabilityEntries(probabilities).join(' / ');
    probabilityPreview.textContent = summary
      ? `예상 낙찰 확률: ${summary}`
      : '예상 낙찰 확률: 데이터 부족';
    if (intel && intel.infoLine) {
      intel.infoLine.textContent = renderRivalInfoInModal(quest, probabilitiesToPercentages(probabilities));
    }
    if (intel && intel.bidLine && guildLevel >= 3) {
      intel.bidLine.textContent = formatRivalBidSummary(quest)
        ? `AI 입찰가: ${formatRivalBidSummary(quest)}`
        : 'AI 입찰 데이터 없음';
    }
    if (intel && intel.debugLine && shouldShowProbabilityPreview()) {
      intel.debugLine.textContent = summary || '낙찰 확률 데이터 없음';
    }
  };

  updateProbabilityPreview();
  input.addEventListener('input', updateProbabilityPreview);

  const actions = document.createElement('div');
  actions.className = 'modal__actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn--primary';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => closeModal());

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--accent';
  confirmBtn.textContent = '입찰 확정';
  confirmBtn.addEventListener('click', () => {
    const raw = Number(input.value);
    if (!Number.isFinite(raw) || raw < 1) {
      log('입찰가는 1 이상의 숫자여야 합니다.');
      return;
    }
    const bidValue = clamp(Math.round(raw), 1, 9999);
    if (!quest.bids) {
      quest.bids = generateQuestBids(quest.reward);
    }
    quest.bids.player = bidValue;
    const outcome = resolveBidOutcome(quest, bidValue, assignedMercs);
    quest.contractProb = normalizeContractProb(outcome.probabilities, quest.bids, state.rivals);
    const winner = outcome.winner;
    quest.bids.winner = winner.type === 'player'
      ? { type: 'player', id: 'player', value: bidValue }
      : { type: 'rival', id: winner.id, value: winner.value };

    const logMessage = buildBidLogMessage(quest, bidValue, winner, quest.contractProb);
    log(logMessage);

    if (winner.type === 'player') {
      startQuestAfterBid(quest, assignedMercs, bidValue, stance, quest.contractProb);
      closeModal();
      return;
    }

    markQuestBidFailure(quest, winner, quest.contractProb);
    save();
    render();
    closeModal();
  });

  actions.append(cancelBtn, confirmBtn);
  elements.modalBody.appendChild(actions);
}

function calculateContractProbabilities(quest, playerBid, assignedMercs) {
  const rivalEntries = Array.isArray(quest.bids?.rivals) ? quest.bids.rivals : [];
  const rivalState = Array.isArray(state.rivals) && state.rivals.length > 0 ? state.rivals : DEFAULT_RIVALS;
  const rivalMap = new Map(rivalState.map((rival) => [rival.id, rival]));

  const participants = [];
  const sanitizedBid = clamp(Math.round(playerBid), 1, 9999);
  participants.push({
    key: 'player',
    type: 'player',
    id: 'player',
    value: sanitizedBid,
    rep: clampRep(state.reputation, CONFIG.REP_MIN)
  });

  rivalEntries.forEach((entry) => {
    const rival = rivalMap.get(entry.id) || { id: entry.id, rep: CONFIG.REP_MIN };
    participants.push({
      key: entry.id,
      type: 'rival',
      id: entry.id,
      value: clamp(Math.round(entry.value), 1, 9999),
      rep: clampRep(rival.rep, CONFIG.REP_MIN)
    });
  });

  const bids = participants.map((participant) => participant.value);
  const minBid = bids.length > 0 ? Math.min(...bids) : 0;
  const maxBid = bids.length > 0 ? Math.max(...bids) : 0;
  const rewardBase = Math.max(1, Number(quest.reward) || 1);
  const weights = CONFIG.WEIGHTS_BY_IMPORTANCE[quest.importance] || CONFIG.WEIGHTS_BY_IMPORTANCE.gold;

  const rivalParticipants = participants.filter((participant) => participant.type === 'rival');
  const avgRivalRep = rivalParticipants.length > 0
    ? rivalParticipants.reduce((sum, participant) => sum + (participant.rep || 0), 0) / rivalParticipants.length
    : clampRep(CONFIG.REP_MIN);

  const statsTerm = computePlayerStatsTerm(assignedMercs, quest);
  const playerRepTerm = computePlayerRepTerm(avgRivalRep);

  participants.forEach((participant) => {
    const bidTerm = computeBidAdvantage(participant.value, minBid, maxBid, rewardBase);
    const statsScore = participant.type === 'player' ? statsTerm : 0;
    const repTerm = participant.type === 'player'
      ? playerRepTerm
      : computeRivalRepTerm(participant.rep);
    participant.score = weights.bid * bidTerm + weights.stats * statsScore + weights.rep * repTerm;
  });

  const temperature = Number(CONFIG.BID_TEMP) || 1;
  const exponentials = participants.map((participant) => Math.exp(participant.score / temperature));
  const sumExp = exponentials.reduce((sum, value) => sum + value, 0) || 1;
  const probabilities = {};
  participants.forEach((participant, index) => {
    probabilities[participant.key] = exponentials[index] / sumExp;
  });

  return { participants, probabilities };
}

function resolveBidOutcome(quest, playerBid, assignedMercs) {
  const calculation = calculateContractProbabilities(quest, playerBid, assignedMercs);
  const winnerKey = sampleFromProbabilities(calculation.participants, calculation.probabilities);
  const winner = calculation.participants.find((participant) => participant.key === winnerKey)
    || calculation.participants[0];
  return { winner, probabilities: calculation.probabilities };
}

function sampleFromProbabilities(participants, probabilities) {
  if (!Array.isArray(participants) || participants.length === 0) {
    return null;
  }
  const randomValue = Math.random();
  let cumulative = 0;
  for (const participant of participants) {
    const probability = Number(probabilities?.[participant.key]) || 0;
    cumulative += probability;
    if (randomValue <= cumulative) {
      return participant.key;
    }
  }
  return participants[participants.length - 1].key;
}

function computeBidAdvantage(value, min, max, reward) {
  if (!Number.isFinite(value) || !Number.isFinite(reward) || reward <= 0) {
    return 0;
  }
  const range = Math.max(1, max - min);
  const baseAdvantage = max === min ? 0.5 : clamp((max - value) / range, 0, 1);
  const overbid = Math.max(0.01, value / reward);
  const penalty = clamp(1 / Math.pow(overbid, 1.5), 0, 1);
  return clamp(baseAdvantage * penalty, 0, 1);
}

function computePlayerStatsTerm(assignedMercs, quest) {
  let totals = { atk: 0, def: 0, stam: 0 };
  if (Array.isArray(assignedMercs) && assignedMercs.length > 0) {
    assignedMercs.forEach((merc) => {
      totals.atk += Number(merc.atk) || 0;
      totals.def += Number(merc.def) || 0;
      totals.stam += Number(merc.stamina) || 0;
    });
  } else if (quest) {
    totals = getQuestAssignedTotals(quest);
  }
  const requirementTotal = Math.max(1, (quest?.req?.atk || 0) + (quest?.req?.def || 0) + (quest?.req?.stam || 0));
  const suppliedTotal = (totals.atk || 0) + (totals.def || 0) + (totals.stam || 0);
  const ratio = (suppliedTotal - requirementTotal) / requirementTotal;
  return clamp(ratio, 0, 1);
}

function computePlayerRepTerm(avgRivalRep) {
  const ourRep = clampRep(state.reputation, CONFIG.REP_MIN);
  const baseline = Math.max(1, Number(avgRivalRep) || 1);
  const value = (ourRep / baseline) * 0.5 + 0.5;
  return clamp(value, 0, 1);
}

function computeRivalRepTerm(rivalRep) {
  const ourRep = clampRep(state.reputation, CONFIG.REP_MIN);
  const baseline = Math.max(1, ourRep || 1);
  const value = (clampRep(rivalRep, CONFIG.REP_MIN) / baseline) * 0.5 + 0.5;
  return clamp(value, 0, 1);
}

function buildBidLogMessage(quest, playerBid, winner, probabilities) {
  const rivalParts = Array.isArray(quest.bids?.rivals)
    ? quest.bids.rivals.map((entry) => {
        const rival = getRivalById(entry.id);
        const name = formatRivalDisplayName(rival ? rival.name : 'Rival');
        return `${name} ${entry.value}G`;
      })
    : [];
  const rivalsSummary = rivalParts.join(' / ');
  const winnerName = winner.type === 'player'
    ? 'Player'
    : formatRivalDisplayName((getRivalById(winner.id) || {}).name || 'Rival');
  const probabilitySummary = formatProbabilityEntries(probabilities).join(' / ');
  const probabilityNote = probabilitySummary ? ` (확률: ${probabilitySummary})` : '';
  return `[T${state.turn}] 입찰: Player ${playerBid}G${rivalsSummary ? ` vs ${rivalsSummary}` : ''} → 낙찰: ${winnerName}${probabilityNote}`;
}

function startQuestAfterBid(quest, assignedMercs, playerBid, stance, probabilities) {
  quest.status = 'in_progress';
  quest.remaining_turns = quest.turns_cost;
  quest.assigned_merc_ids = assignedMercs.map((merc) => merc.id);
  quest.started_turn = state.turn;
  quest.bids.player = playerBid;
  quest.bids.winner = { type: 'player', id: 'player', value: playerBid };
  quest.remaining_visible_turns = 0;
  quest.deleted = false;
  quest.progress = 0;
  quest.deadline_turn = Math.max(1, Number(quest.turns_cost) || CONFIG.QUEST_TURNS_MIN);
  quest.overdue = false;
  quest.bonusGold = 0;
  quest.contractProb = normalizeContractProb(probabilities, quest.bids, state.rivals);
  quest.stance = typeof stance === 'string' ? stance : 'meticulous';
  quest.journal = Array.isArray(quest.journal) ? quest.journal.slice(-CONFIG.QUEST_JOURNAL_LIMIT) : [];
  ensureQuestTimeline(quest);
  quest.events = [];
  quest.animKeyTimeline = [];
  quest.campPlaced = false;
  assignedMercs.forEach((merc) => {
    merc.busy = true;
  });

  syncMercBusyFromQuests();

  addQuestJournalEntry(quest, '탐험을 시작했습니다.');
  registerQuestEvent(quest, { type: 'story', text: '탐험을 시작했습니다.', animKey: 'story', turn: state.turn });
  const stanceLabel = quest.stance === 'on_time' ? '기한 준수' : '꼼꼼히 탐색';
  log(`[T${state.turn}] 퀘스트 시작 ${quest.id}: 입찰가 ${playerBid}G, ${assignedMercs.length}명 투입, ${quest.turns_cost}턴 소요 예정. (성향: ${stanceLabel})`);

  clearTempQuestDraft(quest.id);
  save();
  render();
  refreshAssetChecklist();
}

function openQuestCompletionReportModal(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return;
  }
  const [primary, ...rest] = reports;
  const titleText = primary?.title ? `${primary.title} 완료 리포트` : '퀘스트 완료 리포트';
  resetModalRequirementSummary();
  elements.modalTitle.textContent = titleText;
  elements.modalBody.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'quest-report';

  const heading = document.createElement('h4');
  heading.className = 'quest-report__heading';
  heading.textContent = '이벤트 타임라인';
  container.appendChild(heading);

  const timeline = document.createElement('ol');
  timeline.className = 'quest-report__timeline';
  const events = Array.isArray(primary?.events) ? primary.events : [];
  if (events.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'quest-report__event quest-report__event--empty';
    emptyItem.textContent = '등록된 이벤트가 없습니다.';
    timeline.appendChild(emptyItem);
  } else {
    events.forEach((event) => {
      const type = event?.type || 'story';
      const item = document.createElement('li');
      item.className = `quest-report__event quest-report__event--${type}`;
      const animKey = event?.animKey || type;
      item.dataset.animKey = animKey;

      const icon = document.createElement('span');
      icon.className = 'quest-report__icon';
      icon.textContent = QUEST_EVENT_ICONS[type] || QUEST_EVENT_ICONS.story;

      const body = document.createElement('div');
      body.className = 'quest-report__event-body';

      const turn = document.createElement('span');
      turn.className = 'quest-report__event-turn';
      const turnValue = Number.isFinite(event?.turn) ? event.turn : state.turn;
      turn.textContent = `T${turnValue}`;

      const text = document.createElement('span');
      text.className = 'quest-report__event-text';
      text.textContent = event?.text || '기록 없음';

      body.append(turn, text);
      item.append(icon, body);
      timeline.appendChild(item);
    });
  }
  container.appendChild(timeline);

  const returnSection = document.createElement('div');
  returnSection.className = 'quest-report__return';
  const returnLabel = document.createElement('strong');
  returnLabel.textContent = '귀환 일화';
  const returnText = document.createElement('p');
  returnText.textContent = primary?.returnTale || '귀환 보고가 기록되지 않았습니다.';
  returnSection.append(returnLabel, returnText);
  container.appendChild(returnSection);

  if (rest.length > 0) {
    const note = document.createElement('div');
    note.className = 'quest-report__note';
    note.textContent = `추가 완료 ${rest.length}건은 로그에서 확인하세요.`;
    container.appendChild(note);
  }

  elements.modalBody.appendChild(container);
  openModal();
}

function markQuestBidFailure(quest, winner, probabilities) {
  quest.status = 'bid_failed';
  quest.remaining_turns = 0;
  quest.assigned_merc_ids = [];
  delete quest.started_turn;
  quest.bids.winner = { type: 'rival', id: winner.id, value: winner.value };
  quest.remaining_visible_turns = 0;
  quest.deleted = false;
  quest.stance = null;
  quest.deadline_turn = quest.turns_cost || CONFIG.QUEST_TURNS_MIN;
  quest.overdue = false;
  quest.progress = 0;
  quest.bonusGold = 0;
  quest.contractProb = normalizeContractProb(probabilities, quest.bids, state.rivals);
  quest.journal = [];
  clearTempQuestDraft(quest.id);
}

function deleteQuest(index) {
  const quest = state.quests[index];
  if (!quest || quest.deleted || quest.status === 'empty') {
    return;
  }
  if (quest.status === 'in_progress') {
    log('진행 중인 퀘스트는 삭제할 수 없습니다.');
    return;
  }
  const confirmed = window.confirm('정말로 이 퀘스트를 삭제하시겠습니까?');
  if (!confirmed) {
    return;
  }
  state.quests[index] = createEmptyQuestSlot({ id: quest.id, deleted: true });
  log(`[T${state.turn}] 퀘스트 ${quest.id}를 삭제했습니다.`);
  clearTempQuestDraft(quest.id);
  save();
  render();
  refreshAssetChecklist();
}

/**
 * Append a message to the log and render updates.
 * @param {string} message
 */
function log(message) {
  state.log.push(`${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${message}`);
  if (state.log.length > CONFIG.LOG_LIMIT) {
    state.log = state.log.slice(-CONFIG.LOG_LIMIT);
  }
  save();
  renderLogs();
}

/**
 * Render all UI components from the current state.
 */
function render() {
  updateMercDisplayNameCache();
  elements.goldValue.textContent = `${state.gold}G`;
  if (elements.reputationValue) {
    elements.reputationValue.textContent = `${state.reputation}`;
  }
  renderCalendar();
  renderQuestSpawnRate();
  const recruitLocked = CONFIG.RECRUIT_ONCE_PER_TURN && state.lastRecruitTurn === state.turn;
  elements.recruitBtn.disabled = recruitLocked;
  elements.recruitBtn.title = recruitLocked ? '이번 턴에는 이미 용병을 모집했습니다.' : '';
  renderMercs();
  renderQuestDashboard();
  renderQuests();
  renderInventory();
  renderLogs();
  renderDebugPanel();
  renderAssetChecklist();
  renderBoardFormulaState();
  updatePanelDimming();
}

/** Render the mercenary list. */
function renderMercs() {
  if (!elements.mercList) {
    return;
  }
  elements.mercList.innerHTML = '';
  if (state.mercs.length === 0) {
    elements.mercList.classList.add('empty-state');
    elements.mercList.textContent = '아직 고용된 용병이 없습니다.';
    return;
  }

  elements.mercList.classList.remove('empty-state');
  state.mercs.forEach((merc) => {
    const card = document.createElement('div');
    card.className = 'merc-card';
    card.dataset.mercId = merc.id;
    if (merc.busy) {
      card.classList.add('merc-card--busy');
    }

    const header = document.createElement('div');
    header.className = 'merc-card__top';

    const identity = document.createElement('div');
    identity.className = 'merc-card__identity';
    const name = document.createElement('span');
    name.className = 'merc-card__name';
    name.textContent = getMercDisplayName(merc);
    const grade = document.createElement('span');
    grade.className = 'merc-card__grade';
    grade.textContent = merc.grade;
    identity.append(name, grade);

    const wage = document.createElement('span');
    wage.className = 'merc-card__wage';
    wage.textContent = `임금 ${merc.wage_per_quest}G`;

    header.append(identity, wage);
    card.appendChild(header);

    const moodRow = document.createElement('div');
    moodRow.className = 'merc-card__mood';
    moodRow.append(
      createMoodBadge('🔥', clampMood(merc.fatigue), '피로도'),
      createMoodBadge('🤝', clampMood(merc.relationship), '관계도'),
      createMoodBadge('💤', clampMood(merc.benched), '벤치 체류')
    );
    card.appendChild(moodRow);

    const slots = document.createElement('div');
    slots.className = 'merc-card__slots';
    slots.append(createSlotGroup('스킬'), createSlotGroup('장비'));
    card.appendChild(slots);

    const footer = document.createElement('div');
    footer.className = 'merc-card__footer';
    footer.textContent = '상세 보기';
    card.appendChild(footer);

    if (merc.busy) {
      const badge = document.createElement('span');
      badge.className = 'merc-card__badge';
      badge.textContent = '🔒 임무 중';
      card.appendChild(badge);
    }

    card.addEventListener('click', () => openMercDetails(merc.id));
    elements.mercList.appendChild(card);
  });
}

function createMoodBadge(icon, value, label) {
  const badge = document.createElement('span');
  badge.className = 'merc-card__mood-badge';
  const safeValue = clampMood(value);
  badge.textContent = `${icon} ${safeValue}`;
  badge.title = `${label} ${safeValue}/100`;
  return badge;
}

function createSlotGroup(labelText) {
  const group = document.createElement('div');
  group.className = 'merc-card__slot-group';
  const label = document.createElement('span');
  label.className = 'merc-card__slot-label';
  label.textContent = labelText;
  const grid = document.createElement('div');
  grid.className = 'merc-card__slot-grid';
  for (let index = 0; index < 2; index += 1) {
    const slot = document.createElement('div');
    slot.className = 'merc-card__slot';
    slot.title = `${labelText} 슬롯`;
    grid.appendChild(slot);
  }
  group.append(label, grid);
  return group;
}

function openMercDetails(mercId) {
  const merc = state.mercs.find((entry) => entry.id === mercId);
  if (!merc) {
    log('선택한 용병을 찾을 수 없습니다.');
    return;
  }
  resetModalRequirementSummary();
  const displayName = getMercDisplayName(merc);
  elements.modalTitle.textContent = displayName;
  elements.modalBody.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'merc-detail';

  const leftColumn = document.createElement('div');
  leftColumn.className = 'merc-detail__column';
  const rightColumn = document.createElement('div');
  rightColumn.className = 'merc-detail__column';

  const portraitSection = createDetailSection('초상');
  const portrait = createPortraitElement(merc);
  portraitSection.appendChild(portrait);
  leftColumn.appendChild(portraitSection);

  const statusValue = merc.busy ? '임무 중' : '대기 중';
  const levelValue = Number.isFinite(merc.level) ? Math.max(1, Number(merc.level)) : defaultLevelForGrade(merc.grade);
  const ageValue = Number.isFinite(merc.age) ? `${merc.age}세` : '미상';
  const basicSection = createDetailSection('기본 정보', [
    { label: '등급', value: merc.grade },
    { label: '레벨', value: `Lv.${levelValue}` },
    { label: '나이', value: ageValue },
    { label: '임금', value: `${merc.wage_per_quest}G` },
    { label: '계약금', value: `${merc.signing_bonus}G` },
    { label: '상태', value: statusValue }
  ]);
  leftColumn.appendChild(basicSection);

  const moodSection = createDetailSection('감정 상태', [
    { label: '피로도', value: `${clampMood(merc.fatigue)}/100` },
    { label: '관계도', value: `${clampMood(merc.relationship)}/100` },
    { label: '벤치 체류', value: `${clampMood(merc.benched)}/100` }
  ]);
  leftColumn.appendChild(moodSection);

  const statsSection = createDetailSection('능력치');
  const statGrid = document.createElement('div');
  statGrid.className = 'merc-detail__stat-grid';
  statGrid.append(
    createStatCard('ATK', merc.atk),
    createStatCard('DEF', merc.def),
    createStatCard('STAM', merc.stamina)
  );
  statsSection.appendChild(statGrid);
  leftColumn.appendChild(statsSection);

  const wageSection = createDetailSection('재정 정보', [
    { label: '임금 지급', value: `${merc.wage_per_quest}G / 퀘스트` },
    { label: '계약금 필요', value: `${merc.signing_bonus}G` }
  ]);
  leftColumn.appendChild(wageSection);

  const skillsSection = createDetailSection('스킬');
  const skillsPlaceholder = document.createElement('div');
  skillsPlaceholder.className = 'merc-detail__placeholder';
  skillsPlaceholder.textContent = '스킬 데이터가 아직 등록되지 않았습니다.';
  skillsPlaceholder.title = '향후 업데이트로 개방됩니다.';
  skillsSection.appendChild(skillsPlaceholder);
  rightColumn.appendChild(skillsSection);

  const equipmentSection = createDetailSection('장비');
  const equipmentPlaceholder = document.createElement('div');
  equipmentPlaceholder.className = 'merc-detail__placeholder';
  equipmentPlaceholder.textContent = '장비 슬롯이 비어 있습니다.';
  equipmentPlaceholder.title = '장비 시스템 준비 중';
  equipmentSection.appendChild(equipmentPlaceholder);
  rightColumn.appendChild(equipmentSection);

  const chronicleSection = createDetailSection('연대기');
  const chronicleList = document.createElement('div');
  chronicleList.className = 'merc-detail__chronicle';
  const chronicleEntries = buildMercChronicle(merc);
  if (chronicleEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'merc-detail__placeholder';
    empty.textContent = '최근 활동 기록이 없습니다.';
    chronicleSection.appendChild(empty);
  } else {
    chronicleEntries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'merc-detail__chronicle-item';
      const prefix = typeof entry.turn === 'number' ? `T${entry.turn} · ` : '';
      item.textContent = `${prefix}${entry.text}`;
      chronicleList.appendChild(item);
    });
    chronicleSection.appendChild(chronicleList);
  }
  rightColumn.appendChild(chronicleSection);

  container.append(leftColumn, rightColumn);
  elements.modalBody.appendChild(container);
  openModal();
}

function createDetailSection(title, fields = []) {
  const section = document.createElement('div');
  section.className = 'merc-detail__section';
  const heading = document.createElement('h4');
  heading.className = 'merc-detail__title';
  heading.textContent = title;
  section.appendChild(heading);
  if (fields.length > 0) {
    const list = document.createElement('div');
    list.className = 'merc-detail__list';
    fields.forEach(({ label, value }) => {
      const row = document.createElement('div');
      row.className = 'detail-field';
      const labelEl = document.createElement('span');
      labelEl.className = 'detail-field__label';
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.className = 'detail-field__value';
      valueEl.textContent = value;
      row.append(labelEl, valueEl);
      list.appendChild(row);
    });
    section.appendChild(list);
  }
  return section;
}

function createStatCard(label, value) {
  const card = document.createElement('div');
  card.className = 'merc-detail__stat';
  const labelEl = document.createElement('span');
  labelEl.className = 'merc-detail__stat-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.textContent = `${value}`;
  card.append(labelEl, valueEl);
  return card;
}

function buildMercChronicle(merc) {
  const entries = [];
  const displayName = getMercDisplayName(merc);
  const baseName = merc.name;
  const logs = Array.isArray(state.log) ? state.log.slice().reverse() : [];
  logs.forEach((entry) => {
    if (entries.length >= 10) {
      return;
    }
    const parsed = parseLogLine(entry);
    if (!parsed.text) {
      return;
    }
    if (parsed.text.includes(displayName) || parsed.text.includes(baseName)) {
      entries.push(parsed);
    }
  });

  const personalNotes = Array.isArray(merc.journal) ? merc.journal.slice().reverse() : [];
  personalNotes.forEach((note, index) => {
    if (entries.length >= 10) {
      return;
    }
    const parsed = parseJournalEntry(note, state.turn, index);
    entries.push({ turn: parsed.turn, text: parsed.text });
  });

  (Array.isArray(state.quests) ? state.quests : []).forEach((quest) => {
    if (!quest || quest.deleted || !Array.isArray(quest.assigned_merc_ids)) {
      return;
    }
    if (!quest.assigned_merc_ids.includes(merc.id)) {
      return;
    }
    const questTitle = getQuestDisplayTitle(quest);
    const journal = Array.isArray(quest.journal) ? quest.journal.slice().reverse() : [];
    if (journal.length === 0) {
      entries.push({ turn: quest.started_turn || null, text: `${questTitle} · 진행 중` });
      return;
    }
    journal.forEach((note, index) => {
      if (entries.length >= 10) {
        return;
      }
      const parsed = parseJournalEntry(note, quest.started_turn, index);
      entries.push({ turn: parsed.turn, text: `${questTitle} · ${parsed.text}` });
    });
  });

  const seen = new Set();
  const unique = entries.filter((entry) => {
    const key = `${entry.turn ?? 'x'}|${entry.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => {
    const turnA = typeof a.turn === 'number' ? a.turn : -Infinity;
    const turnB = typeof b.turn === 'number' ? b.turn : -Infinity;
    if (turnA === turnB) {
      return 0;
    }
    return turnB - turnA;
  });

  return unique.slice(0, 10);
}

function parseLogLine(entry) {
  if (typeof entry !== 'string') {
    return { turn: null, text: '' };
  }
  const [, message = entry] = entry.split(' - ');
  const match = message.match(/\[T(\d+)\]\s*(.*)/);
  if (match) {
    return { turn: Number(match[1]), text: match[2] || '' };
  }
  return { turn: null, text: message };
}

function parseJournalEntry(note, fallbackTurn, offset) {
  if (typeof note !== 'string') {
    return { turn: fallbackTurn ?? null, text: '기록 없음' };
  }
  const match = note.match(/^\[T(\d+)\]\s*(.*)$/);
  if (match) {
    return { turn: Number(match[1]), text: match[2] || '' };
  }
  const derivedTurn = Number.isFinite(fallbackTurn) ? fallbackTurn + offset : null;
  return { turn: derivedTurn, text: note };
}

function getQuestDisplayTitle(quest) {
  if (!quest) {
    return '퀘스트';
  }
  const tierLabel = quest.tier ? `${quest.tier}급 ` : '';
  return `${tierLabel}던전 탐험`;
}

function defaultLevelForGrade(grade) {
  const base = { S: 7, A: 6, B: 5, C: 4, D: 3 };
  return base[grade] || 3;
}

function renderQuestDashboard() {
  if (!elements.questDashboard) {
    return;
  }
  elements.questDashboard.innerHTML = '';
  const activeQuests = (Array.isArray(state.quests) ? state.quests : [])
    .filter((quest) => quest && !quest.deleted && quest.status === 'in_progress');
  if (activeQuests.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'quest-dashboard__empty';
    empty.textContent = '진행 중인 퀘스트가 없습니다.';
    elements.questDashboard.appendChild(empty);
    return;
  }

  activeQuests.forEach((quest) => {
    const card = document.createElement('div');
    card.className = 'quest-dashboard__card';

    const header = document.createElement('div');
    header.className = 'quest-dashboard__header';
    const title = document.createElement('div');
    title.className = 'quest-dashboard__title';
    title.textContent = getQuestDisplayTitle(quest);
    header.appendChild(title);
    if (quest.overdue) {
      const badge = document.createElement('span');
      badge.className = 'quest-dashboard__badge';
      badge.textContent = '기한 초과';
      header.appendChild(badge);
    }
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'quest-dashboard__meta';
    const remaining = Math.max(0, Number(quest.remaining_turns) || 0);
    const stanceLabel = quest.stance === 'on_time' ? '기한 준수' : quest.stance === 'meticulous' ? '꼼꼼히 탐색' : '미지정';
    const bonus = Math.max(0, Number(quest.bonusGold) || 0);
    const assignedCount = Array.isArray(quest.assigned_merc_ids) ? quest.assigned_merc_ids.length : 0;
    const deadline = Number.isFinite(quest.deadline_turn) ? quest.deadline_turn : quest.turns_cost;
    const metaEntries = [
      `성향: ${stanceLabel}`,
      `남은 ${remaining}턴`,
      `보너스 ${bonus}G`,
      `용병 ${assignedCount}명`,
      `마감 ${deadline}턴`
    ];
    metaEntries.forEach((text) => {
      const span = document.createElement('span');
      span.textContent = text;
      meta.appendChild(span);
    });
    card.appendChild(meta);

    const progress = document.createElement('div');
    progress.className = 'quest-dashboard__progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'quest-dashboard__progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'quest-dashboard__progress-fill';
    const plannedTurns = Math.max(1, Number(quest.turns_cost) || 1);
    const progressValue = Math.max(0, Number(quest.progress) || 0);
    const progressPercent = Math.max(0, Math.min(100, (progressValue / plannedTurns) * 100));
    progressFill.style.width = `${progressPercent}%`;
    progressBar.appendChild(progressFill);

    const progressLabel = document.createElement('div');
    progressLabel.className = 'quest-dashboard__progress-label';
    if (quest.overdue) {
      const overdueTurns = Math.max(0, progressValue - plannedTurns);
      progressLabel.textContent = overdueTurns > 0
        ? `초과 ${overdueTurns}턴 진행`
        : '기한 초과';
    } else {
      progressLabel.textContent = `진행 ${progressValue}/${plannedTurns}턴`;
    }

    progress.append(progressBar, progressLabel);
    card.appendChild(progress);

    elements.questDashboard.appendChild(card);
  });
}

/**
 * Build a portrait element that handles missing assets gracefully.
 * @param {Merc} merc
 * @returns {HTMLDivElement}
 */
function createPortraitElement(merc) {
  const container = document.createElement('div');
  container.className = 'portrait portrait--missing';

  const initials = document.createElement('div');
  initials.className = 'portrait__fallback';
  initials.textContent = getMercInitials(merc.name);

  const assetPath = CONFIG.ASSET_MERC ? CONFIG.ASSET_MERC(merc.id) : '';
  if (assetPath) {
    const img = document.createElement('img');
    img.alt = `${merc.name} 초상화`;
    img.src = assetPath;
    img.addEventListener('load', () => {
      container.classList.remove('portrait--missing');
    });
    img.addEventListener('error', () => {
      container.classList.add('portrait--missing');
    });
    container.appendChild(img);
  }

  container.appendChild(initials);
  return container;
}

/**
 * Convert a mercenary name into 1-2 character initials.
 * @param {string} name
 */
function getMercInitials(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return '?';
  }
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

/** Render the quest cards with action buttons. */
function renderQuests() {
  elements.questList.innerHTML = '';
  if (!Array.isArray(state.quests) || state.quests.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '턴을 진행해 퀘스트를 생성하세요.';
    elements.questList.appendChild(empty);
    return;
  }

  state.quests.forEach((quest, index) => {
    if (!quest || quest.deleted || quest.status === 'empty') {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'quest-card quest-card--empty';
      const note = document.createElement('div');
      note.className = 'quest-card__empty-note';
      note.innerHTML = `빈 슬롯입니다.<br>턴 진행 시 ${formatSpawnRate()} 확률로 새 퀘스트가 등장합니다.`;
      emptyCard.appendChild(note);
      elements.questList.appendChild(emptyCard);
      return;
    }

    const card = document.createElement('div');
    card.className = 'quest-card';
    const isInProgress = quest.status === 'in_progress';
    const isBidFailed = quest.status === 'bid_failed';
    const isOverdue = Boolean(quest.overdue);
    if (isInProgress) {
      card.classList.add('quest-card--in-progress');
    }
    if (isBidFailed) {
      card.classList.add('quest-card--bid-failed');
    }
    if (isOverdue) {
      card.classList.add('quest-card--overdue');
    }

    const header = document.createElement('div');
    header.className = 'quest-card__header';
    const title = document.createElement('strong');
    const tierLabel = quest.tier ? `${quest.tier}급 ` : '';
    if (isInProgress) {
      const remainingTurns = Math.max(0, Number(quest.remaining_turns) || 0);
      title.textContent = `${tierLabel}던전 탐험 (남은 ${remainingTurns}턴)`;
    } else {
      title.textContent = `${tierLabel}던전 탐험`;
    }

    const headerActions = document.createElement('div');
    headerActions.className = 'quest-card__header-actions';

    const meta = document.createElement('div');
    meta.className = 'quest-card__meta';

    const reward = document.createElement('span');
    reward.textContent = `보상 ${quest.reward}G`;
    meta.appendChild(reward);

    const importanceBadge = document.createElement('span');
    importanceBadge.className = `quest-card__importance quest-card__importance--${quest.importance}`;
    importanceBadge.textContent = `중요도: ${formatImportanceLabel(quest.importance)}`;
    meta.appendChild(importanceBadge);

    const statusBadge = document.createElement('span');
    statusBadge.className = 'quest-card__status-badge';
    const visibleTurns = Math.max(0, Number(quest.remaining_visible_turns) || 0);
    if (isInProgress) {
      statusBadge.textContent = isOverdue ? '기한 초과' : '진행 중';
      statusBadge.classList.add(isOverdue ? 'quest-card__status-badge--overdue' : 'quest-card__status-badge--active');
    } else if (isBidFailed) {
      statusBadge.textContent = '낙찰 실패';
      statusBadge.classList.add('quest-card__status-badge--failed');
    } else {
      statusBadge.textContent = `대기 중 (만료까지 ${visibleTurns}턴)`;
    }
    meta.appendChild(statusBadge);

    if (isInProgress && quest.stance) {
      const stanceTag = document.createElement('span');
      stanceTag.className = `quest-card__stance quest-card__stance--${quest.stance}`;
      stanceTag.textContent = quest.stance === 'on_time' ? '성향: 기한 준수' : '성향: 꼼꼼히 탐색';
      meta.appendChild(stanceTag);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'quest-card__delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = '퀘스트 삭제';
    deleteBtn.disabled = isInProgress;
    deleteBtn.addEventListener('click', () => deleteQuest(index));

    headerActions.append(meta, deleteBtn);
    header.append(title, headerActions);

    const stats = document.createElement('div');
    stats.className = 'quest-card__stats';
    stats.innerHTML = `<span>소요 ${quest.turns_cost}턴</span><span>유형: ${quest.type}</span>`;

    const requirements = document.createElement('div');
    requirements.className = 'quest-card__requirements';
    requirements.textContent = `요구 ATK ${quest.req.atk} / DEF ${quest.req.def} / STAM ${quest.req.stam}`;

    const assigned = document.createElement('div');
    assigned.className = 'quest-card__assigned';
    if (isInProgress) {
      const assignedNames = quest.assigned_merc_ids
        .map((id) => state.mercs.find((merc) => merc.id === id))
        .filter(Boolean)
        .map((merc) => getMercDisplayName(merc));
      assigned.textContent = assignedNames.length > 0 ? `투입: ${assignedNames.join(', ')}` : '투입 용병 없음';
    } else if (!isBidFailed) {
      assigned.textContent = '대기 중: 용병 배치 필요';
    }

    const selectedStats = document.createElement('div');
    selectedStats.className = 'quest-card__selected-stats';
    const statsLabel = document.createElement('span');
    statsLabel.className = 'quest-card__selected-stats-label';
    statsLabel.textContent = '현재 용병 합계';
    selectedStats.appendChild(statsLabel);

    const totals = getQuestAssignedTotals(quest);
    const requirementsMap = { atk: quest.req.atk || 0, def: quest.req.def || 0, stam: quest.req.stam || 0 };
    [
      { key: 'atk', label: 'ATK' },
      { key: 'def', label: 'DEF' },
      { key: 'stam', label: 'STAM' }
    ].forEach(({ key, label }) => {
      const statValue = totals[key] || 0;
      const requirement = requirementsMap[key] || 0;
      const stat = document.createElement('span');
      stat.className = 'quest-card__stat';
      stat.classList.add(statValue >= requirement ? 'quest-card__stat--ok' : 'quest-card__stat--insufficient');
      stat.textContent = `${label} ${statValue}`;
      selectedStats.appendChild(stat);
    });

    const progressSection = document.createElement('div');
    progressSection.className = 'quest-card__progress';
    const progressWrapper = document.createElement('div');
    progressWrapper.className = 'progress-bar';
    if (isOverdue) {
      progressWrapper.classList.add('progress-bar--overdue');
    }
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-bar__fill';
    const plannedTurns = Math.max(1, Number(quest.turns_cost) || 1);
    const currentProgress = Math.max(0, Number(quest.progress) || 0);
    const clampedProgress = Math.min(currentProgress, plannedTurns);
    const progressPercent = Math.max(0, Math.min(100, (clampedProgress / plannedTurns) * 100));
    progressFill.style.width = `${progressPercent}%`;
    const progressToken = document.createElement('span');
    progressToken.className = 'progress-bar__token';
    progressToken.textContent = '●';
    const tokenPercent = Math.min(98, Math.max(2, progressPercent));
    progressToken.style.left = `${tokenPercent}%`;
    progressWrapper.append(progressFill, progressToken);

    const progressLabel = document.createElement('div');
    progressLabel.className = 'progress-bar__label';
    if (isInProgress) {
      const overdueTurns = Math.max(0, currentProgress - plannedTurns);
      progressLabel.textContent = overdueTurns > 0
        ? `진행 ${currentProgress}턴 (기한 초과 +${overdueTurns})`
        : `진행 ${currentProgress}턴 / 목표 ${plannedTurns}턴`;
    } else if (isBidFailed) {
      progressLabel.textContent = '낙찰 실패 - 진행 불가';
    } else {
      progressLabel.textContent = `준비 중 · 예상 ${plannedTurns}턴`;
    }

    progressSection.append(progressWrapper, progressLabel);

    if (isInProgress) {
      const bonusLabel = document.createElement('div');
      bonusLabel.className = 'progress-bar__bonus';
      bonusLabel.textContent = quest.bonusGold > 0
        ? `추가 골드 확보 +${quest.bonusGold}G`
        : '추가 보상 탐색 중';
      progressSection.appendChild(bonusLabel);

      const journal = document.createElement('div');
      journal.className = 'quest-card__journal';
      const recentEntries = Array.isArray(quest.journal) ? quest.journal.slice(-2) : [];
      if (recentEntries.length === 0) {
        const emptyEntry = document.createElement('div');
        emptyEntry.className = 'quest-card__journal-entry';
        emptyEntry.textContent = '최근 탐험 로그 없음';
        journal.appendChild(emptyEntry);
      } else {
        recentEntries.forEach((entry, index) => {
          const line = document.createElement('div');
          line.className = 'quest-card__journal-entry';
          const parsed = parseJournalEntry(entry, quest.started_turn, index);
          line.textContent = parsed.turn ? `T${parsed.turn} · ${parsed.text}` : parsed.text;
          journal.appendChild(line);
        });
      }
      progressSection.appendChild(journal);
    }

    const actions = document.createElement('div');
    actions.className = 'quest-card__actions';
    const runBtn = document.createElement('button');
    runBtn.className = 'btn btn--accent';
    if (isInProgress) {
      runBtn.textContent = '진행 중';
      runBtn.disabled = true;
    } else if (isBidFailed) {
      runBtn.textContent = '낙찰 실패';
      runBtn.disabled = true;
      runBtn.classList.add('btn--disabled');
      runBtn.title = '다음 턴에 새 퀘스트로 교체됩니다.';
    } else {
      runBtn.textContent = '수행하기';
      runBtn.addEventListener('click', () => openQuestAssignModal(quest.id));
    }
    actions.appendChild(runBtn);

    card.append(header, stats, requirements);
    if (assigned.textContent) {
      card.appendChild(assigned);
    }
    card.appendChild(selectedStats);
    card.appendChild(progressSection);
    if (isBidFailed) {
      const failureNote = document.createElement('div');
      failureNote.className = 'quest-card__failure-note';
      failureNote.textContent = 'AI 길드가 낙찰했습니다. 다음 턴에 새 퀘스트로 교체됩니다.';
      card.appendChild(failureNote);
    }
    card.append(actions);
    elements.questList.appendChild(card);
  });
}

function getQuestAssignedTotals(quest) {
  if (!quest || !Array.isArray(quest.assigned_merc_ids)) {
    return { atk: 0, def: 0, stam: 0 };
  }
  return quest.assigned_merc_ids.reduce(
    (totals, id) => {
      const merc = state.mercs.find((candidate) => candidate.id === id);
      if (merc) {
        totals.atk += merc.atk || 0;
        totals.def += merc.def || 0;
        totals.stam += merc.stamina || 0;
      }
      return totals;
    },
    { atk: 0, def: 0, stam: 0 }
  );
}
function formatRivalBidSummary(quest) {
  if (!quest || !quest.bids || !Array.isArray(quest.bids.rivals)) {
    return '';
  }
  const rivals = quest.bids.rivals
    .map((bid) => {
      const rival = getRivalById(bid.id);
      const name = formatRivalDisplayName(rival ? rival.name : 'Rival');
      return `${name} ${bid.value}G`;
    })
    .filter(Boolean);
  return rivals.join(' · ');
}

function formatImportanceLabel(importance) {
  switch (importance) {
    case 'reputation':
      return '평판';
    case 'stats':
      return '능력치';
    case 'gold':
      return '금전';
    default:
      return '기타';
  }
}

function formatProbabilityEntries(probabilities) {
  if (!probabilities || typeof probabilities !== 'object') {
    return [];
  }
  const entries = [];
  const playerProb = Number(probabilities.player);
  if (Number.isFinite(playerProb) && playerProb > 0) {
    entries.push(`Player ${Math.round(playerProb * 100)}%`);
  }
  const rivals = Array.isArray(state.rivals) && state.rivals.length > 0 ? state.rivals : DEFAULT_RIVALS;
  rivals.forEach((rival) => {
    const value = Number(probabilities[rival.id]);
    if (Number.isFinite(value) && value > 0) {
      entries.push(`${formatRivalDisplayName(rival.name)} ${Math.round(value * 100)}%`);
    }
  });
  return entries;
}

function probabilitiesToPercentages(probabilities) {
  const result = {};
  if (!probabilities || typeof probabilities !== 'object') {
    return result;
  }
  Object.entries(probabilities).forEach(([key, value]) => {
    if (Number.isFinite(value)) {
      result[key] = Math.round(value * 100);
    }
  });
  return result;
}

function renderRivalInfoInModal(quest, percentMap) {
  if (guildLevel === 1) {
    return '???';
  }
  if (guildLevel === 2) {
    return '상대 입찰 동향: 중간대 추정';
  }
  const entries = [];
  if (percentMap && Number.isFinite(percentMap.player)) {
    entries.push(`Player ${percentMap.player}%`);
  }
  const rivals = Array.isArray(state.rivals) && state.rivals.length > 0 ? state.rivals : DEFAULT_RIVALS;
  rivals.forEach((rival) => {
    const key = rival.id;
    const percent = percentMap ? percentMap[key] : undefined;
    if (Number.isFinite(percent)) {
      entries.push(`${formatRivalDisplayName(rival.name)} ${percent}%`);
    }
  });
  return entries.length > 0 ? entries.join(' · ') : '데이터 부족';
}

function createModalIntelBlock(quest, percentMap) {
  const container = document.createElement('div');
  container.className = 'modal__intel';

  const title = document.createElement('h4');
  title.textContent = '라이벌 정보';
  container.appendChild(title);

  const infoLine = document.createElement('p');
  infoLine.className = 'modal__intel-note';
  infoLine.textContent = renderRivalInfoInModal(quest, percentMap);
  container.appendChild(infoLine);

  let bidLine = null;
  if (guildLevel >= 3) {
    bidLine = document.createElement('p');
    bidLine.className = 'modal__intel-note';
    const rivalSummary = formatRivalBidSummary(quest);
    bidLine.textContent = rivalSummary ? `AI 입찰가: ${rivalSummary}` : 'AI 입찰 데이터 없음';
    container.appendChild(bidLine);
  }

  let debugLine = null;
  if (shouldShowProbabilityPreview()) {
    debugLine = document.createElement('p');
    debugLine.className = 'modal__intel-note';
    const debugEntries = formatProbabilityEntries(quest.contractProb);
    debugLine.textContent = debugEntries.length > 0 ? debugEntries.join(' / ') : '낙찰 확률 데이터 없음';
    container.appendChild(debugLine);
  }

  return { container, infoLine, bidLine, debugLine };
}

function getRivalById(id) {
  if (!id) {
    return null;
  }
  return state.rivals.find((rival) => rival.id === id) || DEFAULT_RIVALS.find((rival) => rival.id === id) || null;
}

function formatRivalDisplayName(name) {
  if (typeof name !== 'string') {
    return 'Rival';
  }
  const trimmed = name.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord || trimmed;
}

/** Render the recent log entries. */
function renderLogs() {
  elements.logList.innerHTML = '';
  if (state.log.length === 0) {
    return;
  }
  state.log.slice().reverse().forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry;
    elements.logList.appendChild(li);
  });
}

function renderQuestSpawnRate() {
  if (!elements.questSpawnRate) {
    return;
  }
  elements.questSpawnRate.textContent = formatSpawnRate();
}

function renderCalendar() {
  if (!elements.calendarDisplay) {
    return;
  }
  const current = getCalendarDate();
  const monthLabel = current.month.toString().padStart(2, '0');
  elements.calendarDisplay.textContent = `길드력 ${current.year}년 ${monthLabel}월`;
}

function getCalendarDate() {
  const startYear = Number(CONFIG.START_YEAR) || 0;
  const startMonth = Math.max(1, Math.min(12, Number(CONFIG.START_MONTH) || 1));
  const offset = Math.max(0, Number(state.turn) - 1);
  const totalMonths = startYear * 12 + (startMonth - 1) + offset;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return { year, month };
}

function toggleBoardFormula() {
  if (!elements.formulaBox) {
    return;
  }
  const isOpen = elements.formulaBox.classList.toggle('board-formula--open');
  renderBoardFormulaState(isOpen);
}

function renderBoardFormulaState(forcedState) {
  if (!elements.formulaBox || !elements.formulaToggle || !elements.formulaContent) {
    return;
  }
  const isOpen = typeof forcedState === 'boolean'
    ? forcedState
    : elements.formulaBox.classList.contains('board-formula--open');
  elements.formulaBox.classList.toggle('board-formula--open', isOpen);
  elements.formulaContent.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  elements.formulaToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  elements.formulaToggle.textContent = isOpen
    ? '📌 경제·평판 공식 닫기'
    : '📌 경제·평판 공식 보기';
}

/**
 * Close the currently active modal.
 */
function closeModal() {
  elements.modalOverlay.classList.add('hidden');
  elements.modalBody.innerHTML = '';
  resetModalRequirementSummary();
  currentQuestId = null;
}

/**
 * Open the modal overlay.
 */
function openModal() {
  elements.modalOverlay.classList.remove('hidden');
}

/**
 * Generate a random mercenary with grade-influenced attributes.
 * @returns {Merc}
 */
function generateMerc() {
  const grade = rollGrade();
  const gradeModifiers = {
    S: { statBonus: 3, signMultiplier: 1.4, wageMultiplier: 1.4 },
    A: { statBonus: 2, signMultiplier: 1.2, wageMultiplier: 1.2 },
    B: { statBonus: 1, signMultiplier: 1.0, wageMultiplier: 1.0 },
    C: { statBonus: 0, signMultiplier: 0.8, wageMultiplier: 0.8 },
    D: { statBonus: -1, signMultiplier: 0.6, wageMultiplier: 0.6 }
  };
  const modifiers = gradeModifiers[grade];

  const name = generateUniqueMercName();
  const atk = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const def = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const stamina = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const signing_bonus = Math.round(clamp(randomInt(CONFIG.MERC_SIGN_MIN, CONFIG.MERC_SIGN_MAX) * modifiers.signMultiplier, CONFIG.MERC_SIGN_MIN, CONFIG.MERC_SIGN_MAX * 1.6));
  const wage_per_quest = Math.round(clamp(randomInt(CONFIG.MERC_WAGE_MIN, CONFIG.MERC_WAGE_MAX) * modifiers.wageMultiplier, CONFIG.MERC_WAGE_MIN, CONFIG.MERC_WAGE_MAX * 1.6));
  const baseLevel = defaultLevelForGrade(grade);
  const level = clamp(baseLevel + randomInt(-1, 2), 1, baseLevel + 4);
  const age = clamp(randomInt(19, 36) + randomInt(0, 4), 18, 48);

  return {
    id: `merc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    grade,
    atk,
    def,
    stamina,
    signing_bonus,
    wage_per_quest,
    level,
    age,
    busy: false,
    fatigue: randomInt(5, 15),
    relationship: randomInt(35, 55),
    benched: randomInt(10, 25),
    journal: []
  };
}

/**
 * Randomly pick a grade for a new mercenary.
 * @returns {'S'|'A'|'B'|'C'|'D'}
 */
function rollGrade() {
  const roll = Math.random();
  if (roll < 0.05) return 'S';
  if (roll < 0.20) return 'A';
  if (roll < 0.50) return 'B';
  if (roll < 0.80) return 'C';
  return 'D';
}

/**
 * Generate a random integer within an inclusive range.
 * @param {number} min
 * @param {number} max
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Clamp a value between min and max. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampRep(value, fallback = CONFIG.REP_MIN) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return clamp(numeric, CONFIG.REP_MIN, CONFIG.REP_MAX);
}

function randomVisibleTurns() {
  const min = Math.max(1, Number(CONFIG.QUEST_VISIBLE_TURNS_MIN) || 1);
  const maxCandidate = Math.max(min, Number(CONFIG.QUEST_VISIBLE_TURNS_MAX) || min);
  return randomInt(min, maxCandidate);
}

function formatSpawnRate() {
  const rate = Math.min(1, Math.max(0, Number(QUEST_CONFIG.spawnRate) || 0));
  const percentage = rate * 100;
  const formatted = Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(1);
  return `${formatted}%`;
}

/**
 * @typedef {Object} GameState
 * @property {number} gold
 * @property {number} turn
 * @property {Merc[]} mercs
 * @property {Quest[]} quests
 * @property {?number} lastRecruitTurn
 * @property {number} reputation
 * @property {Rival[]} rivals
 *
 * @typedef {Object} Merc
 * @property {string} id
 * @property {string} name
 * @property {'S'|'A'|'B'|'C'|'D'} grade
 * @property {number} atk
 * @property {number} def
 * @property {number} stamina
 * @property {number} signing_bonus
 * @property {number} wage_per_quest
 * @property {boolean} busy
 * @property {number} fatigue
 * @property {number} relationship
 * @property {number} benched
 * @property {string[]} journal
 *
 * @typedef {Object} QuestEvent
 * @property {number} turn
 * @property {'trap'|'fight'|'chest'|'boss'|'camp'|'story'} type
 * @property {string} text
 * @property {string} animKey
 *
 * @typedef {Object} Quest
 * @property {string} id
 * @property {'dungeon'} type
 * @property {'S'|'A'|'B'|'C'} tier
 * @property {'gold'|'reputation'|'stats'} importance
 * @property {number} reward
 * @property {number} turns_cost
 * @property {{atk: number, def: number, stam: number}} req
 * @property {'ready'|'in_progress'|'bid_failed'|'empty'} status
 * @property {number} remaining_turns
 * @property {string[]} assigned_merc_ids
 * @property {number=} started_turn
 * @property {{player?: number, rivals: {id: string, value: number}[], winner: ({type: 'player', id: 'player', value: number} | {type: 'rival', id: string, value: number}) | null}} bids
 * @property {number} remaining_visible_turns
 * @property {boolean} deleted
 * @property {'meticulous'|'on_time'|null} stance
 * @property {number} deadline_turn
 * @property {boolean} overdue
 * @property {number} progress
 * @property {number} bonusGold
 * @property {{[key: string]: number}} contractProb
 * @property {string[]} journal
 * @property {QuestEvent[]} events
 * @property {string[]} animKeyTimeline
 * @property {boolean} campPlaced
 *
 * @typedef {{id: string, name: string, rep: number}} Rival
 */
