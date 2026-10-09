// API expuesta por preload.js
const api = window.electronAPI;

// Variables globales
let connected = false;
let currentConnection = null;
let showHidden = true;
let activeSide = 'local';
// Elementos que se están arrastrando desde uno de los paneles
let dragSource = null;

// Elementos DOM
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const saveBtn = document.getElementById('save-btn');
const browseBtn = document.getElementById('browse-btn');
const localParentBtn = document.getElementById('local-parent-btn');
const remoteParentBtn = document.getElementById('remote-parent-btn');
const connectionsList = document.getElementById('connections-list');
const connectionBadge = document.getElementById('connection-badge');
const statusMessage = document.getElementById('status-message');
const showHiddenCheckbox = document.getElementById('show-hidden');
const transferProgress = document.getElementById('transfer-progress');
const transferLabel = document.getElementById('transfer-label');
const transferBar = document.getElementById('transfer-bar');
const transferDetail = document.getElementById('transfer-detail');
const transferCancelBtn = document.getElementById('transfer-cancel-btn');

// Campos de formulario de conexión
const connectionNameInput = document.getElementById('connection-name');
const hostInput = document.getElementById('host');
const portInput = document.getElementById('port');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const secureCheckbox = document.getElementById('secure');

// Estado de cada panel
const panels = {
  local: createPanel('local'),
  remote: createPanel('remote'),
};

function createPanel(side) {
  return {
    side,
    path: side === 'remote' ? '/' : '',
    entries: [],
    selected: new Set(),
    anchor: null,
    filter: '',
    loadId: 0,
    container: document.getElementById(`${side}-files`),
    pathInput: document.getElementById(`${side}-path`),
    filterInput: document.getElementById(`${side}-filter`),
  };
}

function otherPanel(panel) {
  return panel.side === 'local' ? panels.remote : panels.local;
}

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  // Verificar que la API de Electron está disponible
  if (!api) {
    console.error('Error: electronAPI no está disponible');
    showStatus('Error: API de Electron no disponible. Comprueba la consola para más detalles.', true);
    return;
  }

  try {
    showHidden = localStorage.getItem('showHidden') !== 'false';
  } catch {
    showHidden = true;
  }
  showHiddenCheckbox.checked = showHidden;

  document.getElementById('app-version').textContent = `v${await api.getAppVersion()}`;
  api.onTransferProgress(updateTransferProgress);
  api.onConnectionChange(handleConnectionChange);

  loadSavedConnections();
  updateConnectionUI();
  renderPanel(panels.remote);

  const homeDir = await api.getHomeDirectory();
  loadLocalFiles(homeDir);
});

// Manejadores de eventos
connectBtn.addEventListener('click', connectToFTP);
disconnectBtn.addEventListener('click', disconnectFromFTP);
saveBtn.addEventListener('click', saveConnection);
browseBtn.addEventListener('click', browseLocalDirectory);
localParentBtn.addEventListener('click', navigateLocalParent);
remoteParentBtn.addEventListener('click', navigateRemoteParent);
document.getElementById('local-refresh-btn').addEventListener('click', () => refreshPanel(panels.local));
document.getElementById('remote-refresh-btn').addEventListener('click', () => refreshPanel(panels.remote));
transferCancelBtn.addEventListener('click', cancelTransfers);
showHiddenCheckbox.addEventListener('change', () => {
  showHidden = showHiddenCheckbox.checked;
  try {
    localStorage.setItem('showHidden', String(showHidden));
  } catch {
    // Sin almacenamiento: la preferencia dura hasta cerrar la app
  }
  renderPanel(panels.local);
  renderPanel(panels.remote);
});

for (const panel of Object.values(panels)) {
  setupPanelEvents(panel);
}

// F5 actualiza el panel activo aunque el foco esté en otro sitio
document.addEventListener('keydown', e => {
  if (e.key === 'F5') {
    e.preventDefault();
    refreshPanel(panels[activeSide]);
  }
});

// Soltar archivos fuera de los paneles no debe abrirlos en la ventana
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

// CONEXIONES

// Función para cargar conexiones guardadas
async function loadSavedConnections() {
  try {
    const connections = await api.getConnections();

    // Limpiar lista existente
    connectionsList.innerHTML = '';

    // Agregar cada conexión a la lista
    connections.forEach(connection => {
      const li = document.createElement('li');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = connection.name;
      nameSpan.title = `${connection.user ? connection.user + '@' : ''}${connection.host}:${connection.port}`;
      li.appendChild(nameSpan);

      const btnContainer = document.createElement('div');

      const quickConnectBtn = document.createElement('button');
      quickConnectBtn.textContent = '⚡';
      quickConnectBtn.title = 'Conectar';
      quickConnectBtn.classList.add('mini-btn-icon');
      quickConnectBtn.addEventListener('click', e => {
        e.stopPropagation();
        fillConnectionForm(connection);
        connectToFTP();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = 'Eliminar conexión';
      deleteBtn.classList.add('mini-btn-icon');
      deleteBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const answer = await askConfirm({
          title: 'Eliminar conexión',
          message: `¿Eliminar la conexión guardada «${connection.name}»?`,
          buttons: [
            { label: 'Eliminar', value: 'ok', danger: true },
            { label: 'Cancelar', value: null },
          ],
        });
        if (answer === 'ok') {
          await api.deleteConnection(connection.name);
          loadSavedConnections();
        }
      });

      btnContainer.appendChild(quickConnectBtn);
      btnContainer.appendChild(deleteBtn);
      li.appendChild(btnContainer);

      // Llenar el formulario al hacer clic en la conexión
      li.addEventListener('click', () => {
        fillConnectionForm(connection);
      });

      connectionsList.appendChild(li);
    });
  } catch {
    showStatus('Error al cargar conexiones guardadas', true);
  }
}

