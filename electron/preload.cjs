const { contextBridge } = require('electron');

// Exponer un puente de comunicación seguro al proceso de renderizado (Frontend)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // Se pueden mapear canales IPC (Inter-Process Communication) en el futuro si necesitas
  // guardar archivos locales o interactuar de forma nativa con el sistema operativo
});
