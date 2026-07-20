const fs = require('fs');
let sql = 'DELETE FROM courses WHERE id LIKE \'zimsec-%\';\nINSERT INTO courses (id, title, board, level, syllabus_code, subject_category, status, icon, color) VALUES\n';

const primarySubjects = [
  ['english', 'English', 'Languages', 'BookOpen', 'bg-blue-500'],
  ['math', 'Mathematics', 'Mathematics', 'Calculator', 'bg-red-500'],
  ['shona', 'Shona', 'Languages', 'BookOpen', 'bg-blue-600'],
  ['ndebele', 'Ndebele', 'Languages', 'BookOpen', 'bg-blue-600'],
  ['agriculture', 'Agriculture', 'Sciences', 'Sprout', 'bg-green-600'],
  ['scitech', 'Science and Technology', 'Sciences', 'FlaskConical', 'bg-green-500'],
  ['heritage', 'Heritage - Social Studies', 'Humanities', 'Landmark', 'bg-amber-600'],
  ['fareme', 'FAREME', 'Humanities', 'Users', 'bg-orange-500']
];

const secondarySubjects = [
  ['math', 'Mathematics', 'Mathematics', 'Calculator', 'bg-red-500', '4004'],
  ['eng', 'English Language', 'Languages', 'BookOpen', 'bg-blue-500', '1122'],
  ['combsci', 'Combined Science', 'Sciences', 'FlaskConical', 'bg-green-500', '4003'],
  ['hist', 'History', 'Humanities', 'Landmark', 'bg-amber-500', '2167'],
  ['geo', 'Geography', 'Humanities', 'Globe', 'bg-teal-500', '2248'],
  ['shona', 'Shona', 'Languages', 'Book', 'bg-indigo-500', '3159'],
  ['ndebele', 'Ndebele', 'Languages', 'Book', 'bg-indigo-500', '3167'],
  ['acc', 'Principles of Accounting', 'Humanities', 'Calculator', 'bg-slate-500', '7112'],
  ['com', 'Commerce', 'Humanities', 'Briefcase', 'bg-purple-500', '7103'],
  ['bio', 'Biology', 'Sciences', 'Dna', 'bg-green-600', '4005'],
  ['phy', 'Physics', 'Sciences', 'Zap', 'bg-yellow-500', '4006'],
  ['chem', 'Chemistry', 'Sciences', 'FlaskConical', 'bg-emerald-500', '4007'],
  ['cs', 'Computer Science', 'Technology', 'Monitor', 'bg-cyan-500', '4021'],
  ['agri', 'Agriculture', 'Sciences', 'Sprout', 'bg-lime-600', '5034']
];

const advancedSubjects = [
  ['math', 'Pure Mathematics', 'Mathematics', 'Calculator', 'bg-red-500', '6042'],
  ['stat', 'Statistics', 'Mathematics', 'LineChart', 'bg-red-600', '6043'],
  ['bio', 'Biology', 'Sciences', 'Dna', 'bg-green-500', '6030'],
  ['chem', 'Chemistry', 'Sciences', 'FlaskConical', 'bg-emerald-500', '6032'],
  ['phy', 'Physics', 'Sciences', 'Zap', 'bg-yellow-500', '6031'],
  ['acc', 'Accounting', 'Humanities', 'Calculator', 'bg-slate-500', '6001'],
  ['bus', 'Business Enterprise', 'Humanities', 'Briefcase', 'bg-purple-500', '6004'],
  ['eco', 'Economics', 'Humanities', 'LineChart', 'bg-purple-600', '6008'],
  ['geo', 'Geography', 'Humanities', 'Globe', 'bg-teal-500', '6016'],
  ['hist', 'History', 'Humanities', 'Landmark', 'bg-amber-500', '6021'],
  ['cs', 'Computer Science', 'Technology', 'Monitor', 'bg-cyan-500', '6023'],
  ['lit', 'Literature in English', 'Languages', 'Book', 'bg-indigo-500', '6015'],
  ['shona', 'Shona', 'Languages', 'BookOpen', 'bg-blue-600', '6011'],
  ['ndebele', 'Ndebele', 'Languages', 'BookOpen', 'bg-blue-600', '6012']
];

let values = [];

for (let i = 1; i <= 7; i++) {
  primarySubjects.forEach(s => {
    values.push(`('zimsec-g${i}-${s[0]}', 'Grade ${i} ${s[1]}', 'ZIMSEC', 'Grade ${i}', 'N/A', '${s[2]}', 'active', '${s[3]}', '${s[4]}')`);
  });
}

for (let i = 1; i <= 4; i++) {
  secondarySubjects.forEach(s => {
    let syl = i >= 3 ? s[5] : 'N/A'; // Syllabus codes usually apply to O-Level (Forms 3-4)
    values.push(`('zimsec-f${i}-${s[0]}', 'Form ${i} ${s[1]}', 'ZIMSEC', 'Form ${i}', '${syl}', '${s[2]}', 'active', '${s[3]}', '${s[4]}')`);
  });
}

for (let i = 5; i <= 6; i++) {
  advancedSubjects.forEach(s => {
    values.push(`('zimsec-f${i}-${s[0]}', 'Form ${i} ${s[1]}', 'ZIMSEC', 'Form ${i}', '${s[5]}', '${s[2]}', 'active', '${s[3]}', '${s[4]}')`);
  });
}

sql += values.join(',\n') + ';';
fs.writeFileSync('zimsec_seed.sql', sql);
console.log('Generated zimsec_seed.sql');
