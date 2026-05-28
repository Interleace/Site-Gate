const BUDGET_MODES = ["static", "budget"];
const BUDGET_SCOPES = ["list", "per-site"];

function normalizeBudgetConfig(raw, legacyPolicy) {
  if (raw?.mode === "static" || raw?.mode === "budget") {
    const scope = raw.scope === "per-site" ? "per-site" : "list";
    return {
      mode: raw.mode,
      scope,
      listDailyLimit: Math.max(0, parseInt(raw.listDailyLimit, 10) || 0)
    };
  }

  if (raw?.enabled === false) {
    return { mode: "static", scope: "list", listDailyLimit: 0 };
  }

  if (raw?.precedence === "per-site-only" || (raw?.perSite?.enabled && !raw?.global?.enabled)) {
    return { mode: "budget", scope: "per-site", listDailyLimit: 0 };
  }

  const limit =
    raw?.global?.dailyLimit ??
    raw?.listDailyLimit ??
    legacyPolicy?.globalDailyBudget ??
    DEFAULT_BUDGET_CONFIG.listDailyLimit;

  return {
    mode: "budget",
    scope: "list",
    listDailyLimit: Math.max(0, limit || 0)
  };
}

function enrichSitePolicy(policy) {
  const p = { ...policy };
  p.budget = normalizeBudgetConfig(p.budget, p);
  return p;
}

function isStaticBudget(cfg) {
  return cfg?.mode === "static";
}

function isListBudget(cfg) {
  return cfg?.mode === "budget" && cfg.scope === "list";
}

function isPerSiteBudget(cfg) {
  return cfg?.mode === "budget" && cfg.scope === "per-site";
}

function budgetGlobalLimit(cfg) {
  if (!isListBudget(cfg)) return 0;
  return cfg.listDailyLimit ?? 0;
}

function hostHasSiteLimit(entry, cfg) {
  return !!(isPerSiteBudget(cfg) && entry?.dailyBudget > 0);
}

function checkGlobalExceeded(cfg, stats) {
  const limit = budgetGlobalLimit(cfg);
  if (limit <= 0) return null;
  const used = stats.completions || 0;
  if (used >= limit) {
    return { exceeded: true, scope: "global", used, limit };
  }
  return null;
}

function checkHostExceeded(cfg, stats, host, blocked) {
  const entry = hostInList(host, blocked);
  if (!hostHasSiteLimit(entry, cfg)) return null;
  const limit = entry.dailyBudget;
  const key = statsHostKey(host, blocked);
  const used = hostCompletions(stats, host, blocked);
  if (used >= limit) {
    return { exceeded: true, scope: "host", used, limit, host: key };
  }
  return null;
}

function buildBudgetChecks(cfg, stats, host, blocked) {
  if (isStaticBudget(cfg)) return [];

  if (isListBudget(cfg)) {
    const limit = budgetGlobalLimit(cfg);
    return limit > 0 ? [() => checkGlobalExceeded(cfg, stats)] : [];
  }

  if (isPerSiteBudget(cfg)) {
    const entry = hostInList(host, blocked);
    return hostHasSiteLimit(entry, cfg)
      ? [() => checkHostExceeded(cfg, stats, host, blocked)]
      : [];
  }

  return [];
}

function checkBudget(policy, stats, targetHost) {
  const enriched = enrichSitePolicy(policy);
  const cfg = enriched.budget;
  const blocked = enriched.blocked || [];
  const host = normalizeHost(targetHost || "");

  if (isStaticBudget(cfg)) {
    return {
      exceeded: false,
      scope: "static",
      globalUsed: stats.completions || 0,
      globalLimit: 0,
      hostUsed: hostCompletions(stats, host, blocked),
      hostLimit: 0,
      host: statsHostKey(host, blocked)
    };
  }

  for (const run of buildBudgetChecks(cfg, stats, host, blocked)) {
    const hit = run();
    if (hit?.exceeded) {
      return {
        ...hit,
        globalUsed: stats.completions || 0,
        globalLimit: budgetGlobalLimit(cfg),
        hostUsed: hostCompletions(stats, host, blocked),
        hostLimit: hostInList(host, blocked)?.dailyBudget || 0,
        host: hit.host || statsHostKey(host, blocked)
      };
    }
  }

  const entry = hostInList(host, blocked);
  return {
    exceeded: false,
    scope: "ok",
    globalUsed: stats.completions || 0,
    globalLimit: budgetGlobalLimit(cfg),
    hostUsed: hostCompletions(stats, host, blocked),
    hostLimit: entry?.dailyBudget || 0,
    host: statsHostKey(host, blocked)
  };
}

function budgetExceededToday(policy, stats) {
  const cfg = enrichSitePolicy(policy).budget;
  if (isStaticBudget(cfg)) return true;
  if (isListBudget(cfg)) return !checkGlobalExceeded(cfg, stats);
  return true;
}

