/* =====================================================================
   Dynamic List — application logic
   Plain JavaScript (no frameworks, no build step), saved in localStorage.
   Layout influenced by "Nice Layout.jpg" and "transparent design.png".
   ===================================================================== */

/* ---------------------------------------------------------------
   1. Constants and helpers
   --------------------------------------------------------------- */
const STORAGE_KEY = "dynamic-list-v1";
const LEGACY_STORAGE_KEYS = ["ultimate-todo-v1"]; // moved over automatically
const MAX_INLINE_FILE = 600 * 1024; // files bigger than this are metadata only
const PRIORITIES = ["high", "medium", "low"];
const DIFFICULTIES = ["difficult", "moderate", "easy"];
const CATEGORIES = ["Work", "Personal", "Study", "Misc"];
const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VIEWS = ["dashboard", "tasks", "calendar", "activity", "notes", "files", "settings"];
const VIEW_TITLES = {
  dashboard: "Dashboard",
  tasks: "Tasks",
  calendar: "Calendar",
  activity: "Activity",
  notes: "Notes",
  files: "My files",
  settings: "Settings",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const pad = (n) => String(n).padStart(2, "0");
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Escape text before injecting it into innerHTML. */
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------------------------------------------------------------
   2. Date helpers
   --------------------------------------------------------------- */
function isoOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayISO() {
  return isoOf(new Date());
}

function parseISO(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayShift(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function sameDay(a, b) {
  return (
    a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfWeek(date) {
  const copy = new Date(date);
  const offset = (copy.getDay() + 6) % 7; // Monday first
  copy.setDate(copy.getDate() - offset);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

function dueMoment(task) {
  if (!task.due) return null;
  const date = parseISO(task.due);
  if (task.time) {
    const [h, m] = task.time.split(":").map(Number);
    date.setHours(h || 0, m || 0, 0, 0);
  } else {
    date.setHours(23, 59, 0, 0);
  }
  return date;
}

function formatDate(iso) {
  if (!iso) return "No date";
  const date = parseISO(iso);
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()} · ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/* ---------------------------------------------------------------
   3. State, persistence and demo data
   --------------------------------------------------------------- */
const state = {
  tasks: [],
  notes: [],
  files: [], // standalone files dropped on "My files"
  settings: {
    theme: "dark",
    accent: "blue",
    density: "comfortable",
    note: { text: "", at: "" },
  },
};

const ui = {
  view: "dashboard",
  tab: "inbox",
  doneTab: "all",
  chips: new Set(),
  category: "all",
  sort: "manual",
  search: "",
  noteSearch: "",
  selectedDay: null,
  cursor: new Date(),
  editingId: null,
  draggedId: null,
  lastSnapshot: null,
  use12Hour: false,
};

function saveState(silent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    if (!silent) {
      toast("Browser storage is full — try removing some attachments.", "bad");
      console.error(error);
    }
    return false;
  }
}

function readStoredState() {
  // Prefer the current key, but transparently migrate older saves.
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return raw;

  for (let i = 0; i < LEGACY_STORAGE_KEYS.length; i += 1) {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEYS[i]);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      return legacy;
    }
  }
  return null;
}

function loadState() {
  try {
    const raw = readStoredState();
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    state.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
    state.files = Array.isArray(parsed.files) ? parsed.files : [];
    Object.assign(state.settings, parsed.settings || {});
    state.settings.note = Object.assign({ text: "", at: "" }, state.settings.note);
    return true;
  } catch (error) {
    console.error("Could not read saved data", error);
    return false;
  }
}

function newTask(data) {
  return Object.assign(
    {
      id: uid(),
      title: "",
      description: "",
      priority: "medium",
      difficulty: "moderate",
      category: "Misc",
      due: "",
      time: "",
      done: false,
      completedAt: "",
      createdAt: new Date().toISOString(),
      order: state.tasks.length,
      files: [],
    },
    data
  );
}




/* ---------------------------------------------------------------
   4. Task queries — status, filtering, sorting, metrics
   --------------------------------------------------------------- */
function findTask(id) {
  return state.tasks.find((task) => task.id === id) || null;
}

function taskStatus(task) {
  if (task.done) return { key: "done", label: "Done", cls: "ok" };
  if (!task.due) return { key: "nodate", label: "No date", cls: "dim" };
  const due = dueMoment(task);
  if (due && due.getTime() < Date.now()) return { key: "late", label: "Late", cls: "bad" };
  if (task.due === todayISO()) return { key: "today", label: "In progress", cls: "warn" };
  return { key: "track", label: "On track", cls: "ok" };
}

function isOverdue(task) {
  return !task.done && taskStatus(task).key === "late";
}

function inThisWeek(task, reference) {
  if (!task.due) return false;
  const week = startOfWeek(reference || new Date());
  const end = dayShift(week, 7);
  const due = parseISO(task.due);
  return due >= week && due < end;
}

function visibleTasks() {
  const query = ui.search.trim().toLowerCase();

  const list = state.tasks.filter((task) => {
    if (ui.tab === "completed") {
      if (!task.done) return false;
    } else if (task.done) {
      return false;
    }

    if (ui.tab === "today" && task.due !== todayISO()) return false;
    if (ui.tab === "upcoming" && (!task.due || task.due <= todayISO())) return false;
    if (ui.tab === "overdue" && !isOverdue(task)) return false;
    if (ui.selectedDay && task.due !== ui.selectedDay) return false;
    if (ui.category !== "all" && task.category !== ui.category) return false;

    if (ui.chips.size) {
      const matches = Array.from(ui.chips).some(
        (chip) => chip === task.priority || chip === task.difficulty
      );
      if (!matches) return false;
    }

    if (query) {
      const haystack = `${task.title} ${task.description} ${task.category}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });

  return sortTasks(list);
}

function sortTasks(list) {
  const arr = list.slice();
  if (ui.sort === "due") {
    arr.sort((a, b) => String(a.due || "9999-12-31").localeCompare(String(b.due || "9999-12-31")));
  } else if (ui.sort === "priority") {
    arr.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);
  } else if (ui.sort === "created") {
    arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } else if (ui.sort === "az") {
    arr.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  return arr;
}

function completedTasks() {
  const now = new Date();
  let list = state.tasks.filter((task) => task.done);

  if (ui.doneTab === "today") {
    list = list.filter((task) => sameDay(new Date(task.completedAt), now));
  } else if (ui.doneTab === "week") {
    const week = startOfWeek(now).getTime();
    list = list.filter((task) => new Date(task.completedAt).getTime() >= week);
  } else if (ui.doneTab === "month") {
    list = list.filter((task) => {
      const date = new Date(task.completedAt);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
  }

  return list.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
}

function completedOn(isoDay) {
  return state.tasks.filter((task) => task.done && isoOf(new Date(task.completedAt)) === isoDay);
}

function metrics() {
  const total = state.tasks.length;
  const done = state.tasks.filter((task) => task.done).length;
  const overdue = state.tasks.filter(isOverdue);
  const todays = state.tasks.filter((task) => task.due === todayISO() && !task.done);
  const critical = overdue.filter((task) => task.priority === "high").length;

  return {
    total,
    done,
    pending: total - done,
    overdue,
    todays,
    critical,
    rate: total ? Math.round((done / total) * 100) : 0,
  };
}

function todayProgress() {
  const today = todayISO();
  const dueToday = state.tasks.filter((task) => task.due === today);
  const doneToday = completedOn(today).length;
  const yesterday = completedOn(isoOf(dayShift(new Date(), -1))).length;
  const pool = dueToday.length ? dueToday.length : Math.max(state.tasks.length, 1);
  const percent = Math.min(100, Math.round((doneToday / pool) * 100));
  const yesterdayPercent = Math.min(100, Math.round((yesterday / pool) * 100));
  return { percent: percent, delta: percent - yesterdayPercent };
}

function monthProgress() {
  const now = new Date();
  const inMonth = state.tasks.filter((task) => {
    if (!task.due) return false;
    const due = parseISO(task.due);
    return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
  });
  const doneInMonth = inMonth.filter((task) => task.done).length;
  const percent = inMonth.length
    ? Math.round((doneInMonth / inMonth.length) * 100)
    : metrics().rate;
  return { percent: percent, total: inMonth.length, done: doneInMonth };
}

function streakDays() {
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const day = isoOf(dayShift(new Date(), -i));
    if (completedOn(day).length) {
      streak += 1;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

/* ---------------------------------------------------------------
   5. Rendering — task lists
   --------------------------------------------------------------- */
function emptyHTML(message, icon) {
  return `<span class="big" aria-hidden="true">${icon || "🌙"}</span><p>${esc(message)}</p>`;
}

function filesHTML(task) {
  if (!task.files || !task.files.length) return "";
  const pills = task.files
    .map(
      (file) => `<span class="file-pill">📎 <b title="${esc(file.name)}">${esc(file.name)}</b>
        ${file.data ? `<button data-action="open-file" data-id="${task.id}" data-file="${file.id}" title="Download">↓</button>` : ""}
        <button data-action="remove-file" data-id="${task.id}" data-file="${file.id}" title="Remove">✕</button>
      </span>`
    )
    .join("");
  return `<div class="attachments">${pills}</div>`;
}

function taskRowHTML(task) {
  const status = taskStatus(task);
  const dueClass = task.due === todayISO() ? "today" : isOverdue(task) ? "late" : "";
  const dueText = task.due
    ? `${formatDate(task.due)}${task.time ? ` · ${task.time}` : ""}`
    : "No date";

  return `<li class="task${task.done ? " done" : ""}" data-id="${task.id}" draggable="true" tabindex="0">
    <span class="drag-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
    <label class="check" title="Toggle done">
      <input type="checkbox" data-action="toggle" data-id="${task.id}" ${task.done ? "checked" : ""}
        aria-label="Mark ${esc(task.title)} as done">
      <span class="box">✓</span>
    </label>
    <div class="task-body">
      <p class="task-title">${esc(task.title)}</p>
      ${task.description ? `<p class="task-desc">${esc(task.description)}</p>` : ""}
      <div class="task-tags">
        <span class="tag ${task.priority}">${cap(task.priority)} priority</span>
        <span class="tag ${task.difficulty}">${cap(task.difficulty)}</span>
        <span class="tag plain">${esc(task.category)}</span>
      </div>
      ${filesHTML(task)}
    </div>
    <div class="task-meta">
      <span class="due ${dueClass}">${esc(dueText)}</span>
      <span class="status ${status.cls}">${status.label}</span>
    </div>
    <div class="task-actions">
      <button class="mini-btn" data-action="attach" data-id="${task.id}" title="Attach a file">📎</button>
      <button class="mini-btn" data-action="edit" data-id="${task.id}" title="Edit task">✎</button>
      <button class="mini-btn danger" data-action="delete" data-id="${task.id}" title="Delete task">🗑</button>
    </div>
  </li>`;
}

function tabMessage() {
  if (ui.selectedDay) return `Nothing scheduled for ${formatDate(ui.selectedDay)}.`;
  if (ui.chips.size) return "No tasks match these priority filters.";
  if (ui.search) return `No task matches “${ui.search}”.`;
  if (ui.tab === "today") return "Nothing due today — enjoy the clear runway.";
  if (ui.tab === "upcoming") return "No upcoming tasks yet. Add one from the box above.";
  if (ui.tab === "overdue") return "No late tasks. Everything is on track.";
  if (ui.tab === "completed") return "No completed tasks in this range yet.";
  return "Your inbox is empty. Add your first task above.";
}

function renderTaskLists() {
  const list = visibleTasks();
  const html = list.map(taskRowHTML).join("");

  $$("[data-task-list]").forEach((ul) => {
    ul.innerHTML = html;
    const panel = ul.closest(".panel");
    const empty = panel ? $("[data-empty-state]", panel) : null;
    if (!empty) return;
    empty.classList.toggle("hidden", list.length > 0);
    if (!list.length) empty.innerHTML = emptyHTML(tabMessage());
  });

  $$("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === ui.tab);
  });

  const label = `${list.length} task${list.length === 1 ? "" : "s"}`;
  $("#taskCount").textContent = label;
  $("#tasksViewCount").textContent = label;
  $("#calHint").textContent = ui.selectedDay
    ? `Filtering for ${formatDate(ui.selectedDay)} — click the day again to clear.`
    : "Click a day to filter your tasks.";
}

function doneRowHTML(task) {
  return `<div class="done-row" data-id="${task.id}">
    <span class="tick" aria-hidden="true">✓</span>
    <p>${esc(task.title)}</p>
    <span class="status ok">${esc(task.category)}</span>
    <time>${relativeTime(task.completedAt)}</time>
    <button class="mini-btn" data-action="reopen" data-id="${task.id}" title="Reopen task"
      aria-label="Reopen ${esc(task.title)}">↺</button>
  </div>`;
}

function renderCompleted() {
  const list = completedTasks();
  $$("[data-done-list]").forEach((host) => {
    host.innerHTML = list.map(doneRowHTML).join("");
    const panel = host.closest(".panel");
    const empty = panel ? $("[data-empty-state]", panel) : null;
    if (!empty) return;
    empty.classList.toggle("hidden", list.length > 0);
    if (!list.length) empty.innerHTML = emptyHTML("Nothing completed in this range yet.", "🗂");
  });

  $("#doneCount").textContent = `${list.length} done`;
  $$("[data-done-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.doneTab === ui.doneTab);
  });
}

/* ---------------------------------------------------------------
   6. Rendering — stats, breakdown, upcoming
   --------------------------------------------------------------- */
function renderStats() {
  const m = metrics();

  $("#statTotal").textContent = m.total;
  $("#statTotalSub").textContent = m.total ? `${m.pending} still open` : "Nothing yet";

  $("#statDone").textContent = m.done;
  $("#statDoneSub").textContent = `${m.rate}% of all tasks`;

  $("#statPending").textContent = m.pending;
  $("#statPendingSub").textContent = `Due today: ${m.todays.length}`;

  $("#statOverdue").textContent = m.overdue.length;
  $("#statOverdueSub").textContent = `Critical: ${m.critical}`;

  // sidebar badges
  const setBadge = (name, value) => {
    $$(`[data-badge="${name}"]`).forEach((el) => {
      el.textContent = value;
    });
  };
  setBadge("pending", m.pending);
  setBadge("completed", m.done);
  setBadge("notes", state.notes.length + (state.settings.note.text ? 1 : 0));
  setBadge("files", allFiles().length);

  $("#activityDone").textContent = m.done;
  $("#activityStreak").textContent = `${streakDays()}d`;
  $("#rateText").textContent = `${m.rate}%`;
  $("#rateBar").style.width = `${m.rate}%`;
  $("#bigRate").textContent = `${m.rate}%`;
  $("#bigRateBar").style.width = `${m.rate}%`;
  $("#bigChartCount").textContent = `${m.done} finished`;
  $("#storageSize").textContent = storageSize();
}

function storageSize() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || "";
    const kb = new Blob([raw]).size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
  } catch (error) {
    return "0 KB";
  }
}

function renderBreakdown() {
  const m = metrics();
  const open = state.tasks.filter((task) => !task.done);
  const groups = [
    { label: "Overdue", hint: "Past their due date", count: m.overdue.length, cls: "bad" },
    {
      label: "Due today",
      hint: "Scheduled for today",
      count: state.tasks.filter((task) => task.due === todayISO() && !task.done).length,
      cls: "warn",
    },
    {
      label: "This week",
      hint: "Monday to Sunday",
      count: open.filter((task) => inThisWeek(task)).length,
      cls: "ok",
    },
    {
      label: "Later",
      hint: "Beyond this week",
      count: open.filter((task) => task.due && task.due > todayISO() && !inThisWeek(task)).length,
      cls: "",
    },
    {
      label: "No date",
      hint: "Waiting to be scheduled",
      count: open.filter((task) => !task.due).length,
      cls: "dim",
    },
    {
      label: "High priority",
      hint: "Open high priority tasks",
      count: open.filter((task) => task.priority === "high").length,
      cls: "bad",
    },
    {
      label: "Critical",
      hint: "High priority and overdue",
      count: m.critical,
      cls: "bad",
    },
  ];

  $("#breakdown").innerHTML = groups
    .map(
      (group) => `<div class="file-row">
        <span class="ico" aria-hidden="true">▸</span>
        <div>
          <b>${esc(group.label)}</b>
          <small>${esc(group.hint)}</small>
        </div>
        <span class="status ${group.cls}">${group.count}</span>
      </div>`
    )
    .join("");

  $("#breakdownCount").textContent = `${m.pending} open`;
}

function renderUpNext() {
  const now = new Date();
  const list = state.tasks
    .filter((task) => !task.done && task.due && dueMoment(task) >= now)
    .sort((a, b) => dueMoment(a) - dueMoment(b))
    .slice(0, 6);

  $("#upNext").innerHTML = list
    .map(
      (task) => `<div class="done-row" data-id="${task.id}">
        <span class="tick" aria-hidden="true">◷</span>
        <p>${esc(task.title)}</p>
        <span class="status ${taskStatus(task).cls}">${cap(task.priority)}</span>
        <time>${esc(formatDate(task.due))}</time>
      </div>`
    )
    .join("");

  $("#upNextCount").textContent = `${list.length}`;
  const empty = $("#upNextEmpty");
  empty.classList.toggle("hidden", list.length > 0);
  if (!list.length) empty.innerHTML = emptyHTML("Nothing scheduled ahead.", "📭");
}

function renderWeekList() {
  const today = new Date();
  const rows = [];
  for (let i = 0; i < 7; i += 1) {
    const day = dayShift(today, i);
    const iso = isoOf(day);
    const tasks = state.tasks
      .filter((task) => task.due === iso && !task.done)
      .sort((a, b) => String(a.time || "23:59").localeCompare(String(b.time || "23:59")));
    tasks.forEach((task) => {
      rows.push(`<div class="done-row" data-id="${task.id}">
        <span class="tick" aria-hidden="true">${i === 0 ? "★" : "◷"}</span>
        <p>${esc(task.title)}</p>
        <span class="status ${taskStatus(task).cls}">${i === 0 ? "Today" : DAY_NAMES[day.getDay()].slice(0, 3)}</span>
        <time>${esc(task.time || "—")}</time>
      </div>`);
    });
  }

  $("#weekList").innerHTML = rows.length
    ? rows.join("")
    : emptyHTML("No scheduled tasks in the next seven days.", "🗓");
  $("#weekCount").textContent = `${rows.length}`;
}

/* ---------------------------------------------------------------
   7. Rendering — clock, progress rings, calendar
   --------------------------------------------------------------- */
function renderClock() {
  const now = new Date();
  const hours = now.getHours();
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const hourBox = $("#clockH");
  hourBox.textContent = pad(ui.use12Hour ? h12 : hours);
  hourBox.title = hours >= 12 ? "PM" : "AM";
  $("#clockM").textContent = pad(now.getMinutes());
  $("#clockS").textContent = pad(now.getSeconds());
  $("#dayName").textContent = `${DAY_NAMES[now.getDay()]} ${now.getDate()}`;

  const progress = todayProgress();
  const circumference = 2 * Math.PI * 42;
  const ring = $("#todayRingValue");
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference - (circumference * progress.percent) / 100}`;
  $("#todayPct").textContent = `${progress.percent}%`;

  const trend = $("#trendText");
  const sign = progress.delta >= 0 ? "+" : "";
  trend.textContent = `${sign}${progress.delta}% vs yesterday`;
  trend.classList.toggle("up", progress.delta >= 0);
  trend.classList.toggle("down", progress.delta < 0);

  const month = monthProgress();
  $("#monthPct").textContent = `${month.percent}%`;
  $("#monthBar").style.width = `${month.percent}%`;

  const left = Math.max(0, endOfMonth(now).getTime() - now.getTime());
  const days = Math.floor(left / 86400000);
  const hrs = Math.floor((left % 86400000) / 3600000);
  const mins = Math.floor((left % 3600000) / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  const boxes = $$("#monthCountdown b");
  [days, hrs, mins, secs].forEach((value, index) => {
    if (boxes[index]) boxes[index].textContent = pad(value);
  });
}

function dayHasTasks(iso) {
  return state.tasks.some((task) => task.due === iso);
}

function renderMiniCalendar() {
  const cursor = ui.cursor;
  $("#calTitle").textContent = `${MONTHS[cursor.getMonth()]}, ${cursor.getFullYear()}`;

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = dayShift(first, -((first.getDay() + 6) % 7));
  const cells = [];

  WEEK_LABELS.forEach((label) => cells.push(`<span>${label}</span>`));

  for (let i = 0; i < 42; i += 1) {
    const day = dayShift(start, i);
    const iso = isoOf(day);
    const outside = day.getMonth() !== month;
    const classes = ["cal-day"];
    if (outside) classes.push("muted");
    if (iso === todayISO()) classes.push("today");
    if (iso === ui.selectedDay) classes.push("selected");
    const dot = dayHasTasks(iso) ? `<span class="dotmark"></span>` : "";
    cells.push(
      `<button class="${classes.join(" ")}" data-cal-day="${iso}" type="button"
        title="${esc(formatDate(iso))}">${day.getDate()}${dot}</button>`
    );
  }

  $("#calGrid").innerHTML = cells.join("");
}

function renderMonthCalendar() {
  const cursor = ui.cursor;
  $("#monthTitle").textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = dayShift(first, -((first.getDay() + 6) % 7));
  const cells = [];

  WEEK_LABELS.forEach((label) => cells.push(`<span>${label}</span>`));

  let monthCount = 0;

  for (let i = 0; i < 42; i += 1) {
    const day = dayShift(start, i);
    const iso = isoOf(day);
    const outside = day.getMonth() !== month;
    const tasks = state.tasks
      .filter((task) => task.due === iso)
      .sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);
    if (!outside) monthCount += tasks.length;

    const classes = ["month-cell"];
    if (outside) classes.push("muted");
    if (iso === todayISO()) classes.push("today");
    if (iso === ui.selectedDay) classes.push("selected");

    const chips = tasks
      .slice(0, 3)
      .map((task) => {
        const cls = task.done ? "done" : task.priority === "high" ? "high" : "";
        return `<span class="mini-task ${cls}" title="${esc(task.title)}">${esc(task.title)}</span>`;
      })
      .join("");
    const more = tasks.length > 3 ? `<span class="cell-more">+${tasks.length - 3} more</span>` : "";

    cells.push(`<button class="${classes.join(" ")}" data-cal-day="${iso}" type="button"
      aria-label="${esc(formatDate(iso))}">
      <b>${day.getDate()}</b>${chips}${more}
    </button>`);
  }

  $("#monthGrid").innerHTML = cells.join("");
  $("#monthTaskCount").textContent = `${monthCount} task${monthCount === 1 ? "" : "s"} this month`;

  renderDayPanel();
}

function renderDayPanel() {
  const iso = ui.selectedDay;
  const title = $("#dayPanelTitle");
  const count = $("#dayPanelCount");
  const list = $("[data-day-list]");
  const empty = $("[data-day-empty]");

  if (!iso) {
    title.textContent = "Pick a day";
    count.textContent = "";
    if (list) list.innerHTML = "";
    empty.innerHTML = emptyHTML("Click any day in the grid above to see its tasks.", "🗓");
    return;
  }

  const tasks = state.tasks
    .filter((task) => task.due === iso)
    .sort((a, b) => String(a.time || "23:59").localeCompare(String(b.time || "23:59")));

  title.textContent = formatDate(iso);
  count.textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
  if (list) list.innerHTML = tasks.map(taskRowHTML).join("");
  empty.innerHTML = tasks.length ? "" : emptyHTML("Nothing on this day yet.", "🌤");
}

/* ---------------------------------------------------------------
   8. Rendering — charts, activity numbers, report
   --------------------------------------------------------------- */
function completionCountsByDay(days) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = dayShift(new Date(), -i);
    const iso = isoOf(day);
    out.push({
      label: days > 10 ? String(day.getDate()) : WEEK_LABELS[(day.getDay() + 6) % 7],
      iso: iso,
      count: completedOn(iso).length,
    });
  }
  return out;
}

function barChartHTML(items, highlightLast) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return items
    .map((item, index) => {
      const now = highlightLast && index === items.length - 1;
      return `<div class="bar-col${now ? " now" : ""}" title="${item.count} completed">
        <i style="height: ${Math.max(4, (item.count / max) * 100)}%"></i>
        <span>${esc(item.label)}</span>
      </div>`;
    })
    .join("");
}

function renderCharts() {
  const week = completionCountsByDay(7);
  $("#miniChart").innerHTML = barChartHTML(week, true);

  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const count = state.tasks.filter((task) => {
      if (!task.done || !task.completedAt) return false;
      const when = new Date(task.completedAt);
      return when.getMonth() === cursor.getMonth() && when.getFullYear() === cursor.getFullYear();
    }).length;
    months.push({ label: MONTHS_SHORT[cursor.getMonth()], count: count });
  }
  $("#bigChart").innerHTML = barChartHTML(months, true);

  const lastWeek = week.reduce((sum, item) => sum + item.count, 0);
  const last30 = completionCountsByDay(30).reduce((sum, item) => sum + item.count, 0);
  const thisMonth = months[months.length - 1].count;

  $("#actWeek").textContent = lastWeek;
  $("#actWeekSub").textContent = "completed in the last 7 days";
  $("#actMonth").textContent = thisMonth;
  $("#actMonthSub").textContent = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  $("#actAvg").textContent = (last30 / 30).toFixed(1);
  $("#actStreak").textContent = `${streakDays()}d`;
  $("#reportOut").textContent = buildReport();
}

function buildReport() {
  const m = metrics();
  const now = new Date();
  const week = completionCountsByDay(7).reduce((sum, item) => sum + item.count, 0);
  const lines = [
    "DYNAMIC LIST — REPORT",
    `Generated ${DAY_NAMES[now.getDay()]} ${formatDate(isoOf(now))} at ${pad(now.getHours())}:${pad(
      now.getMinutes()
    )}`,
    "",
    `Total tasks ........... ${m.total}`,
    `Completed ............. ${m.done} (${m.rate}%)`,
    `Still open ............ ${m.pending}`,
    `Overdue ............... ${m.overdue.length}`,
    `Due today ............. ${m.todays.length}`,
    `Completed last 7 days . ${week}`,
    `Completion streak ..... ${streakDays()} day(s)`,
    "",
    "TOP OPEN TASKS",
  ];

  const open = sortTasks(state.tasks.filter((task) => !task.done)).slice(0, 8);
  if (!open.length) lines.push("• nothing open — inbox zero");
  open.forEach((task) => {
    lines.push(
      `• [${cap(task.priority)}] ${task.title} — ${
        task.due ? formatDate(task.due) : "no date"
      } (${taskStatus(task).label})`
    );
  });

  const overdue = state.tasks.filter(isOverdue);
  lines.push("", "OVERDUE");
  if (!overdue.length) lines.push("• none");
  overdue.slice(0, 8).forEach((task) => lines.push(`• ${task.title} — was due ${formatDate(task.due)}`));

  return lines.join("\n");
}

/* ---------------------------------------------------------------
   9. Rendering — notes, files, settings, bell
   --------------------------------------------------------------- */
function renderNotes() {
  const query = ui.noteSearch.trim().toLowerCase();
  const sorted = state.notes
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const list = sorted.filter(
    (note) => !query || `${note.title} ${note.body}`.toLowerCase().includes(query)
  );

  $("#notesList").innerHTML = list
    .map(
      (note) => `<article class="note-card" data-note="${note.id}">
        <h3>${esc(note.title || "Untitled note")}</h3>
        <p>${esc(note.body)}</p>
        <small>Updated ${relativeTime(note.updatedAt)}</small>
        <div class="note-foot">
          <button class="btn small ghost" data-action="pin-note" data-note="${note.id}" type="button">
            Pin to dashboard
          </button>
          <span class="spacer"></span>
          <button class="mini-btn danger" data-action="delete-note" data-note="${note.id}"
            title="Delete note">🗑</button>
        </div>
      </article>`
    )
    .join("");

  $("#notesCount").textContent = `${list.length} note${list.length === 1 ? "" : "s"}`;
  const empty = $("#notesEmpty");
  empty.classList.toggle("hidden", list.length > 0);
  if (!list.length) empty.innerHTML = emptyHTML("No notes yet — write one on the left.", "🗒");
}

function fileIcon(name) {
  const ext = String(name).split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "🖼";
  if (ext === "pdf") return "📕";
  if (["doc", "docx", "txt", "md"].includes(ext)) return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜";
  if (["js", "py", "html", "css", "json"].includes(ext)) return "🧩";
  return "📄";
}

function fileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function allFiles() {
  const fromTasks = state.tasks.flatMap((task) =>
    (task.files || []).map((file) =>
      Object.assign({}, file, { taskId: task.id, taskTitle: task.title })
    )
  );
  const loose = state.files.map((file) => Object.assign({}, file, { taskId: "", taskTitle: "" }));
  return fromTasks.concat(loose).sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
}

function fileRowHTML(file) {
  const removeAttrs = file.taskId
    ? `data-action="remove-file" data-id="${file.taskId}"`
    : `data-action="remove-loose"`;
  const openAttrs = file.taskId
    ? `data-action="open-file" data-id="${file.taskId}"`
    : `data-action="open-loose"`;
  const origin = file.taskTitle ? `attached to “${esc(file.taskTitle)}”` : "kept in My files";

  return `<div class="file-row">
    <span class="ico" aria-hidden="true">${fileIcon(file.name)}</span>
    <div>
      <b title="${esc(file.name)}">${esc(file.name)}</b>
      <small>${fileSize(file.size)} · ${origin} · ${relativeTime(file.addedAt)}</small>
    </div>
    ${
      file.data
        ? `<button class="mini-btn" ${openAttrs} data-file="${file.id}" title="Download">↓</button>`
        : `<span class="status dim" title="Too large to store inline">metadata</span>`
    }
    <button class="mini-btn danger" ${removeAttrs} data-file="${file.id}" title="Remove">🗑</button>
  </div>`;
}

function renderFiles() {
  const list = allFiles();

  $("#fileList").innerHTML = list.slice(0, 4).map(fileRowHTML).join("");
  $("#filesViewList").innerHTML = list.map(fileRowHTML).join("");
  $("#filesCount").textContent = `${list.length} file${list.length === 1 ? "" : "s"}`;
  $("#fileHint").textContent = list.length
    ? `${list.length} file${list.length === 1 ? "" : "s"} stored`
    : "Files under 600 KB stay in your browser";

  const empty = $("#filesEmpty");
  empty.classList.toggle("hidden", list.length > 0);
  if (!list.length) empty.innerHTML = emptyHTML("You have not added a file yet.", "📁");

  const select = $("#attachTaskSelect");
  const current = select.value;
  select.innerHTML =
    '<option value="">— choose a task —</option>' +
    state.tasks
      .filter((task) => !task.done)
      .map((task) => `<option value="${task.id}">${esc(task.title)}</option>`)
      .join("");
  if (findTask(current)) select.value = current;
}

function renderNoteWidget() {
  const note = state.settings.note;
  const box = $("#noteBox");
  if (document.activeElement !== box) box.textContent = note.text || "";
  $("#noteTime").textContent = note.at ? `Saved ${relativeTime(note.at)}` : "Not saved yet";
}

function renderBell() {
  const overdue = state.tasks.filter(isOverdue).slice(0, 5);
  const dueToday = state.tasks.filter((task) => !task.done && task.due === todayISO()).slice(0, 5);

  const items = overdue
    .map(
      (task) => `<div class="popover-item">
        <b>${esc(task.title)}</b>
        <small>Late · was due ${esc(formatDate(task.due))}</small>
      </div>`
    )
    .concat(
      dueToday.map(
        (task) => `<div class="popover-item">
          <b>${esc(task.title)}</b>
          <small>Due today${task.time ? ` at ${esc(task.time)}` : ""}</small>
        </div>`
      )
    );

  $("#bellItems").innerHTML = items.length
    ? items.join("")
    : `<div class="popover-item"><b>All clear 🎉</b><small>No overdue or due-today tasks.</small></div>`;
  $("#bellDot").classList.toggle("hidden", items.length === 0);
}

function applySettings() {
  const { theme, accent, density } = state.settings;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.density = density;

  const themeSwitch = $("#themeSwitch");
  themeSwitch.classList.toggle("on", theme === "dark");
  themeSwitch.setAttribute("aria-pressed", String(theme === "dark"));

  const densitySwitch = $("#densitySwitch");
  densitySwitch.classList.toggle("on", density === "compact");
  densitySwitch.setAttribute("aria-pressed", String(density === "compact"));

  $$("#accentSwatches .swatch").forEach((swatch) => {
    swatch.classList.toggle("active", swatch.dataset.accent === accent);
  });
}

function renderAll() {
  renderTaskLists();
  renderCompleted();
  renderStats();
  renderBreakdown();
  renderUpNext();
  renderWeekList();
  renderMiniCalendar();
  renderMonthCalendar();
  renderCharts();
  renderNotes();
  renderFiles();
  renderNoteWidget();
  renderBell();
  applySettings();
}

/* ---------------------------------------------------------------
   10. Feedback — toasts and undo snapshots
   --------------------------------------------------------------- */
function toast(message, kind, action) {
  const host = $("#toasts");
  const element = document.createElement("div");
  element.className = `toast${kind ? ` ${kind}` : ""}`;

  const text = document.createElement("span");
  text.textContent = message;
  element.appendChild(text);

  if (action && action.label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      action.run();
      element.remove();
    });
    element.appendChild(button);
  }

  host.appendChild(element);
  window.setTimeout(() => element.remove(), 5200);
}

