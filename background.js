try {
  importScripts(
    "shared/defaults.js",
    "shared/lock.js",
    "shared/sites.js",
    "shared/budget.js",
    "shared/assistant.js",
    "shared/leveling.js"
  );
} catch (_) {}

const GATE_PATH = "/gate/gate.html";

const sessionAllow = new Map();
let sitePolicy = normalizeSitePolicy(null, DEFAULT_BLOCKED);
let blockedHosts = blockedHostsFromPolicy(sitePolicy);
let commitmentLock = null;
let lockSettings = { ...DEFAULT_LOCK_SETTINGS };

const endorsedOpenTabs = new Map();

function upsertEndorsedTab(tabId, url) {
  const host = hostFromUrl(url || "");
  if (host && hostMatchesEndorsed(host)) {
    const prev = endorsedOpenTabs.get(tabId);
    endorsedOpenTabs.set(tabId, { host, lastTick: prev?.lastTick ?? Date.now() });
  } else {
    endorsedOpenTabs.delete(tabId);
  }
}

async function refreshEndorsedTab(tabId) {
  if (tabId == null) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && tab.url.startsWith("http") && !isExtensionUrl(tab.url)) {
      upsertEndorsedTab(tabId, tab.url);
    } else {
      endorsedOpenTabs.delete(tabId);
    }
  } catch {
    endorsedOpenTabs.delete(tabId);
  }
}

async function scanAllEndorsedTabs() {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  const seen = new Set();
  for (const tab of tabs) {
    if (tab.id == null) continue;
    seen.add(tab.id);
    upsertEndorsedTab(tab.id, tab.url);
  }
  for (const id of endorsedOpenTabs.keys()) {
    if (!seen.has(id)) endorsedOpenTabs.delete(id);
  }
}

function hostMatchesBlocked(host) {
  if (!host) return false;
  return blockedHosts.some((pattern) => {
    const p = normalizeHost(pattern);
    return host === p || host.endsWith("." + p);
  });
}

function hostMatchesEndorsed(host) {
  return !!hostInList(host, sitePolicy.endorsed || []);
}

function isExtensionUrl(url) {
  return url.startsWith(chrome.runtime.getURL(""));
}

function isGateUrl(url) {
  return url.startsWith(chrome.runtime.getURL(GATE_PATH));
}

function isAllowedForTab(tabId, url) {
  const host = hostFromUrl(url);
  if (!host) return true;
  const allowed = sessionAllow.get(tabId);
  return allowed?.has(host) ?? false;
}

function gateUrlFor(targetUrl, tabId) {
  const params = new URLSearchParams({ target: targetUrl, tab: String(tabId) });
  return `${chrome.runtime.getURL(GATE_PATH)}?${params.toString()}`;
}

async function loadSitePolicy() {
  const data = await chrome.storage.sync.get(["sitePolicy", "blockedSites"]);
  sitePolicy = normalizeSitePolicy(data.sitePolicy, data.blockedSites);
  blockedHosts = blockedHostsFromPolicy(sitePolicy);
  if (!data.sitePolicy) {
    await chrome.storage.sync.set({ sitePolicy });
  }
}

async function loadLockState() {
  const data = await chrome.storage.local.get(["commitmentLock", "lockSettings"]);
  commitmentLock = data.commitmentLock || null;
  lockSettings = { ...DEFAULT_LOCK_SETTINGS, ...(data.lockSettings || {}) };
  if (commitmentLock?.active && !isLockActive(commitmentLock)) {
    commitmentLock = { ...commitmentLock, active: false, expiredAt: Date.now() };
    await chrome.storage.local.set({ commitmentLock });
  }
}

async function getDailyStats() {
  const data = await chrome.storage.local.get(["dailyStats"]);
  return normalizeDailyStats(data.dailyStats);
}

async function getEndorsedDaily() {
  const data = await chrome.storage.local.get(["endorsedDaily"]);
  return normalizeEndorsedDaily(data.endorsedDaily);
}

async function saveDailyStats(stats) {
  await chrome.storage.local.set({ dailyStats: stats });
}

