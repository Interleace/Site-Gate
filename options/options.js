const blockedSitesEl = document.getElementById("blocked-sites");
const endorsedSitesEl = document.getElementById("endorsed-sites");
const lockHostBudgetListEl = document.getElementById("lock-host-budget-list");
const questionsEditorEl = document.getElementById("questions-editor");
const logViewerEl = document.getElementById("log-viewer");
const roundLimitEl = document.getElementById("question-round-limit");
const roundModeEl = document.getElementById("question-round-mode");
const themePickerEl = document.getElementById("theme-picker");
const themePreviewEl = document.getElementById("theme-preview");

let questionsDraft = [];
let selectedTheme = DEFAULT_GATE_SETTINGS.theme;
let lockCountdownTimer = null;
let lastNewQuestionId = null;

function qtypeLabel(type) {
  if (typeof t === "function") {
    const key = `qtype.${type}`;
    const label = t(key);
    if (label !== key) return label;
  }
  return QUESTION_TYPES.find((x) => x.id === type)?.label ?? type;
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("tab--active", t.dataset.tab === name);
  });
  document.querySelectorAll(".panel").forEach((p) => {
    const active = p.id === `panel-${name}`;
    p.classList.toggle("panel--active", active);
    p.hidden = !active;
  });
  if (name === "logs") renderLogs();
  if (name === "lock") refreshLockPanel();
  if (name === "justdoit") refreshAssistantPanel();
  if (typeof updateAssistantBanner === "function") updateAssistantBanner();
}
window.switchTab = switchTab;

function toast(message, type = "info") {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--visible"));
  setTimeout(() => {
    el.classList.remove("toast--visible");
    setTimeout(() => el.remove(), 280);
  }, 3400);
}

function setStatus(id, text, isError = false) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.style.color = isError ? "#8a2020" : "#306030";
  if (text) setTimeout(() => { el.textContent = ""; }, 3500);
}

function updateQuestionStats() {
  const stats = questionStats(questionsDraft);
  const limit = parseInt(roundLimitEl.value, 10) || 0;
  const gateRound = limit <= 0 ? stats.active : Math.min(limit, stats.active);

  document.getElementById("q-total").textContent = String(stats.total);
  document.getElementById("q-active").textContent = String(stats.active);
  document.getElementById("q-inactive").textContent = String(stats.inactive);
  document.getElementById("q-gate-round").textContent = String(gateRound);

  roundLimitEl.max = Math.max(stats.active, 99);
}

async function loadSites() {
  const res = await chrome.runtime.sendMessage({ type: "get-site-policy" });
  const policy = normalizeSitePolicy(res?.sitePolicy, null);
  blockedSitesEl.value = formatBlockedLines(policy.blocked);
  endorsedSitesEl.value = formatEndorsedLines(policy.endorsed);
}

document.getElementById("btn-save-sites").addEventListener("click", async () => {
  const current = await chrome.runtime.sendMessage({ type: "get-site-policy" });
  const prev = normalizeSitePolicy(current?.sitePolicy, null);
  const policy = {
    budget: prev.budget,
    blocked: parseBlockedLines(blockedSitesEl.value),
    endorsed: parseEndorsedLines(endorsedSitesEl.value)
  };
  const res = await chrome.runtime.sendMessage({ type: "save-site-policy", policy });
  if (!res?.ok) {
    toast(res?.reason || t("toast.blocked"), "error");
    setStatus("status-sites", res?.reason || t("toast.blocked"), true);
    return;
  }
  toast(t("sites.saved", { n: policy.blocked.length }), "success");
  setStatus("status-sites", t("sites.saved", { n: policy.blocked.length }));
});

async function loadGateSettings() {
  const data = await chrome.storage.sync.get(["gateSettings"]);
  const gs = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
  roundLimitEl.value = gs.questionRoundLimit ?? 0;
  roundModeEl.value = gs.questionRoundMode ?? "ordered";
  selectedTheme = gs.theme ?? "ember";
}

async function loadQuestions() {
  await loadGateSettings();
  const data = await chrome.storage.sync.get(["questions"]);
  questionsDraft = normalizeQuestions(data.questions);
  questionsDraft.sort((a, b) => a.order - b.order);
  renderQuestionsEditor();
  updateQuestionStats();
}

