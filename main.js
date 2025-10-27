/**
 * Revival Guild Phase 1 prototype main script.
 * Handles state management, UI rendering, and persistence for the mini prototype.
 */

if (typeof window !== 'undefined' && typeof window.__RG_DEBUG === 'undefined') {
  window.__RG_DEBUG = false;
}

const DEBUG_MODE = typeof window !== 'undefined' && window.location.search.includes('debug=1');

const REPUTATION = {
  MIN: 0,
  MAX: 1000,
  bands: [
    { key: 'low', name: '알려지지 않음', range: [0, 199] },
    { key: 'mid1', name: '지역에 알려짐', range: [200, 499] },
    { key: 'mid2', name: '국가에 알려짐', range: [500, 799] },
    { key: 'high', name: '대륙에 알려짐', range: [800, 899] },
    { key: 'top', name: '전세계에 알려짐', range: [900, 1000] }
  ]
};

const CONFIG = {
  START_GOLD: 50000,
  START_YEAR: 21,
  START_MONTH: 4,
  MERC_POOL_SIZE: 5,
  MERC_SIGN_MIN: 20,
  MERC_SIGN_MAX: 120,
  MERC_WAGE_MIN: 5,
  MERC_WAGE_MAX: 40,
  MERC_STAT_BONUS: 10,
  STAT_MIN: 1,
  STAT_MAX: 10,
  QUEST_SLOTS: 3,
  QUEST_VISIBLE_TURNS_MIN: 1,
  QUEST_VISIBLE_TURNS_MAX: 4,
  QUEST_REWARD_MIN: 20,
  QUEST_REWARD_MAX: 1000,
  QUEST_TURNS_MIN: 3,
  QUEST_TURNS_MAX: 12,
  RECRUIT_ONCE_PER_TURN: true,
  ASSET_BG: 'assets/bg/medieval.jpg',
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
  START_REPUTATION: 250,
  REP_MIN: REPUTATION.MIN,
  REP_MAX: REPUTATION.MAX,
  PREP_BAL: {
    successBase: 0.78,
    successPerOver: 0.1,
    expeditePerOver: 0.2,
    delayPerUnder: 0.25
  }
};

const SPAWN_TABLE = {
  quests: {
    low: [0.0, 0.02, 0.18, 0.55, 0.25],
    mid1: [0.02, 0.1, 0.3, 0.45, 0.13],
    mid2: [0.05, 0.18, 0.38, 0.34, 0.05],
    high: [0.09, 0.22, 0.4, 0.26, 0.03],
    top: [0.16, 0.28, 0.38, 0.16, 0.02]
  },
  mercs: {
    low: [0.0, 0.01, 0.1, 0.39, 0.5],
    mid1: [0.01, 0.06, 0.22, 0.46, 0.25],
    mid2: [0.03, 0.12, 0.33, 0.41, 0.11],
    high: [0.06, 0.18, 0.38, 0.33, 0.05],
    top: [0.1, 0.24, 0.4, 0.23, 0.03]
  }
};

const ECON = {
  wageCoefPerPoint: 2.0,
  signingCoefPerPoint: 6.0,
  baseReward: 40,
  tierCoef: { S: 1.8, A: 1.4, B: 1.1, C: 0.8, D: 0.5 },
  turnCoef: (t) => 0.75 + 0.12 * t,
  variance: 0.1
};

const QUEST_CONFIG = {
  spawnRate: 0.6
};

const QUEST_TURN_RANGES = {
  S: [8, 12],
  A: [7, 10],
  B: [6, 8],
  C: [4, 6],
  D: [3, 5]
};

const FIRST_NAMES = ['Egon', 'Lira', 'Bran', 'Kara', 'Sven', 'Toma', 'Nia', 'Roth', 'Elda', 'Finn', 'Mara', 'Ivo', 'Cael', 'Rina', 'Dane'];
const CLAN_NAMES = ['Stone', 'Ash', 'Rook', 'Vale', 'Gale', 'Holt', 'Ember', 'Reed', 'Crow', 'Voss', 'Thorn', 'Hale'];
const RARE_SUFFIXES = ['′', '•', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', ' of Vale'];
const SUPERSCRIPT_DIGITS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

const STORAGE_KEY = 'rg_v1_save';
const SAVE_VERSION = 5;

const QUEST_IMPORTANCE_BY_TIER = {
  S: ['reputation', 'stats'],
  A: ['stats', 'reputation', 'gold'],
  B: ['gold', 'stats', 'reputation'],
  C: ['gold', 'gold', 'stats'],
  D: ['gold', 'stats', 'gold']
};

const REPUTATION_REWARD_BY_TIER = {
  S: 12,
  A: 8,
  B: 5,
  C: 3,
  D: 2
};

const DEFAULT_RIVALS = [
  { id: 'r1', name: 'Iron Fang', rep: 520 },
  { id: 'r2', name: 'Moonlight', rep: 470 },
  { id: 'r3', name: 'Ashen Company', rep: 610 }
];

const GRADE_ORDER = ['S', 'A', 'B', 'C', 'D'];

const NAMED_RATE = 0.1;
const TOWNIE_RATE = 0.05;
const DEFAULT_REAPPEAR_COOLDOWN = 10;

const CODEX_STATUS_LABELS = {
  active: '현역',
  retired: '은퇴',
  deceased: '사망',
  left: '이탈'
};

const CODEX_STATUS_ICONS = {
  active: '●',
  retired: '🏳',
  deceased: '✝',
  left: '↩'
};

const TAG_ICONS = {
  named: '★',
  townie: '🏘',
  revisit: '↺'
};

const guildLevel = 1;

let usedNameRegistry = new Set();
let mercDisplayNameCache = new Map();
let hireHistorySet = new Set();

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
  showDebugConfig: false,
  codexFilters: { search: '', grade: 'all', status: 'all' },
  selectedCodexMercId: null,
  codexChronicleExpanded: {},
  probabilityBand: 'current'
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
  recruitPool: [],
  reputation: CONFIG.START_REPUTATION,
  rivals: DEFAULT_RIVALS.map((rival) => ({ ...rival })),
  inventory: createEmptyInventory(),
  meta: createDefaultMeta(),
  codex: createEmptyCodex(),
  pool: createDefaultPools(),
  pendingAssignments: {}
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

function createEmptyCodex() {
  return { mercs: {} };
}

function createDefaultMeta() {
  return { usedNames: [], saveVersion: SAVE_VERSION, tutorialSeen: false, hireHistory: [] };
}

function createDefaultPools() {
  return { namedArchive: {} };
}

function ensureCodex() {
  if (!state.codex || typeof state.codex !== 'object') {
    state.codex = createEmptyCodex();
  }
  if (!state.codex.mercs || typeof state.codex.mercs !== 'object') {
    state.codex.mercs = {};
  }
}

function ensureMeta() {
  if (!state.meta || typeof state.meta !== 'object') {
    state.meta = createDefaultMeta();
  }
  if (!Array.isArray(state.meta.usedNames)) {
    state.meta.usedNames = [];
  }
  if (!Array.isArray(state.meta.hireHistory)) {
    state.meta.hireHistory = [];
  }
  if (typeof state.meta.saveVersion !== 'number') {
    state.meta.saveVersion = 1;
  }
  state.meta.tutorialSeen = Boolean(state.meta.tutorialSeen);
}

function ensurePool() {
  if (!state.pool || typeof state.pool !== 'object') {
    state.pool = createDefaultPools();
  }
  if (!state.pool.namedArchive || typeof state.pool.namedArchive !== 'object') {
    state.pool.namedArchive = {};
  }
}

function ensureRecruitPool() {
  if (!Array.isArray(state.recruitPool)) {
    state.recruitPool = [];
  }
}

function ensureHireHistoryStructure() {
  ensureMeta();
  if (!(hireHistorySet instanceof Set)) {
    hireHistorySet = new Set();
  }
  if (!Array.isArray(state.meta.hireHistory)) {
    state.meta.hireHistory = [];
  }
}

function initializeHireHistory() {
  ensureHireHistoryStructure();
  const beforeList = Array.isArray(state.meta.hireHistory) ? state.meta.hireHistory.slice() : [];
  hireHistorySet = new Set(
    beforeList.filter((id) => typeof id === 'string' && id.trim().length > 0)
  );
  let changed = false;
  (Array.isArray(state.mercs) ? state.mercs : []).forEach((merc) => {
    if (merc && merc.id) {
      const hadId = hireHistorySet.has(merc.id);
      hireHistorySet.add(merc.id);
      if (!hadId) {
        changed = true;
      }
      if (!state.codex.mercs[merc.id]) {
        addToCodexOnHire(merc);
        changed = true;
      }
    }
  });
  syncHireHistoryToState();
  if (!changed) {
    const afterList = state.meta.hireHistory.slice();
    if (afterList.length !== beforeList.length) {
      changed = true;
    } else {
      const sortedBefore = beforeList.slice().sort();
      const sortedAfter = afterList.slice().sort();
      for (let i = 0; i < sortedBefore.length; i += 1) {
        if (sortedBefore[i] !== sortedAfter[i]) {
          changed = true;
          break;
        }
      }
    }
  }
  return changed;
}

function syncHireHistoryToState() {
  ensureHireHistoryStructure();
  state.meta.hireHistory = Array.from(hireHistorySet);
}

function recordHireHistory(mercId) {
  if (!mercId) {
    return;
  }
  ensureHireHistoryStructure();
  hireHistorySet.add(mercId);
  syncHireHistoryToState();
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

function sanitizeCodexMemo(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const collapsed = text.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, 500);
}

function normalizeCodexStatus(status) {
  return CODEX_STATUS_LABELS[status] ? status : 'active';
}

function normalizeRevisitRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const turn = Number.isFinite(record.turn) ? Math.max(1, Math.round(record.turn)) : null;
  const year = Number.isFinite(record.year) ? Math.max(0, Math.round(record.year)) : null;
  const month = Number.isFinite(record.month) ? clamp(Math.round(record.month), 1, 12) : null;
  if (turn == null && year == null && month == null) {
    return null;
  }
  return { turn: turn ?? null, year: year ?? null, month: month ?? null };
}

function normalizeRevisitHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }
  const normalized = history
    .map((record) => normalizeRevisitRecord(record))
    .filter(Boolean);
  normalized.sort((a, b) => {
    const turnA = Number.isFinite(a.turn) ? a.turn : Number.MAX_SAFE_INTEGER;
    const turnB = Number.isFinite(b.turn) ? b.turn : Number.MAX_SAFE_INTEGER;
    if (turnA !== turnB) {
      return turnA - turnB;
    }
    const yearA = Number.isFinite(a.year) ? a.year : Number.MAX_SAFE_INTEGER;
    const yearB = Number.isFinite(b.year) ? b.year : Number.MAX_SAFE_INTEGER;
    if (yearA !== yearB) {
      return yearA - yearB;
    }
    const monthA = Number.isFinite(a.month) ? a.month : Number.MAX_SAFE_INTEGER;
    const monthB = Number.isFinite(b.month) ? b.month : Number.MAX_SAFE_INTEGER;
    return monthA - monthB;
  });
  return normalized;
}

function mergeRevisitHistory(existingHistory, candidateHistory, candidateCount = 0) {
  const base = normalizeRevisitHistory(existingHistory);
  const incoming = normalizeRevisitHistory(candidateHistory);
  let changed = false;
  incoming.forEach((record) => {
    const duplicate = base.some((item) =>
      item.turn === record.turn
      && item.year === record.year
      && item.month === record.month
    );
    if (!duplicate) {
      base.push(record);
      changed = true;
    }
  });
  const normalized = normalizeRevisitHistory(base);
  if (normalized.length !== base.length) {
    changed = true;
  }
  const count = Math.max(normalized.length, Math.max(0, Math.round(Number(candidateCount) || 0)));
  return { history: normalized, count, changed };
}

function normalizeCodexEntry(entry, fallbackId) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const id = typeof entry.id === 'string' ? entry.id : fallbackId;
  if (!id) {
    return null;
  }
  const grade = typeof entry.grade === 'string' ? entry.grade : 'C';
  const firstMet = entry.firstMet && typeof entry.firstMet === 'object'
    ? {
        year: Number.isFinite(entry.firstMet.year) ? entry.firstMet.year : null,
        month: Number.isFinite(entry.firstMet.month)
          ? clamp(Math.round(entry.firstMet.month), 1, 12)
          : null,
        turn: Number.isFinite(entry.firstMet.turn)
          ? Math.max(1, Math.round(entry.firstMet.turn))
          : null
      }
    : null;
  const pendingStance = typeof quest.pending_stance === 'string' && CONFIG.STANCE[quest.pending_stance]
    ? quest.pending_stance
    : quest.preparation?.stance && typeof quest.preparation.stance === 'string' && CONFIG.STANCE[quest.preparation.stance]
      ? quest.preparation.stance
      : status !== 'in_progress' && typeof quest.stance === 'string' && CONFIG.STANCE[quest.stance]
        ? quest.stance
        : null;

  const previewList = Array.isArray(quest.preparation_preview)
    ? quest.preparation_preview.filter((id) => typeof id === 'string')
    : Array.isArray(quest.preparation?.mercs)
      ? quest.preparation.mercs.filter((id) => typeof id === 'string')
      : null;

  const prepResult = quest.preparationResult && typeof quest.preparationResult === 'object'
    ? {
        expediteTurns: Math.max(0, Number(quest.preparationResult.expediteTurns) || 0),
        delayTurns: Math.max(0, Number(quest.preparationResult.delayTurns) || 0),
        ratio: Number(quest.preparationResult.ratio) || 0,
        outcome: quest.preparationResult.outcome === 'failure' ? 'failure' : 'success'
      }
    : null;

  const normalized = {
    id,
    name: typeof entry.name === 'string' ? entry.name : '미상 용병',
    grade,
    firstMet,
    lastSeenTurn: Math.max(1, Math.round(Number(entry.lastSeenTurn) || 1)),
    status: normalizeCodexStatus(entry.status),
    questsCompleted: Math.max(0, Math.round(Number(entry.questsCompleted) || 0)),
    relationship: clampMood(entry.relationship ?? 0),
    memo: sanitizeCodexMemo(entry.memo || ''),
    wage: Math.max(0, Math.round(Number(entry.wage) || 0)),
    signingBonus: Math.max(0, Math.round(Number(entry.signingBonus) || 0)),
    level: Number.isFinite(entry.level)
      ? Math.max(1, Math.round(entry.level))
      : defaultLevelForGrade(grade),
    age: Number.isFinite(entry.age) ? Math.max(0, Math.round(entry.age)) : null,
    isNamed: Boolean(entry.isNamed),
    isTownie: Boolean(entry.isTownie)
  };
  const revisitHistory = normalizeRevisitHistory(entry.revisitHistory);
  normalized.revisitHistory = revisitHistory;
  normalized.revisitCount = Math.max(
    revisitHistory.length,
    Math.max(0, Math.round(Number(entry.revisitCount) || 0))
  );
  return normalized;
}

function normalizeCodex(rawCodex) {
  const normalized = createEmptyCodex();
  if (!rawCodex || typeof rawCodex !== 'object') {
    return normalized;
  }
  const mercs = rawCodex.mercs && typeof rawCodex.mercs === 'object' ? rawCodex.mercs : {};
  Object.keys(mercs).forEach((key) => {
    const entry = normalizeCodexEntry(mercs[key], key);
    if (entry) {
      normalized.mercs[entry.id] = entry;
    }
  });
  return normalized;
}

function normalizePool(rawPool, options = {}) {
  const normalized = createDefaultPools();
  if (!rawPool || typeof rawPool !== 'object') {
    return normalized;
  }
  const archive = rawPool.namedArchive;
  if (archive && typeof archive === 'object') {
    Object.keys(archive).forEach((key) => {
      const rawEntry = archive[key];
      const normalizedMerc = normalizeMerc(rawEntry, {
        skipCodexUpdate: true,
        saveVersion: options.saveVersion ?? SAVE_VERSION
      });
      if (normalizedMerc && normalizedMerc.id) {
        const cooldownUntilTurn = Number.isFinite(rawEntry?.cooldownUntilTurn)
          ? Math.max(0, Math.round(rawEntry.cooldownUntilTurn))
          : normalizedMerc.cooldownUntilTurn;
        const reappearCooldown = Number.isFinite(rawEntry?.reappearCooldown)
          ? Math.max(1, Math.round(rawEntry.reappearCooldown))
          : normalizedMerc.reappearCooldown;
        const revisitCount = Math.max(
          normalizedMerc.revisitHistory.length,
          Math.max(0, Math.round(Number(rawEntry?.revisitCount) || normalizedMerc.revisitCount || 0))
        );
        normalized.namedArchive[normalizedMerc.id] = {
          ...normalizedMerc,
          cooldownUntilTurn,
          reappearCooldown,
          revisitCount,
          isReturning: Boolean(rawEntry?.isReturning)
        };
      }
    });
  }
  return normalized;
}

