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

const planner = window.YongjaPlanner;
const todayKey = () => planner.dateKey(new Date());
function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
const storedExam = readStored("yongjaExam", {});

// 이전 프로토타입이 저장했던 가짜 Google 계정 상태를 한 번만 정리합니다.
// 실제 로그인 정보는 현재 세션의 Google Identity Services 응답으로만 채웁니다.
localStorage.removeItem("yongjaGoogle");
sessionStorage.removeItem("yongjaGoogle");

const state = {
  tasks: planner.migrateTasks(readStored("yongjaTasks", []), todayKey()),
  selectedDate: todayKey(),
  lastToday: todayKey(),
  exam: { title: typeof storedExam?.title === "string" ? storedExam.title.slice(0, 60) : "", date: planner.validDateKey(storedExam?.date) ? storedExam.date : "" },
  googleConnected: false,
  googleCredential: null,
  chatHistory: [],
  aiBusy: false,
  screen: "home",
  filter: "all",
  timerSeconds: 25 * 60,
  timerTotal: 25 * 60,
  timerRunning: false,
  timerInterval: null,
  theme: localStorage.getItem("yongjaTheme") || "cosmic",
  level: ["기초", "보완", "중간", "심화"].includes(localStorage.getItem("yongjaLevel")) ? localStorage.getItem("yongjaLevel") : "",
  timerTaskId: null,
};

const appConfig = window.YONGJA_CONFIG || {};
const apiBaseUrl = String(appConfig.apiBaseUrl || "").replace(/\/$/, "");
const hasGoogleClientId = Boolean(appConfig.googleClientId && !String(appConfig.googleClientId).includes("YOUR_GOOGLE"));

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));

function persist() {
  const safeTasks = state.tasks.map((task) => ({ ...task, title: redactPotentialPersonalData(task.title), range: redactPotentialPersonalData(task.range) }));
  state.tasks = safeTasks;
  localStorage.setItem("yongjaTasks", JSON.stringify(safeTasks));
  localStorage.setItem("yongjaTheme", state.theme);
  localStorage.setItem("yongjaLevel", state.level);
  localStorage.setItem("yongjaExam", JSON.stringify(state.exam));
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
  const tasks = planner.tasksForDate(state.tasks, todayKey());
  timeline.innerHTML = tasks.map((task) => {
    const done = task.status === "done";
    const active = task.id === state.timerTaskId && state.timerRunning;
    const subject = subjectMeta[task.subject] || subjectMeta.math;
    return `<div class="time-row ${done ? "done-row" : active ? "current-row" : ""}" data-task-id="${escapeHtml(task.id)}">
      <time>${escapeHtml(task.time || "미정")}</time><span class="time-line"></span>
      <div class="time-block ${active ? "current-block" : ""}"><span class="block-status">${done ? "완료" : active ? "집중 중" : "예정"}</span>
        <strong>${escapeHtml(task.title)}</strong><small>${subject.label} · ${task.minutes}분${task.range ? ` · ${escapeHtml(task.range)}` : ""}</small>
        <div class="timetable-actions"><button data-action="toggle-task">${done ? "완료 취소" : "완료"}</button>${done ? "" : '<button data-action="start-task">집중 시작</button>'}<button data-action="edit-task">수정</button></div>
      </div></div>`;
  }).join("") || '<div class="empty-state"><strong>오늘의 첫 계획을 만들어 보세요.</strong><p>공부할 내용과 시간을 등록하면 여기에 표시돼요.</p><button class="outline-button" data-add-task>＋ 오늘 계획 추가</button></div>';
  $("#homeGreeting").textContent = tasks.length ? `오늘 등록한 ${tasks.length}개의 계획을 차근차근 해봐요.` : "오늘 할 공부를 등록하고 나만의 하루를 시작해요.";
}

function formatDate(key, weekday = false) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("ko-KR", { month: "long", day: "numeric", ...(weekday ? { weekday: "short" } : {}) });
}

