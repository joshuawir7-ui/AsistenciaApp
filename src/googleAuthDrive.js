/**
 * googleAuthDrive.js
 * Google OAuth 2.0 + Google Drive API v3 — Real implementation
 * AsistenciaApp (https://asistencia-app-omega.vercel.app/)
 */

// ─── Scopes ───────────────────────────────────────────────────────────────────
const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

// ─── State ────────────────────────────────────────────────────────────────────
// VITE_ prefix is required for Vite to expose env vars to the browser bundle.
// In production: set VITE_GOOGLE_CLIENT_ID in Vercel → Settings → Environment Variables
// In development: set VITE_GOOGLE_CLIENT_ID in the .env file at the project root
let GOOGLE_CLIENT_ID = (import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID)
  || localStorage.getItem('asistencia_google_client_id')
  || '';

let tokenClient = null;
let currentAccessToken = localStorage.getItem('asistencia_google_access_token') || null;
let tokenExpiresAt = parseInt(localStorage.getItem('asistencia_google_token_expires_at') || '0', 10);

// ── Diagnostic: log module load status so any silent failure is immediately visible ──
// These logs appear in DevTools → Console on every page load.
console.log('[GoogleAuth] Module loaded.');
console.log('[GoogleAuth] VITE env Client ID:', import.meta.env.VITE_GOOGLE_CLIENT_ID ? '✓ SET' : '✗ UNDEFINED (check Vercel env vars)');
console.log('[GoogleAuth] localStorage Client ID:', localStorage.getItem('asistencia_google_client_id') ? '✓ SET' : '✗ not set');
console.log('[GoogleAuth] Final Client ID in use:', GOOGLE_CLIENT_ID ? `✓ SET (${GOOGLE_CLIENT_ID.slice(0,15)}...)` : '✗ EMPTY — login will fail');

// Expose to window so other modules can read the status for cross-module debugging
window.__GOOGLE_CLIENT_ID_DEBUG__ = GOOGLE_CLIENT_ID ? 'SET' : 'UNDEFINED';


// ─── SDK Loader ───────────────────────────────────────────────────────────────
/**
 * Loads the Google Identity Services SDK.
 * Handles the edge case where the script tag exists but hasn't fired onload yet.
 */
export function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existingScript = document.getElementById('google-gsi-script');

    if (existingScript) {
      // Script tag already in DOM — poll until window.google is available
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (window.google?.accounts?.oauth2) {
          clearInterval(poll);
          resolve();
        } else if (attempts > 50) { // 5 seconds max
          clearInterval(poll);
          reject(new Error('Google SDK timed out'));
        }
      }, 100);
      return;
    }

    // Inject the script tag
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log('[GoogleAuth] Google Identity Services SDK loaded.');
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK'));
    document.head.appendChild(script);
  });
}

// ─── Client ID helpers ────────────────────────────────────────────────────────
export function setGoogleClientId(id) {
  if (!id || !id.trim()) return;
  GOOGLE_CLIENT_ID = id.trim();
  localStorage.setItem('asistencia_google_client_id', GOOGLE_CLIENT_ID);
  tokenClient = null; // Force re-init with new Client ID
  console.log('[GoogleAuth] Client ID updated and saved to localStorage.');
}

export function getGoogleClientId() {
  return GOOGLE_CLIENT_ID;
}

// ─── Token client init ────────────────────────────────────────────────────────
/**
 * Initializes (or re-initializes) the OAuth2 token client.
 * Always re-creates if called with a different Client ID.
 */
