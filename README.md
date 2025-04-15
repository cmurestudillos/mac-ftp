# MAC FTP Client

Una aplicación de cliente FTP moderna y fácil de usar, construida con Electron. Permite transferir archivos entre tu computadora y servidores remotos con una interfaz intuitiva y amigable, similar a clientes FTP comerciales como Transmit.

## Características

- 🔄 Conexión a servidores FTP estándar
- 📂 Explorador de archivos dual (local y remoto)
- ⬆️ Carga y descarga de archivos
- 📝 Gestión de conexiones guardadas
- 🔍 Navegación sencilla por directorios
- 🔒 Soporte para conexiones seguras (FTPS)
- 📱 Aplicación multiplataforma (macOS, Windows, Linux)

## Instalación

### Requisitos previos
- [Node.js](https://nodejs.org/)
- npm (incluido con Node.js)

### Pasos de instalación

```bash
# Clonar el repositorio
git clone https://github.com/cmurestudillos/mac-ftp.git

# Navegar al directorio
cd mac-ftp

# Instalar dependencias
npm install

# Iniciar la aplicación
npm start
```

### Descargar versión compilada
También puedes descargar la versión compilada para tu sistema operativo desde la sección de [Releases](https://github.com/cmurestudillos/mac-ftp/releases).

## Uso

1. **Conectar a un servidor FTP**:
   - Ingresa los datos de conexión (host, puerto, usuario, contraseña)
   - Haz clic en "Conectar"

2. **Navegar por los archivos**:
   - El panel izquierdo muestra tus archivos locales
   - El panel derecho muestra los archivos en el servidor remoto
   - Haz clic en las carpetas para navegar por los directorios

3. **Transferir archivos**:
   - Haz clic en un archivo en el panel local para subirlo al servidor
   - Haz clic en un archivo en el panel remoto para descargarlo a tu computadora

4. **Guardar conexiones**:
   - Ingresa un nombre para la conexión
   - Haz clic en "Guardar"
   - Las conexiones guardadas aparecerán en la barra lateral

## Tecnologías utilizadas

- [Electron](https://www.electronjs.org/) - Framework para crear aplicaciones de escritorio con tecnologías web
- [basic-ftp](https://github.com/patrickjuchli/basic-ftp) - Cliente FTP moderno para Node.js
- [electron-store](https://github.com/sindresorhus/electron-store) - Almacenamiento persistente para aplicaciones Electron

## Desarrollo

```bash
# Iniciar en modo desarrollo
npm start

# Construir para producción
npm run build
```

## Contribuciones

Las contribuciones son bienvenidas. Por favor, sigue estos pasos:

1. Haz fork del repositorio
2. Crea una rama para tu feature (`git checkout -b feature/amazing-feature`)
3. Haz commit de tus cambios (`git commit -m 'Add some amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## Licencia

Distribuido bajo la Licencia MIT. Ver `LICENSE` para más información.

## Agradecimientos

- [Electron](https://www.electronjs.org/)
- [basic-ftp](https://github.com/patrickjuchli/basic-ftp)
- [electron-store](https://github.com/sindresorhus/electron-store)