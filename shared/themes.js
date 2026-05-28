const GATE_THEMES = {
  ember: {
    id: "ember",
    label: "Glut",
    desc: "Dunkel, warnend — Standard",
    vars: {
      "--gate-bg": "#0d0d0f",
      "--gate-surface": "linear-gradient(160deg, #141418 0%, #1a1214 100%)",
      "--gate-border": "#3a2020",
      "--gate-glow": "rgba(180, 40, 40, 0.15)",
      "--gate-text": "#e8e6e3",
      "--gate-muted": "#a89890",
      "--gate-hint": "#887870",
      "--gate-accent": "#b05050",
      "--gate-accent-strong": "#c04040",
      "--gate-accent-done": "#6a3030",
      "--gate-input-bg": "#0a0a0c",
      "--gate-input-border": "#3a3030",
      "--gate-input-focus": "#804040",
      "--gate-btn-bg": "#5a2828",
      "--gate-btn-hover": "#703030",
      "--gate-btn-text": "#f0e8e4",
      "--gate-warn-bg": "#2a1818",
      "--gate-warn-border": "#603030",
      "--gate-warn-text": "#d08080",
      "--gate-timer": "#d06060",
      "--gate-error": "#e06060",
      "--gate-ok": "#508050"
    }
  },
  forest: {
    id: "forest",
    label: "Wald",
    desc: "Gedämpft grün — ruhig und sachlich",
    vars: {
      "--gate-bg": "#0a0f0c",
      "--gate-surface": "linear-gradient(160deg, #101814 0%, #0f1a14 100%)",
      "--gate-border": "#2a4034",
      "--gate-glow": "rgba(60, 120, 80, 0.12)",
      "--gate-text": "#e4ebe6",
      "--gate-muted": "#98a89c",
      "--gate-hint": "#78887c",
      "--gate-accent": "#509060",
      "--gate-accent-strong": "#60a870",
      "--gate-accent-done": "#3a6048",
      "--gate-input-bg": "#080c0a",
      "--gate-input-border": "#2a3830",
      "--gate-input-focus": "#408050",
      "--gate-btn-bg": "#2a5038",
      "--gate-btn-hover": "#356848",
      "--gate-btn-text": "#e8f0ea",
      "--gate-warn-bg": "#1a241c",
      "--gate-warn-border": "#406048",
      "--gate-warn-text": "#80b090",
      "--gate-timer": "#70a880",
      "--gate-error": "#c07060",
      "--gate-ok": "#60a070"
    }
  },
  slate: {
    id: "slate",
    label: "Schiefer",
    desc: "Neutral kühl — nüchtern",
    vars: {
      "--gate-bg": "#0c0e12",
      "--gate-surface": "linear-gradient(160deg, #12161c 0%, #141820 100%)",
      "--gate-border": "#2a3444",
      "--gate-glow": "rgba(80, 100, 140, 0.12)",
      "--gate-text": "#e6eaef",
      "--gate-muted": "#98a4b4",
      "--gate-hint": "#788498",
      "--gate-accent": "#6080b0",
      "--gate-accent-strong": "#7090c0",
      "--gate-accent-done": "#405070",
      "--gate-input-bg": "#0a0c10",
      "--gate-input-border": "#303848",
      "--gate-input-focus": "#5070a0",
      "--gate-btn-bg": "#344860",
      "--gate-btn-hover": "#405878",
      "--gate-btn-text": "#eef2f8",
      "--gate-warn-bg": "#1a2030",
      "--gate-warn-border": "#405878",
      "--gate-warn-text": "#90a8c8",
      "--gate-timer": "#80a0c8",
      "--gate-error": "#c08080",
      "--gate-ok": "#608878"
    }
  },
  dawn: {
    id: "dawn",
    label: "Morgen",
    desc: "Hell und warm — weniger düster",
    vars: {
      "--gate-bg": "#f0ebe4",
      "--gate-surface": "linear-gradient(160deg, #faf6f0 0%, #f4ece4 100%)",
      "--gate-border": "#d8c8b8",
      "--gate-glow": "rgba(180, 120, 60, 0.1)",
      "--gate-text": "#2a2420",
      "--gate-muted": "#6a5c50",
      "--gate-hint": "#8a7c70",
      "--gate-accent": "#a06040",
      "--gate-accent-strong": "#b07048",
      "--gate-accent-done": "#c8a080",
      "--gate-input-bg": "#fffaf5",
      "--gate-input-border": "#d0c0b0",
      "--gate-input-focus": "#a07050",
      "--gate-btn-bg": "#8a5038",
      "--gate-btn-hover": "#a06048",
      "--gate-btn-text": "#fff8f4",
      "--gate-warn-bg": "#f8ece0",
      "--gate-warn-border": "#d0a080",
      "--gate-warn-text": "#904020",
      "--gate-timer": "#b06040",
      "--gate-error": "#b04030",
      "--gate-ok": "#508050"
    }
  }
};

function applyGateTheme(themeId) {
  const theme = GATE_THEMES[themeId] || GATE_THEMES.ember;
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  for (const [key, val] of Object.entries(theme.vars)) {
    root.style.setProperty(key, val);
  }
  return theme;
}

function themeList() {
  return Object.values(GATE_THEMES);
}