// Función para llenar el formulario con una conexión guardada
function fillConnectionForm(connection) {
  connectionNameInput.value = connection.name;
  hostInput.value = connection.host;
  portInput.value = connection.port;
  usernameInput.value = connection.user || '';
  passwordInput.value = connection.password || '';
  secureCheckbox.checked = Boolean(connection.secure);
}

// Función para guardar una conexión
async function saveConnection() {
  // Validación básica
  if (!connectionNameInput.value || !hostInput.value) {
    showStatus('Debe proporcionar un nombre y host', true);
    return;
  }

  const connection = {
    name: connectionNameInput.value,
    host: hostInput.value,
    port: parseInt(portInput.value) || 21,
    user: usernameInput.value,
    password: passwordInput.value,
    secure: secureCheckbox.checked,
  };

  try {
    const { passwordSaved } = await api.saveConnection(connection);
    if (passwordSaved) {
      showStatus('Conexión guardada correctamente');
    } else {
      showStatus('Conexión guardada sin la contraseña: no hay un llavero del sistema disponible para cifrarla', true);
    }
    loadSavedConnections();
  } catch {
    showStatus('Error al guardar la conexión', true);
  }
}

// Función para conectar al servidor FTP
async function connectToFTP() {
  // Validación básica
  if (!hostInput.value) {
    showStatus('Debe proporcionar un host', true);
    return;
  }

  const config = {
    host: hostInput.value.trim(),
    port: parseInt(portInput.value) || 21,
    user: usernameInput.value,
    password: passwordInput.value,
    secure: secureCheckbox.checked,
  };

  // La conexión anterior se cierra: lo que quedara en cola ya no tiene destino
  await stopTransfers();
  showStatus('Conectando...');
  connectBtn.disabled = true;

  try {
    const result = await api.ftpConnect(config);

    if (result.success) {
      connected = true;
      currentConnection = config;
      updateConnectionUI();
      showStatus('Conexión exitosa');

      // Empezar en el directorio de inicio del usuario en el servidor
      panels.remote.path = result.home || '/';
      panels.remote.entries = [];
      panels.remote.selected.clear();
      await loadRemoteFiles(panels.remote.path);
    } else {
      // El proceso principal ya ha cerrado la conexión anterior: no dejar el panel remoto como si siguiera activa
      resetRemotePanel();
      showStatus(`Error de conexión: ${result.message}`, true);
    }
  } catch (error) {
    console.error('Error completo:', error);
    resetRemotePanel();
    showStatus(`Error de conexión: ${error.message}`, true);
  } finally {
    connectBtn.disabled = false;
  }
}

async function disconnectFromFTP() {
  await stopTransfers();
  await api.ftpDisconnect();
  resetRemotePanel();
  showStatus('Desconectado');
}

// Avisos del proceso principal cuando el servidor corta la sesión
function handleConnectionChange({ state, message }) {
  if (!connected) {
    return;
  }
  if (state === 'reconnecting') {
    connectionBadge.textContent = 'Reconectando...';
    connectionBadge.className = 'connection-badge reconnecting';
    showStatus('Se ha perdido la conexión. Reconectando...');
  } else if (state === 'connected') {
    updateConnectionUI();
    showStatus('Reconectado');
  } else if (state === 'disconnected') {
    resetRemotePanel();
    showStatus(`Se ha perdido la conexión con el servidor: ${message}`, true);
  }
}

function updateConnectionUI() {
  disconnectBtn.hidden = !connected;
  if (connected) {
    connectionBadge.textContent = `Conectado · ${currentConnection.host}`;
    connectionBadge.className = 'connection-badge connected';
  } else {
    connectionBadge.textContent = 'Sin conexión';
    connectionBadge.className = 'connection-badge';
  }
}

// Función para vaciar el panel remoto cuando no hay conexión
function resetRemotePanel() {
  connected = false;
  currentConnection = null;
  transferQueue.length = 0;
  const panel = panels.remote;
  panel.loadId++;
  panel.path = '/';
  panel.pathInput.value = '/';
  panel.entries = [];
  panel.selected.clear();
  updateConnectionUI();
  renderPanel(panel);
}

// PANELES

// Función para explorar directorios locales
async function browseLocalDirectory() {
  try {
    const selectedDir = await api.selectDirectory();

    if (selectedDir) {
      loadLocalFiles(selectedDir);
    }
  } catch {
    showStatus('Error al seleccionar directorio', true);
  }
}

// Función para cargar archivos locales
async function loadLocalFiles(directory, { keepSelection = false } = {}) {
  const panel = panels.local;
  const loadId = ++panel.loadId;
  const result = await api.listLocalDirectory(directory);
  if (loadId !== panel.loadId) {
    return false; // Ya se ha pedido otra carpeta
  }
  if (!result.success) {
    // Si falla se sigue en la carpeta anterior
    showStatus(`No se puede abrir la carpeta: ${result.message}`, true);
    return false;
  }
  setPanelEntries(panel, directory, result.data, keepSelection);
  return true;
}