async function initTokenClient() {
  await loadGoogleScript();

  // Re-read Client ID in case it was updated after module load
  if (!GOOGLE_CLIENT_ID) {
    GOOGLE_CLIENT_ID = localStorage.getItem('asistencia_google_client_id') || '';
  }

  if (!GOOGLE_CLIENT_ID) {
    console.error(
      '[GoogleAuth] VITE_GOOGLE_CLIENT_ID is not defined.\n' +
      '→ Local dev: add it to .env as VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com\n' +
      '→ Production: add it to Vercel → Settings → Environment Variables, then Redeploy.'
    );
    throw new Error('CLIENT_ID_MISSING');
  }

  // Only initialize once to prevent race conditions if user double-clicks the login button.
  // Re-initializing while a popup is open can orphan the previous popup's callback listener.
  if (tokenClient) return;

  if (window.google?.accounts?.oauth2) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: handleTokenResponse,
      ux_mode: 'redirect',
      redirect_uri: window.location.origin
    });
    console.log('[GoogleAuth] Token client initialized with Client ID:', GOOGLE_CLIENT_ID.slice(0, 12) + '...');
  } else {
    throw new Error('Google SDK not available after loading');
  }
}

// ─── Token response handler ───────────────────────────────────────────────────
async function handleTokenResponse(tokenResponse) {
  console.log('[GoogleAuth] OAuth callback fired:', JSON.stringify({
    hasToken: !!tokenResponse?.access_token,
    error: tokenResponse?.error || null,
    errorDescription: tokenResponse?.error_description || null,
    expiresIn: tokenResponse?.expires_in || null
  }));

  if (tokenResponse.error) {
    // access_denied = user closed popup; popup_closed_by_user = same
    if (tokenResponse.error === 'access_denied' || tokenResponse.error === 'popup_closed_by_user') {
      console.log('[GoogleAuth] User closed the popup or denied access.');
      return;
    }
    console.error('[GoogleAuth] OAuth error:', tokenResponse.error, tokenResponse.error_description);
    if (typeof window.showNotif === 'function') {
      window.showNotif('Error de Google', `No se pudo iniciar sesión: ${tokenResponse.error_description || tokenResponse.error}`);
    }
    return;
  }

  if (!tokenResponse.access_token) {
    console.warn('[GoogleAuth] Callback fired but no access_token present. Full response:', tokenResponse);
    return;
  }

  // ── Store token ──────────────────────────────────────────────────────────
  currentAccessToken = tokenResponse.access_token;
  const expiresIn = parseInt(tokenResponse.expires_in || '3600', 10);
  tokenExpiresAt = Date.now() + expiresIn * 1000;

  localStorage.setItem('asistencia_google_access_token', currentAccessToken);
  localStorage.setItem('asistencia_google_token_expires_at', String(tokenExpiresAt));
  localStorage.setItem('asistencia_google_connected', 'true');

  console.log('[GoogleAuth] Token stored. Fetching Google profile...');

  // ── Fetch profile ────────────────────────────────────────────────────────
  try {
    // Fetch Google profile using the token
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
    });

    if (userInfoResponse.ok) {
      const profile = await userInfoResponse.json();
      console.log('[GoogleAuth] Profile received:', JSON.stringify({
        name: profile.name,
        email: profile.email,
        hasPicture: !!profile.picture
      }));
      
      localStorage.setItem('asistencia_google_name', profile.name || '');
      localStorage.setItem('asistencia_google_email', profile.email || '');
      localStorage.setItem('asistencia_google_picture', profile.picture || '');
      
      // Also update the main teacher profile with Google data
      if (profile.name) localStorage.setItem('asistencia_teacher_name', profile.name);
      if (profile.picture) localStorage.setItem('asistencia_teacher_photo', profile.picture);
    }
    
    // Show success notification
    if (typeof window.showNotif === 'function') {
      window.showNotif('Conexión Exitosa', 'Tu cuenta de Google ha sido vinculada.');
    }
    
    if (typeof window.updateGoogleUI === 'function') {
      window.updateGoogleUI();
    }
  } catch (err) {
    console.error('[GoogleAuth] Error handling token response:', err);
    if (typeof window.showNotif === 'function') {
      window.showNotif('Conexión Fallida', 'No se pudo vincular la cuenta de Google.');
    }
  }

  // ── Auto-sync to Drive ───────────────────────────────────────────────────
  console.log('[GoogleAuth] Starting background Drive sync...');
  try {
    await syncWithGoogleDrive(false);
    console.log('[GoogleAuth] Background sync complete.');
  } catch (syncErr) {
    console.warn('[GoogleAuth] Background sync failed (non-critical):', syncErr);
  }
}