function snapshot() {
  ui.lastSnapshot = JSON.stringify(state);
}

function undoLast() {
  if (!ui.lastSnapshot) {
    toast("Nothing left to undo.", "bad");
    return;
  }
  const parsed = JSON.parse(ui.lastSnapshot);
  state.tasks = parsed.tasks || [];
  state.notes = parsed.notes || [];
  state.files = parsed.files || [];
  state.settings = parsed.settings || state.settings;
  ui.lastSnapshot = null;
  saveState(true);
  renderAll();
  toast("Change undone.", "good");
}

/* ---------------------------------------------------------------
   11. Task actions
   --------------------------------------------------------------- */
function nextOrder() {
  if (!state.tasks.length) return 0;
  return Math.max.apply(null, state.tasks.map((task) => Number(task.order) || 0)) + 1;
}

function addTask(data, quiet) {
  snapshot();
  const task = newTask(Object.assign({ order: nextOrder() }, data));
  state.tasks.push(task);
  saveState(true);
  renderAll();
  if (!quiet) {
    toast(`Added “${task.title}”.`, "good", { label: "Undo", run: undoLast });
  }
  return task;
}

function updateTask(id, patch, message) {
  const task = findTask(id);
  if (!task) return null;
  snapshot();
  Object.assign(task, patch);
  saveState(true);
  renderAll();
  if (message) toast(message, "good", { label: "Undo", run: undoLast });
  return task;
}

