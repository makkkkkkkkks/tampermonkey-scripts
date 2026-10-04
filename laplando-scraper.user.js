// ==UserScript==
// @name         Laplando Deep Scraper FINAL PRO v14
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      15.4
// @description  Stable scraper with RAM fix + clean restart
// @match        https://laplando.pl/Laptopy-c24*
// @match        https://laplando.pl/*-p*
// @match        https://www.laplando.pl/Laptopy-c24*
// @match        https://www.laplando.pl/*-p*
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

const VERSION = "15.4";
console.log("%c[LAPLANDO] userscript v" + VERSION + " loaded @ " + location.href, "color:#e67e22;font-weight:bold;");

const BASE_URL = "https://laplando.pl/Laptopy-c24";

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

const STORAGE_KEY = "laplando_state_v1";

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function isProductPage(){ return location.href.includes("-p"); }

/* ================= STATE ================= */

function getState(){
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || JSON.stringify({
        visited:[],
        currentPage:1
    }));
}

function saveState(state){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState(){
    localStorage.removeItem(STORAGE_KEY);
}

GM_registerMenuCommand("RESET LAPLANDO SCRAPER", ()=>{
    clearState();
    alert("State cleared. Reload page.");
});

/* ================= HELPERS ================= */

function normalizePrice(text){
    if(!text) return "";
    return text.replace(/ /g," ")
        .replace(/\s+/g,"")
        .replace("zł","")
        .replace(",",".");
}

function extractRamGB(text){
    return text.match(/(\d+)\s*GB/i)?.[1] || "";
}

function extractDisk(text){
    const upper = text.toUpperCase();

    let gb="";
    if(upper.includes("TB")){
        const n = upper.match(/(\d+)/)?.[1];
        if(n) gb = parseInt(n)*1024;
    } else {
        gb = upper.match(/(\d+)\s*GB/)?.[1] || "";
    }

    let type="";
    if(upper.includes("SSD")) type="SSD";
    if(upper.includes("HDD")) type="HDD";
    if(upper.includes("NVME")) type="NVMe";
    if(upper.includes("EMMC")) type="eMMC";

    return {gb,type};
}

/* ================= PARSER ================= */

function parseSpecification(){

    let data = {
        producer:"",
        model:"",
        price:"",
        cpu:"",
        ram_gb:"",
        ram_type:"",
        disk_size:"",
        disk_type:"",
        link: location.href
    };

    const title = document.querySelector("h1")?.innerText.trim();
    if(title){
        const parts = title.split(/\s+/);
        data.producer = parts[0] || "";
        data.model = parts.slice(1).join(" ");
    }

    const priceEl = document.querySelector(".core_priceFormat");
    if(priceEl){
        data.price = normalizePrice(priceEl.innerText);
    }

    const rows = document.querySelectorAll("table.def tr.def");

rows.forEach(row=>{
    const tds = row.querySelectorAll("td");
    if(tds.length<2) return;

    const key = tds[0].innerText.trim().toLowerCase();
    const value = tds[1].innerText.trim();

    // CPU
    if(key.includes("procesor")){
        data.cpu = value;
    }

    if(!data.cpu && key.includes("seria procesora")){
        data.cpu = value;
    }

    // RAM
    if(key.includes("ilość pamięci ram")){
        data.ram_gb = extractRamGB(value);
    }

    if(key.includes("typ pamięci ram")){
        data.ram_type = value;
    }

    // Disk
    if(key === "dysk"){
        const disk = extractDisk(value);
        data.disk_size = disk.gb;
        if(disk.type) data.disk_type = disk.type;
    }

    if(key === "typ dysku"){
        data.disk_type = value;
    }
});


    return data;
}

/* ================= GOOGLE ================= */

// Returns { ok: boolean, status, body, error } — ok === true ONLY on {"ok":true} from doPost
function sendToGoogle(row){
    return new Promise(resolve=>{
        console.log("[LAPLANDO] → sending:", row);
        GM_xmlhttpRequest({
            method:"POST",
            url:googleScriptURL,
            headers:{"Content-Type":"application/json"},
            data:JSON.stringify({ sheetName:"Laplando", data:[row] }),
            onload:(res)=>{
                console.log("[LAPLANDO] ← Google status:", res.status);
                console.log("[LAPLANDO] ← Google response:", res.responseText);

                let ok = false;
                let parsed = null;
                try {
                    parsed = JSON.parse(res.responseText);
                    ok = (res.status >= 200 && res.status < 300) && parsed && parsed.ok === true;
                    if(!ok) console.error("[LAPLANDO] ⚠ server returned NOT ok:", parsed);
                } catch(e){
                    console.error("[LAPLANDO] ⚠ response is NOT JSON (likely a Google error page):", e);
                }
                resolve({ ok: ok, status: res.status, body: res.responseText, parsed: parsed });
            },
            onerror:(err)=>{ console.error("[LAPLANDO] ✖ request FAILED (network):", err); resolve({ ok:false, error:"network" }); },
            ontimeout:()=>{ console.error("[LAPLANDO] ✖ request TIMEOUT"); resolve({ ok:false, error:"timeout" }); }
        });
    });
}

// Pull a human-readable error out of whatever Google returned
function extractError(result){
    if(result.error) return result.error;                                  // network / timeout
    if(result.parsed && result.parsed.error) return String(result.parsed.error); // doPost {ok:false,error:...}
    if(result.body){
        // Google Apps Script HTML error page (e.g. "Функцію сценарію doPost не знайдено")
        let m = result.body.match(/600px"[^>]*>([^<]+)</)
             || result.body.match(/class="errorMessage"[^>]*>([^<]+)</)
             || result.body.match(/<title>([^<]+)<\/title>/i);
        if(m) return m[1].trim();
        return result.body.slice(0, 300);                                  // fallback: first 300 chars
    }
    return "unknown error (HTTP " + (result.status || "-") + ")";
}

/* ================= PRODUCT ================= */

async function processProduct(){

    await sleep(1000);

    let state = getState();

    if(state.visited.includes(location.href)){
        goBack();
        return;
    }

    const spec = parseSpecification();
    console.log("Parsed:",spec);

    const result = await sendToGoogle(spec);

    // STOP the whole scraper on anything that is not a clean success
    if(!result.ok){
        const detail = extractError(result);
        console.error("%c[LAPLANDO] ⛔ STOPPED — send failed. HTTP " + (result.status||"-") + " — " + detail,
            "color:#c0392b;font-weight:bold;font-size:14px;");
        console.error("[LAPLANDO] full response body:", result.body);
        alert("LAPLANDO: надсилання в Google НЕ вдалося — скрипт зупинено.\n\n" +
              "HTTP status: " + (result.status || "-") + "\n\n" +
              "Повідомлення від Google:\n" + detail + "\n\n" +
              "(повна відповідь — у консолі F12). Виправ і онови сторінку, щоб продовжити.");
        return; // ← do NOT mark visited, do NOT navigate further
    }

    state.visited.push(location.href);
    saveState(state);

    await sleep(1000);
    goBack();
}

/* ================= LIST ================= */

function getCurrentPage(){
    const match = location.pathname.match(/pa\/(\d+)/);
    return match ? parseInt(match[1]) : 1;
}

function goBack(){
    const state = getState();
    const page = state.currentPage || 1;

    if(page===1){
        location.href = BASE_URL + "/";
    } else {
        location.href = BASE_URL + "/pa/" + page;
    }
}

function goNextPage(){

    let state = getState();

    state.currentPage = (state.currentPage || 1) + 1;
    saveState(state);

    const nextUrl = BASE_URL + "/pa/" + state.currentPage;
    location.href = nextUrl;
}

async function processListPage(){

    await sleep(1500);

    const state = getState();
    state.currentPage = getCurrentPage();
    saveState(state);

    const links = Array.from(document.querySelectorAll('a[href*="-p"]'))
        .map(a=>a.href)
        .filter(link=>link.includes("laplando.pl"));

    const unique = [...new Set(links)];
    const unvisited = unique.filter(link=>!state.visited.includes(link));

    console.log("[LAPLANDO] Products found:",unique.length,"| Unvisited:",unvisited.length,"| page:",state.currentPage);

    // No product links at all → end of catalog (or selector broken) → STOP, don't flip forever
    if(unique.length===0){
        console.warn("%c[LAPLANDO] ⛔ No product links on this page — reached the end (or selector changed). Stopping.",
            "color:#c0392b;font-weight:bold;");
        return;
    }

    // All products on this page already done → go to the next page
    if(unvisited.length===0){
        console.log("[LAPLANDO] All products on this page already visited → next page. visited total:", state.visited.length);
        goNextPage();
        return;
    }

    console.log("[LAPLANDO] → opening product:", unvisited[0]);
    location.href = unvisited[0];
}

/* ================= RUN ================= */

async function run(){
    if(!googleScriptURL){
        console.warn("[LAPLANDO] Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
        return;
    }
    console.log("[LAPLANDO] run — isProductPage:", isProductPage(), "| url:", location.href);
    if(isProductPage()){
        await processProduct();
    } else {
        await processListPage();
    }
}

// run even if the 'load' event already fired before injection (document-idle)
if(document.readyState === "complete"){
  run();
} else {
  window.addEventListener("load", run);
}

})();