// ─── Fetch user profile ────────────────────────────────────────────────────────
async function fetchAndSaveUserProfile(accessToken) {
  try {
    console.log('[GoogleAuth] Fetching userinfo...');
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`userinfo returned ${res.status}: ${errText}`);
    }

    const profile = await res.json();
    console.log('[GoogleAuth] Profile received:', JSON.stringify({
      name: profile.name,
      email: profile.email,
      hasPicture: !!profile.picture
    }));

    const email = profile.email || '';
    const name = profile.name || profile.given_name || 'Profesor';
    const picture = profile.picture || '';

    // ── Persist in localStorage ──────────────────────────────────────────
    localStorage.setItem('asistencia_google_email', email);
    localStorage.setItem('asistencia_google_name', name);
    localStorage.setItem('asistencia_google_picture', picture);

    // ── Override app teacher profile with Google data ─────────────────────
    localStorage.setItem('asistencia_teacher_name', name);
    window.teacherName = name;

    if (picture) {
      localStorage.setItem('asistencia_teacher_photo', picture);
      window.teacherPhoto = picture;
    }

    // ── Update teacher name in any visible DOM elements ───────────────────
    const nameEl = document.getElementById('teacher-name');
    if (nameEl) nameEl.textContent = name;

    const nameInput = document.getElementById('teacher-name-input');
    if (nameInput) nameInput.value = name;

    // ── Update the main app avatar (profile settings page) ────────────────
    const avatarDisplay = document.getElementById('profile-avatar-display');
    if (avatarDisplay && picture) {
      avatarDisplay.innerHTML = `<img src="${picture}" referrerpolicy="no-referrer"
        style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="${name}" />`;
    }

    // ── Re-sync settings UI ───────────────────────────────────────────────
    if (typeof window.syncSettingsUI === 'function') window.syncSettingsUI();
    if (typeof window.initGreeting === 'function') window.initGreeting();

    return profile;
  } catch (err) {
    console.error('[GoogleAuth] fetchAndSaveUserProfile failed:', err.message || err);
    // Do NOT swallow this silently — if profile fetch fails the user still appears connected
    // but with placeholder data. At least log it clearly.
    throw err;
  }
}

// ─── Connect ───────────────────────────────────────────────────────────────────
export async function connectGoogleAccount() {
  // Re-read in case it was stored in localStorage from a previous session
  if (!GOOGLE_CLIENT_ID) {
    GOOGLE_CLIENT_ID = localStorage.getItem('asistencia_google_client_id') || '';
  }

  if (!GOOGLE_CLIENT_ID) {
    console.error('[GoogleAuth] Cannot connect: VITE_GOOGLE_CLIENT_ID is not configured.');
    if (typeof window.showNotif === 'function') {
      window.showNotif('Configuración incompleta', 'El login de Google no está configurado. Agrega VITE_GOOGLE_CLIENT_ID en Vercel.');
    }
    return;
  }

  try {
    await initTokenClient();
    if (tokenClient) {
      console.log('[GoogleAuth] Requesting access token (opening Google popup)...');
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    }
  } catch (err) {
    console.error('[GoogleAuth] connectGoogleAccount error:', err.message || err);
    if (typeof window.showNotif === 'function') {
      window.showNotif('Error', 'No se pudo abrir el inicio de sesión de Google. Verifica la consola.');
    }
  }
}