roundLimitEl.addEventListener("input", updateQuestionStats);
roundModeEl.addEventListener("change", updateQuestionStats);

function fieldsForType(type) {
  switch (type) {
    case "text":
      return ["minChars", "minWords", "requireDuration"];
    case "wait":
      return ["seconds"];
    case "phrase":
      return ["phrase"];
    case "confirm":
      return ["steps"];
    default:
      return [];
  }
}

function renderQuestionsEditor() {
  clearNode(questionsEditorEl);
  questionsDraft.forEach((q, index) => {
    const card = document.createElement("article");
    card.className =
      "q-card" +
      (q.active ? "" : " q-card--inactive") +
      (q.id === lastNewQuestionId ? " q-card--new" : "");
    card.dataset.id = q.id;

    const typeLabel = qtypeLabel(q.type);

    const head = el("div", "q-card__head");
    const order = el("div", "q-card__order");
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.dataset.move = "up";
    upBtn.title = "Nach oben";
    upBtn.disabled = index === 0;
    upBtn.textContent = "↑";
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.dataset.move = "down";
    downBtn.title = "Nach unten";
    downBtn.disabled = index === questionsDraft.length - 1;
    downBtn.textContent = "↓";
    order.append(upBtn, downBtn);

    const meta = el("div", "q-card__meta");
    meta.appendChild(el("span", "q-card__type", typeLabel));

    const activeLabel = document.createElement("label");
    activeLabel.className = "q-active";
    const activeCb = document.createElement("input");
    activeCb.type = "checkbox";
    activeCb.dataset.field = "active";
    activeCb.checked = !!q.active;
    activeLabel.append(activeCb, document.createTextNode(" aktiv"));

    const typeSelect = document.createElement("select");
    typeSelect.dataset.field = "type";
    typeSelect.className = "q-type-select";
    QUESTION_TYPES.forEach((qt) => {
      const opt = document.createElement("option");
      opt.value = qt.id;
      opt.textContent = qt.label;
      opt.selected = qt.id === q.type;
      typeSelect.appendChild(opt);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "q-delete";
    delBtn.dataset.delete = "";
    delBtn.textContent = "Löschen";

    meta.append(activeLabel, typeSelect, delBtn);
    head.append(order, meta);

    const body = el("div", "q-card__body");
    const labelRow = el("div", "q-row");
    const labelLbl = document.createElement("label");
    labelLbl.textContent = "Frage";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.dataset.field = "label";
    labelInput.value = q.label || "";
    labelRow.append(labelLbl, labelInput);

    const hintRow = el("div", "q-row");
    const hintLbl = document.createElement("label");
    hintLbl.textContent = "Hinweis";
    const hintInput = document.createElement("input");
    hintInput.type = "text";
    hintInput.dataset.field = "hint";
    hintInput.value = q.hint || "";
    hintRow.append(hintLbl, hintInput);

    const extra = el("div", "q-extra");
    body.append(labelRow, hintRow, extra);
    card.append(head, body);

    renderExtraFields(extra, q);
    wireQuestionCard(card, q, index);
    questionsEditorEl.appendChild(card);
  });
  updateQuestionStats();
}

function scrollToQuestion(id) {
  const card = questionsEditorEl.querySelector(`[data-id="${id}"]`);
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
  card?.querySelector('[data-field="label"]')?.focus();
}

function renderExtraFields(container, q) {
  clearNode(container);
  const fields = fieldsForType(q.type);

  if (fields.includes("minChars") || fields.includes("minWords")) {
    const row = el("div", "q-row q-row--inline");
    if (fields.includes("minChars")) {
      const box = document.createElement("div");
      const lbl = document.createElement("label");
      lbl.textContent = "Min. Zeichen";
      const input = document.createElement("input");
      input.type = "number";
      input.dataset.field = "minChars";
      input.min = "0";
      input.value = String(q.minChars ?? 40);
      box.append(lbl, input);
      row.appendChild(box);
    }
    if (fields.includes("minWords")) {
      const box = document.createElement("div");
      const lbl = document.createElement("label");
      lbl.textContent = "Min. Wörter (>2 Buchst.)";
      const input = document.createElement("input");
      input.type = "number";
      input.dataset.field = "minWords";
      input.min = "0";
      input.value = String(q.minWords ?? 0);
      box.append(lbl, input);
      row.appendChild(box);
    }
    container.appendChild(row);
  }

  if (fields.includes("requireDuration")) {
    const row = document.createElement("label");
    row.className = "q-active";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.field = "requireDuration";
    cb.checked = !!q.requireDuration;
    row.append(cb, document.createTextNode(" Dauer verlangen"));
    container.appendChild(row);
  }

  if (fields.includes("seconds")) {
    const row = el("div", "q-row");
    const lbl = document.createElement("label");
    lbl.textContent = "Sekunden";
    const input = document.createElement("input");
    input.type = "number";
    input.dataset.field = "seconds";
    input.min = "1";
    input.max = "300";
    input.value = String(q.seconds ?? 25);
    row.append(lbl, input);
    container.appendChild(row);
  }

  if (fields.includes("phrase")) {
    const row = el("div", "q-row");
    const lbl = document.createElement("label");
    lbl.textContent = "Satz zum Abtippen";
    const ta = document.createElement("textarea");
    ta.dataset.field = "phrase";
    ta.rows = 2;
    ta.textContent = q.phrase || "";
    row.append(lbl, ta);
    container.appendChild(row);
  }

  if (fields.includes("steps")) {
    const row = el("div", "q-row");
    const lbl = document.createElement("label");
    lbl.textContent = "Anzahl Bestätigungen";
    const input = document.createElement("input");
    input.type = "number";
    input.dataset.field = "steps";
    input.min = "1";
    input.max = "10";
    input.value = String(q.steps ?? 3);
    row.append(lbl, input);
    container.appendChild(row);
  }
}

function wireQuestionCard(card, q, index) {
  card.querySelector('[data-field="active"]').addEventListener("change", (e) => {
    q.active = e.target.checked;
    card.classList.toggle("q-card--inactive", !q.active);
    updateQuestionStats();
  });

  card.querySelector('[data-field="type"]').addEventListener("change", (e) => {
    q.type = e.target.value;
    renderExtraFields(card.querySelector(".q-extra"), q);
  });

  card.querySelectorAll("[data-field]").forEach((el) => {
    if (el.dataset.field === "active" || el.dataset.field === "type") return;
    const field = el.dataset.field;
    const apply = () => {
      if (field === "requireDuration") q[field] = el.checked;
      else if (["minChars", "minWords", "seconds", "steps"].includes(field)) {
        q[field] = parseInt(el.value, 10) || 0;
      } else q[field] = el.value;
    };
    el.addEventListener("input", apply);
    el.addEventListener("change", apply);
  });

  card.querySelector('[data-move="up"]')?.addEventListener("click", () => moveQuestion(index, -1));
  card.querySelector('[data-move="down"]')?.addEventListener("click", () => moveQuestion(index, 1));
  card.querySelector("[data-delete]")?.addEventListener("click", () => {
    questionsDraft.splice(index, 1);
    reindexOrders();
    renderQuestionsEditor();
    toast(t("questions.toast.deleted"), "warn");
  });
}

function moveQuestion(index, delta) {
  const j = index + delta;
  if (j < 0 || j >= questionsDraft.length) return;
  [questionsDraft[index], questionsDraft[j]] = [questionsDraft[j], questionsDraft[index]];
  reindexOrders();
  renderQuestionsEditor();
}

function reindexOrders() {
  questionsDraft.forEach((q, i) => { q.order = i; });
}

document.getElementById("btn-add-question").addEventListener("click", () => {
  const id = newQuestionId();
  lastNewQuestionId = id;
  questionsDraft.push({
    id,
    type: "text",
    active: true,
    order: questionsDraft.length,
    label: "Neue Frage",
    hint: "",
    minChars: 40,
    minWords: 0
  });
  renderQuestionsEditor();
  scrollToQuestion(id);
  toast(t("questions.toast.new"), "success");
  setTimeout(() => { lastNewQuestionId = null; }, 1500);
});

document.getElementById("btn-reset-questions").addEventListener("click", async () => {
  if (!confirm("Alle Fragen auf Standard zurücksetzen?")) return;
  questionsDraft = structuredClone(DEFAULT_QUESTIONS);
  reindexOrders();
  renderQuestionsEditor();
  toast(t("questions.toast.reset"), "warn");
});

document.getElementById("btn-save-questions").addEventListener("click", async () => {
  collectQuestionsFromEditor();
  reindexOrders();
  const roundLimit = parseInt(roundLimitEl.value, 10) || 0;
  const res = await chrome.runtime.sendMessage({
    type: "save-questions",
    questions: questionsDraft,
    roundLimit,
    roundMode: roundModeEl.value
  });
  if (!res?.ok) {
    toast(res?.reason || "Speichern blockiert.", "error");
    setStatus("status-questions", res?.reason || "Blockiert.", true);
    return;
  }
  const stats = questionStats(questionsDraft);
  toast(`${stats.active} aktive Frage(n) gespeichert.`, "success");
  setStatus("status-questions", "Gespeichert.");
  updateQuestionStats();
});

function collectQuestionsFromEditor() {
  questionsEditorEl.querySelectorAll(".q-card").forEach((card) => {
    const q = questionsDraft.find((x) => x.id === card.dataset.id);
    if (!q) return;
    q.active = card.querySelector('[data-field="active"]').checked;
    q.type = card.querySelector('[data-field="type"]').value;
    q.label = card.querySelector('[data-field="label"]').value;
    q.hint = card.querySelector('[data-field="hint"]').value;
    card.querySelectorAll(".q-extra [data-field]").forEach((el) => {
      const field = el.dataset.field;
      if (field === "requireDuration") q[field] = el.checked;
      else if (["minChars", "minWords", "seconds", "steps"].includes(field)) {
        q[field] = parseInt(el.value, 10) || 0;
      } else q[field] = el.value;
    });
  });
}

function renderThemePicker() {
  clearNode(themePickerEl);
  themeList().forEach((theme) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className =
      "theme-card" + (theme.id === selectedTheme ? " theme-card--selected" : "");
    const swatch = el("div", "theme-card__swatch");
    swatch.style.background = theme.vars["--gate-bg"];
    swatch.style.borderBottom = `4px solid ${theme.vars["--gate-accent-strong"]}`;
    card.append(
      swatch,
      el("div", "theme-card__name", theme.label),
      el("div", "theme-card__desc", theme.desc)
    );
    card.addEventListener("click", () => {
      selectedTheme = theme.id;
      renderThemePicker();
      refreshThemePreview();
    });
    themePickerEl.appendChild(card);
  });
}

function refreshThemePreview() {
  if (!themePreviewEl) return;
  themePreviewEl.src = `../gate/gate.html?target=https%3A%2F%2Fvorschau.local&preview=1&theme=${selectedTheme}`;
}

document.getElementById("btn-save-theme").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({
    type: "save-gate-settings",
    settings: { theme: selectedTheme }
  });
  if (!res?.ok) {
    toast(res?.reason || "Theme blockiert.", "error");
    return;
  }
  toast(`Theme „${GATE_THEMES[selectedTheme]?.label || selectedTheme}" gespeichert.`, "success");
  setStatus("status-theme", "Gespeichert.");
  refreshThemePreview();
});

