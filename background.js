// ==========================================
// INITIALIZATION
// ==========================================
// Opens the side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ==========================================
// PAYLOAD INTERCEPTOR LOGIC
// ==========================================
const pendingRequests = new Map();

// Periodic cleanup of pending requests older than 60 seconds to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [requestId, req] of pendingRequests.entries()) {
    if (now - req.timestamp > 60000) {
      pendingRequests.delete(requestId);
    }
  }
}, 30000);

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method === 'POST' || details.method === 'PUT' || details.method === 'PATCH') {
      let payloadData = null;
      
      if (details.requestBody) {
        if (details.requestBody.formData) {
          payloadData = details.requestBody.formData;
        } else if (details.requestBody.raw && details.requestBody.raw[0]) {
          try {
            const stringStr = new TextDecoder('utf-8').decode(details.requestBody.raw[0].bytes);
            payloadData = JSON.parse(stringStr);
          } catch (e) {
            payloadData = "Raw binary/text data";
          }
        }
      }

      pendingRequests.set(details.requestId, {
        url: details.url,
        method: details.method,
        payload: payloadData,
        timestamp: Date.now()
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const req = pendingRequests.get(details.requestId);
    if (req) {
      pendingRequests.delete(details.requestId);
      chrome.runtime.sendMessage({
        type: 'NEW_PAYLOAD',
        data: {
          url: details.url,
          method: details.method,
          payload: req.payload,
          status: details.statusCode
        }
      }).catch(() => {});
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const req = pendingRequests.get(details.requestId);
    if (req) {
      pendingRequests.delete(details.requestId);
      chrome.runtime.sendMessage({
        type: 'NEW_PAYLOAD',
        data: {
          url: details.url,
          method: details.method,
          payload: req.payload,
          status: 'Error'
        }
      }).catch(() => {});
    }
  },
  { urls: ["<all_urls>"] }
);

// ==========================================
// GLOBAL SIDE PANEL CLOSE HACK
// ==========================================
// Listens for the invisible connection created in sidepanel.js
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel-connection') {
        
        // When the user clicks the native 'X' on the side panel, the port disconnects
        port.onDisconnect.addListener(() => {
            // Force disable the side panel across ALL tabs in the window
            chrome.sidePanel.setOptions({ enabled: false }, () => {
                // Immediately re-enable it in the background so it can be opened again later
                chrome.sidePanel.setOptions({ enabled: true });
            });
        });
    }
});