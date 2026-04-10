import { readDB, writeDB } from '../middleware/db.js';

/**
 * Shared gamification platform layer.
 * - Global: XP, level, streak, badges/achievements, ledger
 * - World-specific: daily quests catalogs + completion rules
 *
 * Backwards compatible with existing Study World usage:
 * - `getOrCreateGamification`, `awardXp`, `listLeaderboard` remain callable.
 */

const XP_PER_QUIZ_POINT = 2;
const XP_LEVEL_STEP = 500;

const COL_PROFILE = 'gamification_profiles';
const COL_LEDGER = 'gamification_ledger';
const COL_QUESTS = 'gamification_daily_quests';

export const WORLDS = /** @type {const} */ ({
  study: 'study',
  career: 'career',
});

function nowIso() {
  return new Date().toISOString();
}

function todayUTC() {
  return new Date().toISOString().split('T')[0];
}

function computeLevel(xp) {
  return Math.max(1, Math.floor((xp || 0) / XP_LEVEL_STEP) + 1);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function updateStreak(row) {
  const d = todayUTC();
  if (!row.lastStreakDate) {
    row.streak = 1;
    row.lastStreakDate = d;
    return;
  }
  if (row.lastStreakDate === d) return;
  const prev = new Date(`${row.lastStreakDate}T12:00:00Z`);
  const cur = new Date(`${d}T12:00:00Z`);
  const diffDays = Math.round((cur - prev) / (24 * 3600 * 1000));
  if (diffDays === 1) row.streak += 1;
  else if (diffDays > 1) row.streak = 1;
  row.lastStreakDate = d;
}

/**
 * @param {string} userId
 * @returns {Promise<{userId:string,xp:number,level:number,streak:number,lastStreakDate:string|null,badges:string[],updatedAt:string,createdAt:string}>}
 */
export async function getOrCreateGamification(userId) {
  const all = await readDB(COL_PROFILE);
  let row = all.find((r) => r.userId === userId);
  if (!row) {
    row = {
      userId,
      xp: 0,
      level: 1,
      streak: 0,
      lastStreakDate: null,
      badges: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    all.push(row);
    await writeDB(COL_PROFILE, all);
  }
  return row;
}

async function appendLedger(entry) {
  const all = await readDB(COL_LEDGER);
  all.push(entry);
  await writeDB(COL_LEDGER, all);
}

/**
 * Award XP (global) and update streak (global). Optionally attaches a `world`.
 * @param {string} userId
 * @param {number} amount
 * @param {string} reason
 * @param {{ world?: 'study'|'career', meta?: any }} [opts]
 */
export async function awardXp(userId, amount, reason = 'xp_awarded', opts = {}) {
  const delta = Number(amount) || 0;
  if (delta <= 0) return getOrCreateGamification(userId);

  const all = await readDB(COL_PROFILE);
  let idx = all.findIndex((r) => r.userId === userId);
  if (idx === -1) {
    await getOrCreateGamification(userId);
    return awardXp(userId, amount, reason, opts);
  }

  const row = { ...all[idx] };
  updateStreak(row);
  row.xp = (row.xp || 0) + delta;
  row.level = computeLevel(row.xp);
  row.updatedAt = nowIso();
  all[idx] = row;
  await writeDB(COL_PROFILE, all);

  await appendLedger({
    id: `${userId}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    userId,
    world: opts.world || null,
    reason: String(reason || 'xp_awarded').slice(0, 80),
    deltaXp: delta,
    createdAt: nowIso(),
    meta: opts.meta ?? null,
  });

  return row;
}

export function xpFromQuizScore(scorePercent, totalQuestions) {
  const base = Math.round((scorePercent / 100) * (totalQuestions || 10) * XP_PER_QUIZ_POINT);
  return clamp(base + 10, 5, 200);
}

function questIdFor(world, date, slug) {
  return `${world}_${date}_${slug}`;
}

function worldQuestCatalog(world) {
  if (world === WORLDS.career) {
    return [
      { slug: 'career_socratic_turns', title: 'Socratic Sprint', description: 'Complete 3 Socratic chat turns', target: 3, xpReward: 18, type: 'career_socratic_turns' },
      { slug: 'career_visualizer_runs', title: 'Visualizer Warmup', description: 'Run the visualizer once', target: 1, xpReward: 10, type: 'career_visualizer_runs' },
      { slug: 'career_attempts', title: 'Arena Momentum', description: 'Submit 2 problem attempts', target: 2, xpReward: 16, type: 'career_attempts' },
    ];
  }
  // default: Study world
  return [
    { slug: 'study_daily_plan_task', title: 'Plan Executor', description: 'Complete 2 tasks from today’s plan', target: 2, xpReward: 14, type: 'study_daily_plan_task' },
    { slug: 'study_adaptive_quiz', title: 'Adaptive Grind', description: 'Finish 1 adaptive quiz session', target: 1, xpReward: 16, type: 'study_adaptive_quiz' },
    { slug: 'study_srs_review', title: 'Spaced Repetition', description: 'Review 10 flashcards', target: 10, xpReward: 12, type: 'study_srs_review' },
  ];
}

/**
 * Ensure today's quests exist for a world.
 * @param {string} userId
 * @param {'study'|'career'} world
 */
export async function getOrCreateDailyQuests(userId, world) {
  const date = todayUTC();
  const all = await readDB(COL_QUESTS);
  const existing = all.filter((q) => q.userId === userId && q.world === world && q.date === date);
  if (existing.length) return existing;

  const catalog = worldQuestCatalog(world);
  const created = catalog.map((q) => ({
    id: questIdFor(world, date, q.slug),
    userId,
    world,
    date,
    slug: q.slug,
    title: q.title,
    description: q.description,
    type: q.type,
    target: q.target,
    current: 0,
    xpReward: q.xpReward,
    completed: false,
    completedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));

  await writeDB(COL_QUESTS, [...all, ...created]);
  return created;
}

/**
 * Increment quest progress; awards quest XP when completed.
 * @param {string} userId
 * @param {'study'|'career'} world
 * @param {string} type
 * @param {number} inc
 */
export async function incrementQuest(userId, world, type, inc = 1) {
  const delta = Math.max(1, Number(inc) || 1);
  const date = todayUTC();
  await getOrCreateDailyQuests(userId, world);

  const all = await readDB(COL_QUESTS);
  let awarded = 0;
  const next = all.map((q) => {
    if (q.userId !== userId || q.world !== world || q.date !== date) return q;
    if (q.type !== type || q.completed) return q;
    const cur = clamp((q.current || 0) + delta, 0, q.target || 1);
    const completed = cur >= (q.target || 1);
    if (completed) awarded += Number(q.xpReward) || 0;
    return {
      ...q,
      current: cur,
      completed,
      completedAt: completed ? nowIso() : q.completedAt || null,
      updatedAt: nowIso(),
    };
  });
  await writeDB(COL_QUESTS, next);

  if (awarded > 0) {
    await awardXp(userId, awarded, 'daily_quest_completed', { world, meta: { type } });
  }
}

export async function listLeaderboard(limit = 20) {
  const users = await readDB('users');
  const gm = await readDB(COL_PROFILE);
  const merged = gm.map((g) => {
    const u = users.find((x) => x.id === g.userId);
    return {
      userId: g.userId,
      name: u?.name || 'Student',
      xp: g.xp || 0,
      level: g.level || 1,
      streak: g.streak || 0,
    };
  });
  merged.sort((a, b) => b.xp - a.xp);
  return merged.slice(0, limit);
}
