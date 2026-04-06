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
const REFRESH_MODES = ['fortune', 'lotto', 'ladder', 'maze'];
const LOTTO_MAX_NUMBER = 45;
const LOTTO_PICK_COUNT = 6;
const LOTTO_LINE_COUNT = 5;
const LOTTO_DRAW_DELAY_MS = 1350;
const LADDER_MIN_PLAYERS = 2;
const LADDER_MAX_PLAYERS = 12;
const LADDER_TRACE_DURATION_MS = 2800;
const LADDER_SUSPENSE_DURATION_MS = 2200;
const LADDER_WINNER_OVERLAY_MS = 2200;
const MAZE_MIN_COLS = 16;
const MAZE_MAX_COLS = 26;
const MAZE_MIN_ROWS = 13;
const MAZE_MAX_ROWS = 18;
const GYM_FIGMA_LINK_URL = 'https://www.figma.com/design/N8Zh1ZD74dr4JqfmImrNMY/%EC%9B%94%EA%B0%84-%EC%A7%90%EB%AC%B4%EB%93%9C?node-id=0-1&t=ivmlP1iVhL780gf8-1';
let refreshLottoDrawToken = 0;
let refreshClassicLadderDrawToken = 0;
let refreshClassicLadderNames = [];
let refreshClassicLadderInitialized = false;
let refreshLadderDrawToken = 0;
let refreshLadderNames = [];
let refreshLadderInitialized = false;
let refreshLadderWinnerTimer = null;
const BRAND_COLOR_PRESETS = [
  { key: 'ocean', label: '오션', light: '#2f63c8', dark: '#8fc0ff' },
  { key: 'mint', label: '민트', light: '#1f8f6d', dark: '#88e3c1' },
  { key: 'violet', label: '바이올렛', light: '#6d4ac9', dark: '#c5b1ff' },
  { key: 'coral', label: '코랄', light: '#cc5b48', dark: '#ffb7a8' },
  { key: 'amber', label: '앰버', light: '#a36a18', dark: '#ffd58f' },
  { key: 'rose', label: '로즈', light: '#b24774', dark: '#ffb6d4' },
  { key: 'sky', label: '스카이', light: '#2f90c8', dark: '#9fe1ff' },
  { key: 'lime', label: '라임', light: '#5d9c1f', dark: '#c8ef96' },
  { key: 'plum', label: '플럼', light: '#7f3b8f', dark: '#dda9ea' },
  { key: 'slate', label: '슬레이트', light: '#4c617c', dark: '#b9c8dd' },
  { key: 'brick', label: '브릭', light: '#9b4537', dark: '#efb2a7' },
  { key: 'teal', label: '틸', light: '#1f7c85', dark: '#93d9df' }
];

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
  figmaBoardSaveTimer: null,
  memoSaveTimers: {},
  memoPreviewTimers: {},
  memoTypingUntil: 0,
  memoRenderTimer: null,
  figmaBoardContent: '',
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
  gymMoodEditMode: false,
  themeMode: 'light',
  brandEditMode: false
};
let memoWalkerResumeTimer = null;

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
    maybeRenderMemos();
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

  db.collection(COLLECTIONS.config).doc('figmaLinks').onSnapshot({ includeMetadataChanges: true }, (doc) => {
    setFirebaseConnectedFromSnapshot(doc);
    const editor = document.getElementById('figmaBoardEditor');
    const content = doc.exists ? String(doc.data().content || '') : '';
    localState.figmaBoardContent = content;
    if (editor && document.activeElement !== editor) {
      editor.value = content;
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
  const colorInput = document.getElementById('brandColorInput');
  const colorPicker = document.getElementById('brandColorPicker');
  if (colorInput && colorPicker) {
    const prev = colorInput.value;
    const selected = BRAND_COLOR_PRESETS.some((item) => item.key === prev) ? prev : 'ocean';
    colorInput.value = selected;
    colorPicker.innerHTML = getBrandColorPickerHtml(selected, 'brandColorInput', 'brandColorPicker');
    applyBrandNameColorPreview(selected);
    updateBrandColorToggleButton(selected, 'brandColorToggleBtn', false);
  }
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

    const sorted = getSortedTasksForStatus(status, taskGroups[status]);

    sorted.forEach((task) => zone.appendChild(createTaskCard(task)));
  });
}

function getSortedTasksForStatus(status, sourceTasks) {
  const list = (Array.isArray(sourceTasks) ? sourceTasks : localState.tasks.filter((task) => normalizeStatus(task.status) === status)).slice();
  const withOrder = list.filter((task) => Number.isFinite(Number(task.sortOrder)));
  const withoutOrder = list.filter((task) => !Number.isFinite(Number(task.sortOrder)));
  withOrder.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  withoutOrder.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return withOrder.concat(withoutOrder);
}