function normalizeRecruitPool(rawPool, options = {}) {
  if (!Array.isArray(rawPool)) {
    return [];
  }
  return rawPool
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const normalized = normalizeMerc(entry, {
        skipCodexUpdate: true,
        saveVersion: options.saveVersion ?? SAVE_VERSION
      });
      if (!normalized) {
        return null;
      }
      assignMercPortrait(normalized);
      if (entry.hired) {
        return null;
      }
      return { ...normalized, hired: false };
    })
    .filter(Boolean);
}

function ensureCodexEntry(merc, allowCreate = false) {
  if (!merc || typeof merc !== 'object' || !merc.id) {
    return null;
  }
  ensureCodex();
  const existing = state.codex.mercs[merc.id];
  if (existing) {
    if (!existing.firstMet) {
      const date = getCalendarDate();
      existing.firstMet = {
        year: date.year,
        month: date.month,
        turn: Math.max(1, Number(state.turn) || 1)
      };
    }
    if (merc.isNamed && !existing.isNamed) {
      existing.isNamed = true;
    }
    if (merc.isTownie && !existing.isTownie) {
      existing.isTownie = true;
    }
    return existing;
  }
  if (!allowCreate) {
    return null;
  }
  const date = getCalendarDate();
  const firstMet = {
    year: date.year,
    month: date.month,
    turn: Math.max(1, Number(state.turn) || 1)
  };
  const seedEntry = normalizeCodexEntry(
    {
      id: merc.id,
      name: merc.name,
      grade: merc.grade,
      firstMet,
      lastSeenTurn: firstMet.turn,
      status: 'active',
      questsCompleted: 0,
      relationship: merc.relationship,
      memo: '',
      wage: merc.wage_per_quest,
      signingBonus: merc.signing_bonus,
      level: merc.level,
      age: merc.age,
      isNamed: Boolean(merc.isNamed),
      isTownie: Boolean(merc.isTownie),
      revisitHistory: Array.isArray(merc.revisitHistory) ? merc.revisitHistory : [],
      revisitCount: Math.max(0, Number(merc.revisitCount) || 0)
    },
    merc.id
  );
  state.codex.mercs[merc.id] = seedEntry;
  return seedEntry;
}

function addToCodexOnHire(merc) {
  if (!merc || typeof merc !== 'object' || !merc.id) {
    return null;
  }
  ensureCodex();
  ensureHireHistoryStructure();
  const entry = ensureCodexEntry(merc, true);
  if (!entry) {
    return null;
  }
  let changed = false;
  if (merc.isNamed && !entry.isNamed) {
    entry.isNamed = true;
    changed = true;
  }
  if (merc.isTownie && !entry.isTownie) {
    entry.isTownie = true;
    changed = true;
  }
  const merged = mergeRevisitHistory(entry.revisitHistory, merc.revisitHistory, merc.revisitCount);
  if (merged.changed) {
    entry.revisitHistory = merged.history;
    entry.revisitCount = merged.count;
    changed = true;
  } else {
    const revisitCandidate = Math.max(
      Number(entry.revisitCount) || 0,
      Math.max(0, Math.round(Number(merc.revisitCount) || 0))
    );
    if (revisitCandidate !== entry.revisitCount) {
      entry.revisitCount = revisitCandidate;
      changed = true;
    }
  }
  entry.status = normalizeCodexStatus(entry.status || 'active');
  recordHireHistory(merc.id);
  if (changed) {
    state.codex.mercs[merc.id] = normalizeCodexEntry(entry, merc.id);
  }
  return state.codex.mercs[merc.id];
}

function updateCodexEntryFromMerc(merc, overrides = {}) {
  if (!merc || typeof merc !== 'object' || !merc.id) {
    return false;
  }
  const entry = ensureCodexEntry(merc, false);
  if (!entry) {
    return false;
  }
  let changed = false;

  const ensureFirstMet = () => {
    if (!entry.firstMet) {
      const date = getCalendarDate();
      entry.firstMet = {
        year: date.year,
        month: date.month,
        turn: Math.max(1, Number(state.turn) || 1)
      };
      changed = true;
    }
  };

  ensureFirstMet();

  const seenTurnCandidate = overrides.lastSeenTurn != null
    ? Math.max(1, Math.round(Number(overrides.lastSeenTurn) || 1))
    : Math.max(entry.lastSeenTurn || 0, Math.max(1, Math.round(Number(state.turn) || 1)));
  if (seenTurnCandidate > (entry.lastSeenTurn || 0)) {
    entry.lastSeenTurn = seenTurnCandidate;
    changed = true;
  }

  if (typeof merc.name === 'string' && merc.name !== entry.name) {
    entry.name = merc.name;
    changed = true;
  }

  if (typeof merc.grade === 'string' && merc.grade !== entry.grade) {
    entry.grade = merc.grade;
    changed = true;
  }

  const relationshipSource = overrides.relationship != null ? overrides.relationship : merc.relationship;
  if (relationshipSource != null) {
    const normalizedRelationship = clampMood(relationshipSource);
    if (normalizedRelationship !== entry.relationship) {
      entry.relationship = normalizedRelationship;
      changed = true;
    }
  }

  const wage = Number(merc.wage_per_quest);
  if (Number.isFinite(wage) && Math.round(wage) !== entry.wage) {
    entry.wage = Math.round(wage);
    changed = true;
  }

  const signingBonus = Number(merc.signing_bonus);
  if (Number.isFinite(signingBonus) && Math.round(signingBonus) !== entry.signingBonus) {
    entry.signingBonus = Math.round(signingBonus);
    changed = true;
  }

  const level = Number(merc.level);
  if (Number.isFinite(level)) {
    const normalizedLevel = Math.max(1, Math.round(level));
    if (normalizedLevel !== entry.level) {
      entry.level = normalizedLevel;
      changed = true;
    }
  }

  const age = Number(merc.age);
  if (Number.isFinite(age)) {
    const normalizedAge = Math.max(0, Math.round(age));
    if (normalizedAge !== entry.age) {
      entry.age = normalizedAge;
      changed = true;
    }
  }

  if ('status' in overrides) {
    const normalizedStatus = normalizeCodexStatus(overrides.status);
    if (normalizedStatus !== entry.status) {
      entry.status = normalizedStatus;
      changed = true;
    }
  }

  if ('questsCompleted' in overrides && overrides.questsCompleted != null) {
    const value = Math.max(0, Math.round(Number(overrides.questsCompleted) || 0));
    if (value !== entry.questsCompleted) {
      entry.questsCompleted = value;
      changed = true;
    }
  }

  if ('questsCompletedIncrement' in overrides) {
    const increment = Math.max(0, Math.round(Number(overrides.questsCompletedIncrement) || 0));
    if (increment > 0) {
      entry.questsCompleted = Math.max(0, Number(entry.questsCompleted) || 0) + increment;
      changed = true;
    }
  }

  if ('memo' in overrides) {
    const sanitized = sanitizeCodexMemo(overrides.memo);
    if (sanitized !== entry.memo) {
      entry.memo = sanitized;
      changed = true;
    }
  }

  if (merc.isNamed && !entry.isNamed) {
    entry.isNamed = true;
    changed = true;
  }
  if (merc.isTownie && !entry.isTownie) {
    entry.isTownie = true;
    changed = true;
  }
  const mergedRevisits = mergeRevisitHistory(entry.revisitHistory, merc.revisitHistory, merc.revisitCount);
  if (mergedRevisits.changed) {
    entry.revisitHistory = mergedRevisits.history;
    entry.revisitCount = mergedRevisits.count;
    changed = true;
  } else {
    const revisitCandidate = Math.max(
      Number(entry.revisitCount) || 0,
      Math.max(0, Math.round(Number(merc.revisitCount) || 0))
    );
    if (revisitCandidate !== entry.revisitCount) {
      entry.revisitCount = revisitCandidate;
      changed = true;
    }
  }
  return changed;
}

function syncCodexFromMercRoster() {
  let changed = false;
  (Array.isArray(state.mercs) ? state.mercs : []).forEach((merc) => {
    if (updateCodexEntryFromMerc(merc)) {
      changed = true;
    }
  });
  return changed;
}

function cleanupCodexForNonHires() {
  ensureCodex();
  ensureHireHistoryStructure();
  const keepIds = new Set();
  (Array.isArray(state.mercs) ? state.mercs : []).forEach((merc) => {
    if (merc && merc.id) {
      keepIds.add(merc.id);
    }
  });
  hireHistorySet.forEach((id) => keepIds.add(id));
  let removed = false;
  Object.keys(state.codex.mercs).forEach((id) => {
    if (!keepIds.has(id)) {
      delete state.codex.mercs[id];
      removed = true;
    }
  });
  return removed;
}

function getCodexEntryById(mercId) {
  ensureCodex();
  if (!mercId) {
    return null;
  }
  return state.codex.mercs[mercId] || null;
}

