const LEVEL_THRESHOLDS = [0, 30, 80, 150, 250, 400, 600, 900, 1300, 1800, 2500];

const XP_REWARDS = {
  cleanDay: 15,
  abort: 8,
  budgetDay: 10,
  lockDay: 12,
  complete: -4,
  growthPerMinute: 2,
  goalMetDay: 25,
  allGoalsMetDay: 40
};

const DEFAULT_LEVELING_SETTINGS = {
  mode: "reflect",
  enabled: true
};

function defaultLevelState() {
  return {
    integrityXp: 0,
    growthXp: 0,
    cleanStreakDays: 0,
    growthStreakDays: 0,
    longestCleanStreak: 0,
    longestGrowthStreak: 0,
    resistStreak: 0,
    totalAborts: 0,
    totalCompletes: 0,
    lockAdherenceDays: 0,
    budgetCleanDays: 0,
    growthGoalDays: 0,
    lastCompleteDate: null,
    lastProcessedDate: null,
    completesToday: 0,
    abortsToday: 0,
    growthMinutesToday: 0,
    yesterdayHadComplete: false,
    yesterdayBudgetOk: true,
    yesterdayLockActive: false,
    yesterdayGoalsMet: false
  };
}

function totalXp(state) {
  return (state.integrityXp || 0) + (state.growthXp || 0);
}

function levelFromXp(xp) {
  let lvl = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      lvl = i + 1;
      break;
    }
  }
  return Math.min(lvl, 10);
}

function tierKey(level) {
  return `level.tier.${Math.min(level, 10)}`;
}

function xpToNextLevel(xp) {
  const level = levelFromXp(xp);
  if (level >= 10) return 0;
  return LEVEL_THRESHOLDS[level] - xp;
}

function processDailyRollover(state, context) {
  const today = todayKey();
  if (state.lastProcessedDate === today) return state;

  const s = { ...state };

  if (s.lastProcessedDate) {
    if (!s.yesterdayHadComplete) {
      s.cleanStreakDays += 1;
      s.integrityXp += XP_REWARDS.cleanDay;
      if (s.cleanStreakDays > s.longestCleanStreak) {
        s.longestCleanStreak = s.cleanStreakDays;
      }
    } else {
      s.cleanStreakDays = 0;
    }

    if (s.yesterdayGoalsMet) {
      s.growthStreakDays += 1;
      s.growthGoalDays += 1;
      s.growthXp += XP_REWARDS.goalMetDay;
      if (s.growthStreakDays > s.longestGrowthStreak) {
        s.longestGrowthStreak = s.growthStreakDays;
      }
    } else if (context?.hadEndorsedGoals) {
      s.growthStreakDays = 0;
    }

    if (s.yesterdayLockActive) {
      s.lockAdherenceDays += 1;
      s.integrityXp += XP_REWARDS.lockDay;
    }

    if (s.yesterdayBudgetOk) {
      s.budgetCleanDays += 1;
      s.integrityXp += XP_REWARDS.budgetDay;
    }

    if (context?.allGoalsMet) {
      s.growthXp += XP_REWARDS.allGoalsMetDay;
    }
  }

  s.yesterdayHadComplete = s.completesToday > 0;
  s.yesterdayBudgetOk = context?.budgetOk ?? true;
  s.yesterdayLockActive = context?.lockActive ?? false;
  s.yesterdayGoalsMet = context?.goalsMet ?? false;
  s.completesToday = 0;
  s.abortsToday = 0;
  s.growthMinutesToday = 0;
  s.lastProcessedDate = today;
  s.integrityXp = Math.max(0, s.integrityXp);
  s.growthXp = Math.max(0, s.growthXp);

  return s;
}

function onGateOutcome(state, outcome) {
  const s = { ...state };
  if (outcome === "aborted") {
    s.totalAborts += 1;
    s.abortsToday += 1;
    s.resistStreak += 1;
    s.integrityXp = Math.max(0, s.integrityXp + XP_REWARDS.abort);
  } else if (outcome === "completed") {
    s.totalCompletes += 1;
    s.completesToday += 1;
    s.resistStreak = 0;
    s.cleanStreakDays = 0;
    s.lastCompleteDate = todayKey();
    s.integrityXp = Math.max(0, s.integrityXp + XP_REWARDS.complete);
  }
  return s;
}

function applyGrowthMinutes(state, minutes) {
  if (minutes <= 0) return state;
  const s = { ...state };
  s.growthMinutesToday = (s.growthMinutesToday || 0) + minutes;
  s.growthXp = Math.max(0, s.growthXp + minutes * XP_REWARDS.growthPerMinute);
  return s;
}

function adaptiveModifiers(state, settings) {
  if (!settings?.enabled || settings.mode !== "adaptive") {
    return { waitReduction: 0, extraConfirm: 0 };
  }
  const level = levelFromXp(totalXp(state));
  let waitReduction = 0;
  let extraConfirm = 0;

  if (state.cleanStreakDays >= 3 || state.growthStreakDays >= 2) {
    waitReduction = Math.min(
      8,
      2 +
        Math.floor(state.cleanStreakDays / 3) +
        Math.floor(state.growthStreakDays / 2) +
        Math.floor(level / 4)
    );
  }

  if (state.completesToday >= 2) {
    extraConfirm = 1;
  }

  return { waitReduction, extraConfirm };
}

function applyLevelingToQuestions(questions, modifiers) {
  if (!modifiers.waitReduction && !modifiers.extraConfirm) return questions;
  return questions.map((q) => {
    if (q.type === "wait" && modifiers.waitReduction) {
      const base = q.seconds ?? 25;
      return { ...q, seconds: Math.max(5, base - modifiers.waitReduction) };
    }
    if (q.type === "confirm" && modifiers.extraConfirm) {
      return { ...q, steps: (q.steps ?? 3) + modifiers.extraConfirm };
    }
    return q;
  });
}

function snapshotForUi(state) {
  const xp = totalXp(state);
  const level = levelFromXp(xp);
  return {
    ...state,
    totalXp: xp,
    level,
    tierKey: tierKey(level),
    xpToNext: xpToNextLevel(xp),
    integrityXp: state.integrityXp || 0,
    growthXp: state.growthXp || 0
  };
}
