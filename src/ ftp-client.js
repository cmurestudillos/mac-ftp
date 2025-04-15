const { Client } = require('basic-ftp');

/**
 * Clase que maneja las operaciones FTP
 */
class FtpClientHandler {
  constructor() {
    this.client = new Client();
    this.client.ftp.verbose = true; // Para depuración
  }

  /**
   * Conecta al servidor FTP
   * @param {Object} config - Configuración de conexión
   * @returns {Promise<Object>} - Resultado de la conexión
   */
  async connect(config) {
    try {
      const { host, port, user, password, secure } = config;

      await this.client.access({
        host,
        port: port || 21,
        user,
        password,
        secure: secure || false,
      });

      return { success: true, message: 'Conexión exitosa' };
    } catch (error) {
      console.error('Error en la conexión FTP:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Cierra la conexión FTP
   */
  disconnect() {
    if (this.client) {
      this.client.close();
    }
  }

  /**
   * Lista el contenido de un directorio remoto
   * @param {string} remotePath - Ruta del directorio remoto
   * @returns {Promise<Array>} - Lista de archivos y directorios
   */
  async listDirectory(remotePath = '.') {
    try {
      const list = await this.client.list(remotePath);

      return list.map(item => ({
        name: item.name,
        isDirectory: item.type === 2,
        size: item.size,
        date: item.rawModifiedAt,
        permissions: item.permissions,
      }));
    } catch (error) {
      console.error('Error al listar directorio remoto:', error);
      throw error;
    }
  }

  /**
   * Descarga un archivo del servidor FTP
   * @param {string} remotePath - Ruta del archivo remoto
   * @param {string} localPath - Ruta local donde guardar el archivo
   * @returns {Promise<Object>} - Resultado de la descarga
   */
  async downloadFile(remotePath, localPath) {
    try {
      await this.client.downloadTo(localPath, remotePath);
      return { success: true, message: 'Archivo descargado correctamente' };
    } catch (error) {
      console.error('Error al descargar archivo:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Sube un archivo al servidor FTP
   * @param {string} localPath - Ruta del archivo local
   * @param {string} remotePath - Ruta de destino en el servidor
   * @returns {Promise<Object>} - Resultado de la subida
   */
  async uploadFile(localPath, remotePath) {
    try {
      await this.client.uploadFrom(localPath, remotePath);
      return { success: true, message: 'Archivo subido correctamente' };
    } catch (error) {
      console.error('Error al subir archivo:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Crea un directorio en el servidor FTP
   * @param {string} remotePath - Ruta del directorio a crear
   * @returns {Promise<Object>} - Resultado de la creación
   */
  async createDirectory(remotePath) {
    try {
      await this.client.ensureDir(remotePath);
      return { success: true, message: 'Directorio creado correctamente' };
    } catch (error) {
      console.error('Error al crear directorio:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Elimina un archivo o directorio en el servidor FTP
   * @param {string} remotePath - Ruta del archivo o directorio a eliminar
   * @param {boolean} isDirectory - Indica si es un directorio
   * @returns {Promise<Object>} - Resultado de la eliminación
   */
  async delete(remotePath, isDirectory) {
    try {
      if (isDirectory) {
        await this.client.removeDir(remotePath);
      } else {
        await this.client.remove(remotePath);
      }
      return { success: true, message: 'Eliminado correctamente' };
    } catch (error) {
      console.error('Error al eliminar:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = FtpClientHandler;
