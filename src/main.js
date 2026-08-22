import './style.css';
import { AlumnosModule } from './alumnosModule.js';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  syncWithGoogleDrive as driveSync,
  restoreFromGoogleDrive as driveRestore,
  loadGoogleScript
} from './googleAuthDrive.js';

function getTeacherAvatarHTML(photoUrl, size = '100%') {
  if (photoUrl && photoUrl.trim() !== '') {
    return `<img src="${photoUrl}" style="width: ${size}; height: ${size}; object-fit: cover;" alt="Docente" />`;
  }
  return `
    <svg viewBox="0 0 24 24" fill="none" style="width: ${size}; height: ${size}; background: #cbd5e1; display: block;">
      <circle cx="12" cy="8.5" r="4" fill="white" />
      <path d="M4 19c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6v1H4v-1z" fill="white" />
    </svg>
  `;
}

function safeParseJSON(key, defaultVal) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : defaultVal;
  } catch (e) {
    console.error("Error parsing localStorage key:", key, e);
    return defaultVal;
  }
}

// DATA AND PERSISTENCE

const defaultJulHistory = (() => {
  const arr = Array(35).fill('empty');
  // Semana 3 (w=2)
  arr[14] = 'absent';
  arr[15] = 'present';
  arr[16] = 'present';
  arr[17] = 'present';
  arr[18] = 'late';

  // Semana 4 (w=3)
  arr[21] = 'present';
  arr[22] = 'present';

  return { Jul: arr, Mar: [...arr] };
})();

const defaultStudents = [
  { id: '101-P', name: 'Ariana García', initials: 'AG', color: '#3b82f6', history: defaultJulHistory, createdAt: 1710400000000, age: '17', gender: 'F', guardianName: 'Carmen García', contact: '+507 6123-4567', diseases: 'Alergia al polen, Asma leve' },
  { id: '102-P', name: 'Luis Martínez', initials: 'LM', color: '#8b5cf6', history: {}, createdAt: 1710400010000, age: '18', gender: 'M', guardianName: 'Roberto Martínez', contact: '+507 6222-1111', diseases: 'Ninguna' },
  { id: '103-P', name: 'Sofía Ramos', initials: 'SR', color: '#14b8a6', history: {}, createdAt: 1710400020000, age: '17', gender: 'F', guardianName: 'Elena Ramos', contact: '+507 6333-2222', diseases: 'Diabetes Tipo 1' },
  { id: '104-P', name: 'Carlos Herrera', initials: 'CH', color: '#f59e0b', history: {}, createdAt: 1710400030000, age: '18', gender: 'M', guardianName: 'Juan Herrera', contact: '+507 6444-3333', diseases: 'Ninguna' },
  { id: '105-P', name: 'Valentina López', initials: 'VL', color: '#ec4899', history: {}, createdAt: 1710400040000, age: '17', gender: 'F', guardianName: 'Lucía López', contact: '+507 6555-4444', diseases: 'Ninguna' },
  { id: '106-P', name: 'Diego Castillo', initials: 'DC', color: '#10b981', history: {}, createdAt: 1710400050000, age: '18', gender: 'M', guardianName: 'Pedro Castillo', contact: '+507 6666-5555', diseases: 'Eczema' },
];

const defaultGroups = [
  {
    id: 'g1',
    name: '12°A - Ciencias',
    description: 'Ciencias Naturales y Tecnología',
    students: defaultStudents
  },
  {
    id: 'g2',
    name: '12°B - Letras',
    description: 'Humanidades y Ciencias Sociales',
    students: [
      { id: '201-P', name: 'Juan García Pérez', initials: 'JG', color: '#10b981', history: {}, createdAt: 1710400060000 },
      { id: '202-P', name: 'Alberto Martín López', initials: 'AM', color: '#3b82f6', history: {}, createdAt: 1710400070000 }
    ]
  }
];

let groups = safeParseJSON('asistencia_groups', defaultGroups);
let activeGroupIdx = safeParseJSON('asistencia_active_group_idx', 0);
let students = groups[activeGroupIdx] ? groups[activeGroupIdx].students : [];
let tareas = safeParseJSON('asistencia_tareas', []);

function cleanupOldTareas() {
  const fortyDaysMs = 40 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const initialLength = tareas.length;
  tareas = tareas.filter(task => {
    const ts = parseInt(task.id.replace('t-', ''));
    if (isNaN(ts)) return true;
    return (now - ts) < fortyDaysMs;
  });
  if (tareas.length !== initialLength) {
    localStorage.setItem('asistencia_tareas', JSON.stringify(tareas));
  }
}

// Cleanup old example data if present to fulfill user request of "only teacher tasks"
if (tareas.length > 0 && tareas[0].id === 't-1') {
  tareas = [];
  localStorage.removeItem('asistencia_tareas');
}

// Run 40-day expiration check on load
cleanupOldTareas();

let citaciones = safeParseJSON('asistencia_citaciones', []);

let studentTaskStates = safeParseJSON('asistencia_student_task_states', {});
let studentNotes = safeParseJSON('asistencia_student_notes', {});
let teacherMessages = safeParseJSON('asistencia_teacher_messages', []);

let cellLastModified = safeParseJSON('asistencia_last_modified', {});

function markCellLastModified(studentName, mKey, dIdx) {
  const groupId = groups[activeGroupIdx]?.id || 'unknown';
  const key = `${groupId}_${studentName}_${mKey}_${dIdx}`;
  cellLastModified[key] = Date.now();
  localStorage.setItem('asistencia_last_modified', JSON.stringify(cellLastModified));
}

function getMonthIdxFromKey(mKey) {
  const spanishKeys = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const englishKeys = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let idx = spanishKeys.indexOf(mKey);
  if (idx === -1) {
    idx = englishKeys.indexOf(mKey);
  }
  return idx !== -1 ? idx : 0;
}

let securityConfig = safeParseJSON('asistencia_security_config', {
  basic: false,
  pencil: false,
  ink: false,
  masterHash: null,
  masterPlain: '',
  language: 'es'
});

// Migración: asegurar que language existe
if (!securityConfig.language) securityConfig.language = 'es';


// I18N SYSTEM
const translations = {
  es: {
    sidebar_asistencia: "Asistencia",
    sidebar_grupos: "Grupos",
    sidebar_tareas: "Tareas",
    sidebar_mensajes: "Mensajes",
    sidebar_ajustes: "Ajustes",
    welcome_title: "Bienvenido al sistema",
    welcome_subtitle: "Selecciona tu perfil para acceder a las funciones correspondientes del sistema de gestión escolar.",
    btn_teacher: "Perfil Docente",
    btn_guardian: "Perfil Acudiente",
    btn_back: "Volver",
    tab_week: "Semana",
    tab_month: "Mes",
    tab_quarter: "Trimestre",
    lock_btn: "Bloquear Edición",
    lock_basic: "Bloqueo",
    lock_pencil: "A Lápiz",
    lock_ink: "Tinta permanente",
    add_student_title: "Nuevo Estudiante",
    add_student_desc: "",
    placeholder_student: "Ej: Juan Pérez",
    btn_cancel: "Cancelar",
    btn_add_student: "Añadir Estudiante",
    add_group_title: "Nuevo Grupo",
    add_group_desc: "",
    placeholder_group: "Ej: 12°A - Ciencias",
    btn_create_group: "Crear Grupo",
    tasks_empty_title: "No hay tareas pendientes",
    tasks_empty_desc: "Comienza agregando una nueva tarea para este grupo.",
    btn_new_task: "Nueva Tarea",
    btn_create_citation: "Crear Citación",
    settings_title: "Configuración",
    settings_profile: "Perfil del Docente",
    settings_ui: "Preferencias de Interfaz",
    settings_security: "Ajustes de Seguridad",
    lang_selection: "Idioma",
    lang_sub: "Selección de idioma del sistema",
    theme_title: "Tema Visual",
    theme_sub: "Elige entre modo claro o modo oscuro",
    time_format: "Formato de Hora",
    time_sub: "Elige entre formato de 12 o 24 horas",
    master_pass_label: "Contraseña Maestra",
    master_pass_sub: "Configura una contraseña maestra para habilitar opciones avanzadas de seguridad en el candado de asistencia (A Lápiz y Tinta Permanente).",
    btn_save: "Guardar",
    btn_manage_days: "Gestionar Días",
    btn_more_settings: "Más Ajustes",
    task_photo_label: "Adjuntar Foto / Imagen",
    upload_task_photo: "Subir Foto de la Tarea",
    task_title_label: "Título de la Tarea",
    task_subject_label: "Materia",
    task_date_label: "Fecha de Entrega",
    task_points_label: "Puntos / Valor",
    notif_security_title: "Seguridad Actualizada",
    notif_security_msg: "Los ajustes de candado han sido guardados.",
    notif_pass_error_title: "Error",
    notif_pass_error_msg: "La contraseña no puede estar vacía.",
    modal_schedule_title: "Agregar al Horario",
    modal_schedule_desc: "Configura una nueva sesión de clase en tu horario semanal.",
    modal_task_desc: "Asigna una nueva actividad pendiente para este grupo. Indica el título y la fecha de entrega.",
    status_empty: "Vacío",
    status_present: "Presente",
    status_late: "Tardanza",
    status_absent: "Falta",
    status_excused: "Justificada",
    status_late_excused: "Tardanza Justificada",
    days: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
    shortDays: ["D", "L", "M", "M", "J", "V", "S"],
    months: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
  },
  en: {
    sidebar_asistencia: "Attendance",
    sidebar_grupos: "Groups",
    sidebar_tareas: "Tasks",
    sidebar_mensajes: "Messages",
    sidebar_ajustes: "Settings",
    welcome_title: "Welcome to the system",
    welcome_subtitle: "Select your profile to access the corresponding school management system functions.",
    btn_teacher: "Teacher Profile",
    btn_guardian: "Guardian Profile",
    btn_back: "Back",
    tab_week: "Week",
    tab_month: "Month",
    tab_quarter: "Quarter",
    lock_btn: "Lock Editing",
    lock_basic: "Basic Lock",
    lock_pencil: "Pencil Mode",
    lock_ink: "Permanent Ink",
    add_student_title: "New Student",
    add_student_desc: "",
    placeholder_student: "Ex: John Doe",
    btn_cancel: "Cancel",
    btn_add_student: "Add Student",
    add_group_title: "New Group",
    add_group_desc: "",
    placeholder_group: "Ex: 12th A - Science",
    btn_create_group: "Create Group",
    tasks_empty_title: "No pending tasks",
    tasks_empty_desc: "Start by adding a new task for this group.",
    btn_new_task: "New Task",
    btn_create_citation: "Create Citation",
    settings_title: "Settings",
    settings_profile: "Teacher Profile",
    settings_ui: "UI Preferences",
    settings_security: "Security Settings",
    lang_selection: "Language",
    lang_sub: "System language selection",
    theme_title: "Visual Theme",
    theme_sub: "Choose between light or dark mode",
    theme_light: "Light Mode",
    theme_dark: "Dark Mode",
    time_format: "Time Format",
    time_sub: "Choose 12 or 24-hour format",
    master_pass_label: "Master Password",
    master_pass_sub: "Set a master password to enable advanced security options for the attendance lock (Pencil and Permanent Ink).",
    btn_save: "Save",
    btn_manage_days: "Manage Days",
    btn_more_settings: "More Settings",
    task_photo_label: "Attach Photo / Image",
    upload_task_photo: "Upload Task Photo",
    task_title_label: "Task Title",
    task_subject_label: "Subject",
    task_date_label: "Due Date",
    task_points_label: "Points / Value",
    notif_security_title: "Security Updated",
    notif_security_msg: "Lock settings have been saved.",
    notif_pass_error_title: "Error",
    notif_pass_error_msg: "Password cannot be empty.",
    modal_schedule_title: "Add to Schedule",
    modal_schedule_desc: "Configure a new class session in your weekly schedule.",
    modal_task_desc: "Assign a new pending activity for this group. Indicate the title and due date.",
    status_empty: "Empty",
    status_present: "Present",
    status_late: "Late",
    status_absent: "Absent",
    status_excused: "Excused",
    status_late_excused: "Late Excused",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    shortDays: ["S", "M", "T", "W", "T", "F", "S"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  }
};

window.setLanguage = function (lang) {
  securityConfig.language = lang;
  localStorage.setItem('asistencia_security_config', JSON.stringify(securityConfig));
  applyStaticTranslations();

  // Re-render components that rely on dynamic strings
  if (typeof renderSchedule === 'function') renderSchedule();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof renderTareas === 'function') renderTareas();
  if (typeof renderTable === 'function') renderTable();
  if (typeof updateMonthLabel === 'function') updateMonthLabel();
  if (typeof renderStudentMatrix === 'function') renderStudentMatrix();
  if (typeof updateLockMenuUI === 'function') if (window.updateLockMenuUI) window.updateLockMenuUI();

  // Sync selects
  const langSelect = document.getElementById('language-select');
  if (langSelect) langSelect.value = lang;
  const basicLangSelect = document.getElementById('basic-language-select');
  if (basicLangSelect) basicLangSelect.value = lang;
  const qsLangSelect = document.getElementById('qs-language-select');
  if (qsLangSelect) qsLangSelect.value = lang;

  if (typeof showNotif === 'function') {
    showNotif(lang === 'es' ? 'Idioma actualizado' : 'Language Updated', lang === 'es' ? 'Se ha cambiado el idioma a Español' : 'Language changed to English');
  }
};

function applyStaticTranslations() {
  const lang = securityConfig.language || 'es';
  const t = translations[lang];

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = t[key];
      } else {
        const textSpan = el.querySelector('.nav-text, span:not(.nav-icon)');
        if (textSpan) {
          textSpan.textContent = t[key];
        } else if (!el.querySelector('svg')) {
          el.textContent = t[key];
        }
      }
    }
  });
}


// Simple hashing function for password protection (sufficient for this use-case)
function hashPassword(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

const defaultSchedule = [
  { subject: 'Matemáticas', groupName: '12°A - Ciencias', day: 'mon', startTime: '7', color: '#3b82f6' },
  { subject: 'Física', groupName: '12°A - Ciencias', day: 'mon', startTime: '8', color: '#8b5cf6' },
  { subject: 'Español', groupName: '12°B - Letras', day: 'tue', startTime: '9', color: '#ec4899' },
  { subject: 'Historia', groupName: '12°B - Letras', day: 'wed', startTime: '10', color: '#f59e0b' },
  { subject: 'Biología', groupName: '12°A - Ciencias', day: 'thu', startTime: '11', color: '#14b8a6' },
];

// Time conversion helpers
function timeStringToMinutes(t) {
  const parts = t.toString().split(':');
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
}

function normalizeTimeString(t) {
  let s = t.toString();
  if (!s.includes(':')) {
    const hr = parseInt(s);
    return `${hr < 10 ? '0' : ''}${hr}:00`;
  }
  const parts = s.split(':');
  const hr = parseInt(parts[0]);
  const min = parseInt(parts[1]) || 0;
  return `${hr < 10 ? '0' : ''}${hr}:${min < 10 ? '0' : ''}${min}`;
}

let schedule = JSON.parse(localStorage.getItem('asistencia_schedule')) || defaultSchedule;
schedule.forEach(item => {
  item.startTime = normalizeTimeString(item.startTime);
});

let currentShift = localStorage.getItem('asistencia_schedule_shift') || 'matutino';
let currentDays = JSON.parse(localStorage.getItem('asistencia_schedule_days')) || ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
let currentHours = JSON.parse(localStorage.getItem('asistencia_schedule_hours')) || [7, 8, 9, 10, 11, 12, 13];
currentHours = currentHours.map(h => normalizeTimeString(h));
currentHours.sort((a, b) => timeStringToMinutes(a) - timeStringToMinutes(b));

let selectedScheduleColor = '#3b82f6';
let timeFormat = localStorage.getItem('asistencia_time_format') || '12h';

// ── FORMAT HELPER ──
function formatHour(h) {
  const isString = typeof h === 'string';
  let hour, min = 0;

  if (isString && h.includes(':')) {
    const parts = h.split(':');
    hour = parseInt(parts[0]);
    min = parseInt(parts[1]) || 0;
  } else {
    hour = parseInt(h);
  }

  const minStr = min < 10 ? '0' + min : min;

  if (timeFormat === '24h') {
    return `${hour < 10 ? '0' : ''}${hour}:${minStr}`;
  } else {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${minStr} ${suffix}`;
  }
}

window.closeOverlay = function (id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  const modal = overlay.querySelector('.modal');

  overlay.classList.add('closing');
  if (modal) modal.classList.add('closing');

  setTimeout(() => {
    overlay.classList.remove('active', 'closing');
    if (modal) modal.classList.remove('closing');
  }, 300);
};

window.setTimeFormat = function (fmt) {
  timeFormat = fmt;
  localStorage.setItem('asistencia_time_format', fmt);

  // Desktop
  const btns = document.querySelectorAll('.time-toggle-item');
  btns.forEach(b => {
    const id = b.id;
    if (id === `time-format-${fmt}`) b.classList.add('active');
    else b.classList.remove('active');
  });

  // Mobile
  const m12 = document.getElementById('m-time-format-12h');
  const m24 = document.getElementById('m-time-format-24h');
  if (m12 && m24) {
    if (fmt === '12h') {
      m12.classList.add('active');
      m24.classList.remove('active');
    } else {
      m24.classList.add('active');
      m12.classList.remove('active');
    }
  }

  if (document.getElementById('schedule-grid')) renderSchedule();
};

window.handleLockOptionClick = function (type) {
  setLockStatus(type);
  const m1 = document.getElementById('lock-menu-dropdown');
  const m2 = document.getElementById('lock-menu-mobile');
  if (m1) m1.style.display = 'none';
  if (m2) m2.style.display = 'none';
};

function setLockStatus(type) {
  if (type === 'pencil') {
    const intendedState = !securityConfig.pencil;
    securityConfig.pencil = intendedState;
    if (intendedState) {
      securityConfig.ink = false;
    }
    localStorage.setItem('asistencia_security_config', JSON.stringify(securityConfig));
    showNotif('Seguridad Actualizada', 'Los ajustes de candado han sido guardados.');
    if (window.updateLockMenuUI) window.updateLockMenuUI();
    return;
  }

  if (type === 'ink') {
    if (!securityConfig.masterHash) {
      showNotif('Configuración Requerida', 'Debes configurar una Contraseña Maestra en Ajustes antes de activar o desactivar esto.', 'error');
      return;
    }
    const intendedState = !securityConfig.ink;
    promptMasterPassword(() => {
      securityConfig.ink = intendedState;
      if (intendedState) {
        securityConfig.pencil = false;
      }
      localStorage.setItem('asistencia_security_config', JSON.stringify(securityConfig));
      showNotif('Seguridad Actualizada', 'Los ajustes de candado han sido guardados.');
      if (window.updateLockMenuUI) window.updateLockMenuUI();
    });
    return;
  }

  securityConfig[type] = !securityConfig[type];
  localStorage.setItem('asistencia_security_config', JSON.stringify(securityConfig));
  showNotif('Seguridad Actualizada', 'Los ajustes de candado han sido guardados.');
  if (window.updateLockMenuUI) window.updateLockMenuUI();
}

window.updateLockMenuUI = function () {
  const ids = ['pencil', 'ink'];
  ids.forEach(id => {
    const isActive = securityConfig[id];
    const desktopEl = document.getElementById(`lock-lbl-${id}`);
    const mobileEl = document.getElementById(`lock-lbl-${id}-m`);

    // Desktop Logic
    if (desktopEl) {
      desktopEl.style.setProperty('color', isActive ? '#3b82f6' : 'var(--text)', 'important');
      desktopEl.classList.toggle('active-option', isActive);
    }

    // Mobile Logic (Screenshot match)
    if (mobileEl) {
      mobileEl.style.color = isActive ? '#3b82f6' : 'var(--text)';
      mobileEl.style.fontWeight = '600';
    }
  });
};

window.saveMasterPassword = function () {
  const input = document.getElementById('master-password-input').value;
  if (input.trim() === '') {
    showNotif('Error', 'La contraseña no puede estar vacía.', 'error');
    return;
  }
  securityConfig.masterHash = hashPassword(input);
  securityConfig.masterPlain = input; // Store for the user to view in settings
  localStorage.setItem('asistencia_security_config', JSON.stringify(securityConfig));

  const statusEl = document.getElementById('master-password-status');
  if (statusEl) {
    statusEl.style.display = 'block';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
  }
  document.getElementById('master-password-input').value = '';

  // Refresh the display in settings
  updateSecuritySettingsUI();
};

function showNotif(title, msg, type = 'success') {
  const notif = document.getElementById('notif');
  const titleEl = document.getElementById('notif-title');
  const msgEl = document.getElementById('notif-msg');
  if (!notif) return;

  const lang = securityConfig.language || 'es';
  const t = translations[lang];
  const finalTitle = (t && t[title]) || title;
  const finalMsg = (t && t[msg]) || msg;

  if (titleEl) titleEl.textContent = finalTitle;
  if (msgEl) msgEl.textContent = finalMsg;

  // Set classes and show
  notif.className = `notification show ${type}`;

  if (window.notifTimeout) clearTimeout(window.notifTimeout);
  window.notifTimeout = setTimeout(() => {
    notif.classList.remove('show');
  }, 3500);
}

window.toggleSavedPasswordVisibility = function () {
  const container = document.getElementById('saved-password-display');
  const btn = document.getElementById('toggle-saved-pw-btn');
  if (!container || !btn) return;

  if (container.style.webkitTextSecurity === 'disc' || container.style.textSecurity === 'disc') {
    container.style.webkitTextSecurity = 'none';
    container.style.textSecurity = 'none';
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
  } else {
    container.style.webkitTextSecurity = 'disc';
    container.style.textSecurity = 'disc';
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
  }
};

function updateSecuritySettingsUI() {
  const displayContainer = document.getElementById('saved-password-display');
  const wrapper = document.getElementById('saved-password-wrapper');
  if (!displayContainer || !wrapper) return;

  if (securityConfig.masterPlain) {
    displayContainer.textContent = securityConfig.masterPlain;
    wrapper.style.display = 'flex';
  } else {
    wrapper.style.display = 'none';
  }
}


const defaultCalendar = {
  t1: { start: '', end: '' },
  t2: { start: '', end: '' },
  t3: { start: '', end: '' }
};
let schoolCalendar = JSON.parse(localStorage.getItem('asistencia_school_calendar')) || defaultCalendar;

window.openCalendarConfig = function () {
  document.getElementById('cal-t1-start').value = schoolCalendar.t1.start;
  document.getElementById('cal-t1-end').value = schoolCalendar.t1.end;
  document.getElementById('cal-t2-start').value = schoolCalendar.t2.start;
  document.getElementById('cal-t2-end').value = schoolCalendar.t2.end;
  document.getElementById('cal-t3-start').value = schoolCalendar.t3.start;
  document.getElementById('cal-t3-end').value = schoolCalendar.t3.end;

  document.getElementById('modal-manage-days').classList.remove('active');
  document.getElementById('modal-config-calendar').classList.add('active');
};

window.saveCalendarConfig = function () {
  schoolCalendar.t1.start = document.getElementById('cal-t1-start').value;
  schoolCalendar.t1.end = document.getElementById('cal-t1-end').value;
  schoolCalendar.t2.start = document.getElementById('cal-t2-start').value;
  schoolCalendar.t2.end = document.getElementById('cal-t2-end').value;
  schoolCalendar.t3.start = document.getElementById('cal-t3-start').value;
  schoolCalendar.t3.end = document.getElementById('cal-t3-end').value;

  localStorage.setItem('asistencia_school_calendar', JSON.stringify(schoolCalendar));
  document.getElementById('modal-config-calendar').classList.remove('active');
  showNotif('Calendario', 'Fechas de los trimestres guardadas.');

  updateMonthLabel();
  if (currentScope === 'trimestre') {
    renderTable();
  }
};

window.handleCalendarPhoto = async function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const btnText = document.getElementById('cal-upload-text');
  const spinner = document.getElementById('cal-upload-spinner');

  btnText.textContent = 'Analizando imagen...';
  spinner.style.display = 'block';

  try {
    const worker = await Tesseract.createWorker('spa');
    const ret = await worker.recognize(file);
    const text = ret.data.text.toLowerCase();
    await worker.terminate();

    const monthMap = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
      'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
      'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
      'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
      'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
      'unio': '06', 'jumo': '06', 'iulio': '07', 'juio': '07', 'agost': '08',
      'sept': '09', 'setiembre': '09', 'nocviembre': '11', 'diciemBre': '12'
    };

    // Permissive text cleaning
    let cleanText = text.replace(/[\n\r]/g, ' ')
      .replace(/[.,;:_]/g, '')
      .replace(/\|/g, 'l')
      .replace(/\s+/g, ' ');

    console.log("OCR Extracted Text:", cleanText); // For debugging purposes

    let trimesters = [];
    // Sort descending so "septiembre" matches before "sep"
    const monthNames = Object.keys(monthMap).sort((a, b) => b.length - a.length).join('|');

    // Pattern 1: Highly permissive date range (ej. "2 de marzo al 29 de mayo")
    // Ignores up to 25 non-digits between month 1 and day 2 to jump over " al ", " hasta ", etc.
    const regex1 = new RegExp(`([0-9]{1,2})[^0-9]{1,15}?(${monthNames})[^0-9]{1,25}?([0-9]{1,2})[^0-9]{1,15}?(${monthNames})`, 'g');

    // Pattern 2: dd/mm/yyyy al dd/mm/yyyy
    const regex2 = /([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]?([0-9]{2,4})?\s*(?:al|a|-)\s*([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]?([0-9]{2,4})?/g;

    let match;
    while ((match = regex1.exec(cleanText)) !== null) {
      trimesters.push({
        startD: match[1], startM: monthMap[match[2]],
        endD: match[3], endM: monthMap[match[4]]
      });
    }

    while ((match = regex2.exec(cleanText)) !== null) {
      trimesters.push({
        startD: match[1], startM: match[2].padStart(2, '0'),
        endD: match[4], endM: match[5].padStart(2, '0')
      });
    }

    // Fallback: Extract all single dates and pair them chronologically if no ranges found
    if (trimesters.length === 0) {
      const regex3 = new RegExp(`([0-9]{1,2})[^0-9]{1,15}?(${monthNames})`, 'g');
      let allDates = [];
      let m;
      while ((m = regex3.exec(cleanText)) !== null) {
        allDates.push({ d: m[1], m: monthMap[m[2]] });
      }
      for (let i = 0; i < allDates.length - 1; i += 2) {
        trimesters.push({
          startD: allDates[i].d, startM: allDates[i].m,
          endD: allDates[i + 1].d, endM: allDates[i + 1].m
        });
      }
    }

    // Filter and score them based on duration (Trimesters usually last 60-100 days)
    // We want to avoid picking up "recesos" (which last ~5 days) or "organización docente" (which last ~5 days)
    const validTrimesters = [];
    for (let t of trimesters) {
      const d1 = new Date(2026, parseInt(t.startM) - 1, parseInt(t.startD));
      const d2 = new Date(2026, parseInt(t.endM) - 1, parseInt(t.endD));
      const days = (d2 - d1) / (1000 * 60 * 60 * 24);

      // If it's longer than 20 days, it's very likely a trimester!
      if (days >= 20 || days < 0 /* crosses year */) {
        t.dateObj = d1;
        validTrimesters.push(t);
      }
    }

    // Sort chronologically
    validTrimesters.sort((a, b) => a.dateObj - b.dateObj);

    const yearMatch = text.match(/20\d{2}/);
    const targetYear = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
    const pad = (n) => n.toString().padStart(2, '0');

    if (validTrimesters.length === 0) {
      showNotif('Revisión requerida', 'No pude detectar las fechas con seguridad. Por favor, ingrésalas manualmente.', 4000);
      return;
    }

    if (validTrimesters.length >= 1) {
      document.getElementById('cal-t1-start').value = `${targetYear}-${validTrimesters[0].startM}-${pad(validTrimesters[0].startD)}`;
      document.getElementById('cal-t1-end').value = `${targetYear}-${validTrimesters[0].endM}-${pad(validTrimesters[0].endD)}`;
    }
    if (validTrimesters.length >= 2) {
      document.getElementById('cal-t2-start').value = `${targetYear}-${validTrimesters[1].startM}-${pad(validTrimesters[1].startD)}`;
      document.getElementById('cal-t2-end').value = `${targetYear}-${validTrimesters[1].endM}-${pad(validTrimesters[1].endD)}`;
    }
    if (validTrimesters.length >= 3) {
      document.getElementById('cal-t3-start').value = `${targetYear}-${validTrimesters[2].startM}-${pad(validTrimesters[2].startD)}`;
      document.getElementById('cal-t3-end').value = `${targetYear}-${validTrimesters[2].endM}-${pad(validTrimesters[2].endD)}`;
    }

    showNotif('¡Calendario escaneado!', `Se han detectado ${validTrimesters.length} trimestres exitosamente.`);
  } catch (err) {
    console.error('Error procesando imagen: ', err);
    showNotif('Error', 'Hubo un error al interpretar la imagen.');
  } finally {
    btnText.textContent = 'Subir Calendario por Foto';
    spinner.style.display = 'none';
    event.target.value = ''; // Reset the input
  }
};

function setShift(shift) {
  if (shift === 'custom') {
    currentShift = 'custom';
    localStorage.setItem('asistencia_schedule_shift', currentShift);
    updateShiftUI();
    return;
  }
  currentShift = shift;
  let rawHours = [];
  if (shift === 'matutino') rawHours = [7, 8, 9, 10, 11, 12, 13];
  else if (shift === 'vespertino') rawHours = [13, 14, 15, 16, 17, 18];
  else if (shift === 'nocturno') rawHours = [18, 19, 20, 21, 22];
  currentHours = rawHours.map(h => normalizeTimeString(h));
  localStorage.setItem('asistencia_schedule_shift', shift);
  localStorage.setItem('asistencia_schedule_hours', JSON.stringify(currentHours));
  updateShiftUI();
  renderSchedule();
}
window.setShift = setShift;

function updateShiftUI() {
  const selectedText = document.getElementById('shift-current-text');
  const selectedIcon = document.getElementById('shift-current-icon');
  if (!selectedText || !selectedIcon) return;

  const labels = {
    matutino: { text: 'Matutino', icon: '☀' },
    vespertino: { text: 'Vespertino', icon: '🌤' },
    nocturno: { text: 'Nocturno', icon: '🌙' },
    custom: { text: 'Personalizado', icon: '⚙️' }
  };

  const current = labels[currentShift] || labels.custom;
  selectedText.textContent = current.text;
  selectedIcon.textContent = current.icon;
}

function clearSlot(day, time) {
  showConfirm('Limpiar Horarios', '¿Deseas limpiar todas las clases en este horario?', () => {
    schedule = schedule.filter(item => !(item.day === day && item.startTime.toString() === time.toString()));
    saveSchedule();
    renderSchedule();
  });
}
window.clearSlot = clearSlot;

function addHourRow() {
  const lastHourStr = currentHours[currentHours.length - 1] || '06:00';
  const parts = lastHourStr.split(':');
  let lastHour = parseInt(parts[0]);
  if (lastHour < 23) {
    const nextHour = lastHour + 1;
    const nextHourStr = `${nextHour < 10 ? '0' : ''}${nextHour}:00`;
    currentHours.push(nextHourStr);
    currentShift = 'custom';
    localStorage.setItem('asistencia_schedule_shift', currentShift);
    localStorage.setItem('asistencia_schedule_hours', JSON.stringify(currentHours));
    updateShiftUI();
    renderSchedule();
  }
}
window.addHourRow = addHourRow;

function removeHourRow(hour) {
  if (currentHours.length <= 1) return;
  const hourStr = hour.toString();
  currentHours = currentHours.filter(h => h.toString() !== hourStr);
  currentShift = 'custom';
  localStorage.setItem('asistencia_schedule_shift', currentShift);
  localStorage.setItem('asistencia_schedule_hours', JSON.stringify(currentHours));
  updateShiftUI();
  renderSchedule();
}
window.removeHourRow = removeHourRow;

function addDayColumn() {
  const possibleDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  for (let d of possibleDays) {
    if (!currentDays.includes(d)) {
      if (d === 'Sábado' || d === 'Domingo') {
        showConfirm('Día de Fin de Semana', `Estás agregando un día fuera de los días semanales (${d}). ¿Deseas continuar?`, () => {
          const targetIdx = possibleDays.indexOf(d);
          currentDays.push(d);
          currentDays = [...new Set(currentDays)].sort((a, b) => possibleDays.indexOf(a) - possibleDays.indexOf(b));
          localStorage.setItem('asistencia_schedule_days', JSON.stringify(currentDays));
          renderSchedule();
          renderTable();
        });
        return;
      }

      const targetIdx = possibleDays.indexOf(d);
      currentDays.push(d);
      currentDays = [...new Set(currentDays)].sort((a, b) => possibleDays.indexOf(a) - possibleDays.indexOf(b));
      localStorage.setItem('asistencia_schedule_days', JSON.stringify(currentDays));
      renderSchedule();
      renderTable();
      break;
    }
  }
}
window.addDayColumn = addDayColumn;

function removeDayColumn(dayName) {
  if (currentDays.length <= 1) return;
  currentDays = currentDays.filter(d => d !== dayName);
  localStorage.setItem('asistencia_schedule_days', JSON.stringify(currentDays));
  renderSchedule();
  renderTable();
}
window.removeDayColumn = removeDayColumn;

let pendingHourAction = null;

function openTimePicker(actionType, existingHour, idx = null) {
  pendingHourAction = { type: actionType, oldHour: existingHour, index: idx };
  const modal = document.getElementById('modal-time-picker');
  const title = document.getElementById('modal-time-picker-title');
  const select = document.getElementById('time-picker-select');
  const manual = document.getElementById('time-picker-manual');

  let hourStr = existingHour.toString();
  if (!hourStr.includes(':')) {
    const hr = parseInt(hourStr);
    hourStr = `${hr < 10 ? '0' : ''}${hr}:00`;
  }
  const parts = hourStr.split(':');
  const h = parseInt(parts[0]);

  if (actionType === 'edit') {
    title.innerHTML = '⏱️ Editar Hora';
    select.value = h.toString();
    if (manual) manual.value = hourStr;
  } else if (actionType === 'add') {
    title.innerHTML = '➕ Añadir Hora';
    const suggestedH = (h + 1) % 24;
    const suggestedStr = `${suggestedH < 10 ? '0' : ''}${suggestedH}:00`;
    select.value = suggestedH.toString();
    if (manual) manual.value = suggestedStr;
  }

  // Bidirectional synchronization
  if (select && manual) {
    select.onchange = () => {
      const hVal = parseInt(select.value);
      if (!isNaN(hVal)) {
        manual.value = `${hVal < 10 ? '0' : ''}${hVal}:00`;
      }
    };

    manual.oninput = () => {
      const parts = manual.value.trim().split(':');
      const hVal = parseInt(parts[0]);
      if (!isNaN(hVal) && hVal >= 0 && hVal <= 23) {
        select.value = hVal.toString();
      }
    };
  }

  modal.classList.add('active');
}

function savePickedTime() {
  const select = document.getElementById('time-picker-select');
  const manual = document.getElementById('time-picker-manual');
  const modal = document.getElementById('modal-time-picker');

  let valStr;
  if (manual && manual.value.trim() !== '') {
    const raw = manual.value.trim();
    const parts = raw.split(':');
    const h = parseInt(parts[0]);
    const m = parts[1] !== undefined ? parseInt(parts[1]) : 0;
    if (!isNaN(h) && h >= 0 && h <= 23 && !isNaN(m) && m >= 0 && m <= 59) {
      valStr = `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
    } else {
      showNotif('Error', 'Hora inválida. Ejemplo: 9:30 ó 14:20');
      return;
    }
  } else {
    const h = parseInt(select.value);
    if (!isNaN(h) && h >= 0 && h <= 23) {
      valStr = `${h < 10 ? '0' : ''}${h}:00`;
    } else {
      showNotif('Error', 'Hora inválida.');
      return;
    }
  }

  if (pendingHourAction.type === 'edit') {
    const oldHour = pendingHourAction.oldHour.toString();
    const oldHourNorm = normalizeTimeString(oldHour);

    if (currentHours.includes(valStr) && valStr !== oldHourNorm) {
      showNotif('Error', 'Esta hora ya existe en el horario.');
      return;
    }

    schedule.forEach(item => {
      if (normalizeTimeString(item.startTime) === oldHourNorm) {
        item.startTime = valStr;
      }
    });

    const idx = currentHours.indexOf(oldHourNorm);
    if (idx !== -1) {
      currentHours[idx] = valStr;
      currentHours.sort((a, b) => timeStringToMinutes(a) - timeStringToMinutes(b));
      currentShift = 'custom';
      localStorage.setItem('asistencia_schedule_shift', currentShift);
      localStorage.setItem('asistencia_schedule_hours', JSON.stringify(currentHours));
      saveSchedule();
      updateShiftUI();
      renderSchedule();
    }
  } else if (pendingHourAction.type === 'add') {
    if (currentHours.includes(valStr)) {
      showNotif('Error', 'Esta hora ya existe en el horario.');
      return;
    }

    const idx = pendingHourAction.index;
    currentHours.splice(idx + 1, 0, valStr);
    currentHours.sort((a, b) => timeStringToMinutes(a) - timeStringToMinutes(b));
    currentShift = 'custom';
    localStorage.setItem('asistencia_schedule_shift', currentShift);
    localStorage.setItem('asistencia_schedule_hours', JSON.stringify(currentHours));
    updateShiftUI();
    renderSchedule();
  }

  if (manual) manual.value = '';
  modal.classList.remove('active');
  pendingHourAction = null;
}
window.savePickedTime = savePickedTime;

