// ==UserScript==
// @name         Laplando Deep Scraper FINAL PRO v14
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      14.0
// @description  Stable scraper with RAM fix + clean restart
// @match        https://laplando.pl/Laptopy-c24*
// @match        https://laplando.pl/*-p*
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

function sendToGoogle(row){
    return new Promise(resolve=>{
        GM_xmlhttpRequest({
            method:"POST",
            url:googleScriptURL,
            headers:{"Content-Type":"application/json"},
            data:JSON.stringify([row]),
            onload:()=>resolve(),
            onerror:()=>resolve()
        });
    });
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

    await sendToGoogle(spec);

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

    console.log("Products found:",unique.length);
    console.log("Unvisited:",unvisited.length);

    if(unvisited.length===0){
        goNextPage();
        return;
    }

    location.href = unvisited[0];
}

/* ================= RUN ================= */

async function run(){
    if(!googleScriptURL){
        console.warn("[LAPLANDO] Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
        return;
    }
    if(isProductPage()){
        await processProduct();
    } else {
        await processListPage();
    }
}

window.addEventListener("load",run);

})();