function getCodexEntries() {
  ensureCodex();
  const entries = Object.values(state.codex.mercs || {});
  entries.sort((a, b) => {
    const turnA = Number.isFinite(a?.firstMet?.turn) ? a.firstMet.turn : Number.MAX_SAFE_INTEGER;
    const turnB = Number.isFinite(b?.firstMet?.turn) ? b.firstMet.turn : Number.MAX_SAFE_INTEGER;
    if (turnA !== turnB) {
      return turnA - turnB;
    }
    const nameA = typeof a.name === 'string' ? a.name : '';
    const nameB = typeof b.name === 'string' ? b.name : '';
    return nameA.localeCompare(nameB, 'ko');
  });
  return entries;
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
  reputationBand: document.getElementById('reputation-band'),
  reputationIncrease: document.getElementById('reputation-increase'),
  reputationDecrease: document.getElementById('reputation-decrease'),
  assetList: document.getElementById('missing-assets-list'),
  assetNote: document.getElementById('asset-note'),
  recruitBtn: document.getElementById('recruit-btn'),
  questBidBtn: document.getElementById('quest-bid-btn'),
  recruitList: document.getElementById('recruit-list'),
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
  resetBtn: document.getElementById('reset-btn'),
  mainTabs: document.getElementById('main-tabs'),
  mainTabPanels: document.querySelectorAll('[data-tab-panel]'),
  inventoryTabs: document.getElementById('inventory-tabs'),
  inventoryPanels: document.querySelectorAll('[data-inventory-panel]'),
  inventoryEquipList: document.getElementById('inventory-equip'),
  inventoryCurrencyList: document.getElementById('inventory-currency'),
  inventoryConsumableList: document.getElementById('inventory-consumable'),
  questDashboard: document.getElementById('quest-dashboard'),
  probabilityToggle: document.getElementById('probability-preview-toggle'),
  probabilityPanel: document.getElementById('probability-panel'),
  probabilityQuestTable: document.getElementById('probability-quests'),
  probabilityMercTable: document.getElementById('probability-mercs'),
  probabilityReputation: document.getElementById('probability-reputation'),
  probabilityReputationBand: document.getElementById('probability-reputation-band'),
  probabilityBandSelect: document.getElementById('probability-band-select'),
  probabilityQuestTitle: document.getElementById('probability-quests-title'),
  probabilityMercTitle: document.getElementById('probability-mercs-title'),
  debugConfig: document.getElementById('debug-config'),
  configDump: document.getElementById('config-dump'),
  debugConfigToggle: document.getElementById('debug-config-toggle'),
  debugSaveBtn: document.getElementById('debug-save-btn'),
  debugLoadBtn: document.getElementById('debug-load-btn'),
  codexSearch: document.getElementById('codex-search'),
  codexGradeFilter: document.getElementById('codex-filter-grade'),
  codexStatusFilter: document.getElementById('codex-filter-status'),
  codexTableBody: document.getElementById('codex-table-body'),
  codexDetail: document.getElementById('codex-detail'),
  formationModal: document.getElementById('formation-modal'),
  formationMercList: document.getElementById('formation-merc-list'),
  formationSum: document.getElementById('formation-sum'),
  formationConfirm: document.getElementById('formation-confirm')
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

if (typeof window !== 'undefined') {
  window.handleHireClick = handleHireClick;
}

document.addEventListener('DOMContentLoaded', init);

/**
 * Attach global event listeners for top-level actions and modal close.
 */
function bindEvents() {
  elements.recruitBtn.addEventListener('click', () => openRecruit());
  if (elements.questBidBtn) {
    elements.questBidBtn.addEventListener('click', openQuestBidSelector);
  }
  elements.newTurnBtn.addEventListener('click', () => newTurn());
  elements.modalClose.addEventListener('click', closeModal);
  if (elements.formulaToggle) {
    elements.formulaToggle.addEventListener('click', toggleBoardFormula);
  }
  if (elements.backgroundToggle) {
    elements.backgroundToggle.addEventListener('click', toggleBackgroundEmphasis);
  }
  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', openResetModal);
  }
  if (elements.modalBody) {
    elements.modalBody.addEventListener('click', (event) => {
      const btn = event.target?.closest('[data-modal-action="hire"]');
      if (!btn) {
        return;
      }
      if (elements.modalBody.dataset.modalType !== 'recruit') {
        return;
      }
      const id = btn.getAttribute('data-merc-id');
      if (!id) {
        return;
      }
      if (typeof window !== 'undefined' && window.__RG_DEBUG) {
        console.log('HIT:recruit-modal-hire-click', { mercId: id });
      }
      handleHireClick(id);
    });
  }
  if (elements.reputationIncrease) {
    elements.reputationIncrease.addEventListener('click', () => adjustReputation(50));
  }
  if (elements.reputationDecrease) {
    elements.reputationDecrease.addEventListener('click', () => adjustReputation(-50));
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
  if (elements.codexSearch) {
    elements.codexSearch.addEventListener('input', handleCodexSearchInput);
  }
  if (elements.codexGradeFilter) {
    elements.codexGradeFilter.addEventListener('change', handleCodexFilterChange);
  }
  if (elements.codexStatusFilter) {
    elements.codexStatusFilter.addEventListener('change', handleCodexFilterChange);
  }
  if (elements.probabilityBandSelect) {
    elements.probabilityBandSelect.addEventListener('change', handleProbabilityBandChange);
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

function sumSelectedStats(setIds) {
  const totals = { atk: 0, def: 0, stam: 0, total: 0 };
  if (!(setIds instanceof Set)) {
    return totals;
  }
  setIds.forEach((id) => {
    const merc = state.mercs.find((entry) => entry.id === id);
    if (!merc) {
      return;
    }
    totals.atk += Number(merc.atk) || 0;
    totals.def += Number(merc.def) || 0;
    totals.stam += Number(merc.stamina || merc.stam) || 0;
  });
  totals.total = totals.atk + totals.def + totals.stam;
  return totals;
}

function mapPos(r, max) {
  const factor = Math.max(0, Math.min(1, Number(r) || 0));
  return factor * (max || 1);
}

function mapNeg(r, max) {
  const factor = Math.max(0, Math.min(1, -(Number(r) || 0)));
  return factor * (max || 1);
}

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  if (num <= 0) {
    return 0;
  }
  if (num >= 1) {
    return 1;
  }
  return num;
}

function getQuestRecommended(quest) {
  const fallback = { atk: 0, def: 0, stam: 0 };
  if (!quest || typeof quest.recommended !== 'object') {
    return fallback;
  }
  return {
    atk: Math.max(0, Number(quest.recommended.atk) || 0),
    def: Math.max(0, Number(quest.recommended.def) || 0),
    stam: Math.max(0, Number(quest.recommended.stam) || 0)
  };
}

function getQuestRecommendedTotal(quest) {
  const recommended = getQuestRecommended(quest);
  return Math.max(1, recommended.atk + recommended.def + recommended.stam);
}

function computeAssignmentTotals(mercs) {
  return mercs.reduce(
    (acc, merc) => {
      acc.atk += Number(merc?.atk) || 0;
      acc.def += Number(merc?.def) || 0;
      acc.stam += Number(merc?.stamina) || 0;
      return acc;
    },
    { atk: 0, def: 0, stam: 0 }
  );
}

function computeOverRatio(sumTotal, recommendedTotal) {
  if (recommendedTotal <= 0) {
    return 0;
  }
  const ratio = (sumTotal - recommendedTotal) / recommendedTotal;
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  if (ratio > 1.2) {
    return 1.2;
  }
  if (ratio < -0.6) {
    return -0.6;
  }
  return ratio;
}

function mapPositiveRatio(overRatio) {
  return Math.max(0, Math.min(1, overRatio));
}

function mapNegativeRatio(overRatio) {
  const magnitude = Math.max(0, -overRatio);
  return Math.min(1, magnitude / 0.6);
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

function resetCodexUIState() {
  uiState.codexFilters = { search: '', grade: 'all', status: 'all' };
  uiState.selectedCodexMercId = null;
  uiState.codexChronicleExpanded = {};
  if (elements.codexSearch) {
    elements.codexSearch.value = '';
  }
  if (elements.codexGradeFilter) {
    elements.codexGradeFilter.value = 'all';
  }
  if (elements.codexStatusFilter) {
    elements.codexStatusFilter.value = 'all';
  }
}

function openResetModal() {
  resetModalRequirementSummary();
  if (!elements.modalTitle || !elements.modalBody) {
    return;
  }
  elements.modalTitle.textContent = '새 게임 시작';
  elements.modalBody.innerHTML = '';

  const message = document.createElement('p');
  message.className = 'modal-description';
  message.textContent = '저장된 진행 상황을 모두 삭제하고 새 게임을 시작하시겠습니까?';
  elements.modalBody.appendChild(message);

  const warning = document.createElement('p');
  warning.className = 'modal-highlight';
  warning.textContent = '확인을 누르면 현재 저장 데이터가 삭제됩니다.';
  elements.modalBody.appendChild(warning);

  const actions = document.createElement('div');
  actions.className = 'modal__actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn--primary';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', closeModal);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--danger';
  confirmBtn.textContent = '새 게임 시작';
  confirmBtn.addEventListener('click', performNewGameReset);

  actions.append(cancelBtn, confirmBtn);
  elements.modalBody.appendChild(actions);

  openModal();
}

function performNewGameReset() {
  localStorage.removeItem(STORAGE_KEY);
  closeModal();
  resetCodexUIState();
  clearAllTempSelections();
  currentRecruitCandidates = [];
  state.recruitPool = [];
  uiState.activeMainTab = 'quests';
  uiState.activeInventoryTab = 'currency';
  uiState.backgroundDimmed = false;
  updatePanelDimming();
  load();
  switchMainTab('quests');
  switchInventoryTab('currency');
  render();
  refreshAssetChecklist();
  log(`[T${state.turn}] 새 게임을 시작했습니다. 첫 퀘스트를 탐색해 보세요.`);
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
      elements.configDump.textContent = JSON.stringify({ CONFIG, QUEST_CONFIG, SPAWN_TABLE, ECON, REPUTATION }, null, 2);
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

function clearAllTempSelections() {
  Object.keys(tempSelections).forEach((key) => {
    delete tempSelections[key];
  });
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
  if (!quest || !quest.recommended) {
    return 1;
  }
  const total = (Number(quest.recommended.atk) || 0) + (Number(quest.recommended.def) || 0) + (Number(quest.recommended.stam) || 0);
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
    updateCodexEntryFromMerc(merc, { lastSeenTurn: state.turn, relationship: merc.relationship });
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
  let needsResave = false;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const parsedMeta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
      const metaVersion = Number.isFinite(parsedMeta.saveVersion) ? parsedMeta.saveVersion : 1;
      const normalizedRivals = Array.isArray(parsed.rivals)
        ? normalizeRivals(parsed.rivals, metaVersion)
        : DEFAULT_RIVALS.map((rival) => ({ ...rival }));
      const meta = {
        usedNames: Array.isArray(parsedMeta.usedNames)
          ? parsedMeta.usedNames.filter((name) => typeof name === 'string')
          : [],
        tutorialSeen: Boolean(parsedMeta.tutorialSeen),
        saveVersion: Number.isFinite(parsedMeta.saveVersion) ? parsedMeta.saveVersion : 1,
        hireHistory: Array.isArray(parsedMeta.hireHistory)
          ? parsedMeta.hireHistory.filter((id) => typeof id === 'string')
          : []
      };
      const normalizedReputation = normalizeReputationValue(
        parsed.reputation,
        CONFIG.START_REPUTATION,
        meta.saveVersion
      );
      state = {
        gold: Math.max(0, Number(parsed.gold) || CONFIG.START_GOLD),
        turn: Math.max(1, Number(parsed.turn) || 1),
        mercs: Array.isArray(parsed.mercs)
          ? parsed.mercs
              .map((merc) => normalizeMerc(merc, { skipCodexUpdate: true, saveVersion: meta.saveVersion }))
              .filter(Boolean)
          : [],
        quests: Array.isArray(parsed.quests)
          ? parsed.quests
              .map((quest) => normalizeQuest(quest, normalizedRivals, { saveVersion: meta.saveVersion }))
              .filter(Boolean)
          : [],
        log: Array.isArray(parsed.log) ? parsed.log.slice(-CONFIG.LOG_LIMIT) : [],
        lastRecruitTurn: typeof parsed.lastRecruitTurn === 'number' ? parsed.lastRecruitTurn : null,
        recruitPool: normalizeRecruitPool(parsed.recruitPool, { saveVersion: meta.saveVersion }),
        reputation: normalizedReputation,
        rivals: normalizedRivals,
        inventory: normalizeInventory(parsed.inventory),
        meta,
        codex: normalizeCodex(parsed.codex),
        pool: normalizePool(parsed.pool, { saveVersion: meta.saveVersion }),
        pendingAssignments: {}
      };
      currentRecruitCandidates = state.recruitPool;
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
      recruitPool: [],
      reputation: CONFIG.START_REPUTATION,
      rivals: DEFAULT_RIVALS.map((rival) => ({ ...rival })),
      inventory: createEmptyInventory(),
      meta: createDefaultMeta(),
      codex: createEmptyCodex(),
      pool: createDefaultPools(),
      pendingAssignments: {}
    };
    currentRecruitCandidates = state.recruitPool;
    needsResave = true;
  }

  ensureMeta();
  ensureCodex();
  ensurePool();
  if (!state.pendingAssignments || typeof state.pendingAssignments !== 'object') {
    state.pendingAssignments = {};
  }
  const hireHistoryChanged = initializeHireHistory();
  const previousVersion = Number.isFinite(state.meta.saveVersion) ? state.meta.saveVersion : 1;
  if (previousVersion !== SAVE_VERSION) {
    state.meta.saveVersion = SAVE_VERSION;
    needsResave = true;
  }
  state.meta.tutorialSeen = Boolean(state.meta.tutorialSeen);

  initializeUsedNames();
  if (hireHistoryChanged) {
    needsResave = true;
  }
  if (cleanupCodexForNonHires()) {
    needsResave = true;
  }
  if (syncCodexFromMercRoster()) {
    needsResave = true;
  }
  ensureQuestSlots();
  if (!loadedFromStorage) {
    spawnQuestsForEmptySlots(true);
  }
  syncMercBusyFromQuests();
  if (!loadedFromStorage) {
    needsResave = true;
  }
  if (needsResave) {
    save();
  }
}

/**
 * Persist the current state to localStorage.
 */
function save() {
  syncUsedNamesToState();
  ensureMeta();
  ensureCodex();
  ensurePool();
  syncHireHistoryToState();
  state.meta.saveVersion = SAVE_VERSION;
  state.meta.tutorialSeen = Boolean(state.meta.tutorialSeen);
  const toSave = {
    gold: state.gold,
    turn: state.turn,
    mercs: state.mercs,
    quests: state.quests,
    log: state.log,
    lastRecruitTurn: state.lastRecruitTurn,
    recruitPool: state.recruitPool,
    reputation: state.reputation,
    rivals: state.rivals,
    inventory: state.inventory,
    meta: state.meta,
    codex: state.codex,
    pool: state.pool
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function persistState() {
  save();
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
      <li>용병 예: m01 → <code>assets/mercs/m01.jpg</code></li>
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
    const mercPath = getMercPortraitPath(merc);
    if (mercPath) {
      required.add(mercPath);
    }
  });
  ensureRecruitPool();
  state.recruitPool.forEach((candidate) => {
    const mercPath = getMercPortraitPath(candidate);
    if (mercPath) {
      required.add(mercPath);
    }
  });
  required.add('assets/mercs/default.jpg');
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
      const previousProgress = getQuestProgressValue(quest);
      const currentRemaining = Number.isFinite(quest.remaining_turns)
        ? quest.remaining_turns
        : Math.max(0, Math.round(Number(quest.turns_cost) || 0) - previousProgress);
      const nextCompleted = previousProgress + 1;
      const nextRemaining = Math.max(0, currentRemaining - 1);
      setQuestProgress(quest, nextCompleted, nextRemaining);
      const progressValue = getQuestProgressValue(quest);
      const deadline = Number.isFinite(quest.deadline_turn) ? quest.deadline_turn : quest.turns_cost;
      if (progressValue > deadline) {
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
        if (progressValue >= midpoint) {
          const campMessage = randomChoice(QUEST_TIMELINE_TEMPLATES.camp) || '야영지를 마련해 숨을 고르었습니다.';
          quest.campPlaced = true;
          fragments.push(campMessage);
          addQuestJournalEntry(quest, campMessage);
          registerQuestEvent(quest, { type: 'camp', text: campMessage, animKey: 'camp', turn: state.turn });
        }
      }

      const assignedMercs = Array.isArray(quest.assigned_merc_ids)
        ? quest.assigned_merc_ids
            .map((id) => state.mercs.find((merc) => merc.id === id))
            .filter(Boolean)
        : [];
      const totals = computeAssignmentTotals(assignedMercs);
      const recommendedTotal = getQuestRecommendedTotal(quest);
      const sumStats = totals.atk + totals.def + totals.stam;
      const overRatio = computeOverRatio(sumStats, recommendedTotal);
      if (!quest.preparationResult || typeof quest.preparationResult !== 'object') {
        quest.preparationResult = { expediteTurns: 0, delayTurns: 0, ratio: overRatio, outcome: 'pending' };
      } else {
        quest.preparationResult.ratio = overRatio;
      }
      const posFactor = mapPositiveRatio(overRatio);
      const negFactor = mapNegativeRatio(overRatio);
      const expediteChance = posFactor * CONFIG.PREP_BAL.expeditePerOver;
      if (quest.remaining_turns > 0 && Math.random() < expediteChance) {
        quest.remaining_turns = Math.max(0, quest.remaining_turns - 1);
        quest.preparationResult.expediteTurns += 1;
        const expediteMessage = '전력 우세로 일정이 단축되었습니다.';
        fragments.push(expediteMessage);
        addQuestJournalEntry(quest, expediteMessage);
        registerQuestEvent(quest, { type: 'story', text: expediteMessage, animKey: 'story', turn: state.turn });
        setQuestProgress(quest, getQuestProgressValue(quest), quest.remaining_turns);
      }
      const delayChance = clamp01((effectiveConfig.overdueProbPerTurn || 0) + negFactor * CONFIG.PREP_BAL.delayPerUnder);

      const questLabel = formatQuestLogLabel(quest);
      let replacementQuest = quest;
      let completed = false;

      if (quest.remaining_turns <= 0) {
        if (Math.random() < delayChance) {
          quest.remaining_turns = 1;
          quest.overdue = true;
          quest.preparationResult.delayTurns += 1;
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
          setQuestProgress(quest, getQuestProgressValue(quest), quest.remaining_turns);
        } else {
          const successBase = CONFIG.PREP_BAL.successBase;
          const successBonus = posFactor * CONFIG.PREP_BAL.successPerOver;
          const successPenalty = negFactor * CONFIG.PREP_BAL.delayPerUnder * 0.5;
          const successChance = clamp01(successBase + successBonus - successPenalty);
          if (Math.random() > successChance) {
            quest.preparationResult.outcome = 'failure';
            const wages = assignedMercs.reduce((sum, merc) => sum + (merc?.wage_per_quest || 0), 0);
            if (wages > 0) {
              state.gold = Math.max(0, state.gold - wages);
            }
            const repPenalty = Math.max(1, Math.round(Math.max(negFactor, 0.1) * 8));
            state.reputation = clampRep(state.reputation - repPenalty);
            const questTitle = getQuestDisplayTitle(quest);
            assignedMercs.forEach((merc) => {
              if (merc) {
                merc.busy = false;
                appendMercJournalEntry(merc, `${questTitle} · 임무 실패`);
              }
            });
            const failureMessage = `[T${state.turn}] 실패: ${questLabel} 전력이 부족해 임무가 중단되었습니다. (임금 ${wages}G, 평판 -${repPenalty})`;
            completionLogs.push(failureMessage);
            addQuestJournalEntry(quest, '임무 실패: 추천 능력치 부족으로 후퇴했습니다.');
            registerQuestEvent(quest, { type: 'story', text: '임무 실패: 전력이 부족했습니다.', animKey: 'story', turn: state.turn });
            return generateQuest();
          }
          quest.preparationResult.outcome = 'success';
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
    if (quest.status === 'awarded') {
      return quest;
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
  archiveCurrentRecruitPool();
  state.lastRecruitTurn = null;
  state.recruitPool = [];
  currentRecruitCandidates = state.recruitPool;

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
  const range = QUEST_TURN_RANGES[tier] || [CONFIG.QUEST_TURNS_MIN, CONFIG.QUEST_TURNS_MAX];
  const minTurns = Math.max(CONFIG.QUEST_TURNS_MIN, range[0]);
  const maxTurns = Math.max(minTurns, range[1]);
  const turns_cost = randomInt(minTurns, maxTurns);
  const reward = calculateQuestReward(tier, turns_cost);
  const importance = pickQuestImportance(tier);
  return {
    id: `quest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'dungeon',
    tier,
    importance,
    reward,
    turns_cost,
    recommended: generateQuestRecommended(turns_cost),
    status: 'ready',
    remaining_turns: 0,
    assigned_merc_ids: [],
    pending_stance: null,
    preparation_preview: null,
    preparationResult: null,
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
    recommended: { atk: 0, def: 0, stam: 0 },
    status: 'empty',
    remaining_turns: 0,
    assigned_merc_ids: [],
    pending_stance: null,
    preparation_preview: null,
    preparationResult: null,
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
  const distribution = getSpawnDistribution('quests', state.reputation) || SPAWN_TABLE.quests.low;
  return sampleGradeFromDistribution(distribution, GRADE_ORDER);
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
 * Generate recommended stats based on quest difficulty/turn cost.
 * @param {number} turns
 * @returns {{atk: number, def: number, stam: number}}
 */
function generateQuestRecommended(turns) {
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
  const prepResult = quest.preparationResult && typeof quest.preparationResult === 'object' ? quest.preparationResult : null;
  let prepNote = '';
  if (prepResult) {
    const notes = [];
    if (prepResult.expediteTurns > 0) {
      notes.push(`조기 완료 (${prepResult.expediteTurns}턴 단축)`);
    }
    if (prepResult.delayTurns > 0) {
      notes.push(`지연 발생 (${prepResult.delayTurns}턴 증가)`);
    }
    if (notes.length > 0) {
      prepNote = ` / 준비 보정: ${notes.join(' / ')}`;
    }
  }

  const finalMessage = prepNote ? `${baseMessage}${prepNote}` : baseMessage;

  const lootResult = maybeGenerateQuestLoot(quest);

  const returnTale = generateReturnAnecdote(assignedMercs);
  const questTitle = getQuestDisplayTitle(quest);
  const returnLog = `[T${state.turn}] 귀환 보고: ${returnTale}`;

  assignedMercs.forEach((merc) => {
    merc.busy = false;
    appendMercJournalEntry(merc, `${questTitle} · ${returnTale}`);
    updateCodexEntryFromMerc(merc, {
      lastSeenTurn: state.turn,
      questsCompletedIncrement: 1,
      relationship: merc.relationship
    });
  });

  return {
    completionMessage: `${finalMessage}${repNoteText}`,
    replacement: generateQuest(),
    lootMessage: lootResult ? lootResult.log : null,
    report: {
      id: quest.id,
      title: questTitle,
      events: timeline,
      animKeyTimeline: animTimeline,
      returnTale,
      returnLog,
      prepNote: prepNote ? prepNote.slice(3) : ''
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
    if (!quest.recommended || typeof quest.recommended !== 'object') {
      quest.recommended = generateQuestRecommended(quest.turns_cost || CONFIG.QUEST_TURNS_MIN);
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
    quest.tier = typeof quest.tier === 'string' && GRADE_ORDER.includes(quest.tier) ? quest.tier : rollQuestTier();
    quest.importance = typeof quest.importance === 'string' && CONFIG.WEIGHTS_BY_IMPORTANCE[quest.importance]
      ? quest.importance
      : pickQuestImportance(quest.tier);
    quest.stance = typeof quest.stance === 'string' && CONFIG.STANCE[quest.stance] ? quest.stance : null;
    const defaultDeadline = quest.turns_cost || CONFIG.QUEST_TURNS_MIN;
    const storedDeadline = Number(quest.deadline_turn);
    quest.deadline_turn = Number.isFinite(storedDeadline) && storedDeadline > 0 ? storedDeadline : defaultDeadline;
    quest.overdue = Boolean(quest.overdue);
    const normalizedProgress = getQuestProgressValue(quest);
    const normalizedRemaining = Number.isFinite(quest.remaining_turns)
      ? Math.max(0, Math.round(Number(quest.remaining_turns)))
      : Math.max(0, Math.round(defaultDeadline - normalizedProgress));
    setQuestProgress(quest, normalizedProgress, normalizedRemaining);
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
function normalizeMerc(merc, options = {}) {
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
  const reappearCooldown = Number.isFinite(merc.reappearCooldown)
    ? Math.max(1, Math.round(merc.reappearCooldown))
    : DEFAULT_REAPPEAR_COOLDOWN;
  const cooldownUntilTurn = Number.isFinite(merc.cooldownUntilTurn)
    ? Math.max(0, Math.round(merc.cooldownUntilTurn))
    : null;
  const revisitHistory = normalizeRevisitHistory(merc.revisitHistory);
  const revisitCount = Math.max(
    revisitHistory.length,
    Math.max(0, Math.round(Number(merc.revisitCount) || 0))
  );
  const normalized = {
    ...merc,
    name,
    grade,
    level,
    age,
    busy: Boolean(merc.busy),
    fatigue,
    relationship,
    benched,
    journal,
    isNamed: Boolean(merc.isNamed),
    isTownie: Boolean(merc.isTownie),
    reappearCooldown,
    cooldownUntilTurn,
    revisitCount,
    revisitHistory,
    isReturning: Boolean(merc.isReturning)
  };
  normalized.atk = Math.max(0, Math.round(Number(merc.atk) || 0));
  normalized.def = Math.max(0, Math.round(Number(merc.def) || 0));
  normalized.stamina = Math.max(0, Math.round(Number(merc.stamina) || 0));
  const statTotal = normalized.atk + normalized.def + normalized.stamina;
  const currentSigning = Number(merc.signing_bonus);
  const currentWage = Number(merc.wage_per_quest);
  const needsEconomyUpdate = options.saveVersion < 4
    || !Number.isFinite(currentSigning)
    || !Number.isFinite(currentWage);
  normalized.signing_bonus = needsEconomyUpdate
    ? calculateMercSigningBonus(statTotal, 0)
    : Math.max(0, Math.round(currentSigning));
  normalized.wage_per_quest = needsEconomyUpdate
    ? calculateMercWage(statTotal, 0)
    : Math.max(0, Math.round(currentWage));
  const lastSeen = Number.isFinite(merc.lastSeenTurn) ? Math.max(1, Math.round(merc.lastSeenTurn)) : state.turn;
  if (!options.skipCodexUpdate) {
    updateCodexEntryFromMerc(normalized, { lastSeenTurn: lastSeen });
  }
  assignMercPortrait(normalized);
  return normalized;
}

/** Normalize a quest object loaded from storage. */
function normalizeQuest(quest, rivals = DEFAULT_RIVALS, options = {}) {
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
      : quest.status === 'preparing' || quest.status === 'awarded'
        ? 'awarded'
        : 'ready';
  const recommended = quest.recommended && typeof quest.recommended === 'object'
    ? {
        atk: Math.max(0, Number(quest.recommended.atk) || 0),
        def: Math.max(0, Number(quest.recommended.def) || 0),
        stam: Math.max(0, Number(quest.recommended.stam) || 0)
      }
    : quest.req && typeof quest.req === 'object'
      ? {
          atk: Math.max(0, Number(quest.req.atk) || 0),
          def: Math.max(0, Number(quest.req.def) || 0),
          stam: Math.max(0, Number(quest.req.stam) || 0)
        }
      : generateQuestRecommended(turns_cost);

  const rewardValue = Number(quest.reward);
  const tier = typeof quest.tier === 'string' && GRADE_ORDER.includes(quest.tier)
    ? quest.tier
    : rollQuestTier();
  const importance = typeof quest.importance === 'string' && CONFIG.WEIGHTS_BY_IMPORTANCE[quest.importance]
    ? quest.importance
    : pickQuestImportance(tier);
  const needsEconomyUpdate = options.saveVersion < 4 || !Number.isFinite(rewardValue);
  const reward = needsEconomyUpdate
    ? calculateQuestReward(tier, turns_cost, 0)
    : clamp(Math.round(rewardValue), CONFIG.QUEST_REWARD_MIN, CONFIG.QUEST_REWARD_MAX);

  const normalized = {
    id: typeof quest.id === 'string' ? quest.id : `quest_${Math.random().toString(36).slice(2, 8)}`,
    type: typeof quest.type === 'string' ? quest.type : 'dungeon',
    tier,
    importance,
    reward,
    turns_cost,
    recommended,
    status,
    remaining_turns: status === 'in_progress'
      ? Math.max(0, Number(quest.remaining_turns) || turns_cost)
      : 0,
    assigned_merc_ids: Array.isArray(quest.assigned_merc_ids) && status === 'in_progress' ? quest.assigned_merc_ids : [],
    pending_stance: pendingStance,
    preparation_preview: previewList,
    preparationResult: prepResult,
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
  normalized.progress = normalizedProgress;
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

function normalizeRivals(rivals, saveVersion = SAVE_VERSION) {
  return rivals
    .map((rival) => {
      if (!rival || typeof rival !== 'object') {
        return null;
      }
      const fallbackRep = DEFAULT_RIVALS[0]?.rep || CONFIG.START_REPUTATION;
      return {
        id: typeof rival.id === 'string' ? rival.id : `r${Math.random().toString(36).slice(2, 6)}`,
        name: typeof rival.name === 'string' ? rival.name : 'Rival Guild',
        rep: normalizeReputationValue(rival.rep, fallbackRep, saveVersion)
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

function archiveCandidateForReappearance(candidate) {
  if (!candidate || candidate.hired) {
    return false;
  }
  if (!candidate.isNamed && !candidate.isTownie) {
    return false;
  }
  ensurePool();
  const cooldown = Number.isFinite(candidate.reappearCooldown)
    ? Math.max(1, Math.round(candidate.reappearCooldown))
    : DEFAULT_REAPPEAR_COOLDOWN;
  const normalized = normalizeMerc(candidate, {
    skipCodexUpdate: true,
    saveVersion: state?.meta?.saveVersion ?? SAVE_VERSION
  });
  if (!normalized || !normalized.id) {
    return false;
  }
  const snapshot = {
    ...normalized,
    hired: undefined,
    cooldownUntilTurn: Math.max(1, Number(state.turn) || 1) + cooldown,
    reappearCooldown: cooldown,
    isReturning: false
  };
  delete snapshot.hired;
  state.pool.namedArchive[normalized.id] = snapshot;
  return true;
}

function archiveCurrentRecruitPool() {
  let archived = false;
  ensureRecruitPool();
  state.recruitPool.forEach((candidate) => {
    if (archiveCandidateForReappearance(candidate)) {
      archived = true;
    }
  });
  return archived;
}

function createRevisitRecord() {
  const date = getCalendarDate();
  return {
    turn: Math.max(1, Number(state.turn) || 1),
    year: Number.isFinite(date.year) ? date.year : null,
    month: Number.isFinite(date.month) ? date.month : null
  };
}

function reviveNamedCandidate(archived) {
  if (!archived || typeof archived !== 'object' || !archived.id) {
    return null;
  }
  const revived = normalizeMerc(archived, {
    skipCodexUpdate: true,
    saveVersion: state?.meta?.saveVersion ?? SAVE_VERSION
  });
  if (!revived) {
    return null;
  }
  const revisitRecord = createRevisitRecord();
  const merged = mergeRevisitHistory(revived.revisitHistory, [revisitRecord], (revived.revisitCount || 0) + 1);
  revived.revisitHistory = merged.history;
  revived.revisitCount = merged.count;
  revived.cooldownUntilTurn = null;
  revived.isReturning = true;
  assignMercPortrait(revived);
  return revived;
}

function collectReappearingCandidates(limit) {
  ensurePool();
  const ready = [];
  const archive = state.pool.namedArchive;
  const ids = Object.keys(archive);
  ids.forEach((id) => {
    if (ready.length >= limit) {
      return;
    }
    const entry = archive[id];
    const cooldownUntil = Number.isFinite(entry?.cooldownUntilTurn)
      ? Math.max(0, Math.round(entry.cooldownUntilTurn))
      : null;
    if (cooldownUntil != null && Number(state.turn) < cooldownUntil) {
      return;
    }
    const revived = reviveNamedCandidate(entry);
    if (revived) {
      ready.push(revived);
      delete archive[id];
    }
  });
  return ready;
}

function buildRecruitCandidates() {
  const limit = Math.max(1, Number(CONFIG.MERC_POOL_SIZE) || 1);
  const ready = collectReappearingCandidates(limit);
  const candidates = ready.map((revived) => ({ ...revived, hired: false }));
  if (ready.length > 0) {
    ready.forEach((merc) => {
      log(`[T${state.turn}] ${merc.name}이(가) 모집소를 다시 찾았습니다.`);
    });
  }
  while (candidates.length < limit) {
    candidates.push({ ...generateMerc(), hired: false });
  }
  return candidates.slice(0, limit);
}

function createTagElement(type, label) {
  const span = document.createElement('span');
  span.className = `tag tag--${type}`;
  const icon = TAG_ICONS[type];
  if (icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'tag__icon';
    iconSpan.textContent = icon;
    span.appendChild(iconSpan);
  }
  const textSpan = document.createElement('span');
  textSpan.className = 'tag__label';
  textSpan.textContent = label;
  span.appendChild(textSpan);
  return span;
}

function createTagRow(attributes = {}, options = {}) {
  const tags = [];
  if (attributes.isNamed) {
    tags.push(createTagElement('named', '네임드'));
  }
  if (attributes.isTownie) {
    tags.push(createTagElement('townie', '마을 출신'));
  }
  const revisitCount = Math.max(0, Math.round(Number(attributes.revisitCount) || 0));
  const returning = Boolean(attributes.returning) || revisitCount > 0;
  if (returning) {
    const baseLabel = options.revisitLabel || '재방문';
    const label = options.showRevisitCount === false || revisitCount === 0
      ? baseLabel
      : `${baseLabel} ${revisitCount}회`;
    tags.push(createTagElement('revisit', label));
  }
  if (tags.length === 0) {
    return null;
  }
  const row = document.createElement('div');
  row.className = 'tag-row';
  if (options.compact) {
    row.classList.add('tag-row--compact');
  }
  if (options.detail) {
    row.classList.add('tag-row--detail');
  }
  tags.forEach((tag) => row.appendChild(tag));
  return row;
}

/**
 * Open the recruit modal with a persistent pool of candidate mercenaries.
 */
function openRecruit() {
  ensureRecruitPool();
  const lockedThisTurn = CONFIG.RECRUIT_ONCE_PER_TURN && state.lastRecruitTurn === state.turn;
  const shouldReusePool = lockedThisTurn;
  let generatedNewPool = false;

  if (!shouldReusePool) {
    const needsNewPool = state.lastRecruitTurn !== state.turn || state.recruitPool.length === 0;
    if (needsNewPool) {
      archiveCurrentRecruitPool();
      state.recruitPool = buildRecruitCandidates();
      state.lastRecruitTurn = state.turn;
      persistState();
      generatedNewPool = true;
    }
  }

  currentRecruitCandidates = state.recruitPool;
  renderRecruitPool();
  showRecruitModal();
  refreshAssetChecklist();

  const message = generatedNewPool
    ? '모집 목록을 갱신했습니다.'
    : state.recruitPool.length > 0
      ? '이번 턴 모집 후보를 불러왔습니다.'
      : '이번 턴 모집 후보가 모두 소진되었습니다.';
  toast(message);
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    const mode = generatedNewPool ? 'newPool' : 'reusePool';
    console.log(`openRecruit: ${mode}`, { turn: state.turn, count: state.recruitPool.length });
  }
}

function showRecruitModal() {
  resetModalRequirementSummary();
  if (!elements.modalBody) {
    return;
  }
  elements.modalBody.dataset.modalType = 'recruit';
  elements.modalTitle.textContent = '용병 모집소';
  elements.modalBody.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'recruit-modal';

  const description = document.createElement('p');
  description.className = 'modal-description';
  description.textContent = '고용할 용병을 선택하세요. 고용 즉시 골드가 차감되고 목록에서 제거됩니다.';
  layout.appendChild(description);

  const list = document.createElement('ul');
  list.id = 'recruit-modal-list';
  list.className = 'recruit-modal__list';
  layout.appendChild(list);

  const note = document.createElement('p');
  note.className = 'modal-subtle';
  note.textContent = '같은 용병을 중복 고용할 수 없으며, 고용 시 도감과 보유 목록이 즉시 갱신됩니다.';
  layout.appendChild(note);

  elements.modalBody.appendChild(layout);
  renderRecruitModalList();
  openModal();
}

function openQuestBidSelector() {
  resetModalRequirementSummary();
  if (!elements.modalBody) {
    return;
  }
  elements.modalBody.dataset.modalType = 'quest-selector';
  elements.modalTitle.textContent = '퀘스트 수주';
  elements.modalBody.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'quest-select';

  const description = document.createElement('p');
  description.className = 'modal-description';
  description.textContent = '입찰할 퀘스트를 선택하세요. 추천 능력치를 확인한 뒤 수주를 진행할 수 있습니다.';
  layout.appendChild(description);

  const list = document.createElement('div');
  list.className = 'quest-select__list';
  layout.appendChild(list);

  const readyQuests = (Array.isArray(state.quests) ? state.quests : [])
    .filter((quest) => quest && !quest.deleted && quest.status === 'ready');

  if (readyQuests.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'quest-select__empty';
    empty.textContent = '입찰 가능한 퀘스트가 없습니다. 턴을 진행해 새 퀘스트를 찾아보세요.';
    list.appendChild(empty);
  } else {
    readyQuests.forEach((quest) => {
      const card = document.createElement('article');
      card.className = 'quest-select__card';

      const header = document.createElement('div');
      header.className = 'quest-select__header';

      const title = document.createElement('h4');
      title.className = 'quest-select__title';
      title.textContent = getQuestDisplayTitle(quest);
      header.appendChild(title);

      const badge = document.createElement('span');
      badge.className = 'quest-select__badge';
      const questType = quest.type || '던전';
      badge.textContent = `${quest.tier || 'C'}급 · ${questType}`;
      header.appendChild(badge);

      card.appendChild(header);

      const reward = document.createElement('div');
      reward.className = 'quest-select__reward';
      const rewardValue = Math.max(0, Math.round(Number(quest.reward) || 0));
      reward.textContent = `기본 보상 ${rewardValue}G`;
      card.appendChild(reward);

      const recommended = getQuestRecommended(quest);
      const stats = document.createElement('div');
      stats.className = 'quest-select__stats';
      stats.textContent = `추천 ATK ${recommended.atk} / DEF ${recommended.def} / STAM ${recommended.stam}`;
      card.appendChild(stats);

      const info = document.createElement('div');
      info.className = 'quest-select__info';
      const remaining = Math.max(0, Number(quest.remaining_visible_turns) || 0);
      const importance = formatImportanceLabel(quest.importance);
      info.textContent = `만료까지 ${remaining}턴 · 중요도 ${importance}`;
      card.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'quest-select__actions';
      const bidBtn = document.createElement('button');
      bidBtn.type = 'button';
      bidBtn.className = 'btn btn--primary';
      bidBtn.textContent = '입찰하기';
      bidBtn.addEventListener('click', () => openBidModal(quest));
      actions.appendChild(bidBtn);
      card.appendChild(actions);

      list.appendChild(card);
    });
  }

  elements.modalBody.appendChild(layout);
  openModal();
}

/**
 * Handle hire button click and immediately reflect the new mercenary.
 * @param {string} mercId
 */
function handleHireClick(mercId) {
  if (!mercId) {
    return;
  }
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('hire: start', { mercId });
  }
  const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(mercId) : mercId.replace(/"/g, '\\"');
  const btn = document.querySelector(`[data-action="hire"][data-merc-id="${safeId}"]`);
  const restoreBtn = () => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '고용하기';
    }
  };
  if (btn) {
    btn.disabled = true;
    btn.textContent = '고용중...';
  }

  ensureRecruitPool();
  if (state.mercs.some((merc) => merc && merc.id === mercId)) {
    toast('이미 고용된 용병입니다.');
    restoreBtn();
    return;
  }

  const index = state.recruitPool.findIndex((merc) => merc && merc.id === mercId);
  if (index < 0) {
    toast('대상 용병을 찾을 수 없습니다.');
    restoreBtn();
    return;
  }
  const candidate = state.recruitPool[index];
  if (!candidate) {
    toast('용병 정보를 불러올 수 없습니다.');
    restoreBtn();
    return;
  }

  const cost = Math.max(0, Math.round(Number(candidate.signing_bonus ?? candidate.signing ?? candidate.signingBonus) || 0));
  if (state.gold < cost) {
    toast('골드가 부족합니다.');
    log(`[T${state.turn}] 골드가 부족하여 ${candidate.name} 용병을 고용할 수 없습니다.`);
    restoreBtn();
    return;
  }

  state.gold -= cost;
  const hiredMerc = { ...candidate, busy: false };
  delete hiredMerc.hired;
  assignMercPortrait(hiredMerc);
  state.mercs.push(hiredMerc);
  addToCodexOnHire(hiredMerc);
  updateCodexEntryFromMerc(hiredMerc, { lastSeenTurn: state.turn });
  state.recruitPool.splice(index, 1);
  currentRecruitCandidates = state.recruitPool;
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('hire: stateUpdated', {
      mercId,
      gold: state.gold,
      mercCount: state.mercs.length,
      poolCount: state.recruitPool.length
    });
  }
  persistState();
  log(`[T${state.turn}] ${candidate.name} [${candidate.grade}] 용병을 고용했습니다. 계약금 ${cost}G 지급.`);
  if (btn) {
    btn.textContent = '고용 완료';
  }
  renderGold();
  renderMercenaryList();
  renderRecruitPool();
  renderRecruitModalList();
  renderCodex();
  refreshAssetChecklist();
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('hire: rendered', {
      mercId,
      gold: state.gold,
      mercCount: state.mercs.length,
      poolCount: state.recruitPool.length
    });
  }
  toast(`${candidate.name} 고용 완료!`);
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

  if (quest.status === 'bid_failed') {
    log(`[T${state.turn}] 이 퀘스트는 이미 다른 길드가 낙찰했습니다.`);
    return;
  }

  if (quest.status === 'in_progress') {
    log(`[T${state.turn}] 이 퀘스트는 현재 진행 중입니다.`);
    return;
  }

  if (quest.status === 'awarded') {
    openFormationModal(quest.id);
    return;
  }

  if (quest.status === 'ready') {
    toast('상단 “퀘스트 수주” 버튼을 사용해 입찰을 진행하세요.');
    return;
  }

  log('현재 처리할 수 없는 퀘스트 상태입니다.');
}

function openFormationModal(questId) {
  const quest = state.quests.find((entry) => entry.id === questId);
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('HIT:openFormationModal', { questId, status: quest?.status });
  }
  if (!quest || quest.status !== 'awarded') {
    toast('편성할 수 있는 상태가 아닙니다.');
    return;
  }

  const selectable = state.mercs.filter((merc) => !merc.busy);
  if (selectable.length === 0) {
    toast('가용 용병이 없습니다.');
    return;
  }

  state.pendingAssignments = state.pendingAssignments || {};
  const existing = Array.isArray(quest.assignment)
    ? quest.assignment
    : Array.isArray(quest.assigned_merc_ids)
    ? quest.assigned_merc_ids
    : [];
  const selected = new Set(existing);
  state.pendingAssignments[questId] = { selected, lastOpenedTurn: state.turn };

  renderFormationModal(quest, selectable);
  showModal('#formation-modal');
}

function renderFormationModal(quest, mercList) {
  if (!quest || !elements.formationMercList) {
    return;
  }
  const pid = quest.id;
  const pending = state.pendingAssignments?.[pid];
  if (!pending) {
    return;
  }
  const set = pending.selected;
  const recommended = quest.recommended || { atk: 0, def: 0, stam: 0 };
  if (elements.formationSum) {
    elements.formationSum.dataset.recommended = `${recommended.atk}/${recommended.def}/${recommended.stam}`;
  }

  const markup = mercList
    .map((merc) => {
      const checked = set.has(merc.id) ? 'checked' : '';
      return `
        <label class="chk">
          <input type="checkbox" data-assign="${pid}" data-merc-id="${merc.id}" ${checked}>
          ${getMercDisplayName(merc)} · ATK ${merc.atk} / DEF ${merc.def} / STAM ${merc.stamina}
        </label>
      `;
    })
    .join('');
  elements.formationMercList.innerHTML = markup || '<p class="modal-subtle">선택할 용병이 없습니다.</p>';
  updateFormationSum(pid);

  if (!elements.formationMercList.dataset.listenerBound) {
    elements.formationMercList.addEventListener('change', (event) => {
      const checkbox = event.target?.closest('input[type="checkbox"][data-assign]');
      if (!checkbox) {
        return;
      }
      const targetQuest = checkbox.getAttribute('data-assign');
      const mercId = checkbox.getAttribute('data-merc-id');
      const bucket = state.pendingAssignments?.[targetQuest];
      if (!bucket || !mercId) {
        return;
      }
      if (checkbox.checked) {
        bucket.selected.add(mercId);
      } else {
        bucket.selected.delete(mercId);
      }
      if (typeof window !== 'undefined' && window.__RG_DEBUG) {
        console.log('HIT:formation-select', { questId: targetQuest, mercId, selected: checkbox.checked });
      }
      updateFormationSum(targetQuest);
    });
    elements.formationMercList.dataset.listenerBound = '1';
  }

  if (elements.formationConfirm) {
    elements.formationConfirm.onclick = () => confirmFormation(pid);
  }
}

function updateFormationSum(questId) {
  if (!elements.formationSum) {
    return;
  }
  const pending = state.pendingAssignments?.[questId];
  if (!pending) {
    elements.formationSum.textContent = '선택된 용병이 없습니다.';
    return;
  }
  const totals = sumSelectedStats(pending.selected);
  const quest = state.quests.find((entry) => entry.id === questId);
  const rec = quest?.recommended || { atk: 0, def: 0, stam: 0 };
  elements.formationSum.textContent = `선택 합계 ATK ${totals.atk} / DEF ${totals.def} / STAM ${totals.stam}  (추천: ${rec.atk}/${rec.def}/${rec.stam})`;
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('HIT:updateFormationSum', { questId, totals });
  }
}

function confirmFormation(questId) {
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('HIT:confirmFormation', { questId });
  }
  const pending = state.pendingAssignments?.[questId];
  if (!pending || !(pending.selected instanceof Set) || pending.selected.size === 0) {
    toast('용병을 선택하세요.');
    return;
  }
  const quest = state.quests.find((entry) => entry.id === questId);
  if (!quest) {
    toast('선택한 퀘스트를 찾을 수 없습니다.');
    return;
  }
  if (quest.status !== 'awarded') {
    toast('편성할 수 있는 상태가 아닙니다.');
    return;
  }

  const selectedIds = Array.from(pending.selected);
  const assignedMercs = selectedIds
    .map((id) => state.mercs.find((merc) => merc.id === id && !merc.busy))
    .filter(Boolean);
  if (assignedMercs.length === 0) {
    toast('용병을 선택하세요.');
    return;
  }

  const totals = sumSelectedStats(pending.selected);
  const rec = quest.recommended || { atk: 0, def: 0, stam: 0 };
  const recTotal = Math.max(1, (rec.atk || 0) + (rec.def || 0) + (rec.stam || 0));
  const overRatio = clamp((totals.total - recTotal) / recTotal, -0.6, 1.2);

  const stance = quest.pending_stance || quest.stance || 'meticulous';
  startQuestDeployment(quest, assignedMercs, stance);
  quest.assignment = selectedIds.slice();
  quest.assigned_merc_ids = selectedIds.slice();
  quest.successBias = CONFIG.PREP_BAL.successBase + mapPos(overRatio, CONFIG.PREP_BAL.successPerOver);
  quest.delayPenalty = mapNeg(overRatio, CONFIG.PREP_BAL.delayPerUnder);
  quest.expediteProb = mapPos(overRatio, CONFIG.PREP_BAL.expeditePerOver);
  setQuestProgress(quest, 0, quest.turns_cost);

  assignedMercs.forEach((merc) => {
    merc.busy = true;
  });

  delete state.pendingAssignments[questId];
  persistState();
  hideModal('#formation-modal');
  renderQuests();
  renderMercenaryList();
  refreshAssetChecklist();
  toast('파견을 시작했습니다.');
}

function startQuestDeployment(quest, assignedMercs, stance) {
  if (!quest) {
    return;
  }
  const mercIds = Array.isArray(assignedMercs)
    ? assignedMercs.map((merc) => merc && merc.id).filter((id) => typeof id === 'string')
    : [];
  quest.status = 'in_progress';
  quest.assigned_merc_ids = mercIds;
  quest.stance = typeof stance === 'string' && CONFIG.STANCE[stance] ? stance : 'meticulous';
  quest.pending_stance = null;
  quest.preparation_preview = mercIds.slice();
  quest.preparationResult = { expediteTurns: 0, delayTurns: 0, ratio: 0, outcome: 'pending' };
  quest.remaining_visible_turns = 0;
  quest.deadline_turn = Math.max(1, Number(quest.turns_cost) || CONFIG.QUEST_TURNS_MIN);
  quest.started_turn = state.turn;
  quest.overdue = false;
  quest.bonusGold = 0;
  quest.events = [];
  quest.animKeyTimeline = [];
  quest.campPlaced = false;
  quest.journal = Array.isArray(quest.journal) ? quest.journal.slice(-CONFIG.QUEST_JOURNAL_LIMIT) : [];
  ensureQuestTimeline(quest);
  setQuestProgress(quest, 0, quest.turns_cost);

  assignedMercs.forEach((merc) => {
    if (merc) {
      merc.busy = true;
    }
  });

  syncMercBusyFromQuests();

  addQuestJournalEntry(quest, '탐험을 시작했습니다.');
  registerQuestEvent(quest, { type: 'story', text: '탐험을 시작했습니다.', animKey: 'story', turn: state.turn });
  const stanceLabel = quest.stance === 'on_time' ? '기한 준수' : '꼼꼼히 탐색';
  log(`[T${state.turn}] 퀘스트 ${quest.id} 시작: ${mercIds.length}명 투입, 성향 ${stanceLabel}.`);

  clearTempQuestDraft(quest.id);
}

function openBidModal(quest) {
  resetModalRequirementSummary();
  if (elements.modalBody) {
    elements.modalBody.dataset.modalType = 'quest-bid';
  }
  if (!quest.bids) {
    quest.bids = generateQuestBids(quest.reward);
  } else {
    quest.bids = normalizeQuestBids(quest.bids, quest.reward, state.rivals);
  }

  elements.modalTitle.textContent = '입찰 제출';
  elements.modalBody.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'bid-modal';
  const mainSection = document.createElement('div');
  mainSection.className = 'bid-modal__main';
  const previewSection = document.createElement('aside');
  previewSection.className = 'bid-modal__preview';
  layout.append(mainSection, previewSection);
  elements.modalBody.appendChild(layout);

  const summary = document.createElement('p');
  summary.className = 'modal-description';
  summary.textContent = `제안 입찰가를 입력하세요. 기본 보상은 ${quest.reward}G입니다.`;
  mainSection.appendChild(summary);

  const help = document.createElement('p');
  help.className = 'modal-subtle';
  help.textContent = '추천 능력치는 수주 판단을 돕는 지표입니다. 낙찰 후 실제 편성에서 초과/부족 여부가 성공·지연에 영향을 줍니다.';
  mainSection.appendChild(help);

  const draft = getTempQuestDraft(quest.id);
  const availableMercs = state.mercs.filter((merc) => !merc.busy);
  const initialSelection = (Array.isArray(draft.mercs) ? draft.mercs : quest.preparation_preview || [])
    .filter((id) => availableMercs.some((merc) => merc.id === id));
  const defaultStance = draft.stance || quest.pending_stance || 'meticulous';
  setTempQuestDraft(quest.id, { mercs: initialSelection, stance: defaultStance });
  const currentDraft = getTempQuestDraft(quest.id);

  const stanceWrapper = document.createElement('div');
  stanceWrapper.className = 'stance-select bid-modal__stance';
  const stanceTitle = document.createElement('p');
  stanceTitle.className = 'stance-select__title';
  stanceTitle.textContent = '탐험 성향 (입찰 참고)';
  stanceWrapper.appendChild(stanceTitle);

  const stanceOptions = document.createElement('div');
  stanceOptions.className = 'stance-select__options';
  const stanceConfigs = [
    {
      value: 'meticulous',
      label: '꼼꼼히 탐색',
      description: '보물 탐색 집중 (추가 보상 ↑)'
    },
    {
      value: 'on_time',
      label: '기한 준수',
      description: '계획 루트 준수 (기한 초과 위험 ↓)'
    }
  ];
  stanceConfigs.forEach((config) => {
    const option = document.createElement('label');
    option.className = 'stance-select__option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'quest-stance';
    radio.value = config.value;
    radio.checked = currentDraft.stance === config.value;
    radio.addEventListener('change', () => {
      currentDraft.stance = config.value;
      setTempQuestDraft(quest.id, currentDraft);
    });
    const body = document.createElement('div');
    body.className = 'stance-select__description';
    const name = document.createElement('strong');
    name.textContent = config.label;
    const description = document.createElement('span');
    description.textContent = config.description;
    body.append(name, description);
    option.append(radio, body);
    stanceOptions.appendChild(option);
  });
  stanceWrapper.appendChild(stanceOptions);
  mainSection.appendChild(stanceWrapper);

  const intel = createModalIntelBlock(quest, probabilitiesToPercentages(quest.contractProb));
  if (intel && intel.container) {
    mainSection.appendChild(intel.container);
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
  mainSection.appendChild(inputWrapper);

  const probabilityPreview = document.createElement('p');
  probabilityPreview.className = 'modal-probability';
  mainSection.appendChild(probabilityPreview);

  const previewTitle = document.createElement('h4');
  previewTitle.className = 'bid-preview__title';
  previewTitle.textContent = '파티 가늠(모의)';
  previewSection.appendChild(previewTitle);

  const previewList = document.createElement('div');
  previewList.className = 'bid-preview__list';
  previewSection.appendChild(previewList);

  const recommended = getQuestRecommended(quest);
  const totalsBox = document.createElement('div');
  totalsBox.className = 'bid-preview__totals';
  const totalRows = {};
  ['atk', 'def', 'stam'].forEach((stat) => {
    const row = document.createElement('div');
    row.className = 'bid-preview__totals-row';
    const statLabel = document.createElement('span');
    statLabel.textContent = stat.toUpperCase();
    const valueSpan = document.createElement('span');
    valueSpan.className = 'bid-preview__value';
    row.append(statLabel, valueSpan);
    totalsBox.appendChild(row);
    totalRows[stat] = valueSpan;
  });
  previewSection.appendChild(totalsBox);

  const difficultyBadge = document.createElement('div');
  difficultyBadge.className = 'bid-preview__difficulty';
  previewSection.appendChild(difficultyBadge);

  const selection = new Set(initialSelection);

  const renderPreviewList = () => {
    previewList.innerHTML = '';
    if (availableMercs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'bid-preview__empty';
      empty.textContent = '가용 용병이 없습니다.';
      previewList.appendChild(empty);
      return;
    }
    availableMercs.forEach((merc) => {
      const option = document.createElement('label');
      option.className = 'bid-preview__option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = merc.id;
      checkbox.checked = selection.has(merc.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selection.add(merc.id);
        } else {
          selection.delete(merc.id);
        }
        currentDraft.mercs = Array.from(selection);
        setTempQuestDraft(quest.id, currentDraft);
        updatePreview();
      });
      const body = document.createElement('div');
      body.className = 'bid-preview__option-body';
      const name = document.createElement('span');
      name.className = 'bid-preview__name';
      name.textContent = `${getMercDisplayName(merc)} [${merc.grade}]`;
      const stats = document.createElement('span');
      stats.className = 'bid-preview__stats';
      stats.textContent = `ATK ${merc.atk} / DEF ${merc.def} / STAM ${merc.stamina}`;
      body.append(name, stats);
      option.append(checkbox, body);
      previewList.appendChild(option);
    });
  };

  const updateDifficultyBadge = (ratio) => {
    difficultyBadge.className = 'bid-preview__difficulty';
    let tone = 'normal';
    let text = '예상 난이도: 보통';
    if (ratio <= -0.25) {
      tone = 'hard';
      text = '예상 난이도: 매우 어려움';
    } else if (ratio < 0) {
      tone = 'warn';
      text = '예상 난이도: 어려움';
    } else if (ratio >= 0.6) {
      tone = 'easy';
      text = '예상 난이도: 아주 수월';
    }
    difficultyBadge.classList.add(`bid-preview__difficulty--${tone}`);
    difficultyBadge.textContent = text;
  };

  const updateProbabilityPreview = () => {
    const rawValue = Number(input.value);
    if (!Number.isFinite(rawValue) || rawValue < 1) {
      probabilityPreview.textContent = '예상 낙찰 확률: 계산 불가';
      return;
    }
    const bidValue = clamp(Math.round(rawValue), 1, 9999);
    const selectedMercs = Array.from(selection)
      .map((id) => state.mercs.find((entry) => entry.id === id))
      .filter(Boolean);
    const { probabilities } = calculateContractProbabilities(quest, bidValue, selectedMercs);
    const summaryText = formatProbabilityEntries(probabilities).join(' / ');
    probabilityPreview.textContent = summaryText
      ? `예상 낙찰 확률: ${summaryText}`
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
      intel.debugLine.textContent = summaryText || '낙찰 확률 데이터 없음';
    }
  };

  const updatePreview = () => {
    const totals = computeSelectedStats(Array.from(selection));
    ['atk', 'def', 'stam'].forEach((stat) => {
      const span = totalRows[stat];
      if (!span) {
        return;
      }
      const value = totals[stat] || 0;
      const target = recommended[stat] || 0;
      span.textContent = `${value} / ${target}`;
      span.classList.toggle('is-over', value >= target);
      span.classList.toggle('is-under', value < target);
    });
    const sum = totals.atk + totals.def + totals.stam;
    const recTotal = Math.max(1, recommended.atk + recommended.def + recommended.stam);
    const ratio = computeOverRatio(sum, recTotal);
    updateDifficultyBadge(ratio);
    updateProbabilityPreview();
  };

  renderPreviewList();
  updatePreview();
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
    const selectedMercs = Array.from(selection)
      .map((id) => state.mercs.find((entry) => entry.id === id))
      .filter(Boolean);
    const outcome = resolveBidOutcome(quest, bidValue, selectedMercs);
    quest.contractProb = normalizeContractProb(outcome.probabilities, quest.bids, state.rivals);
    const winner = outcome.winner;
    quest.bids.winner = winner.type === 'player'
      ? { type: 'player', id: 'player', value: bidValue }
      : { type: 'rival', id: winner.id, value: winner.value };

    const logMessage = buildBidLogMessage(quest, bidValue, winner, quest.contractProb);
    log(logMessage);

    if (winner.type === 'player') {
      enterQuestPreparation(quest, selectedMercs, currentDraft.stance || 'meticulous', bidValue, quest.contractProb);
      closeModal();
      return;
    }

    markQuestBidFailure(quest, winner, quest.contractProb);
    save();
    render();
    closeModal();
  });

  actions.append(cancelBtn, confirmBtn);
  mainSection.appendChild(actions);

  openModal();
}

function calculateContractProbabilities(quest, playerBid, assignedMercs) {
  const { context, probabilities } = getBidResolutionContext(quest, playerBid, assignedMercs);
  return { participants: context.participants, probabilities };
}

function resolveBidOutcome(quest, playerBid, assignedMercs) {
  const { sanitizedBid, context, result, probabilities } = getBidResolutionContext(quest, playerBid, assignedMercs);
  const winnerKey = result.winner?.key || result.winner?.id || (result.winner?.who === 'player' ? 'player' : null);
  const participant = context.participants.find((entry) => entry.key === winnerKey) || context.participants[0];
  const normalizedWinner = winnerKey === 'player'
    ? { type: 'player', id: 'player', value: sanitizedBid }
    : {
        type: 'rival',
        id: participant?.id || winnerKey,
        value: participant?.value || result.winner?.bidGold
      };
  return { winner: normalizedWinner, probabilities };
}

function getBidResolutionContext(quest, playerBid, assignedMercs) {
  const sanitizedBid = clamp(Math.round(playerBid), 1, 9999);
  const context = buildBidContext(quest, sanitizedBid, assignedMercs);
  const result = resolveBids(quest, context.player, context.rivals);
  const probabilities = {};
  context.participants.forEach((participant) => {
    const key = participant.key;
    const entry = result.probs.find((item) => (item.key || item.id || item.who) === key);
    probabilities[key] = entry ? entry.p : 0;
  });
  return { sanitizedBid, context, result, probabilities };
}

function buildBidContext(quest, bidValue, assignedMercs) {
  const playerEntry = {
    who: 'player',
    key: 'player',
    id: 'player',
    bidGold: bidValue,
    feasHint: clamp(computeFeasibilityHint(quest, assignedMercs), 0, 1),
    rep: normalizeReputationScore(state.reputation)
  };

  const rivalEntries = [];
  const rivalState = Array.isArray(state.rivals) && state.rivals.length > 0 ? state.rivals : DEFAULT_RIVALS;
  const rivalMap = new Map(rivalState.map((rival) => [rival.id, rival]));
  if (Array.isArray(quest.bids?.rivals)) {
    quest.bids.rivals.forEach((entry, index) => {
      const rival = rivalMap.get(entry.id) || { id: entry.id, rep: REPUTATION.MIN };
      const key = entry.id || `r${index + 1}`;
      rivalEntries.push({
        who: `r${index + 1}`,
        key,
        id: entry.id || key,
        bidGold: clamp(Math.round(entry.value), 1, 9999),
        rep: normalizeReputationScore(rival.rep),
        feasHint: clamp(0.4 + normalizeReputationScore(rival.rep) * 0.5, 0, 1)
      });
    });
  }

  const participants = [
    { key: playerEntry.key, type: 'player', id: 'player', value: playerEntry.bidGold, rep: playerEntry.rep, feasHint: playerEntry.feasHint }
  ];
  rivalEntries.forEach((entry) => {
    participants.push({
      key: entry.key,
      type: 'rival',
      id: entry.id,
      value: entry.bidGold,
      rep: entry.rep,
      feasHint: entry.feasHint
    });
  });

  return { player: playerEntry, rivals: rivalEntries, participants };
}

function computeFeasibilityHint(quest, assignedMercs) {
  if (!quest) {
    return 0;
  }
  const recommended = getQuestRecommended(quest);
  const recTotal = Math.max(1, (recommended.atk || 0) + (recommended.def || 0) + (recommended.stam || 0));
  let sum = 0;

  if (Array.isArray(assignedMercs) && assignedMercs.length > 0) {
    assignedMercs.forEach((merc) => {
      if (!merc) {
        return;
      }
      sum += (Number(merc.atk) || 0) + (Number(merc.def) || 0) + (Number(merc.stamina || merc.stam) || 0);
    });
  } else if (Array.isArray(quest.preparation_preview) && quest.preparation_preview.length > 0) {
    const totals = computeSelectedStats(quest.preparation_preview);
    sum += (totals.atk || 0) + (totals.def || 0) + (totals.stam || 0);
  } else if (Array.isArray(quest.assigned_merc_ids) && quest.assigned_merc_ids.length > 0) {
    const totals = computeSelectedStats(quest.assigned_merc_ids);
    sum += (totals.atk || 0) + (totals.def || 0) + (totals.stam || 0);
  }

  return clamp(sum / recTotal, 0, 1);
}

function normalizeReputationScore(value) {
  const span = Math.max(1, REPUTATION.MAX - REPUTATION.MIN);
  const clamped = clampRep(value, REPUTATION.MIN);
  return clamp((clamped - REPUTATION.MIN) / span, 0, 1);
}

function resolveBids(quest, playerBid, rivalBids) {
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('HIT:resolveBids', {
      questId: quest?.id,
      playerBid,
      rivalCount: Array.isArray(rivalBids) ? rivalBids.length : 0
    });
  }
  const entries = [{ who: 'player', key: 'player', ...playerBid }].concat(
    Array.isArray(rivalBids)
      ? rivalBids.map((r, index) => ({ who: `r${index + 1}`, key: r.key || r.id || `r${index + 1}`, ...r }))
      : []
  );

  const base = quest?.rewardEstimated || quest?.reward || 100;
  const kPrice = 4.0;
  const kFeas = 1.2;
  const kRep = 0.8;

  const scores = entries.map((entry) => {
    const priceRatio = Math.max(0.1, base / Math.max(1, Number(entry.bidGold) || 1));
    const priceTerm = Math.pow(priceRatio, kPrice);
    const feas = clamp(Number(entry.feasHint) || 0, 0, 1);
    const rep = clamp(Number(entry.rep) || 0, 0, 1);
    const s = Math.log(priceTerm + 1e-6) + kFeas * feas + kRep * rep;
    return { ...entry, priceTerm, s };
  });

  const maxS = Math.max(...scores.map((x) => x.s));
  const exps = scores.map((x) => ({ ...x, w: Math.exp(x.s - maxS) }));
  const Z = exps.reduce((sum, x) => sum + x.w, 0) || 1;
  const probs = exps.map((x) => ({ ...x, p: x.w / Z }));

  const randomValue = Math.random();
  let cumulative = 0;
  let winner = probs[0];
  for (const entry of probs) {
    cumulative += entry.p;
    if (randomValue <= cumulative) {
      winner = entry;
      break;
    }
  }

  return { winner, probs };
}

function setQuestProgress(quest, completed, turnsRemaining) {
  if (!quest) {
    return;
  }
  const completedSafe = Number.isFinite(completed) ? Math.max(0, Math.round(completed)) : 0;
  const remainingSafe = Number.isFinite(turnsRemaining) ? Math.max(0, Math.round(turnsRemaining)) : 0;
  quest.progress = { completed: completedSafe, turnsRemaining: remainingSafe };
  quest.remaining_turns = remainingSafe;
}

function getQuestProgressValue(quest) {
  if (!quest) {
    return 0;
  }
  const progress = quest.progress;
  if (progress && typeof progress === 'object') {
    const completed = Number(progress.completed);
    if (Number.isFinite(completed)) {
      return Math.max(0, completed);
    }
    const turns = Number(quest.turns_cost);
    const remaining = Number(progress.turnsRemaining);
    if (Number.isFinite(turns) && Number.isFinite(remaining)) {
      return Math.max(0, turns - remaining);
    }
    return 0;
  }
  return Math.max(0, Number(progress) || 0);
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

function enterQuestPreparation(quest, previewMercs, stance, playerBid, probabilities) {
  if (!quest) {
    return;
  }
  const previewIds = Array.isArray(previewMercs)
    ? previewMercs.map((merc) => merc && merc.id).filter((id) => typeof id === 'string')
    : [];
  quest.status = 'awarded';
  quest.assigned_merc_ids = [];
  quest.preparation_preview = previewIds;
  quest.pending_stance = typeof stance === 'string' && CONFIG.STANCE[stance] ? stance : 'meticulous';
  quest.preparationResult = { expediteTurns: 0, delayTurns: 0, ratio: 0, outcome: 'pending' };
  quest.remaining_turns = quest.turns_cost;
  quest.remaining_visible_turns = 0;
  quest.deadline_turn = Math.max(1, Number(quest.turns_cost) || CONFIG.QUEST_TURNS_MIN);
  quest.overdue = false;
  quest.bonusGold = 0;
  quest.contractProb = normalizeContractProb(probabilities, quest.bids, state.rivals);
  quest.bids.player = playerBid;
  quest.bids.winner = { type: 'player', id: 'player', value: playerBid };
  quest.deleted = false;
  quest.events = [];
  quest.animKeyTimeline = [];
  quest.campPlaced = false;
  setQuestProgress(quest, 0, quest.turns_cost);

  addQuestJournalEntry(quest, '낙찰 완료: 편성 준비 단계에 들어갑니다.');
  log(`[T${state.turn}] 퀘스트 ${quest.id} 낙찰: ${playerBid}G, 준비 단계에서 실제 편성을 확정하세요.`);

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

  if (primary?.prepNote) {
    const prepSummary = document.createElement('div');
    prepSummary.className = 'quest-report__note';
    prepSummary.textContent = `준비 보정: ${primary.prepNote}`;
    container.appendChild(prepSummary);
  }

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
  quest.assigned_merc_ids = [];
  delete quest.started_turn;
  quest.bids.winner = { type: 'rival', id: winner.id, value: winner.value };
  quest.remaining_visible_turns = 0;
  quest.deleted = false;
  quest.stance = null;
  quest.deadline_turn = quest.turns_cost || CONFIG.QUEST_TURNS_MIN;
  quest.overdue = false;
  quest.bonusGold = 0;
  quest.contractProb = normalizeContractProb(probabilities, quest.bids, state.rivals);
  quest.journal = [];
  clearTempQuestDraft(quest.id);
  setQuestProgress(quest, 0, 0);
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

function renderGold() {
  if (elements.goldValue) {
    elements.goldValue.textContent = `${state.gold}G`;
  }
}

function renderMercenaryList() {
  renderMercs();
}

function buildRecruitCardMarkup(merc, options = {}) {
  if (!merc || typeof merc !== 'object') {
    return '';
  }
  const interactive = Boolean(options.interactive);
  const portrait = getMercPortraitPath(merc) || 'assets/mercs/m01.jpg';
  const signing = Math.max(0, Math.round(Number(merc.signing_bonus ?? merc.signing ?? merc.signingBonus) || 0));
  const wage = Math.max(0, Math.round(Number(merc.wage_per_quest ?? merc.wagePerQuest ?? merc.wage) || 0));
  const grade = merc.grade || 'C';
  const name = merc.name || '용병';
  const atk = Math.max(0, Math.round(Number(merc.atk) || 0));
  const def = Math.max(0, Math.round(Number(merc.def) || 0));
  const stamina = Math.max(0, Math.round(Number(merc.stamina ?? merc.stam) || 0));
  const statsLine = `ATK ${atk} / DEF ${def} / STAM ${stamina}`;
  const classes = ['recruit-card'];
  classes.push(interactive ? 'recruit-card--interactive' : 'recruit-card--readonly');
  const hint = interactive
    ? ''
    : '<div class="recruit-card__hint">상단 “용병 모집” 모달에서 고용 가능합니다.</div>';
  const action = interactive
    ? `<button class="btn btn--accent hire" data-modal-action="hire" data-merc-id="${merc.id}">고용하기</button>`
    : '';
  return `
    <li class="${classes.join(' ')}" id="recruit-${merc.id}">
      <div class="recruit-info">
        <div class="portrait"><img src="${portrait}" alt="${name}"></div>
        <div class="recruit-info__body">
          <div class="recruit-info__name">${name} [${grade}]</div>
          <div class="recruit-info__meta">계약금 ${signing}G · 임금 ${wage}G</div>
          <div class="recruit-info__stats">${statsLine}</div>
          ${hint}
        </div>
      </div>
      ${action}
    </li>
  `;
}

function renderRecruitCards(container, options = {}) {
  if (!container) {
    return;
  }
  ensureRecruitPool();
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('HIT:renderRecruitCards', { count: state.recruitPool.length, interactive: Boolean(options.interactive) });
  }
  if (!Array.isArray(state.recruitPool) || state.recruitPool.length === 0) {
    const emptyMessage = options.emptyMessage || '현재 모집 가능한 용병이 없습니다.';
    container.innerHTML = `<li class="recruit-card recruit-card--empty">${emptyMessage}</li>`;
    return;
  }
  const markup = state.recruitPool.map((merc) => buildRecruitCardMarkup(merc, options)).join('');
  container.innerHTML = markup;
}

function renderRecruitPool() {
  const list = elements.recruitList;
  if (!list) {
    return;
  }
  list.innerHTML = '';
  list.hidden = true;
}

function renderRecruitModalList() {
  if (!elements.modalBody || elements.modalBody.dataset.modalType !== 'recruit') {
    return;
  }
  const list = document.getElementById('recruit-modal-list');
  if (!list) {
    return;
  }
  renderRecruitCards(list, {
    interactive: true,
    emptyMessage: '현재 모집 가능한 용병이 없습니다.'
  });
}

function toast(message, options = {}) {
  if (!message) {
    return;
  }
  const container = document.getElementById('toast-container');
  if (!container) {
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(message);
    }
    return;
  }
  const toastEl = document.createElement('div');
  toastEl.className = 'toast-message';
  toastEl.textContent = message;
  if (options.type) {
    toastEl.dataset.type = options.type;
  }
  container.appendChild(toastEl);
  requestAnimationFrame(() => {
    toastEl.classList.add('is-visible');
  });
  const duration = Math.max(1500, Number(options.duration) || 2500);
  setTimeout(() => {
    toastEl.classList.remove('is-visible');
    setTimeout(() => {
      if (toastEl.parentNode === container) {
        container.removeChild(toastEl);
      }
    }, 300);
  }, duration);
}

/**
 * Render all UI components from the current state.
 */
function render() {
  updateMercDisplayNameCache();
  renderGold();
  renderReputationDisplay();
  renderCalendar();
  renderQuestSpawnRate();
  renderProbabilityPanel();
  if (elements.recruitBtn) {
    elements.recruitBtn.disabled = false;
    if (CONFIG.RECRUIT_ONCE_PER_TURN) {
      elements.recruitBtn.title = state.lastRecruitTurn === state.turn
        ? '이번 턴 후보는 유지됩니다. 목록 갱신은 턴당 1회입니다.'
        : '모집 후보 갱신은 턴당 1회입니다.';
    } else {
      elements.recruitBtn.title = '';
    }
  }
  if (elements.questBidBtn) {
    const hasReadyQuest = (Array.isArray(state.quests) ? state.quests : [])
      .some((quest) => quest && !quest.deleted && quest.status === 'ready');
    elements.questBidBtn.disabled = !hasReadyQuest;
    elements.questBidBtn.title = hasReadyQuest ? '' : '입찰 가능한 퀘스트가 없습니다. 턴을 진행해 새 퀘스트를 확인하세요.';
  }
  renderMercs();
  renderRecruitPool();
  renderRecruitModalList();
  renderQuestDashboard();
  renderQuests();
  renderCodex();
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
    if (typeof window !== 'undefined' && window.__RG_DEBUG) {
      console.log('guildView: renderMercs', { count: 0 });
    }
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
  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('guildView: renderMercs', { count: state.mercs.length });
  }
}

function renderCodex() {
  if (!elements.codexTableBody || !elements.codexDetail) {
    return;
  }
  ensureCodex();
  const filters = uiState.codexFilters || { search: '', grade: 'all', status: 'all' };
  const searchTerm = (filters.search || '').trim().toLowerCase();
  const gradeFilter = filters.grade || 'all';
  const statusFilter = filters.status || 'all';

  if (elements.codexSearch && elements.codexSearch.value !== filters.search) {
    elements.codexSearch.value = filters.search;
  }
  if (elements.codexGradeFilter && elements.codexGradeFilter.value !== gradeFilter) {
    elements.codexGradeFilter.value = gradeFilter;
  }
  if (elements.codexStatusFilter && elements.codexStatusFilter.value !== statusFilter) {
    elements.codexStatusFilter.value = statusFilter;
  }

  const filtered = getCodexEntries().filter((entry) => {
    const matchesSearch = !searchTerm
      || (typeof entry.name === 'string' && entry.name.toLowerCase().includes(searchTerm));
    const matchesGrade = gradeFilter === 'all' || entry.grade === gradeFilter;
    const matchesStatus = statusFilter === 'all' || normalizeCodexStatus(entry.status) === statusFilter;
    return matchesSearch && matchesGrade && matchesStatus;
  });

  elements.codexTableBody.innerHTML = '';
  if (filtered.length === 0) {
    const row = document.createElement('tr');
    row.className = 'codex-table-empty';
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.textContent = searchTerm
      ? '검색 조건에 맞는 용병이 없습니다.'
      : '도감에 등록된 용병이 없습니다.';
    row.appendChild(cell);
    elements.codexTableBody.appendChild(row);
    uiState.selectedCodexMercId = null;
    renderCodexDetail(null);
    return;
  }

  filtered.forEach((entry) => {
    const row = document.createElement('tr');
    row.dataset.mercId = entry.id;

    const nameCell = document.createElement('td');
    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'codex-name-cell';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'codex-name';
    nameLabel.textContent = entry.name || '미상 용병';
    nameWrapper.appendChild(nameLabel);
    const nameTags = createTagRow(
      {
        isNamed: entry.isNamed,
        isTownie: entry.isTownie,
        revisitCount: entry.revisitCount,
        returning: entry.revisitCount > 0
      },
      { compact: true, showRevisitCount: false }
    );
    if (nameTags) {
      nameWrapper.appendChild(nameTags);
    }
    nameCell.appendChild(nameWrapper);
    row.appendChild(nameCell);

    const gradeCell = document.createElement('td');
    gradeCell.textContent = entry.grade || '-';
    row.appendChild(gradeCell);

    const statusCell = document.createElement('td');
    statusCell.appendChild(createCodexStatusChip(entry.status));
    row.appendChild(statusCell);

    const firstMetCell = document.createElement('td');
    firstMetCell.textContent = formatFirstMet(entry.firstMet);
    row.appendChild(firstMetCell);

    const lastSeenCell = document.createElement('td');
    lastSeenCell.textContent = formatLastSeenTurn(entry.lastSeenTurn);
    row.appendChild(lastSeenCell);

    const questCell = document.createElement('td');
    questCell.textContent = `${Math.max(0, Number(entry.questsCompleted) || 0)}`;
    row.appendChild(questCell);

    const relationshipCell = document.createElement('td');
    relationshipCell.className = 'codex-relationship';
    relationshipCell.textContent = formatCodexRelationship(entry.relationship);
    row.appendChild(relationshipCell);

    const memoCell = document.createElement('td');
    memoCell.className = 'codex-table__memo';
    memoCell.textContent = formatCodexMemoSummary(entry.memo);
    row.appendChild(memoCell);

    row.addEventListener('click', () => {
      uiState.selectedCodexMercId = entry.id;
      uiState.codexChronicleExpanded = uiState.codexChronicleExpanded || {};
      renderCodexDetail(entry.id);
      updateCodexRowSelection();
    });

    elements.codexTableBody.appendChild(row);
  });

  if (!uiState.selectedCodexMercId || !filtered.some((entry) => entry.id === uiState.selectedCodexMercId)) {
    uiState.selectedCodexMercId = filtered[0].id;
  }

  renderCodexDetail(uiState.selectedCodexMercId);
  updateCodexRowSelection();
}

function updateCodexRowSelection() {
  if (!elements.codexTableBody) {
    return;
  }
  const rows = elements.codexTableBody.querySelectorAll('tr[data-merc-id]');
  rows.forEach((row) => {
    row.classList.toggle('is-selected', row.dataset.mercId === uiState.selectedCodexMercId);
  });
}

function renderCodexDetail(mercId) {
  if (!elements.codexDetail) {
    return;
  }
  const container = elements.codexDetail;
  container.innerHTML = '';

  if (!mercId) {
    const empty = document.createElement('div');
    empty.className = 'codex-detail__empty';
    empty.textContent = '도감에 등록된 용병이 없습니다.';
    container.appendChild(empty);
    return;
  }

  const entry = getCodexEntryById(mercId);
  if (!entry) {
    const missing = document.createElement('div');
    missing.className = 'codex-detail__empty';
    missing.textContent = '선택한 용병 정보를 불러올 수 없습니다.';
    container.appendChild(missing);
    return;
  }

  const header = document.createElement('div');
  header.className = 'codex-detail__header';
  const title = document.createElement('h4');
  title.className = 'codex-detail__title';
  title.textContent = entry.name || '미상 용병';
  header.appendChild(title);

  const metaLine = document.createElement('div');
  metaLine.className = 'codex-grade';
  const gradeLabel = document.createElement('span');
  gradeLabel.textContent = `등급 ${entry.grade || '-'}`;
  metaLine.appendChild(gradeLabel);
  metaLine.appendChild(createCodexStatusChip(entry.status));
  header.appendChild(metaLine);

  const detailTags = createTagRow(
    {
      isNamed: entry.isNamed,
      isTownie: entry.isTownie,
      revisitCount: entry.revisitCount,
      returning: entry.revisitCount > 0
    },
    { detail: true }
  );
  if (detailTags) {
    header.appendChild(detailTags);
  }

  container.appendChild(header);

  const summarySection = document.createElement('div');
  summarySection.className = 'codex-detail__section';
  const summaryTitle = document.createElement('h4');
  summaryTitle.className = 'codex-detail__section-title';
  summaryTitle.textContent = '기본 정보';
  summarySection.appendChild(summaryTitle);

  const summaryList = document.createElement('dl');
  summaryList.className = 'codex-summary';
  addCodexSummaryRow(summaryList, '임금', entry.wage > 0 ? `${entry.wage}G / 퀘스트` : '미상');
  addCodexSummaryRow(summaryList, '계약금', entry.signingBonus > 0 ? `${entry.signingBonus}G` : '미상');
  addCodexSummaryRow(summaryList, '레벨', Number.isFinite(entry.level) ? `Lv.${entry.level}` : '미상');
  addCodexSummaryRow(summaryList, '나이', Number.isFinite(entry.age) ? `${entry.age}세` : '미상');
  addCodexSummaryRow(summaryList, '관계', formatCodexRelationship(entry.relationship), true);
  addCodexSummaryRow(summaryList, '첫 만남', formatFirstMet(entry.firstMet));
  addCodexSummaryRow(summaryList, '최근 본 턴', formatLastSeenTurn(entry.lastSeenTurn));
  addCodexSummaryRow(summaryList, '완료 퀘스트', `${Math.max(0, Number(entry.questsCompleted) || 0)}`);
  addCodexSummaryRow(summaryList, '재방문', entry.revisitCount > 0 ? `${entry.revisitCount}회` : '기록 없음');
  addCodexSummaryRow(summaryList, '재등장 기록', formatRevisitHistory(entry.revisitHistory));
  summarySection.appendChild(summaryList);
  container.appendChild(summarySection);

  const chronicleSection = document.createElement('div');
  chronicleSection.className = 'codex-detail__section';
  const chronicleTitle = document.createElement('h4');
  chronicleTitle.className = 'codex-detail__section-title';
  chronicleTitle.textContent = '연대기';
  chronicleSection.appendChild(chronicleTitle);

  const expanded = Boolean(uiState.codexChronicleExpanded?.[entry.id]);
  const rawChronicle = buildCodexChronicleEntries(entry, expanded ? 40 : 11);
  const chronicleEntries = expanded ? rawChronicle : rawChronicle.slice(0, 10);
  const hasMore = !expanded && rawChronicle.length > 10;

  if (chronicleEntries.length === 0) {
    const emptyChronicle = document.createElement('div');
    emptyChronicle.className = 'codex-chronicle__empty';
    emptyChronicle.textContent = '기록된 활동이 없습니다.';
    chronicleSection.appendChild(emptyChronicle);
  } else {
    const list = document.createElement('div');
    list.className = 'codex-chronicle';
    chronicleEntries.forEach((entryItem) => {
      const item = document.createElement('div');
      item.className = 'codex-chronicle__item';
      const turnLabel = Number.isFinite(entryItem.turn) ? `T${entryItem.turn} · ` : '';
      item.textContent = `${turnLabel}${entryItem.text || '기록 없음'}`;
      list.appendChild(item);
    });
    chronicleSection.appendChild(list);
  }

  if (hasMore || expanded) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'codex-chronicle__toggle';
    toggle.textContent = expanded ? '접기' : '더보기';
    toggle.addEventListener('click', () => {
      uiState.codexChronicleExpanded = uiState.codexChronicleExpanded || {};
      uiState.codexChronicleExpanded[entry.id] = !expanded;
      renderCodexDetail(entry.id);
    });
    chronicleSection.appendChild(toggle);
  }

  container.appendChild(chronicleSection);

  const memoSection = document.createElement('div');
  memoSection.className = 'codex-detail__section codex-memo';
  const memoTitle = document.createElement('h4');
  memoTitle.className = 'codex-detail__section-title';
  memoTitle.textContent = '플레이어 메모';
  memoSection.appendChild(memoTitle);

  const memoInput = document.createElement('textarea');
  memoInput.maxLength = 500;
  memoInput.dataset.mercId = entry.id;
  memoInput.value = entry.memo || '';
  memoInput.placeholder = '줄바꿈 없이 500자까지 작성할 수 있습니다.';
  memoInput.addEventListener('input', handleCodexMemoInput);
  memoInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  });
  memoSection.appendChild(memoInput);

  const memoHint = document.createElement('p');
  memoHint.className = 'codex-memo__hint';
  memoHint.textContent = '입력 즉시 저장됩니다. 줄바꿈은 지원하지 않습니다.';
  memoSection.appendChild(memoHint);

  container.appendChild(memoSection);
}

function createCodexStatusChip(status) {
  const normalized = normalizeCodexStatus(status);
  const chip = document.createElement('span');
  chip.className = `codex-status codex-status--${normalized}`;
  const icon = document.createElement('span');
  icon.className = 'codex-status__icon';
  icon.textContent = getCodexStatusIcon(normalized);
  const label = document.createElement('span');
  label.textContent = formatCodexStatus(normalized);
  chip.append(icon, label);
  return chip;
}

function addCodexSummaryRow(list, label, value, isRelationship = false) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  if (isRelationship) {
    dd.className = 'codex-relationship';
  }
  dd.textContent = value;
  list.append(dt, dd);
}

function formatFirstMet(firstMet) {
  if (!firstMet || (firstMet.year == null && firstMet.turn == null)) {
    return '미상';
  }
  const yearPart = Number.isFinite(firstMet.year) ? `${firstMet.year}` : '??';
  const monthPart = Number.isFinite(firstMet.month)
    ? String(firstMet.month).padStart(2, '0')
    : '??';
  const turnPart = Number.isFinite(firstMet.turn) ? `T${firstMet.turn}` : 'T?';
  if (yearPart === '??' && monthPart === '??') {
    return turnPart;
  }
  return `${yearPart}.${monthPart} / ${turnPart}`;
}

function formatLastSeenTurn(turn) {
  return Number.isFinite(turn) ? `T${turn}` : '미상';
}

function formatRevisitHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return '기록 없음';
  }
  const formatted = history.map((record) => {
    const turnPart = Number.isFinite(record?.turn) ? `T${record.turn}` : null;
    const hasYear = Number.isFinite(record?.year);
    const hasMonth = Number.isFinite(record?.month);
    const monthLabel = hasMonth ? String(record.month).padStart(2, '0') : null;
    if (hasYear && monthLabel && turnPart) {
      return `${record.year}.${monthLabel} / ${turnPart}`;
    }
    if (turnPart && hasYear && monthLabel == null) {
      return `${record.year}년 / ${turnPart}`;
    }
    if (turnPart) {
      return turnPart;
    }
    if (hasYear && monthLabel) {
      return `${record.year}.${monthLabel}`;
    }
    return '미상';
  });
  return formatted.join(' · ');
}

function formatCodexStatus(status) {
  const normalized = normalizeCodexStatus(status);
  return CODEX_STATUS_LABELS[normalized] || CODEX_STATUS_LABELS.active;
}

function getCodexStatusIcon(status) {
  const normalized = normalizeCodexStatus(status);
  return CODEX_STATUS_ICONS[normalized] || CODEX_STATUS_ICONS.active;
}

function formatCodexRelationship(value) {
  const numeric = clampMood(value);
  return `🤝 ${numeric}`;
}

function formatCodexMemoSummary(memo) {
  const text = sanitizeCodexMemo(memo || '');
  if (!text) {
    return '-';
  }
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

function buildCodexChronicleEntries(entry, limit = 10) {
  if (!entry) {
    return [];
  }
  const liveMerc = state.mercs.find((merc) => merc.id === entry.id);
  if (liveMerc) {
    return buildMercChronicle(liveMerc, limit);
  }
  const logs = Array.isArray(state.log) ? state.log.slice().reverse() : [];
  const results = [];
  logs.forEach((logEntry) => {
    if (results.length >= limit) {
      return;
    }
    const parsed = parseLogLine(logEntry);
    if (!parsed.text) {
      return;
    }
    if (parsed.text.includes(entry.name) || parsed.text.includes(entry.id)) {
      results.push(parsed);
    }
  });
  return results;
}

function handleCodexMemoInput(event) {
  const textarea = event.target;
  if (!textarea || !textarea.dataset.mercId) {
    return;
  }
  const mercId = textarea.dataset.mercId;
  const sanitized = sanitizeCodexMemo(textarea.value);
  if (sanitized !== textarea.value) {
    textarea.value = sanitized;
  }
  const entry = getCodexEntryById(mercId);
  if (!entry) {
    return;
  }
  if (entry.memo === sanitized) {
    return;
  }
  entry.memo = sanitized;
  save();
  if (elements.codexTableBody) {
    const row = elements.codexTableBody.querySelector(`tr[data-merc-id="${mercId}"]`);
    if (row) {
      const memoCell = row.querySelector('td.codex-table__memo');
      if (memoCell) {
        memoCell.textContent = formatCodexMemoSummary(entry.memo);
      }
    }
  }
}

function handleCodexSearchInput(event) {
  const value = typeof event?.target?.value === 'string' ? event.target.value : '';
  uiState.codexFilters = uiState.codexFilters || { search: '', grade: 'all', status: 'all' };
  uiState.codexFilters.search = value;
  uiState.codexChronicleExpanded = {};
  renderCodex();
}

function handleCodexFilterChange() {
  uiState.codexFilters = uiState.codexFilters || { search: '', grade: 'all', status: 'all' };
  if (elements.codexGradeFilter) {
    uiState.codexFilters.grade = elements.codexGradeFilter.value || 'all';
  }
  if (elements.codexStatusFilter) {
    uiState.codexFilters.status = elements.codexStatusFilter.value || 'all';
  }
  uiState.codexChronicleExpanded = {};
  renderCodex();
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

function buildMercChronicle(merc, limit = 10) {
  const entries = [];
  const displayName = getMercDisplayName(merc);
  const baseName = merc.name;
  const logs = Array.isArray(state.log) ? state.log.slice().reverse() : [];
  logs.forEach((entry) => {
    if (entries.length >= limit) {
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
    if (entries.length >= limit) {
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
      if (entries.length >= limit) {
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

  return unique.slice(0, limit);
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
    const progressValue = getQuestProgressValue(quest);
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

function renderQuests() {
  elements.questList.innerHTML = '';
  const quests = Array.isArray(state.quests) ? state.quests : [];
  const activeQuests = quests
    .map((quest, index) => ({ quest, index }))
    .filter(({ quest }) => quest && !quest.deleted && quest.status === 'in_progress');

  if (activeQuests.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '진행 중인 퀘스트가 없습니다.';
    elements.questList.appendChild(empty);
    if (typeof window !== 'undefined' && window.__RG_DEBUG) {
      console.log('guildView: renderQuests(in_progressOnly)', { count: 0 });
    }
    return;
  }

  activeQuests.forEach(({ quest, index }) => {
    const card = document.createElement('div');
    card.className = 'quest-card quest-card--in-progress';
    const isOverdue = Boolean(quest.overdue);
    if (isOverdue) {
      card.classList.add('quest-card--overdue');
    }

    const header = document.createElement('div');
    header.className = 'quest-card__header';
    const title = document.createElement('strong');
    const tierLabel = quest.tier ? `${quest.tier}급 ` : '';
    const remainingTurns = Math.max(0, Number(quest.remaining_turns) || 0);
    title.textContent = `${tierLabel}던전 탐험 (남은 ${remainingTurns}턴)`;

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
    statusBadge.textContent = isOverdue ? '기한 초과' : '진행 중';
    statusBadge.classList.add(isOverdue ? 'quest-card__status-badge--overdue' : 'quest-card__status-badge--active');
    meta.appendChild(statusBadge);

    if (quest.stance) {
      const stanceTag = document.createElement('span');
      stanceTag.className = `quest-card__stance quest-card__stance--${quest.stance}`;
      stanceTag.textContent = quest.stance === 'on_time' ? '성향: 기한 준수' : '성향: 꼼꼼히 탐색';
      meta.appendChild(stanceTag);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'quest-card__delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = '진행 중인 퀘스트는 삭제할 수 없습니다.';
    deleteBtn.disabled = true;
    deleteBtn.addEventListener('click', () => deleteQuest(index));

    headerActions.append(meta, deleteBtn);
    header.append(title, headerActions);

    const stats = document.createElement('div');
    stats.className = 'quest-card__stats';
    stats.innerHTML = `<span>소요 ${quest.turns_cost}턴</span><span>유형: ${quest.type}</span>`;

    const recommended = getQuestRecommended(quest);
    const requirements = document.createElement('div');
    requirements.className = 'quest-card__requirements';
    requirements.textContent = `추천 ATK ${recommended.atk} / DEF ${recommended.def} / STAM ${recommended.stam}`;

    const assigned = document.createElement('div');
    assigned.className = 'quest-card__assigned';
    const assignedNames = (Array.isArray(quest.assigned_merc_ids) ? quest.assigned_merc_ids : [])
      .map((id) => state.mercs.find((merc) => merc.id === id))
      .filter(Boolean)
      .map((merc) => getMercDisplayName(merc));
    assigned.textContent = assignedNames.length > 0 ? `투입: ${assignedNames.join(', ')}` : '투입 용병 없음';

    const selectedStats = document.createElement('div');
    selectedStats.className = 'quest-card__selected-stats';
    const statsLabel = document.createElement('span');
    statsLabel.className = 'quest-card__selected-stats-label';
    statsLabel.textContent = '현재 합계';
    selectedStats.appendChild(statsLabel);

    const totals = getQuestAssignedTotals(quest);
    const requirementsMap = { atk: recommended.atk || 0, def: recommended.def || 0, stam: recommended.stam || 0 };
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
    const currentProgress = getQuestProgressValue(quest);
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
    const overdueTurns = Math.max(0, currentProgress - plannedTurns);
    progressLabel.textContent = overdueTurns > 0
      ? `진행 ${currentProgress}턴 (기한 초과 +${overdueTurns})`
      : `진행 ${currentProgress}턴 / 목표 ${plannedTurns}턴`;

    progressSection.append(progressWrapper, progressLabel);

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
      recentEntries.forEach((entry, entryIndex) => {
        const line = document.createElement('div');
        line.className = 'quest-card__journal-entry';
        const parsed = parseJournalEntry(entry, quest.started_turn, entryIndex);
        line.textContent = parsed.turn ? `T${parsed.turn} · ${parsed.text}` : parsed.text;
        journal.appendChild(line);
      });
    }
    progressSection.appendChild(journal);

    const actions = document.createElement('div');
    actions.className = 'quest-card__actions';
    const runBtn = document.createElement('button');
    runBtn.className = 'btn btn--accent';
    runBtn.textContent = '진행 중';
    runBtn.disabled = true;
    actions.appendChild(runBtn);

    card.append(header, stats, requirements, assigned, selectedStats, progressSection, actions);
    elements.questList.appendChild(card);
  });

  if (typeof window !== 'undefined' && window.__RG_DEBUG) {
    console.log('guildView: renderQuests(in_progressOnly)', { count: activeQuests.length });
  }
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

  const assetPath = getMercPortraitPath(merc) || '';
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
    } else if (isAwarded) {
      runBtn.textContent = '편성하기';
      runBtn.addEventListener('click', () => openQuestAssignModal(quest.id));
    } else {
      runBtn.textContent = '수주 대기';
      runBtn.disabled = true;
      runBtn.classList.add('btn--disabled');
      runBtn.title = '상단 “퀘스트 수주” 버튼으로 입찰하세요.';
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

function renderReputationDisplay() {
  const bandInfo = getReputationBandInfo(state.reputation);
  if (elements.reputationValue) {
    elements.reputationValue.textContent = `${state.reputation}`;
  }
  if (elements.reputationBand) {
    const label = bandInfo ? bandInfo.name : '알려지지 않음';
    elements.reputationBand.textContent = label;
    if (bandInfo && Array.isArray(bandInfo.range)) {
      elements.reputationBand.setAttribute('title', `${label} (${bandInfo.range[0]}-${bandInfo.range[1]})`);
    }
  }
  if (elements.probabilityReputation) {
    elements.probabilityReputation.textContent = `${state.reputation}`;
  }
  if (elements.probabilityReputationBand) {
    const label = bandInfo ? bandInfo.name : '알려지지 않음';
    elements.probabilityReputationBand.textContent = label;
    if (bandInfo && Array.isArray(bandInfo.range)) {
      elements.probabilityReputationBand.setAttribute('title', `${label} (${bandInfo.range[0]}-${bandInfo.range[1]})`);
    }
  }
}

function renderProbabilityPanel() {
  if (!elements.probabilityPanel) {
    return;
  }
  const selection = uiState.probabilityBand || 'current';
  if (elements.probabilityBandSelect && elements.probabilityBandSelect.value !== selection) {
    elements.probabilityBandSelect.value = selection;
  }
  const bandKey = selection === 'current' ? getReputationBandKey(state.reputation) : selection;
  const bandInfo = selection === 'current'
    ? getReputationBandInfo(state.reputation)
    : REPUTATION.bands.find((band) => band.key === bandKey) || getReputationBandInfo(state.reputation);
  const bandLabel = bandInfo ? bandInfo.name : '알려지지 않음';
  const bandRange = bandInfo && Array.isArray(bandInfo.range) ? `${bandInfo.range[0]}-${bandInfo.range[1]}` : '';
  if (elements.probabilityQuestTitle) {
    elements.probabilityQuestTitle.textContent = bandRange
      ? `퀘스트 등급 분포 (${bandLabel} · ${bandRange})`
      : `퀘스트 등급 분포 (${bandLabel})`;
  }
  if (elements.probabilityMercTitle) {
    elements.probabilityMercTitle.textContent = bandRange
      ? `용병 등급 분포 (${bandLabel} · ${bandRange})`
      : `용병 등급 분포 (${bandLabel})`;
  }
  const questDistribution = (SPAWN_TABLE.quests && SPAWN_TABLE.quests[bandKey]) || SPAWN_TABLE.quests.low;
  const mercDistribution = (SPAWN_TABLE.mercs && SPAWN_TABLE.mercs[bandKey]) || SPAWN_TABLE.mercs.low;
  buildProbabilityTable(elements.probabilityQuestTable, questDistribution);
  buildProbabilityTable(elements.probabilityMercTable, mercDistribution);
  elements.probabilityPanel.setAttribute('data-probability-band', bandKey);
}

function buildProbabilityTable(tableElement, distribution) {
  if (!tableElement) {
    return;
  }
  const header = `
    <thead>
      <tr>
        <th scope="col" class="probability-table__grade">등급</th>
        <th scope="col">확률</th>
      </tr>
    </thead>
  `;
  const rows = GRADE_ORDER.map((grade, index) => {
    const value = Array.isArray(distribution) ? distribution[index] || 0 : 0;
    return `
      <tr>
        <th scope="row" class="probability-table__grade">${grade}</th>
        <td class="probability-table__value">${formatSpawnProbability(value)}</td>
      </tr>
    `;
  }).join('');
  tableElement.innerHTML = `${header}<tbody>${rows}</tbody>`;
}

function formatSpawnProbability(value) {
  const percent = Math.max(0, Number(value) || 0) * 100;
  return percent >= 10 ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`;
}

function adjustReputation(delta) {
  const numericDelta = Number(delta);
  if (!Number.isFinite(numericDelta) || numericDelta === 0) {
    return;
  }
  const nextValue = clampRep(state.reputation + numericDelta, state.reputation + numericDelta);
  if (nextValue === state.reputation) {
    return;
  }
  state.reputation = nextValue;
  log(`[DEBUG] 평판 ${numericDelta > 0 ? '+' : ''}${numericDelta} → ${state.reputation}`);
  save();
  render();
}

function handleProbabilityBandChange(event) {
  const rawValue = event?.target?.value;
  const allowed = new Set(['current', ...REPUTATION.bands.map((band) => band.key)]);
  uiState.probabilityBand = allowed.has(rawValue) ? rawValue : 'current';
  renderProbabilityPanel();
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
function showModal(selector) {
  if (typeof document === 'undefined') {
    return;
  }
  const node = document.querySelector(selector);
  if (!node) {
    return;
  }
  node.classList.remove('hidden');
  node.setAttribute('aria-hidden', 'false');
}

function hideModal(selector) {
  if (typeof document === 'undefined') {
    return;
  }
  const node = document.querySelector(selector);
  if (!node) {
    return;
  }
  node.classList.add('hidden');
  node.setAttribute('aria-hidden', 'true');
}

function closeModal() {
  elements.modalOverlay.classList.add('hidden');
  elements.modalBody.innerHTML = '';
  if (elements.modalBody && elements.modalBody.dataset) {
    delete elements.modalBody.dataset.modalType;
  }
  resetModalRequirementSummary();
  currentQuestId = null;
}

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
    S: { statBonus: 3 },
    A: { statBonus: 2 },
    B: { statBonus: 1 },
    C: { statBonus: 0 },
    D: { statBonus: -1 }
  };
  const modifiers = gradeModifiers[grade];

  const name = generateUniqueMercName();
  const baselineBonus = Math.max(0, Number(CONFIG.MERC_STAT_BONUS) || 0);
  const baseAtk = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const baseDef = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const baseStamina = clamp(randomInt(CONFIG.STAT_MIN, CONFIG.STAT_MAX) + modifiers.statBonus, CONFIG.STAT_MIN, CONFIG.STAT_MAX + 3);
  const atk = baseAtk + baselineBonus;
  const def = baseDef + baselineBonus;
  const stamina = baseStamina + baselineBonus;
  const statTotal = atk + def + stamina;
  const signing_bonus = calculateMercSigningBonus(statTotal);
  const wage_per_quest = calculateMercWage(statTotal);
  const baseLevel = defaultLevelForGrade(grade);
  const level = clamp(baseLevel + randomInt(-1, 2), 1, baseLevel + 4);
  const age = clamp(randomInt(19, 36) + randomInt(0, 4), 18, 48);

  const merc = {
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
    journal: [],
    isNamed: Math.random() < NAMED_RATE,
    isTownie: Math.random() < TOWNIE_RATE,
    reappearCooldown: DEFAULT_REAPPEAR_COOLDOWN,
    cooldownUntilTurn: null,
    revisitCount: 0,
    revisitHistory: [],
    isReturning: false
  };
  assignMercPortrait(merc);
  return merc;
}

/**
 * Randomly pick a grade for a new mercenary.
 * @returns {'S'|'A'|'B'|'C'|'D'}
 */
function rollGrade() {
  const distribution = getSpawnDistribution('mercs', state.reputation) || SPAWN_TABLE.mercs.low;
  return sampleGradeFromDistribution(distribution, GRADE_ORDER);
}

/**
 * Generate a random integer within an inclusive range.
 * @param {number} min
 * @param {number} max
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randInt(min, max) {
  return randomInt(min, max);
}

function assignMercPortrait(merc) {
  if (!merc || typeof merc !== 'object') {
    return merc;
  }
  const legacyPattern = /^assets\/mercs\/merc_/;
  const validPattern = /^assets\/mercs\/m\d{2}\.jpg$/;
  const fallback = 'assets/mercs/default.jpg';
  const current = typeof merc.portrait === 'string' ? merc.portrait.trim() : '';
  if (legacyPattern.test(current)) {
    merc.portrait = 'assets/mercs/m01.jpg';
    return merc;
  }
  if (validPattern.test(current)) {
    return merc;
  }
  const n = randInt(1, 10);
  merc.portrait = `assets/mercs/m${String(n).padStart(2, '0')}.jpg`;
  if (!merc.portrait) {
    merc.portrait = fallback;
  }
  return merc;
}

function getMercPortraitPath(merc) {
  if (!merc || typeof merc !== 'object') {
    return null;
  }
  const portrait = typeof merc.portrait === 'string' && merc.portrait.trim().length > 0
    ? merc.portrait.trim()
    : 'assets/mercs/default.jpg';
  return portrait;
}

function randVar(variance = ECON.variance) {
  const v = Math.max(0, Number(variance) || 0);
  if (v === 0) {
    return 1;
  }
  return 1 + (Math.random() * 2 - 1) * v;
}

/** Clamp a value between min and max. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampRep(value, fallback = CONFIG.START_REPUTATION) {
  const baseFallback = Number.isFinite(fallback) ? fallback : CONFIG.START_REPUTATION;
  const numeric = Number.isFinite(value) ? value : baseFallback;
  return clamp(numeric, REPUTATION.MIN, REPUTATION.MAX);
}

function normalizeReputationValue(value, fallback = CONFIG.START_REPUTATION, saveVersion = SAVE_VERSION) {
  const baseFallback = Number.isFinite(fallback) ? fallback : CONFIG.START_REPUTATION;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return clampRep(baseFallback);
  }
  if (saveVersion < 4) {
    const bounded = clamp(numeric, 0, 100);
    const scaled = Math.round((bounded / 100) * REPUTATION.MAX);
    return clampRep(scaled, baseFallback);
  }
  return clampRep(numeric, baseFallback);
}

function getReputationBandInfo(reputation) {
  const clamped = clampRep(reputation, CONFIG.START_REPUTATION);
  return (
    REPUTATION.bands.find((band) => clamped >= band.range[0] && clamped <= band.range[1])
    || REPUTATION.bands[REPUTATION.bands.length - 1]
  );
}

function getRepBandName(reputation) {
  const band = getReputationBandInfo(reputation);
  return band ? band.name : REPUTATION.bands[0].name;
}

function getReputationBandKey(reputation) {
  const band = getReputationBandInfo(reputation);
  return band ? band.key : REPUTATION.bands[REPUTATION.bands.length - 1].key;
}

function getSpawnDistribution(type, reputation) {
  const table = SPAWN_TABLE[type];
  if (!table) {
    return null;
  }
  const key = getReputationBandKey(reputation);
  return Array.isArray(table[key]) ? table[key] : table.low;
}

function sampleGradeFromDistribution(distribution, order = GRADE_ORDER) {
  if (!Array.isArray(distribution) || distribution.length === 0) {
    return order[order.length - 1];
  }
  const total = distribution.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const normalized = total > 0 ? distribution.map((value) => (Math.max(0, Number(value) || 0) / total)) : distribution;
  const roll = Math.random();
  let cumulative = 0;
  for (let index = 0; index < normalized.length && index < order.length; index += 1) {
    cumulative += normalized[index];
    if (roll <= cumulative) {
      return order[index];
    }
  }
  return order[Math.min(order.length - 1, normalized.length - 1)];
}

function calculateMercSigningBonus(statTotal, variance = ECON.variance) {
  const base = Math.max(0, Number(statTotal) || 0);
  return Math.max(0, Math.round(base * ECON.signingCoefPerPoint * randVar(variance)));
}

function calculateMercWage(statTotal, variance = ECON.variance) {
  const base = Math.max(0, Number(statTotal) || 0);
  return Math.max(0, Math.round(base * ECON.wageCoefPerPoint * randVar(variance)));
}

function calculateQuestReward(tier, turns, variance = ECON.variance) {
  const tierKey = typeof tier === 'string' ? tier.toUpperCase() : 'C';
  const tierCoef = ECON.tierCoef[tierKey] ?? 1;
  const turnValue = Math.max(1, Number(turns) || 1);
  const turnCoef = typeof ECON.turnCoef === 'function' ? ECON.turnCoef(turnValue) : 1;
  const base = ECON.baseReward * tierCoef * turnCoef * randVar(variance);
  const reward = Math.max(CONFIG.QUEST_REWARD_MIN, Math.round(base));
  return Math.min(CONFIG.QUEST_REWARD_MAX, reward);
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
 * @property {{mercs: {[key: string]: CodexEntry}}} codex
 * @property {{namedArchive: {[key: string]: Merc}}} pool
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
 * @property {boolean} isNamed
 * @property {boolean} isTownie
 * @property {number} reappearCooldown
 * @property {?number} cooldownUntilTurn
 * @property {number} revisitCount
 * @property {{turn: number|null, year: number|null, month: number|null}[]} revisitHistory
 * @property {boolean} isReturning
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
 *
 * @typedef {Object} CodexEntry
 * @property {string} id
 * @property {string} name
 * @property {'S'|'A'|'B'|'C'|'D'} grade
 * @property {{year: number|null, month: number|null, turn: number|null}|null} firstMet
 * @property {number} lastSeenTurn
 * @property {'active'|'retired'|'deceased'|'left'} status
 * @property {number} questsCompleted
 * @property {number} relationship
 * @property {string} memo
 * @property {number} wage
 * @property {number} signingBonus
 * @property {number} level
 * @property {?number} age
 * @property {boolean} isNamed
 * @property {boolean} isTownie
 * @property {number} revisitCount
 * @property {{turn: number|null, year: number|null, month: number|null}[]} revisitHistory
*/
