# tampermonkey-scripts

My personal Tampermonkey userscripts, auto-updating from this repo.

## Scripts

| Script | Target site | Install |
|--------|-------------|---------|
| [comtrade-scraper.user.js](comtrade-scraper.user.js) | `comtrade.pl/laptopy-poleasingowe*` | [Install](https://raw.githubusercontent.com/makkkkkkkkks/tampermonkey-scripts/master/comtrade-scraper.user.js) |

## How auto-update works

Each script has `@updateURL` and `@downloadURL` pointing at the raw file on GitHub.
Tampermonkey periodically fetches the header, compares `@version`, and re-downloads
when the repo version is **higher** than the installed one.

**Golden rule:** bump `@version` on every change you want pushed to the browser.
No version bump → no update.

To check manually: Tampermonkey Dashboard → script menu (⋮) → *Check for userscript updates*.
Enable periodic checks: Settings → *Config mode: Advanced* → *Externals* → update interval.

> Note: `raw.githubusercontent.com` has a short CDN cache (~5 min). If an update
> doesn't appear immediately, wait a few minutes and re-check.

## Secrets

Write-enabled endpoints (e.g. the Google Apps Script URL) are **never committed**.
They are stored in Tampermonkey local storage per machine.

For `comtrade-scraper`: after installing, open the Tampermonkey menu on a matching
page and click **⚙️ Set Google Script URL**, then paste your `/exec` URL and reload.

## Publishing changes

```powershell
# edit the .user.js, bump @version, then:
git add -A
git commit -m "feat: update comtrade-scraper to vX.Y"
git push
```
