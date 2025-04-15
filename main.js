const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { Client } = require('basic-ftp');

// Configuración para almacenar conexiones guardadas
const store = new Store();

let mainWindow;
global.ftpClient = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1800,
    height: 1169,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      // Mostrar errores de preload en la consola del proceso principal
      additionalArguments: ['--enable-logging'],
    },
  });

  mainWindow.loadFile('index.html');

  // Abre las herramientas de desarrollo (importante para depuración)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    // Cerrar la conexión FTP si existe
    if (global.ftpClient) {
      global.ftpClient.close();
      global.ftpClient = null;
    }
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Deshabilitar la reutilización del proceso de renderizado para evitar problemas con módulos nativos
  app.allowRendererProcessReuse = false;

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

// Manejadores de IPC para la comunicación entre el proceso principal y el renderizador

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

  // Agregar nueva conexión o actualizar existente
  const index = connections.findIndex(conn => conn.name === connection.name);

  if (index !== -1) {
    connections[index] = connection;
  } else {
    connections.push(connection);
  }

  store.set('connections', connections);
  return connections;
});

// Obtener conexiones guardadas
ipcMain.handle('get-connections', () => {
  return store.get('connections', []);
});

// Eliminar conexión
ipcMain.handle('delete-connection', (event, name) => {
  const connections = store.get('connections', []);
  const newConnections = connections.filter(conn => conn.name !== name);
  store.set('connections', newConnections);
  return newConnections;
});

// Listar directorio local
ipcMain.handle('list-local-directory', async (event, directory) => {
  try {
    const files = await fs.promises.readdir(directory, { withFileTypes: true });

    return files.map(file => {
      return {
        name: file.name,
        isDirectory: file.isDirectory(),
        path: path.join(directory, file.name),
      };
    });
  } catch (error) {
    console.error('Error al listar directorio local:', error);
    throw error;
  }
});

// FUNCIONES FTP EN EL PROCESO PRINCIPAL

// Conectar al servidor FTP
ipcMain.handle('ftp-connect', async (event, config) => {
  // Cerrar conexión previa si existe
  if (global.ftpClient) {
    global.ftpClient.close();
    global.ftpClient = null;
  }

  const client = new Client();
  try {
    console.log('Intentando conectar a:', config.host);

    const { host, port, user, password, secure } = config;

    client.ftp.verbose = true; // Para depuración

    await client.access({
      host,
      port: port || 21,
      user,
      password,
      secure: secure || false,
    });

    console.log('Conexión FTP exitosa');

    // Guardamos el cliente en una variable global para usarlo en otras operaciones
    global.ftpClient = client;

    return { success: true, message: 'Conexión exitosa' };
  } catch (error) {
    console.error('Error en la conexión FTP:', error);
    client.close();
    return { success: false, message: error.message };
  }
});

// Listar directorio remoto
ipcMain.handle('ftp-list-directory', async (event, remotePath) => {
  if (!global.ftpClient) {
    return { success: false, message: 'No hay conexión FTP activa' };
  }

  try {
    console.log('Listando directorio remoto:', remotePath);
    const list = await global.ftpClient.list(remotePath || '.');

    return {
      success: true,
      data: list.map(item => ({
        name: item.name,
        isDirectory: item.type === 2, // 2 es el código para directorios
        size: item.size,
        date: item.rawModifiedAt,
        permissions: item.permissions,
      })),
    };
  } catch (error) {
    console.error('Error al listar directorio remoto:', error);
    return { success: false, message: error.message };
  }
});

// Descargar archivo
ipcMain.handle('ftp-download-file', async (event, remotePath, localPath) => {
  if (!global.ftpClient) {
    return { success: false, message: 'No hay conexión FTP activa' };
  }

  try {
    console.log(`Descargando ${remotePath} a ${localPath}`);
    await global.ftpClient.downloadTo(localPath, remotePath);
    return { success: true, message: 'Archivo descargado correctamente' };
  } catch (error) {
    console.error('Error al descargar archivo:', error);
    return { success: false, message: error.message };
  }
});

// Subir archivo
ipcMain.handle('ftp-upload-file', async (event, localPath, remotePath) => {
  if (!global.ftpClient) {
    return { success: false, message: 'No hay conexión FTP activa' };
  }

  try {
    console.log(`Subiendo ${localPath} a ${remotePath}`);
    await global.ftpClient.uploadFrom(localPath, remotePath);
    return { success: true, message: 'Archivo subido correctamente' };
  } catch (error) {
    console.error('Error al subir archivo:', error);
    return { success: false, message: error.message };
  }
});

// Desconectar
ipcMain.handle('ftp-disconnect', async event => {
  if (global.ftpClient) {
    global.ftpClient.close();
    global.ftpClient = null;
    return { success: true, message: 'Desconectado correctamente' };
  }
  return { success: false, message: 'No hay conexión activa' };
});