// ─── Disconnect ────────────────────────────────────────────────────────────────
export function disconnectGoogleAccount() {
  if (currentAccessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(currentAccessToken, () => {
      console.log('[GoogleAuth] Token revoked.');
    });
  }

  currentAccessToken = null;
  tokenExpiresAt = 0;
  tokenClient = null; // Force re-init on next login

  const keysToRemove = [
    'asistencia_google_connected',
    'asistencia_google_access_token',
    'asistencia_google_token_expires_at',
    'asistencia_google_email',
    'asistencia_google_name',
    'asistencia_google_picture',
    'asistencia_last_cloud_sync'
  ];
  keysToRemove.forEach(k => localStorage.removeItem(k));

  console.log('[GoogleAuth] Disconnected. All auth data cleared.');

  if (typeof window.updateGoogleUI === 'function') window.updateGoogleUI();
  if (typeof window.showNotif === 'function') {
    window.showNotif('Sesión cerrada', 'Se desvinculó la cuenta de Google.');
  }
}

// ─── Token validity ────────────────────────────────────────────────────────────
export function isGoogleConnected() {
  const flag = localStorage.getItem('asistencia_google_connected') === 'true';
  const hasToken = !!currentAccessToken;
  const valid = Date.now() < tokenExpiresAt;
  return flag && hasToken && valid;
}

async function getValidToken() {
  if (!isGoogleConnected()) {
    throw new Error('TOKEN_EXPIRED_OR_NOT_CONNECTED');
  }
  return currentAccessToken;
}

// ─── Sync to Drive ─────────────────────────────────────────────────────────────
export async function syncWithGoogleDrive(showNotifications = true) {
  try {
    const token = await getValidToken();

    if (showNotifications && typeof window.showNotif === 'function') {
      window.showNotif('Sincronizando...', 'Guardando respaldo en Google Drive');
    }

    const appBackupData = {
      app: 'AsistenciaApp',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      teacher: {
        name:    localStorage.getItem('asistencia_teacher_name') || '',
        bio:     localStorage.getItem('asistencia_teacher_bio') || '',
        subject: localStorage.getItem('asistencia_teacher_subject') || '',
        phone:   localStorage.getItem('asistencia_teacher_phone') || '',
        gender:  localStorage.getItem('asistencia_teacher_gender') || '',
        role:    localStorage.getItem('asistencia_teacher_role') || '',
        photo:   localStorage.getItem('asistencia_teacher_photo') || ''
      },
      groups:        JSON.parse(localStorage.getItem('asistencia_groups') || '[]'),
      schedule:      JSON.parse(localStorage.getItem('asistencia_schedule') || '[]'),
      tareas:        JSON.parse(localStorage.getItem('asistencia_tareas') || '[]'),
      scheduleDays:  JSON.parse(localStorage.getItem('asistencia_schedule_days') || '[]'),
      scheduleShift: localStorage.getItem('asistencia_schedule_shift') || 'matutino',
      securityConfig:   JSON.parse(localStorage.getItem('asistencia_security_config') || '{}'),
      guardianProfile:  JSON.parse(localStorage.getItem('asistencia_guardian_profile') || '{}'),
      studentProfile:   JSON.parse(localStorage.getItem('asistencia_student_profile') || '{}')
    };

    const fileName = 'asistencia_app_backup.json';
    const fileContent = JSON.stringify(appBackupData, null, 2);

    // 1. Check if file already exists in Drive
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+trashed=false&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchRes.ok) {
      if (searchRes.status === 401) {
        disconnectGoogleAccount();
        throw new Error('Token expirado. Por favor vuelve a iniciar sesión con Google.');
      }
      throw new Error(`Drive search failed: ${searchRes.status} ${searchRes.statusText}`);
    }

    const searchData = await searchRes.json();
    const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

    // 2. Build multipart body
    const boundary = 'gc_asistencia_boundary_2025';
    const metadata = { name: fileName, mimeType: 'application/json' };
    const body =
      `\r\n--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      `\r\n--${boundary}--`;

    // 3. Upload (PATCH if exists, POST if new)
    const uploadUrl = existingFile
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const uploadMethod = existingFile ? 'PATCH' : 'POST';

    const uploadRes = await fetch(uploadUrl, {
      method: uploadMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Drive upload failed: ${uploadRes.status} — ${errText.slice(0, 200)}`);
    }

    const uploadData = await uploadRes.json();
    const syncTime = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('asistencia_last_cloud_sync', syncTime);

    console.log('[GoogleDrive] Sync successful. File:', uploadData.id || existingFile?.id);

    if (showNotifications && typeof window.showNotif === 'function') {
      window.showNotif('✓ Guardado en Drive', `Respaldo actualizado a las ${syncTime}`);
    }

    // Update last sync label without full re-render
    const syncLabel = document.getElementById('google-last-sync-time');
    if (syncLabel) syncLabel.textContent = `Último respaldo: Hoy a las ${syncTime}`;

    return true;
  } catch (err) {
    console.error('[GoogleDrive] Sync error:', err.message || err);
    if (err.message === 'TOKEN_EXPIRED_OR_NOT_CONNECTED') {
      if (showNotifications && typeof window.showNotif === 'function') {
        window.showNotif('No conectado', 'Inicia sesión con Google primero.');
      }
    } else if (showNotifications && typeof window.showNotif === 'function') {
      window.showNotif('Error de Drive', err.message || 'No se pudo guardar en la nube.');
    }
    return false;
  }
}

