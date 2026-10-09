const { app, BrowserWindow, ipcMain, dialog, safeStorage, screen, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { Client } = require('basic-ftp');

// Configuración para almacenar conexiones guardadas
const store = new Store();

let mainWindow;

function createWindow() {
  // Tamaño inicial ajustado a la pantalla (en portátiles de 1366×768 no cabía una ventana fija de 1800×1169)
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, width),
    height: Math.min(900, height),
    minWidth: 900,
    minHeight: 560,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e2329' : '#f5f5f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');

  // La ventana nunca debe navegar fuera de index.html (p. ej. al soltar un archivo fuera de los paneles)
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Abre las herramientas de desarrollo (importante para depuración)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    closeFtp();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  migratePlainPasswords();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// CONEXIONES GUARDADAS (contraseñas cifradas con safeStorage)

function canEncrypt() {
  if (!safeStorage.isEncryptionAvailable()) {
    return false;
  }
  // En Linux sin llavero (gnome-keyring, kwallet) Electron usa una clave fija conocida: equivale a texto plano
  return !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text');
}

// Devuelve la conexión lista para guardar: la contraseña cifrada o, si no se puede cifrar, sin contraseña
function encodeConnection(connection) {
  const { password, ...rest } = connection;
  delete rest.passwordEnc;
  if (!password) {
    return { stored: rest, passwordSaved: true };
  }
  if (!canEncrypt()) {
    return { stored: rest, passwordSaved: false };
  }
  return {
    stored: { ...rest, passwordEnc: safeStorage.encryptString(password).toString('base64') },
    passwordSaved: true,
  };
}

function decodeConnection(connection) {
  const { passwordEnc, ...rest } = connection;
  if (passwordEnc) {
    try {
      return { ...rest, password: safeStorage.decryptString(Buffer.from(passwordEnc, 'base64')) };
    } catch {
      return { ...rest, password: '' };
    }
  }
  // Conexiones guardadas por versiones anteriores (contraseña en texto plano)
  return { ...rest, password: rest.password || '' };
}

// Las versiones anteriores guardaban las contraseñas en texto plano: se cifran al arrancar si es posible
function migratePlainPasswords() {
  const connections = store.get('connections', []);
  if (!canEncrypt() || !connections.some(conn => conn.password)) {
    return;
  }
  store.set(
    'connections',
    connections.map(conn => (conn.password ? encodeConnection(conn).stored : conn))
  );
}

function getConnections() {
  return store.get('connections', []).map(decodeConnection);
}

// Manejadores de IPC para la comunicación entre el proceso principal y el renderizador

ipcMain.handle('get-app-version', () => app.getVersion());

// Obtener directorio home del usuario
ipcMain.handle('get-home-directory', () => {
  return app.getPath('home');
});

// Seleccionar directorio local
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

// Guardar conexiones FTP
ipcMain.handle('save-connection', (event, connection) => {
  const connections = store.get('connections', []);
  const { stored, passwordSaved } = encodeConnection(connection);

  // Agregar nueva conexión o actualizar existente
  const index = connections.findIndex(conn => conn.name === connection.name);

  if (index !== -1) {
    connections[index] = stored;
  } else {
    connections.push(stored);
  }

  store.set('connections', connections);
  return { connections: getConnections(), passwordSaved };
});

// Obtener conexiones guardadas
ipcMain.handle('get-connections', () => {
  return getConnections();
});

// Eliminar conexión
ipcMain.handle('delete-connection', (event, name) => {
  const connections = store.get('connections', []);
  store.set(
    'connections',
    connections.filter(conn => conn.name !== name)
  );
  return getConnections();
});

// Listar directorio local
ipcMain.handle('list-local-directory', async (event, directory) => {
  try {
    const files = await fs.promises.readdir(directory, { withFileTypes: true });

    const data = await Promise.all(
      files.map(async file => {
        const filePath = path.join(directory, file.name);
        // stat sigue los enlaces simbólicos (y junctions de Windows): así se sabe si apuntan a una carpeta
        const stats = await fs.promises.stat(filePath).catch(() => null);
        return {
          name: file.name,
          path: filePath,
          isDirectory: stats ? stats.isDirectory() : file.isDirectory(),
          isLink: file.isSymbolicLink(),
          size: stats && stats.isFile() ? stats.size : null,
          modifiedAt: stats ? stats.mtimeMs : null,
        };
      })
    );
    return { success: true, path: directory, data };
  } catch (error) {
    console.error('Error al listar directorio local:', error);
    return { success: false, message: describeFsError(error) };
  }
});

function describeFsError(error) {
  const reasons = {
    EPERM: 'permiso denegado',
    EACCES: 'permiso denegado',
    ENOENT: 'no existe',
    ENOTDIR: 'no es una carpeta',
    EBUSY: 'el archivo está en uso',
    EEXIST: 'ya existe',
  };
  return reasons[error.code] ? `${reasons[error.code]} (${error.path || error.code})` : error.message;
}

// FUNCIONES FTP EN EL PROCESO PRINCIPAL

let ftpClient = null;
let ftpConfig = null;
// Se incrementa al conectar o desconectar: las operaciones encoladas de una sesión anterior no se ejecutan
let ftpSession = 0;

// basic-ftp no admite dos operaciones a la vez: si se lanza una mientras otra sigue en curso, cierra la conexión.
// Todas las operaciones FTP pasan por esta cola para ejecutarse de una en una (p. ej. dos clics seguidos).
let ftpQueue = Promise.resolve();
function runFtp(task) {
  const result = ftpQueue.then(task, task);
  ftpQueue = result.catch(() => {});
  return result;
}

async function openClient(config) {
  const client = new Client(30000);
  client.ftp.verbose = !app.isPackaged;
  await client.access({
    host: config.host,
    port: config.port || 21,
    user: config.user,
    password: config.password,
    secure: config.secure || false,
  });
  return client;
}

function closeFtp() {
  ftpSession++;
  ftpConfig = null;
  if (ftpClient) {
    ftpClient.close();
    ftpClient = null;
  }
}

// Si el servidor ha cerrado la sesión (inactividad, red...), se reconecta con los mismos datos
async function reconnect() {
  sendToRenderer('ftp-connection', { state: 'reconnecting' });
  try {
    if (ftpClient) {
      ftpClient.close();
    }
    ftpClient = await openClient(ftpConfig);
    sendToRenderer('ftp-connection', { state: 'connected' });
  } catch (error) {
    closeFtp();
    sendToRenderer('ftp-connection', { state: 'disconnected', message: error.message });
    throw new Error(`Se ha perdido la conexión y no se ha podido reconectar: ${error.message}`, { cause: error });
  }
}

// Ejecuta una operación con el cliente activo: en cola, reconectando si hace falta y reintentando una vez
function withFtp(task) {
  const session = ftpSession;
  return runFtp(async () => {
    if (session !== ftpSession || !ftpConfig) {
      throw new Error('No hay conexión FTP activa');
    }
    if (!ftpClient || ftpClient.closed) {
      await reconnect();
    }
    try {
      return await task(ftpClient);
    } catch (error) {
      // Error de la propia operación (p. ej. 550): la conexión sigue abierta, no se reintenta
      if (!ftpClient || !ftpClient.closed || session !== ftpSession || !ftpConfig || transferCancelled) {
        throw error;
      }
      await reconnect();
      return task(ftpClient);
    }
  });
}

// Respuesta común de los handlers FTP
async function ftpResult(label, operation) {
  try {
    return { success: true, data: await operation() };
  } catch (error) {
    console.error(`Error al ${label}:`, error);
    return { success: false, message: error.message };
  }
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// Fecha de un listado FTP: MLSD la trae ya interpretada; LIST solo como texto ("Oct  9 15:17", "Mar  1  2024"...)
function parseListDate(item) {
  if (item.modifiedAt) {
    return { modifiedAt: item.modifiedAt.getTime(), dateOnly: false };
  }
  const raw = (item.rawModifiedAt || '').trim();
  let match = raw.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (match && match[1] in MONTHS) {
    // Sin año: es una fecha de los últimos 12 meses
    const now = new Date();
    const date = new Date(now.getFullYear(), MONTHS[match[1]], +match[2], +match[3], +match[4]);
    if (date.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
      date.setFullYear(date.getFullYear() - 1);
    }
    return { modifiedAt: date.getTime(), dateOnly: false };
  }
  match = raw.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})$/);
  if (match && match[1] in MONTHS) {
    return { modifiedAt: new Date(+match[3], MONTHS[match[1]], +match[2]).getTime(), dateOnly: true };
  }
  // Formato DOS/IIS: "10-09-26 03:17PM"
  match = raw.match(/^(\d{2})-(\d{2})-(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (match) {
    const year = match[3].length === 2 ? 2000 + +match[3] : +match[3];
    const hours = (+match[4] % 12) + (match[6].toUpperCase() === 'PM' ? 12 : 0);
    return { modifiedAt: new Date(year, +match[1] - 1, +match[2], hours, +match[5]).getTime(), dateOnly: false };
  }
  return { modifiedAt: null, dateOnly: false };
}

// Conectar al servidor FTP
ipcMain.handle('ftp-connect', async (event, config) => {
  // Cerrar conexión previa si existe
  closeFtp();
  const session = ftpSession;

  try {
    console.log('Intentando conectar a:', config.host);
    const client = await openClient(config);
    // Directorio de inicio del usuario en el servidor (muchos servidores no dejan listar "/")
    const home = await client.pwd();

    if (session !== ftpSession) {
      // Se ha desconectado o conectado a otro servidor mientras tanto
      client.close();
      return { success: false, message: 'Conexión cancelada' };
    }
    ftpClient = client;
    ftpConfig = config;
    console.log('Conexión FTP exitosa');
    return { success: true, message: 'Conexión exitosa', home };
  } catch (error) {
    console.error('Error en la conexión FTP:', error);
    return { success: false, message: error.message };
  }
});

// Listar directorio remoto
ipcMain.handle('ftp-list-directory', (event, remotePath) =>
  ftpResult('listar directorio remoto', async () => {
    console.log('Listando directorio remoto:', remotePath);
    const list = await withFtp(client => client.list(remotePath));
    return list.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory,
      isLink: item.isSymbolicLink,
      size: item.isFile ? item.size : null,
      ...parseListDate(item),
      rawDate: item.rawModifiedAt,
    }));
  })
);