function toggleTask(id) {
  const task = findTask(id);
  if (!task) return;
  snapshot();
  task.done = !task.done;
  task.completedAt = task.done ? new Date().toISOString() : "";
  saveState(true);
  renderAll();
  if (task.done) {
    toast(`“${task.title}” completed 🎉`, "good");
  } else {
    toast(`“${task.title}” reopened.`, "", { label: "Undo", run: undoLast });
  }
}

function deleteTask(id) {
  const task = findTask(id);
  if (!task) return;
  snapshot();
  state.tasks = state.tasks.filter((item) => item.id !== id);
  saveState(true);
  renderAll();
  toast(`Deleted “${task.title}”.`, "bad", { label: "Undo", run: undoLast });
}

function clearCompleted() {
  const done = state.tasks.filter((task) => task.done).length;
  if (!done) {
    toast("No completed tasks to clear.", "bad");
    return;
  }
  snapshot();
  state.tasks = state.tasks.filter((task) => !task.done);
  saveState(true);
  renderAll();
  toast(`Cleared ${done} completed task${done === 1 ? "" : "s"}.`, "", {
    label: "Undo",
    run: undoLast,
  });
}

/* ---------------------------------------------------------------
   12. Files and notes actions
   --------------------------------------------------------------- */
function storeFile(file, callback) {
  const meta = {
    id: uid(),
    name: file.name,
    size: file.size,
    type: file.type || "",
    addedAt: new Date().toISOString(),
    data: "",
  };

  if (file.size > MAX_INLINE_FILE) {
    callback(meta);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    meta.data = typeof reader.result === "string" ? reader.result : "";
    callback(meta);
  };
  reader.onerror = () => {
    toast(`Could not read “${file.name}”.`, "bad");
    callback(null);
  };
  reader.readAsDataURL(file);
}

