// ==UserScript==
// @name         ExactSolution FINAL WORKING STABLE
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      9.0
// @description  Stable scraper via real navigation
// @match        https://www.exactsolution.com/products/search*
// @match        https://www.exactsolution.com/products/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/exactsolution-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/exactsolution-scraper.user.js
// ==/UserScript==

(function () {
    'use strict';

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

    const PRODUCT_DELAY = 2000;
    const PAGE_DELAY = 3000;

    /* ============================= */
    /* UTILITIES                     */
    /* ============================= */

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function isProductPage() {
        return location.pathname.startsWith("/products/")
            && !location.pathname.includes("search");
    }

    function extractNumber(value) {
        if (!value) return "";
        const clean = value.toUpperCase().replace(",", ".");
        if (clean.includes("TB")) return parseFloat(clean) * 1024;
        const match = clean.match(/[\d.]+/);
        return match ? parseFloat(match[0]) : "";
    }

    function sendToGoogle(rows) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "POST",
                url: GOOGLE_URL,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify(rows),
                onload: () => resolve(),
                onerror: () => resolve()
            });
        });
    }

    /* ============================= */
    /* COLLECT LINKS FROM SEARCH     */
    /* ============================= */

    function collectLinks() {
        return Array.from(document.querySelectorAll("a[href^='/products/']"))
            .filter(a => {
                const href = a.getAttribute("href");
                if (!href) return false;
                if (href.includes("search")) return false;
                if (href.includes("?")) return false;
                return true;
            })
            .map(a => location.origin + a.getAttribute("href"))
            .filter((v, i, arr) => arr.indexOf(v) === i);
    }

    async function waitForProducts() {
        let attempts = 0;
        while (attempts < 40) {
            const links = collectLinks();
            if (links.length > 0) return links;
            await sleep(500);
            attempts++;
        }
        return [];
    }

    /* ============================= */
    /* PARSE PRODUCT PAGE            */
    /* ============================= */

    function parseProductPage() {

        let baseData = {
            producer: "",
            model: "",
            price: "",
            condition: "",
            cpu: "",
            ram_gb: "",
            ram_type: "",
            disk_size: "",
            disk_type: "",
            description: "",
            link: location.href
        };

        const title = document.querySelector("h1")?.innerText.trim();

        if (title) {
            const parts = title.split(/\s+/);
            baseData.producer = parts[0];
            baseData.model = parts.slice(1).join(" ");
        }

        const descriptionText = Array.from(document.querySelectorAll("p, li"))
            .map(el => el.innerText.trim())
            .filter(Boolean)
            .join(" ");

        baseData.description = descriptionText;

        const cpuMatch = descriptionText.match(/Core\s+i[3579]/i);
        if (cpuMatch) baseData.cpu = cpuMatch[0];

        const ramMatch = descriptionText.match(/(\d+)\s*GB\s*(DDR\d)?\s*RAM/i);
        if (ramMatch) {
            baseData.ram_gb = parseInt(ramMatch[1]);
            baseData.ram_type = ramMatch[2] || "";
        }

        const storageMatch = descriptionText.match(/(\d+)\s*(GB|TB)\s*(SSD|HDD)/i);
        if (storageMatch) {
            let size = parseInt(storageMatch[1]);
            if (storageMatch[2].toUpperCase() === "TB") size *= 1024;
            baseData.disk_size = size;
            baseData.disk_type = storageMatch[3].toUpperCase();
        }

        const conditionBlocks = document.querySelectorAll("fieldset div[role='radiogroup'] label");

        let results = [];

        conditionBlocks.forEach(label => {
            const conditionName = label.querySelector("p")?.innerText.trim();
            const priceEl = label.querySelector(".css-nbo4kz");
            if (!conditionName || !priceEl) return;

            let copy = { ...baseData };
            copy.condition = conditionName;
            copy.price = priceEl.innerText.trim();

            results.push(copy);
        });

        if (results.length === 0) {
            const priceEl = document.querySelector(".css-1wed1i7");
            if (priceEl) baseData.price = priceEl.innerText.trim();
            results.push(baseData);
        }

        return results;
    }

    /* ============================= */
    /* FLOW CONTROL                  */
    /* ============================= */

    async function processSearchPage() {

        const links = await waitForProducts();

        if (!links.length) {
            console.log("No products found.");
            return;
        }

        sessionStorage.setItem("scrape_links", JSON.stringify(links));
        sessionStorage.setItem("scrape_index", "0");

        location.href = links[0];
    }

    async function processProductPage() {

        await sleep(PRODUCT_DELAY);

        const rows = parseProductPage();

        await sendToGoogle(rows);

        let index = parseInt(sessionStorage.getItem("scrape_index") || "0");
        const links = JSON.parse(sessionStorage.getItem("scrape_links") || "[]");

        index++;
        sessionStorage.setItem("scrape_index", index.toString());

        if (index < links.length) {
            location.href = links[index];
        } else {
            // pagination
            const url = new URL(sessionStorage.getItem("search_url") || document.referrer);
            const page = parseInt(url.searchParams.get("page") || "1");
            url.searchParams.set("page", page + 1);

            await sleep(PAGE_DELAY);
            location.href = url.toString();
        }
    }

    /* ============================= */
    /* RUN                           */
    /* ============================= */

    async function run() {

        if (!GOOGLE_URL) {
            console.warn("[EXACTSOLUTION] Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
            return;
        }

        if (!sessionStorage.getItem("search_url")) {
            sessionStorage.setItem("search_url", location.href);
        }

        if (isProductPage()) {
            await processProductPage();
        } else {
            await processSearchPage();
        }
    }

    run();

})();
