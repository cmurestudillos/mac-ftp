/**
 * Módulo para manejar eventos de la interfaz de usuario
 */

// Función para crear elementos de archivo en la interfaz
function createFileElement(file, isLocal, onClickCallback) {
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

  // Tamaño para archivos remotos (si está disponible)
  if (!isLocal && file.size !== undefined && !file.isDirectory) {
    const sizeElement = document.createElement('span');
    sizeElement.className = 'file-size';
    sizeElement.textContent = formatFileSize(file.size);
    fileElement.appendChild(sizeElement);
  }

  // Menú contextual para opciones adicionales
  fileElement.addEventListener('contextmenu', e => {
    e.preventDefault();
    showContextMenu(e, file, isLocal);
  });

  // Manejador de clic principal
  if (onClickCallback) {
    fileElement.addEventListener('click', () => onClickCallback(file));
  }

  return fileElement;
}

// Función para formatear el tamaño de archivo
function formatFileSize(sizeInBytes) {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  } else if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(2)} KB`;
  } else if (sizeInBytes < 1024 * 1024 * 1024) {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

// Función para mostrar un menú contextual
function showContextMenu(event, file, isLocal) {
  // Eliminar menús contextuales previos
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  // Crear nuevo menú
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.top = `${event.clientY}px`;
  menu.style.left = `${event.clientX}px`;

  // Agregar opciones según el tipo de archivo y si es local o remoto
  if (file.isDirectory) {
    // Opciones para directorios
    addMenuItem(menu, 'Abrir', () => {
      // Esta acción la maneja el evento de clic regular
      menu.remove();
    });

    if (!isLocal) {
      addMenuItem(menu, 'Descargar directorio', () => {
        // Implementar descarga de directorio completo
        document.dispatchEvent(new CustomEvent('download-directory', { detail: file }));
        menu.remove();
      });
    }
  } else {
    // Opciones para archivos
    if (isLocal) {
      addMenuItem(menu, 'Subir', () => {
        document.dispatchEvent(new CustomEvent('upload-file', { detail: file }));
        menu.remove();
      });
    } else {
      addMenuItem(menu, 'Descargar', () => {
        document.dispatchEvent(new CustomEvent('download-file', { detail: file }));
        menu.remove();
      });
    }
  }

  // Opción para eliminar
  addMenuItem(menu, 'Eliminar', () => {
    if (confirm(`¿Está seguro de eliminar "${file.name}"?`)) {
      document.dispatchEvent(
        new CustomEvent('delete-item', {
          detail: { file, isLocal },
        })
      );
    }
    menu.remove();
  });

  // Agregar menú al DOM
  document.body.appendChild(menu);

  // Cerrar menú al hacer clic fuera de él
  document.addEventListener('click', function closeMenu(e) {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  });
}

// Función para agregar elemento al menú contextual
function addMenuItem(menu, text, callback) {
  const item = document.createElement('div');
  item.className = 'menu-item';
  item.textContent = text;
  item.addEventListener('click', callback);
  menu.appendChild(item);
}

// Función para crear una notificación
function createNotification(message, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  const container = document.querySelector('.notifications-container') || createNotificationsContainer();
  container.appendChild(notification);

  // Eliminar después de la duración especificada
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 500);
  }, duration);
}

// Función para crear contenedor de notificaciones
function createNotificationsContainer() {
  const container = document.createElement('div');
  container.className = 'notifications-container';
  document.body.appendChild(container);
  return container;
}

// Exportar funciones
module.exports = {
  createFileElement,
  formatFileSize,
  createNotification,
};
