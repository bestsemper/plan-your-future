// background.js

const TCF_BASE_URL = "https://thecourseforum.com";

// In-memory cache for the service worker lifetime
// We also use chrome.storage.local for persistence across SW restarts
let subdepartmentsCache = null;

// Initialize subdepartments
async function getSubdepartmentId(mnemonic) {
  if (!subdepartmentsCache) {
    const storageData = await chrome.storage.local.get("subdepartments");
    if (storageData.subdepartments) {
      subdepartmentsCache = storageData.subdepartments;
    } else {
      console.log("Fetching subdepartments from TCF...");
      try {
        const response = await fetch(`${TCF_BASE_URL}/api/subdepartments/`);
        const data = await response.json();
        const results = Array.isArray(data) ? data : (data.results || []);
        
        subdepartmentsCache = {};
        results.forEach(sub => {
          if (sub.mnemonic && sub.id) {
            subdepartmentsCache[sub.mnemonic.toUpperCase()] = sub.id;
          }
        });
        
        await chrome.storage.local.set({ subdepartments: subdepartmentsCache });
      } catch (err) {
        console.error("Failed to fetch subdepartments:", err);
        return null; // Fail gracefully
      }
    }
  }
  return subdepartmentsCache[mnemonic.toUpperCase()];
}

// Fetch course data
async function getCourseData(mnemonic, number) {
  console.log(`TCF Background: Request received for ${mnemonic} ${number}`);
  const subdeptId = await getSubdepartmentId(mnemonic);
  if (!subdeptId) {
    console.warn(`TCF Background: Could not find subdepartment ID for ${mnemonic}`);
    return null;
  }

  const storageKey = `courses_${subdeptId}`;
  
  // Try getting from storage
  let coursesMap = (await chrome.storage.local.get(storageKey))[storageKey];
  
  // If not in storage, fetch from API
  if (!coursesMap) {
    console.log(`TCF Background: Fetching courses for subdept ${subdeptId} from API...`);
    try {
      const endpoint = `${TCF_BASE_URL}/api/courses/?subdepartment=${subdeptId}&simplestats&page_size=500`;
      const response = await fetch(endpoint);
      const data = await response.json();
      
      coursesMap = {};
      const results = Array.isArray(data) ? data : (data.results || []);
      
      results.forEach(course => {
        if (course.number) {
          coursesMap[course.number] = course;
        }
      });
      
      // Save to storage
      await chrome.storage.local.set({ [storageKey]: coursesMap });
    } catch (err) {
      console.error(`Failed to fetch courses for ${mnemonic}:`, err);
      return null;
    }
  }

  return coursesMap[parseInt(number)];
}

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_COURSE") {
    getCourseData(request.mnemonic, request.number).then((data) => {
      sendResponse({ data: data });
    });
    return true; // Indicates async response
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Plan Your Future - TCF Overlay Extension Installed");
  // Pre-load subdepartments on install
  getSubdepartmentId("CS"); 
});
