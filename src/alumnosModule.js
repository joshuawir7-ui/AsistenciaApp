// alumnosModule.js
// Archivo 100% aislado para la lógica de la sección de Alumnos

export class AlumnosModule {
  constructor(getGroupsFn, onStudentClick, onCitarClick, onMensajeClick) {
    this.getGroupsFn = getGroupsFn;
    this.currentGroupFilter = 'all';
    // Default sort: A-Z by apellido (surname)
    this.currentSort = 'apellido-az';
    this.onStudentClick = onStudentClick;
    this.onCitarClick = onCitarClick;
    this.onMensajeClick = onMensajeClick;
  }

  // Generate initials avatar as inline SVG — soft pastel colors
  _getInitialsAvatar(name) {
    const parts = (name || '').trim().split(/\s+/);
    let initials = '';
    if (parts.length >= 2) {
      // First letter of first name + first letter of last name (apellido)
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      initials = parts[0].substring(0, 2).toUpperCase();
    } else {
      initials = '?';
    }

    // Soft, aesthetic pastel color combinations
    const pastelPalettes = [
      { bg: '#E0F2FE', dark: '#BAE6FD', text: '#0284C7' }, // Pastel Sky Blue
      { bg: '#EDE9FE', dark: '#DDD6FE', text: '#7C3AED' }, // Pastel Lavender
      { bg: '#DCFCE7', dark: '#BBF7D0', text: '#16A34A' }, // Pastel Soft Mint
      { bg: '#FFEDD5', dark: '#FED7AA', text: '#EA580C' }, // Pastel Soft Peach
      { bg: '#FCE7F3', dark: '#FBCFE8', text: '#DB2777' }, // Pastel Rose Pink
      { bg: '#CCFBF1', dark: '#99F6E4', text: '#0D9488' }, // Pastel Soft Teal
      { bg: '#FEF3C7', dark: '#FDE68A', text: '#D97706' }, // Pastel Soft Yellow
      { bg: '#F3E8FF', dark: '#E9D5FF', text: '#9333EA' }, // Pastel Soft Lilac
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash += (name || '').charCodeAt(i);
    const palette = pastelPalettes[hash % pastelPalettes.length];

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52" class="alumnos-module-avatar" aria-label="${name}">
        <defs>
          <linearGradient id="ag${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${palette.bg};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${palette.dark};stop-opacity:1" />
          </linearGradient>
        </defs>
        <circle cx="26" cy="26" r="26" fill="url(#ag${hash})"/>
        <text x="26" y="26" text-anchor="middle" dominant-baseline="central"
          font-family="system-ui,-apple-system,sans-serif" font-size="18" font-weight="800"
          fill="${palette.text}" letter-spacing="0.5">${initials}</text>
      </svg>
    `;
  }

  // Extract surname for A-Z sorting by apellido
  _getSurname(name) {
    const parts = (name || '').trim().split(/\s+/);
    // Assuming "Nombre Apellido" or "Nombre Apellido1 Apellido2"
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : (parts[0] || '').toLowerCase();
  }

  _sortData(data) {
    switch (this.currentSort) {
      case 'apellido-az':
        return [...data].sort((a, b) => this._getSurname(a.name).localeCompare(this._getSurname(b.name), 'es'));
      case 'nombre-az':
        return [...data].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'es'));
      case 'asistencia-desc':
        return [...data].sort((a, b) => b.stats.percent - a.stats.percent);
      case 'riesgo':
        return [...data].sort((a, b) => (b.stats.isCritical ? 1 : 0) - (a.stats.isCritical ? 1 : 0));
      default:
        return data;
    }
  }

  _sortLabel(key) {
    const labels = {
      'apellido-az': 'Apellido A–Z',
      'nombre-az': 'Nombre A–Z',
      'asistencia-desc': 'Mayor asistencia',
      'riesgo': 'En riesgo primero',
    };
    return labels[key] || key;
  }

  render(containerId, filterContainerId, searchInputId) {
    const grid = document.getElementById(containerId);
    const filterContainer = document.getElementById(filterContainerId);
    const searchInput = document.getElementById(searchInputId);

    if (!grid || !filterContainer) return;

    const currentGroups = this.getGroupsFn();

    // 1. Render Group Filters + Sort Controls
    const sortOptions = ['apellido-az', 'nombre-az', 'asistencia-desc', 'riesgo'];
    const sortIcons = {
      'apellido-az': `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M7 12h10M11 18h2"/></svg>`,
      'nombre-az': `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 6h16M4 12h10M4 18h6"/></svg>`,
      'asistencia-desc': `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      'riesgo': `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    };

    filterContainer.innerHTML =
      // Group tabs row
      `<div class="alumnos-module-tabs-row">
        <span class="alumnos-module-tab ${this.currentGroupFilter === 'all' ? 'active' : ''}" data-group-id="all">Todos mis Alumnos</span>` +
      currentGroups.map(g =>
        `<span class="alumnos-module-tab ${this.currentGroupFilter === g.id ? 'active' : ''}" data-group-id="${g.id}">${g.name}</span>`
      ).join('') +
      `</div>` +
      // Sort bar row
      `<div class="alumnos-sort-bar">
        <span class="alumnos-sort-label">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Orden:
        </span>` +
      sortOptions.map(key =>
        `<button class="alumnos-sort-btn ${this.currentSort === key ? 'active' : ''}" data-sort="${key}">
          ${sortIcons[key]}
          ${this._sortLabel(key)}
          ${this.currentSort === key
            ? `<svg class="sort-active-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
            : ''}
        </button>`
      ).join('') +
      `</div>`;

    // Group tab click handlers
    filterContainer.querySelectorAll('.alumnos-module-tab').forEach(tab => {
      tab.onclick = () => {
        this.currentGroupFilter = tab.dataset.groupId;
        if (tab.dataset.groupId !== 'all') {
          const gIdx = currentGroups.findIndex(g => g.id === tab.dataset.groupId);
          if (gIdx !== -1 && window.updateHeaderGroupBadge) {
            localStorage.setItem('asistencia_active_group_idx', gIdx);
            window.updateHeaderGroupBadge(currentGroups[gIdx].name);
          }
        } else if (window.updateHeaderGroupBadge) {
          window.updateHeaderGroupBadge('');
        }
        this.render(containerId, filterContainerId, searchInputId);
      };
    });

    // Sort button click handlers
    filterContainer.querySelectorAll('.alumnos-sort-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.currentSort = btn.dataset.sort;
        this.render(containerId, filterContainerId, searchInputId);
      };
    });

    // 2. Data Processing & Stats Calculation
    let displayData = [];
    const targetGroups = this.currentGroupFilter === 'all' ? currentGroups : currentGroups.filter(g => g.id === this.currentGroupFilter);

    targetGroups.forEach(g => {
      g.students.forEach(s => {
        let p = 0, l = 0, a = 0, t = 0;
        if (s.history) {
          Object.values(s.history).forEach(monthEntries => {
            if (Array.isArray(monthEntries)) {
              monthEntries.forEach(status => {
                if (status === 'present') p++;
                else if (status === 'late') l++;
                else if (status === 'absent') a++;
                if (status !== 'empty') t++;
              });
            } else if (monthEntries && typeof monthEntries === 'object') {
              Object.values(monthEntries).forEach(status => {
                if (status === 'present') p++;
                else if (status === 'late') l++;
                else if (status === 'absent') a++;
                if (status !== 'empty') t++;
              });
            }
          });
        }

        const percent = t > 0 ? Math.round((p / t) * 100) : 0;
        const isCritical = (t > 5 && percent < 75) || (s.diseases && s.diseases !== 'Ninguna');

        displayData.push({
          ...s,
          groupName: g.name,
          stats: { p, l, a, t, percent, isCritical }
        });
      });
    });

    // 3. Filtering by search
    const searchTerm = (searchInput?.value || "").toLowerCase();
    let filtered = displayData.filter(s =>
      s.name.toLowerCase().includes(searchTerm) ||
      s.groupName.toLowerCase().includes(searchTerm) ||
      (s.stats.isCritical && searchTerm.includes('riesgo'))
    );

    // 4. Sort
    filtered = this._sortData(filtered);

    // 5. Render Cards
    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 60px; text-align: center; color: var(--muted); font-weight: 600;">No hay alumnos encontrados.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(s => {
      const statusClass = s.stats.isCritical ? 'warning' : 'on-track';
      const statusText = s.stats.isCritical ? 'Riesgo' : 'Al Día';

      return `
        <div class="alumnos-module-card" data-student-name="${s.name}">
          <div class="alumnos-module-card-top">
            <div class="alumnos-module-avatar-wrap">
              ${this._getInitialsAvatar(s.name)}
            </div>
            <div class="alumnos-module-badge ${statusClass}">${statusText}</div>
          </div>
          <div class="alumnos-module-card-mid">
            <h3 class="alumnos-module-student-name">${s.name}</h3>
            <span class="alumnos-module-student-group">${s.groupName}</span>
          </div>
          <div class="alumnos-module-card-bottom">
            <div class="alumnos-module-attendance-info">
              <span>Asistencia</span>
              <span style="color: var(--text);">${s.stats.percent}%</span>
            </div>
            <div class="alumnos-module-bar-wrap">
              <div class="alumnos-module-bar-fill" style="width: ${s.stats.percent}%; background: ${s.stats.percent < 75 ? '#ef4444' : 'var(--accent-teal)'};"></div>
            </div>

            <div class="alumnos-module-actions">
              <button class="alumnos-module-btn" data-action="mensaje" data-student="${s.name}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Mensaje
              </button>
              <button class="alumnos-module-btn" data-action="citar" data-student="${s.name}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Citar
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 6. Centralized Event Delegation & Interaction
    let touchTimer = null;
    let isLongPress = false;

    grid.oncontextmenu = (e) => {
      const card = e.target.closest('.alumnos-module-card');
      if (card) {
        e.preventDefault();
        e.stopPropagation();
        this.promptDeleteStudent(card.dataset.studentName, containerId, filterContainerId, searchInputId);
      }
    };

    grid.ontouchstart = (e) => {
      const card = e.target.closest('.alumnos-module-card');
      if (!card) return;
      isLongPress = false;
      if (touchTimer) clearTimeout(touchTimer);
      touchTimer = setTimeout(() => {
        isLongPress = true;
        if (navigator.vibrate) navigator.vibrate(40);
        this.promptDeleteStudent(card.dataset.studentName, containerId, filterContainerId, searchInputId);
      }, 500);
    };

    grid.ontouchend = (e) => {
      if (touchTimer) clearTimeout(touchTimer);
      if (isLongPress) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    grid.ontouchmove = () => {
      if (touchTimer) clearTimeout(touchTimer);
    };

    grid.onclick = (e) => {
      if (isLongPress) {
        isLongPress = false;
        return;
      }

      const btn = e.target.closest('.alumnos-module-btn');
      if (btn) {
        e.stopPropagation();
        const action = btn.dataset.action;
        const student = btn.dataset.student;

        if (action === 'citar' && window.openCitacionForStudent) {
          window.openCitacionForStudent(student);
        } else if (action === 'mensaje' && window.openNoteForStudent) {
          window.openNoteForStudent(student);
        }
        return;
      }

      const card = e.target.closest('.alumnos-module-card');
      if (card && window.openStudentProfileV6) {
        window.openStudentProfileV6(card.dataset.studentName);
      }
    };
  }

  promptDeleteStudent(studentName, containerId, filterContainerId, searchInputId) {
    const title = '¿Eliminar estudiante?';
    const msg = `¿Estás seguro de que deseas eliminar a ${studentName} de la lista de alumnos?`;

    if (typeof window.showConfirm === 'function') {
      window.showConfirm(title, msg, () => {
        const groups = this.getGroupsFn();
        let wasDeleted = false;

        groups.forEach(g => {
          if (g.students) {
            const initialLen = g.students.length;
            g.students = g.students.filter(s => s.name !== studentName);
            if (g.students.length < initialLen) wasDeleted = true;
          }
        });

        if (wasDeleted) {
          localStorage.setItem('asistencia_groups', JSON.stringify(groups));
          if (typeof window.showNotif === 'function') {
            window.showNotif('Estudiante eliminado', `El estudiante ${studentName} ha sido eliminado.`, 'success');
          }
          if (typeof window.renderTable === 'function') {
            window.renderTable();
          }
          this.render(containerId, filterContainerId, searchInputId);
        }
      });
    }
  }
}