function handleFiles(fileList, taskId) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  snapshot();

  files.forEach((file) => {
    storeFile(file, (meta) => {
      if (!meta) return;
      if (taskId) {
        const task = findTask(taskId);
        if (!task) return;
        task.files = task.files || [];
        task.files.push(meta);
        toast(`Attached “${meta.name}” to “${task.title}”.`, "good");
      } else {
        state.files.unshift(meta);
        toast(`“${meta.name}” added to My files.`, "good");
      }
      saveState(true);
      renderAll();
    });
  });
}

function downloadFile(file) {
  if (!file || !file.data) {
    toast("That file was too large to store — only its details were kept.", "bad");
    return;
  }
  const link = document.createElement("a");
  link.href = file.data;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function removeTaskFile(taskId, fileId) {
  const task = findTask(taskId);
  if (!task || !task.files) return;
  snapshot();
  task.files = task.files.filter((file) => file.id !== fileId);
  saveState(true);
  renderAll();
  toast("Attachment removed.", "", { label: "Undo", run: undoLast });
}

function removeLooseFile(fileId) {
  snapshot();
  state.files = state.files.filter((file) => file.id !== fileId);
  saveState(true);
  renderAll();
  toast("File removed.", "", { label: "Undo", run: undoLast });
}

function openLooseFile(fileId) {
  downloadFile(state.files.find((item) => item.id === fileId));
}

function saveNoteWidget(text) {
  state.settings.note = { text: text.trim(), at: new Date().toISOString() };
  saveState(true);
  renderNoteWidget();
  toast("Today note saved.", "good");
}

function addNote(title, body) {
  snapshot();
  state.notes.unshift({
    id: uid(),
    title: title.trim() || "Untitled note",
    body: body.trim(),
    updatedAt: new Date().toISOString(),
  });
  saveState(true);
  renderAll();
  toast("Note saved.", "good");
}

function deleteNote(id) {
  if (!state.notes.some((item) => item.id === id)) return;
  snapshot();
  state.notes = state.notes.filter((item) => item.id !== id);
  saveState(true);
  renderAll();
  toast("Note deleted.", "", { label: "Undo", run: undoLast });
}

function pinNote(id) {
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;
  saveNoteWidget(note.body);
}

/* ---------------------------------------------------------------
   13. Data import / export / reset
   --------------------------------------------------------------- */
function exportData() {
  const payload = JSON.stringify(
    { app: "dynamic-list", exportedAt: new Date().toISOString(), state: state },
    null,
    2
  );
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `dynamic-list-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Export downloaded.", "good");
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const incoming = parsed.state || parsed;
      if (!incoming || !Array.isArray(incoming.tasks)) throw new Error("bad file");
      snapshot();
      state.tasks = incoming.tasks;
      state.notes = Array.isArray(incoming.notes) ? incoming.notes : [];
      state.files = Array.isArray(incoming.files) ? incoming.files : [];
      state.settings = Object.assign(state.settings, incoming.settings || {});
      state.settings.note = Object.assign({ text: "", at: "" }, state.settings.note);
      saveState(true);
      renderAll();
      toast(`Imported ${state.tasks.length} tasks.`, "good");
    } catch (error) {
      console.error(error);
      toast("That file is not a valid Dynamic List export.", "bad");
    }
  };
  reader.readAsText(file);
}

function resetEverything() {
  snapshot();
  state.tasks = [];
  state.notes = [];
  state.files = [];
  state.settings.note = { text: "", at: "" };
  ui.selectedDay = null;
  saveState(true);
  renderAll();
  toast("Everything reset.", "", { label: "Undo", run: undoLast });
}

/* ---------------------------------------------------------------
   14. Views and the task dialog
   --------------------------------------------------------------- */
function setView(name) {
  if (VIEWS.indexOf(name) === -1) return;
  ui.view = name;

  $$("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.viewPanel !== name);
  });

  $$("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });

  $("#crumbView").textContent = VIEW_TITLES[name] || "Dashboard";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openTaskModal(id, preset) {
  const task = id ? findTask(id) : null;
  ui.editingId = task ? task.id : null;

  $("#modalTitle").textContent = task ? "Edit task" : "New task";
  $("#fTitle").value = task ? task.title : "";
  $("#fNotes").value = task ? task.description : "";
  $("#fPriority").value = task ? task.priority : "medium";
  $("#fDifficulty").value = task ? task.difficulty : "moderate";
  $("#fCategory").value = task ? task.category : "Misc";
  $("#fDue").value = task ? task.due : (preset && preset.due) || "";
  $("#fTime").value = task ? task.time : "";
  $("#modalDeleteBtn").classList.toggle("hidden", !task);

  $("#taskModal").classList.add("open");
  window.setTimeout(() => $("#fTitle").focus(), 40);
}

function closeTaskModal() {
  $("#taskModal").classList.remove("open");
  ui.editingId = null;
}

function submitTaskForm(event) {
  event.preventDefault();
  const title = $("#fTitle").value.trim();
  if (!title) {
    toast("Give the task a title first.", "bad");
    return;
  }

  const payload = {
    title: title,
    description: $("#fNotes").value.trim(),
    priority: $("#fPriority").value,
    difficulty: $("#fDifficulty").value,
    category: $("#fCategory").value,
    due: $("#fDue").value,
    time: $("#fTime").value,
  };

  if (ui.editingId) {
    updateTask(ui.editingId, payload, "Task updated.");
  } else {
    addTask(payload);
  }
  closeTaskModal();
}

/* ---------------------------------------------------------------
   15. Drag & drop reordering
   --------------------------------------------------------------- */
function reorderTasks(draggedId, targetId) {
  if (!draggedId || draggedId === targetId) return;

  const ordered = state.tasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const from = ordered.findIndex((task) => task.id === draggedId);
  const to = ordered.findIndex((task) => task.id === targetId);
  if (from === -1 || to === -1) return;

  const moved = ordered.splice(from, 1)[0];
  // Land on the target's slot: dropping downwards must not skip past it.
  const insertAt = from < to ? to - 1 : to;
  ordered.splice(insertAt, 0, moved);
  ordered.forEach((task, index) => {
    task.order = index;
  });

  ui.sort = "manual";
  const sortSelect = $("#sortSelect");
  if (sortSelect) sortSelect.value = "manual";

  saveState(true);
  renderAll();
  toast(`“${moved.title}” moved.`, "good");
}

function wireDragAndDrop(container) {
  // Row click opens the editor. Handled here (on the list container) so it
  // works even when the document-level delegation is bypassed.
  container.addEventListener("click", (event) => {
    if (event.target.closest("[data-action]")) return;
    if (event.target.closest("button, input, label")) return;
    const row = event.target.closest(".task");
    if (row) openTaskModal(row.dataset.id);
  });

  container.addEventListener("dragstart", (event) => {
    const row = event.target.closest(".task");
    if (!row) return;
    ui.draggedId = row.dataset.id;
    row.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", row.dataset.id);
    }
  });

  container.addEventListener("dragover", (event) => {
    const row = event.target.closest(".task");
    if (!row || !ui.draggedId || row.dataset.id === ui.draggedId) return;
    event.preventDefault();
    row.classList.add("drop-target");
  });

  container.addEventListener("dragleave", (event) => {
    const row = event.target.closest(".task");
    if (row) row.classList.remove("drop-target");
  });

  container.addEventListener("drop", (event) => {
    const row = event.target.closest(".task");
    if (!row || !ui.draggedId) return;
    event.preventDefault();
    row.classList.remove("drop-target");
    reorderTasks(ui.draggedId, row.dataset.id);
    ui.draggedId = null;
  });

  container.addEventListener("dragend", () => {
    ui.draggedId = null;
    $$(".task.dragging, .task.drop-target").forEach((row) => {
      row.classList.remove("dragging", "drop-target");
    });
  });
}

/* ---------------------------------------------------------------
   16. Event handling
   --------------------------------------------------------------- */
function selectDay(iso) {
  ui.selectedDay = ui.selectedDay === iso ? null : iso;
  if (ui.selectedDay) {
    ui.tab = "inbox";
    ui.cursor = parseISO(iso);
  }
  renderAll();
}

function moveCursor(step) {
  if (step === 0) {
    ui.cursor = new Date();
  } else {
    ui.cursor = new Date(ui.cursor.getFullYear(), ui.cursor.getMonth() + step, 1);
  }
  renderMiniCalendar();
  renderMonthCalendar();
}

function handleDocumentClick(event) {
  const actionEl = event.target.closest("[data-action]");

  if (actionEl) {
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;
    const fileId = actionEl.dataset.file;

    if (action === "edit") openTaskModal(id);
    else if (action === "delete") deleteTask(id);
    else if (action === "reopen") toggleTask(id);
    else if (action === "attach") {
      const input = $("#attachFileInput");
      input.dataset.task = id;
      input.click();
    } else if (action === "remove-file") removeTaskFile(id, fileId);
    else if (action === "open-file") {
      const task = findTask(id);
      if (task) downloadFile((task.files || []).find((file) => file.id === fileId));
    } else if (action === "remove-loose") removeLooseFile(fileId);
    else if (action === "open-loose") openLooseFile(fileId);
    else if (action === "delete-note") deleteNote(actionEl.dataset.note);
    else if (action === "pin-note") pinNote(actionEl.dataset.note);
    return;
  }

  const viewBtn = event.target.closest("[data-view]");
  if (viewBtn) {
    setView(viewBtn.dataset.view);
    return;
  }

  const dayBtn = event.target.closest("[data-cal-day]");
  if (dayBtn) {
    selectDay(dayBtn.dataset.calDay);
    return;
  }

  const navBtn = event.target.closest("[data-cal-nav]");
  if (navBtn) {
    moveCursor(Number(navBtn.dataset.calNav));
    return;
  }

  const tab = event.target.closest("[data-tab]");
  if (tab) {
    ui.tab = tab.dataset.tab;
    ui.selectedDay = null;
    renderTaskLists();
    return;
  }

  const doneTab = event.target.closest("[data-done-tab]");
  if (doneTab) {
    ui.doneTab = doneTab.dataset.doneTab;
    renderCompleted();
    return;
  }

  const chip = event.target.closest("[data-chip]");
  if (chip) {
    const value = chip.dataset.chip;
    if (value === "all") {
      ui.chips.clear();
    } else if (ui.chips.has(value)) {
      ui.chips.delete(value);
    } else {
      ui.chips.add(value);
    }
    $$("[data-chip]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.chip === "all" ? !ui.chips.size : ui.chips.has(button.dataset.chip)
      );
    });
    renderTaskLists();
    return;
  }

  const swatch = event.target.closest("[data-accent]");
  if (swatch) {
    state.settings.accent = swatch.dataset.accent;
    saveState(true);
    applySettings();
    return;
  }

  const row = event.target.closest(".task");
  if (row && !event.target.closest("button, input, label")) {
    openTaskModal(row.dataset.id);
    return;
  }

  const doneRow = event.target.closest(".done-row");
  if (doneRow && doneRow.dataset.id) {
    openTaskModal(doneRow.dataset.id);
  }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast("Report copied to the clipboard.", "good"))
      .catch(() => toast("Copy failed — select the text manually.", "bad"));
  } else {
    toast("Clipboard is not available in this browser.", "bad");
  }
}

function downloadReport() {
  const url = URL.createObjectURL(new Blob([$("#reportOut").textContent], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `dynamic-list-report-${todayISO()}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Report downloaded.", "good");
}

function handleDocumentChange(event) {
  const target = event.target;
  if (target.matches('[data-action="toggle"]')) {
    toggleTask(target.dataset.id);
  }
}

function handleKeydown(event) {
  const target = event.target;
  const typing = target.matches("input, textarea, select, [contenteditable='true']");

  if (event.key === "Escape") {
    if ($("#taskModal").classList.contains("open")) {
      closeTaskModal();
      return;
    }
    if (!$("#bellPanel").classList.contains("hidden")) {
      $("#bellPanel").classList.add("hidden");
      return;
    }
    if (ui.search || ui.chips.size || ui.selectedDay) {
      ui.search = "";
      ui.chips.clear();
      ui.selectedDay = null;
      $("#searchInput").value = "";
      $$("[data-chip]").forEach((button) => {
        button.classList.toggle("active", button.dataset.chip === "all");
      });
      renderAll();
    }
    return;
  }

  if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

  if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    openTaskModal();
    return;
  }

  if (event.key === "/") {
    event.preventDefault();
    $("#searchInput").focus();
    return;
  }

  const index = Number(event.key);
  if (index >= 1 && index <= VIEWS.length) {
    setView(VIEWS[index - 1]);
  }
}

