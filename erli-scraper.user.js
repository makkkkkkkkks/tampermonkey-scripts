// ==UserScript==
// @name         ERLI Deep Scraper PRO v3
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      4.0
// @description  Stable ERLI scraper (fixed navigation + producer parsing)
// @match        https://tip.erli.pl/*
// @match        https://erli.pl/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/erli-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/erli-scraper.user.js
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = "4.0";
    console.log("%c[ERLI] userscript v" + VERSION + " loaded @ " + location.href, "color:#8e44ad;font-weight:bold;");

    const BASE_URL = "https://tip.erli.pl/produkty?cat[]=2322";

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

    function log(...args) {
        console.log("ERLI:", ...args);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForElement(selector, timeout = 15000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(400);
        }
        return null;
    }

    function isProductPage() {
        return window.location.href.includes("/produkt/");
    }

    function normalizePrice() {
        const strong = document.querySelector(".Wyas6_M strong")?.innerText || "";
        const decimal = document.querySelector(".Wyas6_M .o4b1m91")?.innerText || "";
        return (strong + decimal)
            .replace(/\s+/g, "")
            .replace("zł", "")
            .replace(",", ".");
    }

    async function parseProduct() {

        log("Waiting for product params...");

        const params = await waitForElement("#product-params");
        if (!params) {
            log("❌ Product params not found");
            return null;
        }

        const data = {
            Producer: "",
            Model: "",
            Price: "",
            CPU: "",
            RAM_GB: "",
            RAM_Type: "",
            Disk_GB: "",
            Disk_Type: "",
            Date: new Date().toISOString().split("T")[0],
            Link: window.location.href
        };

        // --- Назва ---
// --- Назва ---
const titleEl = document.querySelector("h1[data-e2e='heading-product-name']");
const title = titleEl ? titleEl.innerText.trim() : "";

if (title) {
    const parts = title.split(/\s+/);

    if (parts.length >= 2) {
        data.Producer = parts[1]; // друге слово
        data.Model = parts.slice(2).join(" ");
    }
}


        data.Price = normalizePrice();

        const specs = document.querySelectorAll("#product-params dl");

        specs.forEach(dl => {
            const key = dl.querySelector("dt")?.innerText.trim();
            const value = dl.querySelector("dd")?.innerText.trim();
            if (!key || !value) return;

            if (key.includes("Model procesora")) data.CPU = value;
            if (key.includes("Wielkość pamięci RAM")) data.RAM_GB = value.replace(/\D/g, "");
            if (key.includes("Typ pamięci RAM")) data.RAM_Type = value;
            if (key.includes("Pojemność dysku")) data.Disk_GB = value.replace(/\D/g, "");
            if (key.includes("Typ dysku twardego")) data.Disk_Type = value;
        });

        log("✅ Parsed:", data);
        return data;
    }

    // Returns { ok, status, body, parsed, error } — ok === true ONLY on {"ok":true} from doPost
    function sendToGoogle(row) {

        return new Promise(resolve => {

            log("📤 → sending:", row);

            GM_xmlhttpRequest({
                method: "POST",
                url: GOOGLE_URL,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({ sheetName: "Erli", data: [row] }),

                onload: function(res) {
                    log("← Google status:", res.status);
                    log("← Google response:", res.responseText);
                    let ok = false, parsed = null;
                    try {
                        parsed = JSON.parse(res.responseText);
                        ok = (res.status >= 200 && res.status < 300) && parsed && parsed.ok === true;
                        if (!ok) console.error("[ERLI] ⚠ server returned NOT ok:", parsed);
                    } catch (e) {
                        console.error("[ERLI] ⚠ response is NOT JSON (likely a Google error page):", e);
                    }
                    resolve({ ok, status: res.status, body: res.responseText, parsed });
                },

                onerror: function(err) { console.error("[ERLI] ✖ request FAILED (network):", err); resolve({ ok: false, error: "network" }); },
                ontimeout: function() { console.error("[ERLI] ✖ request TIMEOUT"); resolve({ ok: false, error: "timeout" }); }
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

    async function processProduct() {

        const data = await parseProduct();

        if (!data) {
            window.location.href = sessionStorage.getItem("erli_list_url") || BASE_URL;
            return;
        }

        const result = await sendToGoogle(data);

        if (!result.ok) {
            const detail = extractError(result);
            console.error("%c[ERLI] ⛔ STOPPED — send failed. HTTP " + (result.status || "-") + " — " + detail,
                "color:#c0392b;font-weight:bold;font-size:14px;");
            console.error("[ERLI] full response body:", result.body);
            alert("ERLI: надсилання в Google НЕ вдалося — скрипт зупинено.\n\n" +
                  "HTTP status: " + (result.status || "-") + "\n\n" +
                  "Повідомлення від Google:\n" + detail + "\n\n" +
                  "(повна відповідь — у консолі F12). Виправ і онови сторінку.");
            return; // STOP: do not navigate back / continue
        }

        await sleep(1500);

        log("⬅ Returning to list...");
        window.location.href = sessionStorage.getItem("erli_list_url") || BASE_URL;
    }

    async function processList() {

        log("Waiting for product list...");

        const ready = await waitForElement("a.ORthIsl");
        if (!ready) {
            log("❌ No products found. Stopping.");
            return;
        }

        let links = JSON.parse(sessionStorage.getItem("erli_links") || "null");

        if (!links) {
            links = Array.from(document.querySelectorAll("a.ORthIsl"))
                .map(a => a.href);

            log("Collected:", links.length, "products");

            sessionStorage.setItem("erli_links", JSON.stringify(links));
            sessionStorage.setItem("erli_index", "0");
        }

        sessionStorage.setItem("erli_list_url", window.location.href);

        let index = parseInt(sessionStorage.getItem("erli_index"));

        if (index < links.length) {
            sessionStorage.setItem("erli_index", index + 1);
            log("Opening:", links[index]);
            window.location.href = links[index];
            return;
        }

        // --- NEXT PAGE ---
        sessionStorage.removeItem("erli_links");
        sessionStorage.removeItem("erli_index");

        const currentPage = new URL(window.location.href).searchParams.get("page") || 1;
        const nextPage = parseInt(currentPage) + 1;

        const nextUrl = `${BASE_URL}&page=${nextPage}`;

        log("➡ Next page:", nextUrl);

        await sleep(2000);
        window.location.href = nextUrl;
    }

    async function run() {
        log("Script started on:", window.location.href);

        if (!GOOGLE_URL) {
            log("Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
            return;
        }

        if (isProductPage()) {
            await processProduct();
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

})();
