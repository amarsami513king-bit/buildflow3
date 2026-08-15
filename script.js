const STORAGE_KEY = 'buildflow_users_v1';
const CURRENT_SESSION_KEY = 'buildflow_session_v1';

function hashPassword(value) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  return crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
    return Array.from(new Uint8Array(hashBuffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  });
}

const defaultUsers = [
  { id: 'admin', username: 'amar101597', passwordHash: 'e0238630a83e5873bc74c8192c03a650ae92fcdd45c4ac98b24839667a8bad54', role: 'admin', status: 'online' },
  { id: 'user-1', username: 'nova', passwordHash: 'c55c523cd7beebd238b6ea09888a3090961e048bec6de3a24e2aa37432103f59', role: 'user', status: 'online', createdByAdmin: true },
  { id: 'user-2', username: 'atlas', passwordHash: 'f2bfa3d4e1348e0d6ebd26b0d2db0d7ea15d9d3da76b6e26c8d7602f49e37166', role: 'user', status: 'offline', createdByAdmin: true }
];

const state = {
  currentUser: null,
  micEnabled: false,
  selectedUser: null,
  mediaStream: null,
  audioContext: null,
  analyser: null,
  animationFrameId: null,
  connectionState: 'Standby',
  peerConnection: null
};

const elements = {
  loginScreen: document.getElementById('loginScreen'),
  dashboardScreen: document.getElementById('dashboardScreen'),
  logoutBtn: document.getElementById('logoutBtn'),
  adminLoginForm: document.getElementById('adminLoginForm'),
  userLoginForm: document.getElementById('userLoginForm'),
  createUserForm: document.getElementById('createUserForm'),
  userList: document.getElementById('userList'),
  adminUserList: document.getElementById('adminUserList'),
  notificationList: document.getElementById('notificationList'),
  profileName: document.getElementById('profileName'),
  profileRole: document.getElementById('profileRole'),
  profileStatusText: document.getElementById('profileStatusText'),
  profileStatusBadge: document.getElementById('profileStatusBadge'),
  profileAvatar: document.getElementById('profileAvatar'),
  micToggleBtn: document.getElementById('micToggleBtn'),
  micBtnText: document.getElementById('micBtnText'),
  micStatusText: document.getElementById('micStatusText'),
  voiceConnectionStatus: document.getElementById('voiceConnectionStatus'),
  selectedUserLabel: document.getElementById('selectedUserLabel'),
  speakingIndicator: document.getElementById('speakingIndicator'),
  speakingText: document.getElementById('speakingText'),
  connectionState: document.getElementById('connectionState'),
  adminPanel: document.getElementById('adminPanel'),
  userCountChip: document.getElementById('userCountChip'),
  channelCount: document.getElementById('channelCount'),
  toastContainer: document.getElementById('toastContainer')
};

async function ensureAdminSeed() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUsers));
    return;
  }

  try {
    const storedUsers = JSON.parse(raw);
    const adminUser = storedUsers.find(user => user.role === 'admin');

    if (!adminUser || adminUser.username !== 'amar101597' || adminUser.passwordHash !== 'e0238630a83e5873bc74c8192c03a650ae92fcdd45c4ac98b24839667a8bad54') {
      const sanitizedUsers = storedUsers.filter(user => user.role !== 'admin');
      sanitizedUsers.unshift({
        id: 'admin',
        username: 'amar101597',
        passwordHash: 'e0238630a83e5873bc74c8192c03a650ae92fcdd45c4ac98b24839667a8bad54',
        role: 'admin',
        status: 'online'
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedUsers));
    }

    const normalizedUsers = storedUsers.map(user => {
      if (user.passwordHash) return user;
      if (user.password) {
        return {
          ...user,
          passwordHash: user.password,
          password: undefined
        };
      }
      return user;
    });

    const finalUsers = normalizedUsers.map(user => {
      if (user.passwordHash && user.passwordHash.length !== 64) {
        return {
          ...user,
          passwordHash: user.passwordHash
        };
      }
      return user;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(finalUsers));
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUsers));
  }
}