// ─── Restore from Drive ────────────────────────────────────────────────────────
export async function restoreFromGoogleDrive() {
  try {
    const token = await getValidToken();

    if (typeof window.showNotif === 'function') {
      window.showNotif('Buscando respaldo...', 'Consultando Google Drive');
    }

    const fileName = 'asistencia_app_backup.json';
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+trashed=false&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchRes.ok) throw new Error(`Drive search failed: ${searchRes.status}`);
    const searchData = await searchRes.json();

    if (!searchData.files || searchData.files.length === 0) {
      if (typeof window.showNotif === 'function') {
        window.showNotif('Sin respaldo', 'No existe ningún archivo de respaldo en tu Google Drive todavía.');
      }
      return false;
    }

    const fileId = searchData.files[0].id;
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!downloadRes.ok) throw new Error(`Drive download failed: ${downloadRes.status}`);
    const backupData = await downloadRes.json();

    if (!backupData || backupData.app !== 'AsistenciaApp') {
      throw new Error('El archivo encontrado no es un respaldo válido de AsistenciaApp.');
    }

    // Apply backup data
    const keys = {
      groups:        'asistencia_groups',
      schedule:      'asistencia_schedule',
      tareas:        'asistencia_tareas',
      scheduleDays:  'asistencia_schedule_days',
      scheduleShift: 'asistencia_schedule_shift'
    };

    Object.entries(keys).forEach(([backupKey, storageKey]) => {
      if (backupData[backupKey] !== undefined) {
        const val = typeof backupData[backupKey] === 'string'
          ? backupData[backupKey]
          : JSON.stringify(backupData[backupKey]);
        localStorage.setItem(storageKey, val);
      }
    });

    if (backupData.teacher) {
      const t = backupData.teacher;
      if (t.name)    localStorage.setItem('asistencia_teacher_name', t.name);
      if (t.bio)     localStorage.setItem('asistencia_teacher_bio', t.bio);
      if (t.subject) localStorage.setItem('asistencia_teacher_subject', t.subject);
      if (t.phone)   localStorage.setItem('asistencia_teacher_phone', t.phone);
      if (t.gender)  localStorage.setItem('asistencia_teacher_gender', t.gender);
      if (t.role)    localStorage.setItem('asistencia_teacher_role', t.role);
      if (t.photo)   localStorage.setItem('asistencia_teacher_photo', t.photo);
    }

    if (backupData.securityConfig) localStorage.setItem('asistencia_security_config', JSON.stringify(backupData.securityConfig));
    if (backupData.guardianProfile) localStorage.setItem('asistencia_guardian_profile', JSON.stringify(backupData.guardianProfile));
    if (backupData.studentProfile)  localStorage.setItem('asistencia_student_profile', JSON.stringify(backupData.studentProfile));

    console.log('[GoogleDrive] Restore successful. Timestamp:', backupData.timestamp);

    if (typeof window.showNotif === 'function') {
      window.showNotif('✓ Restauración exitosa', 'Tus datos fueron recuperados desde Google Drive. Recargando...');
    }

    setTimeout(() => window.location.reload(), 1200);
    return true;
  } catch (err) {
    console.error('[GoogleDrive] Restore error:', err.message || err);
    if (err.message === 'TOKEN_EXPIRED_OR_NOT_CONNECTED') {
      if (typeof window.showNotif === 'function') {
        window.showNotif('No conectado', 'Inicia sesión con Google primero.');
      }
    } else if (typeof window.showNotif === 'function') {
      window.showNotif('Error de restauración', err.message || 'No se pudo recuperar el respaldo.');
    }
    return false;
  }
}