function wireEvents() {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", handleDocumentChange);
  document.addEventListener("keydown", handleKeydown);

  $("#newTaskBtn").addEventListener("click", () => openTaskModal());
  $("#modalCloseBtn").addEventListener("click", closeTaskModal);
  $("#modalCancelBtn").addEventListener("click", closeTaskModal);
  $("#taskForm").addEventListener("submit", submitTaskForm);
  $("#modalDeleteBtn").addEventListener("click", () => {
    const id = ui.editingId;
    closeTaskModal();
    if (id) deleteTask(id);
  });
  $("#taskModal").addEventListener("click", (event) => {
    if (event.target.id === "taskModal") closeTaskModal();
  });

  $("#addForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#quickInput");
    const title = input.value.trim();
    if (!title) return;
    addTask({
      title: title,
      priority: $("#quickPriority").value,
      category: $("#quickCategory").value,
      due: ui.selectedDay || todayISO(),
    });
    input.value = "";
    input.focus();
  });

  $("#searchInput").addEventListener("input", (event) => {
    ui.search = event.target.value;
    renderTaskLists();
  });

  $("#catFilter").addEventListener("change", (event) => {
    ui.category = event.target.value;
    renderTaskLists();
  });

  $("#sortSelect").addEventListener("change", (event) => {
    ui.sort = event.target.value;
    renderTaskLists();
  });

  $("#clearDoneBtn").addEventListener("click", clearCompleted);
  $("#goTodayBtn").addEventListener("click", () => {
    ui.cursor = new Date();
    ui.selectedDay = todayISO();
    renderAll();
  });
  $("#crumbDate").addEventListener("click", () => {
    ui.cursor = new Date();
    ui.selectedDay = todayISO();
    setView("dashboard");
    renderAll();
  });

  const noteBox = $("#noteBox");
  noteBox.addEventListener("blur", () => {
    const text = noteBox.textContent.trim();
    if (text !== state.settings.note.text) saveNoteWidget(text);
  });
  noteBox.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      saveNoteWidget(noteBox.textContent);
    }
  });
  $("#noteSaveBtn").addEventListener("click", () => saveNoteWidget(noteBox.textContent));
  $("#noteClearBtn").addEventListener("click", () => {
    noteBox.textContent = "";
    saveNoteWidget("");
  });

  wireFileInputs();
  wireSettingsControls();
  wireBell();

  // Drag & drop reordering + row clicks for every task list on the page
  $$("[data-task-list]").forEach(wireDragAndDrop);
}