function seedStorage() {
  ensureAdminSeed();
}

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultUsers;
  } catch {
    return defaultUsers;
  }
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function getSession() {
  const raw = localStorage.getItem(CURRENT_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSession(user) {
  if (!user) {
    localStorage.removeItem(CURRENT_SESSION_KEY);
    return;
  }

  localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ username: user.username, role: user.role }));
}

function notify(message, type = 'neutral', duration = 2600) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duration);
}

function appendNotification(message, type = 'neutral') {
  const item = document.createElement('li');
  item.className = `notification-item ${type}`;
  item.textContent = message;
  elements.notificationList.prepend(item);

  while (elements.notificationList.children.length > 5) {
    elements.notificationList.removeChild(elements.notificationList.lastChild);
  }
}

function getUserInitials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || 'B';
}

function renderUserList() {
  const users = readUsers();
  const userList = users.filter(user => user.username !== 'admin');
  const onlineUsers = userList.filter(user => user.status === 'online');
  elements.userCountChip.textContent = `${onlineUsers.length}`;

  elements.userList.innerHTML = '';

  userList.forEach(user => {
    const item = document.createElement('li');
    item.className = 'user-item';
    item.innerHTML = `
      <div class="user-info" data-user="${user.username}">
        <div class="user-avatar">${getUserInitials(user.username)}</div>
        <div class="user-meta">
          <div class="user-name">${user.username}</div>
          <div class="user-role">${user.role === 'admin' ? 'Admin' : 'Operator'}</div>
        </div>
      </div>
      <div class="user-state ${user.status === 'online' ? 'online' : 'offline'}">
        <span class="dot"></span>
        ${user.status === 'online' ? 'Online' : 'Offline'}
      </div>
    `;

    item.addEventListener('click', () => {
      if (user.status !== 'online' || user.username === state.currentUser?.username) {
        notify('Select an online teammate to open a voice channel.', 'warn');
        return;
      }

      state.selectedUser = user.username;
      elements.selectedUserLabel.textContent = user.username;
      elements.connectionState.textContent = 'Linking';
      state.connectionState = 'Linking';
      updateConnectionVisuals();
      notify(`Voice link prepared with ${user.username}.`, 'success');
    });

    elements.userList.appendChild(item);
  });
}

function renderAdminUsers() {
  const users = readUsers();
  elements.adminUserList.innerHTML = '';

  users.forEach(user => {
    const item = document.createElement('li');
    item.className = 'admin-user-item';
    item.innerHTML = `
      <div>
        <div class="user-name">${user.username}</div>
        <div class="admin-role">${user.role}</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="user-state ${user.status === 'online' ? 'online' : 'offline'}">
          ${user.status === 'online' ? 'Online' : 'Offline'}
        </span>
        ${user.role !== 'admin' ? '<button class="delete-btn" type="button" data-user-id="'+user.id+'">Delete</button>' : ''}
      </div>
    `;

    const deleteButton = item.querySelector('.delete-btn');
    if (deleteButton) {
      deleteButton.addEventListener('click', () => {
        const remaining = readUsers().filter(account => account.id !== user.id);
        saveUsers(remaining);
        renderAdminUsers();
        renderUserList();
        appendNotification(`User account ${user.username} was removed.`, 'warn');
      });
    }

    elements.adminUserList.appendChild(item);
  });
}

function updateConnectionVisuals() {
  const isConnected = state.micEnabled && state.selectedUser;
  const badge = isConnected ? 'Connected' : state.micEnabled ? 'Mic live' : 'Standby';

  elements.connectionState.textContent = state.connectionState;
  elements.voiceConnectionStatus.textContent = badge;
  elements.voiceConnectionStatus.className = `status-indicator ${isConnected ? 'on' : state.micEnabled ? 'muted' : 'off'}`;
}

