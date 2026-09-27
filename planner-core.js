(function (root) {
  "use strict";

  const DAY = 86400000;
  const SUBJECTS = new Set(["math", "science", "english", "korean"]);
  const legacySamples = [
    { id: "t1", subject: "math", title: "미적분 적분 응용 문제 20제", range: "개념원리 미적분 · p.148–156", minutes: 50, status: "done", current: false },
    { id: "t2", subject: "science", title: "일반물리학 뉴턴 역학 개념 총정리", range: "완자 물리학Ⅰ · p.72–81", minutes: 50, status: "done", current: true },
    { id: "t3", subject: "korean", title: "현대소설 구조 분석 및 독후 에세이", range: "문학 자습서 · 작품 3편", minutes: 45, status: "pending", current: false },
    { id: "t4", subject: "english", title: "수능 영단어 150개 회독", range: "워드마스터 하이퍼 2000 · Day 18", minutes: 25, status: "done", current: false },
    { id: "t5", subject: "science", title: "천체물리학 항성 진화 3강 수강", range: "EBS 개념완성 · 강의 3강", minutes: 38, status: "done", current: false },
    { id: "t6", subject: "math", title: "오답 노트: 치환적분 8문제", range: "개념원리 미적분 · 오답 복습", minutes: 22, status: "pending", current: false },
  ];

  // Calendar calculations use UTC ordinals, independent of daylight-saving shifts.
  // dateKey alone reads local components so that midnight follows the user's clock.
  function ordinal(key) {
    if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [year, month, day] = key.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.getTime() / DAY;
  }

  function validDateKey(key) {
    return ordinal(key) !== null;
  }

  function dateKey(date = new Date()) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
    const year = date.getFullYear();
    if (year < 1 || year > 9999) return "";
    return `${String(year).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function shiftDate(key, days) {
    const start = ordinal(key);
    if (start === null || !Number.isSafeInteger(days)) return "";
    const date = new Date((start + days) * DAY);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return "";
    return date.toISOString().slice(0, 10);
  }

  function weekDates(key) {
    const start = ordinal(key);
    if (start === null) return [];
    const mondayOffset = (new Date(start * DAY).getUTCDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, index) => shiftDate(key, index - mondayOffset));
  }

  function daysUntil(examDate, todayKey = dateKey()) {
    const exam = ordinal(examDate);
    const today = ordinal(todayKey);
    return exam === null || today === null ? null : exam - today;
  }

  function examLabel(examDate, todayKey = dateKey()) {
    const days = daysUntil(examDate, todayKey);
    if (days === null) return "시험일 미설정";
    if (days < 0) return "시험 종료";
    return days === 0 ? "D-Day" : `D-${days}`;
  }

  function cleanText(value, limit) {
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
  }

  function migrateTasks(raw, todayKey = dateKey()) {
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(raw)) return [];
    const today = validDateKey(todayKey) ? todayKey : dateKey();
    const usedIds = new Set();
    const tasks = [];
    raw.forEach((task, index) => {
      if (!task || typeof task !== "object" || Array.isArray(task)) return;
      // A dated record has already become a user's plan, even if its fields later
      // return to the sample values (for example, undoing a completion).
      const hasPlanningMetadata = validDateKey(task.date) || validDateKey(task.completedDate)
        || (typeof task.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(task.time));
      if (!hasPlanningMetadata && legacySamples.some((sample) => Object.keys(sample).every((key) => task[key] === sample[key]))) return;
      const title = cleanText(task.title, 200);
      if (!title) return;
      let id = cleanText(task.id, 120) || `task-${index + 1}`;
      while (usedIds.has(id)) id += "-copy";
      usedIds.add(id);
      const date = validDateKey(task.date) ? task.date : today;
      const status = task.status === "done" ? "done" : "pending";
      const minutes = Number(task.minutes);
      tasks.push({
        id,
        subject: SUBJECTS.has(task.subject) ? task.subject : "math",
        title,
        range: cleanText(task.range, 300),
        minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(1440, Math.max(1, Math.round(minutes))) : 25,
        status,
        current: task.current === true,
        date,
        time: typeof task.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(task.time) ? task.time : "",
        completedDate: status === "done" ? (validDateKey(task.completedDate) ? task.completedDate : date) : "",
      });
    });
    return tasks;
  }

  function tasksForDate(tasks, date) {
    if (!Array.isArray(tasks) || !validDateKey(date)) return [];
    return tasks.filter((task) => task && task.date === date).sort((left, right) => {
      const a = /^([01]\d|2[0-3]):[0-5]\d$/.test(left.time || "") ? left.time : "99:99";
      const b = /^([01]\d|2[0-3]):[0-5]\d$/.test(right.time || "") ? right.time : "99:99";
      return a.localeCompare(b);
    });
  }

  function stats(tasks, date) {
    const selected = tasksForDate(tasks, date);
    const total = selected.length;
    const done = selected.filter((task) => task.status === "done").length;
    const duration = (task) => Number.isFinite(Number(task.minutes)) ? Math.max(0, Number(task.minutes)) : 0;
    return {
      total,
      done,
      percent: total ? Math.round(done / total * 100) : 0,
      remainingMinutes: selected.filter((task) => task.status !== "done").reduce((sum, task) => sum + duration(task), 0),
      totalMinutes: selected.reduce((sum, task) => sum + duration(task), 0),
    };
  }

  function streak(tasks, todayKey = dateKey()) {
    if (!Array.isArray(tasks) || !validDateKey(todayKey)) return 0;
    const completedDays = new Set(tasks.filter((task) => task && task.status === "done")
      .map((task) => validDateKey(task.completedDate) ? task.completedDate : task.date)
      .filter(validDateKey));
    let cursor = completedDays.has(todayKey) ? todayKey : shiftDate(todayKey, -1);
    let count = 0;
    while (cursor && completedDays.has(cursor)) {
      count += 1;
      cursor = shiftDate(cursor, -1);
    }
    return count;
  }

  const api = { dateKey, validDateKey, shiftDate, weekDates, daysUntil, examLabel, migrateTasks, stats, streak, tasksForDate };
  root.YongjaPlanner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