function formatMinutes(minutes) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}` : `${minutes}분`;
}

function renderDates() {
  const today = todayKey();
  $("#quoteDate").textContent = formatDate(today);
  $("#timetableDate").textContent = formatDate(today, true);
  $("#liveClock").textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  $("#plannerDate").textContent = formatDate(state.selectedDate, true);
  $("#examName").textContent = state.exam.date ? state.exam.title || "시험" : "시험일 설정";
  $("#examDate").textContent = state.exam.date ? formatDate(state.exam.date) : "";
  const examLabel = planner.examLabel(state.exam.date, today);
  $("#examCountdown").textContent = state.exam.date ? examLabel : "＋";
  $("#plannerExamLabel").textContent = examLabel;
  $("#examSettingsButton").setAttribute("aria-label", `${state.exam.title || "시험"} ${examLabel}, 시험일 설정`);
}

function renderContext() {
  const tasks = planner.tasksForDate(state.tasks, todayKey());
  const subjects = [...new Set(tasks.map((task) => subjectMeta[task.subject]?.label).filter(Boolean))];
  const ranges = [...new Set(tasks.map((task) => task.range).filter(Boolean))];
  const tags = [state.level ? `학습 수준 · ${state.level}` : "학습 수준 미설정", `${formatDate(todayKey())} · 계획 ${tasks.length}개`, ...subjects, ...ranges];
  tags.push(state.exam.date ? `${state.exam.title || "시험"} · ${planner.examLabel(state.exam.date, todayKey())}` : "시험일 미설정");
  $("#contextTags").innerHTML = tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
}

function renderDailyQuote() {
  const quote = $("#dailyQuote");
  if (!quote) return;
  const today = new Date();
  const dayOfYear = planner.daysUntil(todayKey(), `${today.getFullYear()}-01-01`) + 1;
  quote.textContent = dailyQuotes[dayOfYear % dailyQuotes.length];
}

function renderStats() {
  const home = planner.stats(state.tasks, todayKey());
  const selected = planner.stats(state.tasks, state.selectedDate);
  $("#doneCount").textContent = `${home.done} / ${home.total}`;
  $("#homePercent").textContent = `${home.percent}%`;
  $("#plannedMinutes").textContent = formatMinutes(home.remainingMinutes);
  $("#plannerPercent").textContent = `${selected.percent}%`;
  $("#plannerProgressBar").style.width = `${selected.percent}%`;
  $("#plannerProgressLabel").textContent = state.selectedDate === todayKey() ? "오늘의 미션 달성도" : `${formatDate(state.selectedDate)} 달성도`;
  $("#plannerProgressCopy").textContent = `${selected.total}개 중 ${selected.done}개 완료`;
  $("#remainingTime").textContent = `남은 시간 ${formatMinutes(selected.remainingMinutes)}`;
  $("#allTaskCount").textContent = selected.total;
  const streak = planner.streak(state.tasks, todayKey());
  $("#streakCount").textContent = streak ? `${streak}일 연속` : "오늘부터 시작";
  $("#streakChip").setAttribute("aria-label", `실제 완료 기록 기준 연속 공부 ${streak}일`);
}

function renderWeekStrip() {
  $("#weekStrip").innerHTML = planner.weekDates(state.selectedDate).map((date) => `<button class="day-cell ${date === state.selectedDate ? "active" : ""}" data-date="${date}" aria-pressed="${date === state.selectedDate}" aria-label="${formatDate(date, true)}${date === todayKey() ? ", 오늘" : ""}"><small>${new Date(`${date}T12:00:00`).toLocaleDateString("ko-KR", {weekday:"short"})}</small><strong>${Number(date.slice(-2))}</strong>${state.tasks.some((task) => task.date === date) ? "<i></i>" : ""}</button>`).join("");
}

function renderTasks() {
  const list = $("#taskList");
  const visible = planner.tasksForDate(state.tasks, state.selectedDate).filter((task) => state.filter === "all" || task.subject === state.filter);
  list.innerHTML = visible.map((task) => {
    const subject = subjectMeta[task.subject] || subjectMeta.math;
    const status = task.status === "done" ? "완료" : task.id === state.timerTaskId && state.timerRunning ? "집중 중" : "예정";
    return `<article class="task-card ${task.status === "done" ? "completed" : ""}" data-task-id="${escapeHtml(task.id)}">
      <div class="task-head"><button class="task-check" data-action="toggle-task" aria-label="${escapeHtml(task.title)} ${task.status === "done" ? "완료 취소" : "완료 처리"}">${task.status === "done" ? "✓" : ""}</button><div class="task-main"><h3>${escapeHtml(task.title)}</h3><div class="task-meta"><span class="subject-label ${subject.badge}">${subject.label} ${subject.symbol}</span><span>${escapeHtml(task.range || "교재·범위 미입력")}</span></div></div><span class="task-status">${status}</span></div>
      <div class="task-footer"><span>◷ ${escapeHtml(task.time || "시간 미정")} · ${task.minutes}분</span>${task.status === "done" ? "<strong>기록됨</strong>" : `<button class="task-start" data-action="start-task">시작하기</button>`}</div>
      <div class="timetable-actions"><button data-action="edit-task">수정</button><button data-action="delete-task">삭제</button></div>
    </article>`;
  }).join("") || `<div class="empty-state glass-card">선택한 날짜에 ${state.filter === "all" ? "등록한 계획이" : "이 과목 계획이"} 없어요.<br><button class="outline-button" data-add-task>＋ 계획 추가</button></div>`;
}

function renderAccount() {
  const signedIn = Boolean(state.googleConnected && state.googleCredential);
  const openedFromFile = window.location.protocol === "file:";
  $("#profileName").textContent = "용자";
  $("#profileEmail").textContent = signedIn ? "Google 로그인 응답을 받았어요. AI 질문 시 서버에서 인증을 확인해요." : "이름·이메일·사진은 프로필에 표시하지 않아요.";
  $("#googleButtonLabel").textContent = signedIn ? "Google 계정 다시 인증하기" : "Google 계정으로 계속하기";
  $("#googleLogin").style.opacity = signedIn ? ".72" : "1";
  // 설정이 없더라도 버튼은 눌리게 두고, 필요한 조치를 안내합니다.
  $("#googleLogin").disabled = false;
  $("#googleHelper").textContent = openedFromFile
    ? "index.html을 직접 열지 말고 http://127.0.0.1:4173에서 실행해 주세요."
    : hasGoogleClientId
      ? (signedIn ? "인증 정보는 현재 페이지에서만 유지돼요." : "Google 로그인 후 Gemini AI 튜터를 사용할 수 있어요.")
      : "config.js에 Google Web Client ID를 설정하면 로그인이 활성화돼요.";
  const aiStatus = signedIn ? "질문을 보내보세요" : hasGoogleClientId ? "Google 로그인 필요" : "서버 설정 필요";
  if ($("#homeGeminiStatus")) $("#homeGeminiStatus").textContent = aiStatus;
  if ($("#aiConnectionStatus")) $("#aiConnectionStatus").textContent = aiStatus;
  $("#profileAvatar").textContent = "용";
  $("#avatarLetter").textContent = "용";
  $$(".level-option").forEach((option) => option.classList.toggle("active", option.dataset.level === state.level));
  renderContext();
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
  $("#previewThemeName").textContent = theme.name;
  $("#previewThemeBadge").textContent = theme.name;
  const firstTodayTask = planner.tasksForDate(state.tasks, todayKey())[0];
  $("#previewTimerValue").textContent = firstTodayTask ? formatMinutes(firstTodayTask.minutes) : "--:--";
  $$(".theme-tile").forEach((tile) => tile.classList.toggle("active", tile.dataset.theme === state.theme));
}

function renderAll() {
  renderDates();
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
  renderHomeTimeline();
  renderTasks();
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
  renderHomeTimeline();
  renderTasks();
}

function openTimer(task) {
  if (!task) { showToast("먼저 공부할 계획을 등록해 주세요."); return; }
  state.timerTaskId = task.id;
  $("#timerTitle").textContent = task.title;
  $("#timerModal .muted").textContent = task.range || `${subjectMeta[task.subject]?.label || "학습"} · ${task.minutes}분`;
  state.timerSeconds = task.minutes * 60;
  state.timerTotal = task.minutes * 60;
  stopTimer();
  openModal("timerModal");
  renderTimer();
}

function handleGoogleCredential(response) {
  if (!response?.credential) {
    showToast("Google 로그인 응답을 확인하지 못했어요.");
    return;
  }
  state.googleCredential = response.credential;
  state.googleConnected = true;
  renderAccount();
  closeModal("profileModal");
  showToast("Google 로그인 응답을 받았어요.");
}

function initGoogleAuth() {
  if (!hasGoogleClientId) {
    renderAccount();
    return;
  }
  if (!window.google?.accounts?.id) {
    window.setTimeout(initGoogleAuth, 250);
    return;
  }
  window.google.accounts.id.initialize({
    client_id: appConfig.googleClientId,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
}

function openGoogleLogin() {
  if (window.location.protocol === "file:") {
    showToast("index.html을 직접 열 수 없어요. 로컬 서버 주소로 접속해 주세요.");
    return;
  }
  if (!hasGoogleClientId) {
    showToast("config.js에 Google Web Client ID를 먼저 설정해 주세요.");
    return;
  }
  if (!window.google?.accounts?.id) {
    showToast("Google 로그인 모듈을 불러오는 중이에요. 잠시 후 다시 눌러주세요.");
    return;
  }
  window.google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
      showToast("Google 로그인 창이 표시되지 않았어요. 브라우저 팝업 차단을 확인해 주세요.");
    }
  });
}

function buildStudyContext() {
  return {
    today: todayKey(),
    level: state.level || "미설정",
    exam: state.exam.date ? { title: redactPotentialPersonalData(state.exam.title), date: state.exam.date, daysLeft: planner.daysUntil(state.exam.date, todayKey()) } : null,
    tasks: planner.tasksForDate(state.tasks, todayKey()).map(({ subject, title, range, minutes, status, date, time }) => ({ subject, title: redactPotentialPersonalData(title), range: redactPotentialPersonalData(range), minutes, status, date, time })),
    instructions: "고등학생에게 친절하고 짧은 한국어로 답하고, 실제 등록된 오늘의 계획과 시험일, 학습 수준만 사용하세요. 비어 있는 교재·진도·수준은 추측하지 말고 물어보세요. 답변은 제안이며 저장된 시간표를 직접 변경하지는 않습니다.",
  };
}

const personalDataPatterns = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi,
  /\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g,
  /\b\d{6}[ -]?[1-4]\d{6}\b/g,
];

function redactPotentialPersonalData(value) {
  return personalDataPatterns.reduce((result, pattern) => result.replace(pattern, "[개인정보 삭제됨]"), String(value ?? ""));
}

function containsPotentialPersonalData(value) {
  const text = String(value ?? "");
  return personalDataPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    const matched = pattern.test(text);
    pattern.lastIndex = 0;
    return matched;
  });
}

// 예전에 저장된 미션에도 이메일·전화번호 형식이 있으면 브라우저 저장값에서 제거합니다.
state.tasks = state.tasks.map((task) => ({ ...task, title: redactPotentialPersonalData(task.title), range: redactPotentialPersonalData(task.range) }));
state.exam.title = redactPotentialPersonalData(state.exam.title);
persist();

async function requestGemini(message) {
  if (!state.googleCredential) throw new Error("Google 로그인 후 Gemini를 사용할 수 있어요.");
  const response = await fetch(`${apiBaseUrl}/api/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.googleCredential}` },
    body: JSON.stringify({ prompt: message, context: buildStudyContext(), history: state.chatHistory.slice(-8) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Gemini 응답을 받지 못했어요.");
  return {
    text: payload.text || "Gemini가 답변을 만들지 못했어요.",
    model: payload.model,
    fallbackUsed: payload.fallbackUsed === true,
  };
}

function appendChatBubble(message, type) {
  const windowEl = $("#chatWindow");
  $("#chatEmptyState")?.remove();
  if (type === "user") windowEl.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHtml(message)}</div>`);
  else windowEl.insertAdjacentHTML("beforeend", `<div class="bubble ai"><div class="bubble-label"><span class="ai-mini">✦</span> 용자 AI</div><p>${escapeHtml(message).replace(/\n/g, "<br />")}</p></div>`);
  windowEl.scrollTop = windowEl.scrollHeight;
}