function editHour(oldHour) {
  openTimePicker('edit', oldHour);
}
window.editHour = editHour;

function addHourAtPos(idx) {
  openTimePicker('add', currentHours[idx], idx);
}
window.addHourAtPos = addHourAtPos;

function getDayId(dayName) {
  const map = { 'Lunes': 'mon', 'Martes': 'tue', 'Miércoles': 'wed', 'Jueves': 'thu', 'Viernes': 'fri', 'Sábado': 'sat', 'Domingo': 'sun' };
  return map[dayName] || 'mon';
}

function saveSchedule() {
  localStorage.setItem('asistencia_schedule', JSON.stringify(schedule));
}

let currentScope = 'semana';
let currentSort = 'name-asc';
let activeSelection = { sIdx: -1, dIdx: -1, mKey: '' };
let historyStack = ['screen-role'];

let teacherName = localStorage.getItem('asistencia_teacher_name') || "Guillermo";
let teacherBio = localStorage.getItem('asistencia_teacher_bio') || "";
let teacherGender = localStorage.getItem('asistencia_teacher_gender') || "masculino";
let teacherRole = localStorage.getItem('asistencia_teacher_role') || "profesor";
let greetingShown = false;
let teacherPhoto = localStorage.getItem('asistencia_teacher_photo') || null;
let teacherSubject = localStorage.getItem('asistencia_teacher_subject') || "";
let teacherPhone = localStorage.getItem('asistencia_teacher_phone') || "";

// Expose teacher variables globally to ensure they are available to helper functions
window.teacherName = teacherName;
window.teacherBio = teacherBio;
window.teacherGender = teacherGender;
window.teacherRole = teacherRole;
window.teacherPhoto = teacherPhoto;
window.teacherSubject = teacherSubject;
window.teacherPhone = teacherPhone;

const timeline = [
  { date: 'Lun 10 Mar', clase: 'Matemáticas — Álgebra', status: 'empty' },
  { date: 'Mar 11 Mar', clase: 'Español — Comprensión', status: 'empty' },
  { date: 'Mié 12 Mar', clase: 'Ciencias — Biología', status: 'empty' },
  { date: 'Jue 06 Mar', clase: 'Historia — Colonia', status: 'empty' },
  { date: 'Vie 07 Mar', clase: 'Inglés — Grammar', status: 'empty' },
];

window.handleTeacherPhoto = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    teacherPhoto = e.target.result;
    window.teacherPhoto = teacherPhoto;
    localStorage.setItem('asistencia_teacher_photo', teacherPhoto);
    syncSettingsUI();
    showNotif('Foto actualizada', 'Tu foto de perfil ha sido guardada.');
  };
  reader.readAsDataURL(file);
};

// ── SWIPE NAVIGATION FOR MOBILE ──
let touchstartX = 0;
let touchendX = 0;

function handleGesture() {
  // Desactivar el deslizamiento (swipe) en orientación horizontal para móviles y tablets
  const isLandscape = window.matchMedia("(orientation: landscape) and (max-width: 1280px), (orientation: landscape) and (pointer: coarse)").matches;
  if (isLandscape) return;

  const diff = touchstartX - touchendX;
  const threshold = 100;

  // Solo deslizar si estamos en una de las pantallas principales del docente
  const teacherScreens = ['screen-docente', 'screen-grupos', 'screen-alumnos', 'screen-tareas'];
  const currentScreenId = teacherScreens.find(id => {
    const el = document.getElementById(id);
    return el && el.classList.contains('active') && el.style.display !== 'none';
  });

  if (!currentScreenId) return;

  let index = teacherScreens.indexOf(currentScreenId);

  if (Math.abs(diff) > threshold) {
    if (diff > 0) {
      // Swipe Left -> Siguiente
      if (index < teacherScreens.length - 1) {
        index++;
        const targetId = teacherScreens[index];
        const actionMap = {
          'screen-docente': 'asistencia',
          'screen-grupos': 'grupos',
          'screen-alumnos': 'alumnos',
          'screen-tareas': 'tareas'
        };
        window.handleMobileNav(actionMap[targetId], null);
      }
    } else {
      // Swipe Right -> Anterior
      if (index > 0) {
        index--;
        const targetId = teacherScreens[index];
        const actionMap = {
          'screen-docente': 'asistencia',
          'screen-grupos': 'grupos',
          'screen-alumnos': 'alumnos',
          'screen-tareas': 'tareas'
        };
        window.handleMobileNav(actionMap[targetId], null);
      }
    }
  }
}

document.addEventListener('touchstart', e => {
  touchstartX = e.changedTouches[0].screenX;
}, false);

document.addEventListener('touchend', e => {
  touchendX = e.changedTouches[0].screenX;
  handleGesture();
}, false);
function saveToLocal() {
  localStorage.setItem('asistencia_groups', JSON.stringify(groups));
  localStorage.setItem('asistencia_active_group_idx', activeGroupIdx.toString());
  localStorage.setItem('asistencia_student_notes', JSON.stringify(studentNotes));
  localStorage.setItem('asistencia_teacher_messages', JSON.stringify(teacherMessages));
  localStorage.setItem('asistencia_tareas', JSON.stringify(tareas));
  localStorage.setItem('asistencia_citaciones', JSON.stringify(citaciones));
  saveSchedule();
}

function addStudent(name) {
  if (!name) return;
  const newStudent = {
    name: name,
    initials: name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().substring(0, 2),
    color: '#64748b',
    history: {},
    createdAt: Date.now()
  };
  students.push(newStudent);
  saveToLocal();
  renderTable();

}

function syncSettingsUI() {
  const nameInput = document.getElementById('teacher-name-input');
  const bioInput = document.getElementById('teacher-bio-input');
  const subjectInput = document.getElementById('teacher-subject-input');
  const phoneInput = document.getElementById('teacher-phone-input');
  const genderInput = document.getElementById('teacher-gender-input');
  const roleInput = document.getElementById('teacher-role-input');
  const avatarDisplay = document.getElementById('profile-avatar-display');

  if (nameInput) nameInput.value = teacherName;
  if (bioInput) bioInput.value = teacherBio;
  if (subjectInput) subjectInput.value = teacherSubject;
  if (phoneInput) phoneInput.value = teacherPhone;

  if (genderInput) {
    genderInput.value = teacherGender;
    const triggerText = document.getElementById('gender-text');
    const triggerIcon = document.querySelector('#gender-trigger .trigger-icon');
    if (triggerText) triggerText.textContent = teacherGender === 'masculino' ? 'Masculino' : 'Femenino';

    if (triggerIcon) {
      if (teacherGender === 'masculino') {
        triggerIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/></svg>`;
      } else {
        triggerIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`;
      }
    }
  }

  if (roleInput) {
    roleInput.value = teacherRole;
    const triggerText = document.getElementById('role-text');
    const triggerIcon = document.querySelector('#role-trigger .trigger-icon');
    if (triggerText) triggerText.textContent = teacherRole === 'profesor' ? 'Profesor / Profesora' : 'Maestro / Maestra';

    if (triggerIcon) {
      if (teacherRole === 'profesor') {
        triggerIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`;
      } else {
        triggerIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/></svg>`;
      }
    }
  }

  if (avatarDisplay) {
    if (teacherPhoto) {
      avatarDisplay.innerHTML = `<img src="${teacherPhoto}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      let iconSvg = '';
      if (teacherRole === 'maestro') {
        iconSvg = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/></svg>`;
      } else {
        iconSvg = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`;
      }
      avatarDisplay.innerHTML = iconSvg;
      avatarDisplay.style.color = 'var(--accent-blue)';
    }
    avatarDisplay.style.display = 'flex';
    avatarDisplay.style.alignItems = 'center';
    avatarDisplay.style.justifyContent = 'center';
  }

  // Language
  const langSelect = document.getElementById('language-select');
  if (langSelect) {
    langSelect.value = securityConfig.language || 'es';
  }

  // Update Security Section UI
  updateSecuritySettingsUI();
}
window.syncSettingsUI = syncSettingsUI;

// ── SETTINGS & NAVIGATION MODULE ──
// This module handles global UI overlays and settings, isolated from specific dashboard modules.

window.openBasicSettings = function (event) {
  if (event) event.stopPropagation();
  const modal = document.getElementById('modal-basic-settings');
  if (modal) {
    window.showOverlay('modal-basic-settings');

    // Sync current language
    const langSelect = document.getElementById('basic-language-select');
    if (langSelect) langSelect.value = securityConfig.language || 'es';

    // Sync current theme buttons
    const currentTheme = localStorage.getItem('asistencia_theme_pref') || 'system';
    const buttons = modal.querySelectorAll('.theme-btn-v2');

    buttons.forEach(btn => {
      btn.style.borderColor = 'rgba(255,255,255,0.1)';
      btn.style.background = 'rgba(255,255,255,0.02)';
      btn.style.color = 'var(--text)';
    });

    const activeBtn = document.getElementById(`theme-btn-${currentTheme}`);
    if (activeBtn) {
      activeBtn.style.borderColor = 'var(--accent-blue)';
      activeBtn.style.background = 'var(--glow-blue)';
      activeBtn.style.color = 'var(--accent-blue)';
    }

    if (typeof window.syncAllNotificationForms === 'function') {
      window.syncAllNotificationForms();
    }

    // Sync auto-falta toggle
    const autoFaltaToggle = document.getElementById('auto-falta-midnight-toggle');
    if (autoFaltaToggle) {
      const cfg = safeParseJSON('asistencia_auto_falta_config', { enabled: false });
      autoFaltaToggle.checked = cfg.enabled === true;
    }
  }
};

window.toggleQuickSettings = function (event) {
  if (event) event.stopPropagation();
  const qs = document.getElementById('quick-settings-dropdown');
  if (qs) {
    if (qs.style.display === 'none' || qs.style.display === '') {
      qs.style.display = 'flex';

      const name = localStorage.getItem('asistencia_teacher_name') || 'Docente';
      const subj = localStorage.getItem('asistencia_teacher_subject') || 'Perfil Educativo';
      const nameEl = document.getElementById('qs-teacher-name');
      const subjEl = document.getElementById('qs-teacher-subject');
      const avatarEl = document.getElementById('qs-avatar');

      if (nameEl) nameEl.textContent = name;
      if (subjEl) subjEl.textContent = subj;
      if (avatarEl) {
        const photo = localStorage.getItem('asistencia_teacher_photo');
        if (photo) {
          // Show profile photo
          avatarEl.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Foto de perfil">`;
          avatarEl.style.background = 'transparent';
          avatarEl.style.overflow = 'hidden';
          avatarEl.style.padding = '0';
        } else {
          // Fallback: show initial
          avatarEl.innerHTML = '';
          avatarEl.textContent = name.charAt(0).toUpperCase();
          avatarEl.style.background = '';
          avatarEl.style.overflow = '';
        }
      }

      const langSelect = document.getElementById('qs-language-select');
      if (langSelect) langSelect.value = securityConfig.language || 'es';

      const currentTheme = localStorage.getItem('asistencia_theme_pref') || 'system';
      const qsThemeBtns = document.querySelectorAll('#quick-settings-dropdown .theme-btn-v2');
      qsThemeBtns.forEach(btn => {
        btn.style.color = 'var(--text)';
        btn.style.background = 'transparent';
      });
      const activeQsBtn = document.getElementById(`qs-theme-${currentTheme}`);
      if (activeQsBtn) {
        activeQsBtn.style.color = 'var(--accent-blue)';
        activeQsBtn.style.background = 'rgba(0,180,216,0.1)';
      }
    } else {
      qs.style.display = 'none';
    }
  }
};

// Handle clicks outside Quick Settings
document.addEventListener('click', function (e) {
  const qs = document.getElementById('quick-settings-dropdown');
  const btn = document.getElementById('header-menu-icon');
  if (qs && qs.style.display === 'flex') {
    if (!qs.contains(e.target) && (!btn || !btn.contains(e.target))) {
      qs.style.display = 'none';
    }
  }
});

window.setAppTheme = function (theme) {
  const html = document.documentElement;
  localStorage.setItem('asistencia_theme_pref', theme);

  const applyTheme = (t) => {
    html.setAttribute('data-theme', t);
    localStorage.setItem('asistencia_theme', t);
    const sun = document.getElementById('theme-icon-sun');
    const moon = document.getElementById('theme-icon-moon');
    if (sun && moon) {
      sun.style.display = t === 'light' ? 'block' : 'none';
      moon.style.display = t === 'light' ? 'none' : 'block';
    }
  };

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (localStorage.getItem('asistencia_theme_pref') === 'system') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  } else {
    applyTheme(theme);
  }

  const modal = document.getElementById('modal-basic-settings');
  if (modal) {
    modal.querySelectorAll('.theme-tile').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`theme-btn-${theme}`);
    if (activeBtn) activeBtn.classList.add('active');
  }

  const qsThemeBtns = document.querySelectorAll('#quick-settings-dropdown .theme-btn-v2');
  qsThemeBtns.forEach(btn => {
    btn.style.color = 'var(--text)';
    btn.style.background = 'transparent';
  });
  const activeQsBtn = document.getElementById(`qs-theme-${theme}`);
  if (activeQsBtn) {
    activeQsBtn.style.color = 'var(--accent-blue)';
    activeQsBtn.style.background = 'rgba(0,180,216,0.1)';
  }
};