function wireFileInputs() {
  const fileInput = $("#fileInput");

  ["#pickFileBtn", "#pickFileBtn2"].forEach((selector) => {
    $(selector).addEventListener("click", () => fileInput.click());
  });

  ["#fileDrop", "#fileDrop2"].forEach((selector) => {
    const zone = $(selector);
    zone.addEventListener("click", () => fileInput.click());
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    });
    ["dragenter", "dragover"].forEach((type) => {
      zone.addEventListener(type, (event) => {
        event.preventDefault();
        zone.classList.add("dragover");
      });
    });
    ["dragleave", "dragend"].forEach((type) => {
      zone.addEventListener(type, () => zone.classList.remove("dragover"));
    });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("dragover");
      handleFiles(event.dataTransfer.files, "");
    });
  });

  fileInput.addEventListener("change", (event) => {
    handleFiles(event.target.files, "");
    event.target.value = "";
  });

  const attachInput = $("#attachFileInput");
  const attachName = $("#attachFileName");
  const showChosenFile = (file) => {
    if (!attachName) return;
    attachName.textContent = file
      ? `${file.name} · ${fileSize(file.size)}`
      : "No file chosen";
  };

  attachInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    const taskId = event.target.dataset.task;
    if (taskId && file) handleFiles(event.target.files, taskId);
    delete event.target.dataset.task;
    showChosenFile(file);
    if (!taskId) {
      event.target.value = "";
      showChosenFile(null);
    }
  });

  $("#attachBtn").addEventListener("click", () => {
    const taskId = $("#attachTaskSelect").value;
    const file = attachInput.files[0];
    if (!taskId) {
      toast("Choose a task first.", "bad");
      return;
    }
    if (!file) {
      toast("Choose a file to attach.", "bad");
      return;
    }
    handleFiles([file], taskId);
    attachInput.value = "";
    showChosenFile(null);
  });
}