async function sendChat(message) {
  const clean = message.trim();
  if (!clean || state.aiBusy) return;
  if (containsPotentialPersonalData(clean)) {
    showToast("이름·연락처·이메일 같은 개인정보는 입력하지 말아 주세요.");
    return;
  }
  const windowEl = $("#chatWindow");
  appendChatBubble(clean, "user");
  $("#chatInput").value = "";
  state.aiBusy = true;
  const loading = document.createElement("div");
  loading.className = "bubble ai ai-loading";
  loading.textContent = "Gemini가 학습 맥락을 읽고 있어요";
  windowEl.appendChild(loading);
  windowEl.scrollTop = windowEl.scrollHeight;
  try {
    const result = await requestGemini(clean);
    if (result.fallbackUsed) showToast(`기본 Gemini 모델에 일시적인 문제가 있어 ${result.model}로 답변했어요.`);
    loading.remove();
    appendChatBubble(result.text, "ai");
    state.chatHistory.push({ role: "user", text: clean }, { role: "assistant", text: result.text });
  } catch (error) {
    loading.remove();
    appendChatBubble(error.message, "ai");
  } finally {
    state.aiBusy = false;
  }
}

async function sendHomeChat(message) {
  const clean = message.trim();
  if (!clean || state.aiBusy) return;
  if (containsPotentialPersonalData(clean)) {
    showToast("이름·연락처·이메일 같은 개인정보는 입력하지 말아 주세요.");
    return;
  }
  const reply = $("#homeAiReply");
  $("#homeChatInput").value = "";
  reply.innerHTML = `<strong><span class="ai-mini">✦</span> 용자 AI</strong> <span class="ai-loading">타임테이블을 확인하고 있어요</span>`;
  reply.classList.add("show");
  state.aiBusy = true;
  try {
    const result = await requestGemini(clean);
    if (result.fallbackUsed) showToast(`기본 Gemini 모델에 일시적인 문제가 있어 ${result.model}로 답변했어요.`);
    reply.innerHTML = `<strong><span class="ai-mini">✦</span> 용자 AI</strong> ${escapeHtml(result.text).replace(/\n/g, "<br />")}`;
    state.chatHistory.push({ role: "user", text: clean }, { role: "assistant", text: result.text });
  } catch (error) {
    reply.innerHTML = `<strong><span class="ai-mini">✦</span> 용자 AI</strong> ${escapeHtml(error.message)}`;
  } finally {
    state.aiBusy = false;
  }
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = (tool) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
  register({ name: "read_study_plan", title: "Read study plan", description: "Read the selected date's study plan.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ date: state.selectedDate, tasks: planner.tasksForDate(state.tasks, state.selectedDate) }) });
  register({ name: "complete_study_task", title: "Complete study task", description: "Mark one study task complete and update the planner.", inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: ({ taskId }) => { const task = state.tasks.find((item) => item.id === taskId); if (!task) throw new Error("task not found"); if (task.status !== "done") toggleTask(task); return { id: task.id, status: task.status }; } });
  window.addEventListener("beforeunload", () => lifecycle.abort(), { once: true });
}

function toggleTask(task) {
  task.status = task.status === "done" ? "pending" : "done";
  task.completedDate = task.status === "done" ? todayKey() : "";
  if (task.id === state.timerTaskId && task.status === "done") stopTimer();
  persist(); renderAll();
}

function openTaskEditor(task) {
  $("#taskForm").reset();
  $("#taskId").value = task?.id || "";
  $("#taskModalTitle").textContent = task ? "계획 수정" : "새 미션 추가";
  $("#taskDate").value = task?.date || (state.screen === "planner" ? state.selectedDate : todayKey());
  $("#taskTime").value = task?.time || "";
  if (task) {
    $("#taskTitle").value = task.title;
    $("#taskRange").value = task.range;
    $("#taskSubject").value = task.subject;
    $("#taskMinutes").value = task.minutes;
  }
  openModal("taskModal");
}

function openExamEditor() {
  $("#examTitle").value = state.exam.title;
  $("#examInput").value = state.exam.date;
  closeModal("profileModal");
  openModal("examModal");
}

function clearConversation() {
  if (state.aiBusy) { showToast("답변이 끝난 뒤 대화를 초기화할 수 있어요."); return; }
  state.chatHistory = [];
  $("#chatWindow").innerHTML = '<div class="empty-state" id="chatEmptyState">등록한 계획을 바탕으로 궁금한 점을 물어보세요.</div>';
  $("#homeAiReply").replaceChildren();
  $("#homeAiReply").classList.remove("show");
  showToast("대화를 초기화했어요.");
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
    if (action.dataset.action === "toggle-task" && task) { toggleTask(task); showToast(task.status === "done" ? "미션을 완료했어요." : "미션을 다시 계획에 넣었어요."); }
    if (action.dataset.action === "start-task" && task) openTimer(task);
    if (action.dataset.action === "edit-task" && task) openTaskEditor(task);
    if (action.dataset.action === "delete-task" && task) {
      if (!window.confirm(`‘${task.title}’ 계획을 삭제할까요?`)) return;
      if (state.timerTaskId === task.id) { stopTimer(); state.timerTaskId = null; }
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      persist(); renderAll(); showToast("계획을 삭제했어요.");
    }
  }
  if (event.target.closest("#profileButton")) openModal("profileModal");
  if (event.target.closest("#addTaskButton, [data-add-task]")) openTaskEditor();
  if (event.target.closest("#examSettingsButton, [data-open-study-settings]")) openExamEditor();
  const dateButton = event.target.closest("[data-date]");
  if (dateButton) { state.selectedDate = dateButton.dataset.date; renderAll(); }
  if (event.target.closest("#prevWeek")) { state.selectedDate = planner.shiftDate(state.selectedDate, -7); renderAll(); }
  if (event.target.closest("#nextWeek")) { state.selectedDate = planner.shiftDate(state.selectedDate, 7); renderAll(); }
  if (event.target.closest("#todayPlan")) { state.selectedDate = todayKey(); renderAll(); }
  if (event.target.closest("#refreshPlan")) { renderAll(); showToast("오늘의 계획을 다시 확인했어요."); }
  if (event.target.closest("#googleLogin")) openGoogleLogin();
  const level = event.target.closest(".level-option");
  if (level) { state.level = level.dataset.level; persist(); renderAccount(); showToast(`학습 수준을 ${state.level}(으)로 설정했어요.`); }
  if (event.target.closest("#editContext")) { openModal("profileModal"); }
  if (event.target.closest("#clearChat")) clearConversation();
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
  const range = $("#taskRange").value.trim();
  const minutes = Number($("#taskMinutes").value);
  const date = $("#taskDate").value;
  const time = $("#taskTime").value;
  if (!title || title.length > 120 || range.length > 160 || !Number.isInteger(minutes) || minutes < 5 || minutes > 300 || !planner.validDateKey(date) || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) { showToast("날짜와 예상 시간(5~300분)을 확인해 주세요."); return; }
  if (containsPotentialPersonalData(title) || containsPotentialPersonalData(range)) {
    showToast("미션에는 이름·연락처·이메일 같은 개인정보를 입력하지 말아 주세요.");
    return;
  }
  const editing = state.tasks.find((task) => task.id === $("#taskId").value);
  const values = { subject: $("#taskSubject").value, title, range, minutes, date, time };
  if (editing) {
    if (editing.id === state.timerTaskId) { stopTimer(); state.timerTaskId = null; }
    Object.assign(editing, values);
  } else state.tasks.push({ id: window.crypto.randomUUID(), ...values, status: "pending", current: false, completedDate: "" });
  state.selectedDate = date;
  persist(); renderAll(); closeModal("taskModal"); event.target.reset(); showToast(editing ? "계획을 수정했어요." : `${formatDate(date)} 계획에 추가했어요.`);
});