window.exportAppData = function () {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('asistencia_')) {
      data[key] = localStorage.getItem(key);
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `asistencia_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotif('Exportación Exitosa', 'Tus datos han sido descargados correctamente.');
};

window.importAppData = function (e) {
  const file = e?.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const data = JSON.parse(event.target.result);
      let count = 0;
      Object.keys(data).forEach(key => {
        if (key.startsWith('asistencia_')) {
          localStorage.setItem(key, data[key]);
          count++;
        }
      });
      if (count > 0) {
        showNotif('Importación Exitosa', `${count} registros restaurados. Reiniciando...`, 'success');
        setTimeout(() => location.reload(), 2000);
      } else {
        showNotif('Importación Fallida', 'No se encontraron datos válidos de la aplicación.', 'error');
      }
    } catch (err) {
      showNotif('Error de Importación', 'El archivo no es válido.', 'error');
    }
  };
  reader.readAsText(file);
};

window.showOverlay = function (id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    document.body.classList.add('modal-open');
  }
};

window.closeOverlay = function (id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
};

window.closeAllModals = function () {
  document.querySelectorAll('.modal, .overlay-v2, .profile-v6-overlay').forEach(m => {
    m.classList.remove('active');
  });
  document.body.classList.remove('modal-open');
};

// ── END SETTINGS MODULE ──


function getTrimestreMonths(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const startM = parseInt(startStr.split('-')[1]) - 1;
  const endM = parseInt(endStr.split('-')[1]) - 1;
  if (isNaN(startM) || isNaN(endM)) return null;

  const lang = securityConfig.language || 'es';
  const res = [];
  const keys = [];
  let curr = startM;
  let count = 0;
  while (count < 12) {
    res.push(translations[lang].months[curr]);
    keys.push(translations[lang].months[curr].substring(0, 3));
    if (curr === endM) break;
    curr = (curr + 1) % 12;
    count++;
  }
  return { months: res, monthKeys: keys, startM, endM };
}

function getTrimestreInfo(mIdx, y) {
  const lang = securityConfig.language || 'es';
  // Check custom dates first
  if (schoolCalendar.t1.start && schoolCalendar.t1.end) {
    const tInfo = getTrimestreMonths(schoolCalendar.t1.start, schoolCalendar.t1.end);
    if (tInfo && (mIdx >= tInfo.startM && mIdx <= tInfo.endM || (tInfo.startM > tInfo.endM && (mIdx >= tInfo.startM || mIdx <= tInfo.endM)))) {
      tInfo.name = 'Trimestre I'; return tInfo;
    }
  }
  if (schoolCalendar.t2.start && schoolCalendar.t2.end) {
    const tInfo = getTrimestreMonths(schoolCalendar.t2.start, schoolCalendar.t2.end);
    if (tInfo && (mIdx >= tInfo.startM && mIdx <= tInfo.endM || (tInfo.startM > tInfo.endM && (mIdx >= tInfo.startM || mIdx <= tInfo.endM)))) {
      tInfo.name = 'Trimestre II'; return tInfo;
    }
  }
  if (schoolCalendar.t3.start && schoolCalendar.t3.end) {
    const tInfo = getTrimestreMonths(schoolCalendar.t3.start, schoolCalendar.t3.end);
    if (tInfo && (mIdx >= tInfo.startM && mIdx <= tInfo.endM || (tInfo.startM > tInfo.endM && (mIdx >= tInfo.startM || mIdx <= tInfo.endM)))) {
      tInfo.name = 'Trimestre III'; return tInfo;
    }
  }

  // Default fallback behavior: standard calendar quarters
  if (mIdx <= 2) {
    return { name: 'Trimestre I', months: [translations[lang].months[0], translations[lang].months[1], translations[lang].months[2]], monthKeys: ['Ene', 'Feb', 'Mar'] };
  } else if (mIdx <= 5) {
    return { name: 'Trimestre II', months: [translations[lang].months[3], translations[lang].months[4], translations[lang].months[5]], monthKeys: ['Abr', 'May', 'Jun'] };
  } else if (mIdx <= 8) {
    return { name: 'Trimestre III', months: [translations[lang].months[6], translations[lang].months[7], translations[lang].months[8]], monthKeys: ['Jul', 'Ago', 'Sep'] };
  } else {
    return { name: 'Trimestre IV', months: [translations[lang].months[9], translations[lang].months[10], translations[lang].months[11]], monthKeys: ['Oct', 'Nov', 'Dic'] };
  }
}

function getWeeksInMonth(year, month) {
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const offsetToMonday = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
  const dateOfFirstMonday = 1 - offsetToMonday;
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const totalDaysSpanned = (lastDayOfMonth - dateOfFirstMonday + 1);
  return Math.ceil(totalDaysSpanned / 7);
}

function getShortGroupName(fullName) {
  if (!fullName) return '';
  if (fullName.includes(' - ')) {
    return fullName.split(' - ')[0].trim();
  }
  return fullName;
}

window.updateHeaderGroupBadge = function (overrideName = null) {
  const badgeEl = document.getElementById('header-group-badge');
  if (!badgeEl) return;

  let fullName = overrideName;
  if (!fullName) {
    if (typeof groups !== 'undefined' && groups[activeGroupIdx]) {
      fullName = groups[activeGroupIdx].name;
    }
  }

  if (fullName && fullName !== 'all' && fullName !== 'Todos') {
    const shortName = getShortGroupName(fullName);
    badgeEl.textContent = shortName;
    badgeEl.setAttribute('title', fullName);
    if (badgeEl.parentElement) badgeEl.parentElement.style.display = 'flex';
  } else {
    if (badgeEl.parentElement) badgeEl.parentElement.style.display = 'none';
  }
};

function updateMonthLabel() {
  const tableMonthLabel = document.getElementById('table-month-name');
  const lang = securityConfig.language || 'es';
  if (!tableMonthLabel) return;
  const monthName = translations[lang].months[currentMonth];
  if (currentScope === 'trimestre') {
    const tInfo = getTrimestreInfo(currentMonth, currentYear);
    const qName = lang === 'es' ? tInfo.name : tInfo.name.replace('Trimestre', 'Quarter');
    tableMonthLabel.textContent = `${qName} ${currentYear}`;
  } else if (currentScope === 'semana') {
    const weekWord = lang === 'es' ? 'Semana' : 'Week';
    tableMonthLabel.textContent = `${weekWord} ${currentWeek + 1} - ${monthName} ${currentYear}`;
  } else {
    tableMonthLabel.textContent = `${monthName} ${currentYear}`;
  }
}

function renderTable(filter = '') {
  const tbody = document.getElementById('student-table');
  const thead = document.getElementById('matrix-head');
  const lang = securityConfig.language || 'es';
  if (!tbody || !thead) return;

  const FULL_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  if (!currentDays || !Array.isArray(currentDays) || currentDays.length === 0) {
    currentDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  }
  currentDays.sort((a, b) => FULL_WEEK.indexOf(a) - FULL_WEEK.indexOf(b));

  if (!currentScope) currentScope = 'semana';

  const monthKey = translations[lang].months[currentMonth].substring(0, 3);
  const isMonthView = currentScope === 'mes';
  const isTrimestreView = currentScope === 'trimestre';
  const studentTitle = lang === 'es' ? 'ESTUDIANTE' : 'STUDENT';
  const searchPlaceholder = lang === 'es' ? 'Buscar estudiante...' : 'Search student...';
  const addStudentTooltip = lang === 'es' ? 'Añadir Estudiante' : 'Add Student';
  const sortTooltip = lang === 'es' ? 'Ordenar lista' : 'Sort list';
  const autoAttendanceTooltip = lang === 'es' ? 'Auto Asistencia (Marcar todos presente)' : 'Auto Attendance (Mark all present)';

  if (window.updateHeaderGroupBadge) window.updateHeaderGroupBadge();

  // Determine auto assistance button state for today
  const todayObj = new Date();
  const todayMonthKey = translations[lang].months[todayObj.getMonth()].substring(0, 3);
  const todayDIdx = todayObj.getDate() - 1;
  const activeAutoKey = `${todayMonthKey}_${todayDIdx}_g${activeGroupIdx}`;

  const isAutoActive = typeof autoAsistenciaState !== 'undefined' && !!autoAsistenciaState[activeAutoKey];
  const autoBtnClass = isAutoActive ? 'auto-asistencia-btn-header active-auto' : 'auto-asistencia-btn-header';

  const mobileAutoBtn = document.getElementById('mobile-auto-fab');
  if (mobileAutoBtn) {
    if (isAutoActive) mobileAutoBtn.classList.add('active-auto');
    else mobileAutoBtn.classList.remove('active-auto');
  }

  // Render Header
  if (currentScope === 'semana') {
    const dayMap = lang === 'es'
      ? { 'Lunes': 'LUN', 'Martes': 'MAR', 'Miércoles': 'MIÉ', 'Jueves': 'JUE', 'Viernes': 'VIE', 'Sábado': 'SÁB', 'Domingo': 'DOM' }
      : { 'Lunes': 'MON', 'Martes': 'TUE', 'Miércoles': 'WED', 'Jueves': 'THU', 'Viernes': 'FRI', 'Sábado': 'SAT', 'Domingo': 'SUN' };

    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const offsetToMonday = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
    const dateOfFirstMonday = 1 - offsetToMonday;
    const startDayDate = dateOfFirstMonday + (currentWeek * 7);

    let daysHTML = currentDays.map((dayName, idx) => {
      const dayOffset = FULL_WEEK.indexOf(dayName);
      const dObj = new Date(currentYear, currentMonth, startDayDate + dayOffset);
      const dDay = dObj.getDate();
      const dMonth = translations[lang].months[dObj.getMonth()].substring(0, 3).toUpperCase();
      const isToday = dObj.getDate() === new Date().getDate() && dObj.getMonth() === new Date().getMonth() && dObj.getFullYear() === new Date().getFullYear();
      const isLastDay = idx === currentDays.length - 1;

      return `<th class="semana-day-th ${isLastDay ? 'week-border' : ''} ${isToday ? 'is-today' : ''}">${dayMap[dayName]}<span class="date">${dDay} ${dMonth}</span></th>`;
    }).join('');

    thead.innerHTML = `
      <tr>
        <th class="student-header-th" style="text-align: left; padding: 0;">
          <div class="header-search-wrap">
            <span class="header-title">${studentTitle}</span>
            <div class="search-flex">
              <button class="sort-icon-btn" id="open-sort-menu" title="${sortTooltip}">☰</button>
              <div class="search-input-wrap">
                <input type="text" id="student-search-header" placeholder="${searchPlaceholder}" />
              </div>
              <button class="${autoBtnClass}" id="auto-asistencia-header" title="${autoAttendanceTooltip}" onclick="window.autoAsistencia()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
              <button class="add-student-btn-header" id="open-add-student-header" title="${addStudentTooltip}">+</button>
            </div>
          </div>
        </th>
        ${daysHTML}
      </tr>
    `;
  } else if (isTrimestreView) {
    // REDESIGNED TRIMESTRE HEADER
    const tInfo = getTrimestreInfo(currentMonth, currentYear);
    const widthPct = (100 / tInfo.months.length).toFixed(2);

    thead.innerHTML = `
      <tr>
        <th class="student-header-th" style="text-align: left; padding: 0; z-index: 10;">
          <div class="header-search-wrap" style="height: 100%; border: none; background: transparent;">
            <span class="header-title" style="padding-left: 15px;">${studentTitle}</span>
            <div class="search-flex">
              <button class="sort-icon-btn" id="open-sort-menu" title="${sortTooltip}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="4" y1="12" x2="20" y2="12"></line>
                  <line x1="4" y1="6" x2="20" y2="6"></line>
                  <line x1="4" y1="18" x2="20" y2="18"></line>
                </svg>
              </button>
              <div class="search-input-wrap">
                <input type="text" id="student-search-header" placeholder="${searchPlaceholder}" />
              </div>
              <button class="${autoBtnClass}" id="auto-asistencia-header" title="${autoAttendanceTooltip}" onclick="window.autoAsistencia()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
              <button class="add-student-btn-header" id="open-add-student-header" title="${addStudentTooltip}">+</button>
            </div>
          </div>
        </th>
        ${tInfo.months.map(mName => `<th class="trimester-month-th" style="width: ${widthPct}%; padding: 0 5px;"><div class="month-block" style="color: #ffffff !important; display: block;">${mName}</div></th>`).join('')}
      </tr>
    `;
  } else {
    const dayMapShort = lang === 'es'
      ? { 'Lunes': 'L', 'Martes': 'M', 'Miércoles': 'M', 'Jueves': 'J', 'Viernes': 'V', 'Sábado': 'S', 'Domingo': 'D' }
      : { 'Lunes': 'M', 'Martes': 'T', 'Miércoles': 'W', 'Jueves': 'T', 'Viernes': 'F', 'Sábado': 'S', 'Domingo': 'S' };
    const nActive = currentDays.length;
    const weekWord = lang === 'es' ? 'Semana' : 'Week';

    const nowObj = new Date();
    const todayY = nowObj.getFullYear();
    const todayM = nowObj.getMonth();
    const todayD = nowObj.getDate();

    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const offsetToMonday = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
    const dateOfFirstMonday = 1 - offsetToMonday;
    const wOffset = (dateOfFirstMonday < 1 ? 1 : 0);

    let topRow = `
    <th rowspan="2" class="student-header-th" style="text-align: left; padding: 0; border-bottom: 2px solid var(--matrix-header-light); z-index: 10;">
        <div class="header-search-wrap">
          <span class="header-title" style="padding-left: 15px;">${studentTitle}</span>
          <div class="search-flex">
            <button class="sort-icon-btn" id="open-sort-menu" title="${sortTooltip}">☰</button>
            <div class="search-input-wrap">
              <input type="text" id="student-search-header" placeholder="${searchPlaceholder}" />
            </div>
            <button class="${autoBtnClass}" id="auto-asistencia-header" title="${autoAttendanceTooltip}" onclick="window.autoAsistencia()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <button class="add-student-btn-header" id="open-add-student-header" title="${addStudentTooltip}">+</button>
          </div>
        </div>
      </th>
    `;
    let bottomRow = '';

    const weeksToShow = currentScope === 'semana' ? 1 : 4;
    for (let w = 1; w <= weeksToShow; w++) {
      const isLastWeek = w === weeksToShow;
      const colWidth = (100 / weeksToShow);
      const actualW = currentScope === 'semana' ? currentWeek : (w - 1 + wOffset);

      topRow += `<th colspan="${nActive}" style="background: var(--matrix-header-deep); border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem; color: #ffffff !important; white-space: nowrap; height: 35px; vertical-align: middle; padding: 0 10px; width: ${colWidth}%;" ${!isLastWeek ? 'class="week-border"' : ''}>${weekWord} ${w}</th>`;
      currentDays.forEach((dayName, dIdx) => {
        const isLastDay = dIdx === currentDays.length - 1;
        const dayOffset = FULL_WEEK.indexOf(dayName);
        const startDayDate = dateOfFirstMonday + (actualW * 7);
        const dObj = new Date(currentYear, currentMonth, startDayDate + dayOffset);

        const isToday = (
          dObj.getDate() === todayD &&
          dObj.getMonth() === todayM &&
          dObj.getFullYear() === todayY
        );

        const todayThClass = isToday ? 'is-today-month-th' : '';
        const todayBeacon = isToday ? '<span class="today-pulse-beacon" title="Hoy"></span>' : '';

        bottomRow += `<th style="width: 20px; min-width: 20px; font-size: 0.65rem; padding: 8px 0; background: var(--matrix-header-light); color: white; border-left: 1px solid rgba(255,255,255,0.05); text-align: center; position: relative;" class="${todayThClass} ${isLastDay && !isLastWeek ? 'week-border' : ''}">${dayMapShort[dayName]}${todayBeacon}</th>`;
      });
    }
    thead.innerHTML = `<tr>${topRow}</tr><tr>${bottomRow}</tr>`;
  }

  students = groups[activeGroupIdx].students;

  const sortedStudents = [...students].sort((a, b) => {
    if (currentSort === 'name-asc') return (a.name || '').localeCompare(b.name || '');
    if (currentSort === 'lastname-asc') {
      const getLastName = (fullName) => {
        const parts = (fullName || '').trim().split(/\s+/);
        return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
      };
      const lastA = getLastName(a.name);
      const lastB = getLastName(b.name);
      const cmp = lastA.localeCompare(lastB, undefined, { sensitivity: 'base' });
      return cmp !== 0 ? cmp : (a.name || '').localeCompare(b.name || '');
    }
    if (currentSort === 'recent') return (b.createdAt || 0) - (a.createdAt || 0);
    if (currentSort === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
    if (currentSort === 'random') return 0.5 - Math.random();
    return 0;
  });

  tbody.innerHTML = sortedStudents.map((s) => {
    const sIdx = students.indexOf(s);
    if (filter && !s.name.toLowerCase().includes(filter.toLowerCase())) return null;

    if (isTrimestreView) {
      const tInfo = getTrimestreInfo(currentMonth, currentYear);
      const tMonths = tInfo.monthKeys;
      let cellsHTML = '';
      let mobileMonthsHTML = '';
      const nActive = currentDays.length;
      const fullWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const activeOffsets = currentDays.map(d => fullWeek.indexOf(d));

      let pCount = 0, aCount = 0, lCount = 0;

      tMonths.forEach(mKey => {
        if (!s.history[mKey]) s.history[mKey] = Array(35).fill('empty');

        const monthIdx = translations[lang].months.findIndex(m => m.substring(0, 3).toLowerCase() === mKey.toLowerCase());
        const targetMIdx = monthIdx !== -1 ? monthIdx : currentMonth;

        const mFirstDay = new Date(currentYear, targetMIdx, 1).getDay();
        const mOffsetToMonday = (mFirstDay === 0 ? 6 : mFirstDay - 1);
        const mDateOfFirstMonday = 1 - mOffsetToMonday;
        const mWOffset = (mDateOfFirstMonday < 1 ? 1 : 0);

        let monthDotsHTML = '';
        const makeDotsForWeek = (wIndex) => {
          let dots = '';
          const realW = wIndex + mWOffset;
          const startDayDate = mDateOfFirstMonday + (realW * 7);

          activeOffsets.forEach(offset => {
            const dObj = new Date(currentYear, targetMIdx, startDayDate + offset);
            const absIdx = dObj.getDate() - 1;
            const status = s.history[mKey][absIdx] || 'empty';

            if (status === 'present') pCount++;
            else if (status === 'absent' || status === 'excused') aCount++;
            else if (status === 'late' || status === 'late_excused') lCount++;

            const dayDate = dObj.getDate();
            const monthShort = mKey.toUpperCase();
            const tooltip = `${dayDate} ${monthShort}`;

            dots += `<span class="trimester-dot ${status}" data-sidx="${sIdx}" data-didx="${absIdx}" data-mkey="${mKey}" title="${tooltip}"></span>`;
          });
          return dots;
        };

        monthDotsHTML += makeDotsForWeek(0);
        monthDotsHTML += `<div class="trimester-dot-gap"></div>`;
        monthDotsHTML += makeDotsForWeek(2);
        monthDotsHTML += makeDotsForWeek(1);
        monthDotsHTML += `<div class="trimester-dot-gap"></div>`;
        monthDotsHTML += makeDotsForWeek(3);

        cellsHTML += `
          <td class="desktop-only-cell trimester-month-td">
            <div class="trimester-dot-grid" style="grid-template-columns: repeat(${nActive}, 14px) 24px repeat(${nActive}, 14px); justify-content: center; width: fit-content; margin: 0 auto;">
              ${monthDotsHTML}
            </div>
          </td>
        `;

        mobileMonthsHTML += `
          <div style="display: flex; justify-content: center; width: 100%;">
            <div class="trimester-dot-grid" style="grid-template-columns: repeat(${nActive}, 16px) 20px repeat(${nActive}, 16px); justify-content: center; margin: 0 auto;">
              ${monthDotsHTML}
            </div>
          </div>
        `;
      });

      return `
        <tr>
          <td class="mobile-only-cell" colspan="4">
            <div class="student-card-mobile" style="background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 20px 16px; margin-bottom: 16px; box-shadow: 0 4px 18px rgba(0,0,0,0.03); display: flex; flex-direction: column; gap: 16px;">
              <div style="display: flex; align-items: flex-start; justify-content: space-between; width: 100%;">
                <div style="display: flex; gap: 12px; align-items: center;">
                  <div style="width: 44px; height: 44px; border-radius: 50%; background: #dbeafe; color: #2563eb; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.95rem; flex-shrink: 0;">
                    ${s.initials}
                  </div>
                  <div>
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text); line-height: 1.2;">${s.name}</div>
                    <div style="font-size: 0.78rem; color: var(--muted); font-weight: 600; margin-top: 3px;">ID: 10${sIdx + 1}-P</div>
                  </div>
                </div>
                <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                  <span style="background: #e6f4ea; color: #10b981; font-size: 0.85rem; font-weight: 900; padding: 6px 12px; border-radius: 10px; letter-spacing: 0.5px;">${pCount}P</span>
                  <span style="background: #fce8e6; color: #ef4444; font-size: 0.85rem; font-weight: 900; padding: 6px 12px; border-radius: 10px; letter-spacing: 0.5px;">${aCount}F</span>
                  <span style="background: #fef7e0; color: #f59e0b; font-size: 0.85rem; font-weight: 900; padding: 6px 12px; border-radius: 10px; letter-spacing: 0.5px;">${lCount}T</span>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 14px; align-items: center; width: 100%; padding-top: 6px;">
                ${mobileMonthsHTML}
              </div>
            </div>
          </td>
          <td class="desktop-only-cell student-name-cell" style="min-width: 250px; text-align: left; padding-left: 20px;">
            <div class="student-info" 
                 data-student-name="${s.name}"
                 onclick="window.openStudentProfileV6(this.dataset.studentName); event.stopPropagation();"
                 style="cursor: pointer;">
              <div class="avatar" style="background: ${s.color}20; color: ${s.color}">${s.initials}</div>
              <div class="details">
                <div class="name">${s.name}</div>
                <div class="id">ID: 10${sIdx + 1}-P</div>
              </div>
            </div>
          </td>
          ${cellsHTML}
        </tr>
      `;

    } else {
      const fullWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const activeOffsets = currentDays.map(d => fullWeek.indexOf(d));
      const dayMapShort = { 'Lunes': 'L', 'Martes': 'M', 'Miércoles': 'M', 'Jueves': 'J', 'Viernes': 'V', 'Sábado': 'S', 'Domingo': 'D' };

      let desktopCellsHTML;

      const monthKey = translations[lang].months[currentMonth].substring(0, 3);
      if (!s.history[monthKey]) s.history[monthKey] = Array(35).fill('empty');

      const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
      const offsetToMonday = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
      const dateOfFirstMonday = 1 - offsetToMonday;

      const nowObj = new Date();
      const todayY = nowObj.getFullYear();
      const todayM = nowObj.getMonth();
      const todayD = nowObj.getDate();

      let mobileHeaderHTML = currentDays.map(d => `<div class="mobile-grid-header">${dayMapShort[d]}</div>`).join('');
      let mobileDotsHTML = ``;

      const wOffset = (dateOfFirstMonday < 1 ? 1 : 0);
      const startW_mob = currentScope === 'semana' ? currentWeek : 0;
      const endW_mob = currentScope === 'semana' ? currentWeek + 1 : 4;

      for (let i = startW_mob; i < endW_mob; i++) {
        const w = currentScope === 'semana' ? i : (i + wOffset);
        activeOffsets.forEach((offset) => {
          const startDayDate = dateOfFirstMonday + (w * 7);
          const dObj = new Date(currentYear, currentMonth, startDayDate + offset);
          const absIdx = dObj.getDate() - 1;
          const status = s.history[monthKey][absIdx] || 'empty';

          let iconHTML = '';
          if (status === 'present') iconHTML = '✓';
          else if (status === 'absent') iconHTML = '✕';
          else if (status === 'late') iconHTML = '-';

          const dayDate = dObj.getDate();
          const monthShort = translations[lang].months[currentMonth].substring(0, 3).toUpperCase();
          const tooltip = `${dayDate} ${monthShort}`;

          mobileDotsHTML += `
            <div class="mobile-grid-cell">
              <span class="status-dot ${status}" data-sidx="${sIdx}" data-didx="${absIdx}" data-mkey="${monthKey}" title="${tooltip}">${iconHTML}</span>
            </div>
          `;
        });
      }

      desktopCellsHTML = ``;
      const startW_desk = currentScope === 'semana' ? currentWeek : 0;
      const endW_desk = currentScope === 'semana' ? currentWeek + 1 : 4;

      for (let i = startW_desk; i < endW_desk; i++) {
        const w = currentScope === 'semana' ? i : (i + wOffset);
        activeOffsets.forEach((offset, dayInnerIdx) => {
          const startDayDate = dateOfFirstMonday + (w * 7);
          const dObj = new Date(currentYear, currentMonth, startDayDate + offset);
          const absIdx = dObj.getDate() - 1;
          const status = s.history[monthKey][absIdx] || 'empty';
          const isLastWeek = i === endW_desk - 1;
          const isLastDayOfWeek = dayInnerIdx === activeOffsets.length - 1;

          const isToday = (
            dObj.getDate() === todayD &&
            dObj.getMonth() === todayM &&
            dObj.getFullYear() === todayY
          );

          let iconHTML = '';
          if (status === 'present') iconHTML = '✓';
          else if (status === 'absent') iconHTML = '✕';
          else if (status === 'late') iconHTML = '-';

          const dayDate = dObj.getDate();
          const monthShort = translations[lang].months[currentMonth].substring(0, 3).toUpperCase();
          const tooltip = `${dayDate} ${monthShort}${isToday ? ' (HOY)' : ''}`;

          const todayDotClass = isToday ? 'is-today-dot' : '';
          const todayCellClass = isToday ? 'is-today-month-cell' : '';

          const cellContent = `<span class="status-dot ${status} ${todayDotClass}" data-sidx="${sIdx}" data-didx="${absIdx}" data-mkey="${monthKey}" title="${tooltip}">${iconHTML}</span>`;

          desktopCellsHTML += `
            <td class="desktop-only-cell semana-day-td ${todayCellClass} ${isLastDayOfWeek && !isLastWeek ? 'week-border' : ''}" style="text-align: center;">
              ${cellContent}
            </td>
          `;
        });
      }

      return `
        <tr class="attendance-row" data-id="${s.id}">
          <!-- Mobile Specific Cell (Card View) -->
          <td class="mobile-only-cell" colspan="${((currentScope === 'mes' ? 4 : 1) * currentDays.length) + 1}">
            <div class="student-card-mobile">
              <div class="student-info student-info-mobile" 
                   data-student-name="${s.name}"
                   style="cursor: default;">
                <div class="student-details">
                  <div class="student-name">${s.name}</div>
                  <div class="student-id-mobile">ID: 10${sIdx + 1}-P • Estudiante</div>
                </div>
                <div class="student-avatar" style="background: ${s.color}20; color: ${s.color}">${s.initials}</div>
              </div>
              
              <div class="status-grid-mobile" style="grid-template-columns: repeat(${currentDays.length}, 1fr) !important;">
                  ${mobileHeaderHTML}
                  ${mobileDotsHTML}
              </div>
            </div>
          </td>

          <!-- Desktop Specific Cells -->
          <td class="desktop-only-cell student-name-cell" style="min-width: 250px; text-align: left; padding-left: 20px;">
            <div class="student-info" 
                 data-student-name="${s.name}"
                 onclick="window.openStudentProfileV6(this.dataset.studentName); event.stopPropagation();"
                 style="cursor: pointer;">
              <div class="avatar" style="background: ${s.color}20; color: ${s.color}">${s.initials}</div>
              <div class="details">
                <div class="name">
                  ${s.name}
                  <button class="citacion-btn-hover" onclick="event.stopPropagation(); window.openCitacionForStudent(\`${s.name.replace(/'/g, "\\'")}\`)" title="Crear Citación">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                  </button>
                </div>
                <div class="id">ID: 10${sIdx + 1}-P</div>
              </div>
            </div>
          </td>
          ${desktopCellsHTML}
        </tr>
      `;
    }
  }).filter(row => row !== null).join('');

  // Re-attach listeners
  const searchInput = document.getElementById('student-search-header');
  if (searchInput) {
    searchInput.value = filter;
    searchInput.addEventListener('input', (e) => renderTable(e.target.value));
  }

  const sortBtn = document.getElementById('open-sort-menu');
  if (sortBtn) {
    sortBtn.addEventListener('click', (e) => openSortMenu(e, filter));
  }

  const addBtn = document.getElementById('open-add-student-header');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('modal-add-student').classList.add('active');
      document.getElementById('new-student-name').focus();
    });
  }

  tbody.querySelectorAll('.status-dot, .trimester-dot').forEach(dot => {
    // Single click: Rotation
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const sIdx = parseInt(dot.dataset.sidx);
      const dIdx = parseInt(dot.dataset.didx);
      const mKey = dot.dataset.mkey;
      rotateAttendance(sIdx, dIdx, mKey);
    });

    // Right click: Choice Menu
    dot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAttendanceMenu(e, parseInt(dot.dataset.sidx), parseInt(dot.dataset.didx), dot.dataset.mkey);
    });
  });
}

let inkModifiedCells = safeParseJSON('asistencia_ink_cells', {});

function isCellInkModified(studentName, mKey, dIdx) {
  const groupId = groups[activeGroupIdx]?.id || 'unknown';
  const key = `${groupId}_${studentName}_${mKey}_${dIdx}`;
  return !!inkModifiedCells[key];
}

function markCellAsInkModified(studentName, mKey, dIdx, value) {
  const groupId = groups[activeGroupIdx]?.id || 'unknown';
  const key = `${groupId}_${studentName}_${mKey}_${dIdx}`;
  if (value === 'empty') {
    delete inkModifiedCells[key];
  } else {
    inkModifiedCells[key] = true;
  }
  localStorage.setItem('asistencia_ink_cells', JSON.stringify(inkModifiedCells));
}

function checkSecurityLocks(currentStatus, mKey, dIdx, studentName) {
  const lang = securityConfig.language || 'es';
  const monthIdx = getMonthIdxFromKey(mKey);
  const firstDayOfMonth = new Date(currentYear, monthIdx, 1).getDay();
  const offsetToMonday = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
  const dateOfFirstMonday = 1 - offsetToMonday;
  const cellDate = new Date(currentYear, monthIdx, dateOfFirstMonday + dIdx);
  const now = new Date();

  const dayMs = 1000 * 60 * 60 * 24;
  const cellDateOnly = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((todayOnly - cellDateOnly) / dayMs);

  // Check if modified recently (grace period of 15 minutes)
  let isRecentModification = false;
  if (studentName) {
    const groupId = groups[activeGroupIdx]?.id || 'unknown';
    const key = `${groupId}_${studentName}_${mKey}_${dIdx}`;
    const lastMod = cellLastModified[key];
    if (lastMod && (Date.now() - lastMod) < 15 * 60 * 1000) {
      isRecentModification = true;
    }
  }

  // Hard rule: No record can be edited after 7 days (including Tinta Permanente)
  // EXCEPT if it was modified recently (grace period)
  if (currentStatus !== 'empty' && diffDays >= 7 && !isRecentModification) {
    return { allowed: false, reason: 'time_blocked_7d' };
  }

  // Active permanent ink lock bypasses further checks for < 7 days
  if (securityConfig.ink) {
    return { allowed: true };
  }

  // Inactive permanent ink lock blocks if it was modified under ink mode
  if (studentName && isCellInkModified(studentName, mKey, dIdx)) {
    if (currentStatus !== 'empty') {
      return { allowed: false, reason: 'ink_requires_active' };
    }
  }

  // Basic lock
  if (securityConfig.basic && currentStatus !== 'empty') {
    return { allowed: false, reason: 'basic' };
  }

  // Pencil lock
  // EXCEPT if it was modified recently (grace period)
  if (securityConfig.pencil && currentStatus !== 'empty' && diffDays >= 7 && !isRecentModification) {
    return { allowed: false, reason: 'pencil_locked' };
  }

  return { allowed: true };
}

let pendingAttendanceAction = null;

function promptMasterPassword(onSuccess) {
  const modal = document.getElementById('modal-master-password');
  const input = document.getElementById('master-password-prompt-input');
  const errorMsg = document.getElementById('master-password-prompt-error');

  if (input) input.value = '';
  if (errorMsg) errorMsg.style.display = 'none';

  if (modal) {
    modal.classList.add('active');
  }
  if (input) input.focus();

  pendingAttendanceAction = onSuccess;
}

window.autoAsistencia = function () {
  const lang = securityConfig.language || 'es';
  if (!students || students.length === 0) return;

  const monthKey = translations[lang].months[currentMonth].substring(0, 3);
  let targetDIdx = 0;

  if (currentScope === 'semana') {
    const FULL_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const activeOffsets = currentDays.map(d => FULL_WEEK.indexOf(d));
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const offsetToMonday = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
    const dateOfFirstMonday = 1 - offsetToMonday;
    const startDayDate = dateOfFirstMonday + (currentWeek * 7);

    const today = new Date();
    let foundTodayIdx = -1;

    activeOffsets.forEach(offset => {
      const dObj = new Date(currentYear, currentMonth, startDayDate + offset);
      if (dObj.getDate() === today.getDate() && dObj.getMonth() === today.getMonth() && dObj.getFullYear() === today.getFullYear()) {
        foundTodayIdx = (currentWeek * 7) + offset;
      }
    });

    if (foundTodayIdx !== -1) {
      targetDIdx = foundTodayIdx;
    } else {
      targetDIdx = (currentWeek * 7) + activeOffsets[0];
    }
  } else {
    const today = new Date();
    if (today.getMonth() === currentMonth && today.getFullYear() === currentYear) {
      const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
      const offsetToMonday = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
      const dateOfFirstMonday = 1 - offsetToMonday;
      const daysDiff = Math.floor((today - new Date(currentYear, currentMonth, dateOfFirstMonday)) / (1000 * 60 * 60 * 24));
      if (daysDiff >= 0 && daysDiff < 35) {
        targetDIdx = daysDiff;
      }
    }
  }

  let count = 0;
  students.forEach((s) => {
    if (!s.history[monthKey]) s.history[monthKey] = Array(35).fill('empty');
    s.history[monthKey][targetDIdx] = 'present';
    markCellLastModified(s.name, monthKey, targetDIdx);
    if (securityConfig.ink) {
      markCellAsInkModified(s.name, monthKey, targetDIdx, 'present');
    }
    count++;
  });

  saveToLocal();
  renderTable();

  const msg = lang === 'es'
    ? `Asistencia marcada para ${count} estudiantes como Presente.`
    : `Attendance marked present for ${count} students.`;
  showNotif('Auto Asistencia', msg, 'success');
};

function rotateAttendance(sIdx, dIdx, mKey, bypassSecurity = false) {
  const current = students[sIdx].history[mKey][dIdx];
  const lang = securityConfig.language || 'es';

  if (!bypassSecurity) {
    const lockCheck = checkSecurityLocks(current, mKey, dIdx, students[sIdx].name);
    if (!lockCheck.allowed) {
      if (lockCheck.reason === 'pencil_locked' || lockCheck.reason === 'time_blocked_7d') {
        const title = lang === 'es' ? 'Edición Bloqueada' : 'Editing Blocked';
        const msg = lang === 'es' ? 'Este registro tiene más de 7 días y ya no puede ser modificado.' : 'This record is more than 7 days old and can no longer be modified.';
        showNotif(title, msg, 'error');
        return;
      }
      if (lockCheck.reason === 'basic') {
        showNotif('Modo Bloqueado', 'El registro está bloqueado y no puede editarse.', 'error');
        return;
      }
      if (lockCheck.reason === 'ink_requires_active') {
        const title = lang === 'es' ? 'Tinta Permanente' : 'Permanent Ink';
        const msg = lang === 'es' ? 'Activa el candado de asistencia desde el menú para realizar modificaciones.' : 'Activate the attendance lock from the menu to make modifications.';
        showNotif(title, msg, 'error');
        return;
      }
    }
  }

  let next = 'empty';

  if (current === 'empty') next = 'present';
  else if (current === 'present') next = 'late';
  else if (current === 'late') next = 'absent';
  else if (current === 'absent') next = 'empty';
  else next = 'empty';

  students[sIdx].history[mKey][dIdx] = next;
  const cellKey = `${mKey}_${dIdx}_g${activeGroupIdx}_${students[sIdx].name}`;
  if (next === 'empty') {
    delete manuallyEditedCells[cellKey];
  } else {
    manuallyEditedCells[cellKey] = true;
  }
  markCellLastModified(students[sIdx].name, mKey, dIdx);
  if (securityConfig.ink) {
    markCellAsInkModified(students[sIdx].name, mKey, dIdx, next);
  }
  saveToLocal();
  renderTable();
}


function setAttendance(status) {
  const { sIdx, dIdx, mKey } = activeSelection;
  const lang = securityConfig.language || 'es';
  if (sIdx === -1) return;

  students[sIdx].history[mKey][dIdx] = status;
  const cellKey = `${mKey}_${dIdx}_g${activeGroupIdx}_${students[sIdx].name}`;
  if (status === 'empty') {
    delete manuallyEditedCells[cellKey];
  } else {
    manuallyEditedCells[cellKey] = true;
  }
  markCellLastModified(students[sIdx].name, mKey, dIdx);
  if (securityConfig.ink) {
    markCellAsInkModified(students[sIdx].name, mKey, dIdx, status);
  }
  saveToLocal();
  renderTable();

  // Re-render student view if open
  if (document.getElementById('screen-acudiente').classList.contains('active')) {
    renderStudentMatrix();
  }

  const statusLabel = {
    empty: translations[lang].status_empty || (lang === 'es' ? 'Vacío' : 'Empty'),
    present: translations[lang].status_present,
    absent: translations[lang].status_absent,
    late: translations[lang].status_late
  };

  showNotif('Registro actualizado', `${students[sIdx].name} → ${statusLabel[status]}`);
  document.getElementById('attendance-choice-menu').style.display = 'none';
}

// ── AUTO ASISTENCIA LOGIC ──
let autoAsistenciaState = safeParseJSON('asistencia_auto_state', {});
let autoMarkedCells = safeParseJSON('asistencia_auto_marked', {});
let manuallyEditedCells = safeParseJSON('asistencia_manual_edited', {});

window.autoAsistencia = function () {
  const lang = securityConfig.language || 'es';
  const currentGroup = groups[activeGroupIdx];
  if (!currentGroup || !currentGroup.students || currentGroup.students.length === 0) return;

  const todayObj = new Date();
  const monthKey = translations[lang].months[todayObj.getMonth()].substring(0, 3);
  const targetDIdx = todayObj.getDate() - 1;

  const dayKey = `${monthKey}_${targetDIdx}_g${activeGroupIdx}`;
  const isCurrentlyActive = !!autoAsistenciaState[dayKey];

  if (!isCurrentlyActive) {
    let markedCount = 0;
    currentGroup.students.forEach(student => {
      if (!student.history) student.history = {};
      if (!student.history[monthKey]) student.history[monthKey] = Array(35).fill('empty');
      const cellKey = `${monthKey}_${targetDIdx}_g${activeGroupIdx}_${student.name}`;
      const currentVal = student.history[monthKey][targetDIdx] || 'empty';

      if (currentVal === 'empty') {
        student.history[monthKey][targetDIdx] = 'present';
        autoMarkedCells[cellKey] = true;
        delete manuallyEditedCells[cellKey];
        markCellLastModified(student.name, monthKey, targetDIdx);
        markedCount++;
      }
    });

    autoAsistenciaState[dayKey] = true;
  } else {
    currentGroup.students.forEach(student => {
      if (student.history && student.history[monthKey]) {
        const cellKey = `${monthKey}_${targetDIdx}_g${activeGroupIdx}_${student.name}`;
        if (autoMarkedCells[cellKey] && !manuallyEditedCells[cellKey] && student.history[monthKey][targetDIdx] === 'present') {
          student.history[monthKey][targetDIdx] = 'empty';
          delete autoMarkedCells[cellKey];
          markCellLastModified(student.name, monthKey, targetDIdx);
        }
      }
    });

    autoAsistenciaState[dayKey] = false;
  }

  localStorage.setItem('asistencia_auto_state', JSON.stringify(autoAsistenciaState));
  localStorage.setItem('asistencia_auto_marked', JSON.stringify(autoMarkedCells));
  localStorage.setItem('asistencia_manual_edited', JSON.stringify(manuallyEditedCells));
  saveToLocal();
  renderTable();
};

function openSortMenu(event, filter) {
  event.preventDefault();
  const menu = document.getElementById('attendance-choice-menu');

  // Custom content for sort menu
  menu.innerHTML = `
    <div class="choice-option sort-opt" data-sort="name-asc">Por Nombre (A-Z)</div>
    <div class="choice-option sort-opt" data-sort="lastname-asc">Por Apellido (A-Z)</div>
    <div class="choice-option sort-opt" data-sort="recent">Más recientes</div>
    <div class="choice-option sort-opt" data-sort="oldest">Más antiguos</div>
    <div class="choice-option sort-opt" data-sort="random">Aleatorio</div>
  `;

  menu.style.display = 'block';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;

  setTimeout(() => {
    const closeSortHandler = (e) => {
      const option = e.target.closest('.sort-opt');
      if (option) {
        currentSort = option.dataset.sort;
        renderTable(filter);
      }
      menu.style.display = 'none';
      window.removeEventListener('click', closeSortHandler);
      window.removeEventListener('touchstart', closeSortHandler);
    };

    window.addEventListener('click', closeSortHandler);
    window.addEventListener('touchstart', closeSortHandler);
  }, 10);
}

function openAttendanceMenu(event, sIdx, dIdx, mKey, bypassSecurity = false) {
  event.preventDefault();

  const current = students[sIdx].history[mKey][dIdx];
  const lang = securityConfig.language || 'es';

  if (!bypassSecurity) {
    const lockCheck = checkSecurityLocks(current, mKey, dIdx, students[sIdx].name);
    if (!lockCheck.allowed) {
      if (lockCheck.reason === 'pencil_locked' || lockCheck.reason === 'time_blocked_7d') {
        const title = lang === 'es' ? 'Edición Bloqueada' : 'Editing Blocked';
        const msg = lang === 'es' ? 'Este registro tiene más de 7 días y ya no puede ser modificado.' : 'This record is more than 7 days old and can no longer be modified.';
        showNotif(title, msg, 'error');
        return;
      }
      if (lockCheck.reason === 'basic') {
        showNotif('Modo Bloqueado', 'El registro está bloqueado y no puede editarse.', 'error');
        return;
      }
      if (lockCheck.reason === 'ink_requires_active') {
        const title = lang === 'es' ? 'Tinta Permanente' : 'Permanent Ink';
        const msg = lang === 'es' ? 'Activa el candado de asistencia desde el menú para realizar modificaciones.' : 'Activate the attendance lock from the menu to make modifications.';
        showNotif(title, msg, 'error');
        return;
      }
    }
  }

  activeSelection = { sIdx, dIdx, mKey };
  const menu = document.getElementById('attendance-choice-menu');

  // Restore attendance options
  menu.innerHTML = `
    <div class="choice-option att-opt" data-status="empty">
      <span class="status-dot empty" style="width:16px; height:16px; border: 1px dashed var(--text-secondary); background: transparent; display: inline-block; border-radius: 50%;"></span> <span data-i18n="status_empty">Vacío</span>
    </div>
    <div class="choice-option att-opt" data-status="present">
      <span class="status-dot present" style="width:16px; height:16px;">✓</span> <span data-i18n="status_present">Presente</span>
    </div>
    <div class="choice-option att-opt" data-status="late">
      <span class="status-dot late" style="width:16px; height:16px;">-</span> <span data-i18n="status_late">Tardanza</span>
    </div>
    <div class="choice-option att-opt" data-status="absent">
      <span class="status-dot absent" style="width:16px; height:16px;">✕</span> <span data-i18n="status_absent">Falta</span>
    </div>
  `;

  menu.style.display = 'block';

  if (window.innerWidth <= 768) {
    menu.style.left = '50%';
    menu.style.top = 'auto';
    menu.style.bottom = '85px';
    menu.style.transform = 'translateX(-50%)';
    menu.style.position = 'fixed';
  } else {
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.bottom = 'auto';
    menu.style.transform = 'none';
    menu.style.position = 'absolute';
  }

  setTimeout(() => {
    const closeMenuHandler = (e) => {
      const option = e.target.closest('.att-opt');
      if (option) {
        setAttendance(option.dataset.status);
      }
      menu.style.display = 'none';
      window.removeEventListener('click', closeMenuHandler);
      window.removeEventListener('touchstart', closeMenuHandler);
    };

    window.addEventListener('click', closeMenuHandler);
    window.addEventListener('touchstart', closeMenuHandler);
  }, 10);
}

let currentStudentView = 'semana';

window.setStudentView = function (view, btn) {
  currentStudentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderStudentMatrix();
};

function renderStudentMatrix() {
  const head = document.getElementById('student-matrix-head');
  const body = document.getElementById('student-matrix-body');
  const lang = securityConfig.language || 'es';
  if (!head || !body) return;

  // Find active guardian student (fallback to Ariana García)
  const guardianStudent = JSON.parse(localStorage.getItem('asistencia_guardian_student') || 'null');
  const targetName = guardianStudent ? guardianStudent.name : "Ariana García";

  let student = null;
  for (const g of groups) {
    const found = g.students.find(s => s.name === targetName);
    if (found) { student = found; break; }
  }
  if (!student && groups.length > 0 && groups[0].students.length > 0) {
    student = groups[0].students[0];
  }
  if (!student) return;

  const savedSubject = localStorage.getItem('asistencia_teacher_subject') || window.teacherSubject || "Maestro de Primaria";
  let subjects = [];
  if (savedSubject === "Maestro de Primaria") {
    subjects = ["Español", "Matemáticas", "Ciencias Naturales", "Ciencias Sociales", "Inglés"];
  } else {
    subjects = [savedSubject];
  }
  const monthKey = translations[lang].months[currentMonth].substring(0, 3);
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const dateOfFirstMonday = (firstDayOfMonth <= 1) ? (1 - firstDayOfMonth + 1) : (7 - firstDayOfMonth + 2);

  const labels = lang === 'es' ? ['L', 'M', 'M', 'J', 'V'] : ['M', 'T', 'W', 'T', 'F'];
  const dayThs = labels.map(l => `<th>${l}</th>`).join('');
  const weekWord = lang === 'es' ? 'Semana' : 'Week';
  const subjectHeaderLabel = lang === 'es' ? `Asignatura (${weekWord} ${currentWeek + 1})` : `Subject (${weekWord} ${currentWeek + 1})`;
  const monthHeaderLabel = lang === 'es' ? 'Asignaturas / Semanas' : 'Subjects / Weeks';

  if (currentStudentView === 'semana') {
    // SINGLE WEEK STRUCTURE
    head.innerHTML = `<tr><th class="matrix-main-header">${subjectHeaderLabel}</th>${dayThs}</tr>`;

    body.innerHTML = '';
    subjects.forEach((subject) => {
      let rowHTML = `<td class="subject-cell-parent"><span class="student-name">${subject}</span></td>`;
      const startDayDate = (currentWeek * 7);
      for (let d = 0; d < 5; d++) {
        const absIdx = startDayDate + d;
        const status = (student.history && student.history[monthKey] && student.history[monthKey][absIdx]) || 'empty';
        let iconHTML = '';
        if (status === 'present') iconHTML = '✓';
        else if (status === 'absent' || status === 'excused') iconHTML = '✕';
        else if (status === 'late' || status === 'late_excused') iconHTML = '-';

        rowHTML += `<td class="status-cell" data-label="${labels[d]}"><span class="status-dot ${status}">${iconHTML}</span></td>`;
      }
      body.innerHTML += `<tr class="parent-attendance-row">${rowHTML}</tr>`;
    });

  } else if (currentStudentView === 'mes') {
    // 4-WEEK SUBJECT-DRIVEN STRUCTURE
    head.innerHTML = `<tr><th class="matrix-main-header">${monthHeaderLabel}</th>${dayThs}</tr>`;

    body.innerHTML = '';
    subjects.forEach((subject) => {
      // Subject header row
      body.innerHTML += `<tr class="subject-section-header"><td colspan="6">${subject}</td></tr>`;

      const weeksInMonth = 4;
      for (let w = 0; w < Math.min(weeksInMonth, 5); w++) {
        let rowHTML = `<td class="week-label-td">${weekWord} ${w + 1}</td>`;
        const startDayDate = (w * 7);
        for (let d = 0; d < 5; d++) {
          const absIdx = startDayDate + d;
          const status = (student.history && student.history[monthKey] && student.history[monthKey][absIdx]) || 'empty';
          let iconHTML = '';
          if (status === 'present') iconHTML = '✓';
          else if (status === 'absent' || status === 'excused') iconHTML = '✕';
          else if (status === 'late' || status === 'late_excused') iconHTML = '-';

          rowHTML += `<td class="status-cell" data-label="${labels[d]}"><span class="status-dot ${status}">${iconHTML}</span></td>`;
        }
        body.innerHTML += `<tr class="parent-attendance-row">${rowHTML}</tr>`;
      }
    });

  } else {
    head.innerHTML = `<tr><th>Asignatura</th><th style="text-align: center;">Progreso Trimestral</th></tr>`;
    body.innerHTML = '';
    subjects.forEach(subject => {
      body.innerHTML += `
        <tr>
          <td class="subject-cell"><span class="student-name">${subject}</span></td>
          <td style="text-align: center;">
            <div class="guardian-stats-box">
              <span class="stat-pill present">12 Pres.</span>
              <span class="stat-pill absent">2 Aus.</span>
              <span class="stat-pill late">1 Tard.</span>
            </div>
          </td>
        </tr>`;
    });
  }
  renderGuardianScorecards(student);
  renderParentTasks();
  renderAttendanceChart(student);
}

function renderGuardianScorecards(student) {
  const noteContent = document.getElementById('acudiente-note-content');
  const tasksContent = document.getElementById('acudiente-tasks-content');
  const noteVal = document.getElementById('acudiente-note-val');
  const tasksVal = document.getElementById('acudiente-tasks-val');
  const tasksValLarge = document.getElementById('acudiente-tasks-val-large');
  const tasksSub = document.getElementById('acudiente-tasks-sub');
  const attPctEl = document.getElementById('acudiente-attendance-pct');
  const studentImg = document.getElementById('acudiente-student-img');

  // Fix: Do not return early if noteVal or tasksSub are not found in the DOM (e.g. index.html does not have them)
  if (!noteContent || !tasksContent || !tasksVal) return;

  // Student Image
  if (studentImg) {
    studentImg.src = student.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.name || 'Student'}`;
  }

  // Attendance Details
  const attDetailsEl = document.getElementById('acudiente-attendance-details');
  if (attDetailsEl) {
    let asistencias = 0;
    let tardes = 0;
    let faltas = 0;

    // Contar asistencias, faltas y tardanzas en todo el historial
    Object.values(student.history || {}).forEach(monthArr => {
      if (Array.isArray(monthArr)) {
        monthArr.forEach(status => {
          if (status === 'present') asistencias++;
          else if (status === 'late' || status === 'late_excused') tardes++;
          else if (status === 'absent') faltas++;
        });
      } else if (monthArr && typeof monthArr === 'object') {
        Object.values(monthArr).forEach(status => {
          if (status === 'present') asistencias++;
          else if (status === 'late' || status === 'late_excused') tardes++;
          else if (status === 'absent') faltas++;
        });
      }
    });

    attDetailsEl.innerHTML = `Faltas <span style="font-weight: 800;">${faltas}</span> &nbsp;Tardan <span style="font-weight: 800;">${tardes}</span> &nbsp;Asist <span style="font-weight: 800;">${asistencias}</span>`;
  }

  // Real Task Calculations
  const group = groups.find(g => g.students.some(s => s.name === student.name));
  const currentGroupId = group ? group.id : 'g1';
  const studentTasks = tareas.filter(t => t.groupId === currentGroupId);

  const totalInRegistry = studentTasks.length;
  const completed = studentTasks.filter(t => {
    const sState = studentTaskStates[t.id];
    return sState && sState.status === 'delivered';
  }).length;

  if (totalInRegistry === 0) {
    tasksVal.textContent = "0";
    if (tasksValLarge) tasksValLarge.textContent = "0";
  } else {
    tasksVal.textContent = `${completed}/${totalInRegistry}`;
    if (tasksValLarge) tasksValLarge.textContent = `${completed}/${totalInRegistry}`;
  }
  const pending = totalInRegistry - completed;
  if (tasksSub) {
    tasksSub.textContent = pending > 0 ? `${pending} pendientes en total` : 'Sin tareas pendientes';
  }

  const studentKey = (student.name || "").trim();
  const studentNoteVal = studentNotes[studentKey];

  // Citaciones Count (Notifications)
  const notifCountEl = document.getElementById('acudiente-notif-count');
  if (notifCountEl) {
    // 1. Pending Citations and Meetings (individual & general)
    const pendingCitaciones = citaciones.filter(c => (c.studentName === student.name || c.studentId === 'all') && c.status === 'pending');

    // 2. Pending Tasks
    const pendingTareas = studentTasks.filter(t => {
      const state = studentTaskStates[t.id] || { status: 'pending' };
      return state.status === 'pending';
    });

    // 3. Active (unread) Teacher Messages
    let messageCount = 0;
    if (studentNoteVal) {
      if (Array.isArray(studentNoteVal)) {
        messageCount = studentNoteVal.length;
      } else if (typeof studentNoteVal === 'string' && studentNoteVal.trim() !== "") {
        messageCount = 1;
      }
    }

    const totalNotifs = pendingCitaciones.length + pendingTareas.length + messageCount;
    notifCountEl.textContent = totalNotifs;

    // Dynamically style the notification card based on notification presence
    const notifSvg = document.getElementById('acudiente-notif-svg');
    if (notifSvg) {
      if (totalNotifs > 0) {
        notifSvg.setAttribute('stroke', '#ef4444');
        notifSvg.style.stroke = '#ef4444';
      } else {
        notifSvg.setAttribute('stroke', 'var(--text)');
        notifSvg.style.stroke = 'var(--text)';
      }
    }
  }

  // Dynamic layout logic for tasks and messages (Right Panel)

  // Extract all messages sent by the teacher
  let messages = [];
  if (studentNoteVal) {
    if (Array.isArray(studentNoteVal)) {
      messages = [...studentNoteVal];
    } else if (typeof studentNoteVal === 'string' && studentNoteVal.trim() !== "") {
      messages = [{ id: 'msg-legacy', text: studentNoteVal.trim(), date: Date.now() }];
    }
  }

  // Sort messages by date descending (most recent first)
  messages.sort((a, b) => b.date - a.date);

  const tasksPanel = document.getElementById('acudiente-tasks-panel');

  let htmlContent = "";

  if (messages.length > 0) {
    if (tasksPanel) tasksPanel.style.display = 'flex';
    if (tasksContent) tasksContent.style.display = 'none';
    if (noteContent) noteContent.style.display = 'flex';

    htmlContent = '<div style="display: flex; flex-direction: column; width: 100%; height: 100%; justify-content: flex-start; align-items: center; text-align: center; gap: 15px; overflow-y: auto;">';

    // ONLY render the most recent message
    const latestMessage = messages[0];
    const prefix = (window.teacherRole === 'profesor' ? 'Prof. ' : 'Maestro ');
    const tName = window.teacherName || 'Profesor';
    const tPhoto = window.teacherPhoto || `https://api.dicebear.com/7.x/notionists/svg?seed=${tName}`;

    htmlContent += `
      <div class="acudiente-note-card" style="display: flex; flex-direction: column; width: 100%; height: 100%; padding: 4px 6px; border: none; border-radius: 14px; background: transparent; justify-content: space-between; box-sizing: border-box;">

        <!-- READ VIEW -->
        <div id="acudiente-note-read-view" style="display: flex; flex-direction: column; width: 100%; height: 100%; justify-content: space-between;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px; text-align: left;">
              <div style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: #cbd5e1; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                ${getTeacherAvatarHTML(window.teacherPhoto)}
              </div>
              <div>
                <div style="font-size: 0.68rem; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.4px;">Mensaje del <span style="color:#0284c7;">Docente</span></div>
                <div style="font-size: 0.92rem; font-weight: 800; color: var(--text); line-height: 1.1;">${tName}</div>
              </div>
            </div>
          </div>
          
          <div style="width: 100%; height: 1px; background: var(--border); margin: 4px 0;"></div>
          
          <div style="font-size: 0.8rem; color: var(--text); font-weight: 500; line-height: 1.35; text-align: center; max-height: 50px; overflow-y: auto; padding: 2px 4px;">
            ${latestMessage.text}
          </div>
          
          <div id="acudiente-note-buttons" style="display: flex; gap: 8px; width: 100%; margin-top: 4px;">
            <button class="btn-premium-ghost" onclick="window.markNoteAsRead('${latestMessage.id}')" style="padding: 6px 10px; font-size: 0.78rem; font-weight: 700; flex: 1; border-radius: 6px;">Leído</button>
            <button class="btn-premium-primary" onclick="document.getElementById('acudiente-note-read-view').style.display='none'; document.getElementById('acudiente-reply-view').style.display='flex';" style="padding: 6px 10px; font-size: 0.78rem; font-weight: 700; color: #fff; background: var(--accent-blue); border: none; border-radius: 6px; cursor: pointer; flex: 1;">Responder</button>
          </div>
        </div>

        <!-- REPLY VIEW -->
        <div id="acudiente-reply-view" style="display: none; flex-direction: column; width: 100%; height: 100%; justify-content: space-between;">
          <div style="font-size: 0.75rem; font-weight: 700; color: #0284c7; text-align: left; text-transform: uppercase;">
            Responder a ${tName}
          </div>
          <textarea id="acudiente-reply-text" class="input-field" placeholder="Escribe tu respuesta al docente..." style="height: 60px; min-height: 50px; max-height: 70px; resize: none; margin: 4px 0; font-size: 0.8rem; padding: 8px; border-radius: 8px; width: 100%; box-sizing: border-box; border: 1.5px solid var(--accent-blue); color: var(--text); background: var(--surface);"></textarea>
          <div style="display: flex; gap: 8px; width: 100%;">
            <button class="btn-premium-ghost" style="padding: 6px 10px; font-size: 0.78rem; font-weight: 700; flex: 1; border-radius: 6px;" onclick="document.getElementById('acudiente-reply-view').style.display='none'; document.getElementById('acudiente-note-read-view').style.display='flex';">Cancelar</button>
            <button class="btn-premium-primary" style="padding: 6px 10px; font-size: 0.78rem; font-weight: 700; flex: 1.2; border-radius: 6px; background: var(--accent-blue); border: none; color: white; cursor: pointer;" onclick="window.sendAcudienteReply('${latestMessage.id}')">Enviar Respuesta</button>
          </div>
        </div>

      </div>
    `;

    htmlContent += '</div>';
    if (noteContent) noteContent.innerHTML = htmlContent;

  } else {
    // Show empty state
    if (tasksPanel) tasksPanel.style.display = 'flex';
    if (tasksContent) tasksContent.style.display = 'none';
    if (noteContent) {
      noteContent.style.display = 'flex';
      noteContent.innerHTML = `
        <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--bg-main); border: 1px dashed var(--border); display: flex; align-items: center; justify-content: center; margin-bottom: 6px; color: var(--text-muted);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.65;">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
        </div>
        <div style="font-size: 0.88rem; font-weight: 700; color: var(--text); margin-bottom: 2px;">Sin mensajes nuevos</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); max-width: 220px; line-height: 1.3; opacity: 0.85;">
          No tienes avisos, citaciones ni reuniones pendientes en este momento.
        </div>
      `;
    }
  }
}