function wireSettingsControls() {
  $("#noteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#noteTitle").value;
    const body = $("#noteBody").value;
    if (!title.trim() && !body.trim()) {
      toast("Write something first.", "bad");
      return;
    }
    addNote(title, body);
    $("#noteTitle").value = "";
    $("#noteBody").value = "";
  });

  $("#noteSearch").addEventListener("input", (event) => {
    ui.noteSearch = event.target.value;
    renderNotes();
  });

  $("#reportBtn").addEventListener("click", () => setView("activity"));
  $("#copyReportBtn").addEventListener("click", () => copyText($("#reportOut").textContent));
  $("#downloadReportBtn").addEventListener("click", downloadReport);

  $("#themeSwitch").addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    saveState(true);
    applySettings();
  });

  $("#densitySwitch").addEventListener("click", () => {
    state.settings.density = state.settings.density === "compact" ? "comfortable" : "compact";
    saveState(true);
    applySettings();
  });

  $("#exportBtn").addEventListener("click", exportData);

  $("#importInput").addEventListener("change", (event) => {
    if (event.target.files[0]) importData(event.target.files[0]);
    event.target.value = "";
  });

  $("#resetBtn").addEventListener("click", resetEverything);

  $("#logoutBtn").addEventListener("click", () => {
    toast("This app runs entirely in your browser — nothing to log out from 🙂", "");
  });
}

