/**
 * Revival Guild Phase 1 prototype main script.
 * Handles state management, UI rendering, and persistence for the mini prototype.
 */

const CONFIG = {
  START_GOLD: 500,
  MERC_POOL_SIZE: 3,
  MERC_SIGN_MIN: 20,
  MERC_SIGN_MAX: 120,
  MERC_WAGE_MIN: 5,
  MERC_WAGE_MAX: 40,
  STAT_MIN: 1,
  STAT_MAX: 10,
  QUEST_REWARD_MIN: 50,
  QUEST_REWARD_MAX: 200,
  QUEST_TURNS_MIN: 1,
  QUEST_TURNS_MAX: 3,
  QUEST_SLOTS: 3,
  ASSET_BG: 'assets/bg/medieval.jpg',
  ASSET_MERC: (mercId) => `assets/mercs/${mercId}.jpg`,
  ASSET_DUNGEON_THUMB: 'assets/monsters/dungeon.jpg',
  LOG_LIMIT: 8
};

const STORAGE_KEY = 'rg_v1_save';

/** @type {{start_gold: number, merc_names: string[]}} */
let seedData = { start_gold: CONFIG.START_GOLD, merc_names: [] };

/** @type {GameState & {log: string[]}} */
let state = {
  gold: CONFIG.START_GOLD,
  turn: 1,
  mercs: [],
  quests: [],
  log: []
};

let currentRecruitCandidates = [];
let currentQuestId = null;
let assetChecklist = [];
let assetChecklistLoading = true;
let lastAssetLogSignature = '';

const elements = {
  goldValue: document.getElementById('gold-value'),
  mercList: document.getElementById('merc-list'),
  questList: document.getElementById('quest-list'),
  logList: document.getElementById('log-list'),
  assetList: document.getElementById('missing-assets-list'),
  assetNote: document.getElementById('asset-note'),
  recruitBtn: document.getElementById('recruit-btn'),
  newTurnBtn: document.getElementById('new-turn-btn'),
  modalOverlay: document.getElementById('modal-overlay'),
  modal: document.getElementById('modal-content'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.getElementById('modal-close')
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
  elements.recruitBtn.addEventListener('click', () => openRecruitModal());
  elements.newTurnBtn.addEventListener('click', () => newTurn());
  elements.modalClose.addEventListener('click', closeModal);
  elements.modalOverlay.addEventListener('click', (event) => {
    if (event.target === elements.modalOverlay) {
      closeModal();
    }
  });
}

/**
 * Load state from localStorage, falling back to a freshly seeded state.
 */
function load() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      state = {
        gold: Math.max(0, Number(parsed.gold) || CONFIG.START_GOLD),
        turn: Math.max(1, Number(parsed.turn) || 1),
        mercs: Array.isArray(parsed.mercs) ? parsed.mercs : [],
        quests: Array.isArray(parsed.quests) ? parsed.quests : [],
        log: Array.isArray(parsed.log) ? parsed.log.slice(-CONFIG.LOG_LIMIT) : []
      };
      return;
    } catch (error) {
      console.warn('Failed to parse stored state, starting fresh.', error);
    }
  }

  state = {
    gold: CONFIG.START_GOLD,
    turn: 1,
    mercs: [],
    quests: [],
    log: []
  };
  save();
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
    log: state.log
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
  state.quests = Array.from({ length: CONFIG.QUEST_SLOTS }, () => generateQuest());
  log(`턴 ${state.turn} 시작! 새로운 던전 퀘스트가 준비되었습니다.`);
  save();
  render();
  refreshAssetChecklist();
}

/**
 * Create a random quest.
 * @returns {Quest}
 */
