function progressStat(value, labelKey) {
  const stat = document.createElement("div");
  stat.className = "progress-stat";
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const span = document.createElement("span");
  span.dataset.i18n = labelKey;
  stat.append(strong, span);
  return stat;
}

function progressTrack(titleKey, stats) {
  const track = document.createElement("div");
  track.className = "progress-track";
  const head = document.createElement("h3");
  head.className = "progress-subhead";
  head.dataset.i18n = titleKey;
  const grid = el("div", "progress-grid");
  stats.forEach(([value, key]) => grid.appendChild(progressStat(value, key)));
  track.append(head, grid);
  return track;
}

async function refreshProgressPanel() {
  const dash = document.getElementById("progress-dashboard");
  if (!dash) return;
  const pack = await chrome.runtime.sendMessage({ type: "get-level-state" });
  const s = pack?.snapshot;
  clearNode(dash);
  if (!s) {
    dash.appendChild(el("p", "hint", "—"));
    return;
  }

  const hero = el("div", "progress-hero");
  hero.append(
    el("div", "progress-level", t("progress.level", { level: s.level })),
    el("div", "progress-tier", t("progress.tier", { name: t(s.tierKey) })),
    el(
      "div",
      "progress-xp",
      `${t("progress.totalXp", { xp: s.totalXp })} · ${t("progress.integrityXp", { xp: s.integrityXp })} · ${t("progress.growthXp", { xp: s.growthXp })}${s.xpToNext ? ` · +${s.xpToNext} → next` : ""}`
    )
  );

  const tracks = el("div", "progress-tracks");
  tracks.append(
    progressTrack("progress.integrityTrack", [
      [s.cleanStreakDays, "progress.cleanStreak"],
      [s.longestCleanStreak, "progress.longestClean"],
      [s.resistStreak, "progress.resistStreak"],
      [s.totalAborts, "progress.aborts"],
      [s.totalCompletes, "progress.completes"],
      [s.budgetCleanDays, "progress.budgetDays"]
    ]),
    progressTrack("progress.growthTrack", [
      [s.growthStreakDays || 0, "progress.growthStreak"],
      [s.longestGrowthStreak || 0, "progress.longestGrowth"],
      [s.growthMinutesToday || 0, "progress.focusToday"],
      [s.growthGoalDays || 0, "progress.goalDays"],
      [s.lockAdherenceDays, "progress.lockDays"]
    ])
  );

  dash.append(hero, tracks);

  const goals = pack?.goals;
  if (goals?.items?.length) {
    const endorsed = el("div", "progress-endorsed");
    const head = document.createElement("h3");
    head.className = "progress-subhead";
    head.dataset.i18n = "progress.endorsedTitle";
    const list = el("ul", "progress-goals");
    goals.items.forEach((g) => {
      const label = g.label || g.host;
      const pct = g.goal > 0 ? Math.min(100, Math.round((g.minutes / g.goal) * 100)) : 0;
      const li = document.createElement("li");
      li.className = "progress-goal" + (g.met ? " progress-goal--met" : "");
      const bar = el("span", "progress-goal__bar");
      const fill = document.createElement("span");
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      li.append(
        el("span", "progress-goal__label", label),
        bar,
        el("span", "progress-goal__stat", `${g.minutes}/${g.goal || "—"}m`)
      );
      list.appendChild(li);
    });
    endorsed.append(head, list);
    dash.appendChild(endorsed);
  }

  applyI18n(dash);
  const modeEl = document.getElementById("leveling-mode");
  if (modeEl && pack?.settings) modeEl.value = pack.settings.mode || "reflect";
}

function initLocalePanel() {
  const sel = document.getElementById("locale-select");
  if (!sel) return;
  clearNode(sel);
  SUPPORTED_LOCALES.forEach((loc) => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.native || t(loc.labelKey);
    sel.appendChild(opt);
  });
}

async function loadLocalePanel() {
  initLocalePanel();
  const data = await chrome.storage.sync.get(["gateSettings", "localeOverrides"]);
  const gs = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
  document.getElementById("locale-select").value = gs.locale || "auto";
  document.getElementById("locale-overrides").value = JSON.stringify(
    data.localeOverrides || {},
    null,
    2
  );
}

async function initBetaPanels() {
  await loadLocalePanel();
  await refreshProgressPanel();

  const origSwitch = window.switchTab;
  if (origSwitch) {
    window.switchTab = function (name) {
      origSwitch(name);
      if (name === "progress") refreshProgressPanel();
      if (name === "language") loadLocalePanel();
    };
  }

  document.getElementById("btn-save-leveling")?.addEventListener("click", async () => {
    const mode = document.getElementById("leveling-mode").value;
    await chrome.runtime.sendMessage({
      type: "save-leveling-settings",
      settings: { mode, enabled: mode !== "off" }
    });
    toast(t("progress.saved"), "success");
    refreshProgressPanel();
  });

  document.getElementById("btn-reset-level")?.addEventListener("click", async () => {
    if (!confirm(t("progress.resetConfirm"))) return;
    await chrome.runtime.sendMessage({ type: "reset-level-state" });
    toast(t("progress.saved"), "success");
    refreshProgressPanel();
  });

  document.getElementById("btn-save-locale")?.addEventListener("click", async () => {
    let overrides = {};
    const raw = document.getElementById("locale-overrides").value.trim();
    if (raw) {
      try {
        overrides = JSON.parse(raw);
      } catch {
        toast("Invalid JSON", "error");
        return;
      }
    }
    const locale = document.getElementById("locale-select").value;
    await chrome.runtime.sendMessage({ type: "save-locale", locale, overrides });
    await loadI18nSettings();
    applyI18n(document);
    toast(t("lang.saved"), "success");
    if (typeof renderQuestionsEditor === "function") renderQuestionsEditor();
  });

  document.getElementById("btn-export-locale")?.addEventListener("click", async () => {
    const data = await chrome.storage.sync.get(["localeOverrides", "gateSettings"]);
    const blob = new Blob(
      [JSON.stringify({ locale: data.gateSettings?.locale, overrides: data.localeOverrides || {} }, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "site-gate-locale.json";
    a.click();
  });
}

async function bootOptions() {
  await loadI18nSettings();
  applyI18n(document);
  await initAssistantPanel();
  await loadSites();
  await loadQuestions();
  await loadThemePanel();
  await initBetaPanels();
}

bootOptions();
