// ==UserScript==
// @name         COMTRADE SCRAPER STABLE + LOGS
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      3.0
// @description  Scrapes comtrade.pl refurbished laptops and pushes rows to a Google Apps Script endpoint.
// @author       makkkkkkkkks
// @match        https://www.comtrade.pl/laptopy-poleasingowe*
// @match        https://comtrade.pl/laptopy-poleasingowe*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/comtrade-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/comtrade-scraper.user.js
// ==/UserScript==

(function () {
'use strict';

const VERSION = "3.0";
console.log("%c[COMTRADE] userscript v" + VERSION + " loaded @ " + location.href, "color:#16a085;font-weight:bold;");

/* ================= CONFIG =================
 * The Google Apps Script URL is a write-enabled endpoint (effectively a secret),
 * so it is NOT stored in the public repo. It lives in Tampermonkey local storage.
 * Set it once via the Tampermonkey menu: "⚙️ Set Google Script URL".
 */
let googleScriptURL = GM_getValue("googleScriptURL", "");
const SHEET_NAME = "comtrade";
const STORAGE_KEY = "comtrade_pagination_v2";

GM_registerMenuCommand("⚙️ Set Google Script URL", () => {
  const url = prompt("Paste your Google Apps Script /exec URL:", googleScriptURL);
  if (url !== null) {
    googleScriptURL = url.trim();
    GM_setValue("googleScriptURL", googleScriptURL);
    alert("Saved. Reload the page to apply.");
  }
});

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function normalize(s){ return String(s||"").replace(/\s+/g," ").trim(); }
function extractNumber(text){ const m = String(text||"").match(/(\d+)/); return m?m[1]:""; }

function getState(){
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"page":0}');
}
function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ================= PARSER ================= */

function parseTitle(title){
  title = normalize(title);
  const mainPart = title.split("Core")[0].trim();
  const words = mainPart.split(" ");
  const producer = words[0] || "";
  const model = words.slice(1).join(" ").trim();
  return { producer, model };
}

/* ================= SCRAPER ================= */

async function processPage(){

  console.log("[COMTRADE] === START PAGE SCRAPE ===");

  await sleep(500);

  // wait for products to render
  let products = document.querySelectorAll(".product");
  let tries = 0;
  while(products.length === 0 && tries < 10){
    await sleep(500);
    products = document.querySelectorAll(".product");
    tries++;
  }

  console.log("[COMTRADE] Found products:", products.length);

  // no products → end of catalog → STOP
  if(products.length === 0){
    console.log("[COMTRADE] No products — reached the last page. Stopping pagination.");
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const batch = [];

  for(const product of products){

    const titleEl = product.querySelector(".product__name");
    const priceEl = product.querySelector(".price.--main");
    const traits = product.querySelectorAll(".trait");

    if(!titleEl || !priceEl || !traits.length){
      console.log("[COMTRADE] skip — missing base elements");
      continue;
    }

    const title = titleEl.innerText;
    const link = titleEl.href;

    const { producer, model } = parseTitle(title);

    let cpu = "";
    let ram = "";
    let disk = "";
    let disk_type = "";

    traits.forEach(trait=>{
      const name = trait.querySelector(".trait__name")?.innerText || "";
      const value = trait.querySelector(".trait__value")?.innerText || "";

      if(name.includes("Procesor")){
        cpu = normalize(value);
      }
      if(name.includes("Pamięć operacyjna")){
        ram = extractNumber(value);
      }
      // comtrade renamed this trait: was "Dysk twardy", now "Pojemność dysku"
      if(name.includes("Pojemność dysku") || name.includes("Dysk twardy")){
        disk = extractNumber(value);
        if(/SSD/i.test(value)) disk_type = "SSD";
        else if(/HDD/i.test(value)) disk_type = "HDD";
      }
    });

    // fallback disk type from title
    if(!disk_type){
      if(title.includes("SSD")) disk_type = "SSD";
      else if(title.includes("HDD")) disk_type = "HDD";
    }

    const price = priceEl.innerText
      .replace("zł","")
      .replace(/\s+/g,"")
      .replace(",",".")
      .trim();

    if(!producer || !model || !cpu || !ram || !disk){
      console.log("[COMTRADE] skip — missing critical data:", title, { producer, model, cpu, ram, disk });
      continue;
    }

    batch.push({ producer, model, cpu, ram_gb: ram, disk_size: disk, disk_type, price, link });
  }

  console.log("[COMTRADE] → sending batch of", batch.length, "products");

  if(batch.length === 0){
    console.warn("[COMTRADE] nothing parsed on this page — stopping (avoid blind pagination).");
    return;
  }

  // Send ALL products of this page in ONE request and WAIT before navigating
  // (per-product async sends get cancelled by navigation → lost rows).
  await new Promise((resolve)=>{
    GM_xmlhttpRequest({
      method:"POST",
      url:googleScriptURL,
      headers:{ "Content-Type":"application/json" },
      data:JSON.stringify({ sheetName:SHEET_NAME, data:batch }),
      onload: (res)=>{
        console.log("[COMTRADE] ← Google status:", res.status);
        console.log("[COMTRADE] ← Google response:", res.responseText);
        resolve();
      },
      onerror: (err)=>{ console.error("[COMTRADE] ✖ request FAILED:", err); resolve(); },
      ontimeout: ()=>{ console.error("[COMTRADE] ✖ request TIMEOUT"); resolve(); }
    });
  });

  console.log("[COMTRADE] === PAGE DONE ===");

  await sleep(1000);

  const state = getState();
  state.page++;
  saveState(state);
  console.log("[COMTRADE] → next page:", state.page);

  window.location.href = location.origin + location.pathname + "?counter=" + state.page;
}

/* ================= RUN ================= */

async function run(){
  if(!googleScriptURL){
    console.warn("[COMTRADE] Google URL not set — Tampermonkey menu → ⚙️ Set Google Script URL");
    return;
  }
  await processPage();
}

// run even if the 'load' event already fired before injection (document-idle)
if(document.readyState === "complete"){
  run();
} else {
  window.addEventListener("load", run);
}

})();
