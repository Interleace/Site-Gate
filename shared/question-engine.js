function activeQuestions(all) {
  return [...all]
    .filter((q) => q.active !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function selectQuestionsForRound(all, limit, mode) {
  const active = activeQuestions(all);
  if (!limit || limit <= 0 || limit >= active.length) return active;
  if (mode === "random") {
    const copy = [...active];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, limit);
  }
  return active.slice(0, limit);
}

function applyFrictionToQuestions(questions, bonusSeconds) {
  if (!bonusSeconds) return questions;
  return questions.map((q) => {
    if (q.type !== "wait") return q;
    return { ...q, seconds: (q.seconds ?? 25) + bonusSeconds };
  });
}

function newQuestionId() {
  return "q_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createRuntime(question) {
  const rt = { confirmStep: 0 };
  if (question.type === "math") {
    const a = Math.floor(Math.random() * 80) + 37;
    const b = Math.floor(Math.random() * 60) + 23;
    rt.prompt = `${a} × ${b} = ?`;
    rt.expected = a * b;
  }
  if (question.type === "phrase" && question.phrase) {
    rt.phrase = question.phrase;
  }
  if (question.type === "wait") {
    rt.timerRemaining = question.seconds ?? 25;
  }
  return rt;
}

function validateAnswer(question, answer, runtime) {
  switch (question.type) {
    case "text": {
      const minChars = question.minChars ?? 40;
      if (answer.length < minChars) {
        return { key: "gate.error.chars", params: { n: minChars - answer.length } };
      }
      const minWords = question.minWords ?? 0;
      if (minWords > 0) {
        const words = answer.split(/\s+/).filter((w) => w.length > 2);
        if (words.length < minWords) {
          return { key: "gate.error.shallow" };
        }
      }
      if (/^(asdf|test|lol|idk|keine ahnung)/i.test(answer.trim())) {
        return { key: "gate.error.honest" };
      }
      if (
        question.requireDuration &&
        !/\d/.test(answer) &&
        !/(minute|minuten|stunde|sekunde|hour|second)/i.test(answer)
      ) {
        return { key: "gate.error.duration" };
      }
      return null;
    }
    case "math": {
      const n = parseInt(answer.trim(), 10);
      if (Number.isNaN(n) || n !== runtime.expected) {
        return { key: "gate.error.math", regenerate: true };
      }
      return null;
    }
    case "wait": {
      if ((runtime.timerRemaining ?? 1) > 0) {
        return { key: "gate.error.timer" };
      }
      return null;
    }
    case "phrase": {
      const expected = runtime.phrase ?? question.phrase ?? "";
      if (answer !== expected) {
        return { key: "gate.error.phrase" };
      }
      return null;
    }
    case "confirm":
      return null;
    default:
      return { key: "gate.error.unknown" };
  }
}

function answerForLog(question, answer, runtime) {
  switch (question.type) {
    case "math":
      return `${runtime.prompt} → ${answer.trim()}`;
    case "wait":
      return `gewartet ${question.seconds ?? 25}s`;
    case "confirm":
      return `Bestätigung ${runtime.confirmStep}/${question.steps ?? 3}`;
    default:
      return answer;
  }
}

function normalizeQuestions(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return structuredClone(DEFAULT_QUESTIONS);
  }
  return raw.map((q, i) => ({
    ...q,
    id: q.id || newQuestionId(),
    order: q.order ?? i,
    active: q.active !== false
  }));
}