async function loadThemePanel() {
  await loadGateSettings();
  renderThemePicker();
  refreshThemePreview();
}

const lockDurationEl = document.getElementById("lock-duration");
LOCK_DURATIONS.forEach((d) => {
  const opt = document.createElement("option");
  opt.value = String(d.ms);
  opt.textContent = d.label;
  lockDurationEl.appendChild(opt);
});
lockDurationEl.value = String(LOCK_DURATIONS[2].ms);

function selectedBudgetMode() {
  return document.querySelector('input[name="budget-mode"]:checked')?.value || "budget";
}

function selectedBudgetScope() {
  return document.querySelector('input[name="budget-scope"]:checked')?.value || "list";
}

function updateBudgetModeUi() {
  const mode = selectedBudgetMode();
  const scope = selectedBudgetScope();
  const sub = document.getElementById("budget-submode-panel");
  const listPanel = document.getElementById("budget-list-panel");
  const hostDetails = document.getElementById("lock-host-budgets-details");
  const effect = document.getElementById("budget-mode-effect");
  const guarded = assistantGuardsAdvancedBudget(window.currentAssistantMode);

  if (sub) sub.hidden = mode !== "budget" || guarded;
  if (listPanel) listPanel.hidden = mode !== "budget" || scope !== "list" || guarded;
  if (hostDetails) {
    const showHost = mode === "budget" && scope === "per-site" && !guarded;
    hostDetails.open = showHost;
    hostDetails.style.opacity = showHost ? "1" : "0.55";
  }

  document.querySelectorAll('input[name="budget-mode"], input[name="budget-scope"], #lock-budget')
    .forEach((el) => {
      el.disabled = guarded;
    });

  lockHostBudgetListEl?.querySelectorAll("input").forEach((el) => {
    el.disabled = guarded || mode !== "budget" || scope !== "per-site";
  });

  if (effect) {
    if (guarded) {
      effect.textContent = t("assistant.lockBudgetGuarded");
    } else {
      let key = "lock.effectStatic";
      if (mode === "budget") {
        key = scope === "per-site" ? "lock.effectBudgetPerSite" : "lock.effectBudgetList";
      }
      effect.textContent = t(key);
    }
  }
}

