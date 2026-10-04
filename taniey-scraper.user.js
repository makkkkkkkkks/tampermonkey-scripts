// ==UserScript==
// @name         TANIEY SCRAPER STABLE PAGINATION
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      3.0
// @match        https://taniey.pl/kategoria/laptopy-9993205*
// @match        https://taniey.pl/oferta/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/taniey-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/taniey-scraper.user.js
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

const SHEET_NAME = "taniey";
const STORAGE_KEY = "taniey_pagination_v1";

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function normalize(s){ return String(s||"").replace(/\s+/g," ").trim(); }
function extractNumber(text){ const m = String(text||"").match(/(\d+)/); return m?m[1]:""; }

function getState(){
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"index":0,"page":1}');
}
function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ================= PRODUCER + MODEL ================= */

function deriveProducerModel(title){

  title = normalize(title);

  const parts = title.split(" ").filter(Boolean);

  if(parts.length === 0) return { producer:"", model:"" };

  let index = 0;

  // якщо перше слово Laptop → пропускаємо
  if(/^laptop$/i.test(parts[0])){
    index = 1;
  }

  const producer = parts[index] || "";
  const modelWord1 = parts[index + 1] || "";
  const modelWord2 = parts[index + 2] || "";

  const model = normalize(modelWord1 + " " + modelWord2);

  return {
    producer: normalize(producer),
    model
  };
}



/* ================= CATEGORY ================= */

async function processCategory(){

  const state = getState();
  state.page = parseInt(new URLSearchParams(location.search).get("page")) || 1;

  const links = [...document.querySelectorAll(".product-item a.product-item__info-name")]
    .map(a=>a.href);

  if(state.index < links.length){
    const link = links[state.index];
    state.index++;
    saveState(state);

    await sleep(50);
    window.location.href = link;
    return;
  }

  // кінець сторінки → наступна
  state.index = 0;
  state.page++;
  saveState(state);

  await sleep(50);
  window.location.href = location.origin + location.pathname + "?page=" + state.page;
}

/* ================= PRODUCT ================= */

async function processProduct(){

  await sleep(50);

  const openBtn = document.querySelector("a[data-bs-toggle='offcanvas'][href='#attributesSidebar']");
  if(openBtn) openBtn.click();

  await sleep(100);

  const rows = document.querySelectorAll("#attributesSidebar table tr");
  if(!rows.length) return;

  const data = {};
  rows.forEach(row=>{
    const key = row.children[0]?.innerText.trim().replace(":","");
    const value = row.children[1]?.innerText.trim();
    if(key && value) data[key] = value;
  });

  const title = document.querySelector("h1")?.innerText || document.title;
  const { producer, model } = deriveProducerModel(title);

  let price = "";
  const priceEl = document.querySelector(".product-single-price");
  if(priceEl){
    price = priceEl.innerText
      .replace("zł","")
      .replace(/\s+/g,"")
      .replace(",",".")
      .trim();
  }

  const productData = {
    producer,
    model,
    price,
    cpu: data["Seria procesora"] || "",
    ram_gb: extractNumber(data["Wielkość pamięci RAM"]),
    ram_type: data["Typ pamięci RAM"] || "",
    disk_size: extractNumber(data["Pojemność dysku"]),
    disk_type: data["Typ dysku twardego"] || "",
    link: location.href
  };

  GM_xmlhttpRequest({
    method:"POST",
    url:googleScriptURL,
    headers:{ "Content-Type":"application/json" },
    data:JSON.stringify({
      sheetName:SHEET_NAME,
      data:[productData]
    })
  });

  await sleep(100);

  const state = getState();
  window.location.href = location.origin + "/kategoria/laptopy-9993205?page=" + state.page;
}

/* ================= RUN ================= */

window.addEventListener("load", async ()=>{
  if(!googleScriptURL){
    console.warn("[TANIEY] Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
    return;
  }
  if(location.href.includes("/oferta/")){
    await processProduct();
  } else {
    await processCategory();
  }
});

})();