$("#examForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#examTitle").value.trim();
  const date = $("#examInput").value;
  if (!planner.validDateKey(date)) { showToast("시험일을 선택해 주세요."); return; }
  if (containsPotentialPersonalData(title)) { showToast("시험 이름에는 개인정보를 입력하지 말아 주세요."); return; }
  state.exam = { title: title.slice(0, 60), date };
  persist(); renderAll(); closeModal("examModal"); showToast("시험일을 저장했어요.");
});
$("#clearExam").addEventListener("click", () => {
  state.exam = { title: "", date: "" };
  persist(); renderAll(); closeModal("examModal"); showToast("시험일 설정을 지웠어요.");
});

$("#chatForm").addEventListener("submit", (event) => { event.preventDefault(); sendChat($("#chatInput").value); });
$("#homeChatForm").addEventListener("submit", (event) => { event.preventDefault(); sendHomeChat($("#homeChatInput").value); });

[["blurRange", "blurValue"], ["darkRange", "darkValue"], ["glowRange", "glowValue"]].forEach(([input, output]) => { $(`#${input}`).addEventListener("input", (event) => { $(`#${output}`).textContent = `${event.target.value}%`; }); });

renderAll();
renderTimer();
registerWebMcp();
initGoogleAuth();

function refreshCalendar() {
  const today = todayKey();
  if (today !== state.lastToday) {
    if (state.selectedDate === state.lastToday) state.selectedDate = today;
    state.lastToday = today;
    renderAll();
  } else renderDates();
}
setInterval(refreshCalendar, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCalendar(); });
