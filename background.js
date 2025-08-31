// Background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle messages if needed
});

// Handle extension icon click - open popup window as fallback
chrome.action.onClicked.addListener((tab) => {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 340,
    height: 500,
    left: screen.width - 360,
    top: screen.height - 550
  });
});