window.openContactDocente = function () {
  const modal = document.getElementById('modal-contact-docente');
  if (!modal) return;

  const nameEl = document.getElementById('contact-teacher-name');
  const imgEl = document.getElementById('contact-teacher-img');
  const roleEl = document.getElementById('contact-teacher-role');
  const subjectEl = document.getElementById('contact-teacher-subject');
  const phoneEl = document.getElementById('contact-teacher-phone');
  const callBtn = document.getElementById('btn-call-teacher');
  const waBtn = document.getElementById('btn-whatsapp-teacher');

  const prefix = (teacherRole === 'profesor' ? 'Prof. ' : 'Maestro ');
  if (nameEl) nameEl.textContent = prefix + (teacherName || "Guillermo");
  if (roleEl) roleEl.textContent = (teacherRole === 'profesor' ? 'Docente' : 'Maestro') + ' de ' + (teacherSubject || 'Educación');
  if (subjectEl) subjectEl.textContent = teacherSubject || "No especificada";
  if (phoneEl) phoneEl.textContent = teacherPhone || "No especificado";

  // Bind Call and WhatsApp links
  const phoneRaw = (teacherPhone || "").replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (callBtn) {
    if (phoneRaw) {
      callBtn.href = `tel:${phoneRaw}`;
      callBtn.style.pointerEvents = 'auto';
      callBtn.style.opacity = '1';
    } else {
      callBtn.removeAttribute('href');
      callBtn.style.pointerEvents = 'none';
      callBtn.style.opacity = '0.5';
    }
  }
  if (waBtn) {
    if (phoneRaw) {
      let waNumber = phoneRaw;
      if (!waNumber.startsWith('+') && !waNumber.startsWith('507') && waNumber.length === 8) {
        waNumber = '507' + waNumber;
      } else {
        waNumber = waNumber.replace('+', '');
      }
      waBtn.href = `https://wa.me/${waNumber}?text=Hola%20${encodeURIComponent(prefix + (teacherName || "Guillermo"))}`;
      waBtn.style.pointerEvents = 'auto';
      waBtn.style.opacity = '1';
    } else {
      waBtn.removeAttribute('href');
      waBtn.style.pointerEvents = 'none';
      waBtn.style.opacity = '0.5';
    }
  }

  if (imgEl) {
    if (teacherPhoto && teacherPhoto.trim() !== '') {
      imgEl.src = teacherPhoto;
      imgEl.style.background = 'transparent';
    } else {
      const fallbackSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="4" fill="white"/><path d="M4 19c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6v1H4v-1z" fill="white"/></svg>`;
      imgEl.src = `data:image/svg+xml;base64,${btoa(fallbackSVG)}`;
      imgEl.style.background = '#cbd5e1';
    }
  }

  modal.classList.add('active');
};

function updateMessageBadge() {
  const badge = document.getElementById('msg-badge');
  if (badge) {
    if (teacherMessages.length > 0) {
      badge.textContent = teacherMessages.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

window.renderTeacherMessages = function () {
  const list = document.getElementById('teacher-messages-list');
  if (!list) return;

  // Force re-load messages from storage
  teacherMessages = JSON.parse(localStorage.getItem('asistencia_teacher_messages')) || [];

  updateMessageBadge();

  if (teacherMessages.length === 0) {
    list.innerHTML = '<p style="color: var(--muted); padding: 40px; text-align: center; font-weight: 500;">No hay mensajes nuevos en tu bandeja de entrada.</p>';
    return;
  }

  list.innerHTML = teacherMessages.map((msg, i) => `
    <div id="teacher-msg-${i}" class="teacher-message-item" style="background: var(--surface); padding: 18px; border-radius: 16px; border: 1.5px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.03); display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; transition: all 0.3s ease;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-main);">
          Acudiente de: <span style="color: var(--accent-teal);">${msg.studentName}</span>
        </div>
        <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
          ${new Date(msg.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </div>
      </div>
      <div style="font-size: 0.95rem; line-height: 1.5; color: var(--text-main); background: var(--bg-card); padding: 14px; border-radius: 12px; border-left: 4px solid var(--accent-teal);">
        "${msg.text}"
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
         <button class="btn-premium-ghost" style="padding: 6px 14px; font-size: 0.8rem; color: #10b981; border-color: rgba(16, 185, 129, 0.2);" onclick="window.confirmDeleteTeacherMessage(${i})">Entendido</button>
      </div>
    </div>
  `).join('');
};

window.renderCitaciones = function () {
  const list = document.getElementById('citaciones-list');
  if (!list) return;

  // Force re-load citations from storage
  citaciones = JSON.parse(localStorage.getItem('asistencia_citaciones')) || [];

  if (citaciones.length === 0) {
    list.innerHTML = '<p style="color: var(--muted); padding: 20px;">No hay citaciones programadas.</p>';
    return;
  }

  list.innerHTML = citaciones.map((cit, i) => `
    <div class="citacion-card" style="background: var(--surface); padding: 15px; border-radius: 12px; border: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px;">
       <div style="display: flex; justify-content: space-between;">
         <span style="font-weight: 700;">${cit.studentName}</span>
         <span style="font-size: 0.8rem; color: var(--muted);">${cit.date} - ${cit.time}</span>
       </div>
       <div style="font-size: 0.85rem; color: var(--text-main);">${cit.reason}</div>
       <div style="display: flex; justify-content: flex-end;">
         <button class="btn-premium-ghost" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.2);" onclick="window.deleteCitacion(${i})">Eliminar</button>
       </div>
    </div>
  `).join('');
};

window.confirmDeleteTeacherMessage = function (i) {
  const el = document.getElementById(`teacher-msg-${i}`);
  if (el) el.classList.add('exit-active');
  setTimeout(() => {
    teacherMessages.splice(i, 1);
    saveToLocal();
    renderTeacherMessages();
  }, 400);
};

window.deleteTeacherMessage = function (index) {
  teacherMessages.splice(index, 1);
  saveToLocal();
  renderTeacherMessages();
};

window.markNoteAsRead = function (msgId) {
  const currentStudent = JSON.parse(localStorage.getItem('asistencia_guardian_student'));
  if (!currentStudent) return;

  const card = document.querySelector('.acudiente-note-card');
  if (card) {
    card.classList.add('exit-active');
    setTimeout(() => {
      // Add to teacher messages
      teacherMessages.push({
        studentName: currentStudent.name,
        text: `El acudiente de ${currentStudent.name} ha leído tu mensaje.`,
        date: Date.now()
      });

      // Clear the specific note
      const studentKey = currentStudent.name;
      const noteVal = studentNotes[studentKey];
      if (Array.isArray(noteVal)) {
        studentNotes[studentKey] = noteVal.filter(m => m.id !== msgId);
        if (studentNotes[studentKey].length === 0) {
          delete studentNotes[studentKey];
        }
      } else {
        delete studentNotes[studentKey];
      }
      saveToLocal();

      // Notify
      showNotif("Marcado como leído", "Las tareas ocultas ahora están visibles.");

      // Re-render dashboard
      renderGuardianScorecards(currentStudent);
      renderCitaciones();
    }, 400);
  }
};

window.sendAcudienteReply = function (msgId) {
  const currentStudent = JSON.parse(localStorage.getItem('asistencia_guardian_student'));
  if (!currentStudent) return;

  const replyInput = document.getElementById('acudiente-reply-text');
  if (!replyInput || !replyInput.value.trim()) return;

  const card = document.querySelector('.acudiente-note-card');
  if (card) {
    card.classList.add('exit-active');
    setTimeout(() => {
      // Add to teacher messages
      teacherMessages.push({
        studentName: currentStudent.name,
        text: replyInput.value.trim(),
        date: Date.now()
      });

      // Clear the specific note on the student's end
      const studentKey = currentStudent.name;
      const noteVal = studentNotes[studentKey];
      if (Array.isArray(noteVal)) {
        studentNotes[studentKey] = noteVal.filter(m => m.id !== msgId);
        if (studentNotes[studentKey].length === 0) {
          delete studentNotes[studentKey];
        }
      } else {
        delete studentNotes[studentKey];
      }
      saveToLocal();

      // Notify
      showNotif("Mensaje Enviado", "mensaje enviado correctamente");

      // Reset UI and re-render
      replyInput.value = '';
      const replyArea = document.getElementById('acudiente-reply-area');
      if (replyArea) replyArea.style.display = 'none';
      renderGuardianScorecards(currentStudent);
      renderCitaciones();
    }, 400);
  }
};

let attendanceChartInstance = null;
function renderAttendanceChart(student) {
  const canvas = document.getElementById('attendanceChart');
  const lang = securityConfig.language || 'es';
  if (!canvas) return;

  const monthKey = translations[lang].months[currentMonth].substring(0, 3);
  const monthName = translations[lang].months[currentMonth];
  const chartLabel = document.getElementById('parent-chart-label');
  if (chartLabel) chartLabel.textContent = `Tendencia de ${monthName}`;

  const data = {
    labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
    presents: [0, 0, 0, 0],
    late: [0, 0, 0, 0],
    absents: [0, 0, 0, 0]
  };

  if (student && student.history) {
    for (let w = 0; w < 4; w++) {
      const startDayDate = (w * 7);
      for (let d = 0; d < 5; d++) {
        const absIdx = startDayDate + d;
        if (student.history[monthKey] && student.history[monthKey][absIdx]) {
          const status = student.history[monthKey][absIdx];
          if (status === 'present') data.presents[w]++;
          else if (status === 'late' || status === 'late_excused') data.late[w]++;
          else if (status === 'absent' || status === 'excused') data.absents[w]++;
        }
      }
    }
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';

  if (attendanceChartInstance) {
    attendanceChartInstance.data.datasets[0].data = data.presents;
    attendanceChartInstance.data.datasets[1].data = data.late;
    attendanceChartInstance.data.datasets[2].data = data.absents;
    attendanceChartInstance.options.scales.x.ticks.color = textColor;
    attendanceChartInstance.options.scales.y.ticks.color = textColor;
    attendanceChartInstance.options.scales.x.grid.color = gridColor;
    attendanceChartInstance.options.scales.y.grid.color = gridColor;
    attendanceChartInstance.update();
  } else {
    const ctx = canvas.getContext('2d');
    const gradAsistencias = ctx.createLinearGradient(0, 0, 0, 200);
    gradAsistencias.addColorStop(0, 'rgba(20, 184, 166, 0.4)');
    gradAsistencias.addColorStop(1, 'rgba(20, 184, 166, 0.0)');

    const gradTardanzas = ctx.createLinearGradient(0, 0, 0, 200);
    gradTardanzas.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
    gradTardanzas.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

    const gradFaltas = ctx.createLinearGradient(0, 0, 0, 200);
    gradFaltas.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    gradFaltas.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    attendanceChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Asistencias',
            data: data.presents,
            borderColor: '#14b8a6',
            backgroundColor: gradAsistencias,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            borderWidth: 2.5
          },
          {
            label: 'Tardanzas',
            data: data.late,
            borderColor: '#f59e0b',
            backgroundColor: gradTardanzas,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            borderWidth: 2.5
          },
          {
            label: 'Faltas',
            data: data.absents,
            borderColor: '#ef4444',
            backgroundColor: gradFaltas,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 8,
              usePointStyle: true,
              font: { size: 10, weight: '600', family: "'Sora', sans-serif" },
              color: textColor
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            titleColor: isDark ? '#ffffff' : '#0f172a',
            bodyColor: isDark ? '#94a3b8' : '#64748b',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { size: 9, weight: '500' } },
            grid: { color: gridColor, drawBorder: false }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: textColor,
              font: { size: 9, weight: '500' },
              stepSize: 1
            },
            grid: { color: gridColor, drawBorder: false }
          }
        },
        interaction: { mode: 'index', intersect: false }
      }
    });
  }
}

window.openCitacionForStudent = function (studentName) {
  const modal = document.getElementById('modal-add-citacion');
  if (!modal) return;

  // Clean up any other open overlays to prevent "black hole" leakage
  document.querySelectorAll('.overlay.active').forEach(ov => ov.classList.remove('active'));

  const input = document.getElementById('citacion-student');
  if (input) input.value = studentName;

  modal.classList.add('active');
  const reason = document.getElementById('citacion-reason');
  if (reason) reason.focus();
};

window.openNoteForStudent = function (studentName) {
  const modal = document.getElementById('modal-add-note');
  if (!modal) return;

  const titleEl = document.getElementById('note-student-name');
  if (titleEl) titleEl.textContent = `Para: ${studentName}`;

  const textarea = document.getElementById('teacher-note-textarea');
  if (textarea) textarea.value = ""; // Clear for a new message

  modal.classList.add('active');

  const saveBtn = document.getElementById('save-note-btn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const val = textarea ? textarea.value.trim() : "";
      if (val) {
        if (!Array.isArray(studentNotes[studentName])) {
          const oldNote = studentNotes[studentName];
          studentNotes[studentName] = [];
          if (oldNote && typeof oldNote === 'string' && oldNote.trim()) {
            studentNotes[studentName].push({ id: 'msg-old', text: oldNote, date: Date.now() - 1000 });
          }
        }
        studentNotes[studentName].push({
          id: 'msg-' + Date.now(),
          text: val,
          date: Date.now()
        });
        saveToLocal();
      }
      window.closeOverlay?.('modal-add-note');
      if (window.showNotif) window.showNotif('Mensaje Enviado', 'mensaje enviado correctamente');
    };
  }
};

function renderV6DoughnutNative(canvas, stats) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  const w = parent ? (parent.clientWidth || 340) : 340;
  const h = parent ? (parent.clientHeight || 180) : 180;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(2, 2);
  ctx.clearRect(0, 0, w, h);

  const p = stats.p || 15;
  const l = stats.l || 2;
  const a = stats.a || 1;
  const total = p + l + a || 1;

  const slices = [
    { label: 'Puntual', value: p, color: '#00b4d8' },
    { label: 'Tarde', value: l, color: '#f59e0b' },
    { label: 'Falta', value: a, color: '#6366f1' }
  ];

  const centerX = w * 0.35;
  const centerY = h * 0.5;
  const radius = Math.min(centerX, centerY) - 12;
  const innerRadius = radius * 0.62;

  let startAngle = -Math.PI / 2;

  slices.forEach(slice => {
    if (slice.value <= 0) return;
    const angle = (slice.value / total) * (Math.PI * 2);
    const endAngle = startAngle + angle;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();

    ctx.fillStyle = slice.color;
    ctx.fill();

    startAngle = endAngle;
  });

  // Center text (%)
  const pct = Math.round((p / total) * 100);
  ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
  ctx.font = '800 20px "Sora", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${pct}%`, centerX, centerY - 5);

  ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
  ctx.font = '700 9px "Sora", sans-serif';
  ctx.fillText('ASISTENCIA', centerX, centerY + 12);

  // Right Side Legend
  const legendX = w * 0.65;
  let legendY = centerY - 24;

  slices.forEach(slice => {
    ctx.beginPath();
    ctx.arc(legendX, legendY, 5, 0, Math.PI * 2);
    ctx.fillStyle = slice.color;
    ctx.fill();

    ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
    ctx.font = '700 12px "Sora", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${slice.label}: ${slice.value}`, legendX + 12, legendY);

    legendY += 24;
  });
}

window.openStudentProfileV6 = function (studentName) {
  if (navigator.vibrate) navigator.vibrate(40);

  const modal = document.getElementById('modal-profile-v6');
  if (!modal) return;

  // Show Modal
  modal.classList.add('active');
  document.body.classList.add('modal-open');

  // Close on backdrop click
  modal.onclick = (e) => {
    if (e.target.id === 'modal-profile-v6') window.closeStudentProfileV6();
  };

  try {
    let student = null;
    let group = null;
    const searchName = String(studentName || "").trim().toLowerCase();

    if (searchName && typeof groups !== 'undefined') {
      for (const g of groups) {
        const found = g.students.find(s => (s.name || '').trim().toLowerCase() === searchName);
        if (found) { student = found; group = g; break; }
      }
    }

    if (!student) {
      // Fallback to active guardian student or first student
      const stored = JSON.parse(localStorage.getItem('asistencia_guardian_student') || 'null');
      const targetName = stored ? stored.name : "Ariana García";
      const targetId = stored ? stored.id : "101-P";
      if (typeof groups !== 'undefined') {
        for (const g of groups) {
          const found = g.students.find(s => s.id === targetId || (s.name || '').trim().toLowerCase() === targetName.trim().toLowerCase());
          if (found) { student = found; group = g; break; }
        }
      }
    }

    if (!student && groups && groups[0] && groups[0].students[0]) {
      student = groups[0].students[0];
      group = groups[0];
    }

    if (!student) {
      student = { name: studentName || "Ariana García", history: {}, id: '101-P' };
    }

    // Stats Logic
    let stats = { p: 0, l: 0, a: 0, total: 0 };
    Object.values(student.history || {}).forEach(m => {
      if (Array.isArray(m)) {
        m.forEach(statusVal => {
          if (statusVal === 'present') stats.p++;
          else if (statusVal === 'late' || statusVal === 'late_excused') stats.l++;
          else if (statusVal === 'absent' || statusVal === 'excused') stats.a++;
          if (statusVal !== 'empty') stats.total++;
        });
      } else if (m && typeof m === 'object') {
        Object.values(m).forEach(statusVal => {
          if (statusVal === 'present') stats.p++;
          else if (statusVal === 'late' || statusVal === 'late_excused') stats.l++;
          else if (statusVal === 'absent' || statusVal === 'excused') stats.a++;
          if (statusVal !== 'empty') stats.total++;
        });
      }
    });

    const percent = stats.total > 0 ? Math.round((stats.p / stats.total) * 100) : 0;

    // Last Record Calculation (Dynamic, no hardcoding)
    let lastRecordDate = 'Sin registros';
    if (student && student.history && typeof student.history === 'object') {
      let latestDateObj = null;

      Object.entries(student.history).forEach(([key, val]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          if (val && val !== 'empty') {
            const d = new Date(key + 'T00:00:00');
            if (!latestDateObj || d > latestDateObj) latestDateObj = d;
          }
        } else {
          // Month abbreviation format (Ene, Feb, Mar, etc.)
          if (Array.isArray(val)) {
            val.forEach((statusVal, dIdx) => {
              if (statusVal && statusVal !== 'empty') {
                const mIdx = typeof getMonthIdxFromKey === 'function' ? getMonthIdxFromKey(key) : (currentMonth || 0);
                const year = currentYear || new Date().getFullYear();
                const firstDayOfMonth = new Date(year, mIdx, 1).getDay();
                const offsetToMonday = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
                const dateOfFirstMonday = 1 - offsetToMonday;
                const dObj = new Date(year, mIdx, dateOfFirstMonday + dIdx);
                if (!latestDateObj || dObj > latestDateObj) latestDateObj = dObj;
              }
            });
          } else if (val && typeof val === 'object') {
            Object.entries(val).forEach(([dayKey, statusVal]) => {
              if (statusVal && statusVal !== 'empty') {
                if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
                  const d = new Date(dayKey + 'T00:00:00');
                  if (!latestDateObj || d > latestDateObj) latestDateObj = d;
                } else {
                  const dayNum = parseInt(dayKey);
                  if (!isNaN(dayNum)) {
                    const mIdx = typeof getMonthIdxFromKey === 'function' ? getMonthIdxFromKey(key) : (currentMonth || 0);
                    const year = currentYear || new Date().getFullYear();
                    const dObj = new Date(year, mIdx, dayNum);
                    if (!latestDateObj || dObj > latestDateObj) latestDateObj = dObj;
                  }
                }
              }
            });
          }
        }
      });

      if (latestDateObj && !isNaN(latestDateObj.getTime())) {
        const monthNamesEs = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const d = latestDateObj.getDate();
        const m = monthNamesEs[latestDateObj.getMonth()];
        lastRecordDate = `${d} ${m}`;
      }
    }

    // Dynamic Tasks Calculation (No static fallbacks)
    let studentTasksTotal = 0;
    let studentTasksCompleted = 0;
    if (typeof tareas !== 'undefined' && Array.isArray(tareas)) {
      const studentGroupId = group ? group.id : null;
      const relevantTasks = tareas.filter(t => t.groupId === 'all' || (studentGroupId && t.groupId === studentGroupId));
      studentTasksTotal = relevantTasks.length;

      const completedList = student.completedTasks || student.tasksCompletedList || [];
      if (Array.isArray(completedList)) {
        studentTasksCompleted = relevantTasks.filter(t => completedList.includes(t.id)).length;
      } else if (typeof student.tasksCompleted === 'number') {
        studentTasksCompleted = Math.min(student.tasksCompleted, studentTasksTotal);
      }
    }
    const tasksText = `${studentTasksCompleted}/${studentTasksTotal}`;

    // Render ResumenEstudiante Component
    const totalStats = (stats.p || 0) + (stats.l || 0) + (stats.a || 0);
    const pDeg = totalStats > 0 ? ((stats.p || 0) / totalStats) * 360 : 0;
    const lDeg = totalStats > 0 ? ((stats.l || 0) / totalStats) * 360 : 0;
    const aDeg = totalStats > 0 ? ((stats.a || 0) / totalStats) * 360 : 0;
    const gradient = totalStats > 0
      ? `conic-gradient(#4CAF50 0deg ${pDeg}deg, #FFD60A ${pDeg}deg ${pDeg + lDeg}deg, #E63946 ${pDeg + lDeg}deg 360deg)`
      : `conic-gradient(#E5E7EB 0deg 360deg)`;

    const mountPoint = document.getElementById('re-container-mount');
    if (mountPoint) {
      // 1. Alergias dinámicas
      const rawAllergies = student.alergias || student.allergies || student.diseases || '';
      let allergiesHTML = '';
      if (Array.isArray(rawAllergies) && rawAllergies.length > 0) {
        allergiesHTML = rawAllergies.map(a => `<li>${a}</li>`).join('');
      } else if (typeof rawAllergies === 'string' && rawAllergies.trim() !== '') {
        allergiesHTML = rawAllergies.split(',').map(a => `<li>${a.trim()}</li>`).join('');
      } else {
        allergiesHTML = `<li>Sin alergias registradas</li>`;
      }

      // 2. Sangre dinámica
      const rawBlood = student.sangre || student.bloodType || student.tipoSangre || '';
      const bloodTypeHTML = (rawBlood && rawBlood !== 'Sin definir' && rawBlood.trim() !== '')
        ? `<li class="resumen-sangre">Sangre tipo ${rawBlood}</li>`
        : `<li class="resumen-sangre" style="color: var(--muted, #64748b); font-weight: 600;">Sangre: Sin definir</li>`;

      const rawPhone = student.contact || student.telefono || '';
      const phoneNum = rawPhone.replace(/\D/g, '');
      const phoneLink = phoneNum ? `https://wa.me/${phoneNum}` : '#';

      mountPoint.innerHTML = `
        <div class="resumen-estudiante-card" id="resumen-card-${student.id || '101-P'}">
          <button class="resumen-close-btn" onclick="window.closeStudentProfileV6()" title="Cerrar">&times;</button>

          <!-- ESCRITORIO: Header top con Raya Negra Horizontal debajo -->
          <div class="resumen-desktop-header re-desktop-only">
            <h3 class="resumen-title">Resumen de ${student.name}</h3>
            <span class="resumen-grado">${group ? group.name : '12°A'}</span>
          </div>
          <hr class="resumen-header-line re-desktop-only" />

          <div class="resumen-body-grid">
            <!-- COLUMNA IZQUIERDA: Chart y Leyenda -->
            <div class="resumen-col-chart">
              <div class="resumen-pie-chart" style="background: ${gradient};"></div>
              <div class="resumen-legend-numbers re-desktop-only">
                <span>■1</span><span>■2</span><span>■3</span><span>■4</span>
              </div>
              <div class="resumen-legend-text">
                <span class="txt-asistencia">Asistencia</span>
                <span class="txt-falta">Falta</span>
                <span class="txt-tardanzas">Tardanzas</span>
              </div>
            </div>

            <!-- MÓVIL: Raya negra debajo de la leyenda + Título del Estudiante -->
            <div class="re-mobile-title-container re-mobile-only">
              <hr class="resumen-header-line" />
              <h3 class="resumen-title-mobile">Resumen de ${student.name}</h3>
            </div>

            <!-- COLUMNA DERECHA: Datos del Estudiante -->
            <div class="resumen-col-data">
              <div>Promedio de asistencia <span class="resumen-val-green">${percent}%</span></div>
              <div class="re-desktop-only">Ultima asistencia <span class="resumen-val-blue">${lastRecordDate}</span></div>
              <div>Tareas: ${tasksText}</div>
              <div>Acudiente: ${student.guardianName || '(Nombre)'} ${student.contact ? `(${student.contact})` : '(número telefónico)'}</div>
              
              <!-- MÓVIL: Botón de WhatsApp -->
              <div class="resumen-whatsapp-container re-mobile-only">
                <a href="${phoneLink}" target="_blank" class="resumen-whatsapp-btn" style="text-decoration:none; color:white;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                  </svg>
                </a>
              </div>

              <!-- MÓVIL: Línea divisoria con Cruz de Emergencia en la derecha -->
              <div class="resumen-divider-wrapper">
                <hr class="resumen-hr">
                <a href="tel:911" class="resumen-mobile-emergency-float re-mobile-only" title="Llamar al 911">
                  <img src="/emergency-cross.png" alt="Emergencia" class="resumen-emergency-img-mobile" />
                </a>
              </div>

              <div class="resumen-med-title">Datos médicos</div>
              <ul class="resumen-med-list">
                ${allergiesHTML}
                ${bloodTypeHTML}
              </ul>
            </div>
          </div>

          <!-- ESCRITORIO: Botón de Emergencia 911 (Flotante Abajo Derecha) -->
          <a href="tel:911" class="resumen-emergency-box re-desktop-only" style="text-decoration:none; cursor:pointer;" title="Llamar al 911">
            <img src="/emergency-cross.png" alt="Emergencia" class="resumen-emergency-img" />
            <span class="resumen-911-text">911</span>
          </a>
        </div>
      `;

      // Trigger Smooth Conic-Gradient Sweep + Elastic Pop Animation
      setTimeout(() => {
        const chartElem = mountPoint.querySelector('.resumen-pie-chart');
        if (chartElem) {
          chartElem.classList.remove('animate-entry');
          void chartElem.offsetWidth; // Force reflow
          chartElem.classList.add('animate-entry');

          if (totalStats > 0) {
            const startTime = performance.now();
            const duration = 850;

            function animatePie(now) {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease Out Cubic

              const curP = pDeg * easeProgress;
              const curL = lDeg * easeProgress;
              const curA = aDeg * easeProgress;

              chartElem.style.background = `conic-gradient(#4CAF50 0deg ${curP}deg, #FFD60A ${curP}deg ${curP + curL}deg, #E63946 ${curP + curL}deg ${curP + curL + curA}deg, #E5E7EB ${curP + curL + curA}deg 360deg)`;

              if (progress < 1) {
                requestAnimationFrame(animatePie);
              }
            }

            requestAnimationFrame(animatePie);
          }
        }
      }, 50);
    }
  } catch (err) {
    console.error("V6 Profile Error:", err);
  }
};

// updateShiftUI is defined above at line 640


window.closeStudentProfileV6 = function () {
  const modal = document.getElementById('modal-profile-v6');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
};