// Función para cargar archivos remotos
async function loadRemoteFiles(remotePath, { keepSelection = false, quiet = false } = {}) {
  if (!connected) {
    showStatus('No hay conexión FTP activa', true);
    return false;
  }

  const panel = panels.remote;
  const loadId = ++panel.loadId;
  if (!quiet) {
    showStatus('Cargando archivos remotos...');
  }

  try {
    const result = await api.ftpListDirectory(remotePath);
    if (loadId !== panel.loadId) {
      return false;
    }
    if (!result.success) {
      showStatus(`Error: ${result.message}`, true);
      return false;
    }
    setPanelEntries(panel, remotePath, result.data, keepSelection);
    if (!quiet) {
      showStatus('Archivos remotos cargados');
    }
    return true;
  } catch (error) {
    showStatus(`Error al cargar archivos remotos: ${error.message}`, true);
    return false;
  }
}

function setPanelEntries(panel, directory, entries, keepSelection) {
  const sameDir = panel.path === directory;
  panel.path = directory;
  panel.pathInput.value = directory;
  // Mostrar el final de la ruta, que es la parte relevante
  panel.pathInput.scrollLeft = panel.pathInput.scrollWidth;
  panel.entries = sortEntries(entries);
  if (keepSelection && sameDir) {
    const names = new Set(panel.entries.map(entry => entry.name));
    panel.selected = new Set([...panel.selected].filter(name => names.has(name)));
  } else {
    panel.selected.clear();
    panel.anchor = null;
    panel.container.scrollTop = 0;
  }
  renderPanel(panel);
}

// Carpetas primero y orden alfabético natural ("archivo2" antes que "archivo10")
function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function refreshPanel(panel) {
  if (panel.side === 'local') {
    return loadLocalFiles(panel.path, { keepSelection: true });
  }
  return connected ? loadRemoteFiles(panel.path, { keepSelection: true }) : Promise.resolve(false);
}

function visibleEntries(panel) {
  const filter = panel.filter.trim().toLowerCase();
  return panel.entries.filter(
    entry => (showHidden || !entry.name.startsWith('.')) && (!filter || entry.name.toLowerCase().includes(filter))
  );
}

function renderPanel(panel) {
  const container = panel.container;
  container.innerHTML = '';

  if (panel.side === 'remote' && !connected) {
    container.appendChild(createEmptyMessage('Sin conexión. Conéctate a un servidor desde el panel izquierdo.'));
    return;
  }

  const header = document.createElement('div');
  header.className = 'file-header';
  for (const [label, className] of [
    ['Nombre', 'file-name'],
    ['Tamaño', 'file-size'],
    ['Modificado', 'file-date'],
  ]) {
    const cell = document.createElement('span');
    cell.className = className;
    cell.textContent = label;
    header.appendChild(cell);
  }
  container.appendChild(header);

  const entries = visibleEntries(panel);
  if (entries.length === 0) {
    container.appendChild(
      createEmptyMessage(panel.entries.length === 0 ? 'Carpeta vacía' : 'Ningún elemento coincide con el filtro')
    );
    return;
  }

  for (const entry of entries) {
    container.appendChild(createFileElement(panel, entry));
  }
}

function createEmptyMessage(text) {
  const empty = document.createElement('div');
  empty.className = 'empty-message';
  empty.textContent = text;
  return empty;
}

// Función para crear elemento de archivo
function createFileElement(panel, entry) {
  const fileElement = document.createElement('div');
  fileElement.className = 'file-item';
  fileElement.dataset.name = entry.name;
  fileElement.draggable = true;
  if (panel.selected.has(entry.name)) {
    fileElement.classList.add('selected');
  }

  // Nombre con icono
  const nameElement = document.createElement('span');
  nameElement.className = 'file-name';
  const iconElement = document.createElement('span');
  // En el servidor no se sabe a qué apunta un enlace hasta abrirlo
  const remoteLink = panel.side === 'remote' && entry.isLink;
  iconElement.className = entry.isDirectory ? 'file-icon directory-icon' : 'file-icon';
  iconElement.textContent = remoteLink ? '🔗' : entry.isDirectory ? '📁' : '📄';
  nameElement.appendChild(iconElement);
  const label = document.createElement('span');
  label.className = 'file-label';
  label.textContent = entry.name;
  nameElement.appendChild(label);
  nameElement.title = entry.isLink ? `${entry.name} (enlace)` : entry.name;
  fileElement.appendChild(nameElement);

  // Tamaño
  const sizeElement = document.createElement('span');
  sizeElement.className = 'file-size';
  sizeElement.textContent = entry.isDirectory || entry.size === null ? '' : formatFileSize(entry.size);
  fileElement.appendChild(sizeElement);

  // Fecha de modificación
  const dateElement = document.createElement('span');
  dateElement.className = 'file-date';
  dateElement.textContent = formatDate(entry);
  fileElement.appendChild(dateElement);

  return fileElement;
}

function entryFromElement(panel, element) {
  const row = element.closest('.file-item');
  return row ? panel.entries.find(entry => entry.name === row.dataset.name) : null;
}