function applyBudgetUi(sitePolicy) {
  const cfg = sitePolicy?.budget || DEFAULT_BUDGET_CONFIG;
  const mode = cfg.mode === "static" ? "static" : "budget";
  document.getElementById(`budget-mode-${mode === "static" ? "static" : "budget"}`).checked = true;
  const scope = cfg.scope === "per-site" ? "per-site" : "list";
  document.getElementById(scope === "per-site" ? "budget-scope-persite" : "budget-scope-list").checked =
    true;
  document.getElementById("lock-budget").value = cfg.listDailyLimit ?? 0;
  updateBudgetModeUi();
}

function collectBudgetPolicy(basePolicy) {
  const policy = normalizeSitePolicy(basePolicy, null);
  const mode = selectedBudgetMode();
  const scope = selectedBudgetScope();
  policy.budget = {
    mode,
    scope: mode === "budget" ? scope : "list",
    listDailyLimit: parseInt(document.getElementById("lock-budget").value, 10) || 0
  };
  const budgetByHost = new Map();
  lockHostBudgetListEl?.querySelectorAll("[data-host-budget]").forEach((el) => {
    const raw = parseInt(el.value, 10);
    budgetByHost.set(
      normalizeHost(el.dataset.hostBudget),
      Number.isNaN(raw) || raw <= 0 ? null : raw
    );
  });
  policy.blocked = policy.blocked.map((b) => ({
    ...b,
    dailyBudget: budgetByHost.has(normalizeHost(b.host))
      ? budgetByHost.get(normalizeHost(b.host))
      : b.dailyBudget
  }));
  return policy;
}

