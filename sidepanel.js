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
  const filterInput = document.getElementById('filterInput');
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const patchNotesBtn = document.getElementById('patchNotesBtn');
  const patchModal = document.getElementById('patchModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const langSelect = document.getElementById('langSelect');
  const htmlEl = document.documentElement;

  let domainGroups = {}; 

  // ==========================================
  // TRANSLATION LOGIC (i18n)
  // ==========================================
  const translations = {
    en: { clearLogs: "Clear logs", filter: "Filter by domain or URL...", releaseNotes: "Release Notes", support: "Support project" },
    sv: { clearLogs: "Rensa loggar", filter: "Filtrera efter domän eller URL...", releaseNotes: "Versionsfakta", support: "Stötta projektet" },
    es: { clearLogs: "Borrar registros", filter: "Filtrar por dominio o URL...", releaseNotes: "Notas de la versión", support: "Apoyar proyecto" },
    de: { clearLogs: "Protokolle löschen", filter: "Nach Domäne oder URL filtern...", releaseNotes: "Versionshinweise", support: "Projekt unterstützen" },
    fr: { clearLogs: "Effacer les journaux", filter: "Filtrer par domaine ou URL...", releaseNotes: "Notes de version", support: "Soutenir le projet" }
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

  clearBtn.addEventListener('click', () => {
    listContainer.innerHTML = '';
    domainGroups = {};
  });

  filterInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.domain-group').forEach(group => {
       const text = group.innerText.toLowerCase();
       group.style.display = text.includes(term) ? 'block' : 'none';
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
      group.remove(); 
      delete domainGroups[domain]; 
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
    
    let payloadString = "";
    if (typeof request.payload === 'object') {
        payloadString = JSON.stringify(request.payload, null, 2);
    } else {
        payloadString = request.payload || "No payload data";
    }

    const time = getFormattedTime();

    card.innerHTML = `
      <div class="card-header">
        <div class="card-top">
          <span class="method">${request.method || 'POST'}</span>
          <span class="url" title="${request.url}">${request.url}</span>
          <span class="time">${time}</span>
        </div>
      </div>
      <div class="card-body-content" style="display: none;">
        <pre>${payloadString}</pre>
      </div>
    `;

    card.querySelector('.card-header').addEventListener('click', () => {
       const content = card.querySelector('.card-body-content');
       content.style.display = content.style.display === 'none' ? 'block' : 'none';
    });

    body.prepend(card);

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