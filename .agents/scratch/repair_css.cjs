const fs = require('fs');
const path = 'src/style.css';
let content = fs.readFileSync(path, 'utf8');

// The wreckage starts around line 6800.
// Let's find a safe point to cut.
const safeCut = content.indexOf('.v6-info-card label {');
if (safeCut === -1) {
    console.error('Safe cut point not found!');
    process.exit(1);
}

const header = content.substring(0, safeCut);

const newTail = `.v6-info-card label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.v6-val-big {
  font-size: 2rem;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 15px;
}

.v6-progress-track {
  height: 8px;
  background: var(--surface);
  border-radius: 10px;
  overflow: hidden;
}

.v6-progress-thumb {
  height: 100%;
  background: #3b82f6;
  width: 0%;
  transition: width 1s ease;
}

/* Medical List */
.v6-list-stack {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.v6-list-item {
  display: flex;
  gap: 20px;
  padding: 20px;
  background: var(--surface);
  border-radius: 20px;
  align-items: center;
}

.v6-list-icon {
  width: 50px;
  height: 50px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.v6-list-icon.medical { background: #fee2e2; color: #ef4444; }
.v6-list-icon.allergies { background: #fef3c7; color: #f59e0b; }

.v6-list-content label {
  font-size: 0.75rem;
  font-weight: 800;
  color: #64748b;
}

.v6-list-content p {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

/* Guardian Hero */
.v6-guardian-hero {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  padding: 30px;
  border-radius: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  color: #fff;
  margin-bottom: 30px;
}

.v6-g-avatar {
  width: 60px;
  height: 60px;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.2rem;
}

.v6-g-info h4 { font-size: 1.2rem; margin-bottom: 4px; }
.v6-g-info p { opacity: 0.8; font-size: 0.9rem; }

.v6-btn-wa {
  width: 100%;
  padding: 18px;
  background: #25d366;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.v6-btn-wa:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 25px rgba(37, 211, 102, 0.3);
}

/* Theme Dark OLED */
[data-theme="dark"] .profile-v6-card { background: var(--surface); color: var(--text); }
[data-theme="dark"] .v6-aside { background: #000000; border-color: var(--border); }
[data-theme="dark"] .v6-main { background: var(--surface); }
[data-theme="dark"] .v6-aside-header h2 { color: var(--text); }
[data-theme="dark"] .v6-mini-stat { background: var(--surface); border-color: var(--border); }
[data-theme="dark"] .v6-info-card { background: var(--surface); border-color: var(--border); }
[data-theme="dark"] .v6-val-big { color: var(--text); }
[data-theme="dark"] .v6-list-item { background: #000000; }
[data-theme="dark"] .v6-pane-title { color: var(--text); }

/* Mobile */
@media (max-width: 850px) {
  .profile-v6-card { flex-direction: column; height: 95vh; }
  .v6-aside { width: 100%; height: auto; padding: 20px; border-right: none; border-bottom: 1px solid var(--border); }
  .v6-aside-stats { margin-bottom: 15px; }
  .v6-aside-nav {
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    gap: 10px;
    padding-bottom: 10px;
  }
  .v6-nav-item {
    white-space: nowrap;
    padding: 10px 15px;
  }
}

/* FORCE GLOBAL BACKGROUNDS FIX */
body, 
main, 
.app-layout, 
.screen {
  background: var(--bg) !important;
}
`;

fs.writeFileSync(path, header + newTail);
console.log('File repaired successfully!');
