async function hashWitness(phrase) {
  const data = new TextEncoder().encode(phrase.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyWitness(phrase, hash) {
  if (!hash || !phrase) return false;
  return (await hashWitness(phrase)) === hash;
}

function isLockActive(lock) {
  if (!lock?.active) return false;
  if (lock.until && Date.now() >= lock.until) return false;
  return true;
}

function lockRemainingMs(lock) {
  if (!isLockActive(lock)) return 0;
  return Math.max(0, (lock.until ?? 0) - Date.now());
}

function formatDuration(ms) {
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeHost(hostname) {
  if (!hostname) return "";
  return String(hostname).replace(/^www\./i, "").toLowerCase();
}

function hostFromUrl(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

function frictionBonusSeconds(dailyStats, lockSettings) {
  const count = dailyStats?.completions ?? 0;
  const per = lockSettings?.frictionStackSeconds ?? 10;
  const cap = lockSettings?.frictionStackCap ?? 60;
  return Math.min(count * per, cap);
}

function validateSitesSave(prev, next, lock) {
  if (!isLockActive(lock)) return { ok: true };
  const prevSet = new Set((prev || []).map((s) => s.toLowerCase()));
  const nextSet = new Set((next || []).map((s) => s.toLowerCase()));
  for (const site of prevSet) {
    if (!nextSet.has(site)) {
      return {
        ok: false,
        reason: `Sperre aktiv: „${site}“ kann nicht entfernt werden.`
      };
    }
  }
  return { ok: true };
}

function questionFriction(q) {
  return {
    minChars: q.minChars ?? 0,
    minWords: q.minWords ?? 0,
    seconds: q.seconds ?? 0,
    steps: q.steps ?? 0,
    requireDuration: !!q.requireDuration
  };
}

function isWeakerQuestion(prev, next) {
  if (prev.active && !next.active) return true;
  const a = questionFriction(prev);
  const b = questionFriction(next);
  if (b.minChars < a.minChars) return true;
  if (b.minWords < a.minWords) return true;
  if (b.seconds < a.seconds) return true;
  if (b.steps < a.steps) return true;
  if (a.requireDuration && !b.requireDuration) return true;
  return false;
}

function validateQuestionsSave(prev, next, lock, roundLimit) {
  if (!isLockActive(lock)) return { ok: true };
  const prevMap = new Map((prev || []).map((q) => [q.id, q]));
  const nextMap = new Map((next || []).map((q) => [q.id, q]));

  for (const [id, pq] of prevMap) {
    const nq = nextMap.get(id);
    if (!nq) {
      return { ok: false, reason: "Sperre aktiv: Fragen dürfen nicht gelöscht werden." };
    }
    if (isWeakerQuestion(pq, nq)) {
      return {
        ok: false,
        reason: `Sperre aktiv: „${pq.label || id}“ darf nicht abgeschwächt werden.`
      };
    }
  }

  if (
    lock.roundLimitFloor != null &&
    roundLimit > 0 &&
    roundLimit < lock.roundLimitFloor
  ) {
    return {
      ok: false,
      reason: `Sperre aktiv: Fragen pro Durchlauf mindestens ${lock.roundLimitFloor}.`
    };
  }

  return { ok: true };
}

function validateGateSettingsSave(prev, next, lock) {
  if (!isLockActive(lock)) return { ok: true };
  const floor = lock.roundLimitFloor ?? 0;
  const limit = next.questionRoundLimit ?? 0;
  if (floor > 0 && (limit === 0 || limit < floor)) {
    return {
      ok: false,
      reason: `Sperre aktiv: mindestens ${floor} Fragen pro Durchlauf.`
    };
  }
  return { ok: true };
}

function activeQuestionCount(all) {
  return (all || []).filter((q) => q.active !== false).length;
}

function questionStats(all) {
  const total = (all || []).length;
  const active = activeQuestionCount(all);
  return { total, active, inactive: total - active };
}
