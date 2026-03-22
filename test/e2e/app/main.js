import { registerServiceWorker } from '/src/index.js';

const logEl = document.getElementById('log');
const messagesEl = document.getElementById('messages');

const log = (value) => {
  logEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
};

const recordMessage = (value) => {
  messagesEl.textContent += `${JSON.stringify(value)}\n`;
};

const config = {
  useEmulators: true,
};

export const accelerantReady = (async () => {
  const { accelerant, registration } = await registerServiceWorker(config, '/sw.js');
  await accelerant.whenReady();
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  }
  await navigator.serviceWorker.ready;
  await refreshAuthStatus();
  return { accelerant, registration };
})().catch((error) => {
  window.__accelerantReadyError = {
    message: error?.message ?? String(error),
    name: error?.name ?? 'Error',
    stack: error?.stack ?? null,
  };
  throw error;
});

async function apiFetch(path, options = {}) {
  const response = await fetch(path, options);
  const contentType = response.headers.get('Content-Type') || '';
  let body = null;
  if (response.status !== 204) {
    body = contentType.includes('application/json') ? await response.json() : await response.text();
  }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
}

const generateString = (len) =>
  [...Array(len)].map(() => ((Math.random() * 36) | 0).toString(36)).join('');

window.accelerantApi = {
  auth: {
    status: () => apiFetch('/api/auth/status', { method: 'GET' }),
    signIn: (email, password) =>
      apiFetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    signOut: () => apiFetch('/api/auth/sign-out', { method: 'POST' }),
  },
  firestore: {
    getDoc: (collection, id) => apiFetch(`/api/db/${collection}/${id}`),
    list: (collection, query = '') => apiFetch(`/api/db/${collection}${query}`),
    post: (collection, data) =>
      apiFetch(`/api/db/${collection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },
  storage: {
    put: (path, data, contentType) =>
      apiFetch(`/api/fs/${path}`, {
        method: 'PUT',
        headers: contentType ? { 'Content-Type': contentType } : {},
        body: data,
      }),
    get: (path) => apiFetch(`/api/fs/${path}`),
    head: (path) => apiFetch(`/api/fs/${path}`, { method: 'HEAD' }),
  },
};

window.accelerantReady = accelerantReady;

const authIndicator = document.getElementById('auth-indicator');
const authStatusText = document.getElementById('auth-status-text');
const _fsIndicator = document.getElementById('fs-indicator');
const fsStatusText = document.getElementById('fs-status-text');

const setAuthStatus = (state) => {
  authIndicator.classList.remove('green', 'red');
  if (state === 'signed-in') {
    authIndicator.classList.add('green');
    authStatusText.textContent = 'Auth: signed-in';
  } else if (state === 'signed-out') {
    authIndicator.classList.add('red');
    authStatusText.textContent = 'Auth: signed-out';
  } else {
    authStatusText.textContent = 'Auth: unknown';
  }
};

const channel = new BroadcastChannel('accelerant');
channel.addEventListener('message', (event) => {
  const message = event?.data;
  if (!message) return;
  window.__lastBroadcast = message;
  if (message.type === 'auth:post') {
    setTimeout(async () => await refreshAuthStatus(), 1);
  }
  recordMessage(message);
});

window.__getAuthIndicatorState = () => authStatusText.textContent;
window.__getFirestoreIndicatorState = () => fsStatusText.textContent;

const refreshAuthStatus = async () => {
  const status = await window.accelerantApi.auth.status();
  if (status?.body?.authenticated) {
    setAuthStatus('signed-in');
  } else if (status?.body?.authenticated === false) {
    setAuthStatus('signed-out');
  }
};

// Manual buttons
const btnAuth = document.getElementById('btn-auth');
const btnAuthSignIn = document.getElementById('btn-auth-signin');
const btnAuthSignOut = document.getElementById('btn-auth-signout');

btnAuth.addEventListener('click', async () => {
  log(await window.accelerantApi.auth.status());
});

btnAuthSignIn.addEventListener('click', async () => {
  log(await window.accelerantApi.auth.signIn('e2e@example.com', 'password123!'));
});

btnAuthSignOut.addEventListener('click', async () => {
  log(await window.accelerantApi.auth.signOut());
});

const btnFsCreate = document.getElementById('btn-fs-create');
const btnFsFetch = document.getElementById('btn-fs-fetch');
const btnFsDelete = document.getElementById('btn-fs-delete');
const fsCreateName = document.getElementById('fs-create-name');
const fsFetchQuery = document.getElementById('fs-fetch-query');
const fsDeleteId = document.getElementById('fs-delete-id');
const createLogEl = document.getElementById('create-log');

const formatLog = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));

const extractId = (result) => {
  const body = result?.body;
  if (!body) return null;
  return (
    body.id ||
    body.docId ||
    body.name ||
    body?.data?.id ||
    body?.data?.name ||
    body?.result?.id ||
    null
  );
};

const createLogEntry = (result) => {
  const entry = document.createElement('div');
  entry.className = 'create-entry';
  const entryId = extractId(result);
  if (entryId) entry.dataset.id = entryId;

  const actions = document.createElement('div');
  actions.className = 'row';

  const fetchBtn = document.createElement('button');
  fetchBtn.type = 'button';
  fetchBtn.textContent = 'Fetch';
  fetchBtn.dataset.action = 'fetch';
  if (!entryId) fetchBtn.disabled = true;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  deleteBtn.dataset.action = 'delete';
  if (!entryId) deleteBtn.disabled = true;

  actions.append(fetchBtn, deleteBtn);

  const pre = document.createElement('pre');
  pre.textContent = formatLog(result);

  entry.append(actions, pre);
  createLogEl.prepend(entry);
};

btnFsCreate.addEventListener('click', async () => {
  const name = fsCreateName.value.trim();
  const result = await window.accelerantApi.firestore.post('people', { name });
  log(result);
  createLogEntry(result);
  fsCreateName.value = '';
});

btnFsFetch.addEventListener('click', async () => {
  const query = fsFetchQuery.value.trim();
  const suffix = query ? `?${query}` : '';
  log(await window.accelerantApi.firestore.list('people', suffix));
});

btnFsDelete.addEventListener('click', async () => {
  const id = fsDeleteId.value.trim();
  if (!id) return;
  log(await apiFetch(`/api/db/people/${id}`, { method: 'DELETE' }));
  fsDeleteId.value = '';
});

const btnStorageCreate = document.getElementById('btn-storage-create');
const btnStorageHead = document.getElementById('btn-storage-head');
const btnStorageFetch = document.getElementById('btn-storage-fetch');
const _btnStorageDelete = document.getElementById('btn-storage-delete');

btnStorageCreate.addEventListener('click', async () => {
  log(
    await window.accelerantApi.storage.put(
      'fixtures/e2e.txt',
      `hello storage | ${generateString(256 * 1024)}`,
      'text/plain',
    ),
  );
});

btnStorageHead.addEventListener('click', async () => {
  log(await window.accelerantApi.storage.head('fixtures/e2e.txt'));
});

btnStorageFetch.addEventListener('click', async () => {
  log(await window.accelerantApi.storage.get('fixtures/e2e.txt'));
});

createLogEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('button');
  if (!btn) return;
  const entry = btn.closest('.create-entry');
  if (!entry) return;
  const id = entry.dataset.id;
  if (!id) return;
  if (btn.dataset.action === 'fetch') {
    log(await apiFetch(`/api/db/people/${id}`));
  } else if (btn.dataset.action === 'delete') {
    log(await apiFetch(`/api/db/people/${id}`, { method: 'DELETE' }));
  }
});