function renderLockHostBudgets(sitePolicy, dailyStats) {
  if (!lockHostBudgetListEl) return;
  const blocked = sitePolicy?.blocked || [];
  clearNode(lockHostBudgetListEl);
  if (blocked.length === 0) {
    lockHostBudgetListEl.appendChild(el("p", "hint", t("lock.hostBudgetsEmpty")));
    return;
  }
  blocked.forEach((b) => {
    const cap = b.dailyBudget ?? 0;
    const used = hostCompletions(dailyStats || {}, b.host, sitePolicy.blocked);
    const usedLabel =
      cap > 0 ? t("lock.hostUsed", { used, limit: cap }) : t("lock.hostUsedOpen", { used });
    const row = el("div", "lock-host-row");
    row.appendChild(el("span", "lock-host-row__host", b.host));
    const input = document.createElement("input");
    input.type = "number";
    input.className = "lock-host-row__input";
    input.min = "0";
    input.max = "99";
    input.dataset.hostBudget = b.host;
    input.value = String(cap);
    input.setAttribute("aria-label", b.host);
    row.append(input, el("span", "lock-host-row__used", usedLabel));
    lockHostBudgetListEl.appendChild(row);
  });
}

async function saveBudgetPolicy() {
  const current = await chrome.runtime.sendMessage({ type: "get-site-policy" });
  const policy = collectBudgetPolicy(current?.sitePolicy);
  const res = await chrome.runtime.sendMessage({ type: "save-site-policy", policy });
  if (!res?.ok) {
    toast(res?.reason || t("toast.blocked"), "error");
    setStatus("status-budget", res?.reason || t("toast.blocked"), true);
    return false;
  }
  toast(t("lock.budgetSaved"), "success");
  setStatus("status-budget", t("lock.budgetSaved"));
  return true;
}

