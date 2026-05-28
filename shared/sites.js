function normalizeSitePolicy(raw, legacyBlocked) {

  let blocked;

  let endorsed;

  let budget = raw?.budget ?? null;

  let globalDailyBudget = raw?.globalDailyBudget;



  if (raw?.blocked?.length) {

    blocked = raw.blocked.map((b) => ({

      host: normalizeHost(b.host),

      dailyBudget: b.dailyBudget == null ? null : Number(b.dailyBudget) || 0

    }));

    endorsed = (raw.endorsed || []).map((e) => ({

      host: normalizeHost(e.host),

      dailyGoalMinutes: Number(e.dailyGoalMinutes) || 0,

      label: e.label || ""

    }));

  } else {

    const hosts = legacyBlocked?.length ? legacyBlocked : DEFAULT_BLOCKED;

    blocked = hosts.map((h) => ({

      host: normalizeHost(typeof h === "string" ? h : h.host),

      dailyBudget: typeof h === "object" ? h.dailyBudget ?? null : null

    }));

    endorsed = DEFAULT_SITE_POLICY.endorsed.map((e) => ({ ...e }));

    if (globalDailyBudget == null) {

      globalDailyBudget = DEFAULT_BUDGET_CONFIG.listDailyLimit;

    }

  }



  const policy = { budget, globalDailyBudget, blocked, endorsed };

  return typeof enrichSitePolicy === "function" ? enrichSitePolicy(policy) : policy;

}



function hostInList(host, entries) {

  if (!host) return null;

  return (

    entries.find((e) => {

      const p = normalizeHost(e.host);

      return host === p || host.endsWith("." + p);

    }) || null

  );

}



function statsHostKey(host, blocked) {

  const entry = hostInList(host, blocked || []);

  return entry ? normalizeHost(entry.host) : normalizeHost(host || "");

}



function blockedHostsFromPolicy(policy) {

  return policy.blocked.map((b) => normalizeHost(b.host));

}



function formatBlockedLines(blocked) {

  return blocked

    .map((b) => {

      if (b.dailyBudget != null && b.dailyBudget > 0) {

        return `${b.host},${b.dailyBudget}`;

      }

      return b.host;

    })

    .join("\n");

}



function parseBlockedLines(text) {

  return text

    .split("\n")

    .map((line) => line.trim())

    .filter(Boolean)

    .map((line) => {

      const parts = line.split(",").map((s) => s.trim());

      const host = normalizeHost(parts[0]);

      const budget = parts[1] != null ? parseInt(parts[1], 10) : null;

      return {

        host,

        dailyBudget: Number.isNaN(budget) || budget == null || budget <= 0 ? null : budget

      };

    })

    .filter((b) => b.host);

}



function formatEndorsedLines(endorsed) {

  return endorsed

    .map((e) => {

      const goal = e.dailyGoalMinutes || 0;

      if (e.label) return `${e.host},${goal},${e.label}`;

      return goal > 0 ? `${e.host},${goal}` : e.host;

    })

    .join("\n");

}



function parseEndorsedLines(text) {

  return text

    .split("\n")

    .map((line) => line.trim())

    .filter(Boolean)

    .map((line) => {

      const [hostRaw, goalRaw, ...labelParts] = line.split(",").map((s) => s.trim());

      return {

        host: normalizeHost(hostRaw),

        dailyGoalMinutes: parseInt(goalRaw, 10) || 0,

        label: labelParts.join(",").trim()

      };

    })

    .filter((e) => e.host);

}



function validateBlockedSave(prev, next, lock) {

  if (!isLockActive(lock)) return { ok: true };

  const prevHosts = new Set((prev?.blocked || []).map((b) => normalizeHost(b.host)));

  const nextHosts = new Set((next?.blocked || []).map((b) => normalizeHost(b.host)));

  for (const h of prevHosts) {

    if (!nextHosts.has(h)) {

      return { ok: false, reason: `Sperre aktiv: „${h}“ kann nicht entfernt werden.` };

    }

  }

  return { ok: true };

}



function validateSitePolicySave(prev, next, lock) {

  const block = validateBlockedSave(prev, next, lock);

  if (!block.ok) return block;

  if (typeof validateBudgetSave === "function") {

    return validateBudgetSave(prev, next, lock);

  }

  return { ok: true };

}