// ─── Global exports ────────────────────────────────────────────────────────────
window.connectGoogleAccount = connectGoogleAccount;
window.disconnectGoogleAccount = disconnectGoogleAccount;
window.syncWithGoogleDrive = syncWithGoogleDrive;
window.restoreFromGoogleDrive = restoreFromGoogleDrive;
window.setGoogleClientId = setGoogleClientId;
window.getGoogleClientId = getGoogleClientId;

// ─── OAuth Redirect Return Handler ────────────────────────────────────────────
/**
 * When the browser blocks the popup, Google Identity Services falls back to a
 * full-page redirect. Google returns to the app with the access token in the
 * URL hash fragment: #access_token=TOKEN&expires_in=3600&...
 *
 * This function MUST be called on every page load (before any other logic)
 * so the token is captured immediately when the page reloads from the redirect.
 *
 * It also logs all URL parameters so any misconfiguration is immediately visible
 * in DevTools → Console.
 */
export function checkOAuthRedirectReturn() {
  const fullUrl = window.location.href;
  const hash = window.location.hash;
  const search = window.location.search;

  // Always log the return URL for diagnostics — this is what the user requested
  console.log('[OAUTH RETURN] Page loaded. Full URL:', fullUrl);
  console.log('[OAUTH RETURN] Hash fragment:', hash || '(empty)');
  console.log('[OAUTH RETURN] Query string:', search || '(empty)');

  // ── Case 1: Implicit flow — token is in the hash fragment (#access_token=...) ──
  if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in') || '3600';
    const error = params.get('error');

    // Clean the token from the URL immediately so it's not visible or reprocessed on refresh
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    if (error) {
      console.error('[OAUTH RETURN] Google returned an error:', error, params.get('error_description'));
      if (typeof window.showNotif === 'function') {
        window.showNotif('Error de Google', params.get('error_description') || error);
      }
      return;
    }

    if (accessToken) {
      console.log('[OAUTH RETURN] ✓ access_token found in URL hash. Processing OAuth redirect return...');
      // Feed the token into the same handler used by the popup callback
      handleTokenResponse({ access_token: accessToken, expires_in: expiresIn });
      return;
    }
  }

  // ── Case 2: Authorization code flow — code is in the query string (?code=...) ──
  // This flow requires a backend to exchange the code for a token (needs client_secret).
  // AsistenciaApp has no backend, so we detect this and log a clear error.
  if (search && search.includes('code=')) {
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const error = params.get('error');

    window.history.replaceState(null, '', window.location.pathname);

    if (error) {
      console.error('[OAUTH RETURN] Auth code flow returned error:', error);
      return;
    }

    if (code) {
      console.error(
        '[OAUTH RETURN] Authorization code detected but this app has no backend to exchange it.\n' +
        'Switch to implicit flow (response_type=token) or Google Identity Services with ux_mode=popup.\n' +
        'Code (for debugging):', code.slice(0, 20) + '...'
      );
      if (typeof window.showNotif === 'function') {
        window.showNotif('Configuración incorrecta', 'El flujo OAuth necesita ajustarse. Contacta al desarrollador.');
      }
    }
    return;
  }

  // ── No OAuth parameters found — normal page load ──────────────────────────────
  console.log('[OAUTH RETURN] No OAuth parameters found in URL — normal page load.');
}

window.getGoogleClientId = getGoogleClientId;
