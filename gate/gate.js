const params = new URLSearchParams(location.search);
const targetUrl = params.get("target");
const tabIdParam = params.get("tab");

const targetEl = document.getElementById("target-url");
const progressEl = document.getElementById("progress");
const questionEl = document.getElementById("question-area");
const errorEl = document.getElementById("error");
const nextBtn = document.getElementById("btn-next");
const abortBtn = document.getElementById("btn-abort");
const focusWarn = document.getElementById("focus-warn");
const metaEl = document.getElementById("gate-meta");
const streakEl = document.getElementById("gate-streak");
const gateMain = document.querySelector(".gate");

let tabId = null;
let roundIndex = 0;
let questions = [];
let runtimeById = new Map();
let focusLost = false;
let timerInterval = null;
let gateSettings = { ...DEFAULT_GATE_SETTINGS };
let gateCheck = null;

const sessionLog = {
  startedAt: Date.now(),
  targetUrl: targetUrl || "",
  answers: []
};

function errText(result) {
  if (!result) return "";
  if (result.key) return t(result.key, result.params);
  if (typeof result === "string") return result;
  return "";
}

function currentRound() {
  return questions[roundIndex];
}

function runtimeFor(question) {
  if (!runtimeById.has(question.id)) {
    runtimeById.set(question.id, createRuntime(question));
  }
  return runtimeById.get(question.id);
}

function showLevelStreak(level) {
  if (!streakEl || !level) return;
  streakEl.hidden = false;
  const parts = [t("gate.streak", { days: level.cleanStreakDays, level: level.level })];
  if (level.growthMinutesToday > 0) {
    parts.push(t("gate.growthToday", { minutes: level.growthMinutesToday }));
  }
  streakEl.textContent = parts.join(" · ");
}

function initProgress() {
  clearNode(progressEl);
  questions.forEach(() => {
    const dot = document.createElement("div");
    dot.className = "gate__dot";
    progressEl.appendChild(dot);
  });
  updateProgress();
}