function wireBell() {
  const panel = $("#bellPanel");

  $("#bellBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    panel.classList.toggle("hidden");
    $("#bellBtn").setAttribute("aria-expanded", String(!panel.classList.contains("hidden")));
  });

  $("#bellCloseBtn").addEventListener("click", () => panel.classList.add("hidden"));

  document.addEventListener("click", (event) => {
    if (
      !panel.classList.contains("hidden") &&
      !event.target.closest("#bellPanel") &&
      !event.target.closest("#bellBtn")
    ) {
      panel.classList.add("hidden");
    }
  });
}


/* ---------------------------------------------------------------
   17. Boot
   --------------------------------------------------------------- */
function init() {
  const firstRun = !readStoredState();
  const restored = loadState();

  // The board always starts empty - no sample tasks are shipped.
  if (!restored) saveState(true);

  applySettings();
  setView("dashboard");
  ui.selectedDay = todayISO();
  renderAll();
  wireEvents();

  renderClock();
  window.setInterval(renderClock, 1000);
  window.setInterval(() => {
    renderStats();
    renderCharts();
    renderCompleted();
    renderBell();
    renderNotes();
  }, 60000);

  toast(firstRun ? "Your board is ready — add your first task." : "Welcome back 👋", "good");
}

document.addEventListener("DOMContentLoaded", init);
