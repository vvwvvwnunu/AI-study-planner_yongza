const test = require("node:test");
const assert = require("node:assert/strict");
const planner = require("../planner-core.js");
const TODAY = "2026-09-27";
const userTask = (changes = {}) => ({ id: "user-1", title: "내가 정한 학습", subject: "math", range: "12–18쪽", minutes: 30, status: "pending", current: false, ...changes });

test("fresh and malformed storage never creates demo work", () => {
  for (const raw of [null, undefined, "invalid json", "null", "{}", {}, 123, [], "[]", [null, 1, [], {}, { title: " " }]]) {
    assert.deepEqual(planner.migrateTasks(raw, TODAY), []);
  }
});

test("migration removes exact seeds while preserving edited and user-created records", () => {
  const seeds = [
    { id: "t1", subject: "math", title: "미적분 적분 응용 문제 20제", range: "개념원리 미적분 · p.148–156", minutes: 50, status: "done", current: false },
    { id: "t2", subject: "science", title: "일반물리학 뉴턴 역학 개념 총정리", range: "완자 물리학Ⅰ · p.72–81", minutes: 50, status: "done", current: true },
    { id: "t3", subject: "korean", title: "현대소설 구조 분석 및 독후 에세이", range: "문학 자습서 · 작품 3편", minutes: 45, status: "pending", current: false },
    { id: "t4", subject: "english", title: "수능 영단어 150개 회독", range: "워드마스터 하이퍼 2000 · Day 18", minutes: 25, status: "done", current: false },
    { id: "t5", subject: "science", title: "천체물리학 항성 진화 3강 수강", range: "EBS 개념완성 · 강의 3강", minutes: 38, status: "done", current: false },
    { id: "t6", subject: "math", title: "오답 노트: 치환적분 8문제", range: "개념원리 미적분 · 오답 복습", minutes: 22, status: "pending", current: false },
  ];
  const changedSeed = { ...seeds[0], minutes: 60 };
  const changedStatus = { ...seeds[5], status: "done" };
  const sameTitleOwnTask = { ...seeds[0], id: "my-task" };
  const result = planner.migrateTasks(JSON.stringify([...seeds, changedSeed, changedStatus, sameTitleOwnTask, userTask()]), TODAY);
  assert.deepEqual(result.map((task) => task.id), ["t1", "t6", "my-task", "user-1"]);
  assert.equal(result[0].minutes, 60);
  assert.equal(result[0].date, TODAY);
  assert.equal(result[0].completedDate, TODAY);
  assert.equal(result[0].time, "");
  assert.equal(result[3].completedDate, "");
});

test("migration validates task fields and drops unrecognized account data", () => {
  const raw = [userTask({ date: "2026-02-30", time: "25:70", minutes: -1, email: "unused@example.invalid", status: "pending", completedDate: "2026-09-20" }), userTask({ date: "2026-09-20", time: "08:05", status: "done", completedDate: "2026-09-21" })];
  const result = planner.migrateTasks(raw, TODAY);
  assert.equal(result[0].date, TODAY);
  assert.equal(result[0].time, "");
  assert.equal(result[0].minutes, 25);
  assert.equal(result[0].completedDate, "");
  assert.equal(Object.hasOwn(result[0], "email"), false);
  assert.notEqual(result[0].id, result[1].id);
  assert.equal(result[1].date, "2026-09-20");
  assert.equal(result[1].completedDate, "2026-09-21");
  assert.equal(result[1].time, "08:05");
  assert.equal(raw[0].email, "unused@example.invalid");
  assert.deepEqual(planner.migrateTasks(result, TODAY), result);
});

test("dated samples survive reload after edits return to original sample values", () => {
  const original = { id: "t1", subject: "math", title: "미적분 적분 응용 문제 20제", range: "개념원리 미적분 · p.148–156", minutes: 50, status: "done", current: false };
  for (const metadata of [{ date: "2026-09-28" }, { time: "09:30" }, { completedDate: "2026-09-26" }]) {
    const result = planner.migrateTasks([{ ...original, ...metadata }], TODAY);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "t1");
    assert.deepEqual(planner.migrateTasks(result, TODAY), result);
  }
  const adopted = planner.migrateTasks([{ ...original, minutes: 60 }], TODAY);
  adopted[0].minutes = 50;
  assert.deepEqual(planner.migrateTasks(adopted, TODAY), adopted);
  assert.deepEqual(planner.migrateTasks([{ ...original, date: "bad", time: "25:00", completedDate: "bad" }], TODAY), []);
});

