// background.js
importScripts('utils/securityScanner.js');

// Domäner vi litar på (allt annat räknas som externt/okänt)
const KNOWN_DOMAINS = ["localhost", "127.0.0.1"]; 

// Tillstånd
let tabAlerts = {}; // Mappar tabId -> array av varningar
let killSwitchedTabs = new Set();
const pendingRequests = new Map();

// Fånga request body i första skedet av nätverkslivscykeln
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (killSwitchedTabs.has(details.tabId)) return;

        let payloadString = "";

        // Läs ut payload från request body om den finns
        if (details.requestBody) {
            if (details.requestBody.formData) {
                payloadString = JSON.stringify(details.requestBody.formData);
            } else if (details.requestBody.raw) {
                payloadString = details.requestBody.raw.map(data => {
                    return data.bytes ? new TextDecoder('utf-8').decode(data.bytes) : '';
                }).join('');
            }
        }

        let parsedPayload = payloadString;
        if (payloadString) {
            try { parsedPayload = JSON.parse(payloadString); } catch(e) {}
        }

        // Cachea detaljerna till nästa skede (där vi har tillgång till headers)
        pendingRequests.set(details.requestId, {
            url: details.url,
            method: details.method,
            type: details.type,
            tabId: details.tabId,
            payloadString: payloadString,
            parsedPayload: parsedPayload
        });

        // Säkerställ upprensning om begäran avbryts
        setTimeout(() => {
            pendingRequests.delete(details.requestId);
        }, 30000);
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
);

// Fånga headers och kör den asynkrona skanningen
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (killSwitchedTabs.has(details.tabId)) return;

        const reqData = pendingRequests.get(details.requestId);
        if (!reqData) return;
        pendingRequests.delete(details.requestId);

        const headersMap = {};
        if (details.requestHeaders) {
            details.requestHeaders.forEach(h => {
                headersMap[h.name.toLowerCase()] = h.value;
            });
        }

        // Kör den asynkrona säkerhetsskanningen under huven utan att returnera ett Promise från eventlyssnaren
        scanPayload(
            reqData.parsedPayload || reqData.payloadString,
            headersMap,
            reqData.url,
            reqData.method
        ).then((scanResult) => {
            // Skicka alltid vidare payloaden med bifogad securityMetaData till inspektören
            const requestData = {
                url: reqData.url,
                method: reqData.method,
                type: reqData.type,
                payload: reqData.parsedPayload || null,
                securityMetaData: {
                    isSuspicious: scanResult.isSuspicious,
                    suspiciousReasons: scanResult.reasons
                }
            };

            chrome.runtime.sendMessage({
                type: 'NEW_PAYLOAD',
                data: requestData
            }).catch(() => {});

            // Hantera larm vid upptäckta säkerhetsrisker
            if (scanResult.isSuspicious && reqData.tabId >= 0) {
                if (!tabAlerts[reqData.tabId]) tabAlerts[reqData.tabId] = [];
                
                scanResult.reasons.forEach(reason => {
                    // Spara varningen
                    tabAlerts[reqData.tabId].push({ 
                        url: reqData.url, 
                        reason: reason, 
                        time: Date.now() 
                    });

                    // Meddela popup/panel-UI:t direkt
                    chrome.runtime.sendMessage({ 
                        type: "ALERT_TRIGGERED", 
                        tabId: reqData.tabId, 
                        reason: reason 
                    }).catch(() => {});
                });
            }
        }).catch((err) => {
            console.error("Security scan failed: ", err);
        });
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders", "extraHeaders"]
);

// Hantera kommunikation med Popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ENABLE_KILL_SWITCH") {
        const tabId = message.tabId;
        killSwitchedTabs.add(tabId);

        // Skapa en session-regel via Declarative Net Request som blockerar ALLT från denna flik
        chrome.declarativeNetRequest.updateSessionRules({
            addRules: [{
                "id": tabId, // Använder tabId som regel-ID för enkel mappning
                "priority": 100,
                "action": { "type": "block" },
                "condition": {
                    "tabIds": [tabId],
                    "resourceTypes": [
                        "main_frame", "sub_frame", "stylesheet", "script", "image", 
                        "font", "object", "xmlhttprequest", "ping", "csp_report", 
                        "media", "websocket", "other"
                    ]
                }
            }]
        }, () => {
            sendResponse({ success: true });
        });
        return true; // Håll kanalen öppen för asynkront svar
    } 
    else if (message.type === "GET_STATE") {
        sendResponse({ 
            alerts: tabAlerts[message.tabId] || [], 
            isKilled: killSwitchedTabs.has(message.tabId) 
        });
    }
});

// Städa upp när en flik stängs så vi inte läcker minne eller regler
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabAlerts[tabId];
    if (killSwitchedTabs.has(tabId)) {
        killSwitchedTabs.delete(tabId);
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [tabId]
        });
    }
});

// Lyssna på port-anslutningar från sidopanelen för att hålla anslutningen vid liv
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel-connection') {
        // Logga internt vid uppkoppling/nedkoppling
        port.onDisconnect.addListener(() => {
            console.log('Sidopanel-port stängd');
        });
    }
});