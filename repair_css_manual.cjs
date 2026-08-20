const fs = require('fs');
const path = 'src/style.css';
let lines = fs.readFileSync(path, 'utf8').split('\n');

// Find the line that starts with `#modal-add-citacion .modal-body-content > div:nth-child(4) {`
let splitIdx = lines.length;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('#modal-add-citacion .modal-body-content > div:nth-child(4) {')) {
    splitIdx = i + 3; // Keep the `grid-column: 2` and `}` inside it
    break;
  }
}

const newLines = `  #modal-add-citacion .modal-body-content > div:nth-child(5) {
    grid-column: 1 / span 2 !important; /* Buttons spans full width at the bottom */
    margin-top: 12px !important;
  }

  /* Redefine Add Task form container as a 2-column grid */
  #modal-add-tarea .modal-body-content {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 20px 24px !important;
    max-width: 100% !important;
    width: 100% !important;
    padding: 32px 40px !important;
  }

  #modal-add-tarea .modal-body-content > div:nth-child(1) {
    grid-column: 1 !important; /* Título de la tarea */
  }
  #modal-add-tarea .modal-body-content > div:nth-child(2) {
    grid-column: 2 !important; /* Materia */
  }
  #modal-add-tarea .modal-body-content > div:nth-child(3) {
    grid-column: 1 / span 2 !important; /* Date/Points row spans full width */
  }
  #modal-add-tarea .modal-body-content > div:nth-child(4) {
    grid-column: 1 / span 2 !important; /* Buttons spans full width at the bottom */
    margin-top: 12px !important;
  }
}

/* --- HORIZONTAL LAYOUT FOR GESTIONAR DÍAS MODAL --- */
#days-checkbox-group {
  display: grid !important;
  grid-template-columns: repeat(2, 1fr) !important;
  gap: 12px !important;
  width: 100% !important;
  max-width: 100% !important;
  padding: 0 !important;
}

.premium-checkbox-row {
  display: flex !important;
  align-items: center !important;
  background: var(--card-bg, rgba(255, 255, 255, 0.03)) !important;
  border: 1px solid var(--border) !important;
  border-radius: 16px !important;
  padding: 12px 16px !important;
  cursor: pointer !important;
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
  width: 100% !important;
  box-sizing: border-box !important;
  user-select: none !important;
}

.premium-checkbox-row:hover {
  background: rgba(20, 184, 166, 0.08) !important;
  border-color: var(--accent-teal) !important;
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 16px rgba(20, 184, 166, 0.15) !important;
}

[data-theme='light'] .premium-checkbox-row {
  background: rgba(0, 0, 0, 0.02) !important;
}

@media (min-width: 769px) {
  #modal-manage-days .premium-modal {
    max-width: 820px !important;
    width: 95% !important;
  }

  #modal-manage-days .modal-premium-main-grid {
    flex-direction: row !important;
    align-items: center !important;
    gap: 32px !important;
    padding: 32px 40px !important;
  }

  #modal-manage-days .modal-premium-left-col {
    width: 45% !important;
    border-bottom: none !important;
    border-right: 1px solid var(--border) !important;
    padding-bottom: 0 !important;
    padding-right: 32px !important;
    align-items: flex-start !important;
    text-align: left !important;
  }

  #modal-manage-days .modal-premium-header {
    align-items: flex-start !important;
    text-align: left !important;
  }

  #modal-manage-days .modal-premium-title,
  #modal-manage-days .modal-premium-title h3,
  #modal-manage-days .modal-premium-title p,
  #modal-manage-days .modal-premium-description {
    text-align: left !important;
  }

  #modal-manage-days .modal-body-content {
    width: 55% !important;
  }

  #days-checkbox-group {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 14px !important;
  }
}

@media (max-width: 768px) {
  #days-checkbox-group {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 10px !important;
  }
}

.hide-on-mobile { display: block; }
@media (max-width: 600px) {
  .hide-on-mobile { display: none !important; }
}

/* Premium Chart Panel Shadow and Radius Override */
[data-theme="light"] .panel.chart-panel-premium,
[data-theme="light"] .chart-panel-premium {
  border-radius: 24px !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15) !important;
  border: none !important;
  transition: transform 0.3s ease, box-shadow 0.3s ease !important;
  padding: 24px !important;
  background: var(--surface) !important;
}

[data-theme='dark'] .panel.chart-panel-premium,
[data-theme='dark'] .chart-panel-premium {
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}
`;

const finalLines = lines.slice(0, splitIdx).join('\n') + '\n' + newLines;
fs.writeFileSync(path, finalLines, 'utf8');
console.log('Fixed CSS successfully.');