function updateProgress() {
  progressEl.querySelectorAll(".gate__dot").forEach((dot, i) => {
    dot.classList.remove("gate__dot--done", "gate__dot--active");
    if (i < roundIndex) dot.classList.add("gate__dot--done");
    if (i === roundIndex) dot.classList.add("gate__dot--active");
  });
  if (metaEl) {
    metaEl.textContent = t("gate.meta", {
      current: Math.min(roundIndex + 1, questions.length),
      total: questions.length
    });
  }
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function showError(msg) {
  errorEl.textContent = msg || "";
}

function recordAnswer(question, answer) {
  const rt = runtimeFor(question);
  sessionLog.answers.push({
    questionId: question.id,
    type: question.type,
    label: question.label,
    answer: answerForLog(question, answer, rt),
    at: Date.now()
  });
}

function renderRound() {
  clearTimer();
  showError("");
  focusWarn.classList.remove("gate__focus-warn--visible");
  focusLost = false;

  if (roundIndex >= questions.length) {
    finishGate();
    return;
  }

  const round = currentRound();
  const rt = runtimeFor(round);
  updateProgress();
  clearNode(questionEl);

  const label = document.createElement("label");
  label.className = "gate__label";
  label.textContent =
    round.type === "math" ? `${round.label} ${rt.prompt}` : round.label;
  questionEl.appendChild(label);

  if (round.hint) {
    const hint = document.createElement("p");
    hint.className = "gate__hint";
    hint.textContent = round.hint;
    questionEl.appendChild(hint);
  }

  nextBtn.disabled = round.type === "wait" && rt.timerRemaining > 0;
  nextBtn.textContent =
    round.type === "confirm" ? t("gate.confirmBtn") : t("gate.next");

  if (round.type === "text") {
    const ta = document.createElement("textarea");
    ta.className = "gate__textarea";
    ta.id = "answer";
    ta.autocomplete = "off";
    ta.spellcheck = false;
    questionEl.appendChild(ta);

    const counter = document.createElement("div");
    counter.className = "gate__charcount";
    const minChars = round.minChars ?? 40;
    const updateCount = () => {
      counter.textContent = `${ta.value.length} / ${minChars}`;
      counter.classList.toggle("gate__charcount--ok", ta.value.length >= minChars);
    };
    ta.addEventListener("input", updateCount);
    updateCount();
    questionEl.appendChild(counter);
    ta.focus();
  } else if (round.type === "math") {
    const input = document.createElement("input");
    input.className = "gate__input";
    input.id = "answer";
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    questionEl.appendChild(input);
    input.focus();
  } else if (round.type === "wait") {
    const timerEl = document.createElement("div");
    timerEl.className = "gate__timer";
    timerEl.id = "timer";
    timerEl.textContent = String(rt.timerRemaining);
    questionEl.appendChild(timerEl);

    timerInterval = setInterval(() => {
      if (focusLost) return;
      rt.timerRemaining -= 1;
      timerEl.textContent = String(rt.timerRemaining);
      timerEl.classList.toggle("gate__timer--warn", rt.timerRemaining <= 5);
      if (rt.timerRemaining <= 0) {
        clearTimer();
        nextBtn.disabled = false;
        timerEl.textContent = t("gate.done");
      }
    }, 1000);
  } else if (round.type === "phrase") {
    const phraseBox = document.createElement("p");
    phraseBox.className = "gate__hint";
    phraseBox.style.fontStyle = "italic";
    phraseBox.textContent = `"${rt.phrase ?? round.phrase ?? ""}"`;
    questionEl.appendChild(phraseBox);

    const input = document.createElement("textarea");
    input.className = "gate__textarea";
    input.id = "answer";
    input.autocomplete = "off";
    input.spellcheck = false;
    questionEl.appendChild(input);
    input.focus();
  } else if (round.type === "confirm") {
    const steps = round.steps ?? 3;
    const p = document.createElement("p");
    p.className = "gate__hint";
    p.textContent = t("gate.confirmStep", {
      current: rt.confirmStep + 1,
      total: steps
    });
    questionEl.appendChild(p);
    nextBtn.disabled = false;
  }
}

function getAnswer() {
  const el = document.getElementById("answer");
  return el ? el.value : "";
}

function advanceRound() {
  const round = currentRound();
  const rt = runtimeFor(round);

  if (round.type === "confirm") {
    rt.confirmStep += 1;
    recordAnswer(round, String(rt.confirmStep));
    const steps = round.steps ?? 3;
    if (rt.confirmStep < steps) {
      renderRound();
      return;
    }
    roundIndex += 1;
    renderRound();
    return;
  }

  const answer = getAnswer();
  const result = validateAnswer(round, answer, rt);

  if (result) {
    showError(errText(result));
    if (round.type === "phrase" || round.type === "math") {
      const el = document.getElementById("answer");
      if (el) el.value = "";
    }
    if (result.regenerate) {
      Object.assign(rt, createRuntime(round));
      renderRound();
    }
    return;
  }

  recordAnswer(round, answer);
  roundIndex += 1;
  renderRound();
}

async function sendLog(outcome) {
  await chrome.runtime.sendMessage({
    type: "gate-log",
    entry: {
      outcome,
      targetUrl: sessionLog.targetUrl,
      startedAt: sessionLog.startedAt,
      finishedAt: Date.now(),
      answers: sessionLog.answers
    }
  });
}

async function finishGate() {
  nextBtn.disabled = true;
  abortBtn.disabled = true;
  clearNode(questionEl);
  questionEl.appendChild(el("p", "gate__label", t("gate.finish")));
  await sendLog("completed");
  await chrome.runtime.sendMessage({
    type: "gate-complete",
    tabId,
    targetUrl
  });
}

async function abortGate() {
  clearTimer();
  await sendLog("aborted");
  await chrome.runtime.sendMessage({ type: "gate-abort", tabId });
}

function onVisibilityChange() {
  const round = currentRound();
  if (!round || round.type !== "wait") return;
  const rt = runtimeFor(round);

  if (document.hidden && rt.timerRemaining > 0) {
    focusLost = true;
    focusWarn.classList.add("gate__focus-warn--visible");
    rt.timerRemaining = round.seconds ?? 25;
    const timerEl = document.getElementById("timer");
    if (timerEl) {
      timerEl.textContent = String(rt.timerRemaining);
      timerEl.classList.remove("gate__timer--warn");
    }
    nextBtn.disabled = true;
  } else if (!document.hidden) {
    focusLost = false;
    focusWarn.classList.remove("gate__focus-warn--visible");
  }
}

function blockPaste(e) {
  const round = currentRound();
  if (round?.type === "phrase" || round?.type === "text") {
    e.preventDefault();
    showError(t("gate.error.paste"));
  }
}

function showBudgetBlocked(check) {
  applyI18n();
  gateMain.classList.add("gate--budget");
  const isHost = check.budgetScope === "host";
  document.getElementById("gate-title").textContent = isHost
    ? t("gate.budget.hostTitle")
    : t("gate.budget.title");
  document.querySelector(".gate__eyebrow").textContent = isHost
    ? t("gate.budget.hostEyebrow", { host: check.budgetHost || "" })
    : t("gate.budget.eyebrow");
  targetEl.textContent = targetUrl;
  progressEl.hidden = true;
  nextBtn.hidden = true;
  const bodyKey = isHost ? "gate.budget.hostBody" : "gate.budget.body";
  clearNode(questionEl);
  const icon = el("div", "gate__budget-icon", "⏳");
  icon.setAttribute("aria-hidden", "true");
  questionEl.appendChild(icon);
  questionEl.appendChild(
    el("p", "gate__label", t(bodyKey, {
      used: check.dailyUsed,
      limit: check.dailyLimit,
      host: check.budgetHost || ""
    }))
  );
  questionEl.appendChild(el("p", "gate__hint", t("gate.budget.hint")));
  if (check.globalLimit > 0 && !isHost) {
    questionEl.appendChild(
      el("p", "gate__hint gate__hint--muted", t("gate.budget.globalNote", {
        used: check.globalUsed,
        limit: check.globalLimit
      }))
    );
  }
  abortBtn.textContent = t("gate.budget.abort");
  if (metaEl) metaEl.textContent = "";
}

async function loadQuestions(check) {
  const data = await chrome.storage.sync.get(["questions", "gateSettings"]);
  gateSettings = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
  applyGateTheme(gateSettings.theme);

  let pool = activeQuestions(normalizeQuestions(data.questions));
  if (pool.length === 0) pool = activeQuestions(structuredClone(DEFAULT_QUESTIONS));

  pool = selectQuestionsForRound(
    pool,
    gateSettings.questionRoundLimit,
    gateSettings.questionRoundMode
  );

  if (check?.frictionBonus) {
    pool = applyFrictionToQuestions(pool, check.frictionBonus);
  }

  if (check?.adaptive) {
    pool = applyLevelingToQuestions(pool, check.adaptive);
  }

  questions = pool;
}

async function init() {
  await loadI18nSettings();
  applyI18n();

  const isPreview = params.get("preview") === "1";
  if (isPreview) {
    const themeParam = params.get("theme");
    const data = await chrome.storage.sync.get(["gateSettings"]);
    applyGateTheme(
      themeParam || (data.gateSettings || DEFAULT_GATE_SETTINGS).theme
    );
    targetEl.textContent = params.get("target") || "Preview";
    document.querySelector(".gate__eyebrow").textContent = t("gate.previewEyebrow");
    if (metaEl) metaEl.textContent = t("gate.previewMeta");
    nextBtn.disabled = true;
    abortBtn.hidden = true;
    return;
  }

  if (!targetUrl || !targetUrl.startsWith("http")) {
    clearNode(document.body);
    const err = el("p", null, t("gate.invalid"));
    err.style.padding = "2rem";
    err.style.color = "#e06060";
    document.body.appendChild(err);
    return;
  }

  targetEl.textContent = targetUrl;
  sessionLog.targetUrl = targetUrl;

  tabId = tabIdParam ? parseInt(tabIdParam, 10) : null;
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id ?? null;
  }

  gateCheck = await chrome.runtime.sendMessage({ type: "gate-check" });

  const eyebrowEl = document.querySelector(".gate__eyebrow");
  if (eyebrowEl && gateCheck?.assistantMode) {
    const aKey = `gate.assistant.${gateCheck.assistantMode.replace(/-/g, "")}`;
    const aText = t(aKey);
    if (aText !== aKey) eyebrowEl.textContent = aText;
  }

  if (!gateCheck?.ok && gateCheck?.reason === "budget") {
    applyGateTheme(
      (await chrome.storage.sync.get(["gateSettings"])).gateSettings?.theme ||
        DEFAULT_GATE_SETTINGS.theme
    );
    showBudgetBlocked(gateCheck);
    abortBtn.addEventListener("click", abortGate);
    return;
  }

  if (gateCheck?.level) showLevelStreak(gateCheck.level);

  await loadQuestions(gateCheck);
  initProgress();
  renderRound();

  nextBtn.addEventListener("click", advanceRound);
  abortBtn.addEventListener("click", abortGate);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !nextBtn.disabled) {
      e.preventDefault();
      advanceRound();
    }
  });
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", onVisibilityChange);
  document.addEventListener("paste", blockPaste);

  history.pushState(null, "", location.href);
  window.addEventListener("popstate", () => {
    history.pushState(null, "", location.href);
  });
}

init();
