// ==UserScript==
// @name         VEDION SCRAPER STABLE
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      1.3
// @match        https://www.vedion.pl/laptopy-poleasingowe*
// @match        https://vedion.pl/laptopy-poleasingowe*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/vedion-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/vedion-scraper.user.js
// ==/UserScript==

(function () {
'use strict';

const VERSION = "1.3";
console.log("%c[VEDION] userscript v" + VERSION + " loaded @ " + location.href, "color:#0984e3;font-weight:bold;");

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

const SHEET_NAME = "vedion";
const STORAGE_KEY = "vedion_pagination_v1";

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function normalize(s){ return String(s||"").replace(/\s+/g," ").trim(); }
function extractNumber(text){ const m = String(text||"").match(/(\d+)/); return m?m[1]:""; }

function getState(){
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"page":1}');
}
function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ================= PARSER ================= */

function parseTitle(title){

  title = normalize(title).replace(/^Laptop\s+/i, "");

  const parts = title.split("/").map(p => normalize(p));

  const firstPart = parts[0];
  const words = firstPart.split(" ");

  const producer = words[0] || "";
  const model = words.slice(1,3).join(" "); // Latitude 7430

  const cpu = parts[1] || "";

  const ramFull = parts.find(p => /GB/i.test(p) && /DDR/i.test(p)) || "";
  const ram = extractNumber(ramFull);
  const ramTypeMatch = ramFull.match(/DDR\d/i);
  const ram_type = ramTypeMatch ? ramTypeMatch[0] : "";

  const diskFull = parts.find(p => /SSD|HDD/i.test(p)) || "";
  const disk = extractNumber(diskFull);
  const diskTypeMatch = diskFull.match(/SSD|HDD/i);
  const disk_type = diskTypeMatch ? diskTypeMatch[0] : "";

  return {
    producer,
    model,
    cpu,
    ram_gb: ram,
    ram_type,
    disk_size: disk,
    disk_type
  };
}

/* ================= SCRAPER ================= */

async function processPage(){

  await sleep(100);

  // wait for products to render (page is server-rendered, usually instant)
  let products = document.querySelectorAll(".product");
  let tries = 0;
  while(products.length === 0 && tries < 10){
    await sleep(500);
    products = document.querySelectorAll(".product");
    tries++;
  }

  // no products → this counter page does not exist / last page reached → STOP
  if(products.length === 0){
    console.log("[VEDION] No products found — reached the last page. Stopping pagination.");
    localStorage.removeItem(STORAGE_KEY); // reset so a fresh run starts from page 1
    return;
  }

  console.log("[VEDION] Products on this page:", products.length);

  for(const product of products){

    const titleEl = product.querySelector(".product__name");
    if(!titleEl) continue;

    const title = titleEl.innerText;
    const link = titleEl.href;

    const priceEl = product.querySelector(".price");
    let price = "";
    if(priceEl){
      price = priceEl.innerText
        .replace("zł","")
        .replace("/ szt.","")
        .replace(/\s+/g,"")
        .replace(",",".")
        .trim();
    }

    const parsed = parseTitle(title);

    const productData = {
      ...parsed,
      price,
      link
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
  }

  // наступна сторінка
  const state = getState();
  state.page++;
  saveState(state);

  await sleep(100);
  window.location.href = location.origin + location.pathname + "?counter=" + state.page;
}

/* ================= RUN ================= */

async function run(){
  if(!googleScriptURL){
    console.warn("[VEDION] Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
    return;
  }
  console.log("[VEDION] run() — scraping products on this page");
  await processPage();
}

// run even if the 'load' event already fired before injection (document-idle)
if(document.readyState === "complete"){
  run();
} else {
  window.addEventListener("load", run);
}

})();