function getNextTaskSortOrder(status) {
  const normalized = normalizeStatus(status);
  const maxOrder = localState.tasks
    .filter((task) => normalizeStatus(task.status) === normalized)
    .reduce((max, task) => {
      const n = Number(task.sortOrder);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
  return maxOrder + 1;
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
  const brandStyle = getBrandTextStyleAttr(task);
  return `
    <article class="calendar-task-card">
      <div class="calendar-task-head">
        <span class="calendar-task-status ${getStatusClass(status)}">${escapeHtml(status)}</span>
        <span class="calendar-task-date-mini">${escapeHtml(task.date || '미지정')}</span>
      </div>
      <div class="calendar-task-title">${escapeHtml(task.name || '')}</div>
      <div class="calendar-task-desc">${escapeHtml(compactDesc || '상세 내용 없음')}</div>
      <div class="calendar-task-meta">
        <span class="calendar-task-brand-mini" ${brandStyle}>${escapeHtml(task.brandName || '브랜드 없음')}</span>
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
            <span class="worker-task-brand" ${getBrandTextStyleAttr(task)}>${escapeHtml(task.brandName || '브랜드 없음')}</span>
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
    <div class="task-top-row">
      <div class="task-status ${getStatusClass(task.status)}">${escapeHtml(normalizedStatus)}</div>
      <div class="task-order-controls">
        <button class="task-order-btn" type="button" title="위로" aria-label="위로" onclick="moveTaskWithinStatus('${task.id}', -1)">↑</button>
        <button class="task-order-btn" type="button" title="아래로" aria-label="아래로" onclick="moveTaskWithinStatus('${task.id}', 1)">↓</button>
      </div>
    </div>
    <div class="card-desc">${escapeHtml(task.desc || '')}</div>
    <div class="card-brand" ${getBrandTextStyleAttr(task)}>브랜드: ${escapeHtml(task.brandName || '-')}</div>
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

function moveTaskWithinStatus(taskId, direction) {
  const task = localState.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const status = normalizeStatus(task.status);
  const sorted = getSortedTasksForStatus(status);
  const currentIdx = sorted.findIndex((item) => item.id === taskId);
  const nextIdx = currentIdx + Number(direction || 0);
  if (currentIdx < 0 || nextIdx < 0 || nextIdx >= sorted.length) return;

  const reordered = sorted.slice();
  const [moved] = reordered.splice(currentIdx, 1);
  reordered.splice(nextIdx, 0, moved);

  const batch = db.batch();
  reordered.forEach((item, idx) => {
    batch.update(db.collection(COLLECTIONS.tasks).doc(item.id), {
      sortOrder: idx + 1,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  batch.commit();
}

function getTaskSticker(status) {
  if (status === '업무대기') return { emoji: '🥚', type: 'egg' };
  if (status === '진행중') return { emoji: '🐣', type: 'egg wobble' };
  if (status === '컨펌중') return { emoji: '🐤', type: 'chick' };
  if (status === '수정중') return { emoji: '🐥', type: 'chick wobble' };
  if (status === '작업완료') return { emoji: '🐔', type: 'chick' };
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
    brandColorKey: normalizeBrandColorKey(brand.colorKey),
    status: normalizeStatus(status),
    sortOrder: getNextTaskSortOrder(status),
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
  const nextStatus = normalizeStatus(target.id);
  db.collection(COLLECTIONS.tasks).doc(id).update({
    status: nextStatus,
    sortOrder: getNextTaskSortOrder(nextStatus),
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
  updateBrandEditToggleButton();
  if (!list) return;
  if (!localState.brands.length) {
    list.innerHTML = '<div class="card">등록된 브랜드가 없습니다.</div>';
    return;
  }
  list.innerHTML = localState.brands.map((brand) => `
    <div class="admin-row">
      <div class="brand-edit-left">
        <input id="brand-name-${brand.id}" class="pill-input" value="${escapeAttr(brand.name || '')}" placeholder="브랜드명" ${localState.brandEditMode ? '' : 'readonly'} style="color:${escapeAttr(getBrandTextColorByMode(brand.colorKey || 'ocean'))};caret-color:${escapeAttr(getBrandTextColorByMode(brand.colorKey || 'ocean'))};">
        <details class="backup-detail">
          <summary>${localState.brandEditMode ? '백업위치 보기/수정' : '백업위치 열어보기'}</summary>
          <textarea id="brand-backup-${brand.id}" class="pill-input task-desc-input" placeholder="백업위치 (선택)" maxlength="2000" ${localState.brandEditMode ? '' : 'readonly'}>${escapeHtml(brand.backupLocation || '')}</textarea>
        </details>
      </div>
      <div class="row-actions ${localState.brandEditMode ? '' : 'hidden'}">
        <input id="brand-color-value-${brand.id}" type="hidden" value="${escapeAttr(normalizeBrandColorKey(brand.colorKey || 'ocean'))}">
        <div class="brand-color-pop">
          <button id="brand-color-toggle-${brand.id}" type="button" class="btn btn-outline brand-color-toggle" onclick="toggleBrandColorPicker('brand-color-wrap-${brand.id}')"></button>
          <div id="brand-color-wrap-${brand.id}" class="brand-color-popover hidden">
            <div id="brand-color-${brand.id}" class="brand-color-picker">${getBrandColorPickerHtml(brand.colorKey || 'ocean', `brand-color-value-${brand.id}`, `brand-color-${brand.id}`)}</div>
          </div>
        </div>
        <button class="btn btn-primary small" onclick="renameBrand('${brand.id}')">수정</button>
      </div>
    </div>
  `).join('');

  localState.brands.forEach((brand) => {
    updateBrandColorToggleButton(normalizeBrandColorKey(brand.colorKey || 'ocean'), `brand-color-toggle-${brand.id}`, true);
    applyBrandEditInputColor(brand.id, normalizeBrandColorKey(brand.colorKey || 'ocean'));
  });
  updateBrandEditToggleButton();
}

function addBrand() {
  const input = document.getElementById('brandNameInput');
  const backupInput = document.getElementById('brandBackupInput');
  const colorInput = document.getElementById('brandColorInput');
  const name = input ? input.value.trim() : '';
  const backupLocation = backupInput ? backupInput.value.trim() : '';
  const colorKey = colorInput ? colorInput.value : 'ocean';
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
    backupLocation,
    colorKey: normalizeBrandColorKey(colorKey),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    if (input) input.value = '';
    if (backupInput) backupInput.value = '';
    if (colorInput) colorInput.value = 'ocean';
    setBrandColorSelection('brandColorInput', 'brandColorPicker', 'ocean');
  });
}

function renameBrand(brandId) {
  if (!localState.brandEditMode) return;
  const input = document.getElementById(`brand-name-${brandId}`);
  const backupInput = document.getElementById(`brand-backup-${brandId}`);
  const colorInput = document.getElementById(`brand-color-value-${brandId}`);
  const next = input ? input.value.trim() : '';
  const backupLocation = backupInput ? backupInput.value.trim() : '';
  const colorKey = colorInput ? colorInput.value : 'ocean';
  if (!next) {
    alert('브랜드명을 입력하세요.');
    return;
  }
  db.collection(COLLECTIONS.brands).doc(brandId).update({
    name: next,
    backupLocation,
    colorKey: normalizeBrandColorKey(colorKey),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    const jobs = localState.tasks
      .filter((task) => task.brandId === brandId)
      .map((task) => db.collection(COLLECTIONS.tasks).doc(task.id).update({
        brandName: next,
        brandColorKey: normalizeBrandColorKey(colorKey),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }));
    return Promise.all(jobs);
  });
}

function toggleBrandEditMode(forceMode) {
  const next = typeof forceMode === 'boolean' ? forceMode : !localState.brandEditMode;
  localState.brandEditMode = !!next;
  renderBrandManageList();
}

function updateBrandEditToggleButton() {
  const btn = document.getElementById('brandEditToggleBtn');
  if (!btn) return;
  btn.textContent = localState.brandEditMode ? '수정 닫기' : '수정하기';
}

function openGymMoodModal() {
  localState.gymMoodEditMode = false;
  updateGymMoodEditToggleButton();
  const monthInput = document.getElementById('gymMonthInput');
  if (monthInput) monthInput.value = localState.gymMoodMonth;
  ensureGymMoodMonthRows(localState.gymMoodMonth).then(() => {
    renderGymMoodList();
    openModal('gymMoodModal');
  });
}

function toggleGymMoodEditMode(forceMode) {
  const next = typeof forceMode === 'boolean' ? forceMode : !localState.gymMoodEditMode;
  localState.gymMoodEditMode = !!next;
  updateGymMoodEditToggleButton();
  renderGymMoodList();
}

function updateGymMoodEditToggleButton() {
  const btn = document.getElementById('gymMoodEditToggleBtn');
  if (!btn) return;
  btn.textContent = localState.gymMoodEditMode ? '수정 닫기' : '수정';
}

function openFigmaDesignLink() {
  openFigmaLinkModal(GYM_FIGMA_LINK_URL, '피그마 링크');
}

function openFigmaBoardPage() {
  openFigmaLinkModal('figma.html', '피그마 백업경로');
}

function openFigmaLinkModal(url, title) {
  const frame = document.getElementById('figmaLinkFrame');
  const titleEl = document.getElementById('figmaLinkModalTitle');
  const openBtn = document.getElementById('figmaLinkOpenHere');
  const nextUrl = String(url || '').trim();
  if (!nextUrl) return;
  if (titleEl) titleEl.textContent = title || '피그마 보기';
  if (openBtn) openBtn.href = nextUrl;
  if (frame) frame.src = nextUrl;
  openModal('figmaLinkModal');
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

function editGymBranch(rowId) {
  const row = localState.gymMoodRows.find((item) => item.id === rowId);
  if (!row) return;
  const current = String(row.branch || '').trim();
  const next = prompt('지점명을 수정하세요.', current);
  if (next === null) return;
  const branch = String(next || '').trim();
  if (!branch) {
    alert('지점명을 입력하세요.');
    return;
  }
  const duplicated = localState.gymMoodRows.some((item) => {
    if (item.id === rowId) return false;
    return item.month === row.month && String(item.branch || '').trim() === branch;
  });
  if (duplicated) {
    alert('같은 월에 이미 등록된 지점명입니다.');
    return;
  }
  db.collection(COLLECTIONS.gymMood).doc(rowId).update({
    branch,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function deleteGymBranch(rowId) {
  if (!rowId) return;
  if (!confirm('이 지점을 삭제할까요?')) return;
  db.collection(COLLECTIONS.gymMood).doc(rowId).delete();
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
          ${localState.gymMoodEditMode
            ? `<div class="gym-head-actions">
                <button type="button" class="btn btn-outline small gym-row-edit-btn" onclick="event.stopPropagation(); editGymBranch('${row.id}')">수정</button>
                <button type="button" class="btn btn-outline small gym-row-delete-btn" onclick="event.stopPropagation(); deleteGymBranch('${row.id}')">지점삭제</button>
               </div>`
            : `<span class="worker-load-total">${doneCount}/${GYM_CATEGORIES.length} 완료</span>`}
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

function setRefreshMode(mode) {
  const selectedMode = REFRESH_MODES.includes(mode) ? mode : 'fortune';
  const fortunePanel = document.getElementById('refreshFortunePanel');
  const lottoPanel = document.getElementById('refreshLottoPanel');
  const classicLadderPanel = document.getElementById('refreshClassicLadderPanel');
  const mazePanel = document.getElementById('refreshLadderPanel');
  const fortuneBtn = document.getElementById('refreshModeFortuneBtn');
  const lottoBtn = document.getElementById('refreshModeLottoBtn');
  const ladderBtn = document.getElementById('refreshModeLadderBtn');
  const mazeBtn = document.getElementById('refreshModeMazeBtn');
  const isFortune = selectedMode === 'fortune';
  const isLotto = selectedMode === 'lotto';
  const isLadder = selectedMode === 'ladder';
  const isMaze = selectedMode === 'maze';

  if (fortunePanel) fortunePanel.classList.toggle('hidden', !isFortune);
  if (lottoPanel) lottoPanel.classList.toggle('hidden', !isLotto);
  if (classicLadderPanel) classicLadderPanel.classList.toggle('hidden', !isLadder);
  if (mazePanel) mazePanel.classList.toggle('hidden', !isMaze);
  if (fortuneBtn) fortuneBtn.classList.toggle('active', isFortune);
  if (lottoBtn) lottoBtn.classList.toggle('active', isLotto);
  if (ladderBtn) ladderBtn.classList.toggle('active', isLadder);
  if (mazeBtn) mazeBtn.classList.toggle('active', isMaze);
  if (isLadder) ensureRefreshClassicLadderReady();
  if (isMaze) ensureRefreshLadderReady();
}

function openRefreshMiniGame() {
  window.open('https://duding3.github.io/d_ding/', '_blank', 'noopener,noreferrer');
}

function ensureRefreshClassicLadderReady() {
  if (!refreshClassicLadderInitialized) {
    const input = document.getElementById('classicLadderNameInput');
    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addClassicLadderName();
      });
    }
    refreshClassicLadderInitialized = true;
  }
  renderClassicLadderNameTags();
}

function addClassicLadderName(rawName) {
  const input = document.getElementById('classicLadderNameInput');
  const nextName = String(rawName != null ? rawName : (input ? input.value : ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (!nextName) return;
  if (refreshClassicLadderNames.length >= LADDER_MAX_PLAYERS) {
    alert(`사다리타기는 최대 ${LADDER_MAX_PLAYERS}명까지 가능합니다.`);
    return;
  }
  refreshClassicLadderNames.push(nextName);
  if (input) input.value = '';
  renderClassicLadderNameTags();
}

function removeClassicLadderName(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= refreshClassicLadderNames.length) return;
  refreshClassicLadderNames.splice(idx, 1);
  renderClassicLadderNameTags();
}

function clearClassicLadderNames() {
  refreshClassicLadderNames = [];
  renderClassicLadderNameTags();
}

function renderClassicLadderNameTags() {
  const tags = document.getElementById('classicLadderNameTags');
  const hint = document.getElementById('classicLadderHint');
  const result = document.getElementById('classicLadderResultText');
  const startBtn = document.getElementById('classicLadderStartBtn');
  if (!tags) return;

  if (!refreshClassicLadderNames.length) {
    tags.innerHTML = '<span class="ladder-empty-chip">아직 참가자가 없습니다.</span>';
  } else {
    tags.innerHTML = refreshClassicLadderNames
      .map((name, idx) => `<span class="ladder-chip">${escapeHtml(name)} <button type="button" onclick="removeClassicLadderName(${idx})" aria-label="${escapeHtml(name)} 삭제">×</button></span>`)
      .join('');
  }
  if (hint) hint.textContent = `${refreshClassicLadderNames.length}명 참가중 · ${LADDER_MIN_PLAYERS}명 이상이면 시작할 수 있어요.`;
  if (startBtn) startBtn.disabled = refreshClassicLadderNames.length < LADDER_MIN_PLAYERS;
  if (result && refreshClassicLadderNames.length < LADDER_MIN_PLAYERS) {
    result.textContent = '참가자를 추가하고 시작해보세요.';
    result.classList.remove('show');
  }
  renderClassicLadderBoard(null);
}

async function startClassicLadderDraw() {
  if (refreshClassicLadderNames.length < LADDER_MIN_PLAYERS) {
    alert(`최소 ${LADDER_MIN_PLAYERS}명 이상 추가해주세요.`);
    return;
  }
  const startBtn = document.getElementById('classicLadderStartBtn');
  if (startBtn && startBtn.disabled) return;
  if (startBtn) startBtn.disabled = true;

  const drawToken = ++refreshClassicLadderDrawToken;
  const model = generateClassicLadderModel(refreshClassicLadderNames);
  renderClassicLadderBoard(model, { showOutcome: false });
  setClassicLadderResultText('사다리를 준비중...');

  const selectedStart = await runClassicLadderSuspense(model, drawToken);
  if (drawToken !== refreshClassicLadderDrawToken || selectedStart < 0) return;
  const traced = traceClassicLadder(model, selectedStart);

  renderClassicLadderBoard(model, {
    showOutcome: false,
    highlightStart: selectedStart,
    pathD: toSvgPathD(traced.points)
  });
  setClassicLadderResultText('사다리를 타고 내려가는 중...');
  await animateClassicLadderTrace(drawToken);
  if (drawToken !== refreshClassicLadderDrawToken) return;

  renderClassicLadderBoard(model, {
    showOutcome: true,
    highlightStart: selectedStart,
    highlightEnd: traced.endCol,
    pathD: toSvgPathD(traced.points),
    keepTraceShown: true
  });
  setClassicLadderResultText(`축하합니다! ${refreshClassicLadderNames[selectedStart]} 당첨!`);
  playWinnerFanfare();
  launchLadderCelebration('classicLadderConfettiLayer');
  if (startBtn) startBtn.disabled = false;
}

function runClassicLadderSuspense(model, drawToken) {
  return new Promise((resolve) => {
    const startAt = Date.now();
    let lastIdx = -1;
    const tick = () => {
      if (drawToken !== refreshClassicLadderDrawToken) {
        resolve(-1);
        return;
      }
      let idx = Math.floor(Math.random() * model.playerCount);
      if (model.playerCount > 1 && idx === lastIdx) idx = (idx + 1) % model.playerCount;
      lastIdx = idx;
      renderClassicLadderBoard(model, { showOutcome: false, highlightStart: idx });
      setClassicLadderResultText('누가 당첨될지 확인중...');
      if (Date.now() - startAt < LADDER_SUSPENSE_DURATION_MS) {
        setTimeout(tick, 120);
      } else {
        resolve(idx);
      }
    };
    tick();
  });
}

function generateClassicLadderModel(names) {
  const playerNames = Array.isArray(names) ? names.slice() : [];
  const playerCount = playerNames.length;
  const rows = 16 + Math.floor(Math.random() * 9) + Math.max(0, Math.floor((playerCount - 2) * 1.1));
  const rungs = [];
  for (let row = 1; row < rows; row += 1) {
    let col = 0;
    while (col < playerCount - 1) {
      const chance = row % 2 === 0 ? 0.5 : 0.35;
      if (Math.random() < chance) {
        rungs.push({ row, col });
        col += 2;
      } else {
        col += 1;
      }
    }
  }
  const mapping = playerNames.map((_, idx) => traceClassicLadder({ playerCount, rows, rungs }, idx).endCol);
  const winnerStart = Math.floor(Math.random() * playerCount);
  const winningBottom = mapping[winnerStart];
  const bottomLabels = Array.from({ length: playerCount }, (_, idx) => (idx === winningBottom ? '당첨' : '꽝'));
  return { playerNames, playerCount, rows, rungs, bottomLabels, winningBottom };
}

function traceClassicLadder(model, startCol) {
  const points = [];
  const layout = buildClassicLadderLayout(model.playerCount, model.rows);
  const rungSet = new Set((model.rungs || []).map((rung) => `${rung.row}:${rung.col}`));
  let col = Number(startCol);
  points.push({ x: layout.columns[col], y: layout.top });
  for (let row = 1; row < model.rows; row += 1) {
    const y = layout.top + (layout.rowGap * row);
    points.push({ x: layout.columns[col], y });
    if (rungSet.has(`${row}:${col}`)) {
      col += 1;
      points.push({ x: layout.columns[col], y });
    } else if (rungSet.has(`${row}:${col - 1}`)) {
      col -= 1;
      points.push({ x: layout.columns[col], y });
    }
  }
  points.push({ x: layout.columns[col], y: layout.bottom });
  return { points, endCol: col };
}

function buildClassicLadderLayout(playerCount, rowCount) {
  const width = 800;
  const top = 92;
  const bottom = 442;
  const left = 68;
  const right = 732;
  const colGap = (right - left) / Math.max(1, playerCount - 1);
  const columns = Array.from({ length: playerCount }, (_, idx) => left + (colGap * idx));
  const rowGap = (bottom - top) / Math.max(1, rowCount - 1);
  return { width, top, bottom, columns, rowGap };
}

function renderClassicLadderBoard(model, options = {}) {
  const svg = document.getElementById('classicLadderSvg');
  if (!svg) return;
  if (!model || !model.playerCount) {
    svg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="ladder-empty-text">참가자를 추가한 뒤 시작하면 사다리가 생성됩니다.</text>';
    return;
  }
  const { playerNames, playerCount, rows, rungs, bottomLabels } = model;
  const { showOutcome = false, highlightStart = -1, highlightEnd = -1, pathD = '', keepTraceShown = false } = options;
  const layout = buildClassicLadderLayout(playerCount, rows);
  const rails = layout.columns.map((x) => `<line class="ladder-rail" x1="${x}" y1="${layout.top}" x2="${x}" y2="${layout.bottom}" />`).join('');
  const rungLines = rungs.map((rung) => {
    const y = layout.top + (layout.rowGap * rung.row);
    const x1 = layout.columns[rung.col];
    const x2 = layout.columns[rung.col + 1];
    return `<line class="ladder-rung" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />`;
  }).join('');
  const topNodes = playerNames.map((name, idx) => `
    <g class="ladder-node ${idx === highlightStart ? 'active' : ''}" transform="translate(${layout.columns[idx]},42)">
      <circle r="21"></circle>
      <text y="4" text-anchor="middle">${escapeSvgText(name)}</text>
    </g>
  `).join('');
  const bottoms = bottomLabels.map((label, idx) => `
    <g class="ladder-bottom ${(showOutcome && idx === model.winningBottom) ? 'win' : ''} ${(showOutcome && idx === highlightEnd) ? 'hit' : ''}" transform="translate(${layout.columns[idx]},478)">
      <rect x="-40" y="-17" width="80" height="34" rx="12" ry="12"></rect>
      <text y="5" text-anchor="middle">${escapeSvgText(showOutcome ? label : '???')}</text>
    </g>
  `).join('');
  const trace = pathD ? `<path id="classicLadderTracePath" class="ladder-trace ${keepTraceShown ? 'done' : ''}" d="${pathD}"></path>` : '';
  svg.innerHTML = `<rect class="ladder-bg" x="0" y="0" width="${layout.width}" height="520" rx="16" ry="16"></rect>${rails}${rungLines}${trace}${topNodes}${bottoms}`;
}

function animateClassicLadderTrace(drawToken) {
  return new Promise((resolve) => {
    const path = document.getElementById('classicLadderTracePath');
    if (!path) {
      resolve();
      return;
    }
    const totalLength = path.getTotalLength();
    path.style.strokeDasharray = `${totalLength}`;
    path.style.strokeDashoffset = `${totalLength}`;
    void path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${LADDER_TRACE_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    path.style.strokeDashoffset = '0';
    setTimeout(() => {
      if (drawToken !== refreshClassicLadderDrawToken) {
        resolve();
        return;
      }
      path.classList.add('done');
      resolve();
    }, LADDER_TRACE_DURATION_MS + 70);
  });
}

function setClassicLadderResultText(text) {
  const result = document.getElementById('classicLadderResultText');
  if (!result) return;
  result.textContent = text;
  result.classList.remove('show');
  void result.offsetWidth;
  result.classList.add('show');
}

function ensureRefreshLadderReady() {
  if (!refreshLadderInitialized) {
    const input = document.getElementById('ladderNameInput');
    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addLadderName();
      });
    }
    refreshLadderInitialized = true;
  }
  renderLadderNameTags();
  setLadderFogVisible(false, true);
  hideLadderWinnerOverlay();
}

function addLadderName(rawName) {
  const input = document.getElementById('ladderNameInput');
  const nextName = String(rawName != null ? rawName : (input ? input.value : ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (!nextName) return;
  if (refreshLadderNames.length >= LADDER_MAX_PLAYERS) {
    alert(`미로내기는 최대 ${LADDER_MAX_PLAYERS}명까지 가능합니다.`);
    return;
  }
  refreshLadderNames.push(nextName);
  if (input) input.value = '';
  renderLadderNameTags();
}

function removeLadderName(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= refreshLadderNames.length) return;
  refreshLadderNames.splice(idx, 1);
  renderLadderNameTags();
}

function clearLadderNames() {
  refreshLadderNames = [];
  renderLadderNameTags();
}

function renderLadderNameTags() {
  const tags = document.getElementById('ladderNameTags');
  const hint = document.getElementById('ladderHint');
  const result = document.getElementById('ladderResultText');
  const startBtn = document.getElementById('ladderStartBtn');
  if (!tags) return;

  if (!refreshLadderNames.length) {
    tags.innerHTML = '<span class="ladder-empty-chip">아직 참가자가 없습니다.</span>';
  } else {
    tags.innerHTML = refreshLadderNames
      .map((name, idx) => `<span class="ladder-chip">${escapeHtml(name)} <button type="button" onclick="removeLadderName(${idx})" aria-label="${escapeHtml(name)} 삭제">×</button></span>`)
      .join('');
  }
  if (hint) hint.textContent = `${refreshLadderNames.length}명 참가중 · ${LADDER_MIN_PLAYERS}명 이상이면 시작할 수 있어요.`;
  if (startBtn) startBtn.disabled = refreshLadderNames.length < LADDER_MIN_PLAYERS;
  if (result && refreshLadderNames.length < LADDER_MIN_PLAYERS) {
    result.textContent = '참가자를 추가하고 시작해보세요.';
    result.classList.remove('show');
  }
  renderLadderBoard(null);
}

async function startLadderDraw() {
  if (refreshLadderNames.length < LADDER_MIN_PLAYERS) {
    alert(`최소 ${LADDER_MIN_PLAYERS}명 이상 추가해주세요.`);
    return;
  }
  const startBtn = document.getElementById('ladderStartBtn');
  if (startBtn && startBtn.disabled) return;
  if (startBtn) startBtn.disabled = true;

  const drawToken = ++refreshLadderDrawToken;
  const model = generateLadderModel(refreshLadderNames);
  renderLadderBoard(model, { showOutcome: false });
  hideLadderWinnerOverlay();
  setLadderFogVisible(true);
  setLadderResultText('미로를 생성중...');

  const selectedStart = await runLadderSuspense(model, drawToken);
  if (drawToken !== refreshLadderDrawToken || selectedStart < 0) return;

  const traced = traceLadder(model, selectedStart);
  renderLadderBoard(model, {
    showOutcome: false,
    highlightStart: selectedStart,
    pathD: toSvgPathD(traced.points),
    runnerPoint: traced.points[0]
  });
  setLadderResultText('캐릭터가 미로를 탈출하는 중...');
  await animateLadderTrace(drawToken);
  if (drawToken !== refreshLadderDrawToken) return;

  renderLadderBoard(model, {
    showOutcome: true,
    highlightStart: selectedStart,
    highlightEnd: traced.endSlot,
    pathD: toSvgPathD(traced.points),
    keepTraceShown: true,
    runnerPoint: traced.points[traced.points.length - 1]
  });
  setLadderFogVisible(false);
  setLadderResultText(`축하합니다! ${refreshLadderNames[selectedStart]} 당첨!`);
  playWinnerFanfare();
  launchLadderCelebration();
  showLadderWinnerOverlay(refreshLadderNames[selectedStart]);
  if (startBtn) startBtn.disabled = false;
}

function runLadderSuspense(model, drawToken) {
  return new Promise((resolve) => {
    const startAt = Date.now();
    let lastIdx = -1;
    const tick = () => {
      if (drawToken !== refreshLadderDrawToken) {
        resolve(-1);
        return;
      }
      let idx = Math.floor(Math.random() * model.playerCount);
      if (model.playerCount > 1 && idx === lastIdx) idx = (idx + 1) % model.playerCount;
      lastIdx = idx;
      renderLadderBoard(model, { showOutcome: false, highlightStart: idx });
      setLadderResultText('누가 당첨될지 확인중...');
      if (Date.now() - startAt < LADDER_SUSPENSE_DURATION_MS) {
        setTimeout(tick, 120);
      } else {
        resolve(idx);
      }
    };
    tick();
  });
}

function generateLadderModel(names) {
  const playerNames = Array.isArray(names) ? names.slice() : [];
  const playerCount = playerNames.length;
  const gridCols = Math.min(MAZE_MAX_COLS, Math.max(MAZE_MIN_COLS, (playerCount * 2) + 10));
  const gridRows = Math.max(MAZE_MIN_ROWS, Math.min(MAZE_MAX_ROWS, 12 + playerCount + Math.floor(Math.random() * 3)));
  const layout = buildLadderLayout(playerCount, gridRows, gridCols);
  const starts = layout.startCols.slice();
  const shuffledExitSlots = shuffleArray(Array.from({ length: playerCount }, (_, idx) => idx));

  const playerPaths = [];
  const playerEnds = [];
  for (let idx = 0; idx < playerCount; idx += 1) {
    const targetSlot = shuffledExitSlots[idx];
    const targetCol = starts[targetSlot];
    playerPaths.push(buildMazePath(starts[idx], targetCol, gridRows, gridCols));
    playerEnds.push(targetSlot);
  }

  const winnerStart = Math.floor(Math.random() * playerCount);
  const winningBottom = playerEnds[winnerStart];
  const bottomLabels = Array.from({ length: playerCount }, (_, idx) => (idx === winningBottom ? '당첨' : '꽝'));
  const walls = buildMazeWalls(gridCols, gridRows, playerPaths);
  return { playerNames, playerCount, gridCols, gridRows, starts, playerPaths, playerEnds, walls, bottomLabels, winningBottom };
}

function traceLadder(model, startIndex) {
  const idx = Number(startIndex);
  const path = Array.isArray(model.playerPaths[idx]) ? model.playerPaths[idx] : [];
  const points = path.map((cell) => mazeCellToPoint(model, cell));
  const endSlot = Number.isInteger(model.playerEnds[idx]) ? model.playerEnds[idx] : 0;
  return { points, endSlot };
}

function buildLadderLayout(playerCount, rowCount, gridCols) {
  const width = 800;
  const top = 96;
  const bottom = 442;
  const left = 56;
  const right = 744;
  const mazeColCount = Math.max(2, Number(gridCols || MAZE_MIN_COLS));
  const mazeRowCount = Math.max(2, Number(rowCount || MAZE_MIN_ROWS));
  const mazeColGap = (right - left) / Math.max(1, mazeColCount - 1);
  const mazeRowGap = (bottom - top) / Math.max(1, mazeRowCount - 1);
  const mazeCols = Array.from({ length: mazeColCount }, (_, idx) => left + (mazeColGap * idx));
  const rowGap = (bottom - top) / Math.max(1, rowCount - 1);
  const available = Math.max(1, playerCount - 1);
  const startCols = Array.from({ length: playerCount }, (_, idx) => Math.round((idx / available) * (mazeColCount - 1)));
  const topXs = startCols.map((colIdx) => mazeCols[colIdx]);
  return { width, top, bottom, left, right, mazeCols, mazeRowGap, rowGap, startCols, topXs };
}

function buildMazePath(startCol, targetCol, rowCount, gridCols) {
  const cells = [{ x: startCol, y: 0 }];
  let x = startCol;
  let y = 0;
  const maxCol = Math.max(1, gridCols - 2);

  while (y < rowCount - 1) {
    const rowsLeft = (rowCount - 1) - y;
    const needAlign = Math.abs(targetCol - x) > Math.max(1, Math.floor(rowsLeft / 3));
    if (needAlign || Math.random() < 0.48) {
      let dir = targetCol === x ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(targetCol - x);
      if (!needAlign && Math.random() < 0.24) dir *= -1;
      const stride = 1 + Math.floor(Math.random() * 2);
      const nextX = Math.max(1, Math.min(maxCol, x + (dir * stride)));
      if (nextX !== x) {
        x = nextX;
        cells.push({ x, y });
      }
    }
    let down = 1 + (Math.random() < 0.28 ? 1 : 0);
    if (rowsLeft <= 3) down = 1;
    y = Math.min(rowCount - 1, y + down);
    cells.push({ x, y });
  }

  if (x !== targetCol) {
    x = targetCol;
    cells.push({ x, y });
  }
  return compactMazePath(cells);
}

function compactMazePath(cells) {
  const compacted = [];
  cells.forEach((cell) => {
    const prev = compacted[compacted.length - 1];
    if (!prev || prev.x !== cell.x || prev.y !== cell.y) compacted.push(cell);
  });
  return compacted;
}

function shuffleArray(arr) {
  const copy = Array.isArray(arr) ? arr.slice() : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function buildMazeWalls(gridCols, gridRows, playerPaths) {
  const walls = [];
  const pathCells = new Set();
  (playerPaths || []).forEach((path) => {
    (path || []).forEach((cell) => pathCells.add(`${cell.x}:${cell.y}`));
  });

  for (let y = 1; y < gridRows - 1; y += 1) {
    for (let x = 1; x < gridCols - 2; x += 1) {
      if (pathCells.has(`${x}:${y}`)) continue;
      if (Math.random() < 0.18) walls.push({ t: 'h', x1: x, y1: y, x2: x + 1, y2: y });
      if (Math.random() < 0.13) walls.push({ t: 'v', x1: x, y1: y, x2: x, y2: y + 1 });
    }
  }
  return walls;
}

function mazeCellToPoint(model, cell) {
  const layout = buildLadderLayout(model.playerCount, model.gridRows, model.gridCols);
  const colIdx = Math.max(0, Math.min(layout.mazeCols.length - 1, Number(cell.x)));
  const rowIdx = Math.max(0, Math.min(model.gridRows - 1, Number(cell.y)));
  return {
    x: layout.mazeCols[colIdx],
    y: layout.top + (layout.mazeRowGap * rowIdx)
  };
}

function renderLadderBoard(model, options = {}) {
  const svg = document.getElementById('ladderSvg');
  if (!svg) return;
  if (!model || !model.playerCount) {
    svg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="ladder-empty-text">참가자를 추가한 뒤 시작하면 미로가 생성됩니다.</text>';
    return;
  }

  const { playerNames, playerCount, bottomLabels } = model;
  const { showOutcome = false, highlightStart = -1, highlightEnd = -1, pathD = '', keepTraceShown = false, runnerPoint = null } = options;
  const layout = buildLadderLayout(playerCount, model.gridRows, model.gridCols);

  const mazeWalls = (model.walls || [])
    .map((wall) => {
      const p1 = mazeCellToPoint(model, { x: wall.x1, y: wall.y1 });
      const p2 = mazeCellToPoint(model, { x: wall.x2, y: wall.y2 });
      return `<line class="maze-wall" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" />`;
    }).join('');
  const guideRails = layout.topXs
    .map((x) => `<line class="maze-guide-rail" x1="${x}" y1="${layout.top - 12}" x2="${x}" y2="${layout.bottom + 12}" />`)
    .join('');
  const topNodes = playerNames
    .map((name, idx) => {
      const x = layout.topXs[idx];
      const isActive = idx === highlightStart;
      return `
        <g class="ladder-node ${isActive ? 'active' : ''}" transform="translate(${x},42)">
          <circle r="21"></circle>
          <text y="4" text-anchor="middle">${escapeSvgText(name)}</text>
        </g>
      `;
    })
    .join('');
  const bottoms = bottomLabels
    .map((label, idx) => {
      const x = layout.topXs[idx];
      const txt = showOutcome ? label : '???';
      const isWin = showOutcome && idx === model.winningBottom;
      const isHit = showOutcome && idx === highlightEnd;
      return `
        <g class="ladder-bottom ${isWin ? 'win' : ''} ${isHit ? 'hit' : ''}" transform="translate(${x},478)">
          <rect x="-40" y="-17" width="80" height="34" rx="12" ry="12"></rect>
          <text y="5" text-anchor="middle">${escapeSvgText(txt)}</text>
        </g>
      `;
    })
    .join('');
  const trace = pathD
    ? `<path id="ladderTracePath" class="ladder-trace ${keepTraceShown ? 'done' : ''}" d="${pathD}"></path>`
    : '';
  const runner = runnerPoint
    ? `<g id="mazeRunner" class="maze-runner" transform="translate(${runnerPoint.x} ${runnerPoint.y})"><circle r="12"></circle><text y="5" text-anchor="middle">🐭</text></g>`
    : '';

  svg.innerHTML = `
    <rect class="ladder-bg" x="0" y="0" width="${layout.width}" height="520" rx="16" ry="16"></rect>
    ${guideRails}
    ${mazeWalls}
    ${trace}
    ${runner}
    ${topNodes}
    ${bottoms}
  `;
}

function toSvgPathD(points) {
  if (!Array.isArray(points) || !points.length) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
}

function animateLadderTrace(drawToken) {
  return new Promise((resolve) => {
    const path = document.getElementById('ladderTracePath');
    const runner = document.getElementById('mazeRunner');
    if (!path) {
      resolve();
      return;
    }
    const totalLength = path.getTotalLength();
    path.style.strokeDasharray = `${totalLength}`;
    path.style.strokeDashoffset = `${totalLength}`;
    const startTs = performance.now();

    const tick = (now) => {
      if (drawToken !== refreshLadderDrawToken) {
        resolve();
        return;
      }
      const progress = Math.max(0, Math.min(1, (now - startTs) / LADDER_TRACE_DURATION_MS));
      const progressed = totalLength * progress;
      path.style.strokeDashoffset = `${Math.max(0, totalLength - progressed)}`;
      if (runner) {
        const point = path.getPointAtLength(progressed);
        runner.setAttribute('transform', `translate(${point.x} ${point.y})`);
      }
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        path.classList.add('done');
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

function setLadderResultText(text) {
  const result = document.getElementById('ladderResultText');
  if (!result) return;
  result.textContent = text;
  result.classList.remove('show');
  void result.offsetWidth;
  result.classList.add('show');
}

function setLadderFogVisible(visible, instant = false) {
  const fog = document.getElementById('ladderFogLayer');
  if (!fog) return;
  if (visible) {
    fog.classList.remove('hidden', 'reveal');
    return;
  }
  if (instant) {
    fog.classList.add('hidden');
    fog.classList.remove('reveal');
    return;
  }
  fog.classList.remove('hidden');
  fog.classList.add('reveal');
  setTimeout(() => {
    fog.classList.add('hidden');
    fog.classList.remove('reveal');
  }, 640);
}

function showLadderWinnerOverlay(name) {
  const overlay = document.getElementById('ladderWinnerOverlay');
  const nameEl = document.getElementById('ladderWinnerName');
  if (!overlay || !nameEl) return;
  if (refreshLadderWinnerTimer) clearTimeout(refreshLadderWinnerTimer);
  nameEl.textContent = String(name || '');
  overlay.classList.remove('hidden', 'show');
  void overlay.offsetWidth;
  overlay.classList.add('show');
  refreshLadderWinnerTimer = setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('show');
    refreshLadderWinnerTimer = null;
  }, LADDER_WINNER_OVERLAY_MS);
}

function hideLadderWinnerOverlay() {
  const overlay = document.getElementById('ladderWinnerOverlay');
  if (!overlay) return;
  if (refreshLadderWinnerTimer) {
    clearTimeout(refreshLadderWinnerTimer);
    refreshLadderWinnerTimer = null;
  }
  overlay.classList.add('hidden');
  overlay.classList.remove('show');
}

function launchLadderCelebration(layerId = 'ladderConfettiLayer') {
  const layer = document.getElementById(layerId);
  if (!layer) return;
  layer.innerHTML = '';
  const pieces = ['🎉', '🎊', '✨', '⭐', '💫'];
  for (let i = 0; i < 36; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'ladder-confetti';
    piece.textContent = pieces[Math.floor(Math.random() * pieces.length)];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${(Math.random() * 0.35).toFixed(2)}s`;
    piece.style.setProperty('--drift', `${Math.round(Math.random() * 120 - 60)}px`);
    layer.appendChild(piece);
  }
  setTimeout(() => {
    if (layer) layer.innerHTML = '';
  }, 2100);
}

function playWinnerFanfare() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const start = ctx.currentTime + 0.02;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = idx % 2 ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(freq, start + idx * 0.14);
    gain.gain.setValueAtTime(0.0001, start + idx * 0.14);
    gain.gain.exponentialRampToValueAtTime(0.18, start + idx * 0.14 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + idx * 0.14 + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + idx * 0.14);
    osc.stop(start + idx * 0.14 + 0.22);
  });
  setTimeout(() => {
    if (ctx && typeof ctx.close === 'function') ctx.close();
  }, 1300);
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function drawRefreshLotto() {
  const drawBtn = document.getElementById('lottoDrawBtn');
  if (drawBtn && drawBtn.disabled) return;
  if (drawBtn) drawBtn.disabled = true;
  const drawToken = ++refreshLottoDrawToken;

  startLottoRollingAnimation();
  const resultEl = document.getElementById('lottoResultText');
  const linesEl = document.getElementById('lottoLines');

  if (resultEl) {
    resultEl.textContent = '공이 굴러가는 중...';
    resultEl.classList.remove('show');
    void resultEl.offsetWidth;
    resultEl.classList.add('show');
  }

  setTimeout(() => {
    if (drawToken !== refreshLottoDrawToken) return;
    const lines = Array.from({ length: LOTTO_LINE_COUNT }, () => pickLottoLineNumbers());
    if (linesEl) {
      linesEl.innerHTML = lines.map((line, idx) => createLottoLineHtml(line, idx)).join('');
    }
    stopLottoRollingAnimation();
    if (resultEl) {
      resultEl.textContent = '추천 5줄 생성 완료';
      resultEl.classList.remove('show');
      void resultEl.offsetWidth;
      resultEl.classList.add('show');
    }
    if (drawBtn) drawBtn.disabled = false;
  }, LOTTO_DRAW_DELAY_MS);
}

function pickRandomFortuneType() {
  const keys = Object.keys(FORTUNE_BY_TYPE);
  return keys[Math.floor(Math.random() * keys.length)];
}

function createLottoBallHtml(number, idx) {
  const n = Number(number);
  const toneClass = getLottoToneClass(n);
  const delay = (Number(idx || 0) * 0.06).toFixed(2);
  return `<span class="lotto-ball ${toneClass}" style="--lotto-delay:${delay}s">${n}</span>`;
}

function getLottoToneClass(number) {
  const n = Number(number);
  if (n <= 10) return 'tone-1';
  if (n <= 20) return 'tone-2';
  if (n <= 30) return 'tone-3';
  if (n <= 40) return 'tone-4';
  return 'tone-5';
}

function pickLottoLineNumbers() {
  const pool = Array.from({ length: LOTTO_MAX_NUMBER }, (_, idx) => idx + 1);
  const picked = [];
  while (picked.length < LOTTO_PICK_COUNT && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  picked.sort((a, b) => a - b);
  const bonus = pool[Math.floor(Math.random() * pool.length)];
  return { numbers: picked, bonus };
}

function createLottoLineHtml(line, lineIdx) {
  const lineLabel = String.fromCharCode(65 + Number(lineIdx || 0));
  const numbers = Array.isArray(line && line.numbers) ? line.numbers : [];
  const bonus = Number(line && line.bonus);
  const balls = numbers
    .map((num, idx) => createLottoBallHtml(num, (lineIdx * LOTTO_PICK_COUNT) + idx))
    .join('');
  const bonusBall = Number.isFinite(bonus)
    ? createLottoBallHtml(bonus, (lineIdx * LOTTO_PICK_COUNT) + LOTTO_PICK_COUNT)
    : '<span class="lotto-ball empty">?</span>';
  return `<div class="lotto-line"><span class="lotto-line-label">${lineLabel}</span><div class="lotto-line-balls"><div class="lotto-main-balls">${balls}</div><span class="lotto-plus-mini">+</span><div class="lotto-bonus-ball">${bonusBall}</div></div></div>`;
}

function createEmptyLottoLineHtml(lineIdx) {
  const lineLabel = String.fromCharCode(65 + Number(lineIdx || 0));
  return `<div class="lotto-line"><span class="lotto-line-label">${lineLabel}</span><div class="lotto-line-balls"><div class="lotto-main-balls"><span class="lotto-ball empty">?</span><span class="lotto-ball empty">?</span><span class="lotto-ball empty">?</span><span class="lotto-ball empty">?</span><span class="lotto-ball empty">?</span><span class="lotto-ball empty">?</span></div><span class="lotto-plus-mini">+</span><div class="lotto-bonus-ball"><span class="lotto-ball empty">?</span></div></div></div>`;
}

function startLottoRollingAnimation() {
  const stage = document.getElementById('lottoRollingStage');
  if (!stage) return;
  const rollingBalls = Array.from({ length: 12 }, (_, idx) => {
    const number = 1 + Math.floor(Math.random() * LOTTO_MAX_NUMBER);
    const dx = Math.round(Math.random() * 120) + 24;
    const dy = Math.round(Math.random() * 30) + 10;
    const delay = (idx * 0.05).toFixed(2);
    return `<span class="rolling-ball ${getLottoToneClass(number)}" style="--rbx:${dx}px;--rby:${dy}px;--rdelay:${delay}s">${number}</span>`;
  }).join('');
  stage.classList.add('running');
  stage.innerHTML = rollingBalls;
}

function stopLottoRollingAnimation() {
  const stage = document.getElementById('lottoRollingStage');
  if (!stage) return;
  stage.classList.remove('running');
  stage.innerHTML = '<div class="lotto-rolling-hint">추첨 완료</div>';
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
    ? ['🧠', '📌', '💡']
    : (type === '행운' ? ['🍀', '✨', '🎁'] : ['🌿', '☕', '🛌']);

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
  refreshLottoDrawToken += 1;
  refreshClassicLadderDrawToken += 1;
  refreshLadderDrawToken += 1;
  const cookie = document.getElementById('fortuneCookie');
  const result = document.getElementById('fortuneResult');
  const wrap = document.querySelector('#refreshModal .fortune-wrap');
  const layer = document.getElementById('fortuneConfettiLayer');
  const lottoLines = document.getElementById('lottoLines');
  const lottoDrawBtn = document.getElementById('lottoDrawBtn');
  const rollingStage = document.getElementById('lottoRollingStage');
  const lottoResult = document.getElementById('lottoResultText');
  const classicLadderStartBtn = document.getElementById('classicLadderStartBtn');
  const classicLadderResult = document.getElementById('classicLadderResultText');
  const classicLadderConfetti = document.getElementById('classicLadderConfettiLayer');
  const classicLadderInput = document.getElementById('classicLadderNameInput');
  const ladderStartBtn = document.getElementById('ladderStartBtn');
  const ladderResult = document.getElementById('ladderResultText');
  const ladderConfetti = document.getElementById('ladderConfettiLayer');
  const ladderInput = document.getElementById('ladderNameInput');
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
  if (rollingStage) {
    rollingStage.classList.remove('running');
    rollingStage.innerHTML = '<div class="lotto-rolling-hint">추첨기 가동 준비</div>';
  }
  if (lottoLines) {
    lottoLines.innerHTML = Array.from({ length: LOTTO_LINE_COUNT }, (_, idx) => createEmptyLottoLineHtml(idx)).join('');
  }
  if (lottoResult) {
    lottoResult.textContent = '번호 5줄 뽑기를 눌러주세요.';
    lottoResult.classList.remove('show');
  }
  if (lottoDrawBtn) lottoDrawBtn.disabled = false;
  refreshClassicLadderNames = [];
  if (classicLadderInput) classicLadderInput.value = '';
  if (classicLadderStartBtn) classicLadderStartBtn.disabled = true;
  if (classicLadderResult) {
    classicLadderResult.textContent = '참가자를 추가하고 시작해보세요.';
    classicLadderResult.classList.remove('show');
  }
  if (classicLadderConfetti) classicLadderConfetti.innerHTML = '';
  renderClassicLadderBoard(null);
  renderClassicLadderNameTags();

  refreshLadderNames = [];
  if (ladderInput) ladderInput.value = '';
  if (ladderStartBtn) ladderStartBtn.disabled = true;
  if (ladderResult) {
    ladderResult.textContent = '참가자를 추가하고 시작해보세요.';
    ladderResult.classList.remove('show');
  }
  if (ladderConfetti) ladderConfetti.innerHTML = '';
  setLadderFogVisible(false, true);
  hideLadderWinnerOverlay();
  renderLadderBoard(null);
  renderLadderNameTags();
  setRefreshMode('fortune');
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
  const currentTask = localState.tasks.find((task) => task.id === taskId);
  const prevStatus = normalizeStatus(currentTask ? currentTask.status : '');
  const nextStatus = normalizeStatus(status);
  const nextSortOrder = prevStatus !== nextStatus
    ? getNextTaskSortOrder(nextStatus)
    : (Number.isFinite(Number(currentTask && currentTask.sortOrder)) ? Number(currentTask.sortOrder) : getNextTaskSortOrder(nextStatus));

  db.collection(COLLECTIONS.tasks).doc(taskId).update({
    name,
    userIds: userId ? [userId] : [],
    userNames: user ? [user.name] : [],
    userId,
    userName: user.name,
    status: nextStatus,
    sortOrder: nextSortOrder,
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
  const currentTask = localState.tasks.find((task) => task.id === localState.editingTaskId);
  const prevStatus = normalizeStatus(currentTask ? currentTask.status : '');
  const nextStatus = normalizeStatus(status);
  const nextSortOrder = prevStatus !== nextStatus
    ? getNextTaskSortOrder(nextStatus)
    : (Number.isFinite(Number(currentTask && currentTask.sortOrder)) ? Number(currentTask.sortOrder) : getNextTaskSortOrder(nextStatus));

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
    brandColorKey: normalizeBrandColorKey(brand.colorKey),
    status: nextStatus,
    sortOrder: nextSortOrder,
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
  persistThemeMode();
  window.location.reload();
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
  if (id === 'refreshModal') {
    ensureRefreshLadderReady();
    setRefreshMode('fortune');
  }
  if (id === 'brandListModal') {
    toggleBrandEditMode(false);
  }
  if (id === 'figmaBoardModal') {
    const editor = document.getElementById('figmaBoardEditor');
    if (editor) {
      editor.value = localState.figmaBoardContent || '';
      setTimeout(() => editor.focus(), 0);
    }
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
  if (id === 'taskEditModal') localState.editingTaskId = null;
  if (id === 'refreshModal') resetRefreshModal();
  if (id === 'brandListModal') {
    localState.brandEditMode = false;
    updateBrandEditToggleButton();
    document.querySelectorAll('.brand-color-popover').forEach((wrap) => wrap.classList.add('hidden'));
  }
  if (id === 'gymMoodModal') {
    localState.gymMoodEditMode = false;
    updateGymMoodEditToggleButton();
  }
  if (id === 'figmaLinkModal') {
    const frame = document.getElementById('figmaLinkFrame');
    if (frame) frame.src = 'about:blank';
  }
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
  const getCurrentFirebaseUid = () => (auth.currentUser && auth.currentUser.uid ? auth.currentUser.uid : '');
  const ensureAnonymousSession = () => {
    if (getCurrentFirebaseUid()) return Promise.resolve(getCurrentFirebaseUid());
    return auth.signInAnonymously().then((cred) => (cred && cred.user && cred.user.uid ? cred.user.uid : ''));
  };
  const onSaved = (userId, avatarValue) => {
    if (localState.themeMode === 'dark' && userId) {
      localState.currentUser = {
        id: userId,
        name,
        pw,
        avatar: avatarValue || fallbackAvatar
      };
      localState.pendingUserId = null;
      localState.isAdmin = isAdminName(name);
      persistAuthState();
    }
    document.getElementById('regName').value = '';
    document.getElementById('regPw').value = '';
    if (avatarInput) avatarInput.value = '';
    if (avatarPreview) avatarPreview.src = generateAvatarDataUrl('U');
    closeModal('registerModal');
    if (localState.themeMode === 'dark' && userId) {
      window.location.reload();
    }
  };

  if (file) {
    let savedAvatar = fallbackAvatar;
    Promise.all([prepareProfileAvatar(file), ensureAnonymousSession()]).then(([avatar, firebaseUid]) => {
      if (!firebaseUid) throw new Error('missing firebase uid');
      savedAvatar = avatar || fallbackAvatar;
      return db.collection(COLLECTIONS.users).doc(firebaseUid).set({
        name,
        pw,
        firebaseUid,
        avatar: savedAvatar,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(() => firebaseUid);
    }).then((userId) => onSaved(userId, savedAvatar)).catch((err) => {
      console.error(err);
      alert(getRegisterErrorMessage(err));
    });
    return;
  }

  ensureAnonymousSession().then((firebaseUid) => {
    if (!firebaseUid) throw new Error('missing firebase uid');
    return db.collection(COLLECTIONS.users).doc(firebaseUid).set({
      name,
      pw,
      firebaseUid,
      avatar: fallbackAvatar,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).then(() => firebaseUid);
  }).then((userId) => onSaved(userId, fallbackAvatar)).catch((err) => {
    console.error(err);
    alert(getRegisterErrorMessage(err));
  });
}

function syncFirebaseUidForUser(user) {
  if (!user) return Promise.resolve();
  const currentUid = auth.currentUser && auth.currentUser.uid ? auth.currentUser.uid : '';
  if (!currentUid) {
    return auth.signInAnonymously()
      .then((cred) => (cred && cred.user && cred.user.uid ? cred.user.uid : ''))
      .then((uid) => {
        if (!uid) return;
        if (uid === user.firebaseUid && user.id === uid) return;
        return db.collection(COLLECTIONS.users).doc(uid).set({
          name: user.name || '',
          pw: user.pw || '',
          avatar: user.avatar || generateAvatarDataUrl(user.name || 'U'),
          firebaseUid: uid,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      })
      .catch((err) => {
        console.error('[AUTH] firebaseUid 동기화 실패:', err);
      });
  }
  if (currentUid === user.firebaseUid && user.id === currentUid) return Promise.resolve();
  return db.collection(COLLECTIONS.users).doc(currentUid).set({
    name: user.name || '',
    pw: user.pw || '',
    avatar: user.avatar || generateAvatarDataUrl(user.name || 'U'),
    firebaseUid: currentUid,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch((err) => {
    console.error('[AUTH] firebaseUid 동기화 실패:', err);
  });
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
  syncFirebaseUidForUser(user).finally(() => {
    persistAuthState();
    render();
    closeModal('loginModal');
    document.getElementById('loginPw').value = '';
    window.location.reload();
  });
}

function logoutUser() {
  localState.currentUser = null;
  localState.isAdmin = false;
  localState.pendingUserId = null;
  persistAuthState();
  closeModal('adminModal');
  render();
  auth.signOut()
    .catch((err) => {
      console.error('[AUTH] signOut 실패:', err);
    })
    .finally(() => {
      auth.signInAnonymously()
        .then(() => {
          window.location.reload();
        })
        .catch((err) => {
          console.error('[AUTH] 익명 재로그인 실패:', err);
        });
    });
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

function isMemoTypingInProgress() {
  const active = document.activeElement;
  if (!active || !active.id || !active.id.startsWith('memo-body-')) return false;
  return Date.now() < Number(localState.memoTypingUntil || 0);
}

function maybeRenderMemos() {
  if (!isMemoTypingInProgress()) {
    if (localState.memoRenderTimer) {
      clearTimeout(localState.memoRenderTimer);
      localState.memoRenderTimer = null;
    }
    renderMemos();
    return;
  }

  if (localState.memoRenderTimer) clearTimeout(localState.memoRenderTimer);
  const delay = Math.max(80, Number(localState.memoTypingUntil || 0) - Date.now() + 60);
  localState.memoRenderTimer = setTimeout(() => {
    localState.memoRenderTimer = null;
    renderMemos();
  }, delay);
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
          <textarea id="memo-body-${memo.id}" class="memo-body note-editor-pane" onfocus="markMemoTyping()" onblur="clearMemoTyping()" oninput="handleMemoInput('${memo.id}', this.value)" onpaste="handleMemoPaste(event, '${memo.id}')">${escapeHtml(memo.content || '')}</textarea>
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

function scheduleMemoPreview(id, value) {
  if (localState.memoPreviewTimers[id]) {
    clearTimeout(localState.memoPreviewTimers[id]);
  }
  localState.memoPreviewTimers[id] = setTimeout(() => {
    renderMemoView(id, value);
    delete localState.memoPreviewTimers[id];
  }, 70);
}

function handleMemoInput(id, value) {
  markMemoTyping();
  scheduleMemoPreview(id, value);
  scheduleMemoSave(id, value);
}

function markMemoTyping() {
  localState.memoTypingUntil = Date.now() + 1100;
}

function clearMemoTyping() {
  localState.memoTypingUntil = 0;
  if (localState.memoRenderTimer) {
    clearTimeout(localState.memoRenderTimer);
    localState.memoRenderTimer = null;
  }
  renderMemos();
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

function saveFigmaBoard() {
  const editor = document.getElementById('figmaBoardEditor');
  if (!editor) return;
  if (localState.figmaBoardSaveTimer) {
    clearTimeout(localState.figmaBoardSaveTimer);
    localState.figmaBoardSaveTimer = null;
  }
  const content = String(editor.value || '');
  localState.figmaBoardContent = content;
  db.collection(COLLECTIONS.config).doc('figmaLinks').set({ content }, { merge: true });
}

function scheduleFigmaBoardSave() {
  const editor = document.getElementById('figmaBoardEditor');
  if (!editor) return;
  localState.figmaBoardContent = String(editor.value || '');
  if (localState.figmaBoardSaveTimer) clearTimeout(localState.figmaBoardSaveTimer);
  localState.figmaBoardSaveTimer = setTimeout(() => {
    saveFigmaBoard();
  }, 300);
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

function normalizeBrandColorKey(key) {
  const safe = String(key || '').trim();
  const found = BRAND_COLOR_PRESETS.find((item) => item.key === safe);
  return found ? found.key : BRAND_COLOR_PRESETS[0].key;
}

function getBrandColorPickerHtml(selectedKey, inputId, pickerId) {
  const selected = normalizeBrandColorKey(selectedKey);
  return BRAND_COLOR_PRESETS.map((item) => {
    const activeClass = item.key === selected ? ' active' : '';
    const color = escapeAttr(item.light || '#2f63c8');
    const label = escapeAttr(item.label || item.key);
    return `<button type="button" class="brand-color-chip${activeClass}" data-key="${escapeAttr(item.key)}" style="--chip-color:${color};" aria-label="${label}" title="${label}" onclick="setBrandColorSelection('${escapeAttr(inputId)}','${escapeAttr(pickerId)}','${escapeAttr(item.key)}')"></button>`;
  }).join('');
}

function setBrandColorSelection(inputId, pickerId, key) {
  const normalized = normalizeBrandColorKey(key);
  const input = document.getElementById(inputId);
  const picker = document.getElementById(pickerId);
  if (input) input.value = normalized;
  if (picker) {
    picker.querySelectorAll('.brand-color-chip').forEach((chip) => {
      const chipKey = chip.getAttribute('data-key') || '';
      chip.classList.toggle('active', chipKey === normalized);
    });
  }
  if (inputId === 'brandColorInput') {
    applyBrandNameColorPreview(normalized);
    updateBrandColorToggleButton(normalized, 'brandColorToggleBtn', false);
    toggleBrandColorPicker('brandColorPickerWrap', true);
    return;
  }
  const brandId = String(inputId || '').startsWith('brand-color-value-')
    ? String(inputId).replace('brand-color-value-', '')
    : '';
  if (brandId) {
    updateBrandColorToggleButton(normalized, `brand-color-toggle-${brandId}`, true);
    applyBrandEditInputColor(brandId, normalized);
    toggleBrandColorPicker(`brand-color-wrap-${brandId}`, true);
  }
}

function applyBrandNameColorPreview(colorKey) {
  const input = document.getElementById('brandNameInput');
  if (!input) return;
  const color = getBrandTextColorByMode(colorKey);
  input.style.color = color;
  input.style.caretColor = color;
}

function updateBrandColorToggleButton(colorKey, buttonId, showLabel) {
  const btn = document.getElementById(buttonId || 'brandColorToggleBtn');
  const preset = BRAND_COLOR_PRESETS.find((item) => item.key === normalizeBrandColorKey(colorKey)) || BRAND_COLOR_PRESETS[0];
  if (!btn || !preset) return;
  const title = showLabel ? `색상: ${escapeHtml(preset.label)}` : '색상 선택';
  btn.innerHTML = `<span class="brand-color-toggle-chip" style="--chip-color:${escapeAttr(preset.light)};"></span><span>${title}</span>`;
}

function applyBrandEditInputColor(brandId, colorKey) {
  const input = document.getElementById(`brand-name-${brandId}`);
  if (!input) return;
  const color = getBrandTextColorByMode(colorKey);
  input.style.color = color;
  input.style.caretColor = color;
}

function toggleBrandColorPicker(wrapId, forceClose) {
  const wrap = document.getElementById(wrapId || 'brandColorPickerWrap');
  if (!wrap) return;
  if (forceClose === true) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.toggle('hidden');
}

function initBrandColorPickerPopover() {
  if (window.__brandColorPickerPopoverInited) return;
  window.__brandColorPickerPopoverInited = true;
  document.addEventListener('click', (event) => {
    const target = event && event.target ? event.target : null;
    if (!target) return;
    document.querySelectorAll('.brand-color-popover').forEach((wrap) => {
      const pop = wrap.closest('.brand-color-pop');
      if (!pop) return;
      if (pop.contains(target)) return;
      wrap.classList.add('hidden');
    });
  });
}

function getBrandColorLabel(colorKey) {
  const key = normalizeBrandColorKey(colorKey);
  const preset = BRAND_COLOR_PRESETS.find((item) => item.key === key) || BRAND_COLOR_PRESETS[0];
  return preset.label || key;
}

function getBrandColorOptionsHtml(selectedKey) {
  const selected = normalizeBrandColorKey(selectedKey);
  return BRAND_COLOR_PRESETS
    .map((item) => `<option value="${item.key}" ${item.key === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
}

function resolveBrandColorKeyFromTask(task) {
  if (!task) return BRAND_COLOR_PRESETS[0].key;
  const direct = normalizeBrandColorKey(task.brandColorKey);
  if (task.brandColorKey && direct) return direct;
  const brand = localState.brands.find((b) => b.id === task.brandId);
  if (brand && brand.colorKey) return normalizeBrandColorKey(brand.colorKey);
  return BRAND_COLOR_PRESETS[0].key;
}

function getBrandTextColorByMode(colorKey) {
  const key = normalizeBrandColorKey(colorKey);
  const preset = BRAND_COLOR_PRESETS.find((item) => item.key === key) || BRAND_COLOR_PRESETS[0];
  return localState.themeMode === 'dark' ? preset.dark : preset.light;
}

function getBrandTextStyleAttr(task) {
  const color = getBrandTextColorByMode(resolveBrandColorKeyFromTask(task));
  return `style="color: ${escapeAttr(color)};"`;
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
const figmaBoardEl = document.getElementById('figmaBoardEditor');
if (figmaBoardEl) {
  figmaBoardEl.addEventListener('input', scheduleFigmaBoardSave);
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
initBrandColorPickerPopover();
initMemoWalkerGame();

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

function getRegisterErrorMessage(err) {
  const code = err && (err.code || err.message) ? String(err.code || err.message) : '';
  if (code.includes('permission-denied')) return '저장 권한이 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.';
  if (code.includes('unavailable')) return '서버 연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
  if (code.includes('not_image') || code.includes('too_large') || code.includes('invalid_image') || code.includes('canvas_failed')) {
    return getProfileAvatarErrorMessage(err);
  }
  return '회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
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

const SLASH_EMOJI_TOKEN = '/@';
const SLASH_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤔', '😴', '😭', '😡', '🥳',
  '👍', '👎', '👏', '🙏', '💪', '🔥', '⭐', '✨', '💯', '🎉', '🎊', '🎁',
  '🍀', '🌈', '☀️', '🌙', '⚡', '💡', '📌', '📎', '🧠', '💬', '✅', '❌',
  '⏰', '📅', '📝', '📁', '📊', '📈', '📉', '🔒', '🔓', '🔔', '🛠️', '🚀',
  '☕', '🍪', '🥠', '🌿', '💧', '🎯', '🧩', '🐣', '🐤', '🐥', '🐔'
];
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

function initMemoWalkerGame() {
  const walker = document.querySelector('.memo-walker');
  const bubble = document.querySelector('.memo-walker-bubble');
  const burst = document.querySelector('.memo-mustard-burst');
  if (!walker || !burst) return;

  walker.addEventListener('click', () => {
    if (walker.classList.contains('caught')) return;

    walker.classList.add('caught');
    walker.classList.add('is-startled');
    walker.classList.add('is-squirting');
    if (bubble) bubble.textContent = '앗! 머스터드 발사!';
    createMemoMustardBurst(burst);

    setTimeout(() => {
      walker.classList.remove('is-startled');
      walker.classList.remove('is-squirting');
    }, 620);

    if (memoWalkerResumeTimer) {
      clearTimeout(memoWalkerResumeTimer);
    }
    memoWalkerResumeTimer = setTimeout(() => {
      walker.classList.remove('caught');
      if (bubble) bubble.textContent = '오늘은 무슨일로 오셨나요?';
    }, 1800);
  });
}

function createMemoMustardBurst(container) {
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < 12; i += 1) {
    const particle = document.createElement('span');
    particle.className = 'memo-walker-squirt';
    const angle = -50 + (Math.random() * 42);
    const distance = 20 + (Math.random() * 46);
    const dx = Math.cos((angle * Math.PI) / 180) * distance;
    const dy = Math.sin((angle * Math.PI) / 180) * distance;
    const rot = -18 + (Math.random() * 36);
    const delay = Math.round(Math.random() * 140);
    particle.style.setProperty('--dx', `${dx.toFixed(1)}px`);
    particle.style.setProperty('--dy', `${dy.toFixed(1)}px`);
    particle.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
    particle.style.animationDelay = `${delay}ms`;
    container.appendChild(particle);
  }
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
  ['taskCreateModal', 'workerListModal', 'registerModal', 'loginModal', 'adminModal', 'taskEditModal', 'brandListModal', 'refreshModal', 'gymMoodModal', 'figmaBoardModal', 'figmaLinkModal'].forEach(closeModal);
});

window.handleMemoPaste = handleMemoPaste;
window.handleSharedPaste = handleSharedPaste;



