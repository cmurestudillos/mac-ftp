// Variables globales
let currentLocalPath = '';
let currentRemotePath = '/';
let currentConnection = null;

// Elementos DOM
const connectBtn = document.getElementById('connect-btn');
const saveBtn = document.getElementById('save-btn');
const browseBtn = document.getElementById('browse-btn');
const localParentBtn = document.getElementById('local-parent-btn');
const remoteParentBtn = document.getElementById('remote-parent-btn');
const connectionsList = document.getElementById('connections-list');
const localPathInput = document.getElementById('local-path');
const remotePathInput = document.getElementById('remote-path');
const localFilesContainer = document.getElementById('local-files');
const remoteFilesContainer = document.getElementById('remote-files');
const statusMessage = document.getElementById('status-message');

// Campos de formulario de conexión
const connectionNameInput = document.getElementById('connection-name');
const hostInput = document.getElementById('host');
const portInput = document.getElementById('port');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const secureCheckbox = document.getElementById('secure');

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  // Verificar que la API de Electron está disponible
  if (!window.electronAPI) {
    console.error('Error: electronAPI no está disponible');
    showStatus('Error: API de Electron no disponible. Comprueba la consola para más detalles.', true);
    return;
  }

  console.log('API de Electron disponible:', Object.keys(window.electronAPI));

  // Cargar conexiones guardadas
  try {
    loadSavedConnections();
  } catch (error) {
    console.error('Error al cargar conexiones:', error);
  }

  // Seleccionar directorio local por defecto (documentos)
  try {
    const defaultDir = await window.electronAPI.selectDirectory();
    if (defaultDir) {
      currentLocalPath = defaultDir;
      localPathInput.value = currentLocalPath;
      loadLocalFiles(currentLocalPath);
    }
  } catch (error) {
    console.error('Error al seleccionar directorio inicial:', error);
    showStatus('Error al seleccionar directorio inicial', true);
  }
});

// Manejadores de eventos
connectBtn.addEventListener('click', connectToFTP);
saveBtn.addEventListener('click', saveConnection);
browseBtn.addEventListener('click', browseLocalDirectory);
localParentBtn.addEventListener('click', navigateLocalParent);
remoteParentBtn.addEventListener('click', navigateRemoteParent);

