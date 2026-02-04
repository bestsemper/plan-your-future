// content.js

console.log("Plan Your Future - TCF Overlay: Content script loaded.");

// 3. Scan and overlay
async function scanAndOverlay() {

  // Simple regex for "CS 1010" or "CS1010"
  // Mnemonic: 2-4 letters, space optional, 4 digits
  const regex = /\b([A-Z]{2,4})\s?(\d{4})\b/g;

  // We want to find text nodes to avoid messing up HTML attributes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  const nodesToProcess = [];
  while (node = walker.nextNode()) {
    // Filter out script/style tags just in case
    if (node.parentElement && ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(node.parentElement.tagName)) {
      continue;
    }
    // Skip the specific Stellic sidebar code element so the specialized handler can take it
    if (node.parentElement && node.parentElement.getAttribute("data-testid") === "course-sidebar-code") {
      continue;
    }

    if (node.textContent.match(regex)) {
      nodesToProcess.push(node);
    }
  }

  // Iterate and process
  for (const textNode of nodesToProcess) {
    const text = textNode.textContent;
    let match;
    let newHtml = text;
    let hasMatch = false;
    
    // We can't easily replace multiple matches in one text node with HTML links without splitting the node
    // or replacing the parent's innerHTML (risky).
    // For safety, let's just create a wrapper if it's a clean match, or simple span replacement if parent allows.
    
    // Simpler approach: replace textual content in parent with specific spans we can hydrate later?
    // Or just look for specific known elements if this was a specific site.
    // For a generic overlay, this is hard.
    
    // Let's assume we are mostly looking for dedicated course code elements.
    // I'll skip complex text replacement for this MVP and just try to find elements that *are* the course code.
    // OR, I can use the tool tip approach: wrap matches in a <span class="tcf-match"> and attach events.
    
    // Let's try wrapping matches in parent's innerHTML. WARNING: resets event listeners on siblings.
    // Safe way: split text node.
    
    // Reset regex state
    regex.lastIndex = 0;
    
    const matches = [...text.matchAll(regex)];
    if (matches.length === 0) continue;

    const parent = textNode.parentNode;
    // skip if already processed
    if (parent.classList.contains("tcf-processed")) continue;
    
    // We will replace the text node with a fragment
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    
    for (const m of matches) {
      const mnemonic = m[1].toUpperCase();
      const number = m[2];
      const fullMatch = m[0];
      const matchIndex = m.index;
      
      // Text before match
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
      
      // The match element
      const span = document.createElement("span");
      span.textContent = fullMatch;
      span.className = "tcf-course-link";
      span.style.borderBottom = "2px dashed #e57200"; // UVA Orange
      span.style.cursor = "pointer";
      span.dataset.mnemonic = mnemonic;
      span.dataset.number = number;
      
      // Add click/hover listener to show overlay
      span.addEventListener("mouseenter", (e) => showOverlay(e, mnemonic, number));
      span.addEventListener("mouseleave", handleMouseLeave);
      
      fragment.appendChild(span);
      
      lastIndex = matchIndex + fullMatch.length;
    }
    
    // Remaining text
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    
    parent.replaceChild(fragment, textNode);
    parent.classList.add("tcf-processed");
  }
}

let tooltip = null;
let activeTrigger = null;

function createTooltip() {
  if (tooltip) return;
  tooltip = document.createElement("div");
  tooltip.id = "tcf-tooltip";
  tooltip.style.position = "absolute";
  tooltip.style.backgroundColor = "white";
  tooltip.style.border = "1px solid #ccc";
  tooltip.style.padding = "10px";
  tooltip.style.borderRadius = "4px";
  tooltip.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
  tooltip.style.zIndex = "10000";
  tooltip.style.display = "none";
  tooltip.style.maxWidth = "300px";
  tooltip.style.fontSize = "14px";
  tooltip.style.color = "#333";
  
  // Close when leaving tooltip, unless moving back to trigger
  tooltip.addEventListener("mouseleave", (e) => {
    if (activeTrigger && e.relatedTarget && (activeTrigger === e.relatedTarget || activeTrigger.contains(e.relatedTarget))) {
      return;
    }
    hideOverlay();
  });

  document.body.appendChild(tooltip);
}