test("calendar dates validate leap years and use local components", () => {
  for (const invalid of ["2026-02-29", "2024-02-30", "2026-13-01", "2026-00-01", "2026-01-00", "2026-9-27", "0000-01-01", "2026-09-27T00:00:00Z", null]) assert.equal(planner.validDateKey(invalid), false);
  assert.equal(planner.validDateKey("2024-02-29"), true);
  assert.equal(planner.validDateKey("2000-02-29"), true);
  assert.equal(planner.validDateKey("1900-02-29"), false);
  assert.equal(planner.dateKey(new Date(2026, 8, 27, 0, 1)), TODAY);
  assert.equal(planner.dateKey(new Date(2026, 8, 27, 23, 59)), TODAY);
  assert.equal(planner.dateKey(new Date("invalid")), "");
});

test("day shifts and Monday weeks cross leap, month, year and DST boundaries", () => {
  assert.equal(planner.shiftDate("2024-02-28", 1), "2024-02-29");
  assert.equal(planner.shiftDate("2024-02-29", 1), "2024-03-01");
  assert.equal(planner.shiftDate("2026-01-01", -1), "2025-12-31");
  assert.equal(planner.shiftDate("2026-03-08", 1), "2026-03-09");
  assert.equal(planner.shiftDate("2026-11-01", 1), "2026-11-02");
  assert.deepEqual(planner.weekDates("2027-01-01"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(planner.weekDates("2026-09-28")[0], "2026-09-28");
  assert.equal(planner.weekDates(TODAY)[6], TODAY);
  assert.deepEqual(planner.weekDates("invalid"), []);
  assert.equal(planner.shiftDate("invalid", 1), "");
});

test("exam countdown is exact on upcoming, current, past and unset dates", () => {
  assert.equal(planner.daysUntil("2026-09-28", TODAY), 1);
  assert.equal(planner.examLabel("2026-09-28", TODAY), "D-1");
  assert.equal(planner.examLabel(TODAY, TODAY), "D-Day");
  assert.equal(planner.examLabel("2026-09-26", TODAY), "시험 종료");
  assert.equal(planner.examLabel("", TODAY), "시험일 미설정");
  assert.equal(planner.daysUntil("invalid", TODAY), null);
  assert.equal(planner.daysUntil("2024-03-01", "2024-02-28"), 2);
});

test("empty statistics are zero and completion updates remaining time per date", () => {
  assert.deepEqual(planner.stats([], TODAY), { total: 0, done: 0, percent: 0, remainingMinutes: 0, totalMinutes: 0 });
  const tasks = planner.migrateTasks([userTask(), userTask({ id: "user-2", minutes: 60 }), userTask({ id: "tomorrow", date: "2026-09-28" })], TODAY);
  assert.deepEqual(planner.stats(tasks, TODAY), { total: 2, done: 0, percent: 0, remainingMinutes: 90, totalMinutes: 90 });
  tasks[0].status = "done";
  assert.deepEqual(planner.stats(tasks, TODAY), { total: 2, done: 1, percent: 50, remainingMinutes: 60, totalMinutes: 90 });
  tasks[1].status = "done";
  assert.equal(planner.stats(tasks, TODAY).percent, 100);
  assert.equal(planner.stats(tasks, TODAY).remainingMinutes, 0);
});

test("daily tasks are ordered by chosen start time without mutating storage order", () => {
  const tasks = planner.migrateTasks([userTask({ id: "unscheduled" }), userTask({ id: "late", time: "22:00" }), userTask({ id: "early", time: "09:00" }), userTask({ id: "other-day", date: "2026-09-28", time: "08:00" })], TODAY);
  assert.deepEqual(planner.tasksForDate(tasks, TODAY).map((task) => task.id), ["early", "late", "unscheduled"]);
  assert.equal(tasks[0].id, "unscheduled");
});

test("streak counts distinct real completion dates with yesterday grace and undo", () => {
  const tasks = [
    userTask({ id: "one", status: "done", date: "2026-09-24", completedDate: "2026-09-25" }),
    userTask({ id: "two", status: "done", date: "2026-09-26" }),
    userTask({ id: "duplicate", status: "done", date: "2026-09-26" }),
    userTask({ id: "today", date: TODAY }),
    userTask({ id: "future", status: "done", date: "2026-09-28" }),
  ];
  assert.equal(planner.streak([], TODAY), 0);
  assert.equal(planner.streak(tasks, TODAY), 2);
  tasks[3].status = "done";
  tasks[3].completedDate = TODAY;
  assert.equal(planner.streak(tasks, TODAY), 3);
  tasks[0].status = "pending";
  assert.equal(planner.streak(tasks, TODAY), 2);
  assert.equal(planner.streak(tasks, "2026-09-30"), 0);
});