// Función para cargar conexiones guardadas
async function loadSavedConnections() {
  try {
    const connections = await window.electronAPI.getConnections();

    // Limpiar lista existente
    connectionsList.innerHTML = '';

    // Agregar cada conexión a la lista
    connections.forEach(connection => {
      const li = document.createElement('li');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = connection.name;
      li.appendChild(nameSpan);

      const btnContainer = document.createElement('div');

      const connectBtn = document.createElement('button');
      connectBtn.textContent = '⚡';
      connectBtn.classList.add('mini-btn-icon');
      connectBtn.addEventListener('click', e => {
        e.stopPropagation();
        fillConnectionForm(connection);
        connectToFTP();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑️';
      deleteBtn.classList.add('mini-btn-icon');
      deleteBtn.addEventListener('click', async e => {
        e.stopPropagation();
        await window.electronAPI.deleteConnection(connection.name);
        loadSavedConnections();
      });

      btnContainer.appendChild(connectBtn);
      btnContainer.appendChild(deleteBtn);
      li.appendChild(btnContainer);

      // Llenar el formulario al hacer clic en la conexión
      li.addEventListener('click', () => {
        fillConnectionForm(connection);
      });

      connectionsList.appendChild(li);
    });
  } catch (error) {
    showStatus('Error al cargar conexiones guardadas', true);
  }
}

// Función para llenar el formulario con una conexión guardada
function fillConnectionForm(connection) {
  connectionNameInput.value = connection.name;
  hostInput.value = connection.host;
  portInput.value = connection.port;
  usernameInput.value = connection.user;
  passwordInput.value = connection.password;
  secureCheckbox.checked = connection.secure;
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
    await window.electronAPI.saveConnection(connection);
    showStatus('Conexión guardada correctamente');
    loadSavedConnections();
  } catch (error) {
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
    host: hostInput.value,
    port: parseInt(portInput.value) || 21,
    user: usernameInput.value,
    password: passwordInput.value,
    secure: secureCheckbox.checked,
  };

  showStatus('Conectando...');

  try {
    // Asegúrate de que la función está disponible
    if (!window.electronAPI || typeof window.electronAPI.ftpConnect !== 'function') {
      console.error('La función ftpConnect no está disponible en electronAPI', window.electronAPI);
      showStatus('Error: API de conexión FTP no disponible', true);
      return;
    }

    const result = await window.electronAPI.ftpConnect(config);

    if (result.success) {
      currentConnection = config;
      showStatus('Conexión exitosa');

      // Reiniciar path remoto
      currentRemotePath = '/';
      remotePathInput.value = currentRemotePath;

      // Cargar archivos remotos
      loadRemoteFiles(currentRemotePath);
    } else {
      showStatus(`Error de conexión: ${result.message}`, true);
    }
  } catch (error) {
    console.error('Error completo:', error);
    showStatus(`Error de conexión: ${error.message}`, true);
  }
}

// Función para explorar directorios locales
async function browseLocalDirectory() {
  try {
    const selectedDir = await window.electronAPI.selectDirectory();

    if (selectedDir) {
      currentLocalPath = selectedDir;
      localPathInput.value = currentLocalPath;
      loadLocalFiles(currentLocalPath);
    }
  } catch (error) {
    showStatus('Error al seleccionar directorio', true);
  }
}

// Función para cargar archivos locales
async function loadLocalFiles(directory) {
  try {
    const files = await window.electronAPI.listLocalDirectory(directory);

    // Limpiar contenedor
    localFilesContainer.innerHTML = '';

    // Mostrar archivos
    files.forEach(file => {
      const fileElement = createFileElement(file, true);
      localFilesContainer.appendChild(fileElement);
    });

    // Actualizar ruta actual
    localPathInput.value = directory;
  } catch (error) {
    showStatus(`Error al cargar archivos locales: ${error.message}`, true);
  }
}

// Función para cargar archivos remotos
async function loadRemoteFiles(remotePath) {
  if (!currentConnection) {
    showStatus('No hay conexión FTP activa', true);
    return;
  }

  try {
    showStatus('Cargando archivos remotos...');

    const result = await window.electronAPI.ftpListDirectory(remotePath);

    if (!result.success) {
      showStatus(`Error: ${result.message}`, true);
      return;
    }

    // Limpiar contenedor
    remoteFilesContainer.innerHTML = '';

    // Mostrar archivos
    result.data.forEach(file => {
      const fileElement = createFileElement(file, false);
      remoteFilesContainer.appendChild(fileElement);
    });

    // Actualizar ruta actual
    remotePathInput.value = remotePath;
    currentRemotePath = remotePath;

    showStatus('Archivos remotos cargados');
  } catch (error) {
    showStatus(`Error al cargar archivos remotos: ${error.message}`, true);
  }
}

// Función para crear elemento de archivo
function createFileElement(file, isLocal) {
  const fileElement = document.createElement('div');
  fileElement.className = 'file-item';

  // Icono
  const iconElement = document.createElement('span');
  iconElement.className = file.isDirectory ? 'file-icon directory-icon' : 'file-icon file-icon';
  iconElement.textContent = file.isDirectory ? '📁' : '📄';
  fileElement.appendChild(iconElement);

  // Nombre
  const nameElement = document.createElement('span');
  nameElement.textContent = file.name;
  fileElement.appendChild(nameElement);

  // Manejador de eventos para navegación o transferencia
  fileElement.addEventListener('click', () => {
    if (file.isDirectory) {
      // Navegación
      if (isLocal) {
        currentLocalPath = file.path;
        loadLocalFiles(currentLocalPath);
      } else {
        const newPath = currentRemotePath === '/' ? `/${file.name}` : `${currentRemotePath}/${file.name}`;

        loadRemoteFiles(newPath);
      }
    } else {
      // Transferencia de archivos
      if (isLocal) {
        // Subir archivo
        if (currentConnection) {
          uploadFile(file.path, file.name);
        } else {
          showStatus('No hay conexión FTP activa', true);
        }
      } else {
        // Descargar archivo
        if (currentLocalPath) {
          downloadFile(file.name);
        } else {
          showStatus('No hay directorio local seleccionado', true);
        }
      }
    }
  });

  return fileElement;
}

// Función para navegar al directorio padre local
function navigateLocalParent() {
  if (!currentLocalPath) return;

  const pathParts = currentLocalPath.split(/[/\\]/);
  // Eliminar el último elemento para obtener el directorio padre
  pathParts.pop();

  // Verificar si queda algo en la ruta (para evitar rutas vacías)
  if (pathParts.length > 0) {
    const parentPath = pathParts.join('/');
    currentLocalPath = parentPath;
    loadLocalFiles(parentPath);
  }
}

// Función para navegar al directorio padre remoto
function navigateRemoteParent() {
  if (!currentConnection) {
    showStatus('No hay conexión FTP activa', true);
    return;
  }

  if (currentRemotePath === '/' || currentRemotePath === '') {
    return; // Ya estamos en la raíz
  }

  const pathParts = currentRemotePath.split('/').filter(part => part !== '');
  pathParts.pop(); // Eliminar el último directorio

  const parentPath = pathParts.length === 0 ? '/' : '/' + pathParts.join('/');
  loadRemoteFiles(parentPath);
}

// Función para subir un archivo
async function uploadFile(localFilePath, fileName) {
  if (!currentConnection) {
    showStatus('No hay conexión FTP activa', true);
    return;
  }

  const remotePath = currentRemotePath === '/' ? `/${fileName}` : `${currentRemotePath}/${fileName}`;

  showStatus(`Subiendo ${fileName}...`);

  try {
    const result = await window.electronAPI.ftpUploadFile(localFilePath, remotePath);

    if (result.success) {
      showStatus(`Archivo ${fileName} subido correctamente`);
      // Recargar directorio remoto para mostrar el nuevo archivo
      loadRemoteFiles(currentRemotePath);
    } else {
      showStatus(`Error al subir archivo: ${result.message}`, true);
    }
  } catch (error) {
    showStatus(`Error al subir archivo: ${error.message}`, true);
  }
}

// Función para descargar un archivo
async function downloadFile(fileName) {
  if (!currentConnection) {
    showStatus('No hay conexión FTP activa', true);
    return;
  }

  if (!currentLocalPath) {
    showStatus('No hay directorio local seleccionado', true);
    return;
  }

  const remotePath = currentRemotePath === '/' ? `/${fileName}` : `${currentRemotePath}/${fileName}`;

  const localPath = `${currentLocalPath}/${fileName}`;

  showStatus(`Descargando ${fileName}...`);

  try {
    const result = await window.electronAPI.ftpDownloadFile(remotePath, localPath);

    if (result.success) {
      showStatus(`Archivo ${fileName} descargado correctamente`);
      // Recargar directorio local para mostrar el nuevo archivo
      loadLocalFiles(currentLocalPath);
    } else {
      showStatus(`Error al descargar archivo: ${result.message}`, true);
    }
  } catch (error) {
    showStatus(`Error al descargar archivo: ${error.message}`, true);
  }
}

// Función para mostrar mensajes de estado
function showStatus(message, isError = false) {
  statusMessage.textContent = message;

  if (isError) {
    statusMessage.classList.add('error');
    console.error(message);
  } else {
    statusMessage.classList.remove('error');
    console.log(message);
  }

  // Restaurar después de 5 segundos si es un error
  if (isError) {
    setTimeout(() => {
      statusMessage.classList.remove('error');
    }, 5000);
  }
}