// Comprueba si una ruta remota es una carpeta (para los enlaces simbólicos del servidor)
ipcMain.handle('ftp-is-directory', (event, remotePath) =>
  ftpResult('comprobar la ruta remota', () =>
    withFtp(async client => {
      const current = await client.pwd();
      try {
        await client.cd(remotePath);
        return true;
      } catch {
        return false;
      } finally {
        await client.cd(current).catch(() => {});
      }
    })
  )
);

// Desconectar
ipcMain.handle('ftp-disconnect', async () => {
  const wasConnected = Boolean(ftpConfig);
  closeFtp();
  return wasConnected
    ? { success: true, message: 'Desconectado correctamente' }
    : { success: false, message: 'No hay conexión activa' };
});

// TRANSFERENCIAS

let transferCancelled = false;
let transferProgressFile = null;

// Recorre una carpeta local: subcarpetas a crear y archivos con su tamaño (sin seguir enlaces, para evitar bucles)
async function walkLocal(root, rel = '', result = { dirs: [], files: [] }) {
  const entries = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    const childRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      result.dirs.push(childRel);
      await walkLocal(root, childRel, result);
    } else if (entry.isFile()) {
      const stats = await fs.promises.stat(path.join(root, childRel));
      result.files.push({ rel: childRel, size: stats.size });
    }
  }
  return result;
}

