const firebaseConfig = {
  apiKey: "AIzaSyDl71Ezdl85KnoEuBpBaz1pVfC2K3yR0QQ",
  authDomain: "myworkboard-981bf.firebaseapp.com",
  projectId: "myworkboard-981bf",
  storageBucket: "myworkboard-981bf.firebasestorage.app",
  messagingSenderId: "840533947338",
  appId: "1:840533947338:web:74fc5506b12b39f9279533"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

const state = {
  tasks: [],
  selectedYear: String(new Date().getFullYear()),
  selectedMonth: String(new Date().getMonth() + 1).padStart(2, '0'),
  initialSelectionDone: false,
  isAdmin: false
};

auth.signInAnonymously().then(init).catch((err) => {
  console.error(err);
  document.getElementById('monthBoard').innerHTML = '<div class="empty-msg">로그인 실패로 데이터를 불러올 수 없습니다.</div>';
});

function init() {
  db.collection('tasks').orderBy('date').onSnapshot((snap) => {
    state.tasks = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((task) => normalizeStatus(task.status) === '보류중');
    syncSelectedPeriodWithLatest();
    render();
  }, (err) => {
    console.error(err);
    document.getElementById('monthBoard').innerHTML = '<div class="empty-msg">데이터를 불러오지 못했습니다.</div>';
  });
}

function render() {
  renderAdminToggle();
  renderYearSelect();
  renderSummary();
  renderMonthBoard();
}

function renderAdminToggle() {
  const btn = document.getElementById('adminToggleBtn');
  if (!btn) return;
  btn.textContent = state.isAdmin ? 'Admin 로그아웃' : 'Admin 로그인';
}

function renderYearSelect() {
  const select = document.getElementById('yearSelect');
  const years = getYears();

  if (!years.length) {
    select.innerHTML = `<option value="${state.selectedYear}">${state.selectedYear}</option>`;
    return;
  }

  if (!years.includes(state.selectedYear)) {
    state.selectedYear = years[0];
  }

  select.innerHTML = years.map((year) => `<option value="${year}">${year}년</option>`).join('');
  select.value = state.selectedYear;
  select.onchange = () => {
    state.selectedYear = select.value;
    state.selectedMonth = getLatestMonthInYear(state.selectedYear);
    renderSummary();
    renderMonthBoard();
  };
}

function renderSummary() {
  const summary = document.getElementById('monthSummary');
  const groups = groupByMonthForYear(state.selectedYear);

  summary.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0');
    const count = (groups[month] || []).length;
    const active = month === state.selectedMonth ? 'active' : '';
    return `
      <button class="summary-chip ${active}" onclick="selectMonth('${month}')">
        <span>${i + 1}월</span>
        <strong>${count}건</strong>
      </button>
    `;
  }).join('');
}

function renderMonthBoard() {
  const board = document.getElementById('monthBoard');
  const groups = groupByMonthForYear(state.selectedYear);
  const monthItems = (groups[state.selectedMonth] || [])
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const monthLabel = Number(state.selectedMonth);

  const body = monthItems.length
    ? `<div class="task-list large">${monthItems.map((task) => `
        <article class="task-item large">
          <div class="task-title">${escapeHtml(task.name || '')}</div>
          <div class="task-meta">
            <span>${escapeHtml(task.date || '미지정')}</span>
            <span>담당: ${escapeHtml(task.userName || '-')}</span>
          </div>
          ${state.isAdmin ? `
            <div class="task-actions">
              <button class="admin-inline-btn" onclick="editTask('${task.id}')">수정</button>
              <button class="admin-inline-btn danger" onclick="deleteTask('${task.id}')">삭제</button>
            </div>
          ` : ''}
        </article>
      `).join('')}</div>`
    : '<div class="empty-msg">해당 월에 등록된 작업이 없습니다.</div>';

  board.innerHTML = `
    <section class="month-detail">
      <h2>${state.selectedYear}년 ${monthLabel}월 보류중 작업</h2>
      ${body}
    </section>
  `;
}

function selectMonth(month) {
  state.selectedMonth = month;
  renderSummary();
  renderMonthBoard();
}

function getYears() {
  const yearSet = new Set();
  state.tasks.forEach((task) => {
    const year = getYear(task.date);
    if (year) yearSet.add(year);
  });
  return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
}

function groupByMonthForYear(year) {
  const groups = {};
  state.tasks.forEach((task) => {
    if (getYear(task.date) !== year) return;
    const month = getMonth(task.date);
    if (!month) return;
    if (!groups[month]) groups[month] = [];
    groups[month].push(task);
  });
  return groups;
}

function getYear(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return '';
  return dateStr.slice(0, 4);
}

function getMonth(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return '';
  return dateStr.slice(5, 7);
}

function syncSelectedPeriodWithLatest() {
  if (!state.tasks.length) return;
  if (state.initialSelectionDone) return;

  const latest = state.tasks
    .filter((task) => /^\d{4}-\d{2}-\d{2}$/.test(task.date || ''))
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];

  if (!latest) return;
  state.selectedYear = getYear(latest.date);
  state.selectedMonth = getMonth(latest.date);
  state.initialSelectionDone = true;
}

function getLatestMonthInYear(year) {
  const months = state.tasks
    .filter((task) => getYear(task.date) === year)
    .map((task) => getMonth(task.date))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  return months[0] || '01';
}

function normalizeStatus(status) {
  if (status === '리뉴얼') return '작업완료';
  return status || '진행중';
}

function toggleAdmin() {
  if (state.isAdmin) {
    state.isAdmin = false;
    render();
    return;
  }

  const key = prompt('Admin Key 입력');
  if (key === null) return;
  if (key !== '0512') {
    alert('키가 올바르지 않습니다.');
    return;
  }
  state.isAdmin = true;
  render();
}

function editTask(taskId) {
  if (!state.isAdmin) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const nextName = prompt('작업명 수정', task.name || '');
  if (nextName === null) return;
  const nextUser = prompt('담당자 수정', task.userName || '');
  if (nextUser === null) return;
  const nextDate = prompt('날짜 수정 (YYYY-MM-DD)', task.date || '');
  if (nextDate === null) return;

  db.collection('tasks').doc(taskId).update({
    name: nextName.trim(),
    userName: nextUser.trim(),
    date: nextDate.trim()
  });
}

function deleteTask(taskId) {
  if (!state.isAdmin) return;
  if (!confirm('이 작업을 삭제할까요?')) return;
  db.collection('tasks').doc(taskId).delete();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.toggleAdmin = toggleAdmin;
window.editTask = editTask;
window.deleteTask = deleteTask;
