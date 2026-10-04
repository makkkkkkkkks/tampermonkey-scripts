// ==UserScript==
// @name         RNEW.PL
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      3.0
// @description  Scrape rnew.pl correctly with pagination
// @match        https://rnew.pl/pl/menu/laptopy-156*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/rnew-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/rnew-scraper.user.js
// ==/UserScript==

(function () {
'use strict';

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

const STORAGE_KEY = "rnew_state_v3";
const BASE_URL = "https://rnew.pl/pl/menu/laptopy-156.html";

/* ================= LOG ================= */

function log(...args){
    console.log("%c[RNEW SCRAPER]", "color:#00b894;font-weight:bold;", ...args);
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ================= STATE ================= */

function getState(){
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || JSON.stringify({
        visitedPages:[]
    }));
}

function saveState(state){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

GM_registerMenuCommand("RESET RNEW SCRAPER", ()=>{
    localStorage.removeItem(STORAGE_KEY);
    alert("State cleared");
});

/* ================= PAGINATION ================= */

function getCurrentCounter(){
    const params = new URLSearchParams(window.location.search);
    const counter = params.get("counter");
    return counter ? parseInt(counter) : 0;
}

function goNextPage(){

    const current = getCurrentCounter();
    const next = current + 1;

    const nextUrl = BASE_URL + "?counter=" + next;

    log("Going to next page:", nextUrl);

    setTimeout(()=>{
        window.location.href = nextUrl;
    }, 5000);
}

/* ================= PARSING ================= */

function normalizePrice(text){
    if(!text) return "";
    return text.replace(/ /g," ")
        .replace(/\s+/g,"")
        .replace("zł","")
        .replace(",",".");
}

function extractNumber(text){
    if(!text) return "";
    const upper = text.toUpperCase();

    if(upper.includes("TB")){
        const n = upper.match(/(\d+)/)?.[1];
        if(n) return parseInt(n)*1024;
    }

    return upper.match(/(\d+)/)?.[1] || "";
}

function extractModel(fullTitle){
    const cleaned = fullTitle.replace(/^Laptop\s+/i, "");
    const words = cleaned.split(" ");

    if(words.length >= 3){
        return words[1] + " " + words[2];
    }

    return cleaned;
}

function parseList(){

    const products = document.querySelectorAll(".product");
    log("Products detected:", products.length);

    const results = [];

    products.forEach(p=>{

        const nameEl = p.querySelector(".product__name");
        const priceEl = p.querySelector("strong.price");

        if(!nameEl || !priceEl) return;

        const fullTitle = nameEl.innerText.trim();
        const link = new URL(nameEl.getAttribute("href"), location.origin).href;
        const price = normalizePrice(priceEl.innerText);

        const cleaned = fullTitle.replace(/^Laptop\s+/i, "");
        const words = cleaned.split(" ");

        const producer = words[0] || "";
        const model = extractModel(fullTitle);

        let cpu="";
        let ram="";
        let disk="";

        const traits = p.querySelectorAll(".trait");

        traits.forEach(t=>{
            const key = t.querySelector(".trait__name")?.innerText.trim();
            const value = t.querySelector(".trait__value")?.innerText.trim();

            if(!key || !value) return;

            if(key.includes("Model procesora")) cpu = value;
            if(key.includes("Ilość pamięci")) ram = extractNumber(value);
            if(key.includes("Dysk")) disk = extractNumber(value);
        });

        results.push({
            producer: producer,
            model: model,
            price: price,
            cpu: cpu,
            ram_gb: ram,
            ram_type: "",
            disk_size: disk,
            disk_type: "",
            link: link
        });

    });

    return results;
}

/* ================= GOOGLE ================= */

function sendToGoogle(data){

    log("Sending to Google sheet: rnew");
    log("Products count:", data.length);

    return new Promise(resolve=>{

        GM_xmlhttpRequest({
            method:"POST",
            url:googleScriptURL,
            headers:{ "Content-Type":"application/json" },
            data:JSON.stringify({
                sheetName:"rnew",
                data:data
            }),
            onload:(response)=>{
                log("Google status:", response.status);
                log("Response:", response.responseText);
                resolve();
            },
            onerror:(error)=>{
                console.error("[GOOGLE ERROR]", error);
                resolve();
            }
        });

    });
}

/* ================= RUN ================= */

async function run(){

    if(!googleScriptURL){
        log("Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
        return;
    }

    await sleep(3000);

    const state = getState();

    if(state.visitedPages.includes(location.href)){
        log("Page already processed.");
        goNextPage();
        return;
    }

    const data = parseList();

    if(data.length === 0){
        log("No products found. Reached last page.");
        return;
    }

    await sendToGoogle(data);

    state.visitedPages.push(location.href);
    saveState(state);

    log("Page processed:", location.href);

    goNextPage();
}

window.addEventListener("load",run);

})();