function updateProfileCard(user) {
  if (!user) return;

  const initials = getUserInitials(user.username);
  elements.profileAvatar.textContent = initials;
  elements.profileName.textContent = user.username;
  elements.profileRole.textContent = user.role === 'admin' ? 'Administrator' : 'Operator';
  elements.profileStatusText.textContent = user.status === 'online' ? 'Online' : 'Offline';
  elements.profileStatusBadge.style.borderColor = user.status === 'online' ? 'rgba(115, 249, 180, 0.26)' : 'rgba(145, 160, 188, 0.16)';
  elements.profileStatusBadge.style.color = user.status === 'online' ? 'var(--green)' : 'var(--muted)';
}

function setLoggedInUser(user) {
  state.currentUser = user;
  saveSession(user);
  updateProfileCard(user);

  elements.loginScreen.classList.add('hidden');
  elements.dashboardScreen.classList.remove('hidden');
  elements.logoutBtn.classList.remove('hidden');

  if (user.role === 'admin') {
    elements.adminPanel.classList.remove('hidden');
    appendNotification('Admin dashboard unlocked.', 'success');
  } else {
    elements.adminPanel.classList.add('hidden');
    appendNotification(`Welcome ${user.username}. Voice uplink ready.`, 'success');
  }

  renderUserList();
  renderAdminUsers();
}

function logoutUser() {
  state.currentUser = null;
  state.micEnabled = false;
  state.selectedUser = null;
  stopMicrophone();
  saveSession(null);

  elements.dashboardScreen.classList.add('hidden');
  elements.loginScreen.classList.remove('hidden');
  elements.logoutBtn.classList.add('hidden');
  elements.adminPanel.classList.add('hidden');

  elements.micToggleBtn.classList.remove('active');
  elements.micBtnText.textContent = 'Mic OFF';
  elements.micStatusText.textContent = 'Mic OFF';
  elements.micStatusText.className = 'status-indicator off';
  elements.speakingIndicator.className = 'pulse-dot';
  elements.speakingText.textContent = 'Waiting for input...';
  elements.selectedUserLabel.textContent = 'None';
  elements.connectionState.textContent = 'Standby';
  elements.voiceConnectionStatus.textContent = 'Idle';
  elements.voiceConnectionStatus.className = 'status-indicator muted';

  notify('Signed out successfully.', 'success');
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const username = document.getElementById('adminUsername').value.trim();
  const password = document.getElementById('adminPassword').value;

  const users = readUsers();
  const passwordHash = await hashPassword(password);
  const user = users.find(entry => entry.username === username && entry.passwordHash === passwordHash && entry.role === 'admin');

  if (!user) {
    notify('Admin credentials invalid.', 'error');
    return;
  }

  setLoggedInUser(user);
  document.getElementById('adminUsername').value = '';
  document.getElementById('adminPassword').value = '';
}

async function handleUserLogin(event) {
  event.preventDefault();
  const username = document.getElementById('userUsername').value.trim();
  const password = document.getElementById('userPassword').value;

  const users = readUsers();
  const passwordHash = await hashPassword(password);
  const user = users.find(entry => entry.username === username && entry.passwordHash === passwordHash && entry.role === 'user');

  if (!user) {
    notify('User account not found. Only admin-created accounts can sign in.', 'error');
    return;
  }

  const updatedUsers = users.map(entry => (entry.username === user.username ? { ...entry, status: 'online' } : entry));
  saveUsers(updatedUsers);
  setLoggedInUser({ ...user, status: 'online' });
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value = '';
}

