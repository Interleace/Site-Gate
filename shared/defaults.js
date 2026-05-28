const DEFAULT_BLOCKED = [
  "reddit.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "youtube.com"
];

const DEFAULT_ENDORSED = [
  { host: "developer.mozilla.org", dailyGoalMinutes: 20, label: "MDN" },
  { host: "khanacademy.org", dailyGoalMinutes: 15, label: "Learning" }
];

const DEFAULT_BUDGET_CONFIG = {
  mode: "budget",
  scope: "list",
  listDailyLimit: 3
};

const DEFAULT_SITE_POLICY = {
  budget: { ...DEFAULT_BUDGET_CONFIG },
  blocked: DEFAULT_BLOCKED.map((host) => ({ host, dailyBudget: null })),
  endorsed: DEFAULT_ENDORSED.map((e) => ({ ...e }))
};

const DEFAULT_QUESTIONS = [
  {
    id: "why",
    type: "text",
    active: true,
    order: 0,
    label: "Warum willst du diese Seite jetzt besuchen?",
    hint: "Mindestens 80 Zeichen. Keine Copy-Paste-Floskeln — schreib es selbst.",
    minChars: 80,
    minWords: 12
  },
  {
    id: "math",
    type: "math",
    active: true,
    order: 1,
    label: "Rechne das im Kopf — kein Taschenrechner, kein Copy-Paste:",
    hint: "Die Antwort muss exakt stimmen."
  },
  {
    id: "intent",
    type: "text",
    active: true,
    order: 2,
    label: "Was wirst du konkret auf dieser Seite tun — und wie lange?",
    hint: "Mindestens 60 Zeichen. Sei spezifisch, nicht vage.",
    minChars: 60,
    requireDuration: true
  },
  {
    id: "wait",
    type: "wait",
    active: true,
    order: 3,
    label: "Warte. Lass den Tab aktiv und lies die Frage.",
    hint: "Wechselst du den Tab oder minimierst du das Fenster, startet der Timer neu.",
    seconds: 25
  },
  {
    id: "phrase",
    type: "phrase",
    active: true,
    order: 4,
    label: "Tippe diesen Satz fehlerfrei ab — Zeichen für Zeichen:",
    hint: "Kein Einfügen. Jeder Tippfehler setzt das Feld zurück.",
    phrase: "Ich verzichte bewusst auf impulsives Scrollen und akzeptiere die Reibung."
  },
  {
    id: "confirm",
    type: "confirm",
    active: true,
    order: 5,
    label: "Letzte Frage: Willst du wirklich weiter?",
    hint: "Mehrfache Bestätigung. Jede ist bewusst unangenehm.",
    steps: 3
  }
];

const QUESTION_TYPES = [
  { id: "text", label: "Freitext" },
  { id: "math", label: "Kopfrechnen" },
  { id: "wait", label: "Wartezeit" },
  { id: "phrase", label: "Satz abtippen" },
  { id: "confirm", label: "Bestätigung" }
];

const MAX_LOG_ENTRIES = 200;

const DEFAULT_GATE_SETTINGS = {
  theme: "ember",
  locale: "auto",
  questionRoundLimit: 0,
  questionRoundMode: "ordered",
  assistantMode: "budget-system"
};

const LOCK_DURATIONS = [
  { id: "1h", label: "1 Stunde", ms: 60 * 60 * 1000 },
  { id: "4h", label: "4 Stunden", ms: 4 * 60 * 60 * 1000 },
  { id: "24h", label: "24 Stunden", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 Tage", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30 Tage", ms: 30 * 24 * 60 * 60 * 1000 }
];

const DEFAULT_LOCK_SETTINGS = {
  frictionStackSeconds: 10,
  frictionStackCap: 60
};

const ENDORSED_TICK_MINUTES = 1;