// Recorre una carpeta remota (cada listado pasa por la cola FTP)
async function walkRemote(root, rel = '', result = { dirs: [], files: [] }) {
  const list = await withFtp(client => client.list(path.posix.join(root, rel)));
  for (const item of list) {
    const childRel = rel ? path.posix.join(rel, item.name) : item.name;
    if (item.isDirectory) {
      result.dirs.push(childRel);
      await walkRemote(root, childRel, result);
    } else if (item.isFile) {
      result.files.push({ rel: childRel, size: item.size });
    }
  }
  return result;
}

// Sube o descarga un archivo o una carpeta completa.
// job = { direction: 'upload' | 'download', source, targetDir, name, isDirectory, size }
ipcMain.handle('ftp-transfer', async (event, job) => {
  transferCancelled = false;
  const upload = job.direction === 'upload';
  const target = upload ? path.posix.join(job.targetDir, job.name) : path.join(job.targetDir, job.name);
  // Ruta del archivo en destino a partir de su ruta relativa dentro de la carpeta transferida
  const sourceOf = rel =>
    upload ? path.join(job.source, rel) : path.posix.join(job.source, rel.split(path.sep).join('/'));
  const targetOf = rel => (upload ? path.posix.join(target, rel.split(path.sep).join('/')) : path.join(target, rel));
  const errors = [];

  try {
    let isDirectory = job.isDirectory;
    let size = job.size;
    if (upload) {
      // Puede venir del Explorador/Finder: se mira en disco si es carpeta
      const stats = await fs.promises.stat(job.source);
      isDirectory = stats.isDirectory();
      size = stats.size;
    }

    let plan;
    if (isDirectory) {
      plan = upload ? await walkLocal(job.source) : await walkRemote(job.source);
      plan.dirs.unshift('');
    } else {
      plan = { dirs: [], files: [{ rel: '', size }] };
    }
    const sourceFile = rel => (rel ? sourceOf(rel) : job.source);
    const targetFile = rel => (rel ? targetOf(rel) : target);

    const total = plan.files.every(file => typeof file.size === 'number')
      ? plan.files.reduce((sum, file) => sum + file.size, 0)
      : null;
    let done = 0;
    const report = (file, index, bytes) =>
      sendToRenderer('transfer-progress', {
        name: path.basename(file.rel) || job.name,
        index,
        count: plan.files.length,
        bytes: done + bytes,
        total,
      });

    for (const dir of plan.dirs) {
      if (upload) {
        // MKD sin error si ya existe (se combinan las carpetas)
        await withFtp(client => client.sendIgnoringError('MKD ' + targetFile(dir)));
      } else {
        await fs.promises.mkdir(targetFile(dir), { recursive: true });
      }
    }

    for (const [index, file] of plan.files.entries()) {
      if (transferCancelled) {
        break;
      }
      report(file, index, 0);
      transferProgressFile = {
        upload,
        local: upload ? sourceFile(file.rel) : targetFile(file.rel),
        remote: upload ? targetFile(file.rel) : sourceFile(file.rel),
      };
      try {
        await withFtp(async client => {
          client.trackProgress(info => report(file, index, info.bytes));
          try {
            if (upload) {
              await client.uploadFrom(transferProgressFile.local, transferProgressFile.remote);
            } else {
              await client.downloadTo(transferProgressFile.local, transferProgressFile.remote);
            }
          } finally {
            client.trackProgress();
          }
        });
        done += file.size || 0;
        report(file, index + 1, 0);
      } catch (error) {
        // Cancelación o conexión perdida sin poder reconectar: se para todo. Otros errores: se sigue con el resto
        if (transferCancelled || !ftpConfig) {
          throw error;
        }
        errors.push({ name: file.rel || job.name, message: error.message });
      }
    }

    if (transferCancelled) {
      throw new Error('Transferencia cancelada');
    }
    return { success: errors.length === 0, errors, message: errors.map(e => `${e.name}: ${e.message}`).join('\n') };
  } catch (error) {
    if (transferCancelled) {
      await removePartialFile();
      return { success: false, cancelled: true, message: 'Transferencia cancelada' };
    }
    console.error('Error en la transferencia:', error);
    return { success: false, errors, message: error.message };
  } finally {
    transferProgressFile = null;
    transferCancelled = false;
  }
});