document.getElementById("btn-save-budget")?.addEventListener("click", async () => {
  const ok = await saveBudgetPolicy();
  if (ok) {
    const state = await chrome.runtime.sendMessage({ type: "get-lock-state" });
    renderLockHostBudgets(state?.sitePolicy, state?.dailyStats);
    updateLockCountdown(state?.remaining || 0, state?.dailyStats, state?.sitePolicy);
  }
});

async function refreshLockPanel() {
  const state = await chrome.runtime.sendMessage({ type: "get-lock-state" });
  const statusEl = document.getElementById("lock-status");
  const activePanel = document.getElementById("lock-active-panel");
  const inactivePanel = document.getElementById("lock-inactive-panel");

  if (state?.sitePolicy) {
    window.currentAssistantMode = detectAssistantMode(
      state.sitePolicy,
      state.gateSettings || DEFAULT_GATE_SETTINGS
    );
    applyBudgetUi(state.sitePolicy);
    renderLockHostBudgets(state.sitePolicy, state.dailyStats);
    const saveBudgetBtn = document.getElementById("btn-save-budget");
    if (saveBudgetBtn) {
      saveBudgetBtn.disabled = assistantGuardsAdvancedBudget(window.currentAssistantMode);
    }
  }
  if (state?.lockSettings) {
    document.getElementById("lock-friction").value = state.lockSettings.frictionStackSeconds ?? 10;
    document.getElementById("lock-friction-cap").value = state.lockSettings.frictionStackCap ?? 60;
  }

  if (state?.lockActive) {
    clearNode(statusEl);
    statusEl.appendChild(
      el("div", "lock-banner lock-banner--active", "🔒 Verpflichtungssperre aktiv — Schutz vor impulsivem Lockern.")
    );
    activePanel.hidden = false;
    inactivePanel.hidden = true;
    updateLockCountdown(state.remaining, state.dailyStats, state.sitePolicy);
    if (lockCountdownTimer) clearInterval(lockCountdownTimer);
    lockCountdownTimer = setInterval(async () => {
      const s = await chrome.runtime.sendMessage({ type: "get-lock-state" });
      if (!s?.lockActive) {
        clearInterval(lockCountdownTimer);
        refreshLockPanel();
        return;
      }
      updateLockCountdown(s.remaining, s.dailyStats, s.sitePolicy);
    }, 30000);
  } else {
    if (lockCountdownTimer) clearInterval(lockCountdownTimer);
    clearNode(statusEl);
    statusEl.appendChild(
      el("div", "lock-banner lock-banner--free", "Offen — du kannst Einstellungen frei ändern.")
    );
    activePanel.hidden = true;
    inactivePanel.hidden = false;
  }
}

function updateLockCountdown(remaining, dailyStats, sitePolicy) {
  document.getElementById("lock-countdown").textContent =
    t("lock.remaining", { time: formatDuration(remaining) });
  const cfg = sitePolicy?.budget || DEFAULT_BUDGET_CONFIG;
  const used = dailyStats?.completions ?? 0;
  let dailyText;
  if (cfg.mode === "static") {
    dailyText = t("lock.dailyStatic");
  } else if (cfg.scope === "per-site") {
    dailyText = t("lock.dailyPerSiteOnly");
  } else if (cfg.listDailyLimit > 0) {
    dailyText = t("lock.daily", { used, limit: cfg.listDailyLimit });
  } else {
    dailyText = t("lock.dailyUnlimited");
  }
  document.getElementById("lock-daily").textContent = dailyText;
}

document.querySelectorAll('input[name="budget-mode"], input[name="budget-scope"]').forEach((el) => {
  el.addEventListener("change", updateBudgetModeUi);
});

