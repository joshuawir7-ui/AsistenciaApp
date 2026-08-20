const fs = require('fs');
const path = 'src/main.js';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '// Dynamic layout logic for tasks and messages (Right Panel)';
const endMarker = '  } else {\n    if (tasksPanel) {\n      tasksPanel.style.display = \'none\';\n    }\n  }\n}';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex) + endMarker.length;

if (startIndex !== -1 && endIndex > startIndex) {
  const replacement = `// Dynamic layout logic for tasks and messages (Right Panel)
  const studentKey = (student.name || "").trim();
  const note = studentNotes[studentKey];
  const myCitaciones = citaciones.filter(c => (c.studentId === 'all' || c.studentName === student.name) && c.status === 'pending');
  const tasksPanel = document.getElementById('acudiente-tasks-panel');

  let htmlContent = "";

  if ((note && note.trim() !== "") || myCitaciones.length > 0) {
    if (tasksPanel) tasksPanel.style.display = 'flex';
    if (tasksContent) tasksContent.style.display = 'none';
    if (noteContent) noteContent.style.display = 'flex';

    htmlContent = '<div style="display: flex; flex-direction: column; width: 100%; height: 100%; justify-content: flex-start; align-items: center; text-align: center; gap: 15px; overflow-y: auto;">';

    if (myCitaciones.length > 0) {
      const latestCit = myCitaciones[myCitaciones.length - 1]; // Assume last added is newest
      const isReunion = latestCit.type === 'reunion';
      const badgeColor = isReunion ? 'var(--accent-teal)' : '#ef4444'; // Red for citation
      const badgeIcon = isReunion ? 
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>' : 
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" style="width: 20px; height: 20px;"><circle cx="12" cy="12" r="10" fill="#ef4444" stroke="none"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

      htmlContent += \`
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg-main);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              \${badgeIcon}
            </div>
            <div style="width: 1px; height: 35px; background: var(--border);"></div>
            <div style="text-align: left; max-width: 200px;">
              <div style="font-size: 0.95rem; font-weight: 800; color: var(--text);">
                <span style="color: var(--text);">Nueva</span> <span style="color: \${badgeColor};">\${isReunion ? 'Reunión' : 'Citación'}</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.3; margin-top: 2px;">
                <span style="font-weight: 700; color: var(--text);">\${new Date(latestCit.date).toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'long'}).replace(/^\\w/, c => c.toUpperCase())} \${latestCit.time}</span>
                <br>\${latestCit.reason || 'No se especificó el motivo'}
              </div>
            </div>
          </div>
          <button onclick="window.markCitacionAsRead('\${latestCit.id}')" style="padding: 6px 14px; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); background: white; border: 1px solid var(--border); border-radius: 8px; cursor: pointer;">OK</button>
        </div>
      \`;
    }

    if (note && note.trim() !== "") {
      const prefix = (window.teacherRole === 'profesor' ? 'Prof. ' : 'Maestro ');
      const tName = window.teacherName || 'Profesor';
      const tPhoto = window.teacherPhoto || \`https://api.dicebear.com/7.x/notionists/svg?seed=\${tName}\`;
      htmlContent += \`
        <div style="display: flex; flex-direction: column; width: 100%; padding: 16px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg-main); text-align: left;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: #cbd5e1; flex-shrink: 0;">
                <img src="\${tPhoto}" alt="Teacher" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
              <div>
                <div style="font-size: 0.65rem; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px;">Mensaje del Docente</div>
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--text);">\${prefix}\${tName}</div>
              </div>
            </div>
            <button onclick="window.markNoteAsRead('\${studentKey}')" style="padding: 6px 14px; font-size: 0.8rem; font-weight: 700; color: #fff; background: var(--accent-blue); border: none; border-radius: 8px; cursor: pointer;">Responder</button>
          </div>
          <div style="width: 100%; height: 1px; background: var(--border); margin-bottom: 12px;"></div>
          <div style="font-size: 0.85rem; color: var(--text); font-weight: 500; line-height: 1.4;">
            \${note.trim()}
          </div>
        </div>
      \`;
    }

    htmlContent += '</div>';
    if (noteContent) noteContent.innerHTML = htmlContent;

  } else {
    // Show empty state
    if (tasksPanel) tasksPanel.style.display = 'flex';
    if (tasksContent) tasksContent.style.display = 'none';
    if (noteContent) {
      noteContent.style.display = 'flex';
      noteContent.innerHTML = \`
        <div style="width: 52px; height: 52px; border-radius: 50%; background: var(--bg-main); border: 1px dashed var(--border); display: flex; align-items: center; justify-content: center; margin-bottom: 15px; color: var(--text-muted);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.65;">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
        </div>
        <div style="font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 5px;">Sin mensajes nuevos</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); max-width: 210px; line-height: 1.4; opacity: 0.8;">
          No tienes avisos, citaciones ni reuniones pendientes en este momento.
        </div>
      \`;
    }
  }
}`;

  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync(path, content);
  console.log('Successfully replaced logic.');
} else {
  console.log('Start index:', startIndex, 'End index:', endIndex);
  console.error('Could not find markers');
}