function snapshotBudgetPolicy(policy) {
  const p = enrichSitePolicy(policy);
  const cfg = p.budget;
  const hostLimits = {};
  for (const b of p.blocked || []) {
    if (b.dailyBudget > 0) hostLimits[normalizeHost(b.host)] = b.dailyBudget;
  }
  return {
    mode: cfg.mode,
    scope: cfg.scope,
    listDailyLimit: cfg.listDailyLimit,
    hostLimits
  };
}

function validateBudgetSave(prev, next, lock) {
  if (!isLockActive(lock)) return { ok: true };

  const snap = lock.budgetSnapshot || snapshotBudgetPolicy(prev);
  const cfg = enrichSitePolicy(next).budget;

  if (snap.mode === "budget" && cfg.mode === "static") {
    return {
      ok: false,
      reason: "Sperre aktiv: Wechsel zu Dauer-Gate (ohne Budget) ist nicht erlaubt."
    };
  }

  if (snap.mode !== cfg.mode) {
    return { ok: false, reason: "Sperre aktiv: Gate-Modus darf nicht geändert werden." };
  }

  if (snap.mode === "budget" && snap.scope !== cfg.scope) {
    return {
      ok: false,
      reason: "Sperre aktiv: Budget-Untermodus darf nicht geändert werden."
    };
  }

  if (snap.mode === "budget" && snap.scope === "list") {
    const prevLimit = snap.listDailyLimit;
    const nextLimit = cfg.listDailyLimit;
    if (prevLimit > 0 && (nextLimit === 0 || nextLimit > prevLimit)) {
      return {
        ok: false,
        reason: `Sperre aktiv: Listen-Budget darf nicht über ${prevLimit} erhöht werden.`
      };
    }
  }

  if (snap.mode === "budget" && snap.scope === "per-site") {
    for (const [host, prevLimit] of Object.entries(snap.hostLimits || {})) {
      const entry = (enrichSitePolicy(next).blocked || []).find(
        (b) => normalizeHost(b.host) === host
      );
      const nextLimit = entry?.dailyBudget;
      if (!entry || nextLimit == null || nextLimit <= 0) {
        return {
          ok: false,
          reason: `Sperre aktiv: Site-Budget für „${host}“ darf nicht entfernt werden.`
        };
      }
      if (nextLimit > prevLimit) {
        return {
          ok: false,
          reason: `Sperre aktiv: Site-Budget für „${host}“ darf nicht über ${prevLimit} erhöht werden.`
        };
      }
    }
  }

  return { ok: true };
}

function defaultDailyStats() {
  return {
    date: todayKey(),
    completions: 0,
    byHost: {}
  };
}

function normalizeDailyStats(raw) {
  const today = todayKey();
  if (!raw || raw.date !== today) return defaultDailyStats();
  return {
    date: today,
    completions: raw.completions || 0,
    byHost: { ...(raw.byHost || {}) }
  };
}

function hostCompletions(stats, host, blocked) {
  if (!host) return 0;
  const key = statsHostKey(host, blocked);
  return stats.byHost[key] || 0;
}

function recordCompletion(stats, host, blocked) {
  const s = normalizeDailyStats(stats);
  s.completions += 1;
  const key = statsHostKey(host, blocked);
  if (key) s.byHost[key] = (s.byHost[key] || 0) + 1;
  return s;
}

function defaultEndorsedDaily() {
  return {
    date: todayKey(),
    byHost: {},
    totalActiveSeconds: 0
  };
}

function normalizeEndorsedDaily(raw) {
  const today = todayKey();
  if (!raw || raw.date !== today) return defaultEndorsedDaily();
  return {
    date: today,
    byHost: { ...(raw.byHost || {}) },
    totalActiveSeconds: raw.totalActiveSeconds || 0
  };
}

function addEndorsedActiveSeconds(daily, host, seconds) {
  if (!host || seconds <= 0) return daily;
  const d = normalizeEndorsedDaily(daily);
  const key = normalizeHost(host);
  d.byHost[key] = (d.byHost[key] || 0) + seconds;
  d.totalActiveSeconds += seconds;
  return d;
}

function endorsedMinutesToday(daily, host) {
  const key = normalizeHost(host);
  return Math.floor((daily.byHost[key] || 0) / 60);
}

function endorsedGoalsStatus(policy, daily) {
  const endorsed = policy.endorsed || [];
  const results = endorsed.map((e) => {
    const minutes = endorsedMinutesToday(daily, e.host);
    const goal = e.dailyGoalMinutes || 0;
    return {
      host: e.host,
      label: e.label,
      minutes,
      goal,
      met: goal > 0 && minutes >= goal
    };
  });
  const withGoals = results.filter((r) => r.goal > 0);
  const metCount = withGoals.filter((r) => r.met).length;
  return {
    items: results,
    metCount,
    totalGoals: withGoals.length,
    allMet: withGoals.length > 0 && metCount === withGoals.length
  };
}

function formatMinutes(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
