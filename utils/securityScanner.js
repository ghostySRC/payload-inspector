/**
 * Security Scanner Module for Payload Inspector Pro (v1.0.3)
 * Implements real-time asynchronous security inspection for HTTP traffic.
 */

// In-memory cache for Brute-Force heuristics: Maps IP address to an array of recent request timestamps
const ipRequestCache = new Map();

// Datacenter IP checker (AWS, GCP, Azure, and Tor exit node subnets)
function isDatacenterOrProxyIP(ip) {
    if (!ip) return false;
    
    // Parse IPv4 address
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
        return false;
    }
    
    const [p0, p1, p2, p3] = parts;
    
    // AWS: 3.*, 15.*, 18.*, 52.*, 54.*
    if (p0 === 3 || p0 === 15 || p0 === 18 || p0 === 52 || p0 === 54) {
        return true;
    }
    
    // GCP: 34.*, 35.*
    if (p0 === 34 || p0 === 35) {
        return true;
    }
    // GCP: 104.196.* to 104.199.*
    if (p0 === 104 && p1 >= 196 && p1 <= 199) {
        return true;
    }
    
    // Azure: 13.*, 40.*
    if (p0 === 13 || p0 === 40) {
        return true;
    }
    // Azure: 52.136.* to 52.143.*
    if (p0 === 52 && p1 >= 136 && p1 <= 143) {
        return true;
    }
    
    // Tor/Proxy common exit nodes (e.g., 185.220.101.x, 109.70.100.x, 199.249.230.x)
    if (p0 === 185 && p1 === 220 && p2 === 101) return true;
    if (p0 === 109 && p1 === 70 && p2 === 100) return true;
    if (p0 === 199 && p1 === 249 && p2 === 230) return true;
    
    return false;
}

/**
 * Scans a request payload and headers for security anomalies, SQLi, XSS, and bot patterns.
 * 
 * @param {any} body - The body payload (parsed JSON or raw string)
 * @param {object} headers - Object containing request headers (lowercased keys)
 * @param {string} url - The request URL
 * @param {string} method - The HTTP method
 * @returns {Promise<{ isSuspicious: boolean; reasons: string[] }>}
 */
async function scanPayload(body, headers = {}, url = "", method = "POST") {
    const result = {
        isSuspicious: false,
        reasons: []
    };

    try {
        const urlStr = String(url || "");
        const bodyStr = typeof body === "object" ? JSON.stringify(body) : String(body || "");
        const combinedData = urlStr + " " + bodyStr;

        // --- 1. SQL Injection (SQLi) Detection ---
        const sqliRegex = /(\b(SELECT|UNION|INSERT|UPDATE|DELETE|DROP|ALTER|WHERE|OR)\b)|('--')|(\/\*)/gi;
        if (sqliRegex.test(combinedData)) {
            result.reasons.push("Potentiell SQL-injektion detekterad i payload");
        }

        // --- 2. Cross-Site Scripting (XSS) Detection ---
        const xssRegex = /(<script.*?>)|(javascript:)|(onerror=|onload=|onclick=)/gi;
        if (xssRegex.test(combinedData)) {
            result.reasons.push("Potentiell XSS-injektion detekterad i payload");
        }

        // --- 3. Sensitive Data Exfiltration Detection ---
        // Sweden Personnummer pattern: YYYYMMDD-XXXX or YYMMDD-XXXX
        const ssnRegex = /\b(19|20)?\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-+]?\d{4}\b/g;
        const sensitiveKeyRegex = /(password|passwd|creditcard|cvv)/i;

        let hasSensitiveData = false;
        if (ssnRegex.test(combinedData)) {
            result.reasons.push("Känslig data detekterad (Personnummer)");
            hasSensitiveData = true;
        }

        if (sensitiveKeyRegex.test(combinedData)) {
            // Check if it's sent to an untrusted domain (if we can verify external target)
            // But let's log it generally as sensitive content exfiltration
            result.reasons.push("Känslig data detekterad (Lösenord/Kreditkort/CVV)");
            hasSensitiveData = true;
        }

        // --- 4. User-Agent Anomalies & Spoofing ---
        const userAgent = String(headers["user-agent"] || "").toLowerCase();
        const secChUa = headers["sec-ch-ua"];

        // Simple Bot detection (curl, wget, postman, headless, etc.)
        const botKeywords = ["curl", "wget", "python-requests", "headless", "postman"];
        const isBot = botKeywords.some(keyword => userAgent.includes(keyword));
        if (isBot) {
            result.reasons.push("Misstänkt automatiserad bot/skript detekterat via User-Agent");
        }

        // Chrome/Safari spoofing check: Claims to be Chrome/Safari but Client Hints are missing
        if ((userAgent.includes("chrome") || userAgent.includes("safari")) && !userAgent.includes("mobile")) {
            // Chrome on desktop always sends sec-ch-ua in modern versions
            if (userAgent.includes("chrome") && !secChUa) {
                result.reasons.push("Misstänkt automatiserat skript (User-Agent Spoofing)");
            }
        }

        // --- 5. Infrastructure IP Detection (AWS/Azure/GCP/Tor exit nodes) ---
        // Extract client/source IP from proxy headers
        const sourceIp = headers["x-forwarded-for"] || headers["x-real-ip"] || headers["remote-address"] || "127.0.0.1";
        // Clean IP (handles comma-separated list from X-Forwarded-For)
        const clientIp = sourceIp.split(",")[0].trim();

        // Check if URL represents a sensitive endpoint
        const sensitiveEndpoints = ["login", "auth", "password", "payment", "checkout"];
        const isSensitiveEndpoint = sensitiveEndpoints.some(keyword => urlStr.toLowerCase().includes(keyword));

        if (isDatacenterOrProxyIP(clientIp) && (isSensitiveEndpoint || hasSensitiveData)) {
            result.reasons.push("Anrop från molninfrastruktur/Proxy vid känslig transaktion");
        }

        // --- 6. Brute-Force Heuristics ---
        if (clientIp && isSensitiveEndpoint) {
            const now = Date.now();
            if (!ipRequestCache.has(clientIp)) {
                ipRequestCache.set(clientIp, []);
            }
            const timestamps = ipRequestCache.get(clientIp);
            timestamps.push(now);

            // Keep cache size at maximum of 10 items
            if (timestamps.length > 10) {
                timestamps.shift();
            }

            // If we have at least 5 requests, check rate (more than 5 requests per second)
            if (timestamps.length >= 5) {
                const fifthLatest = timestamps[timestamps.length - 5];
                const timeDiff = now - fifthLatest;
                if (timeDiff <= 1000) {
                    result.reasons.push("Potentiell Brute-Force / Rate-Limit överskriden");
                }
            }
        }

        // Finalize state
        if (result.reasons.length > 0) {
            result.isSuspicious = true;
        }

    } catch (error) {
        // Silent internal error logging to prevent crashes, as requested
        console.error("Security scanner encountered a silent error:", error);
        result.isSuspicious = false;
        result.reasons = [];
    }

    return result;
}

// Bind scanPayload to global scope for importScripts compatibility
globalThis.scanPayload = scanPayload;