function renderParentTasks() {
  const container = document.getElementById('parent-tasks-container');
  const lang = securityConfig.language || 'es';
  if (!container) return;

  const guardianStudent = JSON.parse(localStorage.getItem('asistencia_guardian_student') || 'null');
  let guardianGroupId = null;
  let guardianGroupName = null;
  if (guardianStudent && Array.isArray(groups)) {
    const gObj = groups.find(g => g.students.some(s => s.id === guardianStudent.id || s.name === guardianStudent.name));
    if (gObj) {
      guardianGroupId = gObj.id;
      guardianGroupName = gObj.name;
    }
  }

  const currentTareas = tareas.filter(t => {
    if (!t.groupId || t.groupId === 'all') return true;
    if (guardianGroupId && t.groupId === guardianGroupId) return true;
    if (guardianGroupName && t.groupName === guardianGroupName) return true;
    return false;
  });

  if (currentTareas.length === 0) {
    container.innerHTML = `
      <div class="empty-state-v2">
        <div class="v2-separator"></div>
        <div class="header-pill">Tareas de su hijo/a</div>
        <div class="empty-icon-wrapper">
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-svg-icon"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
        </div>
        <div class="empty-text-v2">Sin tareas asignadas en el registro</div>
      </div>
    `;
    renderCitaciones();
    return;
  }

  const pendingCount = currentTareas.filter(t => {
    const state = studentTaskStates[t.id] || { status: 'pending' };
    return state.status === 'pending';
  }).length;

  let html = `
    <div class="header-pill" style="margin-bottom: 24px;">
      Tareas de su hijo/a
      ${pendingCount > 0 ? `<div class="badge-mini">${pendingCount} PENDIENTES</div>` : ''}
    </div>
  `;

  const grouped = {};
  currentTareas.forEach(t => {
    const subjKey = t.subject || 'General';
    if (!grouped[subjKey]) grouped[subjKey] = [];
    grouped[subjKey].push(t);
  });

  const subjects = Object.keys(grouped).sort();
  subjects.forEach(subject => {
    const tasks = grouped[subject].sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
    html += `
       <div class="parent-task-group">
         <div class="task-group-header">
           <span class="subject-tag" style="background: ${getSubjectColor(subject)}20; color: ${getSubjectColor(subject)};">
             ${subject}
           </span>
         </div>
         <div class="parent-task-list">
     `;

    tasks.forEach(t => {
      const state = studentTaskStates[t.id] || { status: 'pending' };
      const d = new Date(t.dueDate);
      const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

      let statusLabel = 'Pendiente';
      let statusClass = 'pending';
      if (state.status === 'delivered') { statusLabel = 'Entregado'; statusClass = 'delivered'; }
      if (state.status === 'missed') { statusLabel = 'No Entregó'; statusClass = 'missed'; }

      html += `
         <div class="parent-task-card ${statusClass}" onclick="window.showTaskDetails('${t.id}')" style="display: flex; align-items: center; justify-content: space-between; padding: 16px; gap: 12px; max-width: 100%; box-sizing: border-box; cursor: pointer;">
           <!-- Left Column: Icon + Line + Text -->
           <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
             <!-- Clipboard Checklist Icon -->
             <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(2, 132, 199, 0.08); flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  <path d="M9 12l2 2 4-4"></path>
                  <path d="M9 16h6"></path>
                </svg>
             </div>
             
             <!-- Separator Line -->
             <div style="width: 1.5px; height: 36px; background: rgba(0, 0, 0, 0.08); flex-shrink: 0;"></div>
             
             <!-- Text Middle -->
             <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;">
               <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                 <span style="background: rgba(2, 132, 199, 0.1); color: #0284c7; font-size: 0.72rem; font-weight: 800; padding: 2px 7px; border-radius: 5px; text-transform: uppercase;">
                   ${t.subject || 'Tarea'}
                 </span>
                 ${t.groupName || t.groupId ? `
                   <span style="background: rgba(14, 165, 233, 0.12); color: #0284c7; font-size: 0.72rem; font-weight: 800; padding: 2px 7px; border-radius: 5px; text-transform: uppercase;">
                     ${t.groupName || (groups.find(g => g.id === t.groupId)?.name) || ''}
                   </span>
                 ` : ''}
                 <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">¡Nueva Tarea!</span>
               </div>
               <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-main); line-height: 1.3;">
                 ${t.title}
               </div>
               <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-top: 1px;">
                 Fecha de entrega: ${dateStr}
               </div>
               ${t.photo ? `
                 <div style="margin-top: 8px; width: 100%; max-width: 280px; max-height: 130px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); cursor: pointer; position: relative;" onclick="event.stopPropagation(); window.openTaskImageModal('${t.id}')">
                   <img src="${t.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="${t.title}" />
                   <div style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.65); color: white; border-radius: 6px; padding: 2px 7px; font-size: 0.68rem; font-weight: 700; display: flex; align-items: center; gap: 4px; backdrop-filter: blur(4px);">
                     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Ampliar
                   </div>
                 </div>
               ` : ''}
             </div>
           </div>
           
           <!-- Right Column: Status Controls -->
           <div class="task-status-area" style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;" onclick="event.stopPropagation()">
              <div class="status-selector" style="display: flex; gap: 4px;">
                 <button class="status-btn btn-delivered ${state.status === 'delivered' ? 'active' : ''}" onclick="window.updateStudentTaskStatus('${t.id}', 'delivered')">E</button>
                 <button class="status-btn btn-missed ${state.status === 'missed' ? 'active' : ''}" onclick="window.updateStudentTaskStatus('${t.id}', 'missed')">N</button>
                 <button class="status-btn btn-pending ${state.status === 'pending' ? 'active' : ''}" onclick="window.updateStudentTaskStatus('${t.id}', 'pending')">P</button>
              </div>
              <span class="status-badge ${statusClass}" style="margin: 0;">${statusLabel}</span>
           </div>
         </div>
       `;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;
  renderCitaciones();
}

function renderCitaciones() {
  const container = document.getElementById('parent-citaciones-container');
  if (!container) return;

  const guardianStudent = JSON.parse(localStorage.getItem('asistencia_guardian_student') || 'null');
  const targetName = guardianStudent ? guardianStudent.name : "Ariana García";

  // Get Citations and Meetings (Only pending ones)
  const myCitaciones = citaciones.filter(c => (c.studentId === 'all' || c.studentName === targetName) && c.status === 'pending');

  // Get Student Notes (Messages from teacher)
  const targetNoteVal = studentNotes[targetName.trim()];
  let messages = [];
  if (targetNoteVal) {
    if (Array.isArray(targetNoteVal)) {
      messages = [...targetNoteVal];
    } else if (typeof targetNoteVal === 'string' && targetNoteVal.trim() !== "") {
      messages = [{ id: 'msg-legacy', text: targetNoteVal.trim(), date: Date.now() }];
    }
  }

  // Sort messages by date descending (most recent first)
  messages.sort((a, b) => b.date - a.date);

  // The most recent message is rendered in the top panel, so we don't show it here.
  const remainingMessages = messages.slice(1);
  const remainingCitaciones = [...myCitaciones];

  // Get Pending Tasks
  const currentGroupId = 'g1';
  const currentTareas = tareas.filter(t => t.groupId === currentGroupId);
  const pendingTareas = currentTareas.filter(t => {
    const state = studentTaskStates[t.id] || { status: 'pending' };
    return state.status === 'pending';
  });

  if (remainingCitaciones.length === 0 && remainingMessages.length === 0 && pendingTareas.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';

  let html = `
    <div class="v2-separator" style="margin-top: 40px;"></div>
    <div class="header-simple" style="margin-bottom: 24px;">Otras Notificaciones</div>
    <div style="display: flex; flex-direction: column; gap: 16px;">
  `;

  // Merge all items into a single notification feed list
  let feedItems = [];

  // Add older messages
  remainingMessages.forEach(msg => {
    feedItems.push({
      type: 'message',
      date: msg.date,
      id: msg.id,
      data: msg
    });
  });

  // Add pending tasks
  pendingTareas.forEach(t => {
    const tTimestamp = parseInt(t.id.replace('t-', '')) || Date.now();
    feedItems.push({
      type: 'task',
      date: tTimestamp,
      id: t.id,
      data: t
    });
  });

  // Add pending citations and meetings
  remainingCitaciones.forEach(c => {
    const cTimestamp = parseInt(c.id.replace('c-', '').replace('r-', '')) || Date.now();
    feedItems.push({
      type: c.type === 'reunion' ? 'reunion' : 'citacion',
      date: cTimestamp,
      id: c.id,
      data: c
    });
  });

  // Sort feed items by date descending (most recent first)
  feedItems.sort((a, b) => b.date - a.date);

  // Render sorted feed items
  feedItems.forEach(item => {
    if (item.type === 'message') {
      const msg = item.data;
      const prefix = (window.teacherRole === 'profesor' ? 'Prof. ' : 'Maestro ');
      const tName = window.teacherName || "Guillermo";
      const docLabel = (window.teacherRole === 'profesor' ? 'Docente' : 'Maestro');

      html += `
        <div class="citacion-card-new" style="display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.01); transition: all 0.2s ease;">
          <!-- Top Row -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;">
            <!-- Left Column (Avatar + Separator + Text) -->
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
              <!-- Avatar -->
              <div style="width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #eaeaea; border: 1px solid var(--border);">
                ${getTeacherAvatarHTML(window.teacherPhoto)}
              </div>
              
              <!-- Separator Line -->
              <div style="width: 1.5px; height: 36px; background: rgba(0, 0, 0, 0.08); flex-shrink: 0;"></div>
              
              <!-- Middle Text -->
              <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  Nuevo mensaje de la <span style="color: var(--accent-blue); font-weight: 700;">${docLabel}</span> ${tName}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                  ${msg.text}
                </div>
              </div>
            </div>
            
            <!-- Right Buttons Column -->
            <div id="parent-list-buttons-${msg.id}" style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;">
              <button class="btn-premium-ghost" style="padding: 6px 14px; font-size: 0.85rem; font-weight: 700; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer;" onclick="document.getElementById('parent-list-reply-area-${msg.id}').style.display='flex'; document.getElementById('parent-list-buttons-${msg.id}').style.display='none'">Responder</button>
              <button class="btn-premium-ghost" style="padding: 6px 14px; font-size: 0.85rem; font-weight: 700; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer;" onclick="window.markParentListNoteReadOrReply('${msg.id}', '${targetName.replace(/'/g, "\\'")}', false)">OK</button>
            </div>
          </div>
          
          <!-- Expandable Reply Area -->
          <div id="parent-list-reply-area-${msg.id}" style="display: none; flex-direction: column; gap: 8px; margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px;">
            <textarea id="parent-list-reply-text-${msg.id}" class="input-field" placeholder="Escribe tu respuesta..." style="min-height: 80px; resize: none; margin: 0; font-size: 0.85rem; padding: 10px; border-radius: 10px; width: 100%; box-sizing: border-box;"></textarea>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button class="btn-premium-ghost" style="padding: 6px 12px; font-size: 0.8rem;" onclick="document.getElementById('parent-list-reply-area-${msg.id}').style.display='none'; document.getElementById('parent-list-buttons-${msg.id}').style.display='flex'">Cancelar</button>
              <button class="btn-premium-primary" style="padding: 6px 12px; font-size: 0.8rem; background: var(--accent-blue); border: none; color: white;" onclick="window.markParentListNoteReadOrReply('${msg.id}', '${targetName.replace(/'/g, "\\'")}', true)">Enviar Respuesta</button>
            </div>
          </div>
        </div>
      `;
    } else if (item.type === 'task') {
      const t = item.data;
      const d = new Date(t.dueDate);
      const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

      html += `
        <div class="citacion-card-new" onclick="window.showTaskDetails('${t.id}')" style="display: flex; align-items: center; justify-content: space-between; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px; margin-bottom: 12px; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.01); transition: all 0.2s ease; cursor: pointer;">
          <!-- Left Column (Clipboard Icon + Separator + Text) -->
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <!-- Clipboard Icon -->
            <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(2, 132, 199, 0.08); flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <path d="M9 12l2 2 4-4"></path>
                <path d="M9 16h6"></path>
              </svg>
            </div>
            
            <!-- Separator Line -->
            <div style="width: 1.5px; height: 36px; background: rgba(0, 0, 0, 0.08); flex-shrink: 0;"></div>
            
            <!-- Middle Text -->
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="background: rgba(2, 132, 199, 0.1); color: #0284c7; font-size: 0.72rem; font-weight: 800; padding: 2px 7px; border-radius: 5px; text-transform: uppercase;">
                  ${t.subject || 'Tarea'}
                </span>
                ${t.groupName || t.groupId ? `
                  <span style="background: rgba(14, 165, 233, 0.12); color: #0284c7; font-size: 0.72rem; font-weight: 800; padding: 2px 7px; border-radius: 5px; text-transform: uppercase;">
                    ${t.groupName || (groups.find(g => g.id === t.groupId)?.name) || ''}
                  </span>
                ` : ''}
                <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">¡Nueva Tarea!</span>
              </div>
              <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-main); line-height: 1.3;">
                ${t.title}
              </div>
              <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-top: 1px;">
                Fecha de entrega: ${dateStr}
              </div>
              ${t.photo ? `
                <div style="margin-top: 8px; width: 100%; max-width: 280px; max-height: 130px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); cursor: pointer; position: relative;" onclick="event.stopPropagation(); window.openTaskImageModal('${t.id}')">
                  <img src="${t.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="${t.title}" />
                  <div style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.65); color: white; border-radius: 6px; padding: 2px 7px; font-size: 0.68rem; font-weight: 700; display: flex; align-items: center; gap: 4px; backdrop-filter: blur(4px);">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Ampliar
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
          
          <!-- Right Buttons Column -->
          <div style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;" onclick="event.stopPropagation()">
            <button class="btn-premium-ghost" style="padding: 6px 16px; font-size: 0.85rem; font-weight: 700; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer;" onclick="window.updateStudentTaskStatus('${t.id}', 'delivered')">OK</button>
          </div>
        </div>
      `;
    } else if (item.type === 'reunion') {
      const c = item.data;
      const tName = window.teacherName || "Ramos";
      const cleanReason = c.reason.replace(/^Reunión:\s*/, "");

      html += `
        <div class="citacion-card-new" style="display: flex; align-items: center; justify-content: space-between; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px; margin-bottom: 12px; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.01); transition: all 0.2s ease;">
          <!-- Left Column (Avatar + Separator + Text) -->
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <!-- Avatar -->
            <div style="width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #eaeaea; border: 1px solid var(--border);">
              ${getTeacherAvatarHTML(window.teacherPhoto)}
            </div>
            
            <!-- Separator Line -->
            <div style="width: 1.5px; height: 36px; background: rgba(0, 0, 0, 0.08); flex-shrink: 0;"></div>
            
            <!-- Middle Text -->
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                El ${window.teacherRole === 'profesor' ? 'Profesor' : 'Maestro'} ${tName}; <span style="color: #22c55e; font-weight: 700;">Reunión</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${cleanReason}
              </div>
            </div>
          </div>
          
          <!-- Right Buttons Column -->
          <div style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;">
            <button class="btn-premium-ghost" style="padding: 6px 16px; font-size: 0.85rem; font-weight: 700; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer;" onclick="window.markCitacionAsRead('${c.id}', '${c.studentName}')">OK</button>
          </div>
        </div>
      `;
    } else if (item.type === 'citacion') {
      const c = item.data;
      const dateTimeStr = [c.date, c.time].filter(Boolean).join(' ');

      html += `
        <div class="citacion-card-new" style="display: flex; align-items: center; justify-content: space-between; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px; margin-bottom: 12px; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.01); transition: all 0.2s ease;">
          <!-- Left Column (Icon + Separator + Text) -->
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <!-- Citation Red Circle Exclamation Icon -->
            <div style="width: 48px; height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="24" fill="#ef4444" />
                <path d="M24 13V28" stroke="white" stroke-width="4.5" stroke-linecap="round" />
                <circle cx="24" cy="35" r="2.5" fill="white" />
              </svg>
            </div>
            
            <!-- Separator Line -->
            <div style="width: 1.5px; height: 36px; background: rgba(0, 0, 0, 0.08); flex-shrink: 0;"></div>
            
            <!-- Middle Text -->
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                Nueva <span style="color: #ef4444; font-weight: 700;">Citación</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                <span style="font-weight: 700; color: var(--text-main);">${dateTimeStr}</span> ${c.reason}
              </div>
            </div>
          </div>
          
          <!-- Right Buttons Column -->
          <div style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;">
            <button class="btn-premium-ghost" style="padding: 6px 16px; font-size: 0.85rem; font-weight: 700; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer;" onclick="window.markCitacionAsRead('${c.id}', '${c.studentName}')">OK</button>
          </div>
        </div>
      `;
    }
  });

  html += '</div>';
  container.innerHTML = html;
}

window.markCitacionAsRead = function (id, studentName) {
  const cit = citaciones.find(c => c.id === id);
  if (cit) {
    cit.status = 'completed';
    localStorage.setItem('asistencia_citaciones', JSON.stringify(citaciones));

    // Notify the teacher (fallback if studentName is not provided in top panel button click)
    const sName = studentName || cit.studentName || 'Estudiante';
    teacherMessages.push({
      studentName: sName,
      text: `El acudiente de ${sName} ha marcado la citación/reunión ("${cit.reason}") como leída.`,
      date: Date.now()
    });
    saveToLocal();

    showNotif("Marcado como leído", "El docente ha sido notificado.");

    // Re-render dashboard
    const guardianStudent = JSON.parse(localStorage.getItem('asistencia_guardian_student') || 'null');
    if (guardianStudent) {
      renderGuardianScorecards(guardianStudent);
    }
    renderCitaciones();
  }
};

window.updateStudentTaskStatus = function (taskId, newStatus) {
  studentTaskStates[taskId] = { status: newStatus };
  localStorage.setItem('asistencia_student_task_states', JSON.stringify(studentTaskStates));

  // Re-render dashboard
  const guardianStudent = JSON.parse(localStorage.getItem('asistencia_guardian_student') || 'null');
  if (guardianStudent) {
    renderGuardianScorecards(guardianStudent);
  }
  showNotif("Estado Actualizado", "La tarea ha sido guardada.");
  renderCitaciones();
};

window.markParentListNoteReadOrReply = function (msgId, studentName, isReply) {
  const currentStudent = JSON.parse(localStorage.getItem('asistencia_guardian_student'));
  if (!currentStudent) return;

  const replyTextEl = document.getElementById(`parent-list-reply-text-${msgId}`);
  const replyText = replyTextEl ? replyTextEl.value.trim() : "";

  if (isReply && !replyText) return;

  // Add to teacher messages
  teacherMessages.push({
    studentName: studentName,
    text: isReply ? replyText : `El acudiente de ${studentName} ha leído tu mensaje.`,
    date: Date.now()
  });

  // Clear the specific message
  const noteVal = studentNotes[studentName];
  if (Array.isArray(noteVal)) {
    studentNotes[studentName] = noteVal.filter(m => m.id !== msgId);
    if (studentNotes[studentName].length === 0) {
      delete studentNotes[studentName];
    }
  } else {
    delete studentNotes[studentName];
  }
  saveToLocal();

  // Notify
  showNotif(isReply ? "Mensaje Enviado" : "Marcado como leído", isReply ? "mensaje enviado correctamente" : "El docente ha sido notificado.");

  // Re-render dashboard
  renderGuardianScorecards(currentStudent);
  renderCitaciones();
};

window.markParentListNoteRead = function (studentName) {
  const noteVal = studentNotes[studentName];
  let msgId = 'msg-legacy';
  if (Array.isArray(noteVal) && noteVal.length > 0) {
    msgId = noteVal[0].id;
  }
  window.markParentListNoteReadOrReply(msgId, studentName, false);
};

window.sendParentListReply = function (studentName) {
  const noteVal = studentNotes[studentName];
  let msgId = 'msg-legacy';
  if (Array.isArray(noteVal) && noteVal.length > 0) {
    msgId = noteVal[0].id;
  }
  const replyInput = document.getElementById('parent-list-reply-text');
  const tempInputVal = replyInput ? replyInput.value.trim() : "";

  const targetReplyInput = document.getElementById(`parent-list-reply-text-${msgId}`);
  if (targetReplyInput && tempInputVal) {
    targetReplyInput.value = tempInputVal;
  }

  window.markParentListNoteReadOrReply(msgId, studentName, true);
};

function getSubjectColor(subject) {
  const map = {
    'Matemáticas': '#3b82f6',
    'Física': '#a855f7',
    'Biología': '#14b8a6',
    'Historia': '#f59e0b',
    'Español': '#ec4899',
    'Inglés': '#10b981'
  };
  return map[subject] || '#64748b';
}

function renderTimeline() {
  renderStudentMatrix();
}



function renderSchedule() {
  console.log(">> renderSchedule CALLED");
  if (typeof scheduleCapacitorLocalNotifications === 'function') {
    scheduleCapacitorLocalNotifications();
  }
  const container = document.getElementById('schedule-grid');
  const lang = securityConfig.language || 'es';
  if (!container) {
    console.log(">> renderSchedule ABORTED: schedule-grid NOT FOUND");
    return;
  }
  console.log(">> renderSchedule: Container Found");

  updateShiftUI();

  const rowHeight = window.innerWidth <= 768 ? 50 : 100;

  let html = `
    <div class="schedule-time-column">
      <div class="time-slot-header">Hora</div>
      ${currentHours.map((h, idx) => `
        <div class="time-slot" style="position:relative; height: ${rowHeight}px;">
          <div class="time-slot-remove" onclick="window.removeHourRow('${h}')" title="Quitar fila">×</div>
          <span onclick="window.editHour('${h}')" style="cursor:pointer; text-decoration: underline dotted; text-underline-offset: 4px;" title="Click para editar hora">${formatHour(h)}</span>
          ${idx < currentHours.length - 1 ? `<div class="row-add-inter" onclick="window.addHourAtPos(${idx})" title="Insertar fila entre medio">+</div>` : ''}
        </div>
      `).join('')}
      <div class="time-slot-add" onclick="window.addHourRow()" style="cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--accent-teal); font-weight:bold; height:${rowHeight}px; border-bottom: 1px dashed var(--border); transition: 0.2s;" onmouseover="this.style.background='var(--hover-light)'" onmouseout="this.style.background='transparent'">+</div>
    </div>
  `;

  currentDays.forEach(dayName => {
    let dayId = getDayId(dayName);
    html += `
      <div class="schedule-day-column" data-day="${dayId}">
        <div class="day-header">
          <div class="day-header-remove" onclick="window.removeDayColumn('${dayName}')" title="Quitar columna">×</div>
          ${dayName.toUpperCase()}
        </div>
        <div class="day-content" style="position:relative; flex:1; display:flex; flex-direction:column;">
    `;
    currentHours.forEach((hour) => {
      html += `
        <div class="empty-slot" data-day="${dayId}" data-time="${hour}" style="height: ${rowHeight}px; border-bottom: 1px solid var(--border); box-sizing: border-box; width: 100%; cursor: pointer; transition: background 0.2s; position:relative;" onmouseover="this.style.background='var(--hover-light)'" onmouseout="this.style.background='transparent'" title="Pulse para agregar clase">
          <div class="empty-slot-remove" onclick="event.stopPropagation(); window.clearSlot('${dayId}', '${hour}')" title="Limpiar casilla">−</div>
        </div>`;
    });
    html += `<div style="height:${rowHeight}px; border-bottom: 1px dashed var(--border); box-sizing: border-box; width:100%;"></div>`;
    html += `</div></div>`;
  });

  html += `
    <div class="schedule-add-column" style="width: 50px; display:flex; flex-direction:column; border-left: 1px solid var(--border); background: var(--hover-light);">
      <div class="day-header" style="cursor:pointer; color:var(--accent-teal); font-size: 1.5rem; display:flex; align-items:center; justify-content:center; border:none; height: 100%; transition: 0.2s;" onclick="window.addDayColumn()" title="Agregar Día">+</div>
    </div>
  `;

  console.log(">> BEFORE innerHTML assignment. html length =", html.length);
  container.innerHTML = html;
  console.log(">> AFTER innerHTML assignment. inline grid length =", html.length);
  if (window.innerWidth <= 768) {
    container.style.gridTemplateColumns = `35px repeat(${currentDays.length}, 1fr)`;
  } else {
    container.style.gridTemplateColumns = `80px repeat(${currentDays.length}, 1fr) 50px`;
  }

  container.querySelectorAll('.empty-slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
      // Guard: do not open modal if click originated from a schedule-item overlay or its remove button
      if (e.target.closest('.schedule-item') || e.target.closest('.empty-slot-remove')) return;
      const day = slot.dataset.day;
      const time = slot.dataset.time;
      openAddScheduleModal(day, time);
    });
  });

  currentDays.forEach(dayName => {
    let dayId = getDayId(dayName);
    const dayCol = container.querySelector(`.schedule-day-column[data-day="${dayId}"] .day-content`);
    if (!dayCol) return;

    const dayItems = schedule.filter(item => item.day === dayId);
    dayItems.forEach((item) => {
      const globalIdx = schedule.findIndex(si => si === item);
      const hourVal = normalizeTimeString(item.startTime);
      const hourIndex = currentHours.indexOf(hourVal);

      if (hourIndex === -1) return;

      const top = hourIndex * rowHeight + 2;

      const el = document.createElement('div');
      el.className = 'schedule-item';
      el.style.top = `${top}px`;
      el.style.height = `${rowHeight - 4}px`;
      el.style.background = item.color || '#3b82f6';
      el.dataset.sidx = globalIdx;
      el.innerHTML = `
          <span class="s-subject">${item.subject}</span>
          <span class="s-group">${item.groupName}</span>
          <div class="s-time">${formatHour(item.startTime)}</div>
       `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirm('Eliminar Clase', '¿Deseas eliminar esta clase del horario?', () => {
          schedule.splice(globalIdx, 1);
          saveSchedule();
          renderSchedule();
          showNotif('Horario', 'La clase ha sido eliminada.');
        });
      });

      dayCol.appendChild(el);
    });
  });
}

function openAddScheduleModal(day, time) {
  populateScheduleGroups();
  const daySelect = document.getElementById('schedule-day-select');
  if (day) daySelect.value = day;

  const timeSelect = document.getElementById('schedule-time-select');
  if (time) {
    const exists = Array.from(timeSelect.options).some(o => o.value.toString() === time.toString());
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = time;
      opt.textContent = formatHour(time);
      timeSelect.appendChild(opt);
      const optionsArr = Array.from(timeSelect.options).sort((a, b) => timeStringToMinutes(a.value) - timeStringToMinutes(b.value));
      timeSelect.innerHTML = '';
      optionsArr.forEach(o => timeSelect.appendChild(o));
    }
    timeSelect.value = time;
  }
  // Reset color selection to blue by default
  selectedScheduleColor = '#3b82f6';
  document.querySelectorAll('.color-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.color === selectedScheduleColor);
  });
  document.getElementById('modal-add-schedule').classList.add('active');
  document.getElementById('schedule-subject').focus();
}

function populateScheduleGroups() {
  const optionsEl = document.getElementById('group-options');
  const inputEl = document.getElementById('schedule-group-select');
  const textEl = document.getElementById('group-text');

  if (!optionsEl || !inputEl || !textEl) return;

  if (groups.length === 0) {
    optionsEl.innerHTML = `<div class="select-option" style="justify-content: center; color: var(--muted)">Sin grupos</div>`;
    inputEl.value = '';
    textEl.textContent = 'Sin grupos';
    return;
  }

  optionsEl.innerHTML = groups.map(g => `
    <div class="select-option" data-value="${g.name}" style="padding: 12px 16px; justify-content: flex-start;">
      <span class="trigger-icon" style="display:none;"></span> ${g.name}
    </div>
  `).join('');

  optionsEl.querySelectorAll('.select-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const val = opt.dataset.value;
      if (!val) return;
      inputEl.value = val;
      textEl.textContent = val;
      document.getElementById('group-select-wrapper')?.classList.remove('active');
    });
  });

  // Default selection
  if (groups.length > 0 && !inputEl.value) {
    inputEl.value = groups[0].name;
    textEl.textContent = groups[0].name;
  }
}

let confirmCallback = null;
function showConfirm(title, msg, onConfirm) {
  const overlay = document.getElementById('confirm-modal-overlay');
  const titleEl = document.getElementById('confirm-title');
  const msgEl = document.getElementById('confirm-msg');

  if (!overlay || !titleEl || !msgEl) return;

  titleEl.textContent = title;
  msgEl.textContent = msg;
  confirmCallback = onConfirm;
  overlay.classList.add('active');
}
window.showConfirm = showConfirm;

window.toggleLockMenu = function (e) {
  if (e) {
    if (e.type === 'touchstart') e.preventDefault();
    e.stopPropagation();
  }

  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  const isMobile = window.innerWidth <= 1024;
  const isMobilePortrait = isMobile && isPortrait;

  const menuId = isMobilePortrait ? 'lock-menu-mobile' : 'lock-menu-dropdown';
  const menu = document.getElementById(menuId);

  if (!menu) return;

  const isVisible = (menu.style.display === 'block' || getComputedStyle(menu).display === 'block');

  // Cerramos todos primero
  const desktopMenu = document.getElementById('lock-menu-dropdown');
  const mobileMenu = document.getElementById('lock-menu-mobile');
  if (desktopMenu) desktopMenu.style.setProperty('display', 'none', 'important');
  if (mobileMenu) mobileMenu.style.setProperty('display', 'none', 'important');

  if (!isVisible) {
    menu.style.setProperty('display', 'block', 'important');
    if (window.updateLockMenuUI) window.updateLockMenuUI();

    const closeHandler = (ev) => {
      const isClickInsideMenu = ev.target.closest('.lock-menu-dropdown') ||
        ev.target.closest('.lock-menu-mobile-v2');
      const isClickOnTrigger = ev.target.closest('.desktop-lock-btn') ||
        ev.target.closest('.fab-lock');

      if (!isClickInsideMenu && !isClickOnTrigger) {
        menu.style.setProperty('display', 'none', 'important');
        document.removeEventListener('click', closeHandler);
        document.removeEventListener('touchstart', closeHandler);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeHandler);
      document.addEventListener('touchstart', closeHandler, { passive: false });
    }, 100);
  }
};


window.hideLockMenuMobile = function () {
  const m1 = document.getElementById('lock-menu-dropdown');
  const m2 = document.getElementById('lock-menu-mobile');
  if (m1) m1.style.setProperty('display', 'none', 'important');
  if (m2) m2.style.setProperty('display', 'none', 'important');
};

function goTo(id) {
  if (typeof window.hideLockMenuMobile === 'function') window.hideLockMenuMobile();
  document.body.setAttribute('data-active-screen', id);
  if (historyStack[historyStack.length - 1] !== id) {
    historyStack.push(id);
  }

  const app = document.querySelector('.app-layout');
  const globalHeader = document.querySelector('.global-header');
  const mobileNav = document.querySelector('.mobile-nav');
  const fab = document.getElementById('fab-add');
  const fabContainer = document.querySelector('.fab-container-mobile');
  const menuIcon = document.getElementById('header-menu-icon');
  const gearIcon = document.getElementById('header-gear-icon');
  const mobileLockBtn = document.getElementById('mobile-lock-fab');
  const sidebar = document.querySelector('.sidebar');

  // Handle Visibility and Sidebar
  if (['screen-docente', 'screen-settings', 'screen-grupos', 'screen-alumnos', 'screen-tareas', 'screen-mensajes'].includes(id)) {
    if (app) {
      app.classList.add('with-sidebar');
      void app.offsetWidth;
    }
    if (sidebar) sidebar.style.display = 'flex';
    if (globalHeader) {
      globalHeader.style.display = 'flex';
      if (menuIcon) menuIcon.style.display = 'flex';
      if (gearIcon) gearIcon.style.display = 'none';

      if (['screen-grupos', 'screen-docente', 'screen-alumnos'].includes(id)) {
        initGreeting();
      }
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0b0f1a' : '#ffffff');

    const editBtn = document.getElementById('edit-schedule-btn-attendance');
    if (editBtn) {
      editBtn.style.display = (id === 'screen-docente') ? 'flex' : 'none';
    }

    // Floating Action Buttons Logic (FORCED VISIBILITY CONTROL)
    const showAddFab = ['screen-grupos', 'screen-alumnos', 'screen-docente'].includes(id);
    const showLockFab = (id === 'screen-docente');
    const showAutoFab = (id === 'screen-docente');
    const mobileAutoBtn = document.getElementById('mobile-auto-fab');

    if (fab) {
      if (showAddFab) {
        fab.classList.remove('hidden');
        fab.style.setProperty('display', 'flex', 'important');
      } else {
        fab.classList.add('hidden');
        fab.style.setProperty('display', 'none', 'important');
      }
    }

    if (mobileLockBtn) {
      if (showLockFab) {
        mobileLockBtn.classList.remove('hidden');
        mobileLockBtn.style.setProperty('display', 'flex', 'important');
      } else {
        mobileLockBtn.classList.add('hidden');
        mobileLockBtn.style.setProperty('display', 'none', 'important');
      }
    }

    if (mobileAutoBtn) {
      if (showAutoFab) {
        mobileAutoBtn.classList.remove('hidden');
        mobileAutoBtn.style.setProperty('display', 'flex', 'important');
        mobileAutoBtn.classList.remove('animate-slide-up');
        void mobileAutoBtn.offsetWidth;
        mobileAutoBtn.classList.add('animate-slide-up');
      } else {
        mobileAutoBtn.classList.add('hidden');
        mobileAutoBtn.style.setProperty('display', 'none', 'important');
        mobileAutoBtn.classList.remove('animate-slide-up');
      }
    }

    if (fabContainer) {
      if (showAddFab || showLockFab || showAutoFab) {
        fabContainer.classList.add('screen-visible');
        fabContainer.style.setProperty('display', 'flex', 'important');
      } else {
        fabContainer.classList.remove('screen-visible');
        fabContainer.style.setProperty('display', 'none', 'important');
      }
    }

    if (mobileNav) {
      if (id === 'screen-role') {
        mobileNav.classList.add('hidden');
      } else {
        mobileNav.classList.remove('hidden');
      }

      const navItemMap = {
        'screen-docente': 'm-nav-asistencia',
        'screen-grupos': 'm-nav-grupos',
        'screen-alumnos': 'm-nav-alumnos',
        'screen-tareas': 'm-nav-tareas',
        'screen-mensajes': 'm-nav-mensajes'
      };
      const activeNavId = navItemMap[id];
      if (activeNavId) {
        document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.toggle('active', i.id === activeNavId));
      }
    }

    const desktopNavItemMap = {
      'screen-docente': 'nav-asistencia',
      'screen-grupos': 'nav-grupos',
      'screen-alumnos': 'nav-alumnos',
      'screen-tareas': 'nav-tareas',
      'screen-mensajes': 'nav-mensajes',
      'screen-settings': 'nav-ajustes'
    };
    const activeDesktopNavId = desktopNavItemMap[id];
    if (activeDesktopNavId) {
      document.querySelectorAll('.nav-link').forEach(i => i.classList.toggle('active', i.id === activeDesktopNavId));
    }
  } else {
    // Reset layout for non-dashboard screens (like role selection)
    if (app) {
      app.classList.remove('with-sidebar');
      void app.offsetWidth;
    }
    if (sidebar) sidebar.style.display = 'none';
    if (globalHeader) {
      globalHeader.style.display = (id === 'screen-role' || id === 'screen-acudiente') ? 'none' : 'flex';
      if (id === 'screen-role') {
        if (gearIcon) gearIcon.style.display = 'flex';
        if (menuIcon) menuIcon.style.display = 'none';
      }
    }

    if (mobileNav) {
      mobileNav.classList.add('hidden');
      mobileNav.style.display = 'none';
    }
    if (fab) {
      fab.classList.add('hidden');
      fab.style.display = 'none';
    }
    if (fabContainer) {
      fabContainer.classList.remove('screen-visible');
    }
    if (mobileLockBtn) {
      mobileLockBtn.classList.add('hidden');
    }

    const editBtn = document.getElementById('edit-schedule-btn-attendance');
    if (editBtn) editBtn.style.display = 'none';

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff');
  }

  // Handle Screen Transitions
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });

  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    if (id !== 'screen-role') {
      document.getElementById('screen-role')?.classList.remove('active');
    }
    target.style.display = 'flex';
  }

  // Refresh messages/citations
  if (id === 'screen-docente' || id === 'screen-mensajes') {
    teacherMessages = JSON.parse(localStorage.getItem('asistencia_teacher_messages')) || [];
    citaciones = JSON.parse(localStorage.getItem('asistencia_citaciones')) || [];
    if (typeof window.renderTeacherMessages === 'function') window.renderTeacherMessages();
    if (typeof window.renderCitaciones === 'function') window.renderCitaciones();
  }

  if (id === 'screen-settings') {
    syncSettingsUI();
  }

  if (id === 'screen-role') {
    const wrapper = document.getElementById('greeting-wrapper');
    const divider = document.getElementById('header-divider');
    if (wrapper) wrapper.style.display = 'none';
    if (divider) divider.style.display = 'none';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f8fafc');
    greetingShown = false;
  }
}


function goBack() {
  if (historyStack.length > 1) {
    historyStack.pop();
    const prevId = historyStack[historyStack.length - 1];
    goTo(prevId);
  } else {
    goTo('screen-role');
  }
}
window.goBack = goBack;

// ── THEME ──
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  const newTheme = isLight ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    sun.style.display = newTheme === 'light' ? 'block' : 'none';
    moon.style.display = newTheme === 'light' ? 'none' : 'block';
  }
  localStorage.setItem('asistencia_theme', newTheme);

  // Re-render chart if parent dashboard is active
  if (document.getElementById('screen-acudiente')?.classList.contains('active')) {
    if (typeof renderStudentMatrix === 'function') renderStudentMatrix();
  }
}

// ── CALENDAR ──
const today = new Date();
let currentMonth = today.getMonth();
let currentYear = today.getFullYear();

function getTodayWeekIndex(d = new Date()) {
  const m = d.getMonth();
  const y = d.getFullYear();
  const firstDay = new Date(y, m, 1).getDay();
  const offsetToMonday = (firstDay === 0 ? 6 : firstDay - 1);
  const dateOfFirstMonday = 1 - offsetToMonday;
  return Math.max(0, Math.floor((d.getDate() - dateOfFirstMonday) / 7));
}

let currentWeek = getTodayWeekIndex(today);
let selectedDay = today.getDate();
let selectedMonth = currentMonth;
let selectedYear = currentYear;

function renderCalendar() {
  const monthYearLabel = document.getElementById('calendar-month-year');
  const mMonthYearLabel = document.getElementById('m-calendar-month-year');
  const isLandscapeMobile = window.matchMedia("(max-width: 1100px) and (orientation: landscape)").matches;
  const lang = securityConfig.language || 'es';

  const monthName = translations[lang].months[currentMonth];
  const yearNum = currentYear;
  const dayNum = new Date().getDate();

  if (monthYearLabel) {
    if (isLandscapeMobile) {
      // In landscape sidebar, show Day Number centered only
      monthYearLabel.innerHTML = `<span class="cal-mini-day">${dayNum}</span>`;
    } else {
      monthYearLabel.textContent = `${monthName} ${yearNum}`;
    }
  }
  if (mMonthYearLabel) mMonthYearLabel.textContent = `${monthName} ${yearNum}`;

  const grid = document.getElementById('calendar-grid');
  const mGrid = document.getElementById('m-calendar-grid');

  let html = '<span>D</span><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span>';
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  for (let i = 0; i < firstDay; i++) { html += '<span></span>'; }
  for (let d = 1; d <= daysInMonth; d++) {
    const isSelected = (d === selectedDay && currentMonth === selectedMonth && currentYear === selectedYear) ? 'class="active"' : '';
    html += `<span ${isSelected} style="cursor:pointer;" data-day="${d}">${d}</span>`;
  }

  if (grid) grid.innerHTML = html;
  if (mGrid) mGrid.innerHTML = html;

  // Add listeners to both grids
  [grid, mGrid].forEach(currGrid => {
    if (!currGrid) return;
    currGrid.querySelectorAll('span[data-day]').forEach(span => {
      span.addEventListener('click', () => {
        const d = parseInt(span.dataset.day);
        document.querySelectorAll('.calendar-grid span').forEach(s => s.classList.remove('active'));
        // Sync active class across grids
        document.querySelectorAll(`.calendar-grid span[data-day="${d}"]`).forEach(s => s.classList.add('active'));

        selectedDay = d;
        selectedMonth = currentMonth;
        selectedYear = currentYear;

        // Auto-close mobile calendar on select
        window.closeOverlay('calendar-modal-overlay');
      });
    });
  });
}

function changeMonth(dir) {
  if (currentScope === 'trimestre') {
    currentMonth += dir * 3;
  } else if (currentScope === 'semana') {
    currentWeek += dir;
    const maxWeek = 3;
    if (currentWeek > maxWeek) {
      currentWeek = 0;
      currentMonth++;
    } else if (currentWeek < 0) {
      currentMonth--;
      let prevM = currentMonth;
      let prevY = currentYear;
      if (prevM < 0) { prevM += 12; prevY--; }
      currentWeek = 3;
    }
  } else {
    currentMonth += dir;
  }

  while (currentMonth > 11) { currentMonth -= 12; currentYear++; }
  while (currentMonth < 0) { currentMonth += 12; currentYear--; }

  renderCalendar();
  updateMonthLabel();
  renderTable();
}

// ── INIT & EVENT LISTENERS ──

document.addEventListener('DOMContentLoaded', () => {
  // Theme loading
  const savedTheme = localStorage.getItem('asistencia_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    sun.style.display = savedTheme === 'light' ? 'block' : 'none';
    moon.style.display = savedTheme === 'light' ? 'none' : 'block';
  }

  // Sync time format UI to saved preference
  window.setTimeFormat(timeFormat);

  // Sync security configuration
  const lockBasic = document.getElementById('lock-basic');
  const lockPencil = document.getElementById('lock-pencil');
  const lockInk = document.getElementById('lock-ink');
  if (lockBasic) lockBasic.checked = securityConfig.basic;
  if (lockPencil) lockPencil.checked = securityConfig.pencil;
  if (lockInk) lockInk.checked = securityConfig.ink;
  if (window.updateLockMenuUI) window.updateLockMenuUI();

  // Navigation and Buttons
  document.getElementById('nav-grupos')?.addEventListener('click', (e) => {
    setActiveNav(e.currentTarget, 'screen-grupos');
    renderGroups();
  });
  document.getElementById('nav-asistencia')?.addEventListener('click', (e) => setActiveNav(e.currentTarget, 'screen-docente'));

  document.getElementById('nav-alumnos')?.addEventListener('click', (e) => {
    setActiveNav(e.currentTarget, 'screen-alumnos');
    window.renderAlumnosModule();
  });

  document.getElementById('nav-tareas')?.addEventListener('click', (e) => {
    setActiveNav(e.currentTarget, 'screen-tareas');
    renderTareas();
  });
  document.getElementById('nav-mensajes')?.addEventListener('click', (e) => {
    setActiveNav(e.currentTarget, 'screen-mensajes');
    renderTeacherMessages();
  });
  const navSettingsSidebar = document.getElementById('nav-settings-sidebar');
  if (navSettingsSidebar) navSettingsSidebar.addEventListener('click', () => setActiveNav(navSettingsSidebar, 'screen-settings'));

  document.getElementById('open-settings-top')?.addEventListener('click', () => {
    goTo('screen-settings');
  });

  document.getElementById('role-docente')?.addEventListener('click', () => {
    goTo('screen-grupos');
    renderGroups();
    initGreeting();
    // Set active nav manually since sidebar is inside app-layout which is now visible
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    document.getElementById('nav-grupos')?.classList.add('active');
  });
  document.getElementById('role-acudiente')?.addEventListener('click', openCodeModal);

  document.getElementById('gear-config')?.addEventListener('click', () => goTo('screen-settings'));
  document.getElementById('back-to-role')?.addEventListener('click', () => goTo('screen-role'));
  document.getElementById('back-settings')?.addEventListener('click', goBack);

  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);

  // Search
  document.getElementById('student-search')?.addEventListener('input', (e) => renderTable(e.target.value));

  // Calendar Nav
  document.getElementById('cal-prev')?.addEventListener('click', () => changeMonth(-1));
  document.getElementById('cal-next')?.addEventListener('click', () => changeMonth(1));

  // Table Month Nav
  document.getElementById('table-month-prev')?.addEventListener('click', () => changeMonth(-1));
  document.getElementById('table-month-next')?.addEventListener('click', () => changeMonth(1));

  // Mobile Calendar Month Nav
  document.getElementById('m-cal-prev')?.addEventListener('click', () => changeMonth(-1));
  document.getElementById('m-cal-next')?.addEventListener('click', () => changeMonth(1));

  // Modal
  document.getElementById('close-modal')?.addEventListener('click', closeModalDirect);
  document.getElementById('close-m-calendar')?.addEventListener('click', () => {
    document.getElementById('calendar-modal-overlay').style.display = 'none';
  });
  document.getElementById('verify-code')?.addEventListener('click', verifyCode);
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModalDirect();
  });

  // Scope Toggle
  document.getElementById('scope-toggle')?.querySelectorAll('.scope-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.scope-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentScope = tab.dataset.scope;
      updateMonthLabel();
      renderTable();
    });
  });

  // Attendance Menu
  document.querySelectorAll('.choice-option').forEach(opt => {
    opt.addEventListener('click', () => setAttendance(opt.dataset.status));
  });

  // Premium Confirm Modal Listeners
  document.getElementById('confirm-ok')?.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    window.closeOverlay('confirm-modal-overlay');
    confirmCallback = null;
  });
  document.getElementById('confirm-cancel')?.addEventListener('click', () => {
    window.closeOverlay('confirm-modal-overlay');
    confirmCallback = null;
  });

  // Custom Selection Logic (Gender/Role)
  const setupCustomSelect = (wrapperId, triggerId, optionsId, inputId, textId) => {
    const wrapper = document.getElementById(wrapperId);
    const trigger = document.getElementById(triggerId);
    const options = document.getElementById(optionsId);
    const input = document.getElementById(inputId);
    const text = document.getElementById(textId);

    if (!wrapper || !trigger || !options || !input || !text) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close others
      document.querySelectorAll('.custom-select').forEach(s => {
        if (s !== wrapper) s.classList.remove('active');
      });
      wrapper.classList.toggle('active');
    });

    options.querySelectorAll('.select-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const val = opt.dataset.value;
        input.value = val;
        text.textContent = opt.textContent.trim();

        // Update trigger icon
        const iconHtml = opt.querySelector('.trigger-icon')?.innerHTML;
        const triggerIcon = trigger.querySelector('.trigger-icon');
        if (iconHtml && triggerIcon) triggerIcon.innerHTML = iconHtml;

        wrapper.classList.remove('active');

        // Trigger generic profile save sync or specific logic
        if (inputId === 'teacher-gender-input') {
          teacherGender = val;
          localStorage.setItem('asistencia_teacher_gender', val);
        } else if (inputId === 'teacher-role-input') {
          teacherRole = val;
          localStorage.setItem('asistencia_teacher_role', val);
        } else if (inputId === 'teacher-subject-input') {
          window.teacherSubject = val;
          localStorage.setItem('asistencia_teacher_subject', val);
          if (typeof renderStudentMatrix === 'function') renderStudentMatrix();
        }
        syncSettingsUI();
      });
    });
  };

  setupCustomSelect('gender-select-wrapper', 'gender-trigger', 'gender-options', 'teacher-gender-input', 'gender-text');
  setupCustomSelect('role-select-wrapper', 'role-trigger', 'role-options', 'teacher-role-input', 'role-text');
  setupCustomSelect('subject-select-wrapper', 'subject-trigger', 'subject-options', 'teacher-subject-input', 'subject-text');
  setupCustomSelect('group-select-wrapper', 'group-trigger', 'group-options', 'schedule-group-select', 'group-text');

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('active'));
  });

  // Initialize UI
  updateMonthLabel();
  renderTable();
  renderCalendar();
  renderSchedule();
  syncSettingsUI();

  document.getElementById('open-add-group')?.addEventListener('click', () => {
    document.getElementById('modal-add-group').classList.add('active');
    document.getElementById('new-group-name').focus();
  });

  document.getElementById('cancel-add-group')?.addEventListener('click', () => {
    window.closeOverlay('modal-add-group');
  });

  window.saveNewGroup = function (e) {
    if (e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    const input = document.getElementById('new-group-name');
    const name = input.value.trim();
    if (name) {
      const newGroup = {
        id: 'g' + Date.now(),
        name: name,
        description: 'Nuevo salón registrado',
        students: []
      };
      groups.push(newGroup);
      saveToLocal();
      renderGroups();
      input.value = '';
      window.closeOverlay('modal-add-group');
      showNotif('Grupo creado', `El grupo ${name} ha sido registrado.`);
      // Close all other related modals/panels if needed
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  document.getElementById('open-add-student')?.addEventListener('click', () => {
    document.getElementById('modal-add-student').classList.add('active');
    document.getElementById('new-student-name').focus();
  });

  document.getElementById('cancel-add-student')?.addEventListener('click', () => {
    window.closeOverlay('modal-add-student');
  });

  window.saveNewStudent = function (e) {
    if (e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    const input = document.getElementById('new-student-name');
    if (input) {
      addStudent(input.value.trim());
      input.value = '';
    }
    window.closeOverlay('modal-add-student');
    showNotif('Estudiante añadido', 'La lista ha sido actualizada correctamente.');
    // Auto-close if on mobile as well
    if (window.innerWidth <= 768) {
      // Close other potential floating menus
    }
  };

  window.saveTeacherProfile = function (e) {
    if (e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    const nameInput = document.getElementById('teacher-name-input');
    const bioInput = document.getElementById('teacher-bio-input');
    const subjectInput = document.getElementById('teacher-subject-input');
    const phoneInput = document.getElementById('teacher-phone-input');
    const genderInput = document.getElementById('teacher-gender-input');
    const roleInput = document.getElementById('teacher-role-input');

    if (nameInput) {
      teacherName = nameInput.value.trim() || "Docente";
      window.teacherName = teacherName;
      localStorage.setItem('asistencia_teacher_name', teacherName);
    }
    if (bioInput) {
      teacherBio = bioInput.value.trim();
      window.teacherBio = teacherBio;
      localStorage.setItem('asistencia_teacher_bio', teacherBio);
    }
    if (subjectInput) {
      teacherSubject = subjectInput.value.trim();
      window.teacherSubject = teacherSubject;
      localStorage.setItem('asistencia_teacher_subject', teacherSubject);
    }
    if (phoneInput) {
      teacherPhone = phoneInput.value.trim();
      window.teacherPhone = teacherPhone;
      localStorage.setItem('asistencia_teacher_phone', teacherPhone);
    }
    if (genderInput) {
      teacherGender = genderInput.value;
      window.teacherGender = teacherGender;
      localStorage.setItem('asistencia_teacher_gender', teacherGender);
    }
    if (roleInput) {
      teacherRole = roleInput.value;
      window.teacherRole = teacherRole;
      localStorage.setItem('asistencia_teacher_role', teacherRole);
    }

    // Update active greeting if visible
    const teacherNameEl = document.getElementById('teacher-name');
    if (teacherNameEl) teacherNameEl.textContent = teacherName;

    syncSettingsUI();
    showNotif('Perfil guardado', 'Toda tu información ha sido actualizada.');
  };

  document.getElementById('teacher-gender-input')?.addEventListener('change', (e) => {
    teacherGender = e.target.value;
    window.teacherGender = teacherGender;
    localStorage.setItem('asistencia_teacher_gender', teacherGender);
    syncSettingsUI();
  });

  document.getElementById('teacher-role-input')?.addEventListener('change', (e) => {
    teacherRole = e.target.value;
    window.teacherRole = teacherRole;
    localStorage.setItem('asistencia_teacher_role', teacherRole);
    syncSettingsUI();
  });

  // Schedule Listeners
  document.getElementById('open-add-schedule')?.addEventListener('click', () => {
    document.getElementById('modal-add-schedule').classList.add('active');
  });

  document.getElementById('open-horario')?.addEventListener('click', () => {
    goTo('screen-horario');
    renderSchedule();
    const classNameHeader = document.getElementById('current-class-display');
    if (classNameHeader) classNameHeader.textContent = "Horario Semanal";
  });

  document.getElementById('back-from-horario')?.addEventListener('click', () => {
    goBack();
  });

  document.getElementById('open-add-schedule')?.addEventListener('click', () => {
    openAddScheduleModal();
  });

  document.getElementById('schedule-shift-select')?.addEventListener('change', (e) => {
    setShift(e.target.value);
  });

  document.getElementById('edit-schedule-btn-attendance')?.addEventListener('click', () => {
    openManageDaysModal();
  });

  document.getElementById('save-days-config')?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.day-checkbox');
    const newDays = [];
    const fullWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    checkboxes.forEach(cb => {
      if (cb.checked) newDays.push(cb.value);
    });

    if (newDays.length === 0) {
      showNotif('Error', 'Debes seleccionar al menos un día.');
      return;
    }

    currentDays = newDays.sort((a, b) => fullWeek.indexOf(a) - fullWeek.indexOf(b));
    localStorage.setItem('asistencia_schedule_days', JSON.stringify(currentDays));

    renderTable();
    closeOverlay('modal-manage-days');
    showNotif('Configuración', 'Días del registro actualizados.');
  });

  document.getElementById('go-to-full-schedule')?.addEventListener('click', () => {
    window.closeOverlay('modal-manage-days');
    goTo('screen-horario');
    renderSchedule();
    const classNameHeader = document.getElementById('current-class-display');
    if (classNameHeader) classNameHeader.textContent = "Horario Semanal";
  });

  window.openManageDaysModal = openManageDaysModal;
  function openManageDaysModal() {
    const group = document.getElementById('days-checkbox-group');
    const fullWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    group.innerHTML = fullWeek.map(day => {
      const isChecked = currentDays.includes(day);
      return `
        <label class="premium-day-card ${isChecked ? 'checked' : ''}">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" class="day-checkbox" value="${day}" ${isChecked ? 'checked' : ''} onchange="this.closest('.premium-day-card').classList.toggle('checked', this.checked)">
            <span class="day-card-name">${day}</span>
          </div>
        </label>
      `;
    }).join('');

    document.getElementById('modal-manage-days').classList.add('active');
  }

  // Schedule Color Selection
  document.querySelectorAll('.color-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      selectedScheduleColor = opt.dataset.color;
    });
  });

  // Shift Custom Dropdown
  const shiftDrop = document.getElementById('shift-dropdown');
  const shiftSelected = document.getElementById('shift-selected');

  if (shiftSelected) {
    shiftSelected.addEventListener('click', (e) => {
      e.stopPropagation();
      shiftDrop?.classList.toggle('active');
    });
  }

  document.querySelectorAll('.shift-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setShift(opt.dataset.value);
      shiftDrop?.classList.remove('active');
    });
  });

  document.addEventListener('click', () => {
    shiftDrop?.classList.remove('active');
  });

  goTo('screen-role');

  // Task photo upload state
  let newTaskPhotoBase64 = null;

  const photoInput = document.getElementById('new-task-photo-input');
  const photoPreview = document.getElementById('new-task-photo-preview');
  const photoImg = document.getElementById('new-task-photo-img');
  const removePhotoBtn = document.getElementById('remove-task-photo-btn');

  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          newTaskPhotoBase64 = evt.target.result;
          if (photoImg) photoImg.src = newTaskPhotoBase64;
          if (photoPreview) photoPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      newTaskPhotoBase64 = null;
      if (photoInput) photoInput.value = '';
      if (photoPreview) photoPreview.style.display = 'none';
      if (photoImg) photoImg.src = '';
    });
  }

  // Add Task Listeners
  document.getElementById('open-add-task')?.addEventListener('click', () => {
    const groupSelect = document.getElementById('new-task-group');
    if (groupSelect && Array.isArray(groups)) {
      let optsHTML = `<option value="all">Todos los grupos</option>`;
      groups.forEach((g, idx) => {
        const isSelected = (idx === activeGroupIdx) ? 'selected' : '';
        optsHTML += `<option value="${g.id}" ${isSelected}>${g.name}</option>`;
      });
      groupSelect.innerHTML = optsHTML;
    }

    document.getElementById('modal-add-tarea').classList.add('active');
    document.getElementById('new-task-title').focus();
  });

  document.getElementById('save-new-task')?.addEventListener('click', () => {
    const title = document.getElementById('new-task-title').value.trim();
    const subject = document.getElementById('new-task-subject').value.trim();
    const date = document.getElementById('new-task-date').value;
    const points = document.getElementById('new-task-points').value;
    const selectedGroupId = document.getElementById('new-task-group')?.value || groups[activeGroupIdx].id;
    const selectedGroupObj = groups.find(g => g.id === selectedGroupId);
    const lang = securityConfig.language || 'es';

    if (!title || !subject || !date) {
      showNotif("Error", lang === 'es' ? "Por favor completa los campos obligatorios." : "Please complete required fields.");
      return;
    }

    const newTask = {
      id: 't-' + Date.now(),
      title,
      subject,
      dueDate: date,
      points: points || 100,
      groupId: selectedGroupId,
      groupName: selectedGroupObj ? selectedGroupObj.name : 'Todos los grupos',
      photo: newTaskPhotoBase64
    };

    tareas.push(newTask);
    localStorage.setItem('asistencia_tareas', JSON.stringify(tareas));
    renderTareas();
    window.closeOverlay('modal-add-tarea');
    showNotif(lang === 'es' ? "Tarea registrada" : "Task Created", lang === 'es' ? "La actividad ha sido asignada al grupo." : "Activity assigned to group.");

    // Clear fields & photo state
    document.getElementById('new-task-title').value = '';
    document.getElementById('new-task-subject').value = '';
    document.getElementById('new-task-date').value = '';
    document.getElementById('new-task-points').value = '';
    newTaskPhotoBase64 = null;
    if (photoInput) photoInput.value = '';
    if (photoPreview) photoPreview.style.display = 'none';
    if (photoImg) photoImg.src = '';
  });

  document.getElementById('clear-tareas-registry')?.addEventListener('click', () => {
    showConfirm(
      "¿Limpiar Registro?",
      "¿Estás seguro de que deseas borrar permanentemente todas las tareas de todos los grupos?",
      () => {
        tareas = [];
        localStorage.setItem('asistencia_tareas', JSON.stringify(tareas));
        renderTareas();
        showNotif("Registro Limpiado", "Se han eliminado todas las tareas del registro.");
      }
    );
  });

  // SCROLL HIDE/SHOW HEADER FOR MOBILE WEB (SENSITIVITY IMPROVED)
  let lastScrollTop = 0;
  window.addEventListener('scroll', () => {
    // Only apply in landscape or mobile widths
    if (window.innerWidth <= 1100) {
      const header = document.querySelector('.global-header');
      if (!header) return;

      const display = window.getComputedStyle(header).display;
      if (display === 'none') return;

      let st = window.pageYOffset || document.documentElement.scrollTop;

      // Much more sensitive threshold (10px)
      if (st > lastScrollTop && st > 10) {
        // Scrolling down - hide
        header.classList.add('header-hidden');
      } else if (st < lastScrollTop) {
        // Scrolling up - show
        header.classList.remove('header-hidden');
      }
      lastScrollTop = st <= 0 ? 0 : st;
    }
  }, { passive: true });

  // --- INIT ALUMNOS MODULE ---
  const alumnosModuleInstance = new AlumnosModule(
    () => groups,
    window.openStudentProfileV6,
    window.openCitacionForStudent,
    window.openNoteForStudent
  );

  window.renderAlumnosModule = function () {
    alumnosModuleInstance.render('alumnos-module-grid', 'alumnos-module-filters', 'alumnos-module-search-input');
  };

  document.getElementById('alumnos-module-search-input')?.addEventListener('input', () => {
    window.renderAlumnosModule();
  });

  // RE-ATTACH LANDSCAPE LISTENERS ON RESIZE/ORIENTATION CHANGE
  window.addEventListener('resize', () => {
    // Rely exclusively on CSS for display formatting; just trigger re-render
    renderCalendar();
  });
});

// Expose internal functions required by mobile nav
window.setActiveNav = setActiveNav;
window.goTo = goTo;

// Helper to close all open modals
function closeAllModals() {
  ['modal-add-student', 'modal-add-group', 'modal-add-schedule', 'modal-overlay', 'confirm-modal-overlay', 'calendar-modal-overlay', 'attendance-choice-menu', 'modal-manage-days', 'modal-config-calendar', 'modal-time-picker'].forEach(id => {
    const el = document.getElementById(id);
    if (el && (el.classList.contains('active') || el.style.display === 'flex')) {
      window.closeOverlay(id);
    }
  });
}

window.handleMobileNav = function (action, e) {
  if (typeof window.hideLockMenuMobile === 'function') window.hideLockMenuMobile();
  if (e) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  }

  // If the target is the lock fab or auto fab inside it, don't do regular nav
  if (e && (e.target.closest('#mobile-lock-fab') || e.target.closest('#mobile-auto-fab'))) return;


  // Always close any open modal/overlay before navigating
  closeAllModals();

  if (action === 'asistencia') {
    window.setActiveNav(document.getElementById('nav-asistencia'), 'screen-docente');
  } else if (action === 'grupos') {
    window.setActiveNav(document.getElementById('nav-grupos'), 'screen-grupos');
    if (typeof renderGroups === 'function') renderGroups();

  } else if (action === 'alumnos') {
    window.setActiveNav(document.getElementById('m-nav-alumnos'), 'screen-alumnos');
    window.renderAlumnosModule();

  } else if (action === 'tareas') {
    window.setActiveNav(document.getElementById('m-nav-tareas'), 'screen-tareas');
    renderTareas();
  } else if (action === 'mensajes') {
    window.setActiveNav(document.getElementById('m-nav-mensajes'), 'screen-mensajes');
    renderTeacherMessages();
  } else if (action === 'ajustes') {
    window.goTo('screen-settings');

  } else if (action === 'fab') {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;
    if (activeScreen.id === 'screen-grupos') {
      const modal = document.getElementById('modal-add-group');
      if (modal) {
        modal.classList.add('active');
        const input = document.getElementById('new-group-name');
        if (input) input.focus();
      }
    } else if (activeScreen.id === 'screen-alumnos' || activeScreen.id === 'screen-docente') {
      const modal = document.getElementById('modal-add-student');
      if (modal) {
        modal.classList.add('active');
        const input = document.getElementById('new-student-name');
        if (input) input.focus();
      }
    }
  }
};

// Google Account Sync Manager — calls real OAuth, not a mock
window.toggleGoogleAccount = function () {
  // ── Diagnostic logging (visible in DevTools → Console) ──
  console.log('[LOGIN] toggleGoogleAccount fired. isConnected =',
    localStorage.getItem('asistencia_google_connected'));
  console.log('[LOGIN] VITE_GOOGLE_CLIENT_ID in build:',
    (typeof import_meta_env_VITE_GOOGLE_CLIENT_ID !== 'undefined'
      ? import_meta_env_VITE_GOOGLE_CLIENT_ID
      : window.__GOOGLE_CLIENT_ID_DEBUG__ || 'check googleAuthDrive.js log above'));

  const isConnected = localStorage.getItem('asistencia_google_connected') === 'true';
  if (isConnected) {
    disconnectGoogleAccount();
  } else {
    connectGoogleAccount();
  }
};

function updateGoogleUI() {
  const isConnected = localStorage.getItem('asistencia_google_connected') === 'true';
  const email   = localStorage.getItem('asistencia_google_email')   || '';
  const name    = localStorage.getItem('asistencia_google_name')    || localStorage.getItem('asistencia_teacher_name') || 'Profesor';
  const picture = localStorage.getItem('asistencia_google_picture') || localStorage.getItem('asistencia_teacher_photo') || '';
  const lastSync = localStorage.getItem('asistencia_last_cloud_sync');

  // ── Toggle which panel is visible ───────────────────────────────────────
  const disconnectedView = document.getElementById('google-disconnected-view');
  const connectedView    = document.getElementById('google-connected-view');

  if (disconnectedView && connectedView) {
    if (isConnected) {
      disconnectedView.style.display = 'none';
      connectedView.style.display = 'flex';
    } else {
      disconnectedView.style.display = 'flex';
      connectedView.style.display = 'none';
    }
  }

  // ── Re-render the connected panel with real data ─────────────────────────
  if (isConnected && connectedView) {
    // Avatar
    const avatarHTML = picture
      ? `<img src="${picture}" referrerpolicy="no-referrer"
           style="width:44px;height:44px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0;"
           alt="${name}" />`
      : `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#4285F4,#34A853);
           color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.2rem;
           flex-shrink:0;">${(name.charAt(0)||'P').toUpperCase()}</div>`;

    const syncTime = lastSync ? `Último respaldo: hoy a las ${lastSync}` : 'Último respaldo: Pendiente';

    connectedView.innerHTML = `
      <!-- Profile row: avatar + name/email + logout -->
      <div style="display:flex;align-items:center;gap:12px;">
        ${avatarHTML}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:0.95rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
          <div style="font-size:0.8rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${email}</div>
        </div>
        <button onclick="window.toggleGoogleAccount()"
          title="Cerrar sesión de Google"
          style="flex-shrink:0;background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;
                 color:var(--muted);font-size:1.1rem;display:flex;align-items:center;transition:color 0.2s;"
          onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--muted)'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      <!-- Sync action buttons -->
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button id="btn-sync-drive" onclick="window.handleSyncToDrive()"
          style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;
                 padding:9px 14px;border-radius:10px;font-size:0.85rem;font-weight:700;cursor:pointer;
                 background:var(--accent-blue);color:white;border:none;transition:opacity 0.2s;"
          onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <span id="btn-sync-text">Sincronizar ahora</span>
        </button>
        <button id="btn-restore-drive" onclick="window.handleRestoreFromDrive()"
          style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;
                 padding:9px 14px;border-radius:10px;font-size:0.85rem;font-weight:600;cursor:pointer;
                 background:var(--surface);color:var(--text);border:1px solid var(--border);transition:background 0.2s;"
          onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--surface)'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          <span id="btn-restore-text">Restaurar nube</span>
        </button>
      </div>

      <!-- Last sync timestamp -->
      <div id="google-last-sync-time"
        style="font-size:0.75rem;color:var(--muted);margin-top:8px;text-align:center;">
        ${syncTime}
      </div>
    `;
  }

  // ── Legacy selectors (other parts of the app that may reference Google state) ─
  const btns = document.querySelectorAll('.btn-google-connect');
  const subtitles = document.querySelectorAll('.google-sync-subtitle');
  btns.forEach(btn => isConnected ? btn.classList.add('connected') : btn.classList.remove('connected'));
  subtitles.forEach(sub => {
    sub.textContent = isConnected
      ? `Vinculado con ${email}`
      : 'Sincroniza tus datos y notas en Google Drive';
  });
}
window.updateGoogleUI = updateGoogleUI;

// Interactive Schedule Time Picker Helpers
window.setScheduleAmPm = function (ampm) {
  const amBtn = document.getElementById('btn-ampm-am');
  const pmBtn = document.getElementById('btn-ampm-pm');
  const hiddenAmPm = document.getElementById('schedule-ampm-val');
  if (hiddenAmPm) hiddenAmPm.value = ampm;

  if (amBtn && pmBtn) {
    if (ampm === 'AM') {
      amBtn.classList.add('active');
      pmBtn.classList.remove('active');
    } else {
      pmBtn.classList.add('active');
      amBtn.classList.remove('active');
    }
  }
  window.updateScheduleTimeValue();
};

window.updateScheduleTimeValue = function () {
  const hEl = document.getElementById('schedule-time-hour');
  const mEl = document.getElementById('schedule-time-minute-input');
  const ampmEl = document.getElementById('schedule-ampm-val');
  const hiddenSelect = document.getElementById('schedule-time-select');

  if (!hEl || !mEl || !hiddenSelect) return;

  let h = parseInt(hEl.value) || 7;
  let m = parseInt(mEl.value) || 0;

  if (m < 0) m = 0;
  if (m > 59) m = 59;

  const hStr = h < 10 ? `0${h}` : `${h}`;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  const ampm = ampmEl ? ampmEl.value : 'AM';

  hiddenSelect.value = `${hStr}:${mStr} ${ampm}`;
};

function saveNewSchedule() {
  window.updateScheduleTimeValue();
  const subjectEl = document.getElementById('schedule-subject');
  const groupEl = document.getElementById('schedule-group-select');
  const dayEl = document.getElementById('schedule-day-select');
  const timeEl = document.getElementById('schedule-time-select');

  if (!subjectEl || !groupEl || !dayEl || !timeEl) return;

  const subject = subjectEl.value.trim();
  if (!subject) {
    showNotif('Error', 'Por favor, ingresa el nombre de la materia.');
    return;
  }

  const startTimeNorm = normalizeTimeString(timeEl.value);

  const newItem = {
    subject: subject,
    groupName: groupEl.value,
    day: dayEl.value,
    startTime: startTimeNorm,
    color: selectedScheduleColor || '#3b82f6'
  };

  if (!Array.isArray(schedule)) schedule = [];

  // Check for overlap
  const overlap = schedule.find(item => item.day === newItem.day && normalizeTimeString(item.startTime) === newItem.startTime);
  if (overlap) {
    showNotif('Error de horario', 'Ya tienes una clase registrada en ese horario.');
    return;
  }

  schedule.push(newItem);
  saveSchedule();

  // Switch to custom shift if the new hour isn't in current hours to ensure visibility
  if (!currentHours.includes(startTimeNorm)) {
    currentHours.push(startTimeNorm);
    currentHours.sort((a, b) => timeStringToMinutes(a) - timeStringToMinutes(b));
    currentShift = 'custom';
    localStorage.setItem('asistencia_schedule_shift', 'custom');
    localStorage.setItem('asistencia_schedule_hours', JSON.stringify(currentHours));
    updateShiftUI();
  }

  renderSchedule();

  subjectEl.value = '';
  window.closeOverlay('modal-add-schedule');
  showNotif('Clase añadida', `${subject} ha sido agregada a tu horario.`);
}
window.saveNewSchedule = saveNewSchedule;
function setActiveNav(el, screenId) {
  document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(nav => nav.classList.remove('active'));
  if (el) el.classList.add('active');

  if (screenId === 'screen-docente') {
    currentScope = 'semana';
    const now = new Date();
    currentMonth = now.getMonth();
    currentYear = now.getFullYear();
    currentWeek = getTodayWeekIndex(now);

    document.querySelectorAll('#scope-toggle .scope-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.scope === 'semana');
    });
    updateMonthLabel();
    renderTable();
  }

  goTo(screenId);

  // Update header based on screen
  const classNameHeader = document.getElementById('current-class-display');

  if (classNameHeader) {
    if (screenId === 'screen-docente') {
      classNameHeader.textContent = groups[activeGroupIdx].name;
    } else if (screenId === 'screen-grupos') {
      classNameHeader.textContent = "Gestión de Grupos";
    } else if (screenId === 'screen-alumnos') {
      classNameHeader.textContent = "Listado de Alumnos";
    } else if (screenId === 'screen-tareas') {
      classNameHeader.textContent = "Tareas Pendientes";
    } else if (screenId === 'screen-settings') {
      classNameHeader.textContent = "Ajustes de Aplicación";
    } else {
      classNameHeader.textContent = "";
    }
  }
}

function openCalendarModal() {
  renderCalendar();
  document.getElementById('calendar-modal-overlay').style.display = 'flex';
}
window.openCalendarModal = openCalendarModal;

function openCodeModal() {
  const modal = document.getElementById('modal-overlay');
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      const input = document.getElementById('code-input');
      if (input) input.focus();
    }, 200);
  }
}
window.openCodeModal = openCodeModal;

function closeModalDirect() {
  window.closeOverlay('modal-overlay');
  const input = document.getElementById('code-input');
  if (input) input.value = '';
}
window.closeModalDirect = closeModalDirect;

window.openConfigPerfilesModal = function () {
  document.getElementById('config-perfiles-modal-overlay')?.classList.add('active');
  // Load saved guardian profile
  const savedGuardian = JSON.parse(localStorage.getItem('asistencia_guardian_profile') || '{}');
  if (savedGuardian.acudiente1) {
    document.getElementById('acudiente-nombre-input').value = savedGuardian.acudiente1.nombre || '';
    document.getElementById('acudiente-edad-input').value = savedGuardian.acudiente1.edad || '';
    document.getElementById('acudiente-contacto-input').value = savedGuardian.acudiente1.contacto || '';
  }
  if (savedGuardian.acudiente2) {
    document.getElementById('acudiente2-nombre-input').value = savedGuardian.acudiente2.nombre || '';
    document.getElementById('acudiente2-contacto-input').value = savedGuardian.acudiente2.contacto || '';
  }

  // Load saved student profile
  const savedStudent = JSON.parse(localStorage.getItem('asistencia_student_profile') || '{}');
  document.getElementById('estudiante-nombre-input').value = savedStudent.nombre || 'Ariana García';
  document.getElementById('estudiante-codigo-input').value = savedStudent.codigo || 'A-12345';
  document.getElementById('estudiante-edad-input').value = savedStudent.edad || '';
  document.getElementById('estudiante-genero-input').value = savedStudent.genero || 'F';
  if (document.getElementById('estudiante-sangre-input')) {
    document.getElementById('estudiante-sangre-input').value = savedStudent.tipoSangre || savedStudent.sangre || '';
  }
  document.getElementById('estudiante-alergias-input').value = savedStudent.alergias || '';
  document.getElementById('estudiante-enfermedades-input').value = savedStudent.enfermedades || '';
};

window.closeConfigPerfilesModal = function () {
  window.closeOverlay('config-perfiles-modal-overlay');
};

window.saveConfigPerfiles = function () {
  const acudienteProfile = {
    acudiente1: {
      nombre: document.getElementById('acudiente-nombre-input').value.trim(),
      edad: document.getElementById('acudiente-edad-input').value.trim(),
      contacto: document.getElementById('acudiente-contacto-input').value.trim()
    },
    acudiente2: {
      nombre: document.getElementById('acudiente2-nombre-input').value.trim(),
      contacto: document.getElementById('acudiente2-contacto-input').value.trim()
    }
  };

  const studentProfile = {
    nombre: document.getElementById('estudiante-nombre-input').value.trim(),
    codigo: document.getElementById('estudiante-codigo-input').value.trim(),
    edad: document.getElementById('estudiante-edad-input').value.trim(),
    genero: document.getElementById('estudiante-genero-input').value,
    tipoSangre: document.getElementById('estudiante-sangre-input') ? document.getElementById('estudiante-sangre-input').value : '',
    alergias: document.getElementById('estudiante-alergias-input').value.trim(),
    enfermedades: document.getElementById('estudiante-enfermedades-input').value.trim()
  };

  localStorage.setItem('asistencia_guardian_profile', JSON.stringify(acudienteProfile));
  localStorage.setItem('asistencia_student_profile', JSON.stringify(studentProfile));

  // Actualizar el estudiante acudiente activo en localStorage
  let studentObj = null;
  for (let i = 0; i < groups.length; i++) {
    const found = groups[i].students.find(s => s.name.trim() === studentProfile.nombre);
    if (found) {
      studentObj = found;
      found.sangre = studentProfile.tipoSangre;
      found.bloodType = studentProfile.tipoSangre;
      found.tipoSangre = studentProfile.tipoSangre;
      found.alergias = studentProfile.alergias;
      break;
    }
  }
  if (!studentObj) {
    studentObj = {
      name: studentProfile.nombre,
      initials: studentProfile.nombre.split(/\s+/).map(n => n[0]).join('').toUpperCase().substring(0, 2),
      sangre: studentProfile.tipoSangre,
      bloodType: studentProfile.tipoSangre,
      alergias: studentProfile.alergias,
      history: {}
    };
  }
  localStorage.setItem('asistencia_guardian_student', JSON.stringify(studentObj));
  localStorage.setItem('asistencia_groups', JSON.stringify(groups));

  const nameLabel = document.getElementById('acudiente-student-name');
  if (nameLabel) nameLabel.textContent = studentObj.name;

  // Re-renderizar la matriz e información del estudiante
  renderStudentMatrix();

  window.closeConfigPerfilesModal();
  if (typeof showNotif === 'function') {
    showNotif('Perfiles actualizados', 'La información se ha guardado correctamente.');
  }
};

function verifyCode() {
  const input = document.getElementById('code-input');
  if (!input) return;
  const val = input.value.trim();
  if (val.length >= 4) {
    // Intentar encontrar el estudiante vinculado
    const savedStudent = JSON.parse(localStorage.getItem('asistencia_student_profile') || '{}');
    const targetName = savedStudent.nombre ? savedStudent.nombre : "Ariana García";

    let studentObj = null;
    for (let i = 0; i < groups.length; i++) {
      const found = groups[i].students.find(s => s.name.trim() === targetName.trim());
      if (found) { studentObj = found; break; }
    }

    if (!studentObj) {
      // Fallback to first student if named search fails and no specific profile is set
      studentObj = { name: targetName, initials: 'AG', history: {} };
    }
    localStorage.setItem('asistencia_guardian_student', JSON.stringify(studentObj));

    const nameLabel = document.getElementById('acudiente-student-name');
    if (nameLabel) nameLabel.textContent = studentObj.name;

    closeModalDirect();
    renderStudentMatrix();
    goTo('screen-acudiente');
    showNotif('Acceso concedido', `Bienvenido/a. Mostrando datos de ${studentObj.name}.`);
  } else {
    input.style.borderColor = '#f87171';
    setTimeout(() => input.style.borderColor = '', 800);
    showNotif('Codigo invalido', 'Ingresa un código de al menos 4 caracteres.');
  }
}
window.verifyCode = verifyCode;

function openDocenteMode() {
  goTo('screen-grupos');
  renderGroups();
  initGreeting();
  renderCalendar(); // Added: Trigger initial dynamic calendar rendering

  // Setup sidebar toggle button events
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) {
    // Eliminate inline display overrides so CSS media query governs visibility
    sidebarToggle.style.display = '';
    sidebarToggle.onclick = (e) => {
      e.stopPropagation();
      const app = document.querySelector('.app-layout');
      if (app) {
        app.classList.toggle('sidebar-collapsed');
        // Re-render calendar to adjust layout if needed
        renderCalendar();
      }
    };
  }

  // Set active nav manually since sidebar is inside app-layout which is now visible
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  const navGrupos = document.getElementById('nav-grupos');
  if (navGrupos) navGrupos.classList.add('active');
}
window.openDocenteMode = openDocenteMode;

