// ==UserScript==
// @name         Empik Laptop Scraper PRO v4
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      5.0
// @description  Stable Empik scraper (RAM/Disk/Price fixed)
// @match        https://www.empik.com/elektronika/komputery-i-laptopy/laptopy,362105,s*
// @match        https://www.empik.com/*,p*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/empik-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/empik-scraper.user.js
// ==/UserScript==

(function () {
  "use strict";

  const SITE = "EMPIK";
  const VERSION = "5.0";
  console.log("%c[EMPIK] userscript v" + VERSION + " loaded @ " + location.href, "color:#2d3436;font-weight:bold;");

  const START_URL = "https://www.empik.com/elektronika/komputery-i-laptopy/laptopy,362105,s";

  /* ===== CONFIG: endpoint stored in Tampermonkey storage (never committed) ===== */
  let GOOGLE_URL = GM_getValue("googleScriptURL", "");
  GM_registerMenuCommand("⚙️ Set Google Script URL", () => {
    const url = prompt("Paste your Google Apps Script /exec URL:", GOOGLE_URL);
    if (url !== null) {
      GOOGLE_URL = url.trim();
      GM_setValue("googleScriptURL", GOOGLE_URL);
      alert("Saved. Reload the page to apply.");
    }
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function log(...args) {
    console.log(`${SITE}:`, ...args);
  }

  function waitForElement(selector, timeout = 20000) {
    return new Promise(resolve => {
      const start = Date.now();
      const interval = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(interval);
          resolve(el);
        }
        if (Date.now() - start > timeout) {
          clearInterval(interval);
          resolve(null);
        }
      }, 300);
    });
  }

  function isProductPage() {
    return location.href.includes(",p");
  }

  function normalizePrice(text) {
    if (!text) return "";
    return text.replace(/\s+/g, "")
               .replace("zł", "")
               .replace(",", ".")
               .replace(/[^\d.]/g, "");
  }

  function extractCPU(title) {
    if (!title) return "";
    const t = title.toLowerCase();
    const match =
      t.match(/i[3579]-?\d+/i) ||
      t.match(/ryzen\s*\d+\s*\d*/i) ||
      t.match(/m\d/i);
    return match ? match[0] : "";
  }

  function extractRam(value) {
    if (!value) return { gb: "", type: "" };
    const upper = value.toUpperCase();

    const gbMatch = upper.match(/(\d+)\s*GB/);
    const gb = gbMatch ? parseInt(gbMatch[1]) : "";

    const typeMatch = upper.match(/DDR\d|LPDDR\d/);
    const type = typeMatch ? typeMatch[0] : "";

    return { gb, type };
  }

  function extractDisk(value) {
    if (!value) return { gb: "", type: "" };

    const upper = value.toUpperCase();
    let gb = "";
    let type = "";

    const tbMatch = upper.match(/(\d+)\s*TB/);
    const gbMatch = upper.match(/(\d+)\s*GB/);

    if (tbMatch) gb = parseInt(tbMatch[1]) * 1024;
    else if (gbMatch) gb = parseInt(gbMatch[1]);

    if (upper.includes("SSD")) type = "SSD";
    else if (upper.includes("HDD")) type = "HDD";
    else if (upper.includes("NVME")) type = "NVMe";
    else if (upper.includes("EMMC")) type = "eMMC";

    return { gb, type };
  }

  function collectLinks() {
    const anchors = Array.from(
      document.querySelectorAll(".search-list-item-hover a.seoTitle")
    );
    return anchors.map(a => a.href).filter(h => h.includes(",p"));
  }

  async function parseProduct() {

    log("Waiting for DetailedData...");
    const table = await waitForElement("#DetailedData table tbody");
    if (!table) {
      location.href = sessionStorage.getItem("listUrl") || START_URL;
      return;
    }

    const rows = Array.from(table.querySelectorAll("tr[data-ta='row']"));

    let title = "";
    let producer = "";

    let ramGB = "";
    let ramType = "";
    let diskGB = "";
    let diskType = "";

    rows.forEach(row => {

      const label = row.querySelector("th")?.innerText.trim();
      const value = row.querySelector(".detailed-data-text-value")?.innerText.trim();

      if (!label || !value) return;

      if (label.includes("Nazwa")) title = value;
      if (label.includes("Producent")) producer = value;

      // RAM
      if (label.includes("Pamięć RAM")) {
        const ram = extractRam(value);
        ramGB = ram.gb;
        ramType = ram.type;
      }

      if (label.includes("Typ pamięci")) {
        ramType = value;
      }

      // DISK
      if (label.includes("Pamięć wbudowana")) {
        const disk = extractDisk(value);
        diskGB = disk.gb;
      }

      if (label.includes("Dysk")) {
        const disk = extractDisk(value);
        diskGB = disk.gb;
        diskType = disk.type;
      }

      if (label.includes("Typ dysku")) {
        diskType = value;
      }
    });

    // Producer rule
    if (!producer && title) {
      const parts = title.split(" ");
      if (parts[0].toLowerCase() === "laptop") {
        producer = parts[1];
      } else {
        producer = parts[0];
      }
    }

    let model = "";
    if (title) {
      const parts = title.split(" ");
      if (parts[0].toLowerCase() === "laptop") {
        model = parts.slice(2).join(" ");
      } else {
        model = parts.slice(1).join(" ");
      }
    }

    const priceEl = await waitForElement("span[data-ta='price']");
    const price = priceEl ? normalizePrice(priceEl.innerText) : "";

    const cpu = extractCPU(title);

    const data = {
      Producer: producer || "",
      Model: model || "",
      Price: price,
      CPU: cpu,
      RAM_GB: ramGB,
      RAM_Type: ramType,
      Disk_GB: diskGB,
      Disk_Type: diskType,
      Date: new Date().toISOString(),
      Link: location.href
    };

    log("Parsed:", data);

    const result = await sendToGoogle(data);

    if (!result.ok) {
      const detail = extractError(result);
      console.error("%c[EMPIK] ⛔ STOPPED — send failed. HTTP " + (result.status || "-") + " — " + detail,
        "color:#c0392b;font-weight:bold;font-size:14px;");
      console.error("[EMPIK] full response body:", result.body);
      alert("EMPIK: надсилання в Google НЕ вдалося — скрипт зупинено.\n\n" +
            "HTTP status: " + (result.status || "-") + "\n\n" +
            "Повідомлення від Google:\n" + detail + "\n\n" +
            "(повна відповідь — у консолі F12). Виправ і онови сторінку.");
      return; // STOP: do not navigate back / continue
    }

    await sleep(1200);
    location.href = sessionStorage.getItem("listUrl") || START_URL;
  }

  // Returns { ok, status, body, parsed, error } — ok === true ONLY on {"ok":true} from doPost
  function sendToGoogle(row) {
    return new Promise(resolve => {
      log("→ sending:", row);
      GM_xmlhttpRequest({
        method: "POST",
        url: GOOGLE_URL,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ sheetName: "Empik", data: [row] }),
        onload: res => {
          log("← Google status:", res.status);
          log("← Google response:", res.responseText);
          let ok = false, parsed = null;
          try {
            parsed = JSON.parse(res.responseText);
            ok = (res.status >= 200 && res.status < 300) && parsed && parsed.ok === true;
            if (!ok) console.error("[EMPIK] ⚠ server returned NOT ok:", parsed);
          } catch (e) {
            console.error("[EMPIK] ⚠ response is NOT JSON (likely a Google error page):", e);
          }
          resolve({ ok, status: res.status, body: res.responseText, parsed });
        },
        onerror: err => { console.error("[EMPIK] ✖ request FAILED (network):", err); resolve({ ok: false, error: "network" }); },
        ontimeout: () => { console.error("[EMPIK] ✖ request TIMEOUT"); resolve({ ok: false, error: "timeout" }); }
      });
    });
  }

  function extractError(result) {
    if (result.error) return result.error;
    if (result.parsed && result.parsed.error) return String(result.parsed.error);
    if (result.body) {
      let m = result.body.match(/600px"[^>]*>([^<]+)</)
           || result.body.match(/class="errorMessage"[^>]*>([^<]+)</)
           || result.body.match(/<title>([^<]+)<\/title>/i);
      if (m) return m[1].trim();
      return result.body.slice(0, 300);
    }
    return "unknown error (HTTP " + (result.status || "-") + ")";
  }

  async function processList() {

  const ready = await waitForElement(".search-list-item-hover a.seoTitle");
  if (!ready) return;

  sessionStorage.setItem("listUrl", location.href);

  let links = JSON.parse(sessionStorage.getItem("links") || "null");
  let index = parseInt(sessionStorage.getItem("index") || "0");

  if (!links) {
    links = collectLinks();
    sessionStorage.setItem("links", JSON.stringify(links));
    sessionStorage.setItem("index", "0");
    index = 0;
    log("Collected:", links.length);
  }

  if (index < links.length) {
    sessionStorage.setItem("index", index + 1);
    location.href = links[index];
    return;
  }

  // ---- Сторінка завершена ----
  sessionStorage.removeItem("links");
  sessionStorage.removeItem("index");

  const nextBtn = document.querySelector("a.ta-next-page");

  if (nextBtn && nextBtn.href) {
    log("Next page:", nextBtn.href.trim());
    location.href = nextBtn.href.trim();
  } else {
    log("Stopping — no next button");
  }
}


  async function run() {
    log("Started:", location.href);

    if (!GOOGLE_URL) {
      log("Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
      return;
    }

    if (isProductPage()) {
      await parseProduct();
    } else {
      await processList();
    }
  }

  // run even if the 'load' event already fired before injection (document-idle)
  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run);
  }

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      run();
    }
  }, 800);

})();
