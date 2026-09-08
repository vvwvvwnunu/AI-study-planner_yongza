const subjectMeta = {
  math: { label: "수학", symbol: "∑", badge: "math" },
  science: { label: "과학", symbol: "⚗", badge: "science" },
  english: { label: "영어", symbol: "A", badge: "english" },
  korean: { label: "국어", symbol: "ᄀ", badge: "korean" },
};

const dailyQuotes = [
  "작은 몰입이, 내일의 나를 만든다.",
  "한 줄을 이해하면, 한 걸음 더 멀리 간다.",
  "흔들려도 다시 책상 앞에 앉으면 된다.",
  "오늘의 집중은 미래의 나에게 보내는 약속이다.",
  "잘하고 있는지는, 계속하는 동안 보인다.",
  "끝까지 가는 사람은 오늘을 나누어 걷는다.",
  "답은 멀리 있지 않다. 다음 문제 안에 있다.",
];

const seedTasks = [
  { id: "t1", subject: "math", title: "미적분 적분 응용 문제 20제", range: "개념원리 미적분 · p.148–156", minutes: 50, status: "done", current: false },
  { id: "t2", subject: "science", title: "일반물리학 뉴턴 역학 개념 총정리", range: "완자 물리학Ⅰ · p.72–81", minutes: 50, status: "done", current: true },
  { id: "t3", subject: "korean", title: "현대소설 구조 분석 및 독후 에세이", range: "문학 자습서 · 작품 3편", minutes: 45, status: "pending", current: false },
  { id: "t4", subject: "english", title: "수능 영단어 150개 회독", range: "워드마스터 하이퍼 2000 · Day 18", minutes: 25, status: "done", current: false },
  { id: "t5", subject: "science", title: "천체물리학 항성 진화 3강 수강", range: "EBS 개념완성 · 강의 3강", minutes: 38, status: "done", current: false },
  { id: "t6", subject: "math", title: "오답 노트: 치환적분 8문제", range: "개념원리 미적분 · 오답 복습", minutes: 22, status: "pending", current: false },
];

const state = {
  tasks: JSON.parse(localStorage.getItem("yongjaTasks") || "null") || seedTasks,
  signedIn: localStorage.getItem("yongjaGoogle") === "true",
  screen: "home",
  filter: "all",
  timerSeconds: 25 * 60,
  timerTotal: 25 * 60,
  timerRunning: false,
  timerInterval: null,
  theme: localStorage.getItem("yongjaTheme") || "cosmic",
  level: localStorage.getItem("yongjaLevel") || "보완",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function persist() {
  localStorage.setItem("yongjaTasks", JSON.stringify(state.tasks));
  localStorage.setItem("yongjaGoogle", String(state.signedIn));
  localStorage.setItem("yongjaTheme", state.theme);
  localStorage.setItem("yongjaLevel", state.level);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2300);
}

function openModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function navigate(screen) {
  state.screen = screen;
  $$(".screen").forEach((panel) => panel.classList.toggle("active", panel.dataset.screen === screen));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.nav === screen));
  const labels = { home: "오늘의 플래너", planner: "과목 플래너", ai: "Gemini AI 튜터", theme: "테마 스튜디오" };
  $("#sectionLabel").textContent = labels[screen];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHomeTimeline() {
  const timeline = $("#homeTimeline");
  if (!timeline) return;
  const items = [
    { time: "15:00", task: "일반물리학 뉴턴 역학 개념 총정리", detail: "과학 · 50분", done: true },
    { time: "16:00", task: "현대소설 구조 분석 및 독후 에세이", detail: "국어 · 45분", done: false },
    { time: "19:30", task: "천체물리학 항성 진화 3강 수강", detail: "과학 · 38분", done: true },
  ];
  timeline.innerHTML = items.map((item) => `<div class="timeline-item ${item.done ? "done" : ""}"><span class="timeline-time">${item.time}</span><span class="timeline-dot"></span><div class="timeline-content"><strong>${item.task}</strong><span>${item.detail}${item.done ? " · 완료" : " · 대기 중"}</span></div></div>`).join("");
}

function renderDailyQuote() {
  const quote = $("#dailyQuote");
  if (!quote) return;
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((today - yearStart) / 86400000);
  quote.textContent = dailyQuotes[dayOfYear % dailyQuotes.length];
}

