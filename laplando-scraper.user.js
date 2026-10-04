// ==UserScript==
// @name         Laplando Deep Scraper FINAL PRO v14
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      16.0
// @description  Stateless list-page scraper (no visited state) — parses product tiles and paginates by URL
// @match        https://laplando.pl/Laptopy-c24*
// @match        https://www.laplando.pl/Laptopy-c24*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/laplando-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/laplando-scraper.user.js
// ==/UserScript==

(function () {
'use strict';

const VERSION = "16.0";
console.log("%c[LAPLANDO] userscript v" + VERSION + " loaded @ " + location.href, "color:#e67e22;font-weight:bold;");

const BASE_URL = "https://laplando.pl/Laptopy-c24";
const SHEET_NAME = "Laplando";

/* ===== CONFIG: endpoint stored in Tampermonkey storage (never committed) ===== */
let googleScriptURL = GM_getValue("googleScriptURL", "");
GM_registerMenuCommand("⚙️ Set Google Script URL", () => {
    const url = prompt("Paste your Google Apps Script /exec URL:", googleScriptURL);
    if (url !== null) {
        googleScriptURL = url.trim();
        GM_setValue("googleScriptURL", googleScriptURL);
        alert("Saved. Reload the page to apply.");
    }
});
GM_registerMenuCommand("▶ Start from page 1", () => { location.href = BASE_URL; });

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ================= PARSER ================= */

function parseCard(tile){
    const nameEl = tile.querySelector(".product-name a");
    if(!nameEl) return null;

    const title = (nameEl.getAttribute("title") || nameEl.innerText || "").trim();
    const link = nameEl.href;

    // price (clean number from data-price)
    const priceEl = tile.querySelector(".core_priceFormat");
    let price = "";
    if(priceEl){
        price = (priceEl.getAttribute("data-price") || priceEl.innerText || "")
            .replace(/\s+/g,"").replace("zł","").replace(",",".").trim();
    }

    // title example: "Laptop Lenovo ThinkPad T490 i5-8265U, | 16GB 500GB SSD | 14\" 1920 x 1080 | Windows 11 Pro [A]"
    const segments = title.split("|").map(s=>s.trim());
    let head = (segments[0] || "").replace(/,+$/,"").trim();

    let words = head.split(/\s+/);
    if(words[0] && words[0].toLowerCase() === "laptop") words = words.slice(1);
    const producer = words[0] || "";

    // CPU
    const cpuMatch =
        head.match(/\bi[3579][-\s]?\d{3,5}\w*\b/i) ||
        head.match(/\bRyzen\s*\d+\s*(?:PRO\s*)?\d{3,5}\w*\b/i) ||
        head.match(/\b(?:Celeron|Pentium|Athlon)\b[\w\s-]*/i);
    const cpu = cpuMatch ? cpuMatch[0].replace(/,+$/,"").trim() : "";

    // model = words after producer up to the CPU token
    let afterProducer = words.slice(1).join(" ");
    let model = afterProducer;
    if(cpu){
        const idx = afterProducer.indexOf(cpu);
        if(idx > 0) model = afterProducer.slice(0, idx).trim();
    }
    model = model.replace(/,+$/,"").trim();

    // RAM + disk from the rest of the title
    const rest = segments.slice(1).join(" ");
    const ramMatch = rest.match(/(\d+)\s*GB/i);
    const ram_gb = ramMatch ? ramMatch[1] : "";

    let disk_size = "";
    let disk_type = "";
    const diskMatch = rest.match(/(\d+)\s*(GB|TB)\s*(SSD|HDD|NVMe|eMMC)/i);
    if(diskMatch){
        disk_size = diskMatch[2].toUpperCase() === "TB" ? parseInt(diskMatch[1])*1024 : diskMatch[1];
        disk_type = diskMatch[3].toUpperCase().replace("NVME","NVMe").replace("EMMC","eMMC");
    } else {
        const gbs = rest.match(/(\d+)\s*GB/gi);
        if(gbs && gbs.length >= 2) disk_size = (gbs[1].match(/\d+/) || [""])[0];
        if(/SSD/i.test(rest)) disk_type = "SSD";
        else if(/HDD/i.test(rest)) disk_type = "HDD";
    }

    return { producer, model, price, cpu, ram_gb, ram_type:"", disk_size, disk_type, link };
}

/* ================= GOOGLE ================= */

// Returns { ok, status, body, parsed, error } — ok === true ONLY on {"ok":true} from doPost
function sendToGoogle(batch){
    return new Promise(resolve=>{
        console.log("[LAPLANDO] → sending batch of", batch.length, "products");
        GM_xmlhttpRequest({
            method:"POST",
            url:googleScriptURL,
            headers:{"Content-Type":"application/json"},
            data:JSON.stringify({ sheetName:SHEET_NAME, data:batch }),
            onload:(res)=>{
                console.log("[LAPLANDO] ← Google status:", res.status);
                console.log("[LAPLANDO] ← Google response:", res.responseText);
                let ok=false, parsed=null;
                try {
                    parsed = JSON.parse(res.responseText);
                    ok = (res.status>=200 && res.status<300) && parsed && parsed.ok === true;
                    if(!ok) console.error("[LAPLANDO] ⚠ server returned NOT ok:", parsed);
                } catch(e){
                    console.error("[LAPLANDO] ⚠ response is NOT JSON (likely a Google error page):", e);
                }
                resolve({ ok, status:res.status, body:res.responseText, parsed });
            },
            onerror:(err)=>{ console.error("[LAPLANDO] ✖ request FAILED (network):", err); resolve({ ok:false, error:"network" }); },
            ontimeout:()=>{ console.error("[LAPLANDO] ✖ request TIMEOUT"); resolve({ ok:false, error:"timeout" }); }
        });
    });
}

function extractError(result){
    if(result.error) return result.error;
    if(result.parsed && result.parsed.error) return String(result.parsed.error);
    if(result.body){
        let m = result.body.match(/600px"[^>]*>([^<]+)</)
             || result.body.match(/class="errorMessage"[^>]*>([^<]+)</)
             || result.body.match(/<title>([^<]+)<\/title>/i);
        if(m) return m[1].trim();
        return result.body.slice(0, 300);
    }
    return "unknown error (HTTP " + (result.status || "-") + ")";
}

/* ================= PAGINATION ================= */

function getCurrentPage(){
    const m = location.pathname.match(/pa\/(\d+)/);
    return m ? parseInt(m[1]) : 1;
}

/* ================= RUN ================= */

async function run(){
    if(!googleScriptURL){
        console.warn("[LAPLANDO] Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
        return;
    }

    await sleep(1000);

    // wait for product tiles to render
    let tiles = document.querySelectorAll(".product-tile");
    let tries = 0;
    while(tiles.length === 0 && tries < 12){
        await sleep(500);
        tiles = document.querySelectorAll(".product-tile");
        tries++;
    }

    const page = getCurrentPage();

    // no tiles → end of catalog (or selector changed) → STOP
    if(tiles.length === 0){
        console.warn("%c[LAPLANDO] ⛔ No product tiles on page " + page + " — reached the end. Stopping.",
            "color:#c0392b;font-weight:bold;");
        return;
    }

    const batch = [];
    tiles.forEach(t=>{
        const d = parseCard(t);
        if(d && d.producer && d.price) batch.push(d);
    });

    console.log("[LAPLANDO] page", page, "— tiles:", tiles.length, "| parsed:", batch.length);

    if(batch.length === 0){
        console.warn("[LAPLANDO] ⛔ Tiles found but nothing parsed — stopping (check parseCard selectors).");
        return;
    }

    const result = await sendToGoogle(batch);

    // STOP on anything that is not a clean success
    if(!result.ok){
        const detail = extractError(result);
        console.error("%c[LAPLANDO] ⛔ STOPPED — send failed. HTTP " + (result.status||"-") + " — " + detail,
            "color:#c0392b;font-weight:bold;font-size:14px;");
        console.error("[LAPLANDO] full response body:", result.body);
        alert("LAPLANDO: надсилання в Google НЕ вдалося — скрипт зупинено.\n\n" +
              "HTTP status: " + (result.status || "-") + "\n\n" +
              "Повідомлення від Google:\n" + detail + "\n\n" +
              "(повна відповідь — у консолі F12). Виправ і онови сторінку, щоб продовжити.");
        return;
    }

    // delay, then next page by URL
    await sleep(1500);
    const nextUrl = BASE_URL + "/pa/" + (page + 1);
    console.log("[LAPLANDO] → next page:", nextUrl);
    location.href = nextUrl;
}

// run even if the 'load' event already fired before injection (document-idle)
if(document.readyState === "complete"){
    run();
} else {
    window.addEventListener("load", run);
}

})();
