const fs = require('fs');

// Define the extraction function
function extractCoursesFromCoreq(prereqObj) {
  if (!prereqObj) return [];
  
  let coreqs = [];
  
  // Recursively search for COREQ nodes in the tree
  function findCoreqs(node) {
    if (!node) return;
    
    if (node.type === 'COREQ' && node.children) {
      // Extract courses from inside the COREQ
      node.children.forEach((child) => {
        if (child.type === 'course') {
          coreqs.push(child.code);
        } else if (child.type === 'OR' || child.type === 'AND') {
          // Recursively extract from OR/AND inside COREQ
          extractFromLogical(child);
        }
      });
    } else if (node.type === 'AND' || node.type === 'OR') {
      // Search children for COREQ nodes
      node.children?.forEach((child) => {
        findCoreqs(child);
      });
    }
  }
  
  function extractFromLogical(node) {
    if (!node || !node.children) return;
    node.children.forEach((child) => {
      if (child.type === 'course') {
        coreqs.push(child.code);
      } else if (child.type === 'OR' || child.type === 'AND') {
        extractFromLogical(child);
      }
    });
  }
  
  findCoreqs(prereqObj);
  return coreqs;
}

// Test with PHYS 2419
const data = JSON.parse(fs.readFileSync('data/uva_prerequisites.json', 'utf-8'));
const phys2419 = data.prerequisite_trees['PHYS 2419'];
const coreqs = extractCoursesFromCoreq(phys2419);
console.log('PHYS 2419 coreqs:', coreqs);

// Also test PHYS 2410 to see if it has coreqs back to 2419
const phys2410 = data.prerequisite_trees['PHYS 2410'];
if (phys2410) {
  const coreqs2410 = extractCoursesFromCoreq(phys2410);
  console.log('PHYS 2410 coreqs:', coreqs2410);
} else {
  console.log('PHYS 2410 not found in prerequisite_trees');
}