function renderGroups() {
  const grid = document.getElementById('groups-grid');
  if (!grid) return;

  grid.innerHTML = groups.map((g, idx) => {
    const isSelected = activeGroupIdx === idx;
    return `
    <div class="group-card" data-idx="${idx}" style="${isSelected ? 'border-left: 4px solid var(--accent-blue); background: rgba(59, 130, 246, 0.03);' : ''} position: relative; overflow: hidden;">
      <button onclick="event.stopPropagation(); window.deleteGroup(${idx})" style="position: absolute; bottom: 12px; right: 12px; background: rgba(239, 68, 68, 0.1); border: none; color: #ef4444; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 11; transition: all 0.2s;" class="btn-delete-group" title="Eliminar Grupo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
      ${isSelected ? '<div style="position: absolute; bottom: 12px; right: 52px; background: #4ade80; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 4px 8px rgba(74, 222, 128, 0.3);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
      <div class="group-card-header">
        <div class="group-icon" style="background: rgba(59, 130, 246, 0.08); border-radius: 10px; padding: 6px; display: flex; align-items: center; justify-content: center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <div class="group-meta">
          <span class="group-name" style="${isSelected ? 'color: var(--text);' : ''}">${g.name}</span>
          <span class="group-count" style="color: var(--muted);">${g.students.length} ESTUDIANTES</span>
        </div>
      </div>
      <div class="group-stats">
        <div class="g-stat">
          <span class="g-stat-label">Asistencia Prom.</span>
          <span class="g-stat-val">85%</span>
        </div>
        <div class="g-stat">
          <span class="g-stat-label">Último Reg.</span>
          <span class="g-stat-val">Hoy</span>
        </div>
      </div>
    </div>
  `}).join('');

  grid.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', () => {
      activeGroupIdx = parseInt(card.dataset.idx);
      students = groups[activeGroupIdx].students;
      localStorage.setItem('asistencia_active_group_idx', activeGroupIdx);
      saveToLocal();
      if (window.updateHeaderGroupBadge) window.updateHeaderGroupBadge();

      const groupTitleDisplay = document.getElementById('group-title-display');
      if (groupTitleDisplay) {
        groupTitleDisplay.innerHTML = `${groups[activeGroupIdx].name} <span>(Planilla)</span>`;
      }

      // Update sidebar active state
      document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-asistencia')?.classList.add('active');

      const classNameHeader = document.getElementById('current-class-display');
      if (classNameHeader) classNameHeader.textContent = groups[activeGroupIdx].name;

      // Re-render immediately to update checkmark
      renderGroups();

      goTo('screen-docente');
      renderTable();
      showNotif('Grupo seleccionado', `Entrando al salón ${groups[activeGroupIdx].name}`);
    });
  });
}

