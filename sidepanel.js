// ==========================================
// PORT CONNECTION (GLOBAL SIDE PANEL HACK)
// ==========================================
// Opens an invisible connection to background.js. 
// When the user clicks the native Chrome 'X' to close the panel, this script dies,
// the connection breaks, and background.js forces the panel to close on ALL tabs.
chrome.runtime.connect({ name: 'sidepanel-connection' });

document.addEventListener('DOMContentLoaded', () => {
  const listContainer = document.getElementById('listContainer');
  const clearBtn = document.getElementById('clearBtn');
  const exportBtn = document.getElementById('exportBtn');
  const filterInput = document.getElementById('filterInput');
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const patchNotesBtn = document.getElementById('patchNotesBtn');
  const patchModal = document.getElementById('patchModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const langSelect = document.getElementById('langSelect');
  const htmlEl = document.documentElement;

  // v1.0.2 Settings & Blacklist DOM
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
  const blacklistInput = document.getElementById('blacklistInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  // v1.0.2 Comparison Modal DOM
  const diffModal = document.getElementById('diffModal');
  const closeDiffModalBtn = document.getElementById('closeDiffModalBtn');
  const diffPaneLeft = document.getElementById('diffPaneLeft');
  const diffPaneRight = document.getElementById('diffPaneRight');
  const diffPaneLeftTitle = document.getElementById('diffPaneLeftTitle');
  const diffPaneRightTitle = document.getElementById('diffPaneRightTitle');

  let domainGroups = {}; 
  let requestCounter = 0;
  let selectedCardsForCompare = [];
  let activeTypeFilter = 'all';
  // ==========================================
  // TRANSLATION LOGIC (i18n)
  // ==========================================
  const translations = {
    en: { clearLogs: "Clear logs", filter: "Filter by domain or URL...", releaseNotes: "Release Notes", support: "Support project", exportLogs: "Export" },
    sv: { clearLogs: "Rensa loggar", filter: "Filtrera efter domän eller URL...", releaseNotes: "Versionsfakta", support: "Stötta projektet", exportLogs: "Exportera" },
    es: { clearLogs: "Borrar registros", filter: "Filtrar por dominio o URL...", releaseNotes: "Notas de la versión", support: "Apoyar proyecto", exportLogs: "Exportar" },
    de: { clearLogs: "Protokolle löschen", filter: "Nach Domäne oder URL filtern...", releaseNotes: "Versionshinweise", support: "Projekt unterstützen", exportLogs: "Export" },
    fr: { clearLogs: "Effacer les journaux", filter: "Filtrer par domaine ou URL...", releaseNotes: "Notes de version", support: "Soutenir le projet", exportLogs: "Exporter" }
  };

  function applyTranslations(lang) {
    const t = translations[lang] || translations['en'];
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) el.textContent = t[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (t[key]) el.placeholder = t[key];
    });
    
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (t[key]) el.title = t[key];
    });
  }

  chrome.storage.local.get(['lang'], (result) => {
    const lang = result.lang || 'en';
    langSelect.value = lang;
    applyTranslations(lang);
  });

  langSelect.addEventListener('change', (e) => {
    const lang = e.target.value;
    chrome.storage.local.set({ lang });
    applyTranslations(lang);
  });

  // ==========================================
  // THEME LOGIC
  // ==========================================
  chrome.storage.local.get(['theme'], (result) => {
    const theme = result.theme || 'dark';
    htmlEl.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
  });

  themeToggle.addEventListener('click', () => {
    const current = htmlEl.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', next);
    chrome.storage.local.set({ theme: next });
    updateThemeIcon(next);
  });

  function updateThemeIcon(theme) {
    if (theme === 'dark') {
      themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
    } else {
      themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
    }
  }

  // ==========================================
  // MODAL & GLOBAL ACTIONS LOGIC
  // ==========================================
  patchNotesBtn.addEventListener('click', () => patchModal.classList.add('open'));
  closeModalBtn.addEventListener('click', () => patchModal.classList.remove('open'));
  patchModal.addEventListener('click', (e) => {
    if(e.target === patchModal) patchModal.classList.remove('open');
  });

  // v1.0.2 Settings Modal Handlers
  settingsBtn.addEventListener('click', () => {
    chrome.storage.local.get(['mutedDomains'], (result) => {
      const list = result.mutedDomains || [];
      blacklistInput.value = list.join('\n');
      settingsModal.classList.add('open');
    });
  });

  closeSettingsModalBtn.addEventListener('click', () => {
    settingsModal.classList.remove('open');
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove('open');
  });

  saveSettingsBtn.addEventListener('click', () => {
    const listStr = blacklistInput.value || '';
    const domains = listStr
      .split(/[\n,]+/)
      .map(d => d.trim().toLowerCase())
      .filter(d => d.length > 0);

    chrome.storage.local.set({ mutedDomains: domains }, () => {
      settingsModal.classList.remove('open');
      purgeMutedDomainCards(domains);
    });
  });

  function purgeMutedDomainCards(domains) {
    document.querySelectorAll('.domain-group').forEach(group => {
      const titleEl = group.querySelector('.domain-title');
      if (!titleEl) return;
      const domain = titleEl.textContent.trim().toLowerCase();
      const isMuted = domains.some(d => domain === d || domain.endsWith('.' + d));
      if (isMuted) {
        group.remove();
        delete domainGroups[domain];
      }
    });
  }

  // v1.0.2 Visual Diff Modal Handlers
  closeDiffModalBtn.addEventListener('click', () => {
    closeAndClearDiff();
  });

  diffModal.addEventListener('click', (e) => {
    if (e.target === diffModal) closeAndClearDiff();
  });

  function closeAndClearDiff() {
    diffModal.classList.remove('open');
    selectedCardsForCompare.forEach(item => {
      const chk = item.card.querySelector('.compare-chk');
      if (chk) chk.checked = false;
    });
    selectedCardsForCompare = [];
    document.querySelectorAll('.compare-chk').forEach(chk => {
      chk.disabled = false;
    });
  }

  function runLCSDiff(payloadA, payloadB) {
    const strA = typeof payloadA === 'object' ? JSON.stringify(payloadA, null, 2) : String(payloadA);
    const strB = typeof payloadB === 'object' ? JSON.stringify(payloadB, null, 2) : String(payloadB);

    const linesA = strA.split('\n');
    const linesB = strB.split('\n');

    const dp = Array(linesA.length + 1).fill(null).map(() => Array(linesB.length + 1).fill(0));
    for (let i = 1; i <= linesA.length; i++) {
      for (let j = 1; j <= linesB.length; j++) {
        if (linesA[i-1] === linesB[j-1]) {
          dp[i][j] = dp[i-1][j-1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
        }
      }
    }

    const diffLeft = [];
    const diffRight = [];
    let i = linesA.length, j = linesB.length;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && linesA[i-1] === linesB[j-1]) {
        diffLeft.unshift({ text: linesA[i-1], type: 'normal' });
        diffRight.unshift({ text: linesB[j-1], type: 'normal' });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        diffLeft.unshift({ text: '', type: 'empty' });
        diffRight.unshift({ text: linesB[j-1], type: 'added' });
        j--;
      } else {
        diffLeft.unshift({ text: linesA[i-1], type: 'deleted' });
        diffRight.unshift({ text: '', type: 'empty' });
        i--;
      }
    }

    return { left: diffLeft, right: diffRight };
  }

  function renderDiffSide(container, diffLines) {
    container.innerHTML = '';
    diffLines.forEach(line => {
      const lineEl = document.createElement('div');
      lineEl.className = `diff-line ${line.type}`;
      if (line.text === '') {
        lineEl.innerHTML = '&nbsp;';
      } else {
        lineEl.textContent = line.text;
      }
      container.appendChild(lineEl);
    });
  }

  function triggerDiffModal() {
    if (selectedCardsForCompare.length !== 2) return;
    const reqA = selectedCardsForCompare[0].request;
    const reqB = selectedCardsForCompare[1].request;

    let pathA = "Request A";
    let pathB = "Request B";
    try { pathA = new URL(reqA.url).pathname; } catch(e) {}
    try { pathB = new URL(reqB.url).pathname; } catch(e) {}

    diffPaneLeftTitle.textContent = `${reqA.method} ${pathA} (${reqA.timestamp})`;
    diffPaneRightTitle.textContent = `${reqB.method} ${pathB} (${reqB.timestamp})`;

    const diff = runLCSDiff(reqA.payload, reqB.payload);
    renderDiffSide(diffPaneLeft, diff.left);
    renderDiffSide(diffPaneRight, diff.right);

    diffModal.classList.add('open');
  }

  clearBtn.addEventListener('click', () => {
    listContainer.innerHTML = '';
    domainGroups = {};
    selectedCardsForCompare = [];
  });

  // ==========================================
  // HELPERS & EXPORT LOGIC
  // ==========================================
  function getCurlCommand(request) {
    const method = request.method || 'POST';
    const url = request.url;
    let dataStr = '';
    if (request.payload) {
      if (typeof request.payload === 'object') {
        dataStr = JSON.stringify(request.payload);
      } else {
        dataStr = request.payload.toString();
      }
    }
    const escapedUrl = url.replace(/'/g, "'\\''");
    const escapedData = dataStr.replace(/'/g, "'\\''");
    return `curl '${escapedUrl}' -X ${method} -H 'content-type: application/json' --data-raw '${escapedData}'`;
  }

  function getFetchSnippet(request) {
    const method = request.method || 'POST';
    const url = request.url;
    let bodyStr = 'null';
    if (request.payload) {
      if (typeof request.payload === 'object') {
        bodyStr = `JSON.stringify(${JSON.stringify(request.payload, null, 2)})`;
      } else {
        bodyStr = JSON.stringify(request.payload);
      }
    }
    return `fetch(${JSON.stringify(url)}, {
  method: ${JSON.stringify(method)},
  headers: {
    "content-type": "application/json"
  },
  body: ${bodyStr}
});`;
  }

  function getPayloadSizeString(payload) {
    if (!payload) return "0 B";
    let str = "";
    if (typeof payload === 'object') {
      str = JSON.stringify(payload);
    } else {
      str = payload.toString();
    }
    const bytes = new TextEncoder().encode(str).length;
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function createJSONTree(data) {
    const container = document.createElement('div');
    container.className = 'json-tree';
    
    function buildNode(key, value, isLast) {
      const node = document.createElement('div');
      node.className = 'json-node';
      
      const keySpan = document.createElement('span');
      keySpan.className = 'json-key';
      if (key !== null) {
        keySpan.textContent = `"${key}": `;
        keySpan.style.color = 'var(--json-key)';
        keySpan.style.fontWeight = '600';
        node.appendChild(keySpan);
      }
      
      if (value === null) {
        const valSpan = document.createElement('span');
        valSpan.textContent = 'null' + (isLast ? '' : ',');
        valSpan.style.color = 'var(--json-null)';
        node.appendChild(valSpan);
      } else if (typeof value === 'boolean') {
        const valSpan = document.createElement('span');
        valSpan.textContent = value.toString() + (isLast ? '' : ',');
        valSpan.style.color = 'var(--json-bool)';
        node.appendChild(valSpan);
      } else if (typeof value === 'number') {
        const valSpan = document.createElement('span');
        valSpan.textContent = value.toString() + (isLast ? '' : ',');
        valSpan.style.color = 'var(--json-number)';
        node.appendChild(valSpan);
      } else if (typeof value === 'string') {
        const valSpan = document.createElement('span');
        valSpan.textContent = `"${value}"` + (isLast ? '' : ',');
        valSpan.style.color = 'var(--json-string)';
        valSpan.style.wordBreak = 'break-all';
        node.appendChild(valSpan);
      } else if (Array.isArray(value)) {
        const header = document.createElement('span');
        header.className = 'json-toggle';
        header.style.cursor = 'pointer';
        header.style.userSelect = 'none';
        
        const bracketOpen = document.createElement('span');
        bracketOpen.textContent = '[';
        bracketOpen.style.color = 'var(--text-main)';
        header.appendChild(bracketOpen);
        
        const collapseIndicator = document.createElement('span');
        collapseIndicator.textContent = ' ... ';
        collapseIndicator.style.display = 'none';
        collapseIndicator.style.background = 'var(--bg-hover)';
        collapseIndicator.style.padding = '0 4px';
        collapseIndicator.style.borderRadius = '4px';
        collapseIndicator.style.fontSize = '10px';
        collapseIndicator.style.color = 'var(--text-muted)';
        header.appendChild(collapseIndicator);
        
        node.appendChild(header);
        
        const childContainer = document.createElement('div');
        childContainer.className = 'json-child-container';
        
        value.forEach((item, index) => {
          childContainer.appendChild(buildNode(null, item, index === value.length - 1));
        });
        
        node.appendChild(childContainer);
        
        const bracketClose = document.createElement('div');
        bracketClose.textContent = ']' + (isLast ? '' : ',');
        bracketClose.style.color = 'var(--text-main)';
        bracketClose.style.marginLeft = '12px';
        node.appendChild(bracketClose);
        
        header.addEventListener('click', (e) => {
          e.stopPropagation();
          const collapsed = childContainer.style.display === 'none';
          childContainer.style.display = collapsed ? 'block' : 'none';
          bracketClose.style.display = collapsed ? 'block' : 'inline';
          if (collapsed) {
            bracketClose.style.marginLeft = '12px';
            collapseIndicator.style.display = 'none';
          } else {
            bracketClose.style.marginLeft = '0px';
            collapseIndicator.style.display = 'inline';
          }
        });
      } else if (typeof value === 'object') {
        const keys = Object.keys(value);
        const header = document.createElement('span');
        header.className = 'json-toggle';
        header.style.cursor = 'pointer';
        header.style.userSelect = 'none';
        
        const bracketOpen = document.createElement('span');
        bracketOpen.textContent = '{';
        bracketOpen.style.color = 'var(--text-main)';
        header.appendChild(bracketOpen);
        
        const collapseIndicator = document.createElement('span');
        collapseIndicator.textContent = ' ... ';
        collapseIndicator.style.display = 'none';
        collapseIndicator.style.background = 'var(--bg-hover)';
        collapseIndicator.style.padding = '0 4px';
        collapseIndicator.style.borderRadius = '4px';
        collapseIndicator.style.fontSize = '10px';
        collapseIndicator.style.color = 'var(--text-muted)';
        header.appendChild(collapseIndicator);
        
        node.appendChild(header);
        
        const childContainer = document.createElement('div');
        childContainer.className = 'json-child-container';
        
        keys.forEach((k, index) => {
          childContainer.appendChild(buildNode(k, value[k], index === keys.length - 1));
        });
        
        node.appendChild(childContainer);
        
        const bracketClose = document.createElement('div');
        bracketClose.textContent = '}' + (isLast ? '' : ',');
        bracketClose.style.color = 'var(--text-main)';
        bracketClose.style.marginLeft = '12px';
        node.appendChild(bracketClose);
        
        header.addEventListener('click', (e) => {
          e.stopPropagation();
          const collapsed = childContainer.style.display === 'none';
          childContainer.style.display = collapsed ? 'block' : 'none';
          bracketClose.style.display = collapsed ? 'block' : 'inline';
          if (collapsed) {
            bracketClose.style.marginLeft = '12px';
            collapseIndicator.style.display = 'none';
          } else {
            bracketClose.style.marginLeft = '0px';
            collapseIndicator.style.display = 'inline';
          }
        });
      }
      
      return node;
    }
    
    if (data === null || typeof data !== 'object') {
      const rawSpan = document.createElement('span');
      rawSpan.textContent = String(data);
      rawSpan.style.color = 'var(--text-main)';
      container.appendChild(rawSpan);
    } else {
      container.appendChild(buildNode(null, data, true));
    }
    
    return container;
  }

  function reorderCards(body) {
    const cards = Array.from(body.querySelectorAll('.card'));
    cards.sort((a, b) => {
      const aPinned = a.classList.contains('pinned') ? 1 : 0;
      const bPinned = b.classList.contains('pinned') ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b._index - a._index;
    });
    cards.forEach(c => body.appendChild(c));
  }

  exportBtn.addEventListener('click', () => {
    const exportData = {};
    document.querySelectorAll('.domain-group').forEach(group => {
      const domain = group.querySelector('.domain-title').textContent;
      exportData[domain] = [];
      group.querySelectorAll('.card').forEach(card => {
        if (card._request) {
          exportData[domain].push({
            url: card._request.url,
            method: card._request.method,
            timestamp: card._request.timestamp || card.querySelector('.time').textContent,
            status: card._request.status || null,
            size: card._request.size || null,
            payload: card._request.payload
          });
        }
      });
    });
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `payload_inspector_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  });

  function applyFilters() {
    const term = filterInput.value.trim().toLowerCase();
    
    document.querySelectorAll('.domain-group').forEach(group => {
      let matchCount = 0;
      const cards = group.querySelectorAll('.card');
      
      cards.forEach(card => {
        const req = card._request;
        if (!req) return;
        
        // 1. Text Search Filter
        const urlMatch = req.url && req.url.toLowerCase().includes(term);
        const methodMatch = req.method && req.method.toLowerCase().includes(term);
        
        let payloadMatch = false;
        if (req.payload) {
          if (typeof req.payload === 'object') {
            payloadMatch = JSON.stringify(req.payload).toLowerCase().includes(term);
          } else {
            payloadMatch = req.payload.toString().toLowerCase().includes(term);
          }
        }
        const matchesText = !term || urlMatch || methodMatch || payloadMatch;
        
        // 2. Type Filter Pill Match
        let matchesType = false;
        if (activeTypeFilter === 'all') {
          matchesType = true;
        } else if (activeTypeFilter === 'fetch') {
          matchesType = (req.type === 'xmlhttprequest' || !req.type);
        } else if (activeTypeFilter === 'websocket') {
          matchesType = (req.type === 'websocket');
        }
        
        if (matchesText && matchesType) {
          card.style.display = 'block';
          matchCount++;
        } else {
          card.style.display = 'none';
        }
      });
      
      const badge = group.querySelector('.domain-badge');
      if (matchCount > 0) {
        group.style.display = 'block';
        if (!term) {
          badge.textContent = matchCount;
        } else {
          badge.textContent = `${matchCount}/${cards.length}`;
        }
      } else {
        group.style.display = 'none';
      }
    });
  }

  filterInput.addEventListener('input', () => {
    applyFilters();
  });

  // Wire up the filter pill buttons
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeTypeFilter = pill.getAttribute('data-type');
      applyFilters();
    });
  });

  // ==========================================
  // CORE DOMAIN GROUPING & RENDER LOGIC
  // ==========================================
  function getFormattedTime() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + 
           now.getMinutes().toString().padStart(2, '0') + ':' + 
           now.getSeconds().toString().padStart(2, '0');
  }

  function createDomainGroup(domain) {
    const group = document.createElement('div');
    group.className = 'domain-group';

    const header = document.createElement('div');
    header.className = 'domain-header';

    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'domain-title-wrapper';
    titleWrapper.innerHTML = `
      <span class="domain-title">${domain}</span>
      <span class="domain-badge">0</span>
    `;

    // Trash button logic
    const deleteBtn = document.createElement('button');
    deleteBtn.title = "Clear domain";
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
    deleteBtn.style.cssText = "background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;";
    
    deleteBtn.addEventListener('mouseenter', () => {
      deleteBtn.style.color = "#ef4444";
      deleteBtn.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
    });
    deleteBtn.addEventListener('mouseleave', () => {
      deleteBtn.style.color = "var(--text-muted)";
      deleteBtn.style.backgroundColor = "transparent";
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation(); 
      const cards = Array.from(group.querySelectorAll('.card'));
      cards.forEach(card => {
        if (!card.classList.contains('pinned')) {
          card.remove();
        }
      });
      
      const remainingCards = group.querySelectorAll('.card');
      const badge = group.querySelector('.domain-badge');
      badge.textContent = remainingCards.length;
      
      if (remainingCards.length === 0) {
        group.remove(); 
        delete domainGroups[domain]; 
      }
    });

    const headerRight = document.createElement('div');
    headerRight.style.display = "flex";
    headerRight.style.alignItems = "center";
    headerRight.appendChild(deleteBtn);

    header.appendChild(titleWrapper);
    header.appendChild(headerRight);

    const accordionWrapper = document.createElement('div');
    accordionWrapper.className = 'accordion-wrapper open'; 
    
    const accordionInner = document.createElement('div');
    accordionInner.className = 'accordion-inner';

    const body = document.createElement('div');
    body.className = 'domain-body';

    accordionInner.appendChild(body);
    accordionWrapper.appendChild(accordionInner);
    group.appendChild(header);
    group.appendChild(accordionWrapper);

    header.addEventListener('click', () => {
      accordionWrapper.classList.toggle('open');
    });

    domainGroups[domain] = group;
    listContainer.prepend(group);
  }

  function addRequestToUI(request) {
    let domain = "Unknown";
    try {
      domain = new URL(request.url).hostname;
    } catch(e) {}

    if (!domainGroups[domain]) {
      createDomainGroup(domain);
    }

    const group = domainGroups[domain];
    const body = group.querySelector('.domain-body');
    const badge = group.querySelector('.domain-badge');

    const card = document.createElement('div');
    card.className = 'card';
    card._request = request;
    card._index = requestCounter++;
    
    const time = getFormattedTime();
    request.timestamp = time; // Preserve for exports

    // Status Badge Logic
    let statusClass = "status-success";
    let statusLabel = request.status ? request.status.toString() : "200";
    if (request.status === "Error" || (typeof request.status === 'number' && request.status >= 400)) {
      statusClass = "status-error";
    }
    
    // Payload Size Calculation
    const sizeStr = getPayloadSizeString(request.payload);
    request.size = sizeStr;
    card.innerHTML = `
      <div class="card-header">
        <div class="card-top" style="display: flex; align-items: center; width: 100%; gap: 8px;">
          <button class="pin-btn" title="Pin payload" style="background: transparent; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
            <svg class="star-icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: var(--text-muted); fill: none; pointer-events: none;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </button>
          <label class="compare-label" title="Select to compare JSON structures">
            <input type="checkbox" class="compare-chk">
            <span>Compare</span>
          </label>
          <span class="method">${request.method || 'POST'}</span>
          <span class="url" title="${request.url}">${request.url}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
          <span class="size-badge" style="font-size: 10px; color: var(--text-muted); background: var(--bg-main); border: 1px solid var(--border); padding: 2px 6px; border-radius: 8px; white-space: nowrap;">${sizeStr}</span>
          <span class="time" style="white-space: nowrap; margin-left: auto;">${time}</span>
        </div>
      </div>
      <div class="card-body-content" style="display: none; padding: 12px; border-top: 1px solid var(--border);">
        <div class="card-actions" style="display: flex; gap: 6px; margin-bottom: 8px; justify-content: flex-end;">
          <button class="pill-control copy-curl-btn" style="padding: 4px 8px; font-size: 10px; border-radius: 8px; margin: 0; box-shadow: none;">cURL</button>
          <button class="pill-control copy-fetch-btn" style="padding: 4px 8px; font-size: 10px; border-radius: 8px; margin: 0; box-shadow: none;">Fetch</button>
        </div>
        <div class="tree-container"></div>
      </div>
    `;

    // Prevent toggle expanded body when clicking on the pin button or compare label
    const pinBtn = card.querySelector('.pin-btn');
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('pinned');
      pinBtn.classList.toggle('pinned');
      reorderCards(body);
    });

    const compareChk = card.querySelector('.compare-chk');
    const compareLabel = card.querySelector('.compare-label');
    compareLabel.addEventListener('click', (e) => {
      e.stopPropagation(); // Stop expansion on label click
    });

    compareChk.addEventListener('change', () => {
      if (compareChk.checked) {
        selectedCardsForCompare.push({ card, request });
        if (selectedCardsForCompare.length === 2) {
          document.querySelectorAll('.compare-chk').forEach(chk => {
            if (!chk.checked) chk.disabled = true;
          });
          triggerDiffModal();
        }
      } else {
        selectedCardsForCompare = selectedCardsForCompare.filter(item => item.card !== card);
        document.querySelectorAll('.compare-chk').forEach(chk => {
          chk.disabled = false;
        });
      }
    });

    // Toggle expanded body click listener
    card.querySelector('.card-header').addEventListener('click', (e) => {
       if (e.target.closest('.pin-btn') || e.target.closest('.compare-label')) return;
       const content = card.querySelector('.card-body-content');
       content.style.display = content.style.display === 'none' ? 'block' : 'none';
    });

    // Copy cURL and Fetch event listeners
    card.querySelector('.copy-curl-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      navigator.clipboard.writeText(getCurlCommand(request)).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = originalText, 1500);
      });
    });

    card.querySelector('.copy-fetch-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      navigator.clipboard.writeText(getFetchSnippet(request)).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = originalText, 1500);
      });
    });

    // Build the interactive tree view
    const treeContainer = card.querySelector('.tree-container');
    treeContainer.appendChild(createJSONTree(request.payload));

    body.prepend(card);
    reorderCards(body);

    const currentCount = parseInt(badge.textContent) || 0;
    badge.textContent = currentCount + 1;
  }

  // ==========================================
  // BACKGROUND SCRIPT LISTENER
  // ==========================================
  chrome.runtime.onMessage.addListener((message) => {
     if (message.type === 'NEW_PAYLOAD' || message.action === 'NEW_REQUEST') { 
        addRequestToUI(message.data || message.request);
     }
  });
  
});