function selectedAssistantMode() {
  return document.querySelector('input[name="assistant-mode"]:checked')?.value || "budget-system";
}

function updateAssistantModeUi() {
  const mode = selectedAssistantMode();
  const effect = document.getElementById("assistant-mode-effect");
  const guard = document.getElementById("assistant-guard-hint");
  if (effect) effect.textContent = t(assistantModeEffectKey(mode));
  if (guard) guard.hidden = !assistantGuardsAdvancedBudget(mode);
  window.currentAssistantMode = mode;
  updateAssistantBanner();
}

function updateAssistantBanner() {
  const banner = document.getElementById("assistant-banner");
  if (!banner) return;
  const mode = window.currentAssistantMode || "budget-system";
  const onJustDoIt = document.getElementById("panel-justdoit")?.classList.contains("panel--active");
  if (assistantGuardsAdvancedBudget(mode) && !onJustDoIt) {
    banner.hidden = false;
    banner.textContent = t("assistant.banner", { mode: t(`assistant.modeLabel.${mode.replace(/-/g, "")}`) });
  } else {
    banner.hidden = true;
  }
}

async function refreshAssistantPanel() {
  const res = await chrome.runtime.sendMessage({ type: "get-assistant-state" });
  const mode = res?.mode || "budget-system";
  const input = document.getElementById(
    mode === "just-block"
      ? "assistant-just-block"
      : mode === "encouraged-enter"
        ? "assistant-encouraged"
        : "assistant-budget"
  );
  if (input) input.checked = true;
  updateAssistantModeUi();
}

document.querySelectorAll('input[name="assistant-mode"]').forEach((el) => {
  el.addEventListener("change", updateAssistantModeUi);
});

document.getElementById("assistant-goto-sites")?.addEventListener("click", () => {
  switchTab("sites");
});

document.getElementById("btn-save-assistant")?.addEventListener("click", async () => {
  const mode = selectedAssistantMode();
  const res = await chrome.runtime.sendMessage({ type: "save-assistant-mode", mode });
  if (!res?.ok) {
    toast(res?.reason || t("toast.blocked"), "error");
    setStatus("status-assistant", res?.reason || t("toast.blocked"), true);
    return;
  }
  toast(t("assistant.saved"), "success");
  setStatus("status-assistant", t("assistant.saved"));
  window.currentAssistantMode = mode;
  updateAssistantBanner();
  if (typeof applyBudgetUi === "function" && res.sitePolicy) {
    applyBudgetUi(res.sitePolicy);
  }
  if (typeof loadGateSettings === "function") await loadGateSettings();
  if (typeof loadQuestions === "function") await loadQuestions();
});

async function initAssistantPanel() {
  await refreshAssistantPanel();
}