window.deleteGroup = function (idx) {
  const groupName = groups[idx].name;
  showConfirm("¿Eliminar grupo?", `¿Estás seguro de que deseas eliminar el grupo "${groupName}"? Esta acción borrará permanentemente todos los registros asociados.`, () => {
    groups.splice(idx, 1);

    // Ajustar activeGroupIdx si es necesario
    if (activeGroupIdx === idx) {
      activeGroupIdx = groups.length > 0 ? 0 : -1;
      if (activeGroupIdx !== -1) {
        students = groups[activeGroupIdx].students;
      } else {
        students = [];
      }
    } else if (activeGroupIdx > idx) {
      activeGroupIdx--;
    }

    saveToLocal();
    renderGroups();
    showNotif("Grupo eliminado", `El grupo "${groupName}" ha sido eliminado.`);

    // Si no quedan grupos, volver a la pantalla de grupos o manejar estado vacío
    if (groups.length === 0) {
      const grid = document.getElementById('groups-grid');
      if (grid) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
            <p>No hay grupos creados. Comienza creando uno nuevo.</p>
          </div>
        `;
      }
    }
  });
};

function initGreeting() {
  // Verificación ultra-estricta de orientación para móviles/tablets
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isSmallScreen = window.innerWidth <= 932;

  if (isLandscape && (isTouch || isSmallScreen)) {
    const wrapper = document.getElementById('greeting-wrapper');
    if (wrapper) {
      wrapper.style.setProperty('display', 'none', 'important');
      wrapper.style.setProperty('border-left', 'none', 'important');
    }
    return;
  }

  if (greetingShown) return;
  greetingShown = true;

  const greetingEl = document.getElementById('greeting-text');
  const teacherEl = document.getElementById('teacher-name');
  const wrapper = document.getElementById('greeting-wrapper');
  if (!greetingEl || !wrapper) return;

  // En móvil (≤932px), asegurar cero línea vertical y centrado en pantalla
  if (isSmallScreen) {
    wrapper.style.setProperty('border-left', 'none', 'important');
  } else {
    wrapper.style.removeProperty('border-left');
  }

  // Show elements with high priority
  wrapper.style.display = 'flex';
  wrapper.style.zIndex = "1100";
  wrapper.classList.remove('fade-out');
  wrapper.classList.remove('hidden');
  greetingEl.classList.remove('fade-out');
  greetingEl.style.opacity = "1";

  const now = new Date();
  const hour = now.getHours();
  let timeGreeting = "";

  if (hour >= 5 && hour < 12) timeGreeting = "¡Buenos Días!";
  else if (hour >= 12 && hour < 19) timeGreeting = "Buenas tardes";
  else timeGreeting = "Buenas noches";

  // Phase 1: Show only the time-of-day greeting
  greetingEl.textContent = timeGreeting;
  if (teacherEl) teacherEl.textContent = "";

  // Prepare Phase 2 data
  let title = "";
  if (teacherRole === 'profesor') {
    title = (teacherGender === 'femenino') ? "Profesora" : "Profesor";
  } else {
    title = (teacherGender === 'femenino') ? "Maestra" : "Maestro";
  }

  const rawName = localStorage.getItem('asistencia_teacher_name') || teacherName;
  const firstName = rawName.trim().split(' ')[0];

  // Inicio de la secuencia de transición "Premium"
  setTimeout(() => {
    // 1. Animación de salida para "Buenos Días"
    if (greetingEl) {
      greetingEl.classList.add('fade-out');

      setTimeout(() => {
        // 2. Cambiar el texto mientras es invisible
        greetingEl.textContent = `${title} ${firstName}`;

        // 3. Reiniciar la animación de entrada para el nombre
        greetingEl.classList.remove('fade-out');
        // Forzar reflujo para reiniciar la animación CSS
        void greetingEl.offsetWidth;

        // 4. Mantener visible y luego desvanecer con efecto desenfoque (blur out 800ms)
        setTimeout(() => {
          if (greetingEl) {
            greetingEl.classList.add('fade-out');
            if (wrapper) wrapper.classList.add('fade-out');

            // Esperar los 800ms de la animación de desenfoque
            setTimeout(() => {
              if (wrapper) {
                wrapper.classList.add('hidden');
                wrapper.style.setProperty('display', 'none', 'important');
              }
            }, 800);
          }
        }, 3500);
      }, 800);
    }
  }, 2200);
}

// Header interaction on scroll
let lastScrollTop = 0;
const headerEl = document.querySelector('.global-header');

if (headerEl) {
  // Listen on both window and specialized scroll containers
  const scrollHandler = () => {
    // Check both window and document element (for different browser/platform behaviors)
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;

    // Debugging: only if strictly necessary
    // console.log("ScrollTop:", scrollTop);

    if (scrollTop > lastScrollTop && scrollTop > 40) {
      headerEl.classList.add('header-hidden');
    } else {
      headerEl.classList.remove('header-hidden');
    }
    lastScrollTop = Math.max(0, scrollTop);
  };

  window.addEventListener('scroll', scrollHandler, { passive: true });
  // Also hook into the main container if it exists and handles overflows
  document.querySelector('.app-layout')?.addEventListener('scroll', scrollHandler, { passive: true });
}

// --- SIDEBAR CALENDAR WIDGET ---
let currentSidebarDate = new Date();

function renderSidebarCalendar() {
  const monthYearEl = document.getElementById('calendar-month-year');
  const gridEl = document.getElementById('calendar-grid');
  const lang = securityConfig.language || 'es';
  if (!monthYearEl || !gridEl) return;

  const year = currentSidebarDate.getFullYear();
  const month = currentSidebarDate.getMonth();

  const monthNames = translations[lang].months;
  monthYearEl.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dayHeaders = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
  let html = dayHeaders.map(d => `<span style="color: var(--primary); font-weight:800;">${d}</span>`).join('');

  for (let i = 0; i < firstDay; i++) {
    html += `<span></span>`;
  }

  const today = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    html += `<span class="${isToday ? 'active' : ''}">${d}</span>`;
  }

  gridEl.innerHTML = html;
}

window.changeSidebarMonth = function (offset) {
  currentSidebarDate.setMonth(currentSidebarDate.getMonth() + offset);
  renderSidebarCalendar();
};

document.addEventListener('DOMContentLoaded', () => {
  renderSidebarCalendar();
  // Mobile Calendar Toggle
  const monthNameLabel = document.getElementById('table-month-name');
  const mCalendarOverlay = document.getElementById('calendar-modal-overlay');
  const closeMCalendar = document.getElementById('close-m-calendar');

  if (monthNameLabel) {
    monthNameLabel.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        if (mCalendarOverlay) {
          mCalendarOverlay.classList.add('active');
          renderCalendar();
        }
      }
    });
    // Add a visual hint if on mobile (no underline as requested)
    if (window.innerWidth <= 768) {
      monthNameLabel.style.cursor = 'pointer';
      // Removed blue underline as per request
    }
  }

  if (closeMCalendar && mCalendarOverlay) {
    closeMCalendar.addEventListener('click', () => {
      window.closeOverlay('calendar-modal-overlay');
    });
    mCalendarOverlay.addEventListener('click', (e) => {
      if (e.target === mCalendarOverlay) window.closeOverlay('calendar-modal-overlay');
    });
  }

  // Mobile Calendar Nav
  const mCalPrev = document.getElementById('m-cal-prev');
  const mCalNext = document.getElementById('m-cal-next');
  if (mCalPrev) mCalPrev.addEventListener('click', () => { currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(); });
  if (mCalNext) mCalNext.addEventListener('click', () => { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); });

  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');

  if (prevBtn) {
    prevBtn.style.cursor = 'pointer';
    prevBtn.addEventListener('click', () => window.changeSidebarMonth(-1));
  }
  if (nextBtn) {
    nextBtn.style.cursor = 'pointer';
    nextBtn.addEventListener('click', () => window.changeSidebarMonth(1));
  }
});

function renderTareas() {
  if (typeof cleanupOldTareas === 'function') cleanupOldTareas();
  const container = document.getElementById('tareas-list');
  const tabsContainer = document.getElementById('tareas-group-tabs');
  const groupLabel = document.getElementById('tareas-group-label');
  const lang = securityConfig.language || 'es';
  if (!container || !groups.length) return;

  // Render Tabs
  if (activeGroupIdx >= groups.length) activeGroupIdx = 0;

  tabsContainer.innerHTML = groups.map((g, idx) => `
    <span class="scope-tab ${idx === activeGroupIdx ? 'active' : ''}" data-idx="${idx}">${g.name}</span>
  `).join('');

  tabsContainer.querySelectorAll('.scope-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeGroupIdx = parseInt(tab.dataset.idx);
      localStorage.setItem('asistencia_active_group_idx', activeGroupIdx);
      renderTareas();
    });
  });

  // Smooth scroll active tab into view
  const activeTabEl = tabsContainer.querySelector('.scope-tab.active');
  if (activeTabEl) {
    activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // Setup Left / Right Arrow Buttons for switching groups
  const prevBtn = document.getElementById('tareas-prev-group');
  const nextBtn = document.getElementById('tareas-next-group');

  if (prevBtn) {
    prevBtn.disabled = false;
    prevBtn.onclick = () => {
      if (groups.length === 0) return;
      activeGroupIdx = (activeGroupIdx - 1 + groups.length) % groups.length;
      localStorage.setItem('asistencia_active_group_idx', activeGroupIdx);
      renderTareas();
    };
  }

  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.onclick = () => {
      if (groups.length === 0) return;
      activeGroupIdx = (activeGroupIdx + 1) % groups.length;
      localStorage.setItem('asistencia_active_group_idx', activeGroupIdx);
      renderTareas();
    };
  }

  // Touch Swipe Gesture on Group Tabs area
  const navWrapper = document.querySelector('.group-tabs-nav-wrapper') || tabsContainer;
  if (navWrapper && !navWrapper.dataset.swipeInitialized) {
    navWrapper.dataset.swipeInitialized = 'true';
    let touchStartX = 0;
    let touchStartY = 0;

    navWrapper.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    navWrapper.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches.length > 0) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        if (Math.abs(diffX) > 30 && Math.abs(diffX) > Math.abs(diffY)) {
          if (groups.length <= 1) return;
          if (diffX < 0) {
            // Deslizar a la izquierda -> Siguiente grupo
            activeGroupIdx = (activeGroupIdx + 1) % groups.length;
          } else {
            // Deslizar a la derecha -> Grupo anterior
            activeGroupIdx = (activeGroupIdx - 1 + groups.length) % groups.length;
          }
          localStorage.setItem('asistencia_active_group_idx', activeGroupIdx);
          renderTareas();
        }
      }
    }, { passive: true });
  }

  const group = groups[activeGroupIdx];
  if (groupLabel) groupLabel.textContent = `GRUPO: ${group ? group.name.toUpperCase() : ''}`;

  const groupTareas = tareas.filter(t => t.groupId === group.id);

  if (groupTareas.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 20px; grid-column: 1 / -1; width: 100%; background: var(--surface); border-radius: 20px; border: 1px dashed var(--border);">
        <div class="empty-icon" style="margin-bottom: 20px;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.3; color: var(--accent-blue);">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          </svg>
        </div>
        <h3 data-i18n="tasks_empty_title" style="margin-bottom: 8px;">${translations[lang].tasks_empty_title}</h3>
        <p data-i18n="tasks_empty_desc" style="max-width: 320px; margin: 0 auto; opacity: 0.7;">${translations[lang].tasks_empty_desc}</p>
      </div>
    `;
    return;
  }

  const pointsWord = lang === 'es' ? 'PUNTOS' : 'POINTS';
  const dueWord = lang === 'es' ? 'Entrega:' : 'Due:';

  const todayDate = new Date();
  const todayMidnight = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()).getTime();

  container.innerHTML = groupTareas.map(t => {
    let dateClass = 'due-future';
    if (t.dueDate) {
      let dTime;
      if (typeof t.dueDate === 'string' && t.dueDate.includes('-')) {
        const parts = t.dueDate.split('-');
        if (parts.length === 3) {
          dTime = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
        }
      }
      if (!dTime) {
        const d = new Date(t.dueDate);
        dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      }
      if (dTime === todayMidnight) {
        dateClass = 'due-today';
      } else if (dTime < todayMidnight) {
        dateClass = 'due-past';
      }
    }

    return `
    <div class="tarea-card ${t.completed ? 'completed' : ''} ${dateClass}" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
      <!-- Top Row: Group Badge (Top Left) & Actions (Top Right) -->
      <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; position: relative; z-index: 10;">
        <span style="background: rgba(14, 165, 233, 0.12); color: #0284c7; font-size: 0.72rem; font-weight: 800; padding: 4px 10px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.3px;">
          ${t.groupName || (groups.find(g => g.id === t.groupId)?.name) || group.name}
        </span>
        <div style="display: flex; gap: 8px;">
          <button onclick="window.toggleTaskComplete('${t.id}')" class="btn-complete-task ${t.completed ? 'active' : ''}" title="Marcar como completada">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
          <button onclick="window.deleteTask('${t.id}')" class="btn-delete-task" style="background: rgba(239, 68, 68, 0.1); border: none; color: #ef4444; cursor: pointer; padding: 8px; border-radius: 10px; transition: all 0.2s;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      
      <div style="background: var(--accent-blue-alpha); color: var(--accent-blue); width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </div>
      
      <div style="margin-bottom: 15px; width: 100%;">
        <h4 style="margin: 0; color: var(--text); font-weight: 800; font-size: 1.2rem; line-height: 1.2;">${t.title}</h4>
        <div style="margin-top: 4px;">
          <span style="font-size: 0.75rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${t.subject}</span>
        </div>
        ${t.photo ? `
          <div style="margin-top: 12px; width: 100%; border-radius: 12px; overflow: hidden; max-height: 180px; border: 1px solid var(--border); cursor: pointer; position: relative;" onclick="window.openTaskImageModal('${t.id}')">
            <img src="${t.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="${t.title}" />
            <div style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.6); color: white; border-radius: 6px; padding: 3px 8px; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; gap: 4px; backdrop-filter: blur(4px);">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Ampliar
            </div>
          </div>
        ` : ''}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 15px; border-top: 1px solid var(--border-alpha); width: 100%;">
        <div style="display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 0.8rem; font-weight: 600;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${dueWord} ${new Date(t.dueDate).toLocaleDateString()}
        </div>
        <div class="status-badge" style="background: var(--accent-blue-alpha); color: var(--accent-blue); font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: 8px;">${t.points} ${pointsWord}</div>
      </div>
    </div>
  `}).join('');

  // Sync parent view if present in DOM
  renderParentTasks();
}

window.openTaskImageModal = function (taskId) {
  const task = tareas.find(t => t.id === taskId);
  if (!task || !task.photo) return;

  let modal = document.getElementById('task-image-preview-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'task-image-preview-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(8px); cursor: pointer;';
    modal.onclick = () => { modal.style.display = 'none'; };
    modal.innerHTML = `
      <div style="position: relative; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center;" onclick="event.stopPropagation()">
        <img id="task-image-modal-img" src="" style="max-width: 100%; max-height: 80vh; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); object-fit: contain;" />
        <div id="task-image-modal-title" style="color: white; margin-top: 12px; font-weight: 700; font-size: 1.1rem; text-align: center;"></div>
        <button style="position: absolute; top: -15px; right: -15px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 18px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3);" onclick="document.getElementById('task-image-preview-modal').style.display='none'">×</button>
      </div>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('task-image-modal-img').src = task.photo;
  document.getElementById('task-image-modal-title').textContent = task.title;
  modal.style.display = 'flex';
};

window.showTaskDetails = function (taskId) {
  const task = tareas.find(t => t.id === taskId);
  if (!task) return;
  if (task.photo) {
    window.openTaskImageModal(taskId);
  }
};

window.toggleTaskComplete = function (taskId) {
  const taskIndex = tareas.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    tareas[taskIndex].completed = !tareas[taskIndex].completed;
    localStorage.setItem('asistencia_tareas', JSON.stringify(tareas));
    renderTareas();
  }
}

window.deleteTask = function (taskId) {
  showConfirm("¿Eliminar tarea?", "¿Estás seguro de que deseas eliminar esta tarea permanentemente?", () => {
    tareas = tareas.filter(t => t.id !== taskId);
    localStorage.setItem('asistencia_tareas', JSON.stringify(tareas));
    renderTareas();
    showNotif("Tarea eliminada", "El registro ha sido actualizado.");
  });
}

// ── CITATIONS EVENT LISTENERS ──
document.getElementById('open-add-citacion')?.addEventListener('click', () => {
  document.getElementById('modal-add-citacion').classList.add('active');
});

document.getElementById('cancel-citacion')?.addEventListener('click', () => {
  document.getElementById('modal-add-citacion').classList.remove('active');
});

document.getElementById('close-task-details')?.addEventListener('click', () => {
  document.getElementById('modal-task-details').classList.remove('active');
});

document.getElementById('save-new-citacion')?.addEventListener('click', () => {
  const parent = document.getElementById('citacion-parent').value;
  const student = document.getElementById('citacion-student').value;
  const reason = document.getElementById('citacion-reason').value;
  const date = document.getElementById('citacion-date').value;
  const time = document.getElementById('citacion-time').value;

  if (!student || !reason || !date || !time) {
    showNotif('Campos incompletos', 'Por favor llena todos los datos de la citación.');
    return;
  }

  const newCit = {
    id: 'c-' + Date.now(),
    studentName: student,
    parentName: parent,
    reason: reason,
    date: date,
    time: time,
    status: 'pending'
  };

  citaciones.unshift(newCit);
  localStorage.setItem('asistencia_citaciones', JSON.stringify(citaciones));

  document.getElementById('modal-add-citacion').classList.remove('active');
  showNotif('Citación Publicada', 'Se ha registrado la citación para el acudiente.');

  // Clear inputs
  document.getElementById('citacion-parent').value = '';
  document.getElementById('citacion-student').value = '';
  document.getElementById('citacion-reason').value = '';
  document.getElementById('citacion-date').value = '';
  document.getElementById('citacion-time').value = '';

  if (document.getElementById('screen-acudiente').style.display !== 'none') {
    renderCitaciones();
  }
});

// ── REUNIONS (MEETINGS) EVENT LISTENERS ──
document.getElementById('open-add-reunion')?.addEventListener('click', () => {
  const activeGroup = groups[activeGroupIdx] ? groups[activeGroupIdx].name : '';
  const groupInput = document.getElementById('reunion-group-name');
  if (groupInput) groupInput.value = activeGroup;
  document.getElementById('modal-add-reunion').classList.add('active');
});

document.getElementById('cancel-reunion')?.addEventListener('click', () => {
  document.getElementById('modal-add-reunion').classList.remove('active');
});

document.getElementById('save-new-reunion')?.addEventListener('click', () => {
  const reason = document.getElementById('reunion-reason').value;
  const place = document.getElementById('reunion-place').value;
  const date = document.getElementById('reunion-date').value;
  const time = document.getElementById('reunion-time').value;

  if (!reason || !date || !time) {
    showNotif('Campos incompletos', 'Por favor llena todos los campos obligatorios.');
    return;
  }

  const newReunion = {
    id: 'r-' + Date.now(),
    studentName: 'all',
    studentId: 'all',
    parentName: 'Todos los Acudientes',
    reason: `Reunión: ${reason}${place ? ` (Lugar: ${place})` : ''}`,
    date: date,
    time: time,
    status: 'pending',
    type: 'reunion'
  };

  citaciones.unshift(newReunion);
  localStorage.setItem('asistencia_citaciones', JSON.stringify(citaciones));

  document.getElementById('modal-add-reunion').classList.remove('active');
  showNotif('Reunión Publicada', 'Se ha programado la reunión para el grupo.');

  // Clear inputs
  document.getElementById('reunion-reason').value = '';
  document.getElementById('reunion-place').value = '';
  document.getElementById('reunion-date').value = '';
  document.getElementById('reunion-time').value = '';

  if (document.getElementById('screen-acudiente').style.display !== 'none') {
    renderCitaciones();
  }
});

// Monitor de rotación agresivo
['resize', 'orientationchange'].forEach(evt => {
  window.addEventListener(evt, () => {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth <= 1280;

    if (isLandscape && (isTouch || isSmallScreen)) {
      const wrapper = document.getElementById('greeting-wrapper');
      if (wrapper) {
        wrapper.style.setProperty('display', 'none', 'important');
      }
    }
  });
});

/* ── MOBILE LANDSCAPE: CALENDAR TOGGLE ── */
document.addEventListener('click', (e) => {
  // DIAGNOSTIC ALERT - REMOVE AFTER FIXING
  // alert("Click en: " + e.target.tagName + " (Clase: " + e.target.className + ")");

  const calWidget = document.querySelector('.calendar-widget');
  if (e.target.closest('#calendar-month-year')) {
    const isLandscape = window.matchMedia("(max-width: 932px) and (orientation: landscape)").matches;
    if (isLandscape) {
      calWidget?.classList.toggle('expanded');
    }
  } else if (!e.target.closest('.calendar-widget')) {
    if (calWidget?.classList.contains('expanded')) {
      calWidget.classList.remove('expanded');
    }
  }

  // ── SIDEBAR TOGGLE ──
  const collapseBtn = e.target.closest('#sidebar-collapse-btn');
  if (collapseBtn) {
    const appLayout = document.querySelector('.app-layout');
    appLayout?.classList.add('sidebar-collapsed');
  }

  const expandBtn = e.target.closest('#sidebar-expand-btn');
  if (expandBtn) {
    const appLayout = document.querySelector('.app-layout');
    appLayout?.classList.remove('sidebar-collapsed');
  }
});

// ==========================================
// SYSTEM SELECTORS: CUSTOM DATE AND TIME PICKER
// ==========================================

let activeDateInput = null;
let activeTimeInput = null;

// Date Picker State
let datePickerSelectedDate = new Date();
let datePickerCurrentMonth = datePickerSelectedDate.getMonth();
let datePickerCurrentYear = datePickerSelectedDate.getFullYear();

// Time Picker State
let timePickerSelectedHour = 12;
let timePickerSelectedMinute = 0;
let timePickerSelectedAmPm = 'AM';
let timePickerSelectionMode = 'hour';
let timePickerMode = 'clock';
let isDraggingTimeNeedle = false;

// Names in Spanish for calendar header formatting
const DAYS_OF_WEEK_SPANISH = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_SHORT_SPANISH = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
const MONTHS_FULL_SPANISH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// --- DATE PICKER LOGIC ---

function openDatePicker(inputEl) {
  activeDateInput = inputEl;

  // Parse date from input
  const val = inputEl.value;
  let parsedDate = new Date();
  if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const parts = val.split('-');
    parsedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }

  datePickerSelectedDate = parsedDate;
  datePickerCurrentMonth = parsedDate.getMonth();
  datePickerCurrentYear = parsedDate.getFullYear();

  const modal = document.getElementById('custom-date-picker-modal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    renderCustomDatePickerCalendar();
  }
}

function closeDatePicker() {
  const modal = document.getElementById('custom-date-picker-modal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      if (!modal.classList.contains('active')) {
        modal.style.display = 'none';
      }
    }, 250);
  }
  activeDateInput = null;
}

function renderCustomDatePickerCalendar() {
  const grid = document.getElementById('custom-date-days-grid');
  const yearHeader = document.getElementById('custom-date-header-year');
  const fullHeader = document.getElementById('custom-date-header-full');
  const monthLabel = document.getElementById('custom-date-month-label');

  if (!grid || !yearHeader || !fullHeader || !monthLabel) return;

  grid.innerHTML = '';

  // Update year and selected date labels
  yearHeader.textContent = datePickerSelectedDate.getFullYear();

  const dayName = DAYS_OF_WEEK_SPANISH[datePickerSelectedDate.getDay()];
  const dayNum = datePickerSelectedDate.getDate();
  const monthShort = MONTHS_SHORT_SPANISH[datePickerSelectedDate.getMonth()];
  fullHeader.textContent = `${dayName}, ${dayNum} de ${monthShort}`;

  monthLabel.textContent = `${MONTHS_FULL_SPANISH[datePickerCurrentMonth]} de ${datePickerCurrentYear}`;

  // Render Days
  const firstDayIndex = new Date(datePickerCurrentYear, datePickerCurrentMonth, 1).getDay();
  const daysInCurrentMonth = new Date(datePickerCurrentYear, datePickerCurrentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(datePickerCurrentYear, datePickerCurrentMonth, 0).getDate();

  // Render previous month days (grayed out)
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const span = document.createElement('span');
    span.className = 'empty-day';
    span.style.opacity = '0.35';
    span.textContent = day;
    grid.appendChild(span);
  }

  // Render current month days
  const today = new Date();
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const span = document.createElement('span');
    span.textContent = d;

    // Check if it's the selected date
    const isSelected = d === datePickerSelectedDate.getDate() &&
      datePickerCurrentMonth === datePickerSelectedDate.getMonth() &&
      datePickerCurrentYear === datePickerSelectedDate.getFullYear();

    if (isSelected) {
      span.className = 'active-day';
    }

    // Check if it's today
    const isToday = d === today.getDate() &&
      datePickerCurrentMonth === today.getMonth() &&
      datePickerCurrentYear === today.getFullYear();
    if (isToday) {
      span.classList.add('today-day');
    }

    // Click listener
    span.addEventListener('click', () => {
      datePickerSelectedDate = new Date(datePickerCurrentYear, datePickerCurrentMonth, d);
      renderCustomDatePickerCalendar();
    });

    grid.appendChild(span);
  }

  // Render next month days to fill 42 cells grid
  const totalCellsSoFar = firstDayIndex + daysInCurrentMonth;
  const remainingCells = 42 - totalCellsSoFar;
  for (let d = 1; d <= remainingCells; d++) {
    const span = document.createElement('span');
    span.className = 'empty-day';
    span.style.opacity = '0.35';
    span.textContent = d;
    grid.appendChild(span);
  }
}

// Bind Date Picker triggers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.custom-date-trigger').forEach(input => {
    input.addEventListener('click', () => openDatePicker(input));
  });
});
// Fallback if DOMContentLoaded already fired
document.querySelectorAll('.custom-date-trigger').forEach(input => {
  input.addEventListener('click', () => openDatePicker(input));
});

// Calendar Month Navigation
document.getElementById('custom-date-prev-month')?.addEventListener('click', () => {
  datePickerCurrentMonth--;
  if (datePickerCurrentMonth < 0) {
    datePickerCurrentMonth = 11;
    datePickerCurrentYear--;
  }
  renderCustomDatePickerCalendar();
});

document.getElementById('custom-date-next-month')?.addEventListener('click', () => {
  datePickerCurrentMonth++;
  if (datePickerCurrentMonth > 11) {
    datePickerCurrentMonth = 0;
    datePickerCurrentYear++;
  }
  renderCustomDatePickerCalendar();
});

// Calendar Actions
document.getElementById('custom-date-clear')?.addEventListener('click', () => {
  if (activeDateInput) {
    activeDateInput.value = '';
    activeDateInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeDateInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeDatePicker();
});

document.getElementById('custom-date-cancel')?.addEventListener('click', closeDatePicker);

document.getElementById('custom-date-today')?.addEventListener('click', () => {
  datePickerSelectedDate = new Date();
  datePickerCurrentMonth = datePickerSelectedDate.getMonth();
  datePickerCurrentYear = datePickerSelectedDate.getFullYear();
  renderCustomDatePickerCalendar();
});

document.getElementById('custom-date-submit')?.addEventListener('click', () => {
  if (activeDateInput && datePickerSelectedDate) {
    const y = datePickerSelectedDate.getFullYear();
    const m = String(datePickerSelectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(datePickerSelectedDate.getDate()).padStart(2, '0');
    activeDateInput.value = `${y}-${m}-${d}`;
    activeDateInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeDateInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeDatePicker();
});

// Close when clicking backdrop overlay
document.getElementById('custom-date-picker-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    closeDatePicker();
  }
});


// --- TIME PICKER LOGIC ---

function openCustomTimePicker(inputEl) {
  activeTimeInput = inputEl;

  const val = inputEl.value;
  let parsedHour = 12;
  let parsedMinute = 0;
  let parsedAmPm = 'AM';

  if (val) {
    const matches = val.match(/(\d{1,2}):(\d{2})\s*(AM|PM|a\.\s*m\.|p\.\s*m\.)?/i);
    if (matches) {
      parsedHour = parseInt(matches[1]);
      parsedMinute = parseInt(matches[2]);
      if (matches[3]) {
        const ampmStr = matches[3].toLowerCase();
        parsedAmPm = (ampmStr.includes('p') || ampmStr.includes('pm')) ? 'PM' : 'AM';
      } else {
        if (parsedHour >= 12) {
          parsedAmPm = 'PM';
          if (parsedHour > 12) parsedHour -= 12;
        } else {
          parsedAmPm = 'AM';
          if (parsedHour === 0) parsedHour = 12;
        }
      }
    }
  } else {
    const now = new Date();
    let hours = now.getHours();
    parsedAmPm = hours >= 12 ? 'PM' : 'AM';
    parsedHour = hours % 12;
    if (parsedHour === 0) parsedHour = 12;
    parsedMinute = now.getMinutes();
  }

  timePickerSelectedHour = parsedHour;
  timePickerSelectedMinute = parsedMinute;
  timePickerSelectedAmPm = parsedAmPm;
  timePickerSelectionMode = 'hour';
  timePickerMode = 'clock';

  const modal = document.getElementById('custom-time-picker-modal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);

    const card = modal.querySelector('.time-picker-card');
    if (card) {
      card.className = 'custom-picker-card time-picker-card mode-clock';
    }

    updateTimePickerUI();
  }
}

function closeCustomTimePicker() {
  const modal = document.getElementById('custom-time-picker-modal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      if (!modal.classList.contains('active')) {
        modal.style.display = 'none';
      }
    }, 250);
  }
  activeTimeInput = null;
}

function updateTimePickerUI() {
  const hrHeader = document.getElementById('time-header-hour');
  const minHeader = document.getElementById('time-header-min');

  if (hrHeader && minHeader) {
    hrHeader.textContent = String(timePickerSelectedHour).padStart(2, '0');
    minHeader.textContent = String(timePickerSelectedMinute).padStart(2, '0');

    if (timePickerSelectionMode === 'hour') {
      hrHeader.classList.add('active');
      minHeader.classList.remove('active');
    } else {
      hrHeader.classList.remove('active');
      minHeader.classList.add('active');
    }
  }

  const amBtn = document.getElementById('time-header-am-btn');
  const pmBtn = document.getElementById('time-header-pm-btn');
  if (amBtn && pmBtn) {
    if (timePickerSelectedAmPm === 'AM') {
      amBtn.classList.add('active');
      pmBtn.classList.remove('active');
    } else {
      amBtn.classList.remove('active');
      pmBtn.classList.add('active');
    }
  }

  renderClockNumbers();
  updateNeedleRotation();

  const kbdHour = document.getElementById('keyboard-input-hour');
  const kbdMinute = document.getElementById('keyboard-input-minute');
  const kbdAmPm = document.getElementById('keyboard-select-ampm');

  if (kbdHour) kbdHour.value = timePickerSelectedHour;
  if (kbdMinute) kbdMinute.value = String(timePickerSelectedMinute).padStart(2, '0');
  if (kbdAmPm) kbdAmPm.value = timePickerSelectedAmPm;
}

function renderClockNumbers() {
  const container = document.getElementById('clock-numbers-layer');
  if (!container) return;

  container.innerHTML = '';
  const isHour = (timePickerSelectionMode === 'hour');

  const numbers = isHour
    ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    : ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  const R = 80;
  const centerX = 110;
  const centerY = 110;

  numbers.forEach((num, index) => {
    const angleDeg = index * 30;
    const angleRad = (angleDeg * Math.PI) / 180;

    const x = centerX + R * Math.sin(angleRad);
    const y = centerY - R * Math.cos(angleRad);

    const el = document.createElement('div');
    el.className = 'clock-face-number';
    el.textContent = num;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    if (isHour) {
      if (parseInt(num) === timePickerSelectedHour) {
        el.classList.add('selected-number');
      }
    } else {
      const nearestMultiple = Math.round(timePickerSelectedMinute / 5) * 5;
      const targetVal = nearestMultiple === 60 ? 0 : nearestMultiple;
      if (parseInt(num) === targetVal) {
        el.classList.add('selected-number');
      }
    }

    container.appendChild(el);
  });
}

function updateNeedleRotation() {
  const needle = document.getElementById('clock-needle');
  if (!needle) return;

  let targetAngle = 0;
  if (timePickerSelectionMode === 'hour') {
    targetAngle = timePickerSelectedHour * 30;
  } else {
    targetAngle = timePickerSelectedMinute * 6;
  }

  const rotation = targetAngle + 180;
  needle.style.transform = `rotate(${rotation}deg)`;
}

function handleClockPointerEvent(clientX, clientY) {
  const face = document.getElementById('clock-face-container');
  if (!face) return;

  const rect = face.getBoundingClientRect();
  const x = clientX - (rect.left + rect.width / 2);
  const y = clientY - (rect.top + rect.height / 2);

  let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;

  if (timePickerSelectionMode === 'hour') {
    let hour = Math.round(angle / 30);
    if (hour === 0) hour = 12;
    timePickerSelectedHour = hour;
  } else {
    let minute = Math.round(angle / 6);
    if (minute === 60) minute = 0;
    timePickerSelectedMinute = minute;
  }

  updateTimePickerUI();
}

// Bind Time Picker triggers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.custom-time-trigger').forEach(input => {
    input.addEventListener('click', () => openCustomTimePicker(input));
  });
});
// Fallback if DOMContentLoaded already fired
document.querySelectorAll('.custom-time-trigger').forEach(input => {
  input.addEventListener('click', () => openCustomTimePicker(input));
});

// Switching hours/minutes selection view via header click
document.getElementById('time-header-hour')?.addEventListener('click', () => {
  timePickerSelectionMode = 'hour';
  updateTimePickerUI();
});

document.getElementById('time-header-min')?.addEventListener('click', () => {
  timePickerSelectionMode = 'minute';
  updateTimePickerUI();
});

// AM/PM Buttons in header
document.getElementById('time-header-am-btn')?.addEventListener('click', () => {
  timePickerSelectedAmPm = 'AM';
  updateTimePickerUI();
});

document.getElementById('time-header-pm-btn')?.addEventListener('click', () => {
  timePickerSelectedAmPm = 'PM';
  updateTimePickerUI();
});

// Toggle button (Clock Mode <-> Keyboard Mode)
document.getElementById('time-picker-mode-toggle')?.addEventListener('click', () => {
  const card = document.querySelector('.time-picker-card');
  if (!card) return;

  if (timePickerMode === 'clock') {
    timePickerMode = 'keyboard';
    card.classList.remove('mode-clock');
    card.classList.add('mode-keyboard');
  } else {
    timePickerMode = 'clock';
    card.classList.remove('mode-keyboard');
    card.classList.add('mode-clock');
  }
  updateTimePickerUI();
});

// Pointer drag / touch events on Clock Face
const clockFace = document.getElementById('clock-face-container');
if (clockFace) {
  const startDrag = (e) => {
    isDraggingTimeNeedle = true;
    const clientX = (e.clientX !== undefined && e.clientX !== null) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = (e.clientY !== undefined && e.clientY !== null) ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    handleClockPointerEvent(clientX, clientY);
  };

  const moveDrag = (e) => {
    if (!isDraggingTimeNeedle) return;
    const clientX = (e.clientX !== undefined && e.clientX !== null) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = (e.clientY !== undefined && e.clientY !== null) ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    handleClockPointerEvent(clientX, clientY);
    e.preventDefault();
  };

  const stopDrag = () => {
    if (isDraggingTimeNeedle) {
      isDraggingTimeNeedle = false;

      // Auto-switch to minutes mode after selecting hour
      if (timePickerSelectionMode === 'hour') {
        setTimeout(() => {
          if (timePickerSelectionMode === 'hour') {
            timePickerSelectionMode = 'minute';
            updateTimePickerUI();
          }
        }, 300);
      }
    }
  };

  clockFace.addEventListener('mousedown', startDrag);
  clockFace.addEventListener('touchstart', startDrag, { passive: false });

  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('touchmove', moveDrag, { passive: false });

  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchend', stopDrag);
}

// Keyboard view inputs listeners
document.getElementById('keyboard-input-hour')?.addEventListener('input', (e) => {
  let val = parseInt(e.target.value);
  if (isNaN(val)) return;
  if (val < 1) val = 1;
  if (val > 12) val = 12;
  timePickerSelectedHour = val;
  updateNeedleRotation();
});
document.getElementById('keyboard-input-hour')?.addEventListener('blur', (e) => {
  let val = parseInt(e.target.value);
  if (isNaN(val) || val < 1) val = 12;
  if (val > 12) val = 12;
  timePickerSelectedHour = val;
  updateTimePickerUI();
});

document.getElementById('keyboard-input-minute')?.addEventListener('input', (e) => {
  let val = parseInt(e.target.value);
  if (isNaN(val)) return;
  if (val < 0) val = 0;
  if (val > 59) val = 59;
  timePickerSelectedMinute = val;
  updateNeedleRotation();
});
document.getElementById('keyboard-input-minute')?.addEventListener('blur', (e) => {
  let val = parseInt(e.target.value);
  if (isNaN(val) || val < 0) val = 0;
  if (val > 59) val = 59;
  timePickerSelectedMinute = val;
  updateTimePickerUI();
});

document.getElementById('keyboard-select-ampm')?.addEventListener('change', (e) => {
  timePickerSelectedAmPm = e.target.value;
  updateTimePickerUI();
});

// Actions
document.getElementById('custom-time-clear')?.addEventListener('click', () => {
  if (activeTimeInput) {
    activeTimeInput.value = '';
    activeTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeCustomTimePicker();
});

document.getElementById('custom-time-cancel')?.addEventListener('click', closeCustomTimePicker);

document.getElementById('custom-time-submit')?.addEventListener('click', () => {
  if (activeTimeInput) {
    const hh = String(timePickerSelectedHour).padStart(2, '0');
    const mm = String(timePickerSelectedMinute).padStart(2, '0');
    const ampm = timePickerSelectedAmPm;
    activeTimeInput.value = `${hh}:${mm} ${ampm}`;
    activeTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeCustomTimePicker();
});

// Close when clicking backdrop overlay
document.getElementById('custom-time-picker-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    closeCustomTimePicker();
  }
});

// ── BACKUP & DATA EXPORT / IMPORT & SECURITY DATA ──

window.exportAllData = function () {
  try {
    const backupData = {
      app: "AsistenciaApp",
      version: "1.0",
      exportDate: new Date().toISOString(),
      groups: safeParseJSON('asistencia_groups', defaultGroups),
      activeGroupIdx: safeParseJSON('asistencia_active_group_idx', 0),
      tareas: safeParseJSON('asistencia_tareas', []),
      citaciones: safeParseJSON('asistencia_citaciones', []),
      studentNotes: safeParseJSON('asistencia_student_notes', {}),
      teacherMessages: safeParseJSON('asistencia_teacher_messages', []),
      schedule: safeParseJSON('asistencia_schedule', defaultSchedule),
      scheduleDays: safeParseJSON('asistencia_schedule_days', ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']),
      teacherProfile: safeParseJSON('asistencia_teacher_profile', {})
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `asistencia_respaldo_completo_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showNotif('Exportación Exitosa', 'Se descargó la copia de seguridad completa.');
  } catch (e) {
    console.error("Error exporting data:", e);
    showNotif('Error', 'No se pudo exportar la información.', 'error');
  }
};