function selectedEntries(panel) {
  return visibleEntries(panel).filter(entry => panel.selected.has(entry.name));
}

// Clic: seleccionar · Ctrl/Cmd+clic: añadir o quitar · Mayús+clic: rango · doble clic: abrir/transferir
function setupPanelEvents(panel) {
  const container = panel.container;

  container.addEventListener('focus', () => (activeSide = panel.side));
  container.addEventListener('mousedown', () => (activeSide = panel.side));

  container.addEventListener('click', e => {
    const entry = entryFromElement(panel, e.target);
    if (!entry) {
      if (!e.ctrlKey && !e.metaKey) {
        setSelection(panel, []);
      }
      return;
    }
    if (e.shiftKey && panel.anchor) {
      const names = visibleEntries(panel).map(item => item.name);
      const from = names.indexOf(panel.anchor);
      const to = names.indexOf(entry.name);
      if (from !== -1) {
        const range = names.slice(Math.min(from, to), Math.max(from, to) + 1);
        setSelection(panel, e.ctrlKey || e.metaKey ? [...panel.selected, ...range] : range, panel.anchor);
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const names = new Set(panel.selected);
      if (names.has(entry.name)) {
        names.delete(entry.name);
      } else {
        names.add(entry.name);
      }
      setSelection(panel, [...names], entry.name);
      return;
    }
    setSelection(panel, [entry.name], entry.name);
  });

  container.addEventListener('dblclick', e => {
    const entry = entryFromElement(panel, e.target);
    if (entry) {
      setSelection(panel, [entry.name], entry.name);
      openEntries(panel, [entry]);
    }
  });

  container.addEventListener('keydown', e => handlePanelKey(panel, e));

  container.addEventListener('contextmenu', e => {
    e.preventDefault();
    activeSide = panel.side;
    container.focus();
    const entry = entryFromElement(panel, e.target);
    // Clic derecho sobre un elemento no seleccionado: pasa a ser la selección
    if (entry && !panel.selected.has(entry.name)) {
      setSelection(panel, [entry.name], entry.name);
    } else if (!entry) {
      setSelection(panel, []);
    }
    showContextMenu(panel, e.clientX, e.clientY);
  });

  panel.filterInput.addEventListener('input', () => {
    panel.filter = panel.filterInput.value;
    renderPanel(panel);
  });

  // Arrastrar: desde un panel al otro, o archivos del sistema al panel remoto
  container.addEventListener('dragstart', e => {
    const entry = entryFromElement(panel, e.target);
    if (!entry) {
      e.preventDefault();
      return;
    }
    if (!panel.selected.has(entry.name)) {
      setSelection(panel, [entry.name], entry.name);
    }
    dragSource = { side: panel.side, entries: selectedEntries(panel) };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', dragSource.entries.map(item => item.name).join('\n'));
  });
  container.addEventListener('dragend', () => {
    dragSource = null;
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  });
  container.addEventListener('dragover', e => {
    if (!canDropOn(panel, e)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    container.classList.add('drop-target');
  });
  container.addEventListener('dragleave', e => {
    if (!container.contains(e.relatedTarget)) {
      container.classList.remove('drop-target');
    }
  });
  container.addEventListener('drop', e => {
    container.classList.remove('drop-target');
    if (!canDropOn(panel, e)) {
      return;
    }
    e.preventDefault();
    if (dragSource) {
      transferEntries(otherPanel(panel), dragSource.entries);
      dragSource = null;
    } else {
      const paths = [...e.dataTransfer.files].map(file => api.getPathForFile(file)).filter(Boolean);
      uploadPaths(paths);
    }
  });
}

function canDropOn(panel, e) {
  if (dragSource) {
    return dragSource.side !== panel.side;
  }
  return panel.side === 'remote' && connected && e.dataTransfer.types.includes('Files');
}

function setSelection(panel, names, anchor = null) {
  panel.selected = new Set(names);
  if (anchor !== null) {
    panel.anchor = anchor;
  }
  for (const row of panel.container.querySelectorAll('.file-item')) {
    row.classList.toggle('selected', panel.selected.has(row.dataset.name));
  }
}

// Atajos: Intro abrir/transferir · Retroceso carpeta padre · Ctrl+A todo · flechas mover · Esc deseleccionar
function handlePanelKey(panel, e) {
  const entries = visibleEntries(panel);
  const ctrl = e.ctrlKey || e.metaKey;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (entries.length === 0) {
      return;
    }
    const names = entries.map(entry => entry.name);
    const current = names.indexOf(panel.anchor);
    let next;
    if (current === -1) {
      next = e.key === 'ArrowDown' ? 0 : names.length - 1;
    } else {
      next = Math.max(0, Math.min(names.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1)));
    }
    setSelection(panel, e.shiftKey ? [...panel.selected, names[next]] : [names[next]], names[next]);
    panel.container.querySelector(`.file-item[data-name="${CSS.escape(names[next])}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    openEntries(panel, selectedEntries(panel));
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    if (panel.side === 'local') {
      navigateLocalParent();
    } else {
      navigateRemoteParent();
    }
  } else if (ctrl && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    setSelection(
      panel,
      entries.map(entry => entry.name)
    );
  } else if (e.key === 'F2') {
    e.preventDefault();
    const selection = selectedEntries(panel);
    if (selection.length === 1) {
      renameEntry(panel, selection[0]);
    }
  } else if (e.key === 'Delete') {
    e.preventDefault();
    deleteEntries(panel, selectedEntries(panel));
  } else if (e.key === 'Escape') {
    setSelection(panel, []);
  }
}

// Abrir: una sola carpeta → entrar en ella; archivos o varios elementos → transferirlos al otro panel
async function openEntries(panel, entries) {
  if (entries.length === 0) {
    return;
  }
  if (entries.length === 1) {
    const [entry] = entries;
    let isDirectory = entry.isDirectory;
    if (panel.side === 'remote' && entry.isLink) {
      const result = await api.ftpIsDirectory(joinRemote(panel.path, entry.name));
      isDirectory = result.success && result.data;
    }
    if (isDirectory) {
      if (panel.side === 'local') {
        loadLocalFiles(entry.path);
      } else {
        loadRemoteFiles(joinRemote(panel.path, entry.name));
      }
      return;
    }
  }
  transferEntries(panel, entries);
}

function joinRemote(directory, name) {
  return directory.endsWith('/') ? `${directory}${name}` : `${directory}/${name}`;
}

// Función para navegar al directorio padre local
function navigateLocalParent() {
  const currentLocalPath = panels.local.path;
  if (!currentLocalPath) {
    return;
  }

  const pathParts = currentLocalPath.split(/[/\\]/).filter(part => part !== '');
  const isPosix = currentLocalPath.startsWith('/');

  // Ya en la raíz: "/" en macOS/Linux o "C:/" en Windows
  if (pathParts.length === 0 || (!isPosix && pathParts.length === 1)) {
    return;
  }

  pathParts.pop();

  let parentPath;
  if (isPosix) {
    parentPath = '/' + pathParts.join('/');
  } else {
    // En Windows, si queda solo la letra de unidad (ej: "C:"), añadir "/" para leer la raíz
    parentPath = pathParts.length === 1 ? pathParts[0] + '/' : pathParts.join('/');
  }

  loadLocalFiles(parentPath);
}

// Función para navegar al directorio padre remoto
function navigateRemoteParent() {
  if (!connected) {
    showStatus('No hay conexión FTP activa', true);
    return;
  }

  const currentRemotePath = panels.remote.path;
  if (currentRemotePath === '/' || currentRemotePath === '') {
    return; // Ya estamos en la raíz
  }

  const pathParts = currentRemotePath.split('/').filter(part => part !== '');
  pathParts.pop(); // Eliminar el último directorio

  const parentPath = pathParts.length === 0 ? '/' : '/' + pathParts.join('/');
  loadRemoteFiles(parentPath);
}

// TRANSFERENCIAS

const transferQueue = [];
let transferring = false;
let transferStats = null;

// Transfiere elementos de un panel a la carpeta actual del otro
async function transferEntries(fromPanel, entries) {
  if (!connected) {
    showStatus('No hay conexión FTP activa', true);
    return;
  }
  const upload = fromPanel.side === 'local';
  const jobs = [];
  for (const entry of entries) {
    let isDirectory = entry.isDirectory;
    if (!upload && entry.isLink) {
      const result = await api.ftpIsDirectory(joinRemote(fromPanel.path, entry.name));
      isDirectory = result.success && result.data;
    }
    jobs.push({
      direction: upload ? 'upload' : 'download',
      source: upload ? entry.path : joinRemote(fromPanel.path, entry.name),
      name: entry.name,
      isDirectory,
      size: entry.size,
    });
  }
  enqueueTransfers(jobs, otherPanel(fromPanel));
}

// Archivos y carpetas soltados desde el Explorador/Finder sobre el panel remoto
function uploadPaths(paths) {
  if (paths.length === 0) {
    return;
  }
  const jobs = paths.map(localPath => ({
    direction: 'upload',
    source: localPath,
    name: localPath.split(/[/\\]/).filter(Boolean).pop(),
  }));
  enqueueTransfers(jobs, panels.remote);
}

async function enqueueTransfers(jobs, targetPanel) {
  if (jobs.length === 0) {
    return;
  }
  // Windows y macOS no distinguen mayúsculas en los nombres locales
  const normalize = name => (targetPanel.side === 'local' ? name.toLowerCase() : name);
  const existingNames = new Set(targetPanel.entries.map(entry => normalize(entry.name)));
  const existing = jobs.filter(job => existingNames.has(normalize(job.name)));

  if (existing.length > 0) {
    const buttons = [{ label: 'Sobrescribir', value: 'overwrite', primary: true }];
    if (existing.length < jobs.length) {
      buttons.push({ label: 'Omitir existentes', value: 'skip' });
    }
    buttons.push({ label: 'Cancelar', value: null });
    const answer = await askConfirm({
      title: existing.length === 1 ? 'El elemento ya existe' : 'Algunos elementos ya existen',
      message:
        existing.length === 1
          ? `«${existing[0].name}» ya existe en ${targetPanel.path}. ¿Quieres sobrescribirlo?`
          : `${existing.length} elementos ya existen en ${targetPanel.path}:`,
      list: existing.length === 1 ? [] : existing.map(job => job.name),
      note: existing.some(job => job.isDirectory !== false)
        ? 'Las carpetas se combinan: se sobrescriben los archivos con el mismo nombre.'
        : '',
      buttons,
    });
    if (!answer) {
      showStatus('Transferencia cancelada');
      return;
    }
    if (answer === 'skip') {
      jobs = jobs.filter(job => !existing.includes(job));
    }
  }

  for (const job of jobs) {
    transferQueue.push({ ...job, targetDir: targetPanel.path });
  }
  processTransferQueue();
}

async function processTransferQueue() {
  if (transferring) {
    return;
  }
  transferring = true;
  const done = [];
  const failed = [];
  let cancelled = false;

  while (transferQueue.length > 0) {
    const job = transferQueue.shift();
    const upload = job.direction === 'upload';
    transferStats = { job, startedAt: Date.now(), lastBytes: 0, lastTime: Date.now(), speed: 0 };
    showTransferProgress({ name: job.name, index: 0, count: 1, bytes: 0, total: job.size ?? null });

    const result = await api.ftpTransfer(job);
    if (result.cancelled) {
      cancelled = true;
      transferQueue.length = 0;
    } else if (result.success) {
      done.push(job);
    } else {
      failed.push({ job, message: result.message });
    }

    // Recargar el panel de destino si sigue mostrando esa carpeta
    if (upload && connected && panels.remote.path === job.targetDir) {
      await loadRemoteFiles(job.targetDir, { keepSelection: true, quiet: true });
    } else if (!upload && panels.local.path === job.targetDir) {
      await loadLocalFiles(job.targetDir, { keepSelection: true });
    }
  }

  transferring = false;
  transferStats = null;
  transferProgress.hidden = true;
  statusMessage.hidden = false;

  if (cancelled) {
    showStatus('Transferencia cancelada');
  } else if (failed.length > 0) {
    const first = failed[0];
    const verb = first.job.direction === 'upload' ? 'subir' : 'descargar';
    const extra = failed.length > 1 ? ` (y ${failed.length - 1} más)` : '';
    showStatus(`Error al ${verb} ${first.job.name}${extra}: ${first.message.split('\n')[0]}`, true);
  } else if (done.length === 1) {
    const job = done[0];
    const kind = job.isDirectory ? 'Carpeta' : 'Archivo';
    showStatus(`${kind} ${job.name} ${job.direction === 'upload' ? 'subido' : 'descargado'} correctamente`);
  } else if (done.length > 1) {
    const verb = done.every(job => job.direction === 'upload') ? 'subidos' : 'transferidos';
    showStatus(`${done.length} elementos ${verb} correctamente`);
  }
}

function showTransferProgress(progress) {
  // Mientras hay una transferencia, la barra de progreso ocupa el sitio del mensaje de estado
  statusMessage.hidden = true;
  transferProgress.hidden = false;
  updateTransferProgress(progress);
}

// Progreso que envía el proceso principal: { name, index, count, bytes, total }
function updateTransferProgress({ name, index, count, bytes, total }) {
  if (!transferStats) {
    return;
  }
  const { job } = transferStats;
  const now = Date.now();
  // Velocidad media de los últimos ~0,5 s
  if (now - transferStats.lastTime >= 500) {
    transferStats.speed = ((bytes - transferStats.lastBytes) * 1000) / (now - transferStats.lastTime);
    transferStats.lastBytes = bytes;
    transferStats.lastTime = now;
  }

  const verb = job.direction === 'upload' ? 'Subiendo' : 'Descargando';
  let label = `${verb} ${job.isDirectory ? job.name + ' › ' + name : name}`;
  if (count > 1) {
    label += ` (${Math.min(index + 1, count)} de ${count})`;
  }
  if (transferQueue.length > 0) {
    label += ` · ${transferQueue.length} en cola`;
  }
  transferLabel.textContent = label;
  transferLabel.title = label;

  const parts = [];
  if (total) {
    const ratio = Math.min(1, bytes / total);
    transferBar.value = ratio;
    parts.push(`${Math.round(ratio * 100)} %`);
  } else {
    transferBar.removeAttribute('value'); // barra indeterminada
    parts.push(formatFileSize(bytes));
  }
  if (transferStats.speed > 0) {
    parts.push(`${formatFileSize(transferStats.speed)}/s`);
  }
  transferDetail.textContent = parts.join(' · ');
}

async function cancelTransfers() {
  transferQueue.length = 0;
  await api.ftpCancel();
}

// Al conectar o desconectar se descarta la cola y se cancela lo que esté en curso
async function stopTransfers() {
  if (transferring) {
    await cancelTransfers();
  }
}

// MENÚ CONTEXTUAL Y OPERACIONES DE ARCHIVO

const contextMenu = document.getElementById('context-menu');

function showContextMenu(panel, x, y) {
  const selection = selectedEntries(panel);
  const remoteOffline = panel.side === 'remote' && !connected;
  const single = selection.length === 1 ? selection[0] : null;
  const verb = panel.side === 'local' ? 'Subir' : 'Descargar';
  const items = [];

  if (single && single.isDirectory) {
    items.push({ label: 'Abrir', shortcut: 'Intro', action: () => openEntries(panel, [single]) });
  }
  if (selection.length > 0) {
    items.push({
      label: selection.length > 1 ? `${verb} ${selection.length} elementos` : verb,
      shortcut: single && single.isDirectory ? '' : 'Intro',
      disabled: !connected,
      action: () => transferEntries(panel, selection),
    });
    items.push(null);
    items.push({ label: 'Renombrar...', shortcut: 'F2', disabled: !single, action: () => renameEntry(panel, single) });
    items.push({
      label: panel.side === 'local' ? 'Mover a la papelera' : 'Eliminar',
      shortcut: 'Supr',
      action: () => deleteEntries(panel, selection),
    });
    items.push(null);
  }
  items.push({ label: 'Nueva carpeta...', action: () => createFolder(panel) });
  items.push({ label: 'Actualizar', shortcut: 'F5', action: () => refreshPanel(panel) });

  contextMenu.innerHTML = '';
  for (const item of items) {
    if (item === null) {
      const separator = document.createElement('div');
      separator.className = 'menu-separator';
      contextMenu.appendChild(separator);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'menu-item';
    if (item.disabled || remoteOffline) {
      el.classList.add('disabled');
    }
    const label = document.createElement('span');
    label.textContent = item.label;
    el.appendChild(label);
    if (item.shortcut) {
      const shortcut = document.createElement('span');
      shortcut.className = 'shortcut';
      shortcut.textContent = item.shortcut;
      el.appendChild(shortcut);
    }
    el.addEventListener('click', () => {
      hideContextMenu();
      item.action();
    });
    contextMenu.appendChild(el);
  }

  // Dentro de la ventana aunque se abra cerca de un borde
  contextMenu.hidden = false;
  const { offsetWidth: width, offsetHeight: height } = contextMenu;
  contextMenu.style.left = `${Math.min(x, window.innerWidth - width - 4)}px`;
  contextMenu.style.top = `${Math.min(y, window.innerHeight - height - 4)}px`;
}

function hideContextMenu() {
  contextMenu.hidden = true;
}

document.addEventListener('mousedown', e => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    hideContextMenu();
  }
});
window.addEventListener('blur', hideContextMenu);
window.addEventListener('resize', hideContextMenu);
document.addEventListener('scroll', hideContextMenu, true);

// Nombre válido para un archivo o carpeta (sin separadores de ruta)
function validateName(name, panel) {
  if (!name) {
    return 'El nombre no puede estar vacío';
  }
  if (name === '.' || name === '..' || /[/\\]/.test(name)) {
    return 'El nombre no puede contener / ni \\';
  }
  if (panel.side === 'local' && /[<>:"|?*]/.test(name) && navigator.userAgent.includes('Windows')) {
    return 'El nombre no puede contener < > : " | ? *';
  }
  return null;
}

async function renameEntry(panel, entry) {
  if (!entry || (panel.side === 'remote' && !connected)) {
    return;
  }
  const newName = await askName({
    title: 'Renombrar',
    message: `Nuevo nombre para «${entry.name}»:`,
    value: entry.name,
    acceptLabel: 'Renombrar',
    selectBaseName: !entry.isDirectory,
  });
  if (newName === null || newName === entry.name) {
    return;
  }
  const error = validateName(newName, panel);
  if (error) {
    showStatus(error, true);
    return;
  }
  if (panel.side === 'remote' && panel.entries.some(item => item.name === newName)) {
    showStatus(`Ya existe un elemento llamado ${newName}`, true);
    return;
  }

  const result =
    panel.side === 'local'
      ? await api.localRename(entry.path, newName)
      : await api.ftpRename(joinRemote(panel.path, entry.name), joinRemote(panel.path, newName));
  if (!result.success) {
    showStatus(`No se ha podido renombrar: ${result.message}`, true);
    return;
  }
  panel.selected = new Set([newName]);
  panel.anchor = newName;
  await refreshPanel(panel);
  showStatus(`${entry.name} renombrado a ${newName}`);
}

async function deleteEntries(panel, entries) {
  if (entries.length === 0 || (panel.side === 'remote' && !connected)) {
    return;
  }
  const local = panel.side === 'local';
  const what = entries.length === 1 ? `«${entries[0].name}»` : `${entries.length} elementos`;
  const answer = await askConfirm({
    title: local ? 'Mover a la papelera' : 'Eliminar del servidor',
    message: local
      ? `¿Mover ${what} a la papelera?`
      : `¿Eliminar ${what} del servidor? Esta acción no se puede deshacer.`,
    list: entries.length > 1 ? entries.map(entry => entry.name) : [],
    note: !local && entries.some(entry => entry.isDirectory) ? 'Las carpetas se eliminan con todo su contenido.' : '',
    buttons: [
      { label: local ? 'Mover a la papelera' : 'Eliminar', value: 'ok', danger: true },
      { label: 'Cancelar', value: null },
    ],
  });
  if (answer !== 'ok') {
    return;
  }

  showStatus(local ? 'Moviendo a la papelera...' : 'Eliminando...');
  const result = local
    ? await api.localTrash(entries.map(entry => entry.path))
    : await api.ftpDelete(
        entries.map(entry => ({ path: joinRemote(panel.path, entry.name), isDirectory: entry.isDirectory }))
      );
  await refreshPanel(panel);
  if (result.success) {
    const plural = entries.length > 1 ? 's' : '';
    showStatus(local ? `${what} movido${plural} a la papelera` : `${what} eliminado${plural} del servidor`);
  } else {
    showStatus(`No se ha podido eliminar: ${result.message}`, true);
  }
}

async function createFolder(panel) {
  if (panel.side === 'remote' && !connected) {
    return;
  }
  const name = await askName({
    title: 'Nueva carpeta',
    message: `Crear una carpeta en ${panel.path}:`,
    value: 'Nueva carpeta',
    acceptLabel: 'Crear',
  });
  if (name === null) {
    return;
  }
  const error = validateName(name, panel);
  if (error) {
    showStatus(error, true);
    return;
  }
  const exists = panel.entries.some(entry =>
    panel.side === 'local' ? entry.name.toLowerCase() === name.toLowerCase() : entry.name === name
  );
  if (exists) {
    showStatus(`Ya existe un elemento llamado ${name}`, true);
    return;
  }

  const result =
    panel.side === 'local' ? await api.localMkdir(panel.path, name) : await api.ftpMkdir(joinRemote(panel.path, name));
  if (!result.success) {
    showStatus(`No se ha podido crear la carpeta: ${result.message}`, true);
    return;
  }
  panel.selected = new Set([name]);
  panel.anchor = name;
  await refreshPanel(panel);
  showStatus(`Carpeta ${name} creada`);
}

// DIÁLOGO MODAL

const modal = document.getElementById('modal');
const modalForm = document.getElementById('modal-form');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalList = document.getElementById('modal-list');
const modalInput = document.getElementById('modal-input');
const modalButtons = document.getElementById('modal-buttons');
let modalResolve = null;

// Muestra un diálogo propio; resuelve con el "value" del botón pulsado (null si se cierra con Esc)
function openModal({ title, message = '', list = [], note = '', input = null, buttons }) {
  if (modalResolve) {
    modalResolve(null);
  }
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalMessage.hidden = !message;

  modalList.innerHTML = '';
  const shown = list.slice(0, 8);
  for (const item of shown) {
    const li = document.createElement('li');
    li.textContent = item;
    modalList.appendChild(li);
  }
  if (list.length > shown.length) {
    const li = document.createElement('li');
    li.textContent = `y ${list.length - shown.length} más`;
    li.className = 'more';
    modalList.appendChild(li);
  }
  modalList.hidden = list.length === 0;
  if (note) {
    const li = document.createElement('li');
    li.className = 'note';
    li.textContent = note;
    if (modalList.hidden) {
      modalList.innerHTML = '';
      modalList.hidden = false;
    }
    modalList.appendChild(li);
  }

  modalInput.hidden = input === null;
  modalInput.value = input?.value ?? '';

  modalButtons.innerHTML = '';
  for (const button of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = button.label;
    if (button.primary) {
      el.classList.add('primary-btn');
      el.dataset.primary = 'true';
    }
    if (button.danger) {
      el.classList.add('danger-btn');
      el.dataset.primary = 'true';
    }
    el.addEventListener('click', () => closeModal(button.value));
    modalButtons.appendChild(el);
  }

  return new Promise(resolve => {
    modalResolve = resolve;
    modal.showModal();
    if (input !== null) {
      modalInput.focus();
      // Al renombrar, seleccionar el nombre sin la extensión
      const dot = input.selectBaseName ? modalInput.value.lastIndexOf('.') : -1;
      modalInput.setSelectionRange(0, dot > 0 ? dot : modalInput.value.length);
    } else {
      modalButtons.querySelector('[data-primary]')?.focus();
    }
  });
}

function closeModal(value) {
  const resolve = modalResolve;
  modalResolve = null;
  if (modal.open) {
    modal.close();
  }
  if (resolve) {
    resolve(value === null ? null : { value, input: modalInput.value });
  }
}

// Intro dentro del diálogo = botón principal
modalForm.addEventListener('submit', e => {
  e.preventDefault();
  modalButtons.querySelector('[data-primary]')?.click();
});
modal.addEventListener('cancel', e => {
  e.preventDefault();
  closeModal(null);
});

async function askConfirm(options) {
  const result = await openModal(options);
  return result ? result.value : null;
}

// Pide un nombre; null si se cancela
async function askName({ title, message, value, acceptLabel, selectBaseName = false }) {
  const result = await openModal({
    title,
    message,
    input: { value, selectBaseName },
    buttons: [
      { label: acceptLabel, value: 'ok', primary: true },
      { label: 'Cancelar', value: null },
    ],
  });
  return result ? result.input.trim() : null;
}

// UTILIDADES

// Función para formatear tamaño de archivo
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const dateTimeFormat = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatDate(entry) {
  if (typeof entry.modifiedAt !== 'number') {
    return entry.rawDate || '';
  }
  return (entry.dateOnly ? dateFormat : dateTimeFormat).format(new Date(entry.modifiedAt));
}

// Función para mostrar mensajes de estado
let statusTimer = null;
function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.title = message;
  statusMessage.classList.toggle('error', isError);
  clearTimeout(statusTimer);

  if (isError) {
    console.error(message);
    // Quitar el resaltado tras 5 segundos (solo de este mensaje, no de uno posterior)
    statusTimer = setTimeout(() => statusMessage.classList.remove('error'), 5000);
  } else {
    console.log(message);
  }
}
