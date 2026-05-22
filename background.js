// ==========================================
// INITIALIZATION
// ==========================================
// Opens the side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ==========================================
// DOMAIN BLACKLIST ENGINE
// ==========================================
let mutedDomains = [];

// Fetch initial blacklist from storage
chrome.storage.local.get(['mutedDomains'], (result) => {
  if (result.mutedDomains) {
    mutedDomains = result.mutedDomains;
  }
});

// Update the active blacklist in memory dynamically on change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.mutedDomains) {
    mutedDomains = changes.mutedDomains.newValue || [];
  }
});

function isDomainMuted(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return mutedDomains.some(domain => {
      const d = domain.trim().toLowerCase();
      if (!d) return false;
      return hostname === d || hostname.endsWith('.' + d);
    });
  } catch (e) {
    return false;
  }
}

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
    // Drop blacklisted domains immediately
    if (isDomainMuted(details.url)) {
      return;
    }

    const isWebSocket = details.type === 'websocket';
    if (details.method === 'POST' || details.method === 'PUT' || details.method === 'PATCH' || isWebSocket) {
      let payloadData = null;
      
      if (isWebSocket) {
        payloadData = {
          connection: "WebSocket Handshake Connection Established",
          protocol: "ws/wss",
          timestamp: new Date().toISOString()
        };
      } else if (details.requestBody) {
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
        method: isWebSocket ? 'WS' : details.method,
        type: details.type,
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
          method: req.method,
          type: req.type || details.type || 'xmlhttprequest',
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
          method: req.method,
          type: req.type || details.type || 'xmlhttprequest',
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