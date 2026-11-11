# Automatic mining and the toolbar badge

With the automatic mining on for a language (Inglês, Russo), the extension mines by itself the caption of a playing video that has exactly one new item (words the Anki deck already knows do not count), up to a limit per day. The person sees the count in three places that must agree: the popup tile (`12 de 20 hoje`), the counter on the floating button of the page (`12/20`) and the badge of the toolbar icon (the sum of the languages that are on). At midnight the day turns and the counters start again.

## Sub-features

- `auto-settings` the popup's **Mineração automática por dia**: a tile per language with the switch (`Mineração automática em inglês`), the limit field (`Limite por dia em russo`, 1 to 100: `150` becomes `100`, `-5` becomes `1`; Enter saves and keeps the focus; clicking selects the number) and the counter (`12/20` on screen, `12 de 20 hoje` for the screen reader). Saving writes `pm_auto_miner_settings`; a failed write puts the switch back and POP-16 asks to try again.
- `auto-limit` at the limit the field gives way to `Limite de hoje atingido` (POP-08, also the switch's description) and nothing more is mined; the floating button says `Mineração automática · Russo: limite de hoje atingido`.
- `auto-mining` a playing video (not paused) with a caption mines it, adds one to the count (`pm_auto_miner_daily`), shows the pill `Mineração automática` and updates the popup and the page even if the diagnostic write (`pm_auto_miner_last_event`) fails.
- `auto-day-turn` the stored count of yesterday is zero today, before any alarm; the `pm-virada-do-dia` alarm resets an open popup and wakes up an open tab that was at the limit, which mines the caption on screen and counts `1` of today, without reloading and without rewriting yesterday's diary.
- `auto-badge` the toolbar badge sums only the languages that are on (`12`, tooltip `Mineração automática: 12 hoje`); both off: no badge and the tooltip `PerpetualMiner`; all the ones that are on at their limit: the sum with `Mineração automática: limite de hoje atingido`; one at the limit and another not: the counter. Turning a language on/off in the popup and each automatic mining change it at once; the midnight alarm fixes a stale badge and schedules itself for the next local midnight; the colours are the Veio tokens.
- `auto-idle` with both languages off the content script does not read the page for captions (it only looks for the video, for the floating button); with a language on it reads the caption on every round, and with both on the button's counter is the caption's language.
- `auto-max` on Max the automatic mining saves the caption on screen and never the episode name: [legenda-da-max.md](./legenda-da-max.md).

## How to get to it (user POV)

- Click the toolbar icon › **Mineração automática por dia**: turn a language on, set the limit.
- Play a video with a caption in that language on any page; the counter shows on the floating button over the player.
- Read the badge on the toolbar icon (hover for the tooltip).

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The specs seed `pm_auto_miner_settings` and `pm_auto_miner_daily` (the *starting* state) and, for the accept rule, a cached deck vocabulary `pm_auto_keyword_vocab_ru` with no known word. The fixture player (`player.html`) is given a real playing video by a canvas stream; `tocarVideo(page)` does it for the Max page.

- **Popup tiles (`auto-settings`, `auto-limit`).** `drive.sh auto-popup popup.spec -g "azulejos Inglês|Enter no limite|limite de hoje atingido|contador mostra"`. Observable: `12 de 20 hoje` and `0 de 15 hoje`, the English switch checked and the Russian one not; ligar Russo stores `pm_auto_miner_settings.ru.enabled: true`, `30` stores `dailyLimit: 30`, `150` and `-5` store `100` and `1`; at `20/20` no limit field and `Limite de hoje atingido`. Failure and loading states: `-g "mineração automática carregando"`, `-g "sem o estado do service worker"`, `-g "gravar a mineração automática falhando"`.
- **Badge (`auto-badge`).** `drive.sh auto-badge badge-da-toolbar.spec`. The spec reads `chrome.action.getBadgeText/getTitle` in the service worker. Observable: `{ badge: '12', tooltip: 'Mineração automática: 12 hoje' }` with the Russian 13 left out; `{ badge: '', tooltip: 'PerpetualMiner' }` with both off; `25` plus the limit tooltip; yesterday's day gives `0`; the alarm test replaces `pm-virada-do-dia` with one that fires in 100 ms (what Chrome would do at midnight) and the next alarm is local `00:00` tomorrow with no period. `-g "cada mineração automática soma um"` mines a Russian caption and the badge goes from `4` to `5`. `-g "a vitrine mostra"` and `-g "cores da identidade Veio"` compare with `veio/tokens.css`.
- **Day turn (`auto-day-turn`).** `drive.sh auto-virada mineracao-automatica-virada.spec`. Evidence: `virada-aba-antes.png`, `virada-aba-depois.png`, `virada-antes.json`, `virada-depois.json`. Observable: the tab at `3/3` mines nothing (`frases()` empty), then with yesterday's date and the alarm fired `frases()` has exactly the Russian caption, the counter `1/3` and the stored daily `{ date: <today>, en: { count: 0 }, ru: { count: 1 } }`.
- **Diagnostic write failing (`auto-mining`).** `drive.sh auto-publicacao mineracao-automatica-publicacao.spec`. The spec makes the service worker's `chrome.storage.local.set` throw for the `pm_auto_miner_last_event` write; observable: popup and tab still go from `2/3` to `3/3`.
- **Off means idle (`auto-idle`).** `drive.sh auto-parada overlay-sem-varredura.spec`. The spec enters the content script's isolated world through the Chromium protocol and records the selectors asked of `querySelectorAll`. Observable: with both languages off only `video` is asked in two rounds; with both on the counter says `0/20` (the English caption's limit).
- **The accept rule.** `node scripts/testar.mjs node` runs `test_auto_keyword.js` (one new item, deck vocabulary), no browser.

## Gotchas

- The automatic mining only looks at a video that is playing: a paused video or one without a stream mines nothing. The accept rule needs the deck vocabulary; with no cached reading the popup tile says `— esperando o Anki` ([anki-baralhos.md](./anki-baralhos.md) › `anki-data-source`); the seal `Vocabulário de ontem, 14:02` (and the tile's `— esperando o Anki`) with the Conexão off is `popup.spec.js -g "o selo do popup|Conexão desligada"`, where the fake Anki decides which reading exists.
- The toolbar badge and alarms are native Chrome: the specs read them through the service worker and fire the alarm by creating one with the same name, so say "simulated alarm" in the proof; the real midnight is not waited for.
- Dates are local days (`YYYY-MM-DD` of the browser), so a spec that crosses midnight on the host can flip; the specs derive "today" and "yesterday" from `new Date()`.
- Never mix this with the Frases `Mine a phrase` shortcuts: Alt+S is [mineracao.md](./mineracao.md).