function renderStats() {
  const done = state.tasks.filter((task) => task.status === "done").length;
  const total = state.tasks.length || 1;
  const percent = Math.round((done / total) * 100);
  $("#doneCount").textContent = `${done} / ${total}`;
  $("#plannerPercent").textContent = `${percent}%`;
  $("#plannerProgressBar").style.width = `${percent}%`;
  $("#plannerProgressCopy").textContent = `${total}개 중 ${done}개 완료`;
  const remaining = state.tasks.filter((task) => task.status !== "done").reduce((sum, task) => sum + Number(task.minutes || 0), 0);
  $("#plannedMinutes").textContent = remaining > 60 ? `${Math.floor(remaining / 60)}h ${remaining % 60}m` : `${remaining}m`;
}

function renderWeekStrip() {
  const days = ["월", "화", "수", "목", "금", "토", "일"];
  const dates = [7, 8, 9, 10, 11, 12, 13];
  $("#weekStrip").innerHTML = days.map((day, index) => `<div class="day-cell ${index === 2 ? "active" : ""}"><small>${day}</small><strong>${dates[index]}</strong><i></i></div>`).join("");
}

function renderTasks() {
  const list = $("#taskList");
  const visible = state.tasks.filter((task) => state.filter === "all" || task.subject === state.filter);
  list.innerHTML = visible.map((task) => {
    const subject = subjectMeta[task.subject] || subjectMeta.math;
    const status = task.status === "done" ? "완료" : task.current ? "집중 궤도" : "대기 중";
    return `<article class="task-card ${task.current ? "current" : ""} ${task.status === "done" ? "completed" : ""}" data-task-id="${task.id}">
      <div class="task-head"><button class="task-check" data-action="toggle-task" aria-label="${task.title} ${task.status === "done" ? "완료 취소" : "완료 처리"}">${task.status === "done" ? "✓" : ""}</button><div class="task-main"><h3>${task.title}</h3><div class="task-meta"><span class="subject-label ${subject.badge}">${subject.label} ${subject.symbol}</span><span>${task.range || "범위 직접 입력"}</span></div></div><span class="task-status">${status}</span></div>
      <div class="task-footer"><span>◷ 예상 ${task.minutes}분</span>${task.status === "done" ? "<strong>기록됨</strong>" : `<button class="task-start" data-action="start-task">시작하기</button>`}</div>
    </article>`;
  }).join("") || `<div class="empty-state glass-card">이 과목에는 아직 미션이 없어요.</div>`;
}

function renderAccount() {
  $("#profileEmail").textContent = state.signedIn ? "minseo.yongja@gmail.com · Google 연결됨" : "아직 Google 계정이 연결되지 않았어요.";
  $("#googleButtonLabel").textContent = state.signedIn ? "Google 계정 연결됨" : "Google 계정으로 계속하기";
  $("#googleLogin").style.opacity = state.signedIn ? ".72" : "1";
  $$(".level-option").forEach((option) => option.classList.toggle("active", option.dataset.level === state.level));
  $("#levelTag").textContent = `학습 수준 · ${state.level}`;
}

function renderTheme() {
  const themes = {
    cosmic: { name: "딥 코스믹 스페이스", primary: "#b68cff", secondary: "#8a8cff", mint: "#4edea3" },
    math: { name: "기하 & 수학", primary: "#a9b7ff", secondary: "#6878f0", mint: "#83d9d7" },
    science: { name: "분자 과학", primary: "#75e4bb", secondary: "#3c9a9e", mint: "#4edea3" },
    humanities: { name: "인문 & 문학", primary: "#f6c66c", secondary: "#a974a5", mint: "#df9b74" },
  };
  const theme = themes[state.theme] || themes.cosmic;
  document.documentElement.style.setProperty("--primary", theme.primary);
  document.documentElement.style.setProperty("--secondary", theme.secondary);
  document.documentElement.style.setProperty("--mint", theme.mint);
  $("#selectedThemeName").textContent = theme.name;
  $$(".theme-tile").forEach((tile) => tile.classList.toggle("active", tile.dataset.theme === state.theme));
}

function renderAll() {
  renderDailyQuote();
  renderHomeTimeline();
  renderStats();
  renderWeekStrip();
  renderTasks();
  renderAccount();
  renderTheme();
}