document.getElementById("btn-activate-lock").addEventListener("click", async () => {
  if (!document.getElementById("lock-confirm").checked) {
    toast("Bitte Bestätigung ankreuzen.", "warn");
    return;
  }
  const witness = document.getElementById("lock-witness").value.trim();
  if (witness.length < 6) {
    toast("Zeuge-Satz mindestens 6 Zeichen.", "warn");
    return;
  }
  const durationMs = parseInt(lockDurationEl.value, 10);
  const roundLimit = parseInt(roundLimitEl.value, 10) || 0;
  const lockSettings = {
    frictionStackSeconds: parseInt(document.getElementById("lock-friction").value, 10) || 0,
    frictionStackCap: parseInt(document.getElementById("lock-friction-cap").value, 10) || 0
  };
  await chrome.runtime.sendMessage({ type: "save-lock-settings", settings: lockSettings });
  const current = await chrome.runtime.sendMessage({ type: "get-site-policy" });
  const budgetPolicy = collectBudgetPolicy(current?.sitePolicy);
  const budgetRes = await chrome.runtime.sendMessage({
    type: "save-site-policy",
    policy: budgetPolicy
  });
  if (!budgetRes?.ok) {
    toast(budgetRes?.reason || t("toast.blocked"), "error");
    return;
  }
  const res = await chrome.runtime.sendMessage({
    type: "activate-lock",
    durationMs,
    witnessPhrase: witness,
    roundLimitFloor: roundLimit,
    lockSettings
  });
  if (!res?.ok) {
    toast("Sperre konnte nicht aktiviert werden.", "error");
    return;
  }
  document.getElementById("lock-witness").value = "";
  document.getElementById("lock-confirm").checked = false;
  toast("Verpflichtungssperre aktiv — du bist geschützt.", "success");
  setStatus("status-lock", "Sperre aktiv.");
  refreshLockPanel();
});

document.getElementById("btn-unlock").addEventListener("click", async () => {
  const witness = document.getElementById("unlock-witness").value;
  const res = await chrome.runtime.sendMessage({
    type: "unlock-lock",
    witnessPhrase: witness
  });
  if (res?.reason === "cooldown") {
    toast(`Zu viele Fehlversuche — ${formatDuration(res.waitMs)} warten.`, "error");
    return;
  }
  if (!res?.ok) {
    toast("Zeuge falsch.", "error");
    return;
  }
  document.getElementById("unlock-witness").value = "";
  toast("Sperre aufgehoben.", "success");
  refreshLockPanel();
});

async function renderLogs() {
  const res = await chrome.runtime.sendMessage({ type: "get-logs" });
  const logs = res?.logs ?? [];
  clearNode(logViewerEl);

  if (logs.length === 0) {
    logViewerEl.appendChild(el("p", "log-empty", "Noch keine Einträge."));
    return;
  }

  logs.forEach((log) => {
    const entry = document.createElement("article");
    entry.className = "log-entry";
    const when = new Date(log.timestamp || log.finishedAt).toLocaleString("de-DE");
    const host = tryHost(log.targetUrl);
    const badgeClass =
      log.outcome === "completed" ? "log-badge--completed" : "log-badge--aborted";
    const badgeText =
      log.outcome === "completed"
        ? "durchgestanden"
        : log.outcome === "lock-unlock-failed"
          ? "Entsperrversuch"
          : "abgebrochen";

    const head = el("div", "log-entry__head");
    head.append(
      el("span", "log-entry__time", when),
      el("span", `log-badge ${badgeClass}`, badgeText),
      el("span", "log-entry__url", host || log.targetUrl || "—")
    );
    const body = el("div", "log-entry__body");
    entry.append(head, body);

    if (log.targetUrl) {
      const p = el("p", "hint");
      const strong = document.createElement("strong");
      strong.textContent = "Ziel:";
      p.append(strong, document.createTextNode(` ${log.targetUrl}`));
      body.appendChild(p);
    }
    if (log.answers?.length) {
      const dl = el("dl", "log-answer");
      log.answers.forEach((a) => {
        dl.appendChild(el("dt", null, a.label || a.questionId));
        dl.appendChild(el("dd", null, a.answer || "—"));
      });
      body.appendChild(dl);
    } else {
      body.appendChild(el("p", "hint", "Keine Antworten erfasst."));
    }

    head.addEventListener("click", () => {
      entry.classList.toggle("log-entry--open");
    });
    logViewerEl.appendChild(entry);
  });
}

document.getElementById("btn-refresh-logs").addEventListener("click", renderLogs);

document.getElementById("btn-clear-logs").addEventListener("click", async () => {
  if (!confirm("Gesamtes Protokoll unwiderruflich löschen?")) return;
  await chrome.runtime.sendMessage({ type: "clear-logs" });
  toast("Protokoll geleert.", "success");
  renderLogs();
});

document.getElementById("btn-export-logs").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "get-logs" });
  const blob = new Blob([JSON.stringify(res?.logs ?? [], null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `site-gate-log-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Export gestartet.", "success");
});

function tryHost(url) {
  try { return new URL(url).hostname; } catch { return null; }
}