async function saveEndorsedDaily(daily) {
  await chrome.storage.local.set({ endorsedDaily: daily });
}

function budgetStatusForHost(stats, host) {
  return checkBudget(sitePolicy, stats, host);
}

async function getLevelState() {
  const data = await chrome.storage.local.get(["levelState", "levelingSettings"]);
  let state = data.levelState || defaultLevelState();
  const settings = { ...DEFAULT_LEVELING_SETTINGS, ...(data.levelingSettings || {}) };
  const stats = await getDailyStats();
  const endorsedDaily = await getEndorsedDaily();
  const goals = endorsedGoalsStatus(sitePolicy, endorsedDaily);
  await loadLockState();
  state = processDailyRollover(state, {
    budgetOk: !budgetExceededToday(sitePolicy, stats),
    lockActive: isLockActive(commitmentLock),
    goalsMet: goals.metCount > 0 && goals.items.some((g) => g.met),
    allGoalsMet: goals.allMet,
    hadEndorsedGoals: (sitePolicy.endorsed || []).some((e) => e.dailyGoalMinutes > 0)
  });
  await chrome.storage.local.set({ levelState: state });
  return { state, settings, snapshot: snapshotForUi(state), endorsedDaily, goals };
}

async function recordLevelOutcome(outcome) {
  const { state } = await getLevelState();
  const next = onGateOutcome(state, outcome);
  await chrome.storage.local.set({ levelState: next });
  return snapshotForUi(next);
}

async function appendLog(entry) {
  const data = await chrome.storage.local.get(["gateLogs"]);
  const logs = data.gateLogs || [];
  logs.unshift({ id: crypto.randomUUID(), timestamp: Date.now(), ...entry });
  if (logs.length > MAX_LOG_ENTRIES) logs.length = MAX_LOG_ENTRIES;
  await chrome.storage.local.set({ gateLogs: logs });
}

function redirectToGate(tabId, targetUrl) {
  chrome.tabs.update(tabId, { url: gateUrlFor(targetUrl, tabId) });
}

function shouldIntercept(details) {
  if (details.frameId !== 0) return false;
  if (!details.url.startsWith("http")) return false;
  if (isExtensionUrl(details.url)) return false;
  if (isGateUrl(details.url)) return false;
  if (isAllowedForTab(details.tabId, details.url)) return false;
  return hostMatchesBlocked(hostFromUrl(details.url));
}

async function flushEndorsedTick() {
  const now = Date.now();
  if (endorsedOpenTabs.size === 0) return;

  const hostSeconds = new Map();
  for (const [tabId, track] of endorsedOpenTabs) {
    try {
      await chrome.tabs.get(tabId);
    } catch {
      endorsedOpenTabs.delete(tabId);
      continue;
    }
    if (!track.host) continue;
    const deltaSec = Math.floor((now - track.lastTick) / 1000);
    track.lastTick = now;
    if (deltaSec <= 0 || deltaSec > 180) continue;
    hostSeconds.set(track.host, Math.max(hostSeconds.get(track.host) || 0, deltaSec));
  }

  if (hostSeconds.size === 0) return;

  let daily = await getEndorsedDaily();
  let totalSec = 0;
  for (const [host, sec] of hostSeconds) {
    daily = addEndorsedActiveSeconds(daily, host, sec);
    totalSec += sec;
  }
  await saveEndorsedDaily(daily);

  const minutes = Math.floor(totalSec / 60);
  if (minutes > 0) {
    const data = await chrome.storage.local.get(["levelState"]);
    const state = applyGrowthMinutes(data.levelState || defaultLevelState(), minutes);
    await chrome.storage.local.set({ levelState: state });
  }
}

