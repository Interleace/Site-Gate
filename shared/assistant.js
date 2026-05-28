const ASSISTANT_MODE_IDS = ["just-block", "encouraged-enter", "budget-system"];

const ASSISTANT_PRESETS = {
  "just-block": {
    budget: { mode: "static", scope: "list", listDailyLimit: 0 },
    questionRoundLimit: 1,
    clearHostBudgets: true
  },
  "encouraged-enter": {
    budget: { mode: "static", scope: "list", listDailyLimit: 0 },
    questionRoundLimit: 0,
    clearHostBudgets: true
  },
  "budget-system": {
    clearHostBudgets: false
  }
};

function applyAssistantMode(mode, sitePolicy, gateSettings) {
  const id = ASSISTANT_MODE_IDS.includes(mode) ? mode : "budget-system";
  const preset = ASSISTANT_PRESETS[id];
  const policy = enrichSitePolicy({ ...sitePolicy });
  const gs = { ...DEFAULT_GATE_SETTINGS, ...gateSettings, assistantMode: id };

  if (id !== "budget-system") {
    policy.budget = { ...preset.budget };
    if (preset.clearHostBudgets) {
      policy.blocked = (policy.blocked || []).map((b) => ({ ...b, dailyBudget: null }));
    }
    if (preset.questionRoundLimit != null) {
      gs.questionRoundLimit = preset.questionRoundLimit;
    }
  }

  return { sitePolicy: policy, gateSettings: gs };
}

function detectAssistantMode(sitePolicy, gateSettings) {
  const saved = gateSettings?.assistantMode;
  if (saved && ASSISTANT_MODE_IDS.includes(saved)) return saved;

  const policy = enrichSitePolicy(sitePolicy || {});
  if (policy.budget?.mode === "budget") return "budget-system";
  if ((gateSettings?.questionRoundLimit ?? 0) === 1) return "just-block";
  return "encouraged-enter";
}

function assistantModeEffectKey(mode) {
  const keys = {
    "just-block": "assistant.effect.justBlock",
    "encouraged-enter": "assistant.effect.encouragedEnter",
    "budget-system": "assistant.effect.budgetSystem"
  };
  return keys[mode] || keys["budget-system"];
}

function assistantGuardsAdvancedBudget(mode) {
  return mode !== "budget-system";
}
