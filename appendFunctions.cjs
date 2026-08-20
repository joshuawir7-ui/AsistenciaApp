const fs = require('fs');
const path = 'src/main.js';
let content = fs.readFileSync(path, 'utf8');

const functionsToAdd = `
// Action for marking citation as read
window.markCitacionAsRead = function(citationId) {
  const index = citaciones.findIndex(c => c.id === citationId);
  if (index > -1) {
    citaciones[index].status = 'resolved'; // Or delete it: citaciones.splice(index, 1);
    saveToLocal();
    if (window.showNotif) window.showNotif('Citación Leída', 'La citación ha sido marcada como leída.');
    
    // Refresh UI
    const activeStudentName = document.getElementById('student-select').value;
    const student = students.find(s => s.name === activeStudentName);
    if (student) renderGuardianScorecards(student);
  }
};

// Action for marking note as read
window.markNoteAsRead = function(studentKey) {
  delete studentNotes[studentKey];
  saveToLocal();
  if (window.showNotif) window.showNotif('Mensaje Leído', 'El mensaje ha sido marcado como leído.');
  
  // Refresh UI
  const activeStudentName = document.getElementById('student-select').value;
  const student = students.find(s => s.name === activeStudentName);
  if (student) renderGuardianScorecards(student);
};
`;

if (!content.includes('window.markCitacionAsRead')) {
  content += functionsToAdd;
  fs.writeFileSync(path, content);
  console.log('Functions added successfully.');
} else {
  console.log('Functions already exist.');
}