async function syncEndorsedTab(tabId) {
  await flushEndorsedTick();
  await refreshEndorsedTab(tabId);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.sitePolicy || changes.blockedSites)) {
    loadSitePolicy();
  }
  if (area === "local" && changes.commitmentLock) {
    commitmentLock = changes.commitmentLock.newValue || null;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "gate-check") {
    Promise.all([
      getDailyStats(),
      loadSitePolicy(),
      getLevelState(),
      chrome.storage.sync.get(["gateSettings"])
    ]).then(async ([stats, , levelPack, gsData]) => {
      const gateSettings = { ...DEFAULT_GATE_SETTINGS, ...(gsData.gateSettings || {}) };
      const host = hostFromUrl(message.targetUrl || "");
      const budget = budgetStatusForHost(stats, host);
      const mods = adaptiveModifiers(levelPack.state, levelPack.settings);
      sendResponse({
        ok: !budget.exceeded,
        reason: budget.exceeded ? "budget" : "ok",
        budgetScope: budget.scope,
        budgetHost: budget.host,
        dailyUsed: budget.scope === "host" ? budget.used : budget.globalUsed,
        dailyLimit: budget.scope === "host" ? budget.limit : budget.globalLimit,
        globalUsed: budget.globalUsed ?? stats.completions,
        globalLimit: budget.globalLimit ?? 0,
        budgetEnabled: sitePolicy.budget?.mode === "budget",
        budgetMode: sitePolicy.budget?.mode,
        budgetPolicyScope: sitePolicy.budget?.scope,
        assistantMode: detectAssistantMode(sitePolicy, gateSettings),
        hostUsed: budget.hostUsed ?? 0,
        hostLimit: budget.hostLimit ?? 0,
        frictionBonus: frictionBonusSeconds(stats, lockSettings),
        lockActive: isLockActive(commitmentLock),
        lockRemaining: lockRemainingMs(commitmentLock),
        level: levelPack.snapshot,
        adaptive: mods,
        endorsed: levelPack.goals
      });
    });
    return true;
  }

  if (message.type === "gate-complete") {
    const { tabId, targetUrl } = message;
    Promise.all([getDailyStats()]).then(async ([stats]) => {
      const host = hostFromUrl(targetUrl);
      const updated = recordCompletion(stats, host, sitePolicy.blocked);
      await saveDailyStats(updated);
      if (host) {
        if (!sessionAllow.has(tabId)) sessionAllow.set(tabId, new Set());
        sessionAllow.get(tabId).add(host);
      }
      chrome.tabs.update(tabId, { url: targetUrl });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "gate-abort") {
    const { tabId } = message;
    sessionAllow.delete(tabId);
    chrome.tabs.update(tabId, { url: "about:blank" });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "gate-log") {
    appendLog(message.entry)
      .then(() => recordLevelOutcome(message.entry.outcome))
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "get-logs") {
    chrome.storage.local.get(["gateLogs"]).then((data) => {
      sendResponse({ logs: data.gateLogs || [] });
    });
    return true;
  }

  if (message.type === "clear-logs") {
    chrome.storage.local.set({ gateLogs: [] }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "get-lock-state") {
    Promise.all([loadLockState(), getDailyStats(), loadSitePolicy(), chrome.storage.sync.get(["gateSettings"])]).then(
      ([, stats, , gsData]) => {
        sendResponse({
          lock: commitmentLock,
          lockActive: isLockActive(commitmentLock),
          remaining: lockRemainingMs(commitmentLock),
          lockSettings,
          dailyStats: stats,
          sitePolicy,
          gateSettings: { ...DEFAULT_GATE_SETTINGS, ...(gsData.gateSettings || {}) }
        });
      }
    );
    return true;
  }

  if (message.type === "get-site-policy") {
    loadSitePolicy().then(() => sendResponse({ sitePolicy }));
    return true;
  }

  if (message.type === "save-site-policy") {
    Promise.all([
      chrome.storage.sync.get(["sitePolicy"]),
      loadLockState()
    ]).then(async ([data]) => {
      const prev = normalizeSitePolicy(data.sitePolicy, null);
      const next = normalizeSitePolicy(message.policy, null);
      const check = validateSitePolicySave(prev, next, commitmentLock);
      if (!check.ok) {
        sendResponse(check);
        return;
      }
      sitePolicy = next;
      blockedHosts = blockedHostsFromPolicy(sitePolicy);
      await chrome.storage.sync.set({ sitePolicy });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "activate-lock") {
    const { durationMs, witnessPhrase, roundLimitFloor, lockSettings: ls } = message;
    hashWitness(witnessPhrase || "").then(async (hash) => {
      const data = await chrome.storage.sync.get(["gateSettings"]);
      const gs = data.gateSettings || DEFAULT_GATE_SETTINGS;
      await loadSitePolicy();
      commitmentLock = {
        active: true,
        lockedAt: Date.now(),
        until: Date.now() + durationMs,
        witnessHash: hash,
        roundLimitFloor: roundLimitFloor || gs.questionRoundLimit || 0,
        failedAttempts: 0,
        cooldownUntil: 0,
        budgetSnapshot: snapshotBudgetPolicy(sitePolicy)
      };
      if (ls) lockSettings = { ...lockSettings, ...ls };
      await chrome.storage.local.set({ commitmentLock, lockSettings });
      sendResponse({ ok: true, lock: commitmentLock });
    });
    return true;
  }

  if (message.type === "unlock-lock") {
    loadLockState().then(async () => {
      if (!isLockActive(commitmentLock)) {
        sendResponse({ ok: true, alreadyFree: true });
        return;
      }
      if (Date.now() < (commitmentLock.cooldownUntil || 0)) {
        sendResponse({
          ok: false,
          reason: "cooldown",
          waitMs: commitmentLock.cooldownUntil - Date.now()
        });
        return;
      }
      const valid = await verifyWitness(message.witnessPhrase || "", commitmentLock.witnessHash);
      if (!valid) {
        commitmentLock.failedAttempts = (commitmentLock.failedAttempts || 0) + 1;
        if (commitmentLock.failedAttempts >= 3) {
          commitmentLock.cooldownUntil = Date.now() + 15 * 60 * 1000;
          commitmentLock.failedAttempts = 0;
        }
        await chrome.storage.local.set({ commitmentLock });
        sendResponse({ ok: false, reason: "wrong-witness" });
        return;
      }
      commitmentLock = { ...commitmentLock, active: false, unlockedAt: Date.now() };
      await chrome.storage.local.set({ commitmentLock });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "save-sites") {
    sendResponse({ ok: false, reason: "Use save-site-policy" });
    return true;
  }

  if (message.type === "save-questions") {
    Promise.all([
      chrome.storage.sync.get(["questions", "gateSettings"]),
      loadLockState()
    ]).then(async ([data]) => {
      const gs = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
      const check = validateQuestionsSave(
        data.questions,
        message.questions,
        commitmentLock,
        message.roundLimit ?? gs.questionRoundLimit
      );
      if (!check.ok) {
        sendResponse(check);
        return;
      }
      await chrome.storage.sync.set({
        questions: message.questions,
        gateSettings: {
          ...gs,
          questionRoundLimit: message.roundLimit ?? gs.questionRoundLimit,
          questionRoundMode: message.roundMode ?? gs.questionRoundMode
        }
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "get-assistant-state") {
    Promise.all([loadSitePolicy(), chrome.storage.sync.get(["gateSettings"])]).then(
      ([, data]) => {
        const gs = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
        sendResponse({ mode: detectAssistantMode(sitePolicy, gs), sitePolicy, gateSettings: gs });
      }
    );
    return true;
  }

  if (message.type === "save-assistant-mode") {
    Promise.all([
      chrome.storage.sync.get(["sitePolicy", "gateSettings"]),
      loadLockState()
    ]).then(async ([data]) => {
      const prevPolicy = normalizeSitePolicy(data.sitePolicy, null);
      const prevGs = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
      const applied = applyAssistantMode(message.mode, prevPolicy, prevGs);

      const policyCheck = validateSitePolicySave(prevPolicy, applied.sitePolicy, commitmentLock);
      if (!policyCheck.ok) {
        sendResponse(policyCheck);
        return;
      }

      const gateCheck = validateGateSettingsSave(prevGs, applied.gateSettings, commitmentLock);
      if (!gateCheck.ok) {
        sendResponse(gateCheck);
        return;
      }

      sitePolicy = applied.sitePolicy;
      blockedHosts = blockedHostsFromPolicy(sitePolicy);
      await chrome.storage.sync.set({
        sitePolicy: applied.sitePolicy,
        gateSettings: applied.gateSettings
      });
      sendResponse({ ok: true, sitePolicy: applied.sitePolicy, gateSettings: applied.gateSettings });
    });
    return true;
  }

  if (message.type === "save-gate-settings") {
    Promise.all([chrome.storage.sync.get(["gateSettings"]), loadLockState()]).then(
      async ([data]) => {
        const prev = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
        const next = { ...prev, ...message.settings };
        const check = validateGateSettingsSave(prev, next, commitmentLock);
        if (!check.ok) {
          sendResponse(check);
          return;
        }
        await chrome.storage.sync.set({ gateSettings: next });
        sendResponse({ ok: true });
      }
    );
    return true;
  }

  if (message.type === "save-lock-settings") {
    lockSettings = { ...lockSettings, ...message.settings };
    chrome.storage.local.set({ lockSettings }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "get-level-state") {
    getLevelState().then((pack) => sendResponse(pack));
    return true;
  }

  if (message.type === "save-leveling-settings") {
    chrome.storage.local.get(["levelingSettings"]).then(async (data) => {
      const next = {
        ...DEFAULT_LEVELING_SETTINGS,
        ...(data.levelingSettings || {}),
        ...message.settings
      };
      await chrome.storage.local.set({ levelingSettings: next });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "reset-level-state") {
    chrome.storage.local.set({ levelState: defaultLevelState() }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "save-locale") {
    chrome.storage.sync.get(["gateSettings"]).then(async (data) => {
      const gs = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
      gs.locale = message.locale ?? gs.locale;
      await chrome.storage.sync.set({ gateSettings: gs });
      if (message.overrides) {
        await chrome.storage.sync.set({ localeOverrides: message.overrides });
      }
      sendResponse({ ok: true });
    });
    return true;
  }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (shouldIntercept(details)) redirectToGate(details.tabId, details.url);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  if (isGateUrl(details.url)) return;
  if (!details.url.startsWith("http")) return;
  if (isAllowedForTab(details.tabId, details.url)) return;
  if (hostMatchesBlocked(hostFromUrl(details.url))) {
    redirectToGate(details.tabId, details.url);
  }
  upsertEndorsedTab(details.tabId, details.url);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  syncEndorsedTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    refreshEndorsedTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  sessionAllow.delete(tabId);
  if (endorsedOpenTabs.has(tabId)) {
    flushEndorsedTick();
    endorsedOpenTabs.delete(tabId);
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

async function initDefaults() {
  await loadSitePolicy();
  await loadLockState();
  const data = await chrome.storage.sync.get(["questions", "gateSettings"]);
  if (!data.questions) await chrome.storage.sync.set({ questions: DEFAULT_QUESTIONS });
  if (!data.gateSettings) await chrome.storage.sync.set({ gateSettings: DEFAULT_GATE_SETTINGS });
  const local = await chrome.storage.local.get([
    "lockSettings",
    "levelState",
    "levelingSettings",
    "dailyStats",
    "endorsedDaily"
  ]);
  if (!local.lockSettings) await chrome.storage.local.set({ lockSettings: DEFAULT_LOCK_SETTINGS });
  if (!local.levelState) await chrome.storage.local.set({ levelState: defaultLevelState() });
  if (!local.levelingSettings) {
    await chrome.storage.local.set({ levelingSettings: DEFAULT_LEVELING_SETTINGS });
  }
  if (!local.dailyStats) await chrome.storage.local.set({ dailyStats: defaultDailyStats() });
  if (!local.endorsedDaily) await chrome.storage.local.set({ endorsedDaily: defaultEndorsedDaily() });
  await scanAllEndorsedTabs();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "site-gate-daily") getLevelState();
  if (alarm.name === "site-gate-endorsed") flushEndorsedTick();
});

chrome.runtime.onInstalled.addListener(async () => {
  await initDefaults();
  chrome.alarms.create("site-gate-daily", { periodInMinutes: 60 });
  chrome.alarms.create("site-gate-endorsed", { periodInMinutes: ENDORSED_TICK_MINUTES });
});
initDefaults();