// Request Data from Background Script
async function showOverlay(event, mnemonic, number) {
  activeTrigger = event.currentTarget;
  createTooltip();
  
  const rect = event.target.getBoundingClientRect();
  tooltip.style.left = `${window.scrollX + rect.left}px`;
  // Remove gap so mouse can transition instantly
  tooltip.style.top = `${window.scrollY + rect.bottom}px`;
  tooltip.style.display = "block";
  tooltip.innerHTML = `Loading data for ${mnemonic} ${number}...`;
  
  // Use Message Passing to Background Script
  chrome.runtime.sendMessage(
    { action: "GET_COURSE", mnemonic: mnemonic, number: number },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        tooltip.innerHTML = "Error connecting to extension.";
        return;
      }
      
      if (response && response.data) {
        const course = response.data;
        const rating = course.average_rating ? course.average_rating.toFixed(2) : "N/A";
        const gpa = course.average_gpa ? course.average_gpa.toFixed(2) : "N/A";
        const difficulty = course.average_difficulty ? course.average_difficulty.toFixed(2) : "N/A";
        
        tooltip.innerHTML = `
          <strong>${course.title}</strong><br/>
          <hr style="margin: 5px 0"/>
          Rating: ${rating} / 5.00<br/>
          GPA: ${gpa}<br/>
          Difficulty: ${difficulty} / 5.00<br/>
          <a href="https://thecourseforum.com/course/${mnemonic}/${number}" target="_blank" style="color: #007bc2">View on theCourseForum</a>
        `;
      } else {
        tooltip.innerHTML = `Course ${mnemonic} ${number} not found or error loading.`;
      }
    }
  );
}

function handleMouseLeave(event) {
  // Check if moving to tooltip
  if (tooltip && event.relatedTarget && (tooltip === event.relatedTarget || tooltip.contains(event.relatedTarget))) {
    return;
  }
  hideOverlay();
}

function hideOverlay() {
  if (tooltip) {
    tooltip.style.display = "none";
  }
}


// Helper to handle Stellic's sidebar specifically
function handleStellicSidebar() {
  // console.log("TCF Extension: handleStellicSidebar checking...");
  
  // Try finding via ID first
  let sidebarCodeEl = document.getElementById("course-sidebar-container")?.querySelector('[data-testid="course-sidebar-code"]');
  
  if (!sidebarCodeEl) {
    // Fallback: try finding via class or just querySelector globally if ID is dynamic
    sidebarCodeEl = document.querySelector('[data-testid="course-sidebar-code"]');
  }

  if (!sidebarCodeEl) {
    // console.log("TCF Extension: Sidebar element [data-testid='course-sidebar-code'] not found in DOM.");
    return;
  }
  
  if (sidebarCodeEl.classList.contains("tcf-processed")) {
    return;
  }

  console.log("TCF Extension: Found Stellic sidebar course element!", sidebarCodeEl.textContent);
  sidebarCodeEl.classList.add("tcf-processed");

  const text = sidebarCodeEl.textContent.trim();
  const match = text.match(/([A-Z]{2,4})\s?(\d{4})/);
  if (!match) {
    console.log("TCF Extension: Course code regex did not match text:", text);
    return;
  }

  const mnemonic = match[1];
  const number = match[2];

  // Create a badge/button
  const container = document.createElement("div");
  container.className = "tcf-stellic-badge";
  container.style.display = "inline-flex";
  container.style.alignItems = "center";
  container.style.marginLeft = "12px";
  container.style.padding = "4px 8px";
  container.style.backgroundColor = "#fff";
  container.style.border = "1px solid #e57200";
  container.style.borderRadius = "4px";
  container.style.cursor = "pointer";
  container.style.fontSize = "12px";
  
  container.innerHTML = `
    <span style="color: #e57200; font-weight: bold; margin-right: 5px;">TCF</span>
    <span id="tcf-stellic-rating">Loading...</span>
  `;

  sidebarCodeEl.parentNode.insertBefore(container, sidebarCodeEl.nextSibling);

  // Fetch data
  console.log(`TCF Extension: Sending message to background for ${mnemonic} ${number}`);
  chrome.runtime.sendMessage(
    { action: "GET_COURSE", mnemonic: mnemonic, number: number },
    (response) => {
      console.log("TCF Extension: Received response from background:", response);
      const ratingSpan = container.querySelector("#tcf-stellic-rating");
      
      if (chrome.runtime.lastError) {
        console.error("TCF Extension: Runtime error:", chrome.runtime.lastError);
        ratingSpan.textContent = "Err";
        return;
      }

      if (!response || !response.data) {
        console.warn("TCF Extension: No data in response.");
        ratingSpan.textContent = "N/A";
        return;
      }
      
      const course = response.data;
      const rating = course.average_rating ? course.average_rating.toFixed(2) : "N/A";
      ratingSpan.textContent = `${rating} / 5`;
      
      container.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(`https://thecourseforum.com/course/${mnemonic}/${number}`, "_blank");
      });
      // Also setup tooltip
      container.addEventListener("mouseenter", (e) => showOverlay(e, mnemonic, number));
      container.addEventListener("mouseleave", handleMouseLeave);
    }
  );
}

// Run scan periodically (mutation observer is better but this is MVP)
setInterval(() => {
  scanAndOverlay();
  handleStellicSidebar();
}, 3000);
scanAndOverlay();
handleStellicSidebar();
