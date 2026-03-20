import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./data/uva_prerequisites.json', 'utf-8'));
const courseCode = "CS 2100";
const prereqData = data.prerequisite_trees[courseCode];

if (prereqData) {
  console.log(`Found ${courseCode}:`, JSON.stringify(prereqData, null, 2));
} else {
  console.log(`${courseCode} not found`);
}

// Count CS courses
const csCourses = Object.keys(data.prerequisite_trees).filter(k => k.startsWith("CS "));
console.log(`\nTotal CS courses: ${csCourses.length}`);
console.log(`First 10: ${csCourses.slice(0, 10).join(', ')}`);
