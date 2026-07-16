// background.js — Service worker (Manifest V3)
// Handles the toolbar icon click, makes sure the content script is present,
// asks it to do the scraping + copying, and reflects the result on the badge.

const OK_COLOR = "#10a37f";
const ERR_COLOR = "#d93025";

function flashBadge(tabId, text, color, ms = 1800) {
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" });
  }, ms);
}

async function ensureContentScript(tabId) {
  try {
    // Ping the content script; if it doesn't respond, (re)inject it.
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  if (!tab.url.startsWith("https://chatgpt.com/")) {
    flashBadge(tab.id, "!", ERR_COLOR);
    return;
  }

  flashBadge(tab.id, "…", OK_COLOR, 60000); // will be overwritten below

  try {
    await ensureContentScript(tab.id);

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "COPY_CONVERSATION",
    });

    if (response && response.ok) {
      flashBadge(tab.id, "✓", OK_COLOR);
    } else {
      flashBadge(tab.id, "!", ERR_COLOR);
      console.warn("ChatGPT Conversation Copier: ", response && response.error);
    }
  } catch (err) {
    flashBadge(tab.id, "!", ERR_COLOR);
    console.error("ChatGPT Conversation Copier failed:", err);
  }
});