// Al cancelar, el archivo que se estaba transfiriendo queda a medias en el destino: se elimina
async function removePartialFile() {
  const partial = transferProgressFile;
  if (!partial) {
    return;
  }
  if (partial.upload) {
    transferCancelled = false;
    await withFtp(client => client.remove(partial.remote, true)).catch(() => {});
  } else {
    await fs.promises.unlink(partial.local).catch(() => {});
  }
}

// Cancelar la transferencia en curso: basic-ftp no permite abortarla, se cierra la conexión
// (la siguiente operación reconecta sola)
ipcMain.handle('ftp-cancel', () => {
  if (!transferProgressFile) {
    return false;
  }
  transferCancelled = true;
  if (ftpClient) {
    ftpClient.close();
  }
  return true;
});

// OPERACIONES DE ARCHIVO (menú contextual)

async function fsResult(operation) {
  try {
    return { success: true, data: await operation() };
  } catch (error) {
    console.error('Error en operación local:', error);
    return { success: false, message: describeFsError(error) };
  }
}

// Renombrar un archivo o carpeta local sin pisar uno existente
ipcMain.handle('local-rename', (event, oldPath, newName) =>
  fsResult(async () => {
    const newPath = path.join(path.dirname(oldPath), newName);
    // En Windows/macOS cambiar solo mayúsculas apunta al mismo archivo: no es un conflicto
    const sameFile = newPath.toLowerCase() === oldPath.toLowerCase();
    if (!sameFile && fs.existsSync(newPath)) {
      throw Object.assign(new Error('ya existe'), { code: 'EEXIST', path: newName });
    }
    await fs.promises.rename(oldPath, newPath);
    return newPath;
  })
);

// Eliminar en local = mover a la papelera (recuperable)
ipcMain.handle('local-trash', (event, paths) =>
  fsResult(async () => {
    for (const filePath of paths) {
      await shell.trashItem(filePath);
    }
  })
);

ipcMain.handle('local-mkdir', (event, directory, name) =>
  fsResult(async () => {
    const dirPath = path.join(directory, name);
    await fs.promises.mkdir(dirPath);
    return dirPath;
  })
);

ipcMain.handle('ftp-rename', (event, fromPath, toPath) =>
  ftpResult('renombrar en el servidor', () => withFtp(client => client.rename(fromPath, toPath)))
);

// Eliminar en el servidor (definitivo); las carpetas con todo su contenido
ipcMain.handle('ftp-delete', (event, items) =>
  ftpResult('eliminar en el servidor', async () => {
    for (const item of items) {
      await withFtp(client => (item.isDirectory ? client.removeDir(item.path) : client.remove(item.path)));
    }
  })
);

ipcMain.handle('ftp-mkdir', (event, remotePath) =>
  ftpResult('crear la carpeta en el servidor', () => withFtp(client => client.send('MKD ' + remotePath)))
);