window.importAllData = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.groups && !data.tareas) {
        showNotif('Archivo Inválido', 'El archivo seleccionado no es un respaldo válido de AsistenciaApp.', 'error');
        return;
      }

      if (data.groups) localStorage.setItem('asistencia_groups', JSON.stringify(data.groups));
      if (data.activeGroupIdx !== undefined) localStorage.setItem('asistencia_active_group_idx', JSON.stringify(data.activeGroupIdx));
      if (data.tareas) localStorage.setItem('asistencia_tareas', JSON.stringify(data.tareas));
      if (data.citaciones) localStorage.setItem('asistencia_citaciones', JSON.stringify(data.citaciones));
      if (data.studentNotes) localStorage.setItem('asistencia_student_notes', JSON.stringify(data.studentNotes));
      if (data.teacherMessages) localStorage.setItem('asistencia_teacher_messages', JSON.stringify(data.teacherMessages));
      if (data.schedule) localStorage.setItem('asistencia_schedule', JSON.stringify(data.schedule));
      if (data.scheduleDays) localStorage.setItem('asistencia_schedule_days', JSON.stringify(data.scheduleDays));
      if (data.teacherProfile) localStorage.setItem('asistencia_teacher_profile', JSON.stringify(data.teacherProfile));

      showNotif('Restauración Exitosa', 'Información importada correctamente. Recargando...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      console.error("Error importing file:", err);
      showNotif('Error de Lectura', 'No se pudo procesar el archivo JSON seleccionado.', 'error');
    }
  };
  reader.readAsText(file);
};

window.downloadSecurityData = function () {
  try {
    const secConfig = safeParseJSON('asistencia_security_config', { basic: false, pencil: false, ink: false });
    const lastModifiedLog = safeParseJSON('asistencia_last_modified', {});

    const secData = {
      reportTitle: "Reporte y Datos de Seguridad - AsistenciaApp",
      generatedAt: new Date().toLocaleString(),
      securityConfiguration: {
        lockBasicEnabled: secConfig.basic || false,
        lockPencilEnabled: secConfig.pencil || false,
        lockInkEnabled: secConfig.ink || false,
        masterPasswordConfigured: !!secConfig.masterHash,
        masterPasswordPlainAvailable: !!secConfig.masterPlain,
        preferredLanguage: secConfig.language || 'es'
      },
      auditLogModifiedCellsCount: Object.keys(lastModifiedLog).length,
      auditLogDetails: lastModifiedLog
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(secData, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `asistencia_datos_seguridad_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showNotif('Descarga Exitosa', 'Se descargó el archivo con los datos de seguridad y auditoría.');
  } catch (e) {
    console.error("Error downloading security data:", e);
    showNotif('Error', 'No se pudieron descargar los datos de seguridad.', 'error');
  }
};

window.exportBackupJSON = function () {
  try {
    const backupData = {
      app: "VerificacionDeAsistencia",
      version: "2.0",
      exportDate: new Date().toISOString(),
      storage: { ...localStorage }
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Copia_de_Seguridad_Asistencia_${dateStamp}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    if (window.showNotif) {
      window.showNotif("Copia Descargada", "La copia de seguridad ha sido guardada en tu dispositivo.");
    } else {
      alert("Copia de seguridad descargada correctamente.");
    }
  } catch (err) {
    console.error("Export error:", err);
    alert("Error al exportar la copia de seguridad: " + err.message);
  }
};

window.importBackupJSON = function (event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && parsed.storage) {
        Object.keys(parsed.storage).forEach(key => {
          localStorage.setItem(key, parsed.storage[key]);
        });
        alert("¡Copia de seguridad importada con éxito! La aplicación se recargará para aplicar los cambios.");
        window.location.reload();
      } else {
        alert("El archivo seleccionado no tiene un formato válido de copia de seguridad.");
      }
    } catch (err) {
      console.error("Import error:", err);
      alert("Error al leer el archivo JSON: " + err.message);
    }
  };
  reader.readAsText(file);
};

// ── CLASS ALARMS & NOTIFICATIONS MODULE ──

function playAlarmSound(soundType = 'campana') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const durationLimit = 3.0; // Buclé continuo durante 3 segundos

    function playPatternAt(offset) {
      if (soundType === 'campana') {
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          const startTime = ctx.currentTime + offset + i * 0.15;
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(0.3, startTime + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.5);
        });
      } else if (soundType === 'alarma') {
        [0, 0.2].forEach(delay => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          const startTime = ctx.currentTime + offset + delay;
          osc.frequency.setValueAtTime(880, startTime);
          osc.frequency.exponentialRampToValueAtTime(1320, startTime + 0.12);
          gain.gain.setValueAtTime(0.3, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.18);
        });
      } else if (soundType === 'timbre') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        const startTime = ctx.currentTime + offset;
        osc.frequency.setValueAtTime(440, startTime);
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.45);
      } else if (soundType === 'digital') {
        [587.33, 739.99, 880].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          const startTime = ctx.currentTime + offset;
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.2, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.4);
        });
      } else if (soundType === 'melodia') {
        const notes = [659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          const startTime = ctx.currentTime + offset + i * 0.12;
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.25, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.35);
        });
      }
    }

    const patternInterval = soundType === 'campana' ? 0.6 : (soundType === 'melodia' ? 0.5 : 0.45);
    for (let offset = 0; offset < durationLimit; offset += patternInterval) {
      playPatternAt(offset);
    }
  } catch (e) {
    console.error("Error playing alarm sound loop:", e);
  }
}
window.playAlarmSound = playAlarmSound;

window.syncAllNotificationForms = function () {
  const notifConfig = safeParseJSON('asistencia_notif_config', {
    globalEnabled: true,
    advanceMinutes: 10,
    types: { advance: false, start: true, pending: true, summary: false },
    sound: 'campana'
  });

  // Form 1: Modal Quick Settings
  const gToggle = document.getElementById('notif-global-toggle');
  const advSelect = document.getElementById('notif-advance-select');
  const tAdvance = document.getElementById('notif-type-advance');
  const tStart = document.getElementById('notif-type-start');
  const tPending = document.getElementById('notif-type-pending');
  const tSummary = document.getElementById('notif-type-summary');
  const soundSelect = document.getElementById('alarm-sound-select');

  if (gToggle) gToggle.checked = notifConfig.globalEnabled !== false;
  if (advSelect) advSelect.value = (notifConfig.advanceMinutes || 10).toString();
  if (tAdvance) tAdvance.checked = notifConfig.types?.advance === true;
  if (tStart) tStart.checked = notifConfig.types?.start !== false;
  if (tPending) tPending.checked = notifConfig.types?.pending !== false;
  if (tSummary) tSummary.checked = notifConfig.types?.summary === true;
  if (soundSelect) soundSelect.value = notifConfig.sound || 'campana';

  // Form 2: Main Screen Settings (Ajustes Panel)
  const mgToggle = document.getElementById('main-notif-global-toggle');
  const madvSelect = document.getElementById('main-notif-advance-select');
  const mtAdvance = document.getElementById('main-notif-type-advance');
  const mtStart = document.getElementById('main-notif-type-start');
  const mtPending = document.getElementById('main-notif-type-pending');
  const mtSummary = document.getElementById('main-notif-type-summary');
  const msoundSelect = document.getElementById('main-alarm-sound-select');

  if (mgToggle) mgToggle.checked = notifConfig.globalEnabled !== false;
  if (madvSelect) madvSelect.value = (notifConfig.advanceMinutes || 10).toString();
  if (mtAdvance) mtAdvance.checked = notifConfig.types?.advance === true;
  if (mtStart) mtStart.checked = notifConfig.types?.start !== false;
  if (mtPending) mtPending.checked = notifConfig.types?.pending !== false;
  if (mtSummary) mtSummary.checked = notifConfig.types?.summary === true;
  if (msoundSelect) msoundSelect.value = notifConfig.sound || 'campana';
};

window.saveNotificationSettingsUI = function () {
  const gToggle = document.getElementById('notif-global-toggle');
  const advSelect = document.getElementById('notif-advance-select');
  const tAdvance = document.getElementById('notif-type-advance');
  const tStart = document.getElementById('notif-type-start');
  const tPending = document.getElementById('notif-type-pending');
  const tSummary = document.getElementById('notif-type-summary');
  const soundSelect = document.getElementById('alarm-sound-select');

  const config = {
    globalEnabled: gToggle ? gToggle.checked : true,
    advanceMinutes: advSelect ? parseInt(advSelect.value) || 10 : 10,
    types: {
      advance: tAdvance ? tAdvance.checked : false,
      start: tStart ? tStart.checked : true,
      pending: tPending ? tPending.checked : true,
      summary: tSummary ? tSummary.checked : false
    },
    sound: soundSelect ? soundSelect.value : 'campana'
  };

  localStorage.setItem('asistencia_notif_config', JSON.stringify(config));
  localStorage.setItem('asistencia_alarm_config', JSON.stringify({ enabled: config.globalEnabled, sound: config.sound }));

  window.syncAllNotificationForms();

  if (config.globalEnabled) {
    requestNotificationPermissions();
  }

  scheduleCapacitorLocalNotifications();

  if (typeof showNotif === 'function') {
    showNotif('Notificaciones', 'Notificaciones de horario reprogramadas.', 'success');
  }
};

window.saveNotificationSettingsFromMainScreen = function () {
  const mgToggle = document.getElementById('main-notif-global-toggle');
  const madvSelect = document.getElementById('main-notif-advance-select');
  const mtAdvance = document.getElementById('main-notif-type-advance');
  const mtStart = document.getElementById('main-notif-type-start');
  const mtPending = document.getElementById('main-notif-type-pending');
  const mtSummary = document.getElementById('main-notif-type-summary');
  const msoundSelect = document.getElementById('main-alarm-sound-select');

  const config = {
    globalEnabled: mgToggle ? mgToggle.checked : true,
    advanceMinutes: madvSelect ? parseInt(madvSelect.value) || 10 : 10,
    types: {
      advance: mtAdvance ? mtAdvance.checked : false,
      start: mtStart ? mtStart.checked : true,
      pending: mtPending ? mtPending.checked : true,
      summary: mtSummary ? mtSummary.checked : false
    },
    sound: msoundSelect ? msoundSelect.value : 'campana'
  };

  localStorage.setItem('asistencia_notif_config', JSON.stringify(config));
  localStorage.setItem('asistencia_alarm_config', JSON.stringify({ enabled: config.globalEnabled, sound: config.sound }));

  window.syncAllNotificationForms();

  if (config.globalEnabled) {
    requestNotificationPermissions();
  }

  scheduleCapacitorLocalNotifications();

  if (typeof showNotif === 'function') {
    showNotif('Notificaciones', 'Ajustes de notificaciones guardados.', 'success');
  }
};

window.selectGroupByName = function (groupName) {
  if (!groupName || !groups || !Array.isArray(groups)) return;
  const idx = groups.findIndex(g => g.name === groupName || g.id === groupName);
  if (idx !== -1) {
    activeGroupIdx = idx;
    localStorage.setItem('asistencia_active_group_idx', idx.toString());
    students = groups[activeGroupIdx] ? groups[activeGroupIdx].students || [] : [];
    if (typeof window.updateHeaderGroupBadge === 'function') window.updateHeaderGroupBadge();
    if (typeof renderStudentMatrix === 'function') renderStudentMatrix();
  }
};

async function requestNotificationPermissions() {
  try {
    if (typeof LocalNotifications !== 'undefined' && LocalNotifications.requestPermissions) {
      await LocalNotifications.requestPermissions();
    } else if ('Notification' in window && Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  } catch (e) {
    console.error('Error requesting notification permissions:', e);
  }
}

// Tap Listener for Capacitor Deep Linking
if (typeof LocalNotifications !== 'undefined' && LocalNotifications.addListener) {
  try {
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action?.notification?.extra;
      if (extra && (extra.action === 'open_attendance' || extra.groupName)) {
        if (typeof window.openDocenteMode === 'function') {
          window.openDocenteMode();
        }
        if (extra.groupName) {
          window.selectGroupByName(extra.groupName);
        }
      }
    });
  } catch (e) {
    console.error('Error setting LocalNotifications action listener:', e);
  }
}

async function scheduleCapacitorLocalNotifications() {
  const notifConfig = safeParseJSON('asistencia_notif_config', {
    globalEnabled: true,
    advanceMinutes: 10,
    types: { advance: false, start: true, pending: true, summary: false },
    sound: 'campana'
  });

  if (!notifConfig.globalEnabled) {
    try {
      if (typeof LocalNotifications !== 'undefined' && LocalNotifications.getPending) {
        const pending = await LocalNotifications.getPending();
        if (pending && pending.notifications && pending.notifications.length > 0) {
          await LocalNotifications.cancel(pending);
        }
      }
    } catch (e) {
      console.error('Error clearing local notifications:', e);
    }
    return;
  }

  const currentSchedule = safeParseJSON('asistencia_schedule', []);
  const savedTareas = safeParseJSON('asistencia_tareas', []);

  const notificationsToSchedule = [];
  let idCounter = 1000;
  const now = new Date();
  const advanceMin = notifConfig.advanceMinutes || 10;

  const dayNameToIndex = {
    'domingo': 0, 'sun': 0,
    'lunes': 1, 'mon': 1,
    'martes': 2, 'tue': 2,
    'miércoles': 3, 'miercoles': 3, 'wed': 3,
    'jueves': 4, 'thu': 4,
    'viernes': 5, 'fri': 5,
    'sábado': 6, 'sabado': 6, 'sat': 6
  };

  // Determine shift end time for summary notification
  let summaryHour = 17;
  let summaryMin = 31;
  const currentShift = localStorage.getItem('asistencia_schedule_shift') || 'matutino';
  if (currentShift === 'matutino') {
    summaryHour = 12;
    summaryMin = 0;
  } else if (currentShift === 'vespertino') {
    summaryHour = 17;
    summaryMin = 31;
  }

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const targetDayIndex = targetDate.getDay();

    const dayClasses = currentSchedule.filter(cls => {
      if (!cls || !cls.day) return false;
      const clsDayIdx = dayNameToIndex[cls.day.toLowerCase()];
      return clsDayIdx === targetDayIndex;
    });

    dayClasses.forEach(cls => {
      const timeVal = normalizeTimeString(cls.startTime);
      const [hStr, mStr] = timeVal.split(':');
      const hour = parseInt(hStr) || 0;
      const minute = parseInt(mStr) || 0;

      const classStartTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hour, minute, 0);

      const groupTasks = savedTareas.filter(t => t && (t.groupName === cls.groupName || t.groupId === cls.groupName));
      let taskSuffix = '';
      if (groupTasks.length > 0) {
        const tNames = groupTasks.map(t => `"${t.title || t.name || 'Tarea'}"`).join(', ');
        taskSuffix = ` y con ese grupo tienes ${tNames}`;
      }

      // 1. Recordatorio Previo (sólo si activado en Ajustes, desactivado por defecto)
      if (notifConfig.types?.advance === true) {
        const advanceTime = new Date(classStartTime.getTime() - advanceMin * 60 * 1000);
        if (advanceTime > now) {
          idCounter++;
          notificationsToSchedule.push({
            title: `⏰ Recordatorio de Clase`,
            body: `Tu clase de ${cls.subject} (${cls.groupName}) empieza en ${advanceMin} min${taskSuffix}.`,
            id: idCounter,
            schedule: { at: advanceTime },
            extra: { type: 'advance', subject: cls.subject, groupName: cls.groupName }
          });
        }
      }

      // 2. Aviso de Inicio de Clase / Cambio de Clase (sólo si activado en Ajustes)
      if (notifConfig.types?.start !== false) {
        if (classStartTime > now) {
          idCounter++;
          notificationsToSchedule.push({
            title: `🔔 ¡Hora de Clase!`,
            body: `Tienes clase de ${cls.subject} con el grupo "${cls.groupName}"${taskSuffix}. Toca para tomar asistencia.`,
            id: idCounter,
            schedule: { at: classStartTime },
            extra: { action: 'open_attendance', type: 'start', subject: cls.subject, groupName: cls.groupName }
          });
        }
      }

      // 3. Recordatorio de Asistencia Pendiente (sólo si activado en Ajustes)
      if (notifConfig.types?.pending !== false) {
        const pendingTime = new Date(classStartTime.getTime() + 45 * 60 * 1000);
        if (pendingTime > now) {
          idCounter++;
          notificationsToSchedule.push({
            title: `⚠️ Asistencia Pendiente`,
            body: `No has registrado asistencia para ${cls.subject} de las ${cls.startTime} (${cls.groupName}).`,
            id: idCounter,
            schedule: { at: pendingTime },
            extra: { action: 'open_attendance', type: 'pending', subject: cls.subject, groupName: cls.groupName }
          });
        }
      }
    });

    // 4. Resumen Diario (sólo si activado en Ajustes, desactivado por defecto)
    if (notifConfig.types?.summary === true && dayClasses.length > 0) {
      const summaryTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), summaryHour, summaryMin, 0);
      if (summaryTime > now) {
        idCounter++;
        notificationsToSchedule.push({
          title: `📊 Resumen Diario de Clases`,
          body: `Hoy tuviste ${dayClasses.length} clase(s) programada(s). Revisa el registro de asistencias.`,
          id: idCounter,
          schedule: { at: summaryTime },
          extra: { type: 'summary' }
        });
      }
    }
  }

  try {
    if (typeof LocalNotifications !== 'undefined' && LocalNotifications.schedule) {
      const pending = await LocalNotifications.getPending();
      if (pending && pending.notifications && pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
      }
      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({ notifications: notificationsToSchedule });
        console.log(`Scheduled ${notificationsToSchedule.length} Capacitor local notifications.`);
      }
    }
  } catch (err) {
    console.error('Error scheduling Capacitor local notifications:', err);
  }
}

window.scheduleCapacitorLocalNotifications = scheduleCapacitorLocalNotifications;

function checkClassAlarms() {
  const notifConfig = safeParseJSON('asistencia_notif_config', {
    globalEnabled: true,
    advanceMinutes: 10,
    types: { advance: false, start: true, pending: true, summary: false },
    sound: 'campana'
  });
  if (!notifConfig.globalEnabled || notifConfig.types?.start === false) return;

  const now = new Date();
  const dayIndexMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayNameToday = dayIndexMap[now.getDay()];
  const currentHour = now.getHours().toString().padStart(2, '0');
  const currentMin = now.getMinutes().toString().padStart(2, '0');
  const currentTimeStr = `${currentHour}:${currentMin}`;
  const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

  const triggeredAlarms = safeParseJSON('asistencia_triggered_alarms', {});
  const currentSchedule = safeParseJSON('asistencia_schedule', []);

  const todaysClasses = currentSchedule.filter(item => {
    if (!item) return false;
    const dayMatch = (item.day && item.day.toLowerCase() === getDayId(dayNameToday).toLowerCase()) || (item.day === dayNameToday);
    const timeVal = normalizeTimeString(item.startTime);
    return dayMatch && timeVal === currentTimeStr;
  });

  todaysClasses.forEach(cls => {
    const alarmKey = `${todayStr}_${cls.subject}_${cls.groupName}_${cls.startTime}`;
    if (triggeredAlarms[alarmKey]) return;

    triggeredAlarms[alarmKey] = Date.now();
    localStorage.setItem('asistencia_triggered_alarms', JSON.stringify(triggeredAlarms));

    playAlarmSound(notifConfig.sound);

    let notifBody = `Tienes clase de ${cls.subject} con el grupo "${cls.groupName}"`;
    const savedTareas = safeParseJSON('asistencia_tareas', []);
    const groupTasks = savedTareas.filter(t => t && (t.groupName === cls.groupName || t.groupId === cls.groupName));

    if (groupTasks.length > 0) {
      const taskNames = groupTasks.map(t => `"${t.title || t.name || 'Tarea'}"`).join(', ');
      notifBody += ` y con ese grupo tienes ${taskNames}`;
    }

    if (typeof showNotif === 'function') {
      showNotif('🔔 ¡Hora de Clase!', notifBody, 'success');
    }
  });
}

// Real-time foreground checker & schedule initializer
setInterval(checkClassAlarms, 25000);
setTimeout(() => {
  if (typeof window.syncAllNotificationForms === 'function') {
    window.syncAllNotificationForms();
  }
  requestNotificationPermissions();
  scheduleCapacitorLocalNotifications();
}, 2000);


// ── AUTO FALTA A MEDIANOCHE ──

window.saveAutoFaltaConfig = function () {
  const toggle = document.getElementById('auto-falta-midnight-toggle');
  const enabled = toggle ? toggle.checked : false;
  localStorage.setItem('asistencia_auto_falta_config', JSON.stringify({ enabled }));
  if (typeof showNotif === 'function') {
    showNotif(
      enabled ? 'Falta Automática Activada' : 'Falta Automática Desactivada',
      enabled
        ? 'Las casillas vacías serán marcadas como Falta a las 12:00 AM.'
        : 'La función de falta automática ha sido desactivada.',
      enabled ? 'success' : 'success'
    );
  }
};

/**
 * Fills all 'empty' attendance cells for the previous day (across all groups)
 * with 'absent'. Called automatically at midnight if the feature is enabled.
 */
function applyAutoFaltaForYesterday() {
  const cfg = safeParseJSON('asistencia_auto_falta_config', { enabled: false });
  if (!cfg.enabled) return;

  const lang = securityConfig.language || 'es';

  // "Yesterday" relative to the moment this runs (just after midnight)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const monthKey = translations[lang].months[yesterday.getMonth()].substring(0, 3);
  const dayIdx = yesterday.getDate() - 1; // 0-indexed within the 35-slot array

  // Guard: don't apply the same day twice
  const guardKey = `asistencia_auto_falta_applied_${monthKey}_${dayIdx}`;
  if (localStorage.getItem(guardKey)) return;
  localStorage.setItem(guardKey, '1');

  let totalFilled = 0;

  groups.forEach((group, gIdx) => {
    if (!group.students || group.students.length === 0) return;
    group.students.forEach(student => {
      if (!student.history) student.history = {};
      if (!student.history[monthKey]) student.history[monthKey] = Array(35).fill('empty');
      if (student.history[monthKey][dayIdx] === 'empty') {
        student.history[monthKey][dayIdx] = 'absent';
        markCellLastModified(student.name, monthKey, dayIdx);
        totalFilled++;
      }
    });
  });

  if (totalFilled > 0) {
    saveToLocal();
    if (typeof renderTable === 'function') renderTable();
    if (typeof showNotif === 'function') {
      showNotif(
        'Falta Automática Aplicada',
        `${totalFilled} casilla${totalFilled !== 1 ? 's' : ''} sin asistencia marcada${totalFilled !== 1 ? 's' : ''} como Falta.`
      );
    }
  }
}

// Check every minute whether midnight has just passed
(function initMidnightChecker() {
  let lastCheckedDate = new Date().getDate();

  setInterval(() => {
    const now = new Date();
    const currentDate = now.getDate();
    // Day has changed → midnight passed
    if (currentDate !== lastCheckedDate) {
      lastCheckedDate = currentDate;
      applyAutoFaltaForYesterday();
    }
  }, 60000); // check every 60 seconds
})();

// ── GOOGLE AUTH & DRIVE — Real initialization ──────────────────────────────────

// The Drive functions are imported at the top of this file as driveSync / driveRestore.
// Re-expose them to window so any remaining inline onclick= attributes can find them.
window.syncWithGoogleDrive = driveSync;
window.restoreFromGoogleDrive = driveRestore;

/**
 * "Sincronizar Ahora" button handler — shows real loading/success/error states.
 * Called by onclick on #btn-sync-drive in index.html
 */
window.handleSyncToDrive = async function () {
  const btn  = document.getElementById('btn-sync-drive');
  const txt  = document.getElementById('btn-sync-text');
  if (!btn) { await driveSync(true); return; }

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  if (txt) txt.textContent = 'Subiendo...';

  try {
    const ok = await driveSync(true);
    if (ok) {
      if (txt) txt.textContent = '✓ Guardado';
    } else {
      if (txt) txt.textContent = '✗ Error';
    }
  } catch (e) {
    if (txt) txt.textContent = '✗ Error';
  } finally {
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      updateGoogleUI();
    }, 2500);
  }
};

/**
 * "Restaurar desde la Nube" button handler — confirms first, then shows real loading state.
 * Called by onclick on #btn-restore-drive in index.html
 */
window.handleRestoreFromDrive = async function () {
  const confirmed = window.confirm(
    '⚠️ Restaurar desde Google Drive reemplazará TODOS tus datos locales (grupos, alumnos, horarios y tareas) con el respaldo guardado en la nube.\n\n¿Deseas continuar?'
  );
  if (!confirmed) return;

  const btn = document.getElementById('btn-restore-drive');
  const txt = document.getElementById('btn-restore-text');
  if (!btn) { await driveRestore(); return; }

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  if (txt) txt.textContent = 'Restaurando...';

  try {
    await driveRestore();
    // driveRestore() reloads the page on success, so we only reach here on failure
    if (txt) txt.textContent = '✗ Error';
    setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; }, 2500);
  } catch (e) {
    if (txt) txt.textContent = '✗ Error';
    setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; }, 2500);
  }
};

// Pre-load the Google Identity Services SDK silently so the popup opens instantly
loadGoogleScript().catch(err => console.warn('[GoogleAuth] SDK preload failed:', err));

// Sync the Google profile card with any persisted auth state from a previous session
updateGoogleUI();


