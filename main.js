/**
 * Revival Guild Phase 1 prototype main script.
 * Handles state management, UI rendering, and persistence for the mini prototype.
 */

const CONFIG = {
  START_GOLD: 500,
  MERC_POOL_SIZE: 5,
  MERC_SIGN_MIN: 20,
  MERC_SIGN_MAX: 120,
  MERC_WAGE_MIN: 5,
  MERC_WAGE_MAX: 40,
  STAT_MIN: 1,
  STAT_MAX: 10,
  QUEST_SLOTS: 3,
  QUEST_SPAWN_RATE: 0.6,
  QUEST_VISIBLE_TURNS_MIN: 1,
  QUEST_VISIBLE_TURNS_MAX: 4,
  QUEST_REWARD_MIN: 50,
  QUEST_REWARD_MAX: 200,
  QUEST_TURNS_MIN: 1,
  QUEST_TURNS_MAX: 3,
  RECRUIT_ONCE_PER_TURN: true,
  ASSET_BG: 'assets/bg/medieval.jpg',
  ASSET_MERC: (mercId) => `assets/mercs/${mercId}.jpg`,
  ASSET_DUNGEON_THUMB: 'assets/monsters/dungeon.jpg',
  LOG_LIMIT: 8,
  SMALL_INJURY_PROB: 0.12,
  QUEST_JOURNAL_LIMIT: 4,
  STANCE: {
    meticulous: { overdueProbPerTurn: 0.15, bonusLootProbPerTurn: 0.25, bonusGoldRange: [5, 20], repPenaltyBase: 2 },
    on_time: { overdueProbPerTurn: 0.03, bonusLootProbPerTurn: 0.05, bonusGoldRange: [0, 8], repPenaltyBase: 0 }
  }
};

const STORAGE_KEY = 'rg_v1_save';

const DEFAULT_RIVALS = [
  { id: 'r1', name: 'Iron Fang', rep: 50 },
  { id: 'r2', name: 'Moonlight', rep: 50 },
  { id: 'r3', name: 'Ashen Company', rep: 50 }
];

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
  reputation: 50,
  rivals: DEFAULT_RIVALS.map((rival) => ({ ...rival }))
};

let currentRecruitCandidates = [];
let currentQuestId = null;
let assetChecklist = [];
let assetChecklistLoading = true;
let lastAssetLogSignature = '';
const tempSelections = {};

const EXPLORATION_SCENARIOS = {
  encounter: ['좁은 복도에서 매복을 뚫고 전진했습니다.', '고블린 순찰대를 분산시키고 길을 확보했습니다.', '갑작스러운 함정과 맞닥뜨렸지만 재빠르게 회피했습니다.'],
  discovery: ['먼지 쌓인 보관실을 발견했습니다.', '숨겨진 측면 통로를 찾아냈습니다.', '고대 문양이 새겨진 문을 조사했습니다.'],
  rest: ['짧은 휴식으로 숨을 고르며 체력을 회복했습니다.', '전투 후 진형을 재정비했습니다.', '조용한 방에서 경계를 세우며 휴식을 취했습니다.'],
  item: ['예비 물약을 사용해 기운을 되찾았습니다.', '보호 부적을 사용해 함정을 무력화했습니다.', '빛나는 횃불을 교체하며 시야를 확보했습니다.']
};