async function handleCreateUser(event) {
  event.preventDefault();
  const username = document.getElementById('newUserName').value.trim();
  const password = document.getElementById('newUserPassword').value;

  if (!username || !password) {
    notify('Username and password are required.', 'error');
    return;
  }

  const users = readUsers();
  const existing = users.some(user => user.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    notify('That username already exists.', 'error');
    return;
  }

  const passwordHash = await hashPassword(password);
  const newUser = {
    id: crypto.randomUUID ? crypto.randomUUID() : `user-${Date.now()}`,
    username,
    passwordHash,
    role: 'user',
    status: 'online',
    createdByAdmin: true
  };

  users.push(newUser);
  saveUsers(users);
  renderUserList();
  renderAdminUsers();
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserPassword').value = '';
  notify(`User ${username} created successfully.`, 'success');
  appendNotification(`New account created for ${username}.`, 'success');
}

function toggleMicrophone() {
  if (!state.currentUser) {
    notify('Please log in before enabling voice.', 'warn');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    notify('This browser does not support microphone access.', 'error');
    return;
  }

  if (state.micEnabled) {
    stopMicrophone();
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(stream => {
      state.mediaStream = stream;
      state.micEnabled = true;
      elements.micToggleBtn.classList.add('active');
      elements.micBtnText.textContent = 'Mic ON';
      elements.micStatusText.textContent = 'Mic ON';
      elements.micStatusText.className = 'status-indicator on';
      elements.connectionState.textContent = state.selectedUser ? 'Connected' : 'Listening';
      state.connectionState = state.selectedUser ? 'Connected' : 'Listening';
      updateConnectionVisuals();
      notify('Microphone enabled. Choose a teammate to open audio.', 'success');
      setupAudioAnalyser(stream);
    })
    .catch(() => {
      notify('Microphone permission was denied. Please allow access to use voice.', 'error');
    });
}

function stopMicrophone() {
  state.micEnabled = false;
  elements.micToggleBtn.classList.remove('active');
  elements.micBtnText.textContent = 'Mic OFF';
  elements.micStatusText.textContent = 'Mic OFF';
  elements.micStatusText.className = 'status-indicator off';
  elements.speakingIndicator.className = 'pulse-dot';
  elements.speakingText.textContent = 'Waiting for input...';
  state.connectionState = 'Standby';
  elements.connectionState.textContent = 'Standby';
  updateConnectionVisuals();

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
    state.mediaStream = null;
  }

  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }

  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }

  if (state.analyser) {
    state.analyser = null;
  }
}

function setupAudioAnalyser(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const audioContext = new AudioCtx();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  analyser.fftSize = 256;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  state.audioContext = audioContext;
  state.analyser = analyser;

  const checkVolume = () => {
    if (!state.micEnabled || !state.analyser) return;

    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const isSpeaking = average > 26;

    elements.speakingIndicator.classList.toggle('active', isSpeaking);
    elements.speakingText.textContent = isSpeaking ? `${state.currentUser.username} is speaking...` : 'Waiting for input...';

    if (isSpeaking) {
      appendNotification(`${state.currentUser.username} speaking over voice channel.`, 'success');
    }

    state.animationFrameId = requestAnimationFrame(checkVolume);
  };

  checkVolume();
}

function checkStoredSession() {
  const session = getSession();
  if (!session) {
    return;
  }

  const users = readUsers();
  const user = users.find(entry => entry.username === session.username && entry.role === session.role);
  if (user) {
    setLoggedInUser(user);
  } else {
    saveSession(null);
  }
}

function initializeApp() {
  seedStorage();
  checkStoredSession();
  renderUserList();
  renderAdminUsers();

  elements.adminLoginForm.addEventListener('submit', handleAdminLogin);
  elements.userLoginForm.addEventListener('submit', handleUserLogin);
  elements.createUserForm.addEventListener('submit', handleCreateUser);
  elements.micToggleBtn.addEventListener('click', toggleMicrophone);
  elements.logoutBtn.addEventListener('click', logoutUser);

  elements.connectionState.textContent = 'Standby';
  elements.voiceConnectionStatus.textContent = 'Idle';
  updateConnectionVisuals();
}

initializeApp();
