// background.js

const SUSPICIOUS_PATTERNS = {
    // Fångar upp SQLi-mönster som OR '1'='1', UNION SELECT etc.
    sqli: /('|\%27).*?(OR|UNION|SELECT|DROP|INSERT)/i,
    // Fångar upp XSS-injektioner
    xss: /(<|\%3C).*?(script|img|svg|iframe|on\w+)/i,
    // Letar efter nycklar som indikerar känslig information
    sensitive: /(password|passwd|creditcard|cvv)/i
};

// Domäner vi litar på (allt annat räknas som externt/okänt)
const KNOWN_DOMAINS = ["localhost", "127.0.0.1"]; 

// Tillstånd
let tabAlerts = {}; // Mappar tabId -> array av varningar
let killSwitchedTabs = new Set();

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        // Om Kill Switch är aktiverad för denna flik bryr vi oss inte om att skanna längre
        if (killSwitchedTabs.has(details.tabId)) return;

        const urlObj = new URL(details.url);
        const isExternal = !KNOWN_DOMAINS.includes(urlObj.hostname);
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

        // Vi skannar både URL (för GET-parametrar) och Bodyn
        const dataToScan = details.url + payloadString;
        let flagged = false;
        let reason = "";

        // Kör heuristik
        if (isExternal && SUSPICIOUS_PATTERNS.sensitive.test(dataToScan)) {
            flagged = true;
            reason = "Känslig data skickas mot extern domän (Lösenord/CVV)";
        } else if (SUSPICIOUS_PATTERNS.sqli.test(dataToScan)) {
            flagged = true;
            reason = "Potentiell SQL-injektion detekterad i payload";
        } else if (SUSPICIOUS_PATTERNS.xss.test(dataToScan)) {
            flagged = true;
            reason = "Potentiell XSS-injektion detekterad i payload";
        }

        if (flagged && details.tabId >= 0) {
            if (!tabAlerts[details.tabId]) tabAlerts[details.tabId] = [];
            
            // Spara varningen
            tabAlerts[details.tabId].push({ 
                url: details.url, 
                reason: reason, 
                time: Date.now() 
            });

            // Meddela popup-UI:t om det är öppet
            chrome.runtime.sendMessage({ 
                type: "ALERT_TRIGGERED", 
                tabId: details.tabId, 
                reason: reason 
            }).catch(() => {}); // Ignorera error om popupen är stängd
        }
    },
    { urls: ["<all_urls>"] },
    ["requestBody"] // Tillåter oss att läsa ut POST/PUT data
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