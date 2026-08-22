/**
 * googleAuthDrive.js
 * Módulo de Autenticación con Google y Sincronización en la Nube (Google Drive API v3)
 * Diseñado para AsistenciaApp (https://asistencia-app-omega.vercel.app/)
 */

// Scope de Drive.file: Acceso exclusivo a los archivos creados por AsistenciaApp en el Drive del docente.
const GOOGLE_SCOPES = 'openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file';

// Client ID por defecto (Modificable desde entorno o almacenamiento local)
let GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID || localStorage.getItem('asistencia_google_client_id') || '';

let tokenClient = null;
let currentAccessToken = localStorage.getItem('asistencia_google_access_token') || null;
let tokenExpiresAt = parseInt(localStorage.getItem('asistencia_google_token_expires_at') || '0', 10);

/**
 * Carga dinámicamente el SDK de Google Identity Services si no existe en el DOM
 */
export function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existingScript = document.getElementById('google-gsi-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', (err) => reject(err));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(new Error('No se pudo cargar el SDK de Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Establece o actualiza el Google Client ID
 */
export function setGoogleClientId(id) {
  if (!id) return;
  GOOGLE_CLIENT_ID = id.trim();
  localStorage.setItem('asistencia_google_client_id', GOOGLE_CLIENT_ID);
  tokenClient = null; // Re-inicializar el cliente de token
}

export function getGoogleClientId() {
  return GOOGLE_CLIENT_ID;
}

/**
 * Inicializa el Token Client de Google OAuth 2.0
 */
async function initTokenClient() {
  await loadGoogleScript();

  if (!GOOGLE_CLIENT_ID) {
    throw new Error('CLIENT_ID_MISSING');
  }

  if (!tokenClient && window.google?.accounts?.oauth2) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          console.error('[GoogleAuth] Error en respuesta de token:', tokenResponse);
          if (typeof window.showNotif === 'function') {
            window.showNotif('Error de Google', 'No se pudo completar el inicio de sesión.');
          }
          return;
        }

        if (tokenResponse.access_token) {
          currentAccessToken = tokenResponse.access_token;
          const expiresIn = parseInt(tokenResponse.expires_in || '3600', 10);
          tokenExpiresAt = Date.now() + (expiresIn * 1000);

          localStorage.setItem('asistencia_google_access_token', currentAccessToken);
          localStorage.setItem('asistencia_google_token_expires_at', tokenExpiresAt.toString());
          localStorage.setItem('asistencia_google_connected', 'true');

          // Obtener perfil del usuario
          await fetchAndSaveUserProfile(currentAccessToken);

          // Actualizar UI
          if (typeof window.updateGoogleUI === 'function') {
            window.updateGoogleUI();
          }

          if (typeof window.showNotif === 'function') {
            window.showNotif('Google Conectado', 'Sesión iniciada correctamente. Sincronización activa.');
          }

          // Sincronizar automáticamente respaldo a Google Drive
          await syncWithGoogleDrive(false);
        }
      }
    });
  }
}

/**
 * Obtiene la información del perfil del usuario (Nombre, Email, Foto)
 */
async function fetchAndSaveUserProfile(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) throw new Error('Error al obtener perfil de Google');
    const profile = await res.json();

    const email = profile.email || '';
    const name = profile.name || profile.given_name || 'Profesor';
    const picture = profile.picture || '';

    localStorage.setItem('asistencia_google_email', email);
    localStorage.setItem('asistencia_google_name', name);
    localStorage.setItem('asistencia_google_picture', picture);

    // Actualizar nombre del profesor en la app
    if (name) {
      localStorage.setItem('asistencia_teacher_name', name);
      window.teacherName = name;
      const nameEl = document.getElementById('teacher-name');
      if (nameEl) nameEl.textContent = name;
      const nameInput = document.getElementById('teacher-name-input');
      if (nameInput) nameInput.value = name;
    }

    if (picture) {
      localStorage.setItem('asistencia_teacher_photo', picture);
      const avatarDisplay = document.getElementById('profile-avatar-display');
      if (avatarDisplay) {
        avatarDisplay.innerHTML = `<img src="${picture}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
      }
    }
  } catch (err) {
    console.error('[GoogleAuth] Error obteniendo perfil:', err);
  }
}

/**
 * Conecta la cuenta de Google solicitando el token de acceso
 */
export async function connectGoogleAccount() {
  if (!GOOGLE_CLIENT_ID) {
    const userInputId = prompt('Por favor, ingresa tu ID de Cliente de Google OAuth (Google Client ID):', GOOGLE_CLIENT_ID || '');
    if (userInputId) {
      setGoogleClientId(userInputId);
    } else {
      if (typeof window.showNotif === 'function') {
        window.showNotif('Configuración Requerida', 'Ingresa tu Client ID de Google para continuar.');
      }
      return;
    }
  }

  try {
    await initTokenClient();
    if (tokenClient) {
      // Forzar prompt para permitir seleccionar cuenta
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    }
  } catch (err) {
    console.error('[GoogleAuth] Error al iniciar sesión:', err);
    if (err.message === 'CLIENT_ID_MISSING') {
      const userInputId = prompt('Ingresa tu Google Client ID para AsistenciaApp:');
      if (userInputId) {
        setGoogleClientId(userInputId);
        connectGoogleAccount();
      }
    } else if (typeof window.showNotif === 'function') {
      window.showNotif('Error', 'No se pudo abrir el inicio de sesión de Google.');
    }
  }
}

/**
 * Desconecta la cuenta de Google
 */
export function disconnectGoogleAccount() {
  if (currentAccessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(currentAccessToken, () => {
      console.log('[GoogleAuth] Token revocado.');
    });
  }

  currentAccessToken = null;
  tokenExpiresAt = 0;
  localStorage.setItem('asistencia_google_connected', 'false');
  localStorage.removeItem('asistencia_google_access_token');
  localStorage.removeItem('asistencia_google_token_expires_at');
  localStorage.removeItem('asistencia_google_email');
  localStorage.removeItem('asistencia_google_name');
  localStorage.removeItem('asistencia_google_picture');

  if (typeof window.updateGoogleUI === 'function') {
    window.updateGoogleUI();
  }

  if (typeof window.showNotif === 'function') {
    window.showNotif('Google Desconectado', 'Se ha desvinculado la cuenta de Google.');
  }
}

/**
 * Verifica si el token actual está activo y no ha expirado
 */
export function isGoogleConnected() {
  const isConnected = localStorage.getItem('asistencia_google_connected') === 'true';
  const hasToken = !!currentAccessToken;
  const notExpired = Date.now() < tokenExpiresAt;
  return isConnected && hasToken && notExpired;
}

/**
 * Garantiza un token de acceso válido (si expiró, solicita volver a conectar)
 */
async function getValidToken() {
  if (!isGoogleConnected()) {
    throw new Error('TOKEN_EXPIRED_OR_NOT_CONNECTED');
  }
  return currentAccessToken;
}

/**
 * Sincroniza la información actual de la app hacia Google Drive
 */
export async function syncWithGoogleDrive(showNotifications = true) {
  try {
    const token = await getValidToken();

    if (showNotifications && typeof window.showNotif === 'function') {
      window.showNotif('Sincronizando Nube...', 'Guardando respaldos en Google Drive');
    }

    // Estructura completa de respaldo
    const appBackupData = {
      app: 'AsistenciaApp',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      teacher: {
        name: localStorage.getItem('asistencia_teacher_name') || '',
        bio: localStorage.getItem('asistencia_teacher_bio') || '',
        subject: localStorage.getItem('asistencia_teacher_subject') || '',
        phone: localStorage.getItem('asistencia_teacher_phone') || '',
        gender: localStorage.getItem('asistencia_teacher_gender') || '',
        role: localStorage.getItem('asistencia_teacher_role') || '',
        photo: localStorage.getItem('asistencia_teacher_photo') || ''
      },
      groups: JSON.parse(localStorage.getItem('asistencia_groups') || '[]'),
      schedule: JSON.parse(localStorage.getItem('asistencia_schedule') || '[]'),
      tareas: JSON.parse(localStorage.getItem('asistencia_tareas') || '[]'),
      scheduleDays: JSON.parse(localStorage.getItem('asistencia_schedule_days') || '[]'),
      scheduleShift: localStorage.getItem('asistencia_schedule_shift') || 'matutino',
      securityConfig: JSON.parse(localStorage.getItem('asistencia_security_config') || '{}'),
      guardianProfile: JSON.parse(localStorage.getItem('asistencia_guardian_profile') || '{}'),
      studentProfile: JSON.parse(localStorage.getItem('asistencia_student_profile') || '{}')
    };

    const fileName = 'asistencia_app_backup.json';

    // 1. Buscar si ya existe el archivo en Drive
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+trashed=false`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!searchRes.ok) {
      if (searchRes.status === 401) {
        disconnectGoogleAccount();
        throw new Error('Sesión expirada. Por favor vuelve a conectar Google.');
      }
      throw new Error(`Error buscando en Drive: ${searchRes.statusText}`);
    }

    const searchData = await searchRes.json();
    const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

    const fileContent = JSON.stringify(appBackupData, null, 2);
    const metadata = {
      name: fileName,
      mimeType: 'application/json'
    };

    const boundary = 'foo_bar_baz';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelimiter;

    let uploadRes;

    if (existingFile) {
      // Actualizar archivo existente (PATCH)
      const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
      uploadRes = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });
    } else {
      // Crear nuevo archivo (POST)
      const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });
    }

    if (!uploadRes.ok) {
      throw new Error(`Error al subir datos a Drive: ${uploadRes.statusText}`);
    }

    localStorage.setItem('asistencia_last_cloud_sync', new Date().toLocaleTimeString());

    if (showNotifications && typeof window.showNotif === 'function') {
      window.showNotif('Nube Sincronizada', 'Respaldo guardado correctamente en Google Drive.');
    }
    return true;
  } catch (err) {
    console.error('[GoogleDrive] Error en sincronización:', err);
    if (err.message === 'TOKEN_EXPIRED_OR_NOT_CONNECTED') {
      if (showNotifications && typeof window.showNotif === 'function') {
        window.showNotif('Google Desconectado', 'Conecta tu cuenta de Google para respaldar en la nube.');
      }
    } else if (showNotifications && typeof window.showNotif === 'function') {
      window.showNotif('Error en Nube', err.message || 'No se pudo sincronizar con Google Drive.');
    }
    return false;
  }
}

/**
 * Restaura los datos desde el archivo de respaldo guardado en Google Drive
 */
export async function restoreFromGoogleDrive() {
  try {
    const token = await getValidToken();

    if (typeof window.showNotif === 'function') {
      window.showNotif('Buscando Respaldo...', 'Consultando Google Drive');
    }

    const fileName = 'asistencia_app_backup.json';
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+trashed=false`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!searchRes.ok) throw new Error('Error buscando archivo en Drive');
    const searchData = await searchRes.json();

    if (!searchData.files || searchData.files.length === 0) {
      if (typeof window.showNotif === 'function') {
        window.showNotif('Respaldo No Encontrado', 'No existe un archivo de respaldo en tu Google Drive.');
      }
      return false;
    }

    const fileId = searchData.files[0].id;
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const downloadRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!downloadRes.ok) throw new Error('Error al descargar datos de Drive');
    const backupData = await downloadRes.json();

    if (backupData && backupData.app === 'AsistenciaApp') {
      if (backupData.groups) localStorage.setItem('asistencia_groups', JSON.stringify(backupData.groups));
      if (backupData.schedule) localStorage.setItem('asistencia_schedule', JSON.stringify(backupData.schedule));
      if (backupData.tareas) localStorage.setItem('asistencia_tareas', JSON.stringify(backupData.tareas));
      if (backupData.scheduleDays) localStorage.setItem('asistencia_schedule_days', JSON.stringify(backupData.scheduleDays));
      if (backupData.scheduleShift) localStorage.setItem('asistencia_schedule_shift', backupData.scheduleShift);

      if (backupData.teacher) {
        if (backupData.teacher.name) localStorage.setItem('asistencia_teacher_name', backupData.teacher.name);
        if (backupData.teacher.bio) localStorage.setItem('asistencia_teacher_bio', backupData.teacher.bio);
        if (backupData.teacher.subject) localStorage.setItem('asistencia_teacher_subject', backupData.teacher.subject);
        if (backupData.teacher.phone) localStorage.setItem('asistencia_teacher_phone', backupData.teacher.phone);
        if (backupData.teacher.gender) localStorage.setItem('asistencia_teacher_gender', backupData.teacher.gender);
        if (backupData.teacher.role) localStorage.setItem('asistencia_teacher_role', backupData.teacher.role);
        if (backupData.teacher.photo) localStorage.setItem('asistencia_teacher_photo', backupData.teacher.photo);
      }

      if (backupData.securityConfig) localStorage.setItem('asistencia_security_config', JSON.stringify(backupData.securityConfig));
      if (backupData.guardianProfile) localStorage.setItem('asistencia_guardian_profile', JSON.stringify(backupData.guardianProfile));
      if (backupData.studentProfile) localStorage.setItem('asistencia_student_profile', JSON.stringify(backupData.studentProfile));

      if (typeof window.showNotif === 'function') {
        window.showNotif('Restauración Exitosa', 'Tus datos han sido recuperados desde Google Drive.');
      }

      setTimeout(() => {
        window.location.reload();
      }, 1000);
      return true;
    } else {
      throw new Error('El archivo encontrado no corresponde a un formato válido de AsistenciaApp.');
    }
  } catch (err) {
    console.error('[GoogleDrive] Error al restaurar:', err);
    if (typeof window.showNotif === 'function') {
      window.showNotif('Error de Restauración', err.message || 'No se pudieron recuperar los datos.');
    }
    return false;
  }
}

// Exponer funciones globales
window.connectGoogleAccount = connectGoogleAccount;
window.disconnectGoogleAccount = disconnectGoogleAccount;
window.syncWithGoogleDrive = syncWithGoogleDrive;
window.restoreFromGoogleDrive = restoreFromGoogleDrive;
window.setGoogleClientId = setGoogleClientId;
window.getGoogleClientId = getGoogleClientId;
