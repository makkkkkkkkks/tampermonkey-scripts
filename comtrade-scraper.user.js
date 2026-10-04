// ==UserScript==
// @name         COMTRADE SCRAPER STABLE + LOGS
// @namespace    https://github.com/makkkkkkkkks/tampermonkey-scripts
// @version      2.1
// @description  Scrapes comtrade.pl refurbished laptops and pushes rows to a Google Apps Script endpoint.
// @author       makkkkkkkkks
// @match        https://www.comtrade.pl/laptopy-poleasingowe*
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

  console.log("=== START PAGE SCRAPE ===");

  await sleep(500);

  const products = document.querySelectorAll(".product");
  console.log("Found products:", products.length);

  for(const product of products){

    const titleEl = product.querySelector(".product__name");
    const priceEl = product.querySelector(".price.--main");
    const traits = product.querySelectorAll(".trait");

    if(!titleEl || !priceEl || !traits.length){
      console.log("Skipped product — missing base elements");
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

      if(name.includes("Dysk twardy")){
        disk = extractNumber(value);
      }
    });

    if(title.includes("SSD")) disk_type = "SSD";
    if(title.includes("HDD")) disk_type = "HDD";

    const price = priceEl.innerText
      .replace("zł","")
      .replace(/\s+/g,"")
      .replace(",",".")
      .trim();

    if(!producer || !model || !cpu || !ram || !disk){
      console.log("Skipped product — missing critical data:", title);
      continue;
    }

    const productData = {
      producer,
      model,
      cpu,
      ram_gb: ram,
      disk_size: disk,
      disk_type,
      price,
      link
    };

    console.log("Sending to Google:", productData);

    GM_xmlhttpRequest({
      method:"POST",
      url:googleScriptURL,
      headers:{ "Content-Type":"application/json" },
      data:JSON.stringify({
        sheetName:SHEET_NAME,
        data:[productData]
      }),
      onload: function(response) {
        console.log("Google response:", response.status, response.responseText);
      },
      onerror: function(error) {
        console.error("Google ERROR:", error);
      }
    });

    await sleep(500);
  }

  console.log("=== PAGE DONE ===");

  // ПЕРЕХІД НА НАСТУПНУ СТОРІНКУ (300ms)
  const state = getState();
  state.page++;
  saveState(state);

  console.log("Going to next page:", state.page);

  await sleep(300);
  window.location.href = location.origin + location.pathname + "?counter=" + state.page;
}

/* ================= RUN ================= */

window.addEventListener("load", async ()=>{
  if(!googleScriptURL){
    console.warn("Google URL is not set — open the Tampermonkey menu → '⚙️ Set Google Script URL'");
    return;
  }
  await processPage();
});

})();
