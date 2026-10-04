# tampermonkey-scripts

My personal Tampermonkey userscripts (laptop price scrapers), auto-updating from this repo.

## Scripts

| Script | Target site | Sheet | Install |
|--------|-------------|-------|---------|
| [comtrade-scraper.user.js](comtrade-scraper.user.js) | `comtrade.pl/laptopy-poleasingowe*` | comtrade | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/comtrade-scraper.user.js) |
| [taniey-scraper.user.js](taniey-scraper.user.js) | `taniey.pl/...laptopy*` | taniey | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/taniey-scraper.user.js) |
| [vedion-scraper.user.js](vedion-scraper.user.js) | `vedion.pl/laptopy-poleasingowe*` | vedion | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/vedion-scraper.user.js) |
| [shoplet-scraper.user.js](shoplet-scraper.user.js) | `shoplet.pl/21-laptopy*` | shoplet | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/shoplet-scraper.user.js) |
| [rnew-scraper.user.js](rnew-scraper.user.js) | `rnew.pl/pl/menu/laptopy-156*` | rnew | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/rnew-scraper.user.js) |
| [laplando-scraper.user.js](laplando-scraper.user.js) | `laplando.pl/Laptopy-c24*` | (array) | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/laplando-scraper.user.js) |
| [exactsolution-scraper.user.js](exactsolution-scraper.user.js) | `exactsolution.com/products/*` | (array) | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/exactsolution-scraper.user.js) |
| [erli-scraper.user.js](erli-scraper.user.js) | `erli.pl/*` | (array) | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/erli-scraper.user.js) |
| [empik-scraper.user.js](empik-scraper.user.js) | `empik.com/...laptopy*` | (array) | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/empik-scraper.user.js) |

## Secrets — set per script, never committed

The Google Apps Script `/exec` endpoint is a **write-enabled URL** (effectively a secret),
so it is **not** stored in this public repo. Each script reads it from Tampermonkey's
own storage (`GM_getValue`), which is **isolated per script** — so you set it once per script.

**After installing a script:**
1. Open a matching page for that script.
2. Click the Tampermonkey icon → script menu → **⚙️ Set Google Script URL**.
3. Paste the correct `/exec` URL → reload the page.

To **change** the key later: same menu, paste a new URL, reload. The script picks it up on
the next page load (the scrapers navigate page-to-page constantly, so it applies almost immediately).

> Which endpoint goes where (you know your deployments):
> - comtrade / taniey / vedion / shoplet / rnew historically shared **one** deployment.
> - laplando, exactsolution, erli, empik each had their **own** deployment.
>
> Tampermonkey cannot share one stored value across different scripts, so even scripts that
> use the same endpoint must each have it set once.

## How auto-update works

Each script has `@updateURL` + `@downloadURL` pointing at its raw file on GitHub.
Tampermonkey periodically fetches the header, compares `@version`, and re-downloads when
the repo version is **higher** than the installed one.

**Golden rule:** bump `@version` on every change you want pushed to the browser.
No version bump → no update.

Manual check: Tampermonkey Dashboard → script (⋮) → *Check for userscript updates*.
Periodic checks: Settings → *Config mode: Advanced* → *Externals* → update interval.

> `raw.githubusercontent.com` has a short CDN cache (~5 min); if an update doesn't appear
> immediately, wait and re-check.

## Publishing changes

```powershell
cd $env:USERPROFILE\IdeaProjects\tampermonkey-scripts
# edit a .user.js, BUMP its @version, then:
git add -A
git commit -m "feat: update <script> to vX.Y"
git push
```
