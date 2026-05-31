# Patch Notes - Payload Inspector Pro v1.0.4

**Lanseringsdatum:** 2026-06-01

### 🚀 Nya Funktioner
* **Heuristisk Säkerhetsdetektor:** 
  * Tillägget analyserar nu i realtid utgående payloads och URL-parametrar.
  * Inbyggt regex-stöd för att flagga kända injektionsmönster såsom SQLi (`OR '1'='1'`) och XSS (`<script>`).
  * Automatiskt dataläckageskydd (DLP): Om formulär-data eller payloads innehåller känsliga nycklar (t.ex. *password*, *creditcard*, *cvv*) och skickas mot okända externa domäner varnas användaren omedelbart.

* **Network Kill Switch:**
  * Implementerat en snabb åtkomst-knapp direkt i popup-gränssnittet.
  * Med ett knapptryck blockeras **all** framtida nätverkstrafik för den specifika fliken blixtsnabbt. Avbryter potentiella exfiltreringar innan paketen hinner lämna webbläsaren.
  * Drivs under huven av det snabba och säkra `declarativeNetRequest`-API:et för maximal kompatibilitet med Manifest V3.

### 🛠 Förbättringar & Systemuppdateringar
* Fullt migrerad till Google Chrome Manifest V3.
* Nytt, mörkt och minimalistiskt användargränssnitt för att omedelbart dra uppmärksamheten till säkerhetsrisker.
* Optimerad minneshantering i Service Workers: Kill Switch-regler och larm loggar rensas nu automatiskt upp direkt när en flik stängs ned.
