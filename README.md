# MAC FTP Client

Una aplicación de cliente FTP moderna y fácil de usar, construida con Electron. Permite transferir archivos entre tu computadora y servidores remotos con una interfaz dual-panel intuitiva, similar a clientes FTP comerciales como Transmit.

## Características

- Conexión a servidores FTP y FTPS (conexión segura)
- Explorador de archivos dual (local y remoto)
- Subida y descarga de archivos con un clic
- Visualización del tamaño de archivos remotos
- Gestión de conexiones guardadas (persistentes entre sesiones)
- Navegación sencilla por directorios
- Aplicación multiplataforma (macOS, Windows, Linux)

## Instalación

### Requisitos previos
- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

### Pasos de instalación

```bash
# Clonar el repositorio
git clone https://github.com/cmurestudillos/mac-ftp.git

# Navegar al directorio
cd mac-ftp

# Instalar dependencias
pnpm install

# Iniciar la aplicación
pnpm start
```

### Descargar versión compilada
También puedes descargar la versión compilada para tu sistema operativo desde la sección de [Releases](https://github.com/cmurestudillos/mac-ftp/releases).

## Uso

1. **Conectar a un servidor FTP**:
   - Ingresa los datos de conexión (host, puerto, usuario, contraseña)
   - Haz clic en "Conectar"

2. **Navegar por los archivos**:
   - El panel izquierdo muestra tus archivos locales (arranca en tu directorio home)
   - El panel derecho muestra los archivos en el servidor remoto
   - Haz clic en las carpetas para navegar; usa ⬆️ para subir al directorio padre

3. **Transferir archivos**:
   - Haz clic en un archivo local para subirlo al servidor
   - Haz clic en un archivo remoto para descargarlo a tu directorio local actual

4. **Guardar conexiones**:
   - Ingresa un nombre para la conexión y haz clic en "Guardar"
   - Las conexiones guardadas aparecen en la barra lateral con acceso rápido (⚡)

## Desarrollo

```bash
# Iniciar en modo desarrollo
pnpm start

# Lint
pnpm lint
pnpm lint:fix

# Formato
pnpm format:check
pnpm format

# Construir para producción
pnpm package:win
pnpm package:mac
pnpm package:linux
```

## Tecnologías utilizadas

- [Electron](https://www.electronjs.org/) — Framework para aplicaciones de escritorio con tecnologías web
- [basic-ftp](https://github.com/patrickjuchli/basic-ftp) — Cliente FTP moderno para Node.js
- [electron-store](https://github.com/sindresorhus/electron-store) — Almacenamiento persistente para aplicaciones Electron

## Contribuciones

Las contribuciones son bienvenidas. Por favor, sigue estos pasos:

1. Haz fork del repositorio
2. Crea una rama para tu feature (`git checkout -b feature/amazing-feature`)
3. Haz commit de tus cambios (`git commit -m 'Add some amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## Licencia

Distribuido bajo la Licencia ISC.
