import { readFileSync } from "fs";
import { createContext, runInContext } from "vm";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = createContext({ console, Date });
for (const file of [
  "shared/defaults.js",
  "shared/lock.js",
  "shared/sites.js",
  "shared/budget.js"
]) {
  runInContext(readFileSync(join(root, file), "utf8"), ctx);
}
const {
  checkBudget,
  recordCompletion,
  defaultDailyStats,
  todayKey,
  validateBudgetSave,
  enrichSitePolicy,
  snapshotBudgetPolicy
} = ctx;

function policy(overrides = {}) {
  return enrichSitePolicy({
    budget: {
      mode: "budget",
      scope: "list",
      listDailyLimit: 0,
      ...(overrides.budget || {})
    },
    blocked: overrides.blocked || [
      { host: "youtube.com", dailyBudget: 1 },
      { host: "reddit.com", dailyBudget: null }
    ],
    endorsed: []
  });
}

let stats = defaultDailyStats();
let r = checkBudget(policy({ budget: { mode: "static" } }), stats, "youtube.com");
console.assert(!r.exceeded && r.scope === "static", "static mode never budget-blocks");

const listMode = policy({ budget: { mode: "budget", scope: "list", listDailyLimit: 2 } });
stats = { date: todayKey(), completions: 2, byHost: {} };
r = checkBudget(listMode, stats, "youtube.com");
console.assert(r.exceeded && r.scope === "global", "list mode shared pool");

const perSite = policy({
  budget: { mode: "budget", scope: "per-site", listDailyLimit: 0 },
  blocked: [{ host: "youtube.com", dailyBudget: 1 }]
});
stats = recordCompletion(defaultDailyStats(), "youtube.com", perSite.blocked);
r = checkBudget(perSite, stats, "youtube.com");
console.assert(r.exceeded && r.scope === "host", "per-site mode caps host");

stats = defaultDailyStats();
r = checkBudget(perSite, stats, "reddit.com");
console.assert(!r.exceeded, "per-site: no limit on site without cap");

const snap = snapshotBudgetPolicy(listMode);
const loosen = validateBudgetSave(
  listMode,
  policy({ budget: { mode: "budget", scope: "list", listDailyLimit: 5 } }),
  { active: true, until: Date.now() + 99999, budgetSnapshot: snap }
);
console.assert(!loosen.ok, "lock blocks list limit increase");

console.log("budget micro tests ok");
