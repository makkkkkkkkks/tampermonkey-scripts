// ==UserScript==
// @name         SHOPLET SCRAPER FINAL
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      3.0
// @description  Stable scraper for shoplet.pl with SPA pagination + full logging
// @match        https://shoplet.pl/21-laptopy*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/shoplet-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/shoplet-scraper.user.js
// ==/UserScript==

(function () {
'use strict';

/* ================= CONFIG ================= */
/* endpoint stored in Tampermonkey storage (never committed) */
let googleScriptURL = GM_getValue("googleScriptURL", "");
GM_registerMenuCommand("⚙️ Set Google Script URL", () => {
    const url = prompt("Paste your Google Apps Script /exec URL:", googleScriptURL);
    if (url !== null) {
        googleScriptURL = url.trim();
        GM_setValue("googleScriptURL", googleScriptURL);
        alert("Saved. Reload the page to apply.");
    }
});

const STORAGE_KEY = "shoplet_state_v3";
const SHEET_NAME = "shoplet";

/* ================= LOG ================= */

function log(...args){
    console.log("%c[SHOPLET]", "color:#6c5ce7;font-weight:bold;", ...args);
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

GM_registerMenuCommand("RESET SHOPLET SCRAPER", ()=>{
    localStorage.removeItem(STORAGE_KEY);
    alert("State cleared");
});

/* ================= UTILS ================= */

function normalizePrice(text){
    if(!text) return "";
    return text.replace(/ /g,"")
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

function parseTitle(fullTitle){

    let words = fullTitle.trim().split(" ");

    if(words[0].toLowerCase() === "laptop"){
        words.shift();
    }

    const producer = words[0] || "";
    const model = words.slice(1,4).join(" ");

    return { producer, model };
}

/* ================= PARSE ================= */

function parseList(){

    const products = document.querySelectorAll(".product-item");

    log("Detected products:", products.length);

    const results = [];

    products.forEach((p,index)=>{

        const nameEl = p.querySelector(".product-name-custom a");
        const priceEl = p.querySelector(".price.product-price");
        const params = p.querySelectorAll(".highlighted-parameters p");

        if(!nameEl || !priceEl) return;

        const fullTitle = nameEl.innerText.trim();
        const link = nameEl.href;
        const price = normalizePrice(priceEl.innerText);

        const { producer, model } = parseTitle(fullTitle);

        let cpu="";
        let ram="";
        let disk="";

        params.forEach(param=>{
            const text = param.innerText;

            if(text.includes("Seria procesora")){
                cpu = text.split(":")[1]?.trim() || "";
            }

            if(text.includes("Wielkość pamięci RAM")){
                ram = extractNumber(text);
            }

            if(text.includes("Pojemność dysku")){
                disk = extractNumber(text);
            }
        });

        const productData = {
            producer,
            model,
            price,
            cpu,
            ram_gb: ram,
            ram_type: "",
            disk_size: disk,
            disk_type: "",
            link
        };

        log(`Parsed [${index+1}]`, productData);

        results.push(productData);
    });

    log("Total parsed:", results.length);

    return results;
}

/* ================= PAGINATION ================= */

function getCurrentPage(){
    const hash = location.hash;
    const match = hash.match(/page-(\d+)/);
    return match ? parseInt(match[1]) : 1;
}

function goNextPage(){

    const next = getCurrentPage() + 1;
    const base = location.href.split("#")[0];
    const nextUrl = base + "#/page-" + next;

    log("Next page:", nextUrl);

    setTimeout(()=>{
        window.location.href = nextUrl;
    }, 6000);
}

/* ================= GOOGLE ================= */

function sendToGoogle(data){

    log("Sending to Google...");
    log("Sheet:", SHEET_NAME);
    log("Count:", data.length);

    return new Promise(resolve=>{

        GM_xmlhttpRequest({
            method:"POST",
            url:googleScriptURL,
            headers:{ "Content-Type":"application/json" },
            data:JSON.stringify({
                sheetName:SHEET_NAME,
                data:data
            }),
            onload:(response)=>{
                log("Google STATUS:", response.status);
                log("Google RESPONSE:", response.responseText);
                resolve();
            },
            onerror:(error)=>{
                console.error("[GOOGLE ERROR]", error);
                resolve();
            }
        });

    });
}

/* ================= RUN ENGINE ================= */

let isRunning = false;

async function run(){

    if(!googleScriptURL){
        log("Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
        return;
    }

    if(isRunning){
        log("Already running");
        return;
    }

    isRunning = true;

    log("Current URL:", location.href);

    let attempts = 0;
    while(document.querySelectorAll(".product-item").length === 0 && attempts < 25){
        await sleep(1500);
        attempts++;
        log("Waiting products...", attempts);
    }

    const productsCount = document.querySelectorAll(".product-item").length;

    if(productsCount === 0){
        log("No products detected. Stop.");
        isRunning = false;
        return;
    }

    const state = getState();

    if(state.visitedPages.includes(location.href)){
        log("Already processed this page.");
        isRunning = false;
        goNextPage();
        return;
    }

    const data = parseList();

    await sendToGoogle(data);

    state.visitedPages.push(location.href);
    saveState(state);

    log("Page completed:", location.href);

    isRunning = false;

    goNextPage();
}

/* ================= LISTENERS ================= */

window.addEventListener("load", run);

window.addEventListener("hashchange", ()=>{
    log("Hash changed → re-run");
    setTimeout(run, 4000);
});

/* SPA fallback checker */

setInterval(()=>{
    if(!isRunning){
        const count = document.querySelectorAll(".product-item").length;
        if(count > 0){
            log("DOM changed detected → run");
            run();
        }
    }
}, 7000);

})();