function generateQuest() {
  return {
    id: `quest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'dungeon',
    reward: randomInt(CONFIG.QUEST_REWARD_MIN, CONFIG.QUEST_REWARD_MAX),
    turns_cost: randomInt(CONFIG.QUEST_TURNS_MIN, CONFIG.QUEST_TURNS_MAX)
  };
}

/**
 * Open the recruit modal with a fresh pool of candidate mercenaries.
 */
function openRecruitModal() {
  currentRecruitCandidates = Array.from({ length: CONFIG.MERC_POOL_SIZE }, () => generateMerc());
  elements.modalTitle.textContent = '용병 모집';
  elements.modalBody.innerHTML = '';

  const description = document.createElement('p');
  description.textContent = '고용할 용병을 선택하세요. 계약금이 즉시 차감됩니다.';
  description.className = 'modal-description';
  elements.modalBody.appendChild(description);

  currentRecruitCandidates.forEach((merc) => {
    const card = document.createElement('div');
    card.className = 'recruit-card';

    const portrait = createPortraitElement(merc);

    const body = document.createElement('div');
    body.className = 'recruit-card__body';

    const header = document.createElement('div');
    header.className = 'recruit-card__header';
    const name = document.createElement('strong');
    name.textContent = `${merc.name} [${merc.grade}]`;
    const cost = document.createElement('span');
    cost.textContent = `계약금 ${merc.signing_bonus}G`;
    header.append(name, cost);

    const stats = document.createElement('div');
    stats.className = 'merc-card__stats';
    stats.innerHTML = `ATK ${merc.atk} · DEF ${merc.def} · STAM ${merc.stamina} · 임금 ${merc.wage_per_quest}G`;

    const hireBtn = document.createElement('button');
    hireBtn.className = 'btn btn--accent';
    hireBtn.textContent = '고용하기';
    hireBtn.addEventListener('click', () => hireMerc(merc));

    body.append(header, stats, hireBtn);
    card.append(portrait, body);
    elements.modalBody.appendChild(card);
  });

  openModal();
}

/**
 * Attempt to hire a mercenary and deduct the signing bonus.
 * @param {Merc} merc
 */
function hireMerc(merc) {
  if (state.gold < merc.signing_bonus) {
    log(`골드가 부족하여 ${merc.name} 용병을 고용할 수 없습니다.`);
    return;
  }

  state.gold -= merc.signing_bonus;
  state.mercs.push(merc);
  log(`${merc.name} [${merc.grade}] 용병을 고용했습니다. 계약금 ${merc.signing_bonus}G 지급.`);
  save();
  render();
  refreshAssetChecklist();
  closeModal();
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

  if (state.mercs.length === 0) {
    log('투입할 용병이 없습니다. 먼저 용병을 고용하세요.');
    return;
  }

  currentQuestId = questId;
  elements.modalTitle.textContent = '용병 배치';
  elements.modalBody.innerHTML = '';

  const summary = document.createElement('p');
  summary.textContent = `보상 ${quest.reward}G, 소모 ${quest.turns_cost} 턴`; 
  summary.className = 'modal-description';
  elements.modalBody.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'assign-list';

  state.mercs.forEach((merc) => {
    const item = document.createElement('div');
    item.className = 'assign-item';

    const label = document.createElement('label');
    label.setAttribute('for', `assign-${merc.id}`);
    label.innerHTML = `<strong>${merc.name} [${merc.grade}]</strong><span>임금 ${merc.wage_per_quest}G · ATK ${merc.atk} · DEF ${merc.def}</span>`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `assign-${merc.id}`;
    checkbox.value = merc.id;

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
  confirmBtn.textContent = '퀘스트 수행';
  confirmBtn.addEventListener('click', () => {
    const selected = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    if (selected.length === 0) {
      log('최소 한 명의 용병을 선택해야 합니다.');
      return;
    }
    runQuest(questId, selected);
    closeModal();
  });

  actions.append(cancelBtn, confirmBtn);
  elements.modalBody.appendChild(actions);

  openModal();
}

/**
 * Resolve a quest with the selected mercenaries, updating gold and quest slots.
 * @param {string} questId
 * @param {string[]} selectedMercIds
 */
function runQuest(questId, selectedMercIds) {
  const questIndex = state.quests.findIndex((quest) => quest.id === questId);
  if (questIndex === -1) {
    log('퀘스트를 찾을 수 없습니다.');
    return;
  }

  const quest = state.quests[questIndex];
  const assignedMercs = state.mercs.filter((merc) => selectedMercIds.includes(merc.id));
  if (assignedMercs.length === 0) {
    log('선택된 용병이 없습니다.');
    return;
  }

  const totalWages = assignedMercs.reduce((sum, merc) => sum + merc.wage_per_quest, 0);
  const netGain = quest.reward - totalWages;
  const previousGold = state.gold;
  const updatedGold = Math.max(0, previousGold + netGain);
  state.gold = updatedGold;
  const wageSummary = assignedMercs.map((merc) => `${merc.name}(${merc.wage_per_quest}G)`).join(', ');
  log(`턴 ${state.turn}: "${quest.type}" 퀘스트 수행. 투입 ${assignedMercs.length}명 (${wageSummary}). 보상 ${quest.reward}G, 임금 ${totalWages}G → 순이익 ${netGain >= 0 ? '+' : ''}${netGain}G, Gold=${state.gold}G`);

  state.quests.splice(questIndex, 1, generateQuest());
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

    info.append(header, stats);
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
  if (state.quests.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '턴을 진행해 퀘스트를 생성하세요.';
    elements.questList.appendChild(empty);
    return;
  }

  state.quests.forEach((quest) => {
    const card = document.createElement('div');
    card.className = 'quest-card';

    const header = document.createElement('div');
    header.className = 'quest-card__header';
    const title = document.createElement('strong');
    title.textContent = `던전 탐험`;
    const reward = document.createElement('span');
    reward.textContent = `보상 ${quest.reward}G`;
    header.append(title, reward);

    const stats = document.createElement('div');
    stats.className = 'quest-card__stats';
    stats.innerHTML = `<span>소요 ${quest.turns_cost} 턴</span><span>유형: ${quest.type}</span>`;

    const actions = document.createElement('div');
    actions.className = 'quest-card__actions';
    const runBtn = document.createElement('button');
    runBtn.className = 'btn btn--accent';
    runBtn.textContent = '수행하기';
    runBtn.addEventListener('click', () => openQuestAssignModal(quest.id));
    actions.appendChild(runBtn);

    card.append(header, stats, actions);
    elements.questList.appendChild(card);
  });
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

/**
 * Close the currently active modal.
 */
function closeModal() {
  elements.modalOverlay.classList.add('hidden');
  elements.modalBody.innerHTML = '';
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
    wage_per_quest
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

/**
 * @typedef {Object} GameState
 * @property {number} gold
 * @property {number} turn
 * @property {Merc[]} mercs
 * @property {Quest[]} quests
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
 *
 * @typedef {Object} Quest
 * @property {string} id
 * @property {'dungeon'} type
 * @property {number} reward
 * @property {number} turns_cost
 */