function timerLabel(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function renderTimer() {
  $("#timerDisplay").textContent = timerLabel(state.timerSeconds);
  const progress = 640.9 * (1 - state.timerSeconds / state.timerTotal);
  $("#timerProgress").style.strokeDashoffset = String(Math.max(0, progress));
  $("#timerToggle").textContent = state.timerRunning ? "Ⅱ 일시정지" : "▶ 시작";
}

function stopTimer() {
  state.timerRunning = false;
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  renderTimer();
}

function startTimer() {
  if (state.timerRunning) return;
  state.timerRunning = true;
  state.timerInterval = setInterval(() => {
    state.timerSeconds -= 1;
    if (state.timerSeconds <= 0) {
      state.timerSeconds = 0;
      stopTimer();
      showToast("집중 세션이 끝났어요. 5분 쉬어가요!");
    }
    renderTimer();
  }, 1000);
  renderTimer();
}

function openTimer(task) {
  $("#timerTitle").textContent = task?.title || "미적분 적분 응용 문제 20제";
  $("#timerModal .muted").textContent = task?.range || "개념원리 미적분 · p.148–156";
  state.timerSeconds = 25 * 60;
  state.timerTotal = 25 * 60;
  stopTimer();
  openModal("timerModal");
  renderTimer();
}

function sendChat(message) {
  const clean = message.trim();
  if (!clean) return;
  const windowEl = $("#chatWindow");
  windowEl.insertAdjacentHTML("beforeend", `<div class="bubble user">${clean.replace(/[<>]/g, "")}</div>`);
  const answer = clean.includes("계획") ? "현재 계획은 수학의 중요도와 시험까지 남은 기간을 우선 반영했어요. 오늘 수학 50분 뒤 과학 30분 복습을 하면 두 과목 모두 흐름을 놓치지 않아요." : clean.includes("적분") ? "치환할 식을 먼저 하나의 문자로 바꿔보세요. u를 정한 뒤 du가 문제 안에 있는지 확인하면 다음 단계가 보여요." : "현재 등록한 문제집과 진도를 기준으로 답할게요. 먼저 오늘 미션을 끝낸 다음, 막힌 개념을 한 문장으로 적어주세요.";
  setTimeout(() => { windowEl.insertAdjacentHTML("beforeend", `<div class="bubble ai"><div class="bubble-label"><span class="ai-mini">✦</span> 용자 AI</div><p>${answer}</p><div class="ai-tip">💡 실제 Gemini 연결 후에는 내 문제집과 기록에 맞춰 더 구체적으로 답해요.</div></div>`); windowEl.scrollTop = windowEl.scrollHeight; }, 350);
  $("#chatInput").value = "";
  windowEl.scrollTop = windowEl.scrollHeight;
}

function sendHomeChat(message) {
  const clean = message.trim();
  if (!clean) return;
  const reply = $("#homeAiReply");
  const answer = clean.includes("먼저") || clean.includes("순서")
    ? "지금은 16:00 국어 구조 분석을 먼저 시작해요. 45분 뒤 10분 쉬고, 19:30 과학 강의로 넘어가면 오늘 계획을 무리 없이 지킬 수 있어요."
    : clean.includes("수학")
      ? "수학은 중요도 ⭐⭐⭐⭐⭐라서 오늘 첫 집중 미션으로 잡혀 있어요. 타임테이블의 국어 다음에 20:20 오답 22분을 추가하면 좋아요."
      : "현재 타임테이블 기준으로 다음 미션은 16:00 국어예요. 45분만 먼저 끝내고 완료 체크를 남겨주세요. 기록에 맞춰 다음 일정도 다시 조정할게요.";
  reply.innerHTML = `<strong><span class="ai-mini">✦</span> 용자 AI</strong> ${answer}`;
  reply.classList.add("show");
  $("#homeChatInput").value = "";
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = (tool) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
  register({ name: "read_study_plan", title: "Read study plan", description: "Read the visible study tasks, completion state, and estimated minutes.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ tasks: state.tasks.map(({ id, subject, title, range, minutes, status }) => ({ id, subject, title, range, minutes, status })) }) });
  register({ name: "complete_study_task", title: "Complete study task", description: "Mark one visible study task complete and update the planner.", inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: ({ taskId }) => { const task = state.tasks.find((item) => item.id === taskId); if (!task) throw new Error("task not found"); task.status = "done"; persist(); renderAll(); return { id: task.id, status: task.status }; } });
  window.addEventListener("beforeunload", () => lifecycle.abort(), { once: true });
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) navigate(nav.dataset.nav);
  const close = event.target.closest("[data-close]");
  if (close) closeModal(close.dataset.close);
  if (event.target.classList.contains("modal-backdrop")) closeModal(event.target.id);

  const action = event.target.closest("[data-action]");
  if (action) {
    const card = action.closest("[data-task-id]");
    const task = card && state.tasks.find((item) => item.id === card.dataset.taskId);
    if (action.dataset.action === "toggle-task" && task) { task.status = task.status === "done" ? "pending" : "done"; persist(); renderAll(); showToast(task.status === "done" ? "미션을 완료했어요." : "미션을 다시 계획에 넣었어요."); }
    if (action.dataset.action === "start-task" && task) openTimer(task);
  }
  if (event.target.closest("#profileButton")) openModal("profileModal");
  if (event.target.closest("#addTaskButton")) openModal("taskModal");
  if (event.target.closest("#startFocus")) openTimer(state.tasks.find((task) => task.current) || state.tasks[0]);
  if (event.target.closest("#refreshPlan")) { renderAll(); showToast("오늘의 계획을 다시 확인했어요."); }
  if (event.target.closest("#googleLogin")) { state.signedIn = true; persist(); renderAccount(); showToast("Google 계정을 연결했어요."); }
  const level = event.target.closest(".level-option");
  if (level) { state.level = level.dataset.level; persist(); renderAccount(); showToast(`학습 수준을 ${state.level}(으)로 설정했어요.`); }
  if (event.target.closest("#editContext")) { openModal("profileModal"); }
  if (event.target.closest("#clearChat")) { $("#chatWindow").innerHTML = `<div class="chat-time">새 대화를 시작했어요</div>`; showToast("대화를 초기화했어요."); }
  const suggestion = event.target.closest(".suggestion-chip");
  if (suggestion) { $("#chatInput").value = suggestion.textContent; $("#chatInput").focus(); }
  const filter = event.target.closest(".filter-chip");
  if (filter) { state.filter = filter.dataset.filter; $$(".filter-chip").forEach((chip) => chip.classList.toggle("active", chip === filter)); renderTasks(); }
  const themeTile = event.target.closest(".theme-tile");
  if (themeTile) { state.theme = themeTile.dataset.theme; persist(); renderTheme(); showToast(`${$("#selectedThemeName").textContent} 테마를 적용했어요.`); }
  if (event.target.closest("#tuneTheme")) { $("#blurRange").focus(); showToast("아래 슬라이더에서 테마를 조정해보세요."); }
  if (event.target.closest("#applyTheme")) { persist(); showToast("모든 화면에 테마를 적용했어요."); }
  if (event.target.closest("#timerToggle")) state.timerRunning ? stopTimer() : startTimer();
  if (event.target.closest("#resetTimer")) { stopTimer(); state.timerSeconds = state.timerTotal; renderTimer(); }
});

$("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#taskTitle").value.trim();
  const minutes = Number($("#taskMinutes").value);
  if (!title || !minutes || minutes < 5) return;
  state.tasks.push({ id: `t${Date.now()}`, subject: $("#taskSubject").value, title, range: $("#taskRange").value.trim() || "범위 직접 입력", minutes, status: "pending", current: false });
  persist(); renderAll(); closeModal("taskModal"); event.target.reset(); showToast("새 미션을 오늘 계획에 추가했어요.");
});

$("#chatForm").addEventListener("submit", (event) => { event.preventDefault(); sendChat($("#chatInput").value); });
$("#homeChatForm").addEventListener("submit", (event) => { event.preventDefault(); sendHomeChat($("#homeChatInput").value); });

[["blurRange", "blurValue"], ["darkRange", "darkValue"], ["glowRange", "glowValue"]].forEach(([input, output]) => { $(`#${input}`).addEventListener("input", (event) => { $(`#${output}`).textContent = `${event.target.value}%`; }); });

renderAll();
renderTimer();
registerWebMcp();
