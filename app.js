const firebaseConfig = {
  apiKey: "AIzaSyDl71Ezdl85KnoEuBpBaz1pVfC2K3yR0QQ",
  authDomain: "myworkboard-981bf.firebaseapp.com",
  projectId: "myworkboard-981bf",
  storageBucket: "myworkboard-981bf.firebasestorage.app",
  messagingSenderId: "840533947338",
  appId: "1:840533947338:web:74fc5506b12b39f9279533"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const AUTH_STORAGE_KEY = 'flowos_auth_v1';
const THEME_STORAGE_KEY = 'flowos_theme_v1';
const COLLECTIONS = {
  users: 'work_manager_users',
  tasks: 'work_manager_tasks',
  brands: 'work_manager_brands',
  gymMood: 'work_manager_gym_mood',
  memos: 'work_manager_memos',
  config: 'work_manager_config'
};

const BOARD_STATUSES = ["업무대기", "진행중", "컨펌중", "수정중", "작업완료"];
const DONE_STATUS = "작업완료";
const ACTIVE_STATUSES = [...BOARD_STATUSES];
const WORKER_VISIBLE_STATUSES = ["업무대기", "진행중", "컨펌중", "수정중"];
const LEGACY_STATUS_MAP = { "리뉴얼": "작업완료" };
const GYM_CATEGORIES = ['전단지', '족자', '현수막', 'X배너', '기타'];
const FORTUNE_BY_TYPE = {
  집중: [
    '오늘은 한 가지 핵심 업무에 몰입하면 성과가 큽니다.',
    '우선순위를 하나로 줄이면 일이 빨라집니다.',
    '30분 집중 2회만 해도 일정이 크게 앞당겨집니다.'
  ],
  행운: [
    '생각보다 좋은 소식이 빠르게 들어올 가능성이 높아요.',
    '작은 친절이 큰 도움으로 돌아오는 하루입니다.',
    '뜻밖의 타이밍에 협업 운이 들어옵니다.'
  ],
  휴식: [
    '짧은 휴식이 실수를 크게 줄여줍니다.',
    '오늘은 무리보다 리듬 조절이 승부처예요.',
    '스트레칭 5분으로 집중력이 다시 올라옵니다.'
  ]
};
const FORTUNE_COOKIE_ICON = {
  집중: '🥠',
  행운: '🍪',
  휴식: '🥮'
};

const localState = {
  users: [],
  brands: [],
  tasks: [],
  memos: [],
  isAdmin: false,
  currentUser: null,
  pendingUserId: null,
  firebaseConnected: false,
  authReady: false,
  archiveType: "보류중",
  editingTaskId: null,
  sharedMemoSaveTimer: null,
  memoSaveTimers: {},
  migrationTried: false,
  adminTaskQuery: '',
  adminTaskStatus: '',
  adminTaskUserId: '',
  adminTaskSort: 'date_desc',
  adminTaskPage: 1,
  adminTaskPageSize: 20,
  viewMode: 'board',
  calendarMonth: getCurrentMonthValue(),
  gymMoodRows: [],
  gymMoodMonth: getCurrentMonthValue(),
  gymMoodDragId: '',
  themeMode: 'light'
};

hydrateAuthFromStorage();
hydrateThemeMode();
updateAuthUI();
updateConnectionUI();

window.addEventListener('online', updateConnectionUI);
window.addEventListener('offline', () => {
  localState.firebaseConnected = false;
  updateConnectionUI();
});

auth.signInAnonymously()
  .then(() => {
    localState.authReady = true;
    initRealtime();
    updateConnectionUI();
  })
  .catch((err) => {
    console.error(err);
    localState.authReady = true;
    localState.firebaseConnected = false;
    updateConnectionUI();
  });

function initRealtime() {
  migrateLegacyWorkflowCollections();

  db.collection(COLLECTIONS.users).orderBy('name').onSnapshot({ includeMetadataChanges: true }, (snap) => {
    setFirebaseConnectedFromSnapshot(snap);
    localState.users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    render();
  }, handleRealtimeError);

  db.collection(COLLECTIONS.brands).orderBy('name').onSnapshot({ includeMetadataChanges: true }, (snap) => {
    setFirebaseConnectedFromSnapshot(snap);
    localState.brands = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    render();
  }, handleRealtimeError);

  db.collection(COLLECTIONS.gymMood).orderBy('month', 'desc').onSnapshot({ includeMetadataChanges: true }, (snap) => {
    setFirebaseConnectedFromSnapshot(snap);
    localState.gymMoodRows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderGymMoodList();
  }, handleRealtimeError);

  db.collection(COLLECTIONS.tasks).orderBy('date').onSnapshot({ includeMetadataChanges: true }, (snap) => {
    setFirebaseConnectedFromSnapshot(snap);
    localState.tasks = snap.docs.map((doc) => {
      const task = { id: doc.id, ...doc.data() };
      task.status = normalizeStatus(task.status);
      return task;
    });
    render();
  }, handleRealtimeError);

  db.collection(COLLECTIONS.memos).orderBy('createdAt', 'asc').onSnapshot({ includeMetadataChanges: true }, (snap) => {
    setFirebaseConnectedFromSnapshot(snap);
    localState.memos = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderMemos();
  }, handleRealtimeError);

  db.collection(COLLECTIONS.config).doc('sharedMemo').onSnapshot({ includeMetadataChanges: true }, (doc) => {
    setFirebaseConnectedFromSnapshot(doc);
    const memoEl = document.getElementById('archiveStaticMemo');
    const content = doc.exists ? (doc.data().content || '') : '';
    if (memoEl && document.activeElement !== memoEl) {
      memoEl.value = content;
      renderSharedView(content);
    }
  }, handleRealtimeError);
}

function migrateLegacyWorkflowCollections() {
  if (localState.migrationTried) return;
  localState.migrationTried = true;

  const jobs = [
    migrateCollectionIfTargetEmpty('workflow_users', COLLECTIONS.users),
    migrateCollectionIfTargetEmpty('workflow_tasks', COLLECTIONS.tasks),
    migrateCollectionIfTargetEmpty('workflow_brands', COLLECTIONS.brands),
    migrateCollectionIfTargetEmpty('workflow_gym_mood', COLLECTIONS.gymMood),
    migrateCollectionIfTargetEmpty('workflow_memos', COLLECTIONS.memos),
    migrateCollectionIfTargetEmpty('users', COLLECTIONS.users),
    migrateCollectionIfTargetEmpty('tasks', COLLECTIONS.tasks),
    migrateCollectionIfTargetEmpty('memos', COLLECTIONS.memos),
    migrateSharedMemoConfigIfTargetMissing('workflow_config').then(() => migrateSharedMemoConfigIfTargetMissing('config'))
  ];

  Promise.all(jobs).catch((err) => {
    console.error(err);
  });
}

function migrateCollectionIfTargetEmpty(sourceCollection, targetCollection) {
  return db.collection(targetCollection).limit(1).get().then((targetSnap) => {
    if (!targetSnap.empty) return;
    return db.collection(sourceCollection).get().then((sourceSnap) => {
      if (sourceSnap.empty) return;
      const batch = db.batch();
      sourceSnap.forEach((doc) => {
        batch.set(db.collection(targetCollection).doc(doc.id), doc.data(), { merge: true });
      });
      return batch.commit();
    });
  });
}

function migrateSharedMemoConfigIfTargetMissing(sourceCollection) {
  const targetRef = db.collection(COLLECTIONS.config).doc('sharedMemo');
  const sourceRef = db.collection(sourceCollection || 'config').doc('sharedMemo');
  return targetRef.get().then((targetDoc) => {
    if (targetDoc.exists) return;
    return sourceRef.get().then((sourceDoc) => {
      if (!sourceDoc.exists) return;
      return targetRef.set(sourceDoc.data() || {}, { merge: true });
    });
  });
}

function setFirebaseConnectedFromSnapshot(snap) {
  if (!snap || !snap.metadata) return;
  if (!snap.metadata.fromCache) {
    localState.firebaseConnected = true;
  }
  updateConnectionUI();
}

function handleRealtimeError(err) {
  console.error(err);
  localState.firebaseConnected = false;
  updateConnectionUI();
}

function updateConnectionUI() {
  const syncEl = document.getElementById('syncStatus');
  const banner = document.getElementById('networkBanner');
  if (!syncEl || !banner) return;

  syncEl.classList.remove('status-online', 'status-cache', 'status-offline');
  banner.classList.add('hidden');
  banner.classList.remove('offline');

  if (!navigator.onLine) {
    syncEl.innerText = 'DEVICE OFFLINE';
    syncEl.classList.add('status-offline');
    banner.innerText = '인터넷 연결이 끊겨 오프라인 모드입니다. 복구되면 자동 동기화됩니다.';
    banner.classList.remove('hidden');
    banner.classList.add('offline');
    return;
  }

  if (!localState.authReady) {
    syncEl.innerText = 'CONNECTING...';
    syncEl.classList.add('status-cache');
    return;
  }

  if (localState.firebaseConnected) {
    syncEl.innerText = 'CLOUD ONLINE';
    syncEl.classList.add('status-online');
    return;
  }

  syncEl.innerText = 'CACHE MODE';
  syncEl.classList.add('status-cache');
  banner.innerText = 'Firebase 서버에 연결되지 않아 캐시 모드로 동작 중입니다.';
  banner.classList.remove('hidden');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function render() {
  syncAuthFromUsers();
  updateAuthUI();
  renderUserSelects();
  renderBrandSelects();
  renderViewMode();
  renderBoard();
  renderCalendar();
  renderWorkerMode();
  renderArchive();
  renderWorkerList();
  renderProfileEditor();
  renderBrandManageList();
  renderAdminLists();
  const gymMonthInput = document.getElementById('gymMonthInput');
  if (gymMonthInput && gymMonthInput.value !== localState.gymMoodMonth) {
    gymMonthInput.value = localState.gymMoodMonth;
  }
}

function renderUserSelects() {
  const userOptions = localState.users
    .map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`)
    .join('');

  const withEmpty = `<option value="">담당자 미지정</option>${userOptions}`;
  ['taskUserSelect1', 'taskUserSelect2', 'editTaskUserSelect1', 'editTaskUserSelect2'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = withEmpty;
  });
  const loginSelect = document.getElementById('loginUserSelect');
  if (loginSelect) loginSelect.innerHTML = userOptions;
}

function renderBrandSelects() {
  const options = localState.brands
    .map((b) => `<option value="${b.id}">${escapeHtml(b.name || '')}</option>`)
    .join('');
  ['taskBrandSelect', 'editTaskBrandSelect'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = options || '<option value="">브랜드 없음</option>';
  });
}

function renderBoard() {
  ACTIVE_STATUSES.forEach((status) => {
    const listEl = document.getElementById(`${status}-list`);
    if (listEl) listEl.innerHTML = '';
  });

  const taskGroups = {};
  ACTIVE_STATUSES.forEach((status) => { taskGroups[status] = []; });

  localState.tasks.forEach((task) => {
    const status = normalizeStatus(task.status);
    if (!ACTIVE_STATUSES.includes(status)) return;
    taskGroups[status].push(task);
  });

  BOARD_STATUSES.forEach((status) => {
    const zone = document.getElementById(`${status}-list`);
    if (!zone) return;

    const sorted = taskGroups[status]
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    sorted.forEach((task) => zone.appendChild(createTaskCard(task)));
  });
}

function renderViewMode() {
  const board = document.querySelector('.board');
  const calendar = document.getElementById('calendarView');
  const worker = document.getElementById('workerView');
  const boardBtn = document.getElementById('boardViewBtn');
  const calendarBtn = document.getElementById('calendarViewBtn');
  const workerBtn = document.getElementById('workerViewBtn');
  const monthEl = document.getElementById('calendarMonth');
  const isCalendar = localState.viewMode === 'calendar';
  const isWorker = localState.viewMode === 'worker';
  const isBoard = !isCalendar && !isWorker;

  if (board) board.classList.toggle('hidden', !isBoard);
  if (calendar) calendar.classList.toggle('hidden', !isCalendar);
  if (worker) worker.classList.toggle('hidden', !isWorker);
  if (boardBtn) boardBtn.classList.toggle('btn-primary', isBoard);
  if (boardBtn) boardBtn.classList.toggle('btn-outline', !isBoard);
  if (calendarBtn) calendarBtn.classList.toggle('btn-primary', isCalendar);
  if (calendarBtn) calendarBtn.classList.toggle('btn-outline', !isCalendar);
  if (workerBtn) workerBtn.classList.toggle('btn-primary', isWorker);
  if (workerBtn) workerBtn.classList.toggle('btn-outline', !isWorker);
  if (monthEl && monthEl.value !== localState.calendarMonth) {
    monthEl.value = localState.calendarMonth;
  }
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calendarCurrentLabel');
  if (!grid) return;

  const [yearStr, monthStr] = String(localState.calendarMonth || '').split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) {
    grid.innerHTML = '<div class="card">캘린더를 표시할 수 없습니다.</div>';
    if (label) label.textContent = '';
    return;
  }
  if (label) label.textContent = `${year}년 ${month}월`;

  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const byDay = new Map();
  localState.tasks.forEach((task) => {
    if (!task.date || String(task.date).slice(0, 7) !== localState.calendarMonth) return;
    const day = Number(String(task.date).slice(8, 10));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(task);
  });

  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const cells = week.map((w, idx) => {
    const cls = idx === 0 ? ' sun' : (idx === 6 ? ' sat' : '');
    return `<div class="calendar-weekday${cls}">${w}</div>`;
  });

  for (let i = 0; i < firstDay; i += 1) {
    cells.push('<div class="calendar-cell empty"></div>');
  }

  for (let d = 1; d <= lastDate; d += 1) {
    const dayOfWeek = (firstDay + d - 1) % 7;
    const weekendClass = dayOfWeek === 0 ? ' sun' : (dayOfWeek === 6 ? ' sat' : '');
    const tasks = byDay.get(d) || [];
    const cards = tasks.map((task) => createCalendarTaskCardHtml(task)).join('');
    cells.push(`
      <article class="calendar-cell${weekendClass}">
        <div class="calendar-day${weekendClass}">${d}</div>
        <div class="calendar-tasks">${cards}</div>
      </article>
    `);
  }

  grid.innerHTML = cells.join('');
}

function createCalendarTaskCardHtml(task) {
  const status = normalizeStatus(task.status);
  const assignees = resolveAssigneeNames(task);
  const desc = String(task.desc || '').trim();
  const compactDesc = desc.length > 50 ? `${desc.slice(0, 50)}...` : desc;
  return `
    <article class="calendar-task-card">
      <div class="calendar-task-head">
        <span class="calendar-task-status ${getStatusClass(status)}">${escapeHtml(status)}</span>
        <span class="calendar-task-date-mini">${escapeHtml(task.date || '미지정')}</span>
      </div>
      <div class="calendar-task-title">${escapeHtml(task.name || '')}</div>
      <div class="calendar-task-desc">${escapeHtml(compactDesc || '상세 내용 없음')}</div>
      <div class="calendar-task-meta">
        <span class="calendar-task-brand-mini">${escapeHtml(task.brandName || '브랜드 없음')}</span>
        <span class="calendar-task-assignee-mini">담당: ${escapeHtml(assignees.length ? assignees.join(', ') : '-')}</span>
      </div>
    </article>
  `;
}

function renderWorkerMode() {
  const grid = document.getElementById('workerModeGrid');
  if (!grid) return;

  if (!localState.users.length) {
    grid.innerHTML = '<div class="card">등록된 작업자가 없습니다.</div>';
    return;
  }

  const statsByUser = new Map();
  localState.users.forEach((user) => {
    statsByUser.set(user.id, {
      user,
      activeTotal: 0,
      byStatus: { 업무대기: 0, 진행중: 0, 컨펌중: 0, 수정중: 0, 작업완료: 0 },
      tasks: []
    });
  });

  localState.tasks.forEach((task) => {
    const ids = resolveAssigneeIds(task);
    if (!ids.length) return;
    const status = normalizeStatus(task.status);
    ids.forEach((id) => {
      const bucket = statsByUser.get(id);
      if (!bucket) return;
      if (Object.prototype.hasOwnProperty.call(bucket.byStatus, status)) {
        bucket.byStatus[status] += 1;
      }
      if (WORKER_VISIBLE_STATUSES.includes(status)) {
        bucket.activeTotal += 1;
        bucket.tasks.push(task);
      }
    });
  });

  const cards = Array.from(statsByUser.values())
    .sort((a, b) => b.activeTotal - a.activeTotal || String(a.user.name || '').localeCompare(String(b.user.name || '')))
    .map((item) => {
      const avatar = resolveUserAvatar(item.user.id, item.user.name || 'U');
      const visibleTasks = item.tasks.slice();
      const taskItems = visibleTasks
        .slice()
        .sort((a, b) => String(a.date || '9999-12-31').localeCompare(String(b.date || '9999-12-31')))
        .slice(0, 6)
        .map((task) => `
          <div class="worker-task-item">
            <span class="worker-task-status ${getStatusClass(task.status)}">${escapeHtml(normalizeStatus(task.status))}</span>
            <span class="worker-task-name">${escapeHtml(task.name || '')}</span>
            <span class="worker-task-brand">${escapeHtml(task.brandName || '브랜드 없음')}</span>
            <span class="worker-task-date">${escapeHtml(task.date || '미지정')}</span>
          </div>
        `)
        .join('');
      const moreCount = visibleTasks.length > 6 ? `<div class="worker-task-more">외 ${visibleTasks.length - 6}건</div>` : '';
      return `
        <article class="worker-load-card">
          <div class="worker-load-head">
            <span class="user-inline"><img class="avatar-sm" src="${escapeAttr(avatar)}" alt="avatar"><strong>${escapeHtml(item.user.name || '')}</strong></span>
            <span class="worker-load-total">총 ${item.activeTotal}건</span>
          </div>
          <div class="worker-task-list">
            ${taskItems || '<div class="worker-task-empty">담당 업무 없음</div>'}
            ${moreCount}
          </div>
        </article>
      `;
    });

  grid.innerHTML = cards.join('');
}

function createTaskCard(task) {
  const card = document.createElement('div');
  const normalizedStatus = normalizeStatus(task.status);
  card.className = `card ${normalizedStatus === DONE_STATUS ? 'done-card' : ''}`.trim();
  card.id = task.id;
  card.draggable = true;
  card.ondragstart = (e) => e.dataTransfer.setData('text', task.id);
  const assigneeNames = resolveAssigneeNames(task);
  const primaryUserId = resolveAssigneeIds(task)[0] || '';
  const userAvatar = resolveUserAvatar(primaryUserId, assigneeNames[0] || 'U');
  const sticker = getTaskSticker(normalizedStatus);
  const stickerHtml = sticker ? `<span class="task-sticker ${sticker.type}">${sticker.emoji}</span>` : '';
  const backupHtml = task.backupLocation
    ? `<details class="backup-detail"><summary>백업위치 보기</summary><div class="backup-text">${escapeHtml(task.backupLocation)}</div></details>`
    : '';

  card.innerHTML = `
    <div class="card-title">${escapeHtml(task.name || '')}</div>
    <div class="card-desc">${escapeHtml(task.desc || '')}</div>
    <div class="task-status ${getStatusClass(task.status)}">${escapeHtml(normalizedStatus)}</div>
    <div class="card-brand">브랜드: ${escapeHtml(task.brandName || '-')}</div>
    <div class="card-meta">
      <span class="user-inline"><img class="avatar-xs" src="${escapeAttr(userAvatar)}" alt="avatar">담당: ${escapeHtml(assigneeNames.length ? assigneeNames.join(', ') : '-')}</span>
      <span>${escapeHtml(task.date || '미지정')}</span>
    </div>
    <div class="card-actions">
      ${stickerHtml}
      <button class="btn btn-outline small" onclick="openTaskEditModal('${task.id}')">수정</button>
    </div>
    ${backupHtml}
  `;

  return card;
}

function getTaskSticker(status) {
  if (status === '업무대기') return { emoji: '🥚', type: 'egg' };
  if (status === '진행중') return { emoji: '🥚', type: 'egg wobble' };
  if (status === '컨펌중') return { emoji: '🐣', type: 'chick' };
  if (status === '수정중') return { emoji: '🐣', type: 'chick wobble' };
  if (status === '작업완료') return { emoji: '🐥', type: 'chick' };
  return null;
}

function renderArchive() {
  const doneList = document.getElementById('doneArchiveTaskList');
  const holdList = document.getElementById('holdArchiveTaskList');
  if (!doneList || !holdList) return;

  const doneTasks = localState.tasks.filter((task) => normalizeStatus(task.status) === '작업완료');
  const holdTasks = localState.tasks.filter((task) => normalizeStatus(task.status) === '보류중');

  renderArchiveColumn(doneList, doneTasks, '작업완료 작업이 없습니다.');
  renderArchiveColumn(holdList, holdTasks, '보류중 작업이 없습니다.');
}

function renderArchiveColumn(listEl, tasks, emptyMessage) {
  listEl.innerHTML = '';
  if (!tasks.length) {
    listEl.innerHTML = `<div class="card">${emptyMessage}</div>`;
    return;
  }

  const sortedTasks = tasks
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  sortedTasks
    .slice(0, 5)
    .forEach((task) => listEl.appendChild(createArchiveCard(task)));

  if (sortedTasks.length > 5) {
    listEl.appendChild(createArchiveMoreCard(sortedTasks.length - 5));
  }
}

function createArchiveCard(task) {
  const card = document.createElement('div');
  card.className = 'archive-item';
  const assigneeText = resolveAssigneeNames(task).join(', ') || '-';
  card.innerHTML = `
    <div class="archive-title">${escapeHtml(task.name || '')}</div>
    <div class="archive-meta">
      <span>${escapeHtml(task.date || '미지정')}</span>
      <span>브랜드: ${escapeHtml(task.brandName || '-')}</span>
      <span>담당: ${escapeHtml(assigneeText)}</span>
      <span>${escapeHtml(normalizeStatus(task.status))}</span>
    </div>
  `;
  return card;
}

function createArchiveMoreCard(moreCount) {
  const more = document.createElement('div');
  more.className = 'archive-more';
  more.innerText = `... 외 ${moreCount}건`;
  return more;
}

function addTask() {
  const name = document.getElementById('taskName').value.trim();
  const desc = document.getElementById('taskDesc').value.trim();
  const backupLocation = document.getElementById('taskBackupLocation').value.trim();
  const userId1 = document.getElementById('taskUserSelect1').value;
  const userId2 = document.getElementById('taskUserSelect2').value;
  const brandId = document.getElementById('taskBrandSelect').value;
  const status = document.getElementById('taskStatusSelect').value;
  const date = document.getElementById('taskDate').value;

  const brand = localState.brands.find((b) => b.id === brandId);
  const assigneeIds = Array.from(new Set([userId1, userId2].filter(Boolean))).slice(0, 2);
  const assigneeNames = assigneeIds
    .map((id) => localState.users.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => u.name);

  if (!name || !brand) {
    alert('작업명과 브랜드를 확인하세요.');
    return;
  }

  db.collection(COLLECTIONS.tasks).add({
    name,
    desc,
    backupLocation,
    userIds: assigneeIds,
    userNames: assigneeNames,
    userId: assigneeIds[0] || '',
    userName: assigneeNames[0] || '',
    brandId: brand.id,
    brandName: brand.name,
    status: normalizeStatus(status),
    date,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById('taskName').value = '';
    document.getElementById('taskDesc').value = '';
    document.getElementById('taskBackupLocation').value = '';
    closeModal('taskCreateModal');
  });
}

function allowDrop(e) {
  e.preventDefault();
}

function drop(e) {
  e.preventDefault();
  const id = e.dataTransfer.getData('text');
  let target = e.target;
  while (target && !target.classList.contains('col')) {
    target = target.parentElement;
  }
  if (!id || !target) return;
  db.collection(COLLECTIONS.tasks).doc(id).update({
    status: normalizeStatus(target.id),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function renderWorkerList() {
  const list = document.getElementById('fullWorkerList');
  if (!list) return;

  list.innerHTML = localState.users.map((u) => `
    <div class="worker-row">
      <div class="user-inline"><img class="avatar-sm" src="${escapeAttr(resolveUserAvatar(u.id, u.name))}" alt="avatar"><strong>${escapeHtml(u.name)}</strong></div>
      <div class="worker-actions">
        ${localState.isAdmin ? `<button class="btn btn-outline small" onclick="openAdminModalFromWorker()">관리자에서 수정</button>` : ''}
      </div>
    </div>
  `).join('');
}

function renderProfileEditor() {
  const nameEl = document.getElementById('profileNameInput');
  const pwEl = document.getElementById('profilePwInput');
  const preview = document.getElementById('profileAvatarPreview');
  const fileEl = document.getElementById('profileAvatarInput');
  if (!nameEl || !pwEl || !preview) return;

  const user = localState.currentUser;
  if (!user) {
    nameEl.value = '';
    pwEl.value = '';
    preview.src = generateAvatarDataUrl('U');
    if (fileEl) fileEl.value = '';
    return;
  }

  nameEl.value = user.name || '';
  pwEl.value = user.pw || '';
  preview.src = resolveUserAvatar(user.id, user.name || 'U');
}

function openProfileModal() {
  if (!localState.currentUser) {
    alert('로그인 후 프로필을 수정할 수 있습니다.');
    return;
  }
  renderProfileEditor();
  openModal('workerListModal');
}

function updateProfileAvatarPreview() {
  const fileEl = document.getElementById('profileAvatarInput');
  const preview = document.getElementById('profileAvatarPreview');
  if (!preview) return;

  if (!fileEl || !fileEl.files || !fileEl.files[0]) {
    const user = localState.currentUser;
    preview.src = resolveUserAvatar(user ? user.id : '', user ? user.name : 'U');
    delete preview.dataset.preparedAvatar;
    return;
  }

  prepareProfileAvatar(fileEl.files[0]).then((dataUrl) => {
    preview.src = dataUrl || preview.src;
    preview.dataset.preparedAvatar = dataUrl || '';
  }).catch((err) => {
    alert(getProfileAvatarErrorMessage(err));
    const user = localState.currentUser;
    preview.src = resolveUserAvatar(user ? user.id : '', user ? user.name : 'U');
    delete preview.dataset.preparedAvatar;
    if (fileEl) fileEl.value = '';
  });
}

function saveProfile() {
  const user = localState.currentUser;
  if (!user) {
    alert('로그인 상태를 확인하세요.');
    return;
  }

  const nameEl = document.getElementById('profileNameInput');
  const pwEl = document.getElementById('profilePwInput');
  const fileEl = document.getElementById('profileAvatarInput');
  const nextName = nameEl ? nameEl.value.trim() : '';
  const nextPw = pwEl ? pwEl.value.trim() : '';

  if (!nextName || !nextPw) {
    alert('닉네임과 비밀번호를 입력하세요.');
    return;
  }

  const duplicated = localState.users.some((u) => u.id !== user.id && String(u.name || '').trim() === nextName);
  if (duplicated) {
    alert('이미 사용중인 닉네임입니다.');
    return;
  }

  const saveUserDoc = (avatarDataUrl) => {
    const payload = {
      name: nextName,
      pw: nextPw,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (avatarDataUrl) payload.avatar = avatarDataUrl;
    return db.collection(COLLECTIONS.users).doc(user.id).update(payload).then(() => {
      return syncUserNameOnTasks(user.id, nextName);
    }).then(() => {
      localState.currentUser = { ...user, name: nextName, pw: nextPw, avatar: avatarDataUrl || user.avatar };
      localState.isAdmin = isAdminName(nextName) || localState.isAdmin;
      persistAuthState();
      if (fileEl) fileEl.value = '';
      const preview = document.getElementById('profileAvatarPreview');
      if (preview) delete preview.dataset.preparedAvatar;
      closeModal('workerListModal');
    }).catch((err) => {
      console.error(err);
      throw new Error('profile_save_failed');
    });
  };

  const hasNewFile = !!(fileEl && fileEl.files && fileEl.files[0]);
  if (hasNewFile) {
    const preview = document.getElementById('profileAvatarPreview');
    const prepared = preview && preview.dataset ? (preview.dataset.preparedAvatar || '') : '';
    const prepareJob = prepared ? Promise.resolve(prepared) : prepareProfileAvatar(fileEl.files[0]);
    prepareJob.then((dataUrl) => saveUserDoc(dataUrl || '')).catch((err) => {
      if (err && err.message === 'profile_save_failed') {
        alert('프로필 저장 중 오류가 발생했습니다.');
        return;
      }
      alert(getProfileAvatarErrorMessage(err));
    });
    return;
  }

  saveUserDoc('').catch((err) => {
    console.error(err);
    alert('프로필 저장 중 오류가 발생했습니다.');
  });
}

function syncUserNameOnTasks(userId, nextName) {
  return Promise.all([
    db.collection(COLLECTIONS.tasks).where('userIds', 'array-contains', userId).get(),
    db.collection(COLLECTIONS.tasks).where('userId', '==', userId).get()
  ]).then((snaps) => {
    const batch = db.batch();
    const seen = new Set();
    snaps.forEach((snap) => {
      snap.docs.forEach((doc) => {
        if (seen.has(doc.id)) return;
        seen.add(doc.id);
        const data = doc.data() || {};
        const ids = Array.isArray(data.userIds) ? data.userIds : (data.userId ? [data.userId] : []);
        const names = ids
          .map((id) => (id === userId ? nextName : (localState.users.find((u) => u.id === id)?.name || data.userName || '')))
          .filter(Boolean);
        batch.update(doc.ref, {
          userIds: ids,
          userNames: names,
          userId: ids[0] || '',
          userName: names[0] || ''
        });
      });
    });
    return batch.commit();
  });
}

function openAdminModalFromWorker() {
  closeModal('workerListModal');
  openModal('adminModal');
}

function renderAdminLists() {
  const userList = document.getElementById('adminUserList');
  const taskList = document.getElementById('adminTaskList');
  const taskCount = document.getElementById('adminTaskCount');
  const taskPager = document.getElementById('adminTaskPager');
  const taskSearch = document.getElementById('adminTaskSearch');
  const taskStatusFilter = document.getElementById('adminTaskStatusFilter');
  const taskUserFilter = document.getElementById('adminTaskUserFilter');
  const taskSort = document.getElementById('adminTaskSort');
  const taskPageSize = document.getElementById('adminTaskPageSize');
  if (!userList || !taskList) return;

  if (!localState.isAdmin) {
    userList.innerHTML = '<div class="card">관리자 권한이 필요합니다.</div>';
    taskList.innerHTML = '';
    if (taskCount) taskCount.innerHTML = '';
    if (taskPager) taskPager.innerHTML = '';
    return;
  }

  userList.innerHTML = localState.users.map((u) => `
    <div class="admin-row admin-user-grid">
      <div class="user-inline"><img class="avatar-sm" src="${escapeAttr(resolveUserAvatar(u.id, u.name))}" alt="avatar"><input id="admin-user-name-${u.id}" class="pill-input" value="${escapeAttr(u.name || '')}" placeholder="이름"></div>
      <input id="admin-user-pw-${u.id}" class="pill-input" value="${escapeAttr(u.pw || '')}" placeholder="비밀번호">
      <div class="row-actions">
        <button class="btn btn-primary small" onclick="saveUser('${u.id}')">저장</button>
        <button class="btn btn-outline small" onclick="deleteUser('${u.id}')">삭제</button>
      </div>
    </div>
  `).join('');

  const userOptions = localState.users
    .map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`)
    .join('');

  if (taskUserFilter) {
    const filterOptions = ['<option value="">전체 담당자</option>']
      .concat(localState.users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`));
    taskUserFilter.innerHTML = filterOptions.join('');
    taskUserFilter.value = localState.adminTaskUserId || '';
  }
  if (taskSearch) taskSearch.value = localState.adminTaskQuery;
  if (taskStatusFilter) taskStatusFilter.value = localState.adminTaskStatus;
  if (taskSort) taskSort.value = localState.adminTaskSort;
  if (taskPageSize) taskPageSize.value = String(localState.adminTaskPageSize);

  const filteredTasks = getFilteredAdminTasks();
  const pageSize = Number(localState.adminTaskPageSize) || 20;
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  if (localState.adminTaskPage > totalPages) {
    localState.adminTaskPage = totalPages;
  }
  const start = (localState.adminTaskPage - 1) * pageSize;
  const pageTasks = filteredTasks.slice(start, start + pageSize);

  if (taskCount) {
    taskCount.textContent = `총 ${filteredTasks.length}건 · ${localState.adminTaskPage}/${totalPages} 페이지`;
  }
  renderAdminTaskPager(totalPages);

  if (!pageTasks.length) {
    taskList.innerHTML = '<div class="card">조건에 맞는 작업이 없습니다.</div>';
    return;
  }

  taskList.innerHTML = pageTasks.map((t) => `
    <div class="admin-row admin-task-grid">
      <input id="admin-task-name-${t.id}" class="pill-input" value="${escapeAttr(t.name || '')}" placeholder="작업명">
      <select id="admin-task-user-${t.id}" class="pill-input">${userOptions}</select>
      <select id="admin-task-status-${t.id}" class="pill-input">
        <option value="업무대기">업무대기</option>
        <option value="진행중">진행중</option>
        <option value="컨펌중">컨펌중</option>
        <option value="수정중">수정중</option>
        <option value="작업완료">작업완료</option>
      </select>
      <input id="admin-task-date-${t.id}" class="pill-input" type="date" value="${escapeAttr(t.date || '')}">
      <div class="row-actions">
        <button class="btn btn-primary small" onclick="saveTask('${t.id}')">저장</button>
        <button class="btn btn-outline small" onclick="deleteTask('${t.id}')">삭제</button>
      </div>
    </div>
  `).join('');

  pageTasks.forEach((t) => {
    const userEl = document.getElementById(`admin-task-user-${t.id}`);
    const statusEl = document.getElementById(`admin-task-status-${t.id}`);
    if (userEl && t.userId) userEl.value = t.userId;
    if (statusEl && t.status) statusEl.value = normalizeStatus(t.status);
  });
}

function getFilteredAdminTasks() {
  const q = String(localState.adminTaskQuery || '').trim().toLowerCase();
  const statusFilter = localState.adminTaskStatus;
  const userFilter = localState.adminTaskUserId;
  const sortKey = localState.adminTaskSort;

  const filtered = localState.tasks.filter((task) => {
    const normalizedStatus = normalizeStatus(task.status);
    if (statusFilter && normalizedStatus !== statusFilter) return false;
    if (userFilter && task.userId !== userFilter) return false;
    if (!q) return true;
    const haystack = [
      task.name || '',
      (Array.isArray(task.userNames) ? task.userNames.join(' ') : (task.userName || '')),
      task.brandName || '',
      normalizedStatus,
      task.date || ''
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });

  return filtered.sort((a, b) => {
    if (sortKey === 'name_asc') return String(a.name || '').localeCompare(String(b.name || ''));
    if (sortKey === 'name_desc') return String(b.name || '').localeCompare(String(a.name || ''));
    if (sortKey === 'date_asc') return String(a.date || '').localeCompare(String(b.date || ''));
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
}

function renderAdminTaskPager(totalPages) {
  const pager = document.getElementById('adminTaskPager');
  if (!pager) return;
  if (totalPages <= 1) {
    pager.innerHTML = '';
    return;
  }

  const start = Math.max(1, localState.adminTaskPage - 3);
  const end = Math.min(totalPages, start + 6);
  const buttons = [];
  if (localState.adminTaskPage > 1) {
    buttons.push(`<button class="pager-btn" onclick="goAdminTaskPage(${localState.adminTaskPage - 1})">이전</button>`);
  }
  for (let page = start; page <= end; page += 1) {
    buttons.push(`<button class="pager-btn ${page === localState.adminTaskPage ? 'active' : ''}" onclick="goAdminTaskPage(${page})">${page}</button>`);
  }
  if (localState.adminTaskPage < totalPages) {
    buttons.push(`<button class="pager-btn" onclick="goAdminTaskPage(${localState.adminTaskPage + 1})">다음</button>`);
  }
  pager.innerHTML = buttons.join('');
}

function updateAdminTaskQuery(value) {
  localState.adminTaskQuery = value || '';
  localState.adminTaskPage = 1;
  renderAdminLists();
}

function updateAdminTaskStatus(value) {
  localState.adminTaskStatus = value || '';
  localState.adminTaskPage = 1;
  renderAdminLists();
}

function updateAdminTaskUser(value) {
  localState.adminTaskUserId = value || '';
  localState.adminTaskPage = 1;
  renderAdminLists();
}

function updateAdminTaskSort(value) {
  localState.adminTaskSort = value || 'date_desc';
  localState.adminTaskPage = 1;
  renderAdminLists();
}

function updateAdminTaskPageSize(value) {
  const size = Number(value);
  localState.adminTaskPageSize = Number.isFinite(size) && size > 0 ? size : 20;
  localState.adminTaskPage = 1;
  renderAdminLists();
}

function goAdminTaskPage(page) {
  const next = Number(page);
  if (!Number.isFinite(next) || next < 1) return;
  localState.adminTaskPage = next;
  renderAdminLists();
}

function saveUser(userId) {
  if (!localState.isAdmin) return;
  const name = document.getElementById(`admin-user-name-${userId}`).value.trim();
  const pw = document.getElementById(`admin-user-pw-${userId}`).value;
  if (!name || !pw) {
    alert('이름/비밀번호를 입력하세요.');
    return;
  }
  db.collection(COLLECTIONS.users).doc(userId).update({ name, pw });

  Promise.all([
    db.collection(COLLECTIONS.tasks).where('userIds', 'array-contains', userId).get(),
    db.collection(COLLECTIONS.tasks).where('userId', '==', userId).get()
  ]).then((snaps) => {
    const batch = db.batch();
    const visited = new Set();
    snaps.forEach((snap) => {
      snap.docs.forEach((doc) => {
        if (visited.has(doc.id)) return;
        visited.add(doc.id);
        const data = doc.data() || {};
        const ids = Array.isArray(data.userIds) ? data.userIds : (data.userId ? [data.userId] : []);
        const names = ids
          .map((id) => (id === userId ? name : (localState.users.find((u) => u.id === id)?.name || data.userName || '')))
          .filter(Boolean);
        batch.update(doc.ref, {
          userIds: ids,
          userNames: names,
          userId: ids[0] || '',
          userName: names[0] || ''
        });
      });
    });
    return batch.commit();
  });
}

function deleteUser(userId) {
  if (!localState.isAdmin) return;
  if (!confirm('작업자를 삭제하시겠습니까?')) return;
  db.collection(COLLECTIONS.users).doc(userId).delete();
}

function renderBrandManageList() {
  const list = document.getElementById('brandManageList');
  if (!list) return;
  if (!localState.brands.length) {
    list.innerHTML = '<div class="card">등록된 브랜드가 없습니다.</div>';
    return;
  }
  list.innerHTML = localState.brands.map((brand) => `
    <div class="admin-row">
      <input id="brand-name-${brand.id}" class="pill-input" value="${escapeAttr(brand.name || '')}" placeholder="브랜드명">
      <div class="row-actions">
        <button class="btn btn-primary small" onclick="renameBrand('${brand.id}')">수정</button>
      </div>
    </div>
  `).join('');
}

function addBrand() {
  const input = document.getElementById('brandNameInput');
  const name = input ? input.value.trim() : '';
  if (!name) {
    alert('브랜드명을 입력하세요.');
    return;
  }
  const duplicated = localState.brands.some((b) => String(b.name || '').trim() === name);
  if (duplicated) {
    alert('이미 등록된 브랜드입니다.');
    return;
  }
  db.collection(COLLECTIONS.brands).add({
    name,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    if (input) input.value = '';
  });
}

function renameBrand(brandId) {
  const input = document.getElementById(`brand-name-${brandId}`);
  const next = input ? input.value.trim() : '';
  if (!next) {
    alert('브랜드명을 입력하세요.');
    return;
  }
  db.collection(COLLECTIONS.brands).doc(brandId).update({
    name: next,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    const jobs = localState.tasks
      .filter((task) => task.brandId === brandId)
      .map((task) => db.collection(COLLECTIONS.tasks).doc(task.id).update({
        brandName: next,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }));
    return Promise.all(jobs);
  });
}

function openGymMoodModal() {
  const monthInput = document.getElementById('gymMonthInput');
  if (monthInput) monthInput.value = localState.gymMoodMonth;
  ensureGymMoodMonthRows(localState.gymMoodMonth).then(() => {
    renderGymMoodList();
    openModal('gymMoodModal');
  });
}

function setGymMoodMonth(value) {
  if (!value) return;
  localState.gymMoodMonth = value;
  ensureGymMoodMonthRows(value).then(() => {
    renderGymMoodList();
  });
}

function addGymBranch() {
  const input = document.getElementById('gymBranchInput');
  const monthInput = document.getElementById('gymMonthInput');
  const branch = input ? input.value.trim() : '';
  const month = monthInput && monthInput.value ? monthInput.value : localState.gymMoodMonth;
  if (!branch || !month) {
    alert('월과 지점명을 확인하세요.');
    return;
  }

  const exists = localState.gymMoodRows.some((row) => row.month === month && String(row.branch || '').trim() === branch);
  if (exists) {
    alert('이미 등록된 지점입니다.');
    return;
  }

  const checks = {};
  GYM_CATEGORIES.forEach((category) => { checks[category] = false; });
  const nextOrder = localState.gymMoodRows
    .filter((row) => row.month === month)
    .reduce((max, row) => Math.max(max, Number(row.order || 0)), 0) + 1;
  db.collection(COLLECTIONS.gymMood).add({
    month,
    branch,
    checks,
    order: nextOrder,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    if (input) input.value = '';
  });
}

function toggleGymMoodCheck(rowId, category, checked) {
  if (!rowId || !category) return;
  db.collection(COLLECTIONS.gymMood).doc(rowId).update({
    [`checks.${category}`]: !!checked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function renderGymMoodList() {
  const list = document.getElementById('gymMoodList');
  if (!list) return;

  const month = localState.gymMoodMonth;
  const rows = localState.gymMoodRows
    .filter((row) => row.month === month)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.branch || '').localeCompare(String(b.branch || '')));

  if (!rows.length) {
    list.innerHTML = '<div class="card">이번 달 등록된 지점이 없습니다.</div>';
    return;
  }

  list.innerHTML = rows.map((row) => {
    const checks = row.checks || {};
    const doneCount = GYM_CATEGORIES.filter((category) => !!checks[category]).length;
    const checkItems = GYM_CATEGORIES.map((category) => `
      <label class="gym-check-item">
        <input type="checkbox" ${checks[category] ? 'checked' : ''} onchange="toggleGymMoodCheck('${row.id}','${category}', this.checked)">
        <span>${category}</span>
      </label>
    `).join('');
    return `
      <article class="gym-mood-row" draggable="true" ondragstart="startGymMoodDrag('${row.id}')" ondragover="allowGymMoodDrop(event)" ondragleave="leaveGymMoodDrop(event)" ondrop="dropGymMood('${row.id}', event)" ondragend="endGymMoodDrag()">
        <div class="gym-mood-head">
          <span class="gym-mood-branch">${escapeHtml(row.branch || '')}</span>
          <span class="worker-load-total">${doneCount}/${GYM_CATEGORIES.length} 완료</span>
        </div>
        <div class="gym-mood-checks">${checkItems}</div>
      </article>
    `;
  }).join('');
}

function crackFortuneCookie(type) {
  const selectedType = type && FORTUNE_BY_TYPE[type] ? type : pickRandomFortuneType();
  const fortunes = FORTUNE_BY_TYPE[selectedType] || FORTUNE_BY_TYPE.행운;
  const cookie = document.getElementById('fortuneCookie');
  const result = document.getElementById('fortuneResult');
  const picked = fortunes[Math.floor(Math.random() * fortunes.length)];
  const cookieEmoji = FORTUNE_COOKIE_ICON[selectedType] || '🥠';
  if (cookie) {
    cookie.textContent = cookieEmoji;
    cookie.classList.remove('crack');
    void cookie.offsetWidth;
    cookie.classList.add('crack');
  }
  if (result) {
    result.textContent = `[${selectedType}] ${picked}`;
    result.classList.remove('show');
    void result.offsetWidth;
    result.classList.add('show');
  }
  launchFortuneCelebration(selectedType);
}

function pickRandomFortuneType() {
  const keys = Object.keys(FORTUNE_BY_TYPE);
  return keys[Math.floor(Math.random() * keys.length)];
}

function launchFortuneCelebration(type) {
  const wrap = document.querySelector('#refreshModal .fortune-wrap');
  if (!wrap) return;
  wrap.classList.remove('fortune-celebrate');
  void wrap.offsetWidth;
  wrap.classList.add('fortune-celebrate');

  let layer = document.getElementById('fortuneConfettiLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fortuneConfettiLayer';
    layer.className = 'fortune-confetti-layer';
    wrap.appendChild(layer);
  }

  layer.innerHTML = '';
  const tones = type === '집중'
    ? ['✨', '📌', '🎯']
    : (type === '행운' ? ['🎉', '🍀', '💫'] : ['🎊', '🌙', '☕']);

  for (let i = 0; i < 18; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'fortune-confetti';
    piece.textContent = tones[Math.floor(Math.random() * tones.length)];
    piece.style.setProperty('--dx', `${Math.round(Math.random() * 280 - 140)}px`);
    piece.style.setProperty('--dy', `${Math.round(70 + Math.random() * 130)}px`);
    piece.style.setProperty('--dr', `${Math.round(Math.random() * 120 - 60)}deg`);
    piece.style.left = `${45 + Math.random() * 10}%`;
    piece.style.animationDelay = `${(Math.random() * 0.15).toFixed(2)}s`;
    layer.appendChild(piece);
  }

  setTimeout(() => {
    if (layer) layer.innerHTML = '';
  }, 1200);
}

function resetRefreshModal() {
  const cookie = document.getElementById('fortuneCookie');
  const result = document.getElementById('fortuneResult');
  const wrap = document.querySelector('#refreshModal .fortune-wrap');
  const layer = document.getElementById('fortuneConfettiLayer');
  if (cookie) {
    cookie.textContent = '🥠';
    cookie.classList.remove('crack');
  }
  if (result) {
    result.textContent = '오늘의 운세를 확인해보세요.';
    result.classList.remove('show');
  }
  if (wrap) wrap.classList.remove('fortune-celebrate');
  if (layer) layer.innerHTML = '';
}

function ensureGymMoodMonthRows(month) {
  const currentRows = localState.gymMoodRows.filter((row) => row.month === month);
  if (currentRows.length) return Promise.resolve();

  const prevMonth = getPreviousMonthValue(month);
  const prevRows = localState.gymMoodRows
    .filter((row) => row.month === prevMonth)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (!prevRows.length) return Promise.resolve();

  const jobs = prevRows.map((row, idx) => {
    const checks = {};
    GYM_CATEGORIES.forEach((category) => { checks[category] = false; });
    return db.collection(COLLECTIONS.gymMood).add({
      month,
      branch: row.branch || '',
      checks,
      order: idx + 1,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  return Promise.all(jobs).then(() => undefined);
}

function getPreviousMonthValue(monthValue) {
  const [y, m] = String(monthValue || '').split('-').map(Number);
  if (!y || !m) return '';
  const date = new Date(y, m - 2, 1);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

function startGymMoodDrag(rowId) {
  localState.gymMoodDragId = rowId || '';
}

function allowGymMoodDrop(event) {
  event.preventDefault();
  const row = event.currentTarget;
  if (row) row.classList.add('drag-over');
}

function leaveGymMoodDrop(event) {
  const row = event.currentTarget;
  if (row) row.classList.remove('drag-over');
}

function dropGymMood(targetRowId, event) {
  event.preventDefault();
  const row = event.currentTarget;
  if (row) row.classList.remove('drag-over');
  const sourceId = localState.gymMoodDragId;
  if (!sourceId || !targetRowId || sourceId === targetRowId) return;

  const month = localState.gymMoodMonth;
  const rows = localState.gymMoodRows
    .filter((item) => item.month === month)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const sourceIdx = rows.findIndex((item) => item.id === sourceId);
  const targetIdx = rows.findIndex((item) => item.id === targetRowId);
  if (sourceIdx < 0 || targetIdx < 0) return;

  const reordered = rows.slice();
  const [moved] = reordered.splice(sourceIdx, 1);
  reordered.splice(targetIdx, 0, moved);

  const batch = db.batch();
  reordered.forEach((item, idx) => {
    batch.update(db.collection(COLLECTIONS.gymMood).doc(item.id), {
      order: idx + 1,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  batch.commit();
}

function endGymMoodDrag() {
  localState.gymMoodDragId = '';
}

function saveTask(taskId) {
  if (!localState.isAdmin) return;
  const name = document.getElementById(`admin-task-name-${taskId}`).value.trim();
  const userId = document.getElementById(`admin-task-user-${taskId}`).value;
  const status = document.getElementById(`admin-task-status-${taskId}`).value;
  const date = document.getElementById(`admin-task-date-${taskId}`).value;

  const user = localState.users.find((u) => u.id === userId);
  if (!name || !user) {
    alert('작업명 또는 담당자를 확인하세요.');
    return;
  }

  db.collection(COLLECTIONS.tasks).doc(taskId).update({
    name,
    userIds: userId ? [userId] : [],
    userNames: user ? [user.name] : [],
    userId,
    userName: user.name,
    status: normalizeStatus(status),
    date,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function deleteTask(taskId) {
  if (!localState.isAdmin) return;
  if (!confirm('작업을 삭제하시겠습니까?')) return;
  db.collection(COLLECTIONS.tasks).doc(taskId).delete();
}

function openTaskEditModal(taskId) {
  const task = localState.tasks.find((t) => t.id === taskId);
  if (!task) return;

  localState.editingTaskId = taskId;
  document.getElementById('editTaskName').value = task.name || '';
  document.getElementById('editTaskDesc').value = task.desc || '';
  document.getElementById('editTaskBackupLocation').value = task.backupLocation || '';
  document.getElementById('editTaskDate').value = task.date || '';
  document.getElementById('editTaskStatusSelect').value = normalizeStatus(task.status);
  document.getElementById('editTaskBrandSelect').value = task.brandId || '';

  const ids = resolveAssigneeIds(task);
  const userSelect1 = document.getElementById('editTaskUserSelect1');
  const userSelect2 = document.getElementById('editTaskUserSelect2');
  if (userSelect1) userSelect1.value = ids[0] || '';
  if (userSelect2) userSelect2.value = ids[1] || '';

  openModal('taskEditModal');
}

function saveTaskFromBoard() {
  if (!localState.editingTaskId) return;
  const name = document.getElementById('editTaskName').value.trim();
  const desc = document.getElementById('editTaskDesc').value.trim();
  const backupLocation = document.getElementById('editTaskBackupLocation').value.trim();
  const userId1 = document.getElementById('editTaskUserSelect1').value;
  const userId2 = document.getElementById('editTaskUserSelect2').value;
  const brandId = document.getElementById('editTaskBrandSelect').value;
  const status = document.getElementById('editTaskStatusSelect').value;
  const date = document.getElementById('editTaskDate').value;

  const brand = localState.brands.find((b) => b.id === brandId);
  const assigneeIds = Array.from(new Set([userId1, userId2].filter(Boolean))).slice(0, 2);
  const assigneeNames = assigneeIds
    .map((id) => localState.users.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => u.name);

  if (!name || !brand) {
    alert('작업명 또는 브랜드를 확인하세요.');
    return;
  }

  db.collection(COLLECTIONS.tasks).doc(localState.editingTaskId).update({
    name,
    desc,
    backupLocation,
    userIds: assigneeIds,
    userNames: assigneeNames,
    userId: assigneeIds[0] || '',
    userName: assigneeNames[0] || '',
    brandId: brand.id,
    brandName: brand.name,
    status: normalizeStatus(status),
    date,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    closeModal('taskEditModal');
    localState.editingTaskId = null;
  });
}

function handleAdminAction() {
  if (!localState.isAdmin) {
    const key = prompt('Admin Key 입력');
    if (key === '0512') {
      localState.isAdmin = true;
      persistAuthState();
      render();
      openModal('adminModal');
    } else if (key !== null) {
      alert('키가 올바르지 않습니다.');
    }
    return;
  }

  openModal('adminModal');
}

function updateAdminUI() {
  const badge = document.getElementById('adminBadge');
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const userLogoutBtn = document.getElementById('userLogoutBtn');
  const profileBtn = document.getElementById('profileBtn');
  const adminBtn = document.getElementById('adminBtn');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const loginInfo = document.getElementById('loginInfo');
  const currentName = localState.currentUser ? localState.currentUser.name : 'Guest';
  if (loginInfo) {
    const avatarSrc = resolveUserAvatar(localState.currentUser ? localState.currentUser.id : '', currentName);
    loginInfo.innerHTML = `<img class="avatar-xs" src="${escapeAttr(avatarSrc)}" alt="avatar"><span>${escapeHtml(currentName)}</span>`;
  }

  if (loginBtn) loginBtn.classList.toggle('hidden', !!localState.currentUser);
  if (signupBtn) signupBtn.classList.toggle('hidden', !!localState.currentUser);
  if (userLogoutBtn) userLogoutBtn.classList.toggle('hidden', !localState.currentUser);
  if (profileBtn) profileBtn.classList.toggle('hidden', !localState.currentUser);
  if (adminLogoutBtn) adminLogoutBtn.classList.toggle('hidden', !localState.isAdmin);

  if (localState.isAdmin) {
    if (badge) badge.classList.remove('hidden');
    adminBtn.innerText = 'Admin Page';
  } else {
    if (badge) badge.classList.add('hidden');
    adminBtn.innerText = 'Admin';
  }
}

function updateAuthUI() {
  updateAdminUI();
}

function toggleThemeMode() {
  localState.themeMode = localState.themeMode === 'dark' ? 'light' : 'dark';
  applyThemeMode();
  persistThemeMode();
}

function applyThemeMode() {
  const isDark = localState.themeMode === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  const icon = document.getElementById('themeToggleIcon');
  const btn = document.getElementById('themeToggleBtn');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (btn) {
    const title = isDark ? '일반모드' : '다크모드';
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
  if (id === 'taskCreateModal') {
    setTimeout(() => {
      const nameEl = document.getElementById('taskName');
      if (nameEl) nameEl.focus();
    }, 0);
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
  if (id === 'taskEditModal') localState.editingTaskId = null;
  if (id === 'refreshModal') resetRefreshModal();
}

function closeOnBackdrop(event, modalId) {
  if (event.target.id === modalId) closeModal(modalId);
}

function switchView(mode) {
  if (mode === 'calendar') {
    localState.viewMode = 'calendar';
  } else if (mode === 'worker') {
    localState.viewMode = 'worker';
  } else {
    localState.viewMode = 'board';
  }
  renderViewMode();
  if (localState.viewMode === 'calendar') {
    renderCalendar();
  }
  if (localState.viewMode === 'worker') {
    renderWorkerMode();
  }
}

function setCalendarMonth(value) {
  if (!value) return;
  localState.calendarMonth = value;
  renderViewMode();
  renderCalendar();
}

function moveCalendarMonth(offset) {
  const [yearStr, monthStr] = String(localState.calendarMonth || '').split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return;
  const date = new Date(year, month - 1 + Number(offset || 0), 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  setCalendarMonth(`${y}-${m}`);
}

function registerUser() {
  const name = document.getElementById('regName').value.trim();
  const pw = document.getElementById('regPw').value.trim();
  const avatarInput = document.getElementById('regAvatar');
  const avatarPreview = document.getElementById('regAvatarPreview');
  if (!name || !pw) {
    alert('이름과 비밀번호를 입력하세요.');
    return;
  }

  const file = avatarInput && avatarInput.files && avatarInput.files[0] ? avatarInput.files[0] : null;
  const fallbackAvatar = generateAvatarDataUrl(name);
  const onSaved = () => {
    document.getElementById('regName').value = '';
    document.getElementById('regPw').value = '';
    if (avatarInput) avatarInput.value = '';
    if (avatarPreview) avatarPreview.src = generateAvatarDataUrl('U');
    closeModal('registerModal');
  };

  if (file) {
    readFileAsDataUrl(file).then((avatar) => {
      return db.collection(COLLECTIONS.users).add({
        name,
        pw,
        avatar: avatar || fallbackAvatar,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(onSaved);
    return;
  }

  db.collection(COLLECTIONS.users).add({
    name,
    pw,
    avatar: fallbackAvatar,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(onSaved);
}

function loginUser() {
  const userId = document.getElementById('loginUserSelect').value;
  const pw = document.getElementById('loginPw').value;
  const user = localState.users.find((u) => u.id === userId);

  if (!user || user.pw !== pw) {
    alert('로그인 정보가 맞지 않습니다.');
    return;
  }

  localState.currentUser = user;
  localState.pendingUserId = null;
  localState.isAdmin = isAdminName(user.name);
  persistAuthState();
  render();
  closeModal('loginModal');
  document.getElementById('loginPw').value = '';
  window.location.reload();
}

function logoutUser() {
  localState.currentUser = null;
  localState.isAdmin = false;
  localState.pendingUserId = null;
  persistAuthState();
  closeModal('adminModal');
  render();
}

function logoutAdmin() {
  localState.isAdmin = false;
  persistAuthState();
  closeModal('adminModal');
  render();
}

function addNewMemo() {
  db.collection(COLLECTIONS.memos).add({
    title: '새 메모 제목',
    content: '',
    isCollapsed: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function renderMemos() {
  const grid = document.getElementById('memoGrid');
  grid.innerHTML = localState.memos.map((memo) => {
    return `
      <article class="memo-card ${memo.isCollapsed ? 'collapsed' : ''}">
        <div class="memo-header">
          <input class="memo-title" value="${escapeAttr(memo.title || '')}" onblur="updateMemo('${memo.id}', 'title', this.value)">
          <div class="memo-tools">
            <button class="btn btn-outline small" onclick="toggleMemo('${memo.id}', ${memo.isCollapsed ? 'false' : 'true'})">${memo.isCollapsed ? '펼치기' : '접기'}</button>
            <button class="btn btn-outline small" onclick="deleteMemo('${memo.id}')">삭제</button>
          </div>
        </div>
        <div class="note-shell">
          <textarea id="memo-body-${memo.id}" class="memo-body note-editor-pane" oninput="handleMemoInput('${memo.id}', this.value)" onpaste="handleMemoPaste(event, '${memo.id}')">${escapeHtml(memo.content || '')}</textarea>
          <div id="memo-view-${memo.id}" class="note-view-pane note-live-preview">${renderNoteElements(memo.content || '')}</div>
        </div>
      </article>
    `;
  }).join('');
}

function renderNoteElements(content) {
  const safeContent = content || '';
  const lines = safeContent.split('\n');
  return lines
    .map((line) => `<div class="note-line">${renderLineWithLinks(line) || '<br>'}</div>`)
    .join('');
}

function renderNotePreview(targetId, content) {
  const preview = document.getElementById(targetId);
  if (preview) preview.innerHTML = renderNoteElements(content);
}

function updateMemo(id, field, value) {
  const memo = localState.memos.find((m) => m.id === id);
  if (memo && memo[field] === value) return;
  db.collection(COLLECTIONS.memos).doc(id).update({ [field]: value });
}

function scheduleMemoSave(id, value) {
  if (!id) return;
  if (localState.memoSaveTimers[id]) {
    clearTimeout(localState.memoSaveTimers[id]);
  }
  localState.memoSaveTimers[id] = setTimeout(() => {
    updateMemo(id, 'content', value);
    delete localState.memoSaveTimers[id];
  }, 300);
}

function handleMemoInput(id, value) {
  renderMemoView(id, value);
  scheduleMemoSave(id, value);
}

function renderMemoView(id, content) {
  const view = document.getElementById(`memo-view-${id}`);
  if (!view) return;
  view.innerHTML = renderNoteElements(content || '');
}

function deleteMemo(id) {
  if (!confirm('메모를 삭제하시겠습니까?')) return;
  db.collection(COLLECTIONS.memos).doc(id).delete();
}

function toggleMemo(id, collapsed) {
  db.collection(COLLECTIONS.memos).doc(id).update({ isCollapsed: collapsed });
}

function resolveUserName(task) {
  const names = resolveAssigneeNames(task);
  return names.length ? names.join(', ') : '-';
}

function resolveAssigneeIds(task) {
  if (Array.isArray(task.userIds) && task.userIds.length) return task.userIds.filter(Boolean);
  if (task.userId) return [task.userId];
  return [];
}

function resolveAssigneeNames(task) {
  if (Array.isArray(task.userNames) && task.userNames.length) return task.userNames.filter(Boolean);
  const ids = resolveAssigneeIds(task);
  if (ids.length) {
    return ids
      .map((id) => localState.users.find((u) => u.id === id))
      .filter(Boolean)
      .map((u) => u.name);
  }
  return task.userName ? [task.userName] : [];
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const prev = textarea.value;
  const insert = start === 0 ? `${text}` : `\n${text}`;
  textarea.value = prev.slice(0, start) + insert + prev.slice(end);
}

function wrapSelectionWithLink(textarea) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const prev = textarea.value;
  const selected = prev.slice(start, end).trim();
  const linkTitle = selected || '링크 제목';
  const replacement = `[${linkTitle}](https://)`;
  textarea.value = prev.slice(0, start) + replacement + prev.slice(end);

  const cursorPos = start + replacement.length;
  textarea.selectionStart = cursorPos;
  textarea.selectionEnd = cursorPos;
}

function insertMemoText(memoId, text) {
  const textarea = document.getElementById(`memo-body-${memoId}`);
  if (!textarea) return;
  insertTextAtCursor(textarea, text);
  textarea.focus();
  scheduleMemoSave(memoId, textarea.value);
}

function insertMemoLink(memoId) {
  const textarea = document.getElementById(`memo-body-${memoId}`);
  if (!textarea) return;
  wrapSelectionWithLink(textarea);
  scheduleMemoSave(memoId, textarea.value);
  textarea.focus();
}

function insertSharedText(text) {
  const textarea = document.getElementById('archiveStaticMemo');
  if (!textarea) return;
  insertTextAtCursor(textarea, text);
  textarea.focus();
  scheduleSharedMemoSave();
}

function insertSharedLink() {
  const textarea = document.getElementById('archiveStaticMemo');
  if (!textarea) return;
  wrapSelectionWithLink(textarea);
  scheduleSharedMemoSave();
  textarea.focus();
}

function handleMemoPaste(event, memoId) {
  handleImagePaste(event, (markdownImage) => {
    const textarea = document.getElementById(`memo-body-${memoId}`);
    if (!textarea) return;
    insertTextAtCursor(textarea, markdownImage);
    handleMemoInput(memoId, textarea.value);
  });
}

function handleSharedPaste(event) {
  handleImagePaste(event, (markdownImage) => {
    const textarea = document.getElementById('archiveStaticMemo');
    if (!textarea) return;
    insertTextAtCursor(textarea, markdownImage);
    scheduleSharedMemoSave();
  });
}

function handleImagePaste(event, onImageReady) {
  const clipboardItems = event.clipboardData && event.clipboardData.items ? event.clipboardData.items : [];
  const imageItem = Array.from(clipboardItems).find((item) => item.type && item.type.startsWith('image/'));
  if (!imageItem) return;

  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = typeof reader.result === 'string' ? reader.result : '';
    if (!dataUrl) return;
    onImageReady(`![붙여넣기 이미지](${dataUrl})`);
  };
  reader.readAsDataURL(file);
}

function saveSharedMemo() {
  const editor = document.getElementById('archiveStaticMemo');
  if (!editor) return;
  if (localState.sharedMemoSaveTimer) {
    clearTimeout(localState.sharedMemoSaveTimer);
    localState.sharedMemoSaveTimer = null;
  }
  const content = editor.value;
  db.collection(COLLECTIONS.config).doc('sharedMemo').set({ content }, { merge: true });
  renderSharedView(content);
}

function scheduleSharedMemoSave() {
  const editor = document.getElementById('archiveStaticMemo');
  if (!editor) return;
  renderSharedView(editor.value);
  if (localState.sharedMemoSaveTimer) clearTimeout(localState.sharedMemoSaveTimer);
  localState.sharedMemoSaveTimer = setTimeout(() => {
    saveSharedMemo();
  }, 300);
}

function renderSharedView(content) {
  const view = document.getElementById('sharedView');
  if (!view) return;
  view.innerHTML = renderNoteElements(content || '');
}

function renderLineWithLinks(line) {
  const raw = String(line || '');
  const markdownImages = [];
  const withImageTokens = raw.replace(/!\[([^\]]*)\]\((data:image\/[^)]+|https?:\/\/[^\s)]+)\)/g, (full, alt, src) => {
    const token = `__NOTE_IMAGE_${markdownImages.length}__`;
    markdownImages.push(`<img class="note-image" src="${escapeAttr(src)}" alt="${escapeAttr(alt || 'image')}">`);
    return token;
  });

  const markdownLinks = [];
  const withLinkTokens = withImageTokens.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (full, text, url) => {
    const token = `__NOTE_LINK_${markdownLinks.length}__`;
    markdownLinks.push(`<a class="note-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`);
    return token;
  });

  const escaped = escapeHtml(withLinkTokens);
  const plainLinked = escaped.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (full, prefix, url) => {
    return `${prefix}<a class="note-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
  });

  const withLinks = markdownLinks.reduce((html, link, index) => html.replace(`__NOTE_LINK_${index}__`, link), plainLinked);
  return markdownImages.reduce((html, image, index) => html.replace(`__NOTE_IMAGE_${index}__`, image), withLinks);
}

function normalizeStatus(status) {
  const normalized = LEGACY_STATUS_MAP[status] || status || '업무대기';
  if (normalized === '보류중') return '업무대기';
  return normalized;
}

function getStatusClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === '업무대기') return 'status-wait';
  if (normalized === '진행중') return 'status-progress';
  if (normalized === '컨펌중') return 'status-confirm';
  if (normalized === '수정중') return 'status-edit';
  if (normalized === '작업완료') return 'status-done';
  if (normalized === '보류중') return 'status-hold';
  return 'status-default';
}

function getCurrentMonthValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const sharedMemoEl = document.getElementById('archiveStaticMemo');
if (sharedMemoEl) {
  sharedMemoEl.addEventListener('input', scheduleSharedMemoSave);
}
const regNameEl = document.getElementById('regName');
if (regNameEl) {
  regNameEl.addEventListener('input', () => {
    const avatarInput = document.getElementById('regAvatar');
    if (!avatarInput || !avatarInput.files || !avatarInput.files[0]) {
      updateSignupAvatarPreview();
    }
  });
}
updateSignupAvatarPreview();
initSlashEmojiPicker();

const loginPwEl = document.getElementById('loginPw');
if (loginPwEl) {
  loginPwEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    loginUser();
  });
}

const regPwEl = document.getElementById('regPw');
if (regPwEl) {
  regPwEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    registerUser();
  });
}

function getUserById(userId) {
  return localState.users.find((u) => u.id === userId) || null;
}

function resolveUserAvatar(userId, fallbackName) {
  const user = getUserById(userId);
  const name = user && user.name ? user.name : (fallbackName || 'U');
  return (user && user.avatar) ? user.avatar : generateAvatarDataUrl(name);
}

function generateAvatarDataUrl(name) {
  const safeName = String(name || 'U').trim();
  const initial = escapeHtml((safeName[0] || 'U').toUpperCase());
  const colors = ['#5B8DEF', '#13A39A', '#FF8A3D', '#AA6BE5', '#E05D78', '#4FAE5A'];
  const index = Math.abs(hashString(safeName)) % colors.length;
  const bg = colors[index];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="100%" height="100%" rx="48" ry="48" fill="${bg}"/><text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Pretendard, Arial, sans-serif" font-size="42" fill="#ffffff">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function hashString(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) - h) + text.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function prepareProfileAvatar(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return Promise.reject(new Error('not_image'));
  }
  return readFileAsDataUrl(file).then((dataUrl) => compressAvatarDataUrl(dataUrl, 360, 720 * 1024));
}

function compressAvatarDataUrl(dataUrl, maxSide, maxBytes) {
  return loadImageFromDataUrl(dataUrl).then((img) => {
    const srcW = img.naturalWidth || img.width || 0;
    const srcH = img.naturalHeight || img.height || 0;
    if (!srcW || !srcH) throw new Error('invalid_image');

    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_failed');
    ctx.drawImage(img, 0, 0, width, height);

    const qualities = [0.86, 0.78, 0.7, 0.62, 0.54];
    for (let i = 0; i < qualities.length; i += 1) {
      const out = canvas.toDataURL('image/jpeg', qualities[i]);
      if (estimateDataUrlBytes(out) <= maxBytes) return out;
    }
    const last = canvas.toDataURL('image/jpeg', 0.5);
    if (estimateDataUrlBytes(last) <= maxBytes) return last;
    throw new Error('too_large');
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('invalid_image'));
    img.src = dataUrl;
  });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
  return Math.floor((base64.length * 3) / 4) - padding;
}

function getProfileAvatarErrorMessage(err) {
  const code = err && err.message ? err.message : '';
  if (code === 'not_image') return '이미지 파일만 업로드할 수 있습니다.';
  if (code === 'too_large') return '이미지가 너무 커서 저장할 수 없습니다. 더 작은 이미지를 선택해 주세요.';
  return '이미지 처리 또는 저장 중 오류가 발생했습니다.';
}

function updateSignupAvatarPreview() {
  const fileInput = document.getElementById('regAvatar');
  const preview = document.getElementById('regAvatarPreview');
  const name = document.getElementById('regName') ? document.getElementById('regName').value : '';
  if (!preview) return;
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    preview.src = generateAvatarDataUrl(name || 'U');
    return;
  }
  readFileAsDataUrl(fileInput.files[0]).then((dataUrl) => {
    preview.src = dataUrl || generateAvatarDataUrl(name || 'U');
  }).catch(() => {
    preview.src = generateAvatarDataUrl(name || 'U');
  });
}

function isAdminName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return ['관리자', 'master', 'admin'].includes(normalized);
}

function persistAuthState() {
  try {
    const payload = {
      userId: localState.currentUser ? localState.currentUser.id : null,
      isAdmin: !!localState.isAdmin
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('auth state save failed', err);
  }
}

function persistThemeMode() {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, localState.themeMode === 'dark' ? 'dark' : 'light');
  } catch (err) {
    console.warn('theme state save failed', err);
  }
}

function hydrateAuthFromStorage() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    localState.pendingUserId = parsed && parsed.userId ? parsed.userId : null;
    localState.isAdmin = !!(parsed && parsed.isAdmin);
  } catch (err) {
    console.warn('auth state load failed', err);
  }
}

function hydrateThemeMode() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    localState.themeMode = saved === 'dark' ? 'dark' : 'light';
  } catch (err) {
    localState.themeMode = 'light';
  }
  applyThemeMode();
}

function syncAuthFromUsers() {
  if (!localState.pendingUserId || localState.currentUser) return;
  const user = localState.users.find((u) => u.id === localState.pendingUserId);
  if (!user) {
    localState.pendingUserId = null;
    localState.isAdmin = false;
    persistAuthState();
    return;
  }

  localState.currentUser = user;
  localState.pendingUserId = null;
  if (isAdminName(user.name)) {
    localState.isAdmin = true;
  }
  persistAuthState();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function insertEmoji(targetId, emoji) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const text = String(el.value || '');
  const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
  el.value = next;
  const cursor = start + emoji.length;
  el.selectionStart = cursor;
  el.selectionEnd = cursor;
  el.focus();
}

const SLASH_EMOJI_TOKEN = '/이모지';
const SLASH_EMOJIS = ['😳', '🥹', '🙈', '🙂', '😊', '😂', '😍', '😎', '🤔', '✅', '📌', '📅', '📝', '📎', '📊', '💼', '🔥', '🎉', '✨', '🧸', '🐰'];
const slashEmojiState = {
  el: null,
  tokenStart: -1,
  caretPos: -1
};

function initSlashEmojiPicker() {
  if (document.getElementById('slashEmojiPicker')) return;
  const picker = document.createElement('div');
  picker.id = 'slashEmojiPicker';
  picker.className = 'slash-emoji-picker hidden';
  document.body.appendChild(picker);

  const targetIds = ['taskName', 'taskDesc', 'editTaskName', 'editTaskDesc'];
  targetIds.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => handleSlashEmojiTrigger(input));
    input.addEventListener('click', () => handleSlashEmojiTrigger(input));
    input.addEventListener('keyup', () => handleSlashEmojiTrigger(input));
    input.addEventListener('blur', () => {
      setTimeout(() => hideSlashEmojiPicker(), 120);
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target) return;
    const pickerEl = document.getElementById('slashEmojiPicker');
    if (!pickerEl) return;
    if (pickerEl.contains(target)) return;
    hideSlashEmojiPicker();
  });
}

function handleSlashEmojiTrigger(input) {
  const picker = document.getElementById('slashEmojiPicker');
  if (!picker || !input) return;

  const caretPos = typeof input.selectionStart === 'number' ? input.selectionStart : String(input.value || '').length;
  const prefix = String(input.value || '').slice(0, caretPos);
  const tokenStart = prefix.lastIndexOf(SLASH_EMOJI_TOKEN);
  const hasToken = tokenStart >= 0 && caretPos >= tokenStart + SLASH_EMOJI_TOKEN.length;

  if (!hasToken) {
    if (slashEmojiState.el === input) hideSlashEmojiPicker();
    return;
  }

  slashEmojiState.el = input;
  slashEmojiState.tokenStart = tokenStart;
  slashEmojiState.caretPos = caretPos;

  picker.innerHTML = SLASH_EMOJIS
    .map((emoji) => `<button type="button" class="slash-emoji-item" data-emoji="${escapeAttr(emoji)}">${emoji}</button>`)
    .join('');

  picker.querySelectorAll('.slash-emoji-item').forEach((btn) => {
    btn.addEventListener('mousedown', (event) => event.preventDefault());
    btn.addEventListener('click', () => applySlashEmoji(btn.dataset.emoji || ''));
  });

  const rect = input.getBoundingClientRect();
  picker.style.left = `${Math.max(12, rect.left + window.scrollX)}px`;
  picker.style.top = `${rect.bottom + window.scrollY + 6}px`;
  picker.classList.remove('hidden');
}

function applySlashEmoji(emoji) {
  const input = slashEmojiState.el;
  if (!input || !emoji) return;
  const value = String(input.value || '');
  const start = Math.max(0, slashEmojiState.tokenStart);
  const end = Math.max(start, slashEmojiState.caretPos);
  input.value = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
  const nextPos = start + emoji.length;
  input.selectionStart = nextPos;
  input.selectionEnd = nextPos;
  input.focus();
  hideSlashEmojiPicker();
}

function hideSlashEmojiPicker() {
  const picker = document.getElementById('slashEmojiPicker');
  if (picker) picker.classList.add('hidden');
  slashEmojiState.el = null;
  slashEmojiState.tokenStart = -1;
  slashEmojiState.caretPos = -1;
}

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  ['taskCreateModal', 'workerListModal', 'registerModal', 'loginModal', 'adminModal', 'taskEditModal', 'brandListModal', 'refreshModal', 'gymMoodModal'].forEach(closeModal);
});

window.handleMemoPaste = handleMemoPaste;
window.handleSharedPaste = handleSharedPaste;