const EXPLORATION_SCENARIO_KEYS = Object.keys(EXPLORATION_SCENARIOS);
const INJURY_MESSAGES = ['작은 찰과상을 입었습니다.', '함정 조각에 살짝 베였습니다.', '체력이 소폭 감소했습니다.', '지친 발걸음으로 속도가 느려졌습니다.'];

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
  modalReqSum: document.getElementById('reqSum')
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
  quest.journal.push(message);
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
        reputation: Math.max(0, Number(parsed.reputation) || 50),
        rivals: normalizedRivals
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
      reputation: 50,
      rivals: DEFAULT_RIVALS.map((rival) => ({ ...rival }))
    };
  }

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
  const toSave = {
    gold: state.gold,
    turn: state.turn,
    mercs: state.mercs,
    quests: state.quests,
    log: state.log,
    lastRecruitTurn: state.lastRecruitTurn,
    reputation: state.reputation,
    rivals: state.rivals
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
      <li>업로드 후 페이지 새로고침(Shift+Reload)</li>
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
  const expirationLogs = [];
  const explorationLogs = [];
  const delayLogs = [];

  state.quests = (Array.isArray(state.quests) ? state.quests : []).map((quest) => {
    if (!quest || quest.deleted || quest.status === 'empty') {
      return createEmptyQuestSlot(quest);
    }
    if (quest.status === 'in_progress') {
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
      if (!Number.isFinite(quest.tempBonusGold)) {
        quest.tempBonusGold = 0;
      }
      if (!Array.isArray(quest.journal)) {
        quest.journal = [];
      }

      const scenarioType = randomChoice(EXPLORATION_SCENARIO_KEYS) || 'encounter';
      const basePool = EXPLORATION_SCENARIOS[scenarioType] || [];
      const baseMessage = randomChoice(basePool) || '어둠 속을 조심스럽게 전진했습니다.';
      addQuestJournalEntry(quest, baseMessage);
      const fragments = [baseMessage];

      const range = Array.isArray(effectiveConfig.bonusGoldRange) ? effectiveConfig.bonusGoldRange : [0, 0];
      const bonusMin = Math.max(0, Number(range[0]) || 0);
      const bonusMax = Math.max(bonusMin, Number(range[1]) || bonusMin);
      if (Math.random() < effectiveConfig.bonusLootProbPerTurn) {
        const bonusGold = randomInt(bonusMin, bonusMax);
        if (bonusGold > 0) {
          quest.tempBonusGold += bonusGold;
          const bonusMessage = `상자 발견 (+${bonusGold}G)`;
          fragments.push(bonusMessage);
          addQuestJournalEntry(quest, bonusMessage);
        }
      }

      if (Math.random() < CONFIG.SMALL_INJURY_PROB) {
        const injuryDetail = randomChoice(INJURY_MESSAGES) || '작은 부상을 입었습니다.';
        const injuryMessage = `작은 부상: ${injuryDetail}`;
        fragments.push(injuryMessage);
        addQuestJournalEntry(quest, injuryMessage);
      }

      const questLabel = formatQuestLogLabel(quest);
      explorationLogs.push(`[T${state.turn}] ${questLabel}: ${fragments.join(' / ')}`);

      if (quest.remaining_turns <= 0) {
        const shouldDelay = Math.random() < effectiveConfig.overdueProbPerTurn;
        if (shouldDelay) {
          quest.remaining_turns = 1;
          quest.overdue = true;
          const delayMessage = `[T${state.turn}] ${questLabel} 일정 지연: 추가 탐색으로 한 턴이 더 소요됩니다.`;
          delayLogs.push(delayMessage);
          addQuestJournalEntry(quest, '일정 지연: 추가 탐색을 진행합니다.');
          return quest;
        }
        const { completionMessage, replacement } = finalizeQuest(quest);
        completionLogs.push(completionMessage);
        return replacement;
      }
      return quest;
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

  spawnQuestsForEmptySlots(false);
  ensureQuestSlots();
  syncMercBusyFromQuests();
  state.lastRecruitTurn = null;
  currentRecruitCandidates = [];

  log(`[T${state.turn}] 새 턴이 시작되었습니다.`);
  explorationLogs.forEach((message) => log(message));
  delayLogs.forEach((message) => log(message));
  completionLogs.forEach((message) => log(message));
  expirationLogs.forEach((message) => log(message));

  save();
  render();
  refreshAssetChecklist();
}

/**
 * Create a random quest.
 * @returns {Quest}
 */
function generateQuest() {
  const turns_cost = randomInt(CONFIG.QUEST_TURNS_MIN, CONFIG.QUEST_TURNS_MAX);
  const reward = randomInt(CONFIG.QUEST_REWARD_MIN, CONFIG.QUEST_REWARD_MAX);
  return {
    id: `quest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'dungeon',
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
    tempBonusGold: 0,
    journal: []
  };
}

function createEmptyQuestSlot(base = {}) {
  return {
    id: typeof base.id === 'string' ? base.id : `empty_${Math.random().toString(36).slice(2, 7)}`,
    type: 'dungeon',
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
    tempBonusGold: 0,
    journal: []
  };
}

function spawnQuestsForEmptySlots(force = false) {
  const rate = Math.min(1, Math.max(0, Number(CONFIG.QUEST_SPAWN_RATE) || 0));
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

/**
 * Finalize a quest that has completed this turn.
 * @param {Quest} quest
 * @returns {{completionMessage: string, replacement: Quest}}
 */
function finalizeQuest(quest) {
  const assignedMercs = quest.assigned_merc_ids
    .map((id) => state.mercs.find((merc) => merc.id === id))
    .filter(Boolean);

  const totalWages = assignedMercs.reduce((sum, merc) => sum + (merc.wage_per_quest || 0), 0);
  const previousGold = state.gold;
  const contractValue = typeof quest.bids?.player === 'number' ? quest.bids.player : quest.reward;
  const bonusGold = Math.max(0, Number(quest.tempBonusGold) || 0);
  const finalReward = contractValue + bonusGold;
  const netGain = finalReward - totalWages;
  state.gold = Math.max(0, state.gold + netGain);

  assignedMercs.forEach((merc) => {
    merc.busy = false;
  });

  const { config: stanceConfig } = getStanceConfig(quest);
  const penaltyBase = stanceConfig?.repPenaltyBase || 0;
  const difficultyWeight = computeQuestDifficultyWeight(quest);
  const repPenalty = quest.overdue ? Math.ceil(Math.max(0, penaltyBase) * difficultyWeight) : 0;
  if (repPenalty > 0) {
    state.reputation = Math.max(0, state.reputation - repPenalty);
  }

  const statusText = quest.overdue ? '기한 초과' : '기한 준수';
  const completionMessage = `[T${state.turn}] 완료: ${formatQuestLogLabel(quest)} → ${statusText}, 계약 ${contractValue}G + 보너스 ${bonusGold}G − 임금 ${totalWages}G = ${netGain >= 0 ? '+' : ''}${netGain}G (Gold ${previousGold}→${state.gold})${repPenalty > 0 ? `, 평판 -${repPenalty}` : ''}`;

  return {
    completionMessage,
    replacement: generateQuest()
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
    quest.stance = typeof quest.stance === 'string' && CONFIG.STANCE[quest.stance] ? quest.stance : null;
    const defaultDeadline = quest.turns_cost || CONFIG.QUEST_TURNS_MIN;
    const storedDeadline = Number(quest.deadline_turn);
    quest.deadline_turn = Number.isFinite(storedDeadline) && storedDeadline > 0 ? storedDeadline : defaultDeadline;
    quest.overdue = Boolean(quest.overdue);
    quest.progress = Math.max(0, Number(quest.progress) || 0);
    quest.tempBonusGold = Math.max(0, Number(quest.tempBonusGold) || 0);
    if (!Array.isArray(quest.journal)) {
      quest.journal = [];
    }
    quest.deleted = false;
    return quest;
  });
  while (state.quests.length < CONFIG.QUEST_SLOTS) {
    state.quests.push(createEmptyQuestSlot());
  }
}

/** Normalize a mercenary object loaded from storage. */
function normalizeMerc(merc) {
  if (!merc || typeof merc !== 'object') {
    return null;
  }
  return {
    ...merc,
    busy: Boolean(merc.busy)
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
  const normalized = {
    id: typeof quest.id === 'string' ? quest.id : `quest_${Math.random().toString(36).slice(2, 8)}`,
    type: typeof quest.type === 'string' ? quest.type : 'dungeon',
    reward: clamp(isNaN(rewardValue) ? CONFIG.QUEST_REWARD_MIN : rewardValue, CONFIG.QUEST_REWARD_MIN, CONFIG.QUEST_REWARD_MAX),
    turns_cost,
    req,
    status,
    remaining_turns: status === 'in_progress'
      ? Math.max(0, Number(quest.remaining_turns) || turns_cost)
      : 0,
    assigned_merc_ids: Array.isArray(quest.assigned_merc_ids) && status === 'in_progress' ? quest.assigned_merc_ids : []
  };
  if (typeof quest.started_turn === 'number') {
    normalized.started_turn = quest.started_turn;
  }
  normalized.bids = normalizeQuestBids(quest.bids, normalized.reward, rivals);
  if (status === 'bid_failed') {
    normalized.remaining_turns = 0;
    normalized.assigned_merc_ids = [];
  }
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
  normalized.tempBonusGold = Math.max(0, Number(quest.tempBonusGold) || 0);
  normalized.journal = Array.isArray(quest.journal) ? quest.journal.slice(-CONFIG.QUEST_JOURNAL_LIMIT) : [];
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

function normalizeRivals(rivals) {
  return rivals
    .map((rival) => {
      if (!rival || typeof rival !== 'object') {
        return null;
      }
      return {
        id: typeof rival.id === 'string' ? rival.id : `r${Math.random().toString(36).slice(2, 6)}`,
        name: typeof rival.name === 'string' ? rival.name : 'Rival Guild',
        rep: Math.max(0, Number(rival.rep) || 0)
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
  }
  if (elements.modalReqSum) {
    elements.modalReqSum.textContent = '선택 합계: ';
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

  const stanceWrapper = document.createElement('div');
  stanceWrapper.className = 'stance-select';
  const stanceTitle = document.createElement('p');
  stanceTitle.className = 'stance-select__title';
  stanceTitle.textContent = '탐험 성향 선택';
  stanceWrapper.appendChild(stanceTitle);

  const stanceHint = document.createElement('p');
  stanceHint.className = 'stance-select__hint';
  stanceHint.textContent = '성향에 따라 추가 보상과 기한 초과 위험이 달라집니다.';
  stanceWrapper.appendChild(stanceHint);

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

  const updateSpanState = (span, meets) => {
    if (!span) {
      return;
    }
    span.classList.remove('ok', 'ng');
    span.classList.add(meets ? 'ok' : 'ng');
  };

  const updateSelectionUI = () => {
    const selected = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
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
    const hasSelection = selected.length > 0;
    const stanceSelected = Boolean(currentDraft.stance);
    const canStart = hasSelection && meetsAll && stanceSelected;
    confirmBtn.disabled = !canStart;
    if (!canStart) {
      confirmBtn.classList.add('btn--disabled');
      confirmBtn.title = !hasSelection
        ? '최소 한 명의 용병을 선택해야 합니다.'
        : !meetsAll
          ? '요구 능력치를 충족해야 시작할 수 있습니다.'
          : '탐험 성향을 선택해야 합니다.';
    } else {
      confirmBtn.classList.remove('btn--disabled');
      confirmBtn.title = '';
    }
  };

  state.mercs.forEach((merc) => {
    const item = document.createElement('div');
    item.className = 'assign-item';
    if (merc.busy) {
      item.classList.add('assign-item--disabled');
    }

    const label = document.createElement('label');
    label.setAttribute('for', `assign-${merc.id}`);
    const detailText = merc.busy
      ? `🔒 임무 중`
      : `임금 ${merc.wage_per_quest}G · ATK ${merc.atk} · DEF ${merc.def} · STAM ${merc.stamina}`;
    label.innerHTML = `<strong>${merc.name} [${merc.grade}]</strong><span>${detailText}</span>`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `assign-${merc.id}`;
    checkbox.value = merc.id;
    checkbox.disabled = merc.busy;
    if (!checkbox.disabled && initialSelection.includes(merc.id)) {
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
      if (checkbox.disabled) {
        return;
      }
      checkbox.checked = !checkbox.checked;
      updateSelectionUI();
    });

    item.append(label, checkbox);
    list.appendChild(item);
  });

  elements.modalBody.appendChild(list);

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

  const rivalLine = document.createElement('p');
  rivalLine.className = 'modal-subtle';
  rivalLine.textContent = `AI 입찰가 → ${formatRivalBidSummary(quest)}`;
  elements.modalBody.appendChild(rivalLine);

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
    const winner = determineBidWinner(quest, bidValue);
    quest.bids.winner = winner.type === 'player'
      ? { type: 'player', id: 'player', value: bidValue }
      : { type: 'rival', id: winner.id, value: winner.value };

    const logMessage = buildBidLogMessage(quest, bidValue, winner);
    log(logMessage);

    if (winner.type === 'player') {
      startQuestAfterBid(quest, assignedMercs, bidValue, stance);
      closeModal();
      return;
    }

    markQuestBidFailure(quest, winner);
    save();
    render();
    closeModal();
  });

  actions.append(cancelBtn, confirmBtn);
  elements.modalBody.appendChild(actions);
}

function determineBidWinner(quest, playerBid) {
  const rivalEntries = Array.isArray(quest.bids?.rivals) ? quest.bids.rivals : [];
  const bids = [
    { type: 'player', id: 'player', value: playerBid },
    ...rivalEntries.map((entry) => ({ type: 'rival', id: entry.id, value: entry.value }))
  ];
  bids.sort((a, b) => {
    if (a.value === b.value) {
      if (a.type === b.type) {
        return 0;
      }
      return a.type === 'player' ? -1 : 1;
    }
    return a.value - b.value;
  });
  return bids[0];
}

function buildBidLogMessage(quest, playerBid, winner) {
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
  return `[T${state.turn}] 입찰: Player ${playerBid}G${rivalsSummary ? ` vs ${rivalsSummary}` : ''} → 낙찰: ${winnerName}`;
}

function startQuestAfterBid(quest, assignedMercs, playerBid, stance) {
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
  quest.tempBonusGold = 0;
  quest.stance = typeof stance === 'string' ? stance : 'meticulous';
  quest.journal = Array.isArray(quest.journal) ? quest.journal.slice(-CONFIG.QUEST_JOURNAL_LIMIT) : [];
  assignedMercs.forEach((merc) => {
    merc.busy = true;
  });

  syncMercBusyFromQuests();

  addQuestJournalEntry(quest, '탐험을 시작했습니다.');
  const stanceLabel = quest.stance === 'on_time' ? '기한 준수' : '꼼꼼히 탐색';
  log(`[T${state.turn}] 퀘스트 시작 ${quest.id}: 입찰가 ${playerBid}G, ${assignedMercs.length}명 투입, ${quest.turns_cost}턴 소요 예정. (성향: ${stanceLabel})`);

  clearTempQuestDraft(quest.id);
  save();
  render();
  refreshAssetChecklist();
}

function markQuestBidFailure(quest, winner) {
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
  quest.tempBonusGold = 0;
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
  elements.goldValue.textContent = `${state.gold}G`;
  if (elements.reputationValue) {
    elements.reputationValue.textContent = `${state.reputation}`;
  }
  renderQuestSpawnRate();
  const recruitLocked = CONFIG.RECRUIT_ONCE_PER_TURN && state.lastRecruitTurn === state.turn;
  elements.recruitBtn.disabled = recruitLocked;
  elements.recruitBtn.title = recruitLocked ? '이번 턴에는 이미 용병을 모집했습니다.' : '';
  renderMercs();
  renderQuests();
  renderLogs();
  renderAssetChecklist();
}

/** Render the mercenary list. */
function renderMercs() {
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
    if (merc.busy) {
      card.classList.add('merc-card--busy');
    }

    const body = document.createElement('div');
    body.className = 'merc-card__body';

    const portrait = createPortraitElement(merc);

    const info = document.createElement('div');
    info.className = 'merc-card__info';

    const header = document.createElement('div');
    header.className = 'merc-card__header';
    const name = document.createElement('strong');
    name.textContent = `${merc.name} [${merc.grade}]`;
    const wage = document.createElement('span');
    wage.textContent = `임금 ${merc.wage_per_quest}G`;
    header.append(name, wage);

    const stats = document.createElement('div');
    stats.className = 'merc-card__stats';
    stats.innerHTML = `ATK ${merc.atk} · DEF ${merc.def} · STAM ${merc.stamina} · 계약금 ${merc.signing_bonus}G`;

    info.append(header);

    if (merc.busy) {
      const status = document.createElement('div');
      status.className = 'merc-card__status';
      status.textContent = '🔒 임무 중';
      info.appendChild(status);
    }

    info.appendChild(stats);
    body.append(portrait, info);
    card.append(body);
    elements.mercList.appendChild(card);
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
    if (isInProgress) {
      card.classList.add('quest-card--in-progress');
    }
    if (quest.overdue) {
      card.classList.add('quest-card--overdue');
    }
    if (isBidFailed) {
      card.classList.add('quest-card--bid-failed');
    }

    const header = document.createElement('div');
    header.className = 'quest-card__header';
    const title = document.createElement('strong');
    if (isInProgress) {
      const remainingTurns = Math.max(0, Number(quest.remaining_turns) || 0);
      title.textContent = `던전 탐험 (남은 ${remainingTurns}턴)`;
    } else {
      title.textContent = '던전 탐험';
    }

    const headerActions = document.createElement('div');
    headerActions.className = 'quest-card__header-actions';

    const reward = document.createElement('span');
    reward.textContent = `보상 ${quest.reward}G`;
    const statusBadge = document.createElement('span');
    statusBadge.className = 'quest-card__status-badge';
    const visibleTurns = Math.max(0, Number(quest.remaining_visible_turns) || 0);
    if (isInProgress) {
      if (quest.overdue) {
        statusBadge.textContent = '기한 초과';
        statusBadge.classList.add('quest-card__status-badge--overdue');
      } else {
        statusBadge.textContent = '진행 중';
        statusBadge.classList.add('quest-card__status-badge--active');
      }
    } else if (isBidFailed) {
      statusBadge.textContent = '낙찰 실패';
      statusBadge.classList.add('quest-card__status-badge--failed');
    } else {
      statusBadge.textContent = `대기 중 (만료까지 ${visibleTurns}턴)`;
    }

    const meta = document.createElement('div');
    meta.className = 'quest-card__meta';
    meta.append(reward, statusBadge);
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
    stats.innerHTML = `<span>소요 ${quest.turns_cost} 턴</span><span>유형: ${quest.type}</span>`;

    const requirements = document.createElement('div');
    requirements.className = 'quest-card__requirements';
    requirements.textContent = `요구 ATK ${quest.req.atk} / DEF ${quest.req.def} / STAM ${quest.req.stam}`;

    const rivalSummary = formatRivalBidSummary(quest);
    let rivalBids = null;
    if (rivalSummary) {
      rivalBids = document.createElement('div');
      rivalBids.className = 'quest-card__rival-bids';
      rivalBids.textContent = rivalSummary;
    }

    const assigned = document.createElement('div');
    assigned.className = 'quest-card__assigned';
    if (isInProgress) {
      const assignedNames = quest.assigned_merc_ids
        .map((id) => state.mercs.find((merc) => merc.id === id))
        .filter(Boolean)
        .map((merc) => merc.name);
      assigned.textContent = assignedNames.length > 0 ? `투입: ${assignedNames.join(', ')}` : '투입 용병 없음';
    }

    const selectedStats = document.createElement('div');
    selectedStats.className = 'quest-card__selected-stats';
    const statsLabel = document.createElement('span');
    statsLabel.className = 'quest-card__selected-stats-label';
    statsLabel.textContent = '현재 선택 용병 합계';
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
      if (statValue >= requirement) {
        stat.classList.add('quest-card__stat--ok');
      } else {
        stat.classList.add('quest-card__stat--insufficient');
      }
      stat.textContent = `${label} ${statValue}`;
      selectedStats.appendChild(stat);
    });

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
    if (rivalBids) {
      card.appendChild(rivalBids);
    }
    if (assigned.textContent) {
      card.appendChild(assigned);
    }
    card.appendChild(selectedStats);
    if (isInProgress) {
      const exploration = document.createElement('div');
      exploration.className = 'quest-card__exploration';

      const progressWrapper = document.createElement('div');
      progressWrapper.className = 'progress-bar';
      const progressFill = document.createElement('div');
      progressFill.className = 'progress-bar__fill';
      const progressBase = Math.max(1, Number(quest.deadline_turn) || quest.turns_cost || 1);
      const currentProgress = Math.max(0, Number(quest.progress) || 0);
      const progressPercent = Math.min(100, Math.max(0, (currentProgress / progressBase) * 100));
      progressFill.style.width = `${progressPercent}%`;
      const progressToken = document.createElement('span');
      progressToken.className = 'progress-bar__token';
      progressToken.textContent = '●';
      progressToken.style.left = `${progressPercent}%`;
      progressWrapper.append(progressFill, progressToken);

      const progressLabel = document.createElement('div');
      progressLabel.className = 'progress-bar__label';
      const overdueTurns = Math.max(0, currentProgress - progressBase);
      progressLabel.textContent = overdueTurns > 0
        ? `진행 ${currentProgress}턴 (기한 초과 +${overdueTurns})`
        : `진행 ${currentProgress}턴 / 기한 ${progressBase}턴`;

      const bonusLabel = document.createElement('div');
      bonusLabel.className = 'progress-bar__bonus';
      bonusLabel.textContent = quest.tempBonusGold > 0
        ? `추가 골드 확보 +${quest.tempBonusGold}G`
        : '추가 보상 탐색 중';

      const journal = document.createElement('div');
      journal.className = 'quest-card__journal';
      const recentEntries = Array.isArray(quest.journal) ? quest.journal.slice(-2) : [];
      if (recentEntries.length === 0) {
        const emptyEntry = document.createElement('div');
        emptyEntry.className = 'quest-card__journal-entry';
        emptyEntry.textContent = '최근 탐험 로그 없음';
        journal.appendChild(emptyEntry);
      } else {
        recentEntries.forEach((entry) => {
          const line = document.createElement('div');
          line.className = 'quest-card__journal-entry';
          line.textContent = entry;
          journal.appendChild(line);
        });
      }

      exploration.append(progressWrapper, progressLabel, bonusLabel, journal);
      card.appendChild(exploration);
    }
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

  const name = pickRandomName();
  const atk = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const def = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const stamina = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const signing_bonus = Math.round(clamp(randomInt(CONFIG.MERC_SIGN_MIN, CONFIG.MERC_SIGN_MAX) * modifiers.signMultiplier, CONFIG.MERC_SIGN_MIN, CONFIG.MERC_SIGN_MAX * 1.6));
  const wage_per_quest = Math.round(clamp(randomInt(CONFIG.MERC_WAGE_MIN, CONFIG.MERC_WAGE_MAX) * modifiers.wageMultiplier, CONFIG.MERC_WAGE_MIN, CONFIG.MERC_WAGE_MAX * 1.6));

  return {
    id: `merc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    grade,
    atk,
    def,
    stamina,
    signing_bonus,
    wage_per_quest,
    busy: false
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
 * Pick a random name from the seed name pool.
 * @returns {string}
 */
function pickRandomName() {
  if (!seedData.merc_names || seedData.merc_names.length === 0) {
    return `Merc-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }
  return seedData.merc_names[Math.floor(Math.random() * seedData.merc_names.length)];
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

function randomVisibleTurns() {
  const min = Math.max(1, Number(CONFIG.QUEST_VISIBLE_TURNS_MIN) || 1);
  const maxCandidate = Math.max(min, Number(CONFIG.QUEST_VISIBLE_TURNS_MAX) || min);
  return randomInt(min, maxCandidate);
}

function formatSpawnRate() {
  const rate = Math.min(1, Math.max(0, Number(CONFIG.QUEST_SPAWN_RATE) || 0));
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
 *
 * @typedef {Object} Quest
 * @property {string} id
 * @property {'dungeon'} type
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
 * @property {number} tempBonusGold
 * @property {string[]} journal
 *
 * @typedef {{id: string, name: string, rep: number}} Rival
 */
