// ==========================================
// INITIALIZATION
// ==========================================
// Opens the side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ==========================================
// PAYLOAD INTERCEPTOR LOGIC
// ==========================================
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // We only care about requests that send data
    if (details.method === 'POST' || details.method === 'PUT' || details.method === 'PATCH') {
      let payloadData = null;
      
      if (details.requestBody) {
        if (details.requestBody.formData) {
          payloadData = details.requestBody.formData;
        } else if (details.requestBody.raw && details.requestBody.raw[0]) {
          try {
            // Convert binary buffer to readable JSON string
            const stringStr = new TextDecoder('utf-8').decode(details.requestBody.raw[0].bytes);
            payloadData = JSON.parse(stringStr);
          } catch (e) {
            payloadData = "Raw binary/text data";
          }
        }
      }

      // Send the captured data to the sidepanel
      chrome.runtime.sendMessage({
        type: 'NEW_PAYLOAD',
        data: {
          url: details.url,
          method: details.method,
          payload: payloadData
        }
      }).catch(() => {
        // This catch block prevents Chrome from throwing errors in the background console
        // when the side panel is closed and unable to receive messages.
      }); 
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
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