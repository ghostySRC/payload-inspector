// popup.js

document.addEventListener('DOMContentLoaded', async () => {
    // Identifiera vilken flik användaren befinner sig på
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const killSwitchBtn = document.getElementById('killSwitchBtn');
    const alertContainer = document.getElementById('alertContainer');
    const warningIcon = document.getElementById('warningIcon');

    // Hämta initialt tillstånd (Varningar & om Kill Switch redan är igång)
    chrome.runtime.sendMessage({ type: "GET_STATE", tabId: tab.id }, (response) => {
        if (response && response.isKilled) {
            setKillSwitchActiveUI();
        }
        renderAlerts(response?.alerts || []);
    });

    // Lyssna på nya varningar medan popupen är öppen
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "ALERT_TRIGGERED" && message.tabId === tab.id) {
            chrome.runtime.sendMessage({ type: "GET_STATE", tabId: tab.id }, (response) => {
                renderAlerts(response.alerts);
            });
        }
    });

    // Hantera klick på Kill Switch
    killSwitchBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: "ENABLE_KILL_SWITCH", tabId: tab.id }, (response) => {
            if (response && response.success) {
                setKillSwitchActiveUI();
            }
        });
    });

    function setKillSwitchActiveUI() {
        killSwitchBtn.disabled = true;
        killSwitchBtn.textContent = "🛑 TRAFIK BLOCKERAD FÖR FLIKEN";
        document.body.style.borderTop = "4px solid #d32f2f";
    }

    function renderAlerts(alerts) {
        if (!alerts || alerts.length === 0) return;
        
        alertContainer.innerHTML = '';
        warningIcon.style.display = "block";
        
        // Visa de senaste 4 varningarna för att hålla UI:t rent
        alerts.slice(-4).forEach(alert => {
            const div = document.createElement('div');
            div.className = 'alert-item';
            div.textContent = `🚨 ${alert.reason}`;
            alertContainer.appendChild(div);
        });
    }
});
