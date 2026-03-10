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

const BOARD_STATUSES = ["진행중", "컨펌중", "수정중", "작업완료"];
const DONE_STATUS = "작업완료";
const ACTIVE_STATUSES = [...BOARD_STATUSES];
const LEGACY_STATUS_MAP = { "리뉴얼": "작업완료" };

const localState = {
  users: [],
  tasks: [],
  memos: [],
  isAdmin: false,
  currentUser: null,
  pendingUserId: null,
  firebaseConnected: false,
  authReady: false,
  archiveType: "보류중",
  editingTaskId: null,
  sharedMemoSaveTimer: null
};

hydrateAuthFromStorage();
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
  db.collection('users').orderBy('name').onSnapshot({ includeMetadataChanges: true }, (snap) => {
    setFirebaseConnectedFromSnapshot(snap);
    localState.users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    render();
  }, handleRealtimeError);

  db.collection('tasks').orderBy('date').onSnapshot({ includeMetadataChanges: true }, (snap) => {
    setFirebaseConnectedFromSnapshot(snap);
    localState.tasks = snap.docs.map((doc) => {
      const task = { id: doc.id, ...doc.data() };
      task.status = normalizeStatus(task.status);
      return task;
    });
    render();
  }, handleRealtimeError);

  db.collection('memos').orderBy('createdAt', 'asc').onSnapshot({ includeMetadataChanges: true }, (snap) => {
    setFirebaseConnectedFromSnapshot(snap);
    localState.memos = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderMemos();
  }, handleRealtimeError);

  db.collection('config').doc('sharedMemo').onSnapshot({ includeMetadataChanges: true }, (doc) => {
    setFirebaseConnectedFromSnapshot(doc);
    const memoEl = document.getElementById('archiveStaticMemo');
    const content = doc.exists ? (doc.data().content || '') : '';
    if (memoEl && document.activeElement !== memoEl) {
      memoEl.value = content;
    }
    if (document.activeElement !== memoEl) {
      renderSharedView(content);
    }
  }, handleRealtimeError);
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
  renderBoard();
  renderArchive();
  renderWorkerList();
  renderAdminLists();
}

function renderUserSelects() {
  const userOptions = localState.users
    .map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`)
    .join('');

  ['taskUserSelect', 'loginUserSelect', 'editTaskUserSelect'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = userOptions;
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

function createTaskCard(task) {
  const card = document.createElement('div');
  const normalizedStatus = normalizeStatus(task.status);
  card.className = `card ${normalizedStatus === DONE_STATUS ? 'done-card' : ''}`.trim();
  card.id = task.id;
  card.draggable = true;
  card.ondragstart = (e) => e.dataTransfer.setData('text', task.id);
  const userName = resolveUserName(task);

  card.innerHTML = `
    <div class="card-title">${escapeHtml(task.name || '')}</div>
    <div class="task-status ${getStatusClass(task.status)}">${escapeHtml(task.status || '')}</div>
    <div class="card-meta">
      <span>담당: ${escapeHtml(userName)}</span>
      <span>${escapeHtml(task.date || '미지정')}</span>
    </div>
    <div class="card-actions">
      <button class="btn btn-outline small" onclick="openTaskEditModal('${task.id}')">수정</button>
    </div>
  `;

  return card;
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
  const userName = resolveUserName(task);
  card.innerHTML = `
    <div class="archive-title">${escapeHtml(task.name || '')}</div>
    <div class="archive-meta">
      <span>${escapeHtml(task.date || '미지정')}</span>
      <span>담당: ${escapeHtml(userName)}</span>
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
  const userId = document.getElementById('taskUserSelect').value;
  const status = document.getElementById('taskCategorySelect').value;
  const date = document.getElementById('taskDate').value;

  const user = localState.users.find((u) => u.id === userId);
  if (!name || !userId || !user) {
    alert('작업명과 담당자를 확인하세요.');
    return;
  }

  db.collection('tasks').add({
    name,
    userId,
    userName: user.name,
    status: normalizeStatus(status),
    date,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById('taskName').value = '';
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
  db.collection('tasks').doc(id).update({
    status: target.id,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function renderWorkerList() {
  const list = document.getElementById('fullWorkerList');
  if (!list) return;

  list.innerHTML = localState.users.map((u) => `
    <div class="worker-row">
      <div><strong>${escapeHtml(u.name)}</strong></div>
      <div class="worker-actions">
        ${localState.isAdmin ? `<button class="btn btn-outline small" onclick="openAdminModalFromWorker()">관리자에서 수정</button>` : ''}
      </div>
    </div>
  `).join('');
}

function openAdminModalFromWorker() {
  closeModal('workerListModal');
  openModal('adminModal');
}

function renderAdminLists() {
  const userList = document.getElementById('adminUserList');
  const taskList = document.getElementById('adminTaskList');
  if (!userList || !taskList) return;

  if (!localState.isAdmin) {
    userList.innerHTML = '<div class="card">관리자 권한이 필요합니다.</div>';
    taskList.innerHTML = '';
    return;
  }

  userList.innerHTML = localState.users.map((u) => `
    <div class="admin-row admin-user-grid">
      <input id="admin-user-name-${u.id}" class="pill-input" value="${escapeAttr(u.name || '')}" placeholder="이름">
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

  taskList.innerHTML = localState.tasks.map((t) => `
    <div class="admin-row admin-task-grid">
      <input id="admin-task-name-${t.id}" class="pill-input" value="${escapeAttr(t.name || '')}" placeholder="작업명">
      <select id="admin-task-user-${t.id}" class="pill-input">${userOptions}</select>
      <select id="admin-task-status-${t.id}" class="pill-input">
        <option value="진행중">진행중</option>
        <option value="컨펌중">컨펌중</option>
        <option value="수정중">수정중</option>
        <option value="보류중">보류중</option>
        <option value="작업완료">작업완료</option>
      </select>
      <input id="admin-task-date-${t.id}" class="pill-input" type="date" value="${escapeAttr(t.date || '')}">
      <div class="row-actions">
        <button class="btn btn-primary small" onclick="saveTask('${t.id}')">저장</button>
        <button class="btn btn-outline small" onclick="deleteTask('${t.id}')">삭제</button>
      </div>
    </div>
  `).join('');

  localState.tasks.forEach((t) => {
    const userEl = document.getElementById(`admin-task-user-${t.id}`);
    const statusEl = document.getElementById(`admin-task-status-${t.id}`);
    if (userEl && t.userId) userEl.value = t.userId;
    if (statusEl && t.status) statusEl.value = normalizeStatus(t.status);
  });
}

function saveUser(userId) {
  if (!localState.isAdmin) return;
  const name = document.getElementById(`admin-user-name-${userId}`).value.trim();
  const pw = document.getElementById(`admin-user-pw-${userId}`).value;
  if (!name || !pw) {
    alert('이름/비밀번호를 입력하세요.');
    return;
  }
  db.collection('users').doc(userId).update({ name, pw });

  db.collection('tasks').where('userId', '==', userId).get().then((snap) => {
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.update(doc.ref, { userName: name }));
    return batch.commit();
  });
}

function deleteUser(userId) {
  if (!localState.isAdmin) return;
  if (!confirm('작업자를 삭제하시겠습니까?')) return;
  db.collection('users').doc(userId).delete();
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

  db.collection('tasks').doc(taskId).update({
    name,
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
  db.collection('tasks').doc(taskId).delete();
}

function openTaskEditModal(taskId) {
  const task = localState.tasks.find((t) => t.id === taskId);
  if (!task) return;

  localState.editingTaskId = taskId;
  document.getElementById('editTaskName').value = task.name || '';
  document.getElementById('editTaskDate').value = task.date || '';
  document.getElementById('editTaskStatusSelect').value = normalizeStatus(task.status);

  const userSelect = document.getElementById('editTaskUserSelect');
  if (userSelect && task.userId) userSelect.value = task.userId;

  openModal('taskEditModal');
}

function saveTaskFromBoard() {
  if (!localState.editingTaskId) return;
  const name = document.getElementById('editTaskName').value.trim();
  const userId = document.getElementById('editTaskUserSelect').value;
  const status = document.getElementById('editTaskStatusSelect').value;
  const date = document.getElementById('editTaskDate').value;

  const user = localState.users.find((u) => u.id === userId);
  if (!name || !user) {
    alert('작업명 또는 담당자를 확인하세요.');
    return;
  }

  db.collection('tasks').doc(localState.editingTaskId).update({
    name,
    userId,
    userName: user.name,
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
  const userLogoutBtn = document.getElementById('userLogoutBtn');
  const adminBtn = document.getElementById('adminBtn');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const currentName = localState.currentUser ? localState.currentUser.name : 'Guest';
  setText('loginInfo', currentName);

  if (loginBtn) loginBtn.classList.toggle('hidden', !!localState.currentUser);
  if (userLogoutBtn) userLogoutBtn.classList.toggle('hidden', !localState.currentUser);
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

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
  if (id === 'taskEditModal') localState.editingTaskId = null;
}

function closeOnBackdrop(event, modalId) {
  if (event.target.id === modalId) closeModal(modalId);
}

function registerUser() {
  const name = document.getElementById('regName').value.trim();
  const pw = document.getElementById('regPw').value.trim();
  if (!name || !pw) {
    alert('이름과 비밀번호를 입력하세요.');
    return;
  }

  db.collection('users').add({
    name,
    pw,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById('regName').value = '';
    document.getElementById('regPw').value = '';
    closeModal('registerModal');
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
  persistAuthState();
  render();
  closeModal('loginModal');
  document.getElementById('loginPw').value = '';
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
  db.collection('memos').add({
    title: '새 페이지',
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
            <button class="btn btn-outline small" onclick="enterMemoEdit('${memo.id}')">편집</button>
            <button class="btn btn-outline small" onclick="insertMemoLink('${memo.id}')">링크</button>
            <button class="btn btn-outline small" onclick="toggleMemo('${memo.id}', ${memo.isCollapsed ? 'false' : 'true'})">${memo.isCollapsed ? '펼치기' : '접기'}</button>
            <button class="btn btn-outline small" onclick="deleteMemo('${memo.id}')">삭제</button>
          </div>
        </div>
        <div class="note-shell">
          <textarea id="memo-body-${memo.id}" class="memo-body note-editor-pane hidden" onblur="exitMemoEdit('${memo.id}')" onpaste="handleMemoPaste(event, '${memo.id}')">${escapeHtml(memo.content || '')}</textarea>
          <div id="memo-view-${memo.id}" class="note-view-pane" ondblclick="enterMemoEdit('${memo.id}')">${renderNoteElements(memo.content || '')}</div>
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
  db.collection('memos').doc(id).update({ [field]: value });
}

function enterMemoEdit(id) {
  const editor = document.getElementById(`memo-body-${id}`);
  const view = document.getElementById(`memo-view-${id}`);
  if (!editor || !view) return;
  editor.classList.remove('hidden');
  view.classList.add('hidden');
  editor.focus();
  editor.selectionStart = editor.value.length;
  editor.selectionEnd = editor.value.length;
}

function exitMemoEdit(id) {
  const editor = document.getElementById(`memo-body-${id}`);
  const view = document.getElementById(`memo-view-${id}`);
  if (!editor || !view) return;
  updateMemo(id, 'content', editor.value);
  view.innerHTML = renderNoteElements(editor.value);
  view.classList.remove('hidden');
  editor.classList.add('hidden');
}

function deleteMemo(id) {
  if (!confirm('메모를 삭제하시겠습니까?')) return;
  db.collection('memos').doc(id).delete();
}

function toggleMemo(id, collapsed) {
  db.collection('memos').doc(id).update({ isCollapsed: collapsed });
}

function resolveUserName(task) {
  const user = localState.users.find((u) => u.id === task.userId);
  if (user && user.name) return user.name;
  return task.userName || '-';
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
  enterMemoEdit(memoId);
  const textarea = document.getElementById(`memo-body-${memoId}`);
  if (!textarea) return;
  insertTextAtCursor(textarea, text);
  textarea.focus();
  updateMemo(memoId, 'content', textarea.value);
}

function insertMemoLink(memoId) {
  enterMemoEdit(memoId);
  const textarea = document.getElementById(`memo-body-${memoId}`);
  if (!textarea) return;
  wrapSelectionWithLink(textarea);
  updateMemo(memoId, 'content', textarea.value);
  textarea.focus();
}

function insertSharedText(text) {
  enterSharedEdit();
  const textarea = document.getElementById('archiveStaticMemo');
  if (!textarea) return;
  insertTextAtCursor(textarea, text);
  textarea.focus();
  scheduleSharedMemoSave();
}

function insertSharedLink() {
  enterSharedEdit();
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
    updateMemo(memoId, 'content', textarea.value);
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
  db.collection('config').doc('sharedMemo').set({ content }, { merge: true });
  renderSharedView(content);
}

function scheduleSharedMemoSave() {
  const editor = document.getElementById('archiveStaticMemo');
  if (!editor) return;
  if (localState.sharedMemoSaveTimer) clearTimeout(localState.sharedMemoSaveTimer);
  localState.sharedMemoSaveTimer = setTimeout(() => {
    saveSharedMemo();
  }, 300);
}

function enterSharedEdit() {
  const editor = document.getElementById('archiveStaticMemo');
  const view = document.getElementById('sharedView');
  if (!editor || !view) return;
  editor.classList.remove('hidden');
  view.classList.add('hidden');
  editor.focus();
}

function exitSharedEdit() {
  const editor = document.getElementById('archiveStaticMemo');
  const view = document.getElementById('sharedView');
  if (!editor || !view) return;
  saveSharedMemo();
  view.classList.remove('hidden');
  editor.classList.add('hidden');
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
  return LEGACY_STATUS_MAP[status] || status || '진행중';
}

function getStatusClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === '진행중') return 'status-progress';
  if (normalized === '컨펌중') return 'status-confirm';
  if (normalized === '수정중') return 'status-edit';
  if (normalized === '작업완료') return 'status-done';
  if (normalized === '보류중') return 'status-hold';
  return 'status-default';
}

const sharedMemoEl = document.getElementById('archiveStaticMemo');
if (sharedMemoEl) {
  sharedMemoEl.addEventListener('input', scheduleSharedMemoSave);
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

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  ['workerListModal', 'registerModal', 'loginModal', 'adminModal', 'taskEditModal'].forEach(closeModal);
});

window.handleMemoPaste = handleMemoPaste;
window.handleSharedPaste = handleSharedPaste